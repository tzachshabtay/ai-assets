import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const dockSource = readFileSync(new URL("../dist/designer-dock.js", import.meta.url), "utf8");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Game designer tools" });
const button = (page: Page, name: string) => page.getByRole("button", { name: `Toggle ${name}`, exact: true });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const resizeHandle = (page: Page, panel: string, edge: string) => page.locator(`[data-resize-panel="${panel}"] [data-edge="${edge}"]`);

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const rect = await box(handle);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setContent(`<style>
    body { margin: 0; }
    section { width: 360px; height: 260px; background: #ddd; overflow: auto; }
    header { height: 36px; padding: 10px; box-sizing: border-box; background: #aac; }
  </style><section id="assets"><header id="assets-title">Asset editor</header></section>
  <section id="scenes"><header>Scene editor</header></section>`);
  await page.addScriptTag({ type: "module", content: `${dockSource}
    window.dockFixture = {
      assets: registerInGameDesignerPanel({ id: 'assets', label: 'Assets', panel: document.querySelector('#assets'), dragHandle: document.querySelector('#assets header') }),
      scenes: registerInGameDesignerPanel({ id: 'scenes', label: 'Scenes', panel: document.querySelector('#scenes'), dragHandle: document.querySelector('#scenes header') }),
      minimap: registerInGameDesignerToggle({ id: 'minimap', label: 'Minimap' })
    };
    // Match designer/game input boundaries that consume bubbling release events.
    for (const element of document.querySelectorAll('section, [role=toolbar]')) {
      element.addEventListener('pointerup', event => event.stopPropagation());
    }
  ` });
  await expect(toolbar(page)).toBeVisible();
});

