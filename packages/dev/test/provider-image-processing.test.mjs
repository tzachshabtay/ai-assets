import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";

import {
  alignSpriteSheetFrames,
  composeSpriteSheetFrames,
  removeChromaBackground,
  removeTilesetChromaBackground,
  selectChromaKey,
  shouldRequestRgbaPng
} from "../dist/provider-image-processing.js";
import { gameAssetPrompt } from "../dist/provider.js";

test("composeSpriteSheetFrames honors margins, spacing, and unused cells", async () => {
  const colors = [
    [180, 20, 30, 255],
    [20, 180, 40, 255],
    [30, 50, 180, 255]
  ];
  const frames = colors.map((color) => {
    const frame = new PNG({ width: 2, height: 3 });
    fillRect(frame, 0, 0, 2, 3, color);
    return PNG.sync.write(frame);
  });
  const sheet = PNG.sync.read(await composeSpriteSheetFrames(
    frames,
    { width: 7, height: 9 },
    {
      frameWidth: 2,
      frameHeight: 3,
      columns: 2,
      rows: 2,
      frameCount: 3,
      margin: 1,
      spacing: 1
    }
  ));

  assert.deepEqual(rgbaAt(sheet, 1, 1), colors[0]);
  assert.deepEqual(rgbaAt(sheet, 4, 1), colors[1]);
  assert.deepEqual(rgbaAt(sheet, 1, 5), colors[2]);
  assert.equal(rgbaAt(sheet, 3, 1)[3], 0);
  assert.equal(rgbaAt(sheet, 4, 5)[3], 0);
});

test("alignSpriteSheetFrames aligns generated rows and columns without removing pixels", () => {
  const frameWidth = 10;
  const frameHeight = 10;
  const png = new PNG({ width: frameWidth * 2, height: frameHeight * 2 });
  const centers = [
    { x: 7, y: 6 },
    { x: 3, y: 6 },
    { x: 8, y: 4 },
    { x: 3, y: 4 }
  ];

  centers.forEach((center, frame) => {
    const originX = (frame % 2) * frameWidth;
    const originY = Math.floor(frame / 2) * frameHeight;

    for (let y = center.y - 1; y <= center.y + 1; y += 1) {
      for (let x = center.x - 1; x <= center.x + 1; x += 1) {
        const offset = ((originY + y) * png.width + originX + x) * 4;
        png.data[offset] = 40 + frame;
        png.data[offset + 1] = 180;
        png.data[offset + 2] = 80;
        png.data[offset + 3] = 255;
      }
    }
  });

  const aligned = PNG.sync.read(alignSpriteSheetFrames(PNG.sync.write(png), {
    frameCount: 4,
    frameWidth,
    frameHeight,
    columns: 2,
    rows: 2
  }));
  const alignedCenters = Array.from({ length: 4 }, (_, frame) => frameVisibleCenter(
    aligned,
    (frame % 2) * frameWidth,
    Math.floor(frame / 2) * frameHeight,
    frameWidth,
    frameHeight
  ));

  assert.deepEqual(alignedCenters, [
    { x: 5, y: 5 },
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 5, y: 5 }
  ]);
  assert.equal(alignedCenters[2].x - alignedCenters[0].x, centers[2].x - centers[0].x);
  assert.equal(visiblePixelCount(aligned), visiblePixelCount(png));
});

test("explicit opaque background overrides transparency wording", () => {
  const request = animationRequest({
    prompt: "Animate the subject without changing the transparent-looking checker pattern."
  });

  assert.equal(shouldRequestRgbaPng(request, {
    prompt: request.asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "opaque"
  }), false);
});

test("opaque spritesheet prompts preserve the background without transparency instructions", () => {
  const request = animationRequest();
  const prompt = gameAssetPrompt(request, {
    prompt: request.asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "opaque",
    chromaKey: { red: 255, green: 0, blue: 255 }
  });

  assert.match(prompt, /fully opaque from edge to edge/);
  assert.match(prompt, /Preserve the referenced background/);
  assert.doesNotMatch(prompt, /leaving transparent padding/);
  assert.doesNotMatch(prompt, /trailing cells fully transparent/);
});

test("structured tileset tile prompts participate in chroma-key selection", () => {
  const chromaKey = selectChromaKey({
    asset: {
      id: "tileset",
      kind: "tileset",
      prompt: "Legacy prompt.",
      dimensions: { width: 16, height: 16 },
      tileset: {
        tileWidth: 16,
        tileHeight: 16,
        columns: 1,
        rows: 1,
        tiles: [{ prompt: "A vivid magenta crystal tile." }]
      },
      activeVersion: "",
      versions: {}
    }
  });

  assert.notDeepEqual(chromaKey, { red: 255, green: 0, blue: 255 });
});

