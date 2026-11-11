import test from 'node:test';
import assert from 'node:assert/strict';
import { canAuthorLipSync } from '../dist/lip-sync-availability.js';

const image = (patch = {}) => ({ id: 'portrait', kind: 'image', prompt: 'face', activeVersion: 'base',
  versions: { base: { file: 'face.png' } }, ...patch });

test('lip sync authoring appears only for portrait or configured graphics', () => {
  assert.equal(canAuthorLipSync(image({ tags: ['forest', 'portrait'] })), true);
  assert.equal(canAuthorLipSync(image({ lipSync: { enabled: false, voiceAssetId: 'voice', language: 'en' } })), true);
  assert.equal(canAuthorLipSync(image({ tags: ['forest', 'background'] })), false);
  assert.equal(canAuthorLipSync(image({ tags: ['portrait'], frameGrid: { frameWidth: 16, frameHeight: 16, columns: 2, rows: 1, frameCount: 2 } })), false);
  assert.equal(canAuthorLipSync(image({ tags: ['portrait'], activeVersion: '' })), false);
});
