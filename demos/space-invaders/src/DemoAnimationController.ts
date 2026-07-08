import Phaser from "phaser";
import {
  AiAssetRuntime,
  applyAiAnimationFrameTransform,
  createAiAnimations,
} from "@ai-game-assets/phaser";
import type { AiAssetAnimation, AiAssetDefinition, AiAssetManifest } from "@ai-game-assets/core";
import {
  invaderAnimationAssetIds,
  laserAnimationAssetIds,
  laserHitDisplaySizes,
  starAnimationAssetIds,
  uiAnimationAssetIds,
} from "./assetConfig.js";
import type { LaserSprite } from "./assetConfig.js";

export class DemoAnimationController {
  private heroAnimationSizes = new Map<string, { width: number; height: number }>();
  private heroAnimations = new Map<string, AiAssetAnimation>();
  private heroFrameTransformHandler?: (...args: unknown[]) => void;
  private invaderAnimationSizes = new Map<string, { width: number; height: number }>();
  private invaderAnimations = new Map<string, AiAssetAnimation>();
  private invaderAnimationKeys = new WeakMap<Phaser.GameObjects.Sprite, string>();
  private invaderFrameOffsetHandlers = new WeakMap<
    Phaser.GameObjects.Sprite,
    (...args: unknown[]) => void
  >();

