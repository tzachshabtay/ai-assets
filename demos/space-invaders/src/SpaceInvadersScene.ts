import Phaser from "phaser";
import {
  AiAssetRuntime,
  loadAiAssets,
} from "@ai-game-assets/phaser";
import type { AiAssetDefinition, AiAssetManifest } from "@ai-game-assets/core";
import {
  alienLaserSfxAssetId,
  gameOverSfxAssetId,
  heroExplosionSfxAssetId,
  heroHitSfxAssetId,
  heroLifeIconSize,
  heroLifeIconSpacing,
  invaderAnimationAssetIds,
  invaderBaseSpeed,
  invaderExplosionSfxAssetId,
  invaderHeroReachPadding,
  invaderLaserBaseSpeed,
  invaderLaserWaveSpeedIncrease,
  invaderTypes,
  invaderWaveSpeedIncrease,
  isRuntimeAudioAsset,
  keepBullet,
  laserAnimationAssetIds,
  loadMasterVolume,
  maxHeroLives,
  newWaveVoiceLineAssetId,
  playerLaserSfxAssetId,
  saveMasterVolume,
  starAnimationAssetIds,
  uiAnimationAssetIds,
} from "./assetConfig.js";
import type { InvaderSprite, InvaderType, LaserSprite, StarSprite } from "./assetConfig.js";
import { DemoAnimationController } from "./DemoAnimationController.js";
import { DemoAudioController } from "./DemoAudioController.js";
import { GameMenuController } from "./GameMenuController.js";
import { SpritePixelCollision } from "./SpritePixelCollision.js";

