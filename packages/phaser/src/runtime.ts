import {
  resolveAiAsset,
  resolveTargetAssetId,
  type AiAssetAnimation,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetSelection
} from "@ai-game-assets/core";
import {
  aiAssetAnimationSize,
  animationDurationMs,
  animationHasFrameTransforms,
  createAiAnimations
} from "./animations.js";
import {
  bindAiAnimationFrameTransforms,
  type AiAssetFrameTransformBinding,
  type AiAssetFrameTransformOptions,
  type AiAssetFrameTransformSize,
  type AiAssetFrameTransformTarget
} from "./frame-transforms.js";
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

export type AiAssetAnimationPlaybackTarget = PhaserImageLike & {
  play(key: string | { key: string; randomFrame?: boolean }, ignoreIfPlaying?: boolean): unknown;
  setDisplaySize?(width: number, height: number): unknown;
  setOrigin?(x: number, y: number): unknown;
  setRotation?(radians: number): unknown;
  on?(eventName: string, handler: (...args: unknown[]) => void): unknown;
  off?(eventName: string, handler: (...args: unknown[]) => void): unknown;
  once?(eventName: string, handler: (...args: unknown[]) => void): unknown;
};

export type AiAssetPlayAnimationOptions = {
  applyFrameTransforms?: boolean;
  forceRestart?: boolean;
  randomFrame?: boolean;
  frameTransform?: AiAssetFrameTransformOptions;
  frameTransformSize?: AiAssetFrameTransformSize;
};

export type AiAssetAnimationPlayback = {
  readonly assetId: string;
  readonly animation?: AiAssetAnimation;
  readonly animationKey?: string;
  readonly durationMs: number;
  readonly frameTransforms?: AiAssetFrameTransformBinding;
  destroy(): void;
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
  private readonly warnedMissingTextureKeys = new Set<string>();

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
    const key = this.key(selection);
    this.warnIfMissingTexture(selection, key);
    target.setTexture(key);
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

  playAnimation(
    target: AiAssetAnimationPlaybackTarget,
    selection: AiAssetSelection | string,
    stateOrAnimationKey?: string,
    options: AiAssetPlayAnimationOptions = {}
  ): AiAssetAnimationPlayback {
    const animationSelection = this.resolveAnimationSelection(selection, stateOrAnimationKey);
    const asset = this.manifest.assets[animationSelection.assetId];
    const animation = this.animationForState(asset, stateOrAnimationKey);

    if (!animation) {
      this.setTexture(target, animationSelection.selection);

      return {
        assetId: animationSelection.assetId,
        durationMs: 0,
        destroy() {}
      };
    }

    if (!this.scene.anims?.exists?.(animation.key)) {
      createAiAnimations(this.scene, this.manifest, animationSelection.selection, {
        onFrameTransforms: "ignore"
      });
    }

    target.play(
      options.randomFrame
        ? { key: animation.key, randomFrame: true }
        : animation.key,
      options.forceRestart ? false : true
    );

    const frameTransforms = this.bindAnimationFrameTransforms(target, asset, animation, options);

    return {
      assetId: animationSelection.assetId,
      animation,
      animationKey: animation.key,
      durationMs: animationDurationMs(animation),
      frameTransforms,
      destroy() {
        frameTransforms?.detach();
      }
    };
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

  private resolveAnimationSelection(
    selection: AiAssetSelection | string,
    stateOrAnimationKey: string | undefined
  ): { assetId: string; selection: AiAssetSelection } {
    const baseSelection = this.withTarget(selection);
    const baseAssetId = resolveTargetAssetId(this.manifest, baseSelection.assetId, baseSelection.targetId);
    const baseAsset = this.manifest.assets[baseAssetId];
    const linkedAssetId = stateOrAnimationKey
      ? baseAsset?.linkedAnimationAssets?.[stateOrAnimationKey]?.assetId
      : undefined;
    const animationAssetSelection = {
      assetId: linkedAssetId ?? baseSelection.assetId,
      targetId: baseSelection.targetId
    };

    return {
      assetId: resolveTargetAssetId(
        this.manifest,
        animationAssetSelection.assetId,
        animationAssetSelection.targetId
      ),
      selection: animationAssetSelection
    };
  }

  private animationForState(
    asset: AiAssetDefinition | undefined,
    stateOrAnimationKey: string | undefined
  ): AiAssetAnimation | undefined {
    return stateOrAnimationKey
      ? asset?.animations?.find((animation) => animation.key === stateOrAnimationKey) ?? asset?.animations?.[0]
      : asset?.animations?.[0];
  }

  private bindAnimationFrameTransforms(
    target: AiAssetAnimationPlaybackTarget,
    asset: AiAssetDefinition | undefined,
    animation: AiAssetAnimation,
    options: AiAssetPlayAnimationOptions
  ): AiAssetFrameTransformBinding | undefined {
    if (options.applyFrameTransforms === false) return undefined;
    if (!animationHasFrameTransforms(animation)) return undefined;

    if (!isFrameTransformTarget(target)) {
      console.warn(
        `AI asset animation "${animation.key}" includes frame transform metadata, ` +
        "but the playback target does not expose setDisplaySize, setOrigin, and setRotation. " +
        "Pass { applyFrameTransforms: false } to playAnimation to silence this warning."
      );
      return undefined;
    }

    const binding = bindAiAnimationFrameTransforms(
      target,
      animation,
      options.frameTransformSize ?? aiAssetAnimationSize(asset),
      options.frameTransform
    );
    target.once?.("destroy", () => binding.detach());

    return binding;
  }

  private warnIfMissingTexture(selection: AiAssetSelection | string, key: string): void {
    if (!this.scene.textures || this.scene.textures.exists(key)) return;
    if (this.warnedMissingTextureKeys.has(key)) return;

    this.warnedMissingTextureKeys.add(key);

    const assetId = this.resolveAssetId(selection);
    console.warn(
      `AI asset texture "${key}" for "${assetId}" has not been loaded. ` +
      `Preload the asset with loadAiAssetSet(scene, manifest, ["${assetId}"]) ` +
      "or include it in loadAiAssets before binding it to a Phaser object."
    );
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

function isFrameTransformTarget(
  target: AiAssetAnimationPlaybackTarget
): target is AiAssetAnimationPlaybackTarget & AiAssetFrameTransformTarget {
  return (
    typeof target.setDisplaySize === "function" &&
    typeof target.setOrigin === "function" &&
    typeof target.setRotation === "function"
  );
}

function syncRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key];
    }
  }

  Object.assign(target, source);
}