test("style prompts participate in chroma-key selection", () => {
  const chromaKey = selectChromaKey({
    asset: {
      id: "portrait",
      kind: "image",
      prompt: "A centered portrait.",
      dimensions: { width: 16, height: 16 },
      activeVersion: "",
      versions: {}
    },
    stylePrompt: "Painterly shadows with vivid magenta accents."
  });

  assert.notDeepEqual(chromaKey, { red: 255, green: 0, blue: 255 });
});

test("transparent raster prompts request one opaque chroma transport", () => {
  const request = {
    asset: {
      id: "portrait",
      kind: "image",
      prompt: "A centered portrait.",
      dimensions: { width: 16, height: 16 },
      settings: { background: "transparent", format: "png", model: "gpt-image-2" },
      activeVersion: "",
      versions: {}
    }
  };
  const prompt = gameAssetPrompt(request, {
    prompt: request.asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "transparent",
    chromaKey: { red: 0, green: 255, blue: 0 }
  });

  assert.match(prompt, /Return a fully opaque PNG for this generation step/i);
  assert.match(prompt, /single exact flat chroma-key color #00ff00/i);
  assert.match(prompt, /Do not return native alpha/i);
  assert.doesNotMatch(prompt, /Clean it into a real RGBA PNG/i);
  assert.doesNotMatch(prompt, /Use a transparent background/i);
});

test("chroma cleanup removes high-confidence key pixels from enclosed sprite holes", () => {
  const png = new PNG({ width: 24, height: 24 });

  fillRect(png, 0, 0, 24, 24, [0, 255, 0, 255]);
  fillRect(png, 4, 3, 16, 18, [130, 20, 35, 255]);
  fillRect(png, 8, 8, 8, 8, [90, 190, 80, 255]);
  fillRect(png, 9, 9, 6, 6, [4, 248, 10, 255]);

  const cleaned = PNG.sync.read(removeChromaBackground(
    PNG.sync.write(png),
    { red: 0, green: 255, blue: 0 }
  ));

  assert.equal(alphaAt(cleaned, 0, 0), 0);
  assert.equal(alphaAt(cleaned, 11, 11), 0);
  assert.ok(alphaAt(cleaned, 8, 11) < 255);
  assert.equal(alphaAt(cleaned, 5, 5), 255);
});

test("chroma cleanup learns a shifted coherent edge matte without clearing isolated detail", () => {
  const png = new PNG({ width: 24, height: 24 });

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const variation = ((x + y) % 3) * 5;
      setPixel(png, x, y, [82 + variation, 178 + variation, 104 + variation, 255]);
    }
  }

  fillRect(png, 4, 3, 16, 18, [130, 20, 35, 255]);
  setPixel(png, 11, 11, [87, 183, 109, 255]);

  const cleaned = PNG.sync.read(removeChromaBackground(
    PNG.sync.write(png),
    { red: 0, green: 255, blue: 0 }
  ));

  assert.equal(alphaAt(cleaned, 0, 0), 0);
  assert.equal(alphaAt(cleaned, 23, 23), 0);
  assert.equal(alphaAt(cleaned, 11, 11), 255);
  assert.equal(alphaAt(cleaned, 10, 11), 255);
});

test("chroma cleanup preserves nonuniform full-bleed art with isolated key-colored detail", () => {
  const png = new PNG({ width: 32, height: 32 });

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      setPixel(png, x, y, [
        70 + Math.round((160 * x) / (png.width - 1)),
        20 + Math.round((80 * y) / (png.height - 1)),
        40 + Math.round((150 * y) / (png.height - 1)),
        255
      ]);
    }
  }

  fillRect(png, 8, 8, 16, 16, [0, 255, 0, 255]);

  const cleaned = PNG.sync.read(removeChromaBackground(
    PNG.sync.write(png),
    { red: 0, green: 255, blue: 0 }
  ));

  assert.equal(alphaAt(cleaned, 0, 0), 255);
  assert.equal(alphaAt(cleaned, 31, 31), 255);
  assert.equal(alphaAt(cleaned, 16, 16), 255);
});

