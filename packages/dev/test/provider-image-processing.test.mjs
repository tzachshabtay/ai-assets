import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";

import {
  alignSpriteSheetFrames,
  analyzeReferenceImage,
  composeSpriteSheetFrames,
  resizePngToDimensions,
  shouldRequestTransparency
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

  assert.equal(shouldRequestTransparency(request, {
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
    requestedBackground: "opaque"
  });

  assert.match(prompt, /fully opaque from edge to edge/);
  assert.match(prompt, /Preserve the referenced background/);
  assert.doesNotMatch(prompt, /leaving transparent padding/);
  assert.doesNotMatch(prompt, /trailing cells fully transparent/);
});

test("native transparency supports PNG and WebP independently of the model name", () => {
  const request = animationRequest();

  for (const model of ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2", "gpt-image-1.5"]) {
    for (const outputFormat of ["png", "webp", "jpeg"]) {
      assert.equal(shouldRequestTransparency(request, {
        prompt: request.asset.prompt,
        model,
        outputFormat,
        requestedBackground: "transparent"
      }), outputFormat !== "jpeg", `${model} ${outputFormat}`);
    }
  }
});

test("automatic transparency follows image and structured tile prompts", () => {
  const request = animationRequest({ prompt: "A centered parrot." });
  const context = {
    prompt: request.asset.prompt,
    model: "gpt-image-2.5-sunburst",
    outputFormat: "webp",
    requestedBackground: "auto"
  };

  assert.equal(shouldRequestTransparency(request, context), false);
  assert.equal(shouldRequestTransparency(request, {
    ...context,
    prompt: "A transparent background."
  }), true);
  assert.equal(shouldRequestTransparency({
    ...request,
    asset: { ...request.asset, prompt: "A parrot on a transparent background." }
  }, context), true);
  const tilesetRequest = {
    asset: {
      ...request.asset,
      kind: "tileset",
      tileset: {
        tileWidth: 16,
        tileHeight: 16,
        columns: 1,
        rows: 1,
        tiles: [{ prompt: "A crystal on a transparent background." }]
      }
    }
  };
  assert.equal(shouldRequestTransparency(tilesetRequest, context), true);
  assert.equal(shouldRequestTransparency(tilesetRequest, {
    ...context,
    requestedBackground: "opaque"
  }), false);
});

test("transparent raster prompts request native alpha for PNG and WebP", () => {
  const request = {
    asset: {
      id: "portrait",
      kind: "image",
      prompt: "A centered portrait.",
      dimensions: { width: 16, height: 16 },
      activeVersion: "",
      versions: {}
    }
  };

  for (const outputFormat of ["png", "webp"]) {
    const prompt = gameAssetPrompt(request, {
      prompt: request.asset.prompt,
      model: "gpt-image-2.5-sunburst",
      outputFormat,
      requestedBackground: "transparent"
    });

    assert.match(prompt, /native alpha/i);
    assert.doesNotMatch(prompt, /chroma-key|fully opaque PNG|Do not return native alpha/i);
  }
});

test("PNG resizing preserves native alpha, enclosed holes, and saturated artwork", () => {
  const png = new PNG({ width: 5, height: 5 });
  fillRect(png, 1, 1, 3, 3, [255, 0, 255, 255]);
  setPixel(png, 2, 2, [0, 0, 0, 0]);
  setPixel(png, 1, 2, [0, 255, 0, 128]);
  setPixel(png, 3, 2, [0, 255, 255, 64]);

  const resized = PNG.sync.read(resizePngToDimensions(
    PNG.sync.write(png),
    { width: 10, height: 10 }
  ));

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        assert.deepEqual(rgbaAt(resized, x * 2 + dx, y * 2 + dy), rgbaAt(png, x, y));
      }
    }
  }
});

test("sprite composition retains partial alpha and saturated colors", async () => {
  const png = new PNG({ width: 3, height: 3 });
  fillRect(png, 0, 0, 3, 3, [255, 0, 255, 255]);
  setPixel(png, 1, 1, [0, 0, 0, 0]);
  setPixel(png, 0, 1, [0, 255, 0, 128]);
  const sheet = PNG.sync.read(await composeSpriteSheetFrames(
    [PNG.sync.write(png)],
    { width: 5, height: 5 },
    {
      frameWidth: 3,
      frameHeight: 3,
      columns: 1,
      rows: 1,
      margin: 1
    }
  ));

  assert.deepEqual(rgbaAt(sheet, 1, 1), [255, 0, 255, 255]);
  assert.deepEqual(rgbaAt(sheet, 1, 2), [0, 255, 0, 128]);
  assert.equal(rgbaAt(sheet, 2, 2)[3], 0);
  assert.equal(rgbaAt(sheet, 0, 0)[3], 0);
});

test("reference palette analysis includes colors formerly reserved for chroma keys", () => {
  for (const color of [[255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [0, 0, 255]]) {
    const png = new PNG({ width: 3, height: 3 });
    fillRect(png, 0, 0, 3, 3, [255, 255, 255, 0]);
    setPixel(png, 1, 1, [...color, 255]);
    const analysis = analyzeReferenceImage({
      image: PNG.sync.write(png),
      mimeType: "image/png",
      fileName: "reference.png"
    });

    assert.ok(analysis);
    assert.equal(analysis.dominantColors.length, 1);
    assert.ok(analysis.dominantColors[0].includes(`rgb(${color.join(", ")})`));
  }
});

test("tileset prompts choose native transparency independently for each tile", () => {
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
  const prompt = gameAssetPrompt({ asset }, {
    prompt: asset.prompt,
    model: "gpt-image-2.5-sunburst",
    outputFormat: "png",
    requestedBackground: "transparent"
  });

  assert.match(prompt, /Decide independently for each tile/i);
  assert.match(prompt, /native alpha transparency for every transparent or empty pixel/i);
  assert.match(prompt, /native alpha/i);
  assert.match(prompt, /tile that does not need transparency/i);
  assert.doesNotMatch(prompt, /chroma-key|tiles 2, 3 require transparent backgrounds/i);
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

function rgbaAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return Array.from(png.data.subarray(offset, offset + 4));
}
