import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

let server: Server, base: string;
test.beforeAll(async () => {
  const root = path.resolve(".");
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    if (pathname === "/") {
      res.setHeader("content-type", "text/html");
      return res.end(`<script type="importmap">{"imports":{"@ai-game-assets/core":"/packages/core/dist/index.js"}}</script><div class="ai-game-assets-designer" id="root"></div>`);
    }
    try {
      const file = path.resolve(root, "." + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader("content-type", "text/javascript"); res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });



test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['microphone'], { origin: base });
  await page.goto(base);
  await page.evaluate(async () => {
    const { ensureDesignerStyles } = await import('/packages/phaser/dist/designer-support.js');
    const { openVoiceLineRecordingDialog } = await import('/packages/phaser/dist/voice-line-recording-dialog.js');
    ensureDesignerStyles();
    const w = window as any;
    const line = (id: string, text: string) => ({ id, kind: 'voice-line', prompt: text, voiceSettings: { text, voiceAssetId: 'voice' }, activeVersion: '', versions: {} });
    w.manifest = { schemaVersion: 1, assets: { first: line('first', 'I will rescue the king!'), second: line('second', 'The forest is quiet.') } };
    w.saved = []; w.favorites = []; w.deleted = []; w.syncCount = 0;
    const client = {
      async updateVoiceLine(request: any) {
        if (w.failEdit) throw new Error('Text storage unavailable');
        w.edits ??= []; w.edits.push(request);
        const asset = w.manifest.assets[request.assetId];
        for (const field of ['text', 'direction']) if (request[field] !== undefined) asset.voiceSettings[field] = request[field].trim();
        return structuredClone(w.manifest);
      },
      async syncManifestModule() {
        if (w.failSync) throw new Error('Module unavailable');
        w.syncCount++; return structuredClone(w.manifest);
      },
      async save(request: any) {
        if (w.failSave) throw new Error('Storage unavailable');
        w.saved.push(request);
        const asset = w.manifest.assets[request.assetId];
        const version = { name: request.versionName, file: request.dataUrl, voiceSettings: request.voiceSettings, notes: request.notes };
        asset.versions[version.name] = version;
        if (request.activate) asset.activeVersion = version.name;
        return { manifest: structuredClone(w.manifest), asset, file: version.file, version, versionName: version.name };
      },
      async selectVoiceLineVersion(request: any) {
        w.favorites.push(request); w.manifest.assets[request.assetId].activeVersion = request.versionName ?? '';
        return structuredClone(w.manifest);
      },
      async deleteVersion(request: any) {
        w.deleted.push(request); const asset = w.manifest.assets[request.assetId];
        delete asset.versions[request.versionName];
        if (asset.activeVersion === request.versionName) asset.activeVersion = Object.keys(asset.versions)[0] ?? '';
        return structuredClone(w.manifest);
      }
    };
    w.openRecording = () => w.recording = openVoiceLineRecordingDialog({ root: document.querySelector('#root'), manifest: structuredClone(w.manifest),
      lineAssetIds: ['first', 'second'], voiceName: 'Borin', client, resolveAssetUrl: (file: string) => file, onManifest() {} });
    w.openRecording();
  });
});

async function recordTake(page: any) {
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Recording ·/);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  // Capture actual fake-microphone samples long enough to decode a complete clip.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
}

test('record multiple takes, play, choose one favorite, navigate and reopen saved history', async ({ page }) => {
  await recordTake(page); await recordTake(page);
  const stars = page.getByRole('button', { name: /Favorite take/ });
  await expect(stars).toHaveCount(2);
  await expect(stars.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await stars.nth(1).click();
  await expect(stars.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(stars.nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).saved.map((r: any) => [r.activate, r.dataUrl.startsWith('data:audio/wav;base64,')]))).toEqual([[true, true], [false, true]]);
  await page.locator('audio').nth(1).evaluate((audio: HTMLAudioElement) => audio.play());
  await expect.poll(() => page.locator('audio').nth(1).evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('The forest is quiet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(stars).toHaveCount(2); await expect(stars.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => (window as any).openRecording());
  await expect(stars).toHaveCount(2); await expect(stars.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Delete take 2', exact: true }).click();
  await expect(stars).toHaveCount(1); await expect(stars).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Delete take 1', exact: true }).click();
  await expect(stars).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).manifest.assets.first.activeVersion)).toBe('');
});

