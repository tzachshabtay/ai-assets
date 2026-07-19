import type {
  AiAssetAnimation,
  AiAssetDefinition,
  AiAssetDimensions,
  AiAssetFormat,
  AiAssetFrameGrid,
  AiAssetTileset,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings,
  AiAssetGenerationSettings,
  AiTilesetAnimation
} from "@ai-game-assets/core";
import { randomUUID } from "node:crypto";

import {
  alignSpriteSheetFrames,
  hexColor,
  referenceLockPromptLines,
  removeChromaBackground,
  removeTilesetChromaBackground,
  resizePngToDimensions,
  resizeRasterToDimensions,
  rasterizeSvgToPng,
  resolveRequestedBackground,
  selectChromaKey,
  shouldPostprocessTransparency,
  shouldRequestRgbaPng,
  variationDirectionPromptLine
} from "./provider-image-processing.js";
import type { RgbColor } from "./provider-image-processing.js";
export type GenerateAssetRequest = {
  asset: AiAssetDefinition;
  purpose?: "tileset-animation";
  prompt?: string;
  count?: number;
  settings?: AiAssetGenerationSettings;
  references?: GenerateAssetReference[];
  stylePrompt?: string;
  styleReferences?: GenerateAssetReference[];
  signal?: AbortSignal;
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
  tileset?: AiAssetTileset;
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

export type GenerateTilesetAnimationRequest = {
  asset: AiAssetDefinition;
  animationKey: string;
  prompt?: string;
  count?: number;
  settings?: AiAssetGenerationSettings;
  baseReference: GenerateAssetReference;
  stylePrompt?: string;
  styleReferences?: GenerateAssetReference[];
  signal?: AbortSignal;
};

export type GeneratedTilesetAnimationOption = {
  index: number;
  animationKey: string;
  frames: GeneratedAssetOption[];
};

export type GeneratedTilesetAnimationOptionCallback = (
  option: GeneratedTilesetAnimationOption
) => void | Promise<void>;

export async function generateTilesetAnimationBranches(
  provider: AiImageProvider,
  request: GenerateTilesetAnimationRequest,
  onOption?: GeneratedTilesetAnimationOptionCallback
): Promise<GeneratedTilesetAnimationOption[]> {
  if (request.asset.kind !== "tileset" || !request.asset.tileset) {
    throw new Error(`AI asset "${request.asset.id}" is not a tileset.`);
  }

  const animation = request.asset.tileset.animations?.find(
    (candidate) => candidate.key === request.animationKey
  );
  if (!animation) {
    throw new Error(
      `Unknown tileset animation "${request.animationKey}" for AI asset "${request.asset.id}".`
    );
  }

  const requestedBranchCount = request.count ?? 3;
  if (!Number.isInteger(requestedBranchCount) || requestedBranchCount <= 0) {
    throw new Error("Tileset animation candidate count must be a positive integer.");
  }
  const branchCount = Math.min(requestedBranchCount, 3);

  request.signal?.throwIfAborted();

  return Promise.all(
    Array.from({ length: branchCount }, async (_, index) => {
      const frames: GeneratedAssetOption[] = [];
      const previousFrameReferences: GenerateAssetReference[] = [];
      const branchSeed = createVariationSeed(index);

      for (let frameIndex = 0; frameIndex < animation.frameCount; frameIndex += 1) {
        request.signal?.throwIfAborted();
        const generated = await provider.generate({
          asset: request.asset,
          purpose: "tileset-animation",
          prompt: tilesetAnimationFramePrompt(request.asset, animation, {
            prompt: request.prompt,
            frameIndex,
            branchIndex: index,
            branchCount,
            branchSeed,
            priorFrameCount: previousFrameReferences.length
          }),
          count: 1,
          settings: {
            ...request.settings,
            format: "png",
            frameAlignment: "none"
          },
          references: [request.baseReference, ...previousFrameReferences],
          stylePrompt: request.stylePrompt,
          styleReferences: request.styleReferences,
          signal: request.signal
        });
        const frame = generated[0];
        if (!frame) {
          throw new Error(
            `Tileset animation "${animation.key}" branch ${index + 1} frame ${frameIndex + 1} did not produce an image.`
          );
        }

        frames.push(frame);
        previousFrameReferences.push({
          image: frame.image,
          mimeType: frame.mimeType,
          fileName: `prior-${sanitizeReferenceName(animation.key)}-frame-${frameIndex + 1}.${extensionFromMimeType(frame.mimeType)}`
        });
      }

      const option = {
        index,
        animationKey: animation.key,
        frames
      } satisfies GeneratedTilesetAnimationOption;
      request.signal?.throwIfAborted();
      await onOption?.(option);
      return option;
    })
  );
}

export function tilesetAnimationFramePrompt(
  asset: AiAssetDefinition,
  animation: AiTilesetAnimation,
  context: {
    prompt?: string;
    frameIndex: number;
    branchIndex: number;
    branchCount: number;
    branchSeed: string;
    priorFrameCount: number;
  }
): string {
  const brief = context.prompt?.trim() || animation.prompt?.trim() ||
    `Animate the tiles described by "${animation.key}".`;
  const frameNumber = context.frameIndex + 1;
  const priorReferenceDescription = context.priorFrameCount
    ? `References 2 through ${context.priorFrameCount + 1} are earlier frames for motion continuity only, in chronological order. They never override Reference 1's sheet geometry, tile coordinates, or unchanged pixels.`
    : "There are no prior animation frames yet; derive this first phase directly from the base sheet.";
  const tileInstructions = animation.tiles?.map((tile, index) => (
    `${tilesetTileRectangle(asset, index)}: ${tile.prompt.trim()}`
  )) ?? [];
  const finalFrameIndex = Math.max(0, animation.frameCount - 1);

  return [
    ...(animation.tiles?.length ? [] : [brief, ""]),
    `Generate animation frame ${frameNumber} of ${animation.frameCount} for tileset animation "${animation.key}".`,
    `This is candidate branch ${context.branchIndex + 1} of ${context.branchCount}; branch identity seed: ${context.branchSeed}.`,
    "Edit Reference 1 in place and return one complete full-size tileset sheet, never an individual tile or a contact sheet of animation phases.",
    "Reference 1 is the immutable spatial source of truth. Its canvas bounds, top-left origin, tile coordinates, palette, scale, cell boundaries, edge continuity, and pixel alignment have absolute precedence over every other reference and instruction.",
    priorReferenceDescription,
    "Do not redraw or re-lay out the sheet. Preserve every tile at exactly the same index and pixel coordinates; do not shift the canvas or add, remove, reorder, resize, crop, relight, restyle, or redesign tiles.",
    "Only change pixels explicitly required by a tile's animation instruction. Copy every other pixel from Reference 1 unchanged.",
    ...tilesetContractPromptLines(asset, false),
    ...(tileInstructions.length
      ? [
          "Follow these tile instructions in exact row-major sheet order. Each bracketed rectangle is an immutable cell boundary:",
          ...tileInstructions
        ]
      : []),
    `This frame samples loop phase t=${context.frameIndex}/${animation.frameCount}. The sequence samples t=0/${animation.frameCount} through t=${finalFrameIndex}/${animation.frameCount}; do not duplicate the first phase as an extra final frame.`,
    "Keep motion coherent with prior frames and make the final sampled phase transition cleanly back to the first."
  ].join("\n");
}

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
      const requestedBackground = resolveRequestedBackground(request, options);
      if (requestedFormat === "svg") {
        return generateSvgAssets(request, {
          apiKey,
          model: request.settings?.model ?? options.svgModel ?? process.env.OPENAI_SVG_MODEL ?? "gpt-5",
          prompt,
          count: request.count ?? 1,
          requestedBackground,
          signal: request.signal
        }, onOption);
      }

      const outputFormat = normalizeOutputFormat(requestedFormat);
      const background = normalizeBackgroundForModel(model, requestedBackground);
      const chromaKey = selectChromaKey(request);
      const postprocessTransparency = shouldPostprocessTransparency(request, {
        prompt,
        model,
        outputFormat,
        requestedBackground
      });
      const frameAlignment =
        request.settings?.frameAlignment ??
        request.asset.settings?.frameAlignment ??
        "center";
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
        size:
          request.settings?.size ??
          request.asset.settings?.size ??
          closestImageGenerationSize(dimensions),
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
        request.signal?.throwIfAborted();
        const response = allReferences.length
          ? await createImageEdit(apiKey, requestBody, allReferences, request.signal)
          : await createImageGeneration(apiKey, requestBody, request.signal);

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
          request.signal?.throwIfAborted();
          const image = Buffer.from(item.b64_json, "base64");
          const transparencyProcessedImage = postprocessTransparency
            ? request.asset.kind === "tileset" && request.asset.tileset
              ? removeTilesetChromaBackground(image, request.asset.tileset, chromaKey)
              : removeChromaBackground(image, chromaKey)
            : image;
          const resizedImage = outputFormat === "png"
            ? resizePngToDimensions(transparencyProcessedImage, dimensions)
            : await resizeRasterToDimensions(image, dimensions, outputFormat);
          const processedImage =
            request.asset.kind !== "tileset" &&
            postprocessTransparency && request.asset.frameGrid && frameAlignment === "center"
              ? alignSpriteSheetFrames(resizedImage, request.asset.frameGrid)
              : resizedImage;

          const option: GeneratedAssetOption = {
            image: processedImage,
            mimeType: mimeTypeFromOutputFormat(outputFormat),
            prompt,
            model,
            revisedPrompt: item.revised_prompt,
            dimensions,
            frameGrid: request.asset.frameGrid,
            tileset: request.asset.tileset,
            settings: {
              ...request.asset.settings,
              ...request.settings,
              model,
              background,
              format: outputFormat === "jpeg" ? "jpg" : outputFormat,
              ...(postprocessTransparency && request.asset.frameGrid ? { frameAlignment } : {})
            }
          };

          generatedForRequest.push(option);
          request.signal?.throwIfAborted();
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
    requestedBackground: AiAssetGenerationSettings["background"];
    signal?: AbortSignal;
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
    context.signal?.throwIfAborted();
    const prompt = svgAssetPrompt(request, {
      prompt: context.prompt,
      requestedBackground: context.requestedBackground,
      variation: context.count > 1 ? createVariationSeed(index) : undefined,
      variationIndex: index,
      variationCount: context.count
    });
    const response = await createSvgResponse(context.apiKey, {
      model: context.model,
      prompt,
      references
    }, context.signal);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI SVG generation failed (${response.status}): ${openAiErrorMessage(body)}`
      );
    }

    const payload = await response.json() as unknown;
    context.signal?.throwIfAborted();
    const svg = normalizeSvgOutput(extractResponseText(payload), dimensions);

    const option: GeneratedAssetOption = {
      image: Buffer.from(svg, "utf8"),
      mimeType: "image/svg+xml",
      prompt: context.prompt,
      model: context.model,
      dimensions,
      frameGrid: request.asset.frameGrid,
      tileset: request.asset.tileset,
      settings: {
        ...request.asset.settings,
        ...request.settings,
        model: context.model,
        background: context.requestedBackground,
        format: "svg"
      }
    };

    context.signal?.throwIfAborted();
    await onOption?.(option, index);
    return option;
  }));
}

function svgAssetPrompt(
  request: GenerateAssetRequest,
  context: {
    prompt: string;
    requestedBackground: AiAssetGenerationSettings["background"];
    variation?: string;
    variationIndex?: number;
    variationCount?: number;
  }
): string {
  const dimensions = requireAssetDimensions(request.asset);
  const lines: string[] = [];
  const brief = assetBriefForModel(request, context.prompt);
  if (brief) {
    lines.push(brief, "");
  }
  const structuredTilesetPrompt = structuredTilesetPromptLines(request.asset);
  if (
    structuredTilesetPrompt.length &&
    !brief?.includes(structuredTilesetPrompt.join("\n"))
  ) {
    lines.push(...structuredTilesetPrompt, "");
  }
  lines.push(
    "Generate a single valid SVG file as XML markup for a 2D game asset.",
    "Return only the <svg>...</svg> document. Do not wrap it in Markdown, do not add commentary, and do not output raster images or base64 data.",
    `The root <svg> must use xmlns="http://www.w3.org/2000/svg", width="${dimensions.width}", height="${dimensions.height}", and viewBox="0 0 ${dimensions.width} ${dimensions.height}".`,
    `Asset kind: ${request.asset.kind}.`,
    `Target canvas: ${dimensions.width}x${dimensions.height}.`,
    "Use vector primitives such as paths, polygons, circles, ellipses, rects, gradients, masks, and groups. Keep IDs unique and descriptive.",
    "Do not include scripts, external URLs, foreignObject, CSS imports, font imports, animation tags, or event handlers."
  );

  if (request.stylePrompt?.trim()) {
    lines.push(`Style guide: ${request.stylePrompt.trim()}`);
  }

  if (referencesNeedIdentity(request) && request.asset.kind !== "tileset") {
    lines.push(
      "Use the provided non-style reference image as the character identity reference. Preserve its silhouette, palette distribution, proportions, markings, and distinctive details while drawing it as clean SVG."
    );
  }

  if (request.asset.kind === "tileset") {
    lines.push(...tilesetContractPromptLines(request.asset, false));
    if (request.references?.length) {
      lines.push(
        "Treat the first non-style reference as the immutable base tileset and any later non-style references as earlier animation phases. Preserve exact tile identity, indices, cell boundaries, palette, and alignment."
      );
    }
  } else if (request.asset.frameGrid) {
    const frameCount =
      request.asset.frameGrid.frameCount ??
      request.asset.frameGrid.columns * request.asset.frameGrid.rows;
    lines.push(
      `Spritesheet contract: create exactly ${frameCount} animation frames arranged in the first ${frameCount} cells of a fixed grid with ${request.asset.frameGrid.columns} columns and ${request.asset.frameGrid.rows} rows.`,
      `Each frame cell is exactly ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}. The full SVG canvas is ${dimensions.width}x${dimensions.height}.`,
      `Use one complete frame per grid cell, ordered left-to-right then top-to-bottom. Cell rectangles are: ${gridCellRectangles(request)}.`
    );

    if (context.requestedBackground === "opaque") {
      lines.push(
        "Fill every frame cell edge-to-edge with opaque artwork. Preserve stationary background scenery across frames. Do not draw visible grid lines, labels, frame numbers, or cell borders."
      );
    } else {
      lines.push(
        "Keep the background transparent by leaving empty areas unpainted. Do not draw visible grid lines, labels, frame numbers, or cell borders."
      );
    }
  } else if (context.requestedBackground === "opaque") {
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
  },
  signal?: AbortSignal
): Promise<Response> {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
  > = [{ type: "input_text", text: body.prompt }];

  for (const sourceReference of body.references) {
    const reference = await normalizeOpenAiImageReference(sourceReference, signal);
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
    }),
    signal
  });
}

function isSupportedResponseImageMimeType(mimeType: string): boolean {
  return mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp" ||
    mimeType === "image/gif";
}

export function gameAssetPrompt(
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
  const isTilesetAnimation = request.purpose === "tileset-animation";
  const lines: string[] = [];
  const brief = assetBriefForModel(request, context.prompt);
  if (brief) {
    lines.push(brief, "");
  }
  const structuredTilesetPrompt = isTilesetAnimation
    ? []
    : structuredTilesetPromptLines(request.asset);
  if (
    structuredTilesetPrompt.length &&
    !brief?.includes(structuredTilesetPrompt.join("\n"))
  ) {
    lines.push(...structuredTilesetPrompt, "");
  }
  lines.push(...(isTilesetAnimation
    ? [
        "Perform a minimal in-place edit of the immutable base tileset reference; do not redraw the sheet.",
        `Asset kind: ${request.asset.kind}.`,
        `Target canvas: ${dimensions.width}x${dimensions.height}. The output origin and every cell boundary must exactly match Reference 1.`
      ]
    : [
        "Create this as a clean 2D game asset sprite.",
        `Asset kind: ${request.asset.kind}.`,
        `Target canvas: ${dimensions.width}x${dimensions.height}.`
      ]));

  if (request.asset.kind === "tileset" && shouldRequestRgbaPng(request, context)) {
    lines.push(
      "Decide independently for each tile whether its artwork should be opaque edge-to-edge or should contain transparent pixels, based on what that tile depicts.",
      `For any tile that needs transparency, encode every transparent or empty pixel with the exact flat chroma-key color ${hexColor(context.chromaKey)}. This color is the transparency marker and will be removed after generation.`,
      `Never use any other matte, background, checkerboard, or substitute transparency color. Do not use ${hexColor(context.chromaKey)} in visible tile artwork.`,
      "For a tile that does not need transparency, fill the cell edge-to-edge and do not use the chroma-key color. Do not add labels, borders, shadows outside tiles, or a centered presentation layout."
    );
  } else if (shouldRequestRgbaPng(request, context)) {
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

  if (request.asset.kind === "tileset" && !isTilesetAnimation) {
    lines.push(...tilesetContractPromptLines(request.asset, false));
  } else if (request.asset.frameGrid) {
    const frameCount =
      request.asset.frameGrid.frameCount ??
      request.asset.frameGrid.columns * request.asset.frameGrid.rows;
    const rowLabel = request.asset.frameGrid.rows === 1 ? "row" : "rows";
    const columnLabel = request.asset.frameGrid.columns === 1 ? "column" : "columns";
    lines.push(
      `Spritesheet contract: exactly ${frameCount} animation frames arranged in the first ${frameCount} cells of a fixed grid with ${request.asset.frameGrid.columns} ${columnLabel} and ${request.asset.frameGrid.rows} ${rowLabel}.`,
      `The final image must be one ${dimensions.width}x${dimensions.height} spritesheet, not separate images and not a different grid.`,
      `Use one frame per grid cell, ordered left-to-right then top-to-bottom.`,
      `Each cell is exactly ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}; do not merge cells, crop cells, add extra frames beyond ${frameCount}, or change the grid layout.`,
      `Cell rectangles are: ${gridCellRectangles(request)}.`,
      `Frame centers must be at these cell centers: ${gridCellCenters(request)}.`,
      "Each grid cell must contain exactly one complete frame of the subject. Do not place a nested spritesheet, turnaround sheet, contact sheet, labels, thumbnails, or multiple mini-poses inside any single cell.",
      "The grid layout is mandatory even if the animation would look nicer in another arrangement."
    );

    if (shouldRequestRgbaPng(request, context)) {
      lines.push(
        `If the grid has more cells than ${frameCount}, leave the extra trailing cells fully transparent and empty.`,
        "Keep the character centered at a consistent scale in every cell, leaving transparent padding inside the cell."
      );
    } else {
      lines.push(
        "Every frame cell must be fully opaque from edge to edge with no alpha padding and no checkerboard pattern.",
        "Preserve the referenced background, framing, and stationary scenery in every frame; animate only the motion requested by the asset prompt.",
        `If the grid has more cells than ${frameCount}, fill the extra trailing cells with the same opaque background and no animation subject.`
      );
    }
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

  if (request.references?.length && request.asset.kind === "tileset" && isTilesetAnimation) {
    lines.push(
      "Reference 1 always controls sheet geometry and unchanged artwork. Use later non-style references only to understand chronological motion; never copy a shifted grid, changed cell boundary, or unintended redraw from them.",
      "Keep Reference 1's top-left origin and exact tile rectangles. Change only pixels explicitly requested by the animation tile instructions."
    );
  } else if (request.references?.length && request.asset.kind === "tileset") {
    lines.push(
      "The first non-style reference image is the immutable base tileset. Any additional non-style references are prior frames in this candidate's animation sequence, ordered chronologically by filename.",
      "Preserve the exact base sheet composition: every tile must keep its index, coordinates, dimensions, palette, shape identity, edge connections, and pixel alignment. Change only the pixels required by the requested animation phase; keep all other tiles identical."
    );
  } else if (request.references?.length) {
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

  if (context.variation && request.asset.kind === "tileset") {
    lines.push(
      `Variation seed: ${context.variation}. Use it only to choose a coherent motion treatment for this candidate; never vary tile identity, sheet layout, cell alignment, palette, or indices.`,
      variationDirectionPromptLine(context.variationIndex ?? 0)
    );
  } else if (context.variation) {
    lines.push(
      `Variation seed: ${context.variation}. Use this seed to make this option visually distinct from sibling options, not a near-duplicate. Vary the animation timing, pose rhythm, secondary motion, and effect shape while preserving the asset brief, frame grid, background instructions, and same exact character identity.`,
      variationDirectionPromptLine(context.variationIndex ?? 0)
    );
  }

  return lines.join("\n");
}

export function tilesetBasePrompt(asset: AiAssetDefinition): string {
  const lines = structuredTilesetPromptLines(asset);
  if (!lines.length) {
    throw new Error(
      `AI asset "${asset.id}" must be a tileset with per-tile prompts to build a structured tileset prompt.`
    );
  }

  return lines.join("\n");
}

function assetBriefForModel(
  request: GenerateAssetRequest,
  prompt: string
): string | undefined {
  if (
    request.asset.kind === "tileset" &&
    request.asset.tileset?.tiles !== undefined &&
    request.prompt === undefined
  ) {
    return undefined;
  }

  return prompt.trim() || undefined;
}

function structuredTilesetPromptLines(asset: AiAssetDefinition): string[] {
  const tileset = asset.tileset;
  const dimensions = asset.dimensions;
  if (!tileset?.tiles || !dimensions) return [];

  const tileCount = tileset.tileCount ?? tileset.columns * tileset.rows;
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const gridSpacing = margin === 0 && spacing === 0
    ? "with no margin or spacing"
    : `with ${margin === 0 ? "no outer margin" : `${margin}px outer margin`} and ${spacing === 0 ? "no spacing" : `${spacing}px spacing between tiles`}`;

  return [
    `Create a deterministic hand-authored ${tileset.tileWidth}×${tileset.tileHeight} pixel tileset.`,
    `Output one ${dimensions.width}×${dimensions.height} image arranged as a ${tileset.columns}-column × ${tileset.rows}-row grid ${gridSpacing}.`,
    "Read tiles left-to-right, then top-to-bottom.",
    "Use one cohesive visual style, palette, scale, lighting, perspective, and pixel treatment across every tile.",
    `Draw exactly these ${tileCount} tiles in this exact order:`,
    ...tileset.tiles.map((tile, index) => `Tile ${index + 1} — ${tile.prompt.trim()}`)
  ];
}

function tilesetContractPromptLines(
  asset: AiAssetDefinition,
  includeStructuredPrompt = true
): string[] {
  const tileset = asset.tileset;
  const dimensions = asset.dimensions;
  if (!tileset || !dimensions) return [];

  const tileCount = tileset.tileCount ?? tileset.columns * tileset.rows;
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const structuredPrompt = structuredTilesetPromptLines(asset);
  const geometryPrompt = includeStructuredPrompt && structuredPrompt.length
    ? structuredPrompt
    : [
        `Full-sheet tileset geometry: output exactly one ${dimensions.width}x${dimensions.height} sheet with ${tileset.columns} columns and ${tileset.rows} rows.`,
        `Every tile cell is exactly ${tileset.tileWidth}x${tileset.tileHeight}, with ${margin}px outer margin and ${spacing}px spacing. The sheet contains ${tileCount} usable tiles in row-major order.`,
        `Exact usable tile rectangles: ${tilesetTileRectangles(asset)}.`
      ];

  return [
    ...geometryPrompt,
    "Each cell contains exactly one tile at native scale. Do not create animation panels, nested sheets, thumbnails, labels, tile numbers, visible grid lines, gutters beyond the declared spacing, or presentation padding.",
    "Tile indices and cell coordinates are immutable. Keep artwork pixel-aligned to cell boundaries and preserve seamless edge connections between compatible terrain tiles.",
    `If the grid has more than ${tileCount} cells, leave only the trailing unused cells empty while preserving the full declared sheet geometry.`
  ];
}

function tilesetTileRectangle(asset: AiAssetDefinition, index: number): string {
  const tileset = asset.tileset;
  if (!tileset) return `Tile ${index + 1}`;

  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const column = index % tileset.columns;
  const row = Math.floor(index / tileset.columns);
  const x1 = margin + column * (tileset.tileWidth + spacing);
  const y1 = margin + row * (tileset.tileHeight + spacing);
  const x2 = x1 + tileset.tileWidth - 1;
  const y2 = y1 + tileset.tileHeight - 1;

  return `Tile ${index + 1} [x=${x1}-${x2}, y=${y1}-${y2}]`;
}

function tilesetTileRectangles(asset: AiAssetDefinition): string {
  const tileset = asset.tileset;
  if (!tileset) return "";

  const tileCount = tileset.tileCount ?? tileset.columns * tileset.rows;
  return Array.from({ length: tileCount }, (_, index) => tilesetTileRectangle(asset, index))
    .join("; ");
}

export function closestImageGenerationSize(dimensions: AiAssetDimensions): string {
  const targetRatio = dimensions.width / dimensions.height;
  const sizes = [
    { value: "1024x1024", ratio: 1 },
    { value: "1536x1024", ratio: 1.5 },
    { value: "1024x1536", ratio: 2 / 3 }
  ];

  return sizes
    .map((size) => ({
      ...size,
      distance: Math.abs(Math.log(targetRatio / size.ratio))
    }))
    .sort((left, right) => left.distance - right.distance)[0]!.value;
}

function sanitizeReferenceName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
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
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
}

async function createImageEdit(
  apiKey: string,
  body: Record<string, unknown>,
  references: GenerateAssetReference[],
  signal?: AbortSignal
): Promise<Response> {
  const form = new FormData();

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      form.append(key, String(value));
    }
  }

  for (const sourceReference of references) {
    const reference = await normalizeOpenAiImageReference(sourceReference, signal);
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
    body: form,
    signal
  });
}

const rasterizedSvgReferenceCache = new WeakMap<Uint8Array, Promise<Buffer>>();

async function normalizeOpenAiImageReference(
  reference: GenerateAssetReference,
  signal?: AbortSignal
): Promise<GenerateAssetReference> {
  if (reference.mimeType.split(";", 1)[0]?.trim().toLowerCase() !== "image/svg+xml") {
    return reference;
  }

  signal?.throwIfAborted();
  let rasterized = rasterizedSvgReferenceCache.get(reference.image);
  if (!rasterized) {
    rasterized = rasterizeSvgToPng(reference.image);
    rasterizedSvgReferenceCache.set(reference.image, rasterized);
  }
  const image = await rasterized;
  signal?.throwIfAborted();

  return {
    image,
    mimeType: "image/png",
    fileName: `${reference.fileName.replace(/\.[^.]+$/, "") || "reference"}.png`
  };
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
