import {
  addVersion,
  assertManifest,
  createAiAssetVersion,
  type AiAssetDefinition,
  type AiAssetManifest,
  type AiAssetStyleGuide,
  type AiAssetTarget,
  type AiAssetVersion,
  type AiTilesetAnimation,
  type AiTilesetTileTransform,
  type GeneratedAssetOption
} from "./internal.js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

export type AssetStoreOptions = {
  manifestPath: string;
  assetsDir: string;
  publicPathPrefix?: string;
  manifestModulePath?: string;
};

export type SaveGeneratedOptionInput = {
  assetId: string;
  versionName: string;
  option: GeneratedAssetOption;
  tilesetSource?: {
    image: Uint8Array;
    mimeType: string;
  };
  tilesetTransforms?: AiTilesetTileTransform[];
  activate?: boolean;
  notes?: string;
};

export type SaveGeneratedOptionResult = {
  manifest: AiAssetManifest;
  version: AiAssetVersion;
  filePath: string;
};

export type TilesetAnimationFrameInput = {
  image: Uint8Array;
  mimeType: string;
};

export type SaveTilesetAnimationInput = {
  assetId: string;
  animationKey: string;
  frames: TilesetAnimationFrameInput[];
  definition?: AiTilesetAnimation;
  versionName?: string;
  notes?: string;
};

export type SaveTilesetAnimationResult = {
  manifest: AiAssetManifest;
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
  filePath: string;
  animationFilePaths: string[];
};

export type SaveStyleGuideInput = {
  prompt?: string;
  images: Array<{
    name: string;
    mimeType: string;
    image: Uint8Array;
  }>;
};

export type DeleteAssetVersionInput = {
  assetId: string;
  versionName: string;
};

export type EnsureTargetVariantInput = {
  targetId: string;
  assetId: string;
};

export type EnsureTargetVariantResult = {
  manifest: AiAssetManifest;
  assetId: string;
};

export async function readManifest(manifestPath: string): Promise<AiAssetManifest> {
  if (await isDirectory(manifestPath)) {
    return readManifestDirectory(manifestPath);
  }

  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as AiAssetManifest;
  assertManifest(manifest);
  return manifest;
}

export async function writeManifest(
  manifestPath: string,
  manifest: AiAssetManifest
): Promise<void> {
  if (await isDirectory(manifestPath)) {
    await writeManifestDirectory(manifestPath, manifest);
    return;
  }

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);
}

