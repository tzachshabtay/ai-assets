import type {
  AiAssetAnimation,
  AiAssetAnimationFrameTiming,
  AiAssetDefinition,
  AiAudioFormat,
  AiAudioGenerationSettings,
  AiAudioPlaybackSettings,
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
  dimensionGrid: HTMLDivElement;
  frameCountInput: HTMLInputElement;
  frameCountField: HTMLLabelElement;
  formatSelect: HTMLSelectElement;
  formatField: HTMLLabelElement;
  audioFormatSelect: HTMLSelectElement;
  audioFormatField: HTMLLabelElement;
  audioDurationInput: HTMLInputElement;
  audioDurationField: HTMLLabelElement;
  audioLoopInput: HTMLInputElement;
  audioLoopField: HTMLLabelElement;
  promptInput: HTMLTextAreaElement;
  currentImage: HTMLImageElement;
  currentAudio: HTMLDivElement;
  currentAnimation: HTMLDivElement;
  currentAnimationButton: HTMLButtonElement;
  currentPreview: HTMLDivElement;
  uploadButton: HTMLButtonElement;
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

const audioFormatOptions: Array<{ value: AiAudioFormat; label: string }> = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "ogg", label: "OGG" },
  { value: "opus", label: "Opus" },
  { value: "pcm", label: "PCM" }
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
    const isAudio = isAudioAsset(asset);
    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    elements.promptInput.value = activeVersion?.prompt ?? asset.prompt;
    elements.widthInput.value = String(asset.frameGrid?.frameWidth ?? asset.dimensions?.width ?? 1);
    elements.heightInput.value = String(asset.frameGrid?.frameHeight ?? asset.dimensions?.height ?? 1);
    elements.audioFormatSelect.value = asset.audioSettings?.format ?? "mp3";
    elements.audioDurationInput.value = String(asset.audioSettings?.durationSeconds ?? activeVersion?.durationSeconds ?? "");
    elements.audioLoopInput.checked = Boolean(asset.audioSettings?.loop);
    elements.formatSelect.value = effectiveGenerationFormat(
      manifest,
      formatDrafts,
      selectedAssetId,
      assetId
    );
    elements.formatField.hidden = !canEditGenerationFormat(manifest, selectedAssetId, assetId);
    elements.audioFormatField.hidden = !isAudio;
    elements.audioDurationField.hidden = !isAudio;
    elements.audioLoopField.hidden = !isAudio;
    elements.formatField.hidden = isAudio || elements.formatField.hidden;
    elements.dimensionGrid.hidden = isAudio;
    elements.frameCountInput.value = String(
      asset.frameGrid?.frameCount ??
      (asset.frameGrid ? asset.frameGrid.columns * asset.frameGrid.rows : 1)
    );
    elements.frameCountField.hidden = asset.kind === "image" || !asset.frameGrid;
    elements.versionLabel.textContent = `Active ${readableAssetName(assetId)}: ${asset.activeVersion}`;
    elements.currentImage.src = activeVersion?.file ?? "";
    renderAudioPlayer({
      container: elements.currentAudio,
      src: activeVersion?.file ?? "",
      label: readableAssetName(assetId),
      playback: activeVersion?.audioPlayback
    });
    elements.currentImage.alt = `${readableAssetName(assetId)} active version`;
    elements.currentPreview.setAttribute(
      "aria-label",
      `Preview active ${readableAssetName(assetId)} version`
    );
    elements.currentPreview.hidden = !activeVersion?.file;
    elements.currentAnimation.hidden = true;
    elements.currentAudio.hidden = !isAudio;
    elements.currentImage.hidden = isAudio;
    elements.currentAnimationButton.textContent = "Edit...";
    elements.currentPreview.classList.add("is-selected");
    elements.currentAnimationButton.hidden = !activeVersion?.file || (!asset.frameGrid && !isAudio);
    elements.options.innerHTML = "";
    elements.options.classList.remove("is-audio");
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

  elements.audioFormatSelect.addEventListener("change", () => {
    const asset = manifest.assets[selectedTargetAssetId];
    asset.audioSettings = {
      ...asset.audioSettings,
      format: normalizeAudioFormat(elements.audioFormatSelect.value)
    };
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
    if (isAudioAsset(asset)) {
      options.onPreview(selectedTargetAssetId, activeVersion.file, asset);
    } else {
      previewCurrentAsset({
        scene: options.scene,
        manifest,
        assetId: selectedTargetAssetId,
        src: activeVersion.file,
        onPreview: options.onPreview
      });
    }
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
        audioSettings: audioGenerationOverridesFromInputs(elements, manifest.assets[generationAssetId]),
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

  elements.uploadButton.addEventListener("click", async () => {
    const asset = manifest.assets[selectedTargetAssetId];

    try {
      const file = await pickUploadFile(isAudioAsset(asset) ? "audio/*" : "image/*");

      if (!file) return;

      const uploadedOption = await uploadedOptionFromFile({
        file,
        asset,
        elements,
        prompt: elements.promptInput.value
      });
      renderOptions({
        elements,
        generated: [uploadedOption],
        scene: options.scene,
        manifest,
        assetId: selectedTargetAssetId,
        designerOptions: options,
        onPreview: options.onPreview,
        onSelected(option) {
          selectedOption = option;
          elements.promoteButton.disabled = false;
        }
      });
      selectedOption = uploadedOption;
      elements.promoteButton.disabled = false;

      if (isAudioAsset(asset)) {
        options.onPreview(selectedTargetAssetId, uploadedOption.dataUrl, assetWithGeneratedGeometry(asset, uploadedOption));
      } else {
        previewOption({
          scene: options.scene,
          manifest,
          assetId: selectedTargetAssetId,
          option: uploadedOption,
          onPreview: options.onPreview
        });
      }
      setStatus(elements, `Uploaded ${file.name}. Promote to save it to code.`, "success");
    } catch (error) {
      setStatus(elements, `Upload failed. ${errorMessage(error)}`, "error");
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
        audioSettings: selectedOption.audioSettings,
        audioPlayback: selectedOption.audioPlayback,
        durationSeconds: selectedOption.durationSeconds,
        activate: true,
        notes: "Promoted from the AI asset designer."
      });

      manifest = await client.getManifest();
      options.onManifestUpdated?.(manifest);
      formatDrafts.delete(selectedTargetAssetId);
      syncTargetAsset(selectedTargetAssetId);
      if (isAudioAsset(manifest.assets[selectedTargetAssetId])) {
        const promotedAsset = manifest.assets[selectedTargetAssetId];
        const promotedVersion = promotedAsset.versions[promotedAsset.activeVersion];
        if (promotedVersion?.file) {
          (options.onAssetReady ?? options.onPreview)(
            selectedTargetAssetId,
            promotedVersion.file,
            promotedAsset
          );
        }
      }
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

    if (!activeVersion?.file) return;

    if (isAudioAsset(asset)) {
      void openAudioEditor({
        root: elements.root,
        asset,
        assetId: selectedTargetAssetId,
        src: editedCurrentOption?.dataUrl ?? activeVersion.file,
        initialPlayback: editedCurrentOption?.audioPlayback ?? activeVersion.audioPlayback,
        onConfirm: async (audioPlayback) => {
          const dataUrl = editedCurrentOption?.dataUrl ?? await imageSourceToDataUrl(activeVersion.file);
          const optionAsset = {
            ...asset,
            audioPlayback
          };

          editedCurrentOption = {
            index: -1,
            dataUrl,
            mimeType: mimeTypeFromDataUrl(dataUrl),
            prompt: activeVersion.prompt ?? asset.prompt,
            model: activeVersion.model,
            revisedPrompt: activeVersion.revisedPrompt,
            audioSettings: activeVersion.audioSettings ?? asset.audioSettings,
            audioPlayback,
            durationSeconds: activeVersion.durationSeconds
          };
          selectedOption = editedCurrentOption;
          elements.promoteButton.disabled = false;
          manifest.assets[selectedTargetAssetId] = {
            ...optionAsset,
            versions: {
              ...asset.versions,
              [asset.activeVersion]: {
                ...activeVersion,
                audioPlayback
              }
            }
          };
          options.onPreview(selectedTargetAssetId, dataUrl, optionAsset);
          renderAudioPlayer({
            container: elements.currentAudio,
            src: dataUrl,
            label: readableAssetName(selectedTargetAssetId),
            playback: audioPlayback
          });
          setStatus(elements, "Audio edits applied. Promote to save them to code.", "success");
        }
      });
      return;
    }

    if (!asset.frameGrid) return;

    void openAnimationEditor({
      root: elements.root,
      asset,
      assetId: selectedTargetAssetId,
      src: editedCurrentOption?.dataUrl ?? activeVersion.file,
      displaySize: resolvePreviewDisplaySize(options, selectedTargetAssetId, asset),
      initialAnimations: editedCurrentOption?.animations ?? asset.animations,
      onConfirm: async ({ animations, dataUrl: editedDataUrl }) => {
        const dataUrl = editedDataUrl ??
          editedCurrentOption?.dataUrl ??
          await imageSourceToDataUrl(activeVersion.file);
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
  const audioDurationInput = numericInput();
  audioDurationInput.step = "0.1";
  audioDurationInput.inputMode = "decimal";
  const audioLoopInput = document.createElement("input");
  audioLoopInput.type = "checkbox";
  const formatSelect = document.createElement("select");
  formatSelect.className = "ai-game-assets-designer__format-select";
  for (const format of assetFormatOptions) {
    const option = document.createElement("option");
    option.value = format.value;
    option.textContent = format.label;
    formatSelect.append(option);
  }
  const audioFormatSelect = document.createElement("select");
  audioFormatSelect.className = "ai-game-assets-designer__format-select";
  for (const format of audioFormatOptions) {
    const option = document.createElement("option");
    option.value = format.value;
    option.textContent = format.label;
    audioFormatSelect.append(option);
  }
  const dimensionGrid = document.createElement("div");
  dimensionGrid.className = "ai-game-assets-designer__dimensions";
  dimensionGrid.append(
    labelWrap("Width", widthInput),
    labelWrap("Height", heightInput)
  );
  const frameCountField = labelWrap("Frames", frameCountInput);
  const formatField = labelWrap("Format", formatSelect);
  const audioFormatField = labelWrap("Audio format", audioFormatSelect);
  const audioDurationField = labelWrap("Length (sec)", audioDurationInput);
  const audioLoopField = labelWrap("Loop", audioLoopInput);

  const currentPreview = document.createElement("div");
  currentPreview.className = "ai-game-assets-designer__current";
  currentPreview.setAttribute("role", "button");
  currentPreview.tabIndex = 0;
  const currentImage = document.createElement("img");
  currentImage.className = "ai-game-assets-designer__current-image";
  const currentAudio = document.createElement("div");
  currentAudio.className = "ai-game-assets-designer__current-audio";
  const currentAnimation = document.createElement("div");
  currentAnimation.className = "ai-game-assets-designer__animation-stage";
  currentAnimation.hidden = true;
  const currentAnimationButton = document.createElement("button");
  currentAnimationButton.type = "button";
  currentAnimationButton.className = "ai-game-assets-designer__animate-button";
  currentAnimationButton.textContent = "Animate";
  currentAnimationButton.hidden = true;
  currentPreview.append(currentImage, currentAudio, currentAnimation, currentAnimationButton);

  const regenerateButton = document.createElement("button");
  regenerateButton.type = "button";
  regenerateButton.textContent = "Regenerate";

  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.textContent = "Upload...";

  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.textContent = "Promote";
  promoteButton.disabled = true;

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.textContent = "Restart";

  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__actions";
  actions.append(regenerateButton, uploadButton, promoteButton, restartButton);

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
    audioFormatField,
    audioDurationField,
    audioLoopField,
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
    dimensionGrid,
    frameCountInput,
    frameCountField,
    formatSelect,
    formatField,
    audioFormatSelect,
    audioFormatField,
    audioDurationInput,
    audioDurationField,
    audioLoopInput,
    audioLoopField,
    promptInput,
    currentImage,
    currentAudio,
    currentAnimation,
    currentAnimationButton,
    currentPreview,
    uploadButton,
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
  const isAudio = isAudioAsset(asset);
  options.elements.options.classList.toggle("is-audio", isAudio);

  for (const option of options.generated) {
    const optionAsset = assetWithGeneratedGeometry(asset, option);
    const card = document.createElement("div");
    card.className = "ai-game-assets-designer__option";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "ai-game-assets-designer__option-select";

    const image = document.createElement("img");

    if (isAudio) {
      selectButton.textContent = `Select option ${option.index + 1}`;
      selectButton.classList.add("ai-game-assets-designer__option-select--audio");
    } else {
      image.src = option.dataUrl;
      image.alt = `${options.assetId} option ${option.index + 1}`;
      selectButton.append(image);
    }

    selectButton.addEventListener("click", () => {
      for (const item of options.elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
        item.classList.remove("is-selected");
      }

      options.elements.currentPreview.classList.remove("is-selected");
      card.classList.add("is-selected");
      if (isAudio) {
        options.onPreview(options.assetId, option.dataUrl, optionAsset);
      } else {
        previewOption({
          scene: options.scene,
          manifest: options.manifest,
          assetId: options.assetId,
          option,
          onPreview: options.onPreview
        });
      }
      options.onSelected(option);
      setStatus(options.elements, `Previewing option ${option.index + 1}.`, "info");
    });

    card.append(selectButton);
    if (isAudio) {
      const player = document.createElement("div");
      player.className = "ai-game-assets-designer__option-audio";
      renderAudioPlayer({
        container: player,
        src: option.dataUrl,
        label: `${readableAssetName(options.assetId)} option ${option.index + 1}`,
        playback: optionAsset.audioPlayback
      });
      card.append(player);
    }

    if (!isAudio && optionAsset.frameGrid) {
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
          ),
          applyFrameTransforms: false
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

async function uploadedOptionFromFile(options: {
  file: File;
  asset: AiAssetDefinition;
  elements: DesignerElements;
  prompt: string;
}): Promise<GeneratedDebugOption> {
  const dataUrl = await fileToDataUrl(options.file);
  const mimeType = mimeTypeFromDataUrl(dataUrl);
  const isAudio = isAudioAsset(options.asset);
  const audioSettings = isAudio
    ? {
        ...audioGenerationOverridesFromInputs(options.elements, options.asset),
        format: audioFormatFromMimeType(mimeType, options.file.name)
      }
    : undefined;

  if (isAudio) {
    return {
      index: 0,
      dataUrl,
      mimeType,
      prompt: options.prompt || options.asset.prompt,
      model: "uploaded",
      audioSettings,
      audioPlayback: options.asset.audioPlayback,
      durationSeconds: await audioDurationFromDataUrl(dataUrl)
    };
  }

  const imageSize = await imageSizeFromSource(dataUrl);
  const geometry = uploadedImageGeometry(options.asset, imageSize);

  return {
    index: 0,
    dataUrl,
    mimeType,
    prompt: options.prompt || options.asset.prompt,
    model: "uploaded",
    dimensions: geometry.dimensions,
    frameGrid: geometry.frameGrid,
    animations: options.asset.animations,
    settings: {
      ...options.asset.settings,
      format: normalizeAssetFormatFromMimeType(mimeType, options.file.name)
    }
  };
}

function uploadedImageGeometry(
  asset: AiAssetDefinition,
  imageSize: AiAssetPreviewDisplaySize
): {
  dimensions: NonNullable<GeneratedDebugOption["dimensions"]>;
  frameGrid?: GeneratedDebugOption["frameGrid"];
} {
  if (!asset.frameGrid) {
    return {
      dimensions: imageSize
    };
  }

  const frameGrid = {
    ...asset.frameGrid
  };

  return {
    dimensions: {
      width: frameGrid.frameWidth * frameGrid.columns,
      height: frameGrid.frameHeight * frameGrid.rows
    },
    frameGrid
  };
}

function pickUploadFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      resolve(input.files?.[0]);
    }, { once: true });
    input.click();
  });
}

function imageSizeFromSource(src: string): Promise<AiAssetPreviewDisplaySize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, image.naturalWidth),
      height: Math.max(1, image.naturalHeight)
    });
    image.onerror = () => reject(new Error("Could not load uploaded image."));
    image.src = src;
  });
}

