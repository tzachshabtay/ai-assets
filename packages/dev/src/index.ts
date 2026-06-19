export type {
  AiImageProvider,
  GenerateAssetReference,
  GeneratedAssetOption,
  GenerateAssetRequest,
  OpenAiImageProviderOptions
} from "./provider.js";

export { createOpenAiImageProvider } from "./provider.js";

export type {
  AiAudioProvider,
  ElevenLabsAudioProviderOptions,
  GenerateAudioAssetRequest
} from "./audio-provider.js";

export { createElevenLabsAudioProvider } from "./audio-provider.js";

export type {
  AssetStoreOptions,
  SaveGeneratedOptionInput,
  SaveGeneratedOptionResult,
  SaveStyleGuideInput
} from "./asset-store.js";

export {
  readManifest,
  saveGeneratedOption,
  saveStyleGuide,
  writeManifestModule,
  writeManifest
} from "./asset-store.js";

export type { AiAssetDevServerOptions } from "./server.js";

export { createAiAssetDevServer } from "./server.js";

export type { BuildManifestOptions } from "./build-manifest.js";

export {
  buildManifestModule,
  normalizeAssetUrls,
  pruneManifestForBuild,
  readManifestDirectory,
  referencedAssetFiles
} from "./build-manifest.js";
