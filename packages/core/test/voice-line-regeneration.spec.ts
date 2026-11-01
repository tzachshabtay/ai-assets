import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

let server: Server, base: string;
test.beforeAll(async () => {
  const root = path.resolve(".");
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    if (pathname === "/") {
      res.setHeader("content-type", "text/html");
      return res.end(`<script type="importmap">{"imports":{"@ai-game-assets/core":"/packages/core/dist/index.js"}}</script><div class="ai-game-assets-designer" id="root"></div>`);
    }
    try {
      const file = path.resolve(root, "." + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader("content-type", "text/javascript"); res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });


test.beforeEach(async ({ page }) => {
  await page.goto(base);
  await page.evaluate(async () => {
    const support = await import("/packages/phaser/dist/designer-support.js");
    support.ensureDesignerStyles();
    const { openVoiceLineRegenerationDialog } = await import("/packages/phaser/dist/voice-line-regeneration-dialog.js");
    (window as any).openBatch = (missingCount = 2) => {
      (window as any).batch = openVoiceLineRegenerationDialog({
        root: document.querySelector("#root"), voiceName: "Borin", allCount: 5, missingCount,
        onStop: () => { (window as any).stopped = true; }
      });
      (window as any).batch.selection.then((scope: string) => { (window as any).selection = scope; });
    };
    (window as any).openBatch();
  });
});

test("choose a scope, track progress, stop safely, and acknowledge the result", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Generate voice lines" });
  await expect(dialog.getByRole("combobox")).toHaveValue("missing");
  await dialog.getByRole("button", { name: "Start generation" }).click();
  expect(await page.evaluate(() => (window as any).selection)).toBe("missing");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("max", "2");
  await page.evaluate(() => (window as any).batch.update({ index: 1, total: 2, phase: "generation" }, "Second line"));
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "1");
  await expect(dialog.getByText("1 / 2 lines completed")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stop after current line" }).click();
  expect(await page.evaluate(() => (window as any).stopped)).toBe(true);
  await expect(dialog.getByRole("button", { name: "Stopping…", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).batch.finish("Stopped safely. 2 recordings saved.", 2));
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "2");
  await expect(dialog.getByRole("status")).toHaveText("Stopped safely. 2 recordings saved.");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("nothing missing is disabled but all lines remains available; cancel starts no batch", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => (window as any).selection)).toBeUndefined();
  await page.evaluate(() => (window as any).openBatch(0));
  await expect(page.getByRole("button", { name: "Start generation" })).toBeDisabled();
  await page.getByRole("combobox").selectOption("all");
  await expect(page.getByRole("button", { name: "Start generation" })).toBeEnabled();
  await page.getByRole("button", { name: "Start generation" }).click();
  expect(await page.evaluate(() => (window as any).selection)).toBe("all");
  await expect(page.getByRole("progressbar")).toHaveAttribute("max", "5");
});


test("designer missing batch preserves recovered selected audio and promotes only the missing line", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  page.on("dialog", () => { throw new Error("Batch must not use a browser confirmation"); });
  await page.evaluate(async () => {
    const { installAiAssetDesigner } = await import("/packages/phaser/dist/designer.js");
    const { DesignerGenerationRecovery } = await import("/packages/phaser/dist/generation-recovery.js");
    const w = window as any;
    const audio = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const line = (id: string) => ({ id, kind: "voice-line", prompt: id, voiceSettings: { text: id, voiceAssetId: "voice.borin" }, activeVersion: "", versions: {} });
    let manifest: any = { schemaVersion: 1, assets: {
      "voice.borin": { id: "voice.borin", kind: "voice", prompt: "Borin", voiceSettings: { voiceId: "borin-id" },
        activeVersion: "base", versions: { base: { name: "base", file: audio } },
        linkedAnimationAssets: { selected: { assetId: "line.selected", label: "Selected" }, missing: { assetId: "line.missing", label: "Missing" } } },
      "line.selected": line("line.selected"), "line.missing": line("line.missing")
    } };
    w.recovery = new DesignerGenerationRecovery("voice-batch-test");
    const option = { index: 0, dataUrl: audio, mimeType: "audio/wav", prompt: "" };
    await w.recovery.write({ assetId: "line.selected", activeVersion: "", generated: [option], pending: { option, inheritAnimations: false } });
    w.requests = [];
    w.designer = installAiAssetDesigner({ manifest, generationRecoveryKey: "voice-batch-test", autoFirstDrafts: false,
      scene: { textures: { exists: () => false } },
      client: { endpoint: "test", assetUrl: (file: string) => file,
        async generate(request: any) {
          w.requests.push(request.assetId);
          await new Promise(resolve => { w.finishGeneration = resolve; });
          return [option];
        },
        async save(request: any) {
          manifest = structuredClone(manifest);
          const asset = manifest.assets[request.assetId];
          const version = { name: request.versionName, file: audio };
          asset.activeVersion = version.name; asset.versions[version.name] = version;
          return { asset, manifest, version, versionName: version.name, file: audio };
        }
      }, onPreview() {}, onManifestUpdated(updated: any) { w.updated = updated; }
    });
    w.designer.open();
  });
  await expect(page.getByRole("button", { name: "Regenerate all lines", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Regenerate all lines", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Generate voice lines" });
  await expect(dialog.getByRole("combobox")).toHaveText(/Missing or outdated recordings \(1\)/);
  await dialog.getByRole("button", { name: "Start generation" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).requests)).toEqual(["line.missing"]);
  await expect(dialog.getByRole("button", { name: "Stop after current line" })).toBeEnabled();
  await page.evaluate(() => (window as any).finishGeneration());
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("status")).toHaveText("Generated and promoted 1 voice line.");
  expect(await page.evaluate(() => (window as any).updated.assets["line.selected"].activeVersion)).toBe("");
  expect(await page.evaluate(async () => (await (window as any).recovery.read()).find((r: any) => r.assetId === "line.selected").pending.option.dataUrl)).toContain("data:audio/wav");
});
