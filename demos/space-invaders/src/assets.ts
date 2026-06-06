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
  "invader.raider": {
    "id": "invader.raider",
    "kind": "image",
    "prompt": "Alien invader raider for a 2D space invaders game, readable silhouette, transparent background. bright green color.",
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
        "assetId": "invader.raider.idle"
      },
      "shooting": {
        "label": "Shooting",
        "assetId": "invader.raider.shooting"
      },
      "destroyed": {
        "label": "Destroyed",
        "assetId": "invader.raider.destroyed"
      }
    },
    "activeVersion": "promoted-1780781374574",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.raider.default.svg",
        "prompt": "Alien invader scout for a 2D space invaders game, neon beetle-like armor, readable silhouette, transparent background.",
        "createdAt": "2026-05-30T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780236988072": {
        "name": "promoted-1780236988072",
        "file": "/assets/invader.raider.promoted-1780236988072.png",
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
        "file": "/assets/invader.raider.promoted-1780250659533.png",
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
        "file": "/assets/invader.raider.promoted-1780250792117.png",
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
        "file": "/assets/invader.raider.promoted-1780541957309.png",
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
      },
      "promoted-1780781374574": {
        "name": "promoted-1780781374574",
        "file": "/assets/invader.raider.promoted-1780781374574.png",
        "prompt": "Alien invader raider for a 2D space invaders game, readable silhouette, transparent background. bright green color.",
        "createdAt": "2026-06-06T21:29:34.593Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780541957309",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.raider.idle": {
    "id": "invader.raider.idle",
    "kind": "spritesheet",
    "prompt": "Alien invader scout raider animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
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
        "key": "invader.raider.idle",
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
        "invader.raider"
      ]
    },
    "activeVersion": "promoted-1780781559194",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.raider.idle.default.svg",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-idle-1780239036123": {
        "name": "generated-idle-1780239036123",
        "file": "/assets/invader.raider.idle.generated-idle-1780239036123.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T14:50:36.150Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780250818107": {
        "name": "promoted-1780250818107",
        "file": "/assets/invader.raider.idle.promoted-1780250818107.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T18:06:58.161Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "generated-idle-1780239036123",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780365798285": {
        "name": "promoted-1780365798285",
        "file": "/assets/invader.raider.idle.promoted-1780365798285.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-02T02:03:18.315Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780250818107",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780447725139": {
        "name": "promoted-1780447725139",
        "file": "/assets/invader.raider.idle.promoted-1780447725139.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-03T00:48:45.159Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780365798285",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542126752": {
        "name": "promoted-1780542126752",
        "file": "/assets/invader.raider.idle.promoted-1780542126752.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-04T03:02:06.779Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780447725139",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780781559194": {
        "name": "promoted-1780781559194",
        "file": "/assets/invader.raider.idle.promoted-1780781559194.png",
        "prompt": "Alien invader scout raider animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-06T21:32:39.216Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780542126752",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.raider.shooting": {
    "id": "invader.raider.shooting",
    "kind": "spritesheet",
    "prompt": "shooting animation, the alien is turning around and shooting from its butt (should have a well defined butt) and then turns back, the laser itself should not be in the animation but a small spark from the butt when the shot starts",
    "dimensions": {
      "width": 256,
      "height": 192
    },
    "frameGrid": {
      "frameCount": 12,
      "frameWidth": 64,
      "frameHeight": 64,
      "columns": 4,
      "rows": 3
    },
    "animations": [
      {
        "key": "invader.raider.shooting",
        "frames": [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11
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
          },
          {},
          {},
          {},
          {}
        ]
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "invader.raider"
      ]
    },
    "activeVersion": "promoted-1780781825356",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.raider.shooting.default.svg",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-shooting-1780239052135": {
        "name": "generated-shooting-1780239052135",
        "file": "/assets/invader.raider.shooting.generated-shooting-1780239052135.png",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T14:50:52.158Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365025144": {
        "name": "promoted-1780365025144",
        "file": "/assets/invader.raider.shooting.promoted-1780365025144.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-02T01:50:25.177Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "generated-shooting-1780239052135",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450422695": {
        "name": "promoted-1780450422695",
        "file": "/assets/invader.raider.shooting.promoted-1780450422695.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T01:33:42.714Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780365025144",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780454683156": {
        "name": "promoted-1780454683156",
        "file": "/assets/invader.raider.shooting.promoted-1780454683156.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T02:44:43.169Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780450422695",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780456444685": {
        "name": "promoted-1780456444685",
        "file": "/assets/invader.raider.shooting.promoted-1780456444685.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T03:14:04.703Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780454683156",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542418532": {
        "name": "promoted-1780542418532",
        "file": "/assets/invader.raider.shooting.promoted-1780542418532.png",
        "prompt": "shooting animation, the alien is shooting to the bottom using its eye, the laser itself should not be in the animation but a small spark from the eye when the shot starts",
        "createdAt": "2026-06-04T03:06:58.549Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780456444685",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780781825356": {
        "name": "promoted-1780781825356",
        "file": "/assets/invader.raider.shooting.promoted-1780781825356.png",
        "prompt": "shooting animation, the alien is turning around and shooting from its butt (should have a well defined butt) and then turns back, the laser itself should not be in the animation but a small spark from the butt when the shot starts",
        "createdAt": "2026-06-06T21:37:05.366Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780542418532",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.raider.destroyed": {
    "id": "invader.raider.destroyed",
    "kind": "spritesheet",
    "prompt": "Alien invader raider destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
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
        "key": "invader.raider.destroyed",
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
        "invader.raider"
      ]
    },
    "activeVersion": "promoted-1780781981622",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.raider.destroyed.default.svg",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-destroyed-1780239070336": {
        "name": "generated-destroyed-1780239070336",
        "file": "/assets/invader.raider.destroyed.generated-destroyed-1780239070336.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T14:51:10.359Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365215588": {
        "name": "promoted-1780365215588",
        "file": "/assets/invader.raider.destroyed.promoted-1780365215588.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-02T01:53:35.619Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "generated-destroyed-1780239070336",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450920237": {
        "name": "promoted-1780450920237",
        "file": "/assets/invader.raider.destroyed.promoted-1780450920237.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-03T01:42:00.310Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780365215588",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542613732": {
        "name": "promoted-1780542613732",
        "file": "/assets/invader.raider.destroyed.promoted-1780542613732.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-04T03:10:13.745Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780450920237",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780781981622": {
        "name": "promoted-1780781981622",
        "file": "/assets/invader.raider.destroyed.promoted-1780781981622.png",
        "prompt": "Alien invader raider destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-06T21:39:41.642Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.raider"
          ]
        },
        "parentVersion": "promoted-1780542613732",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.hunter": {
    "id": "invader.hunter",
    "kind": "image",
    "prompt": "Alien invader hunter with scary claws for a 2D space invaders game, readable silhouette, transparent background. yellow color.",
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
        "assetId": "invader.hunter.idle"
      },
      "shooting": {
        "label": "Shooting",
        "assetId": "invader.hunter.shooting"
      },
      "destroyed": {
        "label": "Destroyed",
        "assetId": "invader.hunter.destroyed"
      }
    },
    "activeVersion": "promoted-1780782171885",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.hunter.default.svg",
        "prompt": "Alien invader scout for a 2D space invaders game, neon beetle-like armor, readable silhouette, transparent background.",
        "createdAt": "2026-05-30T00:00:00.000Z",
        "model": "starter-asset"
      },
      "promoted-1780236988072": {
        "name": "promoted-1780236988072",
        "file": "/assets/invader.hunter.promoted-1780236988072.png",
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
        "file": "/assets/invader.hunter.promoted-1780250659533.png",
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
        "file": "/assets/invader.hunter.promoted-1780250792117.png",
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
        "file": "/assets/invader.hunter.promoted-1780541957309.png",
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
      },
      "promoted-1780782171885": {
        "name": "promoted-1780782171885",
        "file": "/assets/invader.hunter.promoted-1780782171885.png",
        "prompt": "Alien invader hunter with scary claws for a 2D space invaders game, readable silhouette, transparent background. yellow color.",
        "createdAt": "2026-06-06T21:42:51.900Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png"
        },
        "parentVersion": "promoted-1780541957309",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.hunter.idle": {
    "id": "invader.hunter.idle",
    "kind": "spritesheet",
    "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, claws close and open, readable silhouette, transparent background.",
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
        "key": "invader.hunter.idle",
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
        "invader.hunter"
      ]
    },
    "activeVersion": "promoted-1780782339292",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.hunter.idle.default.svg",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-idle-1780239036123": {
        "name": "generated-idle-1780239036123",
        "file": "/assets/invader.hunter.idle.generated-idle-1780239036123.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T14:50:36.150Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780250818107": {
        "name": "promoted-1780250818107",
        "file": "/assets/invader.hunter.idle.promoted-1780250818107.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-05-31T18:06:58.161Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "generated-idle-1780239036123",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780365798285": {
        "name": "promoted-1780365798285",
        "file": "/assets/invader.hunter.idle.promoted-1780365798285.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-02T02:03:18.315Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780250818107",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780447725139": {
        "name": "promoted-1780447725139",
        "file": "/assets/invader.hunter.idle.promoted-1780447725139.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-03T00:48:45.159Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780365798285",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542126752": {
        "name": "promoted-1780542126752",
        "file": "/assets/invader.hunter.idle.promoted-1780542126752.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, readable silhouette, transparent background.",
        "createdAt": "2026-06-04T03:02:06.779Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780447725139",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780782339292": {
        "name": "promoted-1780782339292",
        "file": "/assets/invader.hunter.idle.promoted-1780782339292.png",
        "prompt": "Alien invader scout idle animation. Subtle hovering bob, antenna twitch, claws close and open, readable silhouette, transparent background.",
        "createdAt": "2026-06-06T21:45:39.380Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780542126752",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.hunter.shooting": {
    "id": "invader.hunter.shooting",
    "kind": "spritesheet",
    "prompt": "shooting animation, the alien looks down and shooting from its mouth, the laser itself should not be in the animation but a small spark from the mouth when the shot starts",
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
        "key": "invader.hunter.shooting",
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
        "invader.hunter"
      ]
    },
    "activeVersion": "promoted-1780782548529",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.hunter.shooting.default.svg",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-shooting-1780239052135": {
        "name": "generated-shooting-1780239052135",
        "file": "/assets/invader.hunter.shooting.generated-shooting-1780239052135.png",
        "prompt": "Alien invader scout shooting animation. Charge up, open mandibles, bright muzzle flash downward, recoil recovery, transparent background.",
        "createdAt": "2026-05-31T14:50:52.158Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365025144": {
        "name": "promoted-1780365025144",
        "file": "/assets/invader.hunter.shooting.promoted-1780365025144.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-02T01:50:25.177Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "generated-shooting-1780239052135",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450422695": {
        "name": "promoted-1780450422695",
        "file": "/assets/invader.hunter.shooting.promoted-1780450422695.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T01:33:42.714Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780365025144",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780454683156": {
        "name": "promoted-1780454683156",
        "file": "/assets/invader.hunter.shooting.promoted-1780454683156.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T02:44:43.169Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780450422695",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780456444685": {
        "name": "promoted-1780456444685",
        "file": "/assets/invader.hunter.shooting.promoted-1780456444685.png",
        "prompt": "shooting animation",
        "createdAt": "2026-06-03T03:14:04.703Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780454683156",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542418532": {
        "name": "promoted-1780542418532",
        "file": "/assets/invader.hunter.shooting.promoted-1780542418532.png",
        "prompt": "shooting animation, the alien is shooting to the bottom using its eye, the laser itself should not be in the animation but a small spark from the eye when the shot starts",
        "createdAt": "2026-06-04T03:06:58.549Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780456444685",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780782548529": {
        "name": "promoted-1780782548529",
        "file": "/assets/invader.hunter.shooting.promoted-1780782548529.png",
        "prompt": "shooting animation, the alien looks down and shooting from its mouth, the laser itself should not be in the animation but a small spark from the mouth when the shot starts",
        "createdAt": "2026-06-06T21:49:08.581Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780542418532",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "invader.hunter.destroyed": {
    "id": "invader.hunter.destroyed",
    "kind": "spritesheet",
    "prompt": "Alien invader hunter destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
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
        "key": "invader.hunter.destroyed",
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
        "invader.hunter"
      ]
    },
    "activeVersion": "promoted-1780782669591",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/invader.hunter.destroyed.default.svg",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T00:00:00.000Z",
        "model": "starter-asset"
      },
      "generated-destroyed-1780239070336": {
        "name": "generated-destroyed-1780239070336",
        "file": "/assets/invader.hunter.destroyed.generated-destroyed-1780239070336.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-05-31T14:51:10.359Z",
        "model": "gpt-image-1.5",
        "settings": {
          "model": "gpt-image-1.5",
          "background": "transparent",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "default",
        "notes": "Generated for the Space Invaders animation demo."
      },
      "promoted-1780365215588": {
        "name": "promoted-1780365215588",
        "file": "/assets/invader.hunter.destroyed.promoted-1780365215588.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-02T01:53:35.619Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "generated-destroyed-1780239070336",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780450920237": {
        "name": "promoted-1780450920237",
        "file": "/assets/invader.hunter.destroyed.promoted-1780450920237.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-03T01:42:00.310Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780365215588",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780542613732": {
        "name": "promoted-1780542613732",
        "file": "/assets/invader.hunter.destroyed.promoted-1780542613732.png",
        "prompt": "Alien invader scout destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-04T03:10:13.745Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780450920237",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780782669591": {
        "name": "promoted-1780782669591",
        "file": "/assets/invader.hunter.destroyed.promoted-1780782669591.png",
        "prompt": "Alien invader hunter destroyed animation. Cracking armor, energy burst, fragments dissolving, final smoke flicker, transparent background.",
        "createdAt": "2026-06-06T21:51:09.603Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "invader.hunter"
          ]
        },
        "parentVersion": "promoted-1780542613732",
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
        "repeat": 0,
        "frameTimings": [
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
          },
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
          },
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
          },
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
          },
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
          },
          {
            "delayMs": 83,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1,
            "scaleY": 1.2,
            "rotation": 0
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
    "activeVersion": "promoted-1780625268417",
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
      },
      "promoted-1780625268417": {
        "name": "promoted-1780625268417",
        "file": "/assets/hero.ship.hit.promoted-1780625268417.png",
        "prompt": "Hero starfighter getting hit animation. Brief red shield sparks, flicker, impact recoil, then recovery, same ship identity, transparent background.",
        "createdAt": "2026-06-05T02:07:48.431Z",
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
        "parentVersion": "promoted-1780543095703",
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
            "offsetY": 0,
            "scaleX": 1.1,
            "scaleY": 1.1,
            "rotation": 0
          },
          {
            "delayMs": 50,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1.1,
            "scaleY": 1.1,
            "rotation": 0
          },
          {
            "delayMs": 50,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1.1,
            "scaleY": 1.1,
            "rotation": 0
          },
          {
            "delayMs": 2000,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 1.1,
            "scaleY": 1.1,
            "rotation": 0
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
    "activeVersion": "promoted-1780625227073",
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
      },
      "promoted-1780625227073": {
        "name": "promoted-1780625227073",
        "file": "/assets/hero.ship.moving-left.promoted-1780625227073.png",
        "prompt": "Hero starfighter moving animation to the left. All of the frames should be with a slight tilt to the left (the front is the top of the spaceship), and the rear jets in bright yellow, transparent background.",
        "createdAt": "2026-06-05T02:07:07.130Z",
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
        "parentVersion": "promoted-1780543214092",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.stars": {
    "id": "background.stars",
    "kind": "collection",
    "prompt": "Animated background star variants for a 2D space invaders background.",
    "dimensions": {
      "width": 32,
      "height": 32
    },
    "linkedAnimationAssets": {
      "twinkle-white": {
        "label": "White twinkle",
        "assetId": "background.stars.twinkle-white"
      },
      "blue-pulse": {
        "label": "Blue pulse",
        "assetId": "background.stars.blue-pulse"
      },
      "gold-flare": {
        "label": "Gold flare",
        "assetId": "background.stars.gold-flare"
      },
      "violet-blink": {
        "label": "Violet blink",
        "assetId": "background.stars.violet-blink"
      },
      "green-shimmer": {
        "label": "Green shimmer",
        "assetId": "background.stars.green-shimmer"
      }
    },
    "activeVersion": "",
    "versions": {}
  },
  "background.stars.twinkle-white": {
    "id": "background.stars.twinkle-white",
    "kind": "spritesheet",
    "prompt": "White star twinkling animation for a 2D space invaders background.",
    "dimensions": {
      "width": 96,
      "height": 96
    },
    "frameGrid": {
      "frameWidth": 32,
      "frameHeight": 32,
      "columns": 3,
      "rows": 3,
      "frameCount": 8
    },
    "animations": [
      {
        "key": "background.stars.twinkle-white",
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
        "frameRate": 8,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "background.stars"
      ]
    },
    "activeVersion": "promoted-1780754791141",
    "versions": {
      "first-draft-1780702620989-1": {
        "name": "first-draft-1780702620989-1",
        "file": "/assets/background.stars.twinkle-white.first-draft-1780702620989-1.png",
        "prompt": "White star twinkling animation for a 2D space invaders background. Four-frame spritesheet, transparent background, same tiny star identity as the base reference.",
        "createdAt": "2026-06-05T23:37:00.991Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "notes": "Auto-generated first draft for a missing asset."
      },
      "promoted-1780754791141": {
        "name": "promoted-1780754791141",
        "file": "/assets/background.stars.twinkle-white.promoted-1780754791141.png",
        "prompt": "White star twinkling animation for a 2D space invaders background.",
        "createdAt": "2026-06-06T14:06:31.168Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "parentVersion": "first-draft-1780702620989-1",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.stars.blue-pulse": {
    "id": "background.stars.blue-pulse",
    "kind": "spritesheet",
    "prompt": "Blue star pulsing animation for a 2D space invaders background.",
    "dimensions": {
      "width": 96,
      "height": 96
    },
    "frameGrid": {
      "frameWidth": 32,
      "frameHeight": 32,
      "columns": 3,
      "rows": 3,
      "frameCount": 8
    },
    "animations": [
      {
        "key": "background.stars.blue-pulse",
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
        "frameRate": 7,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-image-2",
      "background": "auto",
      "quality": "low",
      "format": "png",
      "referenceAssetIds": [
        "background.stars"
      ]
    },
    "activeVersion": "promoted-1780754968149",
    "versions": {
      "first-draft-1780702642169-2": {
        "name": "first-draft-1780702642169-2",
        "file": "/assets/background.stars.blue-pulse.first-draft-1780702642169-2.png",
        "prompt": "Blue star pulsing animation for a 2D space invaders background. Four-frame spritesheet, transparent background, same tiny star identity as the base reference.",
        "createdAt": "2026-06-05T23:37:22.172Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "notes": "Auto-generated first draft for a missing asset."
      },
      "promoted-1780754968149": {
        "name": "promoted-1780754968149",
        "file": "/assets/background.stars.blue-pulse.promoted-1780754968149.png",
        "prompt": "Blue star pulsing animation for a 2D space invaders background.",
        "createdAt": "2026-06-06T14:09:28.170Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "parentVersion": "first-draft-1780702642169-2",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.stars.gold-flare": {
    "id": "background.stars.gold-flare",
    "kind": "spritesheet",
    "prompt": "Gold star flare animation for a 2D space invaders background.",
    "dimensions": {
      "width": 96,
      "height": 96
    },
    "frameGrid": {
      "frameWidth": 32,
      "frameHeight": 32,
      "columns": 3,
      "rows": 3,
      "frameCount": 8
    },
    "animations": [
      {
        "key": "background.stars.gold-flare",
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
        "frameRate": 9,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "background.stars"
      ]
    },
    "activeVersion": "promoted-1780758884737",
    "versions": {
      "first-draft-1780702665912-3": {
        "name": "first-draft-1780702665912-3",
        "file": "/assets/background.stars.gold-flare.first-draft-1780702665912-3.png",
        "prompt": "Gold star flare animation for a 2D space invaders background. Four-frame spritesheet, transparent background, same tiny star identity as the base reference.",
        "createdAt": "2026-06-05T23:37:45.914Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "notes": "Auto-generated first draft for a missing asset."
      },
      "promoted-1780758884737": {
        "name": "promoted-1780758884737",
        "file": "/assets/background.stars.gold-flare.promoted-1780758884737.svg",
        "prompt": "Gold star flare animation for a 2D space invaders background.",
        "createdAt": "2026-06-06T15:14:44.755Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "parentVersion": "first-draft-1780702665912-3",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.stars.violet-blink": {
    "id": "background.stars.violet-blink",
    "kind": "spritesheet",
    "prompt": "Violet star blinking animation for a 2D space invaders background.",
    "dimensions": {
      "width": 96,
      "height": 96
    },
    "frameGrid": {
      "frameWidth": 32,
      "frameHeight": 32,
      "columns": 3,
      "rows": 3,
      "frameCount": 8
    },
    "animations": [
      {
        "key": "background.stars.violet-blink",
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
        "frameRate": 6,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "background.stars"
      ]
    },
    "activeVersion": "promoted-1780759263994",
    "versions": {
      "first-draft-1780702686733-4": {
        "name": "first-draft-1780702686733-4",
        "file": "/assets/background.stars.violet-blink.first-draft-1780702686733-4.png",
        "prompt": "Violet star blinking animation for a 2D space invaders background. Four-frame spritesheet, transparent background, same tiny star identity as the base reference.",
        "createdAt": "2026-06-05T23:38:06.736Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "notes": "Auto-generated first draft for a missing asset."
      },
      "promoted-1780759263994": {
        "name": "promoted-1780759263994",
        "file": "/assets/background.stars.violet-blink.promoted-1780759263994.svg",
        "prompt": "Violet star blinking animation for a 2D space invaders background.",
        "createdAt": "2026-06-06T15:21:04.014Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "parentVersion": "first-draft-1780702686733-4",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "background.stars.green-shimmer": {
    "id": "background.stars.green-shimmer",
    "kind": "spritesheet",
    "prompt": "Green star shimmering animation for a 2D space invaders background.",
    "dimensions": {
      "width": 96,
      "height": 96
    },
    "frameGrid": {
      "frameWidth": 32,
      "frameHeight": 32,
      "columns": 3,
      "rows": 3,
      "frameCount": 8
    },
    "animations": [
      {
        "key": "background.stars.green-shimmer",
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
        "frameRate": 8,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "background.stars"
      ]
    },
    "activeVersion": "promoted-1780759689599",
    "versions": {
      "first-draft-1780702708075-5": {
        "name": "first-draft-1780702708075-5",
        "file": "/assets/background.stars.green-shimmer.first-draft-1780702708075-5.png",
        "prompt": "Green star shimmering animation for a 2D space invaders background. Four-frame spritesheet, transparent background, same tiny star identity as the base reference.",
        "createdAt": "2026-06-05T23:38:28.076Z",
        "model": "gpt-image-2",
        "settings": {
          "model": "gpt-image-2",
          "background": "auto",
          "quality": "low",
          "format": "png",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "notes": "Auto-generated first draft for a missing asset."
      },
      "promoted-1780759689599": {
        "name": "promoted-1780759689599",
        "file": "/assets/background.stars.green-shimmer.promoted-1780759689599.svg",
        "prompt": "Green star shimmering animation for a 2D space invaders background.",
        "createdAt": "2026-06-06T15:28:09.621Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "background.stars"
          ]
        },
        "parentVersion": "first-draft-1780702708075-5",
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
  },
  "laser.blue": {
    "id": "laser.blue",
    "kind": "image",
    "prompt": "Blue player laser bolt for a 2D space invaders game, thin bright vertical beam, transparent background.",
    "dimensions": {
      "width": 4,
      "height": 18
    },
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg"
    },
    "linkedAnimationAssets": {
      "flicker": {
        "label": "Slow flicker",
        "assetId": "laser.blue.flicker"
      },
      "hit": {
        "label": "Laser hit",
        "assetId": "laser.blue.hit"
      }
    },
    "activeVersion": "default",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.blue.default.svg",
        "prompt": "Blue player laser bolt for a 2D space invaders game, thin bright vertical beam, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg"
        }
      }
    }
  },
  "laser.blue.flicker": {
    "id": "laser.blue.flicker",
    "kind": "spritesheet",
    "prompt": "Blue player laser slow glow animation. Thin bright vertical laser beam, pulsing core, transparent background.",
    "dimensions": {
      "width": 8,
      "height": 36
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 4,
      "frameHeight": 18,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "laser.blue.flicker",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 8,
        "repeat": -1
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "laser.blue"
      ]
    },
    "activeVersion": "promoted-1780761577431",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.blue.flicker.default.svg",
        "prompt": "Blue player laser slow flicker animation. Thin bright vertical laser beam, pulsing core, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        }
      },
      "promoted-1780761577431": {
        "name": "promoted-1780761577431",
        "file": "/assets/laser.blue.flicker.promoted-1780761577431.svg",
        "prompt": "Blue player laser slow glow animation. Thin bright vertical laser beam, pulsing core, transparent background.",
        "createdAt": "2026-06-06T15:59:37.481Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "laser.blue.hit": {
    "id": "laser.blue.hit",
    "kind": "spritesheet",
    "prompt": "Blue player laser hit animation. Small electric impact spark where the laser hits at the top, transparent background.",
    "dimensions": {
      "width": 36,
      "height": 36
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 18,
      "frameHeight": 18,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "laser.blue.hit",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 8,
        "repeat": 0,
        "frameTimings": [
          {
            "delayMs": 110,
            "offsetX": 0,
            "offsetY": -5,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0
          },
          {
            "delayMs": 130,
            "offsetX": 0,
            "offsetY": -5,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0
          },
          {
            "delayMs": 130,
            "offsetX": 0,
            "offsetY": -5,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0
          },
          {
            "delayMs": 130,
            "offsetX": 0,
            "offsetY": -5,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "laser.blue"
      ]
    },
    "activeVersion": "promoted-1780778373125",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.blue.hit.default.svg",
        "prompt": "Blue player laser hit animation. Small electric impact spark where the laser hits at the top, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        }
      },
      "promoted-1780768681503": {
        "name": "promoted-1780768681503",
        "file": "/assets/laser.blue.hit.promoted-1780768681503.svg",
        "prompt": "Blue player laser hit animation. Small electric impact spark where the laser hits at the top, transparent background.",
        "createdAt": "2026-06-06T17:58:01.539Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780778333620": {
        "name": "promoted-1780778333620",
        "file": "/assets/laser.blue.hit.promoted-1780778333620.svg",
        "prompt": "Blue player laser hit animation. Small electric impact spark where the laser hits at the top, transparent background.",
        "createdAt": "2026-06-06T20:38:53.657Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        },
        "parentVersion": "promoted-1780768681503",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780778373125": {
        "name": "promoted-1780778373125",
        "file": "/assets/laser.blue.hit.promoted-1780778373125.svg",
        "prompt": "Blue player laser hit animation. Small electric impact spark where the laser hits at the top, transparent background.",
        "createdAt": "2026-06-06T20:39:33.137Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.blue"
          ]
        },
        "parentVersion": "promoted-1780778333620",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "laser.red": {
    "id": "laser.red",
    "kind": "image",
    "prompt": "Red enemy laser bolt for a 2D space invaders game, thin bright vertical beam, transparent background.",
    "dimensions": {
      "width": 5,
      "height": 16
    },
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg"
    },
    "linkedAnimationAssets": {
      "flicker": {
        "label": "Slow flicker",
        "assetId": "laser.red.flicker"
      },
      "hit": {
        "label": "Laser hit",
        "assetId": "laser.red.hit"
      }
    },
    "activeVersion": "default",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.red.default.svg",
        "prompt": "Red enemy laser bolt for a 2D space invaders game, thin bright vertical beam, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg"
        }
      }
    }
  },
  "laser.red.flicker": {
    "id": "laser.red.flicker",
    "kind": "spritesheet",
    "prompt": "Red enemy laser slow glow animation. Thin bright vertical laser beam, pulsing core, transparent background.",
    "dimensions": {
      "width": 10,
      "height": 32
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 5,
      "frameHeight": 16,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "laser.red.flicker",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 8,
        "repeat": -1,
        "frameTimings": [
          {
            "delayMs": 125,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 2,
            "scaleY": 1.5,
            "rotation": 0
          },
          {
            "delayMs": 125,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 2,
            "scaleY": 1.5,
            "rotation": 0
          },
          {
            "delayMs": 125,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 2,
            "scaleY": 1.5,
            "rotation": 0
          },
          {
            "delayMs": 125,
            "offsetX": 0,
            "offsetY": 0,
            "scaleX": 2,
            "scaleY": 1.5,
            "rotation": 0
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "laser.red"
      ]
    },
    "activeVersion": "promoted-1780778436408",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.red.flicker.default.svg",
        "prompt": "Red enemy laser slow flicker animation. Thin bright vertical laser beam, pulsing core, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.red"
          ]
        }
      },
      "promoted-1780770882406": {
        "name": "promoted-1780770882406",
        "file": "/assets/laser.red.flicker.promoted-1780770882406.svg",
        "prompt": "Red enemy laser slow glow animation. Thin bright vertical laser beam, pulsing core, transparent background.",
        "createdAt": "2026-06-06T18:34:42.423Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.red"
          ]
        },
        "parentVersion": "default",
        "notes": "Promoted from the AI asset designer."
      },
      "promoted-1780778436408": {
        "name": "promoted-1780778436408",
        "file": "/assets/laser.red.flicker.promoted-1780778436408.svg",
        "prompt": "Red enemy laser slow glow animation. Thin bright vertical laser beam, pulsing core, transparent background.",
        "createdAt": "2026-06-06T20:40:36.417Z",
        "model": "gpt-5",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.red"
          ]
        },
        "parentVersion": "promoted-1780770882406",
        "notes": "Promoted from the AI asset designer."
      }
    }
  },
  "laser.red.hit": {
    "id": "laser.red.hit",
    "kind": "spritesheet",
    "prompt": "Red enemy laser hit animation. Small hot impact spark where the laser hits at the bottom, transparent background.",
    "dimensions": {
      "width": 36,
      "height": 36
    },
    "frameGrid": {
      "frameCount": 4,
      "frameWidth": 18,
      "frameHeight": 18,
      "columns": 2,
      "rows": 2
    },
    "animations": [
      {
        "key": "laser.red.hit",
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frameRate": 8,
        "repeat": 0,
        "frameTimings": [
          {
            "delayMs": 110
          },
          {
            "delayMs": 130
          },
          {
            "delayMs": 130
          },
          {
            "delayMs": 130
          }
        ]
      }
    ],
    "settings": {
      "model": "gpt-5",
      "background": "auto",
      "quality": "low",
      "format": "svg",
      "referenceAssetIds": [
        "laser.red"
      ]
    },
    "activeVersion": "default",
    "versions": {
      "default": {
        "name": "default",
        "file": "/assets/laser.red.hit.default.svg",
        "prompt": "Red enemy laser hit animation. Small hot impact spark where the laser hits at the bottom, transparent background.",
        "createdAt": "2026-06-06T00:00:00.000Z",
        "model": "starter-asset",
        "settings": {
          "model": "gpt-5",
          "background": "auto",
          "quality": "low",
          "format": "svg",
          "referenceAssetIds": [
            "laser.red"
          ]
        }
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
