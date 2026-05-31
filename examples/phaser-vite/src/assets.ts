import { defineAiAssets } from "@ai-game-assets/core";

export const assets = defineAiAssets({
  "hero.idle": {
    id: "hero.idle",
    kind: "image",
    prompt: "Draw a small heroic knight in an idle pose, pixel art, transparent background.",
    dimensions: {
      width: 32,
      height: 32
    },
    settings: {
      model: "gpt-image-1.5",
      background: "transparent",
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
        model: "gpt-image-1.5"
      }
    }
  },
  "slime.walk": {
    id: "slime.walk",
    kind: "animation",
    prompt: "Draw a 4 frame slime walk cycle spritesheet, pixel art, transparent background.",
    dimensions: {
      width: 128,
      height: 32
    },
    frameGrid: {
      frameWidth: 32,
      frameHeight: 32,
      columns: 4,
      rows: 1
    },
    animations: [
      {
        key: "slime.walk",
        frames: [0, 1, 2, 3],
        frameRate: 8,
        repeat: -1
      }
    ],
    settings: {
      model: "gpt-image-1.5",
      background: "transparent",
      quality: "auto",
      format: "png"
    },
    activeVersion: "default",
    versions: {
      default: {
        name: "default",
        file: "/assets/slime.walk.default.png",
        prompt: "Draw a 4 frame slime walk cycle spritesheet, pixel art, transparent background.",
        createdAt: "2026-05-30T00:00:00.000Z",
        model: "gpt-image-1.5"
      }
    }
  }
});
