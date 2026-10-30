import type { AiAudioPlaybackSettings } from "@ai-game-assets/core";
import { audioWaveformData, clamp, drawAudioEditorWaveform, formatAudioTime } from "./designer-support.js";

/** A persistent take player, sharing waveform decoding/drawing with the sound editor. */
export function createVoiceTakePlayer(options: {
  src: string;
  durationSeconds?: number;
  playback?: AiAudioPlaybackSettings;
  onTrim(start: number, end: number): Promise<void>;
}) {
  const root = document.createElement("div"); root.className = "ai-game-assets-designer__take-player";
  const audio = document.createElement("audio"); audio.preload = "metadata"; audio.src = options.src;
  const stage = document.createElement("div"); stage.className = "ai-game-assets-designer__take-waveform";
  const canvas = document.createElement("canvas"); canvas.width = 720; canvas.height = 100;
  const marker = (label: string) => {
    const el = document.createElement("button"); el.type = "button"; el.className = "ai-game-assets-designer__take-marker";
    el.setAttribute("role", "slider"); el.title = `${label}: drag to trim, or use arrow keys`;
    return el;
  };
  const startMarker = marker("Trim start"), endMarker = marker("Trim end");
  stage.append(canvas, startMarker, endMarker);
  const transport = document.createElement("div"); transport.className = "ai-game-assets-designer__take-transport";
  const play = document.createElement("button"); play.type = "button"; play.textContent = "▶";
  const seek = document.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = "1"; seek.step = "0.001";
  const time = document.createElement("span"); time.className = "ai-game-assets-designer__take-time";
  const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Retry trim save"; retry.hidden = true;
  const detail = document.createElement("div"); detail.className = "ai-game-assets-designer__take-trim";
  transport.append(play, seek, time); root.append(stage, transport, detail, retry, audio);
  let duration = options.durationSeconds ?? 0;
  let start = options.playback?.trimStartSeconds ?? 0, end = options.playback?.trimEndSeconds ?? duration;
  let peaks: Awaited<ReturnType<typeof audioWaveformData>>["peaks"] | undefined;
  let disposed = false, disabled = false, saving = false, changed = false, label = "take";
  let drag: { marker: HTMLButtonElement; pointerId: number } | undefined;
  let raf: number | undefined;
  audio.volume = clamp(options.playback?.volume ?? 1, 0, 1);
  audio.playbackRate = options.playback?.playbackRate ?? 1;
  const draw = () => {
    if (disposed) return;
    drawAudioEditorWaveform(canvas, { peaks, duration, progress: duration > 0 ? audio.currentTime / duration : 0,
      trimStart: duration > 0 ? start / duration : 0, trimEnd: duration > 0 ? end / duration : 1 });
    startMarker.style.left = `${duration ? start / duration * 100 : 0}%`;
    endMarker.style.left = `${duration ? end / duration * 100 : 100}%`;
    for (const [el, value, min, max] of [[startMarker, start, 0, end], [endMarker, end, start, duration]] as const) {
      el.setAttribute("aria-valuemin", String(min)); el.setAttribute("aria-valuemax", String(max));
      el.setAttribute("aria-valuenow", String(value)); el.setAttribute("aria-valuetext", `${value.toFixed(2)} seconds`);
      el.disabled = disabled || saving || duration <= 0;
    }
    play.textContent = audio.paused ? "▶" : "❚❚";
    play.setAttribute("aria-label", `${audio.paused ? "Play" : "Pause"} ${label}`);
    play.disabled = seek.disabled = disabled || saving || duration <= 0;
    seek.value = String(end > start ? clamp((audio.currentTime - start) / (end - start), 0, 1) : 0);
    time.textContent = duration > 0 ? `${formatAudioTime(audio.currentTime, true)} / ${formatAudioTime(duration, true)}` : "Loading duration…";
    detail.textContent = duration > 0 ? `Start ${formatAudioTime(start, true)} · End ${formatAudioTime(end, true)} · ${formatAudioTime(end - start, true)} selected` : "Loading waveform…";
    retry.disabled = disabled || saving;
  };
  const stopTick = () => { if (raf !== undefined) cancelAnimationFrame(raf); raf = undefined; };
  const tick = () => {
    if (disposed || audio.paused) { stopTick(); return; }
    if (audio.currentTime >= end) { audio.pause(); audio.currentTime = start; }
    draw();
    if (!audio.paused) raf = requestAnimationFrame(tick);
  };
  audio.addEventListener("play", () => {
    if (disabled || saving) { audio.pause(); return; }
    if (audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start;
    stopTick(); tick();
  });
  audio.addEventListener("pause", () => { stopTick(); draw(); });
  audio.addEventListener("timeupdate", draw);
  const setDuration = (value: number) => {
    if (disposed || !Number.isFinite(value) || value <= 0) return;
    const full = end === duration && options.playback?.trimEndSeconds === undefined && !changed;
    duration = value; start = clamp(start, 0, duration); end = full ? duration : clamp(end, start, duration); draw();
  };
  audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
  play.onclick = () => { if (audio.paused) void audio.play().catch(() => {}); else audio.pause(); };
  seek.oninput = () => { audio.currentTime = start + Number(seek.value) * (end - start); draw(); };
  const commit = async () => {
    if (!changed || saving || disabled) return;
    saving = true; retry.hidden = true; audio.pause(); draw();
    try { await options.onTrim(start, end); changed = false; }
    catch { retry.hidden = false; }
    finally { saving = false; draw(); }
  };
  retry.onclick = () => void commit();
  const move = (el: HTMLButtonElement, value: number) => {
    const gap = Math.min(0.03, duration);
    if (el === startMarker) start = clamp(value, 0, Math.max(0, end - gap));
    else end = clamp(value, Math.min(duration, start + gap), duration);
    changed = true; audio.pause();
    if (audio.currentTime < start || audio.currentTime > end) audio.currentTime = start;
    draw();
  };
  for (const el of [startMarker, endMarker]) {
    el.onpointerdown = event => {
      if (disabled || saving || !duration) return;
      event.preventDefault(); el.focus(); el.setPointerCapture(event.pointerId);
      drag = { marker: el, pointerId: event.pointerId };
    };
    el.onpointermove = event => {
      if (!drag || drag.marker !== el) return;
      if (!event.buttons) { finish(); return; }
      const rect = stage.getBoundingClientRect();
      move(el, (event.clientX - rect.left) / rect.width * duration);
    };
    const finish = () => {
      if (!drag || drag.marker !== el) return;
      const pointerId = drag.pointerId; drag = undefined;
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      void commit();
    };
    el.onpointerup = el.onpointercancel = el.onlostpointercapture = finish;
    el.onkeydown = event => {
      if (disabled || saving || !duration) return;
      const delta = event.shiftKey ? 0.1 : 0.01;
      const value = el === startMarker ? start : end;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      move(el, event.key === "Home" ? 0 : event.key === "End" ? duration : value + (event.key === "ArrowLeft" ? -delta : delta));
    };
    el.onkeyup = () => void commit(); el.onblur = () => { if (!drag) void commit(); };
  }
  void audioWaveformData(options.src, 160).then(data => { if (!disposed) { peaks = data.peaks; setDuration(data.duration); } }).catch(() => {
    if (!disposed) { detail.textContent = "Waveform unavailable. Try reopening this line."; }
  });
  draw();
  return {
    root, audio,
    setLabel(value: string) { label = value; startMarker.setAttribute("aria-label", `Trim start ${label}`); endMarker.setAttribute("aria-label", `Trim end ${label}`); seek.setAttribute("aria-label", `Seek ${label}`); canvas.setAttribute("aria-label", `${label} waveform`); draw(); },
    setDisabled(value: boolean) { disabled = value; if (value) audio.pause(); draw(); },
    dispose() { disposed = true; stopTick(); audio.pause(); audio.removeAttribute("src"); audio.load(); root.remove(); }
  };
}
