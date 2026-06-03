import type {
  AiAssetAnimation,
  AiAssetDefinition,
  AiAssetDimensions,
  AiAssetFrameGrid,
  AiAssetGenerationSettings
} from "@ai-game-assets/core";
import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";

type RgbColor = { red: number; green: number; blue: number };

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

export type GenerateAssetRequest = {
  asset: AiAssetDefinition;
  prompt?: string;
  count?: number;
  settings?: AiAssetGenerationSettings;
  references?: GenerateAssetReference[];
};

export type GenerateAssetReference = {
  image: Uint8Array;
  mimeType: string;
  fileName: string;
};

export type GeneratedAssetOption = {
  image: Uint8Array;
  mimeType: string;
  prompt: string;
  model?: string;
  revisedPrompt?: string;
  settings?: AiAssetGenerationSettings;
  dimensions?: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
  animations?: AiAssetAnimation[];
};

export type AiImageProvider = {
  generate(request: GenerateAssetRequest): Promise<GeneratedAssetOption[]>;
};

export type OpenAiImageProviderOptions = {
  apiKey?: string;
  model?: string;
  quality?: AiAssetGenerationSettings["quality"];
  background?: AiAssetGenerationSettings["background"];
};

export function createOpenAiImageProvider(
  options: OpenAiImageProviderOptions = {}
): AiImageProvider {
  return {
    async generate(request) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required to generate AI game assets.");
      }

      const model =
        request.settings?.model ??
        request.asset.settings?.model ??
        options.model ??
        "gpt-image-2";
      const prompt = request.prompt ?? request.asset.prompt;
      const requestedFormat =
        request.settings?.format ?? request.asset.settings?.format ?? "png";
      const outputFormat = normalizeOutputFormat(requestedFormat);
      const requestedBackground = resolveRequestedBackground(request, options);
      const background = normalizeBackgroundForModel(model, requestedBackground);
      const chromaKey = selectChromaKey(request);

      const count = request.count ?? 1;
      const requestBodies = Array.from({ length: count }, (_, index) => ({
        model,
        prompt: gameAssetPrompt(request, {
          prompt,
          model,
          outputFormat,
          requestedBackground,
          chromaKey,
          variation: count > 1 ? createVariationSeed(index) : undefined,
          variationIndex: index,
          variationCount: count
        }),
        n: 1,
        size: request.settings?.size ?? request.asset.settings?.size ?? "1024x1024",
        quality:
          request.settings?.quality ??
          request.asset.settings?.quality ??
          options.quality ??
          "auto",
        background,
        output_format: outputFormat,
        moderation: request.settings?.moderation ?? request.asset.settings?.moderation
      }));
      const generated: GeneratedAssetOption[] = [];

      for (const requestBody of requestBodies) {
        const response = request.references?.length
          ? await createImageEdit(apiKey, requestBody, request.references)
          : await createImageGeneration(apiKey, requestBody);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `OpenAI image generation failed (${response.status}): ${openAiErrorMessage(body)}`
          );
        }

        const payload = await readImagePayload(response);

        for (const item of payload.data ?? []) {
          if (!item.b64_json) {
            throw new Error("OpenAI image generation response did not include b64_json.");
          }
          const image = Buffer.from(item.b64_json, "base64");
          const processedImage = resizePngToDimensions(
            shouldPostprocessTransparency(request, {
              prompt,
              model,
              outputFormat,
              requestedBackground
            })
              ? removeChromaBackground(image, chromaKey)
              : image,
            request.asset.dimensions
          );

          generated.push({
            image: processedImage,
            mimeType: mimeTypeFromOutputFormat(outputFormat),
            prompt,
            model,
            revisedPrompt: item.revised_prompt,
            dimensions: request.asset.dimensions,
            frameGrid: request.asset.frameGrid,
            animations: request.asset.animations,
            settings: {
              ...request.asset.settings,
              ...request.settings,
              model,
              background,
              format: outputFormat === "jpeg" ? "jpg" : outputFormat
            }
          });
        }
      }

      return generated;
    }
  };
}

