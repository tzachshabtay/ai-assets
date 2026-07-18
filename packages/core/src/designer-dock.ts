export type InGameDesignerPanelOptions = {
  id: string;
  label: string;
  panel: HTMLElement;
  dragHandle?: HTMLElement;
  button?: HTMLButtonElement;
  order?: number;
  ariaLabel?: string;
  onOpenChange?(isOpen: boolean): void;
};

export type InGameDesignerPanelRegistration = {
  readonly button: HTMLButtonElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  destroy(): void;
};

export type InGameDesignerToggleOptions = {
  id: string;
  label: string;
  button?: HTMLButtonElement;
  order?: number;
  ariaLabel?: string;
  initialPressed?: boolean;
  onPressedChange?(isPressed: boolean): void;
};

export type InGameDesignerToggleRegistration = {
  readonly button: HTMLButtonElement;
  setPressed(isPressed: boolean): void;
  toggle(): void;
  isPressed(): boolean;
  destroy(): void;
};

type DockItem = {
  id: string;
  order: number;
  sequence: number;
  button: HTMLButtonElement;
  panel: HTMLElement;
  dragHandle?: HTMLElement;
  resizeHandles: HTMLElement[];
  geometry?: PanelGeometry;
  open: boolean;
  createdButton: boolean;
  initialPanelHidden: boolean;
  initialPanelStyle: string | null;
  buttonParent: Node | null;
  buttonNextSibling: Node | null;
  onOpenChange?: (isOpen: boolean) => void;
  onButtonClick: () => void;
  onDragPointerDown?: (event: PointerEvent) => void;
};

type DockToggleItem = {
  id: string;
  order: number;
  sequence: number;
  button: HTMLButtonElement;
  pressed: boolean;
  createdButton: boolean;
  buttonParent: Node | null;
  buttonNextSibling: Node | null;
  onPressedChange?: (isPressed: boolean) => void;
  onButtonClick: () => void;
};

type PanelGeometry = { left: number; top: number; width: number; height: number };
type ResizeEdge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type DockState = {
  document: Document;
  root: HTMLDivElement;
  items: Map<string, DockItem>;
  toggles: Map<string, DockToggleItem>;
  layoutAnimations: Map<HTMLButtonElement, Animation>;
  onWindowResize: () => void;
  activeId?: string;
  nextSequence: number;
};

const dockStatesKey = "__aiGameAssetsInGameDesignerDockStates__";
const dockStyleId = "ai-game-assets-in-game-designer-dock-styles";

export function registerInGameDesignerPanel(
  options: InGameDesignerPanelOptions
): InGameDesignerPanelRegistration {
  const id = options.id.trim();
  const label = options.label.trim();

  if (!id) throw new Error("In-game designer panel id is required.");
  if (!label) throw new Error("In-game designer panel label is required.");

  const document = options.panel.ownerDocument;
  const state = ensureDockState(document);

  if (state.items.has(id) || state.toggles.has(id)) {
    throw new Error(`In-game designer tool "${id}" is already registered.`);
  }

  const button = options.button ?? document.createElement("button");
  const sequence = state.nextSequence;
  state.nextSequence += 1;
  const item: DockItem = {
    id,
    order: options.order ?? sequence,
    sequence,
    button,
    panel: options.panel,
    dragHandle: options.dragHandle,
    resizeHandles: [],
    open: false,
    createdButton: !options.button,
    initialPanelHidden: options.panel.hidden,
    initialPanelStyle: options.panel.getAttribute("style"),
    buttonParent: button.parentNode,
    buttonNextSibling: button.nextSibling,
    onOpenChange: options.onOpenChange,
    onButtonClick: () => activateDockItem(state, state.activeId === id ? undefined : id)
  };

  button.type = "button";
  button.textContent = label;
  button.classList.add("ai-game-assets-in-game-designer-dock__button");
  button.setAttribute("aria-label", options.ariaLabel ?? `Toggle ${label}`);
  button.setAttribute("aria-expanded", "false");
  if (!options.panel.id) {
    options.panel.id = `ai-game-assets-designer-panel-${safeDomId(id)}-${sequence}`;
  }
  button.setAttribute("aria-controls", options.panel.id);
  button.addEventListener("click", item.onButtonClick);

  options.panel.classList.add("ai-game-assets-in-game-designer-dock__panel");
  options.panel.hidden = true;
  if (item.dragHandle) {
    item.dragHandle.classList.add("ai-game-assets-in-game-designer-dock__drag-handle");
    item.onDragPointerDown = (event) => beginPanelDrag(state, item, event);
    item.dragHandle.addEventListener("pointerdown", item.onDragPointerDown);
  }
  for (const edge of ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeEdge[]) {
    const handle = document.createElement("div");
    handle.className = `ai-game-assets-in-game-designer-dock__resize-handle is-${edge}`;
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", (event) => beginPanelResize(state, item, edge, event));
    options.panel.append(handle);
    item.resizeHandles.push(handle);
  }
  state.items.set(id, item);
  renderDockButtons(state);

  let destroyed = false;
  return {
    button,
    open() {
      if (!destroyed) activateDockItem(state, id);
    },
    close() {
      if (!destroyed && item.open) activateDockItem(state, undefined);
    },
    toggle() {
      if (!destroyed) activateDockItem(state, item.open ? undefined : id);
    },
    isOpen() {
      return !destroyed && item.open;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeDockItem(state, item);
    }
  };
}

