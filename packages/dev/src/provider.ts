import type {
  AiAssetAnimation,
  AiAssetDefinition,
  AiAssetDimensions,
  AiAssetFormat,
  AiAssetFrameGrid,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings,
  AiAssetGenerationSettings
} from "@ai-game-assets/core";
import { randomUUID } from "node:crypto";

import {
  hexColor,
  referenceLockPromptLines,
  removeChromaBackground,
  resizePngToDimensions,
  resolveRequestedBackground,
  selectChromaKey,
  shouldPostprocessTransparency,
  shouldRequestRgbaPng,
  variationDirectionPromptLine
} from "./provider-image-processing.js";
import type { RgbColor } from "./provider-image-processing.js";
export type GenerateAssetRequest = {
  asset: AiAssetDefinition;
  prompt?: string;
  count?: number;
  settings?: AiAssetGenerationSettings;
  references?: GenerateAssetReference[];
  stylePrompt?: string;
  styleReferences?: GenerateAssetReference[];
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
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAssetDefinition["audioPlayback"];
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
  dimensions?: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
  animations?: AiAssetAnimation[];
};

export type GeneratedAssetOptionCallback = (
  option: GeneratedAssetOption,
  index: number
) => void | Promise<void>;

export type AiImageProvider = {
  generate(
    request: GenerateAssetRequest,
    onOption?: GeneratedAssetOptionCallback
  ): Promise<GeneratedAssetOption[]>;
};

export type OpenAiImageProviderOptions = {
  apiKey?: string;
  model?: string;
  svgModel?: string;
  quality?: AiAssetGenerationSettings["quality"];
  background?: AiAssetGenerationSettings["background"];
};

export function createOpenAiImageProvider(
  options: OpenAiImageProviderOptions = {}
): AiImageProvider {
  return {
    async generate(request, onOption) {
      const dimensions = requireAssetDimensions(request.asset);
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
      if (requestedFormat === "svg") {
        return generateSvgAssets(request, {
          apiKey,
          model: request.settings?.model ?? options.svgModel ?? process.env.OPENAI_SVG_MODEL ?? "gpt-5",
          prompt,
          count: request.count ?? 1
        }, onOption);
      }

      const outputFormat = normalizeOutputFormat(requestedFormat);
      const requestedBackground = resolveRequestedBackground(request, options);
      const background = normalizeBackgroundForModel(model, requestedBackground);
      const chromaKey = selectChromaKey(request);
      const allReferences = [
        ...(request.references ?? []),
        ...(request.styleReferences ?? []).map((reference, index) => ({
          ...reference,
          fileName: `style-reference-${index + 1}-${reference.fileName}`
        }))
      ];

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
      const generatedByIndex = await Promise.all(requestBodies.map(async (requestBody, index) => {
        const response = allReferences.length
          ? await createImageEdit(apiKey, requestBody, allReferences)
          : await createImageGeneration(apiKey, requestBody);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `OpenAI image generation failed (${response.status}): ${openAiErrorMessage(body)}`
          );
        }

        const payload = await readImagePayload(response);
        const generatedForRequest: GeneratedAssetOption[] = [];

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
            dimensions
          );

          const option: GeneratedAssetOption = {
            image: processedImage,
            mimeType: mimeTypeFromOutputFormat(outputFormat),
            prompt,
            model,
            revisedPrompt: item.revised_prompt,
            dimensions,
            frameGrid: request.asset.frameGrid,
            settings: {
              ...request.asset.settings,
              ...request.settings,
              model,
              background,
              format: outputFormat === "jpeg" ? "jpg" : outputFormat
            }
          };

          generatedForRequest.push(option);
          await onOption?.(option, index);
        }

        return generatedForRequest;
      }));

      return generatedByIndex.flat();
    }
  };
}