export type SpaceInvadersDesignerInstaller = (options: {
  scene: Phaser.Scene;
  manifest: AiAssetManifest;
  onManifestUpdated(manifest: AiAssetManifest): void;
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onAssetReady(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
}) => void;

export function startGame(
  assetManifest: AiAssetManifest,
  options: {
    assetBaseUrl?: string;
    targetId?: string;
    onManifestUpdated?: (manifest: AiAssetManifest) => void;
    installDesigner?: SpaceInvadersDesignerInstaller;
  } = {}
): void {
  const gameSize = gameSizeForTargetBackground(assetManifest, options.targetId);

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
    private isPaused = false;
    private masterVolume = loadMasterVolume();
    private animations?: DemoAnimationController;
    private audio?: DemoAudioController;
    private menu?: GameMenuController;
    private heroLockedUntil = 0;
    private audioPlaybackOverrides = new Map<string, AiAssetDefinition["audioPlayback"]>();
    private starSprites: StarSprite[] = [];
    private starAnimationKeys: string[] = [];
    private readonly pixelCollision: SpritePixelCollision;
    private touchPointerId?: number;
    private touchHeroOffsetX = 0;
    private touchHeroMoving = false;
    private hudTop = 14;
    private hudScoreY = 42;
    private playfieldTop = 112;
    private removeLifecycleListeners?: () => void;

    constructor() {
      super("space-invaders");
      this.pixelCollision = new SpritePixelCollision(this);
    }

    preload() {
      loadAiAssets(this, assetManifest, {
        baseUrl: options.assetBaseUrl,
        targetId: options.targetId
      });
    }

    create() {
      this.aiRuntime = new AiAssetRuntime(this, assetManifest, {
        baseUrl: options.assetBaseUrl,
        targetId: options.targetId
      });
      this.animations = new DemoAnimationController(this, this.aiRuntime, assetManifest);
      this.audio = new DemoAudioController(
        this,
        assetManifest,
        this.audioPlaybackOverrides,
        options.assetBaseUrl
      );
      this.animations.initialize();
      this.updateLayoutMetrics();
      this.cursors = this.input.keyboard?.createCursorKeys();
      this.fireKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.escapeKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.setupTouchControls();
      this.setupAppLifecycleAudio();
      this.sound.volume = this.masterVolume;
      if ((this.sound as Phaser.Sound.BaseSoundManager).locked) {
        this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
          this.audio?.fadeMusicTo(this.audio.mode, 0);
        });
      }
      this.add.rectangle(
        gameSize.width / 2,
        gameSize.height / 2,
        gameSize.width,
        gameSize.height,
        0x10131a
      ).setDepth(-100);
      this.background = this.add.image(
        gameSize.width / 2,
        gameSize.height / 2,
        this.aiRuntime.key("background.space")
      );
      this.background.setDisplaySize(gameSize.width, gameSize.height).setDepth(-90);
      this.starAnimationKeys = this.animations.starAnimationKeys();
      this.spawnStars();
      this.add.text(18, this.hudTop, "AI Assets Invaders", {
        color: "#f8fafc",
        fontSize: "20px"
      });
      this.scoreText = this.add.text(18, this.hudScoreY, "Score 0", {
        color: "#b9c1cf",
        fontSize: "15px"
      });
      this.statusText = this.add.text(210, this.hudScoreY, "Move: arrows/drag  Shoot: space/hold", {
        color: "#b9c1cf",
        fontSize: "15px"
      });

      this.applyAssetTexture = (assetId, textureKey, asset) => {
        assetManifest.assets[assetId] = asset;
        this.pixelCollision.invalidateTexture(textureKey);

        if (isRuntimeAudioAsset(asset)) {
          this.audio?.setPlaybackOverride(assetId, asset.audioPlayback);
          this.audio?.refreshAudioAsset(
            assetId,
            textureKey,
            asset.kind === "music" ? () => this.audio?.restartMusicTrack(assetId) : undefined
          );
          return;
        }

        if (this.isBackgroundAsset(assetId) && this.background) {
          this.background.setTexture(textureKey);
          this.background.setDisplaySize(gameSize.width, gameSize.height);
        }

        if (starAnimationAssetIds.includes(assetId)) {
          this.animations?.recreateAnimations(textureKey, asset);
          this.applyStarTexture(assetId, textureKey);
        }

        if (laserAnimationAssetIds.includes(assetId)) {
          this.animations?.recreateAnimations(textureKey, asset);
        }

        if (assetId === "ui.panel") {
          this.menu?.setPanelTexture(textureKey);
        }

        if (assetId === "ui.button") {
          this.menu?.setButtonTexture(textureKey);
        }

        if (uiAnimationAssetIds.includes(assetId)) {
          this.animations?.recreateAnimations(textureKey, asset);
          this.menu?.refreshButtonAnimation(assetId);
        }

        if (assetId === "hero.ship" && this.hero) {
          this.animations?.resetHeroAnimation();
          this.hero.setTexture(textureKey);
          this.animations?.applyDisplaySize(this.hero, asset);
          this.updateHeroLifeBarTexture(textureKey);
        }

        if (assetId.startsWith("hero.ship.")) {
          this.animations?.recreateHeroAnimations(assetId, textureKey, asset);

          if (this.animations?.currentHeroAnimationKey === assetId) {
            this.playHeroAnimation(assetId, true);
          }
        }

        if (invaderAnimationAssetIds.includes(assetId)) {
          this.animations?.recreateInvaderAnimations(assetId, textureKey, asset);
          for (const invader of this.invaders ?? []) {
            const currentAnimationKey = this.animations?.invaderAnimationKey(invader);

            if (currentAnimationKey === assetId) {
              this.animations?.playInvaderAnimation(invader, assetId);
            }
          }
        }
      };

      options.installDesigner?.({
        scene: this,
        manifest: assetManifest,
        onManifestUpdated: (updatedManifest) => {
          options.onManifestUpdated?.(updatedManifest);
          Object.assign(assetManifest.assets, updatedManifest.assets);
        },
        onPreview: (assetId, textureKey, asset) => {
          this.applyAssetTexture?.(assetId, textureKey, asset);
        },
        onAssetReady: (assetId, textureKey, asset) => {
          this.applyAssetTexture?.(assetId, textureKey, asset);
        }
      });

      this.startNewGame(false);
      this.createGameMenu("AI Assets Invaders");
      this.audio.loadSoundAssets();
      this.audio.loadMusicAssets();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.removeLifecycleListeners?.();
        this.removeLifecycleListeners = undefined;
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
      if (!this.hero) return;
      if (this.heroDestroyed) return;

      const speed = 280 * (delta / 1000);
      const keyboardEnabled = this.input.keyboard?.enabled ?? true;
      const isMovingLeft = Boolean(keyboardEnabled && this.cursors?.left.isDown);
      const isMovingRight = Boolean(keyboardEnabled && this.cursors?.right.isDown);
      const isTouchShooting = this.touchPointerId !== undefined;
      const isMoving = isMovingLeft || isMovingRight;

      if (isMovingLeft) this.hero.x -= speed;
      if (isMovingRight) this.hero.x += speed;
      this.hero.x = Phaser.Math.Clamp(this.hero.x, 32, gameSize.width - 32);

      if (isTouchShooting || (keyboardEnabled && this.fireKey?.isDown)) this.tryHeroShoot();

      if (this.time.now >= this.heroLockedUntil) {
        this.hero.setFlipX(isMovingRight && !isMovingLeft);
        this.playHeroAnimation(isMoving || this.touchHeroMoving ? "hero.ship.moving-left" : "hero.ship.idle");
      }

      this.touchHeroMoving = false;
    }

    private isBackgroundAsset(assetId: string): boolean {
      return assetId === "background.space" ||
        assetId === assetManifest.targets?.[options.targetId ?? ""]?.variants["background.space"];
    }

    private setupTouchControls(): void {
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.canStartHeroTouch(pointer)) return;

        this.touchPointerId = pointer.id;
        this.touchHeroOffsetX = this.hero!.x - pointer.worldX;
        this.touchHeroMoving = false;
        this.moveHeroWithPointer(pointer);
        this.tryHeroShoot();
      });

      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (pointer.id !== this.touchPointerId) return;

        this.moveHeroWithPointer(pointer);
      });

      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.id === this.touchPointerId) this.clearHeroTouch();
      });

      this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
        if (pointer.id === this.touchPointerId) this.clearHeroTouch();
      });

      this.input.on("gameout", () => {
        this.clearHeroTouch();
      });
    }

    private canStartHeroTouch(pointer: Phaser.Input.Pointer): boolean {
      if (!this.gameActive || this.isPaused || this.heroDestroyed || !this.hero) return false;

      const bounds = this.hero.getBounds();
      const touchPadding = 28;
      bounds.x -= touchPadding;
      bounds.y -= touchPadding;
      bounds.width += touchPadding * 2;
      bounds.height += touchPadding * 2;

      return bounds.contains(pointer.worldX, pointer.worldY);
    }

    private moveHeroWithPointer(pointer: Phaser.Input.Pointer): void {
      if (!this.hero) return;

      const previousX = this.hero.x;
      this.hero.x = Phaser.Math.Clamp(pointer.worldX + this.touchHeroOffsetX, 32, gameSize.width - 32);
      this.touchHeroMoving = Math.abs(this.hero.x - previousX) > 0.25;
    }

    private clearHeroTouch(): void {
      this.touchPointerId = undefined;
      this.touchHeroOffsetX = 0;
      this.touchHeroMoving = false;
    }

    private tryHeroShoot(): void {
      if (this.time.now - this.lastShotAt <= 220) return;

      this.lastShotAt = this.time.now;
      this.playHeroActionAnimation("hero.ship.shooting");
      this.scheduleHeroLaser("hero.ship.shooting");
    }

    private updateBullets(delta: number) {
      const playerStep = 460 * (delta / 1000);
      const enemyLaserSpeedMultiplier = 1 + (this.waveIndex * invaderLaserWaveSpeedIncrease);
      const enemyStep = invaderLaserBaseSpeed * enemyLaserSpeedMultiplier * (delta / 1000);

      for (const bullet of this.bullets) bullet.y -= playerStep;
      for (const bullet of this.invaderBullets) bullet.y += enemyStep;

      this.bullets = this.bullets.filter((bullet) => keepBullet(bullet, gameSize.height + 20));
      this.invaderBullets = this.invaderBullets.filter((bullet) => keepBullet(bullet, gameSize.height + 20));
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

      if (this.invaders.some((invader) => invader.y > gameSize.height - 15)) {
        this.resetWave("Invaders regrouped.");
        return;
      }

      if (time - this.lastInvaderShotAt > 780) {
        this.lastInvaderShotAt = time;
        const shooter = Phaser.Utils.Array.GetRandom(this.invaders) as InvaderSprite;
        this.animations?.playInvaderAnimation(shooter, shooter.invaderType.shooting);
        this.scheduleInvaderLaser(shooter, shooter.invaderType.shooting);
        shooter.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (shooter.active && !this.invadersCelebrating) {
            this.animations?.playInvaderAnimation(shooter, shooter.invaderType.idle);
          }
        });
      }
    }

    private correctInvaderEdgeHit(): void {
      const formationBounds = this.invaderFormationBounds();
      const leftLimit = 24;
      const rightLimit = gameSize.width - 24;
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
          const collisionPoint = this.pixelCollision.point(bullet, invader);

          if (collisionPoint) {
            this.bullets = this.bullets.filter((candidate) => candidate !== bullet);
            this.invaders = this.invaders.filter((candidate) => candidate !== invader);
            bullet.destroy();
            this.animations?.spawnLaserHit("laser.blue.hit", collisionPoint.x, collisionPoint.y);
            this.audio?.playAudioAsset(invaderExplosionSfxAssetId, { volume: 0.5 });
            this.animations?.playInvaderAnimation(invader, invader.invaderType.destroyed);
            invader.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => invader.destroy());
            this.score += 10;
            this.scoreText?.setText(`Score ${this.score}`);
            break;
          }
        }
      }

      for (const bullet of [...this.invaderBullets]) {
        if (this.heroDestroyed) break;

        const collisionPoint = this.pixelCollision.point(bullet, this.hero);

        if (collisionPoint) {
          this.invaderBullets = this.invaderBullets.filter((candidate) => candidate !== bullet);
          bullet.destroy();
          this.animations?.spawnLaserHit("laser.red.hit", collisionPoint.x, collisionPoint.y);
          this.handleHeroHit();
        }
      }

      if (this.invaders.length === 0) {
        this.resetWave("Wave cleared.");
      }
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
      this.clearHeroTouch();
      this.animations?.resetHeroAnimation();
      this.scoreText?.setText("Score 0");
      this.statusText?.setText("Move: arrows/drag  Shoot: space/hold");

      this.hero = this.add.sprite(gameSize.width / 2, this.heroStartY(), this.aiRuntime.key("hero.ship.idle"));
      this.playHeroAnimation("hero.ship.idle", true);
      this.createHeroLifeBar();
      this.spawnInvaders();

      if (activate) {
        this.hideGameMenu();
        this.audio?.fadeMusicTo("game");
      }
    }

    private clearGameplayObjects(): void {
      this.animations?.detachHeroFrameTransformHandler(this.hero);

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

      this.menu = new GameMenuController(this, this.aiRuntime, this.masterVolume, {
        onNewGame: () => this.startNewGame(true),
        onResume: () => this.resumeGame(),
        onVolumeChange: (volume) => this.setMasterVolume(volume),
        onMenuShown: (showResume) => {
          if (!showResume) this.audio?.fadeMusicTo("menu");
        }
      });
      this.menu.create(title);
    }

    private showGameMenu(title: string, options: { showResume?: boolean } = {}): void {
      this.gameActive = false;
      this.isPaused = Boolean(options.showResume);
      this.menu?.show(title, options);
    }

    private hideGameMenu(): void {
      this.isPaused = false;
      this.menu?.hide();
      this.clearHeroTouch();
    }

    private showPauseMenu(): void {
      if (!this.gameActive || this.heroDestroyed) return;

      this.showGameMenu("Paused", { showResume: true });
    }

    private resumeGame(): void {
      if (!this.isPaused) return;

      this.hideGameMenu();
      this.gameActive = true;
      this.statusText?.setText("Move: arrows/drag  Shoot: space/hold");
    }

    private setMasterVolume(volume: number): void {
      this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
      this.sound.volume = this.masterVolume;
      this.audio?.syncMusicTrackVolumes();
      saveMasterVolume(this.masterVolume);
      this.menu?.setMasterVolume(this.masterVolume);
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
            this.invaderStartX() + col * 60,
            this.playfieldTop + 34 + row * 58,
            this.aiRuntime.key(invaderType.idle)
          ) as InvaderSprite;
          invader.invaderType = invaderType;
          this.animations?.playInvaderAnimation(invader, invaderType.idle);
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
          Phaser.Math.Between(0, gameSize.width),
          Phaser.Math.Between(0, gameSize.height),
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

        if (star.y > gameSize.height + 20) {
          star.x = Phaser.Math.Between(0, gameSize.width);
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
      this.starAnimationKeys = this.animations?.starAnimationKeys() ?? [];

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
      this.audio?.playAudioAsset(newWaveVoiceLineAssetId, { volume: 0.8 });
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
        const x = gameSize.width - 22 - ((maxHeroLives - 1 - index) * heroLifeIconSpacing);
        const y = this.hudTop + 16;
        const silhouette = this.add.image(x, y, this.aiRuntime.key("hero.ship"));
        silhouette.setDisplaySize(heroLifeIconSize, heroLifeIconSize);
        silhouette.setDepth(39);
        silhouette.setTint(0x94a3b8);
        silhouette.setTintMode(Phaser.TintModes.FILL);
        silhouette.setAlpha(0.58);
        this.heroLifeSilhouettes.push(silhouette);

        const icon = this.add.image(
          x,
          y,
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
      this.audio?.playAudioAsset(heroHitSfxAssetId, { volume: 0.55 });
      this.playHeroActionAnimation("hero.ship.hit");
    }

    private playHeroExplosion(): void {
      if (!this.hero || this.heroDestroyed) return;

      this.heroDestroyed = true;
      this.gameActive = false;
      this.startInvaderCelebration();
      this.heroLockedUntil = Number.POSITIVE_INFINITY;
      this.animations?.detachHeroFrameTransformHandler(this.hero);
      this.hero.setFlipX(false);
      this.audio?.playAudioAsset(heroExplosionSfxAssetId, { volume: 0.7 });
      this.audio?.cutGameMusic();
      this.playGameOverEffectThenShowMenu();
      this.animations?.playHeroAnimation(this.hero, "hero.ship.explosion", true);
      this.hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.animations?.detachHeroFrameTransformHandler(this.hero);
        this.hero?.setVisible(false);
        this.hero?.setActive(false);
      });
    }

    private playGameOverEffectThenShowMenu(): void {
      const sound = this.audio?.playAudioAsset(gameOverSfxAssetId, { loop: false, volume: 0.8 });
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

        this.animations?.playInvaderAnimation(invader, invader.invaderType.celebration, true);
      }
    }

    private playHeroAnimation(animationKey: string, forceRestart = false): void {
      this.animations?.playHeroAnimation(this.hero, animationKey, forceRestart);
    }

    private updateLayoutMetrics(): void {
      const safeTop = topSafeInsetForGame(gameSize);
      this.hudTop = safeTop + 12;
      this.hudScoreY = this.hudTop + 28;
      this.playfieldTop = this.hudScoreY + 54;
    }

    private invaderStartX(): number {
      const columnSpacing = 60;
      const columns = 8;

      return (gameSize.width - ((columns - 1) * columnSpacing)) / 2;
    }

    private heroStartY(): number {
      const bottomMargin = options.targetId === "mobilePortrait" ? 170 : 70;

      return gameSize.height - bottomMargin;
    }

    private setupAppLifecycleAudio(): void {
      let isBackgrounded = false;
      const pause = () => {
        if (isBackgrounded) return;

        isBackgrounded = true;
        this.audio?.pauseAll();
      };
      const resume = () => {
        if (!isBackgrounded) return;

        isBackgrounded = false;
        this.audio?.resumeAll();
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          pause();
        } else {
          resume();
        }
      };
      const onPageHide = () => pause();
      const onPageShow = () => resume();

      document.addEventListener("visibilitychange", onVisibilityChange);
      globalThis.addEventListener("pagehide", onPageHide);
      globalThis.addEventListener("pageshow", onPageShow);
      this.removeLifecycleListeners = () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        globalThis.removeEventListener("pagehide", onPageHide);
        globalThis.removeEventListener("pageshow", onPageShow);
      };
    }

    private playHeroActionAnimation(animationKey: string): void {
      const duration = this.animations?.playHeroActionAnimation(this.hero, animationKey, () => {
        if (this.time.now >= this.heroLockedUntil) {
          this.playHeroAnimation("hero.ship.idle");
        }
      }) ?? 0;
      this.heroLockedUntil = this.time.now + duration;
    }

    private scheduleHeroLaser(animationKey: string): void {
      if (!this.hero) return;

      const shooter = this.hero;
      const delayMs = this.animations?.delayUntilTaggedFrame(animationKey, "shoot") ?? 0;

      this.time.delayedCall(delayMs, () => {
        if (!shooter.active || this.animations?.currentHeroAnimationKey !== animationKey) return;

        this.bullets.push(this.animations!.spawnLaser("laser.blue.flicker", shooter.x, shooter.y - 35));
        this.audio?.playAudioAsset(playerLaserSfxAssetId, { volume: 0.55 });
      });
    }

    private scheduleInvaderLaser(
      shooter: Phaser.GameObjects.Sprite,
      animationKey: string
    ): void {
      const delayMs = this.animations?.delayUntilTaggedFrame(animationKey, "shoot") ?? 0;

      this.time.delayedCall(delayMs, () => {
        if (
          this.invadersCelebrating ||
          !shooter.active ||
          this.animations?.invaderAnimationKey(shooter) !== animationKey
        ) {
          return;
        }

        this.invaderBullets.push(this.animations!.spawnLaser("laser.red.flicker", shooter.x, shooter.y + 30));
        this.audio?.playAudioAsset(alienLaserSfxAssetId, { volume: 0.45 });
      });
    }

  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: gameSize.width,
    height: gameSize.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    fps: {
      target: 60,
      limit: 60
    },
    backgroundColor: "#10131a",
    scene: SpaceInvadersScene
  });
}

