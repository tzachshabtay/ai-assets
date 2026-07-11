export type InGameDesignerPanelOptions = {
  id: string;
  label: string;
  panel: HTMLElement;
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

type DockItem = {
  id: string;
  order: number;
  sequence: number;
  button: HTMLButtonElement;
  panel: HTMLElement;
  open: boolean;
  createdButton: boolean;
  initialPanelHidden: boolean;
  buttonParent: Node | null;
  buttonNextSibling: Node | null;
  onOpenChange?: (isOpen: boolean) => void;
  onButtonClick: () => void;
};

type DockState = {
  document: Document;
  root: HTMLDivElement;
  items: Map<string, DockItem>;
  layoutAnimations: Map<HTMLButtonElement, Animation>;
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

  if (state.items.has(id)) {
    throw new Error(`In-game designer panel "${id}" is already registered.`);
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
    open: false,
    createdButton: !options.button,
    initialPanelHidden: options.panel.hidden,
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
    layoutAnimations: new Map(),
    nextSequence: 0
  };
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
}

function renderDockButtons(state: DockState): void {
  const items = [...state.items.values()].sort((left, right) => (
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
  state.layoutAnimations.get(item.button)?.cancel();
  state.layoutAnimations.delete(item.button);
  item.button.classList.remove("ai-game-assets-in-game-designer-dock__button", "is-open");
  item.button.removeAttribute("aria-controls");
  item.button.setAttribute("aria-expanded", "false");
  item.panel.classList.remove("ai-game-assets-in-game-designer-dock__panel");
  item.panel.hidden = item.initialPanelHidden;

  if (item.createdButton) {
    item.button.remove();
  } else if (item.buttonParent) {
    item.buttonParent.insertBefore(
      item.button,
      item.buttonNextSibling?.parentNode === item.buttonParent ? item.buttonNextSibling : null
    );
  }

  if (wasOpen) item.onOpenChange?.(false);

  if (state.items.size === 0) {
    state.root.remove();
    const host = globalThis as typeof globalThis & Record<string, unknown>;
    const states = host[dockStatesKey] as WeakMap<Document, DockState> | undefined;
    states?.delete(state.document);
  } else {
    renderDockButtons(state);
  }
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
.ai-game-assets-in-game-designer-dock__panel {
  position: fixed !important;
  top: 64px !important;
  right: 14px !important;
  z-index: 2147483646 !important;
  display: block !important;
  max-width: calc(100vw - 28px) !important;
  max-height: calc(100vh - 78px) !important;
  margin: 0 !important;
}
.ai-game-assets-in-game-designer-dock__panel[hidden] {
  display: none !important;
}
`;
  document.head.append(style);
}

function setDockPanelOpenState(state: DockState, isOpen: boolean): void {
  if (state.root.classList.contains("is-panel-open") === isOpen) return;

  const buttons = [...state.items.values()].map((item) => item.button);
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
