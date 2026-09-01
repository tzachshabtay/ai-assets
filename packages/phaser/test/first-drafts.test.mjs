import assert from "node:assert/strict";
import test from "node:test";

import { ensureMissingAiAssetFirstDrafts } from "../dist/first-drafts.js";

test("timed-out first drafts remain active until their late request settles", async () => {
  const manifest = {
    schemaVersion: 1,
    assets: {
      room: {
        id: "room",
        kind: "image",
        prompt: "A room.",
        dimensions: { width: 1, height: 1 },
        activeVersion: "",
        versions: {}
      }
    }
  };
  let resolveGeneration;
  const generation = new Promise((resolve) => {
    resolveGeneration = resolve;
  });
  let finished = false;
  const task = ensureMissingAiAssetFirstDrafts({
    scene: {},
    manifest,
    client: {
      ensureFirstDrafts() {
        return generation;
      }
    },
    generationTimeoutMs: 1,
    continueOnError: true
  }).then((result) => {
    finished = true;
    return result;
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(finished, false);

  resolveGeneration({ manifest, generated: [] });
  const result = await task;
  assert.equal(finished, true);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error.message, /Timed out generating first draft/);
});

test("first drafts defer watched-module writes and sync once after all persisted drafts", async () => {
  const originalImage = globalThis.Image;
  class FakeImage {
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = FakeImage;

  try {
    const manifest = {
      schemaVersion: 1,
      assets: {
        room: {
          id: "room",
          kind: "image",
          prompt: "A room.",
          dimensions: { width: 1, height: 1 },
          activeVersion: "",
          versions: {}
        }
      }
    };
    const generatedManifest = structuredClone(manifest);
    generatedManifest.assets.room.activeVersion = "first-draft";
    generatedManifest.assets.room.versions["first-draft"] = {
      name: "first-draft",
      file: "/assets/room.png",
      prompt: "A room.",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const requests = [];
    let syncCount = 0;
    const result = await ensureMissingAiAssetFirstDrafts({
      scene: {
        textures: {
          exists: () => false,
          remove() {},
          addImage() {}
        }
      },
      manifest,
      client: {
        async ensureFirstDrafts(request) {
          requests.push(request);
          return {
            manifest: generatedManifest,
            generated: [{ assetId: "room", versionName: "first-draft" }]
          };
        },
        async syncManifestModule() {
          syncCount += 1;
          return generatedManifest;
        }
      }
    });

    assert.deepEqual(requests, [{
      assetIds: ["room"],
      deferManifestModuleWrite: true
    }]);
    assert.equal(syncCount, 1);
    assert.deepEqual(result.generatedAssetIds, ["room"]);
    assert.equal(result.manifest.assets.room.activeVersion, "first-draft");
  } finally {
    if (originalImage === undefined) {
      delete globalThis.Image;
    } else {
      globalThis.Image = originalImage;
    }
  }
});
