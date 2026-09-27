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

function paintSprite(sheet, x, y, width, height, frame) {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    // Edge bands expose truncation at the head/feet and either side.
    const edgeX = dx < 3 ? 30 : dx >= width - 3 ? 230 : 120;
    const edgeY = dy < 3 ? 30 : dy >= height - 3 ? 230 : 120;
    sheet.data.set([40 + frame, edgeX, edgeY, 255], ((y + dy) * sheet.width + x + dx) * 4);
  }
}

function oversizedSheet(grid) {
  const { frameWidth: w, frameHeight: h, columns, rows, frameCount } = grid;
  const margin = grid.margin ?? 0, spacing = grid.spacing ?? 0;
  const sheet = new PNG({ width: 2 * margin + columns * w + (columns - 1) * spacing,
    height: 2 * margin + rows * h + (rows - 1) * spacing });
  const bounds = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const row = Math.floor(frame / columns), column = frame % columns;
    const width = Math.floor(w / 2);
    const height = row === 0 ? h + Math.floor(h / 10) : Math.floor(h * 0.7);
    const x = margin + column * (w + spacing) + Math.floor(w / 4);
    const y = margin + row * (h + spacing) + (row === 0 ? 1 : Math.floor(h / 5));
    paintSprite(sheet, x, y, width, height, frame);
    bounds.push({ width, height });
  }
  return { sheet, bounds };
}

test("oversized recovered sprites fit with one animation-wide scale, without chopping off edges", () => {
  for (const [frameWidth, frameHeight] of [[24, 32], [33, 47], [48, 64], [120, 200], [191, 257]]) {
    for (const [margin, spacing] of [[0, 0], [2, 3]]) {
      const grid = { frameWidth, frameHeight, columns: 3, rows: 3, frameCount: 8, margin, spacing };
      const { sheet, bounds } = oversizedSheet(grid);
      const scale = frameHeight / bounds[0].height;
      const encoded = alignSpriteSheetFrames(PNG.sync.write(sheet), grid);
      const result = PNG.sync.read(encoded);
      assert.deepEqual([result.width, result.height], [sheet.width, sheet.height]);
      for (let frame = 0; frame < 8; frame++) {
        const actual = framePixels(result, grid, frame);
        assert.equal(actual.right - actual.left + 1, Math.floor(bounds[frame].width * scale));
        assert.equal(actual.bottom - actual.top + 1, Math.floor(bounds[frame].height * scale));
        assert.ok(actual.pixels.every(pixel => pixel >>> 24 === 40 + frame), "no neighboring frame contamination");
        const colors = actual.pixels.map(pixel => [(pixel >>> 16) & 255, (pixel >>> 8) & 255]);
        for (const axis of [0, 1]) for (const edge of [30, 230]) {
          assert.ok(colors.some(color => color[axis] === edge), "retain every edge, including head and feet");
        }
      }
      assert.equal(framePixels(result, grid, 8).pixels.length, 0, "unused cell stays empty");
      assert.deepEqual(alignSpriteSheetFrames(encoded, grid), encoded, "fitting is stable on reprocessing");
    }
  }
});

test("oversized horizontal poses use the same reduction as the other frames", () => {
  const grid = { frameWidth: 64, frameHeight: 48, columns: 2, rows: 1, frameCount: 2 };
  const sheet = new PNG({ width: 128, height: 48 });
  paintSprite(sheet, 8, 10, 70, 20, 0);
  paintSprite(sheet, 90, 10, 30, 20, 1);
  const encoded = alignSpriteSheetFrames(PNG.sync.write(sheet), grid);
  const result = PNG.sync.read(encoded);
  const a = framePixels(result, grid, 0), b = framePixels(result, grid, 1);
  assert.equal(a.right - a.left + 1, 64);
  assert.equal(b.right - b.left + 1, Math.floor(30 * 64 / 70));
  assert.equal(a.bottom - a.top + 1, Math.floor(20 * 64 / 70));
  assert.equal(b.bottom - b.top, a.bottom - a.top);
  assert.ok(a.pixels.every(pixel => pixel >>> 24 === 40));
  assert.ok(b.pixels.every(pixel => pixel >>> 24 === 41));
  assert.deepEqual(alignSpriteSheetFrames(encoded, grid), encoded);
});

test("conflicting row and column offsets preserve sprite size and every pixel", () => {
  for (const vertical of [false, true]) {
    // Each pose fits, but the two poses in column 0 need conflicting shifts.
    const sheet = new PNG({ width: 96, height: 96 });
    const positions = [[0, 5, 40, 30], [78, 5, 16, 30], [20, 55, 40, 30], [78, 55, 16, 30]];
    positions.forEach(([x, y, w, h], frame) => {
      paintSprite(sheet, ...(vertical ? [y, x, h, w] : [x, y, w, h]), frame);
    });
    const grid = { frameWidth: 48, frameHeight: 48, columns: 2, rows: 2, frameCount: 4 };
    const encoded = alignSpriteSheetFrames(PNG.sync.write(sheet), grid);
    const result = PNG.sync.read(encoded);
    for (let frame = 0; frame < 4; frame++) {
      const expected = [];
      for (let offset = 0; offset < sheet.data.length; offset += 4) {
        if (sheet.data[offset] === 40 + frame && sheet.data[offset + 3]) expected.push(sheet.data.readUInt32BE(offset));
      }
      // Transposition swaps the middle frame indices in row-major order.
      const index = vertical ? [0, 2, 1, 3][frame] : frame;
      assert.deepEqual(framePixels(result, grid, index).pixels, expected.sort((a, b) => a - b));
    }
    assert.deepEqual(alignSpriteSheetFrames(encoded, grid), encoded);
  }
});

test("orc speak-back layout returns all three generated options despite recoverable oversized poses", async () => {
  const grid = { frameWidth: 120, frameHeight: 200, columns: 3, rows: 3, frameCount: 8 };
  const { sheet } = oversizedSheet(grid);
  const image = PNG.sync.write(sheet);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ data: [{ b64_json: image.toString("base64") }] });
    };
    const streamed = [];
    const options = await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
      asset: {
        id: "guard.speak-back", kind: "animation", prompt: "Speak, facing back, transparent background.",
        dimensions: { width: 360, height: 600 }, frameGrid: grid,
        activeVersion: "original", versions: {}, settings: { background: "transparent", format: "png" }
      }, count: 3
    }, (option, index) => { streamed.push(index); });
    assert.equal(calls, 3, "one request per whole-sheet option, no paid retries");
    assert.equal(options.length, 3);
    assert.deepEqual(streamed.sort(), [0, 1, 2]);
    for (const option of options) {
      assert.deepEqual(option.frameGrid, grid);
      const decoded = PNG.sync.read(option.image);
      for (let frame = 0; frame < 8; frame++) assert.ok(framePixels(decoded, grid, frame).pixels.length);
    }
  } finally { globalThis.fetch = originalFetch; }
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
