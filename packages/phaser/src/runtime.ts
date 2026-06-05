import {
  resolveAiAsset,
  type AiAssetManifest,
  type AiAssetSelection
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
import { aiAssetPlaceholderDataUrl } from "./placeholder.js";
import type { PhaserImageLike, PhaserSceneLike } from "./phaser-types.js";

export type AiAssetRuntimeOptions = {
  baseUrl?: string;
};

export class AiAssetRuntime {
  readonly scene: PhaserSceneLike;
  readonly manifest: AiAssetManifest;
  readonly baseUrl?: string;

  constructor(
    scene: PhaserSceneLike,
    manifest: AiAssetManifest,
    options: AiAssetRuntimeOptions = {}
  ) {
    this.scene = scene;
    this.manifest = manifest;
    this.baseUrl = options.baseUrl;
  }

  key(selection: AiAssetSelection | string): string {
    const assetId = typeof selection === "string" ? selection : selection.assetId;
    const asset = this.manifest.assets[assetId];

    if (asset && Object.keys(asset.versions).length === 0) {
      return aiTextureKey({ assetId });
    }

    const resolved = resolveAiAsset(this.manifest, selection);

    return aiTextureKey({
      assetId: resolved.asset.id,
      versionName: resolved.versionName === resolved.asset.activeVersion
        ? undefined
        : resolved.versionName
    });
  }

  setTexture(target: PhaserImageLike, selection: AiAssetSelection | string): void {
    target.setTexture(this.key(selection));
  }

  url(selection: AiAssetSelection | string): string {
    const assetId = typeof selection === "string" ? selection : selection.assetId;
    const asset = this.manifest.assets[assetId];

    if (asset && Object.keys(asset.versions).length === 0) {
      return aiAssetPlaceholderDataUrl(asset);
    }

    const resolved = resolveAiAsset(this.manifest, selection);

    if (!this.baseUrl) {
      return resolved.version.file;
    }

    return `${this.baseUrl.replace(/\/$/, "")}/${resolved.version.file.replace(/^\//, "")}`;
  }
}