export async function saveGeneratedOption(
  options: AssetStoreOptions,
  input: SaveGeneratedOptionInput
): Promise<SaveGeneratedOptionResult> {
  const manifest = await readManifest(options.manifestPath);
  const asset = manifest.assets[input.assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${input.assetId}".`);
  }

  const extension = extensionFromMimeType(input.option.mimeType);
  const fileName = `${sanitizeFilePart(input.assetId)}.${sanitizeFilePart(input.versionName)}.${extension}`;
  const filePath = path.join(options.assetsDir, fileName);
  const publicFile =
    options.publicPathPrefix ? `${options.publicPathPrefix}/${fileName}` : fileName;

  assertTilesetEditInput(asset, input);
  const tilesetSourceExtension = input.tilesetSource
    ? extensionFromMimeType(input.tilesetSource.mimeType)
    : undefined;
  const tilesetSourceFileName = tilesetSourceExtension
    ? `${sanitizeFilePart(input.assetId)}.${sanitizeFilePart(input.versionName)}.tileset-source.${tilesetSourceExtension}`
    : undefined;
  const tilesetSourceFilePath = tilesetSourceFileName
    ? path.join(options.assetsDir, tilesetSourceFileName)
    : undefined;
  const publicTilesetSourceFile = tilesetSourceFileName
    ? publicAssetFile(options, tilesetSourceFileName)
    : undefined;

  await mkdir(options.assetsDir, { recursive: true });
  await Promise.all([
    writeFile(filePath, input.option.image),
    ...(tilesetSourceFilePath && input.tilesetSource
      ? [writeFile(tilesetSourceFilePath, input.tilesetSource.image)]
      : [])
  ]);

  const version = createAiAssetVersion(asset, {
    name: input.versionName,
    file: publicFile,
    prompt: input.option.prompt,
    model: input.option.model,
    revisedPrompt: input.option.revisedPrompt,
    settings: input.option.settings,
    audioSettings: input.option.audioSettings,
    audioPlayback: input.option.audioPlayback,
    voiceSettings: input.option.voiceSettings,
    durationSeconds: input.option.durationSeconds,
    parentVersion: asset.activeVersion || undefined,
    notes: input.notes,
    tilesetSourceFile: publicTilesetSourceFile,
    tilesetTransforms: input.tilesetTransforms
  });

  // Promoting a newly generated tileset base intentionally starts a clean
  // bundle. Its animation sheets describe the previous base's exact pixels
  // and must be regenerated (or explicitly composed via saveTilesetAnimation).

  const updatedAsset = addVersion(asset, input.versionName, version, {
    activate: input.activate
  });

  manifest.assets[input.assetId] = input.activate
    ? {
        ...updatedAsset,
        prompt: version.prompt,
        dimensions: input.option.dimensions ?? updatedAsset.dimensions,
        frameGrid: input.option.frameGrid ?? updatedAsset.frameGrid,
        tileset: input.option.tileset ?? updatedAsset.tileset,
        animations: input.option.animations ?? updatedAsset.animations,
        settings: {
          ...updatedAsset.settings,
          ...version.settings
        },
        audioSettings: {
          ...updatedAsset.audioSettings,
          ...version.audioSettings
        },
        audioPlayback: {
          ...updatedAsset.audioPlayback,
          ...version.audioPlayback
        },
        voiceSettings: {
          ...updatedAsset.voiceSettings,
          ...version.voiceSettings
        }
      }
    : updatedAsset;

  assertManifest(manifest);
  await writeManifest(options.manifestPath, manifest);

  if (options.manifestModulePath) {
    await writeManifestModule(options.manifestModulePath, manifest);
  }

  return {
    manifest,
    version,
    filePath
  };
}

