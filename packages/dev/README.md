# `@ai-game-assets/dev`

Local development server, AI providers, asset storage, and production manifest tooling for AI Game Assets.

[Play the Space Invaders demo](https://tzachshabtay.github.io/ai-assets/) · [View this package on npm](https://www.npmjs.com/package/@ai-game-assets/dev) · [Read the full documentation](https://github.com/tzachshabtay/ai-assets#readme)

```sh
npm install -D @ai-game-assets/dev
```

Use this package during development to generate, edit, promote, and build game assets. Production games do not need the development server or AI credentials.

## Scaled variants

`POST /__ai-assets/scaled-variant` creates, regenerates, touches up, or deletes a version-scoped resolution. Requests include `assetId`, `versionName`, `sourceFile`, `action`, and, for existing variants, `id` and `expectedFile`. Generate accepts `width`, `height`, and `method` (`nearest`, `resample`, or `ai-upscale`); touch-up accepts a PNG `dataUrl` with unchanged variant dimensions. Width/height describe each frame or tile when the source is a sheet. Responses include the updated manifest and variant.

The server validates image dimensions and frame geometry, rejects stale updates, reads only local source files within `assetsDir`, and saves immutable PNGs. Failed generation leaves existing variants unchanged. Variant files and metadata are retained in production manifest builds. Replaced files are retained because other target assets or provenance may reference them.

Strict resizing works without API credentials. To enable dedicated AI enlargement, set `REPLICATE_API_TOKEN`, or pass an `upscaleProvider` to `createAiAssetDevServer`. The built-in adapter uses Real-ESRGAN with face enhancement disabled; it never calls the normal image-generation provider. AI enlargement can infer fine detail and cannot guarantee zero interpretation. For exact pixel preservation, use `nearest`. OpenAI image-generation credentials alone do not provide this dedicated upscaling endpoint.

A custom `AiAssetUpscaleProvider` implements `upscale({ image, width, height, signal })` and returns image bytes. The server processes frames individually, enforces exact output dimensions, and restores the original alpha coverage. `createReplicateUpscaleProvider`, `saveScaledVariant`, and `resizeScaledSource` are also exported for custom development servers.
