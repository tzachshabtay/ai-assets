import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { readManifest, saveGeneratedOption } from "../dist/asset-store.js";

test("promoting a transformed tileset stores distinct baked and raw sheets for reload", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-assets-tileset-transform-"));
  const assetsDir = path.join(root, "assets");
  const manifestPath = path.join(root, "manifest.json");
  const tileset = {
    tileWidth: 16,
    tileHeight: 16,
    columns: 2,
    rows: 1,
    tileCount: 2
  };
  const manifest = {
    schemaVersion: 1,
    assets: {
      forest: {
        id: "forest",
        kind: "tileset",
        prompt: "Forest tiles.",
        dimensions: { width: 32, height: 16 },
        tileset,
        activeVersion: "v1",
        versions: {
          v1: {
            name: "v1",
            file: "/assets/forest.v1.png",
            prompt: "Forest tiles.",
            createdAt: "2026-01-01T00:00:00.000Z"
          }
        }
      }
    }
  };
  const baked = solidPng(32, 16, 17);
  const rawSource = solidPng(32, 16, 203);
  const transforms = [
    { offsetX: 4, offsetY: -2, scaleX: 1.25, scaleY: 0.75 },
    { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
  ];

  await mkdir(assetsDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const saved = await saveGeneratedOption({
    manifestPath,
    assetsDir,
    publicPathPrefix: "/assets"
  }, {
    assetId: "forest",
    versionName: "edited",
    activate: true,
    option: {
      image: baked,
      mimeType: "image/png",
      prompt: "Edited forest tiles.",
      dimensions: { width: 32, height: 16 },
      tileset
    },
    tilesetSource: {
      image: rawSource,
      mimeType: "image/png"
    },
    tilesetTransforms: transforms
  });

  assert.notEqual(saved.version.file, saved.version.tilesetSourceFile);
  assert.deepEqual(saved.version.tilesetTransforms, transforms);
  assert.equal(await firstRed(saved.version.file, assetsDir), 17);
  assert.equal(await firstRed(saved.version.tilesetSourceFile, assetsDir), 203);

  const reloaded = await readManifest(manifestPath);
  const reloadedAsset = reloaded.assets.forest;
  const reloadedVersion = reloadedAsset.versions[reloadedAsset.activeVersion];
  assert.equal(reloadedAsset.activeVersion, "edited");
  assert.equal(reloadedVersion.file, saved.version.file);
  assert.equal(reloadedVersion.tilesetSourceFile, saved.version.tilesetSourceFile);
  assert.deepEqual(reloadedVersion.tilesetTransforms, transforms);
  assert.equal(await firstRed(reloadedVersion.file, assetsDir), 17);
  assert.equal(await firstRed(reloadedVersion.tilesetSourceFile, assetsDir), 203);
});

function solidPng(width, height, red) {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function firstRed(publicFile, assetsDir) {
  const image = PNG.sync.read(await readFile(path.join(assetsDir, path.basename(publicFile))));
  return image.data[0];
}
