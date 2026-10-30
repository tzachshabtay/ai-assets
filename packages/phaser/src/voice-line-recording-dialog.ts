import type { AiAssetManifest } from "@ai-game-assets/core";
import type { AiAssetDebugClient } from "./debug-client.js";
import { recordingToWav, startVoiceRecording } from "./voice-recording.js";
import { voiceLineDirection } from "./voice-line-regeneration.js";

type UnsavedTake = { id: string; blob: Blob; url: string; audio?: Awaited<ReturnType<typeof recordingToWav>> };

export function openVoiceLineRecordingDialog(options: {
  root: HTMLElement;
  manifest: AiAssetManifest;
  lineAssetIds: string[];
  voiceName: string;
  client: Pick<AiAssetDebugClient, "save" | "deleteVersion" | "selectVoiceLineVersion"> & Partial<Pick<AiAssetDebugClient, "syncManifestModule">>;
  resolveAssetUrl(file: string): string;
  onManifest(manifest: AiAssetManifest, assetId: string, activeChanged: boolean): void;
}) {
  let manifest = options.manifest, index = 0, busy = false, disposed = false, requestingMicrophone = false;
  let moduleDirty = false;
  const deferManifestModuleWrite = Boolean(options.client.syncManifestModule);
  let capture: Awaited<ReturnType<typeof startVoiceRecording>> | undefined;
  let unsaved: UnsavedTake | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const previousFocus = document.activeElement as HTMLElement | null;
  const modal = document.createElement("div");
  modal.className = "ai-game-assets-designer__modal";
  modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-label", "Record voice lines");
  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__voice-batch ai-game-assets-designer__recording";
  const title = document.createElement("h2"); title.textContent = `Record · ${options.voiceName}`;
  const counter = document.createElement("p");
  const progress = document.createElement("progress"); progress.max = options.lineAssetIds.length; progress.setAttribute("aria-label", "Current voice line");
  const script = document.createElement("blockquote");
  const direction = document.createElement("p");
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const takes = document.createElement("div"); takes.className = "ai-game-assets-designer__recording-takes";
  const button = (label: string, action: () => void) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = action; return b;
  };
  const stopPlayback = () => takes.querySelectorAll("audio").forEach(audio => audio.pause());
  const announce = (message: string) => { status.textContent = message; };
  const publish = (next: AiAssetManifest, id: string, activeChanged: boolean) => {
    manifest = next; moduleDirty = true;
    if (!disposed) options.onManifest(next, id, activeChanged);
  };
  let resolveClosed!: () => void;
  const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
  const close = async (force = false) => {
    if (!force && ((busy && !requestingMicrophone) || capture || unsaved)) {
      announce("Stop recording, then save or delete the unsaved take before closing."); return;
    }
    if (!force && moduleDirty && options.client.syncManifestModule) {
      busy = true; render(); announce("Finishing recording session…");
      try {
        const next = await options.client.syncManifestModule();
        publish(next, options.lineAssetIds[index]!, false); moduleDirty = false;
      } catch (error) {
        announce(`Takes are saved, but the game module could not refresh: ${error instanceof Error ? error.message : String(error)}. Try Close again.`);
        busy = false; render(); return;
      }
      busy = false;
    }
    disposed = true; capture?.stop(); capture = undefined;
    clearInterval(timer); stopPlayback();
    if (unsaved) URL.revokeObjectURL(unsaved.url);
    window.removeEventListener("beforeunload", protect);
    if (force && !busy && moduleDirty) void options.client.syncManifestModule?.().catch(() => {});
    modal.remove(); if (previousFocus?.isConnected) previousFocus.focus(); resolveClosed();
  };
  const protect = (event: BeforeUnloadEvent) => {
    if (busy || capture || unsaved || (moduleDirty && deferManifestModuleWrite)) { event.preventDefault(); event.returnValue = ""; }
  };
  window.addEventListener("beforeunload", protect);
  const run = async (action: () => Promise<void>) => {
    if (busy || capture || disposed) return;
    busy = true; render();
    try { await action(); }
    catch (error) { announce(error instanceof Error ? error.message : String(error)); }
    finally { busy = false; if (!disposed) render(); }
  };
  const saveTake = async (id: string) => {
    if (!unsaved) return;
    const draft = unsaved;
    announce("Saving take…");
    draft.audio ??= await recordingToWav(draft.blob);
    const asset = manifest.assets[id]!;
    const active = asset.versions[asset.activeVersion];
    const activate = !active?.file;
    const saved = await options.client.save({ assetId: id, versionName: draft.id,
      ...draft.audio, prompt: asset.prompt,
      voiceSettings: { ...active?.voiceSettings, ...asset.voiceSettings, direction: voiceLineDirection(asset),
        text: asset.voiceSettings?.text ?? active?.voiceSettings?.text ?? asset.prompt },
      audioSettings: { ...asset.audioSettings, format: "wav" }, activate,
      notes: "Microphone recording", deferManifestModuleWrite });
    // Clear the draft before notifying the game: callback failures must not duplicate saved audio.
    URL.revokeObjectURL(draft.url); unsaved = undefined;
    publish(saved.manifest, id, activate);
    announce(activate ? "Take saved and starred as the favorite." : "Take saved. Star it to use this recording in the game.");
  };
  const record = button("Record", () => {
    if (capture) { capture.stop(); return; }
    if (busy || unsaved) return;
    void (async () => {
      busy = true; requestingMicrophone = true; render(); announce("Waiting for microphone access…");
      const id = options.lineAssetIds[index]!;
      try {
        const started = await startVoiceRecording();
        requestingMicrophone = false;
        if (disposed) { started.stop(); void started.result.catch(() => {}); return; }
        capture = started; busy = false; stopPlayback(); render();
        const start = Date.now();
        const tick = () => announce(`Recording · ${Math.floor((Date.now() - start) / 1000)}s`);
        tick(); timer = setInterval(tick, 250);
        const blob = await started.result;
        clearInterval(timer); capture = undefined; busy = true;
        unsaved = { id: `recorded-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, blob, url: URL.createObjectURL(blob) };
        if (!disposed) render();
        await saveTake(id);
      } catch (error) {
        announce(`${error instanceof Error ? error.message : String(error)}${unsaved ? " Your take is kept here; retry saving or download it." : ""}`);
      } finally {
        capture?.stop(); capture = undefined; clearInterval(timer); busy = false; requestingMicrophone = false;
        if (disposed && unsaved) URL.revokeObjectURL(unsaved.url);
        if (disposed && moduleDirty) void options.client.syncManifestModule?.().catch(() => {});
        if (!disposed) render();
      }
    })();
  });
  const previous = button("Previous", () => { if (!busy && !capture && !unsaved && index > 0) { stopPlayback(); index--; announce(""); render(); } });
  const next = button("Next", () => {
    if (busy || capture || unsaved) return;
    if (index === options.lineAssetIds.length - 1) close();
    else { stopPlayback(); index++; announce(""); render(); }
  });
  const exit = button("Close", () => close());
  const actions = document.createElement("div"); actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(exit, previous, next);
  const recordActions = document.createElement("div"); recordActions.className = "ai-game-assets-designer__modal-actions"; recordActions.append(record);
  const hint = document.createElement("p"); hint.textContent = "★ Favorite = the recording used in the game. All other takes are saved in Previous versions. Next skips lines you do not record.";
  card.append(title, counter, progress, script, direction, recordActions, status, takes, hint, actions); modal.append(card);
  function render() {
    const id = options.lineAssetIds[index]!, asset = manifest.assets[id]!;
    const active = asset.versions[asset.activeVersion];
    counter.textContent = `Line ${index + 1} of ${options.lineAssetIds.length}`;
    progress.value = index + 1;
    script.textContent = asset.voiceSettings?.text ?? active?.voiceSettings?.text ?? asset.prompt;
    direction.textContent = voiceLineDirection(asset);
    direction.hidden = !direction.textContent;
    record.textContent = capture ? "Stop recording" : "Record";
    record.disabled = busy || Boolean(unsaved);
    previous.disabled = busy || Boolean(capture || unsaved) || index === 0;
    next.disabled = busy || Boolean(capture || unsaved);
    exit.disabled = (busy && !requestingMicrophone) || Boolean(capture || unsaved);
    next.textContent = index === options.lineAssetIds.length - 1 ? "Done" : "Next";
    stopPlayback(); takes.replaceChildren();
    const versions = Object.entries(asset.versions).filter(([, version]) => version.file);
    for (const [i, [name, version]] of versions.entries()) {
      const row = document.createElement("div"); row.className = "ai-game-assets-designer__recording-take";
      const label = document.createElement("span"); label.textContent = `Take ${i + 1}`; label.title = name;
      const audio = document.createElement("audio"); audio.controls = true; audio.preload = "none";
      audio.src = options.resolveAssetUrl(version.file); audio.setAttribute("aria-label", `Play take ${i + 1}`);
      audio.addEventListener("play", () => takes.querySelectorAll("audio").forEach(other => { if (other !== audio) other.pause(); }));
      const favorite = button(asset.activeVersion === name ? "★" : "☆", () => void run(async () => {
        announce("Promoting favorite…");
        publish(await options.client.selectVoiceLineVersion({ assetId: id, versionName: name, deferManifestModuleWrite }), id, true);
        announce(`Take ${i + 1} is now the favorite.`);
      }));
      favorite.setAttribute("aria-label", `Favorite take ${i + 1}`);
      favorite.setAttribute("aria-pressed", String(asset.activeVersion === name));
      const remove = button("Delete", () => void run(async () => {
        announce("Deleting take…");
        const activeChanged = manifest.assets[id]!.activeVersion === name;
        publish(await options.client.deleteVersion({ assetId: id, versionName: name,
          replaceActiveVoiceLine: true, deferManifestModuleWrite }), id, activeChanged);
        announce("Take deleted.");
      }));
      remove.setAttribute("aria-label", `Delete take ${i + 1}`);
      favorite.disabled = remove.disabled = busy || Boolean(capture || unsaved);
      audio.hidden = Boolean(capture);
      row.append(label, audio, favorite, remove); takes.append(row);
    }
    if (unsaved) {
      const row = document.createElement("div"); row.className = "ai-game-assets-designer__recording-take";
      const label = document.createElement("span"); label.textContent = "Unsaved take";
      const audio = document.createElement("audio"); audio.controls = true; audio.src = unsaved.url;
      const retry = button("Retry save", () => void run(() => saveTake(id)));
      const remove = button("Delete", () => { if (busy) return; URL.revokeObjectURL(unsaved!.url); unsaved = undefined; announce("Unsaved take deleted."); render(); });
      const download = document.createElement("a"); download.href = unsaved.url; download.download = `${id}-take.${unsaved.blob.type.includes("mp4") ? "m4a" : "webm"}`; download.textContent = "Download";
      retry.disabled = remove.disabled = busy;
      row.append(label, audio, retry, remove, download); takes.append(row);
    }
    if (!versions.length && !unsaved) { const empty = document.createElement("p"); empty.textContent = "No takes yet. Press Record when ready."; takes.append(empty); }
  }
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const buttons = [...modal.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
  });
  options.root.append(modal); render(); record.focus();
  return { closed, close: () => close(true) };
}
