import {
  type AiAssetDefinition,
  type AiAssetManifest
} from "@ai-game-assets/core";
import type { AiAssetDebugClient, EnsureFirstDraftsResult } from "./debug-client.js";
import { aiTextureKey } from "./keys.js";
import type { PhaserTextureManagerLike } from "./phaser-types.js";

export type AiAssetFirstDraftSceneLike = {
  textures?: PhaserTextureManagerLike;
};

export type EnsureMissingAiAssetFirstDraftsOptions = {
  scene: AiAssetFirstDraftSceneLike;
  manifest: AiAssetManifest;
  client: AiAssetDebugClient;
  assetIds?: string[];
  baseUrl?: string;
  continueOnError?: boolean;
  onManifestUpdated?: (manifest: AiAssetManifest) => void;
  onAssetReady?: (assetId: string, textureKey: string, asset: AiAssetDefinition) => void;
  onProgress?: (progress: EnsureMissingAiAssetFirstDraftsProgress) => void;
  onError?: (error: unknown, assetId: string) => void;
  generationTimeoutMs?: number;
  textureLoadTimeoutMs?: number;
};

export type EnsureMissingAiAssetFirstDraftsProgress = {
  completed: number;
  total: number;
  currentAssetId?: string;
  generatedAssetIds: string[];
};

export type EnsureMissingAiAssetFirstDraftsResult = {
  manifest: AiAssetManifest;
  generatedAssetIds: string[];
  errors: Array<{
    assetId: string;
    error: unknown;
  }>;
};

export async function ensureMissingAiAssetFirstDrafts(
  options: EnsureMissingAiAssetFirstDraftsOptions
): Promise<EnsureMissingAiAssetFirstDraftsResult> {
  const targetAssetIds = firstDraftTargetAssetIds(options.manifest, options.assetIds)
    .filter((assetId) => isMissingLoadableAsset(options.manifest.assets[assetId]));
  const generatedAssetIds: string[] = [];
  const errors: EnsureMissingAiAssetFirstDraftsResult["errors"] = [];
  const pendingCompletions: Promise<void>[] = [];

  const applyResult = async (result: EnsureFirstDraftsResult) => {
    Object.assign(options.manifest.assets, result.manifest.assets);
    options.manifest.styleGuide = result.manifest.styleGuide;
    options.onManifestUpdated?.(options.manifest);

    for (const generated of result.generated) {
      const asset = options.manifest.assets[generated.assetId];

      if (!asset) continue;

      const textureKey = await loadGeneratedTexture(
        options.scene,
        asset,
        options.baseUrl,
        options.textureLoadTimeoutMs
      );

      if (!generatedAssetIds.includes(generated.assetId)) {
        generatedAssetIds.push(generated.assetId);
      }

      options.onAssetReady?.(generated.assetId, textureKey, asset);
      options.onProgress?.({
        completed: generatedAssetIds.length,
        total: targetAssetIds.length,
        currentAssetId: generated.assetId,
        generatedAssetIds: [...generatedAssetIds]
      });
    }
  };

  options.onProgress?.({
    completed: 0,
    total: targetAssetIds.length,
    generatedAssetIds: []
  });

  for (const assetId of targetAssetIds) {
    if (!isMissingLoadableAsset(options.manifest.assets[assetId])) {
      continue;
    }

    options.onProgress?.({
      completed: generatedAssetIds.length,
      total: targetAssetIds.length,
      currentAssetId: assetId,
      generatedAssetIds: [...generatedAssetIds]
    });

    try {
      const generation = options.client.ensureFirstDrafts({ assetIds: [assetId] });
      const result = await softTimeout(
        generation,
        options.generationTimeoutMs ?? 90000,
        `Timed out generating first draft for AI asset "${assetId}".`
      );

      if (result.status === "timeout") {
        errors.push({ assetId, error: result.error });
        options.onError?.(result.error, assetId);

        pendingCompletions.push(
          generation
            .then((lateResult) => applyResult(lateResult))
            .catch((error) => {
              errors.push({ assetId, error });
              options.onError?.(error, assetId);
            })
        );
        continue;
      }

      await applyResult(result.value);
    } catch (error) {
      errors.push({ assetId, error });
      options.onError?.(error, assetId);

      if (!options.continueOnError) {
        throw error;
      }
    }
  }

  void Promise.allSettled(pendingCompletions);

  options.onProgress?.({
    completed: generatedAssetIds.length,
    total: targetAssetIds.length,
    generatedAssetIds: [...generatedAssetIds]
  });

  return {
    manifest: options.manifest,
    generatedAssetIds,
    errors
  };
}

function firstDraftTargetAssetIds(
  manifest: AiAssetManifest,
  rootAssetIds = Object.keys(manifest.assets)
): string[] {
  const targets: string[] = [];
  const add = (assetId: string | undefined) => {
    if (!assetId || targets.includes(assetId)) return;
    targets.push(assetId);
  };

  for (const rootAssetId of rootAssetIds) {
    const asset = manifest.assets[rootAssetId];
    const linkedAnimationIds = Object.values(asset?.linkedAnimationAssets ?? {})
      .map((linkedAnimation) => linkedAnimation.assetId);

    add(linkedAnimationIds[0] ?? rootAssetId);
  }

  for (const rootAssetId of rootAssetIds) {
    const asset = manifest.assets[rootAssetId];

    for (const linkedAnimation of Object.values(asset?.linkedAnimationAssets ?? {})) {
      add(linkedAnimation.assetId);
    }

    add(rootAssetId);
  }

  for (const assetId of Object.keys(manifest.assets)) {
    add(assetId);
  }

  return targets;
}

function isMissingLoadableAsset(asset: AiAssetDefinition | undefined): boolean {
  return Boolean(
    asset &&
    asset.kind !== "collection" &&
    asset.kind !== "sound" &&
    asset.kind !== "music" &&
    Object.keys(asset.versions).length === 0
  );
}

function loadGeneratedTexture(
  scene: AiAssetFirstDraftSceneLike,
  asset: AiAssetDefinition,
  baseUrl: string | undefined,
  timeoutMs = 10000
): Promise<string> {
  if (!scene.textures) {
    return Promise.reject(new Error("AI asset first-draft loading requires scene.textures."));
  }

  const version = asset.versions[asset.activeVersion];

  if (!version) {
    return Promise.reject(new Error(`AI asset "${asset.id}" does not have an active generated version.`));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const textureKey = aiTextureKey({
      assetId: asset.id,
      versionName: asset.activeVersion
    });
    const timeout = globalThis.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error(`Timed out loading generated AI asset "${asset.id}".`));
    }, timeoutMs);

    image.onload = () => {
      globalThis.clearTimeout(timeout);

      if (scene.textures?.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }

      if (asset.frameGrid) {
        scene.textures?.addSpriteSheet?.(textureKey, image, {
          frameWidth: asset.frameGrid.frameWidth,
          frameHeight: asset.frameGrid.frameHeight,
          margin: asset.frameGrid.margin,
          spacing: asset.frameGrid.spacing
        });
      } else {
        scene.textures?.addImage?.(textureKey, image);
      }

      resolve(textureKey);
    };
    image.onerror = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error(`Could not load generated AI asset "${asset.id}".`));
    };
    image.src = joinUrl(baseUrl, version.file);
  });
}

async function softTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<
  | { status: "resolved"; value: T }
  | { status: "timeout"; error: Error }
> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      resolve({ status: "timeout", error: new Error(message) });
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve({ status: "resolved", value });
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function joinUrl(baseUrl: string | undefined, file: string): string {
  if (!baseUrl) {
    return file;
  }

  return `${baseUrl.replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}
