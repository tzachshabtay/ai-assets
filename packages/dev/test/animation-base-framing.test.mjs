import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { createOpenAiImageProvider, gameAssetPrompt } from "../dist/provider.js";
import { animationBaseFramingPromptLines, animationBaseLayoutReference } from "../dist/provider-image-processing.js";

const png = new PNG({ width: 48, height: 48 });
for (let y = 6; y < 44; y++) for (let x = 11; x < 39; x++) {
  const offset = (y * 48 + x) * 4;
  png.data[offset] = 220; png.data[offset + 1] = 180; png.data[offset + 2] = 90; png.data[offset + 3] = 255;
}
const image = PNG.sync.write(png);
const base = { image, mimeType: "image/png", fileName: "cursor.base.png", role: "animation-base" };
const request = (kind = "animation") => ({
  asset: {
    id: "cursor.click", kind, prompt: "Move the footprints back and forth.",
    dimensions: { width: 96, height: 48 },
    frameGrid: { frameWidth: 48, frameHeight: 48, columns: 2, rows: 1, frameCount: 2 },
    settings: { background: "transparent" }, activeVersion: "", versions: {}
  }, references: [base]
});
const context = { prompt: "Move the footprints back and forth.", model: "gpt-image-2.5-sunburst", outputFormat: "png", requestedBackground: "transparent" };
function assertFraming(prompt) {
  assert.match(prompt, /Reference 1 is the original single-frame base image/);
  assert.match(prompt, /canvas 48x48; visible artwork at \(11,6\), 28x38 pixels/);
  assert.match(prompt, /58\.3% of frame width and 79\.2% of frame height/);
  assert.match(prompt, /22\.9% from the left and 12\.5% from the top/);
  assert.match(prompt, /Preserve the size of individual body parts and components/);
  assert.doesNotMatch(prompt, /with empty padding on every side|leaving transparent padding inside the cell|with transparent padding on all sides|Use a centered subject|Establish the character identity, scale/);
}

test("whole-sheet generation anchors each cell to the base image instead of imposing new margins", () => {
  const input = request();
  assertFraming(gameAssetPrompt(input, { ...context, generationDimensions: { width: 1536, height: 768 } }));
  // Changing frame resolution preserves the normalized framing measurement.
  input.asset.dimensions = { width: 192, height: 96 };
  input.asset.frameGrid = { ...input.asset.frameGrid, frameWidth: 96, frameHeight: 96 };
  assertFraming(gameAssetPrompt(input, context));
});

test("SVG generation uses the same per-frame base framing", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /responses$/);
      const content = JSON.parse(init.body).input[0].content;
      assertFraming(content[0].text);
      assert.equal(content[1].image_url, `data:image/png;base64,${image.toString("base64")}`);
      return Response.json({ output_text: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect x="11" y="6" width="28" height="38" fill="red"/></svg>' });
    };
    const input = request();
    input.asset.settings.format = "svg";
    await createOpenAiImageProvider({ apiKey: "test" }).generate({ ...input, count: 1 });
  } finally { globalThis.fetch = originalFetch; }
});

test("ordinary identity and style images do not accidentally become framing locks; manual priority wins", () => {
  const input = request();
  input.references = [{ ...base, role: undefined }];
  input.styleReferences = [base];
  assert.deepEqual(animationBaseFramingPromptLines(input), []);
  input.references = [base];
  input.priorityReference = { ...base, role: undefined, fileName: "sketch.png" };
  const prompt = gameAssetPrompt(input, context);
  assert.match(prompt, /Reference 2 is the user-selected single-frame animation reference/);
  assert.match(prompt, /Measured base framing/);
  assert.match(prompt, /priority image takes precedence/);
});

test("non-PNG and empty base images retain qualitative framing without invented measurements", () => {
  for (const reference of [
    { ...base, mimeType: "image/svg+xml", image: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    { ...base, image: PNG.sync.write(new PNG({ width: 48, height: 48 })) }
  ]) {
    const prompt = gameAssetPrompt({ ...request(), references: [reference] }, context);
    assert.match(prompt, /Base-frame scale contract/);
    assert.doesNotMatch(prompt, /Measured base framing/);
  }
});

test("the layout guide repeats complete base canvases without trimming margins and leaves unused cells empty", async () => {
  const input = request();
  input.asset.dimensions = { width: 102, height: 102 };
  input.asset.frameGrid = { frameWidth: 48, frameHeight: 48, columns: 2, rows: 2, frameCount: 3, margin: 2, spacing: 2 };
  const guide = PNG.sync.read((await animationBaseLayoutReference(input)).image);
  for (let index = 0; index < 4; index++) for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const offset = ((2 + Math.floor(index / 2) * 50 + y) * guide.width + 2 + (index % 2) * 50 + x) * 4;
    assert.equal(guide.data[offset + 3], index < 3 ? png.data[(y * 48 + x) * 4 + 3] : 0);
  }
  input.priorityReference = base;
  assert.deepEqual(PNG.sync.read((await animationBaseLayoutReference(input)).image).data, guide.data);
  delete input.priorityReference;
  delete input.asset.frameGrid;
  assert.equal(await animationBaseLayoutReference(input), undefined);
});

test("all three whole-sheet candidates send the base image with per-frame scale instructions", async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /images\/edits$/);
      const uploads = init.body.getAll("image[]");
      assert.equal(uploads.length, 2);
      assert.deepEqual(Buffer.from(await uploads[0].arrayBuffer()), image);
      assert.equal(uploads[1].name, "animation-base-layout.png");
      assert.match(init.body.get("prompt"), /Reference 2 \(animation-base-layout.png\) is the exact starting layout/);
      const layout = PNG.sync.read(Buffer.from(await uploads[1].arrayBuffer()));
      assert.equal(layout.width / layout.height, 2);
      prompts.push(init.body.get("prompt"));
      return Response.json({ data: [{ b64_json: PNG.sync.write(new PNG({ width: 96, height: 48 })).toString("base64") }] });
    };
    const options = await createOpenAiImageProvider({ apiKey: "test" }).generate({ ...request(), count: 3 });
    assert.equal(options.length, 3); assert.equal(prompts.length, 3);
    prompts.forEach(assertFraming);
  } finally { globalThis.fetch = originalFetch; }
});

test("isolated sprite frames keep the original base authoritative instead of inheriting previous-frame shrinkage", async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];
  try {
    globalThis.fetch = async (_url, init) => {
      const uploads = init.body.getAll("image[]");
      assert.deepEqual(Buffer.from(await uploads[0].arrayBuffer()), image);
      prompts.push(init.body.get("prompt"));
      return Response.json({ data: [{ b64_json: image.toString("base64") }] });
    };
    await createOpenAiImageProvider({ apiKey: "test" }).generate({ ...request("spritesheet"), count: 1 });
    assert.equal(prompts.length, 2);
    prompts.forEach(assertFraming);
    assert.match(prompts[1], /Reference 2 is the immediately preceding generated frame/);
    assert.match(prompts[1], /original base image remains authoritative for subject scale/);
  } finally { globalThis.fetch = originalFetch; }
});
