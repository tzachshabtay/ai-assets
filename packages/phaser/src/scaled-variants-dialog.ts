import {
  scaledVariantFrameSize,
  selectScaledVariant,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetScaledVariant,
} from "@ai-game-assets/core";
import type { AiAssetDebugClient, ScaledVariantCandidate } from "./debug-client.js";
import { openFrameTouchUpEditor, startSpritesheetPreview } from "./designer-support.js";

type VariantRequest = Parameters<AiAssetDebugClient["scaledVariant"]>[0];
type VariantDraft = { request: VariantRequest; candidates: ScaledVariantCandidate[]; chosenIndex?: number };
// Keep paid candidate batches when a dialog is closed or the designer switches
// panels. Scope drafts to this client and exact source version.
const drafts = new WeakMap<AiAssetDebugClient, Map<string, VariantDraft>>();

export function openScaledVariantsDialog(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  client: AiAssetDebugClient;
  resolveAssetUrl(file: string): string;
  onManifest(manifest: AiAssetManifest): void | Promise<void>;
}): () => void {
  let asset = options.asset;
  const savedPreviews = new Map<string, string>();
  const savedAnimations = new Set<() => void>();
  const candidateAnimations = new Set<() => void>();
  type Request = VariantRequest;
  let pendingRequest: Request | undefined;
  let chosen: ScaledVariantCandidate | undefined;
  const versionName = asset.activeVersion,
    sourceFile = asset.versions[versionName]?.file;
  if (!sourceFile) return () => {};
  const draftKey = JSON.stringify([asset.id, versionName, sourceFile]);
  const clientDrafts = drafts.get(options.client) ?? new Map<string, VariantDraft>();
  drafts.set(options.client, clientDrafts);
  const previousFocus = document.activeElement as HTMLElement | null;
  const operation = new AbortController();
  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Scaled variants");
  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__scaled-card";
  card.style.width = "min(800px, calc(100vw - 36px))";
  const heading = document.createElement("h2");
  heading.textContent = "Scaled variants";
  const intro = document.createElement("p");
  intro.textContent = `${asset.id} · Create another resolution of the current image. Generate three candidates, preview them, then use Promote or Save and close to apply your choice. The displayed size and animation timing stay unchanged.`;
  const list = document.createElement("div");
  list.className = "ai-game-assets-designer__scaled-list";
  const form = document.createElement("form");
  form.className = "ai-game-assets-designer__scaled-form";
  const title = document.createElement("h3");
  title.textContent = "Add variant";
  const input = (name: string) => {
    const label = document.createElement("label"),
      field = document.createElement("input");
    label.className = "ai-game-assets-designer__field";
    label.textContent = name;
    field.type = "number";
    field.min = "1";
    field.max = "8192";
    field.step = "1";
    field.required = true;
    field.setAttribute("aria-label", name);
    label.append(field);
    return { label, field };
  };
  const perFrame = Boolean(asset.frameGrid || asset.tileset);
  const width = input(perFrame ? "Frame width" : "Width"),
    height = input(perFrame ? "Frame height" : "Height");
  const methods = document.createElement("select");
  methods.setAttribute("aria-label", "Scaling method");
  for (const [value, text] of [
    ["nearest", "Strict pixels (nearest-neighbor)"],
    ["resample", "Smooth resize (no AI)"],
    ["ai-upscale", "OpenAI image upscale"],
  ]) {
    const option = document.createElement("option");
    option.value = value!;
    option.textContent = text!;
    methods.append(option);
  }
  methods.value = "ai-upscale";
  const methodLabel = document.createElement("label");
  methodLabel.className = "ai-game-assets-designer__field ai-game-assets-designer__scaled-method";
  methodLabel.textContent = "Scaling method";
  methodLabel.append(methods);
  const source = document.createElement("p");
  source.setAttribute("aria-live", "polite");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const button = (label: string, action: () => void) => {
    const b = document.createElement("button");
    b.className = "ai-game-assets-designer__animate-button";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", action);
    return b;
  };
  let selected: AiAssetScaledVariant | undefined,
    busy = false;
  const dispose = () => {
    operation.abort();
    stopAnimations(savedAnimations);
    stopAnimations(candidateAnimations);
    dialog.remove();
    previousFocus?.focus();
  };
  const close = async () => {
    // Never abort an in-flight save: it may already have reached the server.
    if (saving) return;
    if (pendingRequest && chosen) {
      if (await saveChosen()) dispose();
    } else dispose();
  };
  let saving = false;
  const closeButton = button("Close", () => { void close(); });
  const cancelEdit = button("Cancel edit", () => reset());
  cancelEdit.hidden = true;
  const generate = document.createElement("button");
  generate.className = "ai-game-assets-designer__animate-button";
  generate.type = "submit";
  generate.textContent = "Generate";
  form.append(
    title,
    width.label,
    height.label,
    methodLabel,
    source,
    generate,
    cancelEdit,
  );
  const candidatesSection = document.createElement("section");
  candidatesSection.hidden = true;
  candidatesSection.setAttribute("aria-label", "Generated candidates");
  const candidatesHeading = document.createElement("h3");
  candidatesHeading.textContent = "Choose a candidate";
  const candidatesList = document.createElement("div");
  candidatesList.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px";
  const saveChosen = () => {
    if (!pendingRequest || !chosen) return Promise.resolve(false);
    return request({ ...pendingRequest, action: "select", dataUrl: chosen.dataUrl,
      candidateSourceFile: chosen.sourceFile,
      method: chosen.method === "touch-up" ? "nearest" : chosen.method });
  };
  const promote = button("Promote", () => { void saveChosen(); });
  promote.disabled = true;
  const discard = button("Discard candidates", () => { clearCandidates(); status.textContent = "Candidates discarded."; });
  candidatesSection.append(candidatesHeading, candidatesList, promote, discard);
  card.append(heading, intro, list, form, candidatesSection, status, closeButton);
  dialog.append(card);
  options.root.append(dialog);
  const block = (event: Event) => event.stopPropagation();
  for (const name of ["pointerdown", "pointerup", "click", "wheel", "keyup"])
    dialog.addEventListener(name, block);
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      void close();
    }
    if (event.key === "Tab") {
      const fields = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
        ),
      ].filter((el) => !el.hidden && el.getClientRects().length);
      const first = fields[0],
        last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  function replacementVariant() {
    // Reuse an existing resolution whether it was reached through Edit, the
    // default dimensions, or typing a size directly into the form.
    return Object.values(asset.versions[versionName]?.scaledVariants ?? {}).find(variant => {
      const size = scaledVariantFrameSize(variant);
      return size.width === Number(width.field.value) && size.height === Number(height.field.value);
    }) ?? selected;
  }
  function updateSource() {
    const replacement = replacementVariant();
    title.textContent = replacement ? `Regenerate ${width.field.value} × ${height.field.value}` : "Add variant";
    generate.textContent = replacement ? "Regenerate" : "Generate";
    try {
      const candidate = selectScaledVariant(
        asset,
        {
          width: Number(width.field.value),
          height: Number(height.field.value),
        },
        { version: asset.versions[versionName], excludeId: replacement?.id },
      );
      const size = candidate && scaledVariantFrameSize(candidate);
      source.textContent = size
        ? `${replacement ? "The existing variant stays active until you save a replacement. " : ""}Closest source: ${size.width} × ${size.height}${candidate!.id ? " variant" : " original"}. ${methods.value === "ai-upscale" ? "Enlargement uses OpenAI with preservation instructions and may refine details. Reduction uses smooth resizing." : "No image-generation prompt or creative changes."}`
        : "";
    } catch {
      source.textContent = "Enter a positive width and height.";
    }
  }
  function reset() {
    clearCandidates();
    selected = undefined;
    const size = scaledVariantFrameSize(asset);
    width.field.value = String(Math.min(8192, size.width * 2));
    height.field.value = String(Math.min(8192, size.height * 2));
    title.textContent = "Add variant";
    generate.textContent = "Generate";
    cancelEdit.hidden = true;
    updateSource();
  }
  async function request(
    data: Parameters<AiAssetDebugClient["scaledVariant"]>[0],
    propagateError = false,
  ) {
    if (busy) return false;
    saving = true;
    setBusy(true);
    status.textContent = "Saving scaled variant…";
    try {
      const result = await options.client.scaledVariant(data, {
        signal: operation.signal,
      });
      if (operation.signal.aborted) return false;
      if (result.variant && result.previewDataUrl?.startsWith("data:image/png;base64,")) {
        if (data.expectedFile) savedPreviews.delete(data.expectedFile);
        savedPreviews.set(result.variant.file, result.previewDataUrl);
      } else if (data.action === "delete" && data.expectedFile) {
        savedPreviews.delete(data.expectedFile);
      }
      asset = result.manifest.assets[asset.id]!;
      await options.onManifest(result.manifest);
      status.textContent =
        data.action === "delete"
          ? "Variant deleted."
          : "Variant saved. The runtime will use it at the appropriate display size.";
      reset();
      render();
      return true;
    } catch (error) {
      if (!operation.signal.aborted)
        status.textContent =
          error instanceof Error ? error.message : String(error);
      if (propagateError) throw error;
      return false;
    } finally {
      saving = false;
      setBusy(false);
    }
  }
  function setBusy(value: boolean) {
    busy = value;
    if (value) card.setAttribute("aria-busy", "true");
    else card.removeAttribute("aria-busy");
    for (const control of card.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,input,select"))
      if (control !== closeButton) control.disabled = value;
    closeButton.disabled = saving;
    promote.disabled = value || !chosen;
  }
  function stopAnimations(stops: Set<() => void>) {
    for (const stop of stops) stop();
    stops.clear();
  }
  function clearCandidates() {
    clientDrafts.delete(draftKey);
    closeButton.textContent = "Close";
    stopAnimations(candidateAnimations);
    pendingRequest = undefined;
    chosen = undefined;
    candidatesList.replaceChildren();
    candidatesSection.hidden = true;
    promote.disabled = true;
  }
  function addAnimation(
    host: HTMLElement, image: HTMLImageElement,
    geometry: Pick<AiAssetScaledVariant, "dimensions" | "frameGrid">,
    src: string, stops: Set<() => void>,
  ) {
    if (!geometry.frameGrid || asset.kind === "tileset") return;
    const stage = document.createElement("div");
    stage.className = "ai-game-assets-designer__option-animation";
    stage.hidden = true;
    let stop: (() => void) | undefined;
    const animate = button("Animate", () => {
      if (stop) {
        stop(); stops.delete(stop); stop = undefined;
        stage.hidden = true; image.hidden = false; animate.textContent = "Animate";
      } else {
        image.hidden = true; stage.hidden = false; animate.textContent = "Stop";
        const frame = geometry.frameGrid!;
        const scale = Math.min(128 / frame.frameWidth, 128 / frame.frameHeight);
        stop = startSpritesheetPreview({ element: stage, src,
          asset: { ...asset, ...geometry, tileset: undefined },
          displaySize: { width: frame.frameWidth * scale, height: frame.frameHeight * scale },
          applyFrameTransforms: false });
        stops.add(stop);
      }
    });
    host.append(stage, animate);
  }
  async function generateCandidates(data: Request) {
    if (busy) return;
    clearCandidates();
    setBusy(true);
    status.textContent = "Generating 3 candidates…";
    try {
      const result = await options.client.scaledVariantOptions(data, { signal: operation.signal });
      if (operation.signal.aborted) return;
      showCandidates({ request: data, candidates: result.candidates });
    } catch (error) {
      if (!operation.signal.aborted) status.textContent = error instanceof Error ? error.message : String(error);
    } finally { setBusy(false); }
  }
  function showCandidates(draft: VariantDraft) {
    pendingRequest = draft.request;
    clientDrafts.set(draftKey, draft);
    for (const candidate of draft.candidates) {
      const candidateCard = document.createElement("div");
      candidateCard.className = "ai-game-assets-designer__option";
      candidateCard.setAttribute("aria-label", `Candidate ${candidate.index + 1}`);
      const select = button(`Select option ${candidate.index + 1}`, () => {
        chosen = candidate;
        draft.chosenIndex = candidate.index;
        closeButton.textContent = "Save and close";
        for (const card of candidatesList.children) {
          card.classList.toggle("is-selected", card === candidateCard);
          card.querySelector("button")?.setAttribute("aria-pressed", String(card === candidateCard));
        }
        promote.disabled = busy;
        status.textContent = `Option ${candidate.index + 1} selected. Promote or Save and close to apply this variant.`;
      });
      select.setAttribute("aria-label", `Select option ${candidate.index + 1}`);
      select.setAttribute("aria-pressed", "false");
      const image = document.createElement("img");
      image.src = candidate.dataUrl;
      image.alt = `Option ${candidate.index + 1}`;
      image.style.cssText = "display:block;width:100%;height:144px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#26303b 0% 25%,#19212c 0% 50%) 0/16px 16px";
      select.append(image);
      candidateCard.append(select);
      addAnimation(candidateCard, image, candidate, candidate.dataUrl, candidateAnimations);
      candidatesList.append(candidateCard);
      if (draft.chosenIndex === candidate.index) select.click();
    }
    candidatesSection.hidden = false;
    candidatesSection.scrollIntoView({ block: "nearest" });
    if (!chosen) status.textContent = "Choose a candidate, then Promote or Save and close. Closing without a selection keeps these candidates for later in this session.";
  }
  function identity(variant?: AiAssetScaledVariant) {
    return {
      assetId: asset.id,
      versionName,
      sourceFile: sourceFile!,
      id: variant?.id,
      expectedFile: variant?.file,
    };
  }
  function render() {
    stopAnimations(savedAnimations);
    list.replaceChildren();
    const variants = Object.values(
      asset.versions[versionName]?.scaledVariants ?? {},
    ).sort(
      (a, b) =>
        a.dimensions.width * a.dimensions.height -
        b.dimensions.width * b.dimensions.height,
    );
    if (!variants.length) {
      const empty = document.createElement("p");
      empty.textContent = "No scaled variants yet.";
      list.append(empty);
    }
    for (const variant of variants) {
      const row = document.createElement("section");
      row.style.cssText =
        "display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-top:1px solid #384251;padding:12px 0";
      const preview = document.createElement("img");
      preview.src = savedPreviews.get(variant.file) ?? options.resolveAssetUrl(variant.file);
      preview.alt = "";
      preview.style.cssText =
        "width:96px;height:96px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#26303b 0% 25%,#19212c 0% 50%) 0/16px 16px";
      const size = scaledVariantFrameSize(variant),
        label = document.createElement("strong");
      label.textContent = `${size.width} × ${size.height}${perFrame ? " per frame" : ""}`;
      const edit = button("Edit", () => {
        clearCandidates();
        selected = variant;
        width.field.value = String(size.width);
        height.field.value = String(size.height);
        methods.value =
          variant.method === "touch-up" ? "nearest" : variant.method;
        title.textContent = `Edit ${size.width} × ${size.height}`;
        generate.textContent = "Regenerate";
        cancelEdit.hidden = false;
        updateSource();
        width.field.focus();
      });
      const touchUp = button("Touch up…", () => {
        void openFrameTouchUpEditor({
          root: options.root,
          title: `${asset.id} ${size.width} × ${size.height}`,
          asset: {
            ...asset,
            kind: "image",
            dimensions: variant.dimensions,
            frameGrid: undefined,
            tileset: undefined,
            animations: undefined,
          },
          frameSrc: savedPreviews.get(variant.file) ?? options.resolveAssetUrl(variant.file),
          displaySize: {
            width: variant.dimensions.width,
            height: variant.dimensions.height,
          },
          signal: operation.signal,
          onSave: async (dataUrl) => {
            await request(
              { ...identity(variant), action: "touch-up", dataUrl },
              true,
            );
          },
        }).catch((error) => {
          status.textContent =
            error instanceof Error ? error.message : String(error);
        });
      });
      const remove = button("Delete", () => {
        void request({ ...identity(variant), action: "delete" });
      });
      row.append(preview, label);
      addAnimation(row, preview, variant, preview.src, savedAnimations);
      row.append(edit, touchUp, remove);
      list.append(row);
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void generateCandidates({
      ...identity(replacementVariant()),
      action: "generate",
      width: Number(width.field.value),
      height: Number(height.field.value),
      method: methods.value as "nearest" | "resample" | "ai-upscale",
    });
  });
  const change = () => { clearCandidates(); updateSource(); };
  width.field.addEventListener("input", change);
  height.field.addEventListener("input", change);
  methods.addEventListener("change", change);
  const draft = clientDrafts.get(draftKey);
  render();
  reset();
  if (draft && (!draft.request.id || asset.versions[versionName]?.scaledVariants?.[draft.request.id]?.file === draft.request.expectedFile)) {
    selected = draft.request.id ? asset.versions[versionName]?.scaledVariants?.[draft.request.id] : undefined;
    width.field.value = String(draft.request.width);
    height.field.value = String(draft.request.height);
    methods.value = draft.request.method ?? "nearest";
    title.textContent = selected ? `Edit ${draft.request.width} × ${draft.request.height}` : "Add variant";
    generate.textContent = selected ? "Regenerate" : "Generate";
    cancelEdit.hidden = !selected;
    updateSource();
    showCandidates(draft);
  }
  width.field.focus();
  return dispose;
}
