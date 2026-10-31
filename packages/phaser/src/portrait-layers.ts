import type { AiAssetFrameGrid, AiMouthSet, AiPortraitEyes, AiPortraitEyePose, AiPortraitRegion } from '@ai-game-assets/core';

/** Replace regions, never alpha-over the original eyes/lips (which would ghost). */
export function drawPortraitLayers(canvas: HTMLCanvasElement, options: {
  mouth: CanvasImageSource; grid: AiAssetFrameGrid; mouthSet: AiMouthSet; frame: number;
  base?: CanvasImageSource; layered?: boolean;
  eyes?: { image: CanvasImageSource; grid: AiAssetFrameGrid; settings: AiPortraitEyes; pose: AiPortraitEyePose };
}): boolean {
  const { grid, mouthSet } = options;
  if (canvas.width !== grid.frameWidth) canvas.width = grid.frameWidth;
  if (canvas.height !== grid.frameHeight) canvas.height = grid.frameHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const cell = (g: AiAssetFrameGrid, frame: number) => ({
    x: (g.margin ?? 0) + frame % g.columns * (g.frameWidth + (g.spacing ?? 0)),
    y: (g.margin ?? 0) + Math.floor(frame / g.columns) * (g.frameHeight + (g.spacing ?? 0)),
  });
  const crop = (image: CanvasImageSource, g: AiAssetFrameGrid, frame: number, r: AiPortraitRegion) => {
    const origin = cell(g, frame);
    ctx.clearRect(r.x,r.y,r.width,r.height);
    ctx.drawImage(image,origin.x+r.x,origin.y+r.y,r.width,r.height,r.x,r.y,r.width,r.height);
  };
  if (options.layered && options.base && mouthSet.editRegion) {
    // The source artwork stays intact; these are independent, pixel-exact render layers.
    ctx.drawImage(options.base,0,0,canvas.width,canvas.height);
    crop(options.mouth,grid,options.frame,mouthSet.editRegion);
    if (options.eyes) {
      const { image, grid: eyeGrid, settings, pose } = options.eyes;
      if (eyeGrid.frameWidth === canvas.width && eyeGrid.frameHeight === canvas.height) crop(image,eyeGrid,settings.frames[pose],settings.region);
    }
    return true;
  }
  const origin=cell(grid,options.frame);
  ctx.drawImage(options.mouth,origin.x,origin.y,grid.frameWidth,grid.frameHeight,0,0,canvas.width,canvas.height);
  return false;
}

/** Ambient facial motion has its own clock; speech/seek never resets it. */
export class PortraitEyeMotion {
  private time = 0;
  private nextBlink = 2;
  private nextGaze = 4;
  private blinkStart = -Infinity;
  private gazeEnd = 0;
  private gaze: AiPortraitEyePose = 'open';
  constructor(private random: () => number = Math.random) {}
  reset(): void { this.time=0;this.nextBlink=2+this.random();this.nextGaze=4+this.random()*2;this.blinkStart=-Infinity;this.gazeEnd=0;this.gaze='open'; }
  update(delta: number, settings?: AiPortraitEyes): AiPortraitEyePose {
    if (!settings) return 'open';
    this.time += Math.max(0, Math.min(.1,delta));
    const between = (range: [number,number]) => range[0]+this.random()*(range[1]-range[0]);
    if (settings.blink !== false && this.time >= this.nextBlink) {
      this.blinkStart=this.time;
      this.nextBlink=this.time+between(settings.blinkInterval??[3,6]);
    }
    if (settings.gaze !== false && this.time >= this.nextGaze) {
      this.gaze=this.random()<.5?'left':'right';this.gazeEnd=this.time+between([.6,1.2]);
      this.nextGaze=this.time+between(settings.gazeInterval??[5,9]);
    }
    const blink=(this.time-this.blinkStart)/(settings.blinkDuration??.22);
    if (settings.blink !== false && blink>=0 && blink<1) return blink<.25||blink>.75?'half':'closed';
    return settings.gaze !== false && this.time<this.gazeEnd?this.gaze:'open';
  }
}
