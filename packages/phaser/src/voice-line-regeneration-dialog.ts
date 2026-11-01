import type { VoiceLineRegenerationProgress, VoiceLineRegenerationScope } from "./voice-line-regeneration.js";

/** A batch stays visible until acknowledged; stopping never discards the current paid result. */
export function openVoiceLineRegenerationDialog(options: {
  root: HTMLElement;
  mode?: "generate" | "record";
  voiceName: string;
  allCount: number;
  missingCount: number;
  onStop(): void;
}) {
  const recording = options.mode === "record";
  const title = recording ? "Record voice lines" : "Generate voice lines";
  const previousFocus = document.activeElement as HTMLElement | null;
  const modal = document.createElement("div");
  modal.className = "ai-game-assets-designer__modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", title);
  const card = document.createElement("div");
  card.className = "ai-game-assets-designer__modal-card ai-game-assets-designer__voice-batch";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const voice = document.createElement("p");
  voice.textContent = options.voiceName;
  const label = document.createElement("label");
  label.className = "ai-game-assets-designer__field";
  label.textContent = recording ? "Lines to record" : "Lines to generate";
  const scope = document.createElement("select");
  scope.setAttribute("aria-label", recording ? "Lines to record" : "Lines to generate");
  for (const [value, text] of [
    ["missing", `Missing or outdated recordings (${options.missingCount})`],
    ["all", `All lines (${options.allCount})`]
  ]) {
    const option = document.createElement("option");
    option.value = value!;
    option.textContent = text!;
    scope.append(option);
  }
  label.append(scope);
  const explanation = document.createElement("p");
  const progress = document.createElement("progress");
  progress.setAttribute("aria-label", "Voice lines completed");
  progress.hidden = true;
  progress.value = 0;
  const count = document.createElement("p");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "ai-game-assets-designer__modal-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = recording ? "Start recording" : "Start generation";
  actions.append(cancel, start);
  card.append(heading, voice, label, explanation, progress, count, status, actions);
  modal.append(card);
  let state: "setup" | "running" | "done" = "setup";
  let resolveSelection!: (scope: VoiceLineRegenerationScope | undefined) => void;
  let resolveClosed!: () => void;
  const selection = new Promise<VoiceLineRegenerationScope | undefined>((resolve) => { resolveSelection = resolve; });
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const close = () => {
    if (state === "running") options.onStop();
    resolveSelection(undefined);
    modal.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
    resolveClosed();
  };
  const sync = () => {
    const missing = scope.value === "missing";
    explanation.textContent = recording
      ? "Record each line with your microphone. Keep multiple takes and star your favorite to promote it. Other takes stay in version history."
      : missing
      ? "Keep selected and promoted recordings that match the current text. Generate and promote one recording for each remaining line."
      : "Generate and promote one new recording for every line, replacing its selected or active recording. Previous promoted versions are kept.";
    const total = missing ? options.missingCount : options.allCount;
    start.disabled = total === 0;
    status.textContent = total === 0 ? "Every line already has a recording matching its current text." : recording ? "Microphone access is requested when you press Record. You can skip lines and return to them." : "Uses your configured voice provider and generation credits.";
  };
  scope.addEventListener("change", sync);
  start.addEventListener("click", () => {
    if (recording) {
      resolveSelection(scope.value as VoiceLineRegenerationScope);
      close();
      return;
    }
    state = "running";
    scope.disabled = true;
    start.hidden = true;
    cancel.textContent = "Stop after current line";
    progress.max = scope.value === "missing" ? options.missingCount : options.allCount;
    progress.hidden = false;
    count.textContent = `0 / ${progress.max} lines completed`;
    status.textContent = "Starting…";
    resolveSelection(scope.value as VoiceLineRegenerationScope);
    cancel.focus();
  });
  cancel.addEventListener("click", () => {
    if (state !== "running") return close();
    options.onStop();
    cancel.disabled = true;
    cancel.textContent = "Stopping…";
    status.textContent = "Finishing and saving the current line before stopping…";
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (state !== "running") close();
    }
    if (event.key === "Tab") {
      const focusable = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled):not([hidden]), select:not(:disabled)")];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  options.root.append(modal);
  sync();
  scope.focus();
  return {
    selection, closed, close,
    update(update: VoiceLineRegenerationProgress, lineName: string) {
      progress.max = update.total;
      progress.value = update.index;
      count.textContent = `${update.index} / ${update.total} lines completed`;
      status.textContent = `${update.phase === "generation" ? "Generating" : "Saving"} ${lineName} (${update.index + 1}/${update.total})…`;
    },
    finish(message: string, completed: number) {
      state = "done";
      progress.value = completed;
      count.textContent = `${completed} / ${progress.max} lines processed`;
      status.textContent = message;
      cancel.textContent = "Close";
      cancel.disabled = false;
      cancel.focus();
    }
  };
}
