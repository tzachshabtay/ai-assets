import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_VOICE_LINE_MODEL, VOICE_LINE_MODELS } from "@ai-game-assets/core";
import { AiAssetDebugClient } from "../dist/debug-client.js";
import {
  syncGenerationModelControl,
  syncVoiceLineModelControl,
  voiceGenerationOverridesFromInputs,
  voiceLineGenerationModel
} from "../dist/designer-support.js";
import { DesignerSessionDrafts, savedDesignerDraftValues } from "../dist/session-drafts.js";

const asset = {
  id: "voice.line.detective",
  kind: "voice-line",
  prompt: "Speak with quiet confidence.",
  voiceSettings: { voiceAssetId: "voice.detective", text: "The case is closed." },
  activeVersion: "old",
  versions: {
    old: {
      name: "old", file: "/line.mp3", prompt: "An older direction.",
      model: "eleven_v3", voiceSettings: { model: "eleven_v3" },
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  }
};

test("voice-line model preferences use v4 and honor configured speech models independently of history", () => {
  assert.equal(DEFAULT_VOICE_LINE_MODEL, "eleven_v4");
  assert.equal(voiceLineGenerationModel(asset), DEFAULT_VOICE_LINE_MODEL);
  assert.equal(savedDesignerDraftValues(asset).model, "");
  const audioConfigured = { ...asset, audioSettings: { model: "eleven_multilingual_v2" } };
  const voiceConfigured = { ...audioConfigured, voiceSettings: { ...asset.voiceSettings, model: "custom-speech-model" } };
  assert.equal(voiceLineGenerationModel(audioConfigured), "eleven_multilingual_v2");
  assert.equal(savedDesignerDraftValues(audioConfigured).model, "eleven_multilingual_v2");
  assert.equal(voiceLineGenerationModel(voiceConfigured), "custom-speech-model");
  assert.equal(savedDesignerDraftValues(voiceConfigured).model, "custom-speech-model");
  assert.equal(voiceLineGenerationModel(voiceConfigured, "eleven_v3"), "eleven_v3");
  for (const kind of ["voice", "sound", "music", "image", "collection"]) {
    assert.equal(voiceLineGenerationModel({ ...asset, kind }), undefined);
  }
  assert.equal(asset.versions.old.model, "eleven_v3");
});

test("speech selector offers v4 and retains custom speech models without changing voice design controls", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  const elements = {
    modelField: { firstChild: { textContent: "Image model" } },
    modelSelect: {
      children: [],
      replaceChildren() { this.children = []; },
      append(child) { this.children.push(child); }
    }
  };
  try {
    syncGenerationModelControl(elements, asset);
    assert.equal(elements.modelField.firstChild.textContent, "Voice model");
    assert.equal(elements.modelField.hidden, false);
    assert.equal(elements.modelSelect.disabled, false);
    assert.equal(elements.modelSelect.value, "");
    assert.deepEqual(elements.modelSelect.children.map((option) => option.value),
      ["", "eleven_v4", "eleven_v3", "eleven_multilingual_v2"]);
    assert.deepEqual(elements.modelSelect.children.map((option) => option.textContent),
      ["Provider default", "Eleven v4", "Eleven v3", "Eleven Multilingual v2"]);
    assert.match(elements.modelSelect.children[0].title, /eleven_v4 by default/);

    syncVoiceLineModelControl(elements, { ...asset, voiceSettings: { model: "custom-speech-model" } });
    assert.equal(elements.modelSelect.value, "custom-speech-model");
    assert.equal(elements.modelSelect.children.at(-1).textContent, "custom-speech-model (configured)");
    assert.equal(elements.modelSelect.children.length, VOICE_LINE_MODELS.length + 1);
    assert.equal(elements.modelSelect.children.some((option) => option.value === ""), false,
      "provider default cannot clear an explicitly configured model");
    syncVoiceLineModelControl(elements, asset, "eleven_v3");
    assert.equal(elements.modelSelect.value, "eleven_v3");
    assert.equal(elements.modelSelect.children.length, VOICE_LINE_MODELS.length + 1);

    for (const kind of ["voice", "sound", "music"]) {
      syncGenerationModelControl(elements, { ...asset, kind });
      assert.equal(elements.modelField.hidden, true);
      assert.equal(elements.modelSelect.disabled, true);
      assert.equal(elements.modelSelect.children.length, 0);
    }
    syncGenerationModelControl(elements, { ...asset, kind: "image" });
    assert.equal(elements.modelField.firstChild.textContent, "Image model");
    assert.equal(elements.modelSelect.value, "gpt-image-2.5-sunburst");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("only an edited speech selector overrides the provider default and its selection survives asset switches", async () => {
  const drafts = new DesignerSessionDrafts();
  const context = { assetId: asset.id };
  const defaults = savedDesignerDraftValues(asset);
  drafts.resolve(context, defaults, "old");
  const elements = {
    voiceTextInput: { value: "The case is closed." },
    promptInput: { value: "Speak with quiet confidence." }
  };
  const unchanged = voiceGenerationOverridesFromInputs(elements, asset, drafts.editedValue(context, "model"));
  assert.equal(unchanged.model, undefined, "an untouched provider-default picker leaves the provider model configurable");
  drafts.update(context, { model: "eleven_v4" });
  drafts.resolve({ assetId: "another-line" }, defaults, "old");
  assert.equal(drafts.resolve(context, defaults, "old").model, "eleven_v4");
  const selected = voiceGenerationOverridesFromInputs(elements, asset, drafts.editedValue(context, "model"));
  assert.equal(selected.model, "eleven_v4");
  assert.equal(selected.voiceAssetId, "voice.detective");
  assert.equal(selected.text, "The case is closed.");
  assert.equal(selected.direction, "Speak with quiet confidence.");

  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, request) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(request.body) });
    return new Response('{"type":"done"}\n');
  };
  try {
    await new AiAssetDebugClient().generateStream({ assetId: asset.id, voiceSettings: selected }, () => {});
    assert.equal(requests[0].path, "/__ai-assets/generate-stream");
    assert.equal(requests[0].body.voiceSettings.model, "eleven_v4");
  } finally {
    globalThis.fetch = previousFetch;
  }

  drafts.update(context, { model: "" });
  assert.equal(voiceGenerationOverridesFromInputs(elements, asset, drafts.editedValue(context, "model")).model,
    undefined, "returning to provider default removes the explicit speech override");
  drafts.update(context, { model: "eleven_v4" });
  drafts.resolve(context, { ...defaults, model: "eleven_v4" }, "new");
  assert.equal(drafts.editedValue(context, "model"), undefined, "promotion establishes the configured baseline");
  const configured = { ...asset, voiceSettings: { ...asset.voiceSettings, model: "eleven_multilingual_v2" } };
  assert.equal(voiceGenerationOverridesFromInputs(elements, configured).model, "eleven_multilingual_v2");
  assert.equal(voiceGenerationOverridesFromInputs(elements, { ...configured, kind: "voice" }, "eleven_v4").model,
    "eleven_multilingual_v2", "speech selection never replaces the separate voice-design model");
});
