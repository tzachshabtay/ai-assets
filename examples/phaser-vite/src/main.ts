import { AiAssetRuntime, createAiAnimations, loadAiAssets } from "@ai-game-assets/phaser";
import { assets } from "./assets.js";

type PhaserScene = {
  load: {
    image(key: string, url: string): unknown;
    spritesheet(key: string, url: string, config: unknown): unknown;
  };
  anims: {
    create(config: unknown): unknown;
    generateFrameNumbers(key: string, config: { frames: number[] }): unknown;
  };
  add: {
    image(x: number, y: number, key: string): unknown;
  };
};

export function preload(scene: PhaserScene): void {
  loadAiAssets(scene, assets);
}

export function create(scene: PhaserScene): void {
  const aiAssets = new AiAssetRuntime(scene, assets);

  createAiAnimations(scene, assets, "slime.walk");
  scene.add.image(100, 100, aiAssets.key("hero.idle"));
}
