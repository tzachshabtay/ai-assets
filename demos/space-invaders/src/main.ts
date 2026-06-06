import Phaser from "phaser";
import {
  AiAssetDebugClient,
  AiAssetRuntime,
  applyAiAnimationFrameTransform,
  bindAiAnimationFrameTransforms,
  createAiAnimations,
  installAiAssetDesigner,
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

type LaserSprite = Phaser.GameObjects.Sprite;

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

const laserHitDisplaySizes: Record<string, { width: number; height: number }> = {
  "laser.blue.hit": { width: 18, height: 18 },
  "laser.red.hit": { width: 18, height: 18 }
};

let manifest: AiAssetManifest;
let sceneRef: DemoScene | undefined;

async function boot(): Promise<void> {
  manifest = await debugClient.getManifest();
  startGame(manifest);
}

function startGame(assetManifest: AiAssetManifest): void {
  class SpaceInvadersScene extends Phaser.Scene {
    aiRuntime?: AiAssetRuntime;
    background?: Phaser.GameObjects.Image;
    hero?: Phaser.GameObjects.Sprite;
    invaders: Phaser.GameObjects.Sprite[] = [];
    applyAssetTexture?: (assetId: string, textureKey: string, asset: AiAssetDefinition) => void;

    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private fireKey?: Phaser.Input.Keyboard.Key;
    private bullets: LaserSprite[] = [];
    private invaderBullets: LaserSprite[] = [];
    private lastShotAt = 0;
    private invaderDirection = 1;
    private lastInvaderShotAt = 0;
    private score = 0;
    private scoreText?: Phaser.GameObjects.Text;
    private statusText?: Phaser.GameObjects.Text;
    private heroAnimationSizes = new Map<string, { width: number; height: number }>();
    private heroAnimations = new Map<string, AiAssetAnimation>();
    private heroAnimationKey?: string;
    private heroLockedUntil = 0;
    private heroFrameTransformHandler?: (...args: unknown[]) => void;
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
    }

    create() {
      sceneRef = this;
      this.aiRuntime = new AiAssetRuntime(this, assetManifest);
      createAiAnimations(this, assetManifest, "hero.ship.idle");
      createAiAnimations(this, assetManifest, "hero.ship.moving-left");
      createAiAnimations(this, assetManifest, "hero.ship.shooting");
      createAiAnimations(this, assetManifest, "hero.ship.hit");
      for (const assetId of starAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      for (const assetId of laserAnimationAssetIds) {
        createAiAnimations(this, assetManifest, assetId);
      }
      createAiAnimations(this, assetManifest, "invader.scout.idle");
      createAiAnimations(this, assetManifest, "invader.scout.shooting");
      createAiAnimations(this, assetManifest, "invader.scout.destroyed");
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.idle"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.moving-left"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.shooting"]);
      this.registerHeroAnimationSize(assetManifest.assets["hero.ship.hit"]);
      this.registerInvaderAnimationSize(assetManifest.assets["invader.scout.idle"]);
      this.registerInvaderAnimationSize(assetManifest.assets["invader.scout.shooting"]);
      this.registerInvaderAnimationSize(assetManifest.assets["invader.scout.destroyed"]);
      this.cursors = this.input.keyboard?.createCursorKeys();
      this.fireKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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

      this.hero = this.add.sprite(320, 570, this.aiRuntime.key("hero.ship.idle"));
      this.playHeroAnimation("hero.ship.idle");
      this.spawnInvaders();

      this.applyAssetTexture = (assetId, textureKey, asset) => {
        assetManifest.assets[assetId] = asset;

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

        if (assetId === "hero.ship" && this.hero) {
          this.heroAnimationKey = undefined;
          this.hero.setTexture(textureKey);
          this.applyDisplaySize(this.hero, asset);
        }

        if (assetId.startsWith("hero.ship.")) {
          this.recreateHeroAnimations(assetId, textureKey, asset);

          if (this.heroAnimationKey === assetId) {
            this.playHeroAnimation(assetId, true);
          }
        }

        if (assetId === "invader.scout") {
          for (const invader of this.invaders ?? []) {
            invader.setTexture(textureKey);
            this.applyDisplaySize(invader, asset);
          }
        }

        if (assetId.startsWith("invader.scout.")) {
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
          "invader.scout",
          "laser.blue",
          "laser.red",
          "background.space",
          "background.stars"
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
          "invader.scout": { width: 42, height: 42 },
          "invader.scout.idle": { width: 42, height: 42 },
          "invader.scout.shooting": { width: 42, height: 42 },
          "invader.scout.destroyed": { width: 42, height: 42 },
          "laser.blue": { width: 4, height: 18 },
          "laser.blue.flicker": { width: 4, height: 18 },
          "laser.blue.hit": { width: 18, height: 18 },
          "laser.red": { width: 5, height: 16 },
          "laser.red.flicker": { width: 5, height: 16 },
          "laser.red.hit": { width: 18, height: 18 },
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
      this.updateHero(delta);
      this.updateStars(delta);
      this.updateBullets(delta);
      this.updateInvaders(delta, time);
      this.updateCollisions();
    }

    private updateHero(delta: number) {
      if (!this.hero || !this.cursors) return;
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
      const enemyStep = 210 * (delta / 1000);

      for (const bullet of this.bullets) bullet.y -= playerStep;
      for (const bullet of this.invaderBullets) bullet.y += enemyStep;

      this.bullets = this.bullets.filter((bullet) => keepBullet(bullet));
      this.invaderBullets = this.invaderBullets.filter((bullet) => keepBullet(bullet));
    }

    private updateInvaders(delta: number, time: number) {
      if (!this.invaders || this.invaders.length === 0) return;

      const step = 42 * (delta / 1000) * this.invaderDirection;

      for (const invader of this.invaders) {
        invader.x += step;
      }

      this.correctInvaderEdgeHit();

      if (this.invaders.some((invader) => invader.y > 625)) {
        this.resetWave("Invaders regrouped.");
        return;
      }

      if (time - this.lastInvaderShotAt > 780) {
        this.lastInvaderShotAt = time;
        const shooter = Phaser.Utils.Array.GetRandom(this.invaders) as Phaser.GameObjects.Sprite;
        this.playInvaderAnimation(shooter, "invader.scout.shooting");
        this.scheduleInvaderLaser(shooter, "invader.scout.shooting");
        shooter.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (shooter.active) {
            this.playInvaderAnimation(shooter, "invader.scout.idle");
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
            this.playInvaderAnimation(invader, "invader.scout.destroyed");
            invader.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => invader.destroy());
            this.score += 10;
            this.scoreText?.setText(`Score ${this.score}`);
            break;
          }
        }
      }

      for (const bullet of [...this.invaderBullets]) {
        const collisionPoint = this.pixelCollisionPoint(bullet, this.hero);

        if (collisionPoint) {
          this.invaderBullets = this.invaderBullets.filter((candidate) => candidate !== bullet);
          bullet.destroy();
          this.spawnLaserHit("laser.red.hit", collisionPoint.x, collisionPoint.y);
          this.statusText?.setText("Hit. The ship holds.");
          this.playHeroActionAnimation("hero.ship.hit");
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

    private spawnInvaders(): void {
      if (!this.aiRuntime) return;

      this.invaders = [];
      this.invaderDirection = 1;

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const invader = this.add.sprite(
            112 + col * 60,
            118 + row * 58,
            this.aiRuntime.key("invader.scout.idle")
          );
          this.playInvaderAnimation(invader, "invader.scout.idle");
          this.invaders.push(invader);
        }
      }
    }

    private spawnStars(): void {
      if (!this.aiRuntime || this.starAnimationKeys.length === 0) return;

      for (const star of this.starSprites) star.destroy();
      this.starSprites = [];

      for (let index = 0; index < 56; index += 1) {
        const star = this.add.sprite(
          Phaser.Math.Between(0, 640),
          Phaser.Math.Between(0, 640),
          this.aiRuntime.key(starAnimationAssetIds[0])
        ) as StarSprite;
        star.starSpeed = Phaser.Math.FloatBetween(8, 42);
        star.starAnimationKey = Phaser.Utils.Array.GetRandom(this.starAnimationKeys) as string;
        star.setDepth(-82);
        star.setAlpha(Phaser.Math.FloatBetween(0.35, 0.9));
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
          star.setAlpha(Phaser.Math.FloatBetween(0.35, 0.9));
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
      for (const invader of this.invaders) invader.destroy();
      for (const bullet of this.bullets) bullet.destroy();
      for (const bullet of this.invaderBullets) bullet.destroy();

      this.bullets = [];
      this.invaderBullets = [];
      this.spawnInvaders();
      this.statusText?.setText(`${message} New wave incoming.`);
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
        if (!shooter.active || this.invaderAnimationKeys.get(shooter) !== animationKey) return;

        this.invaderBullets.push(this.spawnLaser("laser.red.flicker", shooter.x, shooter.y + 30));
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
        width: asset?.frameGrid?.frameWidth ?? asset?.dimensions.width ?? 42,
        height: asset?.frameGrid?.frameHeight ?? asset?.dimensions.height ?? 42
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