async function replaceSpriteSheetFrames(options: {
  src: string;
  uploadSrc: string;
  frameGrid: NonNullable<AiAssetDefinition["frameGrid"]>;
  frames: number[];
}): Promise<string> {
  const [sheetImage, frameImage] = await Promise.all([
    loadImageElement(options.src),
    loadImageElement(options.uploadSrc)
  ]);
  const frameWidth = options.frameGrid.frameWidth;
  const frameHeight = options.frameGrid.frameHeight;
  const margin = options.frameGrid.margin ?? 0;
  const spacing = options.frameGrid.spacing ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = margin * 2 +
    (options.frameGrid.columns * frameWidth) +
    (Math.max(0, options.frameGrid.columns - 1) * spacing);
  canvas.height = margin * 2 +
    (options.frameGrid.rows * frameHeight) +
    (Math.max(0, options.frameGrid.rows - 1) * spacing);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas for frame upload.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sheetImage, 0, 0, canvas.width, canvas.height);

  for (const frame of options.frames) {
    const column = frame % options.frameGrid.columns;
    const row = Math.floor(frame / options.frameGrid.columns);
    const x = margin + (column * (frameWidth + spacing));
    const y = margin + (row * (frameHeight + spacing));
    context.clearRect(x, y, frameWidth, frameHeight);
    context.drawImage(frameImage, x, y, frameWidth, frameHeight);
  }

  return canvas.toDataURL("image/png");
}

