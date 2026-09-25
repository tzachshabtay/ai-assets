import type { AiAssetDefinition, AiAssetDimensions, AiAssetFrameGrid, AiAssetManifest } from "@ai-game-assets/core";
import {
  fileToDataUrl,
  imageSizeFromSource,
  imageSourceToDataUrl,
  openFrameTouchUpEditor,
  pickUploadFile,
  readableAssetName,
  renderAssetFolderBrowser
} from "./designer-support.js";

export type GenerationReference = { name: string; dataUrl: string; frameGrid?: AiAssetFrameGrid };

export type GenerationReferenceControlOptions = {
  root: HTMLElement;
  getManifest(): AiAssetManifest;
  resolveAssetUrl(file: string): string;
  getDimensions(): AiAssetDimensions;
  getAsset?(): AiAssetDefinition;
  initialValue?: GenerationReference;
  onChange?(value: GenerationReference | undefined): void;
  onOpen?(): void;
  onClose?(): void;
};

export type GenerationReferenceControl = {
  element: HTMLDivElement;
  getValue(): GenerationReference | undefined;
  /** Synchronize a parent draft without firing onChange. */
  setValue(value?: GenerationReference): void;
  destroy(): void;
};

/** One reference shared by ordinary generation, derivation, and tile generation. */
export function createGenerationReferenceControl(
  options: GenerationReferenceControlOptions
): GenerationReferenceControl {
  const element = document.createElement("div");
  element.className = "ai-game-assets-reference";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Generation reference");
  const preview = document.createElement("div");
  preview.className = "ai-game-assets-reference__preview";
  const thumbnail = document.createElement("img");
  thumbnail.alt = "Selected generation reference";
  thumbnail.className = "ai-game-assets-reference__thumbnail";
  const name = document.createElement("span");
  name.className = "ai-game-assets-reference__name";
  preview.append(thumbnail, name);
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-reference__actions";
  const add = button("Add reference");
  const remove = button("Remove");
  remove.setAttribute("aria-label", "Remove generation reference");
  actions.append(add, remove);
  const status = document.createElement("span");
  status.className = "ai-game-assets-reference__status";
  status.setAttribute("role", "status");
  element.append(preview, actions, status);

  let value = copyReference(options.initialValue);
  let revision = 0;
  let destroyed = false;
  let closeDialog: (() => void) | undefined;
  let sketchController: AbortController | undefined;

  const render = () => {
    element.dataset.selected = String(Boolean(value));
    preview.hidden = !value;
    thumbnail.hidden = !value;
    if (value) thumbnail.src = value.dataUrl;
    else thumbnail.removeAttribute("src");
    name.textContent = value?.name ?? "No reference selected";
    name.title = value?.name ?? "";
    add.textContent = value ? "Replace" : "Add reference";
    add.setAttribute("aria-label", value ? "Replace reference" : "Add reference");
    remove.hidden = !value;
    status.hidden = !status.textContent;
  };
  const invalidate = () => {
    revision += 1;
    closeDialog?.();
    sketchController?.abort();
    sketchController = undefined;
  };
  const showError = (error: unknown) => {
    status.textContent = error instanceof Error ? error.message : String(error);
    render();
  };
  const select = (reference: GenerationReference, operation: number) => {
    if (destroyed || operation !== revision) return;
    value = copyReference(reference);
    status.textContent = "";
    closeDialog?.();
    render();
    options.onChange?.(copyReference(value));
  };

  const chooseFile = async (operation: number) => {
    if (destroyed || operation !== revision) return;
    try {
      // Do not lock the control while the native picker is open: cancelling
      // that picker does not produce a file selection event in every browser.
      const file = await pickUploadFile("image/png,image/jpeg,image/webp,image/svg+xml");
      if (!file || destroyed || operation !== revision) return;
      const mimeType = file.type || imageMimeType(file.name);
      if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType)) {
        throw new Error("Choose a PNG, JPEG, WebP, or SVG image.");
      }
      const dataUrl = await fileToDataUrl(file.type ? file : file.slice(0, file.size, mimeType));
      await imageSizeFromSource(dataUrl);
      select({ name: file.name, dataUrl }, operation);
    } catch (error) {
      if (!destroyed && operation === revision) showError(error);
    }
  };

  const sketch = async (operation: number) => {
    if (destroyed || operation !== revision) return;
    const controller = new AbortController();
    sketchController = controller;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      controller.signal.removeEventListener("abort", close);
      if (sketchController === controller) sketchController = undefined;
      options.onClose?.();
      if (!destroyed && operation === revision) add.focus();
    };
    controller.signal.addEventListener("abort", close, { once: true });
    options.onOpen?.();
    try {
      const requested = options.getDimensions();
      const dimensions = {
        width: sketchDimension(requested.width),
        height: sketchDimension(requested.height)
      };
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const frameSrc = canvas.toDataURL("image/png");
      if (!frameSrc.startsWith("data:image/png")) throw new Error("Could not create a sketch at these dimensions.");
      const scale = Math.min(480 / dimensions.width, 480 / dimensions.height);
      await openFrameTouchUpEditor({
        root: options.root,
        signal: controller.signal,
        asset: {
          id: options.getAsset?.().id ?? "reference.sketch",
          kind: "image",
          prompt: "Reference sketch",
          dimensions,
          activeVersion: "",
          versions: {}
        },
        title: "Reference sketch",
        frameSrc,
        displaySize: { width: dimensions.width * scale, height: dimensions.height * scale },
        onSave: (dataUrl) => select({ name: "Reference sketch.png", dataUrl }, operation),
        onClose: close
      });
    } catch (error) {
      close();
      if (!destroyed && operation === revision) showError(error);
    }
  };

  const openChooser = () => {
    if (destroyed) return;
    invalidate();
    const operation = revision;
    status.textContent = "";
    render();
    const overlay = document.createElement("div");
    overlay.className = "ai-game-assets-reference-picker";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:rgba(6,8,12,.72)";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Choose a generation reference");
    dialog.style.cssText = "display:grid;gap:14px;width:min(520px,100%);max-height:85vh;overflow:auto;padding:18px;border:1px solid #384251;border-radius:10px;background:#141820;color:#f5f7fb;font:13px system-ui";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px";
    const title = document.createElement("strong");
    title.textContent = "Add reference";
    const cancel = button("Cancel");
    header.append(title, cancel);
    const body = document.createElement("div");
    body.style.cssText = "display:grid;gap:10px";
    const dialogStatus = document.createElement("span");
    dialogStatus.setAttribute("role", "status");
    dialog.append(header, body, dialogStatus);
    overlay.append(dialog);
    const priorFocus = document.activeElement;
    const close = () => {
      if (closeDialog !== close) return;
      closeDialog = undefined;
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      options.onClose?.();
      if (!destroyed && priorFocus instanceof HTMLElement && priorFocus.isConnected) priorFocus.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        revision += 1;
        close();
      } else if (event.key === "Tab") {
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!dialog.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        event.stopPropagation();
      }
    };
    cancel.addEventListener("click", () => { revision += 1; close(); });
    const existing = button("Existing asset");
    const computer = button("Computer");
    const drawing = button("Sketch");
    existing.addEventListener("click", () => {
      title.textContent = "Choose an existing asset";
      const manifest = options.getManifest();
      const assetIds = Object.values(manifest.assets)
        .filter((asset) => ["image", "spritesheet", "animation", "tileset"].includes(asset.kind) &&
          Boolean(asset.versions[asset.activeVersion]?.file))
        .map((asset) => asset.id);
      const browser = document.createElement("div");
      browser.style.cssText = "min-height:180px;max-height:55vh;overflow:auto";
      const focusBrowser = () => {
        (browser.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")[0] ?? cancel).focus();
      };
      // Folder navigation replaces its buttons synchronously. Restore focus
      // after the child click handler has removed the previously focused one.
      browser.addEventListener("click", () => {
        if (closeDialog === close && !dialog.contains(document.activeElement)) focusBrowser();
      });
      body.replaceChildren(browser);
      if (!assetIds.length) {
        dialogStatus.textContent = "No saved image assets are available yet.";
        cancel.focus();
        return;
      }
      renderAssetFolderBrowser({
        container: browser,
        manifest,
        selectedAssetId: "",
        assetIds,
        onSelect: async (assetId) => {
          const selection = ++revision;
          const asset = manifest.assets[assetId];
          const file = asset.versions[asset.activeVersion]?.file;
          if (!file) return;
          dialogStatus.textContent = "Loading reference…";
          try {
            const dataUrl = await imageSourceToDataUrl(options.resolveAssetUrl(file));
            select({
              name: readableAssetName(assetId), dataUrl,
              ...(asset.kind !== "tileset" && asset.frameGrid ? { frameGrid: { ...asset.frameGrid } } : {})
            }, selection);
          } catch (error) {
            if (destroyed || selection !== revision || closeDialog !== close) return;
            dialogStatus.textContent = error instanceof Error ? error.message : String(error);
          }
        }
      });
      focusBrowser();
    });
    computer.addEventListener("click", () => { close(); void chooseFile(operation); });
    drawing.addEventListener("click", () => { close(); void sketch(operation); });
    body.append(existing, computer, drawing);
    closeDialog = close;
    options.root.append(overlay);
    window.addEventListener("keydown", onKey, true);
    options.onOpen?.();
    existing.focus();
  };
  add.addEventListener("click", openChooser);
  remove.addEventListener("click", () => {
    invalidate();
    value = undefined;
    status.textContent = "";
    render();
    options.onChange?.(undefined);
  });
  render();

  return {
    element,
    getValue: () => copyReference(value),
    setValue(next) {
      if (destroyed) return;
      invalidate();
      value = copyReference(next);
      status.textContent = "";
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      invalidate();
      element.remove();
    }
  };
}

function copyReference(reference: GenerationReference | undefined): GenerationReference | undefined {
  return reference ? {
    ...reference,
    ...(reference.frameGrid ? { frameGrid: { ...reference.frameGrid } } : {})
  } : undefined;
}

function sketchDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 256;
}

function imageMimeType(name: string): string {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" } as Record<string, string>)[extension ?? ""] ?? "";
}

function button(label: string): HTMLButtonElement {
  const result = document.createElement("button");
  result.type = "button";
  result.textContent = label;
  result.className = "ai-game-assets-reference__button";
  return result;
}
