import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { createOpenAiImageProvider } from "../dist/provider.js";

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
        { prompt: "A centered wooden crate." },
        { prompt: "A centered clay pot." },
        { prompt: "A centered brass key." },
        { prompt: "A centered green herb." }
      ]
    },
    settings: {
      background: "opaque",
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
  const generated = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
      <rect width="1536" height="1024" fill="#ff00ff"/>
      <rect x="0" y="320" width="384" height="384" fill="#c81414"/>
      <rect x="384" y="320" width="384" height="384" fill="#14c814"/>
      <rect x="768" y="320" width="384" height="384" fill="#1414c8"/>
      <rect x="1152" y="320" width="384" height="384" fill="#c8c814"/>
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
      asset: propsTilesetAsset(),
      count: 3
    });

    assert.equal(requestBodies.length, 3);
    assert.equal(options.length, 3);
    for (const body of requestBodies) {
      assert.equal(body.n, 1);
      assert.equal(body.size, "1536x1024");
      assert.match(body.prompt, /Actual returned raster canvas: 1536x1024 pixels/);
      assert.match(body.prompt, /active sheet rectangle \[x=0-1535, y=320-703\]/);
      assert.match(body.prompt, /Tile 1 \[x=0-383, y=320-703\]/);
      assert.match(body.prompt, /Tile 4 \[x=1152-1535, y=320-703\]/);
      assert.doesNotMatch(body.prompt, /Target canvas: 128x32|Output one 128×32/);
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

test("OpenAI provider stages full-sheet tileset edit references in generation space", async () => {
  const originalFetch = globalThis.fetch;
  const generated = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
      <rect width="1536" height="1024" fill="#ff00ff"/>
      <rect x="0" y="320" width="1536" height="384" fill="#c81414"/>
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
      assert.equal(init.body.get("size"), "1536x1024");
      assert.match(
        String(init.body.get("prompt")),
        /Actual returned raster canvas: 1536x1024 pixels/
      );

      const images = init.body.getAll("image[]");
      assert.equal(images.length, 1);
      assert.ok(images[0] instanceof Blob);
      const staged = sharp(Buffer.from(await images[0].arrayBuffer()));
      const metadata = await staged.metadata();
      assert.deepEqual(
        { width: metadata.width, height: metadata.height },
        { width: 1536, height: 1024 }
      );
      const { data, info } = await staged.raw().toBuffer({ resolveWithObject: true });
      const padding = rgbAt(data, info.width, 0, 0);
      assert.deepEqual(rgbAt(data, info.width, 0, 320), [200, 20, 20]);
      assert.deepEqual(rgbAt(data, info.width, 1535, 703), [200, 20, 20]);
      assert.deepEqual(rgbAt(data, info.width, 1535, 1023), padding);
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
      asset: propsTilesetAsset(),
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
