import type {
  AiAssetDefinition,
  AiAssetManifest,
  AiAssetSelection,
  AiAssetVersion,
  ResolvedAiAsset
} from "./types.js";

export function defineAiAsset(asset: AiAssetDefinition): AiAssetDefinition {
  assertAsset(asset);
  return asset;
}

export function defineAiAssets(
  assets: Record<string, AiAssetDefinition>
): AiAssetManifest {
  const manifest: AiAssetManifest = {
    schemaVersion: 1,
    assets
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
}

export function assertAsset(asset: AiAssetDefinition): void {
  assertNonEmpty(asset.id, "asset.id");
  assertNonEmpty(asset.prompt, `${asset.id}.prompt`);
  assertPositiveInteger(asset.dimensions.width, `${asset.id}.dimensions.width`);
  assertPositiveInteger(asset.dimensions.height, `${asset.id}.dimensions.height`);

  if (!asset.versions[asset.activeVersion]) {
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

export function resolveAiAsset(
  manifest: AiAssetManifest,
  selection: AiAssetSelection | string
): ResolvedAiAsset {
  const assetId = typeof selection === "string" ? selection : selection.assetId;
  const versionName =
    typeof selection === "string" ? undefined : selection.versionName;
  const asset = manifest.assets[assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${assetId}".`);
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
