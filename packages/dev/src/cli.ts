#!/usr/bin/env node
import path from "node:path";
import { buildManifestModule } from "./build-manifest.js";

const command = process.argv[2];

if (command !== "build-manifest") {
  usage(command ? `Unknown command: ${command}` : undefined);
}

const options = parseBuildManifestArgs(process.argv.slice(3));
await buildManifestModule(options);

function parseBuildManifestArgs(args: string[]) {
  const parsed: {
    manifestDir?: string;
    moduleOut?: string;
    activeOnly?: boolean;
    targets?: string[];
    assetSourceDir?: string;
    assetOutDir?: string;
  } = {};

  for (const arg of args) {
    if (arg === "--active-only") {
      parsed.activeOnly = true;
    } else if (arg.startsWith("--manifest-dir=")) {
      parsed.manifestDir = resolveArgPath(arg, "--manifest-dir=");
    } else if (arg.startsWith("--module-out=")) {
      parsed.moduleOut = resolveArgPath(arg, "--module-out=");
    } else if (arg.startsWith("--targets=")) {
      parsed.targets = arg
        .slice("--targets=".length)
        .split(",")
        .map((targetId) => targetId.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--asset-source-dir=")) {
      parsed.assetSourceDir = resolveArgPath(arg, "--asset-source-dir=");
    } else if (arg.startsWith("--asset-out-dir=")) {
      parsed.assetOutDir = resolveArgPath(arg, "--asset-out-dir=");
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.manifestDir) usage("--manifest-dir is required.");
  if (!parsed.moduleOut) usage("--module-out is required.");

  return {
    manifestDir: parsed.manifestDir,
    moduleOut: parsed.moduleOut,
    activeOnly: parsed.activeOnly,
    targets: parsed.targets,
    assetSourceDir: parsed.assetSourceDir,
    assetOutDir: parsed.assetOutDir
  };
}

function resolveArgPath(arg: string, prefix: string): string {
  return path.resolve(arg.slice(prefix.length));
}

function usage(error?: string): never {
  if (error) {
    console.error(error);
    console.error("");
  }

  console.error([
    "Usage:",
    "  ai-game-assets-dev build-manifest \\",
    "    --manifest-dir=src/ai-assets \\",
    "    --module-out=src/assets.ts \\",
    "    [--active-only] \\",
    "    [--targets=default,wide,mobilePortrait] \\",
    "    [--asset-source-dir=public/assets] \\",
    "    [--asset-out-dir=dist/web/assets]"
  ].join("\n"));
  process.exit(error ? 1 : 0);
}
