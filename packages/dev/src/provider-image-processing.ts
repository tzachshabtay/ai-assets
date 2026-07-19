import type {
  AiAssetDimensions,
  AiAssetFrameGrid,
  AiAssetGenerationSettings,
  AiAssetTileset
} from "@ai-game-assets/core";
import { PNG } from "pngjs";
import sharp from "sharp";
import type {
  GenerateAssetReference,
  GenerateAssetRequest,
  OpenAiImageProviderOptions
} from "./provider.js";

export type RgbColor = { red: number; green: number; blue: number };

const DEFAULT_CHROMA_KEY: RgbColor = { red: 255, green: 0, blue: 255 };
const CHROMA_KEY_CANDIDATES: RgbColor[] = [
  DEFAULT_CHROMA_KEY,
  { red: 0, green: 255, blue: 0 },
  { red: 0, green: 255, blue: 255 },
  { red: 255, green: 255, blue: 0 },
  { red: 0, green: 0, blue: 255 }
];
const CHROMA_MATCH_TOLERANCE = 120;
const CHROMA_EDGE_TOLERANCE = 170;
const CHROMA_EDGE_FILL_TOLERANCE = 150;

export function selectChromaKey(request: GenerateAssetRequest): RgbColor {
  const samples = [...(request.references ?? []), ...(request.styleReferences ?? [])]
    .flatMap((reference) => referenceColorSamples(reference));
  const prompt = [
    request.prompt,
    request.asset.prompt,
    ...(request.asset.tileset?.tiles?.map((tile) => tile.prompt) ?? [])
  ].filter(Boolean).join(" ").toLowerCase();

  if (!samples.length) {
    return CHROMA_KEY_CANDIDATES.find((candidate) => !promptMentionsChromaFamily(prompt, candidate)) ??
      DEFAULT_CHROMA_KEY;
  }

  return CHROMA_KEY_CANDIDATES
    .filter((candidate) => !promptMentionsChromaFamily(prompt, candidate))
    .map((candidate) => ({
      candidate,
      score: Math.min(...samples.map((sample) => colorDistance(candidate, sample)))
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate ??
    CHROMA_KEY_CANDIDATES
      .map((candidate) => ({
        candidate,
        score: Math.min(...samples.map((sample) => colorDistance(candidate, sample)))
      }))
      .sort((left, right) => right.score - left.score)[0]?.candidate ??
    DEFAULT_CHROMA_KEY;
}

export function referenceLockPromptLines(references: GenerateAssetReference[]): string[] {
  const analyses = references
    .map((reference) => analyzeReferenceImage(reference))
    .filter((analysis): analysis is ReferenceImageAnalysis => analysis !== undefined);

  if (!analyses.length) {
    return [
      "Treat the reference image as the visual source of truth. The prompt describes the action or state, not a redesign."
    ];
  }

  return analyses.flatMap((analysis, index) => {
    const label = references.length === 1 ? "Reference" : `Reference ${index + 1}`;
    const lines = [
      `${label} color lock: dominant visible colors are ${analysis.dominantColors.join(", ")}.`,
      "Preserve the reference colors as filled body and material regions in every frame, not merely as outlines, rims, shadows, glows, or small accents."
    ];

    if (analysis.saturatedColors.length) {
      lines.push(
        `${label} saturated-fill lock: the strongest chromatic fill colors are ${analysis.saturatedColors.join(", ")}. Keep those saturated colors prominent at roughly the same visual coverage as the reference.`
      );
    }

    if (analysis.brightSaturatedColors.length) {
      lines.push(
        `${label} bright-fill lock: bright saturated colors cover about ${analysis.brightSaturatedCoveragePercent}% of the visible reference pixels; keep bright filled regions visibly prominent in every frame. Bright fill colors include ${analysis.brightSaturatedColors.join(", ")}.`,
        "Do not reinterpret bright filled body colors as black, charcoal, dark maroon, edge trim, outlines, or glow-only accents. Dark colors may be used only as secondary shading/linework if they are secondary in the reference."
      );
    }

    if (analysis.hasLargeDarkRegion && analysis.hasLargeSaturatedRegion) {
      lines.push(
        "Match the reference palette distribution: dark shading and black outlines must not take over body regions that are bright or saturated in the reference."
      );
    }

    return lines;
  });
}

export function referenceColorSamples(reference: GenerateAssetReference): RgbColor[] {
  if (reference.mimeType !== "image/png") return [];

  let png: PNG;

  try {
    png = PNG.sync.read(Buffer.from(reference.image));
  } catch {
    return [];
  }

  const bins = new Map<string, ColorBin>();

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3] ?? 255;

    if (alpha < 64) continue;

    const red = png.data[offset] ?? 0;
    const green = png.data[offset + 1] ?? 0;
    const blue = png.data[offset + 2] ?? 0;

    addColorBin(bins, red, green, blue);
  }

  return topColorBinValues(bins, 8);
}

type ReferenceImageAnalysis = {
  dominantColors: string[];
  saturatedColors: string[];
  brightSaturatedColors: string[];
  brightSaturatedCoveragePercent: string;
  hasLargeDarkRegion: boolean;
  hasLargeSaturatedRegion: boolean;
};

export function analyzeReferenceImage(
  reference: GenerateAssetReference
): ReferenceImageAnalysis | undefined {
  if (reference.mimeType !== "image/png") return undefined;

  let png: PNG;

  try {
    png = PNG.sync.read(Buffer.from(reference.image));
  } catch {
    return undefined;
  }

  const allBins = new Map<string, ColorBin>();
  const saturatedBins = new Map<string, ColorBin>();
  const brightSaturatedBins = new Map<string, ColorBin>();
  let visiblePixels = 0;
  let darkPixels = 0;
  let saturatedPixels = 0;
  let brightSaturatedPixels = 0;

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3] ?? 255;

    if (alpha < 64) continue;

    const red = png.data[offset] ?? 0;
    const green = png.data[offset + 1] ?? 0;
    const blue = png.data[offset + 2] ?? 0;

    if (isChromaRgb(red, green, blue)) continue;

    visiblePixels += 1;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const luminance = relativeLuminance(red, green, blue);

    if (luminance < 45) darkPixels += 1;
    if (saturation > 0.45 && max > 120) saturatedPixels += 1;
    if (isBrightSaturatedColor(red, green, blue)) brightSaturatedPixels += 1;

    addColorBin(allBins, red, green, blue);

    if (saturation > 0.45 && max > 120) {
      addColorBin(saturatedBins, red, green, blue);
    }

    if (isBrightSaturatedColor(red, green, blue)) {
      addColorBin(brightSaturatedBins, red, green, blue);
    }
  }

  if (visiblePixels === 0) return undefined;

  return {
    dominantColors: topColorBins(allBins, 4),
    saturatedColors: topColorBins(saturatedBins, 3),
    brightSaturatedColors: topColorBins(brightSaturatedBins, 3),
    brightSaturatedCoveragePercent: ((brightSaturatedPixels / visiblePixels) * 100).toFixed(0),
    hasLargeDarkRegion: darkPixels / visiblePixels > 0.28,
    hasLargeSaturatedRegion: saturatedPixels / visiblePixels > 0.28
  };
}

