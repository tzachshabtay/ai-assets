import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  assertAsset,
  resolveAiAsset,
  type AiAssetDefinition,
  type AiAudioGenerationSettings,
  type AiAssetDimensions,
  type AiAssetFormat,
  type AiAssetFrameGrid,
  type AiAssetManifest,
  type AiAssetStyleGuide,
  type AiAssetTileset,
  type AiTilesetTile,
  type AiTilesetAnimation,
  type AiAssetVersion,
  type AiVoiceGenerationSettings
} from "@ai-game-assets/core";
import {
  generateTilesetAnimationBranches,
  type AiImageProvider,
  type GeneratedAssetOption,
  type GeneratedAssetOptionCallback,
  type GeneratedTilesetAnimationOption
} from "./provider.js";
import type { AiAudioProvider } from "./audio-provider.js";
import {
  type AssetStoreOptions,
  deleteAssetVersion,
  ensureTargetVariant,
  readManifest,
  saveGeneratedOption,
  saveTilesetAnimation,
  saveStyleGuide
} from "./asset-store.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type AiAssetDevServerOptions = AssetStoreOptions & {
  provider?: AiImageProvider;
  audioProvider?: AiAudioProvider;
  host?: string;
  port?: number;
};

export type SerializedGeneratedAssetOption = {
  index: number;
  mimeType: string;
  prompt: string;
  model?: string;
  revisedPrompt?: string;
  dimensions?: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
  tileset?: AiAssetTileset;
  animations?: AiAssetDefinition["animations"];
  settings?: AiAssetDefinition["settings"];
  audioSettings?: AiAssetDefinition["audioSettings"];
  audioPlayback?: AiAssetDefinition["audioPlayback"];
  voiceSettings?: AiAssetDefinition["voiceSettings"];
  durationSeconds?: number;
  dataUrl: string;
};

export type TilesetGenerationOverride = Pick<
  AiAssetTileset,
  "tileWidth" | "tileHeight" | "tileCount" | "tiles"
> & Partial<Pick<AiAssetTileset, "columns" | "rows">>;

export type GenerateTilesetAnimationStreamRequest = {
  assetId: string;
  animationKey: string;
  prompt?: string;
  frameCount?: number;
  tiles?: AiTilesetTile[];
  tileset?: TilesetGenerationOverride;
  count?: number;
  baseDataUrl?: string;
  styleGuide?: DebugStyleGuide;
};

export type GeneratedTilesetAnimationStreamOption = {
  index: number;
  animationKey: string;
  frames: SerializedGeneratedAssetOption[];
};

export type GenerateTilesetAnimationStreamEvent =
  | { type: "option"; option: GeneratedTilesetAnimationStreamOption }
  | { type: "done" }
  | { type: "error"; error: string };

export type SaveTilesetAnimationRequest = {
  assetId: string;
  animationKey: string;
  frames: string[];
  definition?: AiTilesetAnimation;
  versionName?: string;
  notes?: string;
};

export type SaveTilesetAnimationResponse = {
  manifest: AiAssetManifest;
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
  file: string;
  filePath: string;
};

export type SaveDebugOptionResponse = {
  manifest: AiAssetManifest;
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
  file: string;
  filePath: string;
};

