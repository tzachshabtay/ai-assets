import { assets } from "./assets.js";
import { startGame } from "./SpaceInvadersScene.js";

startGame(assets, {
  assetBaseUrl: new URL(".", globalThis.location.href).href,
  targetId: phonePortraitTargetId()
});

function phonePortraitTargetId(): string | undefined {
  return window.innerWidth <= 720 && window.innerHeight > window.innerWidth
    ? "mobilePortrait"
    : undefined;
}
