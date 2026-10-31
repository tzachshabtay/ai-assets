import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { assertAsset, assertLipSyncTrack, LIP_SYNC_SHAPES, LIP_SYNC_LABELS, type AiAssetDefinition, type AiLipSyncSettings, type AiLipSyncTrack, type AiMouthSet } from '@ai-game-assets/core';
import type { AiAssetDevServerOptions } from './server.js';
import { readManifest, writeManifest, writeManifestModule, saveGeneratedOption } from './asset-store.js';
import { analyzeLipSyncLine, lipSyncLocalFile, textLipSync } from './lip-sync.js';

export type LipSyncRequest = {
  action: 'settings'|'generate'|'save-mouths'|'analyze'|'save-track'|'text';
  assetId: string; settings?: AiLipSyncSettings; versionName?: string; text?: string;
  region?: AiMouthSet['editRegion']; dataUrl?: string; mouthSet?: AiMouthSet;
  frameWidth?: number; frameHeight?: number; columns?: number; rows?: number;
  track?: AiLipSyncTrack;
  prompt?: string;
};
// Authoring requests commit sequentially. Long-running generation/analysis never
// holds a stale manifest while the user edits another asset.
let commits = Promise.resolve();
function commit<T>(action: () => Promise<T>): Promise<T> {
  const next = commits.then(action); commits = next.then(() => {}, () => {}); return next;
}
export async function handleLipSyncRequest(options: AiAssetDevServerOptions, request: LipSyncRequest): Promise<unknown> {
  if (request.action === 'analyze') return analyzeLipSyncLine(options, request.assetId, request.versionName);
  if (request.action === 'text') return { track: textLipSync(request.text ?? '', request.settings) };
  if (request.action === 'generate') return generateMouths(options, request);
  return commit(async () => {
    const manifest = await readManifest(options.manifestPath), asset = manifest.assets[request.assetId];
    if (!asset) throw new Error('The portrait or voice line no longer exists.');
    if (request.action === 'settings') {
      if (!['image','animation','spritesheet'].includes(asset.kind) || asset.frameGrid) throw new Error('Select the portrait base image to enable lip sync.');
      if (!request.settings || manifest.assets[request.settings.voiceAssetId]?.kind !== 'voice') throw new Error('Select a voice for this portrait.');
      if (request.settings.mouthAssetId && !manifest.assets[request.settings.mouthAssetId]?.mouthSet) throw new Error('Select a mouth-shape asset.');
      assertAsset({ ...asset, lipSync: request.settings });
      if (request.settings.layered) {
        const mouths = manifest.assets[request.settings.mouthAssetId ?? ''];
        const mouthSet = mouths?.versions[mouths.activeVersion]?.mouthSet ?? mouths?.mouthSet;
        if (!mouthSet?.editRegion) throw new Error('Choose a mouth set with a mouth/jaw region before enabling layers.');
        const mouthGrid=mouthSet.frameGrid??mouths?.frameGrid;
        if(mouthGrid?.frameWidth!==asset.dimensions?.width||mouthGrid?.frameHeight!==asset.dimensions?.height) throw new Error('Mouth layers must use cells the same size as the base portrait.');
        const eyes = request.settings.eyes;
        if (eyes) {
          const eyeAsset = manifest.assets[eyes.assetId], grid = eyeAsset?.frameGrid;
          if (!grid || grid.frameWidth !== asset.dimensions?.width || grid.frameHeight !== asset.dimensions?.height) throw new Error('Eye artwork must use cells the same size as the base portrait.');
          if (Object.values(eyes.frames).some(frame => frame >= (grid.frameCount ?? grid.columns * grid.rows))) throw new Error('An eye pose points outside the eye sheet.');
          const a=eyes.region, b=mouthSet.editRegion;
          if (a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y) throw new Error('Eye and mouth/jaw regions must not overlap.');
        }
      }
      asset.lipSync = request.settings;
    } else if (request.action === 'save-track') {
      if (asset.kind !== 'voice-line' || !request.track) throw new Error('Select a voice line and timing track.');
      assertLipSyncTrack(request.track);
      const version = asset.versions[request.versionName ?? asset.activeVersion];
      if (request.track.text !== (version?.voiceSettings?.text ?? asset.voiceSettings?.text ?? asset.prompt) || (version && request.track.sourceFile !== version.file)) throw new Error('The text or recording changed; analyze it again.');
      (version ?? asset).lipSyncTrack = { ...request.track, source: 'manual' };
    } else if (request.action === 'save-mouths') {
      if (!asset.lipSync || !request.dataUrl || !request.mouthSet) throw new Error('Enable lip sync and choose a mouth set first.');
      if (request.mouthSet.sourceVersion && request.mouthSet.sourceVersion !== asset.activeVersion) throw new Error('The portrait changed. Generate a new mouth set from its current image.');
      const match = /^data:image\/(?:png|webp|jpeg);base64,([A-Za-z0-9+/=\s]+)$/.exec(request.dataUrl);
      if (!match) throw new Error('Upload a PNG, WebP or JPEG mouth sheet.');
      let image = await sharp(Buffer.from(match[1]!, 'base64')).png().toBuffer();
      const metadata = await sharp(image).metadata();
      const { frameWidth, frameHeight, columns, rows } = request;
      if (![frameWidth,frameHeight,columns,rows].every(value => Number.isInteger(value) && value! > 0) || frameWidth! * columns! !== metadata.width || frameHeight! * rows! !== metadata.height) throw new Error('Frame dimensions must divide the sheet exactly.');
      if (request.mouthSet.editRegion) {
        const source = await readFile(lipSyncLocalFile(options, asset.versions[asset.activeVersion]!.file));
        image = await preserveMouthBase(source, image, request.mouthSet.editRegion, { frameWidth: frameWidth!, frameHeight: frameHeight!, columns: columns!, rows: rows! });
      }
      const id = asset.lipSync.mouthAssetId ?? `${asset.id}.mouths`;
      const previous = manifest.assets[id];
      if (previous && previous.mouthSet?.sourceAssetId !== asset.id) throw new Error('This mouth asset belongs to another portrait.');
      const mouthAsset: AiAssetDefinition = {
        ...previous, id, kind: 'spritesheet', prompt: request.prompt || previous?.prompt || `Lip-sync mouth shapes for ${asset.id}`,
        dimensions: { width: metadata.width!, height: metadata.height! },
        frameGrid: { frameWidth: frameWidth!, frameHeight: frameHeight!, columns: columns!, rows: rows!, frameCount: columns! * rows! },
        mouthSet: { ...request.mouthSet, sourceAssetId: asset.id, frameGrid: { frameWidth: frameWidth!, frameHeight: frameHeight!, columns: columns!, rows: rows!, frameCount: columns! * rows! } },
        activeVersion: previous?.activeVersion ?? '', versions: previous?.versions ?? {}, tags: ['lip-sync','portrait'],
      };
      assertAsset(mouthAsset); manifest.assets[id] = mouthAsset;
      asset.lipSync.mouthAssetId = id;
      asset.linkedAnimationAssets = { ...asset.linkedAnimationAssets, 'lip-sync': { label: 'Lip sync', assetId: id } };
      if (manifest.assetPaths?.[asset.id]) manifest.assetPaths[id] = [...manifest.assetPaths[asset.id]!];
      await writeManifest(options.manifestPath, manifest);
      return saveGeneratedOption(options, { assetId: id, versionName: `mouths-${Date.now()}-${randomUUID().slice(0,8)}`, activate: true,
        option: { image, mimeType: 'image/png', prompt: mouthAsset.prompt, dimensions: mouthAsset.dimensions, frameGrid: mouthAsset.frameGrid, mouthSet: mouthAsset.mouthSet } });
    } else throw new Error('Unknown lip-sync action.');
    assertAsset(asset); await writeManifest(options.manifestPath, manifest);
    if (options.manifestModulePath) await writeManifestModule(options.manifestModulePath, manifest);
    return { manifest };
  });
}

