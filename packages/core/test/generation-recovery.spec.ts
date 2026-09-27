import { test, expect, type Page } from "@playwright/test";
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
      return res.end('<script type="importmap">{"imports":{"@ai-game-assets/core":"/packages/core/dist/index.js"}}</script>');
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

async function install(page: Page, { scope = "test-game", version = "original" } = {}) {
  await page.evaluate(async ({ scope, version }) => {
    const { installAiAssetDesigner } = await import("/packages/phaser/dist/designer.js");
    const { DesignerGenerationRecovery } = await import("/packages/phaser/dist/generation-recovery.js");
    const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    const generated = ["#f00", "#0f0", "#00f"].map((color, index) => {
      ctx.clearRect(0, 0, 48, 32); ctx.fillStyle = color;
      ctx.fillRect(4, 3, 10, 28); ctx.fillRect(30, 5, 10, 26);
      return { index, dataUrl: canvas.toDataURL(), mimeType: "image/png", prompt: "Orc speaks facing back",
        dimensions: { width: 48, height: 32 }, frameGrid: { frameWidth: 24, frameHeight: 32, columns: 2, rows: 1, frameCount: 2 } };
    });
    const asset = { id: "guard", kind: "animation", prompt: "Orc speaks facing back", dimensions: generated[0].dimensions,
      frameGrid: generated[0].frameGrid, activeVersion: version,
      versions: { [version]: { name: version, file: generated[0].dataUrl, prompt: "Orc speaks", createdAt: new Date().toISOString() } } };
    const w = window as any;
    w.previewCalls = 0; w.generated = generated;
    w.recovery = new DesignerGenerationRecovery(scope);
    w.designer = installAiAssetDesigner({ generationRecoveryKey: scope, autoFirstDrafts: false,
      manifest: { schemaVersion: 1, assets: { guard: asset } },
      scene: { textures: { exists: () => false, addImage: () => {}, addSpriteSheet: () => {}, remove: () => {} } },
      client: { endpoint: "test", assetUrl: (file: string) => file,
        generateStream: async (_request: unknown, onOption: any) => { generated.forEach(onOption); return generated; } },
      onPreview: () => { w.previewCalls++; } });
    w.designer.open();
  }, { scope, version });
}

const cards = (page: Page) => page.locator('.ai-game-assets-designer__options .ai-game-assets-designer__option');
const records = (page: Page) => page.evaluate(() => (window as any).recovery.read());

test("all three animation choices and selected bytes survive reload without promoting or regenerating", async ({ page }) => {
  await page.goto(base); await install(page);
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await expect.poll(async () => (await records(page))[0]?.generated.length).toBe(3);
  const expected = await page.evaluate(() => (window as any).generated);
  await cards(page).nth(1).locator('.ai-game-assets-designer__option-select').click();
  await expect.poll(async () => (await records(page))[0]?.pending?.option.index).toBe(1);
  await page.reload(); await install(page);
  await expect(cards(page)).toHaveCount(3);
  expect((await records(page))[0].generated).toEqual(expected);
  await expect(page.getByRole('button', { name: 'Promote', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).previewCalls)).toBe(0);
  await cards(page).nth(2).locator('.ai-game-assets-designer__option-select').click();
  await expect.poll(async () => (await records(page))[0]?.pending?.option.index).toBe(2);
});

test("recovery is scoped and a newly promoted version is not shadowed by an old pending choice", async ({ page }) => {
  await page.goto(base); await install(page);
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await cards(page).nth(1).locator('.ai-game-assets-designer__option-select').click();
  await expect.poll(async () => (await records(page))[0]?.pending?.option.index).toBe(1);
  await page.reload(); await install(page, { version: "promoted" });
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Promote', exact: true })).toBeDisabled();
  await page.reload(); await install(page, { scope: "different-game" });
  await expect(cards(page)).toHaveCount(0);
  expect(await records(page)).toEqual([]);
});

test("large choices retain exact bytes without localStorage limits or later in-memory mutations", async ({ page }) => {
  await page.goto(base); await install(page);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const large = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024);
    const record = { assetId: "guard", activeVersion: "original", generated: [{...w.generated[0], dataUrl: large}] };
    const writes = [w.recovery.write(record)];
    record.generated[0].dataUrl = "changed after write";
    writes.push(w.recovery.write({ assetId: "guard-2", activeVersion: "original", generated: w.generated }));
    await Promise.all(writes);
    const records = await w.recovery.read();
    return { length: records[0].generated[0].dataUrl.length, startsWith: records[0].generated[0].dataUrl.startsWith('data:image/png;base64,'), count: records.length };
  });
  expect(result).toEqual({ length: 6 * 1024 * 1024 + 22, startsWith: true, count: 2 });
});

test("reverting a recovered preview clears its selection but keeps the three choices", async ({ page }) => {
  await page.goto(base); await install(page);
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await cards(page).nth(1).locator('.ai-game-assets-designer__option-select').click();
  await expect.poll(async () => (await records(page))[0]?.pending?.option.index).toBe(1);
  await page.reload(); await install(page);
  await page.getByRole('button', { name: 'Revert preview', exact: true }).click();
  await expect.poll(async () => (await records(page))[0]?.pending).toBeUndefined();
  await page.reload(); await install(page);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Promote', exact: true })).toBeDisabled();
});

test("storage failures keep candidates visible and warn before leaving", async ({ page }) => {
  await page.goto(base); await install(page);
  await records(page); // Finish the initial recovery read before failing writes.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new DOMException('Storage is full', 'QuotaExceededError');
      return original.apply(this, args as any);
    };
  });
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByText(/Could not back up generated choices/)).toBeVisible();
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
});
