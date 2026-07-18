import type { AiAssetSelection } from "@ai-game-assets/core";

export function aiTextureKey(selection: AiAssetSelection | string): string {
  if (typeof selection === "string") {
    return selection;
  }

  return selection.versionName
    ? `${selection.assetId}#${selection.versionName}`
    : selection.assetId;
}

export function aiTilesetAnimationTextureKey(
  selection: AiAssetSelection | string,
  animationKey: string,
  sheetFrame: number
): string {
  return `${aiTextureKey(selection)}::tileset:${encodeURIComponent(animationKey)}:${sheetFrame}`;
}

export function aiTilesetAnimationKey(
  selection: AiAssetSelection | string,
  animationKey: string,
  tileFrame: number
): string {
  return `${aiTextureKey(selection)}::tile-animation:${encodeURIComponent(animationKey)}:${tileFrame}`;
}
