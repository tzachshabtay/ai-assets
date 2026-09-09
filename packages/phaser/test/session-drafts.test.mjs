import assert from "node:assert/strict";
import test from "node:test";

import {
  DesignerSessionDrafts,
  DesignerDraftInputSnapshot,
  designerDraftContextKey,
  savedDesignerDraftValues
} from "../dist/session-drafts.js";

const asset = {
  id: "hero", kind: "image", prompt: "A hero", dimensions: { width: 64, height: 96 },
  settings: { model: "gpt-image-2.5-sunburst", format: "png" },
  activeVersion: "v1", versions: { v1: { name: "v1", file: "hero.png", prompt: "A hero",
    createdAt: "2026-01-01T00:00:00.000Z" } }
};

test("every editable main-panel field survives asset switches with raw in-progress values", () => {
  const drafts = new DesignerSessionDrafts();
  const context = { assetId: "hero" };
  const defaults = savedDesignerDraftValues(asset);
  drafts.resolve(context, defaults, "v1");
  const edited = {
    prompt: "A hero with blue armor\n", width: "", height: "120", frameCount: "12",
    format: "webp", model: "gpt-image-2.5-flare", audioFormat: "wav", audioDuration: "1.",
    audioLoop: true, voiceText: "An unfinished sentence...", tilePrompts: ["grass", "stone", "water"]
  };
  drafts.update(context, edited);
  drafts.resolve({ assetId: "enemy" }, { ...defaults, prompt: "An enemy" }, "v1");
  assert.deepEqual(drafts.resolve(context, defaults, "v1"), edited);
  assert.deepEqual(defaults, savedDesignerDraftValues(asset), "capturing drafts never mutates manifest defaults");
});

test("target fallbacks and tileset animations have independent draft contexts", () => {
  const drafts = new DesignerSessionDrafts();
  const defaults = savedDesignerDraftValues(asset);
  const contexts = [
    { assetId: "hero" },
    { assetId: "hero", targetId: "phone" },
    { assetId: "hero", targetId: "tablet" },
    { assetId: "hero", targetId: "phone", animationKey: "walk" },
    { assetId: "hero", targetId: "phone", animationKey: "run" }
  ];
  assert.equal(new Set(contexts.map(designerDraftContextKey)).size, contexts.length);
  contexts.forEach((context, index) => {
    drafts.resolve(context, defaults, "v1");
    drafts.update(context, { prompt: `Context ${index}`, frameCount: String(index + 1) });
  });
  contexts.forEach((context, index) => {
    const restored = drafts.resolve(context, defaults, "v1");
    assert.equal(restored.prompt, `Context ${index}`);
    assert.equal(restored.frameCount, String(index + 1));
  });
});

test("successful promotion establishes the saved baseline without discarding newer fields", () => {
  const drafts = new DesignerSessionDrafts();
  const context = { assetId: "hero" };
  const defaults = savedDesignerDraftValues(asset);
  drafts.resolve(context, defaults, "v1");
  drafts.update(context, { prompt: "Generated prompt", model: "gpt-image-2.5-flare", width: "80" });
  const submitted = drafts.resolve(context, defaults, "v1");
  drafts.update(context, { prompt: "A newer prompt typed during generation", width: "100" });
  const saved = { ...submitted, height: "128" };
  const restored = drafts.resolve(context, saved, "v2");
  assert.equal(restored.prompt, "A newer prompt typed during generation");
  assert.equal(restored.width, "100");
  assert.equal(restored.height, "128", "untouched inputs adopt the saved candidate geometry");
  assert.equal(restored.model, "gpt-image-2.5-flare");

  const nextSaved = { ...saved, model: "gpt-image-2.5-sunburst" };
  assert.equal(drafts.resolve(context, nextSaved, "v3").model, "gpt-image-2.5-sunburst",
    "an edit already included in a promotion no longer masks the next saved baseline");
});

test("returning an input to its old value while a save is pending is still a newer edit", () => {
  const drafts = new DesignerSessionDrafts();
  const context = { assetId: "hero" };
  const defaults = savedDesignerDraftValues(asset);
  drafts.resolve(context, defaults, "v1");
  drafts.update(context, { prompt: "Submitted prompt" });
  drafts.update(context, { prompt: defaults.prompt });
  drafts.resolve(context, defaults, "v1");
  const restored = drafts.resolve(context, { ...defaults, prompt: "Submitted prompt" }, "v2");
  assert.equal(restored.prompt, defaults.prompt);
});