  currentHeroAnimationKey?: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: AiAssetRuntime,
    private readonly assetManifest: AiAssetManifest
  ) {}

  initialize(): void {
    this.createAnimation("hero.ship.idle");
    this.createAnimation("hero.ship.moving-left");
    this.createAnimation("hero.ship.shooting");
    this.createAnimation("hero.ship.hit");
    this.createAnimation("hero.ship.explosion");
    for (const assetId of starAnimationAssetIds) this.createAnimation(assetId);
    for (const assetId of laserAnimationAssetIds) this.createAnimation(assetId);
    for (const assetId of uiAnimationAssetIds) this.createAnimation(assetId);
    for (const assetId of invaderAnimationAssetIds) this.createAnimation(assetId);

    this.registerHeroAnimationSize(this.assetManifest.assets["hero.ship.idle"]);
    this.registerHeroAnimationSize(this.assetManifest.assets["hero.ship.moving-left"]);
    this.registerHeroAnimationSize(this.assetManifest.assets["hero.ship.shooting"]);
    this.registerHeroAnimationSize(this.assetManifest.assets["hero.ship.hit"]);
    this.registerHeroAnimationSize(this.assetManifest.assets["hero.ship.explosion"]);
    for (const assetId of invaderAnimationAssetIds) {
      this.registerInvaderAnimationSize(this.assetManifest.assets[assetId]);
    }
  }

  private createAnimation(assetId: string): void {
    createAiAnimations(this.scene, this.assetManifest, assetId, {
      onFrameTransforms: "ignore"
    });
  }

  recreateHeroAnimations(
    assetId: string,
    textureKey: string,
    asset = this.assetManifest.assets[assetId]
  ): string[] {
    const keys = this.recreateAnimations(textureKey, asset);
    this.registerHeroAnimationSize(asset);
    return keys;
  }

  recreateInvaderAnimations(
    assetId: string,
    textureKey: string,
    asset = this.assetManifest.assets[assetId]
  ): string[] {
    const keys = this.recreateAnimations(textureKey, asset);
    this.registerInvaderAnimationSize(asset);
    return keys;
  }

  recreateAnimations(
    textureKey: string,
    asset: AiAssetDefinition | undefined
  ): string[] {
    const animationKeys: string[] = [];

    for (const animation of asset?.animations ?? []) {
      this.scene.anims.remove(animation.key);
      this.scene.anims.create({
        key: animation.key,
        frames: this.animationFramesWithTiming(textureKey, animation),
        frameRate: animation.frameRate,
        repeat: animation.repeat ?? -1
      });
      animationKeys.push(animation.key);
    }

    return animationKeys;
  }

  starAnimationKeys(): string[] {
    return starAnimationAssetIds.flatMap((assetId) =>
      this.assetManifest.assets[assetId]?.animations?.map((animation) => animation.key) ?? []
    );
  }

  playHeroAnimation(
    hero: Phaser.GameObjects.Sprite | undefined,
    animationKey: string,
    forceRestart = false
  ): void {
    if (!hero || (!forceRestart && this.currentHeroAnimationKey === animationKey)) return;

    this.detachHeroFrameTransformHandler(hero);
    this.currentHeroAnimationKey = animationKey;
    hero.play(animationKey);
    this.applyHeroFrameTransform(hero, animationKey, 0);
    this.attachHeroFrameTransformHandler(hero, animationKey);
  }

  playHeroActionAnimation(
    hero: Phaser.GameObjects.Sprite | undefined,
    animationKey: string,
    onComplete: () => void
  ): number {
    if (hero) {
      this.detachHeroFrameTransformHandler(hero);
      hero.setFlipX(false);
      this.currentHeroAnimationKey = animationKey;
      hero.play(animationKey, true);
      this.applyHeroFrameTransform(hero, animationKey, 0);
      this.attachHeroFrameTransformHandler(hero, animationKey);
    }

    hero?.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
    return this.animationDuration(animationKey);
  }

  detachHeroFrameTransformHandler(hero: Phaser.GameObjects.Sprite | undefined): void {
    if (hero && this.heroFrameTransformHandler) {
      hero.off(Phaser.Animations.Events.ANIMATION_UPDATE, this.heroFrameTransformHandler);
    }

    this.heroFrameTransformHandler = undefined;
  }

  resetHeroAnimation(): void {
    this.currentHeroAnimationKey = undefined;
  }

  playInvaderAnimation(
    invader: Phaser.GameObjects.Sprite,
    animationKey: string,
    randomStartFrame = false
  ): void {
    const existingHandler = this.invaderFrameOffsetHandlers.get(invader);

    if (existingHandler) {
      invader.off(Phaser.Animations.Events.ANIMATION_UPDATE, existingHandler);
    }

    this.invaderAnimationKeys.set(invader, animationKey);
    invader.play(randomStartFrame ? { key: animationKey, randomFrame: true } : animationKey);
    this.applyInvaderAnimationSize(invader, animationKey);
    const currentFrame = invader.anims.currentFrame as { index?: number } | undefined;
    this.applyInvaderFrameTransform(
      invader,
      animationKey,
      Math.max(0, (currentFrame?.index ?? 1) - 1)
    );

    const handler = (...args: unknown[]) => {
      const frame = args[1] as { index?: number } | undefined;
      this.applyInvaderFrameTransform(invader, animationKey, Math.max(0, (frame?.index ?? 1) - 1));
    };

    this.invaderFrameOffsetHandlers.set(invader, handler);
    invader.on(Phaser.Animations.Events.ANIMATION_UPDATE, handler);
  }

  invaderAnimationKey(invader: Phaser.GameObjects.Sprite): string | undefined {
    return this.invaderAnimationKeys.get(invader);
  }

  spawnLaser(animationKey: string, x: number, y: number): LaserSprite {
    const asset = this.assetManifest.assets[animationKey];
    const laser = this.scene.add.sprite(x, y, this.runtime.key(animationKey));
    const size = this.displaySizeForAsset(asset);
    laser.setDisplaySize(size.width, size.height);
    laser.setDepth(8);
    this.runtime.playAnimation(laser, animationKey, undefined, {
      frameTransform: { eventName: Phaser.Animations.Events.ANIMATION_UPDATE },
      frameTransformSize: size
    });

    return laser;
  }

  spawnLaserHit(animationKey: string, x: number, y: number): void {
    const size = laserHitDisplaySizes[animationKey] ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
    const hit = this.scene.add.sprite(x, y, this.runtime.key(animationKey));
    let playback: { destroy(): void } | undefined;
    const fallbackDestroy = this.scene.time.delayedCall(
      this.animationDuration(animationKey) + 80,
      () => {
        playback?.destroy();
        hit.destroy();
      }
    );

    hit.setDisplaySize(size.width, size.height);
    hit.setOrigin(0.5, animationKey === "laser.red.hit" ? 1 : 0);
    hit.setDepth(20);
    playback = this.runtime.playAnimation(
      hit,
      animationKey,
      undefined,
      {
        forceRestart: true,
        frameTransform: {
          eventName: Phaser.Animations.Events.ANIMATION_UPDATE,
          originY: animationKey === "laser.red.hit" ? 1 : 0
        },
        frameTransformSize: size
      }
    );
    hit.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      fallbackDestroy.remove(false);
      playback?.destroy();
      hit.destroy();
    });
  }

  delayUntilTaggedFrame(animationKey: string, tag: string): number {
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

  animationDuration(animationKey: string): number {
    const animation = this.animationForKey(animationKey);

    if (!animation) return 0;

    const defaultDelay = Math.round(1000 / animation.frameRate);

    return animation.frames.reduce((total, _frame, index) => (
      total + (animation.frameTimings?.[index]?.delayMs ?? defaultDelay)
    ), 0);
  }

  applyDisplaySize(
    target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    asset: AiAssetDefinition | undefined
  ): void {
    const size = this.displaySizeForAsset(asset);
    target.setDisplaySize(size.width, size.height);
  }

  displaySizeForAsset(asset: AiAssetDefinition | undefined): {
    width: number;
    height: number;
  } {
    return {
      width: asset?.frameGrid?.frameWidth ?? asset?.dimensions?.width ?? 42,
      height: asset?.frameGrid?.frameHeight ?? asset?.dimensions?.height ?? 42
    };
  }

  private registerHeroAnimationSize(asset: AiAssetDefinition | undefined): void {
    const size = this.displaySizeForAsset(asset);

    for (const animation of asset?.animations ?? []) {
      this.heroAnimationSizes.set(animation.key, size);
      this.heroAnimations.set(animation.key, animation);
    }
  }

  private registerInvaderAnimationSize(asset: AiAssetDefinition | undefined): void {
    const size = this.displaySizeForAsset(asset);

    for (const animation of asset?.animations ?? []) {
      this.invaderAnimationSizes.set(animation.key, size);
      this.invaderAnimations.set(animation.key, animation);
    }
  }

  private applyHeroFrameTransform(
    hero: Phaser.GameObjects.Sprite,
    animationKey: string,
    frameSlot: number
  ): void {
    const size = this.heroAnimationSizes.get(animationKey) ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
    this.applyFrameTransform(hero, animationKey, frameSlot, size);
  }

  private applyInvaderAnimationSize(
    invader: Phaser.GameObjects.Sprite,
    animationKey: string
  ): void {
    const size = this.invaderAnimationSizes.get(animationKey) ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
    invader.setDisplaySize(size.width, size.height);
    invader.setRotation(0);
  }

  private applyInvaderFrameTransform(
    invader: Phaser.GameObjects.Sprite,
    animationKey: string,
    frameSlot: number
  ): void {
    const size = this.invaderAnimationSizes.get(animationKey) ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
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

  private attachHeroFrameTransformHandler(
    hero: Phaser.GameObjects.Sprite,
    animationKey: string
  ): void {
    this.heroFrameTransformHandler = (...args: unknown[]) => {
      const frame = args[1] as { index?: number } | undefined;
      this.applyHeroFrameTransform(hero, animationKey, Math.max(0, (frame?.index ?? 1) - 1));
    };
    hero.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.heroFrameTransformHandler);
  }

  private animationFramesWithTiming(
    textureKey: string,
    animation: AiAssetAnimation
  ): Phaser.Types.Animations.AnimationFrame[] {
    return this.scene.anims.generateFrameNumbers(textureKey, {
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
      .flatMap((assetId) => this.assetManifest.assets[assetId]?.animations ?? [])
      .find((animation) => animation.key === animationKey) ??
      laserAnimationAssetIds
      .flatMap((assetId) => this.assetManifest.assets[assetId]?.animations ?? [])
      .find((animation) => animation.key === animationKey) ??
      this.assetManifest.assets[animationKey]?.animations
      ?.find((animation) => animation.key === animationKey);
  }
}
