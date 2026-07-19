import type {
  AiAssetDefinition,
  AiAssetFrameGrid,
  AiAssetTileset,
  AiTilesetAnimation
} from "@ai-game-assets/core";
import type {
  GeneratedDebugOption,
  GeneratedTilesetAnimationCandidate
} from "./debug-client.js";
import {
  assetWithGeneratedGeometry,
  loadImageElement,
  openFrameTouchUpEditor,
  positiveIntegerInput,
  positiveIntegerValue,
  readableAssetName,
  replaceSpriteSheetFrames,
  setFrameBackground
} from "./designer-support.js";

export type DesignerTilesetAnimation = AiTilesetAnimation;
export type DesignerTilesetMetadata = AiAssetTileset;
export type TilesetMixSelection = "base" | number;

export type TilesetAnimationMixResult = {
  animationKey: string;
  frames: string[];
  selections: TilesetMixSelection[];
};

export type TilesetBaseMixResult = {
  dataUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  tileset: DesignerTilesetMetadata;
  selections: TilesetMixSelection[];
};

export type TilesetBaseMixPlan = {
  dimensions: TilesetBaseMixResult["dimensions"];
  tileset: DesignerTilesetMetadata;
  selections: TilesetMixSelection[];
};

export type TilesetBaseMixCurrent = {
  asset: AiAssetDefinition;
  sheetSrc: string;
};

export type TilesetEditorResult = {
  dataUrl: string;
};

export type TilesetAnimationEditorResult = {
  frames: string[];
  animation: AiTilesetAnimation;
};

export type TilesetTileGenerationOverride = Pick<
  DesignerTilesetMetadata,
  "tileWidth" | "tileHeight" | "columns" | "rows" | "tileCount" | "tiles"
>;

export function resolveTilesetBaseMixCurrent(
  asset: AiAssetDefinition,
  activeSheetSrc: string,
  currentOption?: GeneratedDebugOption
): TilesetBaseMixCurrent {
  return currentOption ? {
    asset: assetWithGeneratedGeometry(asset, currentOption),
    sheetSrc: currentOption.dataUrl
  } : {
    asset,
    sheetSrc: activeSheetSrc
  };
}

export function tilesetTileGenerationOverride(
  tileset: DesignerTilesetMetadata,
  tile: number
): TilesetTileGenerationOverride {
  const prompt = tilesetTilePrompt(tileset, tile);
  if (!prompt || tile < 0 || tile >= tilesetTileCount(tileset)) {
    throw new Error(`Tile ${tile + 1} requires a prompt before it can be regenerated.`);
  }
  return {
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    columns: 1,
    rows: 1,
    tileCount: 1,
    tiles: [{ prompt }]
  };
}

export function createMixedTilesetOption(
  template: GeneratedDebugOption,
  result: TilesetBaseMixResult,
  prompt: string,
  index = template.index
): GeneratedDebugOption {
  return {
    ...template,
    index,
    dataUrl: result.dataUrl,
    mimeType: "image/png",
    prompt,
    revisedPrompt: undefined,
    dimensions: result.dimensions,
    tileset: result.tileset,
    settings: {
      ...template.settings,
      format: "png"
    }
  };
}

type TilesetMixSource = {
  selection: TilesetMixSelection;
  label: string;
  shortLabel: string;
  overviewSheetSrc: string;
  sheetSrcs: string[];
  tileset: DesignerTilesetMetadata;
  tileOverrides?: Map<number, {
    src: string;
    sheetSrcs?: string[];
    tile: number;
    tileset: DesignerTilesetMetadata;
  }>;
};

type TilesetTileReplacement = {
  selection: TilesetMixSelection;
  src: string;
  sheetSrcs?: string[];
  tile: number;
  tileset: DesignerTilesetMetadata;
};

type TilesetMixerResult = {
  sheets: string[];
  selections: TilesetMixSelection[];
};

type TilesetMixerOptions = {
  root: HTMLElement;
  assetId: string;
  ariaLabel: string;
  title: string;
  hint: string;
  confirmLabel: string;
  busyLabel: string;
  targetTileset: DesignerTilesetMetadata;
  targetDimensions: TilesetBaseMixResult["dimensions"];
  frameCount: number;
  frameDelayMs?(frameSlot: number): number;
  navigatorSource?: TilesetMixSelection;
  sources: TilesetMixSource[];
  selections: TilesetMixSelection[];
  tilePrompt?(tile: number): string | undefined;
  regenerateTile?(tile: number): Promise<TilesetTileReplacement[]>;
};

export function isDesignerTilesetAsset(asset: AiAssetDefinition | undefined): boolean {
  return Boolean(asset?.kind === "tileset" && asset.tileset);
}

export function tilesetMetadataForAsset(
  asset: AiAssetDefinition | undefined
): DesignerTilesetMetadata | undefined {
  return asset?.tileset;
}

export function tilesetAnimationForKey(
  asset: AiAssetDefinition | undefined,
  animationKey: string
): DesignerTilesetAnimation | undefined {
  return tilesetMetadataForAsset(asset)?.animations?.find((animation) => (
    animation.key === animationKey
  ));
}

export function tilesetTilePrompt(
  tileset: DesignerTilesetMetadata | undefined,
  tile: number
): string | undefined {
  const prompt = tileset?.tiles?.[tile]?.prompt?.trim();
  return prompt || undefined;
}

export function tilesetAnimationWithFrameDelays(
  animation: AiTilesetAnimation,
  frameDelays: number[]
): AiTilesetAnimation {
  if (frameDelays.length !== animation.frameCount) {
    throw new Error(
      `Tileset animation "${animation.key}" requires ${animation.frameCount} frame delays, ` +
        `received ${frameDelays.length}.`
    );
  }

  const fallbackDelayMs = Math.round(1000 / Math.max(1, animation.frameRate));
  return {
    ...animation,
    frameTimings: frameDelays.map((delayMs) => ({
      delayMs: positiveIntegerValue(delayMs, fallbackDelayMs)
    }))
  };
}

/**
 * Resolves the generated base sheet geometry and the initial per-tile choices.
 * Existing tile indexes keep the current tile by default. New indexes, which
 * have no current tile to keep, default to the first generated option.
 */
