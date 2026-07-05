import {
  expandAiAssetIds,
  resolveAiAsset,
  resolveTargetAssetId,
  topLevelAiAssetIds,
  type ExpandAiAssetIdsOptions,
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
  targetId?: string;
};

export type LoadAiAssetSetOptions = LoadAiAssetOptions & ExpandAiAssetIdsOptions;

export function loadAiAsset(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset {
  const selectionWithTarget = withTarget(selection, options.targetId);
  const assetId = resolveTargetAssetId(
    manifest,
    selectionWithTarget.assetId,
    selectionWithTarget.targetId
  );
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
    { ...selectionWithTarget, versionName: options.versionName ?? selectionWithTarget.versionName }
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
  const selectionWithTarget = withTarget(selection, options.targetId);
  const assetId = resolveTargetAssetId(
    manifest,
    selectionWithTarget.assetId,
    selectionWithTarget.targetId
  );
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
    { ...selectionWithTarget, versionName: options.versionName ?? selectionWithTarget.versionName }
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
  const targetVariantAssetIds = new Set(
    Object.values(manifest.targets ?? {}).flatMap((target) => Object.values(target.variants))
  );

  return Object.values(manifest.assets)
    .filter((asset) => !targetVariantAssetIds.has(asset.id))
    .filter((asset) => asset.kind === "sound" || asset.kind === "music")
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
  return loadAiAssetSet(scene, manifest, topLevelAiAssetIds(manifest), options);
}

export function loadAiAssetSet(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  assetIds: string[],
  options: LoadAiAssetSetOptions = {}
): ResolvedAiAsset[] {
  return expandAiAssetIds(manifest, assetIds, {
    includeLinkedAnimations: options.includeLinkedAnimations,
    targetId: options.targetId
  })
    .map((assetId) => manifest.assets[assetId])
    .filter((asset) => asset && asset.kind !== "collection" && !isAudioLikeAsset(asset.kind))
    .map((asset) => loadAiAsset(scene, manifest, asset.id, options));
}

function withTarget(
  selection: AiAssetSelection | string,
  targetId?: string
): AiAssetSelection {
  if (typeof selection === "string") {
    return { assetId: selection, targetId };
  }

  return {
    ...selection,
    targetId: selection.targetId ?? targetId
  };
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
