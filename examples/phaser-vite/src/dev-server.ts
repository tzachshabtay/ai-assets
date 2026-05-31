import {
  createAiAssetDevServer,
  createOpenAiImageProvider
} from "@ai-game-assets/dev";

const devServer = createAiAssetDevServer({
  manifestPath: "src/assets.ai.json",
  manifestModulePath: "src/assets.ts",
  assetsDir: "public/assets",
  publicPathPrefix: "/assets",
  provider: createOpenAiImageProvider()
});

await devServer.listen();
