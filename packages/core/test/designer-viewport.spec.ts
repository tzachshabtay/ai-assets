import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const source = readFileSync(new URL('../dist/designer-viewport.js', import.meta.url), 'utf8');

test('shared viewport fits, resizes beyond the panel, restores and destroys cleanly', async ({ page }) => {
  await page.setContent(`<style>
    body { margin: 0; }
    #game { width: 960px; height: 540px; background: #abc; }
    #panel { position: fixed; left: 820px; top: 60px; width: 360px; height: 500px; }
  </style><main id="game"></main><aside id="panel" class="ai-game-assets-in-game-designer-dock__panel" hidden></aside>
  <button id="toggle" style="position:fixed;bottom:0">Panel</button><button id="destroy" style="position:fixed;bottom:0;left:100px">Destroy</button>`);
  await page.addScriptTag({ type: 'module', content: `${source}
    const viewport = installInGameDesignerViewport({ target: document.querySelector('#game') });
    document.querySelector('#toggle').onclick = () => { document.querySelector('#panel').hidden = !document.querySelector('#panel').hidden; };
    document.querySelector('#destroy').onclick = () => { viewport.destroy(); viewport.destroy(); };
  ` });
  const game = page.locator('#game');
  const original = await game.boundingBox();
  await page.getByRole('button', { name: 'Panel', exact: true }).click();
  await expect(game).toHaveClass('ai-game-assets-designer-viewport');
  const fitted = (await game.boundingBox())!;
  expect(fitted.x + fitted.width).toBeLessThan(820);
  const handle = page.getByRole('button', { name: 'Resize game view right' });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(1100, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await game.boundingBox())!.width).toBeGreaterThan(1000);
  const resized = await game.boundingBox();
  await page.mouse.move(600, 600);
  expect(await game.boundingBox()).toEqual(resized);
  await page.getByRole('button', { name: 'Fill screen', exact: true }).click();
  await expect.poll(() => game.boundingBox()).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  await page.getByRole('button', { name: 'Fit game view', exact: true }).click();
  await expect.poll(() => game.boundingBox()).toEqual(fitted);
  await page.getByRole('button', { name: 'Panel', exact: true }).click();
  await expect(game).not.toHaveClass(/designer-viewport/);
  expect(await game.boundingBox()).toEqual(original);
  await page.getByRole('button', { name: 'Panel', exact: true }).click();
  await expect(game).toHaveClass('ai-game-assets-designer-viewport');
  await page.getByRole('button', { name: 'Destroy', exact: true }).click();
  await expect(page.locator('.ai-game-assets-viewport-frame')).toHaveCount(0);
  expect(await game.boundingBox()).toEqual(original);
});
