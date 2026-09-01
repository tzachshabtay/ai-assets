import assert from "node:assert/strict";
import test from "node:test";

import { createElevenLabsAudioProvider } from "../dist/audio-provider.js";

test("ElevenLabs limits music generation without throttling sound effects", async () => {
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  let requestCount = 0;

  globalThis.fetch = async () => {
    activeRequests += 1;
    requestCount += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeRequests -= 1;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  try {
    const provider = createElevenLabsAudioProvider({
      apiKey: "test-key",
      maxConcurrentMusicRequests: 2
    });
    const music = audioAsset("audio.music.game", "music");

    await Promise.all([
      provider.generate({ asset: music, count: 3 }),
      provider.generate({ asset: music, count: 3 })
    ]);

    assert.equal(requestCount, 6);
    assert.equal(maximumActiveRequests, 2);

    activeRequests = 0;
    maximumActiveRequests = 0;
    requestCount = 0;
    await provider.generate({ asset: audioAsset("audio.sfx.hit", "sound"), count: 3 });

    assert.equal(requestCount, 3);
    assert.equal(maximumActiveRequests, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redesigning a promoted base voice creates a new permanent voice", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const previewText = "This voice-design sample is deliberately longer than one hundred characters so ElevenLabs accepts it while the test verifies fresh voice promotion.";

  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).includes("/text-to-voice/design")) {
      return Response.json({
        text: previewText,
        previews: [{
          audio_base_64: Buffer.from([1, 2, 3]).toString("base64"),
          generated_voice_id: "new-generated-voice",
          media_type: "audio/mpeg",
          duration_secs: 1.25
        }]
      });
    }
    return Response.json({ voice_id: "new-permanent-voice" });
  };

  try {
    const provider = createElevenLabsAudioProvider({ apiKey: "test-key" });
    const asset = {
      id: "voice.detective",
      kind: "voice",
      prompt: "A measured detective voice.",
      audioSettings: { provider: "elevenlabs", format: "mp3" },
      voiceSettings: {
        provider: "elevenlabs",
        previewText,
        generatedVoiceId: "old-generated-voice",
        voiceId: "old-permanent-voice"
      },
      activeVersion: "old",
      versions: {}
    };

    const [option] = await provider.generate({ asset, count: 1 });
    assert.equal(option.voiceSettings.generatedVoiceId, "new-generated-voice");
    assert.equal(option.voiceSettings.voiceId, undefined);

    const promotedVoiceSettings = await provider.createVoice({
      asset,
      option,
      versionName: "redesigned"
    });
    assert.equal(promotedVoiceSettings.generatedVoiceId, "new-generated-voice");
    assert.equal(promotedVoiceSettings.voiceId, "new-permanent-voice");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.generated_voice_id, "new-generated-voice");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function audioAsset(id, kind) {
  return {
    id,
    kind,
    prompt: `Test ${kind}`,
    audioSettings: {
      format: "mp3",
      durationSeconds: 1
    },
    activeVersion: "",
    versions: {},
    tags: []
  };
}
