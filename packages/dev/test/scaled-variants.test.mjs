import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  assertManifest,
  selectScaledVariant,
  scaledVariantGeometry,
} from "@ai-game-assets/core";
import { createAiAssetDevServer } from "../dist/server.js";
import {
  generateScaledVariantOptions,
  saveScaledVariant,
  resizeScaledSource,
  createOpenAiUpscaleProvider,
} from "../dist/scaled-variants.js";
import {
  normalizeAssetUrls,
  referencedAssetFiles,
  pruneManifestForBuild,
} from "../dist/build-manifest.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "scaled-variants-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    manifestPath: path.join(root, "assets.json"),
    assetsDir: path.join(root, "art"),
    publicPathPrefix: "art",
  };
  await mkdir(options.assetsDir);
  const image = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await writeFile(path.join(options.assetsDir, "source.png"), image);
  const asset = {
    id: "hero",
    kind: "image",
    prompt: "hero",
    dimensions: { width: 2, height: 2 },
    activeVersion: "v1",
    versions: {
      v1: {
        name: "v1",
        file: "art/source.png",
        prompt: "hero",
        createdAt: "2026-01-01",
      },
    },
  };
  const manifest = { schemaVersion: 1, assets: { hero: asset } };
  await writeFile(options.manifestPath, JSON.stringify(manifest));
  const generate = (extra) =>
    saveScaledVariant(options, {
      assetId: "hero",
      versionName: "v1",
      sourceFile: "art/source.png",
      action: "generate",
      width: 4,
      height: 4,
      ...extra,
    });
  return { options, manifest, asset, generate, image };
}

test("CRUD uses the closest existing source, excludes the regenerated variant and keeps the source immutable", async (t) => {
  const f = await fixture(t);
  const first = (await f.generate({})).variant;
  const second = (await f.generate({ width: 8, height: 8 })).variant;
  assert.equal(second.sourceFile, first.file);
  const regenerated = (
    await f.generate({
      id: first.id,
      expectedFile: first.file,
      width: 6,
      height: 6,
    })
  ).variant;
  assert.equal(regenerated.id, first.id);
  assert.notEqual(regenerated.file, first.file);
  assert.equal(regenerated.sourceFile, second.file);
  await assert.rejects(
    f.generate({ id: first.id, expectedFile: first.file }),
    /changed/,
  );
  await assert.rejects(f.generate({ width: 8, height: 8 }), /unique/);
  const before = JSON.parse(await readFile(f.options.manifestPath, "utf8"));
  assert.equal(
    Object.keys(before.assets.hero.versions.v1.scaledVariants).length,
    2,
  );
  assert.deepEqual(before.assets.hero.dimensions, { width: 2, height: 2 });
  assert.equal(before.assets.hero.activeVersion, "v1");
  assert.deepEqual(
    await readFile(path.join(f.options.assetsDir, "source.png")),
    f.image,
  );
  const deleted = await saveScaledVariant(f.options, {
    assetId: "hero",
    versionName: "v1",
    sourceFile: "art/source.png",
    id: first.id,
    expectedFile: regenerated.file,
    action: "delete",
  });
  assert.equal(deleted.asset.versions.v1.scaledVariants[first.id], undefined);
  assert.equal(Object.keys(deleted.asset.versions.v1.scaledVariants).length, 1);
});

test("touch-up replaces only the chosen variant, and malformed or dimension-changing images do not persist", async (t) => {
  const f = await fixture(t),
    v = (await f.generate({})).variant;
  const request = {
    assetId: "hero",
    versionName: "v1",
    sourceFile: "art/source.png",
    id: v.id,
    expectedFile: v.file,
    action: "touch-up",
  };
  const before = await readFile(f.options.manifestPath, "utf8");
  await assert.rejects(
    saveScaledVariant(f.options, {
      ...request,
      dataUrl: "data:image/png;base64,garbage",
    }),
  );
  await assert.rejects(
    saveScaledVariant(f.options, {
      ...request,
      dataUrl: "data:image/png;base64," + f.image.toString("base64"),
    }),
    /dimensions/,
  );
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  const green = await sharp({
    create: { width: 4, height: 4, channels: 4, background: "#00ff00" },
  })
    .png()
    .toBuffer();
  const edited = (
    await saveScaledVariant(f.options, {
      ...request,
      dataUrl: "data:image/png;base64," + green.toString("base64"),
    })
  ).variant;
  assert.equal(edited.method, "touch-up");
  assert.equal(edited.sourceFile, v.file);
  assert.notEqual(edited.file, v.file);
  assert.deepEqual(
    await readFile(path.join(f.options.assetsDir, path.basename(edited.file))),
    green,
  );
});

