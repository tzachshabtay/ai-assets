import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { createOpenAiImageProvider } from "../dist/provider.js";
import { prepareAnimationFramingReference } from "../dist/provider-image-processing.js";

function frame(width, height, color = [20, 180, 80]) {
  const png = new PNG({ width, height });
  for (let y = 2; y < height - 2; y++) for (let x = 1; x < width - 1; x++) {
    png.data.set([...color, 255], (y * width + x) * 4);
  }
  return PNG.sync.write(png);
}

function referenceSheet(grid, firstVisible = 0) {
  const { frameWidth: w, frameHeight: h, columns, rows, margin = 0, spacing = 0 } = grid;
  const png = new PNG({
    width: 2 * margin + columns * w + (columns - 1) * spacing,
    height: 2 * margin + rows * h + (rows - 1) * spacing
  });
  const referenceFrame = frame(w, h);
  const decoded = PNG.sync.read(referenceFrame);
  for (let index = firstVisible; index < grid.frameCount; index++) {
    const x = margin + index % columns * (w + spacing);
    const y = margin + Math.floor(index / columns) * (h + spacing);
    PNG.bitblt(decoded, png, 0, 0, w, h, x, y);
  }
  return {
    referenceFrame,
    reference: { image: PNG.sync.write(png), mimeType: "image/png", fileName: "guard.idle.png", frameGrid: grid }
  };
}

function request(priorityReference, kind = "animation") {
  return {
    asset: {
      id: "guard.walk-left", kind, prompt: "Walk left.",
      dimensions: { width: 40, height: 80 },
      frameGrid: { frameWidth: 20, frameHeight: 40, columns: 2, rows: 2, frameCount: 3 },
      activeVersion: "", versions: {}, settings: { background: "transparent" }
    },
    references: [{ image: frame(10, 20, [200, 30, 50]), mimeType: "image/png", fileName: "base.png", role: "animation-base" }],
    priorityReference,
    styleReferences: [{ image: frame(10, 20), mimeType: "image/png", fileName: "style.png" }],
    count: 3
  };
}

test("priority sheets use a complete visible frame with original margins, for varied grids and resolutions", async () => {
  for (const grid of [
    { frameWidth: 40, frameHeight: 80, columns: 3, rows: 3, frameCount: 8 },
    { frameWidth: 13, frameHeight: 27, columns: 2, rows: 3, frameCount: 5, margin: 3, spacing: 2 },
    { frameWidth: 160, frameHeight: 320, columns: 4, rows: 1, frameCount: 4 }
  ]) {
    const { reference, referenceFrame } = referenceSheet(grid, 1);
    const input = request(reference);
    const prepared = await prepareAnimationFramingReference(input);
    assert.deepEqual(prepared.priorityReference.image, referenceFrame);
    assert.equal(prepared.priorityReference.role, "animation-base");
    assert.equal(prepared.priorityReference.frameGrid, undefined);
    assert.equal(prepared.priorityReference.fileName, "guard.idle-frame-2.png");
    assert.equal(input.priorityReference, reference, "preparation must not mutate the UI reference");
    assert.deepEqual((await prepareAnimationFramingReference(prepared)).priorityReference, prepared.priorityReference);
  }
});

test("malformed and empty reference grids fail before any generation request", async () => {
  const { reference } = referenceSheet({ frameWidth: 10, frameHeight: 20, columns: 2, rows: 2, frameCount: 3 });
  for (const change of [{ frameWidth: 0 }, { rows: -1 }, { spacing: -1 }, { frameCount: 5 }, { frameWidth: 100 }]) {
    await assert.rejects(prepareAnimationFramingReference(request({ ...reference, frameGrid: { ...reference.frameGrid, ...change } })), /frame grid|outside/);
  }
  const empty = referenceSheet({ frameWidth: 10, frameHeight: 20, columns: 2, rows: 2, frameCount: 3 }, 3);
  await assert.rejects(prepareAnimationFramingReference(request(empty.reference)), /no visible frames/);
});

