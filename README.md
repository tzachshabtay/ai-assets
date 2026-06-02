# AI Game Assets

Prompt-aware AI asset tooling for TypeScript 2D games.

This project targets Phaser 4 first, with a small engine adapter boundary so other TS/JS engines can be added later.

## Concept

An asset is not only a PNG. It is a tracked creative object:

- stable asset id
- source prompt
- generation settings
- named saved versions
- selected active version
- runtime helpers for swapping versions in debug mode

In production, the game only loads normal image files and manifests. In development, a local Node service can call image generation, save files, and update the manifest.

## Packages

- `@ai-game-assets/core`: engine-neutral schema and manifest helpers
- `@ai-game-assets/dev`: local-only generation and save pipeline
- `@ai-game-assets/phaser`: Phaser 4 runtime adapter

## Status

Early scaffold. The public API is intentionally small while the asset/version model settles.

## Engine Choice

The first-class target is Phaser 4. It is the strongest fit for this project because it is a complete 2D game framework with scene, loader, texture, animation, and debug-time extension points. PixiJS is excellent rendering infrastructure, but it is not a full game engine. Excalibur remains the most interesting TypeScript-first future adapter.

## Example Manifest

```ts
import { defineAiAssets } from "@ai-game-assets/core";

export const assets = defineAiAssets({
  "hero.idle": {
    id: "hero.idle",
    kind: "image",
    prompt: "Draw a small heroic knight in an idle pose, pixel art, transparent background.",
    dimensions: { width: 32, height: 32 },
    settings: {
      model: "gpt-image-2",
      background: "auto",
      quality: "auto",
      format: "png"
    },
    activeVersion: "default",
    versions: {
      default: {
        name: "default",
        file: "/assets/hero.idle.default.png",
        prompt: "Draw a small heroic knight in an idle pose, pixel art, transparent background.",
        createdAt: "2026-05-30T00:00:00.000Z",
        model: "gpt-image-2"
      }
    }
  }
});
```

## Phaser Usage

```ts
import { loadAiAssets, AiAssetRuntime } from "@ai-game-assets/phaser";
import { assets } from "./assets";

class MainScene extends Phaser.Scene {
  preload() {
    loadAiAssets(this, assets);
  }

  create() {
    const aiAssets = new AiAssetRuntime(this, assets);
    this.add.image(100, 100, aiAssets.key("hero.idle"));
  }
}
```

## Local Generation Server

```ts
import {
  createAiAssetDevServer,
  createOpenAiImageProvider
} from "@ai-game-assets/dev";

const devServer = createAiAssetDevServer({
  manifestPath: "src/assets.ai.json",
  manifestModulePath: "src/assets.ts",
  assetsDir: "public/assets",
  publicPathPrefix: "/assets",
  provider: createOpenAiImageProvider()
});

await devServer.listen();
```

The game runtime can call the local server in debug mode via `AiAssetDebugClient`. Production builds should not start or bundle the dev server.
