import {
  createAiAssetDevServer,
  createElevenLabsAudioProvider,
  createOpenAiImageProvider
} from "@ai-game-assets/dev";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const assetsDir = path.join(publicDir, "assets");

await loadEnvFile(path.join(repoRoot, ".env"));
await loadEnvFile(path.join(__dirname, ".env"));

const requestedAssetApiPort = Number(process.env.AI_ASSET_API_PORT ?? 3977);
const requestedDemoPort = Number(process.env.SPACE_INVADERS_DEMO_PORT ?? 4177);
const assetApiPort = await findAvailablePort(requestedAssetApiPort);
const demoPort = await findAvailablePort(
  requestedDemoPort,
  new Set([assetApiPort])
);

await mkdir(assetsDir, { recursive: true });

const assetDevServer = createAiAssetDevServer({
  manifestPath: path.join(__dirname, "src/assets.ai.json"),
  manifestModulePath: path.join(__dirname, "src/assets.ts"),
  assetsDir,
  publicPathPrefix: "/assets",
  port: assetApiPort,
  provider: createOpenAiImageProvider({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    background: "transparent",
    quality: "low"
  }),
  audioProvider: createElevenLabsAudioProvider({
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT
  })
});

await assetDevServer.listen();

const staticServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${demoPort}`);

  if (isHtmlEntrypoint(url.pathname) && !url.searchParams.has("assetApi")) {
    url.searchParams.set("assetApi", `http://127.0.0.1:${assetApiPort}`);
    response.writeHead(302, {
      Location: `${url.pathname}${url.search}`
    });
    response.end();
    return;
  }

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
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  });
  stream.pipe(response);
});

staticServer.listen(demoPort, "127.0.0.1", () => {
  console.log(`Space Invaders demo: http://127.0.0.1:${demoPort}`);
  console.log(`AI asset dev API: http://127.0.0.1:${assetApiPort}`);

  if (assetApiPort !== requestedAssetApiPort) {
    console.log(`Port ${requestedAssetApiPort} was busy; using ${assetApiPort} for the AI asset dev API.`);
  }

  if (demoPort !== requestedDemoPort) {
    console.log(`Port ${requestedDemoPort} was busy; using ${demoPort} for the Space Invaders demo.`);
  }
});

async function findAvailablePort(startPort, reservedPorts = new Set()) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (reservedPorts.has(port)) continue;

    if (await canListen(port)) {
      return port;
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await findEphemeralPort();
    if (!reservedPorts.has(port)) return port;
  }

  throw new Error(
    `No available port found from ${startPort} to ${startPort + 99}, and the OS did not provide an unreserved fallback port.`
  );
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createNetServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function findEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();

    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to read OS-assigned port."));
        }
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

function isHtmlEntrypoint(pathname) {
  return pathname === "/" || pathname === "/index.html";
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".mp3")) return "audio/mpeg";
  if (filePath.endsWith(".wav")) return "audio/wav";
  if (filePath.endsWith(".ogg")) return "audio/ogg";
  if (filePath.endsWith(".opus")) return "audio/opus";
  if (filePath.endsWith(".pcm")) return "audio/pcm";
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
