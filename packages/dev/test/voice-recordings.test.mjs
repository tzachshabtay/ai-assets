import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAiAssetDevServer } from '../dist/server.js';

test('recorded takes persist independently; favorite switches without copies and deletion keeps the remaining recordings', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'voice-takes-'));
  const manifestPath = path.join(root, 'assets.json'), assetsDir = path.join(root, 'audio');
  const line = { id: 'line', kind: 'voice-line', prompt: 'Hello!', activeVersion: '', versions: {}, voiceSettings: { voiceAssetId: 'voice', text: 'Hello!' } };
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, assets: {
    line, voice: { id: 'voice', kind: 'voice', prompt: 'Voice', activeVersion: '', versions: {} }
  } }));
  const server = createAiAssetDevServer({ manifestPath, assetsDir, manifestModulePath: path.join(root, 'assets.ts'), port: 0 });
  await server.listen();
  const origin = `http://127.0.0.1:${server.server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(`${origin}/__ai-assets/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  try {
    for (const name of ['take-1', 'take-2']) await post('save', { assetId: 'line', versionName: name, dataUrl: 'data:audio/wav;base64,UklGRg==', prompt: line.prompt, voiceSettings: line.voiceSettings, activate: name === 'take-1', notes: 'Microphone recording' });
    let saved = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(saved.assets.line.activeVersion, 'take-1');
    assert.deepEqual(Object.keys(saved.assets.line.versions), ['take-1', 'take-2']);
    const files = await readdir(assetsDir);
    const previousModule = await readFile(path.join(root, 'assets.ts'), 'utf8');
    saved = (await post('select-voice-line-version', { assetId: 'line', versionName: 'take-2', deferManifestModuleWrite: true })).manifest;
    assert.equal(await readFile(path.join(root, 'assets.ts'), 'utf8'), previousModule, 'Favorite changes can defer watched modules until the session closes');
    await post('sync-manifest-module', {});
    assert.equal(saved.assets.line.activeVersion, 'take-2');
    assert.deepEqual(await readdir(assetsDir), files, 'Favoriting never duplicates audio');
    assert.match(await readFile(path.join(root, 'assets.ts'), 'utf8'), /take-2/);
    saved = (await post('update-voice-line', { assetId: 'line', text: 'Good morning!', direction: 'Cheerfully', deferManifestModuleWrite: true })).manifest;
    assert.equal(saved.assets.line.voiceSettings.text, 'Good morning!');
    assert.equal(saved.assets.line.versions['take-2'].voiceSettings.text, 'Good morning!');
    assert.equal(saved.assets.line.versions['take-1'].voiceSettings.text, 'Hello!', 'Other take metadata stays intact');
    assert.equal(saved.assets.line.voiceSettings.direction, 'Cheerfully');
    assert.deepEqual(await readdir(assetsDir), files, 'Text edits do not copy or remove audio');
    saved = (await post('select-voice-line-version', { assetId: 'line', versionName: 'take-1' })).manifest;
    assert.equal(saved.assets.line.versions['take-1'].voiceSettings.text, 'Good morning!', 'Favorite switching cannot revert promoted wording');
    await post('select-voice-line-version', { assetId: 'line', versionName: 'take-2' });
    saved = (await post('delete-version', { assetId: 'line', versionName: 'take-1' })).manifest;
    assert.equal(saved.assets.line.activeVersion, 'take-2');
    assert.deepEqual(Object.keys(saved.assets.line.versions), ['take-2']);
    const bad = await fetch(`${origin}/__ai-assets/select-voice-line-version`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: 'voice', versionName: null }) });
    assert.equal(bad.ok, false, 'Base voices cannot accidentally be modified');
    saved = (await post('delete-version', { assetId: 'line', versionName: 'take-2', replaceActiveVoiceLine: true })).manifest;
    assert.equal(saved.assets.line.activeVersion, ''); assert.deepEqual(saved.assets.line.versions, {});
    saved = (await post('update-voice-line', { assetId: 'line', text: 'No audio needed.', direction: '' })).manifest;
    assert.equal(saved.assets.line.voiceSettings.text, 'No audio needed.');
    assert.equal(saved.assets.line.voiceSettings.direction, '');
    assert.deepEqual(saved.assets.line.versions, {});
    assert.match(await readFile(path.join(root, 'assets.ts'), 'utf8'), /No audio needed/);
    for (const body of [{ assetId: 'voice', text: 'Wrong kind' }, { assetId: 'line', text: '  ' }, { assetId: 'line', direction: 2 }]) {
      const invalid = await fetch(`${origin}/__ai-assets/update-voice-line`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(invalid.ok, false);
    }

  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
