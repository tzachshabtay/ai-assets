import { AiAssetDebugClient, installAiAssetDesigner } from "@ai-game-assets/phaser";
import type { AiAssetManifest } from "@ai-game-assets/core";
import { startGame } from "./SpaceInvadersScene.js";
import { designerAssetIds, designerPreviewDisplaySize } from "./designerConfig.js";

const assetApi =
  new URLSearchParams(window.location.search).get("assetApi") ??
  "http://127.0.0.1:3977";
const debugClient = new AiAssetDebugClient(assetApi);
const targetId = displayTargetId();

let manifest: AiAssetManifest;

async function boot(): Promise<void> {
  manifest = await debugClient.getManifest();
  startGame(manifest, {
    targetId,
    onManifestUpdated: (updatedManifest: AiAssetManifest) => {
      manifest = updatedManifest;
    },
    installDesigner: (designerOptions) => {
      installAiAssetDesigner({
        ...designerOptions,
        client: debugClient,
        assetIds: designerAssetIds,
        targetId,
        previewDisplaySize: designerPreviewDisplaySize
      });
    }
  });
}

function displayTargetId(): string | undefined {
  if (window.innerHeight <= window.innerWidth) return undefined;
  if (window.innerWidth <= 720) return "mobilePortrait";
  if (window.innerWidth <= 1180) return "ipadPortrait";

  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

boot().catch((error) => {
  const message = errorMessage(error);
  document.body.insertAdjacentHTML("beforeend", `<pre>${message}</pre>`);
  throw error;
});
