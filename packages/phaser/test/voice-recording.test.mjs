import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRecordingWav } from '../dist/voice-recording.js';

test('microphone audio becomes an interoperable PCM WAV with interleaved channels and correct duration', () => {
  const data = [new Float32Array([-1, 0, 1]), new Float32Array([2, -2, .5])];
  const wav = encodeRecordingWav({ numberOfChannels: 2, length: 3, sampleRate: 48000, getChannelData: i => data[i] });
  const v = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
  assert.equal(v.getUint16(22, true), 2); assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => v.getInt16(44 + i * 2, true)), [-32768, 32767, 0, -32768, 32767, 16383]);
});