function gameAssetPrompt(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    model: string;
    outputFormat: "png" | "webp" | "jpeg";
    requestedBackground: AiAssetGenerationSettings["background"];
    chromaKey: RgbColor;
    variation?: string;
    variationIndex?: number;
    variationCount?: number;
  }
): string {
  const lines = [
    context.prompt,
    "",
    "Create this as a clean 2D game asset sprite.",
    `Asset kind: ${request.asset.kind}.`,
    `Target canvas: ${request.asset.dimensions.width}x${request.asset.dimensions.height}.`,
    "Use a transparent background, centered subject, no text, no watermark, no cast shadow, no floor shadow, no ground plane, no reflection. Keep the sprite readable through its shape and pose; do not darken or recolor the character to create contrast."
  ];

  if (shouldRequestRgbaPng(request, context)) {
    lines.push(
      "Clean it into a real RGBA PNG: the final game asset needs actual alpha transparency, not white, black, gray, checkerboard, or any matte color.",
      `For local transparency processing, render every background and empty padding pixel as the flat chroma-key color ${hexColor(context.chromaKey)}. Do not use that exact chroma-key color inside the game asset itself.`,
      "Keep the asset edges crisp against the chroma-key background so it can be removed cleanly."
    );
  }

  if (request.asset.frameGrid) {
    const frameCount =
      request.asset.frameGrid.frameCount ??
      request.asset.frameGrid.columns * request.asset.frameGrid.rows;
    const rowLabel = request.asset.frameGrid.rows === 1 ? "row" : "rows";
    const columnLabel = request.asset.frameGrid.columns === 1 ? "column" : "columns";
    lines.push(
      `Spritesheet contract: exactly ${frameCount} animation frames arranged in the first ${frameCount} cells of a fixed grid with ${request.asset.frameGrid.columns} ${columnLabel} and ${request.asset.frameGrid.rows} ${rowLabel}.`,
      `The final image must be one ${request.asset.dimensions.width}x${request.asset.dimensions.height} spritesheet, not separate images and not a different grid.`,
      `Use one frame per grid cell, ordered left-to-right then top-to-bottom. If the grid has more cells than ${frameCount}, leave the extra trailing cells fully transparent and empty.`,
      `Each cell is exactly ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}; do not merge cells, crop cells, add extra frames beyond ${frameCount}, or change the grid layout.`,
      `Cell rectangles are: ${gridCellRectangles(request)}.`,
      `Frame centers must be at these cell centers: ${gridCellCenters(request)}.`,
      "Each grid cell must contain exactly one complete frame of the subject. Do not place a nested spritesheet, turnaround sheet, contact sheet, labels, thumbnails, or multiple mini-poses inside any single cell.",
      "Keep the character centered at a consistent scale in every cell, leaving transparent padding inside the cell.",
      "The grid layout is mandatory even if the animation would look nicer in another arrangement."
    );
  } else {
    lines.push(
      "Single-image asset contract: create exactly one complete sprite on the canvas.",
      "Do not create a spritesheet, turnaround sheet, contact sheet, sequence, grid, multiple poses, multiple variants, panels, labels, or frame divisions.",
      "Keep the full subject visible with transparent padding on all sides. The subject must not touch the canvas edges and must not be cropped."
    );
  }

  if (request.references?.length) {
    lines.push(
      "The generated asset must depict the same exact character as the provided reference image. Preserve the silhouette, body proportions, face or head shape, colors, materials, markings, costume, and distinctive details. Do not redesign the character, change species, swap materials, alter the palette, or simplify it into a different character.",
      ...referenceLockPromptLines(request.references),
      "For animation spritesheets, every frame must show that same exact character performing only the requested motion or state change."
    );
  }

  if (context.variation) {
    lines.push(
      `Variation seed: ${context.variation}. Use this seed to make this option visually distinct from sibling options, not a near-duplicate. Vary the animation timing, pose rhythm, secondary motion, and effect shape while preserving the asset brief, frame grid, transparency instructions, and same exact character identity.`,
      variationDirectionPromptLine(context.variationIndex ?? 0)
    );
  }

  return lines.join("\n");
}

function createVariationSeed(index: number): string {
  return `option-${index + 1}-${randomUUID()}`;
}