export async function saveTilesetAnimation(
  options: AssetStoreOptions,
  input: SaveTilesetAnimationInput
): Promise<SaveTilesetAnimationResult> {
  const manifest = await readManifest(options.manifestPath);
  const previousManifest = structuredClone(manifest);
  const asset = manifest.assets[input.assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${input.assetId}".`);
  }
  if (asset.kind !== "tileset" || !asset.tileset) {
    throw new Error(`AI asset "${input.assetId}" is not a tileset.`);
  }

  const declaredAnimation = asset.tileset.animations?.find(
    (candidate) => candidate.key === input.animationKey
  );
  if (!declaredAnimation) {
    throw new Error(
      `Unknown tileset animation "${input.animationKey}" for AI asset "${input.assetId}".`
    );
  }
  const animation = input.definition ?? declaredAnimation;
  if (animation.key !== input.animationKey) {
    throw new Error("Tileset animation definition key must match animationKey.");
  }
  const assetDefinition = input.definition ? {
    ...asset,
    tileset: {
      ...asset.tileset,
      animations: (asset.tileset.animations ?? []).map((candidate) => (
        candidate.key === input.animationKey ? animation : candidate
      ))
    }
  } : asset;
  if (input.frames.length !== animation.frameCount) {
    throw new Error(
      `Tileset animation "${input.animationKey}" requires exactly ${animation.frameCount} frames.`
    );
  }
  const dimensions = asset.dimensions;
  if (!dimensions) {
    throw new Error(`AI tileset "${input.assetId}" requires dimensions.`);
  }
  for (const [index, frame] of input.frames.entries()) {
    if (!frame.image.byteLength || frame.mimeType !== "image/png") {
      throw new Error(`Tileset animation frame ${index + 1} must be a non-empty PNG image.`);
    }

    let png: PNG;
    try {
      png = PNG.sync.read(Buffer.from(frame.image));
    } catch {
      throw new Error(`Tileset animation frame ${index + 1} is not a valid PNG image.`);
    }
    if (png.width !== dimensions.width || png.height !== dimensions.height) {
      throw new Error(
        `Tileset animation frame ${index + 1} must be ${dimensions.width}x${dimensions.height}; received ${png.width}x${png.height}.`
      );
    }
  }

  const sourceVersionName = asset.activeVersion;
  const sourceVersion = asset.versions[sourceVersionName];
  if (!sourceVersion) {
    throw new Error(`AI tileset "${input.assetId}" requires an active base version.`);
  }

  const versionName = input.versionName?.trim() ||
    `${sourceVersionName}.${sanitizeFilePart(input.animationKey)}.${Date.now()}`;
  if (asset.versions[versionName]) {
    throw new Error(`Version "${versionName}" already exists for AI asset "${input.assetId}".`);
  }

  const transactionId = randomUUID();
  const fileStem = [
    sanitizeFilePart(input.assetId),
    sanitizeFilePart(versionName),
    transactionId.slice(0, 8)
  ].join(".");
  const pendingFiles: Array<{
    image: Uint8Array;
    fileName: string;
    filePath: string;
    temporaryPath: string;
    publicFile: string;
  }> = [];

  const queueFile = (fileName: string, image: Uint8Array) => {
    const filePath = path.join(options.assetsDir, fileName);
    pendingFiles.push({
      image,
      fileName,
      filePath,
      temporaryPath: `${filePath}.tmp-${transactionId}`,
      publicFile: publicAssetFile(options, fileName)
    });
  };

  const baseExtension = extensionFromFileName(sourceVersion.file);
  queueFile(
    `${fileStem}.${baseExtension}`,
    await readStoredAssetFile(options, sourceVersion.file)
  );

  let tilesetSourceFile: (typeof pendingFiles)[number] | undefined;
  if (sourceVersion.tilesetSourceFile) {
    const sourceExtension = extensionFromFileName(sourceVersion.tilesetSourceFile);
    queueFile(
      `${fileStem}.tileset-source.${sourceExtension}`,
      await readStoredAssetFile(options, sourceVersion.tilesetSourceFile)
    );
    tilesetSourceFile = pendingFiles.at(-1);
  }

  const sequenceFiles: Record<string, { files: string[] }> = {};
  for (const definition of assetDefinition.tileset?.animations ?? []) {
    if (definition.key === input.animationKey) {
      const publicFiles: string[] = [];
      for (const [index, frame] of input.frames.entries()) {
        const extension = extensionFromMimeType(frame.mimeType);
        const fileName = `${fileStem}.tileset.${sanitizeFilePart(definition.key)}.${index + 1}.${extension}`;
        queueFile(fileName, frame.image);
        publicFiles.push(publicAssetFile(options, fileName));
      }
      sequenceFiles[definition.key] = { files: publicFiles };
      continue;
    }

    const sourceSequence = sourceVersion.tilesetAnimations?.[definition.key];
    if (!sourceSequence) continue;

    const publicFiles: string[] = [];
    for (const [index, sourceFile] of sourceSequence.files.entries()) {
      const extension = extensionFromFileName(sourceFile);
      const fileName = `${fileStem}.tileset.${sanitizeFilePart(definition.key)}.${index + 1}.${extension}`;
      queueFile(fileName, await readStoredAssetFile(options, sourceFile));
      publicFiles.push(publicAssetFile(options, fileName));
    }
    sequenceFiles[definition.key] = { files: publicFiles };
  }

  await mkdir(options.assetsDir, { recursive: true });
  const committedPaths: string[] = [];
  let manifestWritten = false;

  try {
    await Promise.all(
      pendingFiles.map((file) => writeFile(file.temporaryPath, file.image))
    );
    for (const file of pendingFiles) {
      await rename(file.temporaryPath, file.filePath);
      committedPaths.push(file.filePath);
    }

    const baseFile = pendingFiles[0];
    if (!baseFile) {
      throw new Error(`AI tileset "${input.assetId}" did not produce a base file.`);
    }
    const version = createAiAssetVersion(assetDefinition, {
      name: versionName,
      file: baseFile.publicFile,
      prompt: sourceVersion.prompt,
      model: sourceVersion.model,
      revisedPrompt: sourceVersion.revisedPrompt,
      settings: sourceVersion.settings,
      parentVersion: sourceVersionName,
      notes: input.notes,
      tilesetAnimations: sequenceFiles,
      tilesetSourceFile: tilesetSourceFile?.publicFile,
      tilesetTransforms: sourceVersion.tilesetTransforms
    });
    const updatedAsset = addVersion(assetDefinition, versionName, version, { activate: true });
    manifest.assets[input.assetId] = updatedAsset;
    assertManifest(manifest);
    await writeManifest(options.manifestPath, manifest);
    manifestWritten = true;

    if (options.manifestModulePath) {
      try {
        await writeManifestModule(options.manifestModulePath, manifest);
      } catch (error) {
        try {
          await writeManifest(options.manifestPath, previousManifest);
          manifestWritten = false;
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Tileset animation was saved, but manifest module generation and manifest rollback both failed."
          );
        }
        throw error;
      }
    }

    return {
      manifest,
      asset: updatedAsset,
      versionName,
      version,
      filePath: baseFile.filePath,
      animationFilePaths: pendingFiles
        .filter((file) => file !== baseFile && file !== tilesetSourceFile)
        .map((file) => file.filePath)
    };
  } catch (error) {
    await Promise.all(
      pendingFiles.map((file) => unlinkIfPresent(file.temporaryPath))
    );
    if (!manifestWritten) {
      await Promise.all(committedPaths.map((filePath) => unlinkIfPresent(filePath)));
    }
    throw error;
  }
}

