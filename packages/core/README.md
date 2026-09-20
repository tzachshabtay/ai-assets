# `@ai-game-assets/core`

Engine-neutral manifest types, validation, version helpers, and target resolution for AI Game Assets.

[Play the Space Invaders demo](https://tzachshabtay.github.io/ai-assets/) · [View this package on npm](https://www.npmjs.com/package/@ai-game-assets/core) · [Read the full documentation](https://github.com/tzachshabtay/ai-assets#readme)

```sh
npm install @ai-game-assets/core
```

Use this package when defining or inspecting AI asset manifests without coupling your code to a game engine.

## Shared designer dock

`registerInGameDesignerPanel` and `registerInGameDesignerToggle` share a toolbar across installed designers. Click a button to toggle its panel/tool, or drag any toolbar button to move the toolbar and open panel together. When all panels are closed, dragging moves only the toolbar; opening a panel uses that location. Panel titles also support dragging, and panel edges support resizing.

Drags end on release, pointer cancellation, lost capture, or window focus loss. Movement without a pressed button also clears a missed release outside the viewport. Run `npm run test:dock` for the browser regression tests (install Chromium with `npx playwright install chromium` first).

## Scaled variants

`AiAssetVersion.scaledVariants` contains alternate resolutions of that source version. Each `AiAssetScaledVariant` records its ID, immutable file, dimensions, optional frame grid, generation method, source file and timestamp. `scaledVariantSource` retains the source geometry even if a later promotion changes the asset's dimensions. Variants do not change the logical asset dimensions or animation definitions.

`selectScaledVariant(asset, displaySize, { version?, excludeId?, available? })` returns the closest available source or original by logarithmic scale ratio, preferring larger resolutions on ties. Display size describes one frame for sheets. `scaledVariantGeometry` creates a compatible grid for requested frame dimensions. `assertManifest` validates variant geometry and duplicate sizes. Source promotions start with a fresh variant set; inactive versions retain theirs.