type ColorBin = {
  count: number;
  redTotal: number;
  greenTotal: number;
  blueTotal: number;
};

export function addColorBin(
  bins: Map<string, ColorBin>,
  red: number,
  green: number,
  blue: number
): void {
  const key = `${quantizeColor(red)}:${quantizeColor(green)}:${quantizeColor(blue)}`;
  const bin = bins.get(key) ?? {
    count: 0,
    redTotal: 0,
    greenTotal: 0,
    blueTotal: 0
  };

  bin.count += 1;
  bin.redTotal += red;
  bin.greenTotal += green;
  bin.blueTotal += blue;
  bins.set(key, bin);
}

export function topColorBins(bins: Map<string, ColorBin>, count: number): string[] {
  return topColorBinValues(bins, count)
    .map((color) => `${colorName(color.red, color.green, color.blue)} ${rgbColor(color)}`);
}

export function topColorBinValues(bins: Map<string, ColorBin>, count: number): RgbColor[] {
  return [...bins.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, count)
    .map((bin) => {
      return {
        red: Math.round(bin.redTotal / bin.count),
        green: Math.round(bin.greenTotal / bin.count),
        blue: Math.round(bin.blueTotal / bin.count)
      };
    });
}

export function quantizeColor(value: number): number {
  return Math.round(value / 32) * 32;
}

