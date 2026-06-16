import Phaser from "phaser";
import type { AiAssetDefinition, AiAssetManifest } from "@ai-game-assets/core";

export type InvaderType = {
  base: string;
  idle: string;
  shooting: string;
  destroyed: string;
  celebration: string;
};

export type StarSprite = Phaser.GameObjects.Sprite & {
  starSpeed: number;
  starAnimationKey: string;
};

export type InvaderSprite = Phaser.GameObjects.Sprite & {
  invaderType: InvaderType;
};

export type LaserSprite = Phaser.GameObjects.Sprite;

export const invaderTypes: InvaderType[] = [
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

export const invaderBaseAssetIds = invaderTypes.map((type) => type.base);
export const invaderAnimationAssetIds = invaderTypes.flatMap((type) => [
  type.idle,
  type.shooting,
  type.destroyed,
  type.celebration
]);

export const starAnimationAssetIds = [
  "background.stars.twinkle-white",
  "background.stars.blue-pulse",
  "background.stars.gold-flare",
  "background.stars.violet-blink",
  "background.stars.green-shimmer"
];

export const laserAnimationAssetIds = [
  "laser.blue.flicker",
  "laser.blue.hit",
  "laser.red.flicker",
  "laser.red.hit"
];

export const uiAnimationAssetIds = [
  "ui.button.idle",
  "ui.button.hover",
  "ui.button.clicked"
];

export const playerLaserSfxAssetId = "audio.sfx.player-laser";
export const invaderExplosionSfxAssetId = "audio.sfx.invader-explosion";
export const alienLaserSfxAssetId = "audio.sfx.alien-laser";
export const heroHitSfxAssetId = "audio.sfx.hero-hit";
export const heroExplosionSfxAssetId = "audio.sfx.hero-explosion";
export const gameOverSfxAssetId = "audio.sfx.game-over";
export const menuMusicAssetId = "audio.music.menu";
export const gameMusicAssetId = "audio.music.game";
export const newWaveVoiceLineAssetId = "voice.line.new-wave";
export const musicFadeDurationMs = 1200;

export const laserHitDisplaySizes: Record<string, { width: number; height: number }> = {
  "laser.blue.hit": { width: 18, height: 18 },
  "laser.red.hit": { width: 18, height: 18 }
};

export const maxHeroLives = 5;
export const heroLifeIconSize = 30;
export const heroLifeIconSpacing = 34;
export const invaderHeroReachPadding = 8;
export const invaderBaseSpeed = 42;
export const invaderWaveSpeedIncrease = 0.3;
export const invaderLaserBaseSpeed = 210;
export const invaderLaserWaveSpeedIncrease = 0.125;
export const menuButtonSize = { width: 190, height: 58 };
export const menuPanelSize = { width: 400, height: 400 };
export const menuTitleY = -144;
export const menuSingleButtonY = -54;
export const menuPauseResumeButtonY = -70;
export const menuPauseNewGameButtonY = -8;
export const menuVolumeSlider = { y: 72, width: 190 };

export function loadMasterVolume(): number {
  const stored = globalThis.localStorage?.getItem("ai-assets-invaders.master-volume");
  const value = stored === null || stored === undefined ? 1 : Number(stored);

  return Number.isFinite(value) ? Phaser.Math.Clamp(value, 0, 1) : 1;
}

export function saveMasterVolume(volume: number): void {
  globalThis.localStorage?.setItem(
    "ai-assets-invaders.master-volume",
    String(Phaser.Math.Clamp(volume, 0, 1))
  );
}

export function soundOnlyManifest(manifest: AiAssetManifest): AiAssetManifest {
  return {
    ...manifest,
    assets: Object.fromEntries(
      Object.entries(manifest.assets).filter(([, asset]) => asset.kind === "sound")
    )
  };
}

export function isRuntimeAudioAsset(asset: AiAssetDefinition): boolean {
  return asset.kind === "sound" ||
    asset.kind === "music" ||
    asset.kind === "voice-line";
}

export function keepBullet(bullet: LaserSprite): boolean {
  if (bullet.y > -20 && bullet.y < 660) {
    return true;
  }

  bullet.destroy();
  return false;
}
