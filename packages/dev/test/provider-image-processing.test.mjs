import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "pngjs";

import {
  alignSpriteSheetFrames,
  shouldRequestRgbaPng
} from "../dist/provider-image-processing.js";
import { gameAssetPrompt } from "../dist/provider.js";

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
