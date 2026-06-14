import type {
  AiAssetDefinition,
  AiAudioFormat,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings
} from "@ai-game-assets/core";
import type { GeneratedAssetOption } from "./provider.js";

export type GenerateAudioAssetRequest = {
  asset: AiAssetDefinition;
  prompt?: string;
  count?: number;
  audioSettings?: AiAudioGenerationSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  resolveVoiceId?: (voiceAssetId: string) => string | undefined;
};

export type AiAudioProvider = {
  generate(request: GenerateAudioAssetRequest): Promise<GeneratedAssetOption[]>;
  createVoice?(request: {
    asset: AiAssetDefinition;
    option: GeneratedAssetOption;
    versionName: string;
  }): Promise<AiVoiceGenerationSettings | undefined>;
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

      if (request.asset.kind === "voice") {
        return generateElevenLabsVoicePreviews(apiKey, request, options, count);
      }

      if (request.asset.kind === "voice-line") {
        return generateElevenLabsVoiceLine(apiKey, request, options, count);
      }

      for (let index = 0; index < count; index += 1) {
        generated.push(await generateElevenLabsAudio(apiKey, request, options));
      }

      return generated;
    },
    async createVoice(request) {
      const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;

      if (!apiKey) {
        throw new Error(
          "ELEVENLABS_API_KEY is required to promote designed voices. Image generation can still be used without it."
        );
      }

      const generatedVoiceId = request.option.voiceSettings?.generatedVoiceId;

      if (!generatedVoiceId || request.option.voiceSettings?.voiceId) {
        return request.option.voiceSettings;
      }

      const voiceDescription = request.option.prompt || request.asset.prompt;
      const response = await fetch("https://api.elevenlabs.io/v1/text-to-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          voice_name: readableVoiceName(request.asset.id, request.versionName),
          voice_description: voiceDescription,
          generated_voice_id: generatedVoiceId,
          labels: {
            source: "ai-game-assets"
          }
        })
      });

      if (!response.ok) {
        throw new Error(
          `ElevenLabs voice creation failed (${response.status}): ${await response.text()}`
        );
      }

      const body = await response.json() as { voice_id?: string };

      if (!body.voice_id) {
        throw new Error("ElevenLabs voice creation did not return a voice_id.");
      }

      return {
        ...request.option.voiceSettings,
        provider: "elevenlabs",
        voiceId: body.voice_id,
        generatedVoiceId
      };
    }
  };
}

async function generateElevenLabsVoicePreviews(
  apiKey: string,
  request: GenerateAudioAssetRequest,
  options: ElevenLabsAudioProviderOptions,
  count: number
): Promise<GeneratedAssetOption[]> {
  const voiceSettings = {
    ...request.asset.voiceSettings,
    ...request.voiceSettings
  };
  const audioSettings = {
    ...request.asset.audioSettings,
    ...request.audioSettings
  };
  const format = audioSettings.format ?? "mp3";
  const outputFormat = options.outputFormat ?? elevenLabsOutputFormat(format);
  const prompt = request.prompt ?? request.asset.prompt;
  const generated: GeneratedAssetOption[] = [];
  let seed = voiceSettings.seed ?? Math.floor(Math.random() * 2_147_483_647);

  while (generated.length < count) {
    const url = new URL("https://api.elevenlabs.io/v1/text-to-voice/design");
    url.searchParams.set("output_format", outputFormat);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        voice_description: prompt,
        model_id: voiceSettings.model ?? "eleven_multilingual_ttv_v2",
        text: voiceSettings.previewText,
        auto_generate_text: !voiceSettings.previewText,
        loudness: voiceSettings.loudness,
        seed
      })
    });

    if (!response.ok) {
      throw new Error(
        `ElevenLabs voice design failed (${response.status}): ${await response.text()}`
      );
    }

    const body = await response.json() as {
      previews?: Array<{
        audio_base_64?: string;
        generated_voice_id?: string;
        media_type?: string;
        duration_secs?: number;
      }>;
      text?: string;
    };

    for (const preview of body.previews ?? []) {
      if (!preview.audio_base_64 || !preview.generated_voice_id) continue;

      generated.push({
        image: Buffer.from(preview.audio_base_64, "base64"),
        mimeType: preview.media_type || mimeTypeForAudioFormat(format),
        prompt,
        model: voiceSettings.model ?? "eleven_multilingual_ttv_v2",
        audioSettings: {
          provider: "elevenlabs",
          ...audioSettings,
          format
        },
        audioPlayback: request.asset.audioPlayback,
        voiceSettings: {
          provider: "elevenlabs",
          ...voiceSettings,
          previewText: body.text ?? voiceSettings.previewText,
          generatedVoiceId: preview.generated_voice_id
        },
        durationSeconds: preview.duration_secs
      });

      if (generated.length >= count) break;
    }

    seed += 1;
  }

  return generated;
}

async function generateElevenLabsVoiceLine(
  apiKey: string,
  request: GenerateAudioAssetRequest,
  options: ElevenLabsAudioProviderOptions,
  count: number
): Promise<GeneratedAssetOption[]> {
  const voiceSettings = {
    ...request.asset.voiceSettings,
    ...request.voiceSettings
  };
  const audioSettings = {
    ...request.asset.audioSettings,
    ...request.audioSettings
  };
  const format = audioSettings.format ?? "mp3";
  const generated: GeneratedAssetOption[] = [];
  const voiceId =
    voiceSettings.voiceId ??
    (voiceSettings.voiceAssetId ? request.resolveVoiceId?.(voiceSettings.voiceAssetId) : undefined);

  if (!voiceId) {
    throw new Error(
      `Voice line "${request.asset.id}" needs a promoted base voice before it can be generated.`
    );
  }

  for (let index = 0; index < count; index += 1) {
    const line = voiceSettings.text ?? request.asset.prompt;
    const direction = (request.prompt ?? voiceSettings.direction)?.trim();
    const model =
      voiceSettings.model ??
      audioSettings.model ??
      (direction ? "eleven_v3" : "eleven_multilingual_v2");
    const text = direction ? `[${sanitizeElevenLabsAudioTag(direction)}]\n${line}` : line;
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`);
    url.searchParams.set("output_format", options.outputFormat ?? elevenLabsOutputFormat(format));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text,
        model_id: model
      })
    });

    if (!response.ok) {
      throw new Error(
        `ElevenLabs voice line generation failed (${response.status}): ${await response.text()}`
      );
    }

    generated.push({
      image: new Uint8Array(await response.arrayBuffer()),
      mimeType: mimeTypeForAudioFormat(format),
      prompt: direction ?? request.asset.prompt,
      model,
      audioSettings: {
        provider: "elevenlabs",
        ...audioSettings,
        format
      },
      audioPlayback: request.asset.audioPlayback,
      voiceSettings: {
        provider: "elevenlabs",
        ...voiceSettings,
        voiceId,
        text: line,
        direction
      }
    });
  }

  return generated;
}

function sanitizeElevenLabsAudioTag(direction: string): string {
  return direction
    .replace(/[\r\n]+/g, " ")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function readableVoiceName(assetId: string, versionName: string): string {
  return `${assetId.replace(/[._-]+/g, " ")} ${versionName}`.slice(0, 100);
}
