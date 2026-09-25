import type {
  AiAssetDimensions,
  AiAssetFrameGrid,
  AiAssetGenerationSettings
} from "@ai-game-assets/core";
import { PNG } from "pngjs";
import sharp from "sharp";
import type {
  GenerateAssetReference,
  GenerateAssetRequest,
  OpenAiImageProviderOptions
} from "./provider.js";

export type RgbColor = { red: number; green: number; blue: number };

function animationFramingReference(request: GenerateAssetRequest) {
  if (request.asset.kind === "tileset") return undefined;
  if (request.priorityReference) {
    if (request.priorityReference.frameGrid) return undefined; // Extract a frame before measuring it.
    return request.asset.frameGrid || request.priorityReference.role === "animation-base" ||
      request.references?.some((reference) => reference.role === "animation-base")
      ? { reference: request.priorityReference, number: (request.references?.length ?? 0) + 1, priority: true }
      : undefined;
  }
  const index = request.references?.findIndex((reference) => reference.role === "animation-base") ?? -1;
  return index < 0 ? undefined : { reference: request.references![index], number: index + 1, priority: false };
}

export function hasAnimationBaseReference(request: GenerateAssetRequest): boolean {
  return Boolean(animationFramingReference(request));
}

/** A reference sheet supplies one full frame, never a miniature sheet inside every output cell. */
export async function prepareAnimationFramingReference(request: GenerateAssetRequest): Promise<GenerateAssetRequest> {
  if (!request.priorityReference || request.asset.kind === "tileset") return request;
  const isAnimation = Boolean(request.asset.frameGrid ||
    request.priorityReference.role === "animation-base" ||
    request.references?.some((reference) => reference.role === "animation-base"));
  if (!isAnimation) return request;
  let reference = request.priorityReference;
  if (reference.frameGrid) {
    const grid = reference.frameGrid;
    const { frameWidth, frameHeight, columns, rows } = grid;
    const margin = grid.margin ?? 0, spacing = grid.spacing ?? 0;
    const count = grid.frameCount ?? columns * rows;
    if (![frameWidth, frameHeight, columns, rows, count].every((value) => Number.isSafeInteger(value) && value > 0) ||
      ![margin, spacing].every((value) => Number.isSafeInteger(value) && value >= 0) || count > columns * rows) {
      throw new Error("Generation reference has an invalid animation frame grid.");
    }
    const { data, info } = await sharp(Buffer.from(reference.image), { failOn: "error" })
      .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (margin + columns * frameWidth + (columns - 1) * spacing > info.width ||
      margin + rows * frameHeight + (rows - 1) * spacing > info.height) {
      throw new Error("Generation reference frame grid extends outside its image.");
    }
    let frame: Buffer | undefined;
    let frameIndex = 0;
    for (; frameIndex < count; frameIndex++) {
      request.signal?.throwIfAborted();
      const left = margin + (frameIndex % columns) * (frameWidth + spacing);
      const top = margin + Math.floor(frameIndex / columns) * (frameHeight + spacing);
      const candidate = new PNG({ width: frameWidth, height: frameHeight });
      let visible = false;
      for (let y = 0; y < frameHeight; y++) {
        const start = ((top + y) * info.width + left) * info.channels;
        data.copy(candidate.data, y * frameWidth * 4, start, start + frameWidth * 4);
      }
      for (let offset = 3; offset < candidate.data.length; offset += 4) {
        if (candidate.data[offset] >= 16) { visible = true; break; }
      }
      if (visible) { frame = PNG.sync.write(candidate); break; }
    }
    if (!frame) throw new Error("Generation reference animation contains no visible frames.");
    reference = {
      ...reference, image: frame, mimeType: "image/png", frameGrid: undefined,
      fileName: `${reference.fileName.replace(/\.[^.]+$/, "")}-frame-${frameIndex + 1}.png`
    };
  }
  return { ...request, priorityReference: { ...reference, role: "animation-base" } };
}

/** Repeat the complete base canvas, including its margins, in the requested grid. */
export async function animationBaseLayoutReference(
  request: GenerateAssetRequest,
  generationDimensions?: AiAssetDimensions
): Promise<GenerateAssetReference | undefined> {
  const grid = request.asset.frameGrid;
  if (!hasAnimationBaseReference(request) || !grid) return undefined;
  const count = grid.frameCount ?? grid.columns * grid.rows;
  if (count <= 1) return undefined;
  const base = animationFramingReference(request)!.reference;
  const dimensions = request.asset.dimensions;
  if (!dimensions) return undefined;
  const sheet = await composeSpriteSheetFrames(Array.from({ length: count }, () => base.image), dimensions, grid);
  return {
    image: generationDimensions ? resizePngToDimensions(sheet, generationDimensions) : sheet,
    mimeType: "image/png",
    fileName: "animation-base-layout.png"
  };
}

