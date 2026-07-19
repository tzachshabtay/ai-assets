import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  composeTilesetGeneratedOption,
  createAiAssetDevServer,
  createOpenAiImageProvider,
  extractTilesetCellImage,
  generateAssetWithIsolatedTilesetCells
} from "../dist/index.js";

test("wide logical tilesets use model-native one-cell aspect ratios instead of squeezing one sheet", async () => {
  const originalFetch = globalThis.fetch;
  const requestedSizes = [];
  const rawModelImage = solidPng(12, 12, [70, 80, 90, 255]);

  try {
    globalThis.fetch = async (_url, init) => {
      requestedSizes.push(
        init.body instanceof FormData
          ? init.body.get("size")
          : JSON.parse(init.body).size
      );
      return new Response(JSON.stringify({
        data: [{ b64_json: rawModelImage.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };
    const asset = tilesetAsset({ tileWidth: 2, tileHeight: 2, columns: 4, rows: 1 });
    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const [option] = await generateAssetWithIsolatedTilesetCells(provider, {
      asset,
      count: 1,
      settings: { format: "png" }
    });

    assert.deepEqual(requestedSizes, [
      "1024x1024",
      "1024x1024",
      "1024x1024",
      "1024x1024"
    ]);
    const sheet = PNG.sync.read(option.image);
    assert.deepEqual({ width: sheet.width, height: sheet.height }, { width: 8, height: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tileset cell composition preserves exact margins, spacing, non-square cells, and unused cells", async () => {
  const asset = tilesetAsset({
    tileWidth: 3,
    tileHeight: 2,
    columns: 3,
    rows: 2,
    tileCount: 5,
    margin: 1,
    spacing: 1
  });
  const colors = [
    [220, 20, 20, 255],
    [20, 220, 20, 255],
    [20, 20, 220, 255],
    [220, 180, 20, 255],
    [180, 20, 220, 255]
  ];
  const cells = colors.map((color, index) => generatedOption(
    solidPng(6, 4, color),
    `tile-${index + 1}`
  ));

  const option = await composeTilesetGeneratedOption(asset, cells);
  const sheet = PNG.sync.read(option.image);

  assert.deepEqual({ width: sheet.width, height: sheet.height }, asset.dimensions);
  assert.equal(option.mimeType, "image/png");
  assert.deepEqual(option.tileset, asset.tileset);

  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      const expectedTile = tileAt(asset, x, y);
      assert.deepEqual(
        rgbaAt(sheet, x, y),
        expectedTile === undefined ? [0, 0, 0, 0] : colors[expectedTile],
        `unexpected pixel at ${x},${y}`
      );
    }
  }
});

test("tileset cell composition can preserve a full-sheet base outside usable cells", async () => {
  const asset = tilesetAsset({
    tileWidth: 2,
    tileHeight: 2,
    columns: 2,
    rows: 1,
    tileCount: 1,
    margin: 1,
    spacing: 1
  });
  const baseColor = [9, 18, 27, 255];
  const cellColor = [210, 40, 50, 255];
  const option = await composeTilesetGeneratedOption(
    asset,
    [generatedOption(solidPng(2, 2, cellColor), "animated-cell")],
    { baseImage: solidPng(asset.dimensions.width, asset.dimensions.height, baseColor) }
  );
  const sheet = PNG.sync.read(option.image);

  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      assert.deepEqual(
        rgbaAt(sheet, x, y),
        tileAt(asset, x, y) === 0 ? cellColor : baseColor,
        `unexpected seeded pixel at ${x},${y}`
      );
    }
  }
});

test("tileset cell extraction crops a scaled full-sheet reference without neighboring pixels", async () => {
  const asset = tilesetAsset({
    tileWidth: 3,
    tileHeight: 2,
    columns: 2,
    rows: 2,
    margin: 1,
    spacing: 1
  });
  const source = new PNG({
    width: asset.dimensions.width * 3,
    height: asset.dimensions.height * 3
  });
  const colors = [
    [210, 10, 10, 255],
    [10, 210, 10, 255],
    [10, 10, 210, 255],
    [210, 160, 10, 255]
  ];

  for (let tile = 0; tile < colors.length; tile += 1) {
    const bounds = logicalTileBounds(asset, tile);
    fillRect(source, {
      x: bounds.x * 3,
      y: bounds.y * 3,
      width: bounds.width * 3,
      height: bounds.height * 3
    }, colors[tile]);
  }

  const extracted = PNG.sync.read(await extractTilesetCellImage(
    asset,
    PNG.sync.write(source),
    2
  ));

  assert.deepEqual(
    { width: extracted.width, height: extracted.height },
    { width: asset.tileset.tileWidth, height: asset.tileset.tileHeight }
  );
  for (let y = 0; y < extracted.height; y += 1) {
    for (let x = 0; x < extracted.width; x += 1) {
      assert.deepEqual(rgbaAt(extracted, x, y), colors[2]);
    }
  }
});

test("tileset cell extraction safely scales even a tiny full-sheet reference", async () => {
  const asset = tilesetAsset({
    tileWidth: 3,
    tileHeight: 2,
    columns: 4,
    rows: 1
  });
  const extracted = PNG.sync.read(await extractTilesetCellImage(
    asset,
    solidPng(1, 1, [17, 29, 41, 255]),
    3
  ));

  assert.deepEqual(
    { width: extracted.width, height: extracted.height },
    { width: asset.tileset.tileWidth, height: asset.tileset.tileHeight }
  );
  assert.deepEqual(rgbaAt(extracted, 0, 0), [17, 29, 41, 255]);
  assert.deepEqual(rgbaAt(extracted, extracted.width - 1, extracted.height - 1), [17, 29, 41, 255]);
});

test("multi-cell base tilesets generate every tile independently and stream complete branches only", async () => {
  const asset = tilesetAsset({
    tileWidth: 2,
    tileHeight: 2,
    columns: 4,
    rows: 1
  });
  const calls = [];
  const callbacks = [];
  const provider = {
    async generate(request) {
      calls.push(request);
      const tile = Number(/tile-(\d+)/.exec(request.asset.tileset.tiles[0].prompt)?.[1]) - 1;
      const branch = Number(/candidate option (\d+)/.exec(request.prompt)?.[1]) - 1;
      assert.equal(request.asset.tileset.columns, 1);
      assert.equal(request.asset.tileset.rows, 1);
      assert.equal(request.asset.tileset.tileCount, 1);
      assert.deepEqual(request.asset.dimensions, { width: 2, height: 2 });
      assert.equal(request.settings.format, "png");
      assert.equal(request.settings.size, undefined);
      return [generatedOption(
        solidPng(5, 7, [40 + tile * 30, 50 + branch * 40, 90, 255]),
        request.prompt
      )];
    }
  };
  const originalStyle = {
    image: solidPng(2, 2, [7, 8, 9, 255]),
    mimeType: "image/png",
    fileName: "style.png"
  };

  const options = await generateAssetWithIsolatedTilesetCells(provider, {
    asset,
    count: 3,
    settings: { format: "png", size: "1536x1024" },
    styleReferences: [originalStyle]
  }, (option, index) => {
    callbacks.push({ option, index });
  });

  assert.equal(calls.length, 12);
  assert.equal(options.length, 3);
  assert.equal(callbacks.length, 3);
  assert.deepEqual(callbacks.map(({ index }) => index).sort(), [0, 1, 2]);

  for (const call of calls) {
    const tile = Number(/tile-(\d+)/.exec(call.asset.tileset.tiles[0].prompt)?.[1]) - 1;
    assert.equal(call.styleReferences[0], originalStyle);
    assert.equal(call.styleReferences.length, tile === 0 ? 1 : 2);
  }

  for (let branch = 0; branch < options.length; branch += 1) {
    const sheet = PNG.sync.read(options[branch].image);
    assert.deepEqual({ width: sheet.width, height: sheet.height }, { width: 8, height: 2 });

    for (let tile = 0; tile < 4; tile += 1) {
      assert.deepEqual(
        rgbaAt(sheet, tile * 2, 0),
        [40 + tile * 30, 50 + branch * 40, 90, 255]
      );
    }
  }
});

test("one-cell tileset generation stays a single provider request", async () => {
  const asset = tilesetAsset({ tileWidth: 2, tileHeight: 3, columns: 1, rows: 1 });
  let callCount = 0;
  let callbackCount = 0;
  const provider = {
    async generate(request, onOption) {
      callCount += 1;
      const options = Array.from({ length: request.count }, (_, index) => (
        generatedOption(solidPng(2, 3, [30 + index, 40, 50, 255]), `option-${index}`)
      ));
      for (const [index, option] of options.entries()) await onOption?.(option, index);
      return options;
    }
  };

  const generated = await generateAssetWithIsolatedTilesetCells(provider, {
    asset,
    count: 3
  }, () => {
    callbackCount += 1;
  });

  assert.equal(callCount, 1);
  assert.equal(callbackCount, 3);
  assert.equal(generated.length, 3);
});

test("isolated tileset generation honors cancellation before starting provider work", async () => {
  const asset = tilesetAsset({ tileWidth: 2, tileHeight: 2, columns: 2, rows: 1 });
  const controller = new AbortController();
  let called = false;
  const provider = {
    async generate() {
      called = true;
      return [];
    }
  };

  controller.abort(new Error("cancelled tileset"));
  await assert.rejects(
    generateAssetWithIsolatedTilesetCells(provider, {
      asset,
      count: 1,
      signal: controller.signal
    }),
    /cancelled tileset/
  );
  assert.equal(called, false);
});

test("ensure-first-drafts also composes structured tilesets from isolated cells", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-isolated-first-draft-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const asset = tilesetAsset({ tileWidth: 2, tileHeight: 2, columns: 2, rows: 1 });
  asset.activeVersion = "";
  asset.versions = {};
  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    assets: { [asset.id]: asset }
  }, null, 2)}\n`);
  const calls = [];
  const server = createAiAssetDevServer({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider: {
      async generate(request) {
        calls.push(request);
        const tile = Number(/tile-(\d+)/.exec(request.asset.tileset.tiles[0].prompt)?.[1]) - 1;
        return [generatedOption(
          solidPng(2, 2, [80 + tile * 80, 30, 40, 255]),
          request.prompt
        )];
      }
    },
    port: 0
  });
  await server.listen();
  const address = server.server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/__ai-assets/ensure-first-drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: [asset.id] })
      }
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.generated.length, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.asset.tileset.columns === 1));

    const savedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const savedVersion = savedManifest.assets[asset.id].versions[
      savedManifest.assets[asset.id].activeVersion
    ];
    const saved = PNG.sync.read(await readFile(path.join(assetsDir, path.basename(savedVersion.file))));
    assert.deepEqual(rgbaAt(saved, 0, 0), [80, 30, 40, 255]);
    assert.deepEqual(rgbaAt(saved, 2, 0), [160, 30, 40, 255]);
  } finally {
    await server.close();
  }
});

function tilesetAsset(overrides) {
  const tileCount = overrides.tileCount ?? overrides.columns * overrides.rows;
  const margin = overrides.margin ?? 0;
  const spacing = overrides.spacing ?? 0;
  return {
    id: "isolated.tileset",
    kind: "tileset",
    prompt: "A coherent test tileset.",
    dimensions: {
      width: margin * 2 + overrides.columns * overrides.tileWidth +
        Math.max(0, overrides.columns - 1) * spacing,
      height: margin * 2 + overrides.rows * overrides.tileHeight +
        Math.max(0, overrides.rows - 1) * spacing
    },
    tileset: {
      ...overrides,
      tileCount,
      tiles: Array.from({ length: tileCount }, (_, index) => ({
        prompt: `tile-${index + 1}`
      }))
    },
    settings: { format: "png", background: "auto", size: "1536x1024" },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/assets/isolated.tileset.v1.png",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
}

function generatedOption(image, prompt) {
  return {
    image,
    mimeType: "image/png",
    prompt,
    model: "fake-model",
    settings: { format: "png", model: "fake-model" }
  };
}

function solidPng(width, height, rgba) {
  const png = new PNG({ width, height });
  fillRect(png, { x: 0, y: 0, width, height }, rgba);
  return PNG.sync.write(png);
}

function fillRect(png, bounds, rgba) {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      png.data[offset] = rgba[0];
      png.data[offset + 1] = rgba[1];
      png.data[offset + 2] = rgba[2];
      png.data[offset + 3] = rgba[3];
    }
  }
}

function rgbaAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}

function logicalTileBounds(asset, tile) {
  const margin = asset.tileset.margin ?? 0;
  const spacing = asset.tileset.spacing ?? 0;
  return {
    x: margin + (tile % asset.tileset.columns) * (asset.tileset.tileWidth + spacing),
    y: margin + Math.floor(tile / asset.tileset.columns) *
      (asset.tileset.tileHeight + spacing),
    width: asset.tileset.tileWidth,
    height: asset.tileset.tileHeight
  };
}

function tileAt(asset, x, y) {
  const tileCount = asset.tileset.tileCount ?? asset.tileset.columns * asset.tileset.rows;
  for (let tile = 0; tile < tileCount; tile += 1) {
    const bounds = logicalTileBounds(asset, tile);
    if (
      x >= bounds.x && x < bounds.x + bounds.width &&
      y >= bounds.y && y < bounds.y + bounds.height
    ) return tile;
  }
  return undefined;
}
