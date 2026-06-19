import type { AiAssetDefinition, AiAssetManifest } from "@ai-game-assets/core";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type BuildManifestOptions = {
  manifestDir: string;
  moduleOut: string;
  activeOnly?: boolean;
  targets?: string[];
  assetSourceDir?: string;
  assetOutDir?: string;
};

const defaultTargetId = "default";

export async function buildManifestModule(options: BuildManifestOptions): Promise<AiAssetManifest> {
  const sourceManifest = await readManifestDirectory(options.manifestDir);
  normalizeAssetUrls(sourceManifest);

  const manifest = options.activeOnly
    ? pruneManifestForBuild(sourceManifest, options.targets)
    : sourceManifest;

  await mkdir(path.dirname(options.moduleOut), { recursive: true });
  await writeFile(
    options.moduleOut,
    [
      "import { defineAiAssets } from \"@ai-game-assets/core\";",
      "",
      "export const assets = defineAiAssets(",
      `${JSON.stringify(manifest.assets, null, 2)},`,
      `${JSON.stringify({ styleGuide: manifest.styleGuide, targets: manifest.targets }, null, 2)}`,
      ");",
      ""
    ].join("\n")
  );

  if (options.assetOutDir) {
    if (!options.assetSourceDir) {
      throw new Error("--asset-source-dir is required when --asset-out-dir is provided.");
    }

    await copyReferencedAssetFiles({
      assetSourceDir: options.assetSourceDir,
      assetOutDir: options.assetOutDir,
      manifest
    });
  }

  return manifest;
}

export async function readManifestDirectory(rootDir: string): Promise<AiAssetManifest> {
  const assets: Record<string, AiAssetDefinition> = {};
  let styleGuide: AiAssetManifest["styleGuide"];
  let targets: AiAssetManifest["targets"];

  for (const filePath of await jsonFiles(rootDir)) {
    const relativePath = path.relative(rootDir, filePath);
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (relativePath === "style-guide.json") {
      styleGuide = value as AiAssetManifest["styleGuide"];
      continue;
    }

    if (relativePath === "targets.json") {
      targets = value as AiAssetManifest["targets"];
      continue;
    }

    const asset = value as AiAssetDefinition;
    assets[asset.id] = asset;
  }

  return {
    schemaVersion: 1,
    assets,
    styleGuide,
    targets
  };
}

export function pruneManifestForBuild(
  manifest: AiAssetManifest,
  requestedTargets: string[] | undefined
): AiAssetManifest {
  const targetIds = requestedTargets?.length ? requestedTargets : [defaultTargetId];
  const includeDefault = targetIds.includes(defaultTargetId);
  const concreteTargetIds = targetIds.filter((targetId) => targetId !== defaultTargetId);
  const targets = Object.fromEntries(
    concreteTargetIds.map((targetId) => {
      const target = manifest.targets?.[targetId];
      if (!target) throw new Error(`Unknown production asset target "${targetId}".`);
      return [targetId, cloneJson(target)];
    })
  );
  const allTargetVariantAssetIds = new Set(
    Object.values(manifest.targets ?? {}).flatMap((target) => Object.values(target.variants))
  );
  const baseAssetIds = Object.keys(manifest.assets)
    .filter((assetId) => !allTargetVariantAssetIds.has(assetId));
  const includedAssetIds = new Set(baseAssetIds);

  for (const target of Object.values(targets)) {
    for (const assetId of Object.values(target.variants)) {
      includedAssetIds.add(assetId);
    }
  }

  const activeVersionAssetIds = activeVersionAssetIdsForBuild({
    manifest,
    baseAssetIds,
    targets,
    includeDefault
  });
  const assets: Record<string, AiAssetDefinition> = {};

  for (const assetId of includedAssetIds) {
    const asset = manifest.assets[assetId];
    if (!asset) continue;

    assets[assetId] = pruneAssetVersions(asset, activeVersionAssetIds.has(assetId));
  }

  return {
    schemaVersion: 1,
    assets,
    targets: Object.keys(targets).length ? targets : undefined,
    styleGuide: undefined
  };
}

export function normalizeAssetUrls(manifest: AiAssetManifest): void {
  for (const asset of Object.values(manifest.assets)) {
    for (const version of Object.values(asset.versions ?? {})) {
      if (typeof version.file === "string") {
        version.file = productionAssetUrl(version.file);
      }
    }
  }

  for (const image of manifest.styleGuide?.images ?? []) {
    if (typeof image.file === "string") {
      image.file = productionAssetUrl(image.file);
    }
  }
}

export function referencedAssetFiles(manifest: AiAssetManifest): string[] {
  const files = new Set<string>();

  for (const asset of Object.values(manifest.assets)) {
    for (const version of Object.values(asset.versions ?? {})) {
      if (typeof version.file === "string") {
        files.add(version.file);
      }
    }
  }

  for (const image of manifest.styleGuide?.images ?? []) {
    if (typeof image.file === "string") {
      files.add(image.file);
    }
  }

  return [...files].sort();
}

async function copyReferencedAssetFiles(options: {
  assetSourceDir: string;
  assetOutDir: string;
  manifest: AiAssetManifest;
}): Promise<void> {
  await rm(options.assetOutDir, { recursive: true, force: true });
  await mkdir(options.assetOutDir, { recursive: true });

  for (const file of referencedAssetFiles(options.manifest)) {
    if (isExternalFile(file)) continue;

    const relativeFile = file.startsWith("assets/") ? file.slice("assets/".length) : file;
    const source = path.join(options.assetSourceDir, relativeFile);
    const destination = path.join(options.assetOutDir, relativeFile);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

function activeVersionAssetIdsForBuild(options: {
  manifest: AiAssetManifest;
  baseAssetIds: string[];
  targets: NonNullable<AiAssetManifest["targets"]>;
  includeDefault: boolean;
}): Set<string> {
  const activeAssetIds = new Set<string>();

  for (const baseAssetId of options.baseAssetIds) {
    const baseAsset = options.manifest.assets[baseAssetId];
    if (!baseAsset || baseAsset.kind === "collection") continue;

    if (options.includeDefault) {
      activeAssetIds.add(baseAssetId);
    }

    for (const target of Object.values(options.targets)) {
      activeAssetIds.add(target.variants[baseAssetId] ?? baseAssetId);
    }
  }

  return activeAssetIds;
}

function pruneAssetVersions(asset: AiAssetDefinition, keepActiveVersion: boolean): AiAssetDefinition {
  const pruned = cloneJson(asset);

  if (!keepActiveVersion || Object.keys(pruned.versions ?? {}).length === 0) {
    pruned.activeVersion = "";
    pruned.versions = {};
    return pruned;
  }

  const activeVersion = pruned.versions[pruned.activeVersion];
  if (!activeVersion) {
    throw new Error(`Asset "${pruned.id}" activeVersion "${pruned.activeVersion}" is missing.`);
  }

  pruned.versions = {
    [pruned.activeVersion]: sanitizeProductionVersion(activeVersion)
  };
  return pruned;
}

function sanitizeProductionVersion(
  version: AiAssetDefinition["versions"][string]
): AiAssetDefinition["versions"][string] {
  const sanitized = cloneJson(version);
  delete sanitized.parentVersion;
  delete sanitized.notes;

  return sanitized;
}

function productionAssetUrl(file: string): string {
  return file.startsWith("/assets/") ? file.slice(1) : file;
}

function isExternalFile(file: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(file) || file.startsWith("//") || file.startsWith("data:");
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
