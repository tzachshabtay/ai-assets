# Portrait lip sync

Lip sync is opt-in on a **portrait base image**. It does not change character
sprites, directional animations, or ordinary linked speaking animations.

1. Select a portrait's **Base image**, then **Lip sync…**.
2. Enable it and select the character's voice. Save settings.
3. Draw the mouth/jaw region and choose **Generate 3 mouth sets**. Inspect the
   nine poses, choose a candidate, and **Save mouth set**. The generator receives
   the actual selected portrait. Pixels outside the region and the rest frame
   are preserved exactly. Each pose supports the existing touch-up editor.
4. Alternatively, upload an evenly divided mouth sheet, map its frame numbers
   to the labeled poses, and save. Individual poses can also be uploaded.
5. Choose **Analyze voice lines**, using **Missing or outdated** or **All selected
   recordings**. Preview a line with the portrait and waveform. Previous takes
   can be selected for analysis too. **Edit mouth cues** exposes optional timing
   corrections; normal use needs no manual phoneme editing.

New generated voice lines and microphone/uploaded takes are analyzed
automatically when their voice is assigned to an enabled portrait. An analysis
failure never discards the recording: use the missing/outdated batch action to
retry. Selecting a different take selects its own timing. Changing spoken text
invalidates old timing. Trimming does not require reanalysis because cues use
the original recording's time coordinates.

Unvoiced lines use estimated text timing. Authoring uses the CMU pronunciation
dictionary for English, with a small spelling fallback for unknown words and
optional pronunciation overrides. Non-English text estimation is approximate.
Recorded English uses Rhubarb's transcript-assisted recognizer; other language
codes select its phonetic recognizer. This is automatic 2D mouth-pose selection,
not video generation or a perfect phonetic transcript.

## Data and runtime

The portrait stores `lipSync` settings, including `voiceAssetId` and
`mouthAssetId`. The mouth asset is a linked child with a `mouthSet` mapping for
Rhubarb's nine shapes: X (rest), A–H. Each saved mouth version includes its own
frame layout. A voice version stores a `lipSyncTrack` with source file, audio
hash, transcript, analyzer version and `{start, end, shape}` cues. No executable
or speech-recognition model is shipped to the game's browser.

`AiPortraitLipSync` renders into an HTML canvas and accepts a manifest getter,
asset URL resolver, pause predicate, and an optional audio clock. Its
`speak(utteranceKey, text, selectedVoiceAsset, clock)` call is idempotent for a
stable utterance key. Pass a new key when repeating the same line. The clock
must return the position in the **original, untrimmed recording**, plus playing
and paused flags. It should follow the actual audio device/player, not a
separate timer. Pointlesh's `adventureLipSyncClock` adapts Phaser seek/markers,
which already incorporate playback speed.

After playback ends the portrait returns to rest; it does not loop its mouth
while waiting for Continue. Skipping should call `stop()`. Call `destroy()` when
the portrait is disposed. Non-opted-in portraits retain their old behavior.

## Local analyzer

The authoring server installs Rhubarb 1.14.0 from its official GitHub release on
first use and caches it under `~/.cache/ai-game-assets/rhubarb`. Audio is decoded
locally into mono WAV; no transcription service or additional API key is needed.
Results are cached by audio bytes, text, language and analyzer version. The
first installation requires internet access; later analysis can work offline.
`RHUBARB_PATH` can point to an existing installation on other platforms.

Rhubarb is MIT licensed; its distribution includes notices for its bundled
recognizers. See [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync).
The CMU pronunciation dictionary package is ISC licensed. AI mouth generation
uses the configured image provider and its existing account credentials.
