import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createAiAssetDevServer, planFirstDraftGeneration } from "../dist/server.js";

const imageAsset = (id, extra = {}) => ({
  id, kind: "image", prompt: "Footprints", dimensions: { width: 4, height: 4 },
  activeVersion: "original",
  versions: { original: {
    name: "original", file: `art/interface/${id}.png`, prompt: "Footprints",
    createdAt: "2026-09-20T00:00:00Z"
  } }, ...extra
});
const animation = (id, extra = {}) => imageAsset(id, {
  kind: "animation", dimensions: { width: 8, height: 4 },
  frameGrid: { frameWidth: 4, frameHeight: 4, columns: 2, rows: 1, frameCount: 2 },
  ...extra
});
const base = () => imageAsset("cursor.walk", {
  linkedAnimationAssets: { click: { label: "Click", assetId: "cursor.walk.click" } }
});
const png = (color) => sharp({ create: {
  width: 4, height: 4, channels: 4, background: color
} }).png().toBuffer();

async function fixture(t, manifest) {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-linked-reference-"));
  const assetsDir = path.join(root, "art");
  const manifestPath = path.join(root, "manifest.json");
  await mkdir(path.join(assetsDir, "interface"), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const image = await png("red");
  const calls = [];
  const server = createAiAssetDevServer({
    manifestPath, assetsDir, publicPathPrefix: "art", port: 0,
    provider: { async generate(request, onOption) {
      calls.push(request);
      const option = { image, mimeType: "image/png", prompt: request.asset.prompt };
      await onOption?.(option, 0);
      return [option];
    } }
  });
  await server.listen();
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  return {
    assetsDir, image, calls,
    post: async (endpoint, body) => {
      const response = await fetch(`http://127.0.0.1:${server.server.address().port}/__ai-assets/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      assert.doesNotMatch(text, /"type":"error"/);
      return text;
    }
  };
}

test("linked cursor generation uses the active base image before and after promotion, without explicit references", async (t) => {
  const manifest = { schemaVersion: 1, assets: {
    "cursor.walk": base(), "cursor.walk.click": animation("cursor.walk.click")
  } };
  const { post, calls, assetsDir, image } = await fixture(t, manifest);
  await writeFile(path.join(assetsDir, "interface/cursor.walk.png"), image);
  const promoted = await png("blue");
  for (const [version, expected] of [["original", image], ["promoted", promoted]]) {
    if (version === "promoted") await post("save", {
      assetId: "cursor.walk", versionName: version, activate: true,
      prompt: "Promoted footprints", dataUrl: `data:image/png;base64,${promoted.toString("base64")}`
    });
    for (const endpoint of ["generate", "generate-stream"]) {
      await post(endpoint, { assetId: "cursor.walk.click", count: 3 });
      const request = calls.at(-1);
      assert.equal(request.count, 3);
      assert.equal(request.references.length, 1);
      assert.deepEqual(request.references[0].image, expected);
      assert.match(request.references[0].fileName, version === "original" ? /^cursor.walk.png$/ : /promoted/);
    }
  }
});

test("automatic base references are deduplicated and coexist with explicit, priority, and style references", async (t) => {
  const manifest = { schemaVersion: 1, assets: {
    "cursor.walk": base(),
    "cursor.walk.click": animation("cursor.walk.click", {
      settings: { referenceAssetIds: ["cursor.walk", "palette"] }
    }),
    palette: imageAsset("palette")
  } };
  const { post, calls, assetsDir, image } = await fixture(t, manifest);
  await writeFile(path.join(assetsDir, "interface/cursor.walk.png"), image);
  await writeFile(path.join(assetsDir, "interface/palette.png"), image);
  const ref = (name) => ({ name, dataUrl: `data:image/png;base64,${image.toString("base64")}` });
  await post("generate-stream", {
    assetId: "cursor.walk.click", references: [ref("context.png")],
    priorityReference: ref("sketch.png"), styleGuide: { images: [ref("style.png")] }
  });
  const request = calls.at(-1);
  assert.deepEqual(request.references.map((ref) => ref.fileName), ["cursor.walk.png", "palette.png", "context.png"]);
  assert.equal(request.priorityReference.fileName, "sketch.png");
  assert.equal(request.styleReferences[0].fileName, "style.png");
});

test("linked animation target variants reference their matching base variant", async (t) => {
  const manifest = { schemaVersion: 1, assets: {
    "cursor.walk": base(), "cursor.walk.click": animation("cursor.walk.click"),
    "cursor.walk.phone": imageAsset("cursor.walk.phone"),
    "cursor.walk.click.phone": animation("cursor.walk.click.phone", { settings: { referenceAssetIds: ["cursor.walk"] } })
  }, targets: { phone: { id: "phone", label: "Phone", variants: {
    "cursor.walk": "cursor.walk.phone", "cursor.walk.click": "cursor.walk.click.phone"
  } } } };
  const { post, calls, assetsDir, image } = await fixture(t, manifest);
  await writeFile(path.join(assetsDir, "interface/cursor.walk.phone.png"), image);
  await post("generate", { assetId: "cursor.walk.click.phone" });
  assert.deepEqual(calls[0].references.map((ref) => ref.fileName), ["cursor.walk.phone.png"]);
});

test("first drafts generate the linked base before its animation and pass the newly saved image", async (t) => {
  const manifest = { schemaVersion: 1, assets: {
    "cursor.walk.click": animation("cursor.walk.click", { activeVersion: "", versions: {} }),
    "cursor.walk": { ...base(), activeVersion: "", versions: {} }
  } };
  assert.deepEqual(planFirstDraftGeneration(manifest, ["cursor.walk.click"]), ["cursor.walk", "cursor.walk.click"]);
  const { post, calls, image } = await fixture(t, manifest);
  await post("ensure-first-drafts", { assetIds: ["cursor.walk.click"] });
  assert.deepEqual(calls.map((call) => call.asset.id), ["cursor.walk", "cursor.walk.click"]);
  assert.deepEqual(calls[1].references[0].image, image);
});
