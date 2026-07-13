import assert from "node:assert/strict";
import test from "node:test";

import { createElevenLabsAudioProvider } from "../dist/audio-provider.js";

test("ElevenLabs generation respects the provider-wide concurrency limit", async () => {
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
      maxConcurrentRequests: 2
    });
    const asset = {
      id: "audio.music.game",
      kind: "music",
      prompt: "Test music",
      audioSettings: {
        format: "mp3",
        durationSeconds: 1
      },
      activeVersion: "",
      versions: {},
      tags: []
    };

    await Promise.all([
      provider.generate({ asset, count: 3 }),
      provider.generate({ asset, count: 3 })
    ]);

    assert.equal(requestCount, 6);
    assert.equal(maximumActiveRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
