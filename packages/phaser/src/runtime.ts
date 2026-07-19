import {
  resolveAiAsset,
  resolveTargetAssetId,
  type AiAssetAnimation,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetSelection,
  type AiTilesetAnimation
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
import { aiTextureKey, aiTilesetAnimationKey } from "./keys.js";
import { aiAssetPlaceholderDataUrl } from "./placeholder.js";
import type { PhaserImageLike, PhaserSceneLike } from "./phaser-types.js";
import {
  createAiTilesetAnimation,
  tilesetAnimationDurationMs
} from "./tilesets.js";

export type AiAssetRuntimeOptions = {
  baseUrl?: string;
  targetId?: string;
};

export type AiAssetTextureBinding = {
  readonly target: PhaserImageLike;
  readonly selection: AiAssetSelection | string;
  readonly frame?: string | number;
  destroy(): void;
};

export type AiAssetBindTextureOptions = {
  setInitialTexture?: boolean;
  /** Frame to preserve when previewing or promoting a spritesheet/tileset. */
  frame?: string | number;
};

export type AiAssetAnimationPlaybackTarget = PhaserImageLike & {
  play(key: string | { key: string; randomFrame?: boolean }, ignoreIfPlaying?: boolean): unknown;
  stop?(): unknown;
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

export type AiAssetPlayTilesetAnimationOptions = Pick<
  AiAssetPlayAnimationOptions,
  "forceRestart" | "randomFrame"
>;

export type AiAssetTilesetAnimationPlayback = {
  readonly assetId: string;
  readonly animation?: AiTilesetAnimation;
  readonly animationKey?: string;
  readonly tileFrame: number;
  readonly durationMs: number;
  destroy(): void;
};

export type AiAssetRuntimeDesignerCallbacks = {
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onTilesetAnimationPreview(
    assetId: string,
    animationKey: string,
    textureKeys: string[],
    asset: AiAssetDefinition
  ): void;
  onAssetReady(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onManifestUpdated(manifest: AiAssetManifest): void;
};

type StoredTextureBinding = AiAssetTextureBinding & {
  targetAssetId: string;
};

type StoredTilesetAnimationBinding = {
  target: AiAssetAnimationPlaybackTarget;
  selection: AiAssetSelection | string;
  targetAssetId: string;
  tileFrame: number;
  animationKey: string;
  options: AiAssetPlayTilesetAnimationOptions;
};

type StoredTilesetAnimationPreview = {
  animationKey: string;
  textureKeys: string[];
  asset: AiAssetDefinition;
  installedAnimationKeys: Set<string>;
};

export class AiAssetRuntime {
  readonly scene: PhaserSceneLike;
  readonly manifest: AiAssetManifest;
  readonly baseUrl?: string;
  readonly targetId?: string;
  private readonly textureBindings = new Set<StoredTextureBinding>();
  private readonly tilesetAnimationBindings = new Set<StoredTilesetAnimationBinding>();
  private readonly previewTilesetAnimations = new Map<string, StoredTilesetAnimationPreview>();
  private readonly previewTextureKeys = new Map<string, string>();
  private readonly previewAssets = new Map<string, AiAssetDefinition>();
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
    const previewTextureKey = this.previewTextureKeys.get(assetId);
    if (previewTextureKey) return previewTextureKey;

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

  setTexture(
    target: PhaserImageLike,
    selection: AiAssetSelection | string,
    frame?: string | number
  ): void {
    const key = this.key(selection);
    this.warnIfMissingTexture(selection, key);
    target.setTexture(key, frame);
  }

  bindTexture(
    target: PhaserImageLike,
    selection: AiAssetSelection | string,
    options: AiAssetBindTextureOptions = {}
  ): AiAssetTextureBinding {
    const binding: StoredTextureBinding = {
      target,
      selection,
      frame: options.frame,
      targetAssetId: this.resolveAssetId(selection),
      destroy: () => {
        this.textureBindings.delete(binding);
      }
    };

    this.textureBindings.add(binding);

    if (options.setInitialTexture !== false) {
      this.setTexture(target, selection, options.frame);
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
    const asset = this.previewAssets.get(animationSelection.assetId)
      ?? this.manifest.assets[animationSelection.assetId];
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

  playTilesetAnimation(
    target: AiAssetAnimationPlaybackTarget,
    selection: AiAssetSelection | string,
    tileFrame: number,
    animationKey: string,
    options: AiAssetPlayTilesetAnimationOptions = {}
  ): AiAssetTilesetAnimationPlayback {
    const resolvedSelection = this.withTarget(selection);
    const assetId = this.resolveAssetId(resolvedSelection);
    const resolved = resolveAiAsset(this.manifest, resolvedSelection);
    const binding: StoredTilesetAnimationBinding = {
      target,
      selection: resolvedSelection,
      targetAssetId: assetId,
      tileFrame,
      animationKey,
      options
    };
    this.tilesetAnimationBindings.add(binding);
    const preview = this.previewTilesetAnimations.get(
      this.tilesetAnimationPreviewKey(assetId, animationKey)
    );
    const previewPlayback = preview
      ? this.applyTilesetAnimationPreview(assetId, preview, [binding], false)
      : undefined;

    if (previewPlayback) {
      return {
        ...previewPlayback,
        destroy: () => {
          this.tilesetAnimationBindings.delete(binding);
        }
      };
    }

    const created = createAiTilesetAnimation(
      this.scene,
      this.manifest,
      resolvedSelection,
      tileFrame,
      animationKey
    );

    if (!created) {
      target.stop?.();
      target.setTexture(this.key(resolvedSelection), tileFrame);
      return {
        assetId,
        tileFrame,
        durationMs: 0,
        destroy: () => {
          this.tilesetAnimationBindings.delete(binding);
        }
      };
    }

    target.play(
      options.randomFrame
        ? { key: created.animationKey, randomFrame: true }
        : created.animationKey,
      options.forceRestart ? false : true
    );

    return {
      assetId: resolved.asset.id,
      animation: created.animation,
      animationKey: created.animationKey,
      tileFrame,
      durationMs: created.durationMs,
      destroy: () => {
        this.tilesetAnimationBindings.delete(binding);
      }
    };
  }

  applyAssetTexture(assetId: string, textureKey: string, asset: AiAssetDefinition): void {
    if (!isTextureAsset(asset)) return;

    for (const binding of this.textureBindings) {
      if (this.bindingMatchesAsset(binding, assetId)) {
        // A tileset binding without an explicit frame may represent any tile.
        // Avoid silently collapsing it to frame zero during preview/promotion.
        if (asset.kind === "tileset" && binding.frame === undefined) continue;
        binding.target.stop?.();
        binding.target.setTexture(textureKey, binding.frame);
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
    for (const binding of this.tilesetAnimationBindings) {
      binding.targetAssetId = this.resolveAssetId(binding.selection);
    }
  }

  designerCallbacks(): AiAssetRuntimeDesignerCallbacks {
    return {
      onPreview: (assetId, textureKey, asset) => {
        this.previewTextureKeys.set(assetId, textureKey);
        this.previewAssets.set(assetId, asset);
        this.refreshAssetAnimations(assetId, textureKey, asset);
        this.applyAssetTexture(assetId, textureKey, asset);
        this.pauseTilesetAnimations(assetId, textureKey);
      },
      onTilesetAnimationPreview: (assetId, animationKey, textureKeys, asset) => {
        this.previewTilesetAnimation(assetId, animationKey, textureKeys, asset);
      },
      onAssetReady: (assetId, textureKey, asset) => {
        this.previewTextureKeys.delete(assetId);
        this.previewAssets.delete(assetId);
        this.clearTilesetAnimationPreviews(assetId);
        this.refreshAssetAnimations(assetId, textureKey, asset);
        this.applyAssetTexture(assetId, textureKey, asset);
        this.resumeTilesetAnimations(assetId, asset);
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

  private refreshAssetAnimations(
    assetId: string,
    textureKey: string,
    asset: AiAssetDefinition
  ): void {
    if (!asset.animations?.length || !this.scene.anims) return;

    for (const animation of asset.animations) {
      this.scene.anims.remove?.(animation.key);
    }
    createAiAnimations(this.scene, this.manifest, assetId, {
      asset,
      textureKey,
      onFrameTransforms: "ignore"
    });
  }

  private pauseTilesetAnimations(assetId: string, textureKey: string): void {
    for (const binding of this.tilesetAnimationBindings) {
      if (binding.targetAssetId !== assetId) continue;
      binding.target.stop?.();
      binding.target.setTexture(textureKey, binding.tileFrame);
    }
  }

  private previewTilesetAnimation(
    assetId: string,
    animationKey: string,
    textureKeys: string[],
    asset: AiAssetDefinition
  ): void {
    const previewKey = this.tilesetAnimationPreviewKey(assetId, animationKey);
    const previous = this.previewTilesetAnimations.get(previewKey);
    if (previous) this.removeTilesetAnimationPreviewAnimations(previous);

    const preview = {
      animationKey,
      textureKeys: [...textureKeys],
      asset,
      installedAnimationKeys: new Set<string>()
    };
    this.previewTilesetAnimations.set(previewKey, preview);
    this.applyTilesetAnimationPreview(
      assetId,
      preview,
      [...this.tilesetAnimationBindings],
      true
    );
  }

  private applyTilesetAnimationPreview(
    assetId: string,
    preview: StoredTilesetAnimationPreview,
    bindings: StoredTilesetAnimationBinding[],
    replaceAnimations: boolean
  ): Omit<AiAssetTilesetAnimationPlayback, "destroy"> | undefined {
    const animation = preview.asset.tileset?.animations?.find((candidate) => (
      candidate.key === preview.animationKey
    ));
    if (!animation || !this.scene.anims || preview.textureKeys.length === 0) return undefined;

    const matching = bindings.filter((binding) => (
      binding.targetAssetId === assetId &&
      binding.animationKey === preview.animationKey
    ));
    const bindingsByFrame = new Map<number, StoredTilesetAnimationBinding[]>();
    for (const binding of matching) {
      const frameBindings = bindingsByFrame.get(binding.tileFrame) ?? [];
      frameBindings.push(binding);
      bindingsByFrame.set(binding.tileFrame, frameBindings);
    }

    for (const [tileFrame, frameBindings] of bindingsByFrame) {
      const key = aiTilesetAnimationKey(assetId, preview.animationKey, tileFrame);
      const animationExists = this.scene.anims.exists?.(key);
      if (
        replaceAnimations ||
        !preview.installedAnimationKeys.has(key) ||
        animationExists === false
      ) {
        if (animationExists !== false) this.scene.anims.remove?.(key);
        this.scene.anims.create({
          key,
          frames: preview.textureKeys.map((textureKey, index) => ({
            key: textureKey,
            frame: tileFrame,
            duration: animation.frameTimings?.[index]?.delayMs
          })),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        preview.installedAnimationKeys.add(key);
      }

      for (const binding of frameBindings) {
        binding.target.stop?.();
        binding.target.play(
          binding.options.randomFrame
            ? { key, randomFrame: true }
            : key,
          binding.options.forceRestart ? false : true
        );
      }
    }

    const firstBinding = matching[0];
    if (!firstBinding) return undefined;
    return {
      assetId,
      animation,
      animationKey: aiTilesetAnimationKey(
        assetId,
        preview.animationKey,
        firstBinding.tileFrame
      ),
      tileFrame: firstBinding.tileFrame,
      durationMs: tilesetAnimationDurationMs(animation)
    };
  }

  private tilesetAnimationPreviewKey(assetId: string, animationKey: string): string {
    return `${assetId}\u0000${animationKey}`;
  }

  private clearTilesetAnimationPreviews(assetId: string): void {
    const prefix = `${assetId}\u0000`;
    for (const [key, preview] of this.previewTilesetAnimations) {
      if (!key.startsWith(prefix)) continue;
      this.removeTilesetAnimationPreviewAnimations(preview);
      this.previewTilesetAnimations.delete(key);
    }
  }

  private removeTilesetAnimationPreviewAnimations(
    preview: StoredTilesetAnimationPreview
  ): void {
    for (const key of preview.installedAnimationKeys) {
      this.scene.anims?.remove?.(key);
    }
    preview.installedAnimationKeys.clear();
  }

  private resumeTilesetAnimations(assetId: string, asset: AiAssetDefinition): void {
    const previewManifest: AiAssetManifest = {
      ...this.manifest,
      assets: {
        ...this.manifest.assets,
        [assetId]: asset
      }
    };

    const bindingGroups = new Map<string, StoredTilesetAnimationBinding[]>();
    for (const binding of this.tilesetAnimationBindings) {
      if (binding.targetAssetId !== assetId) continue;
      const groupKey = this.canonicalTilesetAnimationKey(previewManifest, binding);
      const group = bindingGroups.get(groupKey) ?? [];
      group.push(binding);
      bindingGroups.set(groupKey, group);
    }

    for (const [animationKey, bindings] of bindingGroups) {
      const binding = bindings[0]!;
      for (const groupedBinding of bindings) groupedBinding.target.stop?.();
      if (this.scene.anims?.exists?.(animationKey) !== false) {
        this.scene.anims?.remove?.(animationKey);
      }
      const refreshed = createAiTilesetAnimation(
        this.scene,
        previewManifest,
        binding.selection,
        binding.tileFrame,
        binding.animationKey
      );
      if (!refreshed) continue;
      for (const groupedBinding of bindings) {
        groupedBinding.target.play(
          groupedBinding.options.randomFrame
            ? { key: refreshed.animationKey, randomFrame: true }
            : refreshed.animationKey,
          groupedBinding.options.forceRestart ? false : true
        );
      }
    }
  }

  private canonicalTilesetAnimationKey(
    manifest: AiAssetManifest,
    binding: StoredTilesetAnimationBinding
  ): string {
    const resolved = resolveAiAsset(manifest, this.withTarget(binding.selection));
    const selection = resolved.versionName === resolved.asset.activeVersion
      ? resolved.asset.id
      : { assetId: resolved.asset.id, versionName: resolved.versionName };
    return aiTilesetAnimationKey(selection, binding.animationKey, binding.tileFrame);
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
  return asset.kind === "image"
    || asset.kind === "spritesheet"
    || asset.kind === "animation"
    || asset.kind === "tileset";
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
