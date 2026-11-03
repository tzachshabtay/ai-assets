import { assertAsset, type AiAssetManifest, type AiVoiceGenerationSettings } from '@ai-game-assets/core';

/** Resolve a browser-authored speech line without replacing server-owned takes.
 * Generation uses this in memory; saving the resulting take persists the definition. */
export function resolveVoiceLineDraft(manifest: AiAssetManifest, assetId: string,
  settings?: AiVoiceGenerationSettings) {
  const existing = manifest.assets[assetId];
  if (existing) return existing;
  if (!settings?.text?.trim() || !settings.voiceAssetId)
    throw new Error(`Unknown AI asset "${assetId}". A new voice line requires text and a voice asset.`);
  if (!/^[a-zA-Z0-9._-]+$/.test(assetId) || assetId.length > 180)
    throw new Error('Invalid voice-line asset id.');
  const voice = manifest.assets[settings.voiceAssetId];
  if (voice?.kind !== 'voice') throw new Error(`Unknown or non-voice AI asset "${settings.voiceAssetId}".`);
  const line = { id:assetId, kind:'voice-line' as const, prompt:settings.direction?.trim() || 'Natural conversational delivery.',
    voiceSettings:{...settings}, activeVersion:'', versions:{} };
  assertAsset(line);
  manifest.assets[assetId] = line;
  (voice.linkedAnimationAssets ??= {})[assetId] = {assetId, label:settings.text};
  (manifest.assetPaths ??= {})[assetId] = ['Voices'];
  return line;
}