test("tileset cleanup removes the declared chroma from any tile that uses it", () => {
  const png = new PNG({ width: 12, height: 4 });

  fillRect(png, 0, 0, 12, 4, [30, 80, 180, 255]);
  fillRect(png, 4, 0, 4, 4, [0, 255, 0, 255]);
  fillRect(png, 5, 1, 2, 2, [210, 40, 30, 255]);

  const cleaned = PNG.sync.read(removeTilesetChromaBackground(
    PNG.sync.write(png),
    {
      tileWidth: 4,
      tileHeight: 4,
      columns: 3,
      rows: 1,
      tiles: [
        { prompt: "Opaque blue stone floor." },
        { prompt: "L-shaped wall corner with exposed space around its arms." },
        { prompt: "Opaque blue stone wall." }
      ]
    },
    { red: 0, green: 255, blue: 0 }
  ));

  assert.equal(alphaAt(cleaned, 0, 0), 255);
  assert.equal(alphaAt(cleaned, 4, 0), 0);
  assert.equal(alphaAt(cleaned, 5, 1), 255);
  assert.equal(alphaAt(cleaned, 11, 3), 255);
});

test("tileset cleanup clears declared margins and spacing", () => {
  const png = new PNG({ width: 11, height: 6 });
  fillRect(png, 0, 0, 11, 6, [0, 255, 0, 255]);
  fillRect(png, 1, 1, 4, 4, [30, 80, 180, 255]);
  fillRect(png, 6, 1, 4, 4, [210, 40, 30, 255]);

  const cleaned = PNG.sync.read(removeTilesetChromaBackground(
    PNG.sync.write(png),
    {
      tileWidth: 4,
      tileHeight: 4,
      columns: 2,
      rows: 1,
      margin: 1,
      spacing: 1
    },
    { red: 0, green: 255, blue: 0 }
  ));

  assert.equal(alphaAt(cleaned, 0, 0), 0);
  assert.equal(alphaAt(cleaned, 5, 3), 0);
  assert.equal(alphaAt(cleaned, 10, 5), 0);
  assert.equal(alphaAt(cleaned, 2, 2), 255);
  assert.equal(alphaAt(cleaned, 7, 2), 255);
});

test("tileset prompt lets the model choose transparency using one declared chroma", () => {
  const asset = {
    id: "mixed.tileset",
    kind: "tileset",
    prompt: "Legacy prompt.",
    dimensions: { width: 12, height: 4 },
    tileset: {
      tileWidth: 4,
      tileHeight: 4,
      columns: 3,
      rows: 1,
      tiles: [
        { prompt: "Opaque grass." },
        { prompt: "A centered flower pickup." },
        { prompt: "An L-shaped wall corner." }
      ]
    },
    activeVersion: "",
    versions: {}
  };
  const request = { asset };
  const prompt = gameAssetPrompt(request, {
    prompt: asset.prompt,
    model: "gpt-image-2",
    outputFormat: "png",
    requestedBackground: "transparent",
    chromaKey: { red: 0, green: 255, blue: 0 }
  });

  assert.match(prompt, /Decide independently for each tile/i);
  assert.match(prompt, /For any tile that needs transparency/i);
  assert.match(prompt, /exact flat chroma-key color #00ff00/i);
  assert.match(prompt, /tile that does not need transparency/i);
  assert.doesNotMatch(prompt, /tiles 2, 3 require transparent backgrounds/i);
});

function animationRequest({ prompt = "Animate only the parrot." } = {}) {
  return {
    asset: {
      id: "background.parrot.idle",
      kind: "animation",
      prompt,
      dimensions: { width: 288, height: 288 },
      frameGrid: {
        frameCount: 4,
        frameWidth: 144,
        frameHeight: 144,
        columns: 2,
        rows: 2
      },
      settings: { background: "opaque", format: "png", model: "gpt-image-2" },
      activeVersion: "default",
      versions: {}
    }
  };
}

function frameVisibleCenter(png, originX, originY, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = png.data[((originY + y) * png.width + originX + x) * 4 + 3];

      if (alpha < 16) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function visiblePixelCount(png) {
  let count = 0;

  for (let offset = 3; offset < png.data.length; offset += 4) {
    if (png.data[offset] >= 16) count += 1;
  }

  return count;
}

function fillRect(png, x, y, width, height, rgba) {
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const offset = ((y + localY) * png.width + x + localX) * 4;
      png.data[offset] = rgba[0];
      png.data[offset + 1] = rgba[1];
      png.data[offset + 2] = rgba[2];
      png.data[offset + 3] = rgba[3];
    }
  }
}

function setPixel(png, x, y, rgba) {
  const offset = (y * png.width + x) * 4;
  png.data[offset] = rgba[0];
  png.data[offset + 1] = rgba[1];
  png.data[offset + 2] = rgba[2];
  png.data[offset + 3] = rgba[3];
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3];
}

function rgbaAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return Array.from(png.data.subarray(offset, offset + 4));
}
