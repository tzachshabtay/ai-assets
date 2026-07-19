import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";
import sharp from "sharp";

import { removeTilesetChromaBackground } from "../dist/provider-image-processing.js";
import {
  cropTilesetSheetFromGeneration,
  stageTilesetSheetReference,
  tilesetSheetGenerationGeometry
} from "../dist/tileset-sheet-processing.js";

const CHROMA = [255, 0, 255, 255];
const TILE_COLORS = [
  [200, 10, 10, 255],
  [10, 200, 10, 255],
  [10, 10, 200, 255]
];

test("tileset geometry reserves the largest centered integer-scaled logical sheet", () => {
  const props = tilesetAsset({
    dimensions: { width: 128, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 1,
    tileCount: 4
  });
  const propsGeometry = tilesetSheetGenerationGeometry(props, "1536x1024");

  assert.deepEqual(propsGeometry.sheet, {
    x: 0,
    y: 320,
    width: 1536,
    height: 384
  });
  assert.equal(propsGeometry.scale, 12);
  assert.deepEqual(
    propsGeometry.cells.map(({ x, y, width, height }) => ({ x, y, width, height })),
    Array.from({ length: 4 }, (_, index) => ({
      x: index * 384,
      y: 320,
      width: 384,
      height: 384
    }))
  );

  const forest = tilesetAsset({
    dimensions: { width: 128, height: 96 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 3,
    tileCount: 12
  });
  const forestGeometry = tilesetSheetGenerationGeometry(forest, "1536x1024");

  assert.deepEqual(forestGeometry.sheet, {
    x: 128,
    y: 32,
    width: 1280,
    height: 960
  });
  assert.equal(forestGeometry.scale, 10);
  assert.deepEqual(forestGeometry.cells[0], {
    index: 0,
    usable: true,
    x: 128,
    y: 32,
    width: 320,
    height: 320
  });
  assert.deepEqual(forestGeometry.cells[11], {
    index: 11,
    usable: true,
    x: 1088,
    y: 672,
    width: 320,
    height: 320
  });
});

test("crop then resize then cleanup preserves cell ownership at fractional canvas boundaries", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 96, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 3,
    rows: 1,
    tileCount: 2
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const raw = solidPng(geometry.canvas.width, geometry.canvas.height, CHROMA);

  for (const cell of geometry.cells) {
    fillRect(raw, cell.x, cell.y, cell.width, cell.height, TILE_COLORS[cell.index]);
  }

  const cropped = await cropTilesetSheetFromGeneration(
    PNG.sync.write(raw),
    geometry,
    "png"
  );
  const cleaned = PNG.sync.read(removeTilesetChromaBackground(
    cropped,
    asset.tileset,
    { red: CHROMA[0], green: CHROMA[1], blue: CHROMA[2] }
  ));

  assert.deepEqual({ width: cleaned.width, height: cleaned.height }, asset.dimensions);
  assertCellColor(cleaned, 0, TILE_COLORS[0]);
  assertCellColor(cleaned, 1, TILE_COLORS[1]);
  assert.equal(visiblePixelCount(cleaned, 64, 0, 32, 32), 0);
});

test("staged tileset references use the same active-sheet rectangle as generated output", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 96, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 3,
    rows: 1,
    tileCount: 3
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const logical = solidPng(96, 32, CHROMA);
  for (let index = 0; index < 3; index += 1) {
    fillRect(logical, index * 32, 0, 32, 32, TILE_COLORS[index]);
  }

  const stagedReference = await stageTilesetSheetReference({
    image: PNG.sync.write(logical),
    mimeType: "image/png",
    fileName: "base.png"
  }, geometry, {
    red: CHROMA[0],
    green: CHROMA[1],
    blue: CHROMA[2]
  });
  const staged = PNG.sync.read(stagedReference.image);

  assert.deepEqual({ width: staged.width, height: staged.height }, geometry.canvas);
  assert.deepEqual(rgbaAt(staged, 0, 0), CHROMA);
  assert.deepEqual(rgbaAt(staged, geometry.sheet.x, geometry.sheet.y), TILE_COLORS[0]);
  assert.deepEqual(
    rgbaAt(staged, geometry.cells[1].x, geometry.cells[1].y),
    TILE_COLORS[1]
  );
  assert.deepEqual(
    rgbaAt(staged, geometry.sheet.x + geometry.sheet.width - 1, geometry.sheet.y),
    TILE_COLORS[2]
  );
  assert.match(stagedReference.fileName, /\.staged\.png$/);
});

test("crop processing replaces unused cells with format-safe opaque padding", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 96, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 3,
    rows: 1,
    tileCount: 2
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const raw = solidPng(geometry.canvas.width, geometry.canvas.height, CHROMA);
  for (const cell of geometry.cells) {
    fillRect(raw, cell.x, cell.y, cell.width, cell.height, TILE_COLORS[cell.index]);
  }

  for (const format of ["png", "webp", "jpeg"]) {
    const processed = await cropTilesetSheetFromGeneration(
      PNG.sync.write(raw),
      geometry,
      format,
      {
        color: { red: 0, green: 0, blue: 0 },
        transparent: false
      }
    );
    const { data, info } = await sharp(processed)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.deepEqual({ width: info.width, height: info.height }, asset.dimensions);
    const padding = rgbaFromRaw(data, info.channels, info.width, 80, 16);
    assert.ok(padding[0] < 12 && padding[1] < 12 && padding[2] < 12, format);
    assert.equal(padding[3], 255, format);
  }
});

function tilesetAsset({
  dimensions,
  tileWidth,
  tileHeight,
  columns,
  rows,
  tileCount
}) {
  return {
    id: "test.tileset",
    kind: "tileset",
    prompt: "Test tileset.",
    dimensions,
    tileset: {
      tileWidth,
      tileHeight,
      columns,
      rows,
      tileCount,
      tiles: Array.from({ length: tileCount }, (_, index) => ({
        prompt: `Tile ${index + 1}.`
      }))
    },
    activeVersion: "",
    versions: {}
  };
}

function solidPng(width, height, color) {
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, color);
  return png;
}

function fillRect(png, x, y, width, height, color) {
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const offset = ((y + localY) * png.width + x + localX) * 4;
      png.data[offset] = color[0];
      png.data[offset + 1] = color[1];
      png.data[offset + 2] = color[2];
      png.data[offset + 3] = color[3];
    }
  }
}

function assertCellColor(png, cell, color) {
  const originX = cell * 32;
  for (let y = 0; y < 32; y += 1) {
    for (let x = originX; x < originX + 32; x += 1) {
      assert.deepEqual(rgbaAt(png, x, y), color);
    }
  }
}

function visiblePixelCount(png, x, y, width, height) {
  let count = 0;
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      if (rgbaAt(png, x + localX, y + localY)[3] > 0) count += 1;
    }
  }
  return count;
}

function rgbaAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return Array.from(png.data.subarray(offset, offset + 4));
}

function rgbaFromRaw(data, channels, width, x, y) {
  const offset = (y * width + x) * channels;
  return Array.from(data.subarray(offset, offset + 4));
}
