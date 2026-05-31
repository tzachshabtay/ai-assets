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

  const resolved = resolveAiAsset(manifest, selection);
  const animations = resolved.asset.animations ?? [];
  const textureKey = aiTextureKey({
    assetId: resolved.asset.id,
    versionName: resolved.versionName === resolved.asset.activeVersion
      ? undefined
      : resolved.versionName
  });

  for (const animation of animations) {
    scene.anims.create({
      key: animation.key,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        frames: animation.frames
      }),
      frameRate: animation.frameRate,
      repeat: animation.repeat ?? -1
    });
  }
}
