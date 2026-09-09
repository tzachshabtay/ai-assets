import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { createOpenAiImageProvider } from "../dist/provider.js";
import { createAiAssetDevServer } from "../dist/server.js";

const png = (width, height, color = "red") => sharp({
  create: { width, height, channels: 4, background: color }
}).png().toBuffer();
const dataUrl = (image) => `data:image/png;base64,${image.toString("base64")}`;
const reference = (image, fileName) => ({ image, fileName, mimeType: "image/png" });
const asset = (id, extra = {}) => ({
  id, kind: "image", prompt: "A game character.", dimensions: { width: 4, height: 4 },
  activeVersion: "v1", versions: {
    v1: { name: "v1", file: `/assets/${id}.png`, prompt: "Base character.", createdAt: "2026-09-08T00:00:00Z" }
  }, ...extra
});

function assertPriorityPrompt(prompt, number) {
  assert.match(prompt, new RegExp(`Priority visual reference: Reference ${number}`));
  assert.match(prompt, /priority image takes precedence/);
  assert.match(prompt, /appearance, composition, and pose/);
  assert.match(prompt, /output dimensions, frame count, tile indices, grid cell boundaries, and transparency requirements remain mandatory/);
  assert.doesNotMatch(prompt, /must depict the same exact character as the provided character reference/);
  assert.doesNotMatch(prompt, /palette, scale, cell boundaries.*absolute precedence/);
}

