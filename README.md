# Voice Studio — Offline Bangla / English / Banglish Text-to-Speech

> **Your text. Your voice. Your device.** No cloud, no paid API, no account.

An Android app (React Native + Kotlin) that turns Bangla, English and Banglish text into speech **entirely on the phone**, using open-source TTS models run with [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx).

The plan is in [`ROADMAP.md`](ROADMAP.md) (12 steps). The current status is listed below, with every feature marked working or not yet built.

## Status

| Area | State |
|---|---|
| Text pipeline: Bangla/English/Banglish segmentation, number/money/date/time/unit reading, acronyms, pronunciation dictionary, chunking | ✅ Built, 85 unit tests |
| Offline inference (sherpa-onnx, VITS/Piper/Kokoro/Matcha) on a background thread, cancellable, idle/memory-pressure unload | ✅ Built, tested on an emulator |
| `.voicepack` import: safe unzip, SHA-256 of every file, schema validation, test-load before install | ✅ Built, tested on an emulator |
| Generation jobs: real per-chunk progress, cancel, foreground service, crash recovery, output validation | ✅ Built |
| Player: waveform, seek, ±10 s, restart, playback-speed preview | ✅ Built |
| Export: WAV, MP3 (LAME), M4A/AAC, FLAC, OGG/Opus (Android 10+); unsupported formats hidden | ✅ Built |
| Save to user-chosen location (SAF), share (FileProvider) | ✅ Built |
| Projects, history, search, rename, delete, auto-save, draft restore | ✅ Built |
| Settings (theme, app language বাংলা/English, defaults, storage, privacy delete-all, licenses) | ✅ Built |
| Two flavors: `offline` (no INTERNET permission) and `standard` | ✅ Built (downloads not yet built) |
| Background music, mixer, ducking | ⏳ Roadmap step 9: shown as "Coming soon" |
| Personal Voice Studio (recording, quality checks) | ⏳ Roadmap step 10: shown as "Coming soon" |
| Desktop voice training pipeline | ⏳ Roadmap steps 2 and 11 |
| Own Bangladeshi Bengali base voice with clear commercial license | ⏳ Roadmap step 2: see "Known limitations" |
| In-app model download (`standard` flavor) | ⏳ Roadmap step 12 |

Nothing in the UI fakes work: unfinished features say **Coming soon** and are not clickable.

## Repository layout

```
mobile/                 React Native app (TypeScript strict)
  src/domain/           pure logic: text pipeline, voicepack schema, export naming (unit-tested)
  src/services/         native bridges, SQLite, storage paths, logging
  src/features/         tts, audio-studio (player/export), model-manager, projects, settings, onboarding, voice-studio
  android/app/…/        Kotlin TurboModules: VoiceEngine, AudioTools, FileBridge
  android/lame/         LAME 3.100 (LGPL) MP3 encoder as a separate .so
tools/voice-package/    make-voicepack.mjs: build a .voicepack from a sherpa-onnx model folder
models/voices/          voice configs (metadata only; no binaries in git)
docs/                   architecture, voice packages, privacy, build, licenses, troubleshooting
```

## Requirements

- Node 22.11+, JDK 17, Android SDK (compileSdk 37 is downloaded by Gradle), NDK 27.1
- An Android 7.0+ device or emulator (x86_64 emulator works)

## Development

```bash
cd mobile
npm install
npm test                      # unit tests (text pipeline, etc.)
npx tsc --noEmit              # type check
npx react-native start        # Metro
cd android && ./gradlew assembleOfflineDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/offline/debug/app-offline-debug.apk
```

The sherpa-onnx AAR (v1.13.8) is downloaded on the first Gradle run and checked by SHA-256. See [docs/android-build.md](docs/android-build.md).

## Installing a voice

1. Build a pack from any sherpa-onnx compatible model folder:
   ```bash
   node tools/voice-package/make-voicepack.mjs --src <model-folder> \
     --config models/voices/bn-mimic3-multi-low.json --out dist/bn.voicepack
   ```
2. Copy the `.voicepack` to the phone (USB, SD card, Files).
3. In the app go to **Voices → Import voice package**.

The format is described in [docs/voice-packages.md](docs/voice-packages.md).

## Known limitations

- **No commercially-cleared Bangladeshi Bengali voice is bundled yet.** The development voice (Mimic 3 Bengali, trained on OpenSLR 37 + CMU Indic) works offline. Its model-weight license is not stated, so it is marked *not cleared for commercial use*. Training our own base voice is roadmap step 2.
- English inside Bangla text is read with Bangla pronunciation by Bengali voices. Common tech words use a curated lexicon. Other words use spelling rules, which give an approximate result; the pronunciation dictionary fixes any word.
- Roman-Banglish detection is conservative. Choose the **Banglish (Roman)** language option to force conversion.
- Export metadata tags (title/artist) are not written yet.
- Pitch control is hidden because no current voice supports it properly.

## Licensing

App code: to be decided by the owner. Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Model licenses are shown per voice in the app (**Settings → Open-source licenses**) and in [docs/model-licenses.md](docs/model-licenses.md).
