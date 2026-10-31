import type { AiAssetDefinition, AiAssetManifest, AiLipSyncShape, AiLipSyncTrack } from './types.js';

export const LIP_SYNC_SHAPES = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const LIP_SYNC_LABELS: Record<AiLipSyncShape, string> = {
  X: 'Rest', A: 'Closed · M / B / P', B: 'Teeth · EE / consonants', C: 'Open · EH / AE',
  D: 'Wide · AH', E: 'Round · OH', F: 'Pucker · OO / W', G: 'Lip bite · F / V', H: 'Tongue · L',
};
export const PHONEME_SHAPES: Record<string, AiLipSyncShape> = {
  M:'A', B:'A', P:'A', F:'G', V:'G', L:'H', W:'F', UW:'F', OW:'E',
  AA:'D', AH:'D', AY:'D', AE:'C', EH:'C', AW:'C', AO:'E', OY:'E', ER:'E',
  IY:'B', IH:'B', EY:'C', UH:'E', Y:'B', HH:'C', R:'E',
};
/** A pronunciation adapter can supply dictionary/G2P phones. The small fallback handles unknown words. */
export function estimateLipSync(text: string, options: { wordsPerMinute?: number; language?: string; phones?: Record<string, string> } = {}): AiLipSyncTrack {
  const cues: AiLipSyncTrack['cues'] = []; let time = 0;
  const speed = 150 / Math.max(40, Math.min(400, options.wordsPerMinute ?? 150));
  const add = (shape: AiLipSyncShape, seconds: number) => {
    const duration = seconds * speed, last = cues.at(-1);
    if (last?.shape === shape) last.end += duration;
    else cues.push({ start: time, end: time + duration, shape });
    time += duration;
  };
  add('X', .08);
  for (const token of text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*|[.,!?;:…]/gu) ?? []) {
    if (/^[.,!?;:…]$/.test(token)) { add('X', /[.!?…]/.test(token) ? .32 : .17); continue; }
    const phones = options.phones?.[token.replaceAll('’', "'")]?.split(/\s+/);
    if (phones?.length) for (const phone of phones) {
      const plain = phone.replace(/\d/g, '');
      add(PHONEME_SHAPES[plain] ?? 'B', /[012]$/.test(phone) ? .105 : .065);
    } else {
      const fallback: Record<string, AiLipSyncShape> = { m:'A', b:'A', p:'A', f:'G', v:'G', l:'H', a:'D', e:'C', i:'B', o:'E', u:'F', w:'F', oo:'F', ee:'B', ou:'F', ow:'F', th:'B', sh:'B', ch:'B' };
      for (const part of token.replace(/e$/, '').match(/oo|ee|ou|ow|th|sh|ch|./g) ?? []) add(fallback[part] ?? 'B', /[aeiou]/.test(part) ? .10 : .06);
    }
    add('X', .045);
  }
  add('X', .12);
  return { schemaVersion: 1, source: 'text', language: options.language ?? 'en', text, duration: time, cues };
}
export function lipSyncShapeAt(track: AiLipSyncTrack | undefined, seconds: number): AiLipSyncShape {
  if (!track || !Number.isFinite(seconds) || seconds < 0 || seconds >= track.duration) return 'X';
  // Binary search is stable across pause, resume, seek and frame drops.
  let low = 0, high = track.cues.length - 1;
  while (low <= high) { const mid = (low + high) >>> 1, cue = track.cues[mid]!;
    if (seconds < cue.start) high = mid - 1;
    else if (seconds >= cue.end) low = mid + 1;
    else return cue.shape;
  }
  return 'X';
}
export function selectedLipSyncTrack(asset: AiAssetDefinition | undefined): AiLipSyncTrack | undefined {
  if (!asset) return;
  const version = asset.versions[asset.activeVersion];
  const track = version?.lipSyncTrack ?? (!version?.file ? asset.lipSyncTrack : undefined);
  const text = version?.voiceSettings?.text ?? asset.voiceSettings?.text ?? asset.prompt;
  if (track?.text !== text || (version?.file && track.sourceFile !== version.file)) return;
  return track;
}
export function lipSyncVoiceSettings(manifest: AiAssetManifest, voiceAssetId: string) {
  return Object.values(manifest.assets).find(asset => asset.lipSync?.enabled && asset.lipSync.voiceAssetId === voiceAssetId)?.lipSync;
}
export function assertLipSyncTrack(track: AiLipSyncTrack): void {
  if (track.schemaVersion !== 1 || !['text','rhubarb','manual'].includes(track.source) || typeof track.text !== 'string' ||
      !Number.isFinite(track.duration) || track.duration < 0 || !Array.isArray(track.cues)) throw new Error('Invalid lip-sync track.');
  let end = 0;
  for (const cue of track.cues) {
    if (!LIP_SYNC_SHAPES.includes(cue.shape) || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < end - .000001 || cue.end <= cue.start || cue.end > track.duration + .001) throw new Error('Invalid or overlapping lip-sync cue.');
    end = cue.end;
  }
}