export function isChromaRgb(red: number, green: number, blue: number): boolean {
  return CHROMA_KEY_CANDIDATES.some((chromaKey) => (
    colorDistance({ red, green, blue }, chromaKey) < 90
  ));
}

export function isBrightSaturatedColor(red: number, green: number, blue: number): boolean {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;

  return saturation > 0.5 && max > 175 && relativeLuminance(red, green, blue) > 55;
}

export function relativeLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function colorName(red: number, green: number, blue: number): string {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = relativeLuminance(red, green, blue);

  if (luminance < 45) return "dark";
  if (saturation < 0.18) return luminance > 185 ? "light neutral" : "neutral";
  if (red >= green && red >= blue) return red - blue > 60 ? "red" : "magenta";
  if (green >= red && green >= blue) return green - blue > 40 ? "green" : "cyan";
  if (blue >= red && blue >= green) return blue - red > 40 ? "blue" : "purple";
  return "color";
}

export function colorDistance(left: RgbColor, right: RgbColor): number {
  const redDelta = left.red - right.red;
  const greenDelta = left.green - right.green;
  const blueDelta = left.blue - right.blue;

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

export function hexColor(color: RgbColor): string {
  const channel = (value: number) => value.toString(16).padStart(2, "0");

  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

export function rgbColor(color: RgbColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

export function variationDirectionPromptLine(index: number): string {
  const variants = [
    "Variation direction: explore a distinct pose progression with stronger start/end contrast. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore different timing and spacing, with motion concentrated in different frames. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore different secondary motion and effect shapes that still follow the asset prompt. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore a different silhouette rhythm and scale/spacing balance inside each frame. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials."
  ];

  return variants[index % variants.length] as string;
}

export function shouldRequestRgbaPng(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    model: string;
    outputFormat: "png" | "webp" | "jpeg";
    requestedBackground: AiAssetGenerationSettings["background"];
  }
): boolean {
  if (!context.model.startsWith("gpt-image-2") || context.outputFormat !== "png") {
    return false;
  }

  if (context.requestedBackground === "opaque") {
    return false;
  }

  if (context.requestedBackground === "transparent") {
    return true;
  }

  return (
    /\btransparent\b/i.test(context.prompt) ||
    /\btransparent\b/i.test(request.asset.prompt) ||
    request.asset.tileset?.tiles?.some((tile) => /\btransparent\b/i.test(tile.prompt)) === true
  );
}

export function resolveRequestedBackground(
  request: GenerateAssetRequest,
  options: OpenAiImageProviderOptions
): AiAssetGenerationSettings["background"] {
  const requested =
    request.settings?.background ??
    request.asset.settings?.background;

  if (requested && requested !== "auto") {
    return requested;
  }

  return options.background ?? "transparent";
}

export function shouldPostprocessTransparency(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    model: string;
    outputFormat: "png" | "webp" | "jpeg";
    requestedBackground: AiAssetGenerationSettings["background"];
  }
): boolean {
  return shouldRequestRgbaPng(request, context);
}

export function removeChromaBackground(image: Uint8Array, chromaKey: RgbColor): Buffer {
  const png = PNG.sync.read(Buffer.from(image));
  const backgroundRemoval = detectBackgroundRemoval(png, chromaKey);

  if (!backgroundRemoval) {
    return Buffer.from(image);
  }

  removeDetectedBackground(png, backgroundRemoval);

  return PNG.sync.write(png);
}

export function removeTilesetChromaBackground(
  image: Uint8Array,
  tileset: AiAssetTileset,
  chromaKey: RgbColor
): Buffer {
  const png = PNG.sync.read(Buffer.from(image));
  const tileCapacity = tileset.columns * tileset.rows;
  const tileCount = Math.min(tileset.tileCount ?? tileCapacity, tileCapacity);
  const cellPixels = new Uint8Array(png.width * png.height);

  for (let index = 0; index < tileCapacity; index += 1) {
    const bounds = scaledTilesetCellBounds(png, tileset, index);
    if (!bounds) continue;
    markPngRect(cellPixels, png.width, bounds.x, bounds.y, bounds.width, bounds.height);

    if (index >= tileCount) {
      clearPngRect(png, bounds.x, bounds.y, bounds.width, bounds.height);
      continue;
    }

    const cell = copyPngRect(png, bounds.x, bounds.y, bounds.width, bounds.height);
    if (removeKnownChromaPixels(cell, chromaKey)) {
      pastePngRect(png, cell, bounds.x, bounds.y);
    }
  }

  clearUnmarkedPngPixels(png, cellPixels);

  return PNG.sync.write(png);
}

function markPngRect(
  pixels: Uint8Array,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  for (let localY = 0; localY < height; localY += 1) {
    const start = (y + localY) * imageWidth + x;
    pixels.fill(1, start, start + width);
  }
}

function clearUnmarkedPngPixels(png: PNG, markedPixels: Uint8Array): void {
  for (let index = 0; index < markedPixels.length; index += 1) {
    if (markedPixels[index]) continue;
    const offset = index * 4;
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
  }
}

function removeDetectedBackground(png: PNG, backgroundRemoval: BackgroundRemoval): void {
  const width = png.width;
  const height = png.height;
  const visited = new Uint8Array(width * height);
  const transparent = new Uint8Array(width * height);
  const queue: number[] = [];
  let queueCursor = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;

    visited[index] = 1;

    if (isRemovableEdgeBackgroundPixel(png, index, backgroundRemoval)) {
      queue.push(index);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queueCursor < queue.length) {
    const index = queue[queueCursor] as number;
    queueCursor += 1;
    transparent[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);

    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (let index = 0; index < transparent.length; index += 1) {
    if (transparent[index]) {
      transparent[index] = 1;
      setAlpha(png, index, 0);
    }
  }

  featherBackgroundEdges(png, transparent, backgroundRemoval);
}

type BackgroundRemoval =
  | { kind: "chroma"; chromaKey: RgbColor }
  | { kind: "edge-matte"; matteColor: RgbColor };

function removeKnownChromaPixels(png: PNG, chromaKey: RgbColor): boolean {
  const transparent = new Uint8Array(png.width * png.height);
  let found = false;

  for (let index = 0; index < transparent.length; index += 1) {
    if (
      isChromaPixel(png, index, CHROMA_MATCH_TOLERANCE, chromaKey) ||
      isKeyTintedPixel(rgbAt(png, index), chromaKey, 0.86)
    ) {
      transparent[index] = 1;
      setAlpha(png, index, 0);
      found = true;
    }
  }

  if (found) {
    featherBackgroundEdges(png, transparent, { kind: "chroma", chromaKey });
  }

  return found;
}

function scaledTilesetCellBounds(
  png: PNG,
  tileset: AiAssetTileset,
  index: number
): { x: number; y: number; width: number; height: number } | undefined {
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const sheetWidth = margin * 2 + tileset.columns * tileset.tileWidth +
    Math.max(0, tileset.columns - 1) * spacing;
  const sheetHeight = margin * 2 + tileset.rows * tileset.tileHeight +
    Math.max(0, tileset.rows - 1) * spacing;
  if (sheetWidth <= 0 || sheetHeight <= 0 || index < 0 || index >= tileset.columns * tileset.rows) {
    return undefined;
  }

  const column = index % tileset.columns;
  const row = Math.floor(index / tileset.columns);
  const sourceX = margin + column * (tileset.tileWidth + spacing);
  const sourceY = margin + row * (tileset.tileHeight + spacing);
  const x = Math.round((sourceX / sheetWidth) * png.width);
  const y = Math.round((sourceY / sheetHeight) * png.height);
  const right = Math.round(((sourceX + tileset.tileWidth) / sheetWidth) * png.width);
  const bottom = Math.round(((sourceY + tileset.tileHeight) / sheetHeight) * png.height);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function copyPngRect(png: PNG, x: number, y: number, width: number, height: number): PNG {
  const target = new PNG({ width, height });

  PNG.bitblt(png, target, x, y, width, height, 0, 0);
  return target;
}

function pastePngRect(png: PNG, source: PNG, x: number, y: number): void {
  PNG.bitblt(source, png, 0, 0, source.width, source.height, x, y);
}

export function detectBackgroundRemoval(
  png: PNG,
  chromaKey: RgbColor
): BackgroundRemoval | undefined {
  if (hasRequestedChromaKey(png, chromaKey)) {
    return { kind: "chroma", chromaKey };
  }

  const matteColor = detectNeutralEdgeMatte(png);

  return matteColor ? { kind: "edge-matte", matteColor } : undefined;
}

export function hasRequestedChromaKey(png: PNG, chromaKey: RgbColor): boolean {
  const edgeStats = sampleImageEdges(png, (index) => (
    isChromaPixel(png, index, 90, chromaKey) ||
    isKeyTintedPixel(rgbAt(png, index), chromaKey, 0.8)
  ));

  if (edgeStats.matches / edgeStats.total >= 0.18) return true;

  let matches = 0;
  const threshold = Math.max(256, Math.floor(png.width * png.height * 0.005));

  for (let index = 0; index < png.width * png.height; index += 1) {
    if (
      isChromaPixel(png, index, 90, chromaKey) ||
      isKeyTintedPixel(rgbAt(png, index), chromaKey, 0.8)
    ) {
      matches += 1;

      if (matches >= threshold) return true;
    }
  }

  return false;
}

export function detectNeutralEdgeMatte(png: PNG): RgbColor | undefined {
  let edgePixelCount = 0;
  let neutralEdgePixelCount = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  sampleImageEdges(png, (index) => {
    const color = rgbAt(png, index);
    edgePixelCount += 1;

    if (isNeutralMatteCandidate(color)) {
      neutralEdgePixelCount += 1;
      redTotal += color.red;
      greenTotal += color.green;
      blueTotal += color.blue;
    }

    return false;
  });

  if (
    neutralEdgePixelCount === 0 ||
    neutralEdgePixelCount / edgePixelCount < 0.65 ||
    neutralCornerCount(png) < 3
  ) {
    return undefined;
  }

  const matteColor = {
    red: Math.round(redTotal / neutralEdgePixelCount),
    green: Math.round(greenTotal / neutralEdgePixelCount),
    blue: Math.round(blueTotal / neutralEdgePixelCount)
  };

  const matteStats = sampleImageEdges(png, (index) => (
    isNeutralMattePixel(rgbAt(png, index), matteColor)
  ));

  return matteStats.matches / matteStats.total >= 0.55 ? matteColor : undefined;
}

export function resizePngToDimensions(image: Uint8Array, dimensions: AiAssetDimensions): Buffer {
  const source = PNG.sync.read(Buffer.from(image));

  if (source.width === dimensions.width && source.height === dimensions.height) {
    return Buffer.from(image);
  }

  const target = new PNG({
    width: dimensions.width,
    height: dimensions.height
  });

  for (let y = 0; y < dimensions.height; y += 1) {
    const sourceY = Math.min(
      source.height - 1,
      Math.floor((y / dimensions.height) * source.height)
    );

    for (let x = 0; x < dimensions.width; x += 1) {
      const sourceX = Math.min(
        source.width - 1,
        Math.floor((x / dimensions.width) * source.width)
      );
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * dimensions.width + x) * 4;

      target.data[targetOffset] = source.data[sourceOffset] ?? 0;
      target.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
      target.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
      target.data[targetOffset + 3] = source.data[sourceOffset + 3] ?? 0;
    }
  }

  return PNG.sync.write(target);
}

export async function resizeRasterToDimensions(
  image: Uint8Array,
  dimensions: AiAssetDimensions,
  outputFormat: "webp" | "jpeg"
): Promise<Buffer> {
  const sourceImage = Buffer.from(image);
  const metadata = await sharp(sourceImage, {
    failOn: "error"
  }).metadata();

  if (
    metadata.width === dimensions.width &&
    metadata.height === dimensions.height &&
    metadata.format === outputFormat
  ) {
    return sourceImage;
  }

  const resized = sharp(sourceImage, {
    failOn: "error"
  }).resize(dimensions.width, dimensions.height, {
    fit: "fill",
    kernel: sharp.kernel.nearest
  });

  return outputFormat === "webp"
    ? resized.webp({ quality: 100 }).toBuffer()
    : resized.jpeg({ quality: 95 }).toBuffer();
}

export async function rasterizeSvgToPng(image: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(image), {
    failOn: "error"
  }).png().toBuffer();
}

type SpriteFrameBounds = {
  frame: number;
  column: number;
  row: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function alignSpriteSheetFrames(image: Uint8Array, frameGrid: AiAssetFrameGrid): Buffer {
  const png = PNG.sync.read(Buffer.from(image));
  const margin = frameGrid.margin ?? 0;
  const spacing = frameGrid.spacing ?? 0;
  const frameCount = Math.min(
    frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows,
    frameGrid.columns * frameGrid.rows
  );
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const column = frame % frameGrid.columns;
    const row = Math.floor(frame / frameGrid.columns);
    const originX = margin + column * (frameGrid.frameWidth + spacing);
    const originY = margin + row * (frameGrid.frameHeight + spacing);

    return visibleSpriteFrameBounds(png, {
      frame,
      column,
      row,
      originX,
      originY,
      width: frameGrid.frameWidth,
      height: frameGrid.frameHeight
    });
  }).filter((frame): frame is SpriteFrameBounds => frame !== undefined);

  if (!frames.length) return Buffer.from(image);

  const columnShifts = spriteFrameAxisShifts({
    frames,
    groupCount: frameGrid.columns,
    frameSize: frameGrid.frameWidth,
    group: (frame) => frame.column,
    min: (frame) => frame.minX,
    max: (frame) => frame.maxX
  });
  const rowShifts = spriteFrameAxisShifts({
    frames,
    groupCount: frameGrid.rows,
    frameSize: frameGrid.frameHeight,
    group: (frame) => frame.row,
    min: (frame) => frame.minY,
    max: (frame) => frame.maxY
  });

  if (columnShifts.every((shift) => shift === 0) && rowShifts.every((shift) => shift === 0)) {
    return Buffer.from(image);
  }

  const source = Buffer.from(png.data);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const column = frame % frameGrid.columns;
    const row = Math.floor(frame / frameGrid.columns);
    const originX = margin + column * (frameGrid.frameWidth + spacing);
    const originY = margin + row * (frameGrid.frameHeight + spacing);
    const shiftX = columnShifts[column] ?? 0;
    const shiftY = rowShifts[row] ?? 0;

    if (
      originX < 0 ||
      originY < 0 ||
      originX + frameGrid.frameWidth > png.width ||
      originY + frameGrid.frameHeight > png.height
    ) {
      continue;
    }

    clearPngRect(png, originX, originY, frameGrid.frameWidth, frameGrid.frameHeight);
    copyShiftedPngRect(png, source, {
      originX,
      originY,
      width: frameGrid.frameWidth,
      height: frameGrid.frameHeight,
      shiftX,
      shiftY
    });
  }

  return PNG.sync.write(png);
}

