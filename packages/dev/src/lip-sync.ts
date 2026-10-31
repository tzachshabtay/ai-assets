import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, access, chmod, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir, platform, arch } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { estimateLipSync, assertLipSyncTrack, lipSyncVoiceSettings, type AiLipSyncTrack, type AiLipSyncSettings } from '@ai-game-assets/core';
import { readManifest, writeManifest, writeManifestModule, type AssetStoreOptions } from './asset-store.js';

const run = promisify(execFile), VERSION = '1.14.0';
let installation: Promise<string> | undefined;
export function lipSyncLocalFile(options: AssetStoreOptions, file: string): string {
  const prefix = (options.publicPathPrefix ?? '').replace(/^\/+|\/+$/g, '');
  const relative = file.replace(/^\/+/, '');
  if (/^[a-z][a-z\d+.-]*:/i.test(file) || file.startsWith('//') || (prefix && !relative.startsWith(prefix + '/'))) throw new Error('Lip sync requires a local asset file.');
  const root = path.resolve(options.assetsDir), resolved = path.resolve(root, prefix ? relative.slice(prefix.length + 1) : relative);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Lip-sync source is outside the asset directory.');
  return resolved;
}
async function rhubarb(): Promise<string> {
  if (process.env.RHUBARB_PATH) return process.env.RHUBARB_PATH;
  return installation ??= install().catch(error => { installation = undefined; throw error; });
}
async function install(): Promise<string> {
  const os = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[platform() as 'darwin'|'linux'|'win32'];
  if (!os || (platform() !== 'darwin' && arch() !== 'x64')) throw new Error('This platform needs a Rhubarb executable configured with RHUBARB_PATH.');
  const directory = path.join(homedir(), '.cache', 'ai-game-assets', 'rhubarb', VERSION);
  const name = `Rhubarb-Lip-Sync-${VERSION}-${os}`;
  const executable = path.join(directory, name, platform() === 'win32' ? 'rhubarb.exe' : 'rhubarb');
  try { await access(executable); return executable; } catch { /* First use installs the bundled analysis tool. */ }
  await mkdir(directory, { recursive: true });
  const response = await fetch(`https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${VERSION}/${name}.zip`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Could not install lip-sync analyzer (${response.status}). Try again, or configure RHUBARB_PATH.`);
  const zip = path.join(directory, `${name}.zip`);
  await writeFile(zip, new Uint8Array(await response.arrayBuffer()));
  const files = unzipSync(await readFile(zip));
  for (const [entry, bytes] of Object.entries(files)) {
    const destination = path.resolve(directory, entry);
    if (!destination.startsWith(path.resolve(directory) + path.sep)) throw new Error('Invalid analyzer archive path.');
    if (entry.endsWith('/')) { await mkdir(destination, { recursive: true }); continue; }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  if (platform() !== 'win32') await chmod(executable, 0o755);
  return executable;
}
export function textLipSync(text: string, settings?: Partial<AiLipSyncSettings>): AiLipSyncTrack {
  return estimateLipSync(text, { language: settings?.language, wordsPerMinute: settings?.wordsPerMinute,
    phones: settings?.language && !settings.language.startsWith('en') ? settings.pronunciations : { ...dictionary, ...settings?.pronunciations } });
}
/** Audio stays local. Normalize into mono PCM for the analyzer without an external media application. */
export async function analyzeLipSyncAudio(bytes: Uint8Array, text: string, settings?: Partial<AiLipSyncSettings>): Promise<AiLipSyncTrack> {
  const executable = await rhubarb();
  const hash = createHash('sha256').update(bytes).digest('hex');
  const language = settings?.language ?? 'en';
  const cacheKey = createHash('sha256').update(`${VERSION}:${hash}:${text}:${language}`).digest('hex');
  const cacheDir = path.join(homedir(), '.cache', 'ai-game-assets', 'lip-sync');
  const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
  try { const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as AiLipSyncTrack; assertLipSyncTrack(cached); return cached; } catch { /* Analyze missing or invalid cache. */ }
  const { default: decode } = await import('audio-decode');
  const audio = await decode(bytes);
  const duration = (audio.channelData[0]?.length ?? 0) / audio.sampleRate;
  if (!duration || duration > 600) throw new Error('Lip-sync voice clips must be between 0 and 600 seconds.');
  const sampleRate = 16000, count = Math.ceil(duration * sampleRate), wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  const channels = audio.channelData;
  for (let i = 0; i < count; i++) {
    const position = i * audio.sampleRate / sampleRate, left = Math.floor(position), fraction = position - left;
    const value = channels.reduce((sum, channel) => sum + (channel[left] ?? 0) * (1 - fraction) + (channel[left + 1] ?? 0) * fraction, 0) / channels.length;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  const temp = await mkdtemp(path.join(tmpdir(), 'ai-assets-lipsync-'));
  try {
    await writeFile(path.join(temp, 'voice.wav'), wav); await writeFile(path.join(temp, 'line.txt'), text);
    const args = ['-f','json','--quiet','--extendedShapes','GHX','--threads','2','-r',language.startsWith('en') ? 'pocketSphinx' : 'phonetic','-d',path.join(temp, 'line.txt'),path.join(temp, 'voice.wav')];
    let result;
    try { result = await run(executable, args, { timeout: Math.min(900000, 60000 + duration * 30000), maxBuffer: 8 * 1024 * 1024 }); }
    catch (error) {
      const failure = error as { killed?: boolean; stderr?: string; code?: string };
      throw new Error(failure.killed
        ? 'Audio analysis took too long. The recording is safe. Retry analysis when the computer is less busy.'
        : `Audio analysis failed. The recording is safe. ${failure.code === 'ENOENT' ? 'The analyzer could not be started.' : (failure.stderr ?? '').replace(/[\x00-\x1f]/g, ' ').trim().slice(-240)}`);
    }
    const output = JSON.parse(result.stdout);
    const track: AiLipSyncTrack = { schemaVersion: 1, source: 'rhubarb', text, language, duration: output.metadata.duration,
      audioHash: hash, analyzer: `rhubarb-${VERSION}`, cues: output.mouthCues.map((cue: { start: number; end: number; value: string }) => ({ start: cue.start, end: cue.end, shape: cue.value })) };
    assertLipSyncTrack(track); await mkdir(cacheDir, { recursive: true }); await writeFile(cacheFile, JSON.stringify(track));
    return track;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
/** Analyze one selected take. Read again before saving so other lines/authoring edits are never lost. */
export async function analyzeLipSyncLine(options: AssetStoreOptions, id: string, versionName?: string) {
  const snapshot = await readManifest(options.manifestPath), asset = snapshot.assets[id];
  if (asset?.kind !== 'voice-line') throw new Error('Select a voice line to analyze.');
  const version = asset.versions[versionName ?? asset.activeVersion];
  const voice = version?.voiceSettings?.voiceAssetId ?? asset.voiceSettings?.voiceAssetId ?? '';
  const settings = lipSyncVoiceSettings(snapshot, voice);
  const text = version?.voiceSettings?.text ?? asset.voiceSettings?.text ?? asset.prompt;
  const track = version?.file ? await analyzeLipSyncAudio(await readFile(lipSyncLocalFile(options, version.file)), text, settings) : textLipSync(text, settings);
  if (version) track.sourceFile = version.file;
  const manifest = await readManifest(options.manifestPath), latest = manifest.assets[id]!;
  const target = version ? latest.versions[versionName ?? asset.activeVersion] : latest;
  if (!target || (version && (target as typeof version).file !== version.file) || (target.voiceSettings?.text ?? latest.voiceSettings?.text ?? latest.prompt) !== text) throw new Error('This take changed during analysis. Please retry.');
  target.lipSyncTrack = track;
  await writeManifest(options.manifestPath, manifest);
  if (options.manifestModulePath) await writeManifestModule(options.manifestModulePath, manifest);
  return { manifest, track };
}
