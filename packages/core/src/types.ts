export type AiAssetKind = "image" | "spritesheet" | "animation" | "collection" | "sound" | "music" | "voice" | "voice-line";

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
};

export type AiAssetSelection = {
  assetId: string;
  versionName?: string;
};

export type ResolvedAiAsset = {
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
};
