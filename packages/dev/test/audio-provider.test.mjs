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