test("strict resizing preserves colors, alpha, cell order, and grid spacing never bleeds into adjacent cells", async () => {
  const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 128]);
  const image = await sharp(pixels, {
    raw: { width: 3, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  const source = {
    file: "source.png",
    dimensions: { width: 3, height: 1 },
    frameGrid: {
      frameWidth: 1,
      frameHeight: 1,
      columns: 2,
      rows: 1,
      spacing: 1,
      frameCount: 2,
    },
  };
  const target = scaledVariantGeometry(
    { id: "test", kind: "animation", ...source },
    { width: 4, height: 3 },
  );
  const output = await resizeScaledSource(image, source, target, "nearest");
  const { data, info } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [8, 3]);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 8; x++)
      assert.deepEqual(
        [...data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)],
        x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 128],
      );
});

test("AI provider receives a static image and target dimensions; returned alpha is retained", async () => {
  const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 255]);
  const image = await sharp(pixels, {
    raw: { width: 2, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  const source = { file: "source.png", dimensions: { width: 2, height: 1 } };
  let called = 0;
  const output = await resizeScaledSource(
    image,
    source,
    { dimensions: { width: 4, height: 2 } },
    "ai-upscale",
    {
      async upscale(input) {
        called++;
        assert.deepEqual(Object.keys(input).sort(), [
          "height",
          "image",
          "signal",
          "width",
        ]);
        return sharp({
          create: { width: 4, height: 2, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.5 } },
        })
          .png()
          .toBuffer();
      },
    },
  );
  assert.equal(called, 1);
  const data = await sharp(output).raw().toBuffer();
  assert.equal(data[3], 128);
  assert.equal(data[15], 128);
  assert.equal(data[13], 255);
  await resizeScaledSource(
    image,
    source,
    { dimensions: { width: 1, height: 1 } },
    "ai-upscale",
    {
      async upscale() {
        throw new Error("Downscaling must not call AI");
      },
    },
  );
});

test("provider failure and canceled generation preserve manifest and files", async (t) => {
  const f = await fixture(t),
    before = await readFile(f.options.manifestPath, "utf8");
  f.options.upscaleProvider = {
    async upscale() {
      throw new Error("offline");
    },
  };
  await assert.rejects(f.generate({ method: "ai-upscale" }), /offline/);
  const signal = AbortSignal.abort(new Error("canceled"));
  await assert.rejects(
    saveScaledVariant(
      f.options,
      {
        assetId: "hero",
        versionName: "v1",
        sourceFile: "art/source.png",
        action: "generate",
        width: 4,
        height: 4,
      },
      signal,
    ),
    /canceled/,
  );
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
});

test("variant selection respects availability, version scope, ties and immutable source geometry", async (t) => {
  const f = await fixture(t);
  const result = await f.generate({});
  const asset = result.asset;
  assert.equal(
    selectScaledVariant(asset, { width: 3, height: 3 }).id,
    result.variant.id,
  );
  assert.equal(
    selectScaledVariant(
      asset,
      { width: 4, height: 4 },
      { available: (s) => !s.id },
    ).id,
    undefined,
  );
  asset.versions.v2 = {
    name: "v2",
    file: "art/new.png",
    prompt: "new",
    createdAt: "now",
  };
  asset.activeVersion = "v2";
  asset.dimensions = { width: 16, height: 16 };
  assert.equal(
    selectScaledVariant(asset, { width: 4, height: 4 }).file,
    "art/new.png",
  );
  assert.equal(
    selectScaledVariant(
      asset,
      { width: 4, height: 4 },
      { version: asset.versions.v1 },
    ).id,
    result.variant.id,
  );
  assertManifest({ schemaVersion: 1, assets: { hero: asset } });
  asset.versions.v1.scaledVariants[result.variant.id].dimensions.width = 0;
  assert.throws(
    () => assertManifest({ schemaVersion: 1, assets: { hero: asset } }),
    /positive/,
  );
});

