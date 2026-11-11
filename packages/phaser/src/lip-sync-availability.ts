import type { AiAssetDefinition } from '@ai-game-assets/core';

/** Portraits opt in through a tag; configured assets remain editable. */
export function canAuthorLipSync(asset: AiAssetDefinition): boolean {
  return Boolean(asset.versions[asset.activeVersion]?.file)
    && !asset.frameGrid
    && ['image', 'animation', 'spritesheet'].includes(asset.kind)
    && (asset.lipSync !== undefined || asset.tags?.some(tag => tag.toLowerCase() === 'portrait') === true);
}
