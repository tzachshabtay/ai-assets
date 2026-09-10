import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationReferenceControl } from "../dist/generation-reference.js";

test("reference control preserves drafts on cancellation, supports replacement, and removes explicitly", async () => {
  const dom = fakeDom();
  const changes = [];
  let opened = 0;
  let closed = 0;
  const initial = { name: "Existing reference", dataUrl: "data:image/png;base64,initial" };
  try {
    const control = createGenerationReferenceControl({
      root: dom.root,
      getManifest: () => ({ schemaVersion: 1, assets: {} }),
      resolveAssetUrl: (file) => file,
      getDimensions: () => ({ width: 16, height: 32 }),
      initialValue: initial,
      onChange: (value) => changes.push(value),
      onOpen: () => opened++,
      onClose: () => closed++
    });
    dom.root.append(control.element);
    assert.deepEqual(control.getValue(), initial);
    control.getValue().name = "Should not mutate the draft";
    assert.equal(control.getValue().name, initial.name);

    dom.button("Replace").click();
    assert.deepEqual(dom.buttons().filter((button) => ["Existing asset", "Computer", "Sketch"].includes(button.textContent))
      .map((button) => button.textContent), ["Existing asset", "Computer", "Sketch"]);
    dom.button("Cancel").click();
    assert.deepEqual(control.getValue(), initial);
    assert.equal(changes.length, 0);
    assert.equal(opened, closed);

    dom.button("Replace").click();
    dom.button("Computer").click();
    await settle();
    assert.deepEqual(control.getValue(), initial, "cancelling the native picker preserves the reference");
    dom.setUpload(new File(["image"], "drawing.png", { type: "image/png" }));
    dom.button("Replace").click();
    dom.button("Computer").click();
    await settle();
    assert.equal(control.getValue().name, "drawing.png");
    assert.equal(changes.length, 1, "the native picker remains usable after cancellation");

    control.setValue(initial);
    assert.equal(changes.length, 1, "parent synchronization is silent");
    dom.button("Remove").click();
    assert.equal(control.getValue(), undefined);
    assert.equal(changes.at(-1), undefined);
    assert.equal(dom.button("Add reference").textContent, "Add reference");
    control.destroy();
    assert.equal(dom.root.children.length, 0);
  } finally {
    dom.restore();
  }
});

