import assert from "node:assert/strict";
import test from "node:test";

import {
  linkedVoiceLineAssetIds,
  promotedVoiceId,
  regenerateAndPromoteVoiceLines,
  voiceLineRegenerationPlan
} from "../dist/voice-line-regeneration.js";

const voiceLine = (id, voiceAssetId, text) => ({
  id,
  kind: "voice-line",
  prompt: `Direction for ${id}`,
  audioSettings: { provider: "elevenlabs", format: "mp3" },
  voiceSettings: { provider: "elevenlabs", voiceAssetId, voiceId: "stale-voice", text },
  activeVersion: "",
  versions: {}
});

const baseManifest = () => ({
  schemaVersion: 1,
  assets: {
    "voice.detective": {
      id: "voice.detective",
      kind: "voice",
      prompt: "A measured detective voice.",
      voiceSettings: { provider: "elevenlabs" },
      linkedAnimationAssets: {
        first: { label: "First", assetId: "line.first" },
        second: { label: "Second", assetId: "line.second" }
      },
      activeVersion: "promoted",
      versions: {
        promoted: {
          name: "promoted",
          file: "/voice-detective.mp3",
          prompt: "A measured detective voice.",
          createdAt: "2026-01-01T00:00:00.000Z",
          voiceSettings: { provider: "elevenlabs", voiceId: "selected-voice" }
        }
      }
    },
    "line.first": voiceLine("line.first", "voice.detective", "First line of dialogue."),
    "line.second": voiceLine("line.second", "voice.detective", "Second line of dialogue.")
  }
});

const addThirdLine = (manifest) => {
  manifest.assets["voice.detective"].linkedAnimationAssets.third = {
    label: "Third",
    assetId: "line.third"
  };
  manifest.assets["line.third"] = voiceLine(
    "line.third",
    "voice.detective",
    "Third line of dialogue."
  );
};

const generatedOption = (assetId, index) => ({
  index: 0,
  dataUrl: `data:audio/mpeg;base64,${assetId}`,
  mimeType: "audio/mpeg",
  prompt: `Direction for ${assetId}`,
  model: "eleven_v3",
  audioSettings: { provider: "elevenlabs", format: "mp3" },
  voiceSettings: {
    provider: "elevenlabs",
    voiceAssetId: "voice.detective",
    voiceId: "selected-voice",
    text: `Generated line ${index + 1}`
  }
});

const saveIntoManifest = (currentManifest, request) => {
  const nextManifest = structuredClone(currentManifest);
  const asset = nextManifest.assets[request.assetId];
  const version = {
    name: request.versionName,
    file: `/${request.assetId}.mp3`,
    prompt: request.prompt,
    createdAt: "2026-01-01T00:00:00.000Z",
    voiceSettings: request.voiceSettings
  };
  asset.activeVersion = request.versionName;
  asset.versions[request.versionName] = version;
  return {
    manifest: nextManifest,
    result: {
      manifest: nextManifest,
      asset,
      versionName: request.versionName,
      version,
      file: version.file,
      filePath: `/tmp/${request.assetId}.mp3`
    }
  };
};

const addMobileTarget = (manifest, includeSecondLine = false) => {
  manifest.assets["voice.detective.mobile"] = {
    ...structuredClone(manifest.assets["voice.detective"]),
    id: "voice.detective.mobile"
  };
  manifest.assets["voice.detective.mobile"].versions.promoted.voiceSettings.voiceId =
    "mobile-selected-voice";
  manifest.assets["line.first.mobile"] = voiceLine(
    "line.first.mobile",
    "voice.detective.mobile",
    "Mobile first line."
  );
  if (includeSecondLine) {
    manifest.assets["line.second.mobile"] = voiceLine(
      "line.second.mobile",
      "voice.detective.mobile",
      "Mobile second line."
    );
  }
  manifest.targets = {
    mobile: {
      id: "mobile",
      variants: {
        "voice.detective": "voice.detective.mobile",
        "line.first": "line.first.mobile",
        ...(includeSecondLine ? { "line.second": "line.second.mobile" } : {})
      }
    }
  };
};

