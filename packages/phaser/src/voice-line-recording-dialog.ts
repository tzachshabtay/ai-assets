import type { AiAssetManifest } from "@ai-game-assets/core";
import type { AiAssetDebugClient } from "./debug-client.js";
import { recordingToWav, startVoiceRecording } from "./voice-recording.js";
import { createVoiceTakePlayer } from "./voice-take-player.js";
import { voiceLineDirection } from "./voice-line-regeneration.js";

type UnsavedTake = { id: string; blob: Blob; url: string; audio?: Awaited<ReturnType<typeof recordingToWav>> };

export function openVoiceLineRecordingDialog(options: {
  root: HTMLElement;
  manifest: AiAssetManifest;
  lineAssetIds: string[];
  voiceName: string;
  client: Pick<AiAssetDebugClient, "save" | "deleteVersion" | "selectVoiceLineVersion" | "updateVoiceLine" | "trimVoiceLineVersion"> & Partial<Pick<AiAssetDebugClient, "syncManifestModule">>;
  resolveAssetUrl(file: string): string;
  onManifest(manifest: AiAssetManifest, assetId: string, activeChanged: boolean): void;
}) {
  let manifest = options.manifest, index = 0, busy = false, disposed = false, requestingMicrophone = false;
  let moduleDirty = false;
  let pendingTrim: string | undefined;
  const takeRows = new Map<string, { row: HTMLDivElement; label: HTMLSpanElement; favorite: HTMLButtonElement; remove: HTMLButtonElement; player: ReturnType<typeof createVoiceTakePlayer> }>();
  let draftRow: HTMLDivElement | undefined;
  const empty = document.createElement("p"); empty.textContent = "No takes yet. Press Record when ready.";
  let editing: "text" | "direction" | undefined;
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
  direction.className = "ai-game-assets-designer__recording-direction";
  const scriptRow = document.createElement("div"); scriptRow.className = "ai-game-assets-designer__recording-copy";
  const directionRow = document.createElement("div"); directionRow.className = "ai-game-assets-designer__recording-copy";
  const editor = document.createElement("div"); editor.className = "ai-game-assets-designer__recording-editor";
  const editInput = document.createElement("textarea"); editInput.rows = 3;
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
    if (!force && ((busy && !requestingMicrophone) || capture || unsaved || editing || pendingTrim)) {
      announce("Save or cancel your text edit, and save any pending take or trim before closing."); return;
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
    for (const item of takeRows.values()) item.player.dispose(); takeRows.clear();
    if (unsaved) URL.revokeObjectURL(unsaved.url);
    window.removeEventListener("beforeunload", protect);
    if (force && !busy && moduleDirty) void options.client.syncManifestModule?.().catch(() => {});
    modal.remove(); if (previousFocus?.isConnected) previousFocus.focus(); resolveClosed();
  };
  const protect = (event: BeforeUnloadEvent) => {
    if (busy || capture || unsaved || editing || pendingTrim || (moduleDirty && deferManifestModuleWrite)) { event.preventDefault(); event.returnValue = ""; }
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
      audioSettings: { ...asset.audioSettings, format: "wav" },
      audioPlayback: { trimStartSeconds: 0, trimEndSeconds: draft.audio.durationSeconds }, activate,
      notes: "Microphone recording", deferManifestModuleWrite });
    // Clear the draft before notifying the game: callback failures must not duplicate saved audio.
    URL.revokeObjectURL(draft.url); unsaved = undefined;
    publish(saved.manifest, id, activate);
    announce(activate ? "Take saved and starred as the favorite." : "Take saved. Star it to use this recording in the game.");
  };
  const startEdit = (field: "text" | "direction") => {
    if (busy || capture || unsaved || editing || pendingTrim) return;
    editing = field;
    editInput.value = field === "text" ? script.textContent ?? "" : voiceLineDirection(manifest.assets[options.lineAssetIds[index]!]!);
    editInput.setAttribute("aria-label", field === "text" ? "Text to say" : "Director notes");
    render(); editInput.focus();
  };
  const editScript = button("", () => startEdit("text")); editScript.setAttribute("aria-label", "Edit line");
  const editDirection = button("", () => startEdit("direction")); editDirection.setAttribute("aria-label", "Edit director notes");
  for (const edit of [editScript, editDirection]) {
    edit.title = edit.getAttribute("aria-label")!;
    edit.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  const saveEdit = button("Save and promote", () => void run(async () => {
    const field = editing;
    if (!field || (field === "text" && !editInput.value.trim())) return;
    const id = options.lineAssetIds[index]!;
    announce("Promoting text…");
    const updated = await options.client.updateVoiceLine({ assetId: id, [field]: editInput.value, deferManifestModuleWrite });
    editing = undefined;
    publish(updated, id, false);
    announce("Text promoted. Existing audio is unchanged; record a new take if the words have changed.");
  }));
  const cancelEdit = button("Cancel edit", () => { editing = undefined; announce(""); render(); });
  editInput.oninput = () => { saveEdit.disabled = busy || (editing === "text" && !editInput.value.trim()); };
  const editActions = document.createElement("div"); editActions.className = "ai-game-assets-designer__modal-actions";
  editActions.append(cancelEdit, saveEdit); editor.append(editInput, editActions);
  scriptRow.append(script, editScript); directionRow.append(direction, editDirection);
  const record = button("Record", () => {
    if (capture) { capture.stop(); return; }
    if (busy || unsaved || editing || pendingTrim) return;
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
  const previous = button("Previous", () => { if (!busy && !capture && !unsaved && !editing && !pendingTrim && index > 0) { stopPlayback(); index--; announce(""); render(); } });
  const next = button("Next", () => {
    if (busy || capture || unsaved || editing || pendingTrim) return;
    if (index === options.lineAssetIds.length - 1) close();
    else { stopPlayback(); index++; announce(""); render(); }
  });
  const exit = button("Close", () => close());
  const actions = document.createElement("div"); actions.className = "ai-game-assets-designer__modal-actions";
  actions.append(exit, previous, next);
  const recordActions = document.createElement("div"); recordActions.className = "ai-game-assets-designer__modal-actions"; recordActions.append(record);
  const hint = document.createElement("p"); hint.textContent = "Drag the yellow markers to trim each take. ★ Favorite = the recording used in the game. All other takes are saved in Previous versions. Next skips lines you do not record.";
  card.append(title, counter, progress, scriptRow, directionRow, editor, recordActions, status, takes, hint, actions); modal.append(card);
  function render() {
    const id = options.lineAssetIds[index]!, asset = manifest.assets[id]!;
    const active = asset.versions[asset.activeVersion];
    counter.textContent = `Line ${index + 1} of ${options.lineAssetIds.length}`;
    progress.value = index + 1;
    script.textContent = asset.voiceSettings?.text ?? active?.voiceSettings?.text ?? asset.prompt;
    direction.textContent = voiceLineDirection(asset) || "No director notes.";
    scriptRow.hidden = editing === "text"; directionRow.hidden = editing === "direction";
    editor.hidden = !editing;
    (editing === "text" ? scriptRow : directionRow).after(editor);
    editScript.disabled = editDirection.disabled = busy || Boolean(capture || unsaved || editing || pendingTrim);
    editInput.disabled = cancelEdit.disabled = busy;
    saveEdit.disabled = busy || (editing === "text" && !editInput.value.trim());
    record.replaceChildren();
    const recordIcon = document.createElement("span"); recordIcon.className = "ai-game-assets-designer__record-icon";
    recordIcon.dataset.recording = String(Boolean(capture)); recordIcon.setAttribute("aria-hidden", "true");
    record.append(recordIcon, capture ? "Stop recording" : "Record");
    record.disabled = busy || Boolean(unsaved || editing || pendingTrim);
    previous.disabled = busy || Boolean(capture || unsaved || editing || pendingTrim) || index === 0;
    next.disabled = busy || Boolean(capture || unsaved || editing || pendingTrim);
    exit.disabled = (busy && !requestingMicrophone) || Boolean(capture || unsaved || editing || pendingTrim);
    next.textContent = index === options.lineAssetIds.length - 1 ? "Done" : "Next";
    const versions = Object.entries(asset.versions).filter(([, version]) => version.file);
    const keys = new Set(versions.map(([name]) => `${id}:${name}`));
    for (const [key, item] of takeRows) if (!keys.has(key)) { item.player.dispose(); item.row.remove(); takeRows.delete(key); }
    for (const [i, [name, version]] of versions.entries()) {
      const key = `${id}:${name}`;
      let item = takeRows.get(key);
      if (!item) {
        const row = document.createElement("div"); row.className = "ai-game-assets-designer__recording-take";
        const header = document.createElement("div"); header.className = "ai-game-assets-designer__take-header";
        const label = document.createElement("span"); label.title = name;
        const favorite = button("☆", () => void run(async () => {
          announce("Promoting favorite…");
          publish(await options.client.selectVoiceLineVersion({ assetId: id, versionName: name, deferManifestModuleWrite }), id, true);
          announce("Favorite promoted.");
        }));
        const remove = button("Delete", () => void run(async () => {
          const activeChanged = manifest.assets[id]!.activeVersion === name;
          publish(await options.client.deleteVersion({ assetId: id, versionName: name, replaceActiveVoiceLine: true, deferManifestModuleWrite }), id, activeChanged);
          announce("Take deleted.");
        }));
        const player = createVoiceTakePlayer({ src: options.resolveAssetUrl(version.file), durationSeconds: version.durationSeconds,
          playback: version.audioPlayback, onTrim: async (trimStartSeconds, trimEndSeconds) => {
            pendingTrim = key; busy = true; render(); announce("Saving trim…");
            try {
              const updated = await options.client.trimVoiceLineVersion({ assetId: id, versionName: name, trimStartSeconds, trimEndSeconds, deferManifestModuleWrite });
              publish(updated, id, manifest.assets[id]!.activeVersion === name);
              pendingTrim = undefined; announce("Trim saved.");
            } catch (error) {
              announce(`Trim could not save: ${error instanceof Error ? error.message : String(error)}. Retry the trim save before continuing.`);
              throw error;
            } finally { busy = false; if (!disposed) render(); }
          } });
        player.audio.addEventListener("play", () => takes.querySelectorAll("audio").forEach(other => { if (other !== player.audio) other.pause(); }));
        header.append(label, favorite, remove); row.append(header, player.root);
        item = { row, label, favorite, remove, player }; takeRows.set(key, item);
        takes.append(row);
      }
      item.label.textContent = `Take ${i + 1}`;
      item.favorite.textContent = asset.activeVersion === name ? "★" : "☆";
      item.favorite.setAttribute("aria-label", `Favorite take ${i + 1}`);
      item.favorite.setAttribute("aria-pressed", String(asset.activeVersion === name));
      item.remove.setAttribute("aria-label", `Delete take ${i + 1}`);
      item.favorite.disabled = item.remove.disabled = busy || Boolean(capture || unsaved || editing || pendingTrim);
      item.player.setLabel(`take ${i + 1}`);
      item.player.setDisabled(busy || Boolean(capture || editing || (pendingTrim && pendingTrim !== key)));
    }
    draftRow?.remove(); draftRow = undefined;
    empty.remove();
    if (unsaved) {
      const row = document.createElement("div"); row.className = "ai-game-assets-designer__recording-take"; draftRow = row;
      const label = document.createElement("span"); label.textContent = "Unsaved take";
      const audio = document.createElement("audio"); audio.controls = true; audio.src = unsaved.url;
      const retry = button("Retry save", () => void run(() => saveTake(id)));
      const remove = button("Delete", () => { if (busy) return; URL.revokeObjectURL(unsaved!.url); unsaved = undefined; announce("Unsaved take deleted."); render(); });
      const download = document.createElement("a"); download.href = unsaved.url; download.download = `${id}-take.${unsaved.blob.type.includes("mp4") ? "m4a" : "webm"}`; download.textContent = "Download";
      retry.disabled = remove.disabled = busy;
      row.append(label, audio, retry, remove, download); takes.append(row);
    }
    if (!versions.length && !unsaved) takes.append(empty);
  }
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (editing && !busy) { editing = undefined; render(); } else close(); }
    if (event.key === "Tab") {
      const buttons = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), audio[controls], input:not(:disabled), a[href]")].filter(element => !element.closest("[hidden]"));
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
  });
  options.root.append(modal); render(); record.focus();
  return { closed, close: () => close(true) };
}
