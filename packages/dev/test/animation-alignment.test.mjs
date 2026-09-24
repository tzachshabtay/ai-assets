import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import sharp from "sharp";
import { createOpenAiImageProvider } from "../dist/provider.js";
import { alignSpriteSheetFrames } from "../dist/provider-image-processing.js";

function driftingSheet(grid) {
  const { frameWidth: width, frameHeight: height, columns, rows } = grid;
  const margin = grid.margin ?? 0, spacing = grid.spacing ?? 0;
  const sheet = new PNG({
    width: margin * 2 + columns * width + (columns - 1) * spacing,
    height: margin * 2 + rows * height + (rows - 1) * spacing
  });
  const count = grid.frameCount ?? columns * rows;
  for (let frame = 0; frame < count; frame++) {
    const column = frame % columns, row = Math.floor(frame / columns);
    const w = Math.max(1, Math.floor(width / 3)), h = Math.max(1, Math.floor(height / 3));
    const x = Math.floor((width - w) * (column + 1) / (columns + 1));
    const y = Math.floor((height - h) * (rows - row) / (rows + 1));
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const offset = ((margin + row * (height + spacing) + y + dy) * sheet.width +
        margin + column * (width + spacing) + x + dx) * 4;
      // Unique frame colors expose any cross-frame contamination; retain partial alpha too.
      sheet.data.set([40 + frame, 120 + dx % 80, 60 + dy % 80, dx === 0 ? 128 : 255], offset);
    }
  }
  return sheet;
}

function framePixels(sheet, grid, frame) {
  const ox = (grid.margin ?? 0) + frame % grid.columns * (grid.frameWidth + (grid.spacing ?? 0));
  const oy = (grid.margin ?? 0) + Math.floor(frame / grid.columns) * (grid.frameHeight + (grid.spacing ?? 0));
  const pixels = [];
  let left = grid.frameWidth, top = grid.frameHeight, right = -1, bottom = -1;
  for (let y = 0; y < grid.frameHeight; y++) for (let x = 0; x < grid.frameWidth; x++) {
    const offset = ((oy + y) * sheet.width + ox + x) * 4;
    if (!sheet.data[offset + 3]) continue;
    pixels.push(sheet.data.readUInt32BE(offset));
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { pixels: pixels.sort((a, b) => a - b), left, top, right, bottom };
}

function assertAligned(before, after, grid) {
  assert.deepEqual([after.width, after.height], [before.width, before.height]);
  const frames = [];
  for (let frame = 0; frame < grid.columns * grid.rows; frame++) {
    const a = framePixels(before, grid, frame), b = framePixels(after, grid, frame);
    assert.deepEqual(b.pixels, a.pixels, `frame ${frame}: retain size, colors, and alpha`);
    assert.equal(b.right - b.left, a.right - a.left, `frame ${frame}: no horizontal scaling`);
    assert.equal(b.bottom - b.top, a.bottom - a.top, `frame ${frame}: no vertical scaling`);
    if (b.pixels.length) frames.push(b);
  }
  // All poses in this fixture have identical local geometry, only grid-dependent drift.
  assert.ok(Math.max(...frames.map(f => f.bottom)) - Math.min(...frames.map(f => f.bottom)) <= 1);
  assert.ok(Math.max(...frames.map(f => f.left)) - Math.min(...frames.map(f => f.left)) <= 1);
}

test("row/column alignment preserves each frame at tiny, odd, rectangular and large sizes", () => {
  for (const [frameWidth, frameHeight] of [[1, 1], [2, 3], [7, 11], [24, 32], [32, 32],
    [33, 47], [48, 64], [96, 128], [191, 257], [512, 384]]) {
    for (const [columns, rows, frameCount] of [[3, 3, 8], [2, 4, 7], [1, 4, 4], [4, 1, 4]]) {
      for (const [margin, spacing] of [[0, 0], [2, 3]]) {
        const grid = { frameWidth, frameHeight, columns, rows, frameCount, margin, spacing };
        const original = driftingSheet(grid);
        const aligned = alignSpriteSheetFrames(PNG.sync.write(original), grid);
        assertAligned(original, PNG.sync.read(aligned), grid);
        assert.deepEqual(alignSpriteSheetFrames(aligned, grid), aligned, "alignment is idempotent");
      }
    }
  }
});

test("whole-sheet animations align with a selected reference in both PNG and WebP", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [frameWidth, frameHeight] of [[7, 11], [33, 47], [48, 64], [191, 257]]) {
      const grid = { frameWidth, frameHeight, columns: 3, rows: 3, frameCount: 8 };
      const source = driftingSheet(grid), image = PNG.sync.write(source);
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json({ data: [{ b64_json: image.toString("base64") }] });
      };
      for (const format of ["png", "webp"]) {
        const [option] = await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
          asset: {
            id: "elder.speak-front", kind: "animation", prompt: "Speak, facing front.",
            dimensions: { width: source.width, height: source.height }, frameGrid: grid,
            activeVersion: "original", versions: {}, settings: { background: "transparent", format }
          },
          priorityReference: { image, mimeType: "image/png", fileName: "elder-idle.png" }
        });
        assert.equal(option.settings.frameAlignment, "center");
        assert.deepEqual(option.frameGrid, grid);
        const decoded = PNG.sync.read(await sharp(option.image).png().toBuffer());
        if (format === "png") assertAligned(source, decoded, grid);
        else {
          const bottoms = Array.from({ length: 8 }, (_, f) => framePixels(decoded, grid, f).bottom);
          assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 1);
        }
      }
      assert.equal(calls, 2, "one complete sheet per option, not independent AI frames");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