export function createAiAssetDevServer(options: AiAssetDevServerOptions) {
  const server = createServer(async (request, response) => {
    try {
      await routeRequest(options, request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return {
    listen() {
      const port = options.port ?? 3977;
      const host = options.host ?? "127.0.0.1";

      return new Promise<{ port: number; host: string }>((resolve) => {
        server.listen(port, host, () => resolve({ port, host }));
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
    server
  };
}

async function routeRequest(
  options: AiAssetDevServerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    await serveGeneratedAsset(options, url, response, request.headers.range, request.method === "HEAD")
  ) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/__ai-assets/manifest") {
    sendJson(response, 200, await readManifest(options.manifestPath));
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/generate") {
    const body = await readJson<GenerateRequestBody>(request);
    const manifest = await readManifest(options.manifestPath);
    const asset = applyGenerationOverrides(getAsset(manifest, body.assetId), {
      dimensions: body.dimensions,
      frameCount: body.frameCount,
      tileset: body.tileset
    });
    const generated = isAudioAsset(asset)
      ? await generateAudio(options, manifest, asset, body)
      : await generateImage(options, manifest, asset, body);

    sendJson(response, 200, {
      options: generated.map((option, index) => serializeGeneratedOption(option, index))
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/generate-stream") {
    const body = await readJson<GenerateRequestBody>(request);
    const manifest = await readManifest(options.manifestPath);
    const asset = applyGenerationOverrides(getAsset(manifest, body.assetId), {
      dimensions: body.dimensions,
      frameCount: body.frameCount,
      tileset: body.tileset
    });

    response.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    });
    const generation = abortOnClientDisconnect(request, response);

    let sentOptions = 0;
    const onOption: GeneratedAssetOptionCallback = (option, index) => {
      generation.signal.throwIfAborted();
      sentOptions += 1;
      response.write(`${JSON.stringify({
        type: "option",
        option: serializeGeneratedOption(option, index)
      })}\n`);
    };

    try {
      const generated = isAudioAsset(asset)
        ? await generateAudio(options, manifest, asset, body, onOption)
        : await generateImage(options, manifest, asset, body, onOption, generation.signal);

      if (sentOptions === 0 && !generation.signal.aborted) {
        generated.forEach((option, index) => {
          response.write(`${JSON.stringify({
            type: "option",
            option: serializeGeneratedOption(option, index)
          })}\n`);
        });
      }

      if (!generation.signal.aborted && !response.destroyed) {
        response.write(`${JSON.stringify({ type: "done" })}\n`);
      }
    } catch (error) {
      if (!response.destroyed) {
        response.write(`${JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        })}\n`);
      }
    } finally {
      generation.dispose();
    }

    if (!response.destroyed) response.end();
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/__ai-assets/generate-tileset-animation-stream"
  ) {
    const body = await readJson<GenerateTilesetAnimationStreamRequest>(request);
    const manifest = await readManifest(options.manifestPath);
    const sourceAsset = getAsset(manifest, body.assetId);
    const asset = applyTilesetAnimationGenerationOverrides(sourceAsset, body);
    if (!options.provider) {
      throw new Error("OPENAI_API_KEY is required to generate tileset animations.");
    }
    if (asset.kind !== "tileset" || !asset.tileset) {
      throw new Error(`AI asset "${asset.id}" is not a tileset.`);
    }

    const resolved = resolveAiAsset(manifest, asset.id);
    const baseFileName = path.basename(resolved.version.file);
    const [providedBaseReference] = body.baseDataUrl
      ? referencesFromDataUrls([{
          name: `base-${asset.id}.png`,
          dataUrl: body.baseDataUrl
        }])
      : [];
    const baseReference = providedBaseReference ?? {
      image: await readFile(path.join(options.assetsDir, baseFileName)),
      mimeType: mimeTypeFromFile(baseFileName),
      fileName: `base-${baseFileName}`
    };

    response.writeHead(200, {
      ...corsHeaders(),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    });
    const generation = abortOnClientDisconnect(request, response);

    try {
      await generateTilesetAnimationBranches(options.provider, {
        asset,
        animationKey: body.animationKey,
        prompt: body.prompt,
        count: body.count,
        baseReference,
        stylePrompt: body.styleGuide
          ? body.styleGuide.prompt?.trim() || undefined
          : manifest.styleGuide?.prompt,
        styleReferences: body.styleGuide
          ? referencesFromDataUrls(body.styleGuide.images)
          : await getStyleReferenceImages(options, manifest.styleGuide),
        signal: generation.signal
      }, (option) => {
        generation.signal.throwIfAborted();
        const event: GenerateTilesetAnimationStreamEvent = {
          type: "option",
          option: serializeGeneratedTilesetAnimationOption(option)
        };
        response.write(`${JSON.stringify(event)}\n`);
      });
      const event: GenerateTilesetAnimationStreamEvent = { type: "done" };
      if (!generation.signal.aborted && !response.destroyed) {
        response.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      if (!response.destroyed) {
        const event: GenerateTilesetAnimationStreamEvent = {
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        };
        response.write(`${JSON.stringify(event)}\n`);
      }
    } finally {
      generation.dispose();
    }

    if (!response.destroyed) response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/ensure-first-drafts") {
    const body = await readJson<{
      assetIds?: string[];
    }>(request);
    let manifest = await readManifest(options.manifestPath);
    const requestedAssetIds = body.assetIds ?? Object.keys(manifest.assets);
    const assetIdsToGenerate = planFirstDraftGeneration(manifest, requestedAssetIds);
    const generated: Array<{ assetId: string; versionName: string }> = [];
    let generatedIndex = 0;

    for (const assetId of assetIdsToGenerate) {
      const asset = manifest.assets[assetId];

      if (
        !asset ||
        asset.kind === "collection" ||
        isAudioAsset(asset) ||
        Object.keys(asset.versions).length > 0 ||
        !options.provider
      ) {
        continue;
      }

      const optionsForAsset = await options.provider.generate({
        asset,
        count: 1,
        references: await getReferenceImages(options, manifest, asset.settings?.referenceAssetIds),
        stylePrompt: manifest.styleGuide?.prompt,
        styleReferences: await getStyleReferenceImages(options, manifest.styleGuide)
      });
      const option = optionsForAsset[0];

      if (!option) continue;

      const versionName = `first-draft-${Date.now()}-${generatedIndex + 1}`;
      const result = await saveGeneratedOption(options, {
        assetId,
        versionName,
        option,
        activate: true,
        notes: "Auto-generated first draft for a missing asset."
      });

      manifest = result.manifest;
      generated.push({ assetId, versionName });
      generatedIndex += 1;
    }

    sendJson(response, 200, { manifest, generated });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/style") {
    const body = await readJson<DebugStyleGuide>(request);
    const manifest = await saveStyleGuide(options, {
      prompt: body.prompt,
      images: referencesFromDataUrls(body.images).map((reference) => ({
        name: reference.fileName,
        mimeType: reference.mimeType,
        image: reference.image
      }))
    });

    sendJson(response, 200, { styleGuide: manifest.styleGuide });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/save") {
    const body = await readJson<{
      assetId: string;
      versionName: string;
      dataUrl: string;
      prompt: string;
      model?: string;
      revisedPrompt?: string;
      dimensions?: AiAssetDimensions;
      frameGrid?: AiAssetFrameGrid;
      tileset?: AiAssetTileset;
      animations?: AiAssetDefinition["animations"];
      settings?: AiAssetDefinition["settings"];
      audioSettings?: AiAssetDefinition["audioSettings"];
      audioPlayback?: AiAssetDefinition["audioPlayback"];
      voiceSettings?: AiAssetDefinition["voiceSettings"];
      durationSeconds?: number;
      activate?: boolean;
      notes?: string;
    }>(request);
    let option = optionFromDataUrl(body.dataUrl, {
      prompt: body.prompt,
      model: body.model,
      revisedPrompt: body.revisedPrompt,
      dimensions: body.dimensions,
      frameGrid: body.frameGrid,
      tileset: body.tileset,
      animations: body.animations,
      settings: body.settings
        ? body.settings
        : undefined,
      audioSettings: body.audioSettings,
      audioPlayback: body.audioPlayback,
      voiceSettings: body.voiceSettings,
      durationSeconds: body.durationSeconds
    });
    const asset = getAsset(await readManifest(options.manifestPath), body.assetId);
    if (asset.kind === "voice" && options.audioProvider?.createVoice) {
      const voiceSettings = await options.audioProvider.createVoice({
        asset,
        option,
        versionName: body.versionName
      });
      option = {
        ...option,
        voiceSettings: {
          ...option.voiceSettings,
          ...voiceSettings
        }
      };
    }
    const result = await saveGeneratedOption(options, {
      assetId: body.assetId,
      versionName: body.versionName,
      option,
      activate: body.activate,
      notes: body.notes
    });

    const responseBody: SaveDebugOptionResponse = {
      manifest: result.manifest,
      asset: getAsset(result.manifest, body.assetId),
      versionName: body.versionName,
      version: result.version,
      file: result.version.file,
      filePath: result.filePath
    };
    sendJson(response, 200, responseBody);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/__ai-assets/save-tileset-animation"
  ) {
    const body = await readJson<SaveTilesetAnimationRequest>(request);
    if (!Array.isArray(body.frames)) {
      throw new Error("save-tileset-animation frames must be an array of data URLs.");
    }
    const result = await saveTilesetAnimation(options, {
      assetId: body.assetId,
      animationKey: body.animationKey,
      frames: body.frames.map((dataUrl, index) =>
        imageFromDataUrl(dataUrl, `tileset animation frame ${index + 1}`)
      ),
      definition: body.definition,
      versionName: body.versionName,
      notes: body.notes
    });
    const responseBody: SaveTilesetAnimationResponse = {
      manifest: result.manifest,
      asset: result.asset,
      versionName: result.versionName,
      version: result.version,
      file: result.version.file,
      filePath: result.filePath
    };
    sendJson(response, 200, responseBody);
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/delete-version") {
    const body = await readJson<{
      assetId: string;
      versionName: string;
    }>(request);
    const manifest = await deleteAssetVersion(options, {
      assetId: body.assetId,
      versionName: body.versionName
    });

    sendJson(response, 200, { manifest });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/target-variant") {
    const body = await readJson<{
      targetId: string;
      assetId: string;
    }>(request);
    const result = await ensureTargetVariant(options, {
      targetId: body.targetId,
      assetId: body.assetId
    });

    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

type DebugStyleGuide = {
  prompt?: string;
  images?: Array<{
    name: string;
    dataUrl: string;
  }>;
};

type GenerateRequestBody = {
  assetId: string;
  prompt?: string;
  count?: number;
  references?: Array<{
    name: string;
    dataUrl: string;
  }>;
  dimensions?: AiAssetDimensions;
  frameCount?: number;
  tileset?: TilesetGenerationOverride;
  format?: AiAssetFormat;
  audioSettings?: AiAudioGenerationSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  styleGuide?: DebugStyleGuide;
};

async function generateImage(
  options: AiAssetDevServerOptions,
  manifest: AiAssetManifest,
  asset: AiAssetDefinition,
  body: {
    prompt?: string;
    count?: number;
    references?: Array<{
      name: string;
      dataUrl: string;
    }>;
    format?: AiAssetFormat;
    styleGuide?: DebugStyleGuide;
  },
  onOption?: GeneratedAssetOptionCallback,
  signal?: AbortSignal
) {
  if (!options.provider) {
    throw new Error(
      "OPENAI_API_KEY is required to generate graphical assets. Audio generation can still be used without it when ELEVENLABS_API_KEY is configured."
    );
  }

  const withAssetGeometry = (option: GeneratedAssetOption): GeneratedAssetOption => ({
    ...option,
    dimensions: option.dimensions ?? asset.dimensions,
    frameGrid: option.frameGrid ?? asset.frameGrid,
    tileset: option.tileset ?? asset.tileset
  });
  const onGeneratedOption = onOption
    ? (option: GeneratedAssetOption, index: number) => onOption(withAssetGeometry(option), index)
    : undefined;
  const generated = await options.provider.generate({
    asset,
    prompt: body.prompt,
    count: body.count,
    settings: body.format ? { format: body.format } : undefined,
    references: [
      ...(await getReferenceImages(options, manifest, asset.settings?.referenceAssetIds) ?? []),
      ...referencesFromDataUrls(body.references)
    ],
    stylePrompt: body.styleGuide
      ? body.styleGuide.prompt?.trim() || undefined
      : manifest.styleGuide?.prompt,
    styleReferences: body.styleGuide
      ? referencesFromDataUrls(body.styleGuide.images)
      : await getStyleReferenceImages(options, manifest.styleGuide),
    signal
  }, onGeneratedOption);

  return generated.map(withAssetGeometry);
}

async function generateAudio(
  options: AiAssetDevServerOptions,
  manifest: AiAssetManifest,
  asset: AiAssetDefinition,
  body: {
    prompt?: string;
    count?: number;
    audioSettings?: AiAudioGenerationSettings;
    voiceSettings?: AiVoiceGenerationSettings;
  },
  onOption?: GeneratedAssetOptionCallback
) {
  if (!options.audioProvider) {
    throw new Error(
      "ELEVENLABS_API_KEY is required to generate audio assets. Graphical asset generation can still be used without it when OPENAI_API_KEY is configured."
    );
  }

  return options.audioProvider.generate({
    asset,
    prompt: body.prompt,
    count: body.count,
    audioSettings: body.audioSettings,
    voiceSettings: body.voiceSettings,
    resolveVoiceId: (voiceAssetId) => {
      const voiceAsset = manifest.assets[voiceAssetId];
      const activeVoice = voiceAsset?.versions[voiceAsset.activeVersion];
      return activeVoice?.voiceSettings?.voiceId ?? voiceAsset?.voiceSettings?.voiceId;
    }
  }, onOption);
}

function serializeGeneratedOption(
  option: GeneratedAssetOption,
  index: number
): SerializedGeneratedAssetOption {
  return {
    index,
    mimeType: option.mimeType,
    prompt: option.prompt,
    model: option.model,
    revisedPrompt: option.revisedPrompt,
    dimensions: option.dimensions,
    frameGrid: option.frameGrid,
    tileset: option.tileset,
    animations: option.animations,
    settings: option.settings,
    audioSettings: option.audioSettings,
    audioPlayback: option.audioPlayback,
    voiceSettings: option.voiceSettings,
    durationSeconds: option.durationSeconds,
    dataUrl: `data:${option.mimeType};base64,${Buffer.from(option.image).toString("base64")}`
  };
}

export function serializeGeneratedTilesetAnimationOption(
  option: GeneratedTilesetAnimationOption
): GeneratedTilesetAnimationStreamOption {
  return {
    index: option.index,
    animationKey: option.animationKey,
    frames: option.frames.map((frame, index) => serializeGeneratedOption(frame, index))
  };
}

function isAudioAsset(asset: AiAssetDefinition): boolean {
  return asset.kind === "sound" ||
    asset.kind === "music" ||
    asset.kind === "voice" ||
    asset.kind === "voice-line";
}

export function planFirstDraftGeneration(
  manifest: AiAssetManifest,
  requestedAssetIds: string[]
): string[] {
  const planned: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (assetId: string) => {
    if (visited.has(assetId)) return;

    const asset = manifest.assets[assetId];

    if (!asset || asset.kind === "collection" || Object.keys(asset.versions).length > 0) {
      return;
    }

    if (visiting.has(assetId)) {
      throw new Error(`AI asset first-draft references contain a cycle at "${assetId}".`);
    }

    visiting.add(assetId);

    for (const referenceAssetId of asset.settings?.referenceAssetIds ?? []) {
      visit(referenceAssetId);
    }

    visiting.delete(assetId);
    visited.add(assetId);
    planned.push(assetId);
  };

  for (const assetId of requestedAssetIds) {
    visit(assetId);
  }

  return planned;
}

async function getReferenceImages(
  options: AiAssetDevServerOptions,
  manifest: AiAssetManifest,
  referenceAssetIds: string[] | undefined
) {
  if (!referenceAssetIds?.length) return undefined;

  return Promise.all(referenceAssetIds.map(async (assetId) => {
    const asset = manifest.assets[assetId];

    if (!asset || asset.kind === "collection" || Object.keys(asset.versions).length === 0) {
      return undefined;
    }

    const resolved = resolveAiAsset(manifest, assetId);
    const fileName = path.basename(resolved.version.file);
    const filePath = path.join(options.assetsDir, fileName);

    return {
      image: await readFile(filePath),
      mimeType: mimeTypeFromFile(fileName),
      fileName
    };
  })).then((references) => references.filter((reference) => reference !== undefined));
}

async function getStyleReferenceImages(
  options: AiAssetDevServerOptions,
  styleGuide: AiAssetStyleGuide | undefined
) {
  return Promise.all((styleGuide?.images ?? []).map(async (image) => {
    const fileName = path.basename(image.file);

    return {
      image: await readFile(path.join(options.assetsDir, fileName)),
      mimeType: image.mimeType ?? mimeTypeFromFile(fileName),
      fileName: image.name
    };
  }));
}

function referencesFromDataUrls(images: DebugStyleGuide["images"] = []) {
  return images.map((image) => {
    const match = /^data:(.+);base64,(.+)$/.exec(image.dataUrl);

    if (!match) {
      throw new Error(`Style image "${image.name}" is not a base64 data URL.`);
    }

    return {
      image: Buffer.from(match[2], "base64"),
      mimeType: match[1],
      fileName: image.name
    };
  });
}

function mimeTypeFromFile(fileName: string): string {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.svg$/i.test(fileName)) return "image/svg+xml";
  return "application/octet-stream";
}

function getAsset(manifest: AiAssetManifest, assetId: string) {
  const asset = manifest.assets[assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${assetId}".`);
  }

  return asset;
}

function applyGenerationOverrides(
  asset: AiAssetDefinition,
  overrides: {
    dimensions?: AiAssetDimensions;
    frameCount?: number;
    tileset?: TilesetGenerationOverride;
  }
): AiAssetDefinition {
  if (asset.kind === "tileset") {
    if (!asset.tileset) return asset;

    const tileWidth = tilesetOverridePositiveInteger(
      overrides.tileset?.tileWidth,
      asset.tileset.tileWidth,
      `${asset.id}.tileset.tileWidth`
    );
    const tileHeight = tilesetOverridePositiveInteger(
      overrides.tileset?.tileHeight,
      asset.tileset.tileHeight,
      `${asset.id}.tileset.tileHeight`
    );
    const columns = tilesetOverridePositiveInteger(
      overrides.tileset?.columns,
      asset.tileset.columns,
      `${asset.id}.tileset.columns`
    );
    const rows = tilesetOverridePositiveInteger(
      overrides.tileset?.rows,
      asset.tileset.rows,
      `${asset.id}.tileset.rows`
    );
    const capacity = columns * rows;
    const tileCount = tilesetOverridePositiveInteger(
      overrides.tileset?.tileCount,
      asset.tileset.tileCount ?? capacity,
      `${asset.id}.tileset.tileCount`
    );
    if (tileCount > capacity) {
      throw new Error(
        `${asset.id}.tileset.tileCount must not exceed columns * rows (${capacity}).`
      );
    }
    const tileset: AiAssetTileset = {
      ...asset.tileset,
      tileWidth,
      tileHeight,
      columns,
      rows,
      tileCount,
      tiles: overrides.tileset?.tiles === undefined
        ? asset.tileset.tiles
        : overrides.tileset.tiles
    };
    const margin = tileset.margin ?? 0;
    const spacing = tileset.spacing ?? 0;

    const generationAsset: AiAssetDefinition = {
      ...asset,
      dimensions: {
        width: margin * 2 + columns * tileWidth + Math.max(0, columns - 1) * spacing,
        height: margin * 2 + rows * tileHeight + Math.max(0, rows - 1) * spacing
      },
      tileset
    };
    assertAsset(generationAsset);
    return generationAsset;
  }

  if (!asset.frameGrid) {
    const dimensions = sanitizeDimensions(overrides.dimensions) ?? asset.dimensions;

    return {
      ...asset,
      dimensions
    };
  }

  const frameDimensions = sanitizeDimensions(overrides.dimensions) ?? {
    width: asset.frameGrid.frameWidth,
    height: asset.frameGrid.frameHeight
  };
  const frameCount = sanitizePositiveInteger(overrides.frameCount) ??
    asset.frameGrid.frameCount ??
    asset.frameGrid.columns * asset.frameGrid.rows;
  const frameGrid = createFrameGrid(asset.frameGrid, frameDimensions, frameCount);
  const dimensions = {
    width: frameGrid.frameWidth * frameGrid.columns,
    height: frameGrid.frameHeight * frameGrid.rows
  };

  return {
    ...asset,
    dimensions,
    frameGrid,
    animations: asset.animations?.map((animation) => ({
      ...animation,
      frames: Array.from({ length: frameCount }, (_, index) => index),
      frameTimings: animation.frameTimings
        ? Array.from({ length: frameCount }, (_, index) => animation.frameTimings?.[index] ?? {})
        : undefined
    }))
  };
}

function applyTilesetAnimationGenerationOverrides(
  asset: AiAssetDefinition,
  overrides: Pick<
    GenerateTilesetAnimationStreamRequest,
    "animationKey" | "frameCount" | "tiles" | "tileset"
  >
): AiAssetDefinition {
  const generationAsset = applyGenerationOverrides(asset, { tileset: overrides.tileset });
  const tileset = generationAsset.tileset;
  if (!tileset) return generationAsset;
  const tileCount = tileset.tileCount ?? tileset.columns * tileset.rows;
  if (overrides.tiles && overrides.tiles.length !== tileCount) {
    throw new Error(
      `${asset.id} tileset animation prompts must contain exactly ${tileCount} entries.`
    );
  }

  const animations = tileset.animations?.map((animation) => {
    if (animation.key !== overrides.animationKey) return animation;
    const frameCount = sanitizePositiveInteger(overrides.frameCount) ?? animation.frameCount;
    const frameDelayMs = Math.round(1000 / Math.max(1, animation.frameRate));
    return {
      ...animation,
      frameCount,
      tiles: overrides.tiles ?? animation.tiles,
      frameTimings: Array.from({ length: frameCount }, (_, index) => (
        animation.frameTimings?.[index] ?? { delayMs: frameDelayMs }
      ))
    };
  });
  const updated = {
    ...generationAsset,
    tileset: {
      ...tileset,
      animations
    }
  };
  return updated;
}

function createFrameGrid(
  baseFrameGrid: AiAssetFrameGrid,
  frameDimensions: AiAssetDimensions,
  frameCount: number
): AiAssetFrameGrid {
  const columns = Math.min(frameCount, Math.ceil(Math.sqrt(frameCount)));
  const rows = Math.ceil(frameCount / columns);

  return {
    ...baseFrameGrid,
    frameCount,
    columns,
    rows,
    frameWidth: frameDimensions.width,
    frameHeight: frameDimensions.height
  };
}

function sanitizeDimensions(dimensions: AiAssetDimensions | undefined): AiAssetDimensions | undefined {
  const width = sanitizePositiveInteger(dimensions?.width);
  const height = sanitizePositiveInteger(dimensions?.height);

  if (!width || !height) return undefined;

  return { width, height };
}

function sanitizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;

  return Math.max(1, Math.floor(value));
}

function tilesetOverridePositiveInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function abortOnClientDisconnect(
  request: IncomingMessage,
  response: ServerResponse
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error("AI asset generation client disconnected."));
    }
  };
  const handleResponseClose = () => {
    if (!response.writableEnded) abort();
  };

  request.once("aborted", abort);
  response.once("close", handleResponseClose);

  return {
    signal: controller.signal,
    dispose() {
      request.off("aborted", abort);
      response.off("close", handleResponseClose);
    }
  };
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function optionFromDataUrl(
  dataUrl: string,
  metadata: {
    prompt: string;
    model?: string;
    revisedPrompt?: string;
    dimensions?: AiAssetDimensions;
    frameGrid?: AiAssetFrameGrid;
    tileset?: AiAssetTileset;
    animations?: AiAssetDefinition["animations"];
    settings?: AiAssetDefinition["settings"];
    audioSettings?: AiAssetDefinition["audioSettings"];
    audioPlayback?: AiAssetDefinition["audioPlayback"];
    voiceSettings?: AiAssetDefinition["voiceSettings"];
    durationSeconds?: number;
  }
) {
  const decoded = imageFromDataUrl(dataUrl, "generated asset");

  return {
    image: decoded.image,
    mimeType: decoded.mimeType,
    prompt: metadata.prompt,
    model: metadata.model,
    revisedPrompt: metadata.revisedPrompt,
    dimensions: metadata.dimensions,
    frameGrid: metadata.frameGrid,
    tileset: metadata.tileset,
    animations: metadata.animations,
    settings: metadata.settings,
    audioSettings: metadata.audioSettings,
    audioPlayback: metadata.audioPlayback,
    voiceSettings: metadata.voiceSettings,
    durationSeconds: metadata.durationSeconds
  };
}

function imageFromDataUrl(
  dataUrl: string,
  label: string
): { image: Uint8Array; mimeType: string } {
  if (typeof dataUrl !== "string") {
    throw new Error(`Expected ${label} to be a base64 data URL.`);
  }
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error(`Expected ${label} to be a base64 data URL.`);
  }
  const image = Buffer.from(match[2], "base64");
  if (!image.byteLength) {
    throw new Error(`Expected ${label} to contain image data.`);
  }

  return { image, mimeType: match[1] };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    ...accessControlHeaders(),
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(): Record<string, string> {
  return {
    ...accessControlHeaders(),
    "Content-Type": "application/json"
  };
}

async function serveGeneratedAsset(
  options: AiAssetDevServerOptions,
  url: URL,
  response: ServerResponse,
  rangeHeader: string | undefined,
  headOnly: boolean
): Promise<boolean> {
  const publicPathPrefix = normalizePublicPathPrefix(options.publicPathPrefix);

  if (!publicPathPrefix) return false;
  if (
    url.pathname !== publicPathPrefix &&
    !url.pathname.startsWith(`${publicPathPrefix}/`)
  ) {
    return false;
  }

  const relativePath = decodeURIComponent(url.pathname.slice(publicPathPrefix.length));
  if (!relativePath || relativePath === "/") return false;

  const assetsRoot = path.resolve(options.assetsDir);
  const filePath = path.resolve(assetsRoot, `.${relativePath}`);

  if (filePath !== assetsRoot && !filePath.startsWith(`${assetsRoot}${path.sep}`)) {
    return false;
  }

  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch {
    return false;
  }

  const headers = {
    ...accessControlHeaders(),
    "Content-Type": contentTypeForFile(filePath),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache"
  };
  const range = parseByteRange(rangeHeader, file.byteLength);

  if (rangeHeader && !range) {
    response.writeHead(416, {
      ...headers,
      "Content-Range": `bytes */${file.byteLength}`,
      "Content-Length": "0"
    });
    response.end();
    return true;
  }

  if (range) {
    const body = file.subarray(range.start, range.end + 1);
    response.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${file.byteLength}`,
      "Content-Length": String(body.byteLength)
    });
    response.end(headOnly ? undefined : body);
    return true;
  }

  response.writeHead(200, {
    ...headers,
    "Content-Length": String(file.byteLength)
  });
  response.end(headOnly ? undefined : file);
  return true;
}

function parseByteRange(
  value: string | undefined,
  fileLength: number
): { start: number; end: number } | undefined {
  if (!value || fileLength <= 0) return undefined;

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined;

    return {
      start: Math.max(0, fileLength - suffixLength),
      end: fileLength - 1
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileLength - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileLength ||
    requestedEnd < start
  ) {
    return undefined;
  }

  return { start, end: Math.min(requestedEnd, fileLength - 1) };
}

function normalizePublicPathPrefix(publicPathPrefix: string | undefined): string | undefined {
  if (!publicPathPrefix) return undefined;
  const trimmed = publicPathPrefix.trim();
  if (!trimmed) return undefined;
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function contentTypeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".wav":
      return "audio/wav";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function accessControlHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}
