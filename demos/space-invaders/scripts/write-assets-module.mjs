import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(__dirname, "..");
const manifestDir = path.join(demoRoot, "src/ai-assets");
const modulePath = path.join(demoRoot, "src/assets.ts");
const manifest = await readManifestDirectory(manifestDir);

await mkdir(path.dirname(modulePath), { recursive: true });
await writeFile(
  modulePath,
  [
    "import { defineAiAssets } from \"@ai-game-assets/core\";",
    "",
    "export const assets = defineAiAssets(",
    `${JSON.stringify(manifest.assets, null, 2)},`,
    `${JSON.stringify({ styleGuide: manifest.styleGuide }, null, 2)}`,
    ");",
    ""
  ].join("\n")
);

async function readManifestDirectory(rootDir) {
  const assets = {};
  let styleGuide;

  for (const filePath of await jsonFiles(rootDir)) {
    const relativePath = path.relative(rootDir, filePath);
    const value = JSON.parse(await readFile(filePath, "utf8"));

    if (relativePath === "style-guide.json") {
      styleGuide = value;
      continue;
    }

    assets[value.id] = value;
  }

  return { assets, styleGuide };
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
