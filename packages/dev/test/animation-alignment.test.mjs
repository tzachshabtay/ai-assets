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

// The innkeeper regression: the first row's feet cross the requested cut by
// one pixel. Cutting fixed cells first leaves a detached foot strip in row 2,
// so its bounds appear taller and its alignment gets clamped incorrectly.
function spillingSheet(grid) {
  const { frameWidth: width, frameHeight: height, columns, rows } = grid;
  const margin = grid.margin ?? 0, spacing = grid.spacing ?? 0;
  const sheet = new PNG({ width: 2 * margin + columns * width + (columns - 1) * spacing,
    height: 2 * margin + rows * height + (rows - 1) * spacing });
  const w = Math.floor(width / 2), h = Math.floor(height * 3 / 4);
  for (let frame = 0; frame < grid.frameCount; frame++) {
    const column = frame % columns, row = Math.floor(frame / columns);
    const x = margin + column * (width + spacing) + (column === 0 ? width - w + spacing + 1 : 3);
    const y = margin + row * (height + spacing) + (row === 0 ? height - h + spacing + 1 : 3);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const offset = ((y + dy) * sheet.width + x + dx) * 4;
      sheet.data.set([40 + frame, 120 + dx % 80, 60 + dy % 80, dx === 0 ? 128 : 255], offset);
    }
  }
  return sheet;
}

test("recover complete sprites across row and column cuts before alignment", () => {
  for (const [frameWidth, frameHeight] of [[7, 11], [33, 47], [48, 64], [96, 128], [191, 257]]) {
    for (const [margin, spacing] of [[0, 0], [2, 1]]) {
      for (const frameCount of [7, 8]) {
        const grid = { frameWidth, frameHeight, columns: 3, rows: 3, frameCount, margin, spacing };
        const before = spillingSheet(grid);
        let output;
        try { output = alignSpriteSheetFrames(PNG.sync.write(before), grid); }
        catch (error) { throw new Error(`Grid ${JSON.stringify(grid)}: ${error.message}`, { cause: error }); }
        const after = PNG.sync.read(output);
        const frames = [];
        for (let frame = 0; frame < grid.frameCount; frame++) {
          const expected = [];
          for (let offset = 0; offset < before.data.length; offset += 4) {
            if (before.data[offset] === 40 + frame && before.data[offset + 3]) expected.push(before.data.readUInt32BE(offset));
          }
          const actual = framePixels(after, grid, frame);
          assert.deepEqual(actual.pixels, expected.sort((a, b) => a - b), `frame ${frame}: retain all pixels in the correct cell`);
          frames.push(actual);
      }
      assert.equal(new Set(frames.map(frame => frame.bottom)).size, 1, "same baseline in every row");
      assert.equal(new Set(frames.map(frame => frame.left)).size, 1, "same placement in every column");
      assert.equal(framePixels(after, grid, 8).pixels.length, 0, "unused final cell stays empty");
      assert.deepEqual(alignSpriteSheetFrames(output, grid), output, "recovered grid is stable");
      }
    }
  }
});

test("oversized recovered artwork is rejected rather than silently cropped", () => {
  const grid = { frameWidth: 48, frameHeight: 64, columns: 1, rows: 2, frameCount: 2 };
  const sheet = new PNG({ width: 48, height: 128 });
  for (let y = 8; y < 78; y++) for (let x = 10; x < 30; x++) {
    sheet.data.set([80, 90, 100, 255], (y * 48 + x) * 4);
  }
  for (let y = 90; y < 120; y++) for (let x = 10; x < 30; x++) {
    sheet.data.set([110, 120, 130, 255], (y * 48 + x) * 4);
  }
  assert.throws(() => alignSpriteSheetFrames(PNG.sync.write(sheet), grid), /do not fit.*without cropping/);
});

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
      const source = spillingSheet(grid), image = PNG.sync.write(source);
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
        {
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
