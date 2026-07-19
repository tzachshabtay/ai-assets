import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { assertManifest } from "@ai-game-assets/core";
import {
  createAiAssetDevServer,
  generateTilesetAnimationBranches,
  serializeGeneratedTilesetAnimationOption
} from "../dist/index.js";
import {
  closestImageGenerationSize,
  gameAssetPrompt,
  tilesetBasePrompt
} from "../dist/provider.js";
import {
  deleteAssetVersion,
  ensureTargetVariant,
  readManifest,
  saveGeneratedOption,
  saveTilesetAnimation,
  writeManifest
} from "../dist/asset-store.js";

function tilesetAsset() {
  return {
    id: "forest",
    kind: "tileset",
    prompt: "A top-down forest tileset.",
    dimensions: { width: 32, height: 16 },
    tileset: {
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      rows: 1,
      animations: [
        { key: "water", prompt: "Loop the water.", frameCount: 2, frameRate: 8, repeat: -1 },
        { key: "torch", prompt: "Loop the torch.", frameCount: 2, frameRate: 10, repeat: -1 }
      ]
    },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/assets/forest.v1.png",
        prompt: "A top-down forest tileset.",
        createdAt: "2026-01-01T00:00:00.000Z",
        tilesetAnimations: {
          water: {
            files: ["/assets/forest.v1.water.1.png", "/assets/forest.v1.water.2.png"]
          },
          torch: {
            files: ["/assets/forest.v1.torch.1.png", "/assets/forest.v1.torch.2.png"]
          }
        }
      }
    }
  };
}

function pngImage(width, height, red) {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("tileset manifest validation enforces geometry and full-sheet sequence lengths", () => {
  const asset = tilesetAsset();
  assert.doesNotThrow(() => assertManifest({ schemaVersion: 1, assets: { forest: asset } }));

  const invalidGeometry = structuredClone(asset);
  invalidGeometry.dimensions.width = 31;
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { forest: invalidGeometry } }),
    /must match its tileset grid/
  );

  const invalidSequence = structuredClone(asset);
  invalidSequence.versions.v1.tilesetAnimations.water.files.pop();
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { forest: invalidSequence } }),
    /must contain exactly 2 files/
  );
});

test("structured tileset validation requires one non-empty prompt per usable tile", () => {
  const asset = tilesetAsset();
  asset.tileset.tiles = [
    { prompt: "Seamless mossy grass." },
    { prompt: "Dark forest soil." }
  ];
  assert.doesNotThrow(() => assertManifest({ schemaVersion: 1, assets: { forest: asset } }));

  const missingTile = structuredClone(asset);
  missingTile.tileset.tiles.pop();
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { forest: missingTile } }),
    /forest\.tileset\.tiles must contain exactly 2 entries/
  );

  const blankPrompt = structuredClone(asset);
  blankPrompt.tileset.tiles[1].prompt = "   ";
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { forest: blankPrompt } }),
    /forest\.tileset\.tiles\.1\.prompt must be a non-empty string/
  );

  asset.tileset.animations[0].tiles = [
    { prompt: "Keep the grass still." },
    { prompt: "Ripple the water." }
  ];
  assert.doesNotThrow(() => assertManifest({ schemaVersion: 1, assets: { forest: asset } }));

  const missingAnimationTile = structuredClone(asset);
  missingAnimationTile.tileset.animations[0].tiles.pop();
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { forest: missingAnimationTile } }),
    /forest\.tileset\.animations\.0\.tiles must contain exactly 2 entries/
  );
});