test("target-specific voice plans require target variants for every linked line", () => {
  const manifest = baseManifest();
  manifest.assets["voice.detective"].linkedAnimationAssets = {
    base: { label: "Base", assetId: "voice.detective" },
    first: { label: "First", assetId: "line.first" },
    duplicate: { label: "First duplicate", assetId: "line.first" },
    decoration: { label: "Decoration", assetId: "image.badge" },
    second: { label: "Second", assetId: "line.second" },
    missing: { label: "Missing", assetId: "line.missing" }
  };
  manifest.assets["image.badge"] = {
    id: "image.badge",
    kind: "image",
    prompt: "A badge.",
    activeVersion: "",
    versions: {}
  };
  addMobileTarget(manifest);

  assert.deepEqual(voiceLineRegenerationPlan(manifest, "voice.detective", "mobile"), {
    baseVoiceAssetId: "voice.detective.mobile",
    lineAssetIds: ["line.first.mobile"],
    missingTargetLineAssetIds: ["line.second"]
  });
  assert.deepEqual(
    linkedVoiceLineAssetIds(manifest, "voice.detective", "mobile"),
    ["line.first.mobile"]
  );
});

test("target-specific regeneration uses the resolved base voice and line variants", async () => {
  const manifest = baseManifest();
  addMobileTarget(manifest, true);
  const requests = [];
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      requests.push(request);
      return [generatedOption(request.assetId, requests.length)];
    },
    async save(request) {
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    targetId: "mobile",
    client
  });

  assert.deepEqual(requests.map((request) => request.assetId), [
    "line.first.mobile",
    "line.second.mobile"
  ]);
  assert.ok(requests.every((request) => (
    request.voiceSettings.voiceAssetId === "voice.detective.mobile" &&
    request.voiceSettings.voiceId === "mobile-selected-voice"
  )));
  assert.equal(result.promoted.length, 2);
  assert.deepEqual(result.failures, []);
});

test("a base voice is eligible only when it has a permanent promoted voice id", () => {
  const manifest = baseManifest();
  assert.equal(promotedVoiceId(manifest, "voice.detective"), "selected-voice");

  delete manifest.assets["voice.detective"].versions.promoted.voiceSettings.voiceId;
  manifest.assets["voice.detective"].versions.promoted.voiceSettings.generatedVoiceId =
    "preview-only";
  assert.equal(promotedVoiceId(manifest, "voice.detective"), undefined);
});

test("all linked lines generate one option and promote sequentially with current prompts", async () => {
  const manifest = baseManifest();
  manifest.assets["line.first"].activeVersion = "old";
  manifest.assets["line.first"].versions.old = {
    name: "old",
    file: "/old-line.mp3",
    prompt: "Old saved direction that should not win.",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  const events = [];
  const progress = [];
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      events.push(`G:${request.assetId}`);
      assert.equal(request.count, 1);
      assert.equal(request.voiceSettings.voiceId, "selected-voice");
      if (request.assetId === "line.first") {
        assert.equal(request.prompt, "Direction for line.first");
      }
      return [generatedOption(request.assetId, events.length)];
    },
    async save(request) {
      events.push(`S:${request.assetId}`);
      assert.equal(request.activate, true);
      assert.equal(request.deferManifestModuleWrite, true);
      assert.equal(request.voiceSettings.voiceId, "selected-voice");
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    },
    async syncManifestModule() {
      events.push("F:manifest");
      return currentManifest;
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    client,
    versionName: (_assetId, index) => `batch-${index + 1}`,
    onProgress(update) {
      progress.push(`${update.phase}:${update.assetId}`);
      if (progress.length === 1) throw new Error("observer failed");
    }
  });

  assert.deepEqual(events, [
    "G:line.first",
    "S:line.first",
    "G:line.second",
    "S:line.second",
    "F:manifest"
  ]);
  assert.deepEqual(progress, [
    "generation:line.first",
    "promotion:line.first",
    "generation:line.second",
    "promotion:line.second"
  ]);
  assert.deepEqual(result.failures, []);
  assert.equal(result.cancelled, undefined);
  assert.equal(result.promoted.length, 2);
  assert.equal(result.manifest.assets["line.first"].activeVersion, "batch-1");
  assert.equal(result.manifest.assets["line.second"].activeVersion, "batch-2");
});

test("an isolated generation failure does not block later lines", async () => {
  const manifest = baseManifest();
  addThirdLine(manifest);
  const events = [];
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      events.push(`G:${request.assetId}`);
      if (request.assetId === "line.second") throw new Error("invalid line text");
      return [generatedOption(request.assetId, events.length)];
    },
    async save(request) {
      events.push(`S:${request.assetId}`);
      assert.equal(request.deferManifestModuleWrite, true);
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    },
    async syncManifestModule() {
      events.push("F:manifest");
      return currentManifest;
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    client
  });

  assert.deepEqual(events, [
    "G:line.first",
    "S:line.first",
    "G:line.second",
    "G:line.third",
    "S:line.third",
    "F:manifest"
  ]);
  assert.equal(result.promoted.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].assetId, "line.second");
  assert.equal(result.failures[0].phase, "generation");
});

