import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_IMAGE_MODEL, createAiAssetVersion } from "@ai-game-assets/core";
import { AiAssetDebugClient } from "../dist/debug-client.js";
import { imageGenerationSettings, syncImageModelControl } from "../dist/designer-support.js";
import { createImageGenerationSession, tilesetAnimationSettingsForEdit } from "../dist/image-generation-preferences.js";
import { createMixedTilesetOption } from "../dist/tileset-dialog.js";

const sunburst = "gpt-image-2.5-sunburst";
const asset = {
  id: "hero",
  kind: "image",
  prompt: "A hero sprite.",
  activeVersion: "old",
  versions: {
    old: {
      name: "old",
      file: "/hero.png",
      prompt: "A hero sprite.",
      model: "gpt-image-2",
      settings: { model: "gpt-image-2" },
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  }
};

test("image model preferences honor explicit configuration without inferring a legacy pin from history", () => {
  assert.deepEqual(imageGenerationSettings(asset), { model: DEFAULT_IMAGE_MODEL });
  assert.deepEqual(imageGenerationSettings({ ...asset, settings: { model: "gpt-image-2" } }),
    { model: "gpt-image-2" });
  assert.deepEqual(imageGenerationSettings({ ...asset, settings: { model: "custom-image-model" } }, sunburst),
    { model: sunburst });
  assert.equal(asset.versions.old.model, "gpt-image-2");

  for (const kind of ["image", "spritesheet", "animation", "tileset"]) {
    assert.deepEqual(imageGenerationSettings({ ...asset, kind }, sunburst, "webp"), { model: sunburst });
  }
  for (const kind of ["sound", "music", "voice", "voice-line", "collection"]) {
    assert.equal(imageGenerationSettings({ ...asset, kind }, sunburst), undefined);
  }
  assert.equal(imageGenerationSettings(asset, sunburst, "svg"), undefined);
});

test("tileset animation selection restores its own model and new model drafts override it", () => {
  const tileset = structuredClone(asset);
  tileset.kind = "tileset";
  tileset.settings = { model: DEFAULT_IMAGE_MODEL };
  tileset.versions.old.tilesetAnimations = {
    water: { files: ["/water.png"], settings: { model: sunburst, quality: "xhigh" } }
  };
  assert.deepEqual(imageGenerationSettings(tileset, undefined, "png", "water"), { model: sunburst });
  assert.deepEqual(imageGenerationSettings(tileset, DEFAULT_IMAGE_MODEL, "png", "water"),
    { model: DEFAULT_IMAGE_MODEL });
  assert.deepEqual(imageGenerationSettings(tileset, undefined, "png", "new-animation"),
    { model: DEFAULT_IMAGE_MODEL });

  const version = createAiAssetVersion(tileset, {
    name: "copy", file: "/copy.png", tilesetAnimations: tileset.versions.old.tilesetAnimations
  });
  assert.deepEqual(version.tilesetAnimations, tileset.versions.old.tilesetAnimations);
  version.tilesetAnimations.water.settings.model = DEFAULT_IMAGE_MODEL;
  assert.equal(tileset.versions.old.tilesetAnimations.water.settings.model, sunburst);
});

test("model control preserves configured custom models and hides itself for SVG and audio", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  const elements = {
    modelField: {},
    modelSelect: {
      children: [],
      replaceChildren() { this.children = []; },
      append(child) { this.children.push(child); }
    }
  };
  try {
    syncImageModelControl(elements, { ...asset, settings: { model: "custom-image-model" } });
    assert.equal(elements.modelField.hidden, false);
    assert.equal(elements.modelSelect.disabled, false);
    assert.deepEqual(elements.modelSelect.children.map((option) => option.value),
      [DEFAULT_IMAGE_MODEL, sunburst, "custom-image-model"]);
    assert.equal(elements.modelSelect.value, "custom-image-model");

    syncImageModelControl(elements, asset, sunburst);
    assert.equal(elements.modelSelect.value, sunburst);
    assert.equal(elements.modelSelect.children.length, 2);

    for (const hiddenAsset of [asset, { ...asset, kind: "music" }]) {
      syncImageModelControl(elements, hiddenAsset, sunburst, "svg");
      assert.equal(elements.modelField.hidden, true);
      assert.equal(elements.modelSelect.disabled, true);
      assert.equal(elements.modelSelect.children.length, 0);
    }
    syncImageModelControl(elements, { ...asset, kind: "voice" }, sunburst, "png");
    assert.equal(elements.modelField.hidden, true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("selected model reaches image, edit, tileset-animation and promotion endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, request) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(request.body) });
    if (url.endsWith("-stream")) return new Response('{"type":"done"}\n');
    return Response.json({ options: [], manifest: { schemaVersion: 1, assets: {} } });
  };
  try {
    const client = new AiAssetDebugClient();
    const settings = imageGenerationSettings(asset, sunburst);
    await client.generate({ assetId: asset.id, settings });
    await client.generateStream({
      assetId: asset.id, settings, references: [{ name: "source.png", dataUrl: "data:image/png;base64,reference" }]
    }, () => {});
    await client.generateTilesetAnimationStream({ assetId: asset.id, animationKey: "walk", settings }, () => {});
    await client.saveTilesetAnimation({ assetId: asset.id, animationKey: "walk", frames: [], settings });
    await client.save({ assetId: asset.id, versionName: "new", dataUrl: "data:image/png;base64,new",
      prompt: asset.prompt, model: sunburst, settings });

    assert.deepEqual(requests.map((request) => request.path), [
      "/__ai-assets/generate",
      "/__ai-assets/generate-stream",
      "/__ai-assets/generate-tileset-animation-stream",
      "/__ai-assets/save-tileset-animation",
      "/__ai-assets/save"
    ]);
    for (const request of requests) assert.deepEqual(request.body.settings, { model: sunburst });
    assert.equal(requests.at(-1).body.model, sunburst);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("regenerating a tile with a new picker model carries that preference into mixed and edited output", async () => {
  const tileset = { tileWidth: 16, tileHeight: 16, columns: 1, rows: 1, tileCount: 1 };
  const candidate = {
    index: 0, dataUrl: "data:image/png;base64,sunburst", mimeType: "image/png",
    prompt: "Grass tile", model: sunburst, settings: { model: sunburst, format: "png" },
    dimensions: { width: 16, height: 16 }, tileset
  };
  const original = structuredClone(candidate);
  const session = createImageGenerationSession(candidate);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.settings.model, DEFAULT_IMAGE_MODEL, "the changed picker is honored");
    return Response.json({ options: [{
      ...candidate, model: body.settings.model,
      settings: { model: body.settings.model, format: "webp" },
      dataUrl: "data:image/webp;base64,flare", mimeType: "image/webp"
    }] });
  };
  try {
    const client = new AiAssetDebugClient();
    const generated = await client.generate({ assetId: asset.id,
      settings: imageGenerationSettings(asset, DEFAULT_IMAGE_MODEL), tileset });
    session.record(generated[0]);

    const composed = createMixedTilesetOption(candidate, {
      dataUrl: "data:image/png;base64,mixed", dimensions: { width: 16, height: 16 },
      tileset, selections: [0]
    }, candidate.prompt);
    for (const output of [session.applyTo(composed), session.applyTo({ ...candidate,
      dataUrl: "data:image/png;base64,edited" })]) {
      assert.equal(output.model, DEFAULT_IMAGE_MODEL);
      assert.equal(output.settings.model, DEFAULT_IMAGE_MODEL);
      assert.equal(output.settings.format, "png", "composition keeps its actual output format");
    }
    assert.deepEqual(candidate, original, "the original candidate and saved base stay unchanged");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("animation mixing uses the latest completed regeneration model and manual edits preserve saved sequence settings", () => {
  const session = createImageGenerationSession({ model: sunburst, settings: { model: sunburst, format: "png" } });
  const untouched = { index: 0, dataUrl: "base", mimeType: "image/png", prompt: "Base", model: "uploaded" };
  assert.strictEqual(session.applyTo(untouched), untouched, "manual-only edits never invent generation metadata");
  session.record({ ...untouched, model: DEFAULT_IMAGE_MODEL,
    settings: { model: DEFAULT_IMAGE_MODEL, quality: "high", format: "png", frameAlignment: "none" } });
  session.record(undefined);
  assert.equal(session.settings.model, DEFAULT_IMAGE_MODEL, "an empty generation cannot reset the latest model");

  const tilesetAsset = structuredClone(asset);
  tilesetAsset.versions.old.tilesetAnimations = {
    water: { files: ["water.png"], settings: { model: sunburst, quality: "xhigh" } }
  };
  const saved = tilesetAnimationSettingsForEdit(tilesetAsset, "water");
  assert.deepEqual(saved, { model: sunburst, quality: "xhigh" });
  saved.model = DEFAULT_IMAGE_MODEL;
  assert.equal(tilesetAsset.versions.old.tilesetAnimations.water.settings.model, sunburst);
  assert.deepEqual(tilesetAnimationSettingsForEdit(tilesetAsset, "water", { model: "pending-model" }),
    { model: "pending-model" });
  const mixedSettings = tilesetAnimationSettingsForEdit(tilesetAsset, "water", undefined, session.settings);
  assert.equal(mixedSettings.model, DEFAULT_IMAGE_MODEL);
  assert.equal(mixedSettings.quality, "high");
  assert.equal(tilesetAnimationSettingsForEdit(tilesetAsset, "unknown"), undefined);
});