test("priority references are sent separately after context and override identity/style locks", async () => {
  const originalFetch = globalThis.fetch;
  const image = await png(4, 4);
  const priority = await png(3, 5, "blue");
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /images\/edits$/);
      const uploads = init.body.getAll("image[]");
      assert.deepEqual(uploads.map((file) => file.name), [
        "identity.png", "priority-reference-sketch.png", "style-reference-1-style.png"
      ]);
      assert.deepEqual(Buffer.from(await uploads[1].arrayBuffer()), priority);
      assertPriorityPrompt(init.body.get("prompt"), 2);
      return Response.json({ data: [{ b64_json: image.toString("base64") }] });
    };
    await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
      asset: asset("hero"),
      references: [reference(image, "identity.png")],
      priorityReference: reference(priority, "sketch.png"),
      styleReferences: [reference(image, "style.png")]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isolated sprite frames retain priority direction without shifting previous-frame references", async () => {
  const originalFetch = globalThis.fetch;
  const image = await png(4, 4);
  const requests = [];
  try {
    globalThis.fetch = async (_url, init) => {
      const uploads = init.body.getAll("image[]");
      requests.push({ names: uploads.map((file) => file.name), prompt: init.body.get("prompt") });
      return Response.json({ data: [{ b64_json: image.toString("base64") }] });
    };
    await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
      asset: asset("hero.run", {
        kind: "spritesheet", dimensions: { width: 8, height: 4 },
        frameGrid: { frameWidth: 4, frameHeight: 4, columns: 2, rows: 1, frameCount: 2 },
        settings: { background: "transparent" }
      }),
      count: 1,
      references: [reference(image, "identity.png")],
      priorityReference: reference(image, "sketch.png"),
      styleReferences: [reference(image, "style.png")]
    });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].names, ["identity.png", "priority-reference-sketch.png", "style-reference-1-style.png"]);
    assert.equal(requests[1].names[0], "identity.png");
    assert.match(requests[1].names[1], /prior-/);
    assert.deepEqual(requests[1].names.slice(2), ["priority-reference-sketch.png", "style-reference-1-style.png"]);
    assertPriorityPrompt(requests[0].prompt, 2);
    assertPriorityPrompt(requests[1].prompt, 3);
    assert.match(requests[1].prompt, /Reference 2 is the immediately preceding generated frame/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SVG requests include the priority image and the same visual precedence rules", async () => {
  const originalFetch = globalThis.fetch;
  const image = await png(4, 4);
  const priority = await png(3, 5, "blue");
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /responses$/);
      const body = JSON.parse(init.body);
      const content = body.input[0].content;
      assertPriorityPrompt(content[0].text, 2);
      const images = content.filter((item) => item.type === "input_image");
      assert.deepEqual(images.map((item) => item.image_url), [dataUrl(image), dataUrl(priority), dataUrl(image)]);
      return Response.json({ output_text: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>' });
    };
    const [option] = await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
      asset: asset("hero", { settings: { format: "svg" } }),
      references: [reference(image, "identity.png")],
      priorityReference: reference(priority, "sketch.png"),
      styleReferences: [reference(image, "style.png")]
    });
    assert.equal(option.mimeType, "image/svg+xml");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("priority composition avoids default recentering and respects explicit frame alignment", async () => {
  const originalFetch = globalThis.fetch;
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect x="1" y="1" width="2" height="2" fill="red"/></svg>')).png().toBuffer();
  try {
    globalThis.fetch = async () => Response.json({ data: [{ b64_json: image.toString("base64") }] });
    for (const [assetAlignment, requestAlignment, expected] of [
      [undefined, undefined, "none"],
      ["center", undefined, "center"],
      ["none", "center", "center"]
    ]) {
      const [option] = await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
        asset: asset("hero.run", {
          kind: "spritesheet", dimensions: { width: 16, height: 8 },
          frameGrid: { frameWidth: 8, frameHeight: 8, columns: 2, rows: 1, frameCount: 2 },
          settings: { background: "transparent", frameAlignment: assetAlignment }
        }),
        count: 1,
        settings: { frameAlignment: requestAlignment },
        priorityReference: reference(image, "sketch.png")
      });
      assert.equal(option.settings.frameAlignment, expected);
      const { data, info } = await sharp(option.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
      assert.equal(alphaAt(1, 1), expected === "none" ? 255 : 0);
      assert.equal(alphaAt(4, 4), expected === "center" ? 255 : 0);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tileset priority images stay unstaged while the base sheet retains reference one and crop geometry", async () => {
  const originalFetch = globalThis.fetch;
  const base = await png(4, 4);
  const priority = await png(3, 5, "blue");
  const output = await png(1024, 1024);
  try {
    globalThis.fetch = async (_url, init) => {
      const uploads = init.body.getAll("image[]");
      assert.equal(uploads.length, 2);
      const baseMetadata = await sharp(Buffer.from(await uploads[0].arrayBuffer())).metadata();
      const priorityMetadata = await sharp(Buffer.from(await uploads[1].arrayBuffer())).metadata();
      assert.equal(uploads[0].name, "base.staged.png");
      assert.equal(baseMetadata.width, 1024);
      assert.equal(baseMetadata.height, 1024);
      assert.equal(uploads[1].name, "priority-reference-sketch.png");
      assert.equal(priorityMetadata.width, 3);
      assert.equal(priorityMetadata.height, 5);
      const prompt = init.body.get("prompt");
      assertPriorityPrompt(prompt, 2);
      assert.match(prompt, /Reference 1 remains the base sheet for tile coordinates/);
      assert.match(prompt, /Actual returned raster canvas: 1024x1024 pixels/);
      assert.doesNotMatch(prompt, /Perform a minimal in-place edit of the immutable/);
      return Response.json({ data: [{ b64_json: output.toString("base64") }] });
    };
    await createOpenAiImageProvider({ apiKey: "test-key" }).generate({
      asset: asset("terrain", { kind: "tileset", tileset: {
        tileWidth: 4, tileHeight: 4, columns: 1, rows: 1,
        tiles: [{ prompt: "A tree." }]
      } }),
      purpose: "tileset-animation",
      references: [reference(base, "base.png")],
      priorityReference: reference(priority, "sketch.png"),
      settings: { size: "1024x1024" }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generation HTTP endpoints preserve priority, identity, base and style references across frames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-priority-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const image = await png(4, 4);
  const priority = await png(3, 5, "blue");
  const hero = asset("hero", { settings: { referenceAssetIds: ["identity"] } });
  const terrain = asset("terrain", { kind: "tileset", tileset: {
    tileWidth: 4, tileHeight: 4, columns: 1, rows: 1,
    tiles: [{ prompt: "A tree." }],
    animations: [{ key: "wind", prompt: "Sway gently.", frameCount: 2, frameRate: 8, repeat: -1 }]
  } });
  const manifest = { schemaVersion: 1, assets: { hero, identity: asset("identity"), terrain } };
  await mkdir(assetsDir);
  await writeFile(path.join(assetsDir, "identity.png"), image);
  await writeFile(manifestPath, JSON.stringify(manifest));
  const calls = [];
  const provider = {
    async generate(request, onOption) {
      calls.push(request);
      const option = { image, mimeType: "image/png", prompt: request.prompt, dimensions: request.asset.dimensions };
      await onOption?.(option, 0);
      return [option];
    }
  };
  const server = createAiAssetDevServer({ manifestPath, assetsDir, provider, port: 0 });
  await server.listen();
  const origin = `http://127.0.0.1:${server.server.address().port}`;
  const selected = { name: "sketch.png", dataUrl: dataUrl(priority) };
  const styleGuide = { images: [{ name: "style.png", dataUrl: dataUrl(image) }] };
  const post = (endpoint, body) => fetch(`${origin}/__ai-assets/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  try {
    for (const endpoint of ["generate", "generate-stream"]) {
      const response = await post(endpoint, {
        assetId: "hero", count: 1, priorityReference: selected, styleGuide,
        references: [{ name: "context.png", dataUrl: dataUrl(image) }]
      });
      assert.equal(response.status, 200);
      await response.text();
      const request = calls.at(-1);
      assert.deepEqual(request.references.map((ref) => ref.fileName), ["identity.png", "context.png"]);
      assert.equal(request.priorityReference.fileName, "sketch.png");
      assert.deepEqual(request.priorityReference.image, priority);
      assert.equal(request.styleReferences[0].fileName, "style.png");
    }
    const response = await post("generate-tileset-animation-stream", {
      assetId: "terrain", animationKey: "wind", count: 1, frameCount: 2,
      baseDataUrl: dataUrl(image), priorityReference: selected, styleGuide
    });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(events.at(-1).type, "done");
    const animationCalls = calls.slice(2);
    assert.equal(animationCalls.length, 2);
    for (const [index, request] of animationCalls.entries()) {
      assert.equal(request.purpose, "tileset-animation");
      assert.deepEqual(request.references[0].image, image);
      assert.equal(request.references.length, index + 1);
      assert.deepEqual(request.priorityReference.image, priority);
      assert.equal(request.priorityReference.fileName, "sketch.png");
      assert.equal(request.styleReferences[0].fileName, "style.png");
      assert.match(request.prompt, /priority reference controls intended appearance/);
      assert.doesNotMatch(request.prompt, /absolute precedence over every other reference/);
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