async function generateMouths(options: AiAssetDevServerOptions, request: LipSyncRequest) {
  if (!options.provider) throw new Error('Configure the image provider to generate mouth shapes. You can also upload your own sheet.');
  const manifest = await readManifest(options.manifestPath), asset = manifest.assets[request.assetId];
  const version = asset?.versions[asset.activeVersion];
  if (!asset || !version || asset.frameGrid) throw new Error('Select a portrait base image first.');
  const source = await sharp(await readFile(lipSyncLocalFile(options, version.file))).ensureAlpha().png().toBuffer();
  const meta = await sharp(source).metadata(), width = meta.width!, height = meta.height!;
  if (width > 1024 || height > 1024) throw new Error('Use a portrait at most 1024 pixels per side for a mouth set.');
  const region = request.region;
  if (!region || !Object.values(region).every(Number.isInteger) || region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 || region.x + region.width > width || region.y + region.height > height) throw new Error('Draw a mouth/jaw region inside the portrait.');
  // Raw copies avoid premultiplied-alpha rounding along translucent hair edges.
  const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
  const templatePixels = Buffer.alloc(width * height * 9 * 4);
  for (let frame = 0; frame < 9; frame++) for (let y = 0; y < height; y++) {
    sourcePixels.copy(templatePixels, ((Math.floor(frame / 3) * height + y) * width * 3 + frame % 3 * width) * 4, y * width * 4, (y + 1) * width * 4);
  }
  const template = await sharp(templatePixels, { raw: { width: width * 3, height: height * 3, channels: 4 } }).png().toBuffer();
  const prompt = `Edit this exact 3 by 3 portrait sheet into nine lip-sync mouth poses. Keep every cell's face, eyes, hair, head, clothing, lighting, position and framing identical. Change ONLY the mouth and nearby jaw inside x=${region.x}, y=${region.y}, width=${region.width}, height=${region.height} within each ${width}x${height} cell. Do not move, zoom, recolor or restyle anything. Row-major order: ${LIP_SYNC_SHAPES.map((shape, i) => `${i + 1}: ${LIP_SYNC_LABELS[shape]}`).join('; ')}. Mouth shapes should be clearly distinct but natural, anatomically believable, matching this character. Preserve moustaches and beards, part the lips beneath them. The first cell is untouched neutral rest. No text, labels, grid lines or extra padding. These are fixed mouth poses, not a sequential animation; never interpolate, shuffle or duplicate poses.`;
  const frameGrid = { frameWidth: width, frameHeight: height, columns: 3, rows: 3, frameCount: 9 };
  const mouthSet: AiMouthSet = { frames: Object.fromEntries(LIP_SYNC_SHAPES.map((shape, i) => [shape,i])) as AiMouthSet['frames'], frameGrid, sourceAssetId: asset.id, sourceVersion: asset.activeVersion, editRegion: region };
  const generated = await options.provider.generate({ asset: { ...asset, id: `${asset.id}.mouths`, kind: 'image', dimensions: { width: width * 3, height: height * 3 }, frameGrid: undefined, animations: undefined, linkedAnimationAssets: undefined, settings: { ...asset.settings, frameAlignment: 'none' } },
    count: 3, prompt, references: [{ image: template, mimeType: 'image/png', fileName: 'fixed-nine-portrait-cells.png' }],
    settings: { ...asset.settings, frameAlignment: 'none', format: 'png' } });
  const candidates = await Promise.all(generated.map(async (option, index) => {
    const sheet = await sharp(option.image).resize(width * 3, height * 3, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const original = await sharp(template).ensureAlpha().raw().toBuffer();
    // The generator may drift outside the edit region. Those pixels are never
    // accepted. Feather only the inside edge to avoid a visible patch boundary.
    for (let frame = 1; frame < 9; frame++) for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
      const px = frame % 3 * width + region.x + x, py = Math.floor(frame / 3) * height + region.y + y;
      const offset = (py * width * 3 + px) * 4;
      const weight = Math.min(1, Math.min(x,y,region.width-1-x,region.height-1-y) / 3);
      for (let channel = 0; channel < 3; channel++) original[offset + channel] = Math.round(original[offset + channel]! * (1-weight) + sheet[offset + channel]! * weight);
      // Keep the base alpha, including transparent hair/face boundaries.
    }
    const image = await sharp(original, { raw: { width: width * 3, height: height * 3, channels: 4 } }).png().toBuffer();
    return { index, dataUrl: `data:image/png;base64,${image.toString('base64')}`, mouthSet, frameGrid, prompt };
  }));
  return { candidates };
}

/** Keep generated/touched-up mouth sets anchored to the original portrait. */
async function preserveMouthBase(source: Uint8Array, image: Buffer, region: NonNullable<AiMouthSet['editRegion']>, grid: { frameWidth: number; frameHeight: number; columns: number; rows: number }) {
  const original = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { frameWidth: width, frameHeight: height, columns, rows } = grid;
  if (original.info.width !== width || original.info.height !== height || !Object.values(region).every(Number.isInteger) || region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 || region.x + region.width > width || region.y + region.height > height) throw new Error('The generated mouth region must match the portrait frame.');
  const pixels = await sharp(image).ensureAlpha().raw().toBuffer();
  for (let frame = 0; frame < columns * rows; frame++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sourceOffset = (y * width + x) * 4, targetOffset = ((Math.floor(frame / columns) * height + y) * width * columns + frame % columns * width + x) * 4;
    const outside = x < region.x || x >= region.x + region.width || y < region.y || y >= region.y + region.height;
    for (let channel = 0; channel < 4; channel++) if (outside || channel === 3) pixels[targetOffset + channel] = original.data[sourceOffset + channel]!;
  }
  return sharp(pixels, { raw: { width: width * columns, height: height * rows, channels: 4 } }).png().toBuffer();
}
