export type AiAssetKind = "image" | "spritesheet" | "animation" | "tileset" | "collection" | "sound" | "music" | "voice" | "voice-line";

export type AiAssetBackground = "transparent" | "opaque" | "auto";

export type AiAssetQuality = "low" | "medium" | "high" | "auto";

export type AiAssetFormat = "png" | "webp" | "jpg" | "svg";

export type AiAudioFormat = "mp3" | "wav" | "ogg" | "opus" | "pcm";

export type AiAudioKind = "sfx" | "music";

export type AiAssetDimensions = {
  width: number;
  height: number;
};

export type AiAssetFrameGrid = {
  frameCount?: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  margin?: number;
  spacing?: number;
};

export type AiAssetAnimation = {
  key: string;
  frames: number[];
  frameRate: number;
  repeat?: number;
  prompt?: string;
  frameTimings?: AiAssetAnimationFrameTiming[];
};

export type AiAssetAnimationFrameTiming = {
  delayMs?: number;
  offsetX?: number;
  offsetY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  tag?: string;
};

export type AiTilesetAnimationFrameTiming = {
  delayMs?: number;
};

export type AiTilesetAnimation = {
  key: string;
  /** @deprecated Prefer a prompt for each entry in `tiles`. */
  prompt?: string;
  tiles?: AiTilesetTile[];
  frameCount: number;
  frameRate: number;
  repeat?: number;
  frameTimings?: AiTilesetAnimationFrameTiming[];
};

export type AiTilesetTile = {
  prompt: string;
};

export type AiAssetTileset = {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  tileCount?: number;
  margin?: number;
  spacing?: number;
  tiles?: AiTilesetTile[];
  animations?: AiTilesetAnimation[];
};

export type AiTilesetAnimationVersion = {
  files: string[];
};

export type AiAssetLinkedAnimation = {
  label: string;
  assetId: string;
};

export type AiAssetStyleGuideImage = {
  name: string;
  file: string;
  mimeType?: string;
};

export type AiAssetStyleGuide = {
  prompt?: string;
  images?: AiAssetStyleGuideImage[];
};

export type AiAssetGenerationSettings = {
  model?: string;
  size?: string;
  quality?: AiAssetQuality;
  background?: AiAssetBackground;
  format?: AiAssetFormat;
  frameAlignment?: "center" | "none";
  moderation?: "auto" | "low";
  referenceAssetIds?: string[];
};

export type AiAudioGenerationSettings = {
  provider?: "elevenlabs" | string;
  model?: string;
  format?: AiAudioFormat;
  durationSeconds?: number;
  loop?: boolean;
};

export type AiVoiceGenerationSettings = {
  provider?: "elevenlabs" | string;
  voiceAssetId?: string;
  voiceId?: string;
  generatedVoiceId?: string;
  previewText?: string;
  text?: string;
  direction?: string;
  model?: string;
  loudness?: number;
  seed?: number;
};

export type AiAudioPlaybackSettings = {
  volume?: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  playbackRate?: number;
  pitchSemitones?: number;
  loop?: boolean;
  reverse?: boolean;
  reverb?: {
    enabled?: boolean;
    amount?: number;
    decaySeconds?: number;
  };
  delay?: {
    enabled?: boolean;
    timeSeconds?: number;
    feedback?: number;
    mix?: number;
  };
  filter?: {
    type?: "none" | "lowpass" | "highpass";
    frequencyHz?: number;
  };
};

export type AiAssetVersion = {
  name: string;
  file: string;
  prompt: string;
  createdAt: string;
  model?: string;
  revisedPrompt?: string;
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
  parentVersion?: string;
  notes?: string;
  tilesetAnimations?: Record<string, AiTilesetAnimationVersion>;
};

export type AiAssetTarget = {
  id: string;
  label?: string;
  variants: Record<string, string>;
};

export type AiAssetDefinition = {
  id: string;
  kind: AiAssetKind;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  dimensions?: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
  animations?: AiAssetAnimation[];
  tileset?: AiAssetTileset;
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  linkedAnimationAssets?: Record<string, AiAssetLinkedAnimation>;
  activeVersion: string;
  versions: Record<string, AiAssetVersion>;
  tags?: string[];
};

export type AiAssetManifest = {
  schemaVersion: 1;
  assets: Record<string, AiAssetDefinition>;
  styleGuide?: AiAssetStyleGuide;
  assetPaths?: Record<string, string[]>;
  targets?: Record<string, AiAssetTarget>;
};

export type AiAssetSelection = {
  assetId: string;
  versionName?: string;
  targetId?: string;
};

export type ResolvedAiAsset = {
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
};
