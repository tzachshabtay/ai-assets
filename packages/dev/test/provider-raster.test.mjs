import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { createOpenAiImageProvider } from "../dist/provider.js";
import {
  planTilesetSheetGeneration,
  tilesetSheetGenerationGeometry
} from "../dist/tileset-sheet-processing.js";

function imageAsset(dimensions, settings = {}) {
  return {
    id: "test-image",
    kind: "image",
    prompt: "A test game image.",
    dimensions,
    settings: {
      background: "opaque",
      ...settings
    },
    activeVersion: "draft",
    versions: {}
  };
}

function propsTilesetAsset() {
  return {
    id: "tiles.props",
    kind: "tileset",
    prompt: "A top-down props tileset.",
    dimensions: { width: 128, height: 32 },
    tileset: {
      tileWidth: 32,
      tileHeight: 32,
      columns: 4,
      rows: 1,
      tileCount: 4,
      tiles: [
        { prompt: "A centered wooden crate on a transparent background." },
        { prompt: "A centered clay pot on a transparent background." },
        { prompt: "A centered brass key on a transparent background." },
        { prompt: "A centered green herb on a transparent background." }
      ]
    },
    settings: {
      background: "auto",
      format: "png"
    },
    activeVersion: "draft",
    versions: {}
  };
}

