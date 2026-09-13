# `@ai-game-assets/phaser`

Phaser loading, runtime helpers, and the in-game asset designer for AI Game Assets.

[Play the Space Invaders demo](https://tzachshabtay.github.io/ai-assets/) · [View this package on npm](https://www.npmjs.com/package/@ai-game-assets/phaser) · [Read the full documentation](https://github.com/tzachshabtay/ai-assets#readme)

```sh
npm install @ai-game-assets/core @ai-game-assets/phaser phaser
```

Use this package to load manifest assets into Phaser, react to designer previews, and install the debug-only asset designer during development.

The designer's Image model selector offers GPT Image 2.5 Sunburst (the default) and GPT Image 2.5 Flare for raster generation, edits, sprites, and tileset animations. Assets with an explicit legacy or custom `settings.model` retain that choice. Promote a generated option to save its model preference; SVG and audio keep their own providers.

Unpromoted prompt and field edits survive switching assets, targets, and animations during the current session. Refreshing resets them to the saved definitions. Use **Add reference** to choose an asset or animation sheet, upload an image, or sketch with the built-in editor. That reference takes priority over existing visual references and remains selected during the session until removed.

## Scaled variants

The asset designer's **Scaled variants...** button manages alternate resolutions of the current source version. Set width and height (per frame for animations/sheets, per tile for tilesets), then **Generate**. If that resolution already exists, the form switches to **Regenerate** and replaces that variant only after you save a candidate; you do not need to select Edit first. **Edit** changes the dimensions and offers **Regenerate**; **Touch up…** opens the existing pixel editor; **Delete** removes a variant from use. **Promote** saves the selected candidate while keeping the dialog open. After selecting a candidate, **Close** becomes **Save and close** and waits for the save and runtime update before closing; a failed save keeps the dialog and selection open for retry. Closing without a selection retains the candidates when you reopen this dialog in the same designer session. **Discard candidates** clears that pending batch. The source image, logical asset dimensions, frame order, and animation timing remain unchanged. A newly promoted source starts with its own variants.

The Scaled variants dialog generates three candidates before saving. Each animation candidate has Animate/Stop controls using the original frame order and timing. Select a candidate and Promote to save it, or discard the candidates. Regeneration keeps the existing variant until its replacement is promoted. Saved animations can also be previewed with Animate.

Generation selects the closest available resolution by scale ratio, preferring the larger source on a tie. Regeneration excludes the variant being replaced. Strict pixels uses exact nearest-neighbor RGBA copying. Smooth resize uses deterministic resampling. OpenAI image upscale uses the existing OpenAI key and a preservation prompt; it may refine details. Downscaling in that mode uses deterministic smooth resizing. The AI result’s transparency is retained and sheets are processed one cell at a time.

`loadAiAsset`/`loadAiAssets` load the active version's variants. `AiAssetRuntime` automatically selects available variants for `bindTexture` and `playAnimation` targets after each scene update, based on displayed size, main-camera zoom, canvas display scaling, and device pixel ratio. Frame, origin, flipping, and world-space display size are retained. Missing variant textures fall back to an available source; live variant saves load asynchronously; deletion falls back immediately. Active generation previews take priority over saved variants.

For custom cameras, render textures, or explicit synchronization, call `runtime.applyScaledVariant(sprite, assetId, { width, height, frame })`, where width/height are desired screen-pixel dimensions. Omit dimensions to use the main camera and canvas measurements. Set `scaledVariants: false` in runtime options to disable selection. Plain Phaser sprites not managed by the runtime can use the exported `applyAiScaledVariant` helper. Animated tileset sequence textures remain separate from variants of the base sheet.
