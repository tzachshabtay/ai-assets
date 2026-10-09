import { installInGameDesignerViewport, type InGameDesignerViewportOptions } from '@ai-game-assets/core';

export type DesignerViewportSceneLike = {
  game?: { canvas?: HTMLCanvasElement };
  scale?: { refresh(): unknown; gameSize?: { width: number; height: number } };
  events?: {
    once(event: string, callback: () => void): unknown;
    off(event: string, callback: () => void): unknown;
  };
};

/** Defaults to the Phaser canvas host. Custom shells can supply their layout. */
export type AiAssetDesignerViewportOptions = false | (Partial<Pick<InGameDesignerViewportOptions, 'target'>> & Omit<InGameDesignerViewportOptions, 'target'>);

export function installAiAssetDesignerViewport(scene: DesignerViewportSceneLike, options?: AiAssetDesignerViewportOptions) {
  if (options === false) return undefined;
  const target = options?.target ?? scene.game?.canvas?.parentElement;
  if (!target) return undefined;
  const size = scene.scale?.gameSize;
  const viewport = installInGameDesignerViewport({
    target,
    aspectRatio: size && size.height > 0 ? size.width / size.height : undefined,
    ...options,
    onResize: () => { scene.scale?.refresh(); options?.onResize?.(); },
  });
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events?.off('shutdown', destroy);
    viewport.destroy();
  };
  scene.events?.once('shutdown', destroy);
  return { ...viewport, destroy };
}