export async function saveStyleGuide(
  options: AssetStoreOptions,
  input: SaveStyleGuideInput
): Promise<AiAssetManifest> {
  const manifest = await readManifest(options.manifestPath);
  const timestamp = Date.now();
  const images: NonNullable<AiAssetStyleGuide["images"]> = [];

  await mkdir(options.assetsDir, { recursive: true });

  for (const [index, image] of input.images.entries()) {
    const extension = extensionFromMimeType(image.mimeType);
    const fileName = `style-guide.${timestamp}.${index + 1}.${extension}`;
    const filePath = path.join(options.assetsDir, fileName);
    const publicFile =
      options.publicPathPrefix ? `${options.publicPathPrefix}/${fileName}` : fileName;

    await writeFile(filePath, image.image);
    images.push({
      name: image.name,
      file: publicFile,
      mimeType: image.mimeType
    });
  }

  const prompt = input.prompt?.trim() || undefined;
  manifest.styleGuide = prompt || images.length ? { prompt, images } : undefined;
  await writeManifest(options.manifestPath, manifest);

  if (options.manifestModulePath) {
    await writeManifestModule(options.manifestModulePath, manifest);
  }

  return manifest;
}

export async function deleteAssetVersion(
  options: AssetStoreOptions,
  input: DeleteAssetVersionInput
): Promise<AiAssetManifest> {
  const manifest = await readManifest(options.manifestPath);
  const asset = manifest.assets[input.assetId];

  if (!asset) {
    throw new Error(`Unknown AI asset "${input.assetId}".`);
  }

  if (!asset.versions[input.versionName]) {
    throw new Error(`Unknown version "${input.versionName}" for AI asset "${input.assetId}".`);
  }

  if (asset.activeVersion === input.versionName) {
    throw new Error(`Cannot delete active version "${input.versionName}" for AI asset "${input.assetId}".`);
  }

  const deletedVersion = asset.versions[input.versionName];
  const { [input.versionName]: _deleted, ...remainingVersions } = asset.versions;
  manifest.assets[input.assetId] = {
    ...asset,
    versions: remainingVersions
  };

  assertManifest(manifest);

  await writeManifest(options.manifestPath, manifest);

  if (options.manifestModulePath) {
    await writeManifestModule(options.manifestModulePath, manifest);
  }

  // Target variants initially share their source asset's immutable version
  // files. Only clean up paths which no remaining version still references.
  // The manifest is committed first so a cleanup failure can leave at worst
  // an orphaned file, never a live version pointing at a deleted one.
  await deleteUnreferencedVersionFiles(options, manifest, deletedVersion);

  return manifest;
}

