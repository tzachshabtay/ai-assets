import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./packages/core/test",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  use: {
    viewport: { width: 1200, height: 800 },
    reducedMotion: "reduce",
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: "chrome" } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
