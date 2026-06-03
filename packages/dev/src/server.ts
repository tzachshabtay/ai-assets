import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  resolveAiAsset,
  type AiAssetDefinition,
  type AiAssetDimensions,
  type AiAssetFrameGrid,
  type AiAssetManifest
} from "@ai-game-assets/core";
import type { AiImageProvider } from "./provider.js";
import {
  type AssetStoreOptions,
  readManifest,
  saveGeneratedOption
} from "./asset-store.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type AiAssetDevServerOptions = AssetStoreOptions & {
  provider: AiImageProvider;
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
    }>(request);
    const manifest = await readManifest(options.manifestPath);
    const asset = applyGenerationOverrides(getAsset(manifest, body.assetId), {
      dimensions: body.dimensions,
      frameCount: body.frameCount
    });
    const generated = await options.provider.generate({
      asset,
      prompt: body.prompt,
      count: body.count,
      references: await getReferenceImages(options, manifest, asset.settings?.referenceAssetIds)
    });

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
        dataUrl: `data:${option.mimeType};base64,${Buffer.from(option.image).toString("base64")}`
      }))
    });
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
      activate?: boolean;
      notes?: string;
    }>(request);
    const option = optionFromDataUrl(body.dataUrl, {
      prompt: body.prompt,
      model: body.model,
      revisedPrompt: body.revisedPrompt,
      dimensions: body.dimensions,
      frameGrid: body.frameGrid,
      animations: body.animations
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

async function getReferenceImages(
  options: AiAssetDevServerOptions,
  manifest: AiAssetManifest,
  referenceAssetIds: string[] | undefined
) {
  if (!referenceAssetIds?.length) return undefined;

  return Promise.all(referenceAssetIds.map(async (assetId) => {
    const resolved = resolveAiAsset(manifest, assetId);
    const fileName = path.basename(resolved.version.file);
    const filePath = path.join(options.assetsDir, fileName);

    return {
      image: await readFile(filePath),
      mimeType: mimeTypeFromFile(fileName),
      fileName
    };
  }));
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
    animations: metadata.animations
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