test("a promotion failure preserves its option and stops further paid generation", async () => {
  const manifest = baseManifest();
  addThirdLine(manifest);
  const events = [];
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      events.push(`G:${request.assetId}`);
      return [generatedOption(request.assetId, events.length)];
    },
    async save(request) {
      events.push(`S:${request.assetId}`);
      assert.equal(request.deferManifestModuleWrite, true);
      if (request.assetId === "line.second") throw new Error("save unavailable");
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    },
    async syncManifestModule() {
      events.push("F:manifest");
      return currentManifest;
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    client,
    versionName: (_assetId, index) => `partial-${index + 1}`
  });

  assert.deepEqual(events, [
    "G:line.first",
    "S:line.first",
    "G:line.second",
    "S:line.second"
  ]);
  assert.equal(result.promoted.length, 1);
  assert.equal(result.manifest.assets["line.first"].activeVersion, "partial-1");
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].assetId, "line.second");
  assert.equal(result.failures[0].phase, "promotion");
  assert.match(result.failures[0].error.message, /save unavailable/);
  assert.equal(result.failures[0].option.voiceSettings.voiceId, "selected-voice");
  assert.equal(result.manifestModuleSyncDeferred, true);
});

test("cancellation finishes and promotes the in-flight line before stopping", async () => {
  const manifest = baseManifest();
  addThirdLine(manifest);
  const controller = new AbortController();
  const events = [];
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      events.push(`G:${request.assetId}`);
      controller.abort();
      return [generatedOption(request.assetId, events.length)];
    },
    async save(request) {
      events.push(`S:${request.assetId}`);
      assert.equal(request.deferManifestModuleWrite, true);
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    },
    async syncManifestModule() {
      events.push("F:manifest");
      return currentManifest;
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    client,
    signal: controller.signal
  });

  assert.deepEqual(events, ["G:line.first", "S:line.first", "F:manifest"]);
  assert.equal(result.promoted.length, 1);
  assert.deepEqual(result.failures, []);
  assert.equal(result.cancelled.assetId, "line.second");
  assert.equal(result.cancelled.index, 1);
});

test("a final manifest-module sync failure retains every promoted result", async () => {
  const manifest = baseManifest();
  let currentManifest = manifest;
  const client = {
    async generate(request) {
      return [generatedOption(request.assetId, 0)];
    },
    async save(request) {
      const saved = saveIntoManifest(currentManifest, request);
      currentManifest = saved.manifest;
      return saved.result;
    },
    async syncManifestModule() {
      throw new Error("module writer unavailable");
    }
  };

  const result = await regenerateAndPromoteVoiceLines({
    manifest,
    voiceAssetId: "voice.detective",
    client
  });

  assert.equal(result.promoted.length, 2);
  assert.deepEqual(result.failures, []);
  assert.match(result.manifestModuleSyncError.message, /module writer unavailable/);
  assert.equal(result.manifest.assets["line.second"].activeVersion.startsWith("promoted-"), true);
});

test("regeneration fails before spending requests when no promoted base voice exists", async () => {
  const manifest = baseManifest();
  delete manifest.assets["voice.detective"].versions.promoted.voiceSettings.voiceId;
  let called = false;
  const client = {
    async generate() {
      called = true;
      return [];
    },
    async save() {
      called = true;
      throw new Error("unexpected");
    }
  };

  await assert.rejects(
    regenerateAndPromoteVoiceLines({
      manifest,
      voiceAssetId: "voice.detective",
      client
    }),
    /needs a promoted base voice/
  );
  assert.equal(called, false);
});

test("missing target line variants fail before spending requests", async () => {
  const manifest = baseManifest();
  addMobileTarget(manifest);
  let called = false;
  const client = {
    async generate() {
      called = true;
      return [];
    },
    async save() {
      called = true;
      throw new Error("unexpected");
    }
  };

  await assert.rejects(
    regenerateAndPromoteVoiceLines({
      manifest,
      voiceAssetId: "voice.detective",
      targetId: "mobile",
      client
    }),
    /needs voice-line variants for: line.second/
  );
  assert.equal(called, false);
});
