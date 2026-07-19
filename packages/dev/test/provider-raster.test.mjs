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
