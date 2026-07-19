import {
  resolveAiAsset,
  type AiAssetAnimation,
  type AiAssetAnimationFrameTiming,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetSelection
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
import type { PhaserSceneLike } from "./phaser-types.js";

export type CreateAiAnimationsFrameTransformHandling = "warn" | "ignore";

export type CreateAiAnimationsOptions = {
  onFrameTransforms?: CreateAiAnimationsFrameTransformHandling;
  asset?: AiAssetDefinition;
  textureKey?: string;
};

export function createAiAnimations(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string,
  options: CreateAiAnimationsOptions = {}
): void {
  if (!scene.anims) {
    throw new Error("The provided Phaser scene does not expose an animation manager.");
  }

  const assetId = typeof selection === "string" ? selection : selection.assetId;
  const unresolvedAsset = manifest.assets[assetId];
  const resolved = unresolvedAsset && Object.keys(unresolvedAsset.versions).length === 0
    ? { asset: unresolvedAsset, versionName: "" }
    : resolveAiAsset(manifest, selection);
  const asset = options.asset ?? resolved.asset;
  const animations = asset.animations ?? [];
  const textureKey = options.textureKey ?? aiTextureKey({
    assetId: resolved.asset.id,
    versionName: resolved.versionName === resolved.asset.activeVersion
      ? undefined
      : resolved.versionName
  });

  warnIfUnhandledFrameTransforms(asset, animations, options);

  for (const animation of animations) {
    const frames = scene.anims.generateFrameNumbers(textureKey, {
      frames: animation.frames
    });

    scene.anims.create({
      key: animation.key,
      frames: Array.isArray(frames)
        ? frames.map((frame, index) => ({
            ...frame,
            duration: animation.frameTimings?.[index]?.delayMs
          }))
        : frames,
      frameRate: animation.frameRate,
      repeat: animation.repeat ?? -1
    });
  }
}

export function animationDurationMs(animation: AiAssetAnimation | undefined): number {
  if (!animation) return 0;

  const defaultDelay = Math.round(1000 / animation.frameRate);

  return animation.frames.reduce((total, _frame, index) => (
    total + (animation.frameTimings?.[index]?.delayMs ?? defaultDelay)
  ), 0);
}

export function animationHasFrameTransforms(animation: AiAssetAnimation | undefined): boolean {
  return Boolean(animation?.frameTimings?.some(hasFrameTransform));
}

export function aiAssetAnimationSize(asset: AiAssetDefinition | undefined): { width: number; height: number } {
  return {
    width: asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 1,
    height: asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 1
  };
}

function hasFrameTransform(timing: AiAssetAnimationFrameTiming): boolean {
  return (
    timing.offsetX !== undefined ||
    timing.offsetY !== undefined ||
    timing.scaleX !== undefined ||
    timing.scaleY !== undefined ||
    timing.rotation !== undefined
  );
}

function warnIfUnhandledFrameTransforms(
  asset: AiAssetDefinition,
  animations: AiAssetAnimation[],
  options: CreateAiAnimationsOptions
): void {
  if (options.onFrameTransforms === "ignore") return;
  if (!animations.some(animationHasFrameTransforms)) return;

  console.warn(
    `AI asset "${asset.id}" includes animation frame transform metadata. ` +
    "createAiAnimations registers Phaser frame timing only; use " +
    "AiAssetRuntime.playAnimation(...) or bindAiAnimationFrameTransforms(...) " +
    "to apply offset/scale/rotation at playback time. Pass " +
    `{ onFrameTransforms: "ignore" } to createAiAnimations to silence this warning.`
  );
}