test("all three whole-sheet requests use the priority frame for identity, measured scale and layout", async () => {
  const { reference, referenceFrame } = referenceSheet({ frameWidth: 10, frameHeight: 20, columns: 3, rows: 3, frameCount: 8 });
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /images\/edits$/);
      const uploads = init.body.getAll("image[]");
      assert.deepEqual(uploads.map((file) => file.name), [
        "base.png", "priority-reference-guard.idle-frame-1.png", "animation-base-layout.png", "style-reference-1-style.png"
      ]);
      assert.deepEqual(Buffer.from(await uploads[1].arrayBuffer()), referenceFrame);
      const layout = PNG.sync.read(Buffer.from(await uploads[2].arrayBuffer()));
      // The guide uses the green chosen frame, not the red automatic base.
      const pixel = (x, y) => [...layout.data.subarray((y * layout.width + x) * 4, (y * layout.width + x) * 4 + 4)];
      assert.deepEqual(pixel(Math.floor(layout.width / 4), Math.floor(layout.height / 4)), [20, 180, 80, 255]);
      assert.equal(pixel(Math.floor(layout.width * .75), Math.floor(layout.height * .75))[3], 0, "unused output cell stays empty");
      const prompt = init.body.get("prompt");
      assert.match(prompt, /Reference 2 is the user-selected single-frame animation reference/);
      assert.match(prompt, /canvas 10x20; visible artwork at \(1,2\), 8x16 pixels/);
      assert.match(prompt, /Reference 3 \(animation-base-layout.png\).*user-selected reference frame/);
      assert.match(prompt, /Animate the exact subject in the priority reference/);
      assert.doesNotMatch(prompt, /with empty padding on every side|leaving transparent padding inside the cell/);
      requests.push(prompt);
      return Response.json({ data: [{ b64_json: frame(40, 80).toString("base64") }] });
    };
    const options = await createOpenAiImageProvider({ apiKey: "test" }).generate(request(reference));
    assert.equal(options.length, 3);
    assert.equal(requests.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("isolated frames keep the chosen frame authoritative rather than previous-frame scale", async () => {
  const { reference, referenceFrame } = referenceSheet({ frameWidth: 10, frameHeight: 20, columns: 3, rows: 3, frameCount: 8 });
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (_url, init) => {
      const uploads = init.body.getAll("image[]");
      const priorityIndex = requests.length === 0 ? 1 : 2;
      assert.deepEqual(Buffer.from(await uploads[priorityIndex].arrayBuffer()), referenceFrame);
      const prompt = init.body.get("prompt");
      assert.match(prompt, new RegExp(`Reference ${priorityIndex + 1} is the user-selected single-frame animation reference`));
      assert.match(prompt, /canvas 10x20; visible artwork at \(1,2\), 8x16 pixels/);
      assert.doesNotMatch(prompt, /Show the entire subject with padding on every side/);
      if (requests.length) {
        assert.match(prompt, /Reference 2 is the immediately preceding generated frame/);
        assert.match(prompt, /user-selected reference frame remains authoritative/);
        assert.doesNotMatch(prompt, /original base image remains authoritative/);
      }
      requests.push(prompt);
      return Response.json({ data: [{ b64_json: referenceFrame.toString("base64") }] });
    };
    await createOpenAiImageProvider({ apiKey: "test" }).generate({ ...request(reference, "spritesheet"), count: 1 });
    assert.equal(requests.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("SVG animation generation also receives a reference frame, not the original sheet", async () => {
  const { reference, referenceFrame } = referenceSheet({ frameWidth: 10, frameHeight: 20, columns: 3, rows: 3, frameCount: 8 });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const content = JSON.parse(init.body).input[0].content;
      assert.equal(content[2].image_url, `data:image/png;base64,${referenceFrame.toString("base64")}`);
      assert.match(content[0].text, /Reference 2 is the user-selected single-frame animation reference/);
      return Response.json({ output_text: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"></svg>' });
    };
    await createOpenAiImageProvider({ apiKey: "test" }).generate({ ...request(reference), count: 1, settings: { format: "svg" } });
  } finally { globalThis.fetch = originalFetch; }
});
