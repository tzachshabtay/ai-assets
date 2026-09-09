# `@ai-game-assets/phaser`

Phaser loading, runtime helpers, and the in-game asset designer for AI Game Assets.

[Play the Space Invaders demo](https://tzachshabtay.github.io/ai-assets/) · [View this package on npm](https://www.npmjs.com/package/@ai-game-assets/phaser) · [Read the full documentation](https://github.com/tzachshabtay/ai-assets#readme)

```sh
npm install @ai-game-assets/core @ai-game-assets/phaser phaser
```

Use this package to load manifest assets into Phaser, react to designer previews, and install the debug-only asset designer during development.

The designer's Image model selector offers GPT Image 2.5 Sunburst (the default) and GPT Image 2.5 Flare for raster generation, edits, sprites, and tileset animations. Assets with an explicit legacy or custom `settings.model` retain that choice. Promote a generated option to save its model preference; SVG and audio keep their own providers.

Unpromoted prompt and field edits survive switching assets, targets, and animations during the current session. Refreshing resets them to the saved definitions. Use **Add reference** to choose an asset or animation sheet, upload an image, or sketch with the built-in editor. That reference takes priority over existing visual references and remains selected during the session until removed.
