import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";
import sharp from "sharp";

import { generateAssetWithIsolatedTilesetCells } from "../dist/index.js";

test("asset-level SVG tilesets delegate to the provider without cell isolation", async () => {
  const asset = tilesetAsset({ format: "svg" });
  const request = { asset, count: 2 };
  const calls = [];
  const callbacks = [];
  const delegated = [svgOption("first"), svgOption("second")];
  const provider = {
    async generate(received, onOption) {
      calls.push(received);
      for (const [index, option] of delegated.entries()) {
        await onOption?.(option, index);
      }
      return delegated;
    }
  };

  const generated = await generateAssetWithIsolatedTilesetCells(
    provider,
    request,
    (option, index) => callbacks.push({ option, index })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0], request);
  assert.equal(generated, delegated);
  assert.deepEqual(callbacks, [
    { option: delegated[0], index: 0 },
    { option: delegated[1], index: 1 }
  ]);
});

test("request format overrides the asset format for isolation and SVG fallback", async () => {
  const rasterOverride = await generateWithRecordingProvider({
    asset: tilesetAsset({ format: "svg" }),
    settings: { format: "png" },
    count: 1
  });
  assert.equal(rasterOverride.calls.length, 2);
  assert.ok(rasterOverride.calls.every((call) => call.asset.tileset.columns === 1));
  assert.equal(rasterOverride.generated[0].mimeType, "image/png");

  const svgOverride = await generateWithRecordingProvider({
    asset: tilesetAsset({ format: "png" }),
    settings: { format: "svg" },
    count: 1
  });
  assert.equal(svgOverride.calls.length, 1);
  assert.equal(svgOverride.calls[0].asset.tileset.columns, 2);
  assert.equal(svgOverride.generated[0].mimeType, "image/svg+xml");
});

test("composed tileset options retain the full effective asset settings", async () => {
  const asset = tilesetAsset({ format: "png" });
  asset.settings = {
    model: "gpt-image-2",
    size: "1536x1024",
    quality: "high",
    background: "auto",
    format: "png",
    moderation: "low",
    referenceAssetIds: ["palette.reference"]
  };
  const requestSettings = {
    quality: "medium",
    format: "webp"
  };

  const { generated } = await generateWithRecordingProvider({
    asset,
    settings: requestSettings,
    count: 1
  });

  assert.deepEqual(generated[0].settings, {
    ...asset.settings,
    ...requestSettings,
    model: "fake-model",
    format: "webp"
  });
});

test("isolated PNG, WebP, and JPEG tilesets preserve output type and sheet dimensions", async () => {
  for (const { format, mimeType, sharpFormat } of [
    { format: "png", mimeType: "image/png", sharpFormat: "png" },
    { format: "webp", mimeType: "image/webp", sharpFormat: "webp" },
    { format: "jpg", mimeType: "image/jpeg", sharpFormat: "jpeg" }
  ]) {
    const asset = tilesetAsset({ format: "png" });
    const { generated } = await generateWithRecordingProvider({
      asset,
      settings: { format },
      count: 1
    });
    const [option] = generated;
    const metadata = await sharp(option.image).metadata();

    assert.equal(option.mimeType, mimeType, format);
    assert.equal(option.settings.format, format, format);
    assert.equal(metadata.format, sharpFormat, format);
    assert.deepEqual(
      { width: metadata.width, height: metadata.height },
      asset.dimensions,
      format
    );
  }
});

async function generateWithRecordingProvider(request) {
  const calls = [];
  const provider = {
    async generate(received, onOption) {
      calls.push(received);
      const effectiveFormat = received.settings?.format ?? received.asset.settings?.format;
      const count = received.count ?? 1;
      const options = Array.from({ length: count }, (_, index) => (
        effectiveFormat === "svg"
          ? svgOption(`svg-${index}`)
          : pngOption(received, index)
      ));
      for (const [index, option] of options.entries()) {
        await onOption?.(option, index);
      }
      return options;
    }
  };

  return {
    calls,
    generated: await generateAssetWithIsolatedTilesetCells(provider, request)
  };
}

function tilesetAsset({ format }) {
  return {
    id: "format.tileset",
    kind: "tileset",
    prompt: "A coherent two-tile test tileset.",
    dimensions: { width: 6, height: 2 },
    tileset: {
      tileWidth: 3,
      tileHeight: 2,
      columns: 2,
      rows: 1,
      tileCount: 2,
      tiles: [
        { prompt: "A centered red token." },
        { prompt: "A centered blue token." }
      ]
    },
    settings: {
      model: "gpt-image-2",
      size: "1536x1024",
      background: "auto",
      format
    },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "/assets/format.tileset.v1.png",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
}

function pngOption(request, index) {
  const png = new PNG({
    width: request.asset.dimensions.width,
    height: request.asset.dimensions.height
  });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 30 + index;
    png.data[offset + 1] = 80;
    png.data[offset + 2] = 140;
    png.data[offset + 3] = 255;
  }

  return {
    image: PNG.sync.write(png),
    mimeType: "image/png",
    prompt: request.prompt ?? request.asset.prompt,
    model: "fake-model",
    dimensions: request.asset.dimensions,
    tileset: request.asset.tileset,
    settings: {
      ...request.asset.settings,
      ...request.settings,
      model: "fake-model"
    }
  };
}

function svgOption(label) {
  return {
    image: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="2"><title>${label}</title></svg>`
    ),
    mimeType: "image/svg+xml",
    prompt: label,
    settings: { format: "svg" }
  };
}
