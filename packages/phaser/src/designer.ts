import type {
  AiAssetAnimation,
  AiAssetAnimationFrameTiming,
  AiAssetDefinition,
  AiAssetFormat,
  AiAssetGenerationSettings,
  AiAssetManifest
} from "@ai-game-assets/core";
import {
  AiAssetDebugClient,
  type DebugStyleGuideDraft,
  type GeneratedDebugOption
} from "./debug-client.js";
import {
  ensureMissingAiAssetFirstDrafts,
  type EnsureMissingAiAssetFirstDraftsProgress
} from "./first-drafts.js";

type AiAssetTextureFrameConfig = {
  frameWidth: number;
  frameHeight: number;
  margin?: number;
  spacing?: number;
};

export type AiAssetDesignerSceneLike = {
  textures: {
    exists(key: string): boolean;
    remove(key: string): unknown;
    addImage(key: string, image: HTMLImageElement): unknown;
    addSpriteSheet?(
      key: string,
      image: HTMLImageElement,
      config: AiAssetTextureFrameConfig
    ): unknown;
  };
  input?: {
    keyboard?: {
      enabled: boolean;
    } | null;
  };
};

export type AiAssetDesignerOptions = {
  scene: AiAssetDesignerSceneLike;
  manifest: AiAssetManifest;
  client?: AiAssetDebugClient;
  autoFirstDrafts?: boolean;
  assetIds?: string[];
  title?: string;
  optionCount?: number;
  mount?: HTMLElement;
  restartOnPromote?: boolean;
  previewDisplaySize?:
    | Record<string, AiAssetPreviewDisplaySize>
    | ((assetId: string, asset: AiAssetDefinition) => AiAssetPreviewDisplaySize | undefined);
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onAssetReady?(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onManifestUpdated?(manifest: AiAssetManifest): void;
};

export type AiAssetPreviewDisplaySize = {
  width: number;
  height: number;
};

export type AiAssetDesigner = {
  root: HTMLDivElement;
  open(): void;
  close(): void;
  destroy(): void;
};

type DesignerElements = {
  root: HTMLDivElement;
  toggle: HTMLButtonElement;
  panel: HTMLDivElement;
  styleButton: HTMLButtonElement;
  assetSelect: HTMLSelectElement;
  animationSelect: HTMLSelectElement;
  animationField: HTMLLabelElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  frameCountInput: HTMLInputElement;
  frameCountField: HTMLLabelElement;
  formatSelect: HTMLSelectElement;
  formatField: HTMLLabelElement;
  promptInput: HTMLTextAreaElement;
  currentImage: HTMLImageElement;
  currentAnimation: HTMLDivElement;
  currentAnimationButton: HTMLButtonElement;
  currentPreview: HTMLDivElement;
  regenerateButton: HTMLButtonElement;
  promoteButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  versionLabel: HTMLDivElement;
  options: HTMLDivElement;
  status: HTMLDivElement;
};

type StyleGuideDraft = {
  prompt: string;
  images: Array<{
    name: string;
    src: string;
  }>;
};

const assetFormatOptions: Array<{ value: AiAssetFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "svg", label: "SVG" }
];

