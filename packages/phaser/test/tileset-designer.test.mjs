import assert from "node:assert/strict";
import test from "node:test";

import { uploadedImageGeometry } from "../dist/designer-support.js";
import {
  createMixedTilesetOption,
  normalizeTilesetTileTransform,
  planTilesetBaseMix,
  resolveTilesetBaseMixCurrent,
  tilesetAnimationWithFrameDelays,
  tilesetTileGenerationOverride,
  tilesetTileTransformDrawPlan,
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

test("tileset tile transforms default invalid values without permitting collapsed scales", () => {
  assert.deepEqual(
    normalizeTilesetTileTransform({
      offsetX: 3.9,
      offsetY: Number.NaN,
      scaleX: 0,
      scaleY: -2
    }),
    {
      offsetX: 3,
      offsetY: 0,
      scaleX: 0.05,
      scaleY: 0.05
    }
  );
  assert.deepEqual(normalizeTilesetTileTransform(undefined), {
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1
  });
});

test("tileset tile transform plans scale around each tile center and keep its clip fixed", () => {
  const tileset = {
    tileWidth: 10,
    tileHeight: 20,
    columns: 2,
    rows: 2,
    tileCount: 4,
    margin: 2,
    spacing: 3
  };

  assert.deepEqual(
    tilesetTileTransformDrawPlan(tileset, 3, {
      offsetX: 2,
      offsetY: -3,
      scaleX: 1.5,
      scaleY: 0.5
    }),
    {
      source: { x: 15, y: 25, width: 10, height: 20 },
      clip: { x: 15, y: 25, width: 10, height: 20 },
      destination: { x: 14.5, y: 27, width: 15, height: 10 }
    }
  );
});

test("identity tile transform draws back into the exact source cell", () => {
  assert.deepEqual(
    tilesetTileTransformDrawPlan(asset.tileset, 1, undefined),
    {
      source: { x: 17, y: 1, width: 16, height: 16 },
      clip: { x: 17, y: 1, width: 16, height: 16 },
      destination: { x: 17, y: 1, width: 16, height: 16 }
    }
  );
});

test("tileset animation editor materializes one normalized delay per temporal frame", () => {
  const animation = {
    key: "water",
    frameCount: 3,
    frameRate: 4,
    repeat: -1,
    tiles: [
      { prompt: "Ripple gently." },
      { prompt: "Stay still." }
    ],
    frameTimings: [{ delayMs: 80 }]
  };

  assert.deepEqual(
    tilesetAnimationWithFrameDelays(animation, [80, 0, 320.9]),
    {
      ...animation,
      frameTimings: [
        { delayMs: 80 },
        { delayMs: 1 },
        { delayMs: 320 }
      ]
    }
  );
  assert.throws(
    () => tilesetAnimationWithFrameDelays(animation, [80, 250]),
    /requires 3 frame delays, received 2/
  );
});

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
      tilesetSourceDataUrl: result.dataUrl,
      tilesetTransforms: [
        { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
        { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
      ],
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

test("regenerating one tileset tile requests a one-cell sheet with its exact prompt", () => {
  const tileset = {
    ...asset.tileset,
    tiles: [
      { prompt: "Mossy grass." },
      { prompt: "Stone path." }
    ]
  };

  assert.deepEqual(tilesetTileGenerationOverride(tileset, 1), {
    tileWidth: 16,
    tileHeight: 16,
    columns: 1,
    rows: 1,
    tileCount: 1,
    tiles: [{ prompt: "Stone path." }]
  });
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