test("closed toolbar buttons drag together without toggling and retain their position when opening", async ({ page }) => {
  const before = await box(toolbar(page));
  const beforeButtons = await Promise.all(["Assets", "Scenes", "Minimap"].map(name => box(button(page, name))));
  await drag(page, button(page, "Minimap"), -180, 90);
  const after = await box(toolbar(page));
  expect(after.x).toBeCloseTo(before.x - 180, 0); expect(after.y).toBeCloseTo(before.y + 90, 0);
  for (const [i, name] of ["Assets", "Scenes", "Minimap"].entries()) {
    const moved = await box(button(page, name));
    expect(moved.x - beforeButtons[i]!.x).toBeCloseTo(-180, 0);
    // Hover styling lifts the button by one pixel while the dock itself moves exactly 90px.
    expect(Math.abs(moved.y - beforeButtons[i]!.y - 90)).toBeLessThanOrEqual(1.01);
  }
  await expect(page.locator("#assets")).toBeHidden(); await expect(page.locator("#scenes")).toBeHidden();
  await expect(button(page, "Minimap")).toHaveAttribute("aria-pressed", "false");
  await button(page, "Assets").click();
  const panel = await box(page.locator("#assets"));
  expect(panel.y).toBeCloseTo(after.y + 50, 0);
  expect(panel.x + panel.width).toBeCloseTo(after.x + after.width, 0);
  await button(page, "Assets").click();
  expect(await box(toolbar(page))).toEqual(after);
  await button(page, "Minimap").click();
  await expect(button(page, "Minimap")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Minimap").press("Enter");
  await expect(button(page, "Minimap")).toHaveAttribute("aria-pressed", "false");
  await drag(page, button(page, "Assets"), 1, 1);
  await expect(page.locator("#assets")).toBeVisible();
});

test("dragging an inactive tab moves the open panel; title dragging and resizing still work", async ({ page }) => {
  await button(page, "Assets").click();
  const before = await box(page.locator("#assets")), dockBefore = await box(toolbar(page));
  await drag(page, button(page, "Scenes"), -170, 100);
  let panel = await box(page.locator("#assets"));
  expect(panel.x).toBeCloseTo(before.x - 170, 0); expect(panel.y).toBeCloseTo(before.y + 100, 0);
  expect((await box(toolbar(page))).x).toBeCloseTo(dockBefore.x - 170, 0);
  await expect(page.locator("#scenes")).toBeHidden();
  await expect(button(page, "Assets")).toHaveAttribute("aria-expanded", "true");
  await drag(page, page.locator("#assets-title"), -60, 70);
  expect((await box(page.locator("#assets"))).x).toBeCloseTo(panel.x - 60, 0);
  expect((await box(page.locator("#assets"))).y).toBeCloseTo(panel.y + 70, 0);
  panel = await box(page.locator("#assets"));
  await drag(page, resizeHandle(page, "assets", "se"), 45, 35);
  expect((await box(page.locator("#assets"))).width).toBeCloseTo(panel.width + 45, 0);
  expect((await box(page.locator("#assets"))).height).toBeCloseTo(panel.height + 35, 0);
  const stopped = await box(page.locator("#assets"));
  await page.mouse.move(300, 300);
  expect(await box(page.locator("#assets"))).toEqual(stopped);
  await button(page, "Scenes").click();
  const next = await box(page.locator("#scenes")), dock = await box(toolbar(page));
  expect(next.y).toBeCloseTo(dock.y + 50, 0);
  expect(next.x + next.width).toBeCloseTo(dock.x + dock.width, 0);
});

for (const handle of ["toolbar", "title", "resize"] as const) {
  test(`${handle} stops after releases beyond every viewport edge`, async ({ page }) => {
    await button(page, "Assets").click();
    for (const [x, y] of [[-30, 200], [1230, 200], [600, -30], [600, 830]]) {
      const target = handle === "toolbar" ? button(page, "Scenes") : handle === "title" ? page.locator("#assets-title") : resizeHandle(page, "assets", "nw");
      const rect = await box(target);
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
      await page.mouse.move(x!, y!, { steps: 3 }); await page.mouse.up();
      await expect(toolbar(page)).not.toHaveClass(/is-dragging/);
      const stopped = await box(page.locator("#assets")), dock = await box(toolbar(page));
      await page.mouse.move(500, 350);
      expect(await box(page.locator("#assets"))).toEqual(stopped);
      expect(await box(toolbar(page))).toEqual(dock);
      await expect(page.locator("#scenes")).toBeHidden();
    }
  });
}

test("a missing pointerup ends on the first unpressed move and ignores other pointers", async ({ page }) => {
  await button(page, "Assets").click();
  const header = page.locator("#assets-title");
  const start = { pointerId: 42, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: 900, clientY: 80 };
  await header.dispatchEvent("pointerdown", start);
  await header.dispatchEvent("pointermove", { ...start, clientX: 800, clientY: 120 });
  const moved = await box(page.locator("#assets"));
  await header.dispatchEvent("pointerup", { ...start, pointerId: 43, buttons: 0 });
  await header.dispatchEvent("pointermove", { ...start, clientX: 750, clientY: 140 });
  expect((await box(page.locator("#assets"))).x).toBeCloseTo(moved.x - 50, 0);
  const stopped = await box(page.locator("#assets"));
  await header.dispatchEvent("pointermove", { ...start, buttons: 0, clientX: 200, clientY: 300 });
  await header.dispatchEvent("pointermove", { ...start, clientX: 300, clientY: 400 });
  expect(await box(page.locator("#assets"))).toEqual(stopped);
  await expect(toolbar(page)).not.toHaveClass(/is-dragging/);
});

test("a fresh click after a missed release still activates the toolbar button", async ({ page }) => {
  const assets = button(page, "Assets");
  const event = { pointerId: 42, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: 1150, clientY: 35 };
  await assets.dispatchEvent("pointerdown", event);
  await assets.dispatchEvent("pointermove", { ...event, clientX: 950, clientY: 135 });
  // The old pointer's release was never delivered, but this is a new press and click.
  await assets.dispatchEvent("pointerdown", { ...event, clientX: 950, clientY: 135 });
  await assets.dispatchEvent("pointerup", { ...event, buttons: 0 });
  await assets.dispatchEvent("click", { detail: 1 });
  await expect(page.locator("#assets")).toBeVisible();
});

test("a moved dock stays reachable on viewport resize and retains panel dimensions", async ({ page }) => {
  await button(page, "Assets").click();
  await drag(page, button(page, "Assets"), -100, 100);
  const original = await box(page.locator("#assets"));
  await page.setViewportSize({ width: 320, height: 240 });
  const dock = await box(toolbar(page));
  expect(dock.x).toBeGreaterThanOrEqual(8); expect(dock.y).toBeGreaterThanOrEqual(8);
  expect(dock.x + dock.width).toBeLessThanOrEqual(312);
  expect(dock.y + dock.height).toBeLessThan(240);
  await page.setViewportSize({ width: 1200, height: 800 });
  const restored = await box(page.locator("#assets"));
  expect(restored.width).toBe(original.width); expect(restored.height).toBe(original.height);
});

test("scrolling panel contents keeps the bottom edge resizable without adding scrollbars", async ({ page }) => {
  await page.locator('#scenes').evaluate(panel => {
    panel.style.padding = '14px'; panel.style.border = '1px solid'; panel.style.borderRadius = '8px';
    const content = document.createElement('div'); content.style.height = '1000px'; panel.append(content);
  });
  await button(page, 'Scenes').click();
  const panel = page.locator('#scenes'), before = await box(panel);
  expect(await panel.evaluate(p => p.scrollWidth === p.clientWidth)).toBe(true);
  await page.mouse.move(before.x + before.width / 2, before.y + 100);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => panel.evaluate(p => p.scrollTop)).toBeGreaterThan(0);
  const south = resizeHandle(page, 'scenes', 's'), edge = await box(south);
  expect(edge.y + edge.height / 2).toBeCloseTo(before.y + before.height, 0);
  expect(await south.evaluate(h => {
    const r = h.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === h;
  })).toBe(true);
  await drag(page, south, 0, 160);
  const after = await box(panel);
  expect(after.height).toBeCloseTo(before.height + 160, 0);
  expect(after.y).toBeCloseTo(before.y, 0); expect(after.width).toBeCloseTo(before.width, 0);
  await page.mouse.move(100, 100);
  expect(await box(panel)).toEqual(after);
  await button(page, 'Assets').click();
  await expect(south).toBeHidden();
  await button(page, 'Scenes').click();
  expect(await box(panel)).toEqual(after);
  await page.evaluate(() => (window as any).dockFixture.scenes.destroy());
  await expect(page.locator('[data-resize-panel="scenes"]')).toHaveCount(0);
});

