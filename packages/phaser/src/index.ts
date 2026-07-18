export type {
  LoadAiAssetSetOptions,
  LoadAiAssetOptions
} from "./loader.js";

export {
  loadAiAsset,
  loadAiAssetSet,
  loadAiAudioAsset,
  loadAiAudioAssets,
  loadAiAssets
} from "./loader.js";

export {
  aiAssetAnimationSize,
  animationDurationMs,
  animationHasFrameTransforms,
  createAiAnimations
} from "./animations.js";

export type {
  CreateAiAnimationsFrameTransformHandling,
  CreateAiAnimationsOptions
} from "./animations.js";

export type {
  AiAssetFrameTransformBinding,
  AiAssetFrameTransformOptions,
  AiAssetFrameTransformSize,
  AiAssetFrameTransformTarget
} from "./frame-transforms.js";

export {
  applyAiAnimationFrameTransform,
  bindAiAnimationFrameTransforms
} from "./frame-transforms.js";

export type {
  EnsureMissingAiAssetFirstDraftsOptions,
  EnsureMissingAiAssetFirstDraftsProgress,
  EnsureMissingAiAssetFirstDraftsResult
} from "./first-drafts.js";

export { ensureMissingAiAssetFirstDrafts } from "./first-drafts.js";

export type {
  AiAssetAnimationPlayback,
  AiAssetAnimationPlaybackTarget,
  AiAssetBindTextureOptions,
  AiAssetPlayAnimationOptions,
  AiAssetPlayTilesetAnimationOptions,
  AiAssetRuntimeDesignerCallbacks,
  AiAssetRuntimeOptions,
  AiAssetTilesetAnimationPlayback,
  AiAssetTextureBinding
} from "./runtime.js";

export { AiAssetRuntime } from "./runtime.js";

export {
  aiTextureKey,
  aiTilesetAnimationKey,
  aiTilesetAnimationTextureKey
} from "./keys.js";

export type { CreatedAiTilesetAnimation } from "./tilesets.js";

export {
  createAiTilesetAnimation,
  tilesetAnimationDurationMs,
  tilesetBaseTextureKey
} from "./tilesets.js";

export type {
  GenerateDebugOptionsRequest,
  GenerateTilesetAnimationRequest,
  DebugStyleGuideDraft,
  GeneratedDebugOption,
  GeneratedTilesetAnimationCandidate,
  SaveDebugOptionRequest,
  SaveDebugOptionResult,
  SaveTilesetAnimationRequest,
  SaveTilesetAnimationResult
} from "./debug-client.js";

export { AiAssetDebugClient } from "./debug-client.js";

export type {
  DesignerTilesetAnimation,
  DesignerTilesetMetadata,
  TilesetBaseMixPlan,
  TilesetBaseMixResult,
  TilesetMixSelection,
  TilesetAnimationMixResult
} from "./tileset-dialog.js";

export {
  createMixedTilesetOption,
  isDesignerTilesetAsset,
  openTilesetBaseMixerDialog,
  openTilesetAnimationMixerDialog,
  planTilesetBaseMix,
  tilesetAnimationForKey,
  tilesetMetadataForAsset
} from "./tileset-dialog.js";

export type {
  AiAssetDesigner,
  AiAssetDesignerOptions,
  AiAssetDesignerSceneLike
} from "./designer.js";

export { installAiAssetDesigner } from "./designer.js";

export type {
  PhaserAnimationsLike,
  PhaserImageLike,
  PhaserLoaderLike,
  PhaserSceneLike,
  PhaserTextureManagerLike
} from "./phaser-types.js";
