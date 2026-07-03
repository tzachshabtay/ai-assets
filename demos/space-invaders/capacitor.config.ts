import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aiassets.invaders",
  appName: "AI Assets Invaders",
  webDir: process.env.CAPACITOR_WEB_DIR ?? "dist/phone",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
