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
  saveScaledVariant,
  resizeScaledSource,
  createReplicateUpscaleProvider,
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

test("dedicated AI provider receives image and dimensions without prompts; original alpha is retained", async () => {
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
          create: { width: 4, height: 2, channels: 3, background: "#00ff00" },
        })
          .png()
          .toBuffer();
      },
    },
  );
  assert.equal(called, 1);
  const data = await sharp(output).raw().toBuffer();
  assert.equal(data[3], 0);
  assert.equal(data[15], 255);
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
  const png = await fetch(base + "/" + result.variant.file);
  assert.equal(png.status, 200);
  assert.equal(
    (await sharp(Buffer.from(await png.arrayBuffer())).metadata()).width,
    6,
  );
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

test("Replicate adapter uses a dedicated upscaler and cancels its upstream job on abort", async (t) => {
  const f = await fixture(t),
    controller = new AbortController(),
    calls = [];
  const provider = createReplicateUpscaleProvider({
    apiToken: "test-token",
    fetch: async (url, options) => {
      calls.push([String(url), options]);
      if (String(url).endsWith("/cancel")) return new Response("{}");
      const body = JSON.parse(options.body);
      assert.equal(body.input.face_enhance, false);
      assert.equal(body.input.scale, 4);
      assert.equal(body.input.prompt, undefined);
      controller.abort(new Error("stop"));
      return new Response(
        JSON.stringify({ id: "job-123", status: "processing" }),
      );
    },
  });
  await assert.rejects(
    provider.upscale({
      image: f.image,
      width: 8,
      height: 8,
      signal: controller.signal,
    }),
    /stop/,
  );
  assert.equal(calls.length, 2);
  assert.ok(calls[1][0].endsWith("/job-123/cancel"));
  assert.equal(calls[1][1].signal.aborted, false);
});
