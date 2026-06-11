import {
  addVersion,
  assertManifest,
  createAiAssetVersion,
  type AiAssetManifest,
  type AiAssetStyleGuide,
  type AiAssetVersion,
  type GeneratedAssetOption
} from "./internal.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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
  activate?: boolean;
  notes?: string;
};

export type SaveGeneratedOptionResult = {
  manifest: AiAssetManifest;
  version: AiAssetVersion;
  filePath: string;
};

export type SaveStyleGuideInput = {
  prompt?: string;
  images: Array<{
    name: string;
    mimeType: string;
    image: Uint8Array;
  }>;
};

export async function readManifest(manifestPath: string): Promise<AiAssetManifest> {
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as AiAssetManifest;
  assertManifest(manifest);
  return manifest;
}

export async function writeManifest(
  manifestPath: string,
  manifest: AiAssetManifest
): Promise<void> {
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

  await mkdir(options.assetsDir, { recursive: true });
  await writeFile(filePath, input.option.image);

  const version = createAiAssetVersion(asset, {
    name: input.versionName,
    file: publicFile,
    prompt: input.option.prompt,
    model: input.option.model,
    revisedPrompt: input.option.revisedPrompt,
    settings: input.option.settings,
    audioSettings: input.option.audioSettings,
    audioPlayback: input.option.audioPlayback,
    durationSeconds: input.option.durationSeconds,
    parentVersion: asset.activeVersion || undefined,
    notes: input.notes
  });

  const updatedAsset = addVersion(asset, input.versionName, version, {
    activate: input.activate
  });

  manifest.assets[input.assetId] = input.activate
    ? {
        ...updatedAsset,
        prompt: version.prompt,
        dimensions: input.option.dimensions ?? updatedAsset.dimensions,
        frameGrid: input.option.frameGrid ?? updatedAsset.frameGrid,
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
        }
      }
    : updatedAsset;

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

export async function writeManifestModule(
  modulePath: string,
  manifest: AiAssetManifest
): Promise<void> {
  await mkdir(path.dirname(modulePath), { recursive: true });
  const styleGuideArgument = manifest.styleGuide
    ? [`, ${JSON.stringify({ styleGuide: manifest.styleGuide }, null, 2)}`]
    : [];

  await writeFile(
    modulePath,
    [
      "import { defineAiAssets } from \"@ai-game-assets/core\";",
      "",
      "export const assets = defineAiAssets(",
      `${JSON.stringify(manifest.assets, null, 2)}`,
      ...styleGuideArgument,
      ");",
      ""
    ].join("\n")
  );
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
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