export function installAiAssetDesigner(
  options: AiAssetDesignerOptions
): AiAssetDesigner {
  ensureDesignerStyles();

  const client = options.client ?? new AiAssetDebugClient();
  let manifest = options.manifest;
  let selectedAssetId = options.assetIds?.[0] ?? Object.keys(manifest.assets)[0];
  let selectedTargetAssetId = selectedAssetId;
  let selectedOption: GeneratedDebugOption | undefined;
  let stopCurrentAnimationPreview: (() => void) | undefined;
  let editedCurrentOption: GeneratedDebugOption | undefined;
  let styleGuideDraft = styleGuideDraftFromManifest(manifest);
  const formatDrafts = new Map<string, AiAssetFormat>();
  let activeGeneration:
    | {
        controller: AbortController;
        id: number;
      }
    | undefined;
  let generationId = 0;

  if (!selectedAssetId) {
    throw new Error("AI asset designer requires at least one asset.");
  }

  const elements = createDesignerElements(options, manifest, selectedAssetId);
  const mount = options.mount ?? document.body;
  mount.append(elements.root);
  bindKeyboardCapture(elements.root, options.scene);

  const setOpen = (isOpen: boolean) => {
    elements.root.dataset.open = String(isOpen);
    elements.toggle.setAttribute("aria-expanded", String(isOpen));
  };

  const syncAnimationChoices = (assetId: string) => {
    const asset = manifest.assets[assetId];
    const linkedAnimations = Object.entries(asset.linkedAnimationAssets ?? {});
    elements.animationSelect.innerHTML = "";

    if (asset.kind !== "collection") {
      const baseOption = document.createElement("option");
      baseOption.value = assetId;
      baseOption.textContent = "Base image";
      elements.animationSelect.append(baseOption);
    }

    for (const [key, linkedAnimation] of linkedAnimations) {
      const option = document.createElement("option");
      option.value = linkedAnimation.assetId;
      option.textContent = linkedAnimation.label || readableAssetName(key);
      elements.animationSelect.append(option);
    }

    elements.animationField.hidden = linkedAnimations.length === 0;
    selectedTargetAssetId = asset.kind === "collection" && linkedAnimations[0]
      ? linkedAnimations[0][1].assetId
      : assetId;
    elements.animationSelect.value = selectedTargetAssetId;
  };

  const syncTargetAsset = (assetId: string) => {
    const asset = manifest.assets[assetId];
    const activeVersion = asset.versions[asset.activeVersion];
    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    elements.promptInput.value = activeVersion?.prompt ?? asset.prompt;
    elements.widthInput.value = String(asset.frameGrid?.frameWidth ?? asset.dimensions.width);
    elements.heightInput.value = String(asset.frameGrid?.frameHeight ?? asset.dimensions.height);
    elements.formatSelect.value = effectiveGenerationFormat(
      manifest,
      formatDrafts,
      selectedAssetId,
      assetId
    );
    elements.formatField.hidden = !canEditGenerationFormat(manifest, selectedAssetId, assetId);
    elements.frameCountInput.value = String(
      asset.frameGrid?.frameCount ??
      (asset.frameGrid ? asset.frameGrid.columns * asset.frameGrid.rows : 1)
    );
    elements.frameCountField.hidden = asset.kind === "image" || !asset.frameGrid;
    elements.versionLabel.textContent = `Active ${readableAssetName(assetId)}: ${asset.activeVersion}`;
    elements.currentImage.src = activeVersion?.file ?? "";
    elements.currentImage.alt = `${readableAssetName(assetId)} active version`;
    elements.currentPreview.setAttribute(
      "aria-label",
      `Preview active ${readableAssetName(assetId)} version`
    );
    elements.currentPreview.hidden = !activeVersion?.file;
    elements.currentAnimation.hidden = true;
    elements.currentImage.hidden = false;
    elements.currentAnimationButton.hidden = !activeVersion?.file || !asset.frameGrid;
    elements.currentAnimationButton.textContent = "Edit...";
    elements.currentPreview.classList.add("is-selected");
    elements.options.innerHTML = "";
    setStatus(elements, "", "idle");
    elements.promoteButton.disabled = true;
    selectedOption = undefined;
    editedCurrentOption = undefined;
  };

  const syncAsset = (assetId: string) => {
    syncAnimationChoices(assetId);
    syncTargetAsset(selectedTargetAssetId);
  };

  const handleFirstDraftProgress = (progress: EnsureMissingAiAssetFirstDraftsProgress) => {
    if (progress.total === 0) return;

    setStatus(
      elements,
      progress.currentAssetId
        ? `Generating ${readableAssetName(progress.currentAssetId)} ${progress.completed}/${progress.total}...`
        : `Generating first drafts ${progress.completed}/${progress.total}...`,
      "busy"
    );
  };

  const lockGenerationStatus = () => {
    elements.status.dataset.statusLock = "generation";
  };

  const unlockGenerationStatus = () => {
    if (elements.status.dataset.statusLock === "generation") {
      delete elements.status.dataset.statusLock;
    }
  };

  const finishGeneration = (id: number) => {
    if (activeGeneration?.id !== id) {
      return false;
    }

    activeGeneration = undefined;
    elements.regenerateButton.textContent = "Regenerate";
    unlockGenerationStatus();
    return true;
  };

  elements.toggle.addEventListener("click", () => {
    setOpen(elements.root.dataset.open !== "true");
  });

  elements.assetSelect.addEventListener("change", () => {
    selectedAssetId = elements.assetSelect.value;
    syncAsset(selectedAssetId);
  });

  elements.animationSelect.addEventListener("change", () => {
    selectedTargetAssetId = elements.animationSelect.value;
    syncTargetAsset(selectedTargetAssetId);
  });

  elements.formatSelect.addEventListener("change", () => {
    if (canEditGenerationFormat(manifest, selectedAssetId, selectedTargetAssetId)) {
      formatDrafts.set(selectedTargetAssetId, normalizeAssetFormat(elements.formatSelect.value));
    }
  });

  elements.currentPreview.addEventListener("click", () => {
    const asset = manifest.assets[selectedTargetAssetId];
    const activeVersion = asset.versions[asset.activeVersion];

    if (!activeVersion?.file) return;

    for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
      item.classList.remove("is-selected");
    }

    elements.currentPreview.classList.add("is-selected");
    selectedOption = editedCurrentOption;
    elements.promoteButton.disabled = !selectedOption;
    previewCurrentAsset({
      scene: options.scene,
      manifest,
      assetId: selectedTargetAssetId,
      src: activeVersion.file,
      onPreview: options.onPreview
    });
    setStatus(elements, "Previewing active version.", "info");
  });

  elements.currentPreview.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    elements.currentPreview.click();
  });

  elements.regenerateButton.addEventListener("click", async () => {
    if (activeGeneration) {
      activeGeneration.controller.abort();
      activeGeneration = undefined;
      elements.regenerateButton.textContent = "Regenerate";
      unlockGenerationStatus();
      setStatus(elements, "Generation cancelled.", "info");
      return;
    }

    const controller = new AbortController();
    const currentGenerationId = generationId + 1;
    const generationAssetId = selectedTargetAssetId;
    const generationFormat = effectiveGenerationFormat(
      manifest,
      formatDrafts,
      selectedAssetId,
      generationAssetId
    );
    generationId = currentGenerationId;
    activeGeneration = { controller, id: currentGenerationId };

    setStatus(elements, "Generating options...", "busy");
    lockGenerationStatus();
    elements.promoteButton.disabled = true;
    elements.regenerateButton.textContent = "Cancel";
    selectedOption = undefined;

    try {
      const generated = await client.generate({
        assetId: generationAssetId,
        prompt: elements.promptInput.value,
        count: options.optionCount ?? 3,
        format: generationFormat,
        styleGuide: await styleGuideRequest(styleGuideDraft),
        ...generationOverridesFromInputs(
          elements,
          manifest.assets[generationAssetId],
          generationFormat
        )
      }, {
        signal: controller.signal
      });

      if (activeGeneration?.id !== currentGenerationId) {
        return;
      }

      finishGeneration(currentGenerationId);
      renderOptions({
        elements,
        generated,
        scene: options.scene,
        manifest,
        assetId: generationAssetId,
        designerOptions: options,
        onPreview: options.onPreview,
        onSelected(option) {
          selectedOption = option;
          elements.promoteButton.disabled = false;
        }
      });
      setStatus(elements, "Pick an option to preview it.", "info");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      finishGeneration(currentGenerationId);
      elements.options.innerHTML = "";
      setStatus(elements, `Generation failed. ${errorMessage(error)}`, "error");
    } finally {
      finishGeneration(currentGenerationId);
    }
  });

  elements.promoteButton.addEventListener("click", async () => {
    if (!selectedOption) return;

    const versionName = `promoted-${Date.now()}`;
    setStatus(elements, `Promoting ${versionName}...`, "busy");
    elements.promoteButton.disabled = true;

    try {
      await client.save({
        assetId: selectedTargetAssetId,
        versionName,
        dataUrl: selectedOption.dataUrl,
        prompt: selectedOption.prompt,
        model: selectedOption.model,
        revisedPrompt: selectedOption.revisedPrompt,
        dimensions: selectedOption.dimensions,
        frameGrid: selectedOption.frameGrid,
        animations: selectedOption.animations,
        settings: selectedOption.settings,
        activate: true,
        notes: "Promoted from the AI asset designer."
      });

      manifest = await client.getManifest();
      options.onManifestUpdated?.(manifest);
      formatDrafts.delete(selectedTargetAssetId);
      syncTargetAsset(selectedTargetAssetId);
      setStatus(elements, `Promoted ${selectedTargetAssetId} to ${versionName}.`, "success");

      if (options.restartOnPromote) {
        window.location.reload();
      }
    } catch (error) {
      elements.promoteButton.disabled = false;
      setStatus(elements, `Promotion failed. ${errorMessage(error)}`, "error");
    }
  });

  elements.restartButton.addEventListener("click", () => {
    window.location.reload();
  });

  elements.styleButton.addEventListener("click", () => {
    void openStyleGuideEditor({
      root: elements.root,
      initial: styleGuideDraft,
      onConfirm(draft) {
        styleGuideDraft = draft;
        setStatus(
          elements,
          hasStyleGuide(draft)
            ? "Style guide applied to future generations."
            : "Style guide cleared for future generations.",
          "success"
        );
      },
      async onPromote(draft) {
        try {
          await client.promoteStyle(await styleGuideRequest(draft));
          styleGuideDraft = draft;
          manifest = await client.getManifest();
          options.onManifestUpdated?.(manifest);
          setStatus(elements, "Style guide promoted to project storage.", "success");
        } catch (error) {
          setStatus(elements, `Style promotion failed. ${errorMessage(error)}`, "error");
          throw error;
        }
      }
    });
  });

  elements.currentAnimationButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const asset = manifest.assets[selectedTargetAssetId];
    const activeVersion = asset.versions[asset.activeVersion];

    if (!asset.frameGrid || !activeVersion?.file) return;

    void openAnimationEditor({
      root: elements.root,
      asset,
      assetId: selectedTargetAssetId,
      src: editedCurrentOption?.dataUrl ?? activeVersion.file,
      displaySize: resolvePreviewDisplaySize(options, selectedTargetAssetId, asset),
      initialAnimations: editedCurrentOption?.animations ?? asset.animations,
      onConfirm: async (animations) => {
        const dataUrl = editedCurrentOption?.dataUrl ?? await imageSourceToDataUrl(activeVersion.file);
        const optionAsset = {
          ...asset,
          animations
        };

        editedCurrentOption = {
          index: -1,
          dataUrl,
          mimeType: mimeTypeFromDataUrl(dataUrl),
          prompt: activeVersion.prompt ?? asset.prompt,
          model: activeVersion.model,
          revisedPrompt: activeVersion.revisedPrompt,
          dimensions: asset.dimensions,
          frameGrid: asset.frameGrid,
          animations
        };
        selectedOption = editedCurrentOption;
        elements.promoteButton.disabled = false;
        previewImageSource({
          scene: options.scene,
          manifest,
          assetId: selectedTargetAssetId,
          src: dataUrl,
          textureKey: `ai-current-edit:${selectedTargetAssetId}:${Date.now()}`,
          assetOverride: optionAsset,
          onPreview: options.onPreview
        });
        setStatus(elements, "Animation edits applied. Promote to save them to code.", "success");
      }
    });
  });

  syncAsset(selectedAssetId);

  if (options.autoFirstDrafts !== false) {
    void ensureMissingAiAssetFirstDrafts({
      scene: options.scene,
      manifest,
      client,
      assetIds: options.assetIds,
      continueOnError: true,
      onManifestUpdated: (updatedManifest) => {
        manifest = updatedManifest;
        options.onManifestUpdated?.(updatedManifest);
        syncAsset(selectedAssetId);
      },
      onAssetReady: (assetId, textureKey, asset) => {
        (options.onAssetReady ?? options.onPreview)(assetId, textureKey, asset);
      },
      onProgress: handleFirstDraftProgress,
      onError: (error, assetId) => {
        setStatus(
          elements,
          `First draft failed for ${readableAssetName(assetId)}: ${errorMessage(error)}`,
          "error"
        );
      }
    }).then((result) => {
      if (result.generatedAssetIds.length > 0 && result.errors.length === 0) {
        setStatus(elements, "First drafts generated.", "success");
      }
    }).catch((error) => {
      setStatus(elements, `First draft failed: ${errorMessage(error)}`, "error");
    });
  }

  return {
    root: elements.root,
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy: () => {
      activeGeneration?.controller.abort();
      stopStatusAnimation(elements.status);
      elements.root.remove();
    }
  };
}

