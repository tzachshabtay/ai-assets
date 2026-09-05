import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAiAssetDevServer } from "../dist/server.js";

const imageAsset = (id) => ({
  id,
  kind: "image",
  prompt: `Image for ${id}.`,
  dimensions: { width: 1, height: 1 },
  activeVersion: "",
  versions: {}
});

const saveRequest = (assetId, versionName, deferManifestModuleWrite) => ({
  assetId,
  versionName,
  dataUrl: "data:image/png;base64,AQID",
  prompt: `Generated ${assetId}.`,
  dimensions: { width: 1, height: 1 },
  activate: true,
  deferManifestModuleWrite
});

test("deferred saves refresh the watched manifest module only after an explicit sync", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-manifest-batch-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const manifestModulePath = path.join(root, "assets.ts");
  const sentinel = "// unchanged until batch completion\n";
  const manifest = {
    schemaVersion: 1,
    assets: {
      first: imageAsset("first"),
      second: imageAsset("second")
    },
    assetPaths: {
      first: ["Graphics", "Characters"],
      second: ["Graphics", "Props"]
    }
  };
  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(manifestModulePath, sentinel);

  const devServer = createAiAssetDevServer({
    manifestPath,
    manifestModulePath,
    assetsDir,
    publicPathPrefix: "/assets",
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    for (const [assetId, versionName] of [["first", "batch-1"], ["second", "batch-2"]]) {
      const response = await fetch(`${origin}/__ai-assets/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveRequest(assetId, versionName, true))
      });
      assert.equal(response.status, 200);
      assert.equal(await readFile(manifestModulePath, "utf8"), sentinel);
    }

    const syncResponse = await fetch(`${origin}/__ai-assets/sync-manifest-module`, {
      method: "POST"
    });
    assert.equal(syncResponse.status, 200);
    const synced = await syncResponse.json();
    assert.equal(synced.manifest.assets.first.activeVersion, "batch-1");
    assert.equal(synced.manifest.assets.second.activeVersion, "batch-2");
    const syncedModule = await readFile(manifestModulePath, "utf8");
    assert.notEqual(syncedModule, sentinel);
    assert.match(syncedModule, /batch-1/);
    assert.match(syncedModule, /batch-2/);
    assert.match(syncedModule, /assets\.assetPaths =/);
    assert.match(syncedModule, /"first": \[\s*"Graphics",\s*"Characters"\s*\]/);
    assert.match(syncedModule, /"second": \[\s*"Graphics",\s*"Props"\s*\]/);

    await writeFile(manifestModulePath, sentinel);
    const immediateResponse = await fetch(`${origin}/__ai-assets/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveRequest("first", "immediate", false))
    });
    assert.equal(immediateResponse.status, 200);
    const immediateModule = await readFile(manifestModulePath, "utf8");
    assert.notEqual(immediateModule, sentinel);
    assert.match(immediateModule, /assets\.assetPaths =/);
    assert.match(immediateModule, /"first": \[\s*"Graphics",\s*"Characters"\s*\]/);
  } finally {
    await devServer.close();
  }
});

test("first-draft batches can defer every watched-module write until one sync", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-first-draft-batch-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const manifestModulePath = path.join(root, "assets.ts");
  const sentinel = "// first drafts are still running\n";
  const manifest = {
    schemaVersion: 1,
    assets: {
      first: imageAsset("first"),
      second: imageAsset("second")
    }
  };
  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(manifestModulePath, sentinel);

  const devServer = createAiAssetDevServer({
    manifestPath,
    manifestModulePath,
    assetsDir,
    publicPathPrefix: "/assets",
    provider: {
      async generate(request) {
        return [{
          image: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
          prompt: request.asset.prompt,
          dimensions: request.asset.dimensions
        }];
      }
    },
    port: 0
  });
  await devServer.listen();
  const address = devServer.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const draftResponse = await fetch(`${origin}/__ai-assets/ensure-first-drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetIds: ["first", "second"],
        deferManifestModuleWrite: true
      })
    });
    assert.equal(draftResponse.status, 200);
    const drafted = await draftResponse.json();
    assert.equal(drafted.generated.length, 2);
    assert.equal(await readFile(manifestModulePath, "utf8"), sentinel);

    const syncResponse = await fetch(`${origin}/__ai-assets/sync-manifest-module`, {
      method: "POST"
    });
    assert.equal(syncResponse.status, 200);
    const synced = await syncResponse.json();
    assert.notEqual(synced.manifest.assets.first.activeVersion, "");
    assert.notEqual(synced.manifest.assets.second.activeVersion, "");
    const syncedModule = await readFile(manifestModulePath, "utf8");
    assert.notEqual(syncedModule, sentinel);
    assert.match(syncedModule, /first-draft/);
  } finally {
    await devServer.close();
  }
});
