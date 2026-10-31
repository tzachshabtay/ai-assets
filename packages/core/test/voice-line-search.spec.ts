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



test('sentence search preserves selection until chosen, supports keyboard and closes before the parent dialog', async ({ page }) => {
  await page.goto(base);
  await page.evaluate(async () => {
    const { searchableSelect } = await import('/packages/phaser/dist/searchable-select.js');
    const root = document.querySelector('#root')!;
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Original select');
    for (const [id, text] of [['base', 'Base voice'], ['line.king', 'I will rescue the king!'], ['line.forest', 'The forest is quiet.']]) {
      const option = document.createElement('option'); option.value = id; option.textContent = id;
      option.dataset.searchText = text; select.append(option);
    }
    root.append(select);
    const w = window as any; w.changes = []; w.escapes = 0;
    select.onchange = () => w.changes.push(select.value);
    root.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') w.escapes++; });
    w.picker = searchableSelect(select, 'Voice line'); w.picker.setEnabled(true);
  });
  const trigger = page.getByRole('button', { name: 'Voice line', exact: true });
  const search = page.getByRole('combobox', { name: 'Search voice line' });
  await trigger.click(); await expect(search).toBeFocused();
  await search.fill('RESCUE THE');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toHaveText('I will rescue the king!');
  expect(await page.evaluate(() => (window as any).changes)).toEqual([]);
  await search.press('Enter');
  await expect(trigger).toContainText('I will rescue the king!');
  expect(await page.evaluate(() => (window as any).changes)).toEqual(['line.king']);
  await trigger.click(); await search.fill('no match here');
  await expect(page.getByRole('status')).toHaveText('No matching lines.');
  await search.press('Enter'); await expect(search).toBeVisible();
  await search.press('Escape'); await expect(search).toBeHidden(); await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => (window as any).escapes)).toBe(0);
  await trigger.press('ArrowDown'); await expect(search).toHaveValue('');
  await search.fill('quiet'); await page.getByRole('option', { name: 'The forest is quiet.' }).click();
  await expect(trigger).toContainText('The forest is quiet.');
  await page.evaluate(() => {
    const select = document.querySelector('select')!;
    select.options[2].dataset.searchText = 'The forest is noisy now.';
  });
  await expect(trigger).toContainText('noisy now');
  await trigger.click(); await search.fill('noisy'); await expect(page.getByRole('option')).toHaveCount(1);
  await page.evaluate(() => { document.querySelector('select')!.disabled = true; });
  await expect(trigger).toBeDisabled(); await expect(search).toBeHidden();
  await page.evaluate(() => (window as any).picker.setEnabled(false));
  await expect(page.getByLabel('Original select')).toBeVisible();
  await expect(trigger).toBeHidden();
});

test('lip-sync preview searches spoken text without narrowing the voice analysis list', async ({ page }) => {
  await page.goto(base);
  await page.evaluate(async () => {
    const { openLipSyncDialog } = await import('/packages/phaser/dist/lip-sync-dialog.js');
    const { ensureDesignerStyles } = await import('/packages/phaser/dist/designer-support.js');
    ensureDesignerStyles();
    const line = (id: string, text: string) => ({ id, kind: 'voice-line', prompt: text, voiceSettings: { voiceAssetId: 'voice', text }, activeVersion: '', versions: {} });
    const manifest = { schemaVersion: 1, assets: {
      voice: { id: 'voice', kind: 'voice', prompt: '', activeVersion: '', versions: {} },
      portrait: { id: 'portrait', kind: 'image', prompt: '', activeVersion: 'base', versions: { base: { file: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } }, lipSync: { enabled: false, voiceAssetId: 'voice' } },
      first: line('first', 'We must rescue the king.'), second: line('second', 'Perhaps the mushrooms are useful.')
    } };
    (window as any).requests = [];
    openLipSyncDialog({ root: document.querySelector('#root'), manifest, assetId: 'portrait', resolveAssetUrl: (file: string) => file,
      onManifest() {}, client: { async lipSync(request: any) {
        (window as any).requests.push(request);
        return { manifest, track: { source: 'text', cues: [] } };
      } } });
  });
  await page.getByRole('button', { name: 'Preview voice line', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Search preview voice line' });
  await search.fill('MUSHROOMS');
  await expect(page.getByRole('option', { name: 'Perhaps the mushrooms are useful.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).requests.filter((r: any) => r.action === 'text').length)).toBe(1);
  await search.press('Enter');
  await expect(page.locator('blockquote')).toHaveText('Perhaps the mushrooms are useful.');
  await page.getByRole('button', { name: 'Analyze voice lines', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).requests.filter((r: any) => r.action === 'analyze').map((r: any) => r.assetId))).toEqual(['first', 'second']);
  await page.getByRole('button', { name: 'Preview voice line', exact: true }).click();
  await search.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Portrait lip sync' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
