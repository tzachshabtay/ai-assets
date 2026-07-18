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
  readableAssetName,
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

export async function openTilesetBaseMixerDialog(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  baseSheetSrc: string;
  candidates: GeneratedDebugOption[];
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
    selections: plan.selections
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
      label: "Keep base",
      shortLabel: "Base",
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
    (): TilesetMixSelection => "base"
  );
  const mixed = await openTilesetMixerDialog({
    root: options.root,
    assetId: options.assetId,
    ariaLabel: `Mix ${readableAssetName(options.assetId)} ${readableAssetName(options.animationKey)}`,
    title: `${readableAssetName(options.assetId)} · ${readableAssetName(options.animationKey)}`,
    hint: "Choose one complete animation sequence for each tile. All previews are synchronized.",
    confirmLabel: "Save mixed animation",
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
    selections
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
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = options.confirmLabel;
    const actions = document.createElement("div");
    actions.className = "ai-game-assets-designer__modal-actions";
    actions.append(cancelButton, confirmButton);

    card.append(title, hint, body, feedback, actions);
    dialog.append(card);
    options.root.append(dialog);

    let selectedTile = 0;
    let frameSlot = 0;
    let timeout: number | undefined;
    let closed = false;
    const selections = [...options.selections];
    const navigatorButtons: HTMLButtonElement[] = [];
    const choiceButtons = new Map<TilesetMixSelection, HTMLButtonElement>();
    const previewStages = new Map<TilesetMixSelection, HTMLDivElement>();

    const sourceSheet = (source: TilesetMixSource, slot: number): string => (
      source.sheetSrcs[slot] ?? source.sheetSrcs[0] ?? source.overviewSheetSrc
    );
    const sourceIsAvailable = (source: TilesetMixSource, tile: number): boolean => (
      tile < tilesetTileCount(source.tileset)
    );

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

        button.classList.toggle("is-selected", tile === selectedTile);
        button.classList.toggle("is-mixed", selection !== "base");
        button.dataset.source = selectedSource.shortLabel;
        button.setAttribute("aria-pressed", String(tile === selectedTile));
        setFrameBackground(button, {
          src: source.overviewSheetSrc,
          frame: tile,
          frameGrid: tilesetFrameGrid(source.tileset),
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
      const prompt = tilesetTilePrompt(options.targetTileset, selectedTile);
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
        setFrameBackground(stage, {
          src: sourceSheet(source, frameSlot),
          frame: selectedTile,
          frameGrid: tilesetFrameGrid(source.tileset),
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
      event.preventDefault();
      close(undefined);
    };

    cancelButton.addEventListener("click", () => close(undefined));
    confirmButton.addEventListener("click", async () => {
      confirmButton.disabled = true;
      cancelButton.disabled = true;
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
        confirmButton.disabled = false;
        cancelButton.disabled = false;
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
    [...new Set([
      source.overviewSheetSrc,
      ...source.sheetSrcs.slice(0, options.frameCount)
    ])].map((src) => ({ source, src }))
  ));
  const loadedEntries = await Promise.all(
    [...new Set(sourceEntries.map((entry) => entry.src))].map(async (src) => (
      [src, await loadImageElement(src)] as const
    ))
  );
  const images = new Map(loadedEntries);

  for (const { source, src } of sourceEntries) {
    const image = images.get(src);
    const required = tilesetDimensions(source.tileset);
    if (!image || image.naturalWidth !== required.width || image.naturalHeight !== required.height) {
      throw new Error(
        `${source.label} must be exactly ${required.width}x${required.height}px for its declared tile grid.`
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
      if (!source || tile >= tilesetTileCount(source.tileset)) {
        throw new Error(`Tile ${tile + 1} does not have a valid selected source.`);
      }

      const src = source.sheetSrcs[frameSlot] ?? source.sheetSrcs[0];
      const image = src ? images.get(src) : undefined;
      if (!image) {
        throw new Error(`${source.label} is missing frame ${frameSlot + 1}.`);
      }

      const sourceRect = tileRect(source.tileset, tile);
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