function createDesignerElements(
  options: AiAssetDesignerOptions,
  manifest: AiAssetManifest,
  selectedAssetId: string
): DesignerElements {
  const root = document.createElement("div");
  root.className = "ai-game-assets-designer";
  root.dataset.open = "false";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ai-game-assets-designer__toggle";
  toggle.setAttribute("aria-label", "Toggle AI asset designer");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "AI";

  const panel = document.createElement("div");
  panel.className = "ai-game-assets-designer__panel";

  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__title";
  title.textContent = options.title ?? "AI Asset Designer";
  const styleButton = document.createElement("button");
  styleButton.type = "button";
  styleButton.className = "ai-game-assets-designer__style-button";
  styleButton.textContent = "Define style...";
  const header = document.createElement("div");
  header.className = "ai-game-assets-designer__header";
  header.append(title, styleButton);

  const assetSelect = document.createElement("select");
  assetSelect.className = "ai-game-assets-designer__select";

  for (const assetId of options.assetIds ?? Object.keys(manifest.assets)) {
    const option = document.createElement("option");
    option.value = assetId;
    option.textContent = readableAssetName(assetId);
    option.selected = assetId === selectedAssetId;
    assetSelect.append(option);
  }

  const animationSelect = document.createElement("select");
  animationSelect.className = "ai-game-assets-designer__animation-select";
  const animationField = labelWrap("Animation", animationSelect);

  const promptInput = document.createElement("textarea");
  promptInput.className = "ai-game-assets-designer__prompt";
  promptInput.rows = 6;

  const widthInput = numericInput();
  const heightInput = numericInput();
  const frameCountInput = numericInput();
  const formatSelect = document.createElement("select");
  formatSelect.className = "ai-game-assets-designer__format-select";
  for (const format of assetFormatOptions) {
    const option = document.createElement("option");
    option.value = format.value;
    option.textContent = format.label;
    formatSelect.append(option);
  }
  const dimensionGrid = document.createElement("div");
  dimensionGrid.className = "ai-game-assets-designer__dimensions";
  dimensionGrid.append(
    labelWrap("Width", widthInput),
    labelWrap("Height", heightInput)
  );
  const frameCountField = labelWrap("Frames", frameCountInput);
  const formatField = labelWrap("Format", formatSelect);

  const currentPreview = document.createElement("div");
  currentPreview.className = "ai-game-assets-designer__current";
  currentPreview.setAttribute("role", "button");
  currentPreview.tabIndex = 0;
  const currentImage = document.createElement("img");
  currentImage.className = "ai-game-assets-designer__current-image";
  const currentAnimation = document.createElement("div");
  currentAnimation.className = "ai-game-assets-designer__animation-stage";
  currentAnimation.hidden = true;
  const currentAnimationButton = document.createElement("button");
  currentAnimationButton.type = "button";
  currentAnimationButton.className = "ai-game-assets-designer__animate-button";
  currentAnimationButton.textContent = "Animate";
  currentAnimationButton.hidden = true;
  currentPreview.append(currentImage, currentAnimation, currentAnimationButton);

  const regenerateButton = document.createElement("button");
  regenerateButton.type = "button";
  regenerateButton.textContent = "Regenerate";

  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.textContent = "Promote";
  promoteButton.disabled = true;

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.textContent = "Restart";

  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__actions";
  actions.append(regenerateButton, promoteButton, restartButton);

  const versionLabel = document.createElement("div");
  versionLabel.className = "ai-game-assets-designer__meta";

  const optionsGrid = document.createElement("div");
  optionsGrid.className = "ai-game-assets-designer__options";

  const status = document.createElement("div");
  status.className = "ai-game-assets-designer__status";

  panel.append(
    header,
    labelWrap("Asset", assetSelect),
    animationField,
    dimensionGrid,
    frameCountField,
    formatField,
    labelWrap("Current", currentPreview),
    labelWrap("Prompt", promptInput),
    actions,
    versionLabel,
    optionsGrid,
    status
  );
  root.append(toggle, panel);

  return {
    root,
    toggle,
    panel,
    styleButton,
    assetSelect,
    animationSelect,
    animationField,
    widthInput,
    heightInput,
    frameCountInput,
    frameCountField,
    formatSelect,
    formatField,
    promptInput,
    currentImage,
    currentAnimation,
    currentAnimationButton,
    currentPreview,
    regenerateButton,
    promoteButton,
    restartButton,
    versionLabel,
    options: optionsGrid,
    status
  };
}

