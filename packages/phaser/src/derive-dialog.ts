import {
  type AiAssetDefinition,
  type AiAssetDimensions,
  type AiAssetFormat,
  type AiAssetFrameGrid
} from "@ai-game-assets/core";
import type { GeneratedDebugOption } from "./debug-client.js";
import {
  imageSourceToDataUrl,
  isSvgSource,
  loadImageElement,
  mimeTypeFromDataUrl,
  positiveIntegerInput,
  readableAssetName
} from "./designer-support.js";

export type DeriveStrategy = "generate" | "scale" | "extend" | "tile" | "crop";

export type DeriveCandidate = {
  targetId?: string;
  targetLabel: string;
  assetId: string;
  asset: AiAssetDefinition;
  src: string;
  dimensions?: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
};

export type DeriveDialogResult = {
  strategy: DeriveStrategy;
  candidate: DeriveCandidate;
  dimensions: AiAssetDimensions;
  frameCount?: number;
  scaleMode?: "fit" | "stretch";
  cropX?: number;
  cropY?: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
};

type CanvasDrawable = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

export async function openDeriveDialog(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  candidates: DeriveCandidate[];
  prompt: string;
  format: AiAssetFormat;
  onConfirm(result: DeriveDialogResult): void | Promise<void>;
}): Promise<void> {
  if (options.candidates.length === 0) return;

  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Derive ${readableAssetName(options.assetId)}`);

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card";

  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent = `Derive ${readableAssetName(options.assetId)}`;

  const sourceSelect = document.createElement("select");
  for (const candidate of options.candidates) {
    const option = document.createElement("option");
    option.value = candidate.assetId;
    option.textContent = `${candidate.targetLabel}: ${readableAssetName(candidate.assetId)}`;
    sourceSelect.append(option);
  }

  const strategySelect = document.createElement("select");
  const strategyLabels: Record<DeriveStrategy, string> = {
    generate: "Generate from reference",
    scale: "Scale",
    extend: "Extend with AI",
    tile: "Tile",
    crop: "Crop"
  };
  for (const strategy of Object.keys(strategyLabels) as DeriveStrategy[]) {
    const option = document.createElement("option");
    option.value = strategy;
    option.textContent = strategyLabels[strategy];
    strategySelect.append(option);
  }

  const widthInput = numericField(defaultFrameDimensions(options.asset).width);
  const heightInput = numericField(defaultFrameDimensions(options.asset).height);
  const frameCountInput = numericField(defaultFrameCount(options.asset));
  const frameCountField = field("Frames", frameCountInput);
  frameCountField.hidden = !options.asset.frameGrid;

  const scaleModeSelect = document.createElement("select");
  for (const [value, label] of [["fit", "Fit"], ["stretch", "Stretch"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    scaleModeSelect.append(option);
  }
  const scaleModeField = field("Scale mode", scaleModeSelect);

  const cropXInput = numericField(0);
  cropXInput.min = "0";
  const cropYInput = numericField(0);
  cropYInput.min = "0";
  const cropFields = document.createElement("div");
  cropFields.className = "ai-game-assets-designer__dimensions";
  cropFields.append(field("Crop X", cropXInput), field("Crop Y", cropYInput));

  const mirrorXInput = document.createElement("input");
  mirrorXInput.type = "checkbox";
  const mirrorYInput = document.createElement("input");
  mirrorYInput.type = "checkbox";
  const tileFields = document.createElement("div");
  tileFields.className = "ai-game-assets-designer__derive-checks";
  tileFields.append(inlineCheck("Mirror horizontal", mirrorXInput), inlineCheck("Mirror vertical", mirrorYInput));

  const hint = document.createElement("div");
  hint.className = "ai-game-assets-designer__derive-hint";

  const preview = document.createElement("div");
  preview.className = "ai-game-assets-designer__derive-preview";
  const previewImage = document.createElement("img");
  const cropBox = document.createElement("div");
  cropBox.className = "ai-game-assets-designer__derive-crop";
  preview.append(previewImage, cropBox);

  const dimensionGrid = document.createElement("div");
  dimensionGrid.className = "ai-game-assets-designer__dimensions";
  dimensionGrid.append(field("Width", widthInput), field("Height", heightInput));

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Derive";
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(cancelButton, confirmButton);

  card.append(
    title,
    field("Source target", sourceSelect),
    field("Strategy", strategySelect),
    dimensionGrid,
    frameCountField,
    scaleModeField,
    cropFields,
    tileFields,
    hint,
    preview,
    actions
  );
  dialog.append(card);
  options.root.append(dialog);

  const selectedCandidate = () =>
    options.candidates.find((candidate) => candidate.assetId === sourceSelect.value) ?? options.candidates[0];

  const dimensions = () => ({
    width: positiveIntegerInput(widthInput, defaultFrameDimensions(options.asset).width),
    height: positiveIntegerInput(heightInput, defaultFrameDimensions(options.asset).height)
  });

  const update = () => {
    const candidate = selectedCandidate();
    const strategy = strategySelect.value as DeriveStrategy;
    const sourceDimensions = candidateFrameDimensions(candidate);
    const targetDimensions = dimensions();
    const canGrow = targetDimensions.width > sourceDimensions.width ||
      targetDimensions.height > sourceDimensions.height;
    const canShrink = targetDimensions.width < sourceDimensions.width ||
      targetDimensions.height < sourceDimensions.height;

    for (const option of Array.from(strategySelect.options)) {
      const strategyValue = option.value as DeriveStrategy;
      option.disabled =
        (strategyValue === "extend" || strategyValue === "tile") && !canGrow ||
        strategyValue === "crop" && !canShrink ||
        strategyValue === "extend" && options.format === "svg";
    }

    if (strategySelect.selectedOptions[0]?.disabled) {
      strategySelect.value = "generate";
    }

    scaleModeField.hidden = strategySelect.value !== "scale";
    cropFields.hidden = strategySelect.value !== "crop";
    tileFields.hidden = strategySelect.value !== "tile";
    preview.hidden = strategySelect.value !== "crop";
    previewImage.src = candidate.src;
    hint.textContent = hintForStrategy(strategySelect.value as DeriveStrategy, options.format);
    updateCropBox(candidate.asset, dimensions(), cropXInput, cropYInput, previewImage, cropBox);
  };

  sourceSelect.addEventListener("change", update);
  strategySelect.addEventListener("change", update);
  widthInput.addEventListener("input", update);
  heightInput.addEventListener("input", update);
  cropXInput.addEventListener("input", update);
  cropYInput.addEventListener("input", update);
  previewImage.addEventListener("load", update);
  cancelButton.addEventListener("click", () => dialog.remove());
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    const result: DeriveDialogResult = {
      strategy: strategySelect.value as DeriveStrategy,
      candidate: selectedCandidate(),
      dimensions: dimensions(),
      frameCount: options.asset.frameGrid
        ? positiveIntegerInput(frameCountInput, defaultFrameCount(options.asset))
        : undefined,
      scaleMode: scaleModeSelect.value === "stretch" ? "stretch" : "fit",
      cropX: nonNegativeIntegerInput(cropXInput),
      cropY: nonNegativeIntegerInput(cropYInput),
      mirrorX: mirrorXInput.checked,
      mirrorY: mirrorYInput.checked
    };

    dialog.remove();

    try {
      await options.onConfirm(result);
    } finally {
      confirmButton.disabled = false;
    }
  });

  update();
}

export async function createLocalDerivedOption(options: {
  strategy: "scale" | "tile" | "crop";
  source: DeriveCandidate;
  targetAsset: AiAssetDefinition;
  prompt: string;
  dimensions: AiAssetDimensions;
  frameCount?: number;
  scaleMode?: "fit" | "stretch";
  cropX?: number;
  cropY?: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
}): Promise<GeneratedDebugOption> {
  const sourceImage = await loadCanvasDrawable(options.source.src);
  const targetGeometry = targetGeometryForAsset(
    options.targetAsset,
    options.dimensions,
    options.frameCount
  );
  const sourceGrid = options.source.frameGrid ?? options.source.asset.frameGrid;
  const sourceDimensions = options.source.dimensions ?? options.source.asset.dimensions;
  const sourceFrameCount = sourceGrid
    ? sourceGrid.frameCount ?? sourceGrid.columns * sourceGrid.rows
    : 1;
  const targetFrameCount = targetGeometry.frameGrid
    ? targetGeometry.frameGrid.frameCount ?? targetGeometry.frameGrid.columns * targetGeometry.frameGrid.rows
    : 1;
  const canvas = document.createElement("canvas");
  canvas.width = targetGeometry.dimensions.width;
  canvas.height = targetGeometry.dimensions.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas for derived asset.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let frame = 0; frame < targetFrameCount; frame += 1) {
    const sourceRect = frameRect(sourceGrid, sourceImage, frame % sourceFrameCount, sourceDimensions);
    const targetRect = frameRect(targetGeometry.frameGrid, undefined, frame, targetGeometry.dimensions);

    if (options.strategy === "crop") {
      drawCrop(context, sourceImage, sourceRect, targetRect, options.cropX ?? 0, options.cropY ?? 0);
    } else if (options.strategy === "tile") {
      drawTile(context, sourceImage, sourceRect, targetRect, Boolean(options.mirrorX), Boolean(options.mirrorY));
    } else {
      drawScale(context, sourceImage, sourceRect, targetRect, options.scaleMode ?? "fit");
    }
  }

  assertCanvasHasPixels(canvas, context);

  const dataUrl = canvas.toDataURL("image/png");

  return {
    index: 0,
    dataUrl,
    mimeType: mimeTypeFromDataUrl(dataUrl),
    prompt: options.prompt,
    model: `derived-${options.strategy}`,
    dimensions: targetGeometry.dimensions,
    frameGrid: targetGeometry.frameGrid,
    settings: {
      ...options.targetAsset.settings,
      format: "png"
    }
  };
}

export async function referenceImageForCandidate(candidate: DeriveCandidate): Promise<{
  name: string;
  dataUrl: string;
}> {
  return {
    name: `${candidate.assetId}.reference.${extensionFromMimeType(candidate.asset.versions[candidate.asset.activeVersion]?.file)}`,
    dataUrl: candidate.src.startsWith("data:")
      ? candidate.src
      : await imageSourceToDataUrl(candidate.src)
  };
}

async function loadCanvasDrawable(src: string): Promise<CanvasDrawable> {
  if (!isSvgSource(src) && typeof createImageBitmap === "function") {
    const response = await fetch(src);

    if (!response.ok) {
      throw new Error(`Could not load source target image (${response.status}).`);
    }

    const blob = await response.blob();

    if (!blob.type.includes("svg")) {
      const bitmap = await createImageBitmap(blob);

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height
      };
    }
  }

  const dataUrl = src.startsWith("data:") ? src : await imageSourceToDataUrl(src);
  const image = await loadImageElement(dataUrl);

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

function targetGeometryForAsset(
  asset: AiAssetDefinition,
  frameDimensions: AiAssetDimensions,
  frameCount = defaultFrameCount(asset)
): {
  dimensions: AiAssetDimensions;
  frameGrid?: AiAssetFrameGrid;
} {
  if (!asset.frameGrid) {
    return { dimensions: frameDimensions };
  }

  const columns = Math.min(frameCount, Math.ceil(Math.sqrt(frameCount)));
  const rows = Math.ceil(frameCount / columns);
  const frameGrid = {
    ...asset.frameGrid,
    frameCount,
    columns,
    rows,
    frameWidth: frameDimensions.width,
    frameHeight: frameDimensions.height
  };

  return {
    dimensions: {
      width: frameGrid.frameWidth * frameGrid.columns,
      height: frameGrid.frameHeight * frameGrid.rows
    },
    frameGrid
  };
}

function frameRect(
  frameGrid: AiAssetFrameGrid | undefined,
  image: CanvasDrawable | undefined,
  frame: number,
  dimensions?: AiAssetDimensions
): { x: number; y: number; width: number; height: number } {
  if (!frameGrid) {
    return {
      x: 0,
      y: 0,
      width: image?.width ?? dimensions?.width ?? 1,
      height: image?.height ?? dimensions?.height ?? 1
    };
  }

  const margin = frameGrid.margin ?? 0;
  const spacing = frameGrid.spacing ?? 0;
  const column = frame % frameGrid.columns;
  const row = Math.floor(frame / frameGrid.columns);

  return {
    x: margin + column * (frameGrid.frameWidth + spacing),
    y: margin + row * (frameGrid.frameHeight + spacing),
    width: frameGrid.frameWidth,
    height: frameGrid.frameHeight
  };
}

function drawScale(
  context: CanvasRenderingContext2D,
  image: CanvasDrawable,
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  mode: "fit" | "stretch"
): void {
  if (mode === "stretch") {
    context.drawImage(image.source, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
    return;
  }

  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(
    image.source,
    source.x,
    source.y,
    source.width,
    source.height,
    target.x + (target.width - width) / 2,
    target.y + (target.height - height) / 2,
    width,
    height
  );
}

function drawCrop(
  context: CanvasRenderingContext2D,
  image: CanvasDrawable,
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  cropX: number,
  cropY: number
): void {
  const sourceX = source.x + Math.max(0, Math.min(cropX, Math.max(0, source.width - target.width)));
  const sourceY = source.y + Math.max(0, Math.min(cropY, Math.max(0, source.height - target.height)));
  context.drawImage(
    image.source,
    sourceX,
    sourceY,
    Math.min(target.width, source.width),
    Math.min(target.height, source.height),
    target.x,
    target.y,
    Math.min(target.width, source.width),
    Math.min(target.height, source.height)
  );
}

function drawTile(
  context: CanvasRenderingContext2D,
  image: CanvasDrawable,
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  mirrorX: boolean,
  mirrorY: boolean
): void {
  for (let y = 0; y < target.height; y += source.height) {
    for (let x = 0; x < target.width; x += source.width) {
      const width = Math.min(source.width, target.width - x);
      const height = Math.min(source.height, target.height - y);
      const flipX = mirrorX && Math.floor(x / source.width) % 2 === 1;
      const flipY = mirrorY && Math.floor(y / source.height) % 2 === 1;
      const sourceX = source.x + (flipX ? source.width - width : 0);
      const sourceY = source.y + (flipY ? source.height - height : 0);

      context.save();
      context.translate(target.x + x + (flipX ? width : 0), target.y + y + (flipY ? height : 0));
      context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      context.drawImage(image.source, sourceX, sourceY, width, height, 0, 0, width, height);
      context.restore();
    }
  }
}

function assertCanvasHasPixels(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(pixels.length / 4096 / 4) * 4);

  for (let index = 3; index < pixels.length; index += stride) {
    if (pixels[index] > 0) return;
  }

  throw new Error("Derived image was empty. Try another source target or dimensions.");
}

function candidateFrameDimensions(candidate: DeriveCandidate): AiAssetDimensions {
  return {
    width: candidate.frameGrid?.frameWidth ?? candidate.dimensions?.width ?? defaultFrameDimensions(candidate.asset).width,
    height: candidate.frameGrid?.frameHeight ?? candidate.dimensions?.height ?? defaultFrameDimensions(candidate.asset).height
  };
}

function defaultFrameDimensions(asset: AiAssetDefinition): AiAssetDimensions {
  return {
    width: asset.frameGrid?.frameWidth ?? asset.dimensions?.width ?? 1,
    height: asset.frameGrid?.frameHeight ?? asset.dimensions?.height ?? 1
  };
}

function defaultFrameCount(asset: AiAssetDefinition): number {
  return asset.frameGrid?.frameCount ?? (asset.frameGrid ? asset.frameGrid.columns * asset.frameGrid.rows : 1);
}

function numericField(value: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = String(value);
  return input;
}

function nonNegativeIntegerInput(input: HTMLInputElement): number {
  const value = Number(input.value);

  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.floor(value));
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "ai-game-assets-designer__field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function inlineCheck(label: string, input: HTMLInputElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "ai-game-assets-designer__inline-checkbox";
  wrapper.append(input, label);
  return wrapper;
}

function hintForStrategy(strategy: DeriveStrategy, format: AiAssetFormat): string {
  if (strategy === "generate") {
    return "Creates three AI options using the selected target as a reference.";
  }
  if (strategy === "extend") {
    return format === "svg"
      ? "AI extend is not available for SVG assets."
      : "Creates three AI options at the requested size using the selected target as a reference.";
  }
  if (strategy === "scale") {
    return "Creates one local option by fitting or stretching the selected target into the requested size.";
  }
  if (strategy === "tile") {
    return "Creates one local option by repeating the selected target. For animations, each frame is tiled separately.";
  }

  return "Creates one local option by cropping from the selected target. For animations, each frame is cropped separately.";
}

function updateCropBox(
  asset: AiAssetDefinition,
  dimensions: AiAssetDimensions,
  cropXInput: HTMLInputElement,
  cropYInput: HTMLInputElement,
  image: HTMLImageElement,
  cropBox: HTMLDivElement
): void {
  if (!image.naturalWidth || !image.naturalHeight) return;

  const sourceDimensions = defaultFrameDimensions(asset);
  const scaleX = image.clientWidth / sourceDimensions.width;
  const scaleY = image.clientHeight / sourceDimensions.height;
  const x = Math.max(0, Number(cropXInput.value) || 0) * scaleX;
  const y = Math.max(0, Number(cropYInput.value) || 0) * scaleY;
  cropBox.style.left = `${x}px`;
  cropBox.style.top = `${y}px`;
  cropBox.style.width = `${Math.min(dimensions.width, sourceDimensions.width) * scaleX}px`;
  cropBox.style.height = `${Math.min(dimensions.height, sourceDimensions.height) * scaleY}px`;
}

function extensionFromMimeType(value: string | undefined): string {
  if (!value) return "png";
  if (/\.svg(?:$|\?)/i.test(value)) return "svg";
  if (/\.webp(?:$|\?)/i.test(value)) return "webp";
  if (/\.jpe?g(?:$|\?)/i.test(value)) return "jpg";
  return "png";
}