async function spriteSheetFrameToDataUrl(options: {
  src: string;
  frameGrid: NonNullable<AiAssetDefinition["frameGrid"]>;
  frame: number;
}): Promise<string> {
  const sheetImage = await loadImageElement(options.src);
  const frameWidth = options.frameGrid.frameWidth;
  const frameHeight = options.frameGrid.frameHeight;
  const margin = options.frameGrid.margin ?? 0;
  const spacing = options.frameGrid.spacing ?? 0;
  const column = options.frame % options.frameGrid.columns;
  const row = Math.floor(options.frame / options.frameGrid.columns);
  const sourceX = margin + (column * (frameWidth + spacing));
  const sourceY = margin + (row * (frameHeight + spacing));
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas for frame touch-up.");
  }

  context.clearRect(0, 0, frameWidth, frameHeight);
  context.drawImage(
    sheetImage,
    sourceX,
    sourceY,
    frameWidth,
    frameHeight,
    0,
    0,
    frameWidth,
    frameHeight
  );

  return canvas.toDataURL("image/png");
}

function isSvgSource(src: string): boolean {
  return src.startsWith("data:image/svg+xml") || /\.svg(?:$|\?)/i.test(src);
}

type FrameTouchUpTool = "brush" | "eraser" | "picker" | "select" | "fill";

type FrameTouchUpSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function openFrameTouchUpEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  title: string;
  frameSrc: string;
  spriteSheetSrc: string;
  frameSlot: number;
  frame: number;
  displaySize: AiAssetPreviewDisplaySize;
  onSave(dataUrl: string): void | Promise<void>;
}): Promise<void> {
  const sourceImage = await loadImageElement(options.frameSrc);
  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__touchup";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Touch up ${options.title}`);

  const header = document.createElement("div");
  header.className = "ai-game-assets-designer__touchup-header";
  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__touchup-title";
  title.textContent = options.title;
  const dirtyLabel = document.createElement("span");
  dirtyLabel.className = "ai-game-assets-designer__touchup-dirty";
  dirtyLabel.hidden = true;
  dirtyLabel.textContent = "Unsaved changes";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ai-game-assets-designer__touchup-close";
  closeButton.setAttribute("aria-label", "Close touch-up editor");
  closeButton.textContent = "X";
  header.append(title, dirtyLabel, closeButton);

  const toolbar = document.createElement("div");
  toolbar.className = "ai-game-assets-designer__touchup-toolbar";

  const zoomOutButton = touchUpButton("Zoom -");
  const zoomInButton = touchUpButton("Zoom +");
  const brushButton = touchUpButton("Brush");
  const eraserButton = touchUpButton("Eraser");
  const pickerButton = touchUpButton("Picker");
  const selectButton = touchUpButton("Select");
  const fillButton = touchUpButton("Fill");
  const undoButton = touchUpButton("Undo");
  const redoButton = touchUpButton("Redo");
  const saveButton = touchUpButton("Save");
  saveButton.classList.add("is-primary");

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#f8fafc";
  colorInput.setAttribute("aria-label", "Brush color");
  const alphaInput = document.createElement("input");
  alphaInput.type = "number";
  alphaInput.min = "0";
  alphaInput.max = "255";
  alphaInput.step = "1";
  alphaInput.value = "255";
  alphaInput.setAttribute("aria-label", "Alpha");
  const rgbaLabel = document.createElement("label");
  rgbaLabel.className = "ai-game-assets-designer__touchup-color";
  const alphaLabel = document.createElement("span");
  alphaLabel.textContent = "A";
  rgbaLabel.append(colorInput, alphaLabel, alphaInput);

  toolbar.append(
    zoomOutButton,
    zoomInButton,
    rgbaLabel,
    pickerButton,
    brushButton,
    eraserButton,
    selectButton,
    fillButton,
    undoButton,
    redoButton,
    saveButton
  );

  const workspace = document.createElement("div");
  workspace.className = "ai-game-assets-designer__touchup-workspace";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "ai-game-assets-designer__touchup-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "ai-game-assets-designer__touchup-canvas";
  canvas.width = Math.max(1, sourceImage.naturalWidth);
  canvas.height = Math.max(1, sourceImage.naturalHeight);
  const selectionBox = document.createElement("div");
  selectionBox.className = "ai-game-assets-designer__touchup-selection";
  selectionBox.hidden = true;
  canvasWrap.append(canvas, selectionBox);

  const side = document.createElement("div");
  side.className = "ai-game-assets-designer__touchup-side";
  const stillPanel = document.createElement("div");
  stillPanel.className = "ai-game-assets-designer__touchup-panel";
  const stillTitle = document.createElement("div");
  stillTitle.textContent = "Frame";
  const stillPreview = document.createElement("canvas");
  stillPreview.width = canvas.width;
  stillPreview.height = canvas.height;
  stillPanel.append(stillTitle, stillPreview);

  const animationPanel = document.createElement("div");
  animationPanel.className = "ai-game-assets-designer__touchup-panel";
  const animationTitle = document.createElement("div");
  animationTitle.textContent = "Animation";
  const animationPreview = document.createElement("canvas");
  animationPreview.width = Math.max(1, Math.round(options.displaySize.width));
  animationPreview.height = Math.max(1, Math.round(options.displaySize.height));
  animationPanel.append(animationTitle, animationPreview);
  side.append(stillPanel, animationPanel);
  workspace.append(canvasWrap, side);
  dialog.append(header, toolbar, workspace);
  options.root.append(dialog);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const stillContext = stillPreview.getContext("2d");
  const animationContext = animationPreview.getContext("2d");

  if (!context || !stillContext || !animationContext) {
    dialog.remove();
    throw new Error("Could not create touch-up canvas.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

  let zoom = Math.max(1, Math.floor(Math.min(8, 480 / Math.max(canvas.width, canvas.height))));
  let tool: FrameTouchUpTool = "brush";
  let dirty = false;
  let drawing = false;
  let selectionStart: { x: number; y: number } | undefined;
  let selection: FrameTouchUpSelection | undefined;
  let animationTimeout: number | undefined;
  let animationCursor = 0;
  let disposed = false;
  const undoStack: ImageData[] = [];
  const redoStack: ImageData[] = [];

  const frameGrid = options.asset.frameGrid;
  const animation = options.asset.animations?.[0];
  const frames = animation?.frames ?? [options.frame];
  const frameRate = animation?.frameRate ?? 8;
  const frameTimings = animation?.frameTimings ?? [];
  const sheetImage = await loadImageElement(options.spriteSheetSrc);

  const selectedColor = (): [number, number, number, number] => {
    const hex = colorInput.value.replace("#", "");
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    const alpha = clamp(Math.round(Number(alphaInput.value)), 0, 255);

    return [red, green, blue, alpha];
  };

  const setDirty = (value: boolean) => {
    dirty = value;
    dirtyLabel.hidden = !dirty;
  };

  const updateZoom = () => {
    canvas.style.width = `${canvas.width * zoom}px`;
    canvas.style.height = `${canvas.height * zoom}px`;
    syncSelectionBox();
  };

  const updateToolButtons = () => {
    for (const button of [brushButton, eraserButton, pickerButton, selectButton, fillButton]) {
      button.classList.remove("is-active");
    }
    const activeButton = {
      brush: brushButton,
      eraser: eraserButton,
      picker: pickerButton,
      select: selectButton,
      fill: fillButton
    }[tool];
    activeButton.classList.add("is-active");
  };

  const updateUndoRedo = () => {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
  };

  const snapshot = () => context.getImageData(0, 0, canvas.width, canvas.height);
  const pushUndo = () => {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedo();
  };
  const restore = (imageData: ImageData) => {
    context.putImageData(imageData, 0, 0);
    selection = undefined;
    redrawEditor();
    setDirty(true);
  };

  const syncSelectionBox = () => {
    if (!selection) {
      selectionBox.hidden = true;
      return;
    }

    selectionBox.hidden = false;
    selectionBox.style.left = `${selection.x * zoom}px`;
    selectionBox.style.top = `${selection.y * zoom}px`;
    selectionBox.style.width = `${selection.width * zoom}px`;
    selectionBox.style.height = `${selection.height * zoom}px`;
  };

  const refreshPreviews = () => {
    stillContext.clearRect(0, 0, stillPreview.width, stillPreview.height);
    stillContext.imageSmoothingEnabled = false;
    stillContext.drawImage(canvas, 0, 0, stillPreview.width, stillPreview.height);
  };

  const redrawEditor = () => {
    refreshPreviews();
    syncSelectionBox();
  };

  const canvasPoint = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    const bounds = canvas.getBoundingClientRect();

    return {
      x: clamp(Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width), 0, canvas.width - 1),
      y: clamp(Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height), 0, canvas.height - 1)
    };
  };

  const paintAt = (point: { x: number; y: number }) => {
    const [red, green, blue, alpha] = tool === "eraser" ? [0, 0, 0, 0] : selectedColor();
    context.save();
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    context.beginPath();
    context.arc(point.x + 0.5, point.y + 0.5, Math.max(1, Math.round(canvas.width / 48)), 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const pickColorAt = (point: { x: number; y: number }) => {
    const data = context.getImageData(point.x, point.y, 1, 1).data;
    colorInput.value = `#${hexByte(data[0])}${hexByte(data[1])}${hexByte(data[2])}`;
    alphaInput.value = String(data[3]);
  };

  const fillAt = (point: { x: number; y: number }) => {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const replacement = selectedColor();
    const startIndex = ((point.y * canvas.width) + point.x) * 4;
    const target = [
      data[startIndex],
      data[startIndex + 1],
      data[startIndex + 2],
      data[startIndex + 3]
    ];

    if (target.every((value, index) => value === replacement[index])) return;

    const stack = [point];
    const visited = new Uint8Array(canvas.width * canvas.height);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      if (current.x < 0 || current.y < 0 || current.x >= canvas.width || current.y >= canvas.height) continue;
      const pixelIndex = (current.y * canvas.width) + current.x;
      if (visited[pixelIndex]) continue;
      visited[pixelIndex] = 1;
      const dataIndex = pixelIndex * 4;
      if (
        data[dataIndex] !== target[0] ||
        data[dataIndex + 1] !== target[1] ||
        data[dataIndex + 2] !== target[2] ||
        data[dataIndex + 3] !== target[3]
      ) {
        continue;
      }

      data[dataIndex] = replacement[0];
      data[dataIndex + 1] = replacement[1];
      data[dataIndex + 2] = replacement[2];
      data[dataIndex + 3] = replacement[3];
      stack.push(
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 }
      );
    }
    context.putImageData(imageData, 0, 0);
  };

  const moveSelection = (deltaX: number, deltaY: number) => {
    if (!selection) return;

    pushUndo();
    const nextX = clamp(selection.x + deltaX, 0, canvas.width - selection.width);
    const nextY = clamp(selection.y + deltaY, 0, canvas.height - selection.height);
    const imageData = context.getImageData(selection.x, selection.y, selection.width, selection.height);
    context.clearRect(selection.x, selection.y, selection.width, selection.height);
    context.putImageData(imageData, nextX, nextY);
    selection = { ...selection, x: nextX, y: nextY };
    setDirty(true);
    redrawEditor();
  };

  const deleteSelection = () => {
    if (!selection) return;

    pushUndo();
    context.clearRect(selection.x, selection.y, selection.width, selection.height);
    selection = undefined;
    setDirty(true);
    redrawEditor();
  };

  const drawAnimationFrame = () => {
    if (disposed || !frameGrid || !animation) return;

    const frameSlot = animationCursor % frames.length;
    const frame = frames[frameSlot] ?? 0;
    const timing = frameTimings[frameSlot];
    const column = frame % frameGrid.columns;
    const row = Math.floor(frame / frameGrid.columns);
    const sourceX = (frameGrid.margin ?? 0) + (column * (frameGrid.frameWidth + (frameGrid.spacing ?? 0)));
    const sourceY = (frameGrid.margin ?? 0) + (row * (frameGrid.frameHeight + (frameGrid.spacing ?? 0)));
    animationContext.clearRect(0, 0, animationPreview.width, animationPreview.height);
    animationContext.imageSmoothingEnabled = false;
    animationContext.save();
    animationContext.translate(animationPreview.width / 2, animationPreview.height / 2);
    animationContext.translate(timing?.offsetX ?? 0, timing?.offsetY ?? 0);
    animationContext.scale(timing?.scaleX ?? 1, timing?.scaleY ?? 1);
    animationContext.rotate(((timing?.rotation ?? 0) * Math.PI) / 180);

    if (frameSlot === options.frameSlot) {
      animationContext.drawImage(
        canvas,
        -options.displaySize.width / 2,
        -options.displaySize.height / 2,
        options.displaySize.width,
        options.displaySize.height
      );
    } else {
      animationContext.drawImage(
        sheetImage,
        sourceX,
        sourceY,
        frameGrid.frameWidth,
        frameGrid.frameHeight,
        -options.displaySize.width / 2,
        -options.displaySize.height / 2,
        options.displaySize.width,
        options.displaySize.height
      );
    }
    animationContext.restore();
    animationCursor += 1;
    animationTimeout = window.setTimeout(
      drawAnimationFrame,
      timing?.delayMs ?? 1000 / frameRate
    );
  };

  const close = () => {
    disposed = true;
    if (animationTimeout !== undefined) window.clearTimeout(animationTimeout);
    window.removeEventListener("keydown", keyHandler);
    dialog.remove();
  };

  const requestClose = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    close();
  };

  const keyHandler = (event: KeyboardEvent) => {
    if (!dialog.isConnected) return;
    if (event.key === "Escape") {
      requestClose();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(0, 1);
    }
  };

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(event);
    if (tool === "picker") {
      pickColorAt(point);
      return;
    }

    pushUndo();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);

    if (tool === "select") {
      selectionStart = point;
      selection = { x: point.x, y: point.y, width: 1, height: 1 };
      redrawEditor();
      return;
    }

    if (tool === "fill") {
      fillAt(point);
      drawing = false;
      setDirty(true);
      redrawEditor();
      return;
    }

    paintAt(point);
    setDirty(true);
    redrawEditor();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;

    const point = canvasPoint(event);
    if (tool === "select" && selectionStart) {
      const x = Math.min(selectionStart.x, point.x);
      const y = Math.min(selectionStart.y, point.y);
      selection = {
        x,
        y,
        width: Math.max(1, Math.abs(point.x - selectionStart.x) + 1),
        height: Math.max(1, Math.abs(point.y - selectionStart.y) + 1)
      };
      redrawEditor();
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      paintAt(point);
      setDirty(true);
      redrawEditor();
    }
  });

  const finishPointer = (event: PointerEvent) => {
    drawing = false;
    selectionStart = undefined;
    canvas.releasePointerCapture(event.pointerId);
    redrawEditor();
  };
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);

  closeButton.addEventListener("click", requestClose);
  zoomOutButton.addEventListener("click", () => {
    zoom = Math.max(1, zoom - 1);
    updateZoom();
  });
  zoomInButton.addEventListener("click", () => {
    zoom = Math.min(32, zoom + 1);
    updateZoom();
  });
  brushButton.addEventListener("click", () => {
    tool = "brush";
    updateToolButtons();
  });
  eraserButton.addEventListener("click", () => {
    tool = "eraser";
    updateToolButtons();
  });
  pickerButton.addEventListener("click", () => {
    tool = "picker";
    updateToolButtons();
  });
  selectButton.addEventListener("click", () => {
    tool = "select";
    updateToolButtons();
  });
  fillButton.addEventListener("click", () => {
    tool = "fill";
    updateToolButtons();
  });
  undoButton.addEventListener("click", () => {
    const previous = undoStack.pop();
    if (!previous) return;

    redoStack.push(snapshot());
    restore(previous);
    updateUndoRedo();
  });
  redoButton.addEventListener("click", () => {
    const next = redoStack.pop();
    if (!next) return;

    undoStack.push(snapshot());
    restore(next);
    updateUndoRedo();
  });
  saveButton.addEventListener("click", async () => {
    await options.onSave(canvas.toDataURL("image/png"));
    setDirty(false);
    close();
  });
  window.addEventListener("keydown", keyHandler);

  updateZoom();
  updateToolButtons();
  updateUndoRedo();
  refreshPreviews();
  drawAnimationFrame();
}

function touchUpButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;

  return button;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function audioDurationFromDataUrl(src: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
    }, { once: true });
    audio.addEventListener("error", () => resolve(undefined), { once: true });
    audio.src = src;
  });
}

function audioFormatFromMimeType(mimeType: string, fileName: string): AiAudioFormat {
  if (mimeType.includes("wav") || /\.wav$/i.test(fileName)) return "wav";
  if (mimeType.includes("ogg") || /\.ogg$/i.test(fileName)) return "ogg";
  if (mimeType.includes("opus") || /\.opus$/i.test(fileName)) return "opus";
  if (mimeType.includes("pcm") || /\.pcm$/i.test(fileName)) return "pcm";

  return "mp3";
}

function normalizeAssetFormatFromMimeType(mimeType: string, fileName: string): AiAssetFormat {
  if (mimeType.includes("svg") || /\.svg$/i.test(fileName)) return "svg";
  if (mimeType.includes("webp") || /\.webp$/i.test(fileName)) return "webp";
  if (mimeType.includes("jpeg") || /\.jpe?g$/i.test(fileName)) return "jpg";

  return "png";
}

function renderAudioPlayer(options: {
  container: HTMLDivElement;
  src: string;
  label: string;
  playback?: AiAudioPlaybackSettings;
}): void {
  resetAudioPlayerContainer(options.container);

  if (!options.src) {
    options.container.hidden = true;
    return;
  }

  options.container.hidden = false;
  const root = document.createElement("div");
  root.className = "ai-game-assets-designer__audio-player";
  root.addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("keydown", (event) => event.stopPropagation());

  const audio = document.createElement("audio");
  audio.src = options.src;
  audio.preload = "metadata";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "ai-game-assets-designer__audio-play";
  playButton.setAttribute("aria-label", `Play ${options.label}`);
  playButton.textContent = "Play";

  const timeLabel = document.createElement("span");
  timeLabel.className = "ai-game-assets-designer__audio-time";
  timeLabel.textContent = "0:00 / 0:00";
  const trimLabel = document.createElement("span");
  trimLabel.className = "ai-game-assets-designer__audio-trim";
  trimLabel.hidden = true;

  const canvas = document.createElement("canvas");
  canvas.className = "ai-game-assets-designer__audio-waveform";
  canvas.width = 420;
  canvas.height = 72;
  canvas.setAttribute("aria-label", `${options.label} waveform`);
  canvas.setAttribute("role", "img");

  const controls = document.createElement("div");
  controls.className = "ai-game-assets-designer__audio-controls";
  controls.append(playButton, timeLabel);

  root.append(controls, canvas, trimLabel, audio);
  options.container.append(root);

  const state = {
    peaks: undefined as AudioWaveformPeaks | undefined,
    frame: undefined as number | undefined,
    disposed: false,
    duration: 0,
    trimStart: 0,
    trimEnd: 0
  };

  const draw = () => {
    drawAudioEditorWaveform(canvas, {
      peaks: state.peaks,
      duration: state.duration,
      progress: state.duration > 0 ? audio.currentTime / state.duration : 0,
      trimStart: state.duration > 0 ? state.trimStart / state.duration : 0,
      trimEnd: state.duration > 0 ? state.trimEnd / state.duration : 1
    });
  };

  const sync = () => {
    playButton.textContent = audio.paused ? "Play" : "Pause";
    playButton.setAttribute(
      "aria-label",
      `${audio.paused ? "Play" : "Pause"} ${options.label}`
    );
    timeLabel.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(state.trimEnd || state.duration)}`;
    draw();
  };

  const tick = () => {
    if (state.disposed) return;
    if (!audio.paused && state.trimEnd > 0 && audio.currentTime >= state.trimEnd) {
      audio.currentTime = state.trimStart;
      if (!options.playback?.loop) {
        audio.pause();
      }
    }
    sync();

    if (!audio.paused) {
      state.frame = window.requestAnimationFrame(tick);
    }
  };

  playButton.addEventListener("click", async () => {
    if (audio.paused) {
      pauseSiblingAudioPlayers(options.container);
      audio.volume = clamp(options.playback?.volume ?? 1, 0, 1);
      audio.playbackRate = clamp(options.playback?.playbackRate ?? 1, 0.5, 2);
      if (
        state.trimEnd > 0 &&
        (audio.currentTime < state.trimStart || audio.currentTime >= state.trimEnd)
      ) {
        audio.currentTime = state.trimStart;
      }
      try {
        await audio.play();
      } catch {
        // Browsers can reject playback when user activation is unavailable.
      }
    } else {
      audio.pause();
    }
    tick();
  });

  canvas.addEventListener("click", (event) => {
    if (state.duration <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const progress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    audio.currentTime = seekableAudioTime(state, progress);
    sync();
  });

  audio.addEventListener("loadedmetadata", () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    state.trimStart = clamp(options.playback?.trimStartSeconds ?? 0, 0, state.duration);
    state.trimEnd = clamp(options.playback?.trimEndSeconds ?? state.duration, state.trimStart, state.duration);
    trimLabel.hidden = state.trimStart === 0 && state.trimEnd === state.duration;
    trimLabel.textContent = `Trim ${formatAudioTime(state.trimStart)} – ${formatAudioTime(state.trimEnd)}`;
    audio.currentTime = state.trimStart;
    sync();
  });
  audio.addEventListener("timeupdate", sync);
  audio.addEventListener("ended", sync);
  draw();
  void audioWaveformPeaks(options.src).then((peaks) => {
    if (state.disposed) return;

    state.peaks = peaks;
    draw();
  });
  audio.addEventListener("emptied", () => {
    state.disposed = true;
    if (state.frame !== undefined) {
      window.cancelAnimationFrame(state.frame);
    }
  });
}

type AudioWaveformPeaks = Array<{ min: number; max: number }>;

type AudioTrimState = {
  duration: number;
  trimStart: number;
  trimEnd: number;
};

function seekableAudioTime(state: AudioTrimState, progress: number): number {
  const start = clamp(state.trimStart, 0, state.duration);
  const end = clamp(state.trimEnd || state.duration, start, state.duration);

  return start + ((end - start) * clamp(progress, 0, 1));
}

function resetAudioPlayerContainer(container: HTMLDivElement): void {
  for (const audio of container.querySelectorAll("audio")) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  container.innerHTML = "";
}

function pauseSiblingAudioPlayers(container: HTMLElement): void {
  const root = container.closest(".ai-game-assets-designer");

  for (const audio of root?.querySelectorAll("audio") ?? []) {
    audio.pause();
  }
}

let sharedAudioContext: AudioContext | undefined;

async function audioWaveformPeaks(src: string, bucketCount = 96): Promise<AudioWaveformPeaks> {
  const response = await fetch(src);
  const bytes = await response.arrayBuffer();
  const context = sharedAudioContext ??= new AudioContext();
  const buffer = await context.decodeAudioData(bytes.slice(0));
  const channel = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / bucketCount));
  const peaks: AudioWaveformPeaks = [];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    let min = 0;
    let max = 0;

    for (let index = start; index < end; index += 1) {
      const sample = channel[index] ?? 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }

    peaks.push({ min, max });
  }

  return peaks;
}

function drawAudioWaveform(
  canvas: HTMLCanvasElement,
  peaks: AudioWaveformPeaks | undefined,
  progress: number
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(148, 163, 184, 0.26)";
  context.beginPath();
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.stroke();

  const resolvedPeaks = peaks ?? Array.from({ length: 48 }, () => ({ min: -0.06, max: 0.06 }));
  const barWidth = width / resolvedPeaks.length;
  const playheadX = clamp(progress, 0, 1) * width;

  for (const [index, peak] of resolvedPeaks.entries()) {
    const x = index * barWidth;
    const minY = centerY + (peak.min * centerY * 0.92);
    const maxY = centerY + (peak.max * centerY * 0.92);
    context.fillStyle = x <= playheadX ? "#7dd3fc" : "#64748b";
    context.fillRect(
      x + 1,
      Math.min(minY, maxY),
      Math.max(1, barWidth - 2),
      Math.max(2, Math.abs(maxY - minY))
    );
  }

  context.fillStyle = "#ffffff";
  context.fillRect(playheadX, 6, 2, height - 12);
}

function drawAudioEditorWaveform(
  canvas: HTMLCanvasElement,
  options: {
    peaks: AudioWaveformPeaks | undefined;
    duration: number;
    progress: number;
    trimStart: number;
    trimEnd: number;
  }
): void {
  drawAudioWaveform(canvas, options.peaks, options.progress);
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const startX = clamp(options.trimStart, 0, 1) * width;
  const endX = clamp(options.trimEnd, 0, 1) * width;

  context.fillStyle = "rgba(2, 6, 23, 0.68)";
  context.fillRect(0, 0, startX, height);
  context.fillRect(endX, 0, width - endX, height);
  context.strokeStyle = "#fbbf24";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(startX, 0);
  context.lineTo(startX, height);
  context.moveTo(endX, 0);
  context.lineTo(endX, height);
  context.stroke();
  context.fillStyle = "#fbbf24";
  context.fillRect(startX - 5, 0, 10, 18);
  context.fillRect(endX - 5, 0, 10, 18);
}

function progressForAudio(audio: HTMLAudioElement): number {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return 0;
  }

  return audio.currentTime / audio.duration;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatAudioTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function startSpritesheetPreview(options: {
  element: HTMLDivElement;
  src: string;
  asset: AiAssetDefinition;
  displaySize: AiAssetPreviewDisplaySize;
  applyFrameTransforms?: boolean;
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
    const applyFrameTransforms = options.applyFrameTransforms ?? true;
    const offsetX = applyFrameTransforms ? timing?.offsetX ?? 0 : 0;
    const offsetY = applyFrameTransforms ? timing?.offsetY ?? 0 : 0;
    const scaleX = applyFrameTransforms ? timing?.scaleX ?? 1 : 1;
    const scaleY = applyFrameTransforms ? timing?.scaleY ?? 1 : 1;
    const rotation = applyFrameTransforms ? timing?.rotation ?? 0 : 0;

    options.element.style.width = `${options.displaySize.width}px`;
    options.element.style.height = `${options.displaySize.height}px`;
    setFrameElementBackground(frameElement, {
      src: options.src,
      frame,
      frameGrid,
      displaySize: options.displaySize
    });
    frameElement.style.transform =
      `translate(${offsetX}px, ${offsetY}px) ` +
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

async function openAudioEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  src: string;
  initialPlayback?: AiAudioPlaybackSettings;
  onConfirm(playback: AiAudioPlaybackSettings): void | Promise<void>;
}): Promise<void> {
  const dialog = document.createElement("div");
  dialog.className = "ai-game-assets-designer__modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Edit ${readableAssetName(options.assetId)} sound`);

  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card";

  const title = document.createElement("div");
  title.className = "ai-game-assets-designer__modal-title";
  title.textContent = `Edit ${readableAssetName(options.assetId)}`;

  const audio = document.createElement("audio");
  audio.src = options.src;
  audio.preload = "auto";

  const stage = document.createElement("div");
  stage.className = "ai-game-assets-designer__audio-editor-stage";
  const canvas = document.createElement("canvas");
  canvas.className = "ai-game-assets-designer__audio-editor-waveform";
  canvas.width = 720;
  canvas.height = 160;
  stage.append(canvas);

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "ai-game-assets-designer__audio-editor-play";
  playButton.setAttribute("aria-label", "Play");
  playButton.textContent = "▶";
  const loopInput = document.createElement("input");
  loopInput.type = "checkbox";
  const timeLabel = document.createElement("span");
  timeLabel.className = "ai-game-assets-designer__audio-editor-time";
  timeLabel.textContent = "0:00 / 0:00";
  const loopField = inlineCheckboxField("Loop", loopInput);
  const transport = document.createElement("div");
  transport.className = "ai-game-assets-designer__audio-editor-transport";
  transport.append(playButton, loopField, timeLabel);

  const seekInput = rangeInput(0, 1, 0.001);
  seekInput.className = "ai-game-assets-designer__audio-editor-scrubber";
  stage.append(seekInput);
  const volumeInput = rangeInput(0, 1.5, 0.01);
  const speedInput = rangeInput(0.5, 2, 0.01);

  const fields = document.createElement("div");
  fields.className = "ai-game-assets-designer__audio-editor-fields";
  fields.append(
    labelWrap("Volume", volumeInput),
    labelWrap("Speed", speedInput)
  );

  const hint = document.createElement("div");
  hint.className = "ai-game-assets-designer__audio-editor-hint";
  hint.textContent = "Drag the start and end markers on the waveform to trim the playable region.";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Confirm";
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(cancelButton, confirmButton);

  card.append(title, stage, transport, fields, hint, actions, audio);
  dialog.append(card);
  options.root.append(dialog);

  const initial = options.initialPlayback ?? {};
  const hasInitialTrimStart = initial.trimStartSeconds !== undefined;
  const hasInitialTrimEnd = initial.trimEndSeconds !== undefined;
  let duration = Math.max(0, options.asset.audioSettings?.durationSeconds ?? 0);
  let trimStart = hasInitialTrimStart ? Math.max(0, initial.trimStartSeconds ?? 0) : 0;
  let trimEnd = hasInitialTrimEnd ? Math.max(trimStart, initial.trimEndSeconds ?? duration) : duration;
  let peaks: AudioWaveformPeaks | undefined;
  let dragTarget: "start" | "end" | "playhead" | undefined;
  let animationFrame: number | undefined;

  volumeInput.value = String(clamp(initial.volume ?? 1, 0, 1.5));
  speedInput.value = String(clamp(initial.playbackRate ?? 1, 0.5, 2));
  loopInput.checked = Boolean(initial.loop);

  const playback = (): AiAudioPlaybackSettings => ({
    volume: numberInput(volumeInput, 1),
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
    playbackRate: numberInput(speedInput, 1),
    loop: loopInput.checked || undefined
  });

  const syncAudioSettings = () => {
    audio.volume = clamp(numberInput(volumeInput, 1), 0, 1);
    audio.playbackRate = clamp(numberInput(speedInput, 1), 0.5, 2);
  };

  const seekTo = (value: number) => {
    audio.currentTime = clamp(value, trimStart, trimEnd || duration);
  };

  const draw = () => {
    drawAudioEditorWaveform(canvas, {
      peaks,
      duration,
      progress: duration > 0 ? audio.currentTime / duration : 0,
      trimStart: duration > 0 ? trimStart / duration : 0,
      trimEnd: duration > 0 ? trimEnd / duration : 1
    });
    timeLabel.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(duration)}`;
    seekInput.value = String(trimEnd > trimStart ? (audio.currentTime - trimStart) / (trimEnd - trimStart) : 0);
    playButton.textContent = audio.paused ? "▶" : "❚❚";
    playButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  };

  const tick = () => {
    if (!audio.paused && audio.currentTime >= trimEnd) {
      audio.currentTime = trimStart;
      if (!loopInput.checked) {
        audio.pause();
      }
    }
    draw();
    animationFrame = window.requestAnimationFrame(tick);
  };

  const stopTick = () => {
    if (animationFrame !== undefined) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
  };

  audio.addEventListener("loadedmetadata", () => {
    duration = Number.isFinite(audio.duration) ? audio.duration : duration;
    trimStart = hasInitialTrimStart ? clamp(trimStart, 0, duration) : 0;
    trimEnd = hasInitialTrimEnd ? clamp(trimEnd, trimStart, duration) : duration;
    seekInput.max = "1";
    seekTo(trimStart);
    draw();
  });
  audio.addEventListener("timeupdate", draw);
  for (const input of [volumeInput, speedInput]) {
    input.addEventListener("input", syncAudioSettings);
  }
  seekInput.addEventListener("input", () => {
    if (duration <= 0) return;
    seekTo(seekableAudioTime({ duration, trimStart, trimEnd }, Number(seekInput.value)));
    draw();
  });
  seekInput.addEventListener("change", () => {
    if (duration <= 0) return;
    seekTo(seekableAudioTime({ duration, trimStart, trimEnd }, Number(seekInput.value)));
    draw();
  });
  playButton.addEventListener("click", async () => {
    syncAudioSettings();
    if (audio.paused) {
      if (audio.currentTime < trimStart || audio.currentTime >= trimEnd || audio.currentTime === 0) {
        audio.currentTime = trimStart;
      }
      try {
        await audio.play();
      } catch {
        // Browser autoplay policy can reject playback if the click activation is lost.
      }
      tick();
    } else {
      audio.pause();
      draw();
    }
  });
  cancelButton.addEventListener("click", () => {
    audio.pause();
    stopTick();
    dialog.remove();
  });
  confirmButton.addEventListener("click", async () => {
    audio.pause();
    stopTick();
    await options.onConfirm(playback());
    dialog.remove();
  });

  const positionToSeconds = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (duration <= 0) return;

    const seconds = positionToSeconds(event.clientX);
    const startDistance = Math.abs(seconds - trimStart);
    const endDistance = Math.abs(seconds - trimEnd);
    dragTarget = startDistance < 0.12 || startDistance < endDistance ? "start" : "end";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragTarget || duration <= 0) return;

    const seconds = positionToSeconds(event.clientX);
    if (dragTarget === "start") {
      trimStart = clamp(seconds, 0, Math.max(0, trimEnd - 0.03));
      if (audio.currentTime < trimStart || audio.currentTime === 0) audio.currentTime = trimStart;
    } else {
      trimEnd = clamp(seconds, Math.min(duration, trimStart + 0.03), duration);
      if (audio.currentTime > trimEnd) audio.currentTime = trimEnd;
    }
    draw();
  });
  canvas.addEventListener("pointerup", (event) => {
    dragTarget = undefined;
    canvas.releasePointerCapture(event.pointerId);
  });

  syncAudioSettings();
  draw();
  void audioWaveformPeaks(options.src, 160).then((decodedPeaks) => {
    peaks = decodedPeaks;
    draw();
  });
}

async function openAnimationEditor(options: {
  root: HTMLElement;
  asset: AiAssetDefinition;
  assetId: string;
  src: string;
  displaySize: AiAssetPreviewDisplaySize;
  initialAnimations?: AiAssetAnimation[];
  onConfirm(result: { animations: AiAssetAnimation[]; dataUrl?: string }): void | Promise<void>;
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

  const uploadFrameButton = document.createElement("button");
  uploadFrameButton.type = "button";
  uploadFrameButton.textContent = "Upload frame...";

  const touchUpFrameButton = document.createElement("button");
  touchUpFrameButton.type = "button";
  touchUpFrameButton.textContent = "Touch up...";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.textContent = "Confirm";

  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(uploadFrameButton, touchUpFrameButton, cancelButton, confirmButton);

  card.append(title, stage, strip, fields, actions);
  dialog.append(card);
  options.root.append(dialog);

  let anchorFrameSlot = 0;
  const selectedFrameSlots = new Set<number>([0]);
  let stopPreview: (() => void) | undefined;
  let spriteSheetSrc = options.src;
  let editedSpriteSheetSrc: string | undefined;
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
      src: spriteSheetSrc,
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

    touchUpFrameButton.disabled = selectedFrameSlots.size !== 1 ||
      normalizeAssetFormat(options.asset.settings?.format) === "svg" ||
      isSvgSource(spriteSheetSrc);
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
          src: spriteSheetSrc,
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
        src: spriteSheetSrc,
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

  uploadFrameButton.addEventListener("click", async () => {
    if (selectedFrameSlots.size === 0) return;

    const file = await pickUploadFile("image/*");

    if (!file) return;

    spriteSheetSrc = await replaceSpriteSheetFrames({
      src: spriteSheetSrc,
      uploadSrc: await fileToDataUrl(file),
      frameGrid,
      frames: selectedFrameSlotsArray().map((frameSlot) => baseAnimation.frames[frameSlot] ?? 0)
    });
    editedSpriteSheetSrc = spriteSheetSrc;
    renderStrip();
    syncInputs();
    restartPreview();
  });

  touchUpFrameButton.addEventListener("click", async () => {
    if (touchUpFrameButton.disabled || selectedFrameSlots.size !== 1) return;

    const [frameSlot] = selectedFrameSlotsArray();
    const frame = baseAnimation.frames[frameSlot] ?? 0;
    const frameSrc = await spriteSheetFrameToDataUrl({
      src: spriteSheetSrc,
      frameGrid,
      frame
    });

    await openFrameTouchUpEditor({
      root: options.root,
      asset: previewAsset(),
      title: `${readableAssetName(options.assetId)} frame ${frameSlot + 1}`,
      frameSrc,
      spriteSheetSrc,
      frameSlot,
      frame,
      displaySize: options.displaySize,
      onSave: async (editedFrameSrc) => {
        spriteSheetSrc = await replaceSpriteSheetFrames({
          src: spriteSheetSrc,
          uploadSrc: editedFrameSrc,
          frameGrid,
          frames: [frame]
        });
        editedSpriteSheetSrc = spriteSheetSrc;
        renderStrip();
        syncInputs();
        restartPreview();
      }
    });
  });

  const close = () => {
    stopPreview?.();
    dialog.remove();
  };

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", async () => {
    await options.onConfirm({
      animations: [animationFromTimings()],
      dataUrl: editedSpriteSheetSrc
    });
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
      asset.frameGrid?.frameWidth ?? asset.dimensions?.width ?? 1
    ),
    height: positiveIntegerInput(
      elements.heightInput,
      asset.frameGrid?.frameHeight ?? asset.dimensions?.height ?? 1
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

function audioGenerationOverridesFromInputs(
  elements: DesignerElements,
  asset: AiAssetDefinition
): AiAudioGenerationSettings | undefined {
  if (!isAudioAsset(asset)) return undefined;

  return {
    ...asset.audioSettings,
    format: normalizeAudioFormat(elements.audioFormatSelect.value),
    durationSeconds: positiveNumberInput(
      elements.audioDurationInput,
      asset.audioSettings?.durationSeconds ?? (asset.kind === "music" ? 30 : 2)
    ),
    loop: elements.audioLoopInput.checked
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

function normalizeAudioFormat(format: string | undefined): AiAudioFormat {
  if (format === "wav" || format === "ogg" || format === "opus" || format === "pcm") {
    return format;
  }

  return "mp3";
}

function isAudioAsset(asset: AiAssetDefinition | undefined): boolean {
  return asset?.kind === "sound" || asset?.kind === "music";
}

function assetWithGeneratedGeometry(
  asset: AiAssetDefinition,
  option: GeneratedDebugOption
): AiAssetDefinition {
  return {
    ...asset,
    dimensions: option.dimensions ?? asset.dimensions,
    frameGrid: option.frameGrid ?? asset.frameGrid,
    animations: option.animations ?? asset.animations,
    audioPlayback: option.audioPlayback ?? asset.audioPlayback
  };
}

function positiveIntegerInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);

  if (!Number.isFinite(value)) return fallback;

  return Math.max(1, Math.floor(value));
}

function positiveNumberInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);

  if (!Number.isFinite(value) || value <= 0) return fallback;

  return value;
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

function rangeInput(min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);

  return input;
}

function inlineCheckboxField(label: string, checkbox: HTMLInputElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "ai-game-assets-designer__inline-checkbox";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(checkbox, text);

  return wrapper;
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
    width: asset.frameGrid?.frameWidth ?? asset.dimensions?.width ?? 128,
    height: asset.frameGrid?.frameHeight ?? asset.dimensions?.height ?? 128
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
        reject(new Error("Could not read uploaded file."));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read uploaded file."));
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
.ai-game-assets-designer__current-audio {
  width: 100%;
}
.ai-game-assets-designer__audio-player {
  width: 100%;
  display: grid;
  gap: 8px;
}
.ai-game-assets-designer__audio-player audio {
  display: none;
}
.ai-game-assets-designer__audio-controls {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
}
.ai-game-assets-designer__audio-play {
  min-width: 56px;
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ai-game-assets-designer__audio-time {
  color: #cbd5e1;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.ai-game-assets-designer__audio-trim {
  color: #fbbf24;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.ai-game-assets-designer__audio-waveform {
  width: 100%;
  height: 58px;
  border: 1px solid #2f3a49;
  border-radius: 6px;
  background: #111827;
  cursor: pointer;
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
.ai-game-assets-designer__options.is-audio {
  grid-template-columns: 1fr;
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
.ai-game-assets-designer__options.is-audio .ai-game-assets-designer__option {
  grid-template-columns: 120px 1fr;
  align-items: center;
  min-height: 112px;
}
.ai-game-assets-designer__option-select {
  width: 100%;
  min-height: 74px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #dbeafe;
  font: inherit;
}
.ai-game-assets-designer__option-select--audio {
  min-height: 72px;
  border: 1px solid #344155;
  border-radius: 6px;
  background: #172033;
  padding: 8px;
}
.ai-game-assets-designer__option-audio {
  width: 100%;
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
.ai-game-assets-designer__audio-editor-stage {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid #384251;
  border-radius: 6px;
  background: #0f1218;
}
.ai-game-assets-designer__audio-editor-waveform {
  width: 100%;
  height: 132px;
  border: 1px solid #2f3a49;
  border-radius: 6px;
  background: #111827;
  cursor: ew-resize;
}
.ai-game-assets-designer__audio-editor-scrubber {
  width: 100%;
  height: 18px;
  margin: 0;
  cursor: pointer;
}
.ai-game-assets-designer__audio-editor-transport {
  display: grid;
  grid-template-columns: auto minmax(88px, auto) 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.ai-game-assets-designer__audio-editor-transport .ai-game-assets-designer__field {
  margin: 0;
}
.ai-game-assets-designer__inline-checkbox {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.ai-game-assets-designer__inline-checkbox input {
  width: auto;
  margin: 0;
}
.ai-game-assets-designer__audio-editor-transport button {
  width: 36px;
  height: 32px;
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 0;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.ai-game-assets-designer__audio-editor-time {
  color: #cbd5e1;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.ai-game-assets-designer__audio-editor-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.ai-game-assets-designer__audio-editor-fields .ai-game-assets-designer__field {
  margin-bottom: 0;
}
.ai-game-assets-designer__audio-editor-fields input[type="range"] {
  width: 100%;
}
.ai-game-assets-designer__audio-editor-hint {
  margin-top: 10px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.35;
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
.ai-game-assets-designer__modal-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.ai-game-assets-designer__touchup {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 10px;
  padding: 14px;
  background: #0b0f16;
  color: #f5f7fb;
}
.ai-game-assets-designer__touchup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 34px;
}
.ai-game-assets-designer__touchup-title {
  font-weight: 700;
  font-size: 15px;
}
.ai-game-assets-designer__touchup-dirty {
  border: 1px solid #fbbf24;
  border-radius: 999px;
  color: #fde68a;
  padding: 3px 8px;
  font-size: 12px;
}
.ai-game-assets-designer__touchup-close {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.ai-game-assets-designer__touchup-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid #303949;
  border-radius: 8px;
  background: #141820;
}
.ai-game-assets-designer__touchup-toolbar button {
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #273142;
  color: #fff;
  padding: 7px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ai-game-assets-designer__touchup-toolbar button.is-active {
  border-color: #6ed3ff;
  background: #17425a;
}
.ai-game-assets-designer__touchup-toolbar button.is-primary {
  border-color: #86efac;
  background: #14532d;
}
.ai-game-assets-designer__touchup-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.ai-game-assets-designer__touchup-color {
  display: grid;
  grid-template-columns: 38px auto 58px;
  align-items: center;
  gap: 6px;
  color: #cbd5e1;
  font-size: 12px;
}
.ai-game-assets-designer__touchup-color input[type="color"] {
  width: 38px;
  height: 30px;
  border: 1px solid #58657a;
  border-radius: 6px;
  background: #101319;
  padding: 2px;
}
.ai-game-assets-designer__touchup-color input[type="number"] {
  width: 58px;
  border: 1px solid #3a4352;
  border-radius: 6px;
  background: #101319;
  color: #f5f7fb;
  padding: 6px;
  font: inherit;
  font-size: 12px;
}
.ai-game-assets-designer__touchup-workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 12px;
}
.ai-game-assets-designer__touchup-canvas-wrap {
  position: relative;
  min-height: 0;
  overflow: auto;
  border: 1px solid #303949;
  border-radius: 8px;
  background-color: #111827;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}
.ai-game-assets-designer__touchup-canvas {
  display: block;
  margin: 24px;
  image-rendering: pixelated;
  cursor: crosshair;
}
.ai-game-assets-designer__touchup-selection {
  position: absolute;
  pointer-events: none;
  border: 1px dashed #f8fafc;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.9);
  transform: translate(24px, 24px);
}
.ai-game-assets-designer__touchup-side {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 10px;
}
.ai-game-assets-designer__touchup-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #303949;
  border-radius: 8px;
  background: #141820;
  color: #cbd5e1;
  font-size: 12px;
}
.ai-game-assets-designer__touchup-panel canvas {
  width: 100%;
  max-height: 160px;
  object-fit: contain;
  border: 1px solid #263243;
  border-radius: 6px;
  background: #0f1218;
  image-rendering: pixelated;
}
@media (max-width: 760px) {
  .ai-game-assets-designer__touchup-workspace {
    grid-template-columns: 1fr;
  }
  .ai-game-assets-designer__touchup-side {
    grid-template-columns: 1fr 1fr;
  }
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