function renderOptions(options: {
  elements: DesignerElements;
  generated: GeneratedDebugOption[];
  scene: AiAssetDesignerSceneLike;
  manifest: AiAssetManifest;
  assetId: string;
  designerOptions: AiAssetDesignerOptions;
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onSelected(option: GeneratedDebugOption): void;
}): void {
  options.elements.options.innerHTML = "";
  const asset = options.manifest.assets[options.assetId];

  for (const option of options.generated) {
    const optionAsset = assetWithGeneratedGeometry(asset, option);
    const card = document.createElement("div");
    card.className = "ai-game-assets-designer__option";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "ai-game-assets-designer__option-select";

    const image = document.createElement("img");
    image.src = option.dataUrl;
    image.alt = `${options.assetId} option ${option.index + 1}`;
    selectButton.append(image);

    selectButton.addEventListener("click", () => {
      for (const item of options.elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
        item.classList.remove("is-selected");
      }

      options.elements.currentPreview.classList.remove("is-selected");
      card.classList.add("is-selected");
      previewOption({
        scene: options.scene,
        manifest: options.manifest,
        assetId: options.assetId,
        option,
        onPreview: options.onPreview
      });
      options.onSelected(option);
      setStatus(options.elements, `Previewing option ${option.index + 1}.`, "info");
    });

    card.append(selectButton);

    if (optionAsset.frameGrid) {
      const animationStage = document.createElement("div");
      animationStage.className = "ai-game-assets-designer__option-animation";
      animationStage.hidden = true;
      selectButton.append(animationStage);

      const animateButton = document.createElement("button");
      animateButton.type = "button";
      animateButton.className = "ai-game-assets-designer__animate-button";
      animateButton.textContent = "Animate";
      let stopAnimation: (() => void) | undefined;

      animateButton.addEventListener("click", () => {
        if (stopAnimation) {
          stopAnimation();
          stopAnimation = undefined;
          animationStage.hidden = true;
          image.hidden = false;
          animateButton.textContent = "Animate";
          return;
        }

        image.hidden = true;
        animationStage.hidden = false;
        animateButton.textContent = "Stop";
        stopAnimation = startSpritesheetPreview({
          element: animationStage,
          src: option.dataUrl,
          asset: optionAsset,
          displaySize: resolvePreviewDisplaySize(
            options.designerOptions,
            options.assetId,
            optionAsset
          )
        });
      });

      card.append(animateButton);
    }

    options.elements.options.append(card);
  }
}

function previewOption(options: {
  scene: AiAssetDesignerSceneLike;
  manifest: AiAssetManifest;
  assetId: string;
  option: GeneratedDebugOption;
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
}): void {
  const textureKey = `ai-preview:${options.assetId}:${options.option.index}:${Date.now()}`;
  previewImageSource({
    scene: options.scene,
    manifest: options.manifest,
    assetId: options.assetId,
    src: options.option.dataUrl,
    textureKey,
    assetOverride: assetWithGeneratedGeometry(
      options.manifest.assets[options.assetId],
      options.option
    ),
    onPreview: options.onPreview
  });
}

function previewCurrentAsset(options: {
  scene: AiAssetDesignerSceneLike;
  manifest: AiAssetManifest;
  assetId: string;
  src: string;
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
}): void {
  const textureKey = `ai-current-preview:${options.assetId}:${Date.now()}`;
  previewImageSource({
    ...options,
    textureKey
  });
}

function previewImageSource(options: {
  scene: AiAssetDesignerSceneLike;
  manifest: AiAssetManifest;
  assetId: string;
  src: string;
  textureKey: string;
  assetOverride?: AiAssetDefinition;
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
}): void {
  const image = new Image();

  image.onload = () => {
    if (options.scene.textures.exists(options.textureKey)) {
      options.scene.textures.remove(options.textureKey);
    }

    const asset = options.assetOverride ?? options.manifest.assets[options.assetId];
    if (asset.frameGrid && options.scene.textures.addSpriteSheet) {
      options.scene.textures.addSpriteSheet(options.textureKey, image, {
        frameWidth: asset.frameGrid.frameWidth,
        frameHeight: asset.frameGrid.frameHeight,
        margin: asset.frameGrid.margin,
        spacing: asset.frameGrid.spacing
      });
    } else {
      options.scene.textures.addImage(options.textureKey, image);
    }

    options.onPreview(options.assetId, options.textureKey, asset);
  };
  image.src = options.src;
}

function startSpritesheetPreview(options: {
  element: HTMLDivElement;
  src: string;
  asset: AiAssetDefinition;
  displaySize: AiAssetPreviewDisplaySize;
}): () => void {
  const frameGrid = options.asset.frameGrid;

  if (!frameGrid) {
    return () => undefined;
  }

  const frames =
    options.asset.animations?.[0]?.frames ??
    Array.from(
      { length: frameGrid.frameCount ?? frameGrid.columns * frameGrid.rows },
      (_, index) => index
    );
  const frameRate = options.asset.animations?.[0]?.frameRate ?? 8;
  const frameTimings = options.asset.animations?.[0]?.frameTimings ?? [];
  let frameCursor = 0;
  let timeout: number | undefined;
  const frameElement = ensureFramePreviewElement(options.element);

  const renderFrame = () => {
    const frame = frames[frameCursor % frames.length] ?? 0;
    const timing = frameTimings[frameCursor % frames.length];
    const scaleX = timing?.scaleX ?? 1;
    const scaleY = timing?.scaleY ?? 1;
    const rotation = timing?.rotation ?? 0;

    options.element.style.width = `${options.displaySize.width}px`;
    options.element.style.height = `${options.displaySize.height}px`;
    setFrameElementBackground(frameElement, {
      src: options.src,
      frame,
      frameGrid,
      displaySize: options.displaySize
    });
    frameElement.style.transform =
      `translate(${timing?.offsetX ?? 0}px, ${timing?.offsetY ?? 0}px) ` +
      `scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`;
    frameElement.style.transformOrigin = "center";
    frameCursor += 1;
    timeout = window.setTimeout(renderFrame, timing?.delayMs ?? 1000 / frameRate);
  };

  renderFrame();

  return () => {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
    options.element.removeAttribute("style");
    frameElement.remove();
  };
}

