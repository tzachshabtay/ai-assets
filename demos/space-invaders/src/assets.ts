import { defineAiAssets } from "@ai-game-assets/core";

export const assets = defineAiAssets(
{
  "hero.ship": {
    "id": "hero.ship",
    "kind": "image",
    "prompt": "Hero starfighter for a 2D space invaders game, readable silhouette, transparent background.",
    "dimensions": {
      "width": 128,
      "height": 128
    },
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png"
    },
    "activeVersion": "promoted-1780541852813",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/hero.ship.default.svg",
        "prompt": "Hero starfighter for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-05-30T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780369898360": {
        "name": "promoted-1780369898360",
        "file": "/assets/hero.ship.promoted-1780369898360.png",
        "prompt": "Hero starfighter for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-06-02T03:11:38.392Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780445988143": {
        "name": "promoted-1780445988143",
        "file": "/assets/hero.ship.promoted-1780445988143.png",
        "prompt": "Hero starfighter for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-06-03T00:19:48.159Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780369898360",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780541852813": {
        "name": "promoted-1780541852813",
        "file": "/assets/hero.ship.promoted-1780541852813.png",
        "prompt": "Hero starfighter for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-06-04T02:57:32.834Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780445988143",
        "notes": "Promoted from the AI asset designer."
      }
    },
    "linkedAnimationAssets": {
      "idle": {
        "label": "Idle",
        "assetId": "hero.ship.idle"
      },
      "shooting": {
        "label": "Shooting",
        "assetId": "hero.ship.shooting"
      },
      "hit": {
        "label": "Getting hit",
        "assetId": "hero.ship.hit"
      },
      "moving-left": {
        "label": "Moving left",
        "assetId": "hero.ship.moving-left"
      }
    }
  },
  "invader.scout": {
    "id": "invader.scout",
    "kind": "image",
    "prompt": "Alien invader scout for a 2D space invaders game, readable silhouette, transparent background. red color.",
    "dimensions": {
      "width": 64,
      "height": 64
    },
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png"
    },
    "linkedAnimationAssets": {
      "idle": {
        "label": "Idle",
        "assetId": "invader.scout.idle"
      },
      "shooting": {
        "label": "Shooting",
        "assetId": "invader.scout.shooting"
      },
      "destroyed": {
        "label": "Destroyed",
        "assetId": "invader.scout.destroyed"
      }
    },
    "activeVersion": "promoted-1780541957309",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.scout.default.svg",
        "prompt": "Alien invader scout for a 2D space invaders game, neon beetle-like armor, readable silhouette, transparent background.",
        "createdAt": "2026-05-30T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780236988072": {
        "name": "promoted-1780236988072",
        "file": "/assets/invader.scout.promoted-1780236988072.png",
        "prompt": "Alien invader scout for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T14:16:28.096Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780250659533": {
        "name": "promoted-1780250659533",
        "file": "/assets/invader.scout.promoted-1780250659533.png",
        "prompt": "Alien invader scout for a 2D space invaders game, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T18:04:19.580Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780236988072",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780250792117": {
        "name": "promoted-1780250792117",
        "file": "/assets/invader.scout.promoted-1780250792117.png",
        "prompt": "Alien invader scout for a 2D space invaders game, readable silhouette, transparent background. red color.",
        "createdAt": "2026-05-31T18:06:32.161Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780250659533",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780541957309": {
        "name": "promoted-1780541957309",
        "file": "/assets/invader.scout.promoted-1780541957309.png",
        "prompt": "Alien invader scout for a 2D space invaders game, readable silhouette, transparent background. red color.",
        "createdAt": "2026-06-04T02:59:17.322Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780250792117",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.scout.idle": {
    "id": "invader.scout.idle",
    "kind": "spritesheet",
    "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
    "dimensions": {
      "width": 128,
      "height": 128
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "invader.scout.idle",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 6,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "invader.scout"
      ]
    },
    "activeVersion": "promoted-1780542126752",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.scout.idle.default.svg",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-idle-1780239036123": {
        "name": "generated-idle-1780239036123",
        "file": "/assets/invader.scout.idle.generated-idle-1780239036123.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T14:50:36.150Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780250818107": {
        "name": "promoted-1780250818107",
        "file": "/assets/invader.scout.idle.promoted-1780250818107.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T18:06:58.161Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "generated-idle-1780239036123",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780365798285": {
        "name": "promoted-1780365798285",
        "file": "/assets/invader.scout.idle.promoted-1780365798285.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-02T02:03:18.315Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780250818107",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780447725139": {
        "name": "promoted-1780447725139",
        "file": "/assets/invader.scout.idle.promoted-1780447725139.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-03T00:48:45.159Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780365798285",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542126752": {
        "name": "promoted-1780542126752",
        "file": "/assets/invader.scout.idle.promoted-1780542126752.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-04T03:02:06.779Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780447725139",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.scout.shooting": {
    "id": "invader.scout.shooting",
    "kind": "spritesheet",
    "prompt": "shooting animation, the alien is shooting to the bottom using its eye, the laser itself should not be in the animation but a small spark from the eye when the shot starts",
    "dimensions": {
      "width": 192,
      "height": 192
    },
    "frameGrid": {
      "frameCount": 8,
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 3,
      "rows": 3
    },
    "animations": [
      {
        "key": "invader.scout.shooting",
        "frames": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ],
        "frameRate": 10,
        "repeat": 0,
        "frameTimings": [
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 100,
            "offsetX": 2,
            "offsetY": -1
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0,
            "tag": "shoot"
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 100,
            "offsetX": 0,
            "offsetY": 0
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "invader.scout"
      ]
    },
    "activeVersion": "promoted-1780542418532",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.scout.shooting.default.svg",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-shooting-1780239052135": {
        "name": "generated-shooting-1780239052135",
        "file": "/assets/invader.scout.shooting.generated-shooting-1780239052135.png",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T14:50:52.158Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365025144": {
        "name": "promoted-1780365025144",
        "file": "/assets/invader.scout.shooting.promoted-1780365025144.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-02T01:50:25.177Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "generated-shooting-1780239052135",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450422695": {
        "name": "promoted-1780450422695",
        "file": "/assets/invader.scout.shooting.promoted-1780450422695.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T01:33:42.714Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780365025144",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780454683156": {
        "name": "promoted-1780454683156",
        "file": "/assets/invader.scout.shooting.promoted-1780454683156.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T02:44:43.169Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780450422695",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780456444685": {
        "name": "promoted-1780456444685",
        "file": "/assets/invader.scout.shooting.promoted-1780456444685.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T03:14:04.703Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780454683156",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542418532": {
        "name": "promoted-1780542418532",
        "file": "/assets/invader.scout.shooting.promoted-1780542418532.png",
        "prompt": "shooting animation, the alien is shooting to the bottom using its eye, the laser itself should not be in the animation but a small spark from the eye when the shot starts",
        "createdAt": "2026-06-04T03:06:58.549Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780456444685",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.scout.destroyed": {
    "id": "invader.scout.destroyed",
    "kind": "spritesheet",
    "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
    "dimensions": {
      "width": 192,
      "height": 192
    },
    "frameGrid": {
      "frameCount": 8,
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 3,
      "rows": 3
    },
    "animations": [
      {
        "key": "invader.scout.destroyed",
        "frames": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ],
        "frameRate": 12,
        "repeat": 0
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "invader.scout"
      ]
    },
    "activeVersion": "promoted-1780542613732",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.scout.destroyed.default.svg",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-destroyed-1780239070336": {
        "name": "generated-destroyed-1780239070336",
        "file": "/assets/invader.scout.destroyed.generated-destroyed-1780239070336.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T14:51:10.359Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365215588": {
        "name": "promoted-1780365215588",
        "file": "/assets/invader.scout.destroyed.promoted-1780365215588.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-02T01:53:35.619Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "generated-destroyed-1780239070336",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450920237": {
        "name": "promoted-1780450920237",
        "file": "/assets/invader.scout.destroyed.promoted-1780450920237.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-03T01:42:00.310Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780365215588",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542613732": {
        "name": "promoted-1780542613732",
        "file": "/assets/invader.scout.destroyed.promoted-1780542613732.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-04T03:10:13.745Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.scout"
          ]
        },
        "parentVersion": "promoted-1780450920237",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "hero.ship.idle": {
    "id": "hero.ship.idle",
    "kind": "spritesheet",
    "prompt": "Hero starfighter idle animation. Subtle hovering bob, cockpit glint, stable centered silhouette, transparent background.",
    "dimensions": {
      "width": 256,
      "height": 256
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "hero.ship.idle",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 6,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "hero.ship"
      ]
    },
    "activeVersion": "promoted-1780542772694",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/hero.ship.idle.default.svg",
        "prompt": "Hero starfighter idle animation. Subtle hovering bob, cockpit glint, stable centered silhouette, transparent background.",
        "createdAt": "2026-06-03T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780535453778": {
        "name": "promoted-1780535453778",
        "file": "/assets/hero.ship.idle.promoted-1780535453778.png",
        "prompt": "Hero starfighter idle animation. Subtle hovering bob, cockpit glint, stable centered silhouette, transparent background.",
        "createdAt": "2026-06-04T01:10:53.810Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780535677815": {
        "name": "promoted-1780535677815",
        "file": "/assets/hero.ship.idle.promoted-1780535677815.png",
        "prompt": "Hero starfighter idle animation. Subtle hovering bob, cockpit glint, stable centered silhouette, transparent background.",
        "createdAt": "2026-06-04T01:14:37.836Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780535453778",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542772694": {
        "name": "promoted-1780542772694",
        "file": "/assets/hero.ship.idle.promoted-1780542772694.png",
        "prompt": "Hero starfighter idle animation. Subtle hovering bob, cockpit glint, stable centered silhouette, transparent background.",
        "createdAt": "2026-06-04T03:12:52.714Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780535677815",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "hero.ship.shooting": {
    "id": "hero.ship.shooting",
    "kind": "spritesheet",
    "prompt": "Hero starfighter shooting animation (without the actual laser being shot). Weapon charge, muzzle flash from the cannon at the top, recoil recovery, same ship identity, transparent background.",
    "dimensions": {
      "width": 256,
      "height": 256
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "hero.ship.shooting",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 12,
        "repeat": 0,
        "frameTimings": [
          {
            "delayMs": 70
          },
          {
            "delayMs": 70,
            "tag": "shoot"
          },
          {
            "delayMs": 90
          },
          {
            "delayMs": 90
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "hero.ship"
      ]
    },
    "activeVersion": "promoted-1780542959748",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/hero.ship.shooting.default.svg",
        "prompt": "Hero starfighter shooting animation. Weapon charge, muzzle flash from nose cannon, recoil recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-03T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780536687601": {
        "name": "promoted-1780536687601",
        "file": "/assets/hero.ship.shooting.promoted-1780536687601.png",
        "prompt": "Hero starfighter shooting animation (without the actual laser being shot). Weapon charge, muzzle flash from the cannon at the top, recoil recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-04T01:31:27.616Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542959748": {
        "name": "promoted-1780542959748",
        "file": "/assets/hero.ship.shooting.promoted-1780542959748.png",
        "prompt": "Hero starfighter shooting animation (without the actual laser being shot). Weapon charge, muzzle flash from the cannon at the top, recoil recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-04T03:15:59.799Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780536687601",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "hero.ship.hit": {
    "id": "hero.ship.hit",
    "kind": "spritesheet",
    "prompt": "Hero starfighter getting hit animation. Brief red shield sparks, flicker, impact recoil, then recovery, same ship identity, transparent background.",
    "dimensions": {
      "width": 384,
      "height": 256
    },
    "frameGrid": {
      "frameCount": 6,
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 3,
      "rows": 2
    },
    "animations": [
      {
        "key": "hero.ship.hit",
        "frames": [
          0,
          1,
          2,
          3,
          4,
          5
        ],
        "frameRate": 12,
        "repeat": 0
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "hero.ship"
      ]
    },
    "activeVersion": "promoted-1780543095703",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/hero.ship.hit.default.svg",
        "prompt": "Hero starfighter getting hit animation. Brief red shield sparks, flicker, impact recoil, then recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-03T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780536958079": {
        "name": "promoted-1780536958079",
        "file": "/assets/hero.ship.hit.promoted-1780536958079.png",
        "prompt": "Hero starfighter getting hit animation. Brief red shield sparks, flicker, impact recoil, then recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-04T01:35:58.108Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780543095703": {
        "name": "promoted-1780543095703",
        "file": "/assets/hero.ship.hit.promoted-1780543095703.png",
        "prompt": "Hero starfighter getting hit animation. Brief red shield sparks, flicker, impact recoil, then recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-04T03:18:15.725Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780536958079",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "hero.ship.moving-left": {
    "id": "hero.ship.moving-left",
    "kind": "spritesheet",
    "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
    "dimensions": {
      "width": 256,
      "height": 256
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 128,
      "frameHeight": 128,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "hero.ship.moving-left",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 10,
        "repeat": -1,
        "frameTimings": [
          {
            "delayMs": 50,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 50,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 50,
            "offsetX": 0,
            "offsetY": 0
          },
          {
            "delayMs": 2000,
            "offsetX": 0,
            "offsetY": 0
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "hero.ship"
      ]
    },
    "activeVersion": "promoted-1780543214092",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/hero.ship.moving-left.default.svg",
        "prompt": "Hero starfighter moving left animation. Slight banking tilt to the left, bright rear jets, energetic thrust, same ship identity, transparent background.",
        "createdAt": "2026-06-03T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780536121815": {
        "name": "promoted-1780536121815",
        "file": "/assets/hero.ship.moving.promoted-1780536121815.png",
        "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
        "createdAt": "2026-06-04T01:22:01.877Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780536722820": {
        "name": "promoted-1780536722820",
        "file": "/assets/hero.ship.moving.promoted-1780536722820.png",
        "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
        "createdAt": "2026-06-04T01:32:02.832Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780536121815",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780537093274": {
        "name": "promoted-1780537093274",
        "file": "/assets/hero.ship.moving.promoted-1780537093274.png",
        "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
        "createdAt": "2026-06-04T01:38:13.316Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780536722820",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780543214092": {
        "name": "promoted-1780543214092",
        "file": "/assets/hero.ship.moving-left.promoted-1780543214092.png",
        "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
        "createdAt": "2026-06-04T03:20:14.110Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "hero.ship"
          ]
        },
        "parentVersion": "promoted-1780537093274",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.space": {
    "id": "background.space",
    "kind": "image",
    "prompt": "Full-screen background for a 2D space invaders game. Deep outer space, readable but subdued behind gameplay, no text, no ships, no enemies and no stars.",
    "dimensions": {
      "width": 640,
      "height": 640
    },
    "settings": {
      "model": "gpt-image-2",
      "background": "opaque",
      "quality": "low",
      "format": "png"
    },
    "activeVersion": "promoted-1780545088449",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/background.space.default.svg",
        "prompt": "Full-screen background for a 2D space invaders game. Deep outer space, distant stars and planets, readable but subdued behind gameplay, no text, no ships, no enemies.",
        "createdAt": "2026-06-03T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780545088449": {
        "name": "promoted-1780545088449",
        "file": "/assets/background.space.promoted-1780545088449.png",
        "prompt": "Full-screen background for a 2D space invaders game. Deep outer space, readable but subdued behind gameplay, no text, no ships, no enemies and no stars.",
        "createdAt": "2026-06-04T03:51:28.487Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "opaque",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      }
    }
  }
}
, {
  "styleGuide": {
    "prompt": "Hand-painted 1990s cartoon adventure game background, exaggerated perspective, whimsical architecture, bright saturated colors, smooth ink outlines, highly expressive shapes, playful visual humor, stylized proportions, curved and distorted geometry, detailed environmental storytelling, clean cel-animation aesthetic, retro PC adventure game art, professionally illustrated, high detail, colorful and cheerful atmosphere.",
    "images": [
      {
        "name": "style.png",
        "file": "/assets/style-guide.1780542427743.1.png",
        "mimeType": "image/png"
      }
    ]
  }
}
);
