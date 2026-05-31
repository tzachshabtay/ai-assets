import {
  createAiAssetDevServer,
  createOpenAiImageProvider
} from "@ai-game-assets/dev";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const assetsDir = path.join(publicDir, "assets");

await loadEnvFile(path.join(repoRoot, ".env"));
await loadEnvFile(path.join(__dirname, ".env"));

const assetApiPort = Number(process.env.AI_ASSET_API_PORT ?? 3977);
const demoPort = Number(process.env.SPACE_INVADERS_DEMO_PORT ?? 4177);

await mkdir(assetsDir, { recursive: true });

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is required. The Space Invaders demo now uses real OpenAI image generation."
  );
}

const assetDevServer = createAiAssetDevServer({
  manifestPath: path.join(__dirname, "src/assets.ai.json"),
  manifestModulePath: path.join(__dirname, "src/assets.ts"),
  assetsDir,
  publicPathPrefix: "/assets",
  port: assetApiPort,
  provider: createOpenAiImageProvider({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    background: "transparent",
    quality: "low"
  })
});

await assetDevServer.listen();

const staticServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${demoPort}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.join(publicDir, requestedPath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
  } catch {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => response.destroy());
  response.writeHead(200, {
    "Content-Type": contentType(filePath)
  });
  stream.pipe(response);
});

staticServer.listen(demoPort, "127.0.0.1", () => {
  console.log(`Space Invaders demo: http://127.0.0.1:${demoPort}`);
  console.log(`AI asset dev API: http://127.0.0.1:${assetApiPort}`);
});

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function loadEnvFile(filePath) {
  let raw;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
