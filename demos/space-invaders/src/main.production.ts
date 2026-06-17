import { assets } from "./assets.js";
import { startGame } from "./SpaceInvadersScene.js";

startGame(assets, {
  assetBaseUrl: new URL(".", globalThis.location.href).href
});