function visibleSpriteFrameBounds(
  png: PNG,
  options: {
    frame: number;
    column: number;
    row: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  }
): SpriteFrameBounds | undefined {
  if (
    options.originX < 0 ||
    options.originY < 0 ||
    options.originX + options.width > png.width ||
    options.originY + options.height > png.height
  ) {
    return undefined;
  }

  let minX = options.width;
  let minY = options.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const alpha = png.data[((options.originY + y) * png.width + options.originX + x) * 4 + 3] ?? 0;

      if (alpha < 16) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return undefined;

  return {
    frame: options.frame,
    column: options.column,
    row: options.row,
    minX,
    minY,
    maxX,
    maxY
  };
}

function spriteFrameAxisShifts(options: {
  frames: SpriteFrameBounds[];
  groupCount: number;
  frameSize: number;
  group(frame: SpriteFrameBounds): number;
  min(frame: SpriteFrameBounds): number;
  max(frame: SpriteFrameBounds): number;
}): number[] {
  return Array.from({ length: options.groupCount }, (_, groupIndex) => {
    const frames = options.frames.filter((frame) => options.group(frame) === groupIndex);

    if (!frames.length) return 0;

    const averageCenter = frames.reduce(
      (total, frame) => total + (options.min(frame) + options.max(frame)) / 2,
      0
    ) / frames.length;
    const desiredShift = Math.round((options.frameSize / 2) - averageCenter);
    const minimumShift = Math.max(...frames.map((frame) => -options.min(frame)));
    const maximumShift = Math.min(
      ...frames.map((frame) => options.frameSize - 1 - options.max(frame))
    );

    return Math.min(maximumShift, Math.max(minimumShift, desiredShift));
  });
}

