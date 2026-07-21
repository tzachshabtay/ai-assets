import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";
import sharp from "sharp";

import { removeTilesetChromaBackground } from "../dist/provider-image-processing.js";
import {
  cropTilesetSheetFromGeneration,
  planTilesetSheetGeneration,
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
    { columns: 3, rows: 2 }
  );
  assert.deepEqual(propsGeometry.sheet, {
    x: 32,
    y: 32,
    width: 1472,
    height: 960
  });
  assert.equal(propsGeometry.scale, 14);
  assert.equal(propsGeometry.gutter, 32);
  assert.deepEqual(propsGeometry.outerPadding, {
    left: 32,
    top: 32,
    right: 32,
    bottom: 32
  });
  assert.deepEqual(
    propsGeometry.cells.map(({ x, y, width, height, logical }) => ({
      x,
      y,
      width,
      height,
      logical
    })),
    [
      { x: 32, y: 32, width: 448, height: 448, logical: { x: 0, y: 0, width: 32, height: 32 } },
      { x: 544, y: 32, width: 448, height: 448, logical: { x: 32, y: 0, width: 32, height: 32 } },
      { x: 1056, y: 32, width: 448, height: 448, logical: { x: 64, y: 0, width: 32, height: 32 } },
      { x: 32, y: 544, width: 448, height: 448, logical: { x: 96, y: 0, width: 32, height: 32 } }
    ]
  );
  assert.equal(propsGeometry.unusedSlots.length, 2);

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
    x: 48,
    y: 26,
    width: 1440,
    height: 971
  });
  assert.equal(forestGeometry.scale, 9);
  assert.equal(forestGeometry.gutter, 26);
  assert.deepEqual(forestGeometry.cells[0], {
    index: 0,
    usable: true,
    x: 48,
    y: 26,
    width: 288,
    height: 288,
    logical: { x: 0, y: 0, width: 32, height: 32 }
  });
  assert.deepEqual(forestGeometry.cells[11], {
    index: 11,
    usable: true,
    x: 1200,
    y: 709,
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
    x: 544,
    y: 544,
    width: 448,
    height: 448,
    logical: { x: 0, y: 32, width: 32, height: 32 }
  });
  assert.deepEqual(partialGeometry.unusedSlots, [{
    index: 5,
    x: 1056,
    y: 544,
    width: 448,
    height: 448
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
    { width: 336, height: 672 }
  );
});

