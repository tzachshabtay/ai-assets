# AI Game Assets

[![AI Game Assets demo video](https://img.youtube.com/vi/LaXCj2oczyI/hqdefault.jpg)](https://youtu.be/LaXCj2oczyI)

Prompt-aware AI asset tooling for TypeScript 2D games. The library lets a game keep the creative intent for every asset next to the asset itself: prompts, dimensions, generation settings, saved versions, target variants, animation frame metadata, audio playback metadata, and voice direction.

The first runtime adapter is for Phaser. The core package is engine-neutral, so other engines can use the same manifests and build pipeline later.

## Why This Exists

Game teams usually treat generated assets as exported files. This project treats them as editable source material:

- each asset has a stable id, prompt, settings, and version history
- debug builds can regenerate, upload, preview, edit, promote, or revert assets while the game is running
- production builds load plain static files with no AI keys, no local server, and no designer UI
- targets such as `default`, `mobilePortrait`, and `wide` can override only the assets that need a different size
- old versions can remain available for iteration without being bundled into production

## Packages

| Package | Purpose |
| --- | --- |
| `@ai-game-assets/core` | Engine-neutral asset types, manifest validation, version helpers, and target resolution. |
| `@ai-game-assets/phaser` | Phaser loader/runtime helpers plus the in-game asset designer. |
| `@ai-game-assets/dev` | Local development server, OpenAI image/SVG provider, ElevenLabs audio/voice provider, asset store, and production manifest builder. |

Install the packages you need:

```sh
npm install @ai-game-assets/core @ai-game-assets/phaser
npm install -D @ai-game-assets/dev
```

## Concepts

An asset is a manifest entry. Its `kind` controls how it is generated, edited, loaded, and previewed.

Supported kinds:

- `image`, `spritesheet`, `animation`: graphical assets, including frame grids and per-frame metadata
- `sound`, `music`: generated or uploaded audio with trim, volume, loop, and optional effects metadata
- `voice`: a reusable generated voice identity
- `voice-line`: spoken text that can use a `voice` asset and direction notes
- `collection`: a logical grouping asset

A version is a saved file plus the prompt/settings used to produce it. `activeVersion` is the version the game should currently use. The designer can temporarily preview another version, and the standard Promote action makes the choice permanent.

A target maps a base asset id to a target-specific variant. For example, the game can use `background.space` on desktop, `background.space.mobile-portrait` on phones, and `background.space.wide` on tablets, while all non-overridden assets fall back to the base id.

A style guide is optional manifest-level creative direction. It can include a text prompt and reference images, and is applied to generations when present.

## Minimal Manifest

```ts
import { defineAiAssets } from "@ai-game-assets/core";

export const assets = defineAiAssets({
  "hero.ship": {
    id: "hero.ship",
    kind: "image",
    prompt: "Compact arcade hero spaceship, readable silhouette, transparent background.",
    dimensions: { width: 72, height: 72 },
    settings: { model: "gpt-image-2", format: "png", quality: "low" },
    activeVersion: "default",
    versions: {
      default: {
        name: "default",
        file: "/assets/hero.ship.default.png",
        prompt: "Compact arcade hero spaceship, readable silhouette, transparent background.",
        createdAt: "2026-06-20T00:00:00.000Z",
        model: "gpt-image-2"
      }
    },
    linkedAnimationAssets: {
      idle: { label: "Idle", assetId: "hero.ship.idle" }
    }
  },
  "hero.ship.idle": {
    id: "hero.ship.idle",
    kind: "spritesheet",
    prompt: "Subtle engine glow idle loop.",
    dimensions: { width: 144, height: 144 },
    frameGrid: { frameWidth: 72, frameHeight: 72, columns: 2, rows: 2, frameCount: 4 },
    animations: [{ key: "idle", frames: [0, 1, 2, 3], frameRate: 8, repeat: -1 }],
    settings: { model: "gpt-image-2", format: "png", quality: "low" },
    activeVersion: "default",
    versions: {}
  }
});
```

For larger projects, keep assets as JSON files in folders and generate the TypeScript module during development or build.

## Phaser Runtime

Load assets in `preload`, create animations after loading, and use `AiAssetRuntime` to resolve active texture keys with target fallback.

```ts
import {
  AiAssetRuntime,
  createAiAnimations,
  loadAiAssets
} from "@ai-game-assets/phaser";
import { assets } from "./assets.js";

class GameScene extends Phaser.Scene {
  private aiAssets!: AiAssetRuntime;

  preload() {
    loadAiAssets(this, assets, { targetId: "mobilePortrait" });
  }

  create() {
    this.aiAssets = new AiAssetRuntime(this, assets, { targetId: "mobilePortrait" });
    createAiAnimations(this, assets, { targetId: "mobilePortrait" });

    const hero = this.add.sprite(200, 500, this.aiAssets.key("hero.ship.idle"));
    hero.play(this.aiAssets.animationKey("hero.ship.idle", "idle"));
  }
}
```

The Phaser package also includes helpers for loading audio, applying animation frame transforms, binding frame timing metadata to running animations, loading placeholders for missing graphics, and requesting first-draft generation from the dev server.

## In-Game Designer

`@ai-game-assets/phaser` includes a debug-only designer overlay. It is installed by the game, but the UI and behavior are library-provided.

The designer supports:

- breadcrumb navigation through folder-organized assets
- target-aware editing and deriving variants from other targets
- prompt, dimensions, format, frame-grid, audio length, and voice settings
- streaming generation options as they complete
- cancelable generations
- upload for images, spritesheets, animation frames, sound effects, music, and voice lines
- version history, revert, promote, and delete
- style guide prompt and reference image management
- animation editor with per-frame delay, offset, scale, rotation, and tags
- frame touch-up editor for raster images
- audio editor with waveform preview, trim markers, volume, loop, and playback settings

Production builds should not bundle or install the designer.

## Local Dev Server

Use the dev server only during development. It reads and writes a folder of JSON asset definitions, stores generated files, and exposes endpoints used by the designer.

```ts
import {
  createAiAssetDevServer,
  createElevenLabsAudioProvider,
  createOpenAiImageProvider
} from "@ai-game-assets/dev";

const server = createAiAssetDevServer({
  manifestDir: "src/ai-assets",
  manifestModulePath: "src/assets.ts",
  assetsDir: "public/assets",
  publicPathPrefix: "/assets",
  provider: createOpenAiImageProvider(),
  audioProvider: createElevenLabsAudioProvider()
});

await server.listen({ port: 3977 });
```

Environment variables:

- `OPENAI_API_KEY`: required for graphical generations
- `OPENAI_IMAGE_MODEL`: optional, defaults to the provider default
- `OPENAI_SVG_MODEL`: optional text/code model for direct SVG generation
- `ELEVENLABS_API_KEY`: required for audio and voice generation
- `ELEVENLABS_OUTPUT_FORMAT`: optional audio output format

OpenAI and ElevenLabs are independent. A project can generate graphics without an ElevenLabs key, or audio without an OpenAI key.

## Production Builds

The dev package includes a CLI that turns an `ai-assets` folder into a TypeScript manifest module. It can prune to active versions, select target variants, and copy only referenced files.

```sh
ai-game-assets-dev build-manifest \
  --manifest-dir=src/ai-assets \
  --module-out=src/assets.ts \
  --active-only \
  --targets=default,wide,mobilePortrait \
  --asset-source-dir=public/assets \
  --asset-out-dir=dist/web/assets
```

Typical build profiles:

- web: include `default` plus responsive targets such as `wide` and `mobilePortrait`
- phone app: include the phone target plus fallback defaults
- tablet app: include the tablet target plus fallback defaults

Only the active version of each included asset should be bundled for production. Keep generated source modules such as `src/assets.ts` out of source control when they can be rebuilt from the JSON asset folder.

## Repository Workflows

This repository publishes packages with a manual GitHub Actions workflow. The intended release flow is:

1. run the npm release workflow with `dry_run=true`
2. review the pack/build result
3. rerun with `dry_run=false`
4. the workflow publishes packages, tags the version, and creates release notes from commits

The Space Invaders demo has its own production build and GitHub Pages deployment.

## Demo

The main example is [Space Invaders](./demos/space-invaders/README.md). It exercises most of the library: images, spritesheets, animation metadata, targets, generated SVGs, SFX, music, voices, uploads, version history, derivation, and native mobile/tablet builds.
