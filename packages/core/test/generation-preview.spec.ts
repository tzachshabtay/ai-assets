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

test.beforeEach(async ({ page }) => {
  await page.goto(base);
  await page.evaluate(async () => {
    const support = await import("/packages/phaser/dist/designer-support.js");
    support.ensureDesignerStyles();
    const root = document.querySelector("#root")!;
    const cards = document.createElement("div");
    cards.className = "ai-game-assets-designer__options";
    cards.style.cssText = "width:300px;position:fixed;top:30px;left:30px";
    root.append(cards);
    const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="21" height="128"><rect x="2" y="3" width="17" height="120" fill="#9c5"/></svg>');
    const asset = { id: "guard", kind: "image", dimensions: { width: 21, height: 128 }, versions: {}, activeVersion: "original" };
    (window as any).previewCalls = 0;
    support.renderOptions({ elements: { options: cards, currentPreview: document.createElement("div") },
      generated: Array.from({ length: 3 }, (_, index) => ({ index, dataUrl: src })),
      scene: {}, manifest: { assets: { guard: asset } }, assetId: "guard", designerOptions: {},
      onPreview: () => { (window as any).previewCalls++; }, onSelected: () => { (window as any).previewCalls++; } });
    (window as any).fixture = { support, root, cards, asset, src };
  });
});

test("each candidate expands without selection, keeps aspect ratio, and restores keyboard focus", async ({ page }) => {
  const expand = page.getByRole("button", { name: "Expand guard option 2", exact: true });
  await expect(page.getByRole("button", { name: /^Expand guard option/ })).toHaveCount(3);
  const card = page.locator(".ai-game-assets-designer__option").nth(1);
  const bounds = (await card.boundingBox())!, icon = (await expand.boundingBox())!;
  expect(icon.x + icon.width).toBeGreaterThan(bounds.x + bounds.width - 10);
  expect(icon.y).toBeLessThan(bounds.y + 10);
  await expand.click();
  const dialog = page.getByRole("dialog", { name: "Preview guard option 2", exact: true });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole("img");
  expect((await image.boundingBox())!.height).toBeGreaterThan(300);
  expect(await image.evaluate(image => getComputedStyle(image).objectFit)).toBe("contain");
  expect(await page.evaluate(() => (window as any).previewCalls)).toBe(0);
  await expect(card).not.toHaveClass(/is-selected/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await page.setViewportSize({ width: 360, height: 640 });
  await expand.press("Enter");
  const mobileBounds = (await dialog.boundingBox())!;
  expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(360);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("expanded sprite animation uses its own grid and cleans up when its candidate is removed", async ({ page }) => {
  await page.evaluate(() => {
    const { support, cards, asset, src } = (window as any).fixture;
    const card = document.createElement("div"); card.className = "ai-game-assets-designer__option"; cards.append(card);
    support.appendOptionExpandButton({ card, src, label: "walk option 1", isAnimating: () => true,
      asset: { ...asset, kind: "animation", dimensions: { width: 99, height: 94 },
        frameGrid: { frameWidth: 33, frameHeight: 47, columns: 3, rows: 2, frameCount: 5 },
        animations: [{ frames: [0, 1, 2, 3, 4], frameRate: 10 }] } });
  });
  await page.getByRole("button", { name: "Expand walk option 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Preview walk option 1", exact: true });
  await expect(dialog.getByText("33 × 47 per frame · 5 frames")).toBeVisible();
  const frame = dialog.locator(".ai-game-assets-designer__frame-image");
  const position = () => frame.evaluate(el => (el as HTMLElement).style.backgroundPosition);
  const initial = await position(); await expect.poll(position).not.toBe(initial);
  const dimensions = (await frame.boundingBox())!;
  expect(dimensions.width / dimensions.height).toBeCloseTo(33 / 47, 4);
  await dialog.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(frame).toHaveCount(0); await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Animate", exact: true }).click();
  await expect(frame).toBeVisible();
  await page.evaluate(() => (window as any).fixture.cards.replaceChildren());
  await expect(dialog).toHaveCount(0);
});

test("expanding scaled candidates does not select/save and Escape leaves the parent dialog open", async ({ page }) => {
  await page.evaluate(async () => {
    const { openScaledVariantsDialog } = await import("/packages/phaser/dist/scaled-variants-dialog.js");
    const { root, asset, src } = (window as any).fixture;
    (window as any).saveCalls = 0;
    openScaledVariantsDialog({ root, asset: { ...asset, versions: { original: { file: "guard.png" } } },
      resolveAssetUrl: () => src, onManifest: () => {}, client: {
        scaledVariant: () => { (window as any).saveCalls++; throw Error("Unexpected save"); },
        scaledVariantOptions: async () => ({ candidates: [0, 1, 2].map(index => ({ index, dataUrl: src,
          dimensions: { width: 42, height: 256 }, sourceFile: "guard.png", method: "ai-upscale" })) }) } });
  });
  const parent = page.getByRole("dialog", { name: "Scaled variants", exact: true });
  await parent.getByRole("button", { name: "Generate", exact: true }).click();
  await parent.getByRole("button", { name: "Expand guard scaled option 2", exact: true }).click();
  const child = page.getByRole("dialog", { name: "Preview guard scaled option 2", exact: true });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0); await expect(parent).toBeVisible();
  await expect(parent.getByRole("button", { name: "Promote", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).saveCalls)).toBe(0);
});
