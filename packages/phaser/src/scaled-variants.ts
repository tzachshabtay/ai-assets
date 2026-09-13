import {
  selectScaledVariant,
  type AiAssetDefinition,
  type AiAssetScaledSource,
  type AiAssetVersion,
} from "@ai-game-assets/core";
import type { PhaserSceneLike, PhaserImageLike } from "./phaser-types.js";

export function aiScaledVariantTextureKey(
  baseKey: string,
  source: AiAssetScaledSource,
): string {
  return source.id ? `${baseKey}::scaled::${source.file}` : baseKey;
}

export function loadAiScaledVariants(
  scene: PhaserSceneLike,
  asset: AiAssetDefinition,
  version: AiAssetVersion,
  baseKey: string,
  baseUrl?: string,
): void {
  for (const variant of Object.values(version.scaledVariants ?? {})) {
    const key = aiScaledVariantTextureKey(baseKey, variant);
    const url = scaledVariantUrl(baseUrl, variant.file);
    if (variant.frameGrid) scene.load.spritesheet(key, url, variant.frameGrid);
    else scene.load.image(key, url);
  }
}

export function scaledVariantUrl(
  baseUrl: string | undefined,
  file: string,
): string {
  if (!baseUrl || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(file)) return file;
  return `${baseUrl.replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}

export type AiScaledTextureTarget = PhaserImageLike & {
  displayWidth: number;
  displayHeight: number;
  texture?: { key: string };
  frame?: { name: string | number };
  setDisplaySize(width: number, height: number): unknown;
  scaleX?: number;
  scaleY?: number;
  getWorldTransformMatrix?(): { a: number; b: number; c: number; d: number };
};

/** Preserve world size and frame while choosing a source for actual screen-pixel coverage. */
export function applyAiScaledVariant(
  scene: PhaserSceneLike,
  target: AiScaledTextureTarget,
  asset: AiAssetDefinition,
  version: AiAssetVersion,
  baseKey: string,
  options: { width?: number; height?: number; frame?: string | number } = {},
): AiAssetScaledSource | undefined {
  const sceneView = scene as PhaserSceneLike & {
    cameras?: { main?: { zoom: number; zoomX?: number; zoomY?: number } };
    scale?: { gameSize?: { width: number; height: number } };
    game?: {
      canvas?: {
        width: number;
        height: number;
        getBoundingClientRect(): { width: number; height: number };
      };
    };
  };
  const canvas = sceneView.game?.canvas,
    rect = canvas?.getBoundingClientRect();
  const camera = sceneView.cameras?.main,
    dpr = globalThis.devicePixelRatio || 1;
  const world = target.getWorldTransformMatrix?.();
  const parentX =
    world && target.scaleX
      ? Math.hypot(world.a, world.b) / Math.abs(target.scaleX)
      : 1;
  const parentY =
    world && target.scaleY
      ? Math.hypot(world.c, world.d) / Math.abs(target.scaleY)
      : 1;
  const gameSize = sceneView.scale?.gameSize ?? canvas;
  const width =
    options.width ??
    Math.abs(target.displayWidth) *
      parentX *
      (camera?.zoomX ?? camera?.zoom ?? 1) *
      (rect && gameSize?.width ? rect.width / gameSize.width : 1) *
      dpr;
  const height =
    options.height ??
    Math.abs(target.displayHeight) *
      parentY *
      (camera?.zoomY ?? camera?.zoom ?? 1) *
      (rect && gameSize?.height ? rect.height / gameSize.height : 1) *
      dpr;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height))
    return;
  const source = selectScaledVariant(
    asset,
    { width, height },
    {
      version,
      available: (source) =>
        !scene.textures ||
        scene.textures.exists(aiScaledVariantTextureKey(baseKey, source)),
    },
  );
  if (!source) return;
  const key = aiScaledVariantTextureKey(baseKey, source),
    frame = options.frame ?? target.frame?.name;
  if (
    target.texture?.key !== key ||
    (options.frame !== undefined && target.frame?.name !== options.frame)
  ) {
    const displayWidth = target.displayWidth,
      displayHeight = target.displayHeight;
    target.setTexture(key, frame);
    target.setDisplaySize(displayWidth, displayHeight);
  }
  return source;
}