async function openStyleGuideEditor(options: {
  root: HTMLElement;
  initial: StyleGuideDraft;
  onConfirm(draft: StyleGuideDraft): void;
  onPromote(draft: StyleGuideDraft): void | Promise<void>;
}): Promise<void> {
  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Define style guide");

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card";
  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent = "Style guide";

  const promptInput = document.createElement("textarea");
  promptInput.rows = 5;
  promptInput.value = options.initial.prompt;
  const promptField = labelWrap("Style prompt", promptInput);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp";
  fileInput.multiple = true;
  fileInput.hidden = true;
  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.textContent = "Upload images";

  const dropZone = document.createElement("div");
  dropZone.className = "ai-game-assets-designer__style-drop";
  dropZone.tabIndex = 0;
  dropZone.textContent = "Drop style reference images here";

  const imageList = document.createElement("div");
  imageList.className = "ai-game-assets-designer__style-images";
  let images = options.initial.images.map((image) => ({ ...image }));

  const renderImages = () => {
    imageList.innerHTML = "";

    for (const [index, image] of images.entries()) {
      const item = document.createElement("div");
      item.className = "ai-game-assets-designer__style-image";
      const preview = document.createElement("img");
      preview.src = image.src;
      preview.alt = image.name;
      const name = document.createElement("span");
      name.textContent = image.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${image.name}`);
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        images = images.filter((_, candidateIndex) => candidateIndex !== index);
        renderImages();
      });
      item.append(preview, name, remove);
      imageList.append(item);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const loaded = await Promise.all(
      Array.from(files)
        .filter((file) => file.type.startsWith("image/"))
        .map(async (file) => ({
          name: file.name,
          src: await fileToDataUrl(file)
        }))
    );
    images.push(...loaded);
    renderImages();
  };

  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files) void addFiles(fileInput.files);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");

    if (event.dataTransfer?.files) {
      void addFiles(event.dataTransfer.files);
    }
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Confirm";
  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.textContent = "Promote style";
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(cancelButton, promoteButton, confirmButton);

  const draft = (): StyleGuideDraft => ({
    prompt: promptInput.value.trim(),
    images: images.map((image) => ({ ...image }))
  });
  const close = () => dialog.remove();

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    options.onConfirm(draft());
    close();
  });
  promoteButton.addEventListener("click", async () => {
    promoteButton.disabled = true;

    try {
      const current = draft();
      options.onConfirm(current);
      await options.onPromote(current);
      close();
    } catch {
      // The caller reports promotion errors in the designer status area.
    } finally {
      promoteButton.disabled = false;
    }
  });

  card.append(title, promptField, dropZone, uploadButton, fileInput, imageList, actions);
  dialog.append(card);
  options.root.append(dialog);
  renderImages();
  promptInput.focus();
}

async function openAnimationEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  src: string;
  displaySize: AiAssetPreviewDisplaySize;
  initialAnimations?: AiAssetAnimation[];
  onConfirm(animations: AiAssetAnimation[]): void | Promise<void>;
}): Promise<void> {
  const frameGrid = options.asset.frameGrid;
  const baseAnimation = options.initialAnimations?.[0] ?? options.asset.animations?.[0];

  if (!frameGrid || !baseAnimation) return;

  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Edit ${readableAssetName(options.assetId)} animation`);

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card";

  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent = `Edit ${readableAssetName(options.assetId)}`;

  const stage = document.createElement("div");
  stage.className = "ai-game-assets-designer__modal-stage";

  const strip = document.createElement("div");
  strip.className = "ai-game-assets-designer__frame-strip";

  const delayInput = numericInput();
  delayInput.min = "1";
  const offsetXInput = signedNumberInput();
  const offsetYInput = signedNumberInput();
  const scaleXInput = decimalInput();
  const scaleYInput = decimalInput();
  const rotationInput = signedNumberInput();
  const tagInput = document.createElement("input");
  tagInput.type = "text";
  tagInput.placeholder = "shoot";

  const fields = document.createElement("div");
  fields.className = "ai-game-assets-designer__frame-fields";
  fields.append(
    labelWrap("Delay ms", delayInput),
    labelWrap("Offset X", offsetXInput),
    labelWrap("Offset Y", offsetYInput),
    labelWrap("Scale X", scaleXInput),
    labelWrap("Scale Y", scaleYInput),
    labelWrap("Rotation", rotationInput),
    labelWrap("Tag", tagInput)
  );

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Confirm";

  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(cancelButton, confirmButton);

  card.append(title, stage, strip, fields, actions);
  dialog.append(card);
  options.root.append(dialog);

  let anchorFrameSlot = 0;
  const selectedFrameSlots = new Set<number>([0]);
  let stopPreview: (() => void) | undefined;
  const frameTimings = baseAnimation.frames.map((_, index) => ({
    ...baseAnimation.frameTimings?.[index]
  }));

  const animationFromTimings = (): AiAssetAnimation => ({
    ...baseAnimation,
    frameTimings: frameTimings.map((timing) => ({
      delayMs: positiveIntegerValue(timing.delayMs, Math.round(1000 / baseAnimation.frameRate)),
      offsetX: integerValue(timing.offsetX, 0),
      offsetY: integerValue(timing.offsetY, 0),
      scaleX: numberValue(timing.scaleX, 1),
      scaleY: numberValue(timing.scaleY, 1),
      rotation: numberValue(timing.rotation, 0),
      tag: timing.tag?.trim() || undefined
    }))
  });

  const previewAsset = (): AiAssetDefinition => ({
    ...options.asset,
    animations: [animationFromTimings()]
  });

  const restartPreview = () => {
    stopPreview?.();
    stopPreview = startSpritesheetPreview({
      element: stage,
      src: options.src,
      asset: previewAsset(),
      displaySize: options.displaySize
    });
  };

  const syncInputs = () => {
    const selectedTimings = selectedFrameSlotsArray().map((frameSlot) => frameTimings[frameSlot] ?? {});
    setInputForSelected(
      delayInput,
      selectedTimings,
      (timing) => positiveIntegerValue(timing.delayMs, Math.round(1000 / baseAnimation.frameRate))
    );
    setInputForSelected(offsetXInput, selectedTimings, (timing) => integerValue(timing.offsetX, 0));
    setInputForSelected(offsetYInput, selectedTimings, (timing) => integerValue(timing.offsetY, 0));
    setInputForSelected(scaleXInput, selectedTimings, (timing) => numberValue(timing.scaleX, 1));
    setInputForSelected(scaleYInput, selectedTimings, (timing) => numberValue(timing.scaleY, 1));
    setInputForSelected(rotationInput, selectedTimings, (timing) => numberValue(timing.rotation, 0));
    setInputForSelected(tagInput, selectedTimings, (timing) => timing.tag ?? "");

    for (const button of strip.querySelectorAll("button")) {
      const frameSlot = Number((button as HTMLButtonElement).dataset.frameSlot);
      button.classList.toggle("is-selected", selectedFrameSlots.has(frameSlot));
    }
  };

  const selectedFrameSlotsArray = () => [...selectedFrameSlots].sort((left, right) => left - right);

  const selectFrame = (index: number, event: MouseEvent) => {
    if (event.shiftKey) {
      const start = Math.min(anchorFrameSlot, index);
      const end = Math.max(anchorFrameSlot, index);
      selectedFrameSlots.clear();

      for (let frameSlot = start; frameSlot <= end; frameSlot += 1) {
        selectedFrameSlots.add(frameSlot);
      }
    } else if (event.metaKey || event.ctrlKey) {
      if (selectedFrameSlots.has(index)) {
        selectedFrameSlots.delete(index);
      } else {
        selectedFrameSlots.add(index);
      }

      anchorFrameSlot = index;
    } else {
      selectedFrameSlots.clear();
      selectedFrameSlots.add(index);
      anchorFrameSlot = index;
    }

    syncInputs();
  };

  const updateSelectedFrameThumbs = () => {
    for (const frameSlot of selectedFrameSlots) {
      const selectedButton = strip.querySelector<HTMLButtonElement>(
        `button[data-frame-slot="${frameSlot}"]`
      );

      if (selectedButton) {
        setFrameBackground(selectedButton, {
          src: options.src,
          frame: baseAnimation.frames[frameSlot] ?? 0,
          frameGrid,
          displaySize: { width: 48, height: 48 },
          timing: frameTimings[frameSlot]
        });
      }
    }
  };

  const updateSelectedTimings = (
    applyTiming: (timing: AiAssetAnimationFrameTiming) => AiAssetAnimationFrameTiming,
    options: { syncInputsAfterUpdate?: boolean } = {}
  ) => {
    for (const frameSlot of selectedFrameSlots) {
      frameTimings[frameSlot] = applyTiming(frameTimings[frameSlot] ?? {});
    }

    updateSelectedFrameThumbs();
    if (options.syncInputsAfterUpdate) {
      syncInputs();
    }
    restartPreview();
  };

  const updateSelectedDelay = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      delayMs: positiveIntegerInput(delayInput, Math.round(1000 / baseAnimation.frameRate))
    }));
  };

  const updateSelectedOffsetX = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      offsetX: integerInput(offsetXInput, 0)
    }));
  };

  const updateSelectedOffsetY = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      offsetY: integerInput(offsetYInput, 0)
    }));
  };

  const updateSelectedScaleX = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      scaleX: numberInput(scaleXInput, 1)
    }));
  };

  const updateSelectedScaleY = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      scaleY: numberInput(scaleYInput, 1)
    }));
  };

  const updateSelectedRotation = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      rotation: numberInput(rotationInput, 0)
    }));
  };

  const updateSelectedTag = () => {
    updateSelectedTimings((timing) => ({
      ...timing,
      tag: tagInput.value.trim() || undefined
    }));
  };

  const bindFrameInput = (input: HTMLInputElement, update: () => void) => {
    input.addEventListener("input", () => {
      if (selectedFrameSlots.size === 0) return;

      update();
    });
  };

  const setInputForSelected = (
    input: HTMLInputElement,
    timings: AiAssetAnimationFrameTiming[],
    valueForTiming: (timing: AiAssetAnimationFrameTiming) => string | number
  ) => {
    if (timings.length === 0) {
      input.value = "";
      return;
    }

    const values = timings.map((timing) => String(valueForTiming(timing)));
    input.value = values.every((value) => value === values[0]) ? values[0] : "";
  };

  const renderStrip = () => {
    strip.innerHTML = "";

    baseAnimation.frames.forEach((frame, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.frameSlot = String(index);
      button.className = "ai-game-assets-designer__frame-thumb";
      button.setAttribute("aria-label", `Frame ${index + 1}`);
      setFrameBackground(button, {
        src: options.src,
        frame,
        frameGrid,
        displaySize: { width: 48, height: 48 },
        timing: frameTimings[index]
      });
      button.addEventListener("click", (event) => {
        selectFrame(index, event);
      });
      strip.append(button);
    });
  };

  bindFrameInput(delayInput, updateSelectedDelay);
  bindFrameInput(offsetXInput, updateSelectedOffsetX);
  bindFrameInput(offsetYInput, updateSelectedOffsetY);
  bindFrameInput(scaleXInput, updateSelectedScaleX);
  bindFrameInput(scaleYInput, updateSelectedScaleY);
  bindFrameInput(rotationInput, updateSelectedRotation);
  bindFrameInput(tagInput, updateSelectedTag);

  const close = () => {
    stopPreview?.();
    dialog.remove();
  };

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", async () => {
    await options.onConfirm([animationFromTimings()]);
    close();
  });

  renderStrip();
  syncInputs();
  restartPreview();
}

