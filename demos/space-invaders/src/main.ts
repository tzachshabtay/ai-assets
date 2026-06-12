import Phaser from "phaser";
import {
  AiAssetDebugClient,
  AiAssetRuntime,
  applyAiAnimationFrameTransform,
  bindAiAnimationFrameTransforms,
  createAiAnimations,
  installAiAssetDesigner,
  loadAiAudioAssets,
  loadAiAssets,
} from "@ai-game-assets/phaser";
import type {
  AiAssetAnimation,
  AiAssetDefinition,
  AiAssetManifest
} from "@ai-game-assets/core";

const assetApi =
  new URLSearchParams(window.location.search).get("assetApi") ??
  "http://127.0.0.1:3977";
const debugClient = new AiAssetDebugClient(assetApi);

type DemoScene = Phaser.Scene & {
  aiRuntime?: AiAssetRuntime;
  background?: Phaser.GameObjects.Image;
  hero?: Phaser.GameObjects.Sprite;
  invaders?: Phaser.GameObjects.Sprite[];
  applyAssetTexture?: (assetId: string, textureKey: string, asset: AiAssetDefinition) => void;
};

type StarSprite = Phaser.GameObjects.Sprite & {
  starSpeed: number;
  starAnimationKey: string;
};

type InvaderType = {
  base: string;
  idle: string;
  shooting: string;
  destroyed: string;
  celebration: string;
};

type InvaderSprite = Phaser.GameObjects.Sprite & {
  invaderType: InvaderType;
};

type LaserSprite = Phaser.GameObjects.Sprite;

const invaderTypes: InvaderType[] = [
  {
    base: "invader.scout",
    idle: "invader.scout.idle",
    shooting: "invader.scout.shooting",
    destroyed: "invader.scout.destroyed",
    celebration: "invader.scout.celebration"
  },
  {
    base: "invader.raider",
    idle: "invader.raider.idle",
    shooting: "invader.raider.shooting",
    destroyed: "invader.raider.destroyed",
    celebration: "invader.raider.celebration"
  },
  {
    base: "invader.hunter",
    idle: "invader.hunter.idle",
    shooting: "invader.hunter.shooting",
    destroyed: "invader.hunter.destroyed",
    celebration: "invader.hunter.celebration"
  }
];

const invaderBaseAssetIds = invaderTypes.map((type) => type.base);
const invaderAnimationAssetIds = invaderTypes.flatMap((type) => [
  type.idle,
  type.shooting,
  type.destroyed,
  type.celebration
]);

const starAnimationAssetIds = [
  "background.stars.twinkle-white",
  "background.stars.blue-pulse",
  "background.stars.gold-flare",
  "background.stars.violet-blink",
  "background.stars.green-shimmer"
];

const laserAnimationAssetIds = [
  "laser.blue.flicker",
  "laser.blue.hit",
  "laser.red.flicker",
  "laser.red.hit"
];

const uiAnimationAssetIds = [
  "ui.button.idle",
  "ui.button.hover",
  "ui.button.clicked"
];

const playerLaserSfxAssetId = "audio.sfx.player-laser";
const invaderExplosionSfxAssetId = "audio.sfx.invader-explosion";
const alienLaserSfxAssetId = "audio.sfx.alien-laser";
const heroHitSfxAssetId = "audio.sfx.hero-hit";
const heroExplosionSfxAssetId = "audio.sfx.hero-explosion";
const gameOverSfxAssetId = "audio.sfx.game-over";

const laserHitDisplaySizes: Record<string, { width: number; height: number }> = {
  "laser.blue.hit": { width: 18, height: 18 },
  "laser.red.hit": { width: 18, height: 18 }
};
const maxHeroLives = 5;
const heroLifeIconSize = 30;
const heroLifeIconSpacing = 34;
const invaderHeroReachPadding = 8;
const invaderBaseSpeed = 42;
const invaderWaveSpeedIncrease = 0.3;
const invaderLaserBaseSpeed = 210;
const invaderLaserWaveSpeedIncrease = 0.125;
const menuButtonSize = { width: 190, height: 58 };
const menuPanelSize = { width: 400, height: 400 };
const menuTitleY = -144;
const menuSingleButtonY = -54;
const menuPauseResumeButtonY = -70;
const menuPauseNewGameButtonY = -8;
const menuVolumeSlider = { y: 72, width: 190 };

let manifest: AiAssetManifest;
let sceneRef: DemoScene | undefined;

function loadMasterVolume(): number {
  const stored = globalThis.localStorage?.getItem("ai-assets-invaders.master-volume");
  const value = stored === null || stored === undefined ? 1 : Number(stored);

  return Number.isFinite(value) ? Phaser.Math.Clamp(value, 0, 1) : 1;
}

function saveMasterVolume(volume: number): void {
  globalThis.localStorage?.setItem(
    "ai-assets-invaders.master-volume",
    String(Phaser.Math.Clamp(volume, 0, 1))
  );
}

async function boot(): Promise<void> {
  manifest = await debugClient.getManifest();
  startGame(manifest);
}