function clearPngRect(png: PNG, x: number, y: number, width: number, height: number): void {
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const offset = ((y + localY) * png.width + x + localX) * 4;
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
    }
  }
}

function copyShiftedPngRect(
  png: PNG,
  source: Buffer,
  options: {
    originX: number;
    originY: number;
    width: number;
    height: number;
    shiftX: number;
    shiftY: number;
  }
): void {
  for (let y = 0; y < options.height; y += 1) {
    const targetY = y + options.shiftY;

    if (targetY < 0 || targetY >= options.height) continue;

    for (let x = 0; x < options.width; x += 1) {
      const targetX = x + options.shiftX;

      if (targetX < 0 || targetX >= options.width) continue;

      const sourceOffset = ((options.originY + y) * png.width + options.originX + x) * 4;
      const targetOffset = (
        (options.originY + targetY) * png.width + options.originX + targetX
      ) * 4;

      png.data[targetOffset] = source[sourceOffset] ?? 0;
      png.data[targetOffset + 1] = source[sourceOffset + 1] ?? 0;
      png.data[targetOffset + 2] = source[sourceOffset + 2] ?? 0;
      png.data[targetOffset + 3] = source[sourceOffset + 3] ?? 0;
    }
  }
}

export function featherBackgroundEdges(
  png: PNG,
  transparent: Uint8Array,
  backgroundRemoval: BackgroundRemoval
): void {
  const width = png.width;
  const height = png.height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (transparent[index] || !touchesTransparentNeighbor(transparent, width, height, x, y)) {
        continue;
      }

      const distance = backgroundDistance(png, index, backgroundRemoval);

      if (distance > CHROMA_EDGE_TOLERANCE) {
        continue;
      }

      const alpha = Math.max(
        0,
        Math.min(255, Math.round((distance / CHROMA_EDGE_TOLERANCE) * 255))
      );
      setAlpha(png, index, Math.min(alphaAt(png, index), alpha));
    }
  }
}

