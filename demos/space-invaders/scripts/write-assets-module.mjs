import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultTargetId = "default";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(__dirname, "..");
const manifestDir = path.join(demoRoot, "src/ai-assets");
const publicDir = path.join(demoRoot, "public");
const modulePath = path.join(demoRoot, "src/assets.ts");
const options = parseArgs(process.argv.slice(2));
const sourceManifest = await readManifestDirectory(manifestDir);
normalizeAssetUrls(sourceManifest);

const manifest = options.activeOnly
  ? pruneManifestForBuild(sourceManifest, options.targets)
  : sourceManifest;

await mkdir(path.dirname(modulePath), { recursive: true });
await writeFile(
  modulePath,
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

if (options.outputDir) {
  await writeProductionOutput(options.outputDir, manifest);
}

function parseArgs(args) {
  const parsed = {
    activeOnly: false,
    outputDir: undefined,
    targets: undefined
  };

  for (const arg of args) {
    if (arg === "--active-only") {
      parsed.activeOnly = true;
    } else if (arg.startsWith("--output-dir=")) {
      parsed.outputDir = path.resolve(demoRoot, arg.slice("--output-dir=".length));
    } else if (arg.startsWith("--targets=")) {
      parsed.targets = arg
        .slice("--targets=".length)
        .split(",")
        .map((targetId) => targetId.trim())
        .filter(Boolean);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function readManifestDirectory(rootDir) {
  const assets = {};
  let styleGuide;
  let targets;

  for (const filePath of await jsonFiles(rootDir)) {
    const relativePath = path.relative(rootDir, filePath);
    const value = JSON.parse(await readFile(filePath, "utf8"));

    if (relativePath === "style-guide.json") {
      styleGuide = value;
      continue;
    }

    if (relativePath === "targets.json") {
      targets = value;
      continue;
    }

    assets[value.id] = value;
  }

  return { assets, styleGuide, targets };
}

function pruneManifestForBuild(manifest, requestedTargets) {
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
  const assets = {};

  for (const assetId of includedAssetIds) {
    const asset = manifest.assets[assetId];
    if (!asset) continue;

    assets[assetId] = pruneAssetVersions(asset, activeVersionAssetIds.has(assetId));
  }

  return {
    assets,
    targets: Object.keys(targets).length ? targets : undefined,
    styleGuide: undefined
  };
}

function activeVersionAssetIdsForBuild({
  manifest,
  baseAssetIds,
  targets,
  includeDefault
}) {
  const activeAssetIds = new Set();

  for (const baseAssetId of baseAssetIds) {
    const baseAsset = manifest.assets[baseAssetId];
    if (!baseAsset || baseAsset.kind === "collection") continue;

    if (includeDefault) {
      activeAssetIds.add(baseAssetId);
    }

    for (const target of Object.values(targets)) {
      activeAssetIds.add(target.variants[baseAssetId] ?? baseAssetId);
    }
  }

  return activeAssetIds;
}

function pruneAssetVersions(asset, keepActiveVersion) {
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

function sanitizeProductionVersion(version) {
  const sanitized = cloneJson(version);
  delete sanitized.parentVersion;
  delete sanitized.notes;

  return sanitized;
}

function normalizeAssetUrls(manifest) {
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

function productionAssetUrl(file) {
  return file.startsWith("/assets/") ? file.slice(1) : file;
}

async function writeProductionOutput(outputDir, manifest) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, "assets"), { recursive: true });

  for (const fileName of ["index.html", "styles.css", "favicon.svg"]) {
    await cp(path.join(publicDir, fileName), path.join(outputDir, fileName));
  }

  for (const file of referencedAssetFiles(manifest)) {
    if (isExternalFile(file)) continue;

    const source = path.join(publicDir, file);
    const destination = path.join(outputDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

function referencedAssetFiles(manifest) {
  const files = new Set();

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

function isExternalFile(file) {
  return /^[a-z][a-z\d+\-.]*:/i.test(file) || file.startsWith("//") || file.startsWith("data:");
}

async function jsonFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
