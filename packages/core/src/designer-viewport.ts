export interface InGameDesignerViewportOptions {
  /** Presentation container; its authored world coordinates are never resized. */
  target: HTMLElement;
  aspectRatio?: number;
  /** Space occupied by game controls outside the canvas. */
  chromeHeight?: () => number;
  onResize?: () => void;
}

/** Keep the view usable even if a floating panel is dragged to the left edge. */
export function designerViewportBounds(view: { x: number; y: number; width: number; height: number }, panel: { left: number; bottom: number }) {
  const x = view.x + 12;
  const y = view.y + 64;
  const availableWidth = Math.max(1, view.width - 24);
  const leftWidth = panel.left - x - 12;
  if (leftWidth < 160 && view.y + view.height - panel.bottom - 52 >= 180) {
    return { x, y: panel.bottom + 40, width: availableWidth, height: view.y + view.height - panel.bottom - 52 };
  }
  return { x, y, width: Math.min(availableWidth, Math.max(Math.min(160, availableWidth), leftWidth)), height: Math.max(1, view.height - 76) };
}

type ViewportRect = { x: number; y: number; width: number; height: number };

/** Manual sizing is constrained by the screen, never by the floating panels. */
export function manualDesignerViewport(view: ViewportRect, requested: ViewportRect | 'full'): ViewportRect {
  if (requested === 'full') return { ...view };
  const x = Math.max(view.x, Math.min(requested.x, view.x + Math.max(0, view.width - 160)));
  const y = Math.max(view.y, Math.min(requested.y, view.y + Math.max(0, view.height - 180)));
  return { x, y, width: Math.min(view.x + view.width - x, Math.max(160, requested.width)), height: Math.min(view.y + view.height - y, Math.max(180, requested.height)) };
}