test("resize frame follows content-sized panels as their contents change", async ({ page }) => {
  const panel = page.locator('#scenes');
  await panel.evaluate(p => { p.style.height = 'auto'; });
  await button(page, 'Scenes').click();
  const before = await box(panel);
  await panel.evaluate(p => { const content = document.createElement('div'); content.style.height = '250px'; p.append(content); });
  await expect.poll(async () => {
    const p = await box(panel), h = await box(resizeHandle(page, 'scenes', 's'));
    return Math.abs(h.y + h.height / 2 - p.y - p.height);
  }).toBeLessThan(1);
  expect((await box(panel)).height).toBeCloseTo(before.height + 250, 0);
});

for (const reason of ["pointercancel", "lostpointercapture", "blur", "hidden", "destroy"] as const) {
  test(`drag cleanup handles ${reason}`, async ({ page }) => {
    await button(page, "Assets").click();
    const header = page.locator("#assets-title");
    const event = { pointerId: 42, pointerType: "touch", isPrimary: true, button: 0, buttons: 1, clientX: 900, clientY: 80 };
    await header.dispatchEvent("pointerdown", event);
    await header.dispatchEvent("pointermove", { ...event, clientX: 800, clientY: 120 });
    if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (reason === "hidden") await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    else if (reason === "destroy") await page.evaluate(() => (window as any).dockFixture.assets.destroy());
    else await header.dispatchEvent(reason, event);
    const stopped = await box(toolbar(page));
    await header.dispatchEvent("pointermove", { ...event, clientX: 300, clientY: 400 });
    expect(await box(toolbar(page))).toEqual(stopped);
    await expect(toolbar(page)).not.toHaveClass(/is-dragging/);
  });
}
