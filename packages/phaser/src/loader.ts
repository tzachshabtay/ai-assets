import {
  resolveAiAsset,
  type AiAssetManifest,
  type AiAssetSelection,
  type ResolvedAiAsset
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
import { aiAssetPlaceholderDataUrl } from "./placeholder.js";
import type { PhaserSceneLike } from "./phaser-types.js";

export type LoadAiAssetOptions = {
  key?: string;
  baseUrl?: string;
  versionName?: string;
};

export function loadAiAsset(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset {
  const assetId = typeof selection === "string" ? selection : selection.assetId;
  if (
    manifest.assets[assetId]?.kind === "collection" ||
    manifest.assets[assetId]?.kind === "sound" ||
    manifest.assets[assetId]?.kind === "music" ||
    manifest.assets[assetId]?.kind === "voice" ||
    manifest.assets[assetId]?.kind === "voice-line"
  ) {
    throw new Error(`AI asset "${assetId}" cannot be loaded as a texture.`);
  }

  const unresolvedAsset = manifest.assets[assetId];
  if (unresolvedAsset && Object.keys(unresolvedAsset.versions).length === 0) {
    const key = options.key ?? aiTextureKey({ assetId });
    const url = aiAssetPlaceholderDataUrl(unresolvedAsset);

    if (unresolvedAsset.kind === "spritesheet" || unresolvedAsset.kind === "animation") {
      if (!unresolvedAsset.frameGrid) {
        throw new Error(`AI asset "${unresolvedAsset.id}" requires frameGrid for spritesheet loading.`);
      }

      scene.load.spritesheet(key, url, {
        frameWidth: unresolvedAsset.frameGrid.frameWidth,
        frameHeight: unresolvedAsset.frameGrid.frameHeight,
        margin: unresolvedAsset.frameGrid.margin,
        spacing: unresolvedAsset.frameGrid.spacing
      });
    } else if (scene.load.svg) {
      scene.load.svg(key, url, {
        width: unresolvedAsset.dimensions?.width ?? 1,
        height: unresolvedAsset.dimensions?.height ?? 1
      });
    } else {
      scene.load.image(key, url);
    }

    return {
      asset: unresolvedAsset,
      versionName: "",
      version: {
        name: "",
        file: url,
        prompt: unresolvedAsset.prompt,
        createdAt: new Date(0).toISOString(),
        model: "loading-placeholder"
      }
    };
  }

  const resolved = resolveAiAsset(
    manifest,
    typeof selection === "string"
      ? { assetId: selection, versionName: options.versionName }
      : { ...selection, versionName: options.versionName ?? selection.versionName }
  );
  const key = options.key ?? aiTextureKey({
    assetId: resolved.asset.id,
    versionName: resolved.versionName === resolved.asset.activeVersion
      ? undefined
      : resolved.versionName
  });
  const url = joinUrl(options.baseUrl, resolved.version.file);

  if (resolved.asset.kind === "spritesheet" || resolved.asset.kind === "animation") {
    if (!resolved.asset.frameGrid) {
      throw new Error(`AI asset "${resolved.asset.id}" requires frameGrid for spritesheet loading.`);
    }

    scene.load.spritesheet(key, url, {
      frameWidth: resolved.asset.frameGrid.frameWidth,
      frameHeight: resolved.asset.frameGrid.frameHeight,
      margin: resolved.asset.frameGrid.margin,
      spacing: resolved.asset.frameGrid.spacing
    });
  } else {
    if (isSvg(url) && scene.load.svg) {
      scene.load.svg(key, url, {
        width: resolved.asset.dimensions?.width ?? 1,
        height: resolved.asset.dimensions?.height ?? 1
      });
    } else {
      scene.load.image(key, url);
    }
  }

  return resolved;
}

export function loadAiAudioAsset(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset | undefined {
  const assetId = typeof selection === "string" ? selection : selection.assetId;
  const asset = manifest.assets[assetId];

  if (!asset || !isAudioLikeAsset(asset.kind)) {
    throw new Error(`AI asset "${assetId}" is not an audio asset.`);
  }

  if (!scene.load.audio) {
    throw new Error("This Phaser scene loader does not support audio assets.");
  }

  if (Object.keys(asset.versions).length === 0) {
    return undefined;
  }

  const resolved = resolveAiAsset(
    manifest,
    typeof selection === "string"
      ? { assetId: selection, versionName: options.versionName }
      : { ...selection, versionName: options.versionName ?? selection.versionName }
  );
  const key = options.key ?? aiTextureKey({
    assetId: resolved.asset.id,
    versionName: resolved.versionName === resolved.asset.activeVersion
      ? undefined
      : resolved.versionName
  });

  scene.load.audio(key, joinUrl(options.baseUrl, resolved.version.file));
  return resolved;
}

export function loadAiAudioAssets(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset[] {
  return Object.values(manifest.assets)
    .filter((asset) => isAudioLikeAsset(asset.kind))
    .map((asset) => loadAiAudioAsset(scene, manifest, asset.id, options))
    .filter((asset): asset is ResolvedAiAsset => Boolean(asset));
}

function isSvg(url: string): boolean {
  return /\.svg(?:$|[?#])/i.test(url);
}

export function loadAiAssets(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset[] {
  return Object.values(manifest.assets)
    .filter((asset) => asset.kind !== "collection" && !isAudioLikeAsset(asset.kind))
    .map((asset) => loadAiAsset(scene, manifest, asset.id, options));
}

function isAudioLikeAsset(kind: string): boolean {
  return kind === "sound" || kind === "music" || kind === "voice" || kind === "voice-line";
}

function joinUrl(baseUrl: string | undefined, file: string): string {
  if (!baseUrl) {
    return file;
  }

  return `${baseUrl.replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}
