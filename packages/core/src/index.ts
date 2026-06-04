export type {
  AiAssetAnimation,
  AiAssetAnimationFrameTiming,
  AiAssetBackground,
  AiAssetDefinition,
  AiAssetDimensions,
  AiAssetFormat,
  AiAssetFrameGrid,
  AiAssetGenerationSettings,
  AiAssetKind,
  AiAssetManifest,
  AiAssetQuality,
  AiAssetSelection,
  AiAssetStyleGuide,
  AiAssetStyleGuideImage,
  AiAssetVersion,
  ResolvedAiAsset
} from "./types.js";

export {
  assertAsset,
  assertManifest,
  defineAiAsset,
  defineAiAssets,
  getActiveVersion,
  resolveAiAsset,
  withActiveVersion
} from "./manifest.js";

export {
  addVersion,
  createAiAssetVersion
} from "./generation.js";

export type { CreateVersionInput } from "./generation.js";
