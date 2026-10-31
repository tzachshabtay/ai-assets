import { estimateLipSync, lipSyncShapeAt, selectedLipSyncTrack, type AiAssetDefinition, type AiAssetManifest, type AiLipSyncTrack } from '@ai-game-assets/core';

export type AiLipSyncClock = () => { /** Position in the original, untrimmed audio. */ seconds: number; playing: boolean; paused?: boolean };

/** A reusable portrait renderer; it never modifies the world's character sprites. */
export class AiPortraitLipSync {
  readonly canvas: HTMLCanvasElement;
  private image?: HTMLImageElement;
  private source = '';
  private failedSource = '';
  private portraitId = '';
  private track?: AiLipSyncTrack;
  private clock?: AiLipSyncClock;
  private elapsed = 0;
  private lastTime = 0;
  private raf = 0;
  private utterance: unknown;
  private disposed = false;
  private speaking = false;
  private loadRevision = 0;
  constructor(private options: {
    manifest(): AiAssetManifest; resolveAssetUrl?(file: string): string;
    document?: Document; size?: number; pixelArt?: boolean; paused?(): boolean;
    onError?(error: Error): void;
  }) {
    this.canvas = (options.document ?? document).createElement('canvas');
    this.canvas.className = 'ai-assets-lip-sync-portrait';this.canvas.setAttribute('aria-hidden','true');
    this.canvas.style.cssText = `width:${options.size ?? 192}px;height:${options.size ?? 192}px;pointer-events:none;object-fit:contain`;
    this.raf = requestAnimationFrame(this.update);
  }
  /** False means this portrait still uses its ordinary speaking animation. */
  show(portraitId: string): boolean {
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
  private mouthAsset() {
    const manifest = this.options.manifest(), portrait = manifest.assets[this.portraitId];
    const mouth = manifest.assets[portrait?.lipSync?.mouthAssetId ?? ''];
    return mouth?.frameGrid && (mouth.versions[mouth.activeVersion]?.mouthSet ?? mouth.mouthSet) ? mouth : undefined;
  }
  refresh(): void {
    const mouth = this.mouthAsset(), file = mouth?.versions[mouth.activeVersion]?.file;
    const source = file ? this.options.resolveAssetUrl?.(file) ?? file : '';
    if (!source || source === this.source || source === this.failedSource) return;
    this.source = source; this.image = undefined; const revision = ++this.loadRevision;
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = source;
    void image.decode().then(() => { if (!this.disposed && revision === this.loadRevision) this.image = image; })
      .catch(() => { if (!this.disposed && revision === this.loadRevision) { this.failedSource = source;this.source='';this.options.onError?.(new Error('Could not load portrait mouth artwork.')); } });
  }
  private update = (time: number) => {
    if (this.disposed) return;
    const delta = this.lastTime ? Math.max(0, time - this.lastTime) / 1000 : 0; this.lastTime = time;
    if (!this.options.paused?.() && this.speaking && !this.clock) this.elapsed += delta;
    const audio = this.clock?.();
    const running = this.speaking && (audio ? audio.playing || audio.paused : this.elapsed < (this.track?.duration ?? 0));
    const shape = running ? lipSyncShapeAt(this.track, audio?.seconds ?? this.elapsed) : 'X';
    const mouth = this.mouthAsset(), set = mouth && (mouth.versions[mouth.activeVersion]?.mouthSet ?? mouth.mouthSet), grid = set?.frameGrid ?? mouth?.frameGrid;
    const ratio = this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1, size = Math.round((this.options.size ?? 192) * ratio);
    if (this.canvas.width !== size) this.canvas.width = size;
    if (this.canvas.height !== size) this.canvas.height = size;
    const ctx = this.canvas.getContext('2d')!; ctx.clearRect(0,0,size,size);
    if (this.image && grid && set) {
      const frame = set.frames[shape], x = (grid.margin ?? 0) + frame % grid.columns * (grid.frameWidth + (grid.spacing ?? 0)), y = (grid.margin ?? 0) + Math.floor(frame / grid.columns) * (grid.frameHeight + (grid.spacing ?? 0));
      const scale = Math.min(size / grid.frameWidth, size / grid.frameHeight), width = grid.frameWidth * scale, height = grid.frameHeight * scale;
      ctx.imageSmoothingEnabled = !this.options.pixelArt;
      ctx.drawImage(this.image,x,y,grid.frameWidth,grid.frameHeight,(size-width)/2,(size-height)/2,width,height);
    }
    this.canvas.dataset.lipSyncShape = shape; this.canvas.dataset.lipSyncTime = String(audio?.seconds ?? this.elapsed);
    this.canvas.dataset.lipSyncSource = this.track?.source ?? '';
    this.raf = requestAnimationFrame(this.update);
  };
  destroy(): void { this.disposed=true;this.loadRevision++;cancelAnimationFrame(this.raf);this.canvas.remove(); }
}