function selectChromaKey(request: GenerateAssetRequest): RgbColor {
  const samples = request.references?.flatMap((reference) => referenceColorSamples(reference)) ?? [];

  if (!samples.length) {
    const prompt = `${request.prompt ?? ""} ${request.asset.prompt}`.toLowerCase();

    if (/\b(red|pink|purple|magenta|violet|crimson)\b/.test(prompt)) {
      return { red: 0, green: 255, blue: 0 };
    }
  }

  if (!samples.length) return DEFAULT_CHROMA_KEY;

  return CHROMA_KEY_CANDIDATES
    .map((candidate) => ({
      candidate,
      score: Math.min(...samples.map((sample) => colorDistance(candidate, sample)))
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? DEFAULT_CHROMA_KEY;
}

function referenceLockPromptLines(references: GenerateAssetReference[]): string[] {
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

function referenceColorSamples(reference: GenerateAssetReference): RgbColor[] {
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

function analyzeReferenceImage(
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

function addColorBin(
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

function topColorBins(bins: Map<string, ColorBin>, count: number): string[] {
  return topColorBinValues(bins, count)
    .map((color) => `${colorName(color.red, color.green, color.blue)} ${rgbColor(color)}`);
}

function topColorBinValues(bins: Map<string, ColorBin>, count: number): RgbColor[] {
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

function quantizeColor(value: number): number {
  return Math.round(value / 32) * 32;
}

function isChromaRgb(red: number, green: number, blue: number): boolean {
  return CHROMA_KEY_CANDIDATES.some((chromaKey) => (
    colorDistance({ red, green, blue }, chromaKey) < 90
  ));
}

function isBrightSaturatedColor(red: number, green: number, blue: number): boolean {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;

  return saturation > 0.5 && max > 175 && relativeLuminance(red, green, blue) > 55;
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function colorName(red: number, green: number, blue: number): string {
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

function colorDistance(left: RgbColor, right: RgbColor): number {
  const redDelta = left.red - right.red;
  const greenDelta = left.green - right.green;
  const blueDelta = left.blue - right.blue;

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function hexColor(color: RgbColor): string {
  const channel = (value: number) => value.toString(16).padStart(2, "0");

  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

function rgbColor(color: RgbColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function variationDirectionPromptLine(index: number): string {
  const variants = [
    "Variation direction: explore a distinct pose progression with stronger start/end contrast. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore different timing and spacing, with motion concentrated in different frames. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore different secondary motion and effect shapes that still follow the asset prompt. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials.",
    "Variation direction: explore a different silhouette rhythm and scale/spacing balance inside each frame. Make each frame visibly different while preserving the referenced identity, palette distribution, and materials."
  ];

  return variants[index % variants.length] as string;
}

function shouldRequestRgbaPng(
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

  return (
    context.requestedBackground === "transparent" ||
    /\btransparent\b/i.test(context.prompt) ||
    /\btransparent\b/i.test(request.asset.prompt)
  );
}

function resolveRequestedBackground(
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

function shouldPostprocessTransparency(
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

function removeChromaBackground(image: Uint8Array, chromaKey: RgbColor): Buffer {
  const png = PNG.sync.read(Buffer.from(image));
  const width = png.width;
  const height = png.height;
  const visited = new Uint8Array(width * height);
  const transparent = new Uint8Array(width * height);
  const queue: number[] = [];
  let queueCursor = 0;
  const backgroundRemoval = detectBackgroundRemoval(png, chromaKey);

  if (!backgroundRemoval) {
    return Buffer.from(image);
  }

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
    if (
      transparent[index] ||
      (
        backgroundRemoval.kind === "chroma" &&
        isStrongChromaPixel(png, index, backgroundRemoval.chromaKey)
      )
    ) {
      transparent[index] = 1;
      setAlpha(png, index, 0);
    }
  }

  featherBackgroundEdges(png, transparent, backgroundRemoval);

  return PNG.sync.write(png);
}

type BackgroundRemoval =
  | { kind: "chroma"; chromaKey: RgbColor }
  | { kind: "edge-matte"; matteColor: RgbColor };

function detectBackgroundRemoval(
  png: PNG,
  chromaKey: RgbColor
): BackgroundRemoval | undefined {
  if (hasRequestedChromaKey(png, chromaKey)) {
    return { kind: "chroma", chromaKey };
  }

  const matteColor = detectNeutralEdgeMatte(png);

  return matteColor ? { kind: "edge-matte", matteColor } : undefined;
}

function hasRequestedChromaKey(png: PNG, chromaKey: RgbColor): boolean {
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

function detectNeutralEdgeMatte(png: PNG): RgbColor | undefined {
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

function resizePngToDimensions(image: Uint8Array, dimensions: AiAssetDimensions): Buffer {
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

function featherBackgroundEdges(
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

function touchesTransparentNeighbor(
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

function isChromaPixel(
  png: PNG,
  index: number,
  tolerance: number,
  chromaKey: RgbColor
): boolean {
  return chromaDistance(png, index, chromaKey) <= tolerance;
}

function isRemovableEdgeBackgroundPixel(
  png: PNG,
  index: number,
  backgroundRemoval: BackgroundRemoval
): boolean {
  if (backgroundRemoval.kind === "chroma") {
    return (
      isChromaPixel(png, index, 260, backgroundRemoval.chromaKey) ||
      isKeyTintedPixel(rgbAt(png, index), backgroundRemoval.chromaKey, 0.45)
    );
  }

  return isNeutralMattePixel(rgbAt(png, index), backgroundRemoval.matteColor);
}

function isStrongChromaPixel(png: PNG, index: number, chromaKey: RgbColor): boolean {
  const offset = index * 4;
  const red = png.data[offset] ?? 0;
  const green = png.data[offset + 1] ?? 0;
  const blue = png.data[offset + 2] ?? 0;

  return (
    isChromaPixel(png, index, CHROMA_MATCH_TOLERANCE, chromaKey) ||
    isKeyTintedPixel({ red, green, blue }, chromaKey, 0.65)
  );
}

function isKeyTintedPixel(color: RgbColor, chromaKey: RgbColor, strength: number): boolean {
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

function chromaDistance(png: PNG, index: number, chromaKey: RgbColor): number {
  return colorDistance(rgbAt(png, index), chromaKey);
}

function backgroundDistance(
  png: PNG,
  index: number,
  backgroundRemoval: BackgroundRemoval
): number {
  if (backgroundRemoval.kind === "chroma") {
    return chromaDistance(png, index, backgroundRemoval.chromaKey);
  }

  return colorDistance(rgbAt(png, index), backgroundRemoval.matteColor);
}

function isNeutralMattePixel(color: RgbColor, matteColor: RgbColor): boolean {
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

function isNeutralMatteCandidate(color: RgbColor): boolean {
  const max = Math.max(color.red, color.green, color.blue);
  const min = Math.min(color.red, color.green, color.blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = relativeLuminance(color.red, color.green, color.blue);

  return saturation <= 0.22 && luminance >= 75;
}

function neutralCornerCount(png: PNG): number {
  return [
    { x: 0, y: 0 },
    { x: png.width - 1, y: 0 },
    { x: 0, y: png.height - 1 },
    { x: png.width - 1, y: png.height - 1 }
  ].filter(({ x, y }) => isNeutralMatteCandidate(rgbAt(png, y * png.width + x))).length;
}

function sampleImageEdges(
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

function rgbAt(png: PNG, index: number): RgbColor {
  const offset = index * 4;

  return {
    red: png.data[offset] ?? 0,
    green: png.data[offset + 1] ?? 0,
    blue: png.data[offset + 2] ?? 0
  };
}

function alphaAt(png: PNG, index: number): number {
  return png.data[index * 4 + 3] ?? 255;
}

function setAlpha(png: PNG, index: number, alpha: number): void {
  png.data[index * 4 + 3] = alpha;
}

function gridCellCenters(request: GenerateAssetRequest): string {
  const frameGrid = request.asset.frameGrid;

  if (!frameGrid) return "";

  const centers: string[] = [];
  const frameCount = frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows;

  for (let index = 0; index < frameCount; index += 1) {
    const column = index % frameGrid.columns;
    const row = Math.floor(index / frameGrid.columns);
    const x = column * frameGrid.frameWidth + frameGrid.frameWidth / 2;
    const y = row * frameGrid.frameHeight + frameGrid.frameHeight / 2;
    centers.push(`frame ${index + 1}=(${x},${y})`);
  }

  return centers.join("; ");
}

function gridCellRectangles(request: GenerateAssetRequest): string {
  const frameGrid = request.asset.frameGrid;

  if (!frameGrid) return "";

  const rectangles: string[] = [];
  const frameCount = frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows;

  for (let index = 0; index < frameCount; index += 1) {
    const column = index % frameGrid.columns;
    const row = Math.floor(index / frameGrid.columns);
    const x1 = column * frameGrid.frameWidth;
    const y1 = row * frameGrid.frameHeight;
    const x2 = x1 + frameGrid.frameWidth - 1;
    const y2 = y1 + frameGrid.frameHeight - 1;
    rectangles.push(`frame ${index + 1}=x${x1}-${x2},y${y1}-${y2}`);
  }

  return rectangles.join("; ");
}

async function createImageGeneration(
  apiKey: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function createImageEdit(
  apiKey: string,
  body: Record<string, unknown>,
  references: GenerateAssetReference[]
): Promise<Response> {
  const form = new FormData();

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      form.append(key, String(value));
    }
  }

  for (const reference of references) {
    form.append(
      "image[]",
      new Blob([arrayBufferFromBytes(reference.image)], { type: reference.mimeType }),
      reference.fileName
    );
  }

  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });
}

async function readImagePayload(response: Response): Promise<{
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
}> {
  return await response.json() as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function normalizeOutputFormat(
  format: AiAssetGenerationSettings["format"] | undefined
): "png" | "webp" | "jpeg" {
  if (format === "webp") return "webp";
  if (format === "jpg") return "jpeg";
  return "png";
}

function normalizeBackgroundForModel(
  model: string,
  background: AiAssetGenerationSettings["background"] | undefined
): AiAssetGenerationSettings["background"] {
  if (model.startsWith("gpt-image-2") && background === "transparent") {
    return "auto";
  }

  return background;
}

function mimeTypeFromOutputFormat(format: "png" | "webp" | "jpeg"): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
  }
}

function openAiErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        code?: string;
        type?: string;
      };
    };
    const message = parsed.error?.message ?? body;
    const code = parsed.error?.code ?? parsed.error?.type;
    return code ? `${message} (${code})` : message;
  } catch {
    return body;
  }
}