export function registerInGameDesignerToggle(
  options: InGameDesignerToggleOptions
): InGameDesignerToggleRegistration {
  const id = options.id.trim();
  const label = options.label.trim();

  if (!id) throw new Error("In-game designer toggle id is required.");
  if (!label) throw new Error("In-game designer toggle label is required.");

  const document = options.button?.ownerDocument ?? globalThis.document;
  if (!document) throw new Error("In-game designer toggles require a document.");
  const state = ensureDockState(document);
  if (state.items.has(id) || state.toggles.has(id)) {
    throw new Error(`In-game designer tool "${id}" is already registered.`);
  }

  const button = options.button ?? document.createElement("button");
  const sequence = state.nextSequence;
  state.nextSequence += 1;
  const item: DockToggleItem = {
    id,
    order: options.order ?? sequence,
    sequence,
    button,
    pressed: options.initialPressed ?? false,
    createdButton: !options.button,
    buttonParent: button.parentNode,
    buttonNextSibling: button.nextSibling,
    onPressedChange: options.onPressedChange,
    onButtonClick: () => setDockTogglePressed(item, !item.pressed)
  };

  button.type = "button";
  button.textContent = label;
  button.classList.add("ai-game-assets-in-game-designer-dock__button");
  button.setAttribute("aria-label", options.ariaLabel ?? `Toggle ${label}`);
  button.setAttribute("aria-pressed", String(item.pressed));
  button.classList.toggle("is-open", item.pressed);
  button.addEventListener("click", item.onButtonClick);
  state.toggles.set(id, item);
  renderDockButtons(state);

  let destroyed = false;
  return {
    button,
    setPressed(isPressed) {
      if (!destroyed) setDockTogglePressed(item, isPressed);
    },
    toggle() {
      if (!destroyed) setDockTogglePressed(item, !item.pressed);
    },
    isPressed() {
      return !destroyed && item.pressed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeDockToggle(state, item);
    }
  };
}

function ensureDockState(document: Document): DockState {
  const host = globalThis as typeof globalThis & Record<string, unknown>;
  let states = host[dockStatesKey] as WeakMap<Document, DockState> | undefined;

  if (!states) {
    states = new WeakMap<Document, DockState>();
    host[dockStatesKey] = states;
  }

  const existing = states.get(document);
  if (existing) return existing;

  if (!document.body) {
    throw new Error("In-game designer panels can only be registered after document.body exists.");
  }

  ensureDockStyles(document);
  const root = document.createElement("div");
  root.className = "ai-game-assets-in-game-designer-dock";
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Game designer tools");
  document.body.append(root);

  const state: DockState = {
    document,
    root,
    items: new Map(),
    toggles: new Map(),
    layoutAnimations: new Map(),
    onWindowResize: () => undefined,
    nextSequence: 0
  };
  state.onWindowResize = () => positionDockForActivePanel(state);
  document.defaultView?.addEventListener("resize", state.onWindowResize);
  states.set(document, state);
  return state;
}

