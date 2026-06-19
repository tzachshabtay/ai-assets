import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifestModule } from "../../../packages/dev/dist/build-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(__dirname, "..");
const publicDir = path.join(demoRoot, "public");
const options = parseArgs(process.argv.slice(2));

if (options.outputDir) {
  await copyStaticShell(options.outputDir);
} else {
  await writeAssetsModule();
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

async function copyStaticShell(outputDir) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, "assets"), { recursive: true });

  for (const fileName of ["index.html", "styles.css", "favicon.svg"]) {
    await cp(path.join(publicDir, fileName), path.join(outputDir, fileName));
  }

  await writeAssetsModule(path.join(outputDir, "assets"));
}

async function writeAssetsModule(assetOutDir) {
  await buildManifestModule({
    manifestDir: path.join(demoRoot, "src/ai-assets"),
    moduleOut: path.join(demoRoot, "src/assets.ts"),
    activeOnly: options.activeOnly,
    targets: options.targets,
    assetSourceDir: assetOutDir ? path.join(publicDir, "assets") : undefined,
    assetOutDir
  });
}