test("adaptive tileset planning jointly chooses the model canvas and packing grid", () => {
  const props = tilesetAsset({
    dimensions: { width: 128, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 1,
    tileCount: 4
  });
  const propsPlan = planTilesetSheetGeneration(props);

  assert.deepEqual(
    {
      size: propsPlan.size,
      columns: propsPlan.generationColumns,
      rows: propsPlan.generationRows,
      scale: propsPlan.scale
    },
    { size: "1024x1024", columns: 2, rows: 2, scale: 14 }
  );
  assert.deepEqual(
    propsPlan.cells.map(({ x, y, width, height, logical }) => ({
      x,
      y,
      width,
      height,
      logical
    })),
    [
      { x: 32, y: 32, width: 448, height: 448, logical: { x: 0, y: 0, width: 32, height: 32 } },
      { x: 544, y: 32, width: 448, height: 448, logical: { x: 32, y: 0, width: 32, height: 32 } },
      { x: 32, y: 544, width: 448, height: 448, logical: { x: 64, y: 0, width: 32, height: 32 } },
      { x: 544, y: 544, width: 448, height: 448, logical: { x: 96, y: 0, width: 32, height: 32 } }
    ]
  );
  assert.deepEqual(
    propsPlan.cells.map((cell) => ({
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2
    })),
    [
      { x: 256, y: 256 },
      { x: 768, y: 256 },
      { x: 256, y: 768 },
      { x: 768, y: 768 }
    ]
  );

  const planFor = ({ tileCount, columns, rows, tileWidth = 32, tileHeight = 32 }) => (
    planTilesetSheetGeneration(tilesetAsset({
      dimensions: { width: columns * tileWidth, height: rows * tileHeight },
      tileWidth,
      tileHeight,
      columns,
      rows,
      tileCount
    }))
  );
  const summaries = [
    planFor({ tileCount: 3, columns: 3, rows: 1 }),
    planFor({ tileCount: 5, columns: 4, rows: 2 }),
    planFor({ tileCount: 9, columns: 4, rows: 3 }),
    planFor({ tileCount: 12, columns: 4, rows: 3 }),
    planFor({ tileCount: 4, columns: 4, rows: 1, tileWidth: 16, tileHeight: 32 })
  ].map((plan) => ({
    size: plan.size,
    columns: plan.generationColumns,
    rows: plan.generationRows
  }));

  assert.deepEqual(summaries, [
    { size: "1024x1024", columns: 2, rows: 2 },
    { size: "1536x1024", columns: 3, rows: 2 },
    { size: "1024x1024", columns: 3, rows: 3 },
    { size: "1536x1024", columns: 4, rows: 3 },
    { size: "1536x1024", columns: 4, rows: 1 }
  ]);

  const autoPropsPlan = planTilesetSheetGeneration(props, "auto");
  assert.deepEqual(
    {
      size: autoPropsPlan.size,
      columns: autoPropsPlan.generationColumns,
      rows: autoPropsPlan.generationRows
    },
    { size: "1024x1024", columns: 2, rows: 2 }
  );
});

test("every planned crop is centered inside one disjoint ownership region", () => {
  for (let tileCount = 1; tileCount <= 12; tileCount += 1) {
    const logicalColumns = Math.min(4, tileCount);
    const asset = tilesetAsset({
      dimensions: {
        width: logicalColumns * 32,
        height: Math.ceil(tileCount / logicalColumns) * 32
      },
      tileWidth: 32,
      tileHeight: 32,
      columns: logicalColumns,
      rows: Math.ceil(tileCount / logicalColumns),
      tileCount
    });
    const plan = planTilesetSheetGeneration(asset);
    const slots = [...plan.cells, ...plan.unusedSlots];

    assert.equal(plan.placementRegions.length, slots.length);
    plan.placementRegions.forEach((region, index) => {
      const column = index % plan.generationColumns;
      const row = Math.floor(index / plan.generationColumns);
      const expectedLeft = Math.floor(
        (column / plan.generationColumns) * plan.canvas.width
      );
      const expectedTop = Math.floor(
        (row / plan.generationRows) * plan.canvas.height
      );
      const expectedRight = Math.floor(
        ((column + 1) / plan.generationColumns) * plan.canvas.width
      );
      const expectedBottom = Math.floor(
        ((row + 1) / plan.generationRows) * plan.canvas.height
      );
      assert.deepEqual(region, {
        index,
        x: expectedLeft,
        y: expectedTop,
        width: expectedRight - expectedLeft,
        height: expectedBottom - expectedTop
      });

      const slot = slots[index];
      const leftGuard = slot.x - region.x;
      const rightGuard = region.x + region.width - slot.x - slot.width;
      const topGuard = slot.y - region.y;
      const bottomGuard = region.y + region.height - slot.y - slot.height;
      assert.ok(leftGuard >= 0 && rightGuard >= 0);
      assert.ok(topGuard >= 0 && bottomGuard >= 0);
      assert.ok(Math.abs(leftGuard - rightGuard) <= 1);
      assert.ok(Math.abs(topGuard - bottomGuard) <= 1);
    });
  }
});

test("region-centered props cells recompose into the logical one-row sheet", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 128, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 1,
    tileCount: 4
  });
  const geometry = planTilesetSheetGeneration(asset);
  const raw = solidPng(1024, 1024, CHROMA);
  const expectedGenerationRects = [
    { x: 32, y: 32, width: 448, height: 448 },
    { x: 544, y: 32, width: 448, height: 448 },
    { x: 32, y: 544, width: 448, height: 448 },
    { x: 544, y: 544, width: 448, height: 448 }
  ];

  expectedGenerationRects.forEach((rect, index) => {
    fillRect(raw, rect.x, rect.y, rect.width, rect.height, TILE_COLORS[index]);
  });

  const processed = PNG.sync.read(await cropTilesetSheetFromGeneration(
    PNG.sync.write(raw),
    geometry,
    "png"
  ));

  assert.deepEqual({ width: processed.width, height: processed.height }, asset.dimensions);
  for (let index = 0; index < TILE_COLORS.length; index += 1) {
    assertCellColor(processed, index, TILE_COLORS[index]);
  }
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

test("crop accepts proportional returned raster scaling and rejects aspect mismatch", async () => {
  const asset = tilesetAsset({
    dimensions: { width: 32, height: 32 },
    tileWidth: 32,
    tileHeight: 32,
    columns: 1,
    rows: 1,
    tileCount: 1
  });
  const geometry = tilesetSheetGenerationGeometry(asset, "1024x1024");
  const proportional = solidPng(512, 512, CHROMA);
  const cell = geometry.cells[0];
  fillRect(
    proportional,
    cell.x / 2,
    cell.y / 2,
    cell.width / 2,
    cell.height / 2,
    TILE_COLORS[0]
  );

  const cropped = PNG.sync.read(await cropTilesetSheetFromGeneration(
    PNG.sync.write(proportional),
    geometry,
    "png"
  ));
  assert.deepEqual({ width: cropped.width, height: cropped.height }, asset.dimensions);
  assertCellColor(cropped, 0, TILE_COLORS[0]);

  const aspectMismatch = solidPng(512, 384, CHROMA);
  await assert.rejects(
    cropTilesetSheetFromGeneration(PNG.sync.write(aspectMismatch), geometry, "png"),
    /Generated tileset raster is 512x384.*planned 1024x1024 canvas aspect ratio.*Refusing to stretch tile ownership regions/s
  );
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