function activateDockItem(state: DockState, activeId: string | undefined): void {
  if (activeId !== undefined && !state.items.has(activeId)) return;

  state.activeId = activeId;
  setDockPanelOpenState(state, activeId !== undefined);
  const changed: DockItem[] = [];

  for (const item of state.items.values()) {
    const isOpen = item.id === activeId;
    if (item.open !== isOpen) changed.push(item);
    item.open = isOpen;
    item.panel.hidden = !isOpen;
    item.button.setAttribute("aria-expanded", String(isOpen));
    item.button.classList.toggle("is-open", isOpen);
  }

  for (const item of changed) {
    item.onOpenChange?.(item.open);
  }
  positionDockForActivePanel(state);
}

function renderDockButtons(state: DockState): void {
  const items = [...state.items.values(), ...state.toggles.values()].sort((left, right) => (
    left.order - right.order || left.sequence - right.sequence
  ));

  state.root.append(...items.map((item) => item.button));
}

function removeDockItem(state: DockState, item: DockItem): void {
  const wasOpen = item.open;
  state.items.delete(item.id);
  if (state.activeId === item.id) state.activeId = undefined;
  setDockPanelOpenState(state, state.activeId !== undefined);

  item.button.removeEventListener("click", item.onButtonClick);
  if (item.dragHandle && item.onDragPointerDown) {
    item.dragHandle.removeEventListener("pointerdown", item.onDragPointerDown);
    item.dragHandle.classList.remove("ai-game-assets-in-game-designer-dock__drag-handle");
  }
  item.resizeHandles.forEach((handle) => handle.remove());
  state.layoutAnimations.get(item.button)?.cancel();
  state.layoutAnimations.delete(item.button);
  item.button.classList.remove("ai-game-assets-in-game-designer-dock__button", "is-open");
  item.button.removeAttribute("aria-controls");
  item.button.setAttribute("aria-expanded", "false");
  item.panel.classList.remove("ai-game-assets-in-game-designer-dock__panel");
  item.panel.hidden = item.initialPanelHidden;
  if (item.initialPanelStyle === null) item.panel.removeAttribute("style");
  else item.panel.setAttribute("style", item.initialPanelStyle);

  if (item.createdButton) {
    item.button.remove();
  } else if (item.buttonParent) {
    item.buttonParent.insertBefore(
      item.button,
      item.buttonNextSibling?.parentNode === item.buttonParent ? item.buttonNextSibling : null
    );
  }

  if (wasOpen) item.onOpenChange?.(false);

  removeDockIfEmpty(state);
  if (state.items.size > 0 || state.toggles.size > 0) {
    renderDockButtons(state);
  }
}

function setDockTogglePressed(item: DockToggleItem, isPressed: boolean): void {
  if (item.pressed === isPressed) return;
  item.pressed = isPressed;
  item.button.setAttribute("aria-pressed", String(isPressed));
  item.button.classList.toggle("is-open", isPressed);
  item.onPressedChange?.(isPressed);
}

function removeDockToggle(state: DockState, item: DockToggleItem): void {
  state.toggles.delete(item.id);
  item.button.removeEventListener("click", item.onButtonClick);
  state.layoutAnimations.get(item.button)?.cancel();
  state.layoutAnimations.delete(item.button);
  item.button.classList.remove("ai-game-assets-in-game-designer-dock__button", "is-open");
  item.button.removeAttribute("aria-pressed");

  if (item.createdButton) {
    item.button.remove();
  } else if (item.buttonParent) {
    item.buttonParent.insertBefore(
      item.button,
      item.buttonNextSibling?.parentNode === item.buttonParent ? item.buttonNextSibling : null
    );
  }

  if (item.pressed) item.onPressedChange?.(false);
  removeDockIfEmpty(state);
  if (state.items.size > 0 || state.toggles.size > 0) {
    renderDockButtons(state);
  }
}

function removeDockIfEmpty(state: DockState): void {
  if (state.items.size === 0 && state.toggles.size === 0) {
    state.document.defaultView?.removeEventListener("resize", state.onWindowResize);
    state.root.remove();
    const host = globalThis as typeof globalThis & Record<string, unknown>;
    const states = host[dockStatesKey] as WeakMap<Document, DockState> | undefined;
    states?.delete(state.document);
  }
}