function gameSizeForTargetBackground(
  manifest: AiAssetManifest,
  targetId: string | undefined
): { width: number; height: number } {
  const backgroundAssetId = targetId
    ? manifest.targets?.[targetId]?.variants["background.space"] ?? "background.space"
    : "background.space";
  const backgroundAsset = manifest.assets[backgroundAssetId] ?? manifest.assets["background.space"];
  const assetWidth = backgroundAsset?.dimensions?.width;
  const assetHeight = backgroundAsset?.dimensions?.height;

  if (!assetWidth || !assetHeight || assetWidth <= 0 || assetHeight <= 0) {
    return { width: 640, height: 640 };
  }

  const aspect = assetWidth / assetHeight;
  if (aspect >= 1) {
    return {
      width: Math.max(640, Math.round(640 * aspect)),
      height: 640
    };
  }

  return {
    width: 640,
    height: Math.max(640, Math.round(640 / aspect))
  };
}

function topSafeInsetForGame(gameSize: { width: number; height: number }): number {
  const viewportWidth = globalThis.visualViewport?.width ?? globalThis.innerWidth ?? gameSize.width;
  const viewportHeight = globalThis.visualViewport?.height ?? globalThis.innerHeight ?? gameSize.height;
  const scale = Math.min(viewportWidth / gameSize.width, viewportHeight / gameSize.height) || 1;
  const cssSafeTop = Math.max(readCssSafeAreaInsetTop(), coarsePointerTopInset());

  return Math.ceil(cssSafeTop / scale);
}

function coarsePointerTopInset(): number {
  return globalThis.matchMedia?.("(pointer: coarse)").matches ? 34 : 0;
}

function readCssSafeAreaInsetTop(): number {
  if (typeof document === "undefined") return 0;

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const value = Number.parseFloat(globalThis.getComputedStyle(probe).paddingTop);
  probe.remove();

  return Number.isFinite(value) ? value : 0;
}
