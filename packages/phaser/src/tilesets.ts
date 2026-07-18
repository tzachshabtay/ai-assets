import {
  resolveAiAsset,
  type AiAssetManifest,
  type AiAssetSelection,
  type AiTilesetAnimation
} from "@ai-game-assets/core";
import {
  aiTextureKey,
  aiTilesetAnimationKey,
  aiTilesetAnimationTextureKey
} from "./keys.js";
import type { PhaserSceneLike } from "./phaser-types.js";

export type CreatedAiTilesetAnimation = {
  assetId: string;
  animation: AiTilesetAnimation;
  animationKey: string;
  tileFrame: number;
  durationMs: number;
};

export function createAiTilesetAnimation(
  scene: PhaserSceneLike,
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string,
  tileFrame: number,
  animationKey: string
): CreatedAiTilesetAnimation | undefined {
  if (!scene.anims) {
    throw new Error("The provided Phaser scene does not expose an animation manager.");
  }

  const resolved = resolveAiAsset(manifest, selection);
  if (resolved.asset.kind !== "tileset" || !resolved.asset.tileset) {
    throw new Error(`AI asset "${resolved.asset.id}" is not a tileset.`);
  }

  const tileCount = resolved.asset.tileset.tileCount
    ?? resolved.asset.tileset.columns * resolved.asset.tileset.rows;
  if (!Number.isInteger(tileFrame) || tileFrame < 0 || tileFrame >= tileCount) {
    throw new Error(
      `Tile frame ${tileFrame} is outside AI tileset "${resolved.asset.id}" (0-${tileCount - 1}).`
    );
  }

  const animation = resolved.asset.tileset.animations?.find((candidate) => (
    candidate.key === animationKey
  ));
  const files = resolved.version.tilesetAnimations?.[animationKey]?.files;
  if (!animation || !files?.length) return undefined;

  const keySelection = resolvedKeySelection(resolved.asset.id, resolved.asset.activeVersion, resolved.versionName);
  const key = aiTilesetAnimationKey(keySelection, animation.key, tileFrame);
  const defaultDelay = Math.round(1000 / animation.frameRate);
  const frames = files.map((_file, index) => ({
    key: aiTilesetAnimationTextureKey(keySelection, animation.key, index),
    frame: tileFrame,
    duration: animation.frameTimings?.[index]?.delayMs
  }));

  if (!scene.anims.exists?.(key)) {
    scene.anims.create({
      key,
      frames,
      frameRate: animation.frameRate,
      repeat: animation.repeat ?? -1
    });
  }

  return {
    assetId: resolved.asset.id,
    animation,
    animationKey: key,
    tileFrame,
    durationMs: frames.reduce((total, frame) => total + (frame.duration ?? defaultDelay), 0)
  };
}

export function tilesetAnimationDurationMs(
  animation: AiTilesetAnimation | undefined
): number {
  if (!animation) return 0;
  const defaultDelay = Math.round(1000 / animation.frameRate);
  return Array.from({ length: animation.frameCount }, (_unused, index) => (
    animation.frameTimings?.[index]?.delayMs ?? defaultDelay
  )).reduce((total, delay) => total + delay, 0);
}

export function tilesetBaseTextureKey(
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string
): string {
  const resolved = resolveAiAsset(manifest, selection);
  return aiTextureKey(
    resolvedKeySelection(resolved.asset.id, resolved.asset.activeVersion, resolved.versionName)
  );
}

function resolvedKeySelection(
  assetId: string,
  activeVersion: string,
  versionName: string
): AiAssetSelection {
  return {
    assetId,
    versionName: versionName === activeVersion ? undefined : versionName
  };
}
