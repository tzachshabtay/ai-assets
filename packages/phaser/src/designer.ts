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
  AiAssetManifest,
  AiTilesetAnimation
} from "@ai-game-assets/core";
import {
  expandAiAssetIds,
  linkedAnimationAssetIds,
  registerInGameDesignerPanel,
  resolveTargetAssetId,
  topLevelAiAssetIds
} from "@ai-game-assets/core";
import {
  AiAssetDebugClient,
  type DebugStyleGuideDraft,
  type GeneratedDebugOption,
  type GeneratedTilesetAnimationCandidate
} from "./debug-client.js";
import {
  ensureMissingAiAssetFirstDrafts,
  type EnsureMissingAiAssetFirstDraftsProgress
} from "./first-drafts.js";
import {
  createLocalDerivedOption,
  openDeriveDialog,
  referenceImageForCandidate,
  type DeriveCandidate
} from "./derive-dialog.js";
import {
  createMixedTilesetOption,
  isDesignerTilesetAsset,
  openTilesetBaseMixerDialog,
  openTilesetAnimationMixerDialog,
  openTilesetEditor,
  tilesetAnimationForKey,
  resolveTilesetBaseMixCurrent,
  tilesetMetadataForAsset,
  tilesetTileGenerationOverride,
  type TilesetTileGenerationOverride
} from "./tileset-dialog.js";
import { aiTilesetAnimationTextureKey } from "./keys.js";

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
  showLinkedAnimationAssets?: boolean;
  title?: string;
  optionCount?: number;
  targetId?: string;
  mount?: HTMLElement;
  restartOnPromote?: boolean;
  previewDisplaySize?:
    | Record<string, AiAssetPreviewDisplaySize>
    | ((assetId: string, asset: AiAssetDefinition) => AiAssetPreviewDisplaySize | undefined);
  onPreview(assetId: string, textureKey: string, asset: AiAssetDefinition): void;
  onTilesetAnimationPreview?(
    assetId: string,
    animationKey: string,
    textureKeys: string[],
    asset: AiAssetDefinition
  ): void;
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
  installPromotedImageTexture,
  isAbortError,
  isAudioAsset,
  isSvgSource,
  isVoiceAsset,
  loadImageElement,
  mimeTypeFromDataUrl,
  normalizeAssetFormat,
  normalizeAudioFormat,
  openAnimationEditor,
  openAssetVersionsDialog,
  openAudioEditor,
  openFrameTouchUpEditor,
  openStyleGuideEditor,
  pickUploadFile,
  positiveIntegerInput,
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
  const resolveAssetUrl = (file: string) => client.assetUrl(file);
  let manifest = options.manifest;
  const visibleAssetIds = () => visibleDesignerAssetIds(manifest, options);
  let selectedAssetId = visibleAssetIds()[0] ?? Object.keys(manifest.assets)[0];
  let selectedTargetId = options.targetId;
  let selectedTargetAssetId = selectedAssetId;
  let selectedTilesetAnimationKey: string | undefined;
  let selectedOption: GeneratedDebugOption | undefined;
  let displayedOptions:
    | { assetId: string; generated: GeneratedDebugOption[] }
    | undefined;
  let stopCurrentAnimationPreview: (() => void) | undefined;
  let editedCurrentOption: GeneratedDebugOption | undefined;
  let previewedVersionName: string | undefined;
  const pendingOptions = new Map<string, {
    option: GeneratedDebugOption;
    inheritAnimations: boolean;
    previewedVersionName?: string;
    tilesetAnimations?: Record<string, string[]>;
    animationOnlyKey?: string;
  }>();
  let styleGuideDraft = styleGuideDraftFromManifest(manifest, resolveAssetUrl);
  const formatDrafts = new Map<string, AiAssetFormat>();
  const tilesetPromptDrafts = new Map<string, string[]>();
  const tilesetAnimationPromptDrafts = new Map<string, string[]>();
  let displayedTilesetAnimationOptions:
    | {
        assetId: string;
        animationKey: string;
        animation: AiTilesetAnimation;
        generated: GeneratedTilesetAnimationCandidate[];
      }
    | undefined;
  let stopTilesetAnimationOptionPreviews: (() => void) | undefined;
  let activeGeneration:
    | {
        controller: AbortController;
        id: number;
      }
    | undefined;
  let generationId = 0;
  let panelRevision = 0;
  let promotionId = 0;
  let activePromotionId: number | undefined;
  let mixingTileset = false;

  const regenerateTilesetTile = async (
    assetId: string,
    tile: number,
    tileset: TilesetTileGenerationOverride,
    currentTileSrc: string
  ): Promise<GeneratedDebugOption[]> => {
    const guide = await styleGuideRequest(styleGuideDraft);
    return client.generate({
      assetId,
      count: 3,
      format: effectiveGenerationFormat(
        manifest,
        formatDrafts,
        selectedAssetId,
        assetId
      ),
      tileset,
      styleGuide: {
        ...guide,
        images: [
          ...guide.images,
          {
            name: `${assetId}-current-tile-${tile + 1}-style.png`,
            dataUrl: currentTileSrc
          }
        ]
      }
    });
  };

  if (!selectedAssetId) {
    throw new Error("AI asset designer requires at least one asset.");
  }

  let elements;
  try {
    elements = createDesignerElements({
      ...options,
      assetIds: visibleAssetIds()
    }, manifest, selectedAssetId);
  } catch (error) {
    console.error("AI asset designer failed to create UI elements.", error);
    throw error;
  }
  const mount = options.mount ?? document.body;
  mount.append(elements.root);
  bindKeyboardCapture(elements.root, options.scene);

  const syncPromoteAllButton = () => {
    elements.promoteAllButton.disabled =
      pendingOptions.size === 0 ||
      Boolean(activeGeneration) ||
      activePromotionId !== undefined;
  };
  const rememberPendingOption = (
    assetId: string,
    option: GeneratedDebugOption,
    pending: {
      inheritAnimations?: boolean;
      previewedVersionName?: string;
      tilesetAnimations?: Record<string, string[]>;
      animationOnlyKey?: string;
    } = {}
  ) => {
    pendingOptions.set(assetId, {
      option,
      inheritAnimations: Boolean(pending.inheritAnimations),
      previewedVersionName: pending.previewedVersionName,
      tilesetAnimations: pending.tilesetAnimations,
      animationOnlyKey: pending.animationOnlyKey
    });
    syncPromoteAllButton();
  };
  const forgetPendingOption = (assetId: string) => {
    pendingOptions.delete(assetId);
    syncPromoteAllButton();
  };
  const installTilesetAnimationFrameTextures = async (
    frames: string[],
    asset: AiAssetDefinition,
    textureKeyForFrame: (index: number) => string
  ) => {
    const tileset = tilesetMetadataForAsset(asset);
    if (!tileset || !options.scene.textures.addSpriteSheet) return [];

    const images = await Promise.all(frames.map((frame) => loadImageElement(frame)));
    const textureKeys = images.map((image, index) => {
      const textureKey = textureKeyForFrame(index);
      if (options.scene.textures.exists(textureKey)) {
        options.scene.textures.remove(textureKey);
      }
      options.scene.textures.addSpriteSheet?.(textureKey, image, {
        frameWidth: tileset.tileWidth,
        frameHeight: tileset.tileHeight,
        margin: tileset.margin,
        spacing: tileset.spacing
      });
      return textureKey;
    });
    return textureKeys;
  };
  const previewTilesetAnimationFrames = async (
    assetId: string,
    animationKey: string,
    frames: string[],
    asset: AiAssetDefinition
  ) => {
    const previewId = Date.now();
    const textureKeys = await installTilesetAnimationFrameTextures(
      frames,
      asset,
      (index) =>
        `ai-preview:${assetId}:tileset:${encodeURIComponent(animationKey)}:${index}:${previewId}`
    );
    options.onTilesetAnimationPreview?.(assetId, animationKey, textureKeys, asset);
  };

  const applyOpenState = (isOpen: boolean) => {
    elements.root.dataset.open = String(isOpen);
    elements.toggle.setAttribute("aria-expanded", String(isOpen));
  };
  const dockPanel = registerInGameDesignerPanel({
    id: "ai-game-assets.assets",
    label: "Assets",
    panel: elements.panel,
    dragHandle: elements.title,
    button: elements.toggle,
    order: 10,
    ariaLabel: "Toggle AI asset designer",
    onOpenChange: applyOpenState
  });
  const setOpen = (isOpen: boolean) => {
    if (isOpen) {
      dockPanel.open();
    } else {
      dockPanel.close();
    }
  };

  const syncAnimationChoices = (assetId: string) => {
    const resolvedAssetId = resolveTargetAssetId(manifest, assetId, selectedTargetId);
    const resolvedAsset = manifest.assets[resolvedAssetId] ?? manifest.assets[assetId];
    const asset = manifest.assets[assetId];
    const linkedAnimations = Object.entries(asset.linkedAnimationAssets ?? {});
    const isVoice = asset.kind === "voice";
    elements.animationSelect.innerHTML = "";

    if (isDesignerTilesetAsset(resolvedAsset)) {
      const baseOption = document.createElement("option");
      baseOption.value = "tileset:base";
      baseOption.textContent = "Base tileset";
      elements.animationSelect.append(baseOption);

      for (const animation of tilesetMetadataForAsset(resolvedAsset)?.animations ?? []) {
        const option = document.createElement("option");
        option.value = `tileset:animation:${encodeURIComponent(animation.key)}`;
        option.textContent = readableAssetName(animation.key);
        elements.animationSelect.append(option);
      }

      selectedTargetAssetId = resolvedAssetId;
      selectedTilesetAnimationKey = undefined;
      elements.animationField.hidden = false;
      elements.animationField.firstElementChild!.textContent = "Tileset view";
      elements.animationSelect.value = "tileset:base";
      return;
    }

    selectedTilesetAnimationKey = undefined;

    if (asset.kind !== "collection") {
      const baseOption = document.createElement("option");
      baseOption.value = resolveTargetAssetId(manifest, assetId, selectedTargetId);
      baseOption.textContent = isVoice ? "Base voice" : "Base image";
      elements.animationSelect.append(baseOption);
    }

    for (const [key, linkedAnimation] of linkedAnimations) {
      const option = document.createElement("option");
      option.value = resolveTargetAssetId(manifest, linkedAnimation.assetId, selectedTargetId);
      option.textContent = linkedAnimation.label || readableAssetName(key);
      elements.animationSelect.append(option);
    }

    elements.animationField.hidden = linkedAnimations.length === 0;
    elements.animationField.firstElementChild!.textContent = isVoice ? "Line" : "Animation";
    selectedTargetAssetId = asset.kind === "collection" && linkedAnimations[0]
      ? resolveTargetAssetId(manifest, linkedAnimations[0][1].assetId, selectedTargetId)
      : resolveTargetAssetId(manifest, assetId, selectedTargetId);
    elements.animationSelect.value = selectedTargetAssetId;
  };

  const effectiveTilesetTileCount = (asset: AiAssetDefinition): number => {
    const tileset = tilesetMetadataForAsset(asset);
    if (!tileset) return 0;
    const capacity = tileset.columns * tileset.rows;
    return positiveIntegerInput(
      elements.frameCountInput,
      Math.min(tileset.tileCount ?? capacity, capacity)
    );
  };

  const tilePromptDraftsForAsset = (assetId: string): string[] => {
    const existing = tilesetPromptDrafts.get(assetId);
    if (existing) return existing;

    const configured = tilesetMetadataForAsset(manifest.assets[assetId])?.tiles
      ?.map((tile) => tile.prompt) ?? [];
    tilesetPromptDrafts.set(assetId, configured);
    return configured;
  };

  const tilesetAnimationPromptDraftKey = (assetId: string, animationKey: string) => (
    `${assetId}\u0000${animationKey}`
  );

  const animationTilePromptDraftsForAsset = (
    assetId: string,
    animationKey: string
  ): string[] => {
    const draftKey = tilesetAnimationPromptDraftKey(assetId, animationKey);
    const existing = tilesetAnimationPromptDrafts.get(draftKey);
    if (existing) return existing;

    const asset = manifest.assets[assetId];
    const tileset = tilesetMetadataForAsset(asset);
    const animation = tilesetAnimationForKey(asset, animationKey);
    const tileCount = tileset
      ? Math.min(tileset.tileCount ?? tileset.columns * tileset.rows, tileset.columns * tileset.rows)
      : 0;
    const configured = animation?.tiles?.map((tile) => tile.prompt) ??
      Array.from({ length: tileCount }, (_, tile) => {
        const basePrompt = tileset?.tiles?.[tile]?.prompt?.trim();
        return basePrompt
          ? `Keep this ${basePrompt} tile unchanged unless this animation needs it to move.`
          : "Keep this tile unchanged unless this animation needs it to move.";
      });
    tilesetAnimationPromptDrafts.set(draftKey, configured);
    return configured;
  };

  const renderTilesetPromptInputs = (assetId: string) => {
    const asset = manifest.assets[assetId];
    const tileset = tilesetMetadataForAsset(asset);
    const isAnimation = Boolean(selectedTilesetAnimationKey);
    const tileCount = isAnimation && tileset
      ? Math.min(tileset.tileCount ?? tileset.columns * tileset.rows, tileset.columns * tileset.rows)
      : effectiveTilesetTileCount(asset);
    const drafts = selectedTilesetAnimationKey
      ? animationTilePromptDraftsForAsset(assetId, selectedTilesetAnimationKey)
      : tilePromptDraftsForAsset(assetId);
    if (!isAnimation) elements.frameCountInput.value = String(tileCount);
    elements.tilesetPromptsList.replaceChildren();

    const title = elements.tilesetPromptsField.querySelector(
      ".ai-game-assets-designer__tile-prompts-title"
    );
    const hint = elements.tilesetPromptsField.querySelector(
      ".ai-game-assets-designer__tile-prompts-hint"
    );
    if (title) title.textContent = isAnimation ? "Tile animation prompts" : "Tile prompts";
    if (hint) {
      hint.textContent = isAnimation
        ? "Describe how every tile behaves in this animation, in exact sheet order."
        : "Describe each tile in exact sheet order.";
    }

    for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
      const input = document.createElement("textarea");
      input.rows = 3;
      input.value = drafts[tileIndex] ?? "";
      input.setAttribute("aria-label", `Tile ${tileIndex + 1} prompt`);
      input.addEventListener("input", () => {
        drafts[tileIndex] = input.value;
      });

      const label = document.createElement("label");
      label.className = "ai-game-assets-designer__field";
      const labelText = document.createElement("span");
      labelText.textContent = `Tile ${tileIndex + 1}`;
      label.append(labelText, input);
      elements.tilesetPromptsList.append(label);
    }
  };

  const tilesetAnimationPromptDefinitions = (
    assetId: string,
    animationKey: string
  ): Array<{ prompt: string }> | undefined => {
    const tileset = tilesetMetadataForAsset(manifest.assets[assetId]);
    if (!tileset) return undefined;
    const tileCount = Math.min(
      tileset.tileCount ?? tileset.columns * tileset.rows,
      tileset.columns * tileset.rows
    );
    const prompts = animationTilePromptDraftsForAsset(assetId, animationKey)
      .slice(0, tileCount)
      .map((prompt) => prompt.trim());
    if (prompts.length !== tileCount || prompts.some((prompt) => !prompt)) return undefined;
    return prompts.map((prompt) => ({ prompt }));
  };

  const tilesetAnimationDefinitionFromInputs = (
    assetId: string,
    animationKey: string
  ): AiTilesetAnimation | undefined => {
    const animation = tilesetAnimationForKey(manifest.assets[assetId], animationKey);
    const tiles = tilesetAnimationPromptDefinitions(assetId, animationKey);
    if (!animation || !tiles) return undefined;
    const frameCount = positiveIntegerInput(elements.frameCountInput, animation.frameCount);
    const defaultDelayMs = Math.round(1000 / Math.max(1, animation.frameRate));
    return {
      ...animation,
      frameCount,
      tiles,
      frameTimings: Array.from({ length: frameCount }, (_, index) => (
        animation.frameTimings?.[index] ?? { delayMs: defaultDelayMs }
      ))
    };
  };

  const assetWithTilesetAnimationDefinition = (
    asset: AiAssetDefinition,
    definition: AiTilesetAnimation
  ): AiAssetDefinition => ({
    ...asset,
    tileset: asset.tileset ? {
      ...asset.tileset,
      animations: (asset.tileset.animations ?? []).map((animation) => (
        animation.key === definition.key ? definition : animation
      ))
    } : asset.tileset
  });

  const tilesetPromptDefinitions = (
    assetId: string,
    tileCount: number
  ): Array<{ prompt: string }> | undefined => {
    const prompts = tilePromptDraftsForAsset(assetId)
      .slice(0, tileCount)
      .map((prompt) => prompt.trim());
    if (prompts.length !== tileCount || prompts.some((prompt) => !prompt)) {
      return undefined;
    }
    return prompts.map((prompt) => ({ prompt }));
  };

  const syncTargetAsset = (
    assetId: string,
    syncOptions: { preserveOptions?: boolean } = {}
  ) => {
    const asset = manifest.assets[assetId];
    const activeVersion = asset.versions[asset.activeVersion];
    const isAudio = isAudioAsset(asset);
    const isVoice = isVoiceAsset(asset);
    const isVoiceLine = asset.kind === "voice-line";
    const tileset = tilesetMetadataForAsset(asset);
    const tilesetAnimation = selectedTilesetAnimationKey
      ? tilesetAnimationForKey(asset, selectedTilesetAnimationKey)
      : undefined;
    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    elements.promptInput.value = tilesetAnimation?.prompt ?? activeVersion?.prompt ?? asset.prompt;
    elements.widthInput.value = String(
      asset.frameGrid?.frameWidth ?? tileset?.tileWidth ?? asset.dimensions?.width ?? 1
    );
    elements.heightInput.value = String(
      asset.frameGrid?.frameHeight ?? tileset?.tileHeight ?? asset.dimensions?.height ?? 1
    );
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
    elements.formatField.hidden = isAudio || Boolean(selectedTilesetAnimationKey) ||
      elements.formatField.hidden;
    const isTilesetAnimation = Boolean(tileset && selectedTilesetAnimationKey);
    const isBaseTileset = Boolean(tileset && !selectedTilesetAnimationKey);
    elements.promptField.hidden = Boolean(tileset);
    elements.tilesetPromptsField.hidden = !tileset;
    elements.widthField.firstElementChild!.textContent = tileset ? "Tile width" : "Width";
    elements.heightField.firstElementChild!.textContent = tileset ? "Tile height" : "Height";
    elements.frameCountField.firstElementChild!.textContent = isTilesetAnimation
      ? "Animation frames"
      : tileset ? "Tiles" : "Frames";
    elements.dimensionGrid.hidden = isAudio || isTilesetAnimation;
    syncTargetVariantLabel(assetId);
    elements.frameCountInput.value = String(isTilesetAnimation
      ? tilesetAnimation?.frameCount ?? 1
      : asset.frameGrid?.frameCount ??
        (asset.frameGrid
          ? asset.frameGrid.columns * asset.frameGrid.rows
          : tileset?.tileCount ?? (tileset ? tileset.columns * tileset.rows : 1))
    );
    if (tileset && !isTilesetAnimation) {
      elements.frameCountInput.max = String(tileset.columns * tileset.rows);
    } else {
      elements.frameCountInput.removeAttribute("max");
    }
    if (tileset) {
      renderTilesetPromptInputs(assetId);
    } else {
      elements.tilesetPromptsList.replaceChildren();
    }
    const activeVersionSource = activeVersion?.file ? resolveAssetUrl(activeVersion.file) : "";
    elements.frameCountField.hidden = !isTilesetAnimation &&
      (!tileset && (asset.kind === "image" || !asset.frameGrid));
    elements.versionLabel.textContent = selectedTilesetAnimationKey
      ? `Active ${readableAssetName(assetId)} animation: ${readableAssetName(selectedTilesetAnimationKey)}`
      : `Active ${readableAssetName(assetId)}: ${asset.activeVersion}`;
    elements.currentImage.src = activeVersionSource;
    if (isAudio) {
      renderAudioPlayer({
        container: elements.currentAudio,
        src: activeVersionSource,
        label: readableAssetName(assetId),
        playback: activeVersion?.audioPlayback
      });
    } else {
      elements.currentAudio.innerHTML = "";
    }
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
    elements.currentTouchUpButton.textContent = isBaseTileset ? "Edit tileset..." : "Touch up...";
    elements.currentRevertButton.hidden = true;
    elements.currentPreview.classList.add("is-selected");
    elements.currentAnimationButton.hidden = !activeVersion?.file || (!asset.frameGrid && !isAudio);
    elements.currentTouchUpButton.hidden = !activeVersion?.file ||
      Boolean(selectedTilesetAnimationKey) ||
      isAudio ||
      Boolean(asset.frameGrid) ||
      normalizeAssetFormat(asset.settings?.format) === "svg" ||
      isSvgSource(activeVersion?.file ?? "");
    if (syncOptions.preserveOptions && displayedOptions?.assetId === assetId) {
      renderGeneratedOptions(assetId, displayedOptions.generated);
    } else {
      clearGeneratedOptions();
    }
    setStatus(elements, "", "idle");
    elements.promoteButton.disabled = true;
    elements.uploadButton.disabled = Boolean(selectedTilesetAnimationKey);
    elements.versionsButton.disabled = Object.keys(asset.versions).length <= 1;
    elements.deriveButton.hidden = Boolean(selectedTilesetAnimationKey) ||
      isAudio || deriveCandidatesForAsset(assetId).length === 0;
    selectedOption = undefined;
    editedCurrentOption = undefined;
    previewedVersionName = undefined;
    const pending = pendingOptions.get(assetId);
    if (pending) {
      selectedOption = pending.option;
      editedCurrentOption = pending.option;
      previewedVersionName = pending.previewedVersionName;
      showOptionInCurrentPreview(pending.option, "pending preview");
      previewedVersionName = pending.previewedVersionName;
      elements.currentPreview.classList.add("is-selected");
      elements.promoteButton.disabled = activePromotionId !== undefined;
    }
    syncPromoteAllButton();
  };

  const showOptionInCurrentPreview = (
    option: GeneratedDebugOption,
    label = "selected option"
  ) => {
    const asset = manifest.assets[selectedTargetAssetId];
    const optionAsset = assetWithGeneratedGeometry(asset, option);
    const isAudio = isAudioAsset(asset);

    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    editedCurrentOption = option;
    previewedVersionName = undefined;
    elements.currentPreview.hidden = false;
    elements.currentPreview.setAttribute(
      "aria-label",
      `Preview ${label} for ${readableAssetName(selectedTargetAssetId)}`
    );
    elements.currentAnimation.hidden = true;
    elements.currentAnimationButton.textContent = "Edit...";
    elements.currentAnimationButton.hidden = !optionAsset.frameGrid && !isAudio;
    elements.currentTouchUpButton.textContent = isDesignerTilesetAsset(optionAsset)
      ? "Edit tileset..."
      : "Touch up...";
    elements.currentTouchUpButton.hidden =
      isAudio ||
      Boolean(optionAsset.frameGrid) ||
      option.mimeType === "image/svg+xml";
    elements.currentRevertButton.hidden = false;
    elements.currentAudio.hidden = !isAudio;
    elements.currentImage.hidden = isAudio;

    if (isAudio) {
      renderAudioPlayer({
        container: elements.currentAudio,
        src: option.dataUrl,
        label: readableAssetName(selectedTargetAssetId),
        playback: option.audioPlayback
      });
    } else {
      elements.currentAudio.innerHTML = "";
      elements.currentImage.src = option.dataUrl;
      elements.currentImage.alt = `${readableAssetName(selectedTargetAssetId)} ${label}`;
    }
  };

  const syncMixTilesetButton = () => {
    const session = displayedOptions;
    const asset = session ? manifest.assets[session.assetId] : undefined;
    const baseVisible = Boolean(
      session &&
      session.assetId === selectedTargetAssetId &&
      session.generated.length === 3 &&
      isDesignerTilesetAsset(asset) &&
      !selectedTilesetAnimationKey
    );
    const animationSession = displayedTilesetAnimationOptions;
    const animationVisible = Boolean(
      animationSession &&
      animationSession.assetId === selectedTargetAssetId &&
      animationSession.animationKey === selectedTilesetAnimationKey &&
      animationSession.generated.length === 3
    );
    const visible = baseVisible || animationVisible;
    elements.mixTilesetButton.textContent = animationVisible ? "Mix tilesets" : "Mix tileset";
    elements.mixTilesetButton.hidden = !visible;
    elements.mixTilesetButton.disabled = !visible || Boolean(
      activeGeneration || activePromotionId !== undefined || mixingTileset
    );
  };

  const renderGeneratedOptions = (
    assetId: string,
    generated: GeneratedDebugOption[]
  ) => {
    stopTilesetAnimationOptionPreviews?.();
    stopTilesetAnimationOptionPreviews = undefined;
    displayedTilesetAnimationOptions = undefined;
    displayedOptions = {
      assetId,
      generated: [...generated]
    };
    renderOptions({
      elements,
      generated,
      scene: options.scene,
      manifest,
      assetId,
      designerOptions: options,
      onPreview: options.onPreview,
      onSelected(option) {
        selectedOption = option;
        rememberPendingOption(assetId, option);
        showOptionInCurrentPreview(option);
        elements.promoteButton.disabled = activePromotionId !== undefined;
      }
    });
    syncMixTilesetButton();
  };

  const currentTilesetOption = async (
    assetId: string,
    definition: AiTilesetAnimation
  ): Promise<GeneratedDebugOption> => {
    const asset = manifest.assets[assetId];
    const pending = pendingOptions.get(assetId)?.option;
    const activeVersion = asset.versions[asset.activeVersion];
    const dataUrl = pending?.dataUrl ??
      await imageSourceToDataUrl(resolveAssetUrl(activeVersion.file));
    return {
      ...(pending ?? {
        index: -1,
        dataUrl,
        mimeType: mimeTypeFromDataUrl(dataUrl),
        prompt: activeVersion.prompt ?? asset.prompt,
        model: activeVersion.model,
        revisedPrompt: activeVersion.revisedPrompt,
        dimensions: asset.dimensions,
        settings: activeVersion.settings ?? asset.settings
      }),
      dataUrl,
      tileset: assetWithTilesetAnimationDefinition(asset, definition).tileset
    };
  };

  const selectTilesetAnimationFrames = async (
    assetId: string,
    definition: AiTilesetAnimation,
    frames: string[],
    card?: HTMLElement
  ) => {
    const option = await currentTilesetOption(assetId, definition);
    const pending = pendingOptions.get(assetId);
    selectedOption = option;
    rememberPendingOption(assetId, option, {
      inheritAnimations: pending?.inheritAnimations,
      previewedVersionName: pending?.previewedVersionName,
      tilesetAnimations: {
        ...(pending?.tilesetAnimations ?? {}),
        [definition.key]: frames
      },
      animationOnlyKey: pending?.animationOnlyKey ??
        (pending ? undefined : definition.key)
    });
    for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
      item.classList.toggle("is-selected", item === card);
    }
    elements.currentPreview.classList.remove("is-selected");
    elements.promoteButton.disabled = activePromotionId !== undefined;
    await previewTilesetAnimationFrames(
      assetId,
      definition.key,
      frames,
      assetWithTilesetAnimationDefinition(manifest.assets[assetId], definition)
    );
  };

  const renderTilesetAnimationOptions = (
    assetId: string,
    definition: AiTilesetAnimation,
    generated: GeneratedTilesetAnimationCandidate[]
  ) => {
    stopTilesetAnimationOptionPreviews?.();
    displayedOptions = undefined;
    displayedTilesetAnimationOptions = {
      assetId,
      animationKey: definition.key,
      animation: definition,
      generated: [...generated]
    };
    elements.options.replaceChildren();
    elements.options.classList.remove("is-audio");
    const stops: Array<() => void> = [];
    const delayForFrame = (index: number) => (
      definition.frameTimings?.[index]?.delayMs ??
      Math.round(1000 / Math.max(1, definition.frameRate))
    );

    for (const candidate of generated) {
      const card = document.createElement("div");
      card.className = "ai-game-assets-designer__option";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-game-assets-designer__option-select";
      button.setAttribute("aria-label", `Select animation option ${candidate.index + 1}`);
      const image = document.createElement("img");
      image.alt = `${assetId} animation option ${candidate.index + 1}`;
      const label = document.createElement("span");
      label.textContent = `Option ${candidate.index + 1}`;
      button.append(image, label);
      card.append(button);
      elements.options.append(card);

      let frame = 0;
      let timeout: number | undefined;
      let stopped = false;
      const animate = () => {
        if (stopped || candidate.frames.length === 0) return;
        image.src = candidate.frames[frame % candidate.frames.length]!.dataUrl;
        const currentFrame = frame;
        frame += 1;
        timeout = window.setTimeout(animate, delayForFrame(currentFrame));
      };
      animate();
      stops.push(() => {
        stopped = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
      });

      button.addEventListener("click", async () => {
        setStatus(elements, `Applying animation option ${candidate.index + 1}...`, "busy");
        try {
          await selectTilesetAnimationFrames(
            assetId,
            definition,
            candidate.frames.map((item) => item.dataUrl),
            card
          );
          setStatus(
            elements,
            `Previewing animation option ${candidate.index + 1}. Promote to save it.`,
            "info"
          );
        } catch (error) {
          setStatus(elements, `Could not preview animation. ${errorMessage(error)}`, "error");
        }
      });
    }

    stopTilesetAnimationOptionPreviews = () => stops.forEach((stop) => stop());
    syncMixTilesetButton();
  };

  const clearGeneratedOptions = () => {
    stopTilesetAnimationOptionPreviews?.();
    stopTilesetAnimationOptionPreviews = undefined;
    displayedTilesetAnimationOptions = undefined;
    displayedOptions = undefined;
    elements.options.innerHTML = "";
    elements.options.classList.remove("is-audio");
    syncMixTilesetButton();
  };

  const restoreActivePreview = () => {
    const asset = manifest.assets[selectedTargetAssetId];
    const activeVersion = asset.versions[asset.activeVersion];

    if (!activeVersion?.file) return;

    stopCurrentAnimationPreview?.();
    stopCurrentAnimationPreview = undefined;
    editedCurrentOption = undefined;
    previewedVersionName = undefined;
    selectedOption = undefined;
    forgetPendingOption(selectedTargetAssetId);

    for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
      item.classList.remove("is-selected");
    }

    const activeVersionSource = resolveAssetUrl(activeVersion.file);
    const isAudio = isAudioAsset(asset);
    elements.currentPreview.classList.add("is-selected");
    elements.currentPreview.setAttribute(
      "aria-label",
      `Preview active ${readableAssetName(selectedTargetAssetId)} version`
    );
    elements.currentAnimation.hidden = true;
    elements.currentAnimationButton.textContent = "Edit...";
    elements.currentAnimationButton.hidden = !asset.frameGrid && !isAudio;
    elements.currentTouchUpButton.textContent = isDesignerTilesetAsset(asset)
      ? "Edit tileset..."
      : "Touch up...";
    elements.currentTouchUpButton.hidden =
      isAudio ||
      Boolean(asset.frameGrid) ||
      normalizeAssetFormat(asset.settings?.format) === "svg" ||
      isSvgSource(activeVersion.file);
    elements.currentRevertButton.hidden = true;
    elements.currentAudio.hidden = !isAudio;
    elements.currentImage.hidden = isAudio;
    elements.promoteButton.disabled = true;

    if (isAudio) {
      renderAudioPlayer({
        container: elements.currentAudio,
        src: activeVersionSource,
        label: readableAssetName(selectedTargetAssetId),
        playback: activeVersion.audioPlayback
      });
      (options.onAssetReady ?? options.onPreview)(
        selectedTargetAssetId,
        activeVersionSource,
        asset
      );
      setStatus(elements, "Reverted preview to the active version.", "info");
    } else {
      elements.currentAudio.innerHTML = "";
      elements.currentImage.src = activeVersionSource;
      elements.currentImage.alt = `${readableAssetName(selectedTargetAssetId)} active version`;
      setStatus(elements, "Reverting preview in the game...", "busy");
      previewCurrentAsset({
        scene: options.scene,
        manifest,
        assetId: selectedTargetAssetId,
        src: activeVersionSource,
        onPreview(assetId, textureKey, previewAsset) {
          (options.onAssetReady ?? options.onPreview)(assetId, textureKey, previewAsset);
          setStatus(elements, "Reverted preview to the active version.", "info");
        },
        onError(error) {
          setStatus(elements, `Could not revert the game preview. ${error.message}`, "error");
        }
      });
    }
  };

  const syncAsset = (assetId: string) => {
    syncAnimationChoices(assetId);
    syncTargetAsset(selectedTargetAssetId);
    renderAssetBrowser();
  };

  const syncTargetVariantLabel = (assetId: string) => {
    const target = selectedTargetId ? manifest.targets?.[selectedTargetId] : undefined;
    const logicalAssetId = logicalAssetIdForTargetAsset(assetId);

    elements.targetField.hidden = Object.keys(manifest.targets ?? {}).length === 0;
    elements.targetSelect.value = selectedTargetId ?? "";

    if (!target) {
      elements.targetVariantLabel.hidden = true;
      elements.targetVariantLabel.textContent = "";
      return;
    }

    if (logicalAssetId && logicalAssetId !== assetId) {
      elements.targetVariantLabel.hidden = false;
      elements.targetVariantLabel.textContent =
        `${target.label ?? readableAssetName(target.id)} variant: ` +
        `${readableAssetName(logicalAssetId)} -> ${readableAssetName(assetId)}`;
      return;
    }

    elements.targetVariantLabel.hidden = false;
    elements.targetVariantLabel.textContent =
      `${target.label ?? readableAssetName(target.id)} uses default ${readableAssetName(logicalAssetId ?? assetId)}.`;
  };

  const logicalAssetIdForTargetAsset = (targetAssetId: string): string | undefined => {
    const target = selectedTargetId ? manifest.targets?.[selectedTargetId] : undefined;

    if (!target) return targetAssetId;

    for (const [logicalAssetId, variantAssetId] of Object.entries(target.variants)) {
      if (variantAssetId === targetAssetId) return logicalAssetId;
    }

    return targetAssetId;
  };

  const deriveCandidatesForAsset = (targetAssetId: string): DeriveCandidate[] => {
    const logicalAssetId = logicalAssetIdForTargetAsset(targetAssetId) ?? targetAssetId;
    const target = selectedTargetId ? manifest.targets?.[selectedTargetId] : undefined;
    const selectedTargetUsesDefault = Boolean(
      selectedTargetId &&
      target &&
      targetAssetId === logicalAssetId &&
      !target.variants[logicalAssetId]
    );
    const candidates: DeriveCandidate[] = [];
    const addCandidate = (targetId: string | undefined, targetLabel: string, assetId: string) => {
      if (
        (assetId === targetAssetId && !selectedTargetUsesDefault) ||
        candidates.some((candidate) => candidate.assetId === assetId)
      ) {
        return;
      }

      const asset = manifest.assets[assetId];
      const activeVersion = asset?.versions[asset.activeVersion];

      if (!asset || isAudioAsset(asset) || asset.kind === "collection" || !activeVersion?.file) {
        return;
      }

      candidates.push({
        targetId,
        targetLabel,
        assetId,
        asset,
        src: resolveAssetUrl(activeVersion.file)
      });
    };

    addCandidate(undefined, "Default", logicalAssetId);

    for (const target of Object.values(manifest.targets ?? {})) {
      addCandidate(
        target.id,
        target.label ?? readableAssetName(target.id),
        target.variants[logicalAssetId] ?? logicalAssetId
      );
    }

    return candidates;
  };

  const ensureTargetVariantForDerive = async (targetAssetId: string): Promise<string> => {
    if (!selectedTargetId) return targetAssetId;

    const logicalAssetId = logicalAssetIdForTargetAsset(targetAssetId) ?? targetAssetId;
    const target = manifest.targets?.[selectedTargetId];

    if (!target || target.variants[logicalAssetId]) {
      return targetAssetId;
    }

    setStatus(
      elements,
      `Creating ${target.label ?? readableAssetName(target.id)} variant for ${readableAssetName(logicalAssetId)}...`,
      "busy"
    );
    const result = await client.ensureTargetVariant({
      targetId: selectedTargetId,
      assetId: logicalAssetId
    });
    manifest = result.manifest;
    options.onManifestUpdated?.(manifest);
    selectedTargetAssetId = result.assetId;
    syncAsset(selectedAssetId);
    return result.assetId;
  };

  const renderAssetBrowser = () => {
    renderAssetFolderBrowser({
      container: elements.assetBrowser,
      manifest,
      selectedAssetId,
      assetIds: visibleAssetIds(),
      onSelect(assetId) {
        invalidatePanelWork();
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
    elements.promoteButton.disabled = !selectedOption || activePromotionId !== undefined;
    syncPromoteAllButton();
    syncMixTilesetButton();
    return true;
  };

  const invalidatePanelWork = () => {
    panelRevision += 1;
    if (!activeGeneration) return;

    const { controller, id } = activeGeneration;
    controller.abort();
    finishGeneration(id);
  };

  const regenerateTilesetAnimation = async (animationKey: string) => {
    const assetId = selectedTargetAssetId;
    const workflowPanelRevision = panelRevision;
    const isWorkflowPanelCurrent = () =>
      panelRevision === workflowPanelRevision &&
      selectedTargetAssetId === assetId &&
      selectedTilesetAnimationKey === animationKey;
    const asset = manifest.assets[assetId];
    const animation = tilesetAnimationForKey(asset, animationKey);
    const activeVersion = asset?.versions[asset.activeVersion];
    const definition = tilesetAnimationDefinitionFromInputs(assetId, animationKey);

    if (!asset || !animation || !activeVersion?.file) {
      setStatus(elements, `Tileset animation "${animationKey}" is not ready to generate.`, "error");
      return;
    }
    if (!definition) {
      setStatus(elements, "Add an animation prompt for every tile before generating.", "error");
      return;
    }

    const controller = new AbortController();
    const currentGenerationId = generationId + 1;
    generationId = currentGenerationId;
    activeGeneration = { controller, id: currentGenerationId };
    syncPromoteAllButton();
    elements.regenerateButton.textContent = "Cancel generation";
    clearGeneratedOptions();
    elements.promoteButton.disabled = true;
    lockGenerationStatus();
    setStatus(
      elements,
      `Generating 3 ${readableAssetName(animationKey)} tileset animation options...`,
      "busy"
    );

    try {
      const candidates = await client.generateTilesetAnimationStream({
        assetId,
        animationKey,
        frameCount: definition.frameCount,
        tiles: definition.tiles,
        count: 3
      }, (candidate) => {
        if (activeGeneration?.id !== currentGenerationId) return;
        if (candidate.frames.length !== definition.frameCount) {
          throw new Error(
            `Requested ${definition.frameCount} frames, but the generation server returned ` +
              `${candidate.frames.length} for option ${candidate.index + 1}. ` +
              "Restart the AI asset dev server and regenerate the options."
          );
        }
        const session = displayedTilesetAnimationOptions;
        const generated = [
          ...(session?.assetId === assetId && session.animationKey === animationKey
            ? session.generated
            : []),
          candidate
        ].sort((left, right) => left.index - right.index);
        renderTilesetAnimationOptions(assetId, definition, generated);
        setStatus(
          elements,
          `Generated option ${candidate.index + 1}. Waiting for all 3 animation sequences...`,
          "busy"
        );
      }, {
        signal: controller.signal
      });

      if (!finishGeneration(currentGenerationId)) return;
      if (candidates.length !== 3) {
        throw new Error(`Expected 3 tileset animation candidates, received ${candidates.length}.`);
      }
      const mismatchedCandidate = candidates.find((candidate) => (
        candidate.frames.length !== definition.frameCount
      ));
      if (mismatchedCandidate) {
        throw new Error(
          `Requested ${definition.frameCount} frames, but option ` +
            `${mismatchedCandidate.index + 1} contains ${mismatchedCandidate.frames.length}. ` +
            "Regenerate the options for the current frame count."
        );
      }
      if (!isWorkflowPanelCurrent()) return;
      renderTilesetAnimationOptions(assetId, definition, candidates);
      setStatus(
        elements,
        "Three animation options ready. Preview one or mix tilesets.",
        "info"
      );
    } catch (error) {
      if (isAbortError(error)) {
        if (isWorkflowPanelCurrent()) {
          setStatus(elements, "Generation cancelled.", "info");
        }
        return;
      }

      if (isWorkflowPanelCurrent()) {
        if (
          displayedTilesetAnimationOptions?.assetId === assetId &&
          displayedTilesetAnimationOptions.animationKey === animationKey
        ) {
          clearGeneratedOptions();
        }
        setStatus(
          elements,
          `Tileset animation generation failed. ${errorMessage(error)}`,
          "error"
        );
      }
    } finally {
      finishGeneration(currentGenerationId);
    }
  };

  elements.assetSelect.addEventListener("change", () => {
    invalidatePanelWork();
    selectedAssetId = elements.assetSelect.value;
    syncAsset(selectedAssetId);
  });

  elements.targetSelect.addEventListener("change", () => {
    invalidatePanelWork();
    selectedTargetId = elements.targetSelect.value || undefined;
    syncAsset(selectedAssetId);
    setStatus(
      elements,
      selectedTargetId
        ? `Editing ${manifest.targets?.[selectedTargetId]?.label ?? readableAssetName(selectedTargetId)} target.`
        : "Editing default target.",
      "info"
    );
  });

  elements.animationSelect.addEventListener("change", () => {
    invalidatePanelWork();
    if (isDesignerTilesetAsset(manifest.assets[selectedTargetAssetId])) {
      const prefix = "tileset:animation:";
      selectedTilesetAnimationKey = elements.animationSelect.value.startsWith(prefix)
        ? decodeURIComponent(elements.animationSelect.value.slice(prefix.length))
        : undefined;
      syncTargetAsset(selectedTargetAssetId);
      return;
    }

    selectedTilesetAnimationKey = undefined;
    selectedTargetAssetId = elements.animationSelect.value;
    syncTargetAsset(selectedTargetAssetId);
  });

  const syncTilesetPromptCount = () => {
    const asset = manifest.assets[selectedTargetAssetId];
    if (isDesignerTilesetAsset(asset) && !selectedTilesetAnimationKey) {
      renderTilesetPromptInputs(selectedTargetAssetId);
    }
  };
  elements.frameCountInput.addEventListener("change", syncTilesetPromptCount);
  elements.frameCountInput.addEventListener("blur", syncTilesetPromptCount);

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

    if (!editedCurrentOption && !activeVersion?.file) return;

    for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
      item.classList.remove("is-selected");
    }

    elements.currentPreview.classList.add("is-selected");
    selectedOption = editedCurrentOption;
    elements.promoteButton.disabled = !selectedOption;
    if (editedCurrentOption) {
      const optionAsset = assetWithGeneratedGeometry(asset, editedCurrentOption, {
        inheritAnimations: Boolean(previewedVersionName)
      });

      if (isAudioAsset(asset)) {
        renderAudioPlayer({
          container: elements.currentAudio,
          src: editedCurrentOption.dataUrl,
          label: readableAssetName(selectedTargetAssetId),
          playback: editedCurrentOption.audioPlayback
        });
        options.onPreview(selectedTargetAssetId, editedCurrentOption.dataUrl, optionAsset);
      } else {
        previewImageSource({
          scene: options.scene,
          manifest,
          assetId: selectedTargetAssetId,
          src: editedCurrentOption.dataUrl,
          textureKey: `ai-current-option:${selectedTargetAssetId}:${Date.now()}`,
          assetOverride: optionAsset,
          onPreview: options.onPreview
        });
      }

      setStatus(elements, "Previewing the selected option. Promote to save it to code.", "info");
      return;
    }

    if (isAudioAsset(asset)) {
      const activeVersionSource = resolveAssetUrl(activeVersion.file);
      renderAudioPlayer({
        container: elements.currentAudio,
        src: activeVersionSource,
        label: readableAssetName(selectedTargetAssetId),
        playback: activeVersion.audioPlayback
      });
      options.onPreview(selectedTargetAssetId, activeVersionSource, asset);
    } else {
      const activeVersionSource = resolveAssetUrl(activeVersion.file);
      elements.currentImage.src = activeVersionSource;
      previewCurrentAsset({
        scene: options.scene,
        manifest,
        assetId: selectedTargetAssetId,
        src: activeVersionSource,
        onPreview: options.onPreview
      });
    }
    setStatus(elements, "Previewing active version.", "info");
  });

  elements.currentRevertButton.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
    restoreActivePreview();
  });

  elements.currentPreview.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.target !== elements.currentPreview) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    elements.currentPreview.click();
  });

  elements.mixTilesetButton.addEventListener("click", async () => {
    const session = displayedOptions;
    const animationSession = displayedTilesetAnimationOptions;
    const assetId = selectedTargetAssetId;
    const asset = manifest.assets[assetId];
    const activeVersion = asset?.versions[asset.activeVersion];
    if (
      animationSession &&
      animationSession.assetId === assetId &&
      animationSession.animationKey === selectedTilesetAnimationKey &&
      animationSession.generated.length === 3 &&
      asset?.tileset &&
      activeVersion?.file &&
      !mixingTileset &&
      !activeGeneration &&
      activePromotionId === undefined
    ) {
      const mixPanelRevision = panelRevision;
      const definition = animationSession.animation;
      const draftAsset = assetWithTilesetAnimationDefinition(asset, definition);
      const pending = pendingOptions.get(assetId);
      mixingTileset = true;
      syncMixTilesetButton();
      setStatus(elements, "Opening tileset animation mixer...", "busy");

      try {
        const baseSheetSrc = pending?.option.dataUrl ??
          await imageSourceToDataUrl(resolveAssetUrl(activeVersion.file));
        const currentFrames = pending?.tilesetAnimations?.[definition.key] ??
          await Promise.all(
            (activeVersion.tilesetAnimations?.[definition.key]?.files ?? [])
              .map((file) => imageSourceToDataUrl(resolveAssetUrl(file)))
          );
        if (
          panelRevision !== mixPanelRevision ||
          selectedTargetAssetId !== assetId ||
          selectedTilesetAnimationKey !== definition.key
        ) return;

        const mixed = await openTilesetAnimationMixerDialog({
          root: elements.root,
          asset: draftAsset,
          assetId,
          animationKey: definition.key,
          baseSheetSrc,
          baseAnimationFrameSrcs: currentFrames,
          candidates: animationSession.generated,
          tilePrompts: definition.tiles,
          regenerateTile: async (tile, currentTileSrc) => {
            const prompt = definition.tiles?.[tile];
            if (!prompt) throw new Error(`Tile ${tile + 1} requires an animation prompt.`);
            return client.generateTilesetAnimationStream({
              assetId,
              animationKey: definition.key,
              count: 3,
              frameCount: definition.frameCount,
              tiles: [prompt],
              tileset: tilesetTileGenerationOverride(asset.tileset!, tile),
              baseDataUrl: currentTileSrc,
              styleGuide: await styleGuideRequest(styleGuideDraft)
            }, () => undefined);
          }
        });
        if (
          panelRevision !== mixPanelRevision ||
          selectedTargetAssetId !== assetId ||
          selectedTilesetAnimationKey !== definition.key
        ) return;
        if (!mixed) {
          setStatus(
            elements,
            "Tileset animation mixing cancelled. The three options are still available.",
            "info"
          );
          return;
        }
        await selectTilesetAnimationFrames(assetId, definition, mixed.frames);
        setStatus(
          elements,
          "Mixed tileset animation ready. Promote to save the selected tile combination.",
          "success"
        );
      } catch (error) {
        setStatus(elements, `Could not mix tileset animation. ${errorMessage(error)}`, "error");
      } finally {
        mixingTileset = false;
        syncMixTilesetButton();
      }
      return;
    }
    if (
      mixingTileset ||
      activeGeneration ||
      activePromotionId !== undefined ||
      !session ||
      session.assetId !== assetId ||
      session.generated.length !== 3 ||
      !isDesignerTilesetAsset(asset) ||
      selectedTilesetAnimationKey ||
      !activeVersion?.file
    ) {
      return;
    }

    const mixPanelRevision = panelRevision;
    const candidates = [...session.generated].sort((left, right) => left.index - right.index);
    mixingTileset = true;
    syncMixTilesetButton();
    setStatus(elements, "Opening tileset mixer...", "busy");

    try {
      const currentOption = editedCurrentOption;
      const activeSheetSrc = currentOption?.dataUrl ??
        await imageSourceToDataUrl(resolveAssetUrl(activeVersion.file));
      const current = resolveTilesetBaseMixCurrent(asset, activeSheetSrc, currentOption);
      if (
        panelRevision !== mixPanelRevision ||
        selectedTargetAssetId !== assetId ||
        selectedTilesetAnimationKey
      ) {
        return;
      }

      const mixed = await openTilesetBaseMixerDialog({
        root: elements.root,
        asset: current.asset,
        assetId,
        baseSheetSrc: current.sheetSrc,
        candidates,
        regenerateTile: (tile, tileset, currentTileSrc) =>
          regenerateTilesetTile(assetId, tile, tileset, currentTileSrc)
      });
      if (
        panelRevision !== mixPanelRevision ||
        selectedTargetAssetId !== assetId ||
        selectedTilesetAnimationKey
      ) {
        return;
      }

      if (!mixed) {
        setStatus(elements, "Tileset mixing cancelled. The three options are still available.", "info");
        return;
      }

      const template = candidates[0]!;
      const mixedOption = createMixedTilesetOption(
        template,
        mixed,
        template.prompt || asset.prompt,
        Math.max(...candidates.map((option) => option.index)) + 1
      );
      selectedOption = mixedOption;
      rememberPendingOption(assetId, mixedOption);
      showOptionInCurrentPreview(mixedOption, "mixed tileset");
      elements.currentPreview.classList.add("is-selected");
      elements.promoteButton.disabled = activePromotionId !== undefined;
      previewOption({
        scene: options.scene,
        manifest,
        assetId,
        option: mixedOption,
        onPreview: options.onPreview
      });
      setStatus(
        elements,
        "Mixed tileset ready. Promote to save the selected tile combination.",
        "success"
      );
    } catch (error) {
      setStatus(elements, `Could not mix tileset. ${errorMessage(error)}`, "error");
    } finally {
      mixingTileset = false;
      syncMixTilesetButton();
    }
  });

  elements.regenerateButton.addEventListener("click", async () => {
    if (activeGeneration) {
      activeGeneration.controller.abort();
      activeGeneration = undefined;
      elements.regenerateButton.textContent = "Regenerate";
      unlockGenerationStatus();
      elements.promoteButton.disabled = !selectedOption || activePromotionId !== undefined;
      syncPromoteAllButton();
      setStatus(elements, "Generation cancelled.", "info");
      return;
    }

    if (selectedTilesetAnimationKey) {
      await regenerateTilesetAnimation(selectedTilesetAnimationKey);
      return;
    }

    const controller = new AbortController();
    const currentGenerationId = generationId + 1;
    const generationAssetId = selectedTargetAssetId;
    const generationAsset = manifest.assets[generationAssetId];
    const generationFormat = effectiveGenerationFormat(
      manifest,
      formatDrafts,
      selectedAssetId,
      generationAssetId
    );
    const generationOverrides = generationOverridesFromInputs(
      elements,
      generationAsset,
      generationFormat
    );
    const isBaseTilesetGeneration = isDesignerTilesetAsset(generationAsset);
    if (isBaseTilesetGeneration && generationOverrides.tileset) {
      renderTilesetPromptInputs(generationAssetId);
      const tileCount = generationOverrides.tileset.tileCount ??
        effectiveTilesetTileCount(generationAsset);
      const tiles = tilesetPromptDefinitions(generationAssetId, tileCount);
      if (!tiles) {
        setStatus(elements, "Add a prompt for every tile before generating.", "error");
        return;
      }
      generationOverrides.tileset = {
        ...generationOverrides.tileset,
        tiles
      };
    }
    generationId = currentGenerationId;
    activeGeneration = { controller, id: currentGenerationId };
    syncPromoteAllButton();

    setStatus(elements, "Generating options...", "busy");
    lockGenerationStatus();
    elements.promoteButton.disabled = true;
    elements.regenerateButton.textContent = "Cancel";
    clearGeneratedOptions();
    selectedOption = editedCurrentOption;
    const streamedOptions: GeneratedDebugOption[] = [];

    try {
      const generationRequest = {
        assetId: generationAssetId,
        prompt: isBaseTilesetGeneration ? undefined : elements.promptInput.value,
        count: options.optionCount ?? 3,
        format: generationFormat,
        audioSettings: audioGenerationOverridesFromInputs(elements, manifest.assets[generationAssetId]),
        voiceSettings: voiceGenerationOverridesFromInputs(elements, manifest.assets[generationAssetId]),
        styleGuide: await styleGuideRequest(styleGuideDraft),
        ...generationOverrides
      };
      await client.generateStream(generationRequest, (option) => {
        if (activeGeneration?.id !== currentGenerationId) return;

        streamedOptions.push(option);
        renderGeneratedOptions(
          generationAssetId,
          [...streamedOptions].sort((left, right) => left.index - right.index)
        );
      }, {
        signal: controller.signal
      });

      if (activeGeneration?.id !== currentGenerationId) {
        return;
      }

      finishGeneration(currentGenerationId);
      setStatus(
        elements,
        streamedOptions.length === 3 && isBaseTilesetGeneration
          ? "Three tileset options ready. Preview one or mix tiles."
          : streamedOptions.length > 0
            ? "Pick an option to preview it."
            : "Generation finished with no options.",
        streamedOptions.length > 0 ? "info" : "error"
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      finishGeneration(currentGenerationId);
      if (streamedOptions.length === 0) {
        clearGeneratedOptions();
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
      if (isDesignerTilesetAsset(asset) && uploadedOption.tileset) {
        const tileCount = uploadedOption.tileset.tileCount ??
          uploadedOption.tileset.columns * uploadedOption.tileset.rows;
        const tiles = tilesetPromptDefinitions(selectedTargetAssetId, tileCount);
        if (!tiles) {
          throw new Error("Add a prompt for every tile before uploading a tileset.");
        }
        uploadedOption.tileset = {
          ...uploadedOption.tileset,
          tiles
        };
      }
      renderGeneratedOptions(selectedTargetAssetId, [uploadedOption]);
      selectedOption = uploadedOption;
      rememberPendingOption(selectedTargetAssetId, uploadedOption);
      showOptionInCurrentPreview(uploadedOption);
      elements.promoteButton.disabled = activePromotionId !== undefined;

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

  elements.deriveButton.addEventListener("click", async () => {
    const derivationAssetId = await ensureTargetVariantForDerive(selectedTargetAssetId);
    const asset = manifest.assets[derivationAssetId];
    const generationFormat = effectiveGenerationFormat(
      manifest,
      formatDrafts,
      selectedAssetId,
      derivationAssetId
    );

    if (isAudioAsset(asset)) return;

    await openDeriveDialog({
      root: elements.root,
      asset,
      assetId: derivationAssetId,
      candidates: deriveCandidatesForAsset(derivationAssetId),
      prompt: elements.promptInput.value,
      format: generationFormat,
      onConfirm: async (deriveRequest) => {
        clearGeneratedOptions();
        elements.promoteButton.disabled = true;
        selectedOption = undefined;

        if (deriveRequest.strategy === "scale" ||
          deriveRequest.strategy === "tile" ||
          deriveRequest.strategy === "crop") {
          setStatus(elements, `Deriving from ${readableAssetName(deriveRequest.candidate.assetId)}...`, "busy");
          const option = await createLocalDerivedOption({
            strategy: deriveRequest.strategy,
            source: deriveRequest.candidate,
            targetAsset: asset,
            prompt: elements.promptInput.value,
            dimensions: deriveRequest.dimensions,
            frameCount: deriveRequest.frameCount,
            scaleMode: deriveRequest.scaleMode,
            cropX: deriveRequest.cropX,
            cropY: deriveRequest.cropY,
            mirrorX: deriveRequest.mirrorX,
            mirrorY: deriveRequest.mirrorY
          });

          renderGeneratedOptions(derivationAssetId, [option]);
          selectedOption = option;
          rememberPendingOption(derivationAssetId, option);
          showOptionInCurrentPreview(option);
          elements.promoteButton.disabled = activePromotionId !== undefined;
          previewOption({
            scene: options.scene,
            manifest,
            assetId: derivationAssetId,
            option,
            onPreview: options.onPreview
          });
          setStatus(elements, "Derived one local option. Promote to save it to code.", "success");
          return;
        }

        const controller = new AbortController();
        const currentGenerationId = generationId + 1;
        const streamedOptions: GeneratedDebugOption[] = [];
        const prompt = deriveRequest.strategy === "extend"
          ? `${elements.promptInput.value}\n\nExtend the referenced source target into the requested canvas. Preserve the original asset identity and visual style while filling the new area naturally.`
          : elements.promptInput.value;

        generationId = currentGenerationId;
        activeGeneration = { controller, id: currentGenerationId };
        syncPromoteAllButton();
        elements.regenerateButton.textContent = "Cancel";
        setStatus(elements, "Generating options...", "busy");
        lockGenerationStatus();

        try {
          const reference = await referenceImageForCandidate(deriveRequest.candidate);

          await client.generateStream({
            assetId: derivationAssetId,
            prompt,
            count: options.optionCount ?? 3,
            references: [reference],
            format: generationFormat,
            dimensions: deriveRequest.dimensions,
            frameCount: deriveRequest.frameCount,
            styleGuide: await styleGuideRequest(styleGuideDraft)
          }, (option) => {
            if (activeGeneration?.id !== currentGenerationId) return;

            streamedOptions.push(option);
            renderGeneratedOptions(
              derivationAssetId,
              [...streamedOptions].sort((left, right) => left.index - right.index)
            );
          }, {
            signal: controller.signal
          });

          finishGeneration(currentGenerationId);
          setStatus(
            elements,
            streamedOptions.length > 0 ? "Pick a derived option to preview it." : "Derive finished with no options.",
            streamedOptions.length > 0 ? "info" : "error"
          );
        } catch (error) {
          if (!isAbortError(error)) {
            finishGeneration(currentGenerationId);
            setStatus(elements, `Derive failed. ${errorMessage(error)}`, "error");
          }
        } finally {
          finishGeneration(currentGenerationId);
        }
      }
    });
  });

  elements.promoteButton.addEventListener("click", async () => {
    if (!selectedOption || activePromotionId !== undefined) return;

    const currentPromotionId = promotionId + 1;
    promotionId = currentPromotionId;
    activePromotionId = currentPromotionId;
    syncPromoteAllButton();
    syncMixTilesetButton();
    const promotedAssetId = selectedTargetAssetId;
    const promotedOption = selectedOption;
    const promotedPending = pendingOptions.get(promotedAssetId);
    const promotionPanelRevision = panelRevision;
    const promotionSelectedAssetId = selectedAssetId;
    const promotionTargetId = selectedTargetId;
    const promotionAnimationKey = selectedTilesetAnimationKey;
    const inheritAnimations = Boolean(previewedVersionName);
    const isPromotionPanelCurrent = () =>
      panelRevision === promotionPanelRevision &&
      selectedAssetId === promotionSelectedAssetId &&
      selectedTargetId === promotionTargetId &&
      selectedTargetAssetId === promotedAssetId &&
      selectedTilesetAnimationKey === promotionAnimationKey;
    const versionName = `promoted-${Date.now()}`;
    setStatus(elements, `Promoting ${versionName}...`, "busy");
    elements.promoteButton.disabled = true;
    elements.panel.setAttribute("aria-busy", "true");
    elements.panel.setAttribute("inert", "");

    let saved: Awaited<ReturnType<AiAssetDebugClient["save"]>>;
    let promotedAsset: AiAssetDefinition;
    let promotedVersionName: string;
    try {
      const animationFrames = promotionAnimationKey
        ? promotedPending?.tilesetAnimations?.[promotionAnimationKey]
        : undefined;
      if (
        promotionAnimationKey &&
        animationFrames &&
        promotedPending?.animationOnlyKey === promotionAnimationKey
      ) {
        const definition = promotedOption.tileset?.animations?.find(
          (animation) => animation.key === promotionAnimationKey
        );
        const animationSaved = await client.saveTilesetAnimation({
          assetId: promotedAssetId,
          animationKey: promotionAnimationKey,
          frames: animationFrames,
          definition,
          versionName,
          notes: "Promoted from a selected or mixed tileset animation preview."
        });
        saved = animationSaved;
        manifest = animationSaved.manifest;
        promotedAsset = animationSaved.asset;
        promotedVersionName = animationSaved.versionName;
      } else {
        saved = await client.save({
          assetId: promotedAssetId,
          versionName,
          dataUrl: promotedOption.dataUrl,
          prompt: promotedOption.prompt,
          model: promotedOption.model,
          revisedPrompt: promotedOption.revisedPrompt,
          dimensions: promotedOption.dimensions,
          frameGrid: promotedOption.frameGrid,
          tileset: promotedOption.tileset,
          animations: assetWithGeneratedGeometry(
            manifest.assets[promotedAssetId],
            promotedOption,
            { inheritAnimations }
          ).animations,
          settings: promotedOption.settings,
          audioSettings: promotedOption.audioSettings,
          audioPlayback: promotedOption.audioPlayback,
          voiceSettings: promotedOption.voiceSettings,
          durationSeconds: promotedOption.durationSeconds,
          activate: true,
          notes: "Promoted from the AI asset designer."
        });
        manifest = saved.manifest;
        promotedAsset = saved.asset;
        promotedVersionName = saved.versionName;
        for (const [animationKey, frames] of Object.entries(
          promotedPending?.tilesetAnimations ?? {}
        )) {
          const animationSaved = await client.saveTilesetAnimation({
            assetId: promotedAssetId,
            animationKey,
            frames,
            definition: promotedOption.tileset?.animations?.find(
              (animation) => animation.key === animationKey
            ),
            notes: "Regenerated with the asset style during promotion."
          });
          manifest = animationSaved.manifest;
          promotedAsset = animationSaved.asset;
          promotedVersionName = animationSaved.versionName;
        }
      }
      for (const [animationKey, frames] of Object.entries(
        promotedPending?.tilesetAnimations ?? {}
      )) {
        await installTilesetAnimationFrameTextures(
          frames,
          promotedAsset,
          (index) => aiTilesetAnimationTextureKey(promotedAssetId, animationKey, index)
        );
      }
    } catch (error) {
      if (activePromotionId === currentPromotionId) {
        activePromotionId = undefined;
      }
      syncPromoteAllButton();
      syncMixTilesetButton();
      elements.panel.removeAttribute("aria-busy");
      elements.panel.removeAttribute("inert");
      if (isPromotionPanelCurrent()) {
        elements.promoteButton.disabled = activePromotionId !== undefined;
        setStatus(elements, `Promotion failed. ${errorMessage(error)}`, "error");
      }
      return;
    }

    forgetPendingOption(promotedAssetId);
    if (isDesignerTilesetAsset(promotedAsset)) {
      tilesetPromptDrafts.set(
        promotedAssetId,
        promotedAsset.tileset?.tiles?.map((tile) => tile.prompt) ?? []
      );
    }
    let promotedTextureKey: string | undefined;
    let liveRefreshError: unknown;
    const captureLiveRefreshError = (error: unknown) => {
      liveRefreshError ??= error;
    };

    if (promotedAsset.activeVersion !== promotedVersionName) {
      captureLiveRefreshError(new Error(
        `Saved version "${promotedVersionName}" was not returned as the active version.`
      ));
    } else if (!isAudioAsset(promotedAsset)) {
      try {
        promotedTextureKey = (await installPromotedImageTexture({
          scene: options.scene,
          manifest,
          assetId: promotedAssetId,
          src: promotedOption.dataUrl,
          assetOverride: promotedAsset
        })).textureKey;
      } catch (generatedSourceError) {
        try {
          promotedTextureKey = (await installPromotedImageTexture({
            scene: options.scene,
            manifest,
            assetId: promotedAssetId,
            src: resolveAssetUrl(saved.file),
            assetOverride: promotedAsset
          })).textureKey;
        } catch (savedSourceError) {
          captureLiveRefreshError(new Error(
            `Could not install the promoted texture. ${errorMessage(savedSourceError)}`,
            { cause: generatedSourceError }
          ));
        }
      }
    }

    try {
      options.onManifestUpdated?.(manifest);
    } catch (error) {
      captureLiveRefreshError(error);
    }

    try {
      if (promotedTextureKey) {
        (options.onAssetReady ?? options.onPreview)(
          promotedAssetId,
          promotedTextureKey,
          promotedAsset
        );
      } else if (isAudioAsset(promotedAsset)) {
        (options.onAssetReady ?? options.onPreview)(
          promotedAssetId,
          resolveAssetUrl(saved.file),
          promotedAsset
        );
      }
    } catch (error) {
      captureLiveRefreshError(error);
    }

    formatDrafts.delete(promotedAssetId);
    if (isPromotionPanelCurrent()) {
      try {
        syncTargetAsset(promotedAssetId, { preserveOptions: true });
      } catch (error) {
        captureLiveRefreshError(error);
      }

      if (liveRefreshError) {
        setStatus(
          elements,
          `Promoted ${promotedAssetId}, but the live game could not refresh. ` +
            `Restart to load it. ${errorMessage(liveRefreshError)}`,
          "error"
        );
      } else {
        setStatus(elements, `Promoted ${promotedAssetId} to ${promotedVersionName}.`, "success");
      }
    }

    if (activePromotionId === currentPromotionId) {
      activePromotionId = undefined;
    }
    syncPromoteAllButton();
    syncMixTilesetButton();
    elements.panel.removeAttribute("aria-busy");
    elements.panel.removeAttribute("inert");
    if (!isPromotionPanelCurrent() && selectedOption) {
      elements.promoteButton.disabled = activePromotionId !== undefined;
    }

    if (options.restartOnPromote) {
      window.location.reload();
    }
  });

  elements.promoteAllButton.addEventListener("click", async () => {
    if (pendingOptions.size === 0 || activePromotionId !== undefined) return;

    const entries = [...pendingOptions.entries()];
    const currentPromotionId = promotionId + 1;
    promotionId = currentPromotionId;
    activePromotionId = currentPromotionId;
    elements.panel.setAttribute("aria-busy", "true");
    elements.panel.setAttribute("inert", "");
    elements.promoteButton.disabled = true;
    syncPromoteAllButton();
    syncMixTilesetButton();
    let promotedCount = 0;
    let promotionError: { assetId: string; error: unknown } | undefined;
    const liveRefreshErrors: Array<{ assetId: string; error: unknown }> = [];

    for (const [index, [assetId, pending]] of entries.entries()) {
      const asset = manifest.assets[assetId];
      if (!asset) {
        promotionError = { assetId, error: new Error("Asset no longer exists in the manifest.") };
        break;
      }

      const versionName = `promoted-${Date.now()}-${index + 1}`;
      setStatus(
        elements,
        `Promoting ${readableAssetName(assetId)} (${index + 1}/${entries.length})...`,
        "busy"
      );

      try {
        let saved;
        let promotedAsset: AiAssetDefinition;
        const animationOnlyFrames = pending.animationOnlyKey
          ? pending.tilesetAnimations?.[pending.animationOnlyKey]
          : undefined;
        if (pending.animationOnlyKey && animationOnlyFrames) {
          saved = await client.saveTilesetAnimation({
            assetId,
            animationKey: pending.animationOnlyKey,
            frames: animationOnlyFrames,
            definition: pending.option.tileset?.animations?.find(
              (animation) => animation.key === pending.animationOnlyKey
            ),
            versionName,
            notes: "Promoted from a tileset animation preview with Promote all."
          });
          manifest = saved.manifest;
          promotedAsset = saved.asset;
        } else {
          saved = await client.save({
            assetId,
            versionName,
            dataUrl: pending.option.dataUrl,
            prompt: pending.option.prompt,
            model: pending.option.model,
            revisedPrompt: pending.option.revisedPrompt,
            dimensions: pending.option.dimensions,
            frameGrid: pending.option.frameGrid,
            tileset: pending.option.tileset,
            animations: assetWithGeneratedGeometry(asset, pending.option, {
              inheritAnimations: pending.inheritAnimations
            }).animations,
            settings: pending.option.settings,
            audioSettings: pending.option.audioSettings,
            audioPlayback: pending.option.audioPlayback,
            voiceSettings: pending.option.voiceSettings,
            durationSeconds: pending.option.durationSeconds,
            activate: true,
            notes: "Promoted from the AI asset designer with Promote all."
          });
          manifest = saved.manifest;
          promotedAsset = saved.asset;
          for (const [animationKey, frames] of Object.entries(
            pending.tilesetAnimations ?? {}
          )) {
            const animationSaved = await client.saveTilesetAnimation({
              assetId,
              animationKey,
              frames,
              definition: pending.option.tileset?.animations?.find(
                (animation) => animation.key === animationKey
              ),
              notes: "Regenerated with the asset style during Promote all."
            });
            manifest = animationSaved.manifest;
            promotedAsset = animationSaved.asset;
          }
        }
        if (isDesignerTilesetAsset(promotedAsset)) {
          tilesetPromptDrafts.set(
            assetId,
            promotedAsset.tileset?.tiles?.map((tile) => tile.prompt) ?? []
          );
        }
        for (const [animationKey, frames] of Object.entries(
          pending.tilesetAnimations ?? {}
        )) {
          await installTilesetAnimationFrameTextures(
            frames,
            promotedAsset,
            (frameIndex) => aiTilesetAnimationTextureKey(assetId, animationKey, frameIndex)
          );
        }

        try {
          if (isAudioAsset(promotedAsset)) {
            (options.onAssetReady ?? options.onPreview)(
              assetId,
              resolveAssetUrl(saved.file),
              promotedAsset
            );
          } else {
            let installed;
            try {
              installed = await installPromotedImageTexture({
                scene: options.scene,
                manifest,
                assetId,
                src: pending.option.dataUrl,
                assetOverride: promotedAsset
              });
            } catch {
              installed = await installPromotedImageTexture({
                scene: options.scene,
                manifest,
                assetId,
                src: resolveAssetUrl(saved.file),
                assetOverride: promotedAsset
              });
            }
            (options.onAssetReady ?? options.onPreview)(
              assetId,
              installed.textureKey,
              promotedAsset
            );
          }
        } catch (error) {
          liveRefreshErrors.push({ assetId, error });
        }

        pendingOptions.delete(assetId);
        formatDrafts.delete(assetId);
        promotedCount += 1;
      } catch (error) {
        promotionError = { assetId, error };
        break;
      }
    }

    try {
      if (promotedCount > 0) {
        options.onManifestUpdated?.(manifest);
      }
      syncTargetAsset(selectedTargetAssetId);
      renderAssetBrowser();
    } catch (error) {
      liveRefreshErrors.push({ assetId: selectedTargetAssetId, error });
    }

    activePromotionId = undefined;
    elements.panel.removeAttribute("aria-busy");
    elements.panel.removeAttribute("inert");
    syncPromoteAllButton();
    syncMixTilesetButton();

    if (promotionError) {
      setStatus(
        elements,
        `Promoted ${promotedCount}/${entries.length} assets. ` +
          `${readableAssetName(promotionError.assetId)} failed: ${errorMessage(promotionError.error)}`,
        "error"
      );
    } else if (liveRefreshErrors.length > 0) {
      const firstError = liveRefreshErrors[0]!;
      setStatus(
        elements,
        `Promoted all ${promotedCount} assets, but ${readableAssetName(firstError.assetId)} ` +
          `could not refresh live. Restart to load it. ${errorMessage(firstError.error)}`,
        "error"
      );
    } else {
      setStatus(elements, `Promoted all ${promotedCount} pending assets.`, "success");
    }

    if (options.restartOnPromote && promotedCount > 0) {
      window.location.reload();
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
      resolveAssetUrl,
      async onSelect(versionName, option) {
        const optionAsset = assetWithGeneratedGeometry(asset, option, { inheritAnimations: true });

        for (const item of elements.options.querySelectorAll(".ai-game-assets-designer__option")) {
          item.classList.remove("is-selected");
        }

        selectedOption = option;
        rememberPendingOption(selectedTargetAssetId, option, {
          inheritAnimations: true,
          previewedVersionName: versionName
        });
        showOptionInCurrentPreview(option, versionName);
        previewedVersionName = versionName;
        elements.currentPreview.classList.add("is-selected");
        elements.promoteButton.disabled = activePromotionId !== undefined;

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
            forgetPendingOption(selectedTargetAssetId);
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

  const previewBulkOption = (
    assetId: string,
    option: GeneratedDebugOption
  ): Promise<AiAssetDefinition> => new Promise((resolve, reject) => {
    const previewAsset = assetWithGeneratedGeometry(manifest.assets[assetId], option);
    previewImageSource({
      scene: options.scene,
      manifest,
      assetId,
      src: option.dataUrl,
      textureKey: `ai-bulk-preview:${assetId}:${Date.now()}`,
      assetOverride: previewAsset,
      onPreview(previewAssetId, textureKey, asset) {
        options.onPreview(previewAssetId, textureKey, asset);
        resolve(asset);
      },
      onError: reject
    });
  });

  const regenerateAllGraphicalAssets = async (styleGuide: DebugStyleGuideDraft) => {
    if (activeGeneration || activePromotionId !== undefined) return;

    const assetIds = expandAiAssetIds(manifest, visibleAssetIds(), {
      includeLinkedAnimations: true,
      targetId: selectedTargetId
    }).filter((assetId) => {
      const asset = manifest.assets[assetId];
      return Boolean(asset && asset.kind !== "collection" && !isAudioAsset(asset));
    });

    if (assetIds.length === 0) {
      setStatus(elements, "There are no graphical assets to regenerate.", "info");
      return;
    }

    const controller = new AbortController();
    const currentGenerationId = generationId + 1;
    generationId = currentGenerationId;
    activeGeneration = { controller, id: currentGenerationId };
    clearGeneratedOptions();
    syncPromoteAllButton();
    const failures: Array<{ assetId: string; error: unknown }> = [];
    let generatedCount = 0;

    for (const [index, assetId] of assetIds.entries()) {
      if (activeGeneration?.id !== currentGenerationId) return;

      setStatus(
        elements,
        `Regenerating ${readableAssetName(assetId)} (${index + 1}/${assetIds.length})...`,
        "busy"
      );

      try {
        const generated = await client.generate({
          assetId,
          count: 1,
          styleGuide
        }, {
          signal: controller.signal
        });
        const option = generated[0];
        if (!option) {
          throw new Error("Generation finished without an option.");
        }

        rememberPendingOption(assetId, option);
        const previewAsset = await previewBulkOption(assetId, option);
        const generatedTilesetAnimations: Record<string, string[]> = {};
        for (const animation of previewAsset.tileset?.animations ?? []) {
          setStatus(
            elements,
            `Regenerating ${readableAssetName(assetId)} · ` +
              `${readableAssetName(animation.key)} (${index + 1}/${assetIds.length})...`,
            "busy"
          );
          const candidates = await client.generateTilesetAnimationStream({
            assetId,
            animationKey: animation.key,
            prompt: animation.prompt,
            count: 1,
            baseDataUrl: option.dataUrl,
            styleGuide
          }, () => {}, {
            signal: controller.signal
          });
          const candidate = candidates[0];
          if (!candidate || candidate.frames.length !== animation.frameCount) {
            throw new Error(
              `${readableAssetName(animation.key)} did not return its ` +
                `${animation.frameCount} required frames.`
            );
          }
          const frameDataUrls = candidate.frames.map((frame) => frame.dataUrl);
          generatedTilesetAnimations[animation.key] = frameDataUrls;
          rememberPendingOption(assetId, option, {
            tilesetAnimations: { ...generatedTilesetAnimations }
          });
          await previewTilesetAnimationFrames(
            assetId,
            animation.key,
            frameDataUrls,
            previewAsset
          );
        }
        generatedCount += 1;

        if (selectedTargetAssetId === assetId) {
          selectedOption = option;
          showOptionInCurrentPreview(option, "regenerated preview");
          elements.currentPreview.classList.add("is-selected");
          elements.promoteButton.disabled = activePromotionId !== undefined;
        }
      } catch (error) {
        if (isAbortError(error)) return;
        failures.push({ assetId, error });
      }
    }

    if (!finishGeneration(currentGenerationId)) return;

    if (failures.length > 0) {
      const firstFailure = failures[0]!;
      setStatus(
        elements,
        `Regenerated ${generatedCount}/${assetIds.length} graphical assets. ` +
          `${readableAssetName(firstFailure.assetId)} failed: ${errorMessage(firstFailure.error)}`,
        "error"
      );
      return;
    }

    setStatus(
      elements,
      `Regenerated and previewed ${generatedCount} graphical assets. ` +
        "Use Promote all to save them.",
      "success"
    );
  };

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
      },
      async onRegenerateAll(draft) {
        try {
          await regenerateAllGraphicalAssets(await styleGuideRequest(draft));
        } catch (error) {
          setStatus(elements, `Bulk regeneration failed. ${errorMessage(error)}`, "error");
        }
      }
    });
  });

  elements.currentAnimationButton.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
    const asset = manifest.assets[selectedTargetAssetId];
    const activeVersion = asset.versions[asset.activeVersion];
    const sourceOption = editedCurrentOption;

    if (!sourceOption && !activeVersion?.file) return;

    if (isAudioAsset(asset)) {
      void openAudioEditor({
        root: elements.root,
        asset,
        assetId: selectedTargetAssetId,
        src: sourceOption?.dataUrl ?? resolveAssetUrl(activeVersion!.file),
        initialPlayback: sourceOption?.audioPlayback ?? activeVersion?.audioPlayback,
        onConfirm: async (audioPlayback) => {
          const previousOption = editedCurrentOption;
          const dataUrl = previousOption?.dataUrl ??
            await imageSourceToDataUrl(resolveAssetUrl(activeVersion!.file));
          const optionAsset = {
            ...asset,
            audioPlayback
          };

          editedCurrentOption = {
            ...previousOption,
            index: previousOption?.index ?? -1,
            dataUrl,
            mimeType: mimeTypeFromDataUrl(dataUrl),
            prompt: previousOption?.prompt ?? activeVersion?.prompt ?? asset.prompt,
            model: previousOption?.model ?? activeVersion?.model,
            revisedPrompt: previousOption?.revisedPrompt ?? activeVersion?.revisedPrompt,
            audioSettings: previousOption?.audioSettings ?? activeVersion?.audioSettings ?? asset.audioSettings,
            audioPlayback,
            voiceSettings: previousOption?.voiceSettings ?? activeVersion?.voiceSettings ?? asset.voiceSettings,
            durationSeconds: previousOption?.durationSeconds ?? activeVersion?.durationSeconds
          };
          selectedOption = editedCurrentOption;
          rememberPendingOption(selectedTargetAssetId, editedCurrentOption, {
            inheritAnimations: Boolean(previewedVersionName),
            previewedVersionName
          });
          elements.promoteButton.disabled = activePromotionId !== undefined;
          elements.currentRevertButton.hidden = false;
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

    const editorAsset = sourceOption
      ? assetWithGeneratedGeometry(asset, sourceOption, {
          inheritAnimations: Boolean(previewedVersionName)
        })
      : asset;

    if (!editorAsset.frameGrid) return;

    void openAnimationEditor({
      root: elements.root,
      asset: editorAsset,
      assetId: selectedTargetAssetId,
      src: sourceOption?.dataUrl ?? resolveAssetUrl(activeVersion!.file),
      displaySize: resolvePreviewDisplaySize(options, selectedTargetAssetId, editorAsset),
      initialAnimations: sourceOption?.animations ?? editorAsset.animations,
      onConfirm: async ({ animations, dataUrl: editedDataUrl }) => {
        const previousOption = editedCurrentOption;
        const dataUrl = editedDataUrl ??
          previousOption?.dataUrl ??
          await imageSourceToDataUrl(resolveAssetUrl(activeVersion!.file));
        const optionAsset = {
          ...editorAsset,
          animations
        };

        editedCurrentOption = {
          ...previousOption,
          index: previousOption?.index ?? -1,
          dataUrl,
          mimeType: mimeTypeFromDataUrl(dataUrl),
          prompt: previousOption?.prompt ?? activeVersion?.prompt ?? asset.prompt,
          model: previousOption?.model ?? activeVersion?.model,
          revisedPrompt: previousOption?.revisedPrompt ?? activeVersion?.revisedPrompt,
          dimensions: previousOption?.dimensions ?? editorAsset.dimensions,
          frameGrid: previousOption?.frameGrid ?? editorAsset.frameGrid,
          settings: previousOption?.settings ?? activeVersion?.settings ?? asset.settings,
          animations
        };
        selectedOption = editedCurrentOption;
        rememberPendingOption(selectedTargetAssetId, editedCurrentOption, {
          inheritAnimations: Boolean(previewedVersionName),
          previewedVersionName
        });
        elements.promoteButton.disabled = activePromotionId !== undefined;
        elements.currentRevertButton.hidden = false;
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

    const sourceOption = editedCurrentOption;
    const editorAsset = sourceOption
      ? assetWithGeneratedGeometry(asset, sourceOption)
      : asset;

    if (
      (!sourceOption && !activeVersion?.file) ||
      isAudioAsset(asset) ||
      editorAsset.frameGrid ||
      sourceOption?.mimeType === "image/svg+xml" ||
      (!sourceOption && (
        normalizeAssetFormat(asset.settings?.format) === "svg" ||
        isSvgSource(activeVersion!.file)
      ))
    ) {
      return;
    }

    if (isDesignerTilesetAsset(editorAsset)) {
      const assetId = selectedTargetAssetId;
      const editorTileset = tilesetMetadataForAsset(editorAsset)!;
      const draftTiles = tilesetPromptDefinitions(
        assetId,
        editorTileset.tileCount ?? editorTileset.columns * editorTileset.rows
      );
      const tilesetEditorAsset = draftTiles ? {
        ...editorAsset,
        tileset: {
          ...editorTileset,
          tiles: draftTiles
        }
      } : editorAsset;
      void openTilesetEditor({
        root: elements.root,
        asset: tilesetEditorAsset,
        assetId,
        src: sourceOption?.dataUrl ?? resolveAssetUrl(activeVersion!.file),
        regenerateTile: (tile, tileset, currentTileSrc) =>
          regenerateTilesetTile(assetId, tile, tileset, currentTileSrc),
        onConfirm: async ({ dataUrl }) => {
          const previousOption = editedCurrentOption;
          const optionAsset = {
            ...tilesetEditorAsset,
            dimensions: previousOption?.dimensions ?? tilesetEditorAsset.dimensions,
            tileset: tilesetEditorAsset.tileset,
            settings: {
              ...(previousOption?.settings ?? activeVersion?.settings ?? tilesetEditorAsset.settings),
              format: "png" as const
            }
          };

          editedCurrentOption = {
            ...previousOption,
            index: previousOption?.index ?? -1,
            dataUrl,
            mimeType: "image/png",
            prompt: previousOption?.prompt ?? activeVersion?.prompt ?? asset.prompt,
            model: previousOption?.model ?? activeVersion?.model,
            revisedPrompt: previousOption?.revisedPrompt ?? activeVersion?.revisedPrompt,
            dimensions: optionAsset.dimensions,
            tileset: optionAsset.tileset,
            settings: optionAsset.settings
          };
          selectedOption = editedCurrentOption;
          rememberPendingOption(assetId, editedCurrentOption, {
            inheritAnimations: Boolean(previewedVersionName),
            previewedVersionName
          });
          elements.currentImage.src = dataUrl;
          elements.currentPreview.classList.add("is-selected");
          elements.currentRevertButton.hidden = false;
          elements.promoteButton.disabled = activePromotionId !== undefined;
          previewImageSource({
            scene: options.scene,
            manifest,
            assetId,
            src: dataUrl,
            textureKey: `ai-current-tileset-edit:${assetId}:${Date.now()}`,
            assetOverride: optionAsset,
            onPreview: options.onPreview
          });
          setStatus(elements, "Tileset edits applied. Promote to save them to code.", "success");
        }
      });
      return;
    }

    void openFrameTouchUpEditor({
      root: elements.root,
      asset: editorAsset,
      title: readableAssetName(selectedTargetAssetId),
      frameSrc: sourceOption?.dataUrl ?? resolveAssetUrl(activeVersion!.file),
      displaySize: resolvePreviewDisplaySize(options, selectedTargetAssetId, asset),
      onSave: async (dataUrl) => {
        const previousOption = editedCurrentOption;
        const optionAsset = {
          ...asset,
          dimensions: previousOption?.dimensions ?? asset.dimensions
        };

        editedCurrentOption = {
          ...previousOption,
          index: previousOption?.index ?? -1,
          dataUrl,
          mimeType: mimeTypeFromDataUrl(dataUrl),
          prompt: previousOption?.prompt ?? activeVersion?.prompt ?? asset.prompt,
          model: previousOption?.model ?? activeVersion?.model,
          revisedPrompt: previousOption?.revisedPrompt ?? activeVersion?.revisedPrompt,
          dimensions: previousOption?.dimensions ?? asset.dimensions,
          settings: previousOption?.settings ?? activeVersion?.settings ?? asset.settings
        };
        selectedOption = editedCurrentOption;
        rememberPendingOption(selectedTargetAssetId, editedCurrentOption, {
          inheritAnimations: Boolean(previewedVersionName),
          previewedVersionName
        });
        elements.currentImage.src = dataUrl;
        elements.currentPreview.classList.add("is-selected");
        elements.currentRevertButton.hidden = false;
        elements.promoteButton.disabled = activePromotionId !== undefined;
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
      assetIds: visibleAssetIds(),
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
      dockPanel.destroy();
      elements.root.remove();
    }
  };
}

function visibleDesignerAssetIds(
  manifest: AiAssetManifest,
  options: AiAssetDesignerOptions
): string[] {
  const configuredAssetIds = options.assetIds
    ? options.assetIds.filter((assetId) => Boolean(manifest.assets[assetId]))
    : topLevelAiAssetIds(manifest);

  if (options.showLinkedAnimationAssets) {
    return configuredAssetIds;
  }

  const linkedAssetIds = new Set(linkedAnimationAssetIds(manifest));
  const visibleAssetIds = configuredAssetIds.filter((assetId) => !linkedAssetIds.has(assetId));

  return visibleAssetIds.length > 0 ? visibleAssetIds : configuredAssetIds;
}
