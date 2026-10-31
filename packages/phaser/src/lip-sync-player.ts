import { estimateLipSync, lipSyncShapeAt, selectedLipSyncTrack, type AiAssetDefinition, type AiAssetManifest, type AiLipSyncTrack, type AiPortraitEyePose } from '@ai-game-assets/core';
import { drawPortraitLayers, PortraitEyeMotion } from './portrait-layers.js';

export type AiLipSyncClock = () => { /** Position in the original, untrimmed audio. */ seconds: number; playing: boolean; paused?: boolean };

/** A reusable portrait renderer; it never modifies the world's character sprites. */
export class AiPortraitLipSync {
  readonly canvas: HTMLCanvasElement;
  private images = new Map<string, { image?: HTMLImageElement }>();
  private portraitId = '';
  private track?: AiLipSyncTrack;
  private clock?: AiLipSyncClock;
  private elapsed = 0;
  private lastTime = 0;
  private raf = 0;
  private utterance: unknown;
  private disposed = false;
  private speaking = false;
  private eyeMotion: PortraitEyeMotion;
  private eyePreview?: AiPortraitEyePose;
  constructor(private options: {
    manifest(): AiAssetManifest; resolveAssetUrl?(file: string): string;
    document?: Document; size?: number; pixelArt?: boolean; paused?(): boolean;
    random?(): number; onError?(error: Error): void;
  }) {
    this.canvas = (options.document ?? document).createElement('canvas');
    this.canvas.className = 'ai-assets-lip-sync-portrait';this.canvas.setAttribute('aria-hidden','true');
    this.canvas.style.cssText = `width:${options.size ?? 192}px;height:${options.size ?? 192}px;pointer-events:none;object-fit:contain;image-rendering:${options.pixelArt?'pixelated':'auto'}`;
    this.eyeMotion = new PortraitEyeMotion(options.random);
    this.raf = requestAnimationFrame(this.update);
  }
  /** False means this portrait still uses its ordinary speaking animation. */
  show(portraitId: string): boolean {
    if (portraitId !== this.portraitId) { this.stop();this.eyeMotion.reset(); }
    this.portraitId = portraitId;
    const portrait = this.options.manifest().assets[portraitId];
    if (!portrait?.lipSync?.enabled || !this.mouthAsset()) return false;
    this.refresh(); return true;
  }
  speak(key: unknown, text: string, voiceLine?: AiAssetDefinition, clock?: AiLipSyncClock): void {
    if (key === this.utterance) { if (clock) this.clock = clock; return; }
    this.utterance = key; this.elapsed = 0; this.clock = clock; this.speaking = true;
    const settings = this.options.manifest().assets[this.portraitId]?.lipSync;
    this.track = selectedLipSyncTrack(voiceLine) ?? estimateLipSync(text, { ...settings, phones: settings?.pronunciations });
  }
  stop(): void { this.utterance = undefined; this.speaking = false; this.clock = undefined; this.elapsed = 0; }
  /** Designer inspection only. Undefined resumes independent blinking/gaze. */
  previewEyePose(pose?: AiPortraitEyePose): void { this.eyePreview = pose; }
  private mouthAsset() {
    const manifest = this.options.manifest(), portrait = manifest.assets[this.portraitId];
    const mouth = manifest.assets[portrait?.lipSync?.mouthAssetId ?? ''];
    return mouth?.frameGrid && (mouth.versions[mouth.activeVersion]?.mouthSet ?? mouth.mouthSet) ? mouth : undefined;
  }
  private load(asset?: AiAssetDefinition) {
    const file=asset?.versions[asset.activeVersion]?.file;
    if (!file) return;
    const source=this.options.resolveAssetUrl?.(file)??file;
    const cached=this.images.get(source);if(cached)return cached.image;
    const slot: { image?: HTMLImageElement }={};this.images.set(source,slot);
    const image=new Image();image.crossOrigin='anonymous';image.src=source;
    void image.decode().then(()=>{if(!this.disposed)slot.image=image;}).catch(()=>this.options.onError?.(new Error(`Could not load portrait artwork: ${asset?.id}`)));
    return undefined;
  }
  refresh(): void {
    const manifest=this.options.manifest(), portrait=manifest.assets[this.portraitId];
    this.load(this.mouthAsset());
    if(portrait?.lipSync?.layered){this.load(portrait);this.load(manifest.assets[portrait.lipSync.eyes?.assetId??'']);}
  }
  private update = (time: number) => {
    if (this.disposed) return;
    const delta = this.lastTime ? Math.max(0, time - this.lastTime) / 1000 : 0; this.lastTime = time;
    const paused=this.options.paused?.()??false;
    if (!paused && this.speaking && !this.clock) this.elapsed += delta;
    const audio = this.clock?.();
    const running = this.speaking && (audio ? audio.playing || audio.paused : this.elapsed < (this.track?.duration ?? 0));
    const shape = running ? lipSyncShapeAt(this.track, audio?.seconds ?? this.elapsed) : 'X';
    const manifest=this.options.manifest(),portrait=manifest.assets[this.portraitId],settings=portrait?.lipSync;
    const mouth=this.mouthAsset(),set=mouth&&(mouth.versions[mouth.activeVersion]?.mouthSet??mouth.mouthSet),grid=set?.frameGrid??mouth?.frameGrid;
    const eyePose=this.eyePreview??this.eyeMotion.update(paused?0:delta,settings?.layered?settings.eyes:undefined);
    const mouthImage=this.load(mouth), base=settings?.layered?this.load(portrait):undefined;
    const eyes=manifest.assets[settings?.eyes?.assetId??''],eyeImage=settings?.layered?this.load(eyes):undefined;
    if(mouthImage&&grid&&set){
      const layered=drawPortraitLayers(this.canvas,{mouth:mouthImage,grid,mouthSet:set,frame:set.frames[shape],base,layered:settings?.layered,
        eyes:eyeImage&&eyes?.frameGrid&&settings?.eyes?{image:eyeImage,grid:eyes.frameGrid,settings:settings.eyes,pose:eyePose}:undefined});
      this.canvas.dataset.portraitLayers=layered?`base mouth${eyeImage?' eyes':''}`:'full-frame';
    }
    this.canvas.dataset.lipSyncShape=shape;this.canvas.dataset.lipSyncTime=String(audio?.seconds??this.elapsed);
    this.canvas.dataset.lipSyncSource=this.track?.source??'';this.canvas.dataset.eyePose=eyePose;
    this.raf=requestAnimationFrame(this.update);
  };
  destroy(): void { this.disposed=true;this.images.clear();cancelAnimationFrame(this.raf);this.canvas.remove(); }
}
