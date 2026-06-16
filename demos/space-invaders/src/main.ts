import { AiAssetDebugClient } from "@ai-game-assets/phaser";
import type { AiAssetManifest } from "@ai-game-assets/core";
import { startGame } from "./SpaceInvadersScene.js";

const assetApi =
  new URLSearchParams(window.location.search).get("assetApi") ??
  "http://127.0.0.1:3977";
const debugClient = new AiAssetDebugClient(assetApi);

let manifest: AiAssetManifest;

async function boot(): Promise<void> {
  manifest = await debugClient.getManifest();
  startGame(manifest, debugClient, (updatedManifest: AiAssetManifest) => {
    manifest = updatedManifest;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

boot().catch((error) => {
  const message = errorMessage(error);
  document.body.insertAdjacentHTML("beforeend", `<pre>${message}</pre>`);
  throw error;
});