function beginPanelDrag(state: DockState, item: DockItem, event: PointerEvent): void {
  if (event.button !== 0 || !item.open) return;
  event.preventDefault();
  const startRect = item.panel.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;

  const move = (moveEvent: PointerEvent) => {
    const margin = 8;
    const toolbarOffset = 50;
    const view = state.document.defaultView;
    if (!view) return;
    const left = clamp(startRect.left + moveEvent.clientX - startX, margin, view.innerWidth - startRect.width - margin);
    const top = clamp(startRect.top + moveEvent.clientY - startY, margin + toolbarOffset, view.innerHeight - 60);
    item.geometry = { left, top, width: startRect.width, height: startRect.height };
    applyPanelGeometry(item);
    positionDockForActivePanel(state);
  };
  const end = () => {
    state.document.defaultView?.removeEventListener("pointermove", move);
    state.document.defaultView?.removeEventListener("pointerup", end);
    state.document.defaultView?.removeEventListener("pointercancel", end);
  };
  state.document.defaultView?.addEventListener("pointermove", move);
  state.document.defaultView?.addEventListener("pointerup", end, { once: true });
  state.document.defaultView?.addEventListener("pointercancel", end, { once: true });
}

function beginPanelResize(
  state: DockState,
  item: DockItem,
  edge: ResizeEdge,
  event: PointerEvent
): void {
  if (event.button !== 0 || !item.open) return;
  event.preventDefault();
  event.stopPropagation();
  const startRect = item.panel.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;

  const move = (moveEvent: PointerEvent) => {
    const view = state.document.defaultView;
    if (!view) return;
    const margin = 8;
    const minWidth = Math.min(280, view.innerWidth - margin * 2);
    const minHeight = Math.min(180, view.innerHeight - 66);
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    let left = startRect.left;
    let top = startRect.top;
    let right = startRect.right;
    let bottom = startRect.bottom;

    if (edge.includes("w")) left = clamp(startRect.left + dx, margin, right - minWidth);
    if (edge.includes("e")) right = clamp(startRect.right + dx, left + minWidth, view.innerWidth - margin);
    if (edge.includes("n")) top = clamp(startRect.top + dy, 58, bottom - minHeight);
    if (edge.includes("s")) bottom = clamp(startRect.bottom + dy, top + minHeight, view.innerHeight - margin);

    item.geometry = { left, top, width: right - left, height: bottom - top };
    applyPanelGeometry(item);
    positionDockForActivePanel(state);
  };
  const end = () => {
    state.document.defaultView?.removeEventListener("pointermove", move);
    state.document.defaultView?.removeEventListener("pointerup", end);
    state.document.defaultView?.removeEventListener("pointercancel", end);
  };
  state.document.defaultView?.addEventListener("pointermove", move);
  state.document.defaultView?.addEventListener("pointerup", end, { once: true });
  state.document.defaultView?.addEventListener("pointercancel", end, { once: true });
}

function applyPanelGeometry(item: DockItem): void {
  if (!item.geometry) return;
  item.panel.style.setProperty("left", `${item.geometry.left}px`, "important");
  item.panel.style.setProperty("top", `${item.geometry.top}px`, "important");
  item.panel.style.setProperty("right", "auto", "important");
  item.panel.style.setProperty("width", `${item.geometry.width}px`, "important");
  item.panel.style.setProperty("height", `${item.geometry.height}px`, "important");
}

function positionDockForActivePanel(state: DockState): void {
  const activeItem = state.activeId ? state.items.get(state.activeId) : undefined;
  if (!activeItem?.open) {
    state.root.style.removeProperty("left");
    state.root.style.removeProperty("top");
    state.root.style.removeProperty("right");
    return;
  }

  if (activeItem.geometry) applyPanelGeometry(activeItem);
  const panelRect = activeItem.panel.getBoundingClientRect();
  const dockRect = state.root.getBoundingClientRect();
  const view = state.document.defaultView;
  const maximumLeft = view
    ? Math.max(8, view.innerWidth - dockRect.width - 8)
    : panelRect.right - dockRect.width;
  const left = clamp(panelRect.right - dockRect.width, 8, maximumLeft);
  state.root.style.left = `${left}px`;
  state.root.style.top = `${Math.max(8, panelRect.top - 50)}px`;
  state.root.style.right = "auto";
}

