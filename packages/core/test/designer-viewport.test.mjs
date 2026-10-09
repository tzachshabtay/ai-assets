import test from 'node:test';
import assert from 'node:assert/strict';
import { designerViewportBounds, manualDesignerViewport } from '../dist/designer-viewport.js';

test('game fits to the left of the actual dock bounds with room for its resize handles', () => {
  const result = designerViewportBounds({ x: 0, y: 0, width: 1440, height: 900 }, { left: 1000, bottom: 850 });
  assert.deepEqual(result, { x: 12, y: 64, width: 976, height: 824 });
  assert.equal(result.x + result.width + 12, 1000);
});

test('moving a panel left or narrowing the browser never collapses the game to zero width', () => {
  assert.equal(designerViewportBounds({ x: 0, y: 0, width: 400, height: 800 }, { left: 0, bottom: 790 }).width, 160);
  assert.equal(designerViewportBounds({ x: 0, y: 0, width: 100, height: 800 }, { left: 0, bottom: 790 }).width, 76);
});

test('a panel at the left edge uses available space below it when possible', () => {
  assert.deepEqual(designerViewportBounds({ x: 20, y: 30, width: 800, height: 900 }, { left: 20, bottom: 400 }),
    { x: 32, y: 440, width: 776, height: 478 });
});

test('manual resize can grow past the designer panel to the screen edge', () => {
  const screen = { x: 0, y: 0, width: 1440, height: 900 };
  const fit = designerViewportBounds(screen, { left: 1000, bottom: 850 });
  const expanded = manualDesignerViewport(screen, { ...fit, width: 2000, height: 1200 });
  assert.equal(expanded.width, 1428);
  assert.equal(expanded.height, 836);
  assert.ok(expanded.width > fit.width);
  assert.deepEqual(manualDesignerViewport(screen, 'full'), screen);
});

test('full screen follows viewport changes and can be resized smaller again', () => {
  const screen = { x: 20, y: 30, width: 800, height: 600 };
  const full = manualDesignerViewport(screen, 'full');
  assert.deepEqual(full, screen);
  assert.deepEqual(manualDesignerViewport(screen, { ...full, width: 500, height: 400 }), { x: 20, y: 30, width: 500, height: 400 });
  assert.deepEqual(manualDesignerViewport(screen, { x: 1200, y: 900, width: 500, height: 400 }), { x: 660, y: 450, width: 160, height: 180 });
});