test("structured tileset prompts bake geometry and preserve exact tile order", () => {
  const asset = tilesetAsset();
  asset.prompt = "Legacy master prefix that must not be duplicated.";
  asset.tileset.tiles = [
    { prompt: "Seamless mossy grass." },
    { prompt: "Dark forest soil with scattered pebbles." }
  ];

  const basePrompt = tilesetBasePrompt(asset);
  assert.equal(basePrompt, [
    "Create a deterministic hand-authored 16×16 pixel tileset.",
    "Output one 32×16 image arranged as a 2-column × 1-row grid with no margin or spacing.",
    "Read tiles left-to-right, then top-to-bottom.",
    "Use one cohesive visual style, palette, scale, lighting, perspective, and pixel treatment across every tile.",
    "Draw exactly these 2 tiles in this exact order:",
    "Tile 1 — Seamless mossy grass.",
    "Tile 2 — Dark forest soil with scattered pebbles."
  ].join("\n"));

  const providerPrompt = gameAssetPrompt({ asset }, {
    prompt: asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "opaque",
    chromaKey: { red: 255, green: 0, blue: 255 }
  });
  assert.equal(providerPrompt.split(basePrompt).length - 1, 1);
  assert.ok(providerPrompt.startsWith(basePrompt));
  assert.doesNotMatch(providerPrompt, /Legacy master prefix/);

  const explicitPrompt = gameAssetPrompt({ asset, prompt: "Use a moonlit blue palette." }, {
    prompt: "Use a moonlit blue palette.",
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "opaque",
    chromaKey: { red: 255, green: 0, blue: 255 }
  });
  assert.match(explicitPrompt, /^Use a moonlit blue palette\./);
  assert.ok(explicitPrompt.indexOf(basePrompt) > 0);
  assert.ok(explicitPrompt.indexOf("Tile 1 —") < explicitPrompt.indexOf("Tile 2 —"));
});

test("base tileset variations never receive animation variation instructions", () => {
  const asset = tilesetAsset();
  asset.tileset.tiles = [
    { prompt: "Seamless mossy grass." },
    { prompt: "A centered brass key on transparent padding." }
  ];
  const context = {
    prompt: asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "transparent",
    chromaKey: { red: 255, green: 0, blue: 255 },
    variation: "candidate-two",
    variationIndex: 1,
    variationCount: 3
  };

  const basePrompt = gameAssetPrompt({ asset }, context);
  assert.match(basePrompt, /complete base tileset candidate/i);
  assert.match(basePrompt, /Base tileset variation direction/i);
  assert.match(basePrompt, /Never animate a tile/i);
  assert.doesNotMatch(basePrompt, /coherent motion treatment/i);
  assert.doesNotMatch(basePrompt, /pose progression|different timing|secondary motion/i);

  const animationPrompt = gameAssetPrompt({
    asset,
    purpose: "tileset-animation",
    references: [{
      image: pngImage(32, 16, 12),
      mimeType: "image/png",
      fileName: "base.png"
    }]
  }, context);
  assert.match(animationPrompt, /coherent motion treatment/i);
  assert.doesNotMatch(animationPrompt, /Base tileset variation direction/i);
});

test("image generation chooses the closest supported aspect ratio by default", () => {
  assert.equal(closestImageGenerationSize({ width: 128, height: 64 }), "1536x1024");
  assert.equal(closestImageGenerationSize({ width: 64, height: 128 }), "1024x1536");
  assert.equal(closestImageGenerationSize({ width: 96, height: 96 }), "1024x1024");
});

