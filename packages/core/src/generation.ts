import type {
  AiAssetDefinition,
  AiAudioPlaybackSettings,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings,
  AiAssetGenerationSettings,
  AiAssetVersion
} from "./types.js";

export type CreateVersionInput = {
  name: string;
  file: string;
  prompt?: string;
  model?: string;
  revisedPrompt?: string;
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
  parentVersion?: string;
  notes?: string;
  createdAt?: string;
};

export function createAiAssetVersion(
  asset: AiAssetDefinition,
  input: CreateVersionInput
): AiAssetVersion {
  return {
    name: input.name,
    file: input.file,
    prompt: input.prompt ?? asset.prompt,
    createdAt: input.createdAt ?? new Date().toISOString(),
    model: input.model ?? input.settings?.model ?? asset.settings?.model,
    revisedPrompt: input.revisedPrompt,
    settings: {
      ...asset.settings,
      ...input.settings
    },
    audioSettings: {
      ...asset.audioSettings,
      ...input.audioSettings
    },
    audioPlayback: {
      ...asset.audioPlayback,
      ...input.audioPlayback
    },
    voiceSettings: {
      ...asset.voiceSettings,
      ...input.voiceSettings
    },
    durationSeconds: input.durationSeconds ?? input.audioSettings?.durationSeconds,
    parentVersion: input.parentVersion,
    notes: input.notes
  };
}

export function addVersion(
  asset: AiAssetDefinition,
  versionName: string,
  version: AiAssetVersion,
  options: { activate?: boolean } = {}
): AiAssetDefinition {
  return {
    ...asset,
    activeVersion: options.activate ? versionName : asset.activeVersion,
    versions: {
      ...asset.versions,
      [versionName]: version
    }
  };
}
