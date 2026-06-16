import Phaser from "phaser";
import { loadAiAudioAsset, loadAiAudioAssets } from "@ai-game-assets/phaser";
import type { AiAssetDefinition, AiAssetManifest } from "@ai-game-assets/core";
import {
  gameMusicAssetId,
  menuMusicAssetId,
  musicFadeDurationMs,
  newWaveVoiceLineAssetId,
  soundOnlyManifest,
} from "./assetConfig.js";

export class DemoAudioController {
  private menuMusic?: Phaser.Sound.BaseSound;
  private gameMusic?: Phaser.Sound.BaseSound;
  private menuMusicVolume = 0;
  private gameMusicVolume = 0;
  private musicMode: "menu" | "game" = "menu";
  private musicFadeEvent?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly assetManifest: AiAssetManifest,
    private readonly playbackOverrides: Map<string, AiAssetDefinition["audioPlayback"]>
  ) {}

  get mode(): "menu" | "game" {
    return this.musicMode;
  }

  setPlaybackOverride(assetId: string, playback: AiAssetDefinition["audioPlayback"]): void {
    this.playbackOverrides.set(assetId, playback);
  }

  syncMusicTrackVolumes(): void {
    this.setMusicTrackVolume(menuMusicAssetId, this.menuMusicVolume);
    this.setMusicTrackVolume(gameMusicAssetId, this.gameMusicVolume);
  }

  playAudioAsset(
    assetId: string,
    config?: Phaser.Types.Sound.SoundConfig
  ): Phaser.Sound.BaseSound | undefined {
    if (!this.scene.cache.audio.exists(assetId)) return undefined;

    const playback = this.playbackForAudioAsset(assetId);
    const rate = playback.playbackRate ?? config?.rate ?? 1;
    const seek = playback.trimStartSeconds ?? config?.seek ?? 0;
    const loop = config?.loop ?? playback.loop;
    const sound = this.scene.sound.add(assetId);

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
          this.scene.time.delayedCall(
            ((playback.trimEndSeconds! - seek) / Math.max(0.01, rate)) * 1000,
            stopOrLoop
          );
          return;
        }

        sound.stop();
      };
      this.scene.time.delayedCall(
        ((playback.trimEndSeconds - seek) / Math.max(0.01, rate)) * 1000,
        stopOrLoop
      );
    }

    return sound;
  }

  loadSoundAssets(): void {
    const loaded = loadAiAudioAssets(this.scene, soundOnlyManifest(this.assetManifest));
    const voiceLine = this.assetManifest.assets[newWaveVoiceLineAssetId];

    if (voiceLine?.versions[voiceLine.activeVersion]?.file) {
      loaded.push(loadAiAudioAsset(this.scene, this.assetManifest, newWaveVoiceLineAssetId)!);
    }

    if (loaded.length > 0) this.scene.load.start();
  }

  loadMusicAssets(): void {
    const musicAssets = [menuMusicAssetId, gameMusicAssetId]
      .map((assetId) => this.assetManifest.assets[assetId])
      .filter((asset): asset is AiAssetDefinition => Boolean(asset));
    const assetsToLoad = musicAssets.filter((asset) => {
      const version = asset.versions[asset.activeVersion];

      return Boolean(version?.file) && !this.scene.cache.audio.exists(asset.id);
    });

    if (assetsToLoad.length === 0) {
      this.fadeMusicTo(this.musicMode, 0);
      return;
    }

    for (const asset of assetsToLoad) {
      const version = asset.versions[asset.activeVersion];
      if (version?.file) this.scene.load.audio(asset.id, version.file);
    }

    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.fadeMusicTo(this.musicMode, 0);
    });
    this.scene.load.start();
  }

  fadeMusicTo(mode: "menu" | "game", durationMs = musicFadeDurationMs): void {
    this.musicMode = mode;
    this.ensureMusicTracks();
    this.musicFadeEvent?.remove(false);

    const startTime = this.scene.time.now;
    const startMenuVolume = this.menuMusicVolume;
    const startGameVolume = this.gameMusicVolume;
    const targetMenuVolume = mode === "menu" ? this.targetMusicVolume(menuMusicAssetId) : 0;
    const targetGameVolume = mode === "game" ? this.targetMusicVolume(gameMusicAssetId) : 0;

    if (durationMs <= 0) {
      this.setMusicTrackVolume(menuMusicAssetId, targetMenuVolume);
      this.setMusicTrackVolume(gameMusicAssetId, targetGameVolume);
      return;
    }

    this.musicFadeEvent = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const progress = Phaser.Math.Clamp((this.scene.time.now - startTime) / durationMs, 0, 1);
        this.setMusicTrackVolume(
          menuMusicAssetId,
          Phaser.Math.Linear(startMenuVolume, targetMenuVolume, progress)
        );
        this.setMusicTrackVolume(
          gameMusicAssetId,
          Phaser.Math.Linear(startGameVolume, targetGameVolume, progress)
        );

        if (progress >= 1) {
          this.musicFadeEvent?.remove(false);
          this.musicFadeEvent = undefined;
        }
      }
    });
  }

  cutGameMusic(): void {
    this.musicFadeEvent?.remove(false);
    this.musicFadeEvent = undefined;
    this.ensureMusicTracks();
    this.setMusicTrackVolume(gameMusicAssetId, 0);
    this.setMusicTrackVolume(menuMusicAssetId, 0);
  }

  restartMusicTrack(assetId: string): void {
    if (assetId === menuMusicAssetId) {
      this.menuMusic?.stop();
      this.menuMusic?.destroy();
      this.menuMusic = undefined;
      this.menuMusicVolume = 0;
    } else if (assetId === gameMusicAssetId) {
      this.gameMusic?.stop();
      this.gameMusic?.destroy();
      this.gameMusic = undefined;
      this.gameMusicVolume = 0;
    }

    this.ensureMusicTracks();
    this.fadeMusicTo(this.musicMode, 0);
  }

  refreshAudioAsset(
    assetId: string,
    source: string,
    onReady?: () => void
  ): void {
    if (!source) return;

    const audioCache = this.scene.cache.audio as Phaser.Cache.BaseCache & {
      remove?: (key: string) => unknown;
    };

    if (audioCache.exists(assetId)) {
      audioCache.remove?.(assetId);
    }

    this.scene.load.audio(assetId, source);
    if (onReady) {
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, onReady);
    }
    this.scene.load.start();
  }

  private playbackForAudioAsset(assetId: string): NonNullable<AiAssetDefinition["audioPlayback"]> {
    const asset = this.assetManifest.assets[assetId];
    const version = asset?.versions[asset.activeVersion];

    return {
      ...asset?.audioPlayback,
      ...version?.audioPlayback,
      ...this.playbackOverrides.get(assetId)
    };
  }

  private targetMusicVolume(assetId: string): number {
    return Phaser.Math.Clamp(this.playbackForAudioAsset(assetId)?.volume ?? 1, 0, 1);
  }

  private ensureMusicTracks(): void {
    if (!this.menuMusic) {
      this.menuMusic = this.createLoopingMusicTrack(menuMusicAssetId, this.menuMusicVolume);
    }
    if (!this.gameMusic) {
      this.gameMusic = this.createLoopingMusicTrack(gameMusicAssetId, this.gameMusicVolume);
    }
  }

  private createLoopingMusicTrack(
    assetId: string,
    volume: number
  ): Phaser.Sound.BaseSound | undefined {
    if (!this.scene.cache.audio.exists(assetId)) return undefined;

    const playback = this.playbackForAudioAsset(assetId);
    const sound = this.scene.sound.add(assetId);
    sound.play({
      loop: true,
      rate: playback.playbackRate ?? 1,
      seek: playback.trimStartSeconds ?? 0,
      volume
    });

    return sound;
  }

  private setMusicTrackVolume(assetId: string, volume: number): void {
    const clampedVolume = Phaser.Math.Clamp(volume, 0, 1);
    const sound = assetId === menuMusicAssetId ? this.menuMusic : this.gameMusic;

    if (assetId === menuMusicAssetId) {
      this.menuMusicVolume = clampedVolume;
    } else {
      this.gameMusicVolume = clampedVolume;
    }

    const adjustableSound = sound as (Phaser.Sound.BaseSound & {
      setVolume?: (value: number) => Phaser.Sound.BaseSound;
      volume?: number;
    }) | undefined;
    if (adjustableSound?.setVolume) {
      adjustableSound.setVolume(clampedVolume);
    } else if (adjustableSound) {
      adjustableSound.volume = clampedVolume;
    }
  }
}
