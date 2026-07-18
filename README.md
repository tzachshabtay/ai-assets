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
- `tileset`: a fixed tile atlas whose optional animations are sequences of complete, identically aligned sheets
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

### Tilesets and animated tiles

A tileset is a first-class asset because its grid, generation rules, version bundle, and editor are different from an ordinary animation spritesheet. The version's `file` is the static base atlas. Each tileset animation stores one complete atlas file per temporal frame, so a logical tile keeps the same index while playback swaps aligned sheets:

```ts
"world.forest": {
  id: "world.forest",
  kind: "tileset",
  prompt: "Top-down forest terrain atlas with seamless tile edges.",
  dimensions: { width: 128, height: 64 },
  tileset: {
    tileWidth: 32,
    tileHeight: 32,
    columns: 4,
    rows: 2,
    tileCount: 8,
    tiles: [
      { prompt: "Seamless meadow grass; walkable." },
      { prompt: "Packed dirt path; walkable." },
      { prompt: "Blue river surface with horizontal ripples." },
      { prompt: "River water with clustered green reeds." },
      { prompt: "Dense tree canopy and short trunk; blocked." },
      { prompt: "Grass with small wildflowers; walkable." },
      { prompt: "Centered gray boulder on grass; blocked." },
      { prompt: "Horizontal wooden bridge over water; walkable." }
    ],
    animations: [{
      key: "water",
      prompt: "A subtle seamless water shimmer; preserve every other tile exactly.",
      frameCount: 2,
      frameRate: 3,
      repeat: -1
    }]
  },
  activeVersion: "default",
  versions: {
    default: {
      name: "default",
      file: "/assets/world.forest.default.png",
      prompt: "Top-down forest terrain atlas with seamless tile edges.",
      createdAt: "2026-07-15T00:00:00.000Z",
      tilesetAnimations: {
        water: {
          files: [
            "/assets/world.forest.water.0.png",
            "/assets/world.forest.water.1.png"
          ]
        }
      }
    }
  }
}
```

The grid dimensions must exactly cover `dimensions`, including optional `margin` and `spacing`. When `tiles` is present, it must contain one non-empty prompt per usable tile in row-major order. The image provider programmatically adds the exact tile size, sheet dimensions, grid, and ordering contract, then appends these tile prompts to form the model request; authors do not repeat that boilerplate. Animation files must match the declared `frameCount` and contain complete sheets at the same dimensions. During generation, each of the three candidate branches is produced sequentially: the base sheet and all earlier frames in that branch are supplied as references for the next frame. The designer then lets you choose one complete candidate sequence independently for every tile and saves the composed sheets as one atomic version bundle.

Transparent spritesheet generations are aligned to their declared frame grid by default. The provider
normalizes the generated row and column placement without scaling individual frames. Set
`settings.frameAlignment` to `"none"` when an animation intentionally translates within its frame cells.

Set `settings.background` explicitly when the asset's background is part of the artwork:

```ts
settings: { model: "gpt-image-2", format: "png", background: "opaque" }
```

`"opaque"` keeps every image or spritesheet frame filled edge to edge, does not add transparency
instructions to the generation prompt, and disables chroma-key transparency post-processing. Use
`"transparent"` for cutout sprites. An explicit setting takes precedence over words in the asset prompt.

## Phaser Runtime

Load assets in `preload`, create animations after loading, and use `AiAssetRuntime` to resolve active texture keys with target fallback.
For sprites and images that should update while the in-game designer previews or promotes assets, bind them with `bindTexture`.

```ts
import {
  AiAssetRuntime,
  AiAssetDebugClient,
  createAiAnimations,
  installAiAssetDesigner,
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
    createAiAnimations(this, assets, {
      assetId: "hero.ship.idle",
      targetId: "mobilePortrait"
    });

    const hero = this.add.sprite(200, 500, this.aiAssets.key("hero.ship.idle"));
    this.aiAssets.bindTexture(hero, "hero.ship.idle");
    hero.play("idle");
  }
}
```

`loadAiAssets` loads top-level graphical assets and expands their `linkedAnimationAssets` automatically. For games that spawn assets dynamically, use `loadAiAssetSet` with the root ids you may create at runtime; linked animation assets are included by default:

```ts
import { topLevelAiAssetIds } from "@ai-game-assets/core";
import { loadAiAssetSet } from "@ai-game-assets/phaser";

preload() {
  loadAiAssetSet(this, assets, [
    ...topLevelAiAssetIds(assets),
    "enemy.monkey",
    "enemy.snake"
  ]);
}
```

Linked animation assets such as `enemy.monkey.idle` are implementation details of the parent asset. The in-game designer hides them from the top-level asset browser by default and exposes them through the parent asset's animation selector. Pass `showLinkedAnimationAssets: true` to the designer only when you intentionally want those child assets listed as standalone entries.

`bindTexture` records the relationship between a Phaser image/sprite and an AI asset id. When the designer previews a new option, promotes a generated asset, or creates a first draft, the runtime can update bound objects automatically.

```ts
installAiAssetDesigner({
  scene: this,
  manifest: assets,
  client: new AiAssetDebugClient("http://127.0.0.1:3977"),
  restartOnPromote: false,
  ...this.aiAssets.designerCallbacks()
});
```

`designerCallbacks()` provides `onPreview`, `onAssetReady`, and `onManifestUpdated`. Use it when your game can express "this object displays this asset" through `bindTexture`; write custom callbacks only for richer behavior such as recreating animations, refreshing audio systems, or updating non-Phaser UI.