/** Fit a live game beside the shared designer dock, with manual resize handles. */
export function installInGameDesignerViewport(options: InGameDesignerViewportOptions) {
  const { target } = options;
  const doc = target.ownerDocument;
  const win = doc.defaultView!;
  const frame = doc.createElement('div');
  frame.className = 'ai-game-assets-viewport-frame';
  frame.hidden = true;
  const style = doc.createElement('style');
  style.textContent = `
    .ai-game-assets-designer-viewport { position:fixed!important; left:var(--ai-game-assets-view-x)!important; top:var(--ai-game-assets-view-y)!important; width:var(--ai-game-assets-view-width)!important; height:var(--ai-game-assets-view-height)!important; margin:0!important; max-width:none!important; max-height:none!important; }
    .ai-game-assets-viewport-frame { position:fixed; z-index:2147482999; pointer-events:none; border:1px solid #748193; box-sizing:border-box; }
    .ai-game-assets-viewport-frame[hidden] { display:none; }
    .ai-game-assets-viewport-frame button { all:initial; box-sizing:border-box; position:absolute; pointer-events:auto; color:#e4e9f0; background:#27303e; border:1px solid #748193; font:12px/1.4 system-ui,sans-serif; touch-action:none; cursor:pointer; }
    .ai-game-assets-viewport-frame button:focus-visible { outline:2px solid #99c3ff; }
    .ai-game-assets-viewport-frame .fit { top:-29px; left:0; padding:3px 9px; border-radius:4px; }
    .ai-game-assets-viewport-frame .fill { top:-29px; left:110px; padding:3px 9px; border-radius:4px; }
    .ai-game-assets-viewport-frame.is-top-edge :is(.fit,.fill) { top:8px; }
    .ai-game-assets-viewport-frame .right { right:0; top:0; width:10px; height:100%; cursor:ew-resize; background:transparent; border:0; }
    .ai-game-assets-viewport-frame .bottom { bottom:0; left:0; height:10px; width:100%; cursor:ns-resize; background:transparent; border:0; }
    .ai-game-assets-viewport-frame .corner { right:0; bottom:0; width:16px; height:16px; cursor:nwse-resize; border-radius:3px; }
  `;
  doc.head.append(style);
  doc.body.append(frame);
  let active = false;
  let manual: ViewportRect | 'full' | undefined;
  let rect = { x: 12, y: 64, width: 1, height: 1 };
  let drag: { pointer: number; x: number; y: number; start: ViewportRect; edge: string; handle: HTMLElement } | undefined;
  let lastLayout = '';
  let raf = 0;
  let destroyed = false;
  const fit = doc.createElement('button');
  fit.type = 'button'; fit.className = 'fit'; fit.textContent = 'Fit game view';
  fit.onclick = () => { manual = undefined; lastLayout = ''; };
  frame.append(fit);
  const fill = doc.createElement('button');
  fill.type = 'button'; fill.className = 'fill'; fill.textContent = 'Fill screen';
  fill.onclick = () => { manual = 'full'; };
  frame.append(fill);
  const endDrag = () => {
    if (drag?.handle.hasPointerCapture(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
    drag = undefined;
  };
  for (const edge of ['right', 'bottom', 'corner']) {
    const handle = doc.createElement('button');
    handle.type = 'button'; handle.className = edge;
    handle.setAttribute('aria-label', `Resize game view ${edge}`);
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...rect }, edge, handle };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (!(event.buttons & 1)) { endDrag(); return; }
      manual = {
        ...drag.start,
        width: drag.start.width + (edge === 'bottom' ? 0 : event.clientX - drag.x),
        height: drag.start.height + (edge === 'right' ? 0 : event.clientY - drag.y),
      };
    });
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', () => { drag = undefined; });
    handle.addEventListener('keydown', event => {
      const dx = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0;
      const dy = event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0;
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation();
      manual = { ...rect, width: rect.width + (edge === 'bottom' ? 0 : dx), height: rect.height + (edge === 'right' ? 0 : dy) };
    });
    frame.append(handle);
  }
  win.addEventListener('blur', endDrag);
  const restore = () => {
    endDrag(); active = false; manual = undefined; lastLayout = ''; frame.hidden = true;
    target.classList.remove('ai-game-assets-designer-viewport');
    for (const key of ['x', 'y', 'width', 'height']) target.style.removeProperty(`--ai-game-assets-view-${key}`);
    options.onResize?.();
  };
  const update = () => {
    if (destroyed) return;
    // The dock can be dragged or resized by any integrated designer. Read its
    // actual screen bounds, not a hard-coded panel width or a scene-only flag.
    const panel = [...doc.querySelectorAll<HTMLElement>('.ai-game-assets-in-game-designer-dock__panel:not([hidden])')]
      .find(element => element.getClientRects().length && win.getComputedStyle(element).visibility !== 'hidden');
    if (!panel) { if (active) restore(); }
    else {
      const viewport = win.visualViewport;
      const panelRect = panel.getBoundingClientRect();
      const view = { x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0, width: viewport?.width ?? win.innerWidth, height: viewport?.height ?? win.innerHeight };
      const available = designerViewportBounds(view, panelRect);
      const chrome = options.chromeHeight?.() ?? 0;
      const ratio = options.aspectRatio ?? 16 / 9;
      const autoWidth = Math.min(available.width, Math.max(1, available.height - chrome) * ratio);
      const { x, y, width, height } = manual ? manualDesignerViewport(view, manual) : { ...available, width: autoWidth, height: Math.min(available.height, autoWidth / ratio + chrome) };
      const next = JSON.stringify([x, y, width, height]);
      if (next !== lastLayout) {
        active = true; lastLayout = next; rect = { x, y, width, height };
        target.classList.add('ai-game-assets-designer-viewport');
        for (const [key, value] of Object.entries(rect)) target.style.setProperty(`--ai-game-assets-view-${key}`, `${value}px`);
        Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        frame.classList.toggle('is-top-edge', y < view.y + 32);
        frame.hidden = false;
        options.onResize?.();
      }
    }
    raf = win.requestAnimationFrame(update);
  };
  raf = win.requestAnimationFrame(update);
  return {
    fit() { manual = undefined; lastLayout = ''; },
    destroy() { if (destroyed) return; destroyed = true; win.cancelAnimationFrame(raf); restore(); win.removeEventListener('blur', endDrag); frame.remove(); style.remove(); },
  };
}
