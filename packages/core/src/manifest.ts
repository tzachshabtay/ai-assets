import type {
  AiAssetDefinition,
  AiAssetManifest,
  AiAssetSelection,
  AiAssetStyleGuide,
  AiAssetTarget,
  AiAssetVersion,
  ResolvedAiAsset
} from "./types.js";

export function defineAiAsset(asset: AiAssetDefinition): AiAssetDefinition {
  assertAsset(asset);
  return asset;
}

export function defineAiAssets(
  assets: Record<string, AiAssetDefinition>,
  options: {
    styleGuide?: AiAssetStyleGuide;
    targets?: Record<string, AiAssetTarget>;
  } = {}
): AiAssetManifest {
  const manifest: AiAssetManifest = {
    schemaVersion: 1,
    assets,
    styleGuide: options.styleGuide,
    targets: options.targets
  };

  assertManifest(manifest);
  return manifest;
}

export function assertManifest(manifest: AiAssetManifest): void {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported AI asset manifest schema: ${manifest.schemaVersion}`);
  }

  for (const [id, asset] of Object.entries(manifest.assets)) {
    if (id !== asset.id) {
      throw new Error(`Asset key "${id}" does not match asset id "${asset.id}".`);
    }

    assertAsset(asset);
  }

  if (manifest.styleGuide?.prompt !== undefined && !manifest.styleGuide.prompt.trim()) {
    throw new Error("styleGuide.prompt must be non-empty when provided.");
  }

  for (const [index, image] of (manifest.styleGuide?.images ?? []).entries()) {
    assertNonEmpty(image.name, `styleGuide.images.${index}.name`);
    assertNonEmpty(image.file, `styleGuide.images.${index}.file`);
  }

  for (const [targetId, target] of Object.entries(manifest.targets ?? {})) {
    assertTarget(manifest, targetId, target);
  }
}

export function assertAsset(asset: AiAssetDefinition): void {
  assertNonEmpty(asset.id, "asset.id");
  assertNonEmpty(asset.prompt, `${asset.id}.prompt`);
  if (asset.dimensions) {
    assertPositiveInteger(asset.dimensions.width, `${asset.id}.dimensions.width`);
    assertPositiveInteger(asset.dimensions.height, `${asset.id}.dimensions.height`);
  } else if (!isAudioLikeAsset(asset.kind)) {
    throw new Error(`${asset.id}.dimensions is required for graphical assets.`);
  }

  if (asset.audioSettings?.durationSeconds !== undefined) {
    assertPositiveNumber(asset.audioSettings.durationSeconds, `${asset.id}.audioSettings.durationSeconds`);
  }

  if (asset.kind === "collection") {
    if (Object.keys(asset.versions).length > 0) {
      throw new Error(`Collection asset "${asset.id}" must not define versions.`);
    }
  } else if (Object.keys(asset.versions).length === 0) {
    if (asset.activeVersion) {
      throw new Error(
        `Asset "${asset.id}" with no versions must use an empty activeVersion.`
      );
    }
  } else if (!asset.versions[asset.activeVersion]) {
    throw new Error(
      `Asset "${asset.id}" activeVersion "${asset.activeVersion}" is missing from versions.`
    );
  }

  if (asset.frameGrid) {
    if (asset.frameGrid.frameCount !== undefined) {
      assertPositiveInteger(asset.frameGrid.frameCount, `${asset.id}.frameGrid.frameCount`);
    }
    assertPositiveInteger(asset.frameGrid.frameWidth, `${asset.id}.frameGrid.frameWidth`);
    assertPositiveInteger(asset.frameGrid.frameHeight, `${asset.id}.frameGrid.frameHeight`);
    assertPositiveInteger(asset.frameGrid.columns, `${asset.id}.frameGrid.columns`);
    assertPositiveInteger(asset.frameGrid.rows, `${asset.id}.frameGrid.rows`);
  }

  for (const [key, linkedAnimation] of Object.entries(asset.linkedAnimationAssets ?? {})) {
    assertNonEmpty(key, `${asset.id}.linkedAnimationAssets key`);
    assertNonEmpty(linkedAnimation.label, `${asset.id}.linkedAnimationAssets.${key}.label`);
    assertNonEmpty(linkedAnimation.assetId, `${asset.id}.linkedAnimationAssets.${key}.assetId`);
  }

  for (const animation of asset.animations ?? []) {
    assertNonEmpty(animation.key, `${asset.id}.animations.key`);
    assertPositiveInteger(animation.frameRate, `${asset.id}.animations.${animation.key}.frameRate`);

    for (const timing of animation.frameTimings ?? []) {
      if (timing.delayMs !== undefined) {
        assertPositiveInteger(timing.delayMs, `${asset.id}.animations.${animation.key}.frameTimings.delayMs`);
      }
    }
  }

  for (const [versionName, version] of Object.entries(asset.versions)) {
    assertVersion(asset.id, versionName, version);
  }
}

function isAudioLikeAsset(kind: AiAssetDefinition["kind"]): boolean {
  return kind === "sound" || kind === "music" || kind === "voice" || kind === "voice-line";
}

export function resolveAiAsset(
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string
): ResolvedAiAsset {
  const requestedAssetId = typeof selection === "string" ? selection : selection.assetId;
  const targetId = typeof selection === "string" ? undefined : selection.targetId;
  const assetId = resolveTargetAssetId(manifest, requestedAssetId, targetId);
  const versionName =
    typeof selection === "string" ? undefined : selection.versionName;
  const asset = manifest.assets[assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${assetId}" resolved from "${requestedAssetId}".`);
  }

  const resolvedVersionName = versionName ?? asset.activeVersion;
  const version = asset.versions[resolvedVersionName];

  if (!version) {
    throw new Error(
      `Unknown version "${resolvedVersionName}" for AI asset "${assetId}".`
    );
  }

  return {
    asset,
    versionName: resolvedVersionName,
    version
  };
}

