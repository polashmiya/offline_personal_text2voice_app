# `.voicepack` format (v1)

A zip archive containing **data only**. The app never executes anything from a package.

```
manifest.json
model/<model>.onnx
model/tokens.txt
model/lexicon.txt          (optional)
model/espeak-ng-data/…     (optional, for Piper/Mimic-style phoneme models)
model/voices.bin           (Kokoro only)
dictionary/…               (optional)
assets/preview.wav         (optional)
```

## Manifest

The schema is defined in `mobile/src/domain/voicepack/manifest.ts` (Zod). Key fields:

| Field | Meaning |
|---|---|
| `formatVersion` | `1` |
| `id` | `[a-z0-9._-]`, 3–64 chars. Importing the same id replaces the old version. |
| `engine` | `vits` (VITS, Piper, Mimic3, MMS), `kokoro` or `matcha` |
| `languages` | languages the model reads natively (`bn`, `en`) |
| `languageHandling` | `{ bn: "native", en: "transliterate" }` makes a Bengali voice read English words in Bangla pronunciation, with one consistent voice |
| `sampleRate` | must match the model; verified by a test load |
| `maxChunkChars` | text per inference request |
| `files` | package-relative paths: `model`, `tokens`, optional `lexicon`, `dataDir`, `dictDir`, `voices`, `vocoder` |
| `speakers` | `[{ id, key, label }]`. Styles of one voice are speaker ids of a multi-speaker model |
| `defaults` | `noiseScale`, `noiseScaleW`, `lengthScale` |
| `supports` | `{ speed, pitch }`. The UI hides unsupported controls |
| `license` | `name`, `url`, `commercialUse`, `attribution` (shown to users) |
| `personal` + `consent` | personal voices **must** carry `{ confirmed: true, confirmedAt }` |
| `checksums` | SHA-256 of **every** file except `manifest.json` |

## Import pipeline (on the phone)

1. The system file picker (no storage permission) copies the file into the app cache, with a size limit of 1.5 GB.
2. Free space is checked.
3. **Safe extraction** (`SafeZip.kt`) rejects `..`, absolute paths, backslashes and `:`. Bytes are counted as they are written, so a zip bomb fails. There is a maximum of 5,000 entries.
4. The manifest is checked against the schema.
5. Every file's SHA-256 is compared with `checksums`. Unlisted or missing files are rejected.
6. **Test load**: the engine loads the model, and its sample rate and speaker count must match the manifest.
7. The folder is moved into `files/voices/<id>` and a database row is written. **Only now** is the voice "installed".

If any step fails, the staging folder is deleted and the user sees a clear reason.

## Building a pack

```bash
node tools/voice-package/make-voicepack.mjs \
  --src  <sherpa-onnx model folder> \
  --config models/voices/<voice>.json \
  --out  dist/<voice>.voicepack
```

The config is the manifest without `checksums`/`createdAt`, plus `include` (package path → source path).

## Built-in voices

`mobile/android/app/src/main/assets/voices/*.voicepack` are installed on first launch through the same
validated import (`features/model-manager/services/bundledVoices.ts`). Each is installed once; deleting it in
the app is remembered. The packs (~31 MB each) are **not in git**; rebuild them before a release build:

```bash
for v in norman john; do
  curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-$v-medium-int8.tar.bz2
  tar -xjf vits-piper-en_US-$v-medium-int8.tar.bz2
  node tools/voice-package/make-voicepack.mjs --src vits-piper-en_US-$v-medium-int8 \n    --config models/voices/en-piper-$v-medium-int8.json \n    --out mobile/android/app/src/main/assets/voices/en-piper-$v-medium.voicepack
done
```

Without them the app still builds and runs; it simply starts with no built-in voices.
