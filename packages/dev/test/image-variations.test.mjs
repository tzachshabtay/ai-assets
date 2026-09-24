import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { createOpenAiImageProvider, gameAssetPrompt } from "../dist/provider.js";

const asset = { id: "guard", kind: "image", prompt: "A pixel-art orc guard, one standing front-facing idle pose.",
  dimensions: { width: 21, height: 128 }, settings: { background: "transparent" }, activeVersion: "original", versions: {} };

test("three still-image candidates receive distinct visual directions in raster and SVG requests", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const format of ["png", "svg"]) {
      const prompts = [];
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        prompts.push(format === "svg" ? body.input[0].content[0].text : body.prompt);
        return Response.json(format === "svg"
          ? { output_text: '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="128"><rect width="21" height="128" fill="green"/></svg>' }
          : { data: [{ b64_json: PNG.sync.write(new PNG({ width: 21, height: 128 })).toString("base64") }] });
      };
      const results = await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
        asset: { ...asset, settings: { ...asset.settings, format } }, count: 3
      });
      assert.equal(results.length, 3);
      assert.equal(prompts.length, 3);
      for (const [index, prompt] of prompts.entries()) {
        assert.ok(prompt.includes(asset.prompt), "keep the user's brief");
        assert.match(prompt, new RegExp(`Static image candidate ${index + 1} of 3`));
        assert.doesNotMatch(prompt, /pose progression|animation timing|motion concentrated|same exact character identity/);
        assert.match(prompt, /Generate exactly one still image/);
      }
      const directions = prompts.map(prompt => prompt.split("\n").find(line => line.startsWith("Base image variation direction:")));
      assert.equal(new Set(directions).size, 3, "different directions, not just different random seed strings");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("animation candidates keep identity and motion constraints; referenced stills keep reference constraints", () => {
  const context = { prompt: asset.prompt, model: "gpt-image-2.5-sunburst", outputFormat: "png", transparentBackground: true,
    variation: "test-seed", variationIndex: 1, variationCount: 3 };
  const animation = gameAssetPrompt({ asset: { ...asset, kind: "animation", dimensions: { width: 42, height: 128 },
    frameGrid: { columns: 2, rows: 1, frameWidth: 21, frameHeight: 128, frameCount: 2 } } }, context);
  assert.match(animation, /same exact character identity/);
  assert.match(animation, /different timing and spacing/);
  assert.doesNotMatch(animation, /Base image variation direction/);
  const reference = { image: PNG.sync.write(new PNG({ width: 21, height: 128 })), mimeType: "image/png", fileName: "guard.png" };
  const referenced = gameAssetPrompt({ asset, references: [reference] }, context);
  assert.match(referenced, /same exact character as the provided character reference/);
  assert.match(referenced, /reference-defined identity, palette, and composition take precedence/);
  const single = gameAssetPrompt({ asset }, { ...context, variation: undefined });
  assert.doesNotMatch(single, /Static image candidate|Base image variation direction/);
});