export function touchesTransparentNeighbor(
  transparent: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  return (
    (x > 0 && transparent[y * width + x - 1] === 1) ||
    (x < width - 1 && transparent[y * width + x + 1] === 1) ||
    (y > 0 && transparent[(y - 1) * width + x] === 1) ||
    (y < height - 1 && transparent[(y + 1) * width + x] === 1)
  );
}

export function isChromaPixel(
  png: PNG,
  index: number,
  tolerance: number,
  chromaKey: RgbColor
): boolean {
  return chromaDistance(png, index, chromaKey) <= tolerance;
}

export function isRemovableEdgeBackgroundPixel(
  png: PNG,
  index: number,
  backgroundRemoval: BackgroundRemoval
): boolean {
  if (backgroundRemoval.kind === "chroma") {
    return (
      isChromaPixel(png, index, CHROMA_EDGE_FILL_TOLERANCE, backgroundRemoval.chromaKey) ||
      isKeyTintedPixel(rgbAt(png, index), backgroundRemoval.chromaKey, 0.86)
    );
  }

  return isNeutralMattePixel(rgbAt(png, index), backgroundRemoval.matteColor);
}

export function isKeyTintedPixel(color: RgbColor, chromaKey: RgbColor, strength: number): boolean {
  const keyChannels = [
    { color: color.red, key: chromaKey.red },
    { color: color.green, key: chromaKey.green },
    { color: color.blue, key: chromaKey.blue }
  ];
  const activeChannels = keyChannels.filter((channel) => channel.key > 128);
  const inactiveChannels = keyChannels.filter((channel) => channel.key <= 128);

  return (
    activeChannels.every((channel) => channel.color >= 150 * strength) &&
    inactiveChannels.every((channel) => channel.color <= 190 * (1.1 - strength))
  );
}

