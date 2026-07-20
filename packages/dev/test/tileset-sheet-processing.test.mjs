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
  [10, 10, 200, 255],
  [200, 120, 10, 255]
];

test("tileset geometry reserves isolated cells with centered generation-only gutters", () => {
  const props = tilesetAsset({
    dimensions: { width: 128, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 1,
    tileCount: 4
  });
  const propsGeometry = tilesetSheetGenerationGeometry(props, "1536x1024");

  assert.deepEqual(
    { columns: propsGeometry.generationColumns, rows: propsGeometry.generationRows },
    { columns: 2, rows: 2 }
  );
  assert.deepEqual(propsGeometry.sheet, {
    x: 326,
    y: 70,
    width: 884,
    height: 884
  });
  assert.equal(propsGeometry.scale, 13);
  assert.equal(propsGeometry.gutter, 52);
  assert.deepEqual(propsGeometry.outerPadding, {
    left: 326,
    top: 70,
    right: 326,
    bottom: 70
  });
  assert.deepEqual(
    propsGeometry.cells.map(({ x, y, width, height, logical }) => ({
      x,
      y,
      width,
      height,
      logical
    })),
    Array.from({ length: 4 }, (_, index) => ({
      x: 326 + (index % 2) * 468,
      y: 70 + Math.floor(index / 2) * 468,
      width: 416,
      height: 416,
      logical: { x: index * 32, y: 0, width: 32, height: 32 }
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

  assert.deepEqual(
    { columns: forestGeometry.generationColumns, rows: forestGeometry.generationRows },
    { columns: 4, rows: 3 }
  );
  assert.deepEqual(forestGeometry.sheet, {
    x: 138,
    y: 44,
    width: 1260,
    height: 936
  });
  assert.equal(forestGeometry.scale, 9);
  assert.equal(forestGeometry.gutter, 36);
  assert.deepEqual(forestGeometry.cells[0], {
    index: 0,
    usable: true,
    x: 138,
    y: 44,
    width: 288,
    height: 288,
    logical: { x: 0, y: 0, width: 32, height: 32 }
  });
  assert.deepEqual(forestGeometry.cells[11], {
    index: 11,
    usable: true,
    x: 1110,
    y: 692,
    width: 288,
    height: 288,
    logical: { x: 96, y: 64, width: 32, height: 32 }
  });

  const partial = tilesetAsset({
    dimensions: { width: 128, height: 64 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 2,
    tileCount: 5
  });
  const partialGeometry = tilesetSheetGenerationGeometry(partial, "1536x1024");

  assert.deepEqual(
    { columns: partialGeometry.generationColumns, rows: partialGeometry.generationRows },
    { columns: 3, rows: 2 }
  );
  assert.equal(partialGeometry.cells.length, 5);
  assert.deepEqual(partialGeometry.cells[4], {
    index: 4,
    usable: true,
    x: 560,
    y: 538,
    width: 416,
    height: 416,
    logical: { x: 0, y: 32, width: 32, height: 32 }
  });
  assert.deepEqual(partialGeometry.unusedSlots, [{
    index: 5,
    x: 1028,
    y: 538,
    width: 416,
    height: 416
  }]);

  const threeTiles = tilesetAsset({
    dimensions: { width: 96, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 3,
    rows: 1,
    tileCount: 3
  });
  const threeTileGeometry = tilesetSheetGenerationGeometry(threeTiles, "1536x1024");
  assert.deepEqual(
    { columns: threeTileGeometry.generationColumns, rows: threeTileGeometry.generationRows },
    { columns: 2, rows: 2 }
  );

  const nineTiles = tilesetAsset({
    dimensions: { width: 128, height: 96 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 3,
    tileCount: 9
  });
  const nineTileGeometry = tilesetSheetGenerationGeometry(nineTiles, "1536x1024");
  assert.deepEqual(
    { columns: nineTileGeometry.generationColumns, rows: nineTileGeometry.generationRows },
    { columns: 4, rows: 3 }
  );
  assert.equal(nineTileGeometry.cells.length, 9);
  assert.equal(nineTileGeometry.unusedSlots.length, 3);

  const rectangularTiles = tilesetAsset({
    dimensions: { width: 64, height: 32 },
    tileWidth: 16,
    tileHeight: 32,
    columns: 4,
    rows: 1,
    tileCount: 4
  });
  const rectangularGeometry = tilesetSheetGenerationGeometry(
    rectangularTiles,
    "1536x1024"
  );
  assert.deepEqual(
    { columns: rectangularGeometry.generationColumns, rows: rectangularGeometry.generationRows },
    { columns: 4, rows: 1 }
  );
  assert.deepEqual(
    { width: rectangularGeometry.cells[0].width, height: rectangularGeometry.cells[0].height },
    { width: 320, height: 640 }
  );
});

test("per-cell extraction drops generation gutters and preserves cell ownership", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 96, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 3,
    rows: 1,
    tileCount: 3
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const raw = solidPng(geometry.canvas.width, geometry.canvas.height, CHROMA);

  for (const cell of geometry.cells) {
    fillRect(raw, cell.x, cell.y, cell.width, cell.height, TILE_COLORS[cell.index]);
  }
  fillRect(
    raw,
    geometry.cells[0].x + geometry.cells[0].width,
    geometry.cells[0].y,
    geometry.gutter,
    geometry.cells[0].height,
    [250, 250, 0, 255]
  );

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
  assertCellColor(cleaned, 2, TILE_COLORS[2]);
  assert.equal(countColor(cleaned, [250, 250, 0, 255]), 0);
});

test("per-cell extraction preserves rows when the returned raster is scaled", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 64, height: 64 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 2,
    rows: 2,
    tileCount: 4
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const actualCanvas = { width: 512, height: 512 };
  const raw = solidPng(actualCanvas.width, actualCanvas.height, CHROMA);
  const cells = geometry.cells.map((cell) => ({
    x: cell.x / 2,
    y: cell.y / 2,
    width: cell.width / 2,
    height: cell.height / 2
  }));

  for (const [index, cell] of cells.entries()) {
    fillRect(raw, cell.x, cell.y, cell.width, cell.height, TILE_COLORS[index]);
  }
  fillRect(
    raw,
    cells[0].x + cells[0].width,
    cells[0].y,
    geometry.gutter / 2,
    cells[0].height,
    [250, 250, 0, 255]
  );
  fillRect(
    raw,
    cells[0].x,
    cells[0].y + cells[0].height,
    cells[0].width,
    geometry.gutter / 2,
    [250, 250, 0, 255]
  );

  const cropped = PNG.sync.read(await cropTilesetSheetFromGeneration(
    PNG.sync.write(raw),
    geometry,
    "png"
  ));

  assert.deepEqual({ width: cropped.width, height: cropped.height }, asset.dimensions);
  for (let index = 0; index < 4; index += 1) {
    assertGridCellColor(cropped, index, 2, TILE_COLORS[index]);
  }
  assert.equal(countColor(cropped, [250, 250, 0, 255]), 0);
});

test("staged tileset references split logical cells into matching isolated rectangles", async () => {
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
    rgbaAt(
      staged,
      geometry.cells[2].x + geometry.cells[2].width - 1,
      geometry.cells[2].y
    ),
    TILE_COLORS[2]
  );
  assert.deepEqual(
    rgbaAt(
      staged,
      geometry.cells[0].x + geometry.cells[0].width,
      geometry.cells[0].y
    ),
    CHROMA
  );
  assert.match(stagedReference.fileName, /\.staged\.png$/);
});

test("per-cell composition preserves declared logical margin and spacing", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 80, height: 36 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 2,
    rows: 1,
    tileCount: 2,
    margin: 2,
    spacing: 12
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const raw = solidPng(geometry.canvas.width, geometry.canvas.height, [250, 250, 0, 255]);
  for (const cell of geometry.cells) {
    fillRect(raw, cell.x, cell.y, cell.width, cell.height, TILE_COLORS[cell.index]);
  }

  const processed = PNG.sync.read(await cropTilesetSheetFromGeneration(
    PNG.sync.write(raw),
    geometry,
    "png",
    {
      color: { red: 0, green: 0, blue: 0 },
      transparent: false
    }
  ));

  assert.deepEqual(geometry.cells.map((cell) => cell.logical), [
    { x: 2, y: 2, width: 32, height: 32 },
    { x: 46, y: 2, width: 32, height: 32 }
  ]);
  assert.deepEqual(rgbaAt(processed, 2, 2), TILE_COLORS[0]);
  assert.deepEqual(rgbaAt(processed, 46, 2), TILE_COLORS[1]);
  assert.deepEqual(rgbaAt(processed, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(rgbaAt(processed, 40, 16), [0, 0, 0, 255]);
  assert.deepEqual(rgbaAt(processed, 79, 35), [0, 0, 0, 255]);
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
    assertApproxColor(
      rgbaFromRaw(data, info.channels, info.width, 16, 16),
      TILE_COLORS[0],
      format === "jpeg" ? 12 : 2,
      format
    );
    assertApproxColor(
      rgbaFromRaw(data, info.channels, info.width, 48, 16),
      TILE_COLORS[1],
      format === "jpeg" ? 12 : 2,
      format
    );
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
  tileCount,
  margin,
  spacing
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
      ...(margin === undefined ? {} : { margin }),
      ...(spacing === undefined ? {} : { spacing }),
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

function assertGridCellColor(png, cell, columns, color) {
  const originX = (cell % columns) * 32;
  const originY = Math.floor(cell / columns) * 32;
  for (let y = originY; y < originY + 32; y += 1) {
    for (let x = originX; x < originX + 32; x += 1) {
      assert.deepEqual(rgbaAt(png, x, y), color);
    }
  }
}

function countColor(png, color) {
  let count = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (rgbaAt(png, x, y).every((channel, index) => channel === color[index])) {
        count += 1;
      }
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

function assertApproxColor(actual, expected, tolerance, message) {
  for (let channel = 0; channel < 4; channel += 1) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= tolerance,
      `${message}: channel ${channel} expected ${expected[channel]}±${tolerance}, got ${actual[channel]}`
    );
  }
}
