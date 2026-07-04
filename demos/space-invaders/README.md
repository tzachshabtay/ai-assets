# Space Invaders Demo

Playable production demo: [https://tzachshabtay.github.io/ai-assets/](https://tzachshabtay.github.io/ai-assets/)

This demo is the main integration test for the AI Game Assets packages. It is a Phaser arcade game whose graphics, animation metadata, audio, music, voices, target variants, and UI assets are managed through the asset library.

## What It Shows

- in-game asset designer overlay, opened with the `Assets` button
- folder-based asset navigation with breadcrumbs
- OpenAI image generation for PNG, JPEG, WebP, and direct SVG generation
- spritesheet generation with fixed frame layout metadata
- target variants for square web, phone portrait, and wide tablet layouts
- deriving target variants by generation, scale, crop, tile, or AI extend
- upload flows for images, animations, individual frames, SFX, music, and voice lines
- version history, preview, promote, revert, and delete
- raster touch-up editor for base images and animation frames
- animation editor with delay, offset, scale, rotation, and per-frame tags
- ElevenLabs SFX, music, voice, and voice-line generation
- waveform audio editor with trim markers, volume, loop, and playback settings
- production builds that prune to active asset versions and selected targets
- Android and iOS Capacitor wrappers

## Running Locally

From the repository root:

```sh
npm install
npm run build:packages
npm run build:dev --workspace @ai-game-assets/demo-space-invaders
npm run dev --workspace @ai-game-assets/demo-space-invaders
```

Open the URL printed by the dev server. The default ports are `4177` for the game and `3977` for the asset API, but the server automatically moves to available ports when either port is busy.

The dev entry point fetches the manifest from the local asset API, loads asset files through that same API, starts the Phaser game, and installs the designer overlay. `src/assets.ts` is generated for fallback and production-style builds, but the live dev server does not rewrite it on promote. Production entry points import a generated static manifest and do not install the designer.

## Environment

Create a `.env` file in the repository root or in this demo folder when you want generation to work:

```sh
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
```

Optional variables:

- `OPENAI_IMAGE_MODEL`: defaults to `gpt-image-2` in the demo server
- `OPENAI_SVG_MODEL`: text/code model used for direct SVG generation
- `ELEVENLABS_OUTPUT_FORMAT`: audio output format requested from ElevenLabs
- `AI_ASSET_API_PORT`: preferred asset API port, default `3977`
- `SPACE_INVADERS_DEMO_PORT`: preferred game port, default `4177`

Graphics and audio providers are independent. Missing `ELEVENLABS_API_KEY` should not block graphics work, and missing `OPENAI_API_KEY` should not block audio work.

## Asset Layout

Authoritative assets live in `src/ai-assets` as one JSON file per asset:

```text
src/ai-assets/
  style-guide.json
  targets.json
  Graphics/
    Background/
    Invaders/
    Lasers/
    UI/
  Music/
  Sfx/
  Voices/
```

Generated and uploaded files live in `public/assets`. The generated TypeScript manifest module is `src/assets.ts`; it is build output and should be regenerated instead of edited by hand.

`targets.json` maps base asset ids to target-specific variants. For example, the mobile and wide backgrounds override `background.space`, while most assets use the default version across all targets.

## Current Game Assets

The game currently uses:

- hero ship base image plus idle, moving-left, shooting, hit, and explosion animations
- three invader families with idle, shooting, destroyed, and celebration animations
- red and blue laser assets with flicker and hit animations
- full-screen space background plus phone and wide target variants
- five independent star animation assets, randomly assigned per star
- UI panel and button assets
- SFX for player laser, alien laser, invader explosion, hero hit, hero explosion, and game over
- menu music and game music with crossfade behavior
- voice announcer with a `new wave incoming` line

Gameplay also uses the asset metadata. For example, alien shooting can be timed to a frame tagged `shoot`, frame offsets affect rendered animation frames, audio trim/volume settings are applied in-game, and pixel-perfect collision respects current generated textures.

## Designer Notes

The designer is meant for desktop debug builds, not phone/tablet production builds. Useful flows:

- Regenerate creates streaming options and can be canceled.
- Clicking an option previews it in the running game.
- Promote writes the selected version to the JSON asset file.
- Versions opens older saved files so you can preview, restore, or delete them.
- Derive creates a target variant from another target.
- Edit opens the animation or audio editor, depending on asset kind.
- Touch up opens the raster frame editor when a raster image or one animation frame is selected.
- Style opens the shared style guide prompt and reference image list.

If an asset has no graphic yet, the runtime shows a library placeholder and can ask the dev server to generate and promote one first draft. Assets with a base image generate that base before dependent animations.

## Production Builds

The demo has three production-oriented build profiles:

```sh
npm run build:web --workspace @ai-game-assets/demo-space-invaders
npm run build:phone --workspace @ai-game-assets/demo-space-invaders
npm run build:tablet --workspace @ai-game-assets/demo-space-invaders
```

Build outputs:

- `dist/web`: includes `default`, `wide`, and `mobilePortrait`; the web game chooses the closest target responsively
- `dist/phone`: includes `mobilePortrait` plus fallback defaults
- `dist/tablet`: includes `wide` plus fallback defaults

All production builds use only active versions and copy only referenced asset files for the selected targets.

## Native Builds

Android uses the phone build:

```sh
npm run android:sync --workspace @ai-game-assets/demo-space-invaders
npm run android:install:debug --workspace @ai-game-assets/demo-space-invaders
```

iOS uses the tablet build:

```sh
npm run ios:sync --workspace @ai-game-assets/demo-space-invaders
npm run ios:open --workspace @ai-game-assets/demo-space-invaders
```

The iOS project includes an Xcode Cloud post-clone script that installs dependencies and rebuilds the Capacitor web bundle from the repository checkout.

## Agent Checklist

When modifying the demo:

- edit JSON files under `src/ai-assets`, not the generated `src/assets.ts`
- keep new source assets in `public/assets`
- run `npm run build:packages` after changing packages
- run `npm run typecheck --workspace @ai-game-assets/demo-space-invaders` for demo code changes
- use `build:web`, `build:phone`, or `build:tablet` to verify production asset pruning
- keep the designer out of production entry points
- preserve target fallback behavior unless the task explicitly changes it