export function planTilesetBaseMix(
  asset: AiAssetDefinition,
  candidates: GeneratedDebugOption[]
): TilesetBaseMixPlan {
  const currentTileset = tilesetMetadataForAsset(asset);
  if (!currentTileset) {
    throw new Error(`AI asset "${asset.id}" is not a tileset.`);
  }
  if (candidates.length === 0) {
    throw new Error("Tileset generation returned no candidates.");
  }

  const sortedCandidates = [...candidates].sort((left, right) => left.index - right.index);
  assertUniqueCandidateIndexes(sortedCandidates);
  const firstCandidate = sortedCandidates[0]!;
  const targetTileset = firstCandidate.tileset ?? currentTileset;
  const targetDimensions = normalizedTilesetDimensions(
    targetTileset,
    firstCandidate.dimensions,
    `Generated option ${firstCandidate.index + 1}`
  );

  for (const candidate of sortedCandidates.slice(1)) {
    const candidateTileset = candidate.tileset ?? currentTileset;
    const candidateDimensions = normalizedTilesetDimensions(
      candidateTileset,
      candidate.dimensions,
      `Generated option ${candidate.index + 1}`
    );
    if (
      !sameTilesetGrid(candidateTileset, targetTileset) ||
      !sameDimensions(candidateDimensions, targetDimensions)
    ) {
      throw new Error("All generated tileset options must use the same tile grid and dimensions.");
    }
  }

  const currentTileCount = tilesetTileCount(currentTileset);
  const targetTileCount = tilesetTileCount(targetTileset);
  const selections: TilesetMixSelection[] = Array.from(
    { length: targetTileCount },
    (_, tile): TilesetMixSelection => tile < currentTileCount ? "base" : firstCandidate.index
  );

  return {
    dimensions: targetDimensions,
    tileset: targetTileset,
    selections
  };
}

export async function openTilesetEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  src: string;
  regenerateTile(
    tile: number,
    tileset: TilesetTileGenerationOverride,
    currentTileSrc: string
  ): Promise<GeneratedDebugOption[]>;
  onConfirm(result: TilesetEditorResult): void | Promise<void>;
}): Promise<void> {
  const tileset = tilesetMetadataForAsset(options.asset);
  if (!tileset) return;

  const tileCount = tilesetTileCount(tileset);
  const frameGrid = tilesetFrameGrid(tileset);
  const touchUpScale = Math.min(224 / tileset.tileWidth, 224 / tileset.tileHeight);
  const touchUpDisplaySize = {
    width: Math.max(1, Math.round(tileset.tileWidth * touchUpScale)),
    height: Math.max(1, Math.round(tileset.tileHeight * touchUpScale))
  };
  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal ai-game-assets-designer__tileset-editor";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Edit ${readableAssetName(options.assetId)} tileset`);

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__tileset-editor-card";
  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent = `Edit ${readableAssetName(options.assetId)} tileset`;
  const stage = document.createElement("div");
  stage.className = "ai-game-assets-designer__modal-stage ai-game-assets-designer__tileset-editor-stage";
  const prompt = document.createElement("div");
  prompt.className = "ai-game-assets-designer__tileset-tile-prompt";
  const strip = document.createElement("div");
  strip.className = "ai-game-assets-designer__frame-strip ai-game-assets-designer__tileset-editor-strip";
  const feedback = document.createElement("div");
  feedback.className = "ai-game-assets-designer__modal-feedback";
  feedback.hidden = true;

  const touchUpButton = modalButton("Touch up...");
  const regenerateButton = modalButton("Regenerate...");
  const copyButton = modalButton("Copy");
  const pasteButton = modalButton("Paste");
  const cancelButton = modalButton("Cancel");
  const confirmButton = modalButton("Confirm");
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(
    touchUpButton,
    regenerateButton,
    copyButton,
    pasteButton,
    cancelButton,
    confirmButton
  );

  card.append(title, stage, prompt, strip, feedback, actions);
  dialog.append(card);
  options.root.append(dialog);

  let selectedTile = 0;
  let sheetSrc = options.src;
  let editedSheetSrc: string | undefined;
  let copiedTileSrc: string | undefined;
  let busy = false;
  let closed = false;
  const tileButtons: HTMLButtonElement[] = [];

  const setFeedback = (
    message: string,
    kind: "idle" | "busy" | "error" | "success" = "idle"
  ) => {
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.hidden = message.length === 0;
  };

  const syncButtons = () => {
    touchUpButton.disabled = busy;
    regenerateButton.disabled = busy || !tilesetTilePrompt(tileset, selectedTile);
    copyButton.disabled = busy;
    pasteButton.disabled = busy || !copiedTileSrc;
    cancelButton.disabled = busy;
    confirmButton.disabled = busy;
    tileButtons.forEach((button) => {
      button.disabled = busy;
    });
  };

  const render = () => {
    setFrameBackground(stage, {
      src: sheetSrc,
      frame: selectedTile,
      frameGrid,
      displaySize: { width: 224, height: 224 }
    });
    const tilePrompt = tilesetTilePrompt(tileset, selectedTile);
    prompt.textContent = tilePrompt
      ? `Tile ${selectedTile + 1}: ${tilePrompt}`
      : `Tile ${selectedTile + 1}`;
    tileButtons.forEach((button, tile) => {
      button.classList.toggle("is-selected", tile === selectedTile);
      button.setAttribute("aria-pressed", String(tile === selectedTile));
      setFrameBackground(button, {
        src: sheetSrc,
        frame: tile,
        frameGrid,
        displaySize: { width: 48, height: 48 }
      });
    });
    syncButtons();
  };

  const replaceTile = async (tileSrc: string) => {
    sheetSrc = await replaceSpriteSheetFrames({
      src: sheetSrc,
      uploadSrc: tileSrc,
      frameGrid,
      frames: [selectedTile]
    });
    editedSheetSrc = sheetSrc;
    render();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", keyHandler, true);
    dialog.remove();
  };

  const keyHandler = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    close();
  };

  for (let tile = 0; tile < tileCount; tile += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-game-assets-designer__frame-thumb";
    button.setAttribute("aria-label", `Tile ${tile + 1}`);
    button.addEventListener("click", () => {
      selectedTile = tile;
      setFeedback("");
      render();
    });
    tileButtons.push(button);
    strip.append(button);
  }

  touchUpButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    syncButtons();
    setFeedback(`Opening touch-up for tile ${selectedTile + 1}...`, "busy");
    try {
      const tile = selectedTile;
      const tileSrc = await extractTilesetTileDataUrl(sheetSrc, tileset, tile);
      await openFrameTouchUpEditor({
        root: options.root,
        asset: options.asset,
        title: `${readableAssetName(options.assetId)} tile ${tile + 1}`,
        frameSrc: tileSrc,
        displaySize: touchUpDisplaySize,
        onSave: async (editedTileSrc) => {
          selectedTile = tile;
          await replaceTile(editedTileSrc);
          setFeedback(`Touched up tile ${tile + 1}.`, "success");
        }
      });
      setFeedback("");
    } catch (error) {
      setFeedback(`Could not open tile touch-up: ${tilesetErrorMessage(error)}`, "error");
    } finally {
      busy = false;
      syncButtons();
    }
  });

  regenerateButton.addEventListener("click", async () => {
    if (busy || regenerateButton.disabled) return;
    const tile = selectedTile;
    busy = true;
    syncButtons();
    setFeedback(`Generating 3 new options for tile ${tile + 1}...`, "busy");
    try {
      const currentTileSrc = await extractTilesetTileDataUrl(sheetSrc, tileset, tile);
      const generated = [...await options.regenerateTile(
        tile,
        tilesetTileGenerationOverride(tileset, tile),
        currentTileSrc
      )].sort((left, right) => left.index - right.index);
      if (generated.length !== 3) {
        throw new Error(`Expected 3 regenerated tile options, received ${generated.length}.`);
      }
      assertUniqueCandidateIndexes(generated);
      const selected = await openTilesetTileChoiceDialog({
        root: options.root,
        assetId: options.assetId,
        tile,
        prompt: tilesetTilePrompt(tileset, tile)!,
        candidates: generated
      });
      if (selected) {
        selectedTile = tile;
        await replaceTile(selected.dataUrl);
        setFeedback(`Replaced tile ${tile + 1}.`, "success");
      } else {
        setFeedback(`Kept tile ${tile + 1}.`, "idle");
      }
    } catch (error) {
      setFeedback(`Could not regenerate tile: ${tilesetErrorMessage(error)}`, "error");
    } finally {
      busy = false;
      syncButtons();
    }
  });

  copyButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    syncButtons();
    try {
      copiedTileSrc = await extractTilesetTileDataUrl(sheetSrc, tileset, selectedTile);
      setFeedback(`Copied tile ${selectedTile + 1}. Select another tile and paste.`, "success");
    } catch (error) {
      setFeedback(`Could not copy tile: ${tilesetErrorMessage(error)}`, "error");
    } finally {
      busy = false;
      syncButtons();
    }
  });

  pasteButton.addEventListener("click", async () => {
    if (busy || !copiedTileSrc) return;
    busy = true;
    syncButtons();
    try {
      await replaceTile(copiedTileSrc);
      setFeedback(`Pasted into tile ${selectedTile + 1}.`, "success");
    } catch (error) {
      setFeedback(`Could not paste tile: ${tilesetErrorMessage(error)}`, "error");
    } finally {
      busy = false;
      syncButtons();
    }
  });

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", async () => {
    if (busy) return;
    if (!editedSheetSrc) {
      close();
      return;
    }
    busy = true;
    syncButtons();
    setFeedback("Applying tileset edits...", "busy");
    try {
      await options.onConfirm({ dataUrl: editedSheetSrc });
      close();
    } catch (error) {
      setFeedback(`Could not apply tileset edits: ${tilesetErrorMessage(error)}`, "error");
      busy = false;
      syncButtons();
    }
  });

  window.addEventListener("keydown", keyHandler, true);
  render();
  tileButtons[0]?.focus();
}

