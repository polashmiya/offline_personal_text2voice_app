# Architecture

```
UI (features/*, components/*)          React Native, TypeScript strict
  │  zustand stores: preferences · voices · editor (session) · generation · player
  ▼
Domain (src/domain)                     pure TS, unit-tested, no React / native imports
  text/pipeline.ts  sentences → dictionary → Banglish → semiotics → segments → normalize → route → chunks
  voicepack/manifest.ts                 package schema
  ▼
Services (src/services)
  native/   typed TurboModule specs (codegen) → Kotlin
  db/       op-sqlite, migrations, repositories (metadata only)
  storage/  app-private paths
  ▼
Native (android/app/src/main/java/com/voicestudio/offline)
  engine/VoiceEngineModule   sherpa-onnx OfflineTts on one inference thread; load→warm-up→synthesize→idle→unload
  engine/GenerationService   foreground service + wake lock for long jobs
  audio/AudioToolsModule     WAV join + loudness, waveform, export, MediaPlayer
  audio/AudioEncoder         MediaCodec AAC/FLAC/Opus, MediaMuxer MP4/OGG
  audio/Resampler            streaming windowed-sinc resampler
  util/Lame                  JNI → :lame module (MP3)
  files/FileBridgeModule     SAF pick/save, FileProvider share, safe unzip, sha256, atomic writes
```

The UI never talks to a model directly. A voice is data (a manifest plus files), and the engine type is a field in that manifest. This means the app can switch VITS, Kokoro and Matcha models, or add future engines, without UI changes.

## Generation job

1. `buildSynthesisPlan` (pure) turns the text into chunks with pause lengths, or returns `unsupported_language` / `empty_text`.
2. Checks: the voice files exist, there is free space, and a DB row is created (`preparing`).
3. Foreground service when there are more than 3 chunks, plus keep-screen-on if enabled.
4. Each chunk is synthesized natively to `cache/jobs/<id>/chunk_N.wav`. Progress equals the number of chunks done, and **Cancel** stops mid-inference via the sherpa callback.
5. `concatenateWav`: two streaming passes (measure speech RMS, then write with gain, 6 ms edge fades, pauses and a −1 dBFS ceiling).
6. **Validate** the final file (readable, duration > 0, sample rate). Only then is the job marked `completed`.
7. The temp folder is always deleted. On app start, unfinished jobs become `interrupted` and partial audio is removed.

## Storage

Metadata lives in SQLite (`voices`, `projects`, `generations`, `exports`, `pronunciations`, `settings`). Binaries live on disk under `files/` and `cache/`. Only `files/exports/` is shareable through the FileProvider. Recordings and models are never exposed.
