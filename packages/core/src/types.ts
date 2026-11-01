export type AiLipSyncShape = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type AiLipSyncTrack = {
  schemaVersion: 1;
  source: 'text' | 'rhubarb' | 'manual';
  text: string;
  language: string;
  duration: number;
  cues: Array<{ start: number; end: number; shape: AiLipSyncShape }>;
  sourceFile?: string;
  audioHash?: string;
  analyzer?: string;
};
export type AiMouthSet = {
  frames: Record<AiLipSyncShape, number>;
  /** Stored per version so uploaded sheets can use different layouts safely. */
  frameGrid?: AiAssetFrameGrid;
  sourceAssetId?: string;
  sourceVersion?: string;
  editRegion?: { x: number; y: number; width: number; height: number };
};
export type AiPortraitRegion = { x: number; y: number; width: number; height: number };
export type AiPortraitEyePose = 'open' | 'half' | 'closed' | 'left' | 'right';
/** Eye sheets use full portrait cells, sharing the base portrait's registration. */
export type AiPortraitEyes = {
  assetId: string;
  region: AiPortraitRegion;
  frames: Record<AiPortraitEyePose, number>;
  blink?: boolean;
  gaze?: boolean;
  /** Seconds between blinks, and total seconds for closing and reopening. */
  blinkInterval?: [number, number];
  blinkDuration?: number;
  gazeInterval?: [number, number];
};
export type AiLipSyncSettings = {
  enabled: boolean;
  voiceAssetId: string;
  mouthAssetId?: string;
  /** Composite a fixed base with only the mouth/jaw editRegion from each pose. */
  layered?: boolean;
  eyes?: AiPortraitEyes;
  language: string;
  wordsPerMinute?: number;
  pronunciations?: Record<string, string>;
};

export type AiAssetKind = "image" | "spritesheet" | "animation" | "tileset" | "collection" | "sound" | "music" | "voice" | "voice-line";

export type AiAssetBackground = "transparent" | "opaque" | "auto";

export type AiAssetQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

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
  settings?: AiAssetGenerationSettings;
};

/**
 * A non-destructive transform applied to one tile in its own pixel coordinate
 * space. Tiles are scaled around their center, then offset, and clipped to the
 * tile cell when the displayed sheet is composed.
 */
export type AiTilesetTileTransform = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
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

/** A resolution of one immutable source version, with unchanged frame ordering. */
export type AiAssetScaledVariant = {
  id: string;
  dimensions: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
  file: string;
  method: "nearest" | "resample" | "ai-upscale" | "touch-up";
  sourceFile: string;
  createdAt: string;
};

export type AiAssetVersion = {
  /** Immutable transcript of the audio, separate from subsequently edited script text. */
  recordedText?: string;
  lipSyncTrack?: AiLipSyncTrack;
  mouthSet?: AiMouthSet;
  scaledVariants?: Record<string, AiAssetScaledVariant>;
  scaledVariantSource?: { dimensions: AiAssetDimensions; frameGrid?: AiAssetFrameGrid };
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
  /** Untouched source sheet used to resume non-destructive per-tile edits. */
  tilesetSourceFile?: string;
  /** One transform per usable tile in the source sheet. */
  tilesetTransforms?: AiTilesetTileTransform[];
};

export type AiAssetTarget = {
  id: string;
  label?: string;
  variants: Record<string, string>;
};

export type AiAssetDefinition = {
  lipSync?: AiLipSyncSettings;
  mouthSet?: AiMouthSet;
  lipSyncTrack?: AiLipSyncTrack;
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