export async function openTilesetAnimationEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  animationKey: string;
  frames: string[];
  onConfirm(result: TilesetAnimationEditorResult): void | Promise<void>;
}): Promise<void> {
  const tileset = tilesetMetadataForAsset(options.asset);
  const animation = tilesetAnimationForKey(options.asset, options.animationKey);
  if (!tileset || !animation) return;
  if (options.frames.length !== animation.frameCount) {
    throw new Error(
      `${readableAssetName(animation.key)} requires ${animation.frameCount} frames, ` +
        `but ${options.frames.length} are available.`
    );
  }

  const tileCount = tilesetTileCount(tileset);
  const frameGrid = tilesetFrameGrid(tileset);
  const touchUpScale = Math.min(224 / tileset.tileWidth, 224 / tileset.tileHeight);
  const touchUpDisplaySize = {
    width: Math.max(1, Math.round(tileset.tileWidth * touchUpScale)),
    height: Math.max(1, Math.round(tileset.tileHeight * touchUpScale))
  };
  const defaultDelayMs = Math.round(1000 / Math.max(1, animation.frameRate));
  const frameDelays = Array.from(
    { length: animation.frameCount },
    (_, frameSlot) => positiveIntegerValue(
      animation.frameTimings?.[frameSlot]?.delayMs,
      defaultDelayMs
    )
  );
  const frames = [...options.frames];

  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal ai-game-assets-designer__tileset-animation-editor";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute(
    "aria-label",
    `Edit ${readableAssetName(options.assetId)} ${readableAssetName(animation.key)} animation`
  );

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__tileset-mixer-card";
  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent =
    `Edit ${readableAssetName(options.assetId)} · ${readableAssetName(animation.key)}`;

  const body = document.createElement("div");
  body.className = "ai-game-assets-designer__tileset-mixer-body";
  const navigatorPanel = document.createElement("section");
  navigatorPanel.className = "ai-game-assets-designer__tileset-navigator-panel";
  const navigatorTitle = document.createElement("div");
  navigatorTitle.className = "ai-game-assets-designer__tileset-section-title";
  navigatorTitle.textContent = "Tiles";
  const navigator = document.createElement("div");
  navigator.className = "ai-game-assets-designer__tileset-navigator";
  navigatorPanel.append(navigatorTitle, navigator);

  const previewPanel = document.createElement("section");
  previewPanel.className = "ai-game-assets-designer__tileset-preview-panel";
  const previewTitle = document.createElement("div");
  previewTitle.className = "ai-game-assets-designer__tileset-section-title";
  const stage = document.createElement("div");
  stage.className =
    "ai-game-assets-designer__modal-stage ai-game-assets-designer__tileset-editor-stage";
  const prompt = document.createElement("div");
  prompt.className = "ai-game-assets-designer__tileset-tile-prompt";
  const strip = document.createElement("div");
  strip.className = "ai-game-assets-designer__frame-strip ai-game-assets-designer__tileset-editor-strip";

  const delayInput = document.createElement("input");
  delayInput.type = "number";
  delayInput.min = "1";
  delayInput.step = "1";
  delayInput.inputMode = "numeric";
  const delayField = document.createElement("label");
  delayField.className = "ai-game-assets-designer__field";
  const delayLabel = document.createElement("span");
  delayLabel.textContent = "Delay ms";
  delayField.append(delayLabel, delayInput);
  const fields = document.createElement("div");
  fields.className = "ai-game-assets-designer__frame-fields";
  fields.append(delayField);

  previewPanel.append(previewTitle, stage, prompt, strip, fields);
  body.append(navigatorPanel, previewPanel);

  const feedback = document.createElement("div");
  feedback.className = "ai-game-assets-designer__modal-feedback";
  feedback.hidden = true;
  const touchUpButton = modalButton("Touch up...");
  const cancelButton = modalButton("Cancel");
  const confirmButton = modalButton("Confirm");
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(touchUpButton, cancelButton, confirmButton);

  card.append(title, body, feedback, actions);
  dialog.append(card);
  options.root.append(dialog);

  let selectedTile = 0;
  let selectedFrameSlot = 0;
  let previewFrameSlot = 0;
  let previewTimeout: number | undefined;
  let busy = false;
  let closed = false;
  const tileButtons: HTMLButtonElement[] = [];
  const frameButtons: HTMLButtonElement[] = [];

  const setFeedback = (
    message: string,
    kind: "idle" | "busy" | "error" | "success" = "idle"
  ) => {
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.hidden = message.length === 0;
  };

  const syncButtons = () => {
    touchUpButton.disabled = busy;
    cancelButton.disabled = busy;
    confirmButton.disabled = busy;
    delayInput.disabled = busy;
    tileButtons.forEach((button) => {
      button.disabled = busy;
    });
    frameButtons.forEach((button) => {
      button.disabled = busy;
    });
  };

  const stopPreview = () => {
    if (previewTimeout !== undefined) {
      window.clearTimeout(previewTimeout);
      previewTimeout = undefined;
    }
  };

  const showPreviewFrame = (frameSlot: number) => {
    const src = frames[frameSlot];
    if (!src) return;
    setFrameBackground(stage, {
      src,
      frame: selectedTile,
      frameGrid,
      displaySize: { width: 224, height: 224 }
    });
    tileButtons.forEach((button, tile) => {
      setFrameBackground(button, {
        src,
        frame: tile,
        frameGrid,
        displaySize: { width: 56, height: 56 }
      });
    });
    frameButtons.forEach((button, index) => {
      button.classList.toggle("is-previewing", index === frameSlot);
      button.setAttribute("aria-current", index === frameSlot ? "true" : "false");
    });
  };

  const schedulePreview = (startFrameSlot = previewFrameSlot) => {
    stopPreview();
    previewFrameSlot = startFrameSlot % frames.length;
    const step = () => {
      if (closed || frames.length === 0) return;
      const frameSlot = previewFrameSlot;
      showPreviewFrame(frameSlot);
      previewFrameSlot = (frameSlot + 1) % frames.length;
      previewTimeout = window.setTimeout(step, frameDelays[frameSlot] ?? defaultDelayMs);
    };
    step();
  };

  const render = () => {
    previewTitle.textContent =
      `Tile ${selectedTile + 1} · Frame ${selectedFrameSlot + 1}`;
    const tilePrompt = animation.tiles?.[selectedTile]?.prompt?.trim();
    prompt.textContent = tilePrompt
      ? `Tile ${selectedTile + 1}: ${tilePrompt}`
      : `Tile ${selectedTile + 1}`;
    delayInput.value = String(frameDelays[selectedFrameSlot] ?? defaultDelayMs);

    tileButtons.forEach((button, tile) => {
      button.classList.toggle("is-selected", tile === selectedTile);
      button.setAttribute("aria-pressed", String(tile === selectedTile));
    });
    frameButtons.forEach((button, frameSlot) => {
      button.classList.toggle("is-selected", frameSlot === selectedFrameSlot);
      button.setAttribute("aria-pressed", String(frameSlot === selectedFrameSlot));
      setFrameBackground(button, {
        src: frames[frameSlot]!,
        frame: selectedTile,
        frameGrid,
        displaySize: { width: 48, height: 48 }
      });
    });
    syncButtons();
    schedulePreview(selectedFrameSlot);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    stopPreview();
    window.removeEventListener("keydown", keyHandler, true);
    dialog.remove();
  };

  const keyHandler = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    close();
  };

  for (let tile = 0; tile < tileCount; tile += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-game-assets-designer__tileset-tile";
    button.dataset.source = String(tile + 1);
    button.setAttribute("aria-label", `Tile ${tile + 1}`);
    button.addEventListener("click", () => {
      selectedTile = tile;
      setFeedback("");
      render();
    });
    tileButtons.push(button);
    navigator.append(button);
  }

  for (let frameSlot = 0; frameSlot < frames.length; frameSlot += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-game-assets-designer__frame-thumb";
    button.setAttribute("aria-label", `Frame ${frameSlot + 1}`);
    button.addEventListener("click", () => {
      selectedFrameSlot = frameSlot;
      setFeedback("");
      render();
    });
    frameButtons.push(button);
    strip.append(button);
  }

  delayInput.addEventListener("input", () => {
    frameDelays[selectedFrameSlot] = positiveIntegerInput(
      delayInput,
      frameDelays[selectedFrameSlot] ?? defaultDelayMs
    );
    schedulePreview(selectedFrameSlot);
  });

  touchUpButton.addEventListener("click", async () => {
    if (busy) return;
    const tile = selectedTile;
    const frameSlot = selectedFrameSlot;
    busy = true;
    syncButtons();
    setFeedback(
      `Opening touch-up for tile ${tile + 1}, frame ${frameSlot + 1}...`,
      "busy"
    );
    try {
      const tileSrc = await extractTilesetTileDataUrl(frames[frameSlot]!, tileset, tile);
      await openFrameTouchUpEditor({
        root: options.root,
        asset: options.asset,
        title:
          `${readableAssetName(options.assetId)} ${readableAssetName(animation.key)} ` +
            `tile ${tile + 1}, frame ${frameSlot + 1}`,
        frameSrc: tileSrc,
        displaySize: touchUpDisplaySize,
        onSave: async (editedTileSrc) => {
          frames[frameSlot] = await replaceSpriteSheetFrames({
            src: frames[frameSlot]!,
            uploadSrc: editedTileSrc,
            frameGrid,
            frames: [tile]
          });
          selectedTile = tile;
          selectedFrameSlot = frameSlot;
          render();
          setFeedback(
            `Touched up tile ${tile + 1}, frame ${frameSlot + 1}.`,
            "success"
          );
        }
      });
      setFeedback("");
    } catch (error) {
      setFeedback(`Could not open tile touch-up: ${tilesetErrorMessage(error)}`, "error");
    } finally {
      busy = false;
      syncButtons();
    }
  });

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    syncButtons();
    setFeedback("Applying tileset animation edits...", "busy");
    try {
      await options.onConfirm({
        frames: [...frames],
        animation: tilesetAnimationWithFrameDelays(animation, frameDelays)
      });
      close();
    } catch (error) {
      setFeedback(
        `Could not apply tileset animation edits: ${tilesetErrorMessage(error)}`,
        "error"
      );
      busy = false;
      syncButtons();
    }
  });

  window.addEventListener("keydown", keyHandler, true);
  render();
  tileButtons[0]?.focus();
}