test("a saved-data refresh does not turn untouched stale DOM inputs into new edits", () => {
  const drafts = new DesignerSessionDrafts();
  const inputs = new DesignerDraftInputSnapshot();
  const context = { assetId: "hero" };
  const oldInputs = savedDesignerDraftValues(asset);
  drafts.resolve(context, oldInputs, "v1");
  inputs.reset(oldInputs);

  const saved = { ...oldInputs, prompt: "Promoted prompt", width: "128" };
  drafts.resolve(context, saved, "v2");
  const changed = inputs.capture({ ...oldInputs, height: "256" });
  assert.deepEqual(changed, { height: "256" }, "only the actual user change is captured");
  drafts.update(context, changed);
  const restored = drafts.resolve(context, saved, "v2");
  assert.equal(restored.prompt, "Promoted prompt");
  assert.equal(restored.width, "128");
  assert.equal(restored.height, "256");

  inputs.reset(restored);
  assert.deepEqual(inputs.capture(restored), {}, "rendering restored values establishes the next DOM snapshot");
});

test("new target variants inherit source edits without overwriting newer target edits", () => {
  const drafts = new DesignerSessionDrafts();
  const source = { assetId: "hero", targetId: "phone" };
  const target = { assetId: "hero.phone", targetId: "phone" };
  const defaults = savedDesignerDraftValues(asset);
  drafts.resolve(source, defaults, "v1");
  drafts.update(source, { width: "32", prompt: "Phone hero", model: "gpt-image-2.5-flare" });
  drafts.resolve(target, { ...defaults, height: "48" }, "target-v1");
  drafts.update(target, { prompt: "A newer target prompt" });
  drafts.copyChanges(source, target);
  const restored = drafts.resolve(target, { ...defaults, height: "48" }, "target-v1");
  assert.equal(restored.width, "32");
  assert.equal(restored.height, "48");
  assert.equal(restored.prompt, "A newer target prompt");
  assert.equal(restored.model, "gpt-image-2.5-flare");
  assert.equal(drafts.resolve({ assetId: "hero" }, defaults, "v1").prompt, defaults.prompt);
});

test("tile prompt arrays survive shrinking the visible tile count and are cloned at boundaries", () => {
  const drafts = new DesignerSessionDrafts();
  const context = { assetId: "tiles" };
  const defaults = { ...savedDesignerDraftValues(asset), tilePrompts: ["grass", "stone", "water"] };
  drafts.resolve(context, defaults, "v1");
  const prompts = ["lush grass", "stone", "water"];
  drafts.update(context, { tilePrompts: prompts, frameCount: "1" });
  prompts[0] = "Changed outside the draft store";
  const restored = drafts.resolve(context, defaults, "v1");
  assert.deepEqual(restored.tilePrompts, ["lush grass", "stone", "water"]);
  restored.tilePrompts[1] = "Changed outside the draft store";
  drafts.update(context, { frameCount: "3" });
  assert.deepEqual(drafts.resolve(context, defaults, "v1").tilePrompts, ["lush grass", "stone", "water"]);
});

test("saved defaults honor animation and audio/voice metadata without editing the asset", () => {
  const tileset = {
    ...asset, kind: "tileset", tileset: { tileWidth: 16, tileHeight: 24, columns: 2, rows: 1,
      tileCount: 2, tiles: [{ prompt: "Grass" }, { prompt: "Water" }],
      animations: [{ key: "ripple", frameCount: 6, frameRate: 4, tiles: [{ prompt: "Keep still" }, { prompt: "Ripple" }] }] },
    versions: { v1: { ...asset.versions.v1, tilesetAnimations: { ripple: {
      files: ["ripple.png"], settings: { model: "gpt-image-2.5-flare" }
    } } } }
  };
  const values = savedDesignerDraftValues(tileset, "ripple");
  assert.equal(values.width, "16");
  assert.equal(values.height, "24");
  assert.equal(values.frameCount, "6");
  assert.equal(values.model, "gpt-image-2.5-flare");
  assert.deepEqual(values.tilePrompts, ["Keep still", "Ripple"]);
  const voice = { ...asset, kind: "voice-line", audioSettings: { format: "wav", durationSeconds: 2.5, loop: true },
    voiceSettings: { text: "Saved line" }, versions: { v1: { ...asset.versions.v1, voiceSettings: { text: "Version line" } } } };
  const voiceValues = savedDesignerDraftValues(voice);
  assert.equal(voiceValues.audioFormat, "wav");
  assert.equal(voiceValues.audioDuration, "2.5");
  assert.equal(voiceValues.audioLoop, true);
  assert.equal(voiceValues.voiceText, "Version line");
  assert.equal(voice.voiceSettings.text, "Saved line");
});

test("a fresh designer session resets unsaved form edits", () => {
  const context = { assetId: "hero" };
  const defaults = savedDesignerDraftValues(asset);
  const previous = new DesignerSessionDrafts();
  previous.resolve(context, defaults, "v1");
  previous.update(context, { prompt: "Unsaved", width: "256", model: "gpt-image-2.5-flare" });
  assert.deepEqual(new DesignerSessionDrafts().resolve(context, defaults, "v1"), defaults);
});