test("OpenAI provider resizes JPEG and WebP output without PNG decoding", async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const format of ["jpg", "webp"]) {
      const source = sharp({
        create: {
          width: 24,
          height: 12,
          channels: 4,
          background: { r: 32, g: 96, b: 160, alpha: 1 }
        }
      });
      const encoded = format === "jpg"
        ? await source.jpeg().toBuffer()
        : await source.webp().toBuffer();

      globalThis.fetch = async () => new Response(JSON.stringify({
        data: [{ b64_json: encoded.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

      const provider = createOpenAiImageProvider({ apiKey: "test-key" });
      const [option] = await provider.generate({
        asset: imageAsset({ width: 9, height: 5 }, { format }),
        settings: { format }
      });

      assert.ok(option);
      assert.equal(option.mimeType, format === "jpg" ? "image/jpeg" : "image/webp");
      const metadata = await sharp(option.image).metadata();
      assert.equal(metadata.format, format === "jpg" ? "jpeg" : "webp");
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: 9, height: 5 }
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider chooses the closest output aspect ratio unless size is explicit", async () => {
  const originalFetch = globalThis.fetch;
  const generated = await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 4,
      background: { r: 32, g: 96, b: 160, alpha: 1 }
    }
  }).png().toBuffer();
  const requestedSizes = [];

  try {
    globalThis.fetch = async (_url, init) => {
      requestedSizes.push(JSON.parse(init.body).size);
      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    await provider.generate({
      asset: imageAsset({ width: 128, height: 64 }, { format: "png" })
    });
    await provider.generate({
      asset: imageAsset(
        { width: 64, height: 128 },
        { format: "png", size: "1024x1024" }
      )
    });

    assert.deepEqual(requestedSizes, ["1536x1024", "1024x1024"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider keeps full-sheet tileset generation to one request per candidate", async () => {
  const originalFetch = globalThis.fetch;
  const asset = propsTilesetAsset();
  const geometry = planTilesetSheetGeneration(asset);
  const expectedGenerationCells = [
    { x: 32, y: 32, width: 448, height: 448 },
    { x: 544, y: 32, width: 448, height: 448 },
    { x: 32, y: 544, width: 448, height: 448 },
    { x: 544, y: 544, width: 448, height: 448 }
  ];
  assert.equal(geometry.size, "1024x1024");
  assert.deepEqual(
    geometry.cells.map(({ x, y, width, height }) => ({ x, y, width, height })),
    expectedGenerationCells
  );
  const tileColors = ["#c81414", "#14c814", "#1414c8", "#c8c814"];
  const generated = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#ff00ff"/>
      ${expectedGenerationCells.map((cell, index) => (
        `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" ` +
          `height="${cell.height}" fill="${tileColors[index]}"/>`
      )).join("\n")}
    </svg>
  `)).png().toBuffer();
  const requestBodies = [];

  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/v1\/images\/generations$/);
      const body = JSON.parse(init.body);
      requestBodies.push(body);
      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const options = await provider.generate({
      asset,
      count: 3
    });

    assert.equal(requestBodies.length, 3);
    assert.equal(options.length, 3);
    for (const option of options) {
      assert.equal(option.settings.background, "auto");
    }
    for (const body of requestBodies) {
      assert.equal(body.n, 1);
      assert.equal(body.size, "1024x1024");
      assert.equal(body.background, "opaque");
      assert.match(body.prompt, /Actual returned raster canvas: 1024x1024 pixels/);
      assert.match(
        body.prompt,
        /Raster transparency encoding for every numbered tile:.*paint every such pixel the exact flat chroma color #[0-9a-f]{6}.*Never draw a checkerboard transparency preview/i
      );
      assert.equal(
        body.prompt.match(/Encoding rule for Tile \d+:/g)?.length,
        4
      );
      assert.match(
        body.prompt,
        /Tile 1 — A centered wooden crate on a transparent background\. Encoding rule for Tile 1:.*never represent transparency with a checkerboard/i
      );
      assert.match(
        body.prompt,
        /Temporary full-canvas placement grid: divide the entire raster into 2 equal columns by 2 equal rows/i
      );
      assert.match(body.prompt, /Exact equal placement regions in immutable row-major order/i);
      assert.match(body.prompt, /Placement region 1 \[x=0-511, y=0-511\]/);
      assert.match(body.prompt, /Placement region 4 \[x=512-1023, y=512-1023\]/);
      assert.match(
        body.prompt,
        /Center that tile's actual extracted rectangle inside its assigned equal placement region/i
      );
      assert.match(body.prompt, /Tile 1 \[x=32-479, y=32-479\]/);
      assert.match(body.prompt, /Tile 4 \[x=544-991, y=544-991\]/);
      assert.match(body.prompt, /hard-gutter color/i);
      assert.match(body.prompt, /safe-content rectangle/i);
      assert.match(body.prompt, /complete silhouette must not touch or cross/i);
      assert.match(body.prompt, /transparent terrain, connector, wall, corner, or overlay/i);
      assert.doesNotMatch(body.prompt, /isolated square slot/i);
      assert.match(body.prompt, /extracts each tile rectangle independently/i);
      assert.match(body.prompt, /outside its rectangle is irretrievably discarded/i);
      assert.match(
        body.prompt,
        /not inside an actual usable extracted tile rectangle.*hard-gutter color/i
      );
      assert.doesNotMatch(body.prompt, /assigned to the neighboring tile/i);
      assert.doesNotMatch(
        body.prompt,
        /Target canvas: 128x32|Output one 128×32|final post-processed asset is one 128×32|Logical final-sheet geometry|Logical final-resolution usable tile rectangles|arranged as 4 columns by 1 row|Single-image asset contract|exactly one complete sprite/i
      );
    }

    const { data, info } = await sharp(options[0].image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual({ width: info.width, height: info.height }, { width: 128, height: 32 });
    assert.deepEqual(rgbAt(data, info.width, 16, 16), [200, 20, 20]);
    assert.deepEqual(rgbAt(data, info.width, 48, 16), [20, 200, 20]);
    assert.deepEqual(rgbAt(data, info.width, 80, 16), [20, 20, 200]);
    assert.deepEqual(rgbAt(data, info.width, 112, 16), [200, 200, 20]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider preserves an explicit tileset generation canvas", async () => {
  const originalFetch = globalThis.fetch;
  const baseAsset = propsTilesetAsset();
  const asset = {
    ...baseAsset,
    settings: {
      ...baseAsset.settings,
      size: "1536x1024"
    }
  };
  const geometry = tilesetSheetGenerationGeometry(asset, "1536x1024");
  const expectedGenerationCells = [
    { x: 32, y: 32, width: 448, height: 448 },
    { x: 544, y: 32, width: 448, height: 448 },
    { x: 1056, y: 32, width: 448, height: 448 },
    { x: 32, y: 544, width: 448, height: 448 }
  ];
  assert.equal(geometry.size, "1536x1024");
  assert.deepEqual(
    { columns: geometry.generationColumns, rows: geometry.generationRows },
    { columns: 3, rows: 2 }
  );
  assert.deepEqual(
    geometry.cells.map(({ x, y, width, height }) => ({ x, y, width, height })),
    expectedGenerationCells
  );

  const tileColors = ["#c81414", "#14c814", "#1414c8", "#c8c814"];
  const generated = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
      <rect width="1536" height="1024" fill="#ff00ff"/>
      ${expectedGenerationCells.map((cell, index) => (
        `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" ` +
          `height="${cell.height}" fill="${tileColors[index]}"/>`
      )).join("\n")}
    </svg>
  `)).png().toBuffer();
  const requestBodies = [];

  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/v1\/images\/generations$/);
      const body = JSON.parse(init.body);
      requestBodies.push(body);
      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const [option] = await provider.generate({ asset });

    assert.equal(requestBodies.length, 1);
    assert.ok(option);
    const [body] = requestBodies;
    assert.equal(body.size, "1536x1024");
    assert.match(body.prompt, /Actual returned raster canvas: 1536x1024 pixels/);
    assert.match(
      body.prompt,
      /Temporary full-canvas placement grid: divide the entire raster into 3 equal columns by 2 equal rows/i
    );
    assert.match(body.prompt, /Placement region 1 \[x=0-511, y=0-511\]/);
    assert.match(body.prompt, /Placement region 6 \[x=1024-1535, y=512-1023\]/);
    assert.match(body.prompt, /Tile 1 \[x=32-479, y=32-479\]/);
    assert.match(body.prompt, /Tile 4 \[x=32-479, y=544-991\]/);

    const { data, info } = await sharp(option.image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual({ width: info.width, height: info.height }, { width: 128, height: 32 });
    assert.deepEqual(rgbAt(data, info.width, 16, 16), [200, 20, 20]);
    assert.deepEqual(rgbAt(data, info.width, 48, 16), [20, 200, 20]);
    assert.deepEqual(rgbAt(data, info.width, 80, 16), [20, 20, 200]);
    assert.deepEqual(rgbAt(data, info.width, 112, 16), [200, 200, 20]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tileset chroma transport does not persist opaque background on promotion", async () => {
  const originalFetch = globalThis.fetch;
  const asset = propsTilesetAsset();
  const generated = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 0, b: 255, alpha: 1 }
    }
  }).png().toBuffer();
  const requestBodies = [];

  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      requestBodies.push(body);
      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const [firstOption] = await provider.generate({ asset });
    assert.equal(firstOption.settings.background, "auto");

    const promotedAsset = {
      ...asset,
      settings: {
        ...asset.settings,
        ...firstOption.settings
      }
    };
    assert.equal(promotedAsset.settings.background, "auto");

    const [nextOption] = await provider.generate({ asset: promotedAsset });
    assert.equal(nextOption.settings.background, "auto");
    assert.deepEqual(requestBodies.map((body) => body.background), ["opaque", "opaque"]);
    for (const body of requestBodies) {
      assert.match(body.prompt, /exact flat chroma color/i);
      assert.match(body.prompt, /never draw a checkerboard transparency preview/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider stages full-sheet tileset edit references in generation space", async () => {
  const originalFetch = globalThis.fetch;
  const asset = propsTilesetAsset();
  const geometry = planTilesetSheetGeneration(asset);
  assert.equal(geometry.size, "1024x1024");
  const generated = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#ff00ff"/>
      ${geometry.cells.map((cell) => (
        `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" ` +
          `height="${cell.height}" fill="#c81414"/>`
      )).join("\n")}
    </svg>
  `)).png().toBuffer();
  const reference = await sharp({
    create: {
      width: 128,
      height: 32,
      channels: 4,
      background: { r: 200, g: 20, b: 20, alpha: 1 }
    }
  }).png().toBuffer();
  let fetchCount = 0;

  try {
    globalThis.fetch = async (url, init) => {
      fetchCount += 1;
      assert.match(String(url), /\/v1\/images\/edits$/);
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get("size"), "1024x1024");
      const prompt = String(init.body.get("prompt"));
      assert.match(prompt, /Actual returned raster canvas: 1024x1024 pixels/);
      assert.match(prompt, /preserve referenced artwork at its existing scale and position/i);
      assert.doesNotMatch(prompt, /safe-content rectangle/i);

      const images = init.body.getAll("image[]");
      assert.equal(images.length, 1);
      assert.ok(images[0] instanceof Blob);
      const staged = sharp(Buffer.from(await images[0].arrayBuffer()));
      const metadata = await staged.metadata();
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: 1024, height: 1024 }
      );
      const { data, info } = await staged.raw().toBuffer({ resolveWithObject: true });
      const padding = rgbAt(data, info.width, 0, 0);
      for (const [x, y] of [[256, 256], [768, 256], [256, 768], [768, 768]]) {
        assert.deepEqual(rgbAt(data, info.width, x, y), [200, 20, 20]);
      }
      for (const cell of geometry.cells) {
        assert.deepEqual(rgbAt(data, info.width, cell.x, cell.y), [200, 20, 20]);
        assert.deepEqual(
          rgbAt(data, info.width, cell.x + cell.width - 1, cell.y + cell.height - 1),
          [200, 20, 20]
        );
      }
      const first = geometry.cells[0];
      const second = geometry.cells[1];
      const gutterX = Math.floor((first.x + first.width + second.x) / 2);
      assert.deepEqual(rgbAt(data, info.width, gutterX, first.y), padding);
      assert.deepEqual(rgbAt(data, info.width, 1023, 1023), padding);
      assert.notDeepEqual(padding, [200, 20, 20]);

      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const [option] = await provider.generate({
      asset,
      purpose: "tileset-animation",
      references: [{
        image: reference,
        mimeType: "image/png",
        fileName: "props-base.png"
      }]
    });

    assert.equal(fetchCount, 1);
    assert.ok(option);
    const metadata = await sharp(option.image).metadata();
    assert.deepEqual(
      { width: metadata.width, height: metadata.height },
      { width: 128, height: 32 }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI image edits rasterize SVG references to PNG", async () => {
  const originalFetch = globalThis.fetch;
  const generated = await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 4,
      background: { r: 220, g: 80, b: 40, alpha: 1 }
    }
  }).png().toBuffer();

  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/v1\/images\/edits$/);
      assert.ok(init?.body instanceof FormData);
      const references = init.body.getAll("image[]");
      assert.equal(references.length, 1);
      const reference = references[0];
      assert.ok(reference instanceof Blob);
      assert.equal(reference.type, "image/png");
      assert.match(reference.name, /\.png$/);
      const metadata = await sharp(Buffer.from(await reference.arrayBuffer())).metadata();
      assert.equal(metadata.format, "png");
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: 4, height: 2 }
      );

      return new Response(JSON.stringify({
        data: [{ b64_json: generated.toString("base64") }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const [option] = await provider.generate({
      asset: imageAsset({ width: 4, height: 2 }, { format: "png" }),
      references: [{
        image: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2"><rect width="4" height="2" fill="#228844"/></svg>'
        ),
        mimeType: "image/svg+xml",
        fileName: "base-tileset.svg"
      }]
    });

    assert.ok(option);
    assert.equal(option.mimeType, "image/png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider forwards AbortSignal to the active fetch", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let started;
  const fetchStarted = new Promise((resolve) => {
    started = resolve;
  });
  let observedSignal;

  try {
    globalThis.fetch = async (_url, init) => {
      observedSignal = init?.signal;
      started();
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    };

    const provider = createOpenAiImageProvider({ apiKey: "test-key" });
    const generation = provider.generate({
      asset: imageAsset({ width: 4, height: 2 }, { format: "png" }),
      signal: controller.signal
    });

    await fetchStarted;
    controller.abort(new Error("cancelled by test"));
    await assert.rejects(generation, /cancelled by test/);
    assert.equal(observedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function rgbAt(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return Array.from(data.subarray(offset, offset + 3));
}