function openTilesetTileChoiceDialog(options: {
  root: HTMLElement;
  assetId: string;
  tile: number;
  prompt: string;
  candidates: GeneratedDebugOption[];
}): Promise<GeneratedDebugOption | undefined> {
  for (const [index, candidate] of options.candidates.entries()) {
    if (!candidate.tileset || tilesetTileCount(candidate.tileset) < 1) {
      throw new Error(`Regenerated option ${index + 1} did not return tile geometry.`);
    }
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "ai-game-assets-designer__modal ai-game-assets-designer__tileset-regenerate";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute(
      "aria-label",
      `Choose regenerated ${readableAssetName(options.assetId)} tile ${options.tile + 1}`
    );
    const card = document.createElement("div");
    card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__tileset-regenerate-card";
    const title = document.createElement("div");
    title.className = "ai-game-assets-designer__modal-title";
    title.textContent = `Choose tile ${options.tile + 1}`;
    const prompt = document.createElement("div");
    prompt.className = "ai-game-assets-designer__tileset-tile-prompt";
    prompt.textContent = options.prompt;
    const choices = document.createElement("div");
    choices.className = "ai-game-assets-designer__tileset-choices";
    const cancelButton = modalButton("Cancel");
    const confirmButton = modalButton("Use selected");
    confirmButton.disabled = true;
    const actions = document.createElement("div");
    actions.className = "ai-game-assets-designer__modal-actions";
    actions.append(cancelButton, confirmButton);
    card.append(title, prompt, choices, actions);
    dialog.append(card);
    options.root.append(dialog);

    let selected: GeneratedDebugOption | undefined;
    let closed = false;
    const choiceButtons: HTMLButtonElement[] = [];

    const close = (result: GeneratedDebugOption | undefined) => {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", keyHandler, true);
      dialog.remove();
      resolve(result);
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(undefined);
    };

    options.candidates.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-game-assets-designer__tileset-choice";
      button.setAttribute("aria-label", `Option ${index + 1}`);
      button.setAttribute("aria-pressed", "false");
      const stage = document.createElement("div");
      stage.className = "ai-game-assets-designer__tileset-choice-preview";
      setFrameBackground(stage, {
        src: candidate.dataUrl,
        frame: 0,
        frameGrid: tilesetFrameGrid(candidate.tileset!),
        displaySize: { width: 112, height: 112 }
      });
      const label = document.createElement("span");
      label.textContent = `Option ${index + 1}`;
      button.append(stage, label);
      button.addEventListener("click", () => {
        selected = candidate;
        confirmButton.disabled = false;
        choiceButtons.forEach((choice) => {
          const isSelected = choice === button;
          choice.classList.toggle("is-selected", isSelected);
          choice.setAttribute("aria-pressed", String(isSelected));
        });
      });
      button.addEventListener("dblclick", () => close(candidate));
      choiceButtons.push(button);
      choices.append(button);
    });

    cancelButton.addEventListener("click", () => close(undefined));
    confirmButton.addEventListener("click", () => close(selected));
    window.addEventListener("keydown", keyHandler, true);
    choiceButtons[0]?.focus();
  });
}

function modalButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}

function tilesetErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function openTilesetBaseMixerDialog(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  baseSheetSrc: string;
  candidates: GeneratedDebugOption[];
  regenerateTile?(
    tile: number,
    tileset: TilesetTileGenerationOverride,
    currentTileSrc: string
  ): Promise<GeneratedDebugOption[]>;
}): Promise<TilesetBaseMixResult | undefined> {
  const currentTileset = tilesetMetadataForAsset(options.asset);
  if (!currentTileset) {
    throw new Error(`AI asset "${options.assetId}" is not a tileset.`);
  }

  const candidates = [...options.candidates].sort((left, right) => left.index - right.index);
  const plan = planTilesetBaseMix(options.asset, candidates);
  const sources: TilesetMixSource[] = [
    {
      selection: "base",
      label: "Keep current",
      shortLabel: "Current",
      overviewSheetSrc: options.baseSheetSrc,
      sheetSrcs: [options.baseSheetSrc],
      tileset: currentTileset
    },
    ...candidates.map((candidate, index) => ({
      selection: candidate.index,
      label: `Option ${index + 1}`,
      shortLabel: String(index + 1),
      overviewSheetSrc: candidate.dataUrl,
      sheetSrcs: [candidate.dataUrl],
      tileset: candidate.tileset ?? currentTileset
    }))
  ];

  const mixed = await openTilesetMixerDialog({
    root: options.root,
    assetId: options.assetId,
    ariaLabel: `Mix ${readableAssetName(options.assetId)} base tileset`,
    title: `${readableAssetName(options.assetId)} · Base tileset`,
    hint: "Choose the current tile or one of the generated options for each tile.",
    confirmLabel: "Use mixed tileset",
    busyLabel: "Compositing the mixed tileset...",
    targetTileset: plan.tileset,
    targetDimensions: plan.dimensions,
    frameCount: 1,
    sources,
    selections: plan.selections,
    regenerateTile: options.regenerateTile ? async (tile) => {
      const currentTileSrc = await extractTilesetTileDataUrl(
        options.baseSheetSrc,
        currentTileset,
        tile
      );
      const generated = [...await options.regenerateTile!(
        tile,
        tilesetTileGenerationOverride(plan.tileset, tile),
        currentTileSrc
      )].sort((left, right) => left.index - right.index);
      if (generated.length !== candidates.length) {
        throw new Error(`Expected ${candidates.length} regenerated tile options, received ${generated.length}.`);
      }
      assertUniqueCandidateIndexes(generated);
      return candidates.map((candidate, index): TilesetTileReplacement => {
        const option = generated[index]!;
        if (!option.tileset || tilesetTileCount(option.tileset) < 1) {
          throw new Error(`Regenerated option ${index + 1} did not return tile geometry.`);
        }
        return {
          selection: candidate.index,
          src: option.dataUrl,
          tile: 0,
          tileset: option.tileset
        };
      });
    } : undefined
  });

  const dataUrl = mixed?.sheets[0];
  if (!mixed || !dataUrl) return undefined;

  return {
    dataUrl,
    dimensions: plan.dimensions,
    tileset: plan.tileset,
    selections: mixed.selections
  };
}

