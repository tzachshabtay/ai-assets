import assert from "node:assert/strict";
import test from "node:test";

import { createElevenLabsAudioProvider } from "../dist/audio-provider.js";

test("Eleven v4 voice lines preserve spoken text, direction, voice identity and streamed options", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const delivered = [];
  const asset = {
    ...audioAsset("line.ready", "voice-line"),
    prompt: "Default delivery direction",
    voiceSettings: { voiceAssetId: "voice.pilot", text: "Ready for launch!" }
  };

  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(url), init, body: JSON.parse(init.body) });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  try {
    const provider = createElevenLabsAudioProvider({ apiKey: "test-key" });
    const options = await provider.generate({
      asset,
      prompt: " [excited]\n  confidently ",
      count: 3,
      resolveVoiceId: (id) => id === "voice.pilot" ? "pilot/voice" : undefined
    }, (option, index) => delivered.push({ option, index }));

    assert.equal(requests.length, 3);
    assert.deepEqual(delivered.map(({ index }) => index), [0, 1, 2]);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.url.pathname, "/v1/text-to-speech/pilot%2Fvoice");
      assert.equal(request.url.searchParams.get("output_format"), "mp3_44100_128");
      assert.equal(request.init.method, "POST");
      assert.equal(request.init.headers["xi-api-key"], "test-key");
      assert.deepEqual(request.body, {
        text: "[excited confidently]\nReady for launch!",
        model_id: "eleven_v4"
      });
      const option = options[index];
      assert.equal(option, delivered[index].option);
      assert.deepEqual([...option.image], [1, 2, 3]);
      assert.equal(option.mimeType, "audio/mpeg");
      assert.equal(option.model, "eleven_v4");
      assert.equal(option.voiceSettings.model, "eleven_v4");
      assert.equal(option.voiceSettings.voiceId, "pilot/voice");
      assert.equal(option.voiceSettings.text, "Ready for launch!");
    }

    const [plain] = await provider.generate({
      asset: {
        ...asset,
        voiceSettings: { voiceId: "direct-voice" }
      }
    });
    assert.deepEqual(requests[3].body, {
      text: asset.prompt,
      model_id: "eleven_v4"
    });
    assert.equal(plain.voiceSettings.model, "eleven_v4");
    assert.equal(asset.voiceSettings.model, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice-line model overrides preserve legacy and custom models", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const asset = {
    ...audioAsset("line.ready", "voice-line"),
    voiceSettings: { voiceId: "pilot-voice", text: "Ready!" }
  };
  const cases = [
    { expected: "custom-provider-model" },
    { assetAudio: "eleven_multilingual_v2", expected: "eleven_multilingual_v2" },
    { requestAudio: "eleven_v3", expected: "eleven_v3" },
    { assetAudio: "eleven_multilingual_v2", assetVoice: "eleven_v3", expected: "eleven_v3" },
    { assetVoice: "eleven_v3", requestVoice: "eleven_v4", expected: "eleven_v4" },
    { requestAudio: "eleven_v3", requestVoice: "custom-voice-model", expected: "custom-voice-model" }
  ];

  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  try {
    const provider = createElevenLabsAudioProvider({
      apiKey: "test-key",
      voiceLineModel: "custom-provider-model"
    });
    for (const item of cases) {
      const [option] = await provider.generate({
        asset: {
          ...asset,
          audioSettings: { ...asset.audioSettings, model: item.assetAudio },
          voiceSettings: { ...asset.voiceSettings, model: item.assetVoice }
        },
        audioSettings: item.requestAudio ? { model: item.requestAudio } : undefined,
        voiceSettings: item.requestVoice ? { model: item.requestVoice } : undefined
      });
      assert.equal(requests.at(-1).model_id, item.expected);
      assert.equal(requests.at(-1).text, "Ready!");
      assert.equal(option.model, item.expected);
      assert.equal(option.voiceSettings.model, item.expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Eleven v4 uses requested output formats and reports API failures", async () => {
  const originalFetch = globalThis.fetch;
  const asset = {
    ...audioAsset("line.ready", "voice-line"),
    voiceSettings: { voiceId: "pilot-voice", text: "Ready!" }
  };
  const urls = [];

  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  try {
    const provider = createElevenLabsAudioProvider({ apiKey: "test-key" });
    const [option] = await provider.generate({ asset, audioSettings: { format: "opus" } });
    assert.equal(urls[0].searchParams.get("output_format"), "opus_48000_32");
    assert.equal(option.mimeType, "audio/opus");
    assert.equal(option.audioSettings.format, "opus");
    assert.equal(option.voiceSettings.model, "eleven_v4");

    const customFormatProvider = createElevenLabsAudioProvider({
      apiKey: "test-key",
      outputFormat: "mp3_22050_32"
    });
    await customFormatProvider.generate({ asset });
    assert.equal(urls[1].searchParams.get("output_format"), "mp3_22050_32");

    globalThis.fetch = async () => new Response("model unavailable", { status: 422 });
    await assert.rejects(provider.generate({ asset }),
      /ElevenLabs voice line generation failed \(422\): model unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    assert.equal(requests[0].body.model_id, "eleven_multilingual_ttv_v2");
    assert.equal(option.model, "eleven_multilingual_ttv_v2");
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
