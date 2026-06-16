import Phaser from "phaser";

export class SpritePixelCollision {
  private readonly localPoint = new Phaser.Math.Vector2();

  constructor(private readonly scene: Phaser.Scene) {}

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

    const alpha = this.scene.textures.getPixelAlpha(
      pixelX,
      pixelY,
      sprite.texture.key,
      frame.name
    );

    return (alpha ?? 0) >= 16;
  }
}