function startGame(assetManifest: AiAssetManifest): void {
  class SpaceInvadersScene extends Phaser.Scene {
    aiRuntime?: AiAssetRuntime;
    background?: Phaser.GameObjects.Image;
    hero?: Phaser.GameObjects.Sprite;
    invaders: InvaderSprite[] = [];
    applyAssetTexture?: (assetId: string, textureKey: string, asset: AiAssetDefinition) => void;

    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private fireKey?: Phaser.Input.Keyboard.Key;
    private escapeKey?: Phaser.Input.Keyboard.Key;
    private bullets: LaserSprite[] = [];
    private invaderBullets: LaserSprite[] = [];
    private lastShotAt = 0;
    private invaderDirection = 1;
    private waveIndex = 0;
    private lastInvaderShotAt = 0;
    private score = 0;
    private heroLives = maxHeroLives;
    private gameActive = false;
    private heroDestroyed = false;
    private invadersCelebrating = false;
    private heroLifeSilhouettes: Phaser.GameObjects.Image[] = [];
    private heroLifeIcons: Phaser.GameObjects.Image[] = [];
    private scoreText?: Phaser.GameObjects.Text;
    private statusText?: Phaser.GameObjects.Text;
    private menuContainer?: Phaser.GameObjects.Container;
    private menuPanel?: Phaser.GameObjects.Image;
    private menuTitle?: Phaser.GameObjects.Text;
    private menuVolumeLabel?: Phaser.GameObjects.Text;
    private menuVolumeValue?: Phaser.GameObjects.Text;
    private menuVolumeTrack?: Phaser.GameObjects.Rectangle;
    private menuVolumeFill?: Phaser.GameObjects.Rectangle;
    private menuVolumeKnob?: Phaser.GameObjects.Ellipse;
    private newGameButton?: Phaser.GameObjects.Sprite;
    private newGameButtonText?: Phaser.GameObjects.Text;
    private resumeButton?: Phaser.GameObjects.Sprite;
    private resumeButtonText?: Phaser.GameObjects.Text;
    private newGameButtonState: "idle" | "hover" | "clicked" = "idle";
    private resumeButtonState: "idle" | "hover" | "clicked" = "idle";
    private isPaused = false;
    private isDraggingVolume = false;
    private masterVolume = loadMasterVolume();
    private heroAnimationSizes = new Map<string, { width: number; height: number }>();
    private heroAnimations = new Map<string, AiAssetAnimation>();
    private heroAnimationKey?: string;
    private heroLockedUntil = 0;
    private heroFrameTransformHandler?: (...args: unknown[]) => void;
    private audioPlaybackOverrides = new Map<string, AiAssetDefinition["audioPlayback"]>();
    private invaderAnimationSizes = new Map<string, { width: number; height: number }>();
    private invaderAnimations = new Map<string, AiAssetAnimation>();
    private invaderAnimationKeys = new WeakMap<Phaser.GameObjects.Sprite, string>();
    private invaderFrameOffsetHandlers = new WeakMap<
      Phaser.GameObjects.Sprite,
      (...args: unknown[]) => void
    >();
    private starSprites: StarSprite[] = [];
    private starAnimationKeys: string[] = [];
    private pixelCollisionLocalPoint = new Phaser.Math.Vector2();

    constructor() {
      super("space-invaders");
    }

    preload() {
      loadAiAssets(this, assetManifest);
      loadAiAudioAssets(this, assetManifest);
    }

    create() {
      sceneRef = this;
      this.aiRuntime = new AiAssetRuntime(this, assetManifest);
      createAiAnimations(this, assetManifest, "hero.ship.idle");
      createAiAnimations(this, assetManifest, "hero.ship.moving-left");
      createAiAnimations(this, assetManifest, "hero.ship.shooting");
      createAiAnimations(this, assetManifest, "hero.ship.hit");
      createAiAnimations(this, assetManifest, "hero.ship.explosion");
      for (const assetId of starAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      for (const assetId of laserAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      for (const assetId of uiAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      for (const assetId of invaderAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.idle"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.moving-left"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.shooting"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.hit"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.explosion"]);
      for (const assetId of invaderAnimationAssetIds) {
        this.registerInvaderAnimationSize(assetManifest.assets[assetId]);
      }
      this.cursors = this.input.keyboard?.createCursorKeys();
      this.fireKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.sound.volume = this.masterVolume;

      this.add.rectangle(320, 320, 640, 640, 0x10131a).setDepth(-100);
      this.background = this.add.image(320, 320, this.aiRuntime.key("background.space"));
      this.background.setDisplaySize(640, 640).setDepth(-90);
      this.starAnimationKeys = this.resolveStarAnimationKeys();
      this.spawnStars();
      this.add.text(18, 14, "AI Assets Invaders", {
        color: "#f8fafc",
        fontSize: "20px"
      });
      this.scoreText = this.add.text(18, 42, "Score 0", {
        color: "#b9c1cf",
        fontSize: "15px"
      });
      this.statusText = this.add.text(210, 42, "Move: arrows  Fire: space", {
        color: "#b9c1cf",
        fontSize: "15px"
      });

      this.startNewGame(false);
      this.createGameMenu("AI Assets Invaders");

      this.applyAssetTexture = (assetId, textureKey, asset) => {
        assetManifest.assets[assetId] = asset;

        if (asset.kind === "sound" || asset.kind === "music") {
          this.audioPlaybackOverrides.set(assetId, asset.audioPlayback);
          this.refreshAudioAsset(assetId, textureKey);
          return;
        }

        if (assetId === "background.space" && this.background) {
          this.background.setTexture(textureKey);
          this.background.setDisplaySize(640, 640);
        }

        if (starAnimationAssetIds.includes(assetId)) {
          this.recreateStarAnimations(assetId, textureKey, asset);
          this.applyStarTexture(assetId, textureKey);
        }

        if (laserAnimationAssetIds.includes(assetId)) {
          this.recreateLaserAnimations(assetId, textureKey, asset);
        }

        if (assetId === "ui.panel" && this.menuPanel) {
          this.menuPanel.setTexture(textureKey);
          this.menuPanel.setDisplaySize(menuPanelSize.width, menuPanelSize.height);
        }

        if (assetId === "ui.button" && this.newGameButton) {
          this.newGameButton.setTexture(textureKey);
          this.newGameButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
        }
        if (assetId === "ui.button" && this.resumeButton) {
          this.resumeButton.setTexture(textureKey);
          this.resumeButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
        }

        if (uiAnimationAssetIds.includes(assetId)) {
          this.recreateUiAnimations(assetId, textureKey, asset);

          if (assetId === `ui.button.${this.newGameButtonState}`) {
            this.playNewGameButtonAnimation(this.newGameButtonState);
          }
          if (assetId === `ui.button.${this.resumeButtonState}`) {
            this.playResumeButtonAnimation(this.resumeButtonState);
          }
        }

        if (assetId === "hero.ship" && this.hero) {
          this.heroAnimationKey = undefined;
          this.hero.setTexture(textureKey);
          this.applyDisplaySize(this.hero, asset);
          this.updateHeroLifeBarTexture(textureKey);
        }

        if (assetId.startsWith("hero.ship.")) {
          this.recreateHeroAnimations(assetId, textureKey, asset);

          if (this.heroAnimationKey === assetId) {
            this.playHeroAnimation(assetId, true);
          }
        }

        if (invaderAnimationAssetIds.includes(assetId)) {
          this.recreateInvaderAnimations(assetId, textureKey, asset);
          for (const invader of this.invaders ?? []) {
            const currentAnimationKey = this.invaderAnimationKeys.get(invader);

            if (currentAnimationKey === assetId) {
              this.playInvaderAnimation(invader, assetId);
            }
          }
        }
      };

      installAiAssetDesigner({
        scene: this,
        manifest: assetManifest,
        client: debugClient,
        assetIds: [
          "hero.ship",
          ...invaderBaseAssetIds,
          "laser.blue",
          "laser.red",
          "background.space",
          "background.stars",
          "ui.panel",
          "ui.button",
          "audio.sfx.player-laser",
          "audio.sfx.invader-explosion",
          "audio.sfx.alien-laser",
          "audio.sfx.hero-hit",
          "audio.sfx.hero-explosion",
          "audio.sfx.game-over",
          "audio.music.menu"
        ],
        onManifestUpdated: (updatedManifest) => {
          manifest = updatedManifest;
          Object.assign(assetManifest.assets, updatedManifest.assets);
        },
        previewDisplaySize: {
          "hero.ship": { width: 54, height: 54 },
          "hero.ship.idle": { width: 54, height: 54 },
          "hero.ship.moving-left": { width: 54, height: 54 },
          "hero.ship.shooting": { width: 54, height: 54 },
          "hero.ship.hit": { width: 54, height: 54 },
          "hero.ship.explosion": { width: 54, height: 54 },
          "invader.scout": { width: 42, height: 42 },
          "invader.scout.idle": { width: 42, height: 42 },
          "invader.scout.shooting": { width: 42, height: 42 },
          "invader.scout.destroyed": { width: 42, height: 42 },
          "invader.scout.celebration": { width: 42, height: 42 },
          "invader.raider": { width: 42, height: 42 },
          "invader.raider.idle": { width: 42, height: 42 },
          "invader.raider.shooting": { width: 42, height: 42 },
          "invader.raider.destroyed": { width: 42, height: 42 },
          "invader.raider.celebration": { width: 42, height: 42 },
          "invader.hunter": { width: 42, height: 42 },
          "invader.hunter.idle": { width: 42, height: 42 },
          "invader.hunter.shooting": { width: 42, height: 42 },
          "invader.hunter.destroyed": { width: 42, height: 42 },
          "invader.hunter.celebration": { width: 42, height: 42 },
          "laser.blue": { width: 4, height: 18 },
          "laser.blue.flicker": { width: 4, height: 18 },
          "laser.blue.hit": { width: 18, height: 18 },
          "laser.red": { width: 5, height: 16 },
          "laser.red.flicker": { width: 5, height: 16 },
          "laser.red.hit": { width: 18, height: 18 },
          "ui.panel": { width: 180, height: 115 },
          "ui.button": { width: 190, height: 58 },
          "ui.button.idle": { width: 190, height: 58 },
          "ui.button.hover": { width: 190, height: 58 },
          "ui.button.clicked": { width: 190, height: 58 },
          "background.space": { width: 180, height: 180 },
          "background.stars": { width: 32, height: 32 },
          "background.stars.twinkle-white": { width: 32, height: 32 },
          "background.stars.blue-pulse": { width: 32, height: 32 },
          "background.stars.gold-flare": { width: 32, height: 32 },
          "background.stars.violet-blink": { width: 32, height: 32 },
          "background.stars.green-shimmer": { width: 32, height: 32 }
        },
        onPreview: (assetId, textureKey, asset) => {
          this.applyAssetTexture?.(assetId, textureKey, asset);
        },
        onAssetReady: (assetId, textureKey, asset) => {
          this.applyAssetTexture?.(assetId, textureKey, asset);
        }
      });
    }

    update(time: number, delta: number) {
      if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
        if (this.isPaused) {
          this.resumeGame();
        } else if (this.gameActive) {
          this.showPauseMenu();
        }
      }

      if (this.isPaused) return;

      this.updateStars(delta);
      if (!this.gameActive) return;

      this.updateHero(delta);
      this.updateBullets(delta);
      this.updateInvaders(delta, time);
      this.updateCollisions();
    }

    private updateHero(delta: number) {
      if (!this.hero || !this.cursors) return;
      if (this.heroDestroyed) return;
      if (this.input.keyboard && !this.input.keyboard.enabled) return;

      const speed = 280 * (delta / 1000);
      const isMovingLeft = this.cursors.left.isDown;
      const isMovingRight = this.cursors.right.isDown;
      const isMoving = isMovingLeft || isMovingRight;

      if (isMovingLeft) this.hero.x -= speed;
      if (isMovingRight) this.hero.x += speed;
      this.hero.x = Phaser.Math.Clamp(this.hero.x, 32, 608);

      if (this.fireKey?.isDown && this.time.now - this.lastShotAt > 220) {
        this.lastShotAt = this.time.now;
        this.playHeroActionAnimation("hero.ship.shooting");
        this.scheduleHeroLaser("hero.ship.shooting");
      }

      if (this.time.now >= this.heroLockedUntil) {
        this.hero.setFlipX(isMovingRight && !isMovingLeft);
        this.playHeroAnimation(isMoving ? "hero.ship.moving-left" : "hero.ship.idle");
      }
    }

    private updateBullets(delta: number) {
      const playerStep = 460 * (delta / 1000);
      const enemyLaserSpeedMultiplier = 1 + (this.waveIndex * invaderLaserWaveSpeedIncrease);
      const enemyStep = invaderLaserBaseSpeed * enemyLaserSpeedMultiplier * (delta / 1000);

      for (const bullet of this.bullets) bullet.y -= playerStep;
      for (const bullet of this.invaderBullets) bullet.y += enemyStep;

      this.bullets = this.bullets.filter((bullet) => keepBullet(bullet));
      this.invaderBullets = this.invaderBullets.filter((bullet) => keepBullet(bullet));
    }

    private updateInvaders(delta: number, time: number) {
      if (!this.invaders || this.invaders.length === 0) return;
      if (this.invadersCelebrating) return;

      const step = invaderBaseSpeed * this.invaderSpeedMultiplier() * (delta / 1000) * this.invaderDirection;

      for (const invader of this.invaders) {
        invader.x += step;
      }

      this.correctInvaderEdgeHit();
      this.checkInvadersReachedHero();

      if (this.invaders.some((invader) => invader.y > 625)) {
        this.resetWave("Invaders regrouped.");
        return;
      }

      if (time - this.lastInvaderShotAt > 780) {
        this.lastInvaderShotAt = time;
        const shooter = Phaser.Utils.Array.GetRandom(this.invaders) as InvaderSprite;
        this.playInvaderAnimation(shooter, shooter.invaderType.shooting);
        this.scheduleInvaderLaser(shooter, shooter.invaderType.shooting);
        shooter.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (shooter.active && !this.invadersCelebrating) {
            this.playInvaderAnimation(shooter, shooter.invaderType.idle);
          }
        });
      }
    }

    private correctInvaderEdgeHit(): void {
      const formationBounds = this.invaderFormationBounds();
      const leftLimit = 24;
      const rightLimit = 616;
      let correctionX = 0;

      if (formationBounds.left < leftLimit) {
        correctionX = leftLimit - formationBounds.left;
        this.invaderDirection = 1;
      } else if (formationBounds.right > rightLimit) {
        correctionX = rightLimit - formationBounds.right;
        this.invaderDirection = -1;
      }

      if (correctionX === 0) return;

      for (const invader of this.invaders) {
        invader.x += correctionX;
        invader.y += 14;
      }
    }

    private invaderSpeedMultiplier(): number {
      return 1 + (this.waveIndex * invaderWaveSpeedIncrease);
    }

    private invaderFormationBounds(): Phaser.Geom.Rectangle {
      const bounds = this.invaders[0].getBounds();

      for (const invader of this.invaders.slice(1)) {
        Phaser.Geom.Rectangle.MergeRect(bounds, invader.getBounds());
      }

      return bounds;
    }

    private updateCollisions() {
      if (!this.hero || !this.invaders) return;

      for (const bullet of [...this.bullets]) {
        for (const invader of [...this.invaders]) {
          const collisionPoint = this.pixelCollisionPoint(bullet, invader);

          if (collisionPoint) {
            this.bullets = this.bullets.filter((candidate) => candidate !== bullet);
            this.invaders = this.invaders.filter((candidate) => candidate !== invader);
            bullet.destroy();
            this.spawnLaserHit("laser.blue.hit", collisionPoint.x, collisionPoint.y);
            this.playAudioAsset(invaderExplosionSfxAssetId, { volume: 0.5 });
            this.playInvaderAnimation(invader, invader.invaderType.destroyed);
            invader.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => invader.destroy());
            this.score += 10;
            this.scoreText?.setText(`Score ${this.score}`);
            break;
          }
        }
      }

      for (const bullet of [...this.invaderBullets]) {
        if (this.heroDestroyed) break;

        const collisionPoint = this.pixelCollisionPoint(bullet, this.hero);

        if (collisionPoint) {
          this.invaderBullets = this.invaderBullets.filter((candidate) => candidate !== bullet);
          bullet.destroy();
          this.spawnLaserHit("laser.red.hit", collisionPoint.x, collisionPoint.y);
          this.handleHeroHit();
        }
      }

      if (this.invaders.length === 0) {
        this.resetWave("Wave cleared.");
      }
    }

    private pixelCollisionPoint(
      first: Phaser.GameObjects.Sprite,
      second: Phaser.GameObjects.Sprite
    ): Phaser.Math.Vector2 | undefined {
      if (!first.active || !second.active) return undefined;

      const firstBounds = first.getBounds();
      const secondBounds = second.getBounds();
      const left = Math.max(firstBounds.left, secondBounds.left);
      const right = Math.min(firstBounds.right, secondBounds.right);
      const top = Math.max(firstBounds.top, secondBounds.top);
      const bottom = Math.min(firstBounds.bottom, secondBounds.bottom);

      if (right <= left || bottom <= top) return undefined;

      const startX = Math.floor(left);
      const endX = Math.ceil(right);
      const startY = Math.floor(top);
      const endY = Math.ceil(bottom);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const sampleX = x + 0.5;
          const sampleY = y + 0.5;

          if (
            this.isSpritePixelOpaqueAt(first, sampleX, sampleY) &&
            this.isSpritePixelOpaqueAt(second, sampleX, sampleY)
          ) {
            return new Phaser.Math.Vector2(sampleX, sampleY);
          }
        }
      }

      return undefined;
    }

    private isSpritePixelOpaqueAt(
      sprite: Phaser.GameObjects.Sprite,
      worldX: number,
      worldY: number
    ): boolean {
      const localPoint = sprite.getLocalPoint(worldX, worldY, this.pixelCollisionLocalPoint);
      const frame = sprite.frame;
      let pixelX = Math.floor(localPoint.x);
      let pixelY = Math.floor(localPoint.y);

      if (sprite.flipX) {
        pixelX = frame.width - pixelX - 1;
      }

      if (sprite.flipY) {
        pixelY = frame.height - pixelY - 1;
      }

      if (
        pixelX < 0 ||
        pixelY < 0 ||
        pixelX >= frame.width ||
        pixelY >= frame.height
      ) {
        return false;
      }

      const alpha = this.textures.getPixelAlpha(
        pixelX,
        pixelY,
        sprite.texture.key,
        frame.name
      );

      return (alpha ?? 0) >= 16;
    }

    private startNewGame(activate = true): void {
      if (!this.aiRuntime) return;

      this.clearGameplayObjects();
      this.gameActive = activate;
      this.heroDestroyed = false;
      this.invadersCelebrating = false;
      this.heroLives = maxHeroLives;
      this.score = 0;
      this.waveIndex = 0;
      this.lastShotAt = 0;
      this.lastInvaderShotAt = this.time.now;
      this.heroLockedUntil = 0;
      this.heroAnimationKey = undefined;
      this.scoreText?.setText("Score 0");
      this.statusText?.setText("Move: arrows  Fire: space");

      this.hero = this.add.sprite(320, 570, this.aiRuntime.key("hero.ship.idle"));
      this.playHeroAnimation("hero.ship.idle", true);
      this.createHeroLifeBar();
      this.spawnInvaders();

      if (activate) {
        this.hideGameMenu();
      }
    }

    private clearGameplayObjects(): void {
      this.detachHeroFrameTransformHandler();

      for (const bullet of this.bullets) bullet.destroy();
      for (const bullet of this.invaderBullets) bullet.destroy();
      for (const invader of this.invaders) invader.destroy();
      for (const silhouette of this.heroLifeSilhouettes) silhouette.destroy();
      for (const icon of this.heroLifeIcons) icon.destroy();

      this.hero?.destroy();
      this.hero = undefined;
      this.bullets = [];
      this.invaderBullets = [];
      this.invaders = [];
      this.heroLifeSilhouettes = [];
      this.heroLifeIcons = [];
    }

    private createGameMenu(title: string): void {
      if (!this.aiRuntime) return;

      this.menuPanel = this.add.image(0, 0, this.aiRuntime.key("ui.panel"));
      this.menuPanel.setDisplaySize(menuPanelSize.width, menuPanelSize.height);

      this.menuTitle = this.add.text(0, menuTitleY, title, {
        align: "center",
        color: "#f8fafc",
        fontSize: "24px"
      });
      this.menuTitle.setOrigin(0.5);

      this.menuVolumeLabel = this.add.text(-95, menuVolumeSlider.y - 25, "Master Volume", {
        align: "left",
        color: "#dbeafe",
        fontSize: "14px"
      });
      this.menuVolumeLabel.setOrigin(0, 0.5);
      this.menuVolumeValue = this.add.text(95, menuVolumeSlider.y - 25, "100%", {
        align: "right",
        color: "#f8fafc",
        fontSize: "14px"
      });
      this.menuVolumeValue.setOrigin(1, 0.5);
      this.menuVolumeTrack = this.add.rectangle(0, menuVolumeSlider.y, menuVolumeSlider.width, 8, 0x334155, 0.95);
      this.menuVolumeTrack.setInteractive({ useHandCursor: true });
      this.menuVolumeFill = this.add.rectangle(
        -menuVolumeSlider.width / 2,
        menuVolumeSlider.y,
        menuVolumeSlider.width,
        8,
        0x38bdf8,
        1
      );
      this.menuVolumeFill.setOrigin(0, 0.5);
      this.menuVolumeKnob = this.add.ellipse(0, menuVolumeSlider.y, 20, 20, 0xf8fafc, 1);
      this.menuVolumeKnob.setStrokeStyle(3, 0x0f172a, 1);
      this.menuVolumeKnob.setInteractive({ useHandCursor: true });
      this.menuVolumeTrack.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.isDraggingVolume = true;
        this.setMasterVolumeFromPointer(pointer);
      });
      this.menuVolumeKnob.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.isDraggingVolume = true;
        this.setMasterVolumeFromPointer(pointer);
      });
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (this.isDraggingVolume) this.setMasterVolumeFromPointer(pointer);
      });
      this.input.on("pointerup", () => {
        this.isDraggingVolume = false;
      });

      this.newGameButton = this.add.sprite(0, menuSingleButtonY, this.aiRuntime.key("ui.button.idle"));
      this.newGameButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
      this.newGameButton.setInteractive({ useHandCursor: true });
      this.newGameButton.on("pointerover", () => this.playNewGameButtonAnimation("hover"));
      this.newGameButton.on("pointerout", () => this.playNewGameButtonAnimation("idle"));
      this.newGameButton.on("pointerdown", () => this.playNewGameButtonAnimation("clicked"));
      this.newGameButton.on("pointerup", () => {
        this.playNewGameButtonAnimation("hover");
        this.startNewGame(true);
      });
      this.playNewGameButtonAnimation("idle");

      this.newGameButtonText = this.add.text(0, menuSingleButtonY, "New Game", {
        align: "center",
        color: "#f8fafc",
        fontSize: "18px"
      });
      this.newGameButtonText.setOrigin(0.5);

      this.resumeButton = this.add.sprite(0, menuPauseResumeButtonY, this.aiRuntime.key("ui.button.idle"));
      this.resumeButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
      this.resumeButton.setInteractive({ useHandCursor: true });
      this.resumeButton.on("pointerover", () => this.playResumeButtonAnimation("hover"));
      this.resumeButton.on("pointerout", () => this.playResumeButtonAnimation("idle"));
      this.resumeButton.on("pointerdown", () => this.playResumeButtonAnimation("clicked"));
      this.resumeButton.on("pointerup", () => {
        this.playResumeButtonAnimation("hover");
        this.resumeGame();
      });
      this.playResumeButtonAnimation("idle");

      this.resumeButtonText = this.add.text(0, menuPauseResumeButtonY, "Resume", {
        align: "center",
        color: "#f8fafc",
        fontSize: "18px"
      });
      this.resumeButtonText.setOrigin(0.5);

      this.menuContainer = this.add.container(320, 320, [
        this.menuPanel,
        this.menuTitle,
        this.menuVolumeLabel,
        this.menuVolumeValue,
        this.menuVolumeTrack,
        this.menuVolumeFill,
        this.menuVolumeKnob,
        this.resumeButton,
        this.resumeButtonText,
        this.newGameButton,
        this.newGameButtonText
      ]);
      this.menuContainer.setDepth(100);
      this.updateMasterVolumeUi();
      this.showGameMenu(title);
    }

    private showGameMenu(title: string, options: { showResume?: boolean } = {}): void {
      this.gameActive = false;
      this.isPaused = Boolean(options.showResume);
      this.menuTitle?.setText(title);
      this.layoutMenuControls(Boolean(options.showResume));
      this.playNewGameButtonAnimation("idle");
      this.playResumeButtonAnimation("idle");
      this.newGameButton?.setInteractive({ useHandCursor: true });
      this.resumeButton?.setVisible(Boolean(options.showResume));
      this.resumeButton?.setActive(Boolean(options.showResume));
      this.resumeButtonText?.setVisible(Boolean(options.showResume));
      if (options.showResume) {
        this.resumeButton?.setInteractive({ useHandCursor: true });
      } else {
        this.resumeButton?.disableInteractive();
      }
      this.menuContainer?.setVisible(true);
      this.menuContainer?.setActive(true);
    }

    private hideGameMenu(): void {
      this.isPaused = false;
      this.newGameButton?.disableInteractive();
      this.resumeButton?.disableInteractive();
      this.menuContainer?.setVisible(false);
      this.menuContainer?.setActive(false);
    }

    private layoutMenuControls(showResume: boolean): void {
      const newGameY = showResume ? menuPauseNewGameButtonY : menuSingleButtonY;

      this.newGameButton?.setPosition(0, newGameY);
      this.newGameButtonText?.setPosition(0, newGameY);
      this.resumeButton?.setPosition(0, menuPauseResumeButtonY);
      this.resumeButtonText?.setPosition(0, menuPauseResumeButtonY);
    }

    private playNewGameButtonAnimation(state: "idle" | "hover" | "clicked"): void {
      if (!this.newGameButton) return;

      this.newGameButtonState = state;
      this.newGameButton.play(`ui.button.${state}`, true);
      this.newGameButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
    }

    private playResumeButtonAnimation(state: "idle" | "hover" | "clicked"): void {
      if (!this.resumeButton) return;

      this.resumeButtonState = state;
      this.resumeButton.play(`ui.button.${state}`, true);
      this.resumeButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
    }

    private showPauseMenu(): void {
      if (!this.gameActive || this.heroDestroyed) return;

      this.showGameMenu("Paused", { showResume: true });
    }

    private resumeGame(): void {
      if (!this.isPaused) return;

      this.hideGameMenu();
      this.gameActive = true;
      this.statusText?.setText("Move: arrows  Fire: space");
    }

    private setMasterVolumeFromPointer(pointer: Phaser.Input.Pointer): void {
      const containerX = this.menuContainer?.x ?? 320;
      const localX = pointer.worldX - containerX;

      this.setMasterVolume((localX + (menuVolumeSlider.width / 2)) / menuVolumeSlider.width);
    }

    private setMasterVolume(volume: number): void {
      this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
      this.sound.volume = this.masterVolume;
      saveMasterVolume(this.masterVolume);
      this.updateMasterVolumeUi();
    }

    private updateMasterVolumeUi(): void {
      const width = menuVolumeSlider.width * this.masterVolume;
      const knobX = (-menuVolumeSlider.width / 2) + width;

      this.menuVolumeFill?.setSize(width, 8);
      this.menuVolumeKnob?.setPosition(knobX, menuVolumeSlider.y);
      this.menuVolumeValue?.setText(`${Math.round(this.masterVolume * 100)}%`);
    }

    private spawnInvaders(): void {
      if (!this.aiRuntime) return;

      this.invaders = [];
      this.invaderDirection = 1;
      this.invadersCelebrating = false;

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const invaderType = Phaser.Utils.Array.GetRandom(invaderTypes) as InvaderType;
          const invader = this.add.sprite(
            112 + col * 60,
            118 + row * 58,
            this.aiRuntime.key(invaderType.idle)
          ) as InvaderSprite;
          invader.invaderType = invaderType;
          this.playInvaderAnimation(invader, invaderType.idle);
          this.invaders.push(invader);
        }
      }
    }

    private spawnStars(): void {
      if (!this.aiRuntime || this.starAnimationKeys.length === 0) return;

      for (const star of this.starSprites) star.destroy();
      this.starSprites = [];

      for (let index = 0; index < 28; index += 1) {
        const star = this.add.sprite(
          Phaser.Math.Between(0, 640),
          Phaser.Math.Between(0, 640),
          this.aiRuntime.key(starAnimationAssetIds[0])
        ) as StarSprite;
        star.starSpeed = Phaser.Math.FloatBetween(8, 42);
        star.starAnimationKey = Phaser.Utils.Array.GetRandom(this.starAnimationKeys) as string;
        star.setDepth(-82);
        star.setAlpha(Phaser.Math.FloatBetween(0.175, 0.45));
        star.setScale(Phaser.Math.FloatBetween(0.35, 1.25));
        star.play(star.starAnimationKey);
        this.starSprites.push(star);
      }
    }

    private updateStars(delta: number): void {
      const deltaSeconds = delta / 1000;

      for (const star of this.starSprites) {
        star.y += star.starSpeed * deltaSeconds;

        if (star.y > 660) {
          star.x = Phaser.Math.Between(0, 640);
          star.y = -20;
          star.starSpeed = Phaser.Math.FloatBetween(8, 42);
          star.setAlpha(Phaser.Math.FloatBetween(0.175, 0.45));
          star.setScale(Phaser.Math.FloatBetween(0.35, 1.25));
          star.starAnimationKey = Phaser.Utils.Array.GetRandom(this.starAnimationKeys) as string;
          star.play(star.starAnimationKey);
        }
      }
    }

    private applyStarTexture(assetId: string, textureKey: string): void {
      const animationKey = assetManifest.assets[assetId]?.animations?.[0]?.key ?? assetId;
      this.starAnimationKeys = this.resolveStarAnimationKeys();

      for (const star of this.starSprites) {
        if (star.starAnimationKey === animationKey) {
          star.setTexture(textureKey);
          star.play(star.starAnimationKey);
        }
      }
    }

    private resetWave(message: string): void {
      if (this.heroDestroyed) return;

      for (const invader of this.invaders) invader.destroy();
      for (const bullet of this.bullets) bullet.destroy();
      for (const bullet of this.invaderBullets) bullet.destroy();

      this.bullets = [];
      this.invaderBullets = [];
      this.waveIndex += 1;
      this.spawnInvaders();
      this.statusText?.setText(
        `${message} Wave ${this.waveIndex + 1}. Speed x${this.invaderSpeedMultiplier().toFixed(1)}.`
      );
    }

    private checkInvadersReachedHero(): void {
      if (!this.hero || this.heroDestroyed || this.invadersCelebrating || this.invaders.length === 0) {
        return;
      }

      const bottomInvader = this.invaders.reduce((lowest, invader) => (
        invader.getBounds().bottom > lowest.getBounds().bottom ? invader : lowest
      ));
      const heroLine = this.hero.getBounds().top + invaderHeroReachPadding;

      if (bottomInvader.getBounds().bottom >= heroLine) {
        this.statusText?.setText("Invaders breached the ship.");
        this.playHeroExplosion();
      }
    }

    private createHeroLifeBar(): void {
      if (!this.aiRuntime) return;

      for (const silhouette of this.heroLifeSilhouettes) silhouette.destroy();
      for (const icon of this.heroLifeIcons) icon.destroy();
      this.heroLifeSilhouettes = [];
      this.heroLifeIcons = [];

      for (let index = 0; index < maxHeroLives; index += 1) {
        const x = 618 - ((maxHeroLives - 1 - index) * heroLifeIconSpacing);
        const silhouette = this.add.image(x, 30, this.aiRuntime.key("hero.ship"));
        silhouette.setDisplaySize(heroLifeIconSize, heroLifeIconSize);
        silhouette.setDepth(39);
        silhouette.setTint(0x94a3b8);
        silhouette.setTintMode(Phaser.TintModes.FILL);
        silhouette.setAlpha(0.58);
        this.heroLifeSilhouettes.push(silhouette);

        const icon = this.add.image(
          x,
          30,
          this.aiRuntime.key("hero.ship")
        );
        icon.setDisplaySize(heroLifeIconSize, heroLifeIconSize);
        icon.setDepth(40);
        this.heroLifeIcons.push(icon);
      }

      this.updateHeroLifeBar();
    }

    private updateHeroLifeBarTexture(textureKey: string): void {
      for (const silhouette of this.heroLifeSilhouettes) {
        silhouette.setTexture(textureKey);
        silhouette.setDisplaySize(heroLifeIconSize, heroLifeIconSize);
      }

      for (const icon of this.heroLifeIcons) {
        icon.setTexture(textureKey);
        icon.setDisplaySize(heroLifeIconSize, heroLifeIconSize);
      }
    }

    private updateHeroLifeBar(): void {
      for (const silhouette of this.heroLifeSilhouettes) {
        silhouette.setVisible(true);
        silhouette.setActive(true);
      }

      this.heroLifeIcons.forEach((icon, index) => {
        const isAlive = index < this.heroLives;
        icon.setVisible(isAlive);
        icon.setActive(isAlive);
        icon.setAlpha(0.95);
        icon.setTint(0xffffff);
      });
    }

    private handleHeroHit(): void {
      if (!this.hero || this.heroDestroyed) return;

      this.heroLives = Math.max(0, this.heroLives - 1);
      this.updateHeroLifeBar();

      if (this.heroLives === 0) {
        this.statusText?.setText("Ship destroyed.");
        this.playHeroExplosion();
        return;
      }

      this.statusText?.setText(`Hit. ${this.heroLives} ${this.heroLives === 1 ? "life" : "lives"} left.`);
      this.playAudioAsset(heroHitSfxAssetId, { volume: 0.55 });
      this.playHeroActionAnimation("hero.ship.hit");
    }

    private playHeroExplosion(): void {
      if (!this.hero || this.heroDestroyed) return;

      this.heroDestroyed = true;
      this.gameActive = false;
      this.startInvaderCelebration();
      this.heroLockedUntil = Number.POSITIVE_INFINITY;
      this.detachHeroFrameTransformHandler();
      this.hero.setFlipX(false);
      this.heroAnimationKey = "hero.ship.explosion";
      this.playAudioAsset(heroExplosionSfxAssetId, { volume: 0.7 });
      this.playGameOverEffectThenShowMenu();
      this.hero.play("hero.ship.explosion", true);
      this.applyHeroFrameTransform("hero.ship.explosion", 0);
      this.attachHeroFrameTransformHandler("hero.ship.explosion");
      this.hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.detachHeroFrameTransformHandler();
        this.hero?.setVisible(false);
        this.hero?.setActive(false);
      });
    }

    private playGameOverEffectThenShowMenu(): void {
      const sound = this.playAudioAsset(gameOverSfxAssetId, { loop: false, volume: 0.8 });
      const asset = assetManifest.assets[gameOverSfxAssetId];
      const version = asset?.versions[asset.activeVersion];
      const durationSeconds = version?.durationSeconds ??
        asset?.audioSettings?.durationSeconds ??
        8;
      let didShowMenu = false;
      const showMenu = () => {
        if (didShowMenu) return;

        didShowMenu = true;
        this.showGameMenu("Game Over");
      };

      if (!sound) {
        this.time.delayedCall(durationSeconds * 1000, showMenu);
        return;
      }

      sound.once(Phaser.Sound.Events.COMPLETE, showMenu);
      this.time.delayedCall((durationSeconds + 0.25) * 1000, showMenu);
    }

    private startInvaderCelebration(): void {
      if (this.invadersCelebrating) return;

      this.invadersCelebrating = true;

      for (const bullet of this.bullets) bullet.destroy();
      for (const bullet of this.invaderBullets) bullet.destroy();
      this.bullets = [];
      this.invaderBullets = [];

      for (const invader of this.invaders) {
        if (!invader.active) continue;

        this.playInvaderAnimation(invader, invader.invaderType.celebration);
      }
    }

    private recreateHeroAnimations(
      assetId: string,
      textureKey: string,
      asset = assetManifest.assets[assetId]
    ): string[] {
      const animationKeys: string[] = [];

      for (const animation of asset?.animations ?? []) {
        this.anims.remove(animation.key);
        this.anims.create({
          key: animation.key,
          frames: this.animationFramesWithTiming(textureKey, animation),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        animationKeys.push(animation.key);
      }

      this.registerHeroAnimationSize(asset);

      return animationKeys;
    }

    private recreateInvaderAnimations(
      assetId: string,
      textureKey: string,
      asset = assetManifest.assets[assetId]
    ): string[] {
      const animationKeys: string[] = [];

      for (const animation of asset?.animations ?? []) {
        this.anims.remove(animation.key);
        this.anims.create({
          key: animation.key,
          frames: this.animationFramesWithTiming(textureKey, animation),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        animationKeys.push(animation.key);
      }

      this.registerInvaderAnimationSize(asset);

      return animationKeys;
    }

    private recreateStarAnimations(
      assetId: string,
      textureKey: string,
      asset = assetManifest.assets[assetId]
    ): string[] {
      const animationKeys: string[] = [];

      for (const animation of asset?.animations ?? []) {
        this.anims.remove(animation.key);
        this.anims.create({
          key: animation.key,
          frames: this.animationFramesWithTiming(textureKey, animation),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        animationKeys.push(animation.key);
      }

      return animationKeys;
    }

    private recreateLaserAnimations(
      assetId: string,
      textureKey: string,
      asset = assetManifest.assets[assetId]
    ): string[] {
      const animationKeys: string[] = [];

      for (const animation of asset?.animations ?? []) {
        this.anims.remove(animation.key);
        this.anims.create({
          key: animation.key,
          frames: this.animationFramesWithTiming(textureKey, animation),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        animationKeys.push(animation.key);
      }

      return animationKeys;
    }

    private recreateUiAnimations(
      assetId: string,
      textureKey: string,
      asset = assetManifest.assets[assetId]
    ): string[] {
      const animationKeys: string[] = [];

      for (const animation of asset?.animations ?? []) {
        this.anims.remove(animation.key);
        this.anims.create({
          key: animation.key,
          frames: this.animationFramesWithTiming(textureKey, animation),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1
        });
        animationKeys.push(animation.key);
      }

      return animationKeys;
    }

    private resolveStarAnimationKeys(): string[] {
      return starAnimationAssetIds.flatMap((assetId) =>
        assetManifest.assets[assetId]?.animations?.map((animation) => animation.key) ?? []
      );
    }

    private registerHeroAnimationSize(asset: AiAssetDefinition | undefined): void {
      const size = this.displaySizeForAsset(asset);

      for (const animation of asset?.animations ?? []) {
        this.heroAnimationSizes.set(animation.key, size);
        this.heroAnimations.set(animation.key, animation);
      }
    }

    private playHeroAnimation(animationKey: string, forceRestart = false): void {
      if (!this.hero || (!forceRestart && this.heroAnimationKey === animationKey)) return;

      this.detachHeroFrameTransformHandler();
      this.heroAnimationKey = animationKey;
      this.hero.play(animationKey);
      this.applyHeroFrameTransform(animationKey, 0);
      this.attachHeroFrameTransformHandler(animationKey);
    }

    private playHeroActionAnimation(animationKey: string): void {
      if (this.hero) {
        this.detachHeroFrameTransformHandler();
        this.hero.setFlipX(false);
        this.heroAnimationKey = animationKey;
        this.hero.play(animationKey, true);
        this.applyHeroFrameTransform(animationKey, 0);
        this.attachHeroFrameTransformHandler(animationKey);
      }
      this.heroLockedUntil = this.time.now + this.animationDuration(animationKey);

      this.hero?.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.time.now >= this.heroLockedUntil) {
          this.playHeroAnimation("hero.ship.idle");
        }
      });
    }

    private scheduleHeroLaser(animationKey: string): void {
      if (!this.hero) return;

      const shooter = this.hero;
      const delayMs = this.delayUntilTaggedFrame(animationKey, "shoot");

      this.time.delayedCall(delayMs, () => {
        if (!shooter.active || this.heroAnimationKey !== animationKey) return;

        this.bullets.push(this.spawnLaser("laser.blue.flicker", shooter.x, shooter.y - 35));
        this.playAudioAsset(playerLaserSfxAssetId, { volume: 0.55 });
      });
    }

    private attachHeroFrameTransformHandler(animationKey: string): void {
      if (!this.hero) return;

      this.heroFrameTransformHandler = (...args: unknown[]) => {
        const frame = args[1] as { index?: number } | undefined;
        this.applyHeroFrameTransform(animationKey, Math.max(0, (frame?.index ?? 1) - 1));
      };
      this.hero.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.heroFrameTransformHandler);
    }

    private detachHeroFrameTransformHandler(): void {
      if (this.hero && this.heroFrameTransformHandler) {
        this.hero.off(Phaser.Animations.Events.ANIMATION_UPDATE, this.heroFrameTransformHandler);
      }

      this.heroFrameTransformHandler = undefined;
    }

    private registerInvaderAnimationSize(asset: AiAssetDefinition | undefined): void {
      const size = this.displaySizeForAsset(asset);

      for (const animation of asset?.animations ?? []) {
        this.invaderAnimationSizes.set(animation.key, size);
        this.invaderAnimations.set(animation.key, animation);
      }
    }

    private playInvaderAnimation(
      invader: Phaser.GameObjects.Sprite,
      animationKey: string
    ): void {
      const existingHandler = this.invaderFrameOffsetHandlers.get(invader);

      if (existingHandler) {
        invader.off(Phaser.Animations.Events.ANIMATION_UPDATE, existingHandler);
      }

      this.invaderAnimationKeys.set(invader, animationKey);
      invader.play(animationKey);
      this.applyInvaderAnimationSize(invader, animationKey);
      this.applyInvaderFrameTransform(invader, animationKey, 0);

      const handler = (...args: unknown[]) => {
        const frame = args[1] as { index?: number } | undefined;
        this.applyInvaderFrameTransform(invader, animationKey, Math.max(0, (frame?.index ?? 1) - 1));
      };

      this.invaderFrameOffsetHandlers.set(invader, handler);
      invader.on(Phaser.Animations.Events.ANIMATION_UPDATE, handler);
    }

    private applyInvaderAnimationSize(
      invader: Phaser.GameObjects.Sprite,
      animationKey: string
    ): void {
      const size = this.invaderAnimationSizes.get(animationKey) ??
        this.displaySizeForAsset(assetManifest.assets[animationKey]);
      invader.setDisplaySize(size.width, size.height);
      invader.setRotation(0);
    }

    private scheduleInvaderLaser(
      shooter: Phaser.GameObjects.Sprite,
      animationKey: string
    ): void {
      const delayMs = this.delayUntilTaggedFrame(animationKey, "shoot");

      this.time.delayedCall(delayMs, () => {
        if (
          this.invadersCelebrating ||
          !shooter.active ||
          this.invaderAnimationKeys.get(shooter) !== animationKey
        ) {
          return;
        }

        this.invaderBullets.push(this.spawnLaser("laser.red.flicker", shooter.x, shooter.y + 30));
        this.playAudioAsset(alienLaserSfxAssetId, { volume: 0.45 });
      });
    }

    private spawnLaser(animationKey: string, x: number, y: number): LaserSprite {
      if (!this.aiRuntime) {
        throw new Error("AI runtime is required to spawn laser assets.");
      }

      const asset = assetManifest.assets[animationKey];
      const laser = this.add.sprite(x, y, this.aiRuntime.key(animationKey));
      const size = this.displaySizeForAsset(asset);
      laser.setDisplaySize(size.width, size.height);
      laser.setDepth(8);
      laser.play(animationKey);
      bindAiAnimationFrameTransforms(
        laser,
        this.animationForKey(animationKey),
        size,
        { eventName: Phaser.Animations.Events.ANIMATION_UPDATE }
      );

      return laser;
    }

    private playAudioAsset(
      assetId: string,
      config?: Phaser.Types.Sound.SoundConfig
    ): Phaser.Sound.BaseSound | undefined {
      if (!this.cache.audio.exists(assetId)) return undefined;

      const asset = assetManifest.assets[assetId];
      const version = asset?.versions[asset.activeVersion];
      const playback = {
        ...asset?.audioPlayback,
        ...version?.audioPlayback,
        ...this.audioPlaybackOverrides.get(assetId)
      };
      const rate = playback.playbackRate ?? config?.rate ?? 1;
      const seek = playback.trimStartSeconds ?? config?.seek ?? 0;
      const loop = config?.loop ?? playback.loop;
      const sound = this.sound.add(assetId);

      sound.play({
        ...config,
        rate,
        seek,
        loop,
        volume: (config?.volume ?? 1) * (playback.volume ?? 1)
      });

      if (
        playback.trimEndSeconds !== undefined &&
        playback.trimEndSeconds > seek
      ) {
        const stopOrLoop = () => {
          if (!sound.isPlaying) return;

          if (loop) {
            sound.play({
              ...config,
              rate,
              seek,
              loop: false,
              volume: (config?.volume ?? 1) * (playback.volume ?? 1)
            });
            this.time.delayedCall(
              ((playback.trimEndSeconds! - seek) / Math.max(0.01, rate)) * 1000,
              stopOrLoop
            );
            return;
          }

          sound.stop();
        };
        this.time.delayedCall(
          ((playback.trimEndSeconds - seek) / Math.max(0.01, rate)) * 1000,
          stopOrLoop
        );
      }

      return sound;
    }

    private refreshAudioAsset(assetId: string, source: string): void {
      if (!source) return;

      const audioCache = this.cache.audio as Phaser.Cache.BaseCache & {
        remove?: (key: string) => unknown;
      };

      if (audioCache.exists(assetId)) {
        audioCache.remove?.(assetId);
      }

      this.load.audio(assetId, source);
      this.load.start();
    }

    private spawnLaserHit(animationKey: string, x: number, y: number): void {
      if (!this.aiRuntime) return;

      const size = laserHitDisplaySizes[animationKey] ??
        this.displaySizeForAsset(assetManifest.assets[animationKey]);
      const hit = this.add.sprite(x, y, this.aiRuntime.key(animationKey));
      const fallbackDestroy = this.time.delayedCall(
        this.animationDuration(animationKey) + 80,
        () => {
          transformBinding.detach();
          hit.destroy();
        }
      );

      hit.setDisplaySize(size.width, size.height);
      hit.setOrigin(0.5, animationKey === "laser.red.hit" ? 1 : 0);
      hit.setDepth(20);
      hit.play(animationKey, true);
      const transformBinding = bindAiAnimationFrameTransforms(
        hit,
        this.animationForKey(animationKey),
        size,
        {
          eventName: Phaser.Animations.Events.ANIMATION_UPDATE,
          originY: animationKey === "laser.red.hit" ? 1 : 0
        }
      );
      hit.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        fallbackDestroy.remove(false);
        transformBinding.detach();
        hit.destroy();
      });
    }

    private delayUntilTaggedFrame(animationKey: string, tag: string): number {
      const animation = this.animationForKey(animationKey);

      if (!animation) return 0;

      const defaultDelay = Math.round(1000 / animation.frameRate);
      const tagIndex = animation.frameTimings?.findIndex((timing) => timing.tag === tag) ?? -1;
      const targetIndex = tagIndex >= 0 ? tagIndex : animation.frames.length;

      return animation.frames
        .slice(0, targetIndex)
        .reduce((total, _frame, index) => (
          total + (animation.frameTimings?.[index]?.delayMs ?? defaultDelay)
        ), 0);
    }

    private animationDuration(animationKey: string): number {
      const animation = this.animationForKey(animationKey);

      if (!animation) return 0;

      const defaultDelay = Math.round(1000 / animation.frameRate);

      return animation.frames.reduce((total, _frame, index) => (
        total + (animation.frameTimings?.[index]?.delayMs ?? defaultDelay)
      ), 0);
    }

    private applyHeroFrameTransform(animationKey: string, frameSlot: number): void {
      if (!this.hero) return;

      const size = this.heroAnimationSizes.get(animationKey) ??
        this.displaySizeForAsset(assetManifest.assets[animationKey]);
      this.applyFrameTransform(this.hero, animationKey, frameSlot, size);
    }

    private applyInvaderFrameTransform(
      invader: Phaser.GameObjects.Sprite,
      animationKey: string,
      frameSlot: number
    ): void {
      const size = this.invaderAnimationSizes.get(animationKey) ??
        this.displaySizeForAsset(assetManifest.assets[animationKey]);
      this.applyFrameTransform(invader, animationKey, frameSlot, size);
    }

    private applyFrameTransform(
      sprite: Phaser.GameObjects.Sprite,
      animationKey: string,
      frameSlot: number,
      size: { width: number; height: number }
    ): void {
      applyAiAnimationFrameTransform(
        sprite,
        this.animationForKey(animationKey),
        frameSlot,
        size
      );
    }

    private animationFramesWithTiming(
      textureKey: string,
      animation: AiAssetAnimation
    ): Phaser.Types.Animations.AnimationFrame[] {
      return this.anims.generateFrameNumbers(textureKey, {
        frames: animation.frames
      }).map((frame, index) => ({
        ...frame,
        duration: animation.frameTimings?.[index]?.delayMs
      }));
    }

    private animationForKey(animationKey: string): AiAssetAnimation | undefined {
      return this.heroAnimations.get(animationKey) ??
        this.invaderAnimations.get(animationKey) ??
        starAnimationAssetIds
        .flatMap((assetId) => assetManifest.assets[assetId]?.animations ?? [])
        .find((animation) => animation.key === animationKey) ??
        laserAnimationAssetIds
        .flatMap((assetId) => assetManifest.assets[assetId]?.animations ?? [])
        .find((animation) => animation.key === animationKey) ??
        assetManifest.assets[animationKey]?.animations
        ?.find((animation) => animation.key === animationKey);
    }

    private applyDisplaySize(
      target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
      asset: AiAssetDefinition | undefined
    ): void {
      const size = this.displaySizeForAsset(asset);
      target.setDisplaySize(size.width, size.height);
    }

    private displaySizeForAsset(asset: AiAssetDefinition | undefined): {
      width: number;
      height: number;
    } {
      return {
        width: asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 42,
        height: asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 42
      };
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 640,
    height: 640,
    backgroundColor: "#10131a",
    scene: SpaceInvadersScene
  });
}

function keepBullet(bullet: LaserSprite): boolean {
  if (bullet.y > -20 && bullet.y < 660) {
    return true;
  }

  bullet.destroy();
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

boot().catch((error) => {
  const message = errorMessage(error);
  document.body.insertAdjacentHTML("beforeend", `<pre>${message}</pre>`);
  throw error;
});
