import assert from "node:assert/strict";
import test from "node:test";

import { uploadedImageGeometry } from "../dist/designer-support.js";
import {
  createMixedTilesetOption,
  planTilesetBaseMix,
  resolveTilesetBaseMixCurrent,
  tilesetTilePrompt
} from "../dist/tileset-dialog.js";

const asset = {
  id: "forest",
  kind: "tileset",
  prompt: "Forest tiles.",
  dimensions: { width: 34, height: 18 },
  tileset: {
    tileWidth: 16,
    tileHeight: 16,
    columns: 2,
    rows: 1,
    margin: 1,
    spacing: 0,
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

test("tileset uploads retain selected tile geometry when the sheet size matches", () => {
  assert.deepEqual(
    uploadedImageGeometry(asset, { width: 50, height: 22 }, {
      tileWidth: 24,
      tileHeight: 20,
      tileCount: 1
    }),
    {
      dimensions: { width: 50, height: 22 },
      tileset: {
        ...asset.tileset,
        tileWidth: 24,
        tileHeight: 20,
        tileCount: 1
      }
    }
  );
});

test("tileset uploads reject images outside the selected grid geometry", () => {
  assert.throws(
    () => uploadedImageGeometry(asset, { width: 49, height: 22 }, {
      tileWidth: 24,
      tileHeight: 20,
      tileCount: 1
    }),
    /must be exactly 50x22px.*received 49x22px/
  );
});

test("base tileset mixing keeps existing tiles and selects a generated source for new tiles", () => {
  const current = {
    ...asset,
    tileset: {
      ...asset.tileset,
      tileCount: 1
    }
  };
  const generatedTileset = {
    ...asset.tileset,
    tileWidth: 24,
    tileHeight: 20,
    tileCount: 2,
    tiles: [
      { prompt: "Mossy grass." },
      { prompt: "Stone path." }
    ]
  };

  const plan = planTilesetBaseMix(current, [{
    index: 2,
    dataUrl: "data:image/png;base64,generated",
    mimeType: "image/png",
    prompt: "Generated forest tiles.",
    dimensions: { width: 50, height: 22 },
    tileset: generatedTileset
  }]);

  assert.deepEqual(
    plan,
    {
      dimensions: { width: 50, height: 22 },
      tileset: generatedTileset,
      selections: ["base", 2]
    }
  );
  assert.equal(tilesetTilePrompt(plan.tileset, 1), "Stone path.");
});

test("base tileset mixing rejects generated options with inconsistent target geometry", () => {
  assert.throws(
    () => planTilesetBaseMix(asset, [
      {
        index: 0,
        dataUrl: "data:image/png;base64,first",
        mimeType: "image/png",
        prompt: "First option.",
        dimensions: { width: 34, height: 18 },
        tileset: asset.tileset
      },
      {
        index: 1,
        dataUrl: "data:image/png;base64,second",
        mimeType: "image/png",
        prompt: "Second option.",
        dimensions: { width: 50, height: 22 },
        tileset: {
          ...asset.tileset,
          tileWidth: 24,
          tileHeight: 20
        }
      }
    ]),
    /same tile grid and dimensions/
  );
});

test("a mixed base tileset is promoted as PNG with the composed geometry", () => {
  const template = {
    index: 0,
    dataUrl: "data:image/svg+xml;base64,generated",
    mimeType: "image/svg+xml",
    prompt: "Generated forest tiles.",
    revisedPrompt: "One generated sheet.",
    dimensions: { width: 34, height: 18 },
    tileset: asset.tileset,
    settings: { format: "svg" }
  };
  const result = {
    dataUrl: "data:image/png;base64,mixed",
    dimensions: { width: 50, height: 22 },
    tileset: {
      ...asset.tileset,
      tileWidth: 24,
      tileHeight: 20
    },
    selections: ["base", 0]
  };

  assert.deepEqual(
    createMixedTilesetOption(template, result, "Mixed forest tiles.", 3),
    {
      ...template,
      index: 3,
      dataUrl: result.dataUrl,
      mimeType: "image/png",
      prompt: "Mixed forest tiles.",
      revisedPrompt: undefined,
      dimensions: result.dimensions,
      tileset: result.tileset,
      settings: { format: "png" }
    }
  );
});

test("a mixed preview becomes the current source for the next tileset mixer", () => {
  const mixedOption = {
    index: 3,
    dataUrl: "data:image/png;base64,mixed-current",
    mimeType: "image/png",
    prompt: "Mixed forest tiles.",
    dimensions: { width: 50, height: 22 },
    tileset: {
      ...asset.tileset,
      tileWidth: 24,
      tileHeight: 20
    }
  };

  const current = resolveTilesetBaseMixCurrent(asset, "/forest.png", mixedOption);

  assert.equal(current.sheetSrc, mixedOption.dataUrl);
  assert.deepEqual(current.asset.dimensions, mixedOption.dimensions);
  assert.deepEqual(current.asset.tileset, mixedOption.tileset);
});

test("tileset mixer prompts are read from the target tile metadata", () => {
  const tileset = {
    ...asset.tileset,
    tiles: [
      { prompt: "  Mossy grass with scattered clover.  " },
      { prompt: "Stone path bordered by grass." }
    ]
  };

  assert.equal(tilesetTilePrompt(tileset, 0), "Mossy grass with scattered clover.");
  assert.equal(tilesetTilePrompt(tileset, 1), "Stone path bordered by grass.");
  assert.equal(tilesetTilePrompt(tileset, 2), undefined);
  assert.equal(tilesetTilePrompt({ ...tileset, tiles: [{ prompt: "   " }] }, 0), undefined);
});
