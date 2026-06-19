import Phaser from "phaser";

type AlphaMask = {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
};

export class SpritePixelCollision {
  private readonly localPoint = new Phaser.Math.Vector2();
  private readonly masks = new Map<string, AlphaMask>();
  private readonly scratchCanvas = document.createElement("canvas");
  private readonly scratchContext = this.scratchCanvas.getContext("2d", { willReadFrequently: true });

  constructor(private readonly scene: Phaser.Scene) {}

  invalidateTexture(textureKey: string): void {
    for (const key of this.masks.keys()) {
      if (key.startsWith(`${textureKey}:`)) this.masks.delete(key);
    }
  }

  point(
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
    const localPoint = sprite.getLocalPoint(worldX, worldY, this.localPoint);
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

    const alpha = this.alphaAt(sprite.texture.key, frame, pixelX, pixelY);

    return (alpha ?? 0) >= 16;
  }

  private alphaAt(
    textureKey: string,
    frame: Phaser.Textures.Frame,
    pixelX: number,
    pixelY: number
  ): number {
    const mask = this.maskForFrame(textureKey, frame);
    return mask.alpha[(pixelY * mask.width) + pixelX] ?? 0;
  }

  private maskForFrame(textureKey: string, frame: Phaser.Textures.Frame): AlphaMask {
    const frameKey = `${textureKey}:${String(frame.name)}`;
    const cached = this.masks.get(frameKey);

    if (cached) return cached;

    const mask = this.createMask(textureKey, frame);
    this.masks.set(frameKey, mask);
    return mask;
  }

  private createMask(textureKey: string, frame: Phaser.Textures.Frame): AlphaMask {
    const width = Math.max(1, Math.floor(frame.width));
    const height = Math.max(1, Math.floor(frame.height));
    const alpha = new Uint8ClampedArray(width * height);
    const sourceImage = frame.source.image;

    if (sourceImage && this.scratchContext) {
      this.scratchCanvas.width = width;
      this.scratchCanvas.height = height;
      this.scratchContext.clearRect(0, 0, width, height);
      this.scratchContext.drawImage(
        sourceImage,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        0,
        0,
        width,
        height
      );

      const pixels = this.scratchContext.getImageData(0, 0, width, height).data;
      for (let index = 0; index < alpha.length; index += 1) {
        alpha[index] = pixels[(index * 4) + 3] ?? 0;
      }

      return { width, height, alpha };
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        alpha[(y * width) + x] = this.scene.textures.getPixelAlpha(x, y, textureKey, frame.name) ?? 0;
      }
    }

    return { width, height, alpha };
  }
}
