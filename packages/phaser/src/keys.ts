import type { AiAssetSelection } from "@ai-game-assets/core";

export function aiTextureKey(selection: AiAssetSelection | string): string {
  if (typeof selection === "string") {
    return selection;
  }

  return selection.versionName
    ? `${selection.assetId}#${selection.versionName}`
    : selection.assetId;
}