test('failed saves keep the captured take playable with retry, download and deletion', async ({ page }) => {
  await page.evaluate(() => { (window as any).failSave = true; });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Recording ·/);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as any).failSave = false; });
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByRole('button', { name: 'Favorite take 1' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).saved.length)).toBe(1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('permission denial recovers and lines can still be skipped', async ({ page }) => {
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Microphone permission denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Microphone permission denied');
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('Record all lines is available without an AI base voice and uses the shared scope setup', async ({ page }) => {
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => {
    const { installAiAssetDesigner } = await import('/packages/phaser/dist/designer.js');
    const w = window as any;
    const manifest = structuredClone(w.manifest);
    manifest.assets.voice = { id: 'voice', kind: 'voice', prompt: 'Borin', activeVersion: '', versions: {},
      linkedAnimationAssets: { first: { assetId: 'first', label: 'First' }, second: { assetId: 'second', label: 'Second' } } };
    w.designer = installAiAssetDesigner({ manifest, assetIds: ['voice'], autoFirstDrafts: false, generationRecoveryKey: false,
      scene: { textures: { exists: () => false } }, client: { endpoint: 'test', assetUrl: (file: string) => file }, onPreview() {} });
    w.designer.open();
  });
  await expect(page.getByRole('button', { name: 'Regenerate all lines', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Record all lines', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Lines to record' })).toHaveValue('missing');
  await page.getByRole('combobox', { name: 'Lines to record' }).selectOption('all');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByText('I will rescue the king!')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('The forest is quiet.')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record all lines', exact: true })).toBeEnabled();
});


test('closing retries a failed module refresh without regenerating or losing saved takes', async ({ page }) => {
  await recordTake(page);
  expect(await page.evaluate(() => (window as any).saved[0].deferManifestModuleWrite)).toBe(true);
  expect(await page.evaluate(() => (window as any).syncCount)).toBe(0);
  await page.evaluate(() => { (window as any).failSync = true; });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Takes are saved');
  await expect(page.getByRole('button', { name: 'Favorite take 1' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { (window as any).failSync = false; });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => [(window as any).saved.length, (window as any).syncCount])).toEqual([1, 1]);
});


test('edit and promote script and smaller director notes; failures preserve drafts and navigation keeps edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit director notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Director notes', exact: true }).fill('Quietly, with growing resolve.');
  await page.getByRole('button', { name: 'Save and promote', exact: true }).click();
  const notes = page.getByText('Quietly, with growing resolve.', { exact: true });
  await expect(notes).toBeVisible();
  const font = (locator: any) => locator.evaluate((el: Element) => parseFloat(getComputedStyle(el).fontSize));
  expect(await font(notes)).toBeLessThan(await font(page.locator('blockquote')));
  expect((await notes.boundingBox())!.y).toBeGreaterThan((await page.locator('blockquote').boundingBox())!.y);
  await page.getByRole('button', { name: 'Edit line', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Text to say', exact: true });
  await input.fill('');
  await expect(page.getByRole('button', { name: 'Save and promote', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await input.fill('The king can count on me.');
  await page.evaluate(() => { (window as any).failEdit = true; });
  await page.getByRole('button', { name: 'Save and promote', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Text storage unavailable');
  await expect(input).toHaveValue('The king can count on me.');
  await page.evaluate(() => { (window as any).failEdit = false; });
  await page.getByRole('button', { name: 'Save and promote', exact: true }).click();
  await expect(page.getByText('The king can count on me.', { exact: true })).toBeVisible();
  await recordTake(page);
  expect(await page.evaluate(() => (window as any).saved[0].voiceSettings)).toMatchObject({ text: 'The king can count on me.', direction: 'Quietly, with growing resolve.' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(notes).toBeVisible();
  await page.getByRole('button', { name: 'Edit director notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Director notes', exact: true }).fill('');
  await page.getByRole('button', { name: 'Save and promote', exact: true }).click();
  await expect(page.getByText('No director notes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit line', exact: true }).click();
  await input.fill('Discard me'); await page.keyboard.press('Escape');
  await expect(page.getByText('The king can count on me.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => (window as any).openRecording());
  await expect(page.getByText('The king can count on me.', { exact: true })).toBeVisible();
});
