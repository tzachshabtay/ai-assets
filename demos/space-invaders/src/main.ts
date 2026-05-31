import Phaser from "phaser";
import {
  AiAssetDebugClient,
  AiAssetRuntime,
  installAiAssetDesigner,
  loadAiAssets,
} from "@ai-game-assets/phaser";
import type { AiAssetManifest } from "@ai-game-assets/core";

const assetApi =
  new URLSearchParams(window.location.search).get("assetApi") ??
  "http://127.0.0.1:3977";
const debugClient = new AiAssetDebugClient(assetApi);

type DemoScene = Phaser.Scene & {
  aiRuntime?: AiAssetRuntime;
  hero?: Phaser.GameObjects.Image;
  invaders?: Phaser.GameObjects.Image[];
  applyAssetTexture?: (assetId: string, textureKey: string) => void;
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
    hero?: Phaser.GameObjects.Image;
    invaders: Phaser.GameObjects.Image[] = [];
    applyAssetTexture?: (assetId: string, textureKey: string) => void;

    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private fireKey?: Phaser.Input.Keyboard.Key;
    private bullets: Phaser.GameObjects.Rectangle[] = [];
    private invaderBullets: Phaser.GameObjects.Rectangle[] = [];
    private lastShotAt = 0;
    private invaderDirection = 1;
    private lastInvaderShotAt = 0;
    private score = 0;
    private scoreText?: Phaser.GameObjects.Text;
    private statusText?: Phaser.GameObjects.Text;

    constructor() {
      super("space-invaders");
    }

    preload() {
      loadAiAssets(this, assetManifest);
    }

    create() {
      sceneRef = this;
      this.aiRuntime = new AiAssetRuntime(this, assetManifest);
      this.cursors = this.input.keyboard?.createCursorKeys();
      this.fireKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

      this.add.rectangle(320, 320, 640, 640, 0x10131a);
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

      this.hero = this.add.image(320, 570, this.aiRuntime.key("hero.ship"));
      this.hero.setDisplaySize(54, 54);
      this.invaders = [];

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const invader = this.add.image(
            112 + col * 60,
            118 + row * 58,
            this.aiRuntime.key("invader.scout")
          );
          invader.setDisplaySize(42, 42);
          this.invaders.push(invader);
        }
      }

      this.applyAssetTexture = (assetId, textureKey) => {
        if (assetId === "hero.ship" && this.hero) {
          this.hero.setTexture(textureKey);
        }

        if (assetId === "invader.scout") {
          for (const invader of this.invaders ?? []) {
            invader.setTexture(textureKey);
          }
        }
      };

      installAiAssetDesigner({
        scene: this,
        manifest: assetManifest,
        client: debugClient,
        assetIds: ["hero.ship", "invader.scout"],
        onPreview: (assetId, textureKey) => {
          this.applyAssetTexture?.(assetId, textureKey);
        }
      });
    }

    update(time: number, delta: number) {
      this.updateHero(delta);
      this.updateBullets(delta);
      this.updateInvaders(delta, time);
      this.updateCollisions();
    }

    private updateHero(delta: number) {
      if (!this.hero || !this.cursors) return;
      if (this.input.keyboard && !this.input.keyboard.enabled) return;

      const speed = 280 * (delta / 1000);
      if (this.cursors.left.isDown) this.hero.x -= speed;
      if (this.cursors.right.isDown) this.hero.x += speed;
      this.hero.x = Phaser.Math.Clamp(this.hero.x, 32, 608);

      if (this.fireKey?.isDown && this.time.now - this.lastShotAt > 220) {
        this.lastShotAt = this.time.now;
        this.bullets.push(this.add.rectangle(this.hero.x, this.hero.y - 35, 4, 18, 0x6ed3ff));
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
      let shouldDrop = false;

      for (const invader of this.invaders) {
        invader.x += step;
        if (invader.x < 45 || invader.x > 595) shouldDrop = true;
      }

      if (shouldDrop) {
        this.invaderDirection *= -1;
        for (const invader of this.invaders) invader.y += 14;
      }

      if (time - this.lastInvaderShotAt > 780) {
        this.lastInvaderShotAt = time;
        const shooter = Phaser.Utils.Array.GetRandom(this.invaders) as Phaser.GameObjects.Image;
        this.invaderBullets.push(this.add.rectangle(shooter.x, shooter.y + 30, 5, 16, 0xfca5a5));
      }
    }

    private updateCollisions() {
      if (!this.hero || !this.invaders) return;

      for (const bullet of [...this.bullets]) {
        for (const invader of [...this.invaders]) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(bullet.getBounds(), invader.getBounds())) {
            bullet.destroy();
            invader.destroy();
            this.bullets = this.bullets.filter((candidate) => candidate !== bullet);
            this.invaders = this.invaders.filter((candidate) => candidate !== invader);
            this.score += 10;
            this.scoreText?.setText(`Score ${this.score}`);
            break;
          }
        }
      }

      for (const bullet of [...this.invaderBullets]) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(bullet.getBounds(), this.hero.getBounds())) {
          bullet.destroy();
          this.invaderBullets = this.invaderBullets.filter((candidate) => candidate !== bullet);
          this.statusText?.setText("Hit. The ship holds.");
        }
      }

      if (this.invaders.length === 0) {
        this.statusText?.setText("Wave cleared.");
      }
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

function keepBullet(bullet: Phaser.GameObjects.Rectangle): boolean {
  if (bullet.y > -20 && bullet.y < 660) {
    return true;
  }

  bullet.destroy();
  return false;
}

boot().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.insertAdjacentHTML("beforeend", `<pre>${message}</pre>`);
  throw error;
});
