# `@ai-game-assets/dev`

Local development server, AI providers, asset storage, and production manifest tooling for AI Game Assets.

[Play the Space Invaders demo](https://tzachshabtay.github.io/ai-assets/) · [View this package on npm](https://www.npmjs.com/package/@ai-game-assets/dev) · [Read the full documentation](https://github.com/tzachshabtay/ai-assets#readme)

```sh
npm install -D @ai-game-assets/dev
```

Use this package during development to generate, edit, promote, and build game assets. Production games do not need the development server or AI credentials.

## Scaled variants

`POST /__ai-assets/scaled-variant` creates, regenerates, touches up, or deletes a version-scoped resolution. Requests include `assetId`, `versionName`, `sourceFile`, `action`, and, for existing variants, `id` and `expectedFile`. Generate accepts `width`, `height`, and `method` (`nearest`, `resample`, or `ai-upscale`); touch-up accepts a PNG `dataUrl` with unchanged variant dimensions. Width/height describe each frame or tile when the source is a sheet. Responses include the updated manifest and variant. Generate and touch-up also return `previewDataUrl` containing the saved PNG, allowing immediate previews before public-file watchers expose the new URL.

The server validates image dimensions and frame geometry, rejects stale updates, reads only local source files within `assetsDir`, and saves immutable PNGs. Failed generation leaves existing variants unchanged. Variant files and metadata are retained in production manifest builds. Replaced files are retained because other target assets or provenance may reference them.

Strict resizing works without API credentials. AI enlargement uses the OpenAI Images edit API with the existing `OPENAI_API_KEY`; no additional provider token is needed. The default model is GPT Image 2.5 Sunburst with high quality and a fixed preservation prompt. Smaller targets are generated on an API-supported canvas and resized to the exact requested dimensions with nearest-neighbor sampling. The edited image's transparency is retained. OpenAI may refine details; use `nearest` for exact pixel preservation. Downscaling in AI mode uses deterministic smooth resizing without an API call.

A custom `AiAssetUpscaleProvider` implements `upscale({ image, width, height, signal })` and returns image bytes. Pass it as `upscaleProvider` to `createAiAssetDevServer`. `createOpenAiUpscaleProvider({ apiKey?, model?, fetch? })`, `saveScaledVariant`, and `resizeScaledSource` are exported for custom servers. The server selects the closest source, processes sheet frames individually, and enforces exact output dimensions.