test("production pruning, URL normalization and file copying retain active scaled variants", async (t) => {
  const f = await fixture(t),
    result = await f.generate({});
  result.variant.file = "/assets/large.png";
  result.variant.sourceFile = "/assets/source.png";
  const build = pruneManifestForBuild(result.manifest);
  normalizeAssetUrls(build);
  assert.ok(referencedAssetFiles(build).includes("assets/large.png"));
  assert.equal(
    build.assets.hero.versions.v1.scaledVariants[result.variant.id].sourceFile,
    "assets/source.png",
  );
});

test("HTTP CRUD persists variants and serves generated PNGs without an image-generation provider", async (t) => {
  const f = await fixture(t),
    server = createAiAssetDevServer({ ...f.options, port: 0 });
  await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.server.address().port}`;
  const input = {
    assetId: "hero",
    versionName: "v1",
    sourceFile: "art/source.png",
    action: "generate",
    width: 6,
    height: 6,
  };
  const response = await fetch(base + "/__ai-assets/scaled-variant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.previewDataUrl.startsWith("data:image/png;base64,"));
  const png = await fetch(base + "/" + result.variant.file);
  assert.equal(png.status, 200);
  const savedPng = Buffer.from(await png.arrayBuffer());
  assert.deepEqual(Buffer.from(result.previewDataUrl.split(",")[1], "base64"), savedPng);
  assert.equal((await sharp(savedPng).metadata()).width, 6);
  const saved = await (await fetch(base + "/__ai-assets/manifest")).json();
  assert.equal(
    saved.assets.hero.versions.v1.scaledVariants[result.variant.id].file,
    result.variant.file,
  );
  const removed = await fetch(base + "/__ai-assets/scaled-variant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      action: "delete",
      id: result.variant.id,
      expectedFile: result.variant.file,
    }),
  });
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).asset.versions.v1.scaledVariants, {});
});

test("concurrent generation merges results; failed module writes roll back the manifest and PNG", async (t) => {
  const f = await fixture(t);
  await Promise.all([
    f.generate({ width: 4, height: 4 }),
    f.generate({ width: 8, height: 8 }),
  ]);
  const before = await readFile(f.options.manifestPath, "utf8");
  assert.equal(
    Object.keys(JSON.parse(before).assets.hero.versions.v1.scaledVariants)
      .length,
    2,
  );
  const files = (await readdir(f.options.assetsDir)).sort();
  f.options.manifestModulePath = f.options.assetsDir; // Writing a file over a directory must fail.
  await assert.rejects(f.generate({ width: 16, height: 16 }));
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual((await readdir(f.options.assetsDir)).sort(), files);
});

test("OpenAI adapter sends the source with preservation instructions and a supported canvas", async (t) => {
  const f = await fixture(t);
  const provider = createOpenAiUpscaleProvider({
    apiKey: "test-key",
    fetch: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      assert.equal(options.method, "POST");
      const form = options.body;
      assert.equal(form.get("model"), "gpt-image-2.5-sunburst");
      assert.equal(form.get("quality"), "high");
      assert.equal(form.get("background"), "opaque");
      assert.equal(form.get("output_format"), "png");
      assert.equal(form.get("n"), "1");
      assert.match(form.get("prompt"), /192 by 256/);
      assert.match(form.get("prompt"), /not a redesign/);
      const [w, h] = form.get("size").split("x").map(Number);
      assert.equal(w % 16, 0);
      assert.equal(h % 16, 0);
      assert.ok(w * h >= 655360 && w * h <= 8294400);
      assert.ok(Math.abs(w / h - 3 / 4) < 0.02);
      assert.deepEqual(Buffer.from(await form.get("image").arrayBuffer()), f.image);
      return Response.json({ data: [{ b64_json: f.image.toString("base64") }] });
    },
  });
  assert.deepEqual(await provider.upscale({ image: f.image, width: 192, height: 256 }), f.image);
});

test("OpenAI adapter requests transparent PNGs and forwards cancellation", async (t) => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const controller = new AbortController();
  let called = 0;
  const provider = createOpenAiUpscaleProvider({
    apiKey: "test-key",
    fetch: async (_url, options) => {
      called++;
      assert.equal(options.body.get("background"), "transparent");
      assert.match(options.body.get("prompt"), /semi-transparent/);
      controller.abort(new Error("stop"));
      assert.equal(options.signal.aborted, true);
      return Response.json({ data: [{ b64_json: image.toString("base64") }] });
    },
  });
  await assert.rejects(provider.upscale({ image, width: 8, height: 8, signal: controller.signal }), /stop/);
  await assert.rejects(provider.upscale({ image, width: 8, height: 8, signal: controller.signal }), /stop/);
  assert.equal(called, 1);
});

test("default AI generation uses OPENAI_API_KEY, fits exact dimensions and retains method and provenance", async (t) => {
  const f = await fixture(t);
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "existing-openai-key";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  let called = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    called++;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.headers.Authorization, "Bearer existing-openai-key");
    return Response.json({ data: [{ b64_json: f.image.toString("base64") }] });
  });
  const result = await f.generate({ method: "ai-upscale", width: 192, height: 256 });
  assert.equal(called, 1);
  assert.equal(result.variant.method, "ai-upscale");
  assert.equal(result.variant.sourceFile, "art/source.png");
  const saved = await sharp(await readFile(path.join(f.options.assetsDir, path.basename(result.variant.file)))).metadata();
  assert.deepEqual([saved.width, saved.height], [192, 256]);
});

test("OpenAI errors and missing output do not save variants", async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.options.manifestPath, "utf8");
  for (const [response, message] of [[new Response("quota", { status: 429 }), /429/], [Response.json({ data: [] }), /no image/]]) {
    f.options.upscaleProvider = createOpenAiUpscaleProvider({ apiKey: "test-key", fetch: async () => response });
    await assert.rejects(f.generate({ method: "ai-upscale" }), message);
  }
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
});


test("three AI candidates do not save anything; selecting one saves its pixels without another generation", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  f.options.upscaleProvider = { async upscale() {
    const shade = ++calls * 60;
    return sharp({ create: { width: 4, height: 4, channels: 4, background: { r: shade, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  } };
  const input = { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", action: "generate", width: 4, height: 4, method: "ai-upscale" };
  const before = await readFile(f.options.manifestPath, "utf8");
  const { candidates } = await generateScaledVariantOptions(f.options, input);
  assert.equal(calls, 3);
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map(c => c.dataUrl)).size, 3);
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
  const chosen = candidates[1];
  const saved = await saveScaledVariant(f.options, { ...input, action: "select", dataUrl: chosen.dataUrl, candidateSourceFile: chosen.sourceFile });
  assert.equal(calls, 3);
  assert.equal(Object.keys(saved.asset.versions.v1.scaledVariants).length, 1);
  assert.deepEqual(await sharp(Buffer.from(saved.previewDataUrl.split(",")[1], "base64")).raw().toBuffer(), await sharp(Buffer.from(chosen.dataUrl.split(",")[1], "base64")).raw().toBuffer());
});

test("regeneration candidates preserve the old variant until selection and reject a stale selection", async (t) => {
  const f = await fixture(t);
  const original = (await f.generate({})).variant;
  const input = { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", id: original.id, expectedFile: original.file, action: "generate", width: 6, height: 6, method: "nearest" };
  const { candidates } = await generateScaledVariantOptions(f.options, input);
  assert.equal(JSON.parse(await readFile(f.options.manifestPath, "utf8")).assets.hero.versions.v1.scaledVariants[original.id].file, original.file);
  const chosen = candidates[2];
  const selection = { ...input, action: "select", dataUrl: chosen.dataUrl, candidateSourceFile: chosen.sourceFile };
  const saved = await saveScaledVariant(f.options, selection);
  assert.equal(saved.variant.id, original.id);
  assert.notEqual(saved.variant.file, original.file);
  await assert.rejects(saveScaledVariant(f.options, selection), /changed/);
  assert.equal(Object.keys(saved.asset.versions.v1.scaledVariants).length, 1);
});

test("candidate failure or cancellation leaves files and manifest untouched", async (t) => {
  const f = await fixture(t);
  f.options.upscaleProvider = { async upscale() { throw new Error("offline"); } };
  const input = { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", action: "generate", width: 4, height: 4, method: "ai-upscale" };
  const before = await readFile(f.options.manifestPath, "utf8");
  await assert.rejects(generateScaledVariantOptions(f.options, input), /offline/);
  await assert.rejects(generateScaledVariantOptions(f.options, input, AbortSignal.abort(new Error("canceled"))), /canceled/);
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
});

test("HTTP candidate generation is read-only and promotion uses the selected candidate", async (t) => {
  const f = await fixture(t), server = createAiAssetDevServer({ ...f.options, port: 0 });
  await server.listen(); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.server.address().port}`;
  const input = { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", action: "generate", width: 6, height: 6, method: "nearest" };
  const response = await fetch(base + "/__ai-assets/scaled-variant-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  assert.equal(response.status, 200);
  const { candidates } = await response.json();
  assert.equal(candidates.length, 3);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
  const response2 = await fetch(base + "/__ai-assets/scaled-variant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, action: "select", dataUrl: candidates[0].dataUrl, candidateSourceFile: candidates[0].sourceFile }) });
  assert.equal(response2.status, 200);
  assert.equal(Object.keys((await response2.json()).asset.versions.v1.scaledVariants).length, 1);
});

test("animation upscale sends one packed sheet, preserves frame order and alpha, and clears unused cells", async () => {
  const grid = { columns: 2, rows: 2, frameCount: 3, frameWidth: 1, frameHeight: 1, margin: 1, spacing: 1 };
  // Bright gutters and junk in the unused fourth cell must not reach the model.
  const raw = Buffer.alloc(5 * 5 * 4, 255);
  const colors = [[255, 0, 0, 255], [0, 255, 0, 128], [0, 0, 255, 255]];
  for (let i = 0; i < 3; i++) raw.set(colors[i], ((1 + Math.floor(i / 2) * 2) * 5 + 1 + i % 2 * 2) * 4);
  const image = await sharp(raw, { raw: { width: 5, height: 5, channels: 4 } }).png().toBuffer();
  const source = { file: "sheet.png", dimensions: { width: 5, height: 5 }, frameGrid: grid };
  const target = scaledVariantGeometry({ id: "hero", kind: "animation", ...source }, { width: 3, height: 2 });
  let calls = 0;
  const output = await resizeScaledSource(image, source, target, "ai-upscale", { async upscale(input) {
    calls++;
    assert.deepEqual([input.width, input.height], [6, 4]);
    assert.deepEqual(input.frameGrid, { ...grid, margin: 0, spacing: 0 });
    const { data, info } = await sharp(input.image).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [2, 2]);
    assert.deepEqual([...data], [...colors.flat(), 0, 0, 0, 0]);
    // Simulate the provider painting in the unused cell. It must be cleared.
    data.set([255, 255, 0, 255], 12);
    return sharp(data, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  } });
  assert.equal(calls, 1);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [6, 4]);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    const cell = Math.floor(y / 2) * 2 + Math.floor(x / 3);
    assert.deepEqual([...data.subarray((y * 6 + x) * 4, (y * 6 + x + 1) * 4)], colors[cell] ?? [0, 0, 0, 0]);
  }
});