function setFrameBackground(
  element: HTMLElement,
  options: {
    src: string;
    frame: number;
    frameGrid: NonNullable<AiAssetDefinition["frameGrid"]>;
    displaySize: AiAssetPreviewDisplaySize;
    timing?: AiAssetAnimationFrameTiming;
  }
): void {
  const frameElement = ensureFramePreviewElement(element);
  const offsetX = options.timing?.offsetX ?? 0;
  const offsetY = options.timing?.offsetY ?? 0;
  const scaleX = options.timing?.scaleX ?? 1;
  const scaleY = options.timing?.scaleY ?? 1;
  const rotation = options.timing?.rotation ?? 0;

  element.style.width = `${options.displaySize.width}px`;
  element.style.height = `${options.displaySize.height}px`;
  setFrameElementBackground(frameElement, options);
  frameElement.style.transform =
    `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`;
  frameElement.style.transformOrigin = "center";
}

function setFrameElementBackground(
  frameElement: HTMLElement,
  options: {
    src: string;
    frame: number;
    frameGrid: NonNullable<AiAssetDefinition["frameGrid"]>;
    displaySize: AiAssetPreviewDisplaySize;
  }
): void {
  const column = options.frame % options.frameGrid.columns;
  const row = Math.floor(options.frame / options.frameGrid.columns);

  frameElement.style.backgroundImage = `url("${cssUrl(options.src)}")`;
  frameElement.style.backgroundSize =
    `${options.frameGrid.columns * options.displaySize.width}px ${options.frameGrid.rows * options.displaySize.height}px`;
  frameElement.style.backgroundPosition =
    `${-(column * options.displaySize.width)}px ${-(row * options.displaySize.height)}px`;
}

function ensureFramePreviewElement(element: HTMLElement): HTMLElement {
  const existing = element.querySelector<HTMLElement>(
    ":scope > .ai-game-assets-designer__frame-image"
  );

  if (existing) return existing;

  const frameElement = document.createElement("span");
  frameElement.className = "ai-game-assets-designer__frame-image";
  element.append(frameElement);
  return frameElement;
}

function generationOverridesFromInputs(
  elements: DesignerElements,
  asset: AiAssetDefinition,
  format: AiAssetFormat
): {
  dimensions: { width: number; height: number };
  frameCount?: number;
  settings: AiAssetGenerationSettings;
} {
  const dimensions = {
    width: positiveIntegerInput(
      elements.widthInput,
      asset.frameGrid?.frameWidth ?? asset.dimensions.width
    ),
    height: positiveIntegerInput(
      elements.heightInput,
      asset.frameGrid?.frameHeight ?? asset.dimensions.height
    )
  };

  if (!asset.frameGrid) {
    return {
      dimensions,
      settings: { format }
    };
  }

  return {
    dimensions,
    settings: { format },
    frameCount: positiveIntegerInput(
      elements.frameCountInput,
      asset.frameGrid.frameCount ?? asset.frameGrid.columns * asset.frameGrid.rows
    )
  };
}

