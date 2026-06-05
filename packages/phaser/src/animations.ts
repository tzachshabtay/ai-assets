import {
  resolveAiAsset,
  type AiAssetManifest,
  type AiAssetSelection
} from "@ai-game-assets/core";
import { aiTextureKey } from "./keys.js";
import type { PhaserSceneLike } from "./phaser-types.js";

export function createAiAnimations(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string
): void {
  if (!scene.anims) {
    throw new Error("The provided Phaser scene does not expose an animation manager.");
  }

  const assetId = typeof selection === "string" ? selection : selection.assetId;
  const unresolvedAsset = manifest.assets[assetId];
  const resolved = unresolvedAsset && Object.keys(unresolvedAsset.versions).length === 0
    ? { asset: unresolvedAsset, versionName: "" }
    : resolveAiAsset(manifest, selection);
  const animations = resolved.asset.animations ?? [];
  const textureKey = aiTextureKey({
    assetId: resolved.asset.id,
    versionName: resolved.versionName === resolved.asset.activeVersion
      ? undefined
      : resolved.versionName
  });

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
