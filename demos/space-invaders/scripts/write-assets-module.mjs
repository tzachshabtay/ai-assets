import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(__dirname, "..");
const manifestDir = path.join(demoRoot, "src/ai-assets");
const modulePath = path.join(demoRoot, "src/assets.ts");
const manifest = await readManifestDirectory(manifestDir);
normalizeAssetUrls(manifest);

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