export async function openTilesetAnimationMixerDialog(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  animationKey: string;
  baseSheetSrc: string;
  baseAnimationFrameSrcs: string[];
  candidates: GeneratedTilesetAnimationCandidate[];
  initialSelections?: TilesetMixSelection[];
  tilePrompts?: Array<{ prompt: string }>;
  regenerateTile?(
    tile: number,
    currentTileSrc: string
  ): Promise<GeneratedTilesetAnimationCandidate[]>;
}): Promise<TilesetAnimationMixResult | undefined> {
  const tileset = tilesetMetadataForAsset(options.asset);
  const animation = tilesetAnimationForKey(options.asset, options.animationKey);

  if (!tileset || !animation) {
    throw new Error(`Tileset animation "${options.animationKey}" is not declared.`);
  }
  if (options.candidates.length === 0) {
    throw new Error("Tileset animation generation returned no candidates.");
  }

  const frameCount = Math.max(1, animation.frameCount);
  const candidates = [...options.candidates].sort((left, right) => left.index - right.index);
  assertUniqueCandidateIndexes(candidates);

  for (const candidate of candidates) {
    if (candidate.animationKey !== options.animationKey) {
      throw new Error(
        `Generated candidate ${candidate.index + 1} belongs to animation "${candidate.animationKey}".`
      );
    }
    if (candidate.frames.length < frameCount) {
      throw new Error(
        `Generated candidate ${candidate.index + 1} has ${candidate.frames.length} of ${frameCount} frames.`
      );
    }
  }

  const targetDimensions = normalizedTilesetDimensions(
    tileset,
    options.asset.dimensions,
    `Tileset "${options.assetId}"`
  );
  const baseFrameSrcs = Array.from({ length: frameCount }, (_, slot) => (
    options.baseAnimationFrameSrcs[slot] ?? options.baseSheetSrc
  ));
  const sources: TilesetMixSource[] = [
    {
      selection: "base",
      label: "Keep current",
      shortLabel: "Current",
      overviewSheetSrc: options.baseSheetSrc,
      sheetSrcs: baseFrameSrcs,
      tileset
    },
    ...candidates.map((candidate, index) => ({
      selection: candidate.index,
      label: `Option ${index + 1}`,
      shortLabel: String(index + 1),
      overviewSheetSrc: candidate.frames[0]!.dataUrl,
      sheetSrcs: candidate.frames.slice(0, frameCount).map((frame) => frame.dataUrl),
      tileset
    }))
  ];
  const selections: TilesetMixSelection[] = Array.from(
    { length: tilesetTileCount(tileset) },
    (_, tile): TilesetMixSelection => options.initialSelections?.[tile] ?? "base"
  );
  const mixed = await openTilesetMixerDialog({
    root: options.root,
    assetId: options.assetId,
    ariaLabel: `Mix ${readableAssetName(options.assetId)} ${readableAssetName(options.animationKey)}`,
    title: `${readableAssetName(options.assetId)} · ${readableAssetName(options.animationKey)}`,
    hint: "Choose one complete animation sequence for each tile. All previews are synchronized.",
    confirmLabel: "Use mixed animation",
    busyLabel: "Compositing full animation sheets...",
    targetTileset: tileset,
    targetDimensions,
    frameCount,
    frameDelayMs(frameSlot) {
      const timing = animation.frameTimings?.[frameSlot];
      return timing?.delayMs ?? Math.round(1000 / Math.max(1, animation.frameRate));
    },
    navigatorSource: "base",
    sources,
    selections,
    tilePrompt: (tile) => options.tilePrompts?.[tile]?.prompt ??
      animation.tiles?.[tile]?.prompt,
    regenerateTile: options.regenerateTile ? async (tile) => {
      const currentTileSrc = await extractTilesetTileDataUrl(
        baseFrameSrcs[0] ?? options.baseSheetSrc,
        tileset,
        tile
      );
      const regenerated = [...await options.regenerateTile!(tile, currentTileSrc)]
        .sort((left, right) => left.index - right.index);
      if (regenerated.length !== candidates.length) {
        throw new Error(
          `Expected ${candidates.length} regenerated animation options, received ${regenerated.length}.`
        );
      }
      assertUniqueCandidateIndexes(regenerated);
      return candidates.map((candidate, index): TilesetTileReplacement => {
        const option = regenerated[index]!;
        if (option.frames.length < frameCount) {
          throw new Error(`Regenerated option ${index + 1} is missing animation frames.`);
        }
        return {
          selection: candidate.index,
          src: option.frames[0]!.dataUrl,
          sheetSrcs: option.frames.slice(0, frameCount).map((frame) => frame.dataUrl),
          tile: 0,
          tileset: {
            ...tileset,
            columns: 1,
            rows: 1,
            tileCount: 1,
            tiles: tileset.tiles?.[tile] ? [tileset.tiles[tile]!] : undefined
          }
        };
      });
    } : undefined
  });

  if (!mixed) return undefined;

  return {
    animationKey: options.animationKey,
    frames: mixed.sheets,
    selections: mixed.selections
  };
}

