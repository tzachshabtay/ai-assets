import { assets } from "./assets.js";
import { displayTargetId } from "./displayTarget.js";
import { startGame } from "./SpaceInvadersScene.js";

startGame(assets, {
  assetBaseUrl: new URL(".", globalThis.location.href).href,
  targetId: displayTargetId()
});
