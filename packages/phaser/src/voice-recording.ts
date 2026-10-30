/** Browser capture is encoded as PCM WAV so saved takes play in every supported game browser. */
export function encodeRecordingWav(buffer: Pick<AudioBuffer, "numberOfChannels" | "length" | "sampleRate" | "getChannelData">): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const output = new ArrayBuffer(44 + buffer.length * channels * 2);
  const view = new DataView(output);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, output.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, output.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let frame = 0; frame < buffer.length; frame++) for (let ch = 0; ch < channels; ch++) {
    const sample = Math.max(-1, Math.min(1, data[ch]![frame]!));
    view.setInt16(44 + (frame * channels + ch) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return output;
}

export async function recordingToWav(blob: Blob): Promise<{ dataUrl: string; durationSeconds: number }> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const wav = new Blob([encodeRecordingWav(buffer)], { type: "audio/wav" });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(wav);
    });
    return { dataUrl, durationSeconds: buffer.duration };
  } finally { await context.close(); }
}

export async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone recording is unavailable. Open the designer on localhost or HTTPS in a browser with microphone support.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => stream.getTracks().forEach(track => track.stop());
  try {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { release(); reject(new Error("The microphone stopped unexpectedly. Please try another take.")); };
      recorder.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size) resolve(blob); else reject(new Error("No audio was captured. Please record another take."));
      };
    });
    recorder.start();
    return { result, stop: () => { if (recorder.state !== "inactive") recorder.stop(); release(); } };
  } catch (error) { release(); throw error; }
}