function openTilesetMixerDialog(
  options: TilesetMixerOptions
): Promise<TilesetMixerResult | undefined> {
  const tileCount = tilesetTileCount(options.targetTileset);
  if (options.sources.length < 2) {
    throw new Error("Tileset mixing requires a current sheet and at least one generated option.");
  }
  if (options.selections.length !== tileCount) {
    throw new Error(`Tileset mixing requires exactly ${tileCount} tile selections.`);
  }

  const sourceBySelection = new Map(
    options.sources.map((source) => [source.selection, source] as const)
  );
  for (const [tile, selection] of options.selections.entries()) {
    const source = sourceBySelection.get(selection);
    if (!source || tile >= tilesetTileCount(source.tileset)) {
      throw new Error(`Tile ${tile + 1} does not have a valid initial source.`);
    }
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "ai-game-assets-designer__modal ai-game-assets-designer__tileset-mixer";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", options.ariaLabel);

    const card = document.createElement("div");
    card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__tileset-mixer-card";

    const title = document.createElement("div");
    title.className = "ai-game-assets-designer__modal-title";
    title.textContent = options.title;

    const hint = document.createElement("div");
    hint.className = "ai-game-assets-designer__tileset-mixer-hint";
    hint.textContent = options.hint;

    const body = document.createElement("div");
    body.className = "ai-game-assets-designer__tileset-mixer-body";

    const navigatorPanel = document.createElement("section");
    navigatorPanel.className = "ai-game-assets-designer__tileset-navigator-panel";
    const navigatorTitle = document.createElement("div");
    navigatorTitle.className = "ai-game-assets-designer__tileset-section-title";
    navigatorTitle.textContent = `Tiles (${tileCount})`;
    const navigator = document.createElement("div");
    navigator.className = "ai-game-assets-designer__tileset-navigator";
    navigatorPanel.append(navigatorTitle, navigator);

    const previewPanel = document.createElement("section");
    previewPanel.className = "ai-game-assets-designer__tileset-preview-panel";
    const previewTitle = document.createElement("div");
    previewTitle.className = "ai-game-assets-designer__tileset-section-title";
    const choices = document.createElement("div");
    choices.className = "ai-game-assets-designer__tileset-choices";
    const tilePrompt = document.createElement("div");
    tilePrompt.className = "ai-game-assets-designer__tileset-tile-prompt";
    previewPanel.append(previewTitle, choices, tilePrompt);
    body.append(navigatorPanel, previewPanel);

    const feedback = document.createElement("div");
    feedback.className = "ai-game-assets-designer__modal-feedback";
    feedback.hidden = true;

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    const regenerateButton = document.createElement("button");
    regenerateButton.type = "button";
    regenerateButton.textContent = "Regenerate";
    regenerateButton.hidden = !options.regenerateTile;
    regenerateButton.setAttribute("aria-label", "Regenerate three options for the current tile");
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = options.confirmLabel;
    const actions = document.createElement("div");
    actions.className = "ai-game-assets-designer__modal-actions";
    actions.append(regenerateButton, cancelButton, confirmButton);

    card.append(title, hint, body, feedback, actions);
    dialog.append(card);
    options.root.append(dialog);

    let selectedTile = 0;
    let frameSlot = 0;
    let timeout: number | undefined;
    let closed = false;
    let busy = false;
    const selections = [...options.selections];
    const navigatorButtons: HTMLButtonElement[] = [];
    const choiceButtons = new Map<TilesetMixSelection, HTMLButtonElement>();
    const previewStages = new Map<TilesetMixSelection, HTMLDivElement>();

    const sourceIsAvailable = (source: TilesetMixSource, tile: number): boolean => (
      source.tileOverrides?.has(tile) || tile < tilesetTileCount(source.tileset)
    );
    const sourceTileView = (
      source: TilesetMixSource,
      tile: number,
      slot: number,
      overview = false
    ): { src: string; tile: number; tileset: DesignerTilesetMetadata } => {
      const override = source.tileOverrides?.get(tile);
      if (override) {
        return {
          ...override,
          src: overview
            ? override.src
            : override.sheetSrcs?.[slot] ?? override.src
        };
      }
      return {
        src: overview
          ? source.overviewSheetSrc
          : source.sheetSrcs[slot] ?? source.sheetSrcs[0] ?? source.overviewSheetSrc,
        tile,
        tileset: source.tileset
      };
    };

    const updateNavigatorSelection = () => {
      navigatorButtons.forEach((button, tile) => {
        const selection = selections[tile] ?? "base";
        const selectedSource = sourceBySelection.get(selection);
        const preferredSource = options.navigatorSource === undefined
          ? undefined
          : sourceBySelection.get(options.navigatorSource);
        const source = preferredSource && sourceIsAvailable(preferredSource, tile)
          ? preferredSource
          : selectedSource;
        if (!source || !selectedSource) return;
        const view = sourceTileView(source, tile, 0, true);

        button.classList.toggle("is-selected", tile === selectedTile);
        button.classList.toggle("is-mixed", selection !== "base");
        button.dataset.source = selectedSource.shortLabel;
        button.setAttribute("aria-pressed", String(tile === selectedTile));
        setFrameBackground(button, {
          src: view.src,
          frame: view.tile,
          frameGrid: tilesetFrameGrid(view.tileset),
          displaySize: { width: 56, height: 56 }
        });
      });
    };

    const updateChoiceSelection = () => {
      const selectedSource = selections[selectedTile] ?? "base";
      for (const [selection, button] of choiceButtons) {
        const source = sourceBySelection.get(selection);
        const available = Boolean(source && sourceIsAvailable(source, selectedTile));
        const isSelected = available && selection === selectedSource;
        button.disabled = !available;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      }
    };

    const renderPreviews = () => {
      previewTitle.textContent = options.frameCount > 1
        ? `Tile ${selectedTile + 1} · frame ${frameSlot + 1}/${options.frameCount}`
        : `Tile ${selectedTile + 1}`;
      const prompt = options.tilePrompt?.(selectedTile) ??
        tilesetTilePrompt(options.targetTileset, selectedTile);
      tilePrompt.hidden = !prompt;
      tilePrompt.textContent = prompt ? `Tile prompt: ${prompt}` : "";
      for (const [selection, stage] of previewStages) {
        const source = sourceBySelection.get(selection);
        if (!source || !sourceIsAvailable(source, selectedTile)) {
          stage.replaceChildren();
          stage.dataset.unavailable = "true";
          stage.style.width = "112px";
          stage.style.height = "112px";
          continue;
        }

        delete stage.dataset.unavailable;
        const view = sourceTileView(source, selectedTile, frameSlot);
        setFrameBackground(stage, {
          src: view.src,
          frame: view.tile,
          frameGrid: tilesetFrameGrid(view.tileset),
          displaySize: { width: 112, height: 112 }
        });
      }
    };

    const schedulePreview = () => {
      if (closed) return;
      renderPreviews();
      if (options.frameCount <= 1) return;

      timeout = window.setTimeout(() => {
        frameSlot = (frameSlot + 1) % options.frameCount;
        schedulePreview();
      }, options.frameDelayMs?.(frameSlot) ?? 1000);
    };

    const selectTile = (tile: number) => {
      selectedTile = tile;
      updateNavigatorSelection();
      updateChoiceSelection();
      renderPreviews();
    };

    const setBusy = (nextBusy: boolean) => {
      busy = nextBusy;
      regenerateButton.disabled = nextBusy;
      cancelButton.disabled = nextBusy;
      confirmButton.disabled = nextBusy;
      navigatorButtons.forEach((button) => {
        button.disabled = nextBusy;
      });
      if (nextBusy) {
        choiceButtons.forEach((button) => {
          button.disabled = true;
        });
      } else {
        updateChoiceSelection();
      }
    };

    for (let tile = 0; tile < tileCount; tile += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-game-assets-designer__tileset-tile";
      button.setAttribute("aria-label", `Tile ${tile + 1}`);
      button.addEventListener("click", () => selectTile(tile));
      navigatorButtons.push(button);
      navigator.append(button);
    }

    for (const source of options.sources) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-game-assets-designer__tileset-choice";
      const stage = document.createElement("div");
      stage.className = "ai-game-assets-designer__tileset-choice-preview";
      const choiceLabel = document.createElement("span");
      choiceLabel.textContent = source.label;
      button.append(stage, choiceLabel);
      button.addEventListener("click", () => {
        if (!sourceIsAvailable(source, selectedTile)) return;
        selections[selectedTile] = source.selection;
        updateNavigatorSelection();
        updateChoiceSelection();
      });
      choiceButtons.set(source.selection, button);
      previewStages.set(source.selection, stage);
      choices.append(button);
    }

    const close = (result: TilesetMixerResult | undefined) => {
      if (closed) return;
      closed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener("keydown", keyHandler, true);
      dialog.remove();
      resolve(result);
    };

    const keyHandler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (busy) return;
      event.preventDefault();
      close(undefined);
    };

    cancelButton.addEventListener("click", () => close(undefined));
    regenerateButton.addEventListener("click", async () => {
      if (!options.regenerateTile || busy) return;
      const tile = selectedTile;
      setBusy(true);
      feedback.hidden = false;
      feedback.dataset.kind = "busy";
      feedback.textContent = `Generating 3 new options for tile ${tile + 1}...`;

      try {
        const replacements = await options.regenerateTile(tile);
        if (replacements.length !== options.sources.length - 1) {
          throw new Error(
            `Expected ${options.sources.length - 1} tile replacements, received ${replacements.length}.`
          );
        }
        for (const replacement of replacements) {
          const source = sourceBySelection.get(replacement.selection);
          if (!source || replacement.selection === "base") {
            throw new Error("Regenerated tile options did not match the existing choices.");
          }
          source.tileOverrides ??= new Map();
          source.tileOverrides.set(tile, {
            src: replacement.src,
            sheetSrcs: replacement.sheetSrcs,
            tile: replacement.tile,
            tileset: replacement.tileset
          });
        }
        const base = sourceBySelection.get("base");
        selections[tile] = base && sourceIsAvailable(base, tile)
          ? "base"
          : replacements[0]!.selection;
        selectTile(tile);
        feedback.dataset.kind = "success";
        feedback.textContent = `Replaced the three options for tile ${tile + 1}.`;
      } catch (error) {
        feedback.dataset.kind = "error";
        feedback.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        setBusy(false);
      }
    });
    confirmButton.addEventListener("click", async () => {
      setBusy(true);
      feedback.hidden = false;
      feedback.dataset.kind = "busy";
      feedback.textContent = options.busyLabel;

      try {
        const sheets = await composeTilesetSheets({
          targetTileset: options.targetTileset,
          targetDimensions: options.targetDimensions,
          frameCount: options.frameCount,
          sources: options.sources,
          selections
        });
        close({ sheets, selections: [...selections] });
      } catch (error) {
        feedback.dataset.kind = "error";
        feedback.textContent = error instanceof Error ? error.message : String(error);
        setBusy(false);
      }
    });

    window.addEventListener("keydown", keyHandler, true);
    updateNavigatorSelection();
    updateChoiceSelection();
    schedulePreview();
    navigatorButtons[0]?.focus();
  });
}

