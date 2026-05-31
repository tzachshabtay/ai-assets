import {
  resolveAiAsset,
  type AiAssetManifest,
  type AiAssetSelection,
  type ResolvedAiAsset
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
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
        width: resolved.asset.dimensions.width,
        height: resolved.asset.dimensions.height
      });
    } else {
      scene.load.image(key, url);
    }
  }

  return resolved;
}

function isSvg(url: string): boolean {
  return /\.svg(?:$|[?#])/i.test(url);
}

export function loadAiAssets(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  options: LoadAiAssetOptions = {}
): ResolvedAiAsset[] {
  return Object.keys(manifest.assets).map((assetId) =>
    loadAiAsset(scene, manifest, assetId, options)
  );
}

function joinUrl(baseUrl: string | undefined, file: string): string {
  if (!baseUrl) {
    return file;
  }

  return `${baseUrl.replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}
