import Phaser from "phaser";
import {
  AiAssetRuntime,
  createAiAnimations,
} from "@ai-game-assets/phaser";
import type { AiAssetAnimationPlayback } from "@ai-game-assets/phaser";
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
  private heroAnimationPlayback?: AiAssetAnimationPlayback;
  private invaderAnimationSizes = new Map<string, { width: number; height: number }>();
  private invaderAnimations = new Map<string, AiAssetAnimation>();
  private invaderAnimationKeys = new WeakMap<Phaser.GameObjects.Sprite, string>();
  private invaderAnimationPlaybacks = new WeakMap<Phaser.GameObjects.Sprite, AiAssetAnimationPlayback>();

  currentHeroAnimationKey?: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: AiAssetRuntime,
    private readonly assetManifest: AiAssetManifest
  ) {}

  initialize(): void {
    for (const assetId of starAnimationAssetIds) this.createAnimation(assetId);
    for (const assetId of uiAnimationAssetIds) this.createAnimation(assetId);

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
    createAiAnimations(this.scene, this.assetManifest, assetId);
  }

  refreshHeroAnimationAsset(asset: AiAssetDefinition | undefined): void {
    this.registerHeroAnimationSize(asset);
  }

  refreshInvaderAnimationAsset(asset: AiAssetDefinition | undefined): void {
    this.registerInvaderAnimationSize(asset);
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

    this.heroAnimationPlayback?.destroy();
    this.currentHeroAnimationKey = animationKey;
    const size = this.heroAnimationSize(animationKey);
    hero.setDisplaySize(size.width, size.height);
    hero.setOrigin(0.5, 0.5);
    hero.setRotation(0);
    this.heroAnimationPlayback = this.runtime.playAnimation(hero, animationKey, undefined, {
      forceRestart,
      frameTransform: { eventName: Phaser.Animations.Events.ANIMATION_UPDATE },
      frameTransformSize: size
    });
  }

  playHeroActionAnimation(
    hero: Phaser.GameObjects.Sprite | undefined,
    animationKey: string,
    onComplete: () => void
  ): number {
    if (hero) {
      this.heroAnimationPlayback?.destroy();
      hero.setFlipX(false);
      this.currentHeroAnimationKey = animationKey;
      const size = this.heroAnimationSize(animationKey);
      hero.setDisplaySize(size.width, size.height);
      hero.setOrigin(0.5, 0.5);
      hero.setRotation(0);
      this.heroAnimationPlayback = this.runtime.playAnimation(hero, animationKey, undefined, {
        forceRestart: true,
        frameTransform: { eventName: Phaser.Animations.Events.ANIMATION_UPDATE },
        frameTransformSize: size
      });
    }

    hero?.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
    return this.animationDuration(animationKey);
  }

  resetHeroAnimation(): void {
    this.stopHeroAnimation();
    this.currentHeroAnimationKey = undefined;
  }

  stopHeroAnimation(): void {
    this.heroAnimationPlayback?.destroy();
    this.heroAnimationPlayback = undefined;
  }

  playInvaderAnimation(
    invader: Phaser.GameObjects.Sprite,
    animationKey: string,
    randomStartFrame = false
  ): void {
    this.invaderAnimationPlaybacks.get(invader)?.destroy();

    this.invaderAnimationKeys.set(invader, animationKey);
    const size = this.invaderAnimationSize(animationKey);
    invader.setDisplaySize(size.width, size.height);
    invader.setOrigin(0.5, 0.5);
    invader.setRotation(0);
    this.invaderAnimationPlaybacks.set(invader, this.runtime.playAnimation(
      invader,
      animationKey,
      undefined,
      {
        randomFrame: randomStartFrame,
        frameTransform: { eventName: Phaser.Animations.Events.ANIMATION_UPDATE },
        frameTransformSize: size
      }
    ));
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

  private heroAnimationSize(animationKey: string): { width: number; height: number } {
    return this.heroAnimationSizes.get(animationKey) ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
  }

  private invaderAnimationSize(animationKey: string): { width: number; height: number } {
    return this.invaderAnimationSizes.get(animationKey) ??
      this.displaySizeForAsset(this.assetManifest.assets[animationKey]);
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