async function composeTilesetSheets(options: {
  targetTileset: DesignerTilesetMetadata;
  targetDimensions: TilesetBaseMixResult["dimensions"];
  frameCount: number;
  sources: TilesetMixSource[];
  selections: TilesetMixSelection[];
}): Promise<string[]> {
  const sourceBySelection = new Map(
    options.sources.map((source) => [source.selection, source] as const)
  );
  const sourceEntries = options.sources.flatMap((source) => (
    [
      ...[...new Set([
        source.overviewSheetSrc,
        ...source.sheetSrcs.slice(0, options.frameCount)
      ])].map((src) => ({ label: source.label, src, tileset: source.tileset })),
      ...[...(source.tileOverrides?.values() ?? [])].map((override) => ({
        label: source.label,
        src: override.src,
        tileset: override.tileset
      })),
      ...[...(source.tileOverrides?.values() ?? [])].flatMap((override) => (
        (override.sheetSrcs ?? []).map((src) => ({
          label: source.label,
          src,
          tileset: override.tileset
        }))
      ))
    ]
  ));
  const loadedEntries = await Promise.all(
    [...new Set(sourceEntries.map((entry) => entry.src))].map(async (src) => (
      [src, await loadImageElement(src)] as const
    ))
  );
  const images = new Map(loadedEntries);

  for (const { label, src, tileset } of sourceEntries) {
    const image = images.get(src);
    const required = tilesetDimensions(tileset);
    if (!image || image.naturalWidth !== required.width || image.naturalHeight !== required.height) {
      throw new Error(
        `${label} must be exactly ${required.width}x${required.height}px for its declared tile grid.`
      );
    }
  }

  const baseSource = sourceBySelection.get("base");
  const backgroundSource = baseSource &&
    sameTilesetGrid(baseSource.tileset, options.targetTileset)
    ? baseSource
    : options.sources.find((source) => source.selection !== "base");
  if (!backgroundSource) {
    throw new Error("Tileset mixing requires a source for the output sheet background.");
  }

  const sheets: string[] = [];
  for (let frameSlot = 0; frameSlot < options.frameCount; frameSlot += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = options.targetDimensions.width;
    canvas.height = options.targetDimensions.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create a canvas for the mixed tileset.");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    const backgroundSrc = backgroundSource.sheetSrcs[frameSlot] ?? backgroundSource.sheetSrcs[0];
    const backgroundImage = backgroundSrc ? images.get(backgroundSrc) : undefined;
    if (backgroundImage) {
      context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    }

    for (const [tile, selection] of options.selections.entries()) {
      const source = sourceBySelection.get(selection);
      const override = source?.tileOverrides?.get(tile);
      if (!source || (!override && tile >= tilesetTileCount(source.tileset))) {
        throw new Error(`Tile ${tile + 1} does not have a valid selected source.`);
      }

      const src = override?.sheetSrcs?.[frameSlot] ?? override?.src ??
        source.sheetSrcs[frameSlot] ?? source.sheetSrcs[0];
      const image = src ? images.get(src) : undefined;
      if (!image) {
        throw new Error(`${source.label} is missing frame ${frameSlot + 1}.`);
      }

      const sourceRect = tileRect(override?.tileset ?? source.tileset, override?.tile ?? tile);
      const targetRect = tileRect(options.targetTileset, tile);
      context.clearRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
      context.drawImage(
        image,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        targetRect.x,
        targetRect.y,
        targetRect.width,
        targetRect.height
      );
    }

    sheets.push(canvas.toDataURL("image/png"));
  }

  return sheets;
}

function assertUniqueCandidateIndexes(candidates: Array<{ index: number }>): void {
  const indexes = new Set<number>();
  for (const candidate of candidates) {
    if (indexes.has(candidate.index)) {
      throw new Error(`Tileset generation returned duplicate option index ${candidate.index}.`);
    }
    indexes.add(candidate.index);
  }
}

function normalizedTilesetDimensions(
  tileset: DesignerTilesetMetadata,
  dimensions: { width: number; height: number } | undefined,
  label: string
): { width: number; height: number } {
  const required = tilesetDimensions(tileset);
  if (dimensions && !sameDimensions(dimensions, required)) {
    throw new Error(
      `${label} dimensions must match its declared tile grid (${required.width}x${required.height}).`
    );
  }
  return dimensions ?? required;
}

function tilesetDimensions(
  tileset: DesignerTilesetMetadata
): { width: number; height: number } {
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  return {
    width: margin * 2 + tileset.columns * tileset.tileWidth +
      Math.max(0, tileset.columns - 1) * spacing,
    height: margin * 2 + tileset.rows * tileset.tileHeight +
      Math.max(0, tileset.rows - 1) * spacing
  };
}

async function extractTilesetTileDataUrl(
  src: string,
  tileset: DesignerTilesetMetadata,
  tile: number
): Promise<string> {
  const image = await loadImageElement(src);
  const source = tileRect(tileset, tile);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a canvas for the current tile reference.");
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    source.width,
    source.height
  );
  return canvas.toDataURL("image/png");
}

function tilesetTileCount(tileset: DesignerTilesetMetadata): number {
  return Math.min(
    tileset.tileCount ?? tileset.columns * tileset.rows,
    tileset.columns * tileset.rows
  );
}

function sameTilesetGrid(
  left: DesignerTilesetMetadata,
  right: DesignerTilesetMetadata
): boolean {
  return left.tileWidth === right.tileWidth &&
    left.tileHeight === right.tileHeight &&
    left.columns === right.columns &&
    left.rows === right.rows &&
    tilesetTileCount(left) === tilesetTileCount(right) &&
    (left.margin ?? 0) === (right.margin ?? 0) &&
    (left.spacing ?? 0) === (right.spacing ?? 0);
}

function sameDimensions(
  left: { width: number; height: number },
  right: { width: number; height: number }
): boolean {
  return left.width === right.width && left.height === right.height;
}

function tilesetFrameGrid(tileset: DesignerTilesetMetadata): AiAssetFrameGrid {
  return {
    frameCount: tilesetTileCount(tileset),
    frameWidth: tileset.tileWidth,
    frameHeight: tileset.tileHeight,
    columns: tileset.columns,
    rows: tileset.rows,
    margin: tileset.margin,
    spacing: tileset.spacing
  };
}

function tileRect(
  tileset: DesignerTilesetMetadata,
  tile: number
): { x: number; y: number; width: number; height: number } {
  const column = tile % tileset.columns;
  const row = Math.floor(tile / tileset.columns);

  return {
    x: (tileset.margin ?? 0) + column * (tileset.tileWidth + (tileset.spacing ?? 0)),
    y: (tileset.margin ?? 0) + row * (tileset.tileHeight + (tileset.spacing ?? 0)),
    width: tileset.tileWidth,
    height: tileset.tileHeight
  };
}