export function promptMentionsChromaFamily(prompt: string, chromaKey: RgbColor): boolean {
  if (chromaKey.red === 255 && chromaKey.green === 0 && chromaKey.blue === 255) {
    return /\b(red|pink|purple|magenta|violet|crimson|fuchsia)\b/.test(prompt);
  }

  if (chromaKey.red === 0 && chromaKey.green === 255 && chromaKey.blue === 0) {
    return /\b(green|lime|emerald|neon green|chartreuse)\b/.test(prompt);
  }

  if (chromaKey.red === 0 && chromaKey.green === 255 && chromaKey.blue === 255) {
    return /\b(cyan|aqua|teal|turquoise|blue)\b/.test(prompt);
  }

  if (chromaKey.red === 255 && chromaKey.green === 255 && chromaKey.blue === 0) {
    return /\b(yellow|gold|golden|amber)\b/.test(prompt);
  }

  if (chromaKey.red === 0 && chromaKey.green === 0 && chromaKey.blue === 255) {
    return /\b(blue|navy|cobalt|azure|indigo|cyan)\b/.test(prompt);
  }

  return false;
}

export function chromaDistance(png: PNG, index: number, chromaKey: RgbColor): number {
  return colorDistance(rgbAt(png, index), chromaKey);
}

export function backgroundDistance(
  png: PNG,
  index: number,
  backgroundRemoval: BackgroundRemoval
): number {
  if (backgroundRemoval.kind === "chroma") {
    return chromaDistance(png, index, backgroundRemoval.chromaKey);
  }

  return colorDistance(rgbAt(png, index), backgroundRemoval.matteColor);
}