test("tileset base generation and promotion honor tile and grid geometry overrides", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-base-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const manifest = { schemaVersion: 1, assets: { forest: tilesetAsset() } };
  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let generationAsset;
  const provider = {
    async generate(request) {
      generationAsset = request.asset;
      return [{
        image: pngImage(request.asset.dimensions.width, request.asset.dimensions.height, 12),
        mimeType: "image/png",
        prompt: request.prompt,
        dimensions: request.asset.dimensions,
        tileset: request.asset.tileset
      }];
    }
  };
  const devServer = createAiAssetDevServer({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider,
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    for (const invalidTileCount of [0, 1.5, 3]) {
      const invalidResponse = await fetch(`${origin}/__ai-assets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: "forest",
          tileset: { tileWidth: 24, tileHeight: 20, tileCount: invalidTileCount }
        })
      });
      assert.equal(invalidResponse.status, 500);
      const invalid = await invalidResponse.json();
      assert.match(
        invalid.error,
        invalidTileCount > 2 ? /must not exceed columns \* rows/ : /must be a positive integer/
      );
    }

    const generationResponse = await fetch(`${origin}/__ai-assets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: "forest",
        tileset: {
          tileWidth: 24,
          tileHeight: 20,
          columns: 1,
          rows: 1,
          tileCount: 1,
          tiles: [{ prompt: "One seamless grass tile." }]
        }
      })
    });
    assert.equal(generationResponse.status, 200);
    const generated = (await generationResponse.json()).options[0];
    assert.deepEqual(generationAsset.tileset, {
      ...tilesetAsset().tileset,
      tileWidth: 24,
      tileHeight: 20,
      columns: 1,
      rows: 1,
      tileCount: 1,
      tiles: [{ prompt: "One seamless grass tile." }]
    });
    assert.deepEqual(generationAsset.dimensions, { width: 24, height: 20 });
    assert.deepEqual(generated.tileset, generationAsset.tileset);
    assert.deepEqual(generated.dimensions, generationAsset.dimensions);

    const saveResponse = await fetch(`${origin}/__ai-assets/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: "forest",
        versionName: "resized",
        dataUrl: generated.dataUrl,
        prompt: generated.prompt,
        dimensions: generated.dimensions,
        tileset: generated.tileset,
        activate: true
      })
    });
    assert.equal(saveResponse.status, 200);
    const saveResult = await saveResponse.json();
    assert.equal(saveResult.versionName, "resized");
    assert.equal(saveResult.asset.activeVersion, "resized");
    assert.equal(saveResult.version.name, "resized");
    assert.equal(saveResult.file, saveResult.version.file);
    assert.equal(saveResult.filePath, path.join(assetsDir, path.basename(saveResult.file)));
    assert.equal(saveResult.manifest.assets.forest.activeVersion, "resized");

    const saved = await readManifest(manifestPath);
    assert.deepEqual(saveResult.manifest, saved);
    assert.deepEqual(saveResult.asset, saved.assets.forest);
    assert.equal(saved.assets.forest.activeVersion, "resized");
    assert.deepEqual(saved.assets.forest.dimensions, { width: 24, height: 20 });
    assert.deepEqual(saved.assets.forest.tileset, generationAsset.tileset);
  } finally {
    await devServer.close();
  }
});

test("tileset animation generation isolates tile ownership while preserving per-tile history", async () => {
  const calls = [];
  const provider = {
    async generate(request) {
      calls.push(request);
      const tile = request.asset.tileset.tiles[0].prompt.includes("grass") ? 0 : 1;
      const frame = Number(/animation frame (\d+) of/.exec(request.prompt)?.[1]) - 1;
      const branch = Number(/candidate branch (\d+) of/.exec(request.prompt)?.[1]) - 1;
      return [{
        image: pngImage(16, 16, 40 + tile * 80 + frame * 20 + branch * 3),
        mimeType: "image/png",
        prompt: request.prompt,
        dimensions: request.asset.dimensions,
        tileset: request.asset.tileset
      }];
    }
  };

  const asset = tilesetAsset();
  asset.tileset.tiles = [
    { prompt: "Seamless mossy grass." },
    { prompt: "Dark forest water." }
  ];
  asset.tileset.animations[0].tiles = [
    { prompt: "Tile zero stays perfectly still." },
    { prompt: "Tile one ripples clockwise." }
  ];
  const base = new PNG({ width: 32, height: 16 });
  for (let y = 0; y < base.height; y += 1) {
    for (let x = 0; x < base.width; x += 1) {
      const offset = (y * base.width + x) * 4;
      base.data[offset] = x < 16 ? 11 : 22;
      base.data[offset + 3] = 255;
    }
  }
  const options = await generateTilesetAnimationBranches(provider, {
    asset,
    animationKey: "water",
    count: 99,
    baseReference: {
      image: PNG.sync.write(base),
      mimeType: "image/png",
      fileName: "base-forest.png"
    }
  });

  assert.equal(options.length, 3);
  assert.deepEqual(options.map((option) => option.index), [0, 1, 2]);
  assert.ok(options.every((option) => option.frames.length === 2));
  assert.equal(calls.length, 12);
  assert.equal(calls.filter((call) => call.references.length === 1).length, 6);
  assert.equal(calls.filter((call) => call.references.length === 2).length, 6);
  assert.ok(calls.every((call) => call.purpose === "tileset-animation"));
  assert.ok(calls.every((call) => call.asset.tileset.columns === 1));
  assert.ok(calls.every((call) => call.asset.tileset.rows === 1));
  assert.ok(calls.every((call) => call.asset.tileset.tileCount === 1));
  assert.ok(calls.every((call) => call.asset.dimensions.width === 16));
  assert.ok(calls.every((call) => call.asset.dimensions.height === 16));
  assert.ok(calls.every((call) => call.settings.size === undefined));
  assert.ok(calls.every((call) => /base-forest\.tile-[12]\.png/.test(
    call.references[0].fileName
  )));
  assert.ok(calls.every((call) => {
    const tile = call.asset.tileset.tiles[0].prompt.includes("grass") ? 1 : 2;
    return call.references.every((reference, index) => (
      index === 0 || reference.fileName.includes(`tile-${tile}-frame-`)
    ));
  }));
  assert.ok(calls.every((call) => /return exactly this one complete tile image/i.test(
    call.prompt
  )));
  assert.ok(calls.every((call) => !/never an individual tile/i.test(call.prompt)));
  assert.match(
    calls.find((call) => call.references.length === 2).prompt,
    /Reference 1 is the immutable spatial source of truth/
  );
  assert.match(calls[0].prompt, /Full-sheet tileset geometry: output exactly one 16x16 sheet/);
  assert.match(calls[0].prompt, /Exact usable tile rectangles: Tile 1 \[x=0-15, y=0-15\]/);
  assert.doesNotMatch(calls[0].prompt, /Tile 2 \[/);
  assert.ok(calls.every((call) => {
    const tile = call.asset.tileset.tiles[0].prompt.includes("grass") ? 0 : 1;
    const reference = PNG.sync.read(call.references[0].image);
    return reference.data[0] === (tile === 0 ? 11 : 22);
  }));

  const finalProviderPrompt = gameAssetPrompt(calls[0], {
    prompt: calls[0].prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "opaque",
    chromaKey: { red: 255, green: 0, blue: 255 }
  });
  assert.match(finalProviderPrompt, /Perform a minimal in-place edit/);
  assert.match(finalProviderPrompt, /Reference 1 always controls this tile's geometry/);
  assert.doesNotMatch(finalProviderPrompt, /do not redraw the sheet|shifted grid/);
  assert.doesNotMatch(finalProviderPrompt, /Draw exactly these/);

  for (const [branch, option] of options.entries()) {
    for (let frame = 0; frame < option.frames.length; frame += 1) {
      const sheet = PNG.sync.read(option.frames[frame].image);
      assert.deepEqual({ width: sheet.width, height: sheet.height }, { width: 32, height: 16 });
      assert.equal(sheet.data[0], 40 + frame * 20 + branch * 3);
      assert.equal(sheet.data[16 * 4], 120 + frame * 20 + branch * 3);
      assert.deepEqual(option.frames[frame].dimensions, asset.dimensions);
      assert.deepEqual(option.frames[frame].tileset, asset.tileset);
    }
  }

  const serialized = serializeGeneratedTilesetAnimationOption(options[0]);
  assert.deepEqual(serialized.frames.map((frame) => frame.index), [0, 1]);
});

test("tileset animation isolation preserves trailing grid cells when only one tile is usable", async () => {
  const asset = tilesetAsset();
  asset.tileset.tileCount = 1;
  asset.tileset.tiles = [{ prompt: "Seamless mossy grass." }];
  asset.tileset.animations[0] = {
    ...asset.tileset.animations[0],
    frameCount: 1,
    tiles: [{ prompt: "Grass moves gently in the wind." }]
  };
  const base = new PNG({ width: 32, height: 16 });
  for (let offset = 0; offset < base.data.length; offset += 4) {
    const x = (offset / 4) % base.width;
    base.data[offset] = x < 16 ? 11 : 99;
    base.data[offset + 3] = 255;
  }
  const calls = [];
  const provider = {
    async generate(request) {
      calls.push(request);
      return [{
        image: pngImage(16, 16, 55),
        mimeType: "image/png",
        prompt: request.prompt
      }];
    }
  };

  const [option] = await generateTilesetAnimationBranches(provider, {
    asset,
    animationKey: "water",
    count: 1,
    baseReference: {
      image: PNG.sync.write(base),
      mimeType: "image/png",
      fileName: "base-one-usable.png"
    }
  });
  const frame = PNG.sync.read(option.frames[0].image);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].asset.tileset.columns, 1);
  assert.equal(calls[0].asset.tileset.tileCount, 1);
  assert.equal(frame.data[0], 55);
  assert.equal(frame.data[16 * 4], 99);
});

test("one-cell generation overrides reconcile inherited tileset animation prompts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-one-cell-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const asset = tilesetAsset();
  asset.tileset.tiles = [
    { prompt: "Mossy grass." },
    { prompt: "Shallow water." }
  ];
  asset.tileset.animations[0].tiles = [
    { prompt: "Keep the grass still." },
    { prompt: "Ripple the water." }
  ];
  asset.tileset.animations[1].tiles = [
    { prompt: "Keep the grass still." },
    { prompt: "Flicker the torch light." }
  ];
  const manifest = { schemaVersion: 1, assets: { forest: asset } };
  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const providerRequests = [];
  const provider = {
    async generate(request) {
      providerRequests.push(request);
      return [{
        image: pngImage(request.asset.dimensions.width, request.asset.dimensions.height, 21),
        mimeType: "image/png",
        prompt: request.prompt,
        dimensions: request.asset.dimensions
      }];
    }
  };
  const devServer = createAiAssetDevServer({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider,
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const oneCellTileset = {
    tileWidth: 16,
    tileHeight: 16,
    columns: 1,
    rows: 1,
    tileCount: 1,
    tiles: [{ prompt: "Shallow water." }]
  };

  try {
    const baseResponse = await fetch(`${origin}/__ai-assets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: "forest",
        count: 1,
        tileset: oneCellTileset
      })
    });
    assert.equal(baseResponse.status, 200);
    const baseOption = (await baseResponse.json()).options[0];
    const baseRequest = providerRequests[0];
    assert.deepEqual(baseRequest.asset.dimensions, { width: 16, height: 16 });
    assert.deepEqual(baseRequest.asset.tileset.tiles, oneCellTileset.tiles);
    assert.ok(baseRequest.asset.tileset.animations.every(
      (animation) => animation.tiles === undefined
    ));
    assert.deepEqual(baseOption.dimensions, { width: 16, height: 16 });

    const oneCellBase = pngImage(16, 16, 99);
    const animationResponse = await fetch(
      `${origin}/__ai-assets/generate-tileset-animation-stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: "forest",
          animationKey: "water",
          count: 1,
          frameCount: 1,
          tiles: [{ prompt: "Ripple only this isolated water tile." }],
          tileset: oneCellTileset,
          baseDataUrl: `data:image/png;base64,${oneCellBase.toString("base64")}`
        })
      }
    );
    assert.equal(animationResponse.status, 200);
    const events = (await animationResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const optionEvent = events.find((event) => event.type === "option");
    assert.ok(optionEvent);
    assert.deepEqual(optionEvent.option.frames[0].dimensions, { width: 16, height: 16 });
    assert.equal(events.at(-1).type, "done");

    const animationRequest = providerRequests[1];
    assert.deepEqual(animationRequest.asset.dimensions, { width: 16, height: 16 });
    assert.deepEqual(
      animationRequest.asset.tileset.animations.find(
        (animation) => animation.key === "water"
      ).tiles,
      [{ prompt: "Ripple only this isolated water tile." }]
    );
    assert.equal(
      animationRequest.asset.tileset.animations.find(
        (animation) => animation.key === "torch"
      ).tiles,
      undefined
    );

    const unchanged = await readManifest(manifestPath);
    assert.equal(unchanged.assets.forest.tileset.tiles.length, 2);
    assert.equal(unchanged.assets.forest.tileset.animations[0].tiles.length, 2);
    assert.equal(unchanged.assets.forest.tileset.animations[1].tiles.length, 2);
  } finally {
    await devServer.close();
  }
});

test("tileset animation save composes and deletes an atomic version bundle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const asset = tilesetAsset();
  const manifest = { schemaVersion: 1, assets: { forest: asset } };

  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(assetsDir, "forest.v1.png"), "base"),
    writeFile(path.join(assetsDir, "forest.v1.water.1.png"), "old-water-1"),
    writeFile(path.join(assetsDir, "forest.v1.water.2.png"), "old-water-2"),
    writeFile(path.join(assetsDir, "forest.v1.torch.1.png"), "torch-1"),
    writeFile(path.join(assetsDir, "forest.v1.torch.2.png"), "torch-2"),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  ]);

  await assert.rejects(
    saveTilesetAnimation({ manifestPath, assetsDir }, {
      assetId: "forest",
      animationKey: "water",
      versionName: "wrong-size",
      frames: [
        { image: pngImage(16, 16, 1), mimeType: "image/png" },
        { image: pngImage(32, 16, 2), mimeType: "image/png" }
      ]
    }),
    /must be 32x16; received 16x16/
  );

  const result = await saveTilesetAnimation({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets"
  }, {
    assetId: "forest",
    animationKey: "water",
    versionName: "v2",
    frames: [
      { image: pngImage(32, 16, 11), mimeType: "image/png" },
      { image: pngImage(32, 16, 22), mimeType: "image/png" }
    ]
  });

  assert.equal(result.asset.activeVersion, "v2");
  assert.equal(result.version.parentVersion, "v1");
  assert.equal(result.version.tilesetAnimations.water.files.length, 2);
  assert.equal(result.version.tilesetAnimations.torch.files.length, 2);
  assert.equal(await readFile(result.filePath, "utf8"), "base");
  assert.deepEqual(
    await Promise.all(result.version.tilesetAnimations.water.files.map(async (file) =>
      PNG.sync.read(await readFile(path.join(assetsDir, path.basename(file)))).data[0]
    )),
    [11, 22]
  );
  assert.deepEqual(
    await Promise.all(result.version.tilesetAnimations.torch.files.map((file) =>
      readFile(path.join(assetsDir, path.basename(file)), "utf8")
    )),
    ["torch-1", "torch-2"]
  );

  const resetManifest = await readManifest(manifestPath);
  resetManifest.assets.forest.activeVersion = "v1";
  await writeManifest(manifestPath, resetManifest);
  await deleteAssetVersion({ manifestPath, assetsDir }, {
    assetId: "forest",
    versionName: "v2"
  });
  await assert.rejects(readFile(result.filePath), /ENOENT/);
  for (const filePath of result.animationFilePaths) {
    await assert.rejects(readFile(filePath), /ENOENT/);
  }

  const promoted = await saveGeneratedOption({ manifestPath, assetsDir }, {
    assetId: "forest",
    versionName: "v3",
    activate: true,
    option: {
      image: Buffer.from("replacement-base"),
      mimeType: "image/png",
      prompt: "Replacement forest base.",
      dimensions: asset.dimensions
    }
  });
  assert.equal(promoted.version.tilesetAnimations, undefined);
});

test("deleting a target variant version preserves files shared with its source asset", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-shared-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const asset = tilesetAsset();
  asset.versions.v2 = {
    ...structuredClone(asset.versions.v1),
    name: "v2",
    file: "/assets/forest.v2.png",
    tilesetAnimations: {
      water: {
        files: ["/assets/forest.v2.water.1.png", "/assets/forest.v2.water.2.png"]
      },
      torch: {
        files: ["/assets/forest.v2.torch.1.png", "/assets/forest.v2.torch.2.png"]
      }
    }
  };
  const sharedFiles = [
    "forest.v2.png",
    "forest.v2.water.1.png",
    "forest.v2.water.2.png",
    "forest.v2.torch.1.png",
    "forest.v2.torch.2.png"
  ];
  const manifest = {
    schemaVersion: 1,
    assets: { forest: asset },
    targets: {
      mobile: { id: "mobile", variants: {} }
    }
  };

  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    ...sharedFiles.map((file) => writeFile(path.join(assetsDir, file), file)),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  ]);

  const variant = await ensureTargetVariant({ manifestPath, assetsDir }, {
    targetId: "mobile",
    assetId: "forest"
  });
  await deleteAssetVersion({ manifestPath, assetsDir }, {
    assetId: variant.assetId,
    versionName: "v2"
  });

  const updated = await readManifest(manifestPath);
  assert.ok(updated.assets.forest.versions.v2);
  assert.equal(updated.assets[variant.assetId].versions.v2, undefined);
  assert.deepEqual(
    await Promise.all(sharedFiles.map((file) => readFile(path.join(assetsDir, file), "utf8"))),
    sharedFiles
  );
});

test("tileset animation HTTP endpoints stream indexed branches and save composed PNGs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-server-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const asset = tilesetAsset();
  const manifest = { schemaVersion: 1, assets: { forest: asset } };
  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(assetsDir, "forest.v1.png"), pngImage(32, 16, 3)),
    writeFile(path.join(assetsDir, "forest.v1.water.1.png"), pngImage(32, 16, 4)),
    writeFile(path.join(assetsDir, "forest.v1.water.2.png"), pngImage(32, 16, 5)),
    writeFile(path.join(assetsDir, "forest.v1.torch.1.png"), pngImage(32, 16, 6)),
    writeFile(path.join(assetsDir, "forest.v1.torch.2.png"), pngImage(32, 16, 7)),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  ]);

  let generatedColor = 20;
  const providerRequests = [];
  const provider = {
    async generate(request) {
      providerRequests.push(request);
      generatedColor += 1;
      return [{
        image: pngImage(32, 16, generatedColor),
        mimeType: "image/png",
        prompt: request.prompt,
        dimensions: { width: 32, height: 16 }
      }];
    }
  };
  const devServer = createAiAssetDevServer({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider,
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const providedBase = pngImage(32, 16, 99);

  try {
    const streamResponse = await fetch(`${origin}/__ai-assets/generate-tileset-animation-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: "forest",
        animationKey: "water",
        count: 1,
        frameCount: 3,
        tiles: [
          { prompt: "Keep tile one still." },
          { prompt: "Animate tile two." }
        ],
        baseDataUrl: `data:image/png;base64,${providedBase.toString("base64")}`,
        styleGuide: { prompt: "Hand-painted moonlit forest.", images: [] }
      })
    });
    assert.equal(streamResponse.status, 200);
    const events = (await streamResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const branchEvents = events.filter((event) => event.type === "option");
    assert.equal(branchEvents.length, 1);
    assert.deepEqual(
      branchEvents.map((event) => event.option.index).sort(),
      [0]
    );
    assert.ok(branchEvents.every((event) =>
      event.option.animationKey === "water" &&
      event.option.frames.map((frame) => frame.index).join(",") === "0,1,2"
    ));
    assert.equal(events.at(-1).type, "done");
    assert.ok(providerRequests.every((request) =>
      request.stylePrompt === "Hand-painted moonlit forest."
    ));
    assert.ok(providerRequests.every((request) =>
      Buffer.compare(request.references[0].image, providedBase) === 0
    ));

    const frames = branchEvents[0].option.frames.map((frame) => frame.dataUrl);
    const saveResponse = await fetch(`${origin}/__ai-assets/save-tileset-animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: "forest",
        animationKey: "water",
        frames,
        definition: {
          ...asset.tileset.animations[0],
          frameCount: 3,
          tiles: [
            { prompt: "Keep tile one still." },
            { prompt: "Animate tile two." }
          ],
          frameTimings: [{ delayMs: 125 }, { delayMs: 125 }, { delayMs: 125 }]
        },
        versionName: "http-v2"
      })
    });
    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.versionName, "http-v2");
    assert.equal(saved.asset.activeVersion, "http-v2");
    assert.equal(saved.version.tilesetAnimations.water.files.length, 3);
    assert.equal(saved.asset.tileset.animations[0].frameCount, 3);
    assert.equal(saved.asset.versions.v1.tilesetAnimations.water.files.length, 2);
    assert.match(saved.file, /forest\.http-v2\..+\.png$/);
  } finally {
    await devServer.close();
  }
});

test("tileset animation streaming aborts provider work when the client disconnects", {
  timeout: 5_000
}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-abort-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const manifest = { schemaVersion: 1, assets: { forest: tilesetAsset() } };
  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(assetsDir, "forest.v1.png"), pngImage(32, 16, 3)),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  ]);

  const providerSignals = [];
  let abortedProviderCount = 0;
  let markAllBranchesStarted;
  const allBranchesStarted = new Promise((resolve) => {
    markAllBranchesStarted = resolve;
  });
  let markAllBranchesAborted;
  const allBranchesAborted = new Promise((resolve) => {
    markAllBranchesAborted = resolve;
  });
  const provider = {
    async generate(request) {
      providerSignals.push(request.signal);
      if (providerSignals.length === 3) markAllBranchesStarted();

      return await new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          abortedProviderCount += 1;
          if (abortedProviderCount === 3) markAllBranchesAborted();
          reject(request.signal.reason);
        }, { once: true });
      });
    }
  };
  const devServer = createAiAssetDevServer({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider,
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const clientController = new AbortController();

  try {
    const stream = fetch(`${origin}/__ai-assets/generate-tileset-animation-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: "forest", animationKey: "water" }),
      signal: clientController.signal
    }).then((response) => response.text());

    await allBranchesStarted;
    clientController.abort();
    await assert.rejects(stream, /abort/i);
    await allBranchesAborted;

    assert.equal(providerSignals.length, 3);
    assert.ok(providerSignals.every((signal) => signal instanceof AbortSignal));
    assert.ok(providerSignals.every((signal) => signal.aborted));
  } finally {
    clientController.abort();
    await devServer.close();
  }
});