export function resolveTargetAssetId(
  manifest: AiAssetManifest,
  assetId: string,
  targetId?: string
): string {
  if (!targetId) return assetId;

  const target = manifest.targets?.[targetId];

  if (!target) {
    throw new Error(`Unknown AI asset target "${targetId}".`);
  }

  return target.variants[assetId] ?? assetId;
}

export function getActiveVersion(asset: AiAssetDefinition): AiAssetVersion {
  const version = asset.versions[asset.activeVersion];

  if (!version) {
    throw new Error(
      `Asset "${asset.id}" activeVersion "${asset.activeVersion}" is missing.`
    );
  }

  return version;
}

export function withActiveVersion(
  asset: AiAssetDefinition,
  activeVersion: string
): AiAssetDefinition {
  if (!asset.versions[activeVersion]) {
    throw new Error(`Cannot activate missing version "${activeVersion}" on "${asset.id}".`);
  }

  return {
    ...asset,
    activeVersion
  };
}

function assertVersion(
  assetId: string,
  versionName: string,
  version: AiAssetVersion
): void {
  assertNonEmpty(versionName, `${assetId}.versions key`);
  assertNonEmpty(version.name, `${assetId}.versions.${versionName}.name`);
  assertNonEmpty(version.file, `${assetId}.versions.${versionName}.file`);
  assertNonEmpty(version.prompt, `${assetId}.versions.${versionName}.prompt`);
  assertNonEmpty(version.createdAt, `${assetId}.versions.${versionName}.createdAt`);
}

function assertTarget(
  manifest: AiAssetManifest,
  targetId: string,
  target: AiAssetTarget
): void {
  assertNonEmpty(targetId, "targets key");
  assertNonEmpty(target.id, `${targetId}.id`);

  if (target.id !== targetId) {
    throw new Error(`Target key "${targetId}" does not match target id "${target.id}".`);
  }

  for (const [assetId, variantAssetId] of Object.entries(target.variants)) {
    assertNonEmpty(assetId, `${targetId}.variants key`);
    assertNonEmpty(variantAssetId, `${targetId}.variants.${assetId}`);

    if (!manifest.assets[assetId]) {
      throw new Error(`Target "${targetId}" references unknown asset "${assetId}".`);
    }

    if (!manifest.assets[variantAssetId]) {
      throw new Error(
        `Target "${targetId}" maps "${assetId}" to unknown variant asset "${variantAssetId}".`
      );
    }
  }
}

function assertNonEmpty(value: string | undefined, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}
