import assert from "node:assert/strict";
import test from "node:test";

import { AiAssetDebugClient } from "../dist/debug-client.js";
import { resolveTilesetEditorInitialState } from "../dist/designer.js";

const transforms = [
  { offsetX: 3, offsetY: -2, scaleX: 1.25, scaleY: 0.75 },
  { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
];

function promotedManifest() {
  const promoted = {
    name: "promoted",
    file: "/assets/forest.promoted.png",
    prompt: "Forest tiles.",
    createdAt: "2026-07-20T00:00:00.000Z",
    tilesetSourceFile: "/assets/forest.promoted.tileset-source.png",
    tilesetTransforms: transforms
  };
  const asset = {
    id: "forest",
    kind: "tileset",
    prompt: "Forest tiles.",
    dimensions: { width: 32, height: 16 },
    tileset: {
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      rows: 1,
      tileCount: 2
    },
    activeVersion: "promoted",
    versions: { promoted }
  };
  return {
    manifest: { schemaVersion: 1, assets: { forest: asset } },
    asset,
    version: promoted
  };
}

test("reopening a promoted tileset resolves its raw source and cloned transform values", () => {
  const promoted = promotedManifest();
  const activeVersion = promoted.asset.versions[promoted.asset.activeVersion];
  const state = resolveTilesetEditorInitialState({
    renderedSrc: "http://127.0.0.1:4087/assets/forest.promoted.png",
    activeVersion,
    resolveAssetUrl: (file) => `http://127.0.0.1:4087/${file.replace(/^\//, "")}`
  });

  assert.equal(
    state.sourceSrc,
    "http://127.0.0.1:4087/assets/forest.promoted.tileset-source.png"
  );
  assert.deepEqual(state.initialTransforms, transforms);
  assert.notStrictEqual(state.initialTransforms, activeVersion.tilesetTransforms);
  assert.notStrictEqual(state.initialTransforms[0], activeVersion.tilesetTransforms[0]);

  state.initialTransforms[0].offsetX = 99;
  assert.equal(activeVersion.tilesetTransforms[0].offsetX, 3);
});

test("reopening a pending edit uses its raw source and transforms ahead of the active version", () => {
  const promoted = promotedManifest();
  const pendingTransforms = [
    { offsetX: -4, offsetY: 5, scaleX: 0.5, scaleY: 1.5 },
    { offsetX: 2, offsetY: 1, scaleX: 2, scaleY: 2 }
  ];
  const state = resolveTilesetEditorInitialState({
    renderedSrc: "data:image/png;base64,cGVuZGluZy1iYWtlZA==",
    currentOption: {
      index: -1,
      dataUrl: "data:image/png;base64,cGVuZGluZy1iYWtlZA==",
      tilesetSourceDataUrl: "data:image/png;base64,cGVuZGluZy1yYXc=",
      tilesetTransforms: pendingTransforms,
      mimeType: "image/png",
      prompt: "Pending forest tiles."
    },
    activeVersion: promoted.version,
    resolveAssetUrl: () => {
      throw new Error("The active version source must not be resolved for a pending edit.");
    }
  });

  assert.equal(state.sourceSrc, "data:image/png;base64,cGVuZGluZy1yYXc=");
  assert.deepEqual(state.initialTransforms, pendingTransforms);
  assert.notStrictEqual(state.initialTransforms, pendingTransforms);
  assert.notStrictEqual(state.initialTransforms[0], pendingTransforms[0]);
});

test("a fresh pending generation starts a new editing lineage from its rendered image", () => {
  const promoted = promotedManifest();
  const renderedSrc = "data:image/png;base64,ZnJlc2gtZ2VuZXJhdGlvbg==";
  const state = resolveTilesetEditorInitialState({
    renderedSrc,
    currentOption: {
      index: 0,
      dataUrl: renderedSrc,
      mimeType: "image/png",
      prompt: "Fresh generated forest tiles."
    },
    activeVersion: promoted.version,
    resolveAssetUrl: () => {
      throw new Error("A fresh option must not borrow the active version source.");
    }
  });

  assert.equal(state.sourceSrc, renderedSrc);
  assert.equal(state.initialTransforms, undefined);
});

test("an older active version without transform metadata reopens from its rendered sheet", () => {
  const renderedSrc = "http://127.0.0.1:4087/assets/forest.v1.png";
  const state = resolveTilesetEditorInitialState({
    renderedSrc,
    activeVersion: {
      name: "v1",
      file: "/assets/forest.v1.png",
      prompt: "Forest tiles.",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    resolveAssetUrl: () => {
      throw new Error("A version without a source file must use its rendered sheet.");
    }
  });

  assert.deepEqual(state, { sourceSrc: renderedSrc, initialTransforms: undefined });
});

test("tileset promotion transports its raw source and transforms and exposes them after reload", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const promoted = promotedManifest();
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/__ai-assets/save")) {
      return jsonResponse({
        ...promoted,
        versionName: "promoted",
        file: promoted.version.file,
        filePath: "/tmp/assets/forest.promoted.png"
      });
    }
    if (String(url).endsWith("/__ai-assets/manifest")) {
      return jsonResponse(promoted.manifest);
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const client = new AiAssetDebugClient("http://127.0.0.1:4087/");
    const sourceDataUrl = "data:image/png;base64,cmF3LXRpbGVzZXQ=";
    const bakedDataUrl = "data:image/png;base64,YmFrZWQtdGlsZXNldA==";
    const saved = await client.save({
      assetId: "forest",
      versionName: "promoted",
      dataUrl: bakedDataUrl,
      tilesetSourceDataUrl: sourceDataUrl,
      tilesetTransforms: transforms,
      prompt: "Forest tiles.",
      dimensions: { width: 32, height: 16 },
      tileset: promoted.asset.tileset,
      activate: true
    });

    assert.equal(requests[0].url, "http://127.0.0.1:4087/__ai-assets/save");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      assetId: "forest",
      versionName: "promoted",
      dataUrl: bakedDataUrl,
      tilesetSourceDataUrl: sourceDataUrl,
      tilesetTransforms: transforms,
      prompt: "Forest tiles.",
      dimensions: { width: 32, height: 16 },
      tileset: promoted.asset.tileset,
      activate: true
    });
    assert.equal(saved.version.tilesetSourceFile, promoted.version.tilesetSourceFile);
    assert.deepEqual(saved.version.tilesetTransforms, transforms);

    const reloaded = await client.getManifest();
    const active = reloaded.assets.forest.versions[reloaded.assets.forest.activeVersion];
    assert.equal(active.tilesetSourceFile, promoted.version.tilesetSourceFile);
    assert.deepEqual(active.tilesetTransforms, transforms);
    assert.equal(
      client.assetUrl(active.tilesetSourceFile),
      "http://127.0.0.1:4087/assets/forest.promoted.tileset-source.png"
    );
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
  }
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
