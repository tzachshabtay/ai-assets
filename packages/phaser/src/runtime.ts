import {
  resolveAiAsset,
  resolveTargetAssetId,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetSelection
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
import { aiAssetPlaceholderDataUrl } from "./placeholder.js";
import type { PhaserImageLike, PhaserSceneLike } from "./phaser-types.js";

export type AiAssetRuntimeOptions = {
  baseUrl?: string;
  targetId?: string;
};

export type AiAssetTextureBinding = {
  readonly target: PhaserImageLike;
  readonly selection: AiAssetSelection | string;
  destroy(): void;
};

export type AiAssetBindTextureOptions = {
  setInitialTexture?: boolean;
};

export type AiAssetRuntimeDesignerCallbacks = {
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onAssetReady(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onManifestUpdated(manifest: AiAssetManifest): void;
};

type StoredTextureBinding = AiAssetTextureBinding & {
  targetAssetId: string;
};

export class AiAssetRuntime {
  readonly scene: PhaserSceneLike;
  readonly manifest: AiAssetManifest;
  readonly baseUrl?: string;
  readonly targetId?: string;
  private readonly textureBindings = new Set<StoredTextureBinding>();

  constructor(
    scene: PhaserSceneLike,
    manifest: AiAssetManifest,
    options: AiAssetRuntimeOptions = {}
  ) {
    this.scene = scene;
    this.manifest = manifest;
    this.baseUrl = options.baseUrl;
    this.targetId = options.targetId;
  }

  key(selection: AiAssetSelection | string): string {
    const assetId = this.resolveAssetId(selection);
    const asset = this.manifest.assets[assetId];

    if (asset && Object.keys(asset.versions).length === 0) {
      return aiTextureKey({ assetId });
    }

    const resolved = resolveAiAsset(this.manifest, this.withTarget(selection));

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

  bindTexture(
    target: PhaserImageLike,
    selection: AiAssetSelection | string,
    options: AiAssetBindTextureOptions = {}
  ): AiAssetTextureBinding {
    const binding: StoredTextureBinding = {
      target,
      selection,
      targetAssetId: this.resolveAssetId(selection),
      destroy: () => {
        this.textureBindings.delete(binding);
      }
    };

    this.textureBindings.add(binding);

    if (options.setInitialTexture !== false) {
      this.setTexture(target, selection);
    }

    return binding;
  }

  applyAssetTexture(assetId: string, textureKey: string, asset: AiAssetDefinition): void {
    this.manifest.assets[assetId] = asset;

    if (!isTextureAsset(asset)) return;

    for (const binding of this.textureBindings) {
      if (this.bindingMatchesAsset(binding, assetId)) {
        binding.target.setTexture(textureKey);
      }
    }
  }

  syncManifest(manifest: AiAssetManifest): void {
    syncRecord(this.manifest.assets, manifest.assets);
    this.manifest.assetPaths = manifest.assetPaths;
    this.manifest.styleGuide = manifest.styleGuide;
    this.manifest.targets = manifest.targets;

    for (const binding of this.textureBindings) {
      binding.targetAssetId = this.resolveAssetId(binding.selection);
    }
  }

  designerCallbacks(): AiAssetRuntimeDesignerCallbacks {
    return {
      onPreview: (assetId, textureKey, asset) => {
        this.applyAssetTexture(assetId, textureKey, asset);
      },
      onAssetReady: (assetId, textureKey, asset) => {
        this.applyAssetTexture(assetId, textureKey, asset);
      },
      onManifestUpdated: (manifest) => {
        this.syncManifest(manifest);
      }
    };
  }

  url(selection: AiAssetSelection | string): string {
    const assetId = this.resolveAssetId(selection);
    const asset = this.manifest.assets[assetId];

    if (asset && Object.keys(asset.versions).length === 0) {
      return aiAssetPlaceholderDataUrl(asset);
    }

    const resolved = resolveAiAsset(this.manifest, this.withTarget(selection));

    if (!this.baseUrl) {
      return resolved.version.file;
    }

    return `${this.baseUrl.replace(/\/$/, "")}/${resolved.version.file.replace(/^\//, "")}`;
  }

  private withTarget(selection: AiAssetSelection | string): AiAssetSelection {
    if (typeof selection === "string") {
      return {
        assetId: selection,
        targetId: this.targetId
      };
    }

    return {
      ...selection,
      targetId: selection.targetId ?? this.targetId
    };
  }

  private resolveAssetId(selection: AiAssetSelection | string): string {
    const withTarget = this.withTarget(selection);
    return resolveTargetAssetId(this.manifest, withTarget.assetId, withTarget.targetId);
  }

  private bindingMatchesAsset(binding: StoredTextureBinding, assetId: string): boolean {
    if (binding.targetAssetId === assetId) return true;

    try {
      binding.targetAssetId = this.resolveAssetId(binding.selection);
      return binding.targetAssetId === assetId;
    } catch {
      return false;
    }
  }
}

function isTextureAsset(asset: AiAssetDefinition): boolean {
  return asset.kind === "image" || asset.kind === "spritesheet" || asset.kind === "animation";
}

function syncRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key];
    }
  }

  Object.assign(target, source);
}
