import { AiAssetDebugClient, installAiAssetDesigner } from "@ai-game-assets/phaser";
import type { AiAssetManifest } from "@ai-game-assets/core";
import { startGame } from "./SpaceInvadersScene.js";
import { designerAssetIds, designerPreviewDisplaySize } from "./designerConfig.js";
import { displayTargetId } from "./displayTarget.js";

const assetApi =
  new URLSearchParams(window.location.search).get("assetApi") ??
  "http://127.0.0.1:3977";
const debugClient = new AiAssetDebugClient(assetApi);
const targetId = displayTargetId();

let manifest: AiAssetManifest;

async function boot(): Promise<void> {
  const loaded = await loadAssetsManifest();
  manifest = loaded.manifest;
  startGame(manifest, {
    assetBaseUrl: loaded.assetBaseUrl,
    targetId,
    onManifestUpdated: (updatedManifest: AiAssetManifest) => {
      manifest = updatedManifest;
    },
    installDesigner: loaded.debugClient
      ? (designerOptions) => {
          installAiAssetDesigner({
            ...designerOptions,
            client: loaded.debugClient,
            assetIds: designerAssetIds,
            targetId,
            previewDisplaySize: designerPreviewDisplaySize
          });
        }
      : undefined
  });
}

async function loadAssetsManifest(): Promise<{
  manifest: AiAssetManifest;
  debugClient?: AiAssetDebugClient;
  assetBaseUrl?: string;
}> {
  try {
    return {
      manifest: await debugClient.getManifest(),
      debugClient,
      assetBaseUrl: assetApi
    };
  } catch (error) {
    console.warn("Falling back to bundled AI asset manifest.", error);
    return {
      manifest: (await import("./assets.js")).assets
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

boot().catch((error) => {
  const message = errorMessage(error);
  document.body.insertAdjacentHTML("beforeend", `<pre>${message}</pre>`);
  throw error;
});
