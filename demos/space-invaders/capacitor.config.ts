import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aigameassets.spaceinvaders",
  appName: "AI Assets Invaders",
  webDir: "dist/phone",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true
  }
};

export default config;