export function isNeutralMattePixel(color: RgbColor, matteColor: RgbColor): boolean {
  const max = Math.max(color.red, color.green, color.blue);
  const min = Math.min(color.red, color.green, color.blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = relativeLuminance(color.red, color.green, color.blue);
  const matteLuminance = relativeLuminance(
    matteColor.red,
    matteColor.green,
    matteColor.blue
  );

  return (
    saturation <= 0.22 &&
    luminance >= 80 &&
    Math.abs(luminance - matteLuminance) <= 70 &&
    colorDistance(color, matteColor) <= 92
  );
}

export function isNeutralMatteCandidate(color: RgbColor): boolean {
  const max = Math.max(color.red, color.green, color.blue);
  const min = Math.min(color.red, color.green, color.blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = relativeLuminance(color.red, color.green, color.blue);

  return saturation <= 0.22 && luminance >= 75;
}

export function neutralCornerCount(png: PNG): number {
  return [
    { x: 0, y: 0 },
    { x: png.width - 1, y: 0 },
    { x: 0, y: png.height - 1 },
    { x: png.width - 1, y: png.height - 1 }
  ].filter(({ x, y }) => isNeutralMatteCandidate(rgbAt(png, y * png.width + x))).length;
}

export function sampleImageEdges(
  png: PNG,
  predicate: (index: number) => boolean
): { total: number; matches: number } {
  let total = 0;
  let matches = 0;
  const sample = (x: number, y: number) => {
    total += 1;

    if (predicate(y * png.width + x)) {
      matches += 1;
    }
  };

  for (let x = 0; x < png.width; x += 1) {
    sample(x, 0);
    sample(x, png.height - 1);
  }

  for (let y = 1; y < png.height - 1; y += 1) {
    sample(0, y);
    sample(png.width - 1, y);
  }

  return { total, matches };
}

export function rgbAt(png: PNG, index: number): RgbColor {
  const offset = index * 4;

  return {
    red: png.data[offset] ?? 0,
    green: png.data[offset + 1] ?? 0,
    blue: png.data[offset + 2] ?? 0
  };
}

export function alphaAt(png: PNG, index: number): number {
  return png.data[index * 4 + 3] ?? 255;
}

export function setAlpha(png: PNG, index: number, alpha: number): void {
  png.data[index * 4 + 3] = alpha;
}