export async function ensureTargetVariant(
  options: AssetStoreOptions,
  input: EnsureTargetVariantInput
): Promise<EnsureTargetVariantResult> {
  const manifest = await readManifest(options.manifestPath);
  const sourceAsset = manifest.assets[input.assetId];
  const target = manifest.targets?.[input.targetId];

  if (!sourceAsset) {
    throw new Error(`Unknown AI asset "${input.assetId}".`);
  }

  if (!target) {
    throw new Error(`Unknown AI asset target "${input.targetId}".`);
  }

  const existingVariantAssetId = target.variants[input.assetId];

  if (existingVariantAssetId) {
    if (!manifest.assets[existingVariantAssetId]) {
      throw new Error(
        `Target "${input.targetId}" maps "${input.assetId}" to unknown variant asset "${existingVariantAssetId}".`
      );
    }

    return {
      manifest,
      assetId: existingVariantAssetId
    };
  }

  const variantAssetId = uniqueAssetId(
    manifest,
    `${input.assetId}.${slugifyTargetId(input.targetId)}`
  );
  manifest.assets[variantAssetId] = {
    ...sourceAsset,
    id: variantAssetId,
    versions: Object.fromEntries(
      Object.entries(sourceAsset.versions).map(([versionName, version]) => [
        versionName,
        {
          ...version,
          tilesetTransforms: version.tilesetTransforms?.map((transform) => ({ ...transform })),
          tilesetAnimations: version.tilesetAnimations
            ? Object.fromEntries(
                Object.entries(version.tilesetAnimations).map(([key, sequence]) => [
                  key,
                  { files: [...sequence.files] }
                ])
              )
            : undefined
        }
      ])
    ),
    linkedAnimationAssets: sourceAsset.linkedAnimationAssets
      ? { ...sourceAsset.linkedAnimationAssets }
      : undefined,
    settings: sourceAsset.settings ? { ...sourceAsset.settings } : undefined,
    audioSettings: sourceAsset.audioSettings ? { ...sourceAsset.audioSettings } : undefined,
    audioPlayback: sourceAsset.audioPlayback ? { ...sourceAsset.audioPlayback } : undefined,
    voiceSettings: sourceAsset.voiceSettings ? { ...sourceAsset.voiceSettings } : undefined,
    tileset: sourceAsset.tileset
      ? {
          ...sourceAsset.tileset,
          tiles: sourceAsset.tileset.tiles?.map((tile) => ({ ...tile })),
          animations: sourceAsset.tileset.animations?.map((animation) => ({
            ...animation,
            frameTimings: animation.frameTimings?.map((timing) => ({ ...timing }))
          }))
        }
      : undefined,
    tags: sourceAsset.tags ? [...sourceAsset.tags] : undefined
  };
  manifest.assetPaths = {
    ...manifest.assetPaths,
    [variantAssetId]: manifest.assetPaths?.[input.assetId] ?? inferAssetFolder(sourceAsset)
  };
  manifest.targets = {
    ...manifest.targets,
    [input.targetId]: {
      ...target,
      variants: {
        ...target.variants,
        [input.assetId]: variantAssetId
      }
    }
  };

  await writeManifest(options.manifestPath, manifest);

  if (options.manifestModulePath) {
    await writeManifestModule(options.manifestModulePath, manifest);
  }

  return {
    manifest,
    assetId: variantAssetId
  };
}