The Phaser package also includes helpers for loading audio, applying animation frame transforms, binding frame timing metadata to running animations, loading placeholders for missing graphics, and requesting first-draft generation from the dev server.

For animation assets, prefer `AiAssetRuntime.playAnimation` when playing an AI asset on a Phaser sprite. It creates the Phaser animation if needed, plays the selected linked animation state, applies per-frame `delayMs`, and applies frame `offsetX`, `offsetY`, `scaleX`, `scaleY`, and `rotation` metadata by default:

```ts
const playback = aiRuntime.playAnimation(monkey, "enemy.monkey", "idle");

// Explicit opt-out when the game wants to ignore designer-authored frame transforms.
aiRuntime.playAnimation(monkey, "enemy.monkey", "idle", {
  applyFrameTransforms: false
});

// Detach the frame transform handler if the object outlives this playback binding.
playback.destroy();
```

`createAiAnimations` only registers Phaser animation frames and frame durations. If an animation contains offset, scale, or rotation metadata, `createAiAnimations` warns in development-style usage unless you pass `{ onFrameTransforms: "ignore" }`. Use that option only when you intentionally bind transforms yourself or intentionally ignore them.

`loadAiAssetSet` also loads a tileset's base atlas and every full-sheet animation frame. Play a declared animation while keeping a logical tile frame fixed with `playTilesetAnimation`:

```ts
const waterTile = this.add.sprite(x, y, aiRuntime.key("world.forest"), 2);
const playback = aiRuntime.playTilesetAnimation(
  waterTile,
  "world.forest",
  2,
  "water"
);

playback.destroy();
```

## In-Game Designer

`@ai-game-assets/phaser` includes a debug-only designer overlay. It is installed by the game, but the UI and behavior are library-provided.

The designer supports:

- breadcrumb navigation through folder-organized assets
- target-aware editing and deriving variants from other targets
- prompt, dimensions, format, frame-grid, audio length, and voice settings
- streaming generation options as they complete
- generated animation candidates contain no inherited animation metadata; temporary sheet playback is derived from the candidate frame grid, while timing, tags, and transforms are authored only after choosing a sheet
- selecting a generated or saved option updates the Current preview without promoting it, so it can be edited in place; Revert preview restores the active promoted version
- cancelable generations
- upload for images, spritesheets, animation frames, sound effects, music, and voice lines
- version history, revert, promote, and delete
- style guide prompt and reference image management
- animation editor with per-frame delay, offset, scale, rotation, and tags
- base tileset controls for tile width, tile height, usable tile count, and one ordered prompt per tile, with exact-grid upload validation
- an explicit Mix tileset action after three base candidates finish, with a current/three-candidate choice and the intended prompt shown for every tile before promotion
- tileset animation mixer with synchronized base/three-candidate previews and a separate sequence choice for every tile
- frame touch-up editor for raster images with session-persistent tool settings, keyboard undo/redo, and guarded pointer drawing
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
  manifestPath: "src/ai-assets",
  assetsDir: "public/assets",
  publicPathPrefix: "/assets",
  provider: createOpenAiImageProvider(),
  audioProvider: createElevenLabsAudioProvider()
});

await server.listen({ port: 3977 });
```

When `publicPathPrefix` is set, the dev server also serves generated files from `assetsDir` at that path. For example, `publicPathPrefix: "/assets"` makes newly promoted files available from `http://127.0.0.1:3977/assets/...`. The Phaser designer resolves saved asset previews through its `AiAssetDebugClient`, so promoted images and audio stay visible even when the game dev server ignores generated files to avoid reloads.

Environment variables:

- `OPENAI_API_KEY`: required for graphical generations
- `OPENAI_IMAGE_MODEL`: optional, defaults to the provider default
- `OPENAI_SVG_MODEL`: optional text/code model for direct SVG generation
- `ELEVENLABS_API_KEY`: required for audio and voice generation
- `ELEVENLABS_OUTPUT_FORMAT`: optional audio output format

OpenAI and ElevenLabs are independent. A project can generate graphics without an ElevenLabs key, or audio without an OpenAI key.

### Avoiding Dev Refreshes On Promote

When `manifestModulePath` points at a source file such as `src/assets.ts`, Promote rewrites that file. Vite and similar dev servers may refresh the page if the running game imports that module directly or watches the generated module. `restartOnPromote: false` only disables the designer's explicit reload; it cannot stop your bundler from reacting to a watched source file change.

For the smoothest in-game iteration, omit `manifestModulePath` from the long-running dev server, load the manifest from the dev server while running in development, and generate the TypeScript module separately for production or fallback builds:

```ts
import type { AiAssetManifest } from "@ai-game-assets/core";
import { AiAssetDebugClient } from "@ai-game-assets/phaser";

async function loadAssetsManifest(): Promise<AiAssetManifest> {
  if (import.meta.env.DEV) {
    try {
      return await new AiAssetDebugClient("http://127.0.0.1:3977").getManifest();
    } catch (error) {
      console.warn("Falling back to bundled AI asset manifest.", error);
    }
  }

  return (await import("./assets.js")).assets;
}
```

Then pass the loaded manifest into your game scene instead of importing `assets.ts` from that scene. That keeps source-code promotion available without forcing a dev-page refresh.

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

## License

MIT. See [LICENSE](./LICENSE).