test("existing reference browser includes linked animation and target images and ignores stale downloads", async () => {
  const dom = fakeDom();
  let resolveImage;
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise((resolve) => { resolveImage = resolve; });
  const changes = [];
  const assets = Object.fromEntries([
    ["hero", "image"], ["hero.walk", "animation"], ["hero.mobile", "spritesheet"],
    ["grass", "tileset"], ["sound", "sound"], ["collection", "collection"]
  ].map(([id, kind]) => [id, {
    id, kind, prompt: id, activeVersion: "saved",
    versions: { saved: { file: "/slow.png" } }
  }]));
  assets.hero.linkedAnimations = [{ label: "Walk", assetId: "hero.walk" }];
  const manifest = {
    schemaVersion: 1,
    assets,
    assetPaths: Object.fromEntries(Object.keys(assets).map((id) => [id, []])),
    targets: { mobile: { assets: { hero: "hero.mobile" } } }
  };
  try {
    const control = createGenerationReferenceControl({
      root: dom.root,
      getManifest: () => manifest,
      resolveAssetUrl: (file) => `https://assets.test${file}`,
      getDimensions: () => ({ width: 16, height: 16 }),
      onChange: (value) => changes.push(value)
    });
    dom.root.append(control.element);
    dom.button("Add reference").click();
    dom.button("Existing asset").click();
    const labels = dom.buttons().map((button) => button.textContent);
    for (const label of ["Hero", "Hero Walk", "Hero Mobile", "Grass"]) assert.ok(labels.includes(label), label);
    assert.ok(!labels.includes("Sound"));
    assert.ok(!labels.includes("Collection"));

    dom.button("Hero Walk").click();
    const next = { name: "Different draft", dataUrl: "data:image/png;base64,next" };
    control.setValue(next);
    resolveImage({ ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) });
    await settle();
    assert.deepEqual(control.getValue(), next);
    assert.equal(changes.length, 0, "a download from a closed dialog cannot replace a newer draft");

    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) });
    dom.button("Replace").click();
    dom.button("Existing asset").click();
    dom.button("Hero Walk").click();
    await settle();
    assert.equal(control.getValue().name, "Hero Walk");
    assert.ok(control.getValue().dataUrl.startsWith("data:image/png"));
    assert.equal(changes.length, 1);
    control.destroy();
  } finally {
    globalThis.fetch = priorFetch;
    dom.restore();
  }
});

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("reference picker retains keyboard focus through view and folder navigation", () => {
  const dom = fakeDom();
  const manifest = {
    schemaVersion: 1,
    assets: { hero: { id: "hero", kind: "image", prompt: "Hero", activeVersion: "saved", versions: { saved: { file: "/hero.png" } } } },
    assetPaths: { hero: ["Characters"] }
  };
  try {
    const control = createGenerationReferenceControl({
      root: dom.root,
      getManifest: () => manifest,
      resolveAssetUrl: (file) => file,
      getDimensions: () => ({ width: 16, height: 16 })
    });
    dom.root.append(control.element);
    dom.button("Add reference").click();
    dom.button("Existing asset").click();
    assert.equal(document.activeElement, dom.button("Assets"));
    dom.button("Characters").click();
    assert.equal(document.activeElement, dom.button("Assets"));
    assert.ok(dom.button("Hero"));
    dom.button("Assets").click();
    assert.equal(document.activeElement, dom.button("Assets"));

    const tab = (shiftKey = false) => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperties(event, { key: { value: "Tab" }, shiftKey: { value: shiftKey } });
      window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    };
    dom.button("Add reference").focus();
    tab();
    assert.equal(document.activeElement, dom.button("Cancel"));
    dom.root.focus();
    tab(true);
    assert.equal(document.activeElement, dom.button("Characters"));
    tab();
    assert.equal(document.activeElement, dom.button("Cancel"));
    control.destroy();
  } finally {
    dom.restore();
  }
});

function fakeDom() {
  const originals = Object.fromEntries(["document", "window", "HTMLElement", "FileReader", "Image"]
    .map((name) => [name, globalThis[name]]));
  let upload;
  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.classList = { toggle() {} };
      this.textContent = "";
    }
    get isConnected() { return this === root || Boolean(this.parent?.isConnected); }
    contains(element) { return element === this || descendants(this).includes(element); }
    set innerHTML(_value) { this.replaceChildren(); }
    getAttribute(name) { return name === "data-path" ? this.dataset.path ?? null : this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of this.children) child.parent = undefined; this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = undefined; }
    focus() { globalThis.document.activeElement = this; }
    querySelectorAll() { return descendants(this).filter((child) => child.tagName === "BUTTON" && !child.disabled); }
    click() {
      if (this.tagName === "INPUT" && this.type === "file") {
        if (upload) { this.files = [upload]; this.dispatchEvent(new Event("change")); upload = undefined; }
      } else {
        const ancestors = [];
        for (let ancestor = this.parent; ancestor; ancestor = ancestor.parent) ancestors.push(ancestor);
        if (this.tagName === "BUTTON") this.focus();
        this.dispatchEvent(new Event("click"));
        for (const ancestor of ancestors) ancestor.dispatchEvent(new Event("click"));
      }
    }
  }
  const root = new Element("div");
  globalThis.HTMLElement = Element;
  globalThis.document = { createElement: (tag) => new Element(tag), activeElement: undefined };
  globalThis.window = new EventTarget();
  globalThis.FileReader = class extends EventTarget {
    readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,aW1hZ2U=`;
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    }
  };
  globalThis.Image = class {
    naturalWidth = 16;
    naturalHeight = 16;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  const buttons = () => descendants(root).filter((element) => element.tagName === "BUTTON" && !element.hidden);
  return {
    root,
    buttons,
    button(label) {
      const match = buttons().find((button) => button.textContent === label);
      assert.ok(match, `Button not found: ${label}`);
      return match;
    },
    setUpload(file) { upload = file; },
    restore() {
      for (const [name, value] of Object.entries(originals)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    }
  };
}

function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}
