import type {
  AiAssetAnimation,
  AiAssetAnimationFrameTiming,
  AiAssetDefinition,
  AiAudioFormat,
  AiAudioGenerationSettings,
  AiAudioPlaybackSettings,
  AiVoiceGenerationSettings,
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

import {
  assetWithGeneratedGeometry,
  audioGenerationOverridesFromInputs,
  bindKeyboardCapture,
  canEditGenerationFormat,
  createDesignerElements,
  effectiveGenerationFormat,
  ensureDesignerStyles,
  errorMessage,
  generationOverridesFromInputs,
  hasStyleGuide,
  imageSourceToDataUrl,
  isAbortError,
  isAudioAsset,
  isSvgSource,
  isVoiceAsset,
  mimeTypeFromDataUrl,
  normalizeAssetFormat,
  normalizeAudioFormat,
  openAnimationEditor,
  openAssetVersionsDialog,
  openAudioEditor,
  openFrameTouchUpEditor,
  openStyleGuideEditor,
  pickUploadFile,
  previewCurrentAsset,
  previewImageSource,
  previewOption,
  readableAssetName,
  renderAssetFolderBrowser,
  renderAudioPlayer,
  renderOptions,
  resolvePreviewDisplaySize,
  setStatus,
  stopStatusAnimation,
  styleGuideDraftFromManifest,
  styleGuideRequest,
  uploadedOptionFromFile,
  voiceGenerationOverridesFromInputs
} from "./designer-support.js";

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
  let previewedVersionName: string | undefined;
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

  let elements;
  try {
    elements = createDesignerElements(options, manifest, selectedAssetId);
  } catch (error) {
    console.error("AI asset designer failed to create UI elements.", error);
    throw error;
  }
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
    const isVoice = asset.kind === "voice";
    elements.animationSelect.innerHTML = "";

    if (asset.kind !== "collection") {
      const baseOption = document.createElement("option");
      baseOption.value = assetId;
      baseOption.textContent = isVoice ? "Base voice" : "Base image";
      elements.animationSelect.append(baseOption);
    }

    for (const [key, linkedAnimation] of linkedAnimations) {
      const option = document.createElement("option");
      option.value = linkedAnimation.assetId;
      option.textContent = linkedAnimation.label || readableAssetName(key);
      elements.animationSelect.append(option);
    }

    elements.animationField.hidden = linkedAnimations.length === 0;
    elements.animationField.firstElementChild!.textContent = isVoice ? "Line" : "Animation";
    selectedTargetAssetId = asset.kind === "collection" && linkedAnimations[0]
      ? linkedAnimations[0][1].assetId
      : assetId;
    elements.animationSelect.value = selectedTargetAssetId;
  };

  const syncTargetAsset = (assetId: string) => {
    const asset = manifest.assets[assetId];
    const activeVersion = asset.versions[asset.activeVersion];
    const isAudio = isAudioAsset(asset);
    const isVoice = isVoiceAsset(asset);
    const isVoiceLine = asset.kind === "voice-line";
    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    elements.promptInput.value = activeVersion?.prompt ?? asset.prompt;
    elements.widthInput.value = String(asset.frameGrid?.frameWidth ?? asset.dimensions?.width ?? 1);
    elements.heightInput.value = String(asset.frameGrid?.frameHeight ?? asset.dimensions?.height ?? 1);
    elements.audioFormatSelect.value = asset.audioSettings?.format ?? "mp3";
    elements.audioDurationInput.value = String(asset.audioSettings?.durationSeconds ?? activeVersion?.durationSeconds ?? "");
    elements.audioLoopInput.checked = Boolean(asset.audioSettings?.loop);
    elements.voiceTextInput.value =
      activeVersion?.voiceSettings?.text ??
      activeVersion?.voiceSettings?.previewText ??
      asset.voiceSettings?.text ??
      asset.voiceSettings?.previewText ??
      "";
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
    elements.voiceTextField.hidden = !isVoice;
    elements.voiceTextField.firstChild!.textContent = isVoiceLine ? "Text to say" : "Demo sentence";
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
    elements.currentTouchUpButton.hidden = !activeVersion?.file ||
      isAudio ||
      Boolean(asset.frameGrid) ||
      normalizeAssetFormat(asset.settings?.format) === "svg" ||
      isSvgSource(activeVersion?.file ?? "");
    elements.options.innerHTML = "";
    elements.options.classList.remove("is-audio");
    setStatus(elements, "", "idle");
    elements.promoteButton.disabled = true;
    elements.versionsButton.disabled = Object.keys(asset.versions).length <= 1;
    selectedOption = undefined;
    editedCurrentOption = undefined;
    previewedVersionName = undefined;
  };

  const syncAsset = (assetId: string) => {
    syncAnimationChoices(assetId);
    syncTargetAsset(selectedTargetAssetId);
    renderAssetBrowser();
  };

  const renderAssetBrowser = () => {
    renderAssetFolderBrowser({
      container: elements.assetBrowser,
      manifest,
      selectedAssetId,
      assetIds: options.assetIds,
      onSelect(assetId) {
        selectedAssetId = assetId;
        syncAsset(selectedAssetId);
      }
    });
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
    if (previewedVersionName) {
      editedCurrentOption = undefined;
      previewedVersionName = undefined;
    }
    selectedOption = editedCurrentOption;
    elements.promoteButton.disabled = !selectedOption;
    if (isAudioAsset(asset)) {
      renderAudioPlayer({
        container: elements.currentAudio,
        src: activeVersion.file,
        label: readableAssetName(selectedTargetAssetId),
        playback: activeVersion.audioPlayback
      });
      options.onPreview(selectedTargetAssetId, activeVersion.file, asset);
    } else {
      elements.currentImage.src = activeVersion.file;
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

  elements.currentPreview.addEventListener("keydown", (event: KeyboardEvent) => {
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
    elements.options.innerHTML = "";
    selectedOption = undefined;
    editedCurrentOption = undefined;
    previewedVersionName = undefined;
    const streamedOptions: GeneratedDebugOption[] = [];

    try {
      const generationRequest = {
        assetId: generationAssetId,
        prompt: elements.promptInput.value,
        count: options.optionCount ?? 3,
        format: generationFormat,
        audioSettings: audioGenerationOverridesFromInputs(elements, manifest.assets[generationAssetId]),
        voiceSettings: voiceGenerationOverridesFromInputs(elements, manifest.assets[generationAssetId]),
        styleGuide: await styleGuideRequest(styleGuideDraft),
        ...generationOverridesFromInputs(
          elements,
          manifest.assets[generationAssetId],
          generationFormat
        )
      };
      await client.generateStream(generationRequest, (option) => {
        if (activeGeneration?.id !== currentGenerationId) return;

        streamedOptions.push(option);
        renderOptions({
          elements,
          generated: [...streamedOptions].sort((left, right) => left.index - right.index),
          scene: options.scene,
          manifest,
          assetId: generationAssetId,
          designerOptions: options,
          onPreview: options.onPreview,
          onSelected(selected) {
            selectedOption = selected;
            previewedVersionName = undefined;
            elements.promoteButton.disabled = false;
          }
        });
      }, {
        signal: controller.signal
      });

      if (activeGeneration?.id !== currentGenerationId) {
        return;
      }

      finishGeneration(currentGenerationId);
      setStatus(
        elements,
        streamedOptions.length > 0 ? "Pick an option to preview it." : "Generation finished with no options.",
        streamedOptions.length > 0 ? "info" : "error"
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      finishGeneration(currentGenerationId);
      if (streamedOptions.length === 0) {
        elements.options.innerHTML = "";
      }
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
          previewedVersionName = undefined;
          elements.promoteButton.disabled = false;
        }
      });
      selectedOption = uploadedOption;
      previewedVersionName = undefined;
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
        voiceSettings: selectedOption.voiceSettings,
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

  elements.versionsButton.addEventListener("click", () => {
    const asset = manifest.assets[selectedTargetAssetId];

    void openAssetVersionsDialog({
      root: elements.root,
      asset,
      assetId: selectedTargetAssetId,
      async onSelect(versionName, option) {
        const optionAsset = assetWithGeneratedGeometry(asset, option);

        for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
          item.classList.remove("is-selected");
        }

        selectedOption = option;
        editedCurrentOption = option;
        previewedVersionName = versionName;
        elements.currentPreview.classList.add("is-selected");
        elements.promoteButton.disabled = false;

        if (isAudioAsset(asset)) {
          renderAudioPlayer({
            container: elements.currentAudio,
            src: option.dataUrl,
            label: readableAssetName(selectedTargetAssetId),
            playback: option.audioPlayback
          });
          options.onPreview(selectedTargetAssetId, option.dataUrl, optionAsset);
        } else {
          elements.currentImage.src = option.dataUrl;
          previewImageSource({
            scene: options.scene,
            manifest,
            assetId: selectedTargetAssetId,
            src: option.dataUrl,
            textureKey: `ai-version-preview:${selectedTargetAssetId}:${versionName}:${Date.now()}`,
            assetOverride: optionAsset,
            onPreview: options.onPreview
          });
        }

        setStatus(elements, `Previewing ${versionName}. Promote to make it current.`, "info");
      },
      async onDelete(versionName) {
        try {
          manifest = await client.deleteVersion({
            assetId: selectedTargetAssetId,
            versionName
          });
          options.onManifestUpdated?.(manifest);

          if (previewedVersionName === versionName) {
            syncTargetAsset(selectedTargetAssetId);
          } else {
            elements.versionsButton.disabled =
              Object.keys(manifest.assets[selectedTargetAssetId].versions).length <= 1;
          }

          setStatus(elements, `Deleted ${versionName}.`, "success");
        } catch (error) {
          setStatus(elements, `Delete failed. ${errorMessage(error)}`, "error");
          throw error;
        }
      }
    });
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

  elements.currentAnimationButton.addEventListener("click", (event: MouseEvent) => {
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
            voiceSettings: activeVersion.voiceSettings ?? asset.voiceSettings,
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

  elements.currentTouchUpButton.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
    const asset = manifest.assets[selectedTargetAssetId];
    const activeVersion = asset.versions[asset.activeVersion];

    if (
      !activeVersion?.file ||
      isAudioAsset(asset) ||
      asset.frameGrid ||
      normalizeAssetFormat(asset.settings?.format) === "svg" ||
      isSvgSource(activeVersion.file)
    ) {
      return;
    }

    void openFrameTouchUpEditor({
      root: elements.root,
      asset,
      title: readableAssetName(selectedTargetAssetId),
      frameSrc: editedCurrentOption?.dataUrl ?? activeVersion.file,
      displaySize: resolvePreviewDisplaySize(options, selectedTargetAssetId, asset),
      onSave: async (dataUrl) => {
        const optionAsset = {
          ...asset,
          dimensions: asset.dimensions
        };

        editedCurrentOption = {
          index: -1,
          dataUrl,
          mimeType: mimeTypeFromDataUrl(dataUrl),
          prompt: activeVersion.prompt ?? asset.prompt,
          model: activeVersion.model,
          revisedPrompt: activeVersion.revisedPrompt,
          dimensions: asset.dimensions
        };
        selectedOption = editedCurrentOption;
        elements.currentImage.src = dataUrl;
        elements.currentPreview.classList.add("is-selected");
        elements.promoteButton.disabled = false;
        previewImageSource({
          scene: options.scene,
          manifest,
          assetId: selectedTargetAssetId,
          src: dataUrl,
          textureKey: `ai-current-touchup:${selectedTargetAssetId}:${Date.now()}`,
          assetOverride: optionAsset,
          onPreview: options.onPreview
        });
        setStatus(elements, "Image touch-up applied. Promote to save it to code.", "success");
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