test("three animation candidates make exactly three whole-sheet OpenAI requests with consistency instructions", async (t) => {
  const f = await fixture(t);
  const grid = { columns: 2, rows: 2, frameCount: 3, frameWidth: 1, frameHeight: 1 };
  Object.assign(f.asset, { kind: "animation", frameGrid: grid });
  await writeFile(f.options.manifestPath, JSON.stringify(f.manifest));
  let calls = 0;
  f.options.upscaleProvider = createOpenAiUpscaleProvider({ apiKey: "test-key", fetch: async (_url, options) => {
    calls++;
    const prompt = options.body.get("prompt");
    const [canvasWidth, canvasHeight] = options.body.get("size").split("x").map(Number);
    assert.equal(canvasWidth % grid.columns, 0);
    assert.equal(canvasHeight % grid.rows, 0);
    assert.match(prompt, /ONE animation spritesheet: 2 columns by 2 rows, 3 frames/);
    assert.match(prompt, /SAME character or object/);
    assert.match(prompt, /each final cell must be 4 by 3/);
    assert.match(prompt, /distinct pose and original animation motion/);
    assert.match(prompt, /Leave unused cells transparent/);
    const image = Buffer.from(await options.body.get("image").arrayBuffer());
    const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [2, 2]);
    assert.equal(data[3], 255);
    assert.equal(data[7], 255);
    assert.equal(data[11], 255);
    assert.equal(data[15], 0);
    return Response.json({ data: [{ b64_json: image.toString("base64") }] });
  } });
  const before = await readFile(f.options.manifestPath, "utf8");
  const { candidates } = await generateScaledVariantOptions(f.options, { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", action: "generate", width: 4, height: 3, method: "ai-upscale" });
  assert.equal(calls, 3);
  assert.equal(candidates.length, 3);
  for (const candidate of candidates) {
    assert.deepEqual(candidate.dimensions, { width: 8, height: 6 });
    assert.equal(candidate.frameGrid.frameCount, 3);
  }
  assert.equal(await readFile(f.options.manifestPath, "utf8"), before);
  assert.deepEqual(await readdir(f.options.assetsDir), ["source.png"]);
});


test("tilesets retain independent tile upscaling rather than animation identity instructions", async (t) => {
  const f = await fixture(t);
  Object.assign(f.asset, { kind: "tileset", tileset: { tileWidth: 1, tileHeight: 1, columns: 2, rows: 2, tileCount: 4 } });
  await writeFile(f.options.manifestPath, JSON.stringify(f.manifest));
  let calls = 0;
  f.options.upscaleProvider = { async upscale(input) {
    calls++;
    assert.equal(input.frameGrid, undefined);
    const metadata = await sharp(input.image).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1, 1]);
    return input.image;
  } };
  await f.generate({ method: "ai-upscale" });
  assert.equal(calls, 4);
});


