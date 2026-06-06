import type { AiAssetAnimation } from "@ai-game-assets/core";

export type AiAssetFrameTransformSize = {
  width: number;
  height: number;
};

export type AiAssetFrameTransformTarget = {
  setDisplaySize(width: number, height: number): unknown;
  setOrigin(x: number, y: number): unknown;
  setRotation(radians: number): unknown;
  on?(eventName: string, handler: (...args: unknown[]) => void): unknown;
  off?(eventName: string, handler: (...args: unknown[]) => void): unknown;
};

export type AiAssetFrameTransformOptions = {
  originX?: number;
  originY?: number;
  eventName?: string;
};

export type AiAssetFrameTransformBinding = {
  apply(frameSlot: number): void;
  detach(): void;
};

const defaultAnimationUpdateEventName = "animationupdate";

export function applyAiAnimationFrameTransform(
  target: AiAssetFrameTransformTarget,
  animation: AiAssetAnimation | undefined,
  frameSlot: number,
  size: AiAssetFrameTransformSize,
  options: AiAssetFrameTransformOptions = {}
): void {
  const normalizedFrameSlot = Math.max(0, frameSlot);
  const timing = animation?.frameTimings?.[normalizedFrameSlot];
  const offsetX = timing?.offsetX ?? 0;
  const offsetY = timing?.offsetY ?? 0;
  const scaleX = timing?.scaleX ?? 1;
  const scaleY = timing?.scaleY ?? 1;
  const rotation = timing?.rotation ?? 0;
  const originX = options.originX ?? 0.5;
  const originY = options.originY ?? 0.5;

  target.setDisplaySize(size.width * scaleX, size.height * scaleY);
  target.setOrigin(
    originX - offsetX / Math.max(1, size.width),
    originY - offsetY / Math.max(1, size.height)
  );
  target.setRotation(rotation * Math.PI / 180);
}

export function bindAiAnimationFrameTransforms(
  target: AiAssetFrameTransformTarget,
  animation: AiAssetAnimation | undefined,
  size: AiAssetFrameTransformSize,
  options: AiAssetFrameTransformOptions = {}
): AiAssetFrameTransformBinding {
  const eventName = options.eventName ?? defaultAnimationUpdateEventName;
  const handler = (...args: unknown[]) => {
    const frame = args[1] as { index?: number } | undefined;

    applyAiAnimationFrameTransform(
      target,
      animation,
      Math.max(0, (frame?.index ?? 1) - 1),
      size,
      options
    );
  };

  applyAiAnimationFrameTransform(target, animation, 0, size, options);
  target.on?.(eventName, handler);

  return {
    apply(frameSlot: number) {
      applyAiAnimationFrameTransform(target, animation, frameSlot, size, options);
    },
    detach() {
      target.off?.(eventName, handler);
    }
  };
}