async function generateSvgAssets(
  request: GenerateAssetRequest,
  context: {
    apiKey: string;
    model: string;
    prompt: string;
    count: number;
  },
  onOption?: GeneratedAssetOptionCallback
): Promise<GeneratedAssetOption[]> {
  const dimensions = requireAssetDimensions(request.asset);
  const references = [
    ...(request.references ?? []),
    ...(request.styleReferences ?? []).map((reference, index) => ({
      ...reference,
      fileName: `style-reference-${index + 1}-${reference.fileName}`
    }))
  ];

  return Promise.all(Array.from({ length: context.count }, async (_, index) => {
    const prompt = svgAssetPrompt(request, {
      prompt: context.prompt,
      variation: context.count > 1 ? createVariationSeed(index) : undefined,
      variationIndex: index,
      variationCount: context.count
    });
    const response = await createSvgResponse(context.apiKey, {
      model: context.model,
      prompt,
      references
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI SVG generation failed (${response.status}): ${openAiErrorMessage(body)}`
      );
    }

    const payload = await response.json() as unknown;
    const svg = normalizeSvgOutput(extractResponseText(payload), dimensions);

    const option: GeneratedAssetOption = {
      image: Buffer.from(svg, "utf8"),
      mimeType: "image/svg+xml",
      prompt: context.prompt,
      model: context.model,
      dimensions,
      frameGrid: request.asset.frameGrid,
      settings: {
        ...request.asset.settings,
        ...request.settings,
        model: context.model,
        format: "svg"
      }
    };

    await onOption?.(option, index);
    return option;
  }));
}

function svgAssetPrompt(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    variation?: string;
    variationIndex?: number;
    variationCount?: number;
  }
): string {
  const dimensions = requireAssetDimensions(request.asset);
  const lines = [
    context.prompt,
    "",
    "Generate a single valid SVG file as XML markup for a 2D game asset.",
    "Return only the <svg>...</svg> document. Do not wrap it in Markdown, do not add commentary, and do not output raster images or base64 data.",
    `The root <svg> must use xmlns="http://www.w3.org/2000/svg", width="${dimensions.width}", height="${dimensions.height}", and viewBox="0 0 ${dimensions.width} ${dimensions.height}".`,
    `Asset kind: ${request.asset.kind}.`,
    `Target canvas: ${dimensions.width}x${dimensions.height}.`,
    "Use vector primitives such as paths, polygons, circles, ellipses, rects, gradients, masks, and groups. Keep IDs unique and descriptive.",
    "Do not include scripts, external URLs, foreignObject, CSS imports, font imports, animation tags, or event handlers."
  ];

  if (request.stylePrompt?.trim()) {
    lines.push(`Style guide: ${request.stylePrompt.trim()}`);
  }

  if (referencesNeedIdentity(request)) {
    lines.push(
      "Use the provided non-style reference image as the character identity reference. Preserve its silhouette, palette distribution, proportions, markings, and distinctive details while drawing it as clean SVG."
    );
  }

  if (request.asset.frameGrid) {
    const frameCount =
      request.asset.frameGrid.frameCount ??
      request.asset.frameGrid.columns * request.asset.frameGrid.rows;
    lines.push(
      `Spritesheet contract: create exactly ${frameCount} animation frames arranged in the first ${frameCount} cells of a fixed grid with ${request.asset.frameGrid.columns} columns and ${request.asset.frameGrid.rows} rows.`,
      `Each frame cell is exactly ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}. The full SVG canvas is ${dimensions.width}x${dimensions.height}.`,
      `Use one complete frame per grid cell, ordered left-to-right then top-to-bottom. Cell rectangles are: ${gridCellRectangles(request)}.`,
      "Keep the background transparent by leaving empty areas unpainted. Do not draw visible grid lines, labels, frame numbers, or cell borders."
    );
  } else if (request.asset.settings?.background === "opaque") {
    lines.push(
      "Create one continuous opaque scene covering the full SVG canvas. Do not create a spritesheet, contact sheet, labels, or panels."
    );
  } else {
    lines.push(
      "Create exactly one complete transparent-background sprite on the canvas. Leave empty areas unpainted; do not draw a white, black, gray, checkerboard, or colored background."
    );
  }

  if (context.variation) {
    lines.push(
      context.variation,
      variationDirectionPromptLine(context.variationIndex ?? 0)
    );
  }

  return lines.join("\n");
}

function referencesNeedIdentity(request: GenerateAssetRequest): boolean {
  return Boolean(request.references?.length);
}

async function createSvgResponse(
  apiKey: string,
  body: {
    model: string;
    prompt: string;
    references: GenerateAssetReference[];
  }
): Promise<Response> {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
  > = [{ type: "input_text", text: body.prompt }];

  for (const reference of body.references) {
    if (!isSupportedResponseImageMimeType(reference.mimeType)) continue;

    content.push({
      type: "input_image",
      image_url: `data:${reference.mimeType};base64,${Buffer.from(reference.image).toString("base64")}`
    });
  }

  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: body.model,
      input: [
        {
          role: "user",
          content
        }
      ]
    })
  });
}

function isSupportedResponseImageMimeType(mimeType: string): boolean {
  return mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp" ||
    mimeType === "image/gif";
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
  const dimensions = requireAssetDimensions(request.asset);
  const lines = [
    context.prompt,
    "",
    "Create this as a clean 2D game asset sprite.",
    `Asset kind: ${request.asset.kind}.`,
    `Target canvas: ${dimensions.width}x${dimensions.height}.`
  ];

  if (shouldRequestRgbaPng(request, context)) {
    lines.push(
      "Use a transparent background, centered subject, no text, no watermark, no cast shadow, no floor shadow, no ground plane, no reflection. Keep the sprite readable through its shape and pose; do not darken or recolor the character to create contrast.",
      "Clean it into a real RGBA PNG: the final game asset needs actual alpha transparency, not white, black, gray, checkerboard, or any matte color.",
      `For local transparency processing, render every background and empty padding pixel as the flat chroma-key color ${hexColor(context.chromaKey)}. Do not use that exact chroma-key color inside the game asset itself.`,
      "Keep the asset edges crisp against the chroma-key background so it can be removed cleanly."
    );
  } else {
    lines.push(
      "Fill the entire canvas edge-to-edge with an opaque image. Do not use transparency, empty padding, borders, text, or watermarks."
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
      `The final image must be one ${dimensions.width}x${dimensions.height} spritesheet, not separate images and not a different grid.`,
      `Use one frame per grid cell, ordered left-to-right then top-to-bottom. If the grid has more cells than ${frameCount}, leave the extra trailing cells fully transparent and empty.`,
      `Each cell is exactly ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}; do not merge cells, crop cells, add extra frames beyond ${frameCount}, or change the grid layout.`,
      `Cell rectangles are: ${gridCellRectangles(request)}.`,
      `Frame centers must be at these cell centers: ${gridCellCenters(request)}.`,
      "Each grid cell must contain exactly one complete frame of the subject. Do not place a nested spritesheet, turnaround sheet, contact sheet, labels, thumbnails, or multiple mini-poses inside any single cell.",
      "Use locked registration across every cell: keep the camera, subject origin, scale, and orientation identical unless the asset prompt explicitly requests that exact property to change.",
      "If the prompt names any part of the sprite as still, static, locked, or unmoving, render that part at the same pixel coordinates and scale in every frame; animate only the explicitly requested parts.",
      "Keep the character centered at a consistent scale in every cell, leaving transparent padding inside the cell.",
      "The grid layout is mandatory even if the animation would look nicer in another arrangement."
    );
  } else {
    if (shouldRequestRgbaPng(request, context)) {
      lines.push(
        "Single-image asset contract: create exactly one complete sprite on the canvas.",
        "Do not create a spritesheet, turnaround sheet, contact sheet, sequence, grid, multiple poses, multiple variants, panels, labels, or frame divisions.",
        "Keep the full subject visible with transparent padding on all sides. The subject must not touch the canvas edges and must not be cropped."
      );
    } else {
      lines.push(
        "Single-image background contract: create exactly one continuous scene covering the complete canvas.",
        "Do not create a spritesheet, contact sheet, sequence, grid, panels, labels, frame divisions, or isolated cutout sprite."
      );
    }
  }

  if (request.references?.length) {
    lines.push(
      "The generated asset must depict the same exact character as the provided character reference image. Character reference filenames do not begin with style-reference-. Preserve the silhouette, body proportions, face or head shape, colors, materials, markings, costume, and distinctive details. Do not redesign the character, change species, swap materials, alter the palette, or simplify it into a different character.",
      ...referenceLockPromptLines(request.references),
      "For animation spritesheets, every frame must show that same exact character performing only the requested motion or state change."
    );
  }

  if (request.stylePrompt || request.styleReferences?.length) {
    lines.push(
      "Style guide: apply the following visual language consistently without copying the subject matter, characters, composition, or objects from the style reference images.",
      request.stylePrompt?.trim() || "Match the visual style shown by the style reference images.",
      "Style reference image filenames begin with style-reference-.",
      "Use the style references only for rendering style: line quality, shape language, palette character, shading, material treatment, texture, and level of detail. The asset prompt and character references still determine what the asset depicts."
    );
  }

  if (context.variation) {
    lines.push(
      `Variation seed: ${context.variation}. Use this seed to make this option visually distinct from sibling options without changing the requested animation behavior. Vary rendering details, palette accents, or explicitly requested secondary effects only; do not introduce extra motion, pose changes, timing changes, or camera movement. Preserve the asset brief, frame grid, transparency instructions, and same exact character identity.`,
      variationDirectionPromptLine(context.variationIndex ?? 0)
    );
  }

  return lines.join("\n");
}

function createVariationSeed(index: number): string {
  return `option-${index + 1}-${randomUUID()}`;
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

function extractResponseText(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "output_text" in payload &&
    typeof payload.output_text === "string"
  ) {
    return payload.output_text;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "output" in payload &&
    Array.isArray(payload.output)
  ) {
    const chunks: string[] = [];

    for (const item of payload.output) {
      if (
        item &&
        typeof item === "object" &&
        "content" in item &&
        Array.isArray(item.content)
      ) {
        for (const content of item.content) {
          if (
            content &&
            typeof content === "object" &&
            "text" in content &&
            typeof content.text === "string"
          ) {
            chunks.push(content.text);
          }
        }
      }
    }

    if (chunks.length > 0) {
      return chunks.join("\n");
    }
  }

  throw new Error("OpenAI SVG generation response did not include text output.");
}

function normalizeSvgOutput(svgText: string, dimensions: AiAssetDimensions): string {
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(svgText);
  const svg = (match?.[0] ?? svgText).trim();

  if (!/^<svg\b/i.test(svg) || !/<\/svg>$/i.test(svg)) {
    throw new Error("SVG generation did not return a valid <svg> document.");
  }

  return sanitizeSvgMarkup(ensureSvgRootAttributes(svg, dimensions));
}

function ensureSvgRootAttributes(svg: string, dimensions: AiAssetDimensions): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const cleanedAttributes = String(attributes)
      .replace(/\s+xmlns=(["']).*?\1/i, "")
      .replace(/\s+width=(["']).*?\1/i, "")
      .replace(/\s+height=(["']).*?\1/i, "")
      .replace(/\s+viewBox=(["']).*?\1/i, "")
      .trim();
    const prefix = cleanedAttributes ? ` ${cleanedAttributes}` : "";

    return `<svg${prefix} xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">`;
  });
}

function sanitizeSvgMarkup(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*(?:javascript:|https?:|data:)[\s\S]*?\1/gi, "");
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function normalizeOutputFormat(
  format: AiAssetFormat | undefined
): "png" | "webp" | "jpeg" {
  if (format === "webp") return "webp";
  if (format === "jpg") return "jpeg";
  return "png";
}

function requireAssetDimensions(asset: AiAssetDefinition): AiAssetDimensions {
  if (!asset.dimensions) {
    throw new Error(`AI asset "${asset.id}" requires dimensions for image generation.`);
  }

  return asset.dimensions;
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
