import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  resolveAiAsset,
  type AiAssetDefinition,
  type AiAudioGenerationSettings,
  type AiAssetDimensions,
  type AiAssetFormat,
  type AiAssetFrameGrid,
  type AiAssetManifest,
  type AiAssetStyleGuide
} from "@ai-game-assets/core";
import type { AiImageProvider } from "./provider.js";
import type { AiAudioProvider } from "./audio-provider.js";
import {
  type AssetStoreOptions,
  readManifest,
  saveGeneratedOption,
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

  if (request.method === "GET" && url.pathname === "/__ai-assets/manifest") {
    sendJson(response, 200, await readManifest(options.manifestPath));
    return;
  }

  if (request.method === "POST" && url.pathname === "/__ai-assets/generate") {
    const body = await readJson<{
      assetId: string;
      prompt?: string;
      count?: number;
      dimensions?: AiAssetDimensions;
      frameCount?: number;
      format?: AiAssetFormat;
      audioSettings?: AiAudioGenerationSettings;
      styleGuide?: DebugStyleGuide;
    }>(request);
    const manifest = await readManifest(options.manifestPath);
    const asset = applyGenerationOverrides(getAsset(manifest, body.assetId), {
      dimensions: body.dimensions,
      frameCount: body.frameCount
    });
    const generated = isAudioAsset(asset)
      ? await generateAudio(options, asset, body)
      : await generateImage(options, manifest, asset, body);

    sendJson(response, 200, {
      options: generated.map((option, index) => ({
        index,
        mimeType: option.mimeType,
        prompt: option.prompt,
        model: option.model,
        revisedPrompt: option.revisedPrompt,
        dimensions: option.dimensions,
        frameGrid: option.frameGrid,
        animations: option.animations,
        settings: option.settings,
        audioSettings: option.audioSettings,
        audioPlayback: option.audioPlayback,
        durationSeconds: option.durationSeconds,
        dataUrl: `data:${option.mimeType};base64,${Buffer.from(option.image).toString("base64")}`
      }))
    });
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
      animations?: AiAssetDefinition["animations"];
      settings?: AiAssetDefinition["settings"];
      audioSettings?: AiAssetDefinition["audioSettings"];
      audioPlayback?: AiAssetDefinition["audioPlayback"];
      durationSeconds?: number;
      activate?: boolean;
      notes?: string;
    }>(request);
    const option = optionFromDataUrl(body.dataUrl, {
      prompt: body.prompt,
      model: body.model,
      revisedPrompt: body.revisedPrompt,
      dimensions: body.dimensions,
      frameGrid: body.frameGrid,
      animations: body.animations,
      settings: body.settings
        ? body.settings
        : undefined,
      audioSettings: body.audioSettings,
      audioPlayback: body.audioPlayback,
      durationSeconds: body.durationSeconds
    });
    const result = await saveGeneratedOption(options, {
      assetId: body.assetId,
      versionName: body.versionName,
      option,
      activate: body.activate,
      notes: body.notes
    });

    sendJson(response, 200, {
      version: result.version,
      filePath: result.filePath
    });
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

async function generateImage(
  options: AiAssetDevServerOptions,
  manifest: AiAssetManifest,
  asset: AiAssetDefinition,
  body: {
    prompt?: string;
    count?: number;
    format?: AiAssetFormat;
    styleGuide?: DebugStyleGuide;
  }
) {
  if (!options.provider) {
    throw new Error(
      "OPENAI_API_KEY is required to generate graphical assets. Audio generation can still be used without it when ELEVENLABS_API_KEY is configured."
    );
  }

  return options.provider.generate({
    asset,
    prompt: body.prompt,
    count: body.count,
    settings: body.format ? { format: body.format } : undefined,
    references: await getReferenceImages(options, manifest, asset.settings?.referenceAssetIds),
    stylePrompt: body.styleGuide
      ? body.styleGuide.prompt?.trim() || undefined
      : manifest.styleGuide?.prompt,
    styleReferences: body.styleGuide
      ? referencesFromDataUrls(body.styleGuide.images)
      : await getStyleReferenceImages(options, manifest.styleGuide)
  });
}

async function generateAudio(
  options: AiAssetDevServerOptions,
  asset: AiAssetDefinition,
  body: {
    prompt?: string;
    count?: number;
    audioSettings?: AiAudioGenerationSettings;
  }
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
    audioSettings: body.audioSettings
  });
}

function isAudioAsset(asset: AiAssetDefinition): boolean {
  return asset.kind === "sound" || asset.kind === "music";
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
  }
): AiAssetDefinition {
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
    animations?: AiAssetDefinition["animations"];
    settings?: AiAssetDefinition["settings"];
    audioSettings?: AiAssetDefinition["audioSettings"];
    audioPlayback?: AiAssetDefinition["audioPlayback"];
    durationSeconds?: number;
  }
) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    throw new Error("Expected a base64 data URL.");
  }

  return {
    image: Buffer.from(match[2], "base64"),
    mimeType: match[1],
    prompt: metadata.prompt,
    model: metadata.model,
    revisedPrompt: metadata.revisedPrompt,
    dimensions: metadata.dimensions,
    frameGrid: metadata.frameGrid,
    animations: metadata.animations,
    settings: metadata.settings,
    audioSettings: metadata.audioSettings,
    audioPlayback: metadata.audioPlayback,
    durationSeconds: metadata.durationSeconds
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}
