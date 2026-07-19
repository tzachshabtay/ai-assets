import assert from "node:assert/strict";
import test from "node:test";

import {
  installPromotedImageTexture,
  previewImageSource,
  renderOptions
} from "../dist/designer-support.js";
import { AiAssetRuntime } from "../dist/runtime.js";

function tilesetAsset() {
  return {
    id: "forest",
    kind: "tileset",
    prompt: "Forest tiles.",
    dimensions: { width: 32, height: 16 },
    tileset: {
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      rows: 1,
      tileCount: 2
    },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/forest.png",
        prompt: "Forest tiles.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
}

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  toggle(name, force) {
    const enabled = force ?? !this.names.has(name);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
  }

  set className(value) {
    this.classList.names = new Set(value.split(/\s+/).filter(Boolean));
  }

  get className() {
    return [...this.classList.names].join(" ");
  }

  set innerHTML(value) {
    this.html = value;
    if (value === "") this.children = [];
  }

  get innerHTML() {
    return this.html ?? "";
  }

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(".")) return [];
    const className = selector.slice(1);
    return this.children.filter((child) => child.classList?.contains(className));
  }

  dispatch(name) {
    this.listeners.get(name)?.({});
  }
}

test("a cross-origin active preview supersedes an older generated preview", () => {
  const previousImage = globalThis.Image;
  const previousWindow = globalThis.window;
  const images = [];

  class FakeImage {
    constructor() {
      images.push(this);
    }

    set src(value) {
      this.currentSrc = value;
    }

    get src() {
      return this.currentSrc;
    }

    load() {
      this.onload?.();
    }
  }

  globalThis.Image = FakeImage;
  globalThis.window = {
    location: {
      href: "http://127.0.0.1:5175/",
      origin: "http://127.0.0.1:5175"
    }
  };

  try {
    const asset = tilesetAsset();
    const manifest = { schemaVersion: 1, assets: { forest: asset } };
    const added = [];
    const previewed = [];
    const scene = {
      textures: {
        exists: () => false,
        remove: () => undefined,
        addImage: () => undefined,
        addSpriteSheet(key, image, config) {
          added.push({ key, image, config });
        }
      }
    };
    const onPreview = (assetId, textureKey) => previewed.push({ assetId, textureKey });

    previewImageSource({
      scene,
      manifest,
      assetId: "forest",
      src: "data:image/png;base64,generated",
      textureKey: "generated-preview",
      assetOverride: { ...asset, prompt: "Temporary generated tiles." },
      onPreview
    });
    previewImageSource({
      scene,
      manifest,
      assetId: "forest",
      src: "http://127.0.0.1:4087/assets/forest.png",
      textureKey: "active-preview",
      onPreview
    });

    assert.equal(images.length, 2);
    assert.equal(images[0].crossOrigin, undefined);
    assert.equal(images[1].crossOrigin, "anonymous");

    images[0].load();
    images[1].load();

    assert.deepEqual(previewed, [{ assetId: "forest", textureKey: "active-preview" }]);
    assert.equal(added.length, 1);
    assert.equal(added[0].key, "active-preview");
    assert.deepEqual(added[0].config, {
      frameWidth: 16,
      frameHeight: 16,
      margin: undefined,
      spacing: undefined
    });
  } finally {
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("temporary previews update current and future bindings without replacing the manifest", () => {
  const asset = tilesetAsset();
  const manifest = { schemaVersion: 1, assets: { forest: asset } };
  const scene = {
    load: {
      image: () => undefined,
      spritesheet: () => undefined
    },
    textures: {
      exists: () => true
    }
  };
  const runtime = new AiAssetRuntime(scene, manifest);
  const textureCalls = [];
  const target = {
    setTexture(key, frame) {
      textureCalls.push({ key, frame });
    }
  };

  runtime.bindTexture(target, "forest", { frame: 1, setInitialTexture: false });
  const callbacks = runtime.designerCallbacks();
  callbacks.onPreview(
    "forest",
    "temporary-preview",
    { ...asset, prompt: "Temporary generated tiles." }
  );
  const futureTextureCalls = [];
  runtime.bindTexture({
    setTexture(key, frame) {
      futureTextureCalls.push({ key, frame });
    }
  }, "forest", { frame: 0 });

  assert.strictEqual(manifest.assets.forest, asset);
  assert.equal(manifest.assets.forest.prompt, "Forest tiles.");
  assert.equal(runtime.key("forest"), "temporary-preview");
  assert.deepEqual(textureCalls, [{ key: "temporary-preview", frame: 1 }]);
  assert.deepEqual(futureTextureCalls, [{ key: "temporary-preview", frame: 0 }]);

  callbacks.onAssetReady("forest", "forest", asset);

  assert.equal(runtime.key("forest"), "forest");
  assert.deepEqual(textureCalls, [
    { key: "temporary-preview", frame: 1 },
    { key: "forest", frame: 1 }
  ]);
  assert.deepEqual(futureTextureCalls, [
    { key: "temporary-preview", frame: 0 },
    { key: "forest", frame: 0 }
  ]);
});

test("a spritesheet preview rebuilds animations against the temporary texture", () => {
  const asset = {
    id: "hero",
    kind: "spritesheet",
    prompt: "Walking hero.",
    dimensions: { width: 32, height: 16 },
    frameGrid: {
      frameWidth: 16,
      frameHeight: 16,
      columns: 2,
      rows: 1,
      frameCount: 2
    },
    animations: [{ key: "hero.walk", frames: [0, 1], frameRate: 8, repeat: -1 }],
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/hero.png",
        prompt: "Walking hero.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
  const manifest = { schemaVersion: 1, assets: { hero: asset } };
  const removed = [];
  const generatedFrom = [];
  const created = [];
  const scene = {
    load: { image() {}, spritesheet() {} },
    textures: { exists: () => true },
    anims: {
      exists: () => true,
      remove(key) {
        removed.push(key);
      },
      generateFrameNumbers(textureKey, config) {
        generatedFrom.push({ textureKey, frames: config.frames });
        return config.frames.map((frame) => ({ key: textureKey, frame }));
      },
      create(config) {
        created.push(config);
      }
    }
  };
  const runtime = new AiAssetRuntime(scene, manifest);
  const targetCalls = [];
  runtime.bindTexture({
    stop() {
      targetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      targetCalls.push({ type: "texture", key, frame });
    }
  }, "hero", { frame: 0, setInitialTexture: false });

  runtime.designerCallbacks().onPreview("hero", "hero-preview", asset);

  assert.deepEqual(removed, ["hero.walk"]);
  assert.deepEqual(generatedFrom, [{ textureKey: "hero-preview", frames: [0, 1] }]);
  assert.equal(created.length, 1);
  assert.deepEqual(targetCalls, [
    { type: "stop" },
    { type: "texture", key: "hero-preview", frame: 0 }
  ]);
});

test("animation playback uses unpromoted preview frame transforms", () => {
  const baseAsset = {
    id: "hero",
    kind: "image",
    prompt: "Standing hero.",
    dimensions: { width: 16, height: 16 },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/hero-base.png",
        prompt: "Standing hero.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    },
    linkedAnimationAssets: {
      "walk-down": { label: "Walk down", assetId: "hero.walk.down" }
    }
  };
  const asset = {
    id: "hero.walk.down",
    kind: "spritesheet",
    prompt: "Walking hero.",
    dimensions: { width: 32, height: 16 },
    frameGrid: {
      frameWidth: 16,
      frameHeight: 16,
      columns: 2,
      rows: 1,
      frameCount: 2
    },
    animations: [{ key: "hero.walk", frames: [0, 1], frameRate: 8, repeat: -1 }],
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/hero.png",
        prompt: "Walking hero.",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
  const previewAsset = {
    ...asset,
    animations: [{
      ...asset.animations[0],
      frameTimings: [
        { delayMs: 125, scaleX: 1.5, scaleY: 1.25 },
        { delayMs: 125, scaleX: 1.5, scaleY: 1.25 }
      ]
    }]
  };
  const manifest = {
    schemaVersion: 1,
    assets: { hero: baseAsset, "hero.walk.down": asset }
  };
  const scene = {
    load: { image() {}, spritesheet() {} },
    textures: { exists: () => true },
    anims: {
      exists: () => true,
      remove() {},
      generateFrameNumbers(textureKey, config) {
        return config.frames.map((frame) => ({ key: textureKey, frame }));
      },
      create() {}
    }
  };
  const runtime = new AiAssetRuntime(scene, manifest);
  const displaySizes = [];
  const target = {
    play() {},
    setTexture() {},
    setDisplaySize(width, height) {
      displaySizes.push({ width, height });
    },
    setOrigin() {},
    setRotation() {},
    on() {},
    off() {},
    once() {}
  };
  const callbacks = runtime.designerCallbacks();

  callbacks.onPreview("hero.walk.down", "hero-walk-preview", previewAsset);
  const previewPlayback = runtime.playAnimation(target, "hero", "walk-down");

  assert.deepEqual(displaySizes.at(-1), { width: 24, height: 20 });
  assert.strictEqual(manifest.assets["hero.walk.down"], asset);

  previewPlayback.destroy();
  callbacks.onAssetReady("hero.walk.down", "hero-walk-down", asset);
  const activePlayback = runtime.playAnimation(target, "hero", "walk-down");

  assert.equal(activePlayback.frameTransforms, undefined);
  assert.equal(displaySizes.length, 1);
});

test("a tileset preview pauses old animation sheets and active restore resumes them", () => {
  const asset = tilesetAsset();
  asset.tileset.animations = [{
    key: "forest.water",
    prompt: "Shimmering water.",
    frameCount: 2,
    frameRate: 2,
    repeat: -1
  }];
  asset.versions.v1.tilesetAnimations = {
    "forest.water": { files: ["/water-0.png", "/water-1.png"] }
  };
  const manifest = { schemaVersion: 1, assets: { forest: asset } };
  const animationKeys = new Set();
  const removed = [];
  const created = [];
  const scene = {
    load: { image() {}, spritesheet() {} },
    textures: { exists: () => true },
    anims: {
      exists(key) {
        return animationKeys.has(key);
      },
      remove(key) {
        removed.push(key);
        animationKeys.delete(key);
      },
      generateFrameNumbers() {
        return [];
      },
      create(config) {
        created.push(config);
        animationKeys.add(config.key);
      }
    }
  };
  const runtime = new AiAssetRuntime(scene, manifest);
  const targetCalls = [];
  const target = {
    play(key) {
      targetCalls.push({ type: "play", key });
    },
    stop() {
      targetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      targetCalls.push({ type: "texture", key, frame });
    }
  };
  const playback = runtime.playTilesetAnimation(target, "forest", 1, "forest.water");

  const callbacks = runtime.designerCallbacks();
  callbacks.onPreview("forest", "forest-preview", asset);
  assert.deepEqual(targetCalls.slice(-2), [
    { type: "stop" },
    { type: "texture", key: "forest-preview", frame: 1 }
  ]);

  callbacks.onTilesetAnimationPreview(
    "forest",
    "forest.water",
    ["water-preview-0", "water-preview-1"],
    asset
  );
  assert.equal(targetCalls.at(-1).type, "play");
  assert.deepEqual(created.at(-1).frames, [
    { key: "water-preview-0", frame: 1, duration: undefined },
    { key: "water-preview-1", frame: 1, duration: undefined }
  ]);

  const lateTargetCalls = [];
  const lateTarget = {
    play(key) {
      lateTargetCalls.push({ type: "play", key });
    },
    stop() {
      lateTargetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      lateTargetCalls.push({ type: "texture", key, frame });
    }
  };
  const latePlayback = runtime.playTilesetAnimation(
    lateTarget,
    "forest",
    0,
    "forest.water"
  );
  assert.equal(lateTargetCalls.at(-1).type, "play");
  assert.deepEqual(created.at(-1).frames, [
    { key: "water-preview-0", frame: 0, duration: undefined },
    { key: "water-preview-1", frame: 0, duration: undefined }
  ]);

  const sameFrameTargetCalls = [];
  const sameFramePlayback = runtime.playTilesetAnimation({
    play(key, ignoreIfPlaying) {
      sameFrameTargetCalls.push({ type: "play", key, ignoreIfPlaying });
    },
    stop() {
      sameFrameTargetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      sameFrameTargetCalls.push({ type: "texture", key, frame });
    }
  }, "forest", 0, "forest.water", {
    randomFrame: true,
    forceRestart: true
  });
  assert.deepEqual(sameFrameTargetCalls.at(-1), {
    type: "play",
    key: { key: "forest::tile-animation:forest.water:0", randomFrame: true },
    ignoreIfPlaying: false
  });
  assert.equal(created.length, 3, "same-frame preview bindings reuse one animation");

  callbacks.onAssetReady("forest", "forest", asset);
  assert.equal(removed.length, 3);
  assert.equal(created.length, 5, "canonical restore creates one animation per tile frame");
  assert.equal(targetCalls.at(-1).type, "play");
  assert.equal(lateTargetCalls.at(-1).type, "play");
  assert.deepEqual(sameFrameTargetCalls.at(-1), {
    type: "play",
    key: { key: "forest::tile-animation:forest.water:0", randomFrame: true },
    ignoreIfPlaying: false
  });
  assert.deepEqual(created.at(-1).frames, [
    { key: "forest::tileset:forest.water:0", frame: 0, duration: undefined },
    { key: "forest::tileset:forest.water:1", frame: 0, duration: undefined }
  ]);

  const restoredTargetCalls = [];
  const restoredPlayback = runtime.playTilesetAnimation({
    play(key) {
      restoredTargetCalls.push({ type: "play", key });
    },
    stop() {
      restoredTargetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      restoredTargetCalls.push({ type: "texture", key, frame });
    }
  }, "forest", 0, "forest.water");
  assert.equal(restoredTargetCalls.at(-1).type, "play");
  assert.equal(created.length, 5, "restored playback reuses the canonical animation");

  playback.destroy();
  latePlayback.destroy();
  sameFramePlayback.destroy();
  restoredPlayback.destroy();
  const callCount = targetCalls.length;
  callbacks.onPreview("forest", "another-preview", asset);
  assert.equal(targetCalls.length, callCount);
});

test("a late tileset binding replaces a pre-existing canonical animation with the stored preview", () => {
  const asset = tilesetAsset();
  asset.tileset.animations = [{
    key: "forest.water",
    prompt: "Shimmering water.",
    frameCount: 2,
    frameRate: 2,
    repeat: -1
  }];
  asset.versions.v1.tilesetAnimations = {
    "forest.water": { files: ["/water-0.png", "/water-1.png"] }
  };
  const manifest = { schemaVersion: 1, assets: { forest: asset } };
  const animationKeys = new Set();
  const removed = [];
  const created = [];
  const scene = {
    load: { image() {}, spritesheet() {} },
    textures: { exists: () => true },
    anims: {
      exists(key) {
        return animationKeys.has(key);
      },
      remove(key) {
        removed.push(key);
        animationKeys.delete(key);
      },
      generateFrameNumbers() {
        return [];
      },
      create(config) {
        created.push(config);
        animationKeys.add(config.key);
      }
    }
  };
  const runtime = new AiAssetRuntime(scene, manifest);
  const canonicalPlayback = runtime.playTilesetAnimation({
    play() {},
    stop() {},
    setTexture() {}
  }, "forest", 1, "forest.water");
  canonicalPlayback.destroy();
  assert.deepEqual(created.at(-1).frames, [
    { key: "forest::tileset:forest.water:0", frame: 1, duration: undefined },
    { key: "forest::tileset:forest.water:1", frame: 1, duration: undefined }
  ]);

  runtime.designerCallbacks().onTilesetAnimationPreview(
    "forest",
    "forest.water",
    ["water-preview-0", "water-preview-1"],
    asset
  );
  assert.equal(created.length, 1, "a preview without bindings is retained without installation");

  const targetCalls = [];
  const previewPlayback = runtime.playTilesetAnimation({
    play(key) {
      targetCalls.push({ type: "play", key });
    },
    stop() {
      targetCalls.push({ type: "stop" });
    },
    setTexture(key, frame) {
      targetCalls.push({ type: "texture", key, frame });
    }
  }, "forest", 1, "forest.water");

  assert.equal(targetCalls.at(-1).type, "play");
  assert.deepEqual(removed, ["forest::tile-animation:forest.water:1"]);
  assert.deepEqual(created.at(-1).frames, [
    { key: "water-preview-0", frame: 1, duration: undefined },
    { key: "water-preview-1", frame: 1, duration: undefined }
  ]);
  previewPlayback.destroy();
});

test("a promoted tileset install survives transient previews and replaces the canonical texture", async () => {
  const previousImage = globalThis.Image;
  const previousWindow = globalThis.window;
  const images = [];

  class FakeImage {
    constructor() {
      images.push(this);
    }

    set src(value) {
      this.currentSrc = value;
    }

    get src() {
      return this.currentSrc;
    }

    load() {
      this.onload?.();
    }
  }

  globalThis.Image = FakeImage;
  globalThis.window = {
    location: {
      href: "http://127.0.0.1:5175/",
      origin: "http://127.0.0.1:5175"
    }
  };

  try {
    const original = tilesetAsset();
    const promoted = {
      ...original,
      dimensions: { width: 48, height: 20 },
      tileset: {
        ...original.tileset,
        tileWidth: 24,
        tileHeight: 20
      },
      activeVersion: "promoted",
      versions: {
        ...original.versions,
        promoted: {
          name: "promoted",
          file: "/forest-promoted.png",
          prompt: "Mixed forest tiles.",
          createdAt: "2026-01-02T00:00:00.000Z"
        }
      }
    };
    const manifest = { schemaVersion: 1, assets: { forest: promoted } };
    const events = [];
    const scene = {
      textures: {
        exists(key) {
          assert.equal(key, "forest");
          return true;
        },
        remove(key) {
          events.push(`remove:${key}`);
        },
        addImage: () => undefined,
        addSpriteSheet(key, image, config) {
          events.push(`install:${key}`);
          assert.strictEqual(image, images[0]);
          assert.deepEqual(config, {
            frameWidth: 24,
            frameHeight: 20,
            margin: undefined,
            spacing: undefined
          });
        }
      }
    };

    let resolved = false;
    const loaded = installPromotedImageTexture({
      scene,
      manifest,
      assetId: "forest",
      src: "http://127.0.0.1:4087/assets/forest-promoted.png",
      assetOverride: promoted
    });
    void loaded.then(() => {
      resolved = true;
    });

    assert.deepEqual(events, []);
    assert.equal(images[0].crossOrigin, "anonymous");
    await Promise.resolve();
    assert.equal(resolved, false);

    previewImageSource({
      scene,
      manifest,
      assetId: "forest",
      src: "data:image/png;base64,transient-preview",
      textureKey: "ai-preview:forest:0",
      onPreview() {}
    });
    assert.equal(images.length, 2);

    images[0].load();
    const installed = await loaded;

    assert.deepEqual(events, [
      "remove:forest",
      "install:forest"
    ]);
    assert.equal(resolved, true);
    assert.deepEqual(installed, {
      assetId: "forest",
      textureKey: "forest",
      asset: promoted
    });
  } finally {
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("retained generation candidates rerender against the refreshed promoted manifest", () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const images = [];

  class FakeImage {
    constructor() {
      images.push(this);
    }

    set src(value) {
      this.currentSrc = value;
    }

    load() {
      this.onload?.();
    }
  }

  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
  globalThis.Image = FakeImage;

  try {
    const initialAsset = tilesetAsset();
    const promotedAsset = {
      ...initialAsset,
      prompt: "Promoted forest tiles.",
      tileset: {
        ...initialAsset.tileset,
        tileWidth: 24,
        tileHeight: 20
      },
      activeVersion: "promoted",
      versions: {
        ...initialAsset.versions,
        promoted: {
          name: "promoted",
          file: "/forest-promoted.png",
          prompt: "Promoted forest tiles.",
          createdAt: "2026-01-02T00:00:00.000Z"
        }
      }
    };
    const generated = [0, 1, 2].map((index) => ({
      index,
      dataUrl: `data:image/png;base64,option-${index}`,
      mimeType: "image/png",
      prompt: `Forest option ${index + 1}.`
    }));
    const elements = {
      options: new FakeElement("div"),
      currentPreview: new FakeElement("div"),
      status: new FakeElement("div")
    };
    const scene = {
      textures: {
        exists: () => false,
        remove: () => undefined,
        addImage: () => undefined,
        addSpriteSheet: () => undefined
      }
    };
    const selected = [];
    const previewed = [];

    const render = (asset) => renderOptions({
      elements,
      generated,
      scene,
      manifest: { schemaVersion: 1, assets: { forest: asset } },
      assetId: "forest",
      designerOptions: { scene },
      onPreview(assetId, textureKey, previewAsset) {
        previewed.push({ assetId, textureKey, previewAsset });
      },
      onSelected(option) {
        selected.push(option.index);
      }
    });

    render(initialAsset);
    assert.equal(elements.options.children.length, 3);

    render(promotedAsset);
    assert.equal(elements.options.children.length, 3);

    elements.options.children[0].children[0].dispatch("click");
    assert.deepEqual(selected, [0]);
    images[0].load();

    assert.equal(previewed.length, 1);
    assert.equal(previewed[0].assetId, "forest");
    assert.equal(previewed[0].previewAsset.prompt, "Promoted forest tiles.");
    assert.deepEqual(previewed[0].previewAsset.tileset, promotedAsset.tileset);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  }
});
