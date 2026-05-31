export type PhaserLoaderLike = {
  image(key: string, url: string): unknown;
  svg?(
    key: string,
    url: string,
    config?: {
      width?: number;
      height?: number;
    }
  ): unknown;
  spritesheet(
    key: string,
    url: string,
    config: {
      frameWidth: number;
      frameHeight: number;
      margin?: number;
      spacing?: number;
    }
  ): unknown;
};

export type PhaserTextureManagerLike = {
  exists(key: string): boolean;
  remove(key: string): unknown;
};

export type PhaserAnimationsLike = {
  create(config: unknown): unknown;
  generateFrameNumbers(
    key: string,
    config: { frames: number[] }
  ): unknown;
};

export type PhaserSceneLike = {
  load: PhaserLoaderLike;
  textures?: PhaserTextureManagerLike;
  anims?: PhaserAnimationsLike;
};

export type PhaserImageLike = {
  setTexture(key: string, frame?: string | number): unknown;
};