function canEditGenerationFormat(
  manifest: AiAssetManifest,
  selectedAssetId: string,
  targetAssetId: string
): boolean {
  const selectedAsset = manifest.assets[selectedAssetId];

  return selectedAsset?.kind === "collection" || selectedAssetId === targetAssetId;
}

function effectiveGenerationFormat(
  manifest: AiAssetManifest,
  drafts: Map<string, AiAssetFormat>,
  selectedAssetId: string,
  targetAssetId: string
): AiAssetFormat {
  if (canEditGenerationFormat(manifest, selectedAssetId, targetAssetId)) {
    return drafts.get(targetAssetId) ?? selectedFormatFromDesignerOrAsset(manifest.assets[targetAssetId]);
  }

  return drafts.get(selectedAssetId) ?? selectedFormatFromDesignerOrAsset(manifest.assets[selectedAssetId]);
}

function selectedFormatFromDesignerOrAsset(asset: AiAssetDefinition | undefined): AiAssetFormat {
  return normalizeAssetFormat(asset?.settings?.format);
}

function normalizeAssetFormat(format: string | undefined): AiAssetFormat {
  if (format === "jpg" || format === "webp" || format === "svg") return format;

  return "png";
}

function assetWithGeneratedGeometry(
  asset: AiAssetDefinition,
  option: GeneratedDebugOption
): AiAssetDefinition {
  return {
    ...asset,
    dimensions: option.dimensions ?? asset.dimensions,
    frameGrid: option.frameGrid ?? asset.frameGrid,
    animations: option.animations ?? asset.animations
  };
}

function positiveIntegerInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);

  if (!Number.isFinite(value)) return fallback;

  return Math.max(1, Math.floor(value));
}

function integerInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);

  if (!Number.isFinite(value)) return fallback;

  return Math.trunc(value);
}

function numberInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);

  if (!Number.isFinite(value)) return fallback;

  return value;
}

function positiveIntegerValue(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;

  return Math.max(1, Math.floor(value as number));
}

function integerValue(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;

  return Math.trunc(value as number);
}

function numberValue(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;

  return value as number;
}

function resolvePreviewDisplaySize(
  options: AiAssetDesignerOptions,
  assetId: string,
  asset: AiAssetDefinition
): AiAssetPreviewDisplaySize {
  const configured =
    typeof options.previewDisplaySize === "function"
      ? options.previewDisplaySize(assetId, asset)
      : options.previewDisplaySize?.[assetId];

  if (configured) {
    return configured;
  }

  return {
    width: asset.frameGrid?.frameWidth ?? asset.dimensions.width,
    height: asset.frameGrid?.frameHeight ?? asset.dimensions.height
  };
}

function cssUrl(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function bindKeyboardCapture(root: HTMLElement, scene: AiAssetDesignerSceneLike): void {
  const stopKeyboardEvent = (event: KeyboardEvent) => {
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      event.stopPropagation();
    }
  };

  const setKeyboardEnabled = (enabled: boolean) => {
    if (scene.input?.keyboard) {
      scene.input.keyboard.enabled = enabled;
    }
    root.dataset.keyboardCaptured = String(!enabled);
  };

  root.addEventListener("keydown", stopKeyboardEvent, true);
  root.addEventListener("keyup", stopKeyboardEvent, true);
  root.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && isEditableElement(event.target)) {
      setKeyboardEnabled(false);
    }
  });
  root.addEventListener("focusout", () => setKeyboardEnabled(true));
}

function isEditableElement(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}

function labelWrap(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "ai-game-assets-designer__field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function numericInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.inputMode = "numeric";

  return input;
}

function signedNumberInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "1";
  input.inputMode = "numeric";

  return input;
}

function decimalInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.inputMode = "decimal";

  return input;
}