/** Framing is relative to one frame, never to the entire generated sheet. */
export function animationBaseFramingPromptLines(request: GenerateAssetRequest): string[] {
  const framing = animationFramingReference(request);
  if (!framing) return [];
  const { reference } = framing;
  const lines = [
    `Base-frame scale contract: Reference ${framing.number} is ${framing.priority ? "the user-selected single-frame animation reference" : "the original single-frame base image"}, not an example of the whole spritesheet. It is the framing source described as the base image below.`,
    "Map the ENTIRE base-image canvas onto EACH animation frame's canvas. Preserve the subject's size relative to that canvas, its resting position, and its existing transparent margins. Do not fit the subject into a smaller inner box, zoom out, or add presentation padding.",
    "Preserve the size of individual body parts and components (for example each footprint), not just the overall bounding box of the pose. Animate their positions at that size. Poses, squash/stretch, and effects may change visible bounds when requested; do not independently resize each pose to fill a box.",
    "The first neutral pose and any return-to-rest pose must match the base image's framing. Prior generated frames guide motion only and must not introduce or propagate a smaller scale. If space is tight, reduce travel or effects instead of shrinking the whole subject, unless the user's action explicitly calls for a scale change.",
    "The declared output dimensions override any older dimensions in the brief. A larger generation raster is more pixels for the same framing, not permission to draw a smaller subject."
  ];
  // PNG references allow concrete measurements in addition to the visual guide.
  // Other reference formats still receive the same canvas-to-frame contract.
  if (reference.mimeType !== "image/png") return lines;
  let png: PNG;
  try { png = PNG.sync.read(Buffer.from(reference.image)); } catch { return lines; }
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1, visible = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] < 128) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); visible++;
  }
  if (!visible) return lines;
  const width = maxX - minX + 1, height = maxY - minY + 1;
  const percent = (value: number, total: number) => (100 * value / total).toFixed(1);
  lines.push(
    `Measured base framing: canvas ${png.width}x${png.height}; visible artwork at (${minX},${minY}), ${width}x${height} pixels. In EACH frame the resting subject therefore spans approximately ${percent(width, png.width)}% of frame width and ${percent(height, png.height)}% of frame height, starting at ${percent(minX, png.width)}% from the left and ${percent(minY, png.height)}% from the top.`,
    `Solid artwork covers approximately ${percent(visible, png.width * png.height)}% of the base canvas. Preserve comparable body/component coverage while animating; do not satisfy the outer bounds with tiny subjects spaced far apart or with added sparkles.`
  );
  return lines;
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

export function shouldRequestTransparency(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    model: string;
    outputFormat: "png" | "webp" | "jpeg";
    requestedBackground: AiAssetGenerationSettings["background"];
  }
): boolean {
  if (context.outputFormat === "jpeg") {
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

export async function composeSpriteSheetFrames(
  frameImages: Uint8Array[],
  dimensions: AiAssetDimensions,
  frameGrid: AiAssetFrameGrid
): Promise<Buffer> {
  const margin = frameGrid.margin ?? 0;
  const spacing = frameGrid.spacing ?? 0;
  const frameCount = Math.min(
    frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows,
    frameGrid.columns * frameGrid.rows
  );

  if (frameImages.length !== frameCount) {
    throw new Error(
      `Expected ${frameCount} generated sprite frames, received ${frameImages.length}.`
    );
  }

  const normalizedFrames = await Promise.all(frameImages.map((image) => (
    sharp(Buffer.from(image), { failOn: "error" })
      .resize(frameGrid.frameWidth, frameGrid.frameHeight, {
        fit: "fill",
        kernel: sharp.kernel.nearest
      })
      .png()
      .toBuffer()
  )));
  const composites = normalizedFrames.map((input, index) => {
    const column = index % frameGrid.columns;
    const row = Math.floor(index / frameGrid.columns);
    const left = margin + column * (frameGrid.frameWidth + spacing);
    const top = margin + row * (frameGrid.frameHeight + spacing);

    if (
      left < 0 ||
      top < 0 ||
      left + frameGrid.frameWidth > dimensions.width ||
      top + frameGrid.frameHeight > dimensions.height
    ) {
      throw new Error(
        `Sprite frame ${index + 1} lies outside the ${dimensions.width}x${dimensions.height} sheet.`
      );
    }

    return { input, left, top };
  });

  return sharp({
    create: {
      width: dimensions.width,
      height: dimensions.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(composites).png().toBuffer();
}

export async function resizeRasterToDimensions(
  image: Uint8Array,
  dimensions: AiAssetDimensions,
  outputFormat: "png" | "webp" | "jpeg"
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

  if (outputFormat === "png") return resized.png().toBuffer();

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

type SpriteFrameSource = {
  frame: number;
  column: number;
  row: number;
  originX: number;
  originY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Generated artwork can cross a requested cell boundary even when the sheet's
// overall dimensions are correct. Find transparent gutters before cutting; a
// fixed cut followed by alignment loses the overflowing pixels permanently.
function spriteSheetSources(png: PNG, grid: AiAssetFrameGrid, count: number): SpriteFrameSource[] {
  const margin = grid.margin ?? 0;
  const spacing = grid.spacing ?? 0;
  const rowInk = new Uint32Array(png.height);
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) >= 16) rowInk[y]! += 1;
    }
  }
  const rows = spriteSheetCuts(rowInk, grid.rows, grid.frameHeight, margin, spacing, Math.ceil(count / grid.columns));
  const result: SpriteFrameSource[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    const top = rows[row]!;
    const bottom = rows[row + 1]!;
    const columnInk = new Uint32Array(png.width);
    for (let y = top; y < bottom; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) >= 16) columnInk[x]! += 1;
      }
    }
    const columns = spriteSheetCuts(columnInk, grid.columns, grid.frameWidth, margin, spacing,
      Math.max(0, Math.min(grid.columns, count - row * grid.columns)));
    for (let column = 0; column < grid.columns; column += 1) {
      const frame = row * grid.columns + column;
      if (frame >= count) break;
      result.push({ frame, row, column, top, bottom,
        left: columns[column]!, right: columns[column + 1]!,
        originX: margin + column * (grid.frameWidth + spacing),
        originY: margin + row * (grid.frameHeight + spacing) });
    }
  }
  return result;
}