test("AI animation variants share normal row/column alignment and honor a version's opt-out", async (t) => {
  const f = await fixture(t);
  const grid = { frameWidth: 8, frameHeight: 12, columns: 2, rows: 3, frameCount: 6 };
  const dimensions = { width: 16, height: 36 };
  Object.assign(f.asset, { kind: "animation", dimensions, frameGrid: grid, settings: { frameAlignment: "center" } });
  const source = await sharp({ create: { ...dimensions, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  await writeFile(path.join(f.options.assetsDir, "source.png"), source);
  for (const [frameWidth, frameHeight] of [[16, 24], [33, 47], [48, 64], [192, 256]]) {
    const targetGrid = { ...grid, frameWidth, frameHeight };
    const width = frameWidth * 2, height = frameHeight * 3;
    const pixels = Buffer.alloc(width * height * 4);
    // Successive rows drift upwards; the second pose deliberately sits one pixel lower.
    for (let frame = 0; frame < 6; frame++) {
      const column = frame % 2, row = Math.floor(frame / 2);
      for (let y = 9 - row * 2 + column; y < 15 - row * 2 + column; y++)
        for (let x = 5; x < 11; x++) pixels.set([200, 90, 30, 255], ((row * frameHeight + y) * width + column * frameWidth + x) * 4);
    }
    const generated = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    f.options.upscaleProvider = { async upscale() { return generated; } };
    const { alignSpriteSheetFrames } = await import("../dist/provider-image-processing.js");
    const input = { assetId: "hero", versionName: "v1", sourceFile: "art/source.png", action: "generate", width: frameWidth, height: frameHeight, method: "ai-upscale" };
    for (const alignment of [undefined, "none"]) {
      f.asset.versions.v1.settings = alignment ? { frameAlignment: alignment } : undefined;
      await writeFile(f.options.manifestPath, JSON.stringify(f.manifest));
      const { candidates } = await generateScaledVariantOptions(f.options, input);
      const expected = await sharp(alignment === "none" ? generated : alignSpriteSheetFrames(generated, targetGrid)).raw().toBuffer();
      for (const candidate of candidates) {
        const actual = await sharp(Buffer.from(candidate.dataUrl.split(",")[1], "base64")).raw().toBuffer();
        assert.deepEqual(actual, expected);
        if (alignment !== "none") {
          const tops = Array.from({ length: 6 }, (_, frame) => {
            for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++)
              if (actual[((Math.floor(frame / 2) * frameHeight + y) * width + frame % 2 * frameWidth + x) * 4 + 3]) return y;
          });
          const top = Math.round(frameHeight / 2 - 3);
          assert.deepEqual(tops, [top, top + 1, top, top + 1, top, top + 1]);
        }
      }
    }
  }
});