async function imageSourceToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;

  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Could not load current animation image (${response.status}).`);
  }

  const responseBlob = await response.blob();
  const blob = responseBlob.type === "application/octet-stream"
    ? responseBlob.slice(0, responseBlob.size, mimeTypeFromFileName(src))
    : responseBlob;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not convert current animation image to a data URL."));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read current animation image."));
    });
    reader.readAsDataURL(blob);
  });
}

function styleGuideDraftFromManifest(manifest: AiAssetManifest): StyleGuideDraft {
  return {
    prompt: manifest.styleGuide?.prompt ?? "",
    images: (manifest.styleGuide?.images ?? []).map((image) => ({
      name: image.name,
      src: image.file
    }))
  };
}

function hasStyleGuide(styleGuide: StyleGuideDraft): boolean {
  return Boolean(styleGuide.prompt.trim() || styleGuide.images.length);
}

async function styleGuideRequest(styleGuide: StyleGuideDraft): Promise<DebugStyleGuideDraft> {
  return {
    prompt: styleGuide.prompt.trim() || undefined,
    images: await Promise.all(styleGuide.images.map(async (image) => ({
      name: image.name,
      dataUrl: await imageSourceToDataUrl(image.src)
    })))
  };
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read style reference image."));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read style reference image."));
    });
    reader.readAsDataURL(file);
  });
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/png";
}

function mimeTypeFromFileName(fileName: string): string {
  if (/\.png(?:$|[?#])/i.test(fileName)) return "image/png";
  if (/\.webp(?:$|[?#])/i.test(fileName)) return "image/webp";
  if (/\.jpe?g(?:$|[?#])/i.test(fileName)) return "image/jpeg";
  if (/\.svg(?:$|[?#])/i.test(fileName)) return "image/svg+xml";
  return "image/png";
}

function readableAssetName(assetId: string): string {
  return assetId
    .split(/[._-]/g)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

const statusAnimationTimers = new WeakMap<HTMLDivElement, number>();

function setStatus(
  elements: Pick<DesignerElements, "status">,
  message: string,
  kind: "idle" | "info" | "busy" | "success" | "error"
): void {
  if (
    elements.status.dataset.statusLock === "generation" &&
    (kind !== "busy" || message !== "Generating options...")
  ) {
    return;
  }

  stopStatusAnimation(elements.status);
  elements.status.dataset.kind = kind;

  if (kind === "busy" && message === "Generating options...") {
    startGeneratingStatusAnimation(elements.status, message);
    return;
  }

  elements.status.textContent = message;
}

function stopStatusAnimation(status: HTMLDivElement): void {
  const timer = statusAnimationTimers.get(status);

  if (timer !== undefined) {
    window.clearInterval(timer);
    statusAnimationTimers.delete(status);
  }
}

function startGeneratingStatusAnimation(status: HTMLDivElement, message: string): void {
  let offset = 0;
  const highlightLength = 3;
  const maxOffset = Math.max(1, message.length - highlightLength + 1);
  const render = () => {
    const before = message.slice(0, offset);
    const highlighted = message.slice(offset, offset + highlightLength);
    const after = message.slice(offset + highlightLength);
    const highlight = document.createElement("span");
    highlight.className = "ai-game-assets-designer__status-highlight";
    highlight.textContent = highlighted;
    status.replaceChildren(
      document.createTextNode(before),
      highlight,
      document.createTextNode(after)
    );
    offset = (offset + 1) % maxOffset;
  };

  render();
  statusAnimationTimers.set(status, window.setInterval(render, 140));
}

function ensureDesignerStyles(): void {
  const styleId = "ai-game-assets-designer-styles";

  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
.ai-game-assets-designer {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 2147483647;
  color: #f5f7fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.ai-game-assets-designer * { box-sizing: border-box; }
.ai-game-assets-designer [hidden] { display: none !important; }
.ai-game-assets-designer__toggle {
  width: 42px;
  height: 42px;
  border: 1px solid #63708a;
  border-radius: 999px;
  background: #202838;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
}
.ai-game-assets-designer__panel {
  display: none;
  width: min(340px, calc(100vw - 28px));
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  margin-top: 10px;
  padding: 14px;
  border: 1px solid #303949;
  border-radius: 8px;
  background: rgba(20, 24, 32, 0.97);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
}
.ai-game-assets-designer[data-open="true"] .ai-game-assets-designer__panel { display: block; }
.ai-game-assets-designer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.ai-game-assets-designer__title {
  font-weight: 700;
  font-size: 15px;
}
.ai-game-assets-designer__style-button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ai-game-assets-designer__field {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
  color: #b9c1cf;
  font-size: 13px;
}
.ai-game-assets-designer__field select,
.ai-game-assets-designer__field input,
.ai-game-assets-designer__field textarea {
  width: 100%;
  border: 1px solid #3a4352;
  border-radius: 6px;
  background: #101319;
  color: #f5f7fb;
  padding: 9px 10px;
  font: inherit;
}
.ai-game-assets-designer__field textarea { resize: vertical; }
.ai-game-assets-designer__dimensions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ai-game-assets-designer__dimensions .ai-game-assets-designer__field {
  margin-bottom: 12px;
}
.ai-game-assets-designer__current {
  min-height: 96px;
  display: grid;
  place-items: center;
  padding: 8px;
  border: 1px solid #384251;
  border-radius: 6px;
  background: #0f1218;
  overflow: hidden;
  cursor: pointer;
}
.ai-game-assets-designer__current.is-selected {
  border-color: #6ed3ff;
}
.ai-game-assets-designer__current:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.ai-game-assets-designer__current-image {
  max-width: 100%;
  max-height: 112px;
  object-fit: contain;
  image-rendering: pixelated;
}
.ai-game-assets-designer__animation-stage,
.ai-game-assets-designer__option-animation {
  position: relative;
  overflow: hidden;
  background: #0f1218;
}
.ai-game-assets-designer__animate-button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ai-game-assets-designer__current .ai-game-assets-designer__animate-button {
  width: 100%;
}
.ai-game-assets-designer__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ai-game-assets-designer__actions button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 9px 11px;
  font: inherit;
  cursor: pointer;
}
.ai-game-assets-designer__actions button:last-child { grid-column: 1 / -1; }
.ai-game-assets-designer__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.ai-game-assets-designer__meta,
.ai-game-assets-designer__status {
  min-height: 22px;
  color: #b9c1cf;
  font-size: 13px;
  margin-top: 11px;
}
.ai-game-assets-designer__status {
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.ai-game-assets-designer__status[data-kind="error"] {
  min-height: 0;
  padding: 10px 11px;
  border: 1px solid #f87171;
  border-radius: 6px;
  background: rgba(127, 29, 29, 0.34);
  color: #fecaca;
}
.ai-game-assets-designer__status[data-kind="success"] {
  color: #bbf7d0;
}
.ai-game-assets-designer__status[data-kind="busy"] {
  color: #bfdbfe;
}
.ai-game-assets-designer__status-highlight {
  color: #ffffff;
  text-shadow: 0 0 10px rgba(147, 197, 253, 0.9);
}
.ai-game-assets-designer__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.ai-game-assets-designer__option {
  border: 2px solid #384251;
  border-radius: 8px;
  background: #0f1218;
  min-height: 86px;
  display: grid;
  gap: 6px;
  place-items: center;
  padding: 6px;
}
.ai-game-assets-designer__option.is-selected { border-color: #6ed3ff; }
.ai-game-assets-designer__option-select {
  width: 100%;
  min-height: 74px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ai-game-assets-designer__option-select img {
  width: 68px;
  height: 68px;
  object-fit: contain;
  image-rendering: pixelated;
}
.ai-game-assets-designer__option .ai-game-assets-designer__animate-button {
  width: 100%;
}
.ai-game-assets-designer__modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(6, 8, 12, 0.62);
}
.ai-game-assets-designer__modal-card {
  width: min(520px, calc(100vw - 36px));
  max-height: calc(100vh - 36px);
  overflow: auto;
  border: 1px solid #384251;
  border-radius: 8px;
  background: #141820;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
  padding: 14px;
}
.ai-game-assets-designer__modal-title {
  margin-bottom: 12px;
  font-weight: 700;
  font-size: 15px;
}
.ai-game-assets-designer__modal-stage {
  margin: 0 auto 14px;
  position: relative;
  overflow: hidden;
  background: #0f1218;
}
.ai-game-assets-designer__frame-image {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}
.ai-game-assets-designer__frame-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 12px;
}
.ai-game-assets-designer__frame-thumb {
  flex: 0 0 auto;
  border: 2px solid #384251;
  border-radius: 6px;
  background-color: #0f1218;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.ai-game-assets-designer__frame-thumb.is-selected {
  border-color: #6ed3ff;
}
.ai-game-assets-designer__frame-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.ai-game-assets-designer__frame-fields .ai-game-assets-designer__field {
  margin-bottom: 0;
}
.ai-game-assets-designer__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.ai-game-assets-designer__modal-actions button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 9px 11px;
  font: inherit;
  cursor: pointer;
}
.ai-game-assets-designer__style-drop {
  display: grid;
  place-items: center;
  min-height: 90px;
  margin-bottom: 10px;
  border: 1px dashed #58657a;
  border-radius: 6px;
  background: #0f1218;
  color: #b9c1cf;
  font-size: 13px;
}
.ai-game-assets-designer__style-drop.is-dragging {
  border-color: #6ed3ff;
  color: #dbeafe;
}
.ai-game-assets-designer__style-drop + button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 8px 10px;
  font: inherit;
  cursor: pointer;
}
.ai-game-assets-designer__style-images {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.ai-game-assets-designer__style-image {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border: 1px solid #384251;
  border-radius: 6px;
  background: #0f1218;
  font-size: 12px;
}
.ai-game-assets-designer__style-image img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.ai-game-assets-designer__style-image span {
  overflow-wrap: anywhere;
}
.ai-game-assets-designer__style-image button {
  border: 0;
  background: transparent;
  color: #fca5a5;
  cursor: pointer;
}
`;
  document.head.append(style);
}