export async function writeManifestModule(
  modulePath: string,
  manifest: AiAssetManifest
): Promise<void> {
  await mkdir(path.dirname(modulePath), { recursive: true });
  const styleGuideArgument = manifest.styleGuide
    ? { styleGuide: manifest.styleGuide }
    : {};
  const targetsArgument = manifest.targets
    ? { targets: manifest.targets }
    : {};
  const optionsArgument = {
    ...styleGuideArgument,
    ...targetsArgument
  };
  const optionsLines = Object.keys(optionsArgument).length
    ? [`, ${JSON.stringify(optionsArgument, null, 2)}`]
    : [];

  const temporaryPath = `${modulePath}.tmp-${randomUUID()}`;
  const source = [
      "import { defineAiAssets } from \"@ai-game-assets/core\";",
      "",
      "export const assets = defineAiAssets(",
      `${JSON.stringify(manifest.assets, null, 2)}`,
      ...optionsLines,
      ");",
      ""
    ].join("\n");

  try {
    await writeFile(temporaryPath, source);
    await rename(temporaryPath, modulePath);
  } catch (error) {
    await unlinkIfPresent(temporaryPath);
    throw error;
  }
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function slugifyTargetId(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function uniqueAssetId(manifest: AiAssetManifest, baseAssetId: string): string {
  let candidate = baseAssetId;
  let suffix = 2;

  while (manifest.assets[candidate]) {
    candidate = `${baseAssetId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function deleteUnreferencedVersionFiles(
  options: AssetStoreOptions,
  manifest: AiAssetManifest,
  version: AiAssetVersion
): Promise<void> {
  const referencedFiles = new Set(
    Object.values(manifest.assets).flatMap((asset) =>
      Object.values(asset.versions).flatMap(versionFiles)
    )
  );
  const files = versionFiles(version).filter((file) => !referencedFiles.has(file));

  for (const file of files) {
    await unlinkIfPresent(path.join(options.assetsDir, path.basename(file)));
  }
}

function versionFiles(version: AiAssetVersion): string[] {
  return [
    version.file,
    ...(version.tilesetSourceFile ? [version.tilesetSourceFile] : []),
    ...Object.values(version.tilesetAnimations ?? {}).flatMap((sequence) => sequence.files)
  ];
}

function assertTilesetEditInput(
  asset: AiAssetDefinition,
  input: SaveGeneratedOptionInput
): void {
  const tilesetSource = input.tilesetSource;
  const tilesetTransforms = input.tilesetTransforms;
  const hasSource = tilesetSource !== undefined;
  const hasTransforms = tilesetTransforms !== undefined;
  if (hasSource !== hasTransforms) {
    throw new Error("tilesetSource and tilesetTransforms must be provided together.");
  }
  if (!hasSource && !hasTransforms) return;
  if (!tilesetSource || !tilesetTransforms) {
    throw new Error("tilesetSource and tilesetTransforms must be provided together.");
  }
  if (asset.kind !== "tileset" || !asset.tileset) {
    throw new Error("Tileset edit metadata is only valid for tileset assets.");
  }
  if (!tilesetSource.image.byteLength) {
    throw new Error("Tileset source image must not be empty.");
  }
  if (!tilesetSource.mimeType.startsWith("image/")) {
    throw new Error("Tileset source must be an image.");
  }

  const tileset = input.option.tileset ?? asset.tileset;
  const tileCount = Math.min(
    tileset.tileCount ?? tileset.columns * tileset.rows,
    tileset.columns * tileset.rows
  );
  if (!Array.isArray(tilesetTransforms) || tilesetTransforms.length !== tileCount) {
    throw new Error(`tilesetTransforms must contain exactly ${tileCount} entries.`);
  }
  for (const [index, transform] of tilesetTransforms.entries()) {
    if (!Number.isInteger(transform?.offsetX) || !Number.isInteger(transform?.offsetY)) {
      throw new Error(`tilesetTransforms.${index} offsets must be integers.`);
    }
    if (
      !Number.isFinite(transform?.scaleX) ||
      transform.scaleX <= 0 ||
      !Number.isFinite(transform?.scaleY) ||
      transform.scaleY <= 0
    ) {
      throw new Error(`tilesetTransforms.${index} scales must be positive numbers.`);
    }
  }
}

async function readStoredAssetFile(
  options: AssetStoreOptions,
  publicFile: string
): Promise<Uint8Array> {
  if (/^[a-z][a-z\d+.-]*:/i.test(publicFile) || publicFile.startsWith("//")) {
    throw new Error(`Cannot compose a local tileset version from external file "${publicFile}".`);
  }
  return readFile(path.join(options.assetsDir, path.basename(publicFile)));
}

function publicAssetFile(options: AssetStoreOptions, fileName: string): string {
  return options.publicPathPrefix
    ? `${options.publicPathPrefix.replace(/\/$/, "")}/${fileName}`
    : fileName;
}

function extensionFromFileName(fileName: string): string {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  if (!extension || !/^[a-z0-9]+$/.test(extension)) {
    throw new Error(`Cannot determine an asset extension from "${fileName}".`);
  }
  return extension;
}

async function unlinkIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function readManifestDirectory(manifestDir: string): Promise<AiAssetManifest> {
  const assets: Record<string, AiAssetDefinition> = {};
  const assetPaths: Record<string, string[]> = {};
  let styleGuide: AiAssetStyleGuide | undefined;
  let targets: Record<string, AiAssetTarget> | undefined;

  for (const filePath of await jsonFiles(manifestDir)) {
    const relativePath = path.relative(manifestDir, filePath);

    if (relativePath === "style-guide.json") {
      styleGuide = JSON.parse(await readFile(filePath, "utf8")) as AiAssetStyleGuide;
      continue;
    }

    if (relativePath === "targets.json") {
      targets = JSON.parse(await readFile(filePath, "utf8")) as Record<string, AiAssetTarget>;
      continue;
    }

    const asset = JSON.parse(await readFile(filePath, "utf8")) as AiAssetDefinition;
    assets[asset.id] = asset;
    assetPaths[asset.id] = path.dirname(relativePath) === "."
      ? []
      : path.dirname(relativePath).split(path.sep);
  }

  const manifest: AiAssetManifest = {
    schemaVersion: 1,
    assets,
    styleGuide,
    targets,
    assetPaths
  };
  assertManifest(manifest);
  return manifest;
}

async function writeManifestDirectory(
  manifestDir: string,
  manifest: AiAssetManifest
): Promise<void> {
  await mkdir(manifestDir, { recursive: true });

  if (manifest.styleGuide) {
    await writeJsonFile(path.join(manifestDir, "style-guide.json"), manifest.styleGuide);
  }

  if (manifest.targets) {
    await writeJsonFile(path.join(manifestDir, "targets.json"), manifest.targets);
  }

  for (const asset of Object.values(manifest.assets)) {
    const folderParts = manifest.assetPaths?.[asset.id] ?? inferAssetFolder(asset);
    const filePath = path.join(
      manifestDir,
      ...folderParts,
      `${sanitizeFilePart(asset.id)}.json`
    );
    await writeJsonFile(filePath, asset);
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${filePath}.tmp`, filePath);
}

async function jsonFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await jsonFiles(filePath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(filePath);
    }
  }

  return files.sort();
}

function inferAssetFolder(asset: AiAssetDefinition): string[] {
  if (asset.kind === "sound") return ["Sfx"];
  if (asset.kind === "music") return ["Music"];
  if (asset.kind === "voice" || asset.kind === "voice-line") return ["Voices"];

  if (asset.id.startsWith("invader.")) return ["Graphics", "Invaders"];
  if (asset.id.startsWith("ui.")) return ["Graphics", "UI"];
  if (asset.id.startsWith("laser.")) return ["Graphics", "Lasers"];
  if (asset.id.startsWith("background.")) return ["Graphics", "Background"];
  return ["Graphics"];
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/opus":
      return "opus";
    case "audio/L16":
    case "audio/pcm":
      return "pcm";
    default:
      throw new Error(`Unsupported generated asset mime type "${mimeType}".`);
  }
}