function ensureDockStyles(document: Document): void {
  if (document.getElementById(dockStyleId)) return;

  const style = document.createElement("style");
  style.id = dockStyleId;
  style.textContent = `
.ai-game-assets-in-game-designer-dock {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  max-width: calc(100vw - 28px);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: gap 160ms ease;
}
.ai-game-assets-in-game-designer-dock.is-panel-open {
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button {
  box-sizing: border-box;
  width: 96px;
  min-width: 96px;
  height: 42px;
  margin: 0 !important;
  padding: 0 12px;
  border: 1px solid #63708a;
  border-radius: 999px;
  background: #202838;
  color: #fff;
  font: 600 13px/1 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button:hover,
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button:focus-visible,
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button.is-open {
  border-color: #8bb8ff;
  background: #253149;
  box-shadow:
    0 0 0 3px rgba(74, 144, 255, 0.24),
    0 0 22px rgba(74, 144, 255, 0.42),
    0 12px 30px rgba(0, 0, 0, 0.42);
}
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button:hover,
.ai-game-assets-in-game-designer-dock > .ai-game-assets-in-game-designer-dock__button:focus-visible {
  transform: translateY(-1px);
}
.ai-game-assets-in-game-designer-dock.is-panel-open > .ai-game-assets-in-game-designer-dock__button:hover,
.ai-game-assets-in-game-designer-dock.is-panel-open > .ai-game-assets-in-game-designer-dock__button:focus-visible {
  transform: none;
}
.ai-game-assets-in-game-designer-dock__panel {
  position: fixed !important;
  top: 64px !important;
  right: 14px !important;
  z-index: 2147483646 !important;
  display: block !important;
  max-width: calc(100vw - 28px) !important;
  max-height: calc(100vh - 78px) !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}
.ai-game-assets-in-game-designer-dock__panel[hidden] {
  display: none !important;
}
.ai-game-assets-in-game-designer-dock__drag-handle {
  cursor: move !important;
  touch-action: none;
  user-select: none;
}
.ai-game-assets-in-game-designer-dock__resize-handle {
  position: absolute;
  z-index: 20;
  touch-action: none;
}
.ai-game-assets-in-game-designer-dock__resize-handle.is-n,
.ai-game-assets-in-game-designer-dock__resize-handle.is-s {
  left: 10px;
  right: 10px;
  height: 8px;
  cursor: ns-resize;
}
.ai-game-assets-in-game-designer-dock__resize-handle.is-n { top: -4px; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-s { bottom: -4px; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-e,
.ai-game-assets-in-game-designer-dock__resize-handle.is-w {
  top: 10px;
  bottom: 10px;
  width: 8px;
  cursor: ew-resize;
}
.ai-game-assets-in-game-designer-dock__resize-handle.is-e { right: -4px; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-w { left: -4px; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-ne,
.ai-game-assets-in-game-designer-dock__resize-handle.is-se,
.ai-game-assets-in-game-designer-dock__resize-handle.is-sw,
.ai-game-assets-in-game-designer-dock__resize-handle.is-nw {
  width: 14px;
  height: 14px;
}
.ai-game-assets-in-game-designer-dock__resize-handle.is-ne { top: -5px; right: -5px; cursor: nesw-resize; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
.ai-game-assets-in-game-designer-dock__resize-handle.is-nw { top: -5px; left: -5px; cursor: nwse-resize; }
`;
  document.head.append(style);
}

function setDockPanelOpenState(state: DockState, isOpen: boolean): void {
  if (state.root.classList.contains("is-panel-open") === isOpen) return;

  const buttons = [...state.items.values(), ...state.toggles.values()].map((item) => item.button);
  const previousRects = new Map(buttons.map((button) => [button, button.getBoundingClientRect()]));
  state.root.classList.toggle("is-panel-open", isOpen);

  if (state.document.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (const button of buttons) {
    const previousRect = previousRects.get(button);
    if (!previousRect) continue;
    const nextRect = button.getBoundingClientRect();
    const translateX = previousRect.left - nextRect.left;
    const translateY = previousRect.top - nextRect.top;
    if (translateX === 0 && translateY === 0) continue;

    state.layoutAnimations.get(button)?.cancel();
    const animation = button.animate(
      [
        { transform: `translate(${translateX}px, ${translateY}px)` },
        { transform: "translate(0, 0)" }
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    state.layoutAnimations.set(button, animation);
  }
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "panel";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