function spriteSheetCuts(
  ink: Uint32Array, count: number, size: number, margin: number, spacing: number, activeCount: number
): number[] {
  const cuts = [0];
  const accumulatedInk = new Float64Array(ink.length + 1);
  for (let index = 0; index < ink.length; index += 1) {
    accumulatedInk[index + 1] = accumulatedInk[index]! + ink[index]!;
  }
  for (let index = 1; index < count; index += 1) {
    const nominal = margin + index * (size + spacing) - Math.ceil(spacing / 2);
    let cut = nominal;
    // Stay within the two neighboring half-cells so a missing frame or a wide
    // pose cannot cause subsequent frame indices to shift.
    const radius = Math.floor(size / 2);
    const next = Math.min(ink.length, margin + (index + 1) * (size + spacing) - Math.ceil(spacing / 2));
    const separates = (at: number) => at > 0 && at < ink.length &&
      (ink[at - 1] === 0 || ink[at] === 0);
    const retainsNeighbors = (at: number) =>
      accumulatedInk[at]! > accumulatedInk[cuts[cuts.length - 1]!]! &&
      (index >= activeCount || accumulatedInk[next]! > accumulatedInk[at]!);
    if (!separates(nominal)) {
      for (let distance = 1; distance <= radius; distance += 1) {
        if (separates(nominal + distance) && retainsNeighbors(nominal + distance)) { cut = nominal + distance; break; }
        if (separates(nominal - distance) && retainsNeighbors(nominal - distance)) { cut = nominal - distance; break; }
      }
    }
    cuts.push(Math.max(cuts[cuts.length - 1]!, Math.min(ink.length, cut)));
  }
  cuts.push(ink.length);
  return cuts;
}

export function alignSpriteSheetFrames(image: Uint8Array, frameGrid: AiAssetFrameGrid): Buffer {
  const png = PNG.sync.read(Buffer.from(image));
  const frameCount = Math.min(
    frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows,
    frameGrid.columns * frameGrid.rows
  );
  const sources = spriteSheetSources(png, frameGrid, frameCount);
  const frames = sources.map((source) => visibleSpriteFrameBounds(png, source))
    .filter((frame): frame is SpriteFrameBounds => frame !== undefined);

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

  // Clear every source before copying any destination. Recovered rectangles
  // may overlap destination cells, including their margins and spacing.
  for (const frame of sources) {
    clearPngRect(png, frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top);
  }

  for (const frame of sources) {
    const { column, row, originX, originY } = frame;
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
      shiftY,
      sourceLeft: frame.left,
      sourceTop: frame.top,
      sourceRight: frame.right,
      sourceBottom: frame.bottom
    });
  }

  return PNG.sync.write(png);
}

function visibleSpriteFrameBounds(
  png: PNG,
  options: SpriteFrameSource
): SpriteFrameBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let py = options.top; py < options.bottom; py += 1) {
    for (let px = options.left; px < options.right; px += 1) {
      const alpha = png.data[(py * png.width + px) * 4 + 3] ?? 0;

      if (alpha < 16) continue;
      const x = px - options.originX;
      const y = py - options.originY;
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

    if (minimumShift > maximumShift) {
      throw new Error("Generated sprites do not fit their frame cells without cropping. Regenerate the sheet with more space between frames or larger frame dimensions.");
    }

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
    sourceLeft: number;
    sourceTop: number;
    sourceRight: number;
    sourceBottom: number;
  }
): void {
  for (let y = options.sourceTop - options.originY; y < options.sourceBottom - options.originY; y += 1) {
    const targetY = y + options.shiftY;

    if (targetY < 0 || targetY >= options.height) continue;

    for (let x = options.sourceLeft - options.originX; x < options.sourceRight - options.originX; x += 1) {
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
