import type {
  AiAssetDefinition,
  AiAudioFormat,
  AiAudioGenerationSettings
} from "@ai-game-assets/core";
import type { GeneratedAssetOption } from "./provider.js";

export type GenerateAudioAssetRequest = {
  asset: AiAssetDefinition;
  prompt?: string;
  count?: number;
  audioSettings?: AiAudioGenerationSettings;
};

export type AiAudioProvider = {
  generate(request: GenerateAudioAssetRequest): Promise<GeneratedAssetOption[]>;
};

export type ElevenLabsAudioProviderOptions = {
  apiKey?: string;
  sfxModel?: string;
  musicModel?: string;
  outputFormat?: string;
  promptInfluence?: number;
};

export function createElevenLabsAudioProvider(
  options: ElevenLabsAudioProviderOptions = {}
): AiAudioProvider {
  return {
    async generate(request) {
      const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;

      if (!apiKey) {
        throw new Error(
          "ELEVENLABS_API_KEY is required to generate audio assets. Image generation can still be used without it."
        );
      }

      const count = request.count ?? 1;
      const generated: GeneratedAssetOption[] = [];

      for (let index = 0; index < count; index += 1) {
        generated.push(await generateElevenLabsAudio(apiKey, request, options));
      }

      return generated;
    }
  };
}

async function generateElevenLabsAudio(
  apiKey: string,
  request: GenerateAudioAssetRequest,
  options: ElevenLabsAudioProviderOptions
): Promise<GeneratedAssetOption> {
  const audioSettings = {
    ...request.asset.audioSettings,
    ...request.audioSettings
  };
  const prompt = request.prompt ?? request.asset.prompt;
  const format = audioSettings.format ?? "mp3";
  const outputFormat = options.outputFormat ?? elevenLabsOutputFormat(format);
  const isMusic = request.asset.kind === "music";
  const endpoint = isMusic
    ? "https://api.elevenlabs.io/v1/music"
    : "https://api.elevenlabs.io/v1/sound-generation";
  const url = new URL(endpoint);
  url.searchParams.set("output_format", outputFormat);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify(isMusic
      ? {
          prompt,
          music_length_ms: audioSettings.durationSeconds
            ? Math.round(audioSettings.durationSeconds * 1000)
            : undefined,
          model_id: audioSettings.model ?? options.musicModel ?? "music_v1",
          force_instrumental: true
        }
      : {
          text: prompt,
          duration_seconds: audioSettings.durationSeconds,
          loop: audioSettings.loop,
          prompt_influence: options.promptInfluence ?? 0.3,
          model_id: audioSettings.model ?? options.sfxModel ?? "eleven_text_to_sound_v2"
        })
  });

  if (!response.ok) {
    throw new Error(
      `ElevenLabs audio generation failed (${response.status}): ${await response.text()}`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  return {
    image: bytes,
    mimeType: mimeTypeForAudioFormat(format),
    prompt,
    model: audioSettings.model ?? (isMusic ? options.musicModel ?? "music_v1" : options.sfxModel ?? "eleven_text_to_sound_v2"),
    audioSettings: {
      provider: "elevenlabs",
      ...audioSettings,
      format
    },
    durationSeconds: audioSettings.durationSeconds
  };
}

function elevenLabsOutputFormat(format: AiAudioFormat): string {
  switch (format) {
    case "wav":
      return "pcm_44100";
    case "opus":
      return "opus_48000_32";
    case "pcm":
      return "pcm_44100";
    case "ogg":
      return "mp3_44100_128";
    case "mp3":
    default:
      return "mp3_44100_128";
  }
}

function mimeTypeForAudioFormat(format: AiAudioFormat): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "pcm":
      return "audio/pcm";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}
