import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { AiAssetRuntime } from "../dist/runtime.js";
import { loadAiAsset } from "../dist/loader.js";
import { aiScaledVariantTextureKey } from "../dist/scaled-variants.js";

function fixture() {
  const v = (id, size) => ({
    id,
    dimensions: { width: size, height: size },
    file: `${id}.png`,
    method: "nearest",
    sourceFile: "base.png",
    createdAt: "now",
  });
  const asset = {
    id: "hero",
    kind: "image",
    prompt: "hero",
    dimensions: { width: 16, height: 16 },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "base.png",
        prompt: "hero",
        createdAt: "now",
        scaledVariants: { medium: v("medium", 32), large: v("large", 64) },
      },
    },
  };
  const manifest = { schemaVersion: 1, assets: { hero: asset } };
  const textures = new Map([
    ["hero", 16],
    ...Object.values(asset.versions.v1.scaledVariants).map((v) => [
      aiScaledVariantTextureKey("hero", v),
      v.dimensions.width,
    ]),
  ]);
  const events = new EventEmitter(),
    scene = {
      events,
      textures: { exists: (k) => textures.has(k) },
      cameras: { main: { zoom: 1 } },
      game: {
        canvas: {
          width: 100,
          height: 100,
          getBoundingClientRect: () => ({ width: 100, height: 100 }),
        },
      },
    };
  const target = {
    width: 16,
    height: 16,
    scaleX: 2,
    scaleY: 2,
    texture: { key: "hero" },
    frame: { name: 3 },
    get displayWidth() {
      return this.width * this.scaleX;
    },
    get displayHeight() {
      return this.height * this.scaleY;
    },
    setTexture(key, frame) {
      this.texture = { key };
      this.frame = { name: frame ?? 3 };
      this.width = this.height = textures.get(key);
    },
    setDisplaySize(w, h) {
      this.scaleX = w / this.width;
      this.scaleY = h / this.height;
    },
  };
  return { asset, manifest, textures, events, scene, target };
}

test("bound textures switch with screen coverage and camera zoom while retaining display size and current frame", () => {
  const f = fixture(),
    runtime = new AiAssetRuntime(f.scene, f.manifest);
  const binding = runtime.bindTexture(f.target, "hero", {
    setInitialTexture: false,
  });
  f.events.emit("postupdate");
  assert.equal(
    f.target.texture.key,
    aiScaledVariantTextureKey(
      "hero",
      f.asset.versions.v1.scaledVariants.medium,
    ),
  );
  assert.equal(f.target.displayWidth, 32);
  assert.equal(f.target.frame.name, 3);
  f.scene.cameras.main.zoom = 2;
  f.events.emit("postupdate");
  assert.equal(
    f.target.texture.key,
    aiScaledVariantTextureKey("hero", f.asset.versions.v1.scaledVariants.large),
  );
  assert.equal(f.target.displayWidth, 32);
  f.scene.cameras.main.zoom = 0.5;
  f.events.emit("postupdate");
  assert.equal(f.target.texture.key, "hero");
  assert.equal(f.target.displayWidth, 32);
  binding.destroy();
  f.scene.cameras.main.zoom = 2;
  f.events.emit("postupdate");
  assert.equal(f.target.texture.key, "hero");
  f.events.emit("shutdown");
  assert.equal(f.events.listenerCount("postupdate"), 0);
});

test("live deletion falls back immediately, missing variants never use missing textures, and previews take priority", () => {
  const f = fixture(),
    runtime = new AiAssetRuntime(f.scene, f.manifest);
  runtime.bindTexture(f.target, "hero", { setInitialTexture: false });
  f.events.emit("postupdate");
  delete f.asset.versions.v1.scaledVariants.medium;
  delete f.asset.versions.v1.scaledVariants.large;
  runtime.syncManifest(f.manifest);
  assert.equal(f.target.texture.key, "hero");
  f.asset.versions.v1.scaledVariants = {
    notLoaded: {
      id: "notLoaded",
      dimensions: { width: 32, height: 32 },
      file: "future.png",
      method: "nearest",
      sourceFile: "base.png",
      createdAt: "now",
    },
  };
  f.events.emit("postupdate");
  assert.equal(f.target.texture.key, "hero");
  runtime.designerCallbacks().onPreview("hero", "preview", f.asset);
  f.events.emit("postupdate");
  assert.equal(f.target.texture.key, "preview");
});

test("loader includes version-scoped variant sheets with unchanged frame order and correct pixel geometry", () => {
  const f = fixture(),
    calls = [];
  f.asset.kind = "animation";
  f.asset.frameGrid = {
    frameWidth: 8,
    frameHeight: 8,
    columns: 2,
    rows: 2,
    frameCount: 4,
  };
  for (const v of Object.values(f.asset.versions.v1.scaledVariants))
    v.frameGrid = {
      frameWidth: v.dimensions.width / 2,
      frameHeight: v.dimensions.height / 2,
      columns: 2,
      rows: 2,
      frameCount: 4,
      margin: 0,
      spacing: 0,
    };
  const scene = {
    load: {
      image: (...args) => calls.push(["image", ...args]),
      spritesheet: (...args) => calls.push(["sheet", ...args]),
    },
  };
  loadAiAsset(scene, f.manifest, "hero", { baseUrl: "/game" });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][2], "/game/medium.png");
  assert.equal(calls[0][3].frameWidth, 16);
  assert.equal(calls[1][3].frameWidth, 32);
  assert.equal(calls[2][1], "hero");
});

test("games can disable automatic selection or explicitly choose a display-pixel size", () => {
  const f = fixture(),
    runtime = new AiAssetRuntime(f.scene, f.manifest, {
      scaledVariants: false,
    });
  runtime.bindTexture(f.target, "hero", { setInitialTexture: false });
  f.events.emit("postupdate");
  assert.equal(f.target.texture.key, "hero");
  const enabled = new AiAssetRuntime(f.scene, f.manifest);
  enabled.applyScaledVariant(f.target, "hero", {
    width: 64,
    height: 64,
    frame: 2,
  });
  assert.equal(
    f.target.texture.key,
    aiScaledVariantTextureKey("hero", f.asset.versions.v1.scaledVariants.large),
  );
  assert.equal(f.target.frame.name, 2);
  assert.equal(f.target.displayWidth, 32);
});

test("animation frame changes and authored scale updates do not compound variant resolution", () => {
  const f = fixture(),
    runtime = new AiAssetRuntime(f.scene, f.manifest);
  runtime.bindTexture(f.target, "hero", { setInitialTexture: false });
  for (let frame = 0; frame < 60; frame++) {
    f.events.emit("preupdate");
    assert.equal(f.target.texture.key, "hero");
    f.target.setTexture("hero", frame % 4); // Phaser animation selects an original frame.
    f.target.scaleX = f.target.scaleY = 2;
    f.events.emit("postupdate");
    assert.equal(f.target.displayWidth, 32);
    assert.equal(f.target.frame.name, frame % 4);
    assert.equal(
      f.target.texture.key,
      aiScaledVariantTextureKey(
        "hero",
        f.asset.versions.v1.scaledVariants.medium,
      ),
    );
  }
});
