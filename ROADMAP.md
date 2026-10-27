# Offline Bangla / English / Banglish TTS + Personal Voice — 12-Step Build Plan

Source: `offline_personal_voice_tts_master_prompt.md` (the master prompt).
This roadmap turns the 104 sections of the master prompt into **12 buildable steps**.
Every step ends with a runnable app (or a working tool) and a clear "done" check.

> Core promise: **Your text. Your voice. Your device.** — 100% free, offline-first, no paid APIs, no account.

**Progress (2026-10-26):** steps 3–8 built. Step 2 done by exporting the openly licensed Piper `bn_BD`
checkpoint (6 Bangladeshi speakers) instead of training from scratch. Steps 10–11 built: Voice Studio
recording with quality checks and dataset export, plus `tools/voice-training` (prepare → fine-tune →
export → `.voicepack`, Colab notebook).

**Progress (2026-10-27):** step 9 built — native streaming mixer (`audio/Mixer.kt`: music loop with seam
fades, voice/music volume, music fade in/out, voice trim, silence padding, auto-duck with lookahead + hold,
lookahead limiter, two-pass loudness normalization), any-format music import (`AudioDecoder.kt`, decoded
once to mono WAV), music library (`music_tracks`, DB v3), mixer + preview on the Export screen. Still open
in step 9: bundled CC0 tracks (none shipped yet — user import only) and metadata tags; device test of
every format decoding back. Remaining: step 12.

---

## A. Changes made to the master prompt (and why)

| # | Change | Why |
|---|--------|-----|
| 1 | **"Banglish" now means two things:** (a) mixed Bangla + English script (`আজকে আমরা React Native…`) **and** (b) Bangla written in Roman letters (`ami tomake bhalobashi`). Added an offline **Roman→Bangla transliterator** (Avro-phonetic-style rules) to the text pipeline. | Most Bangladeshi users type Banglish in Roman letters. The original prompt only handled mixed script, so `ami bhalo achi` would have been read as bad English. |
| 2 | **Mixed-language = one voice, not two.** English words inside Bangla sentences are phonemized with the English phonemizer but spoken by the **same bilingual voice model**. Fallback: an English→Bangla-pronunciation lexicon (`React` → `রিয়্যাক্ট`). | Switching between a Bengali model and an English model mid-sentence makes the voice change timbre every few words — it sounds broken. |
| 3 | **Voice styles = speakers inside one multi-speaker model.** Natural / Friendly / Professional / Calm / Storytelling are trained as separate *speaker IDs* (e.g. `polash_natural`, `polash_friendly`) in one VITS model. | Small offline models (VITS/Piper) cannot do true emotion control. This gives real styles without faking them with pitch, and costs no extra model size. |
| 4 | **Personal-voice cloning = desktop fine-tuning (V1), not on-device training.** Zero-shot voice conversion (e.g. OpenVoice tone-color converter) is kept as an *experimental* Phase-3 track. | Training on a phone is not practical. Fine-tuning a VITS/Piper checkpoint on a PC GPU is proven and produces a small ONNX model that runs offline on Android. |
| 5 | **Bigger recording dataset.** Target 30–60 min of clean audio (~400–800 sentences) for a good voice, ~10 min extra per style. 15 min is the minimum and will sound rougher. | The ~100 sentences in the master prompt's example are too few for a natural-sounding fine-tuned voice. |
| 6 | **Build our own Bangladeshi Bengali base voice** (Step 2) instead of assuming one exists. | No verified permissively-licensed, Android-ready **Bangladeshi** Bengali model is known. Meta MMS `mms-tts-ben` works in sherpa-onnx but is **CC-BY-NC (non-commercial)** — fine for development, not for a commercial release. |
| 7 | **Two app flavors:** `offline` (no `INTERNET` permission at all — models imported from file) and `standard` (optional model download). | Gives a *provable* privacy guarantee. Internet is not needed for anything except optionally downloading models. |
| 8 | **MP3 via LAME (NDK)**, M4A/AAC + FLAC via Android `MediaCodec`, Opus/OGG only on Android 10+ (API 29). Do **not** use `ffmpeg-kit` (project retired/archived in 2025). | Android has no guaranteed built-in MP3 encoder. Formats are shown only when the device can actually encode them. |
| 9 | **License checklist added to Step 1** (espeak-ng = GPL-3, Piper training code = GPL-3, LAME = LGPL, MMS = CC-BY-NC, Kokoro = Apache-2.0, sherpa-onnx = Apache-2.0, OpenSLR-37 data = CC-BY-SA-4.0). | Some of these affect whether you can sell / close-source the app. Decide early, not at release. |
| 10 | **Steps re-ordered into 12** with the three milestones from §101 as hard gates (Step 4, Step 7, Step 11). | The 27-item order in §94 is correct but too granular to track. |

Everything else in the master prompt (architecture, privacy, consent, no-fake-functionality, testing, docs) stays as written.

---

## B. Online vs offline — what actually needs internet

| Feature | Needs internet? |
|---|---|
| Typing, normalization, Banglish transliteration, segmentation | ❌ Never |
| TTS generation (built-in + personal voices) | ❌ Never |
| Recording voice samples, quality checks | ❌ Never |
| Playback, background music, mixing, ducking, trim, fades | ❌ Never |
| Export MP3 / WAV / M4A / FLAC / OGG, save, share to local apps | ❌ Never |
| Projects, history, search, dictionary, settings | ❌ Never |
| **Getting a model onto the phone** | ⚠️ **Optional** — download in-app (`standard` flavor) *or* copy a `.voicepack` / model file via USB / SD card / Files app (both flavors) |
| **Training a personal voice** | ⚠️ **Optional** — runs fully offline on your own PC with an NVIDIA GPU. Only if you have no GPU: free Google Colab (online) as a fallback. |
| Developer setup (Android SDK, npm, datasets, base checkpoints) | ✅ One-time, developer only |

**Conclusion:** the app itself needs **no** online feature. Online model download is added only as a convenience and can be compiled out.

---

## C. Recommended technology (to be confirmed in Step 1)

| Layer | Choice | License |
|---|---|---|
| App | React Native (New Architecture) + TypeScript strict | MIT |
| State / forms / validation | Zustand, React Hook Form, Zod | MIT |
| Local DB | SQLite (`op-sqlite` or `expo-sqlite`) | MIT |
| i18n | `i18next` + `react-i18next` (bn / en) | MIT |
| Inference runtime | **sherpa-onnx** (Kotlin/AAR) wrapping ONNX Runtime | Apache-2.0 |
| Bengali + personal voices | **VITS / Piper-format** models, fine-tuned by us | model license = our own data |
| English voice (built-in) | Kokoro (en) or Piper English voice with a permissive dataset (verify per voice) | Apache-2.0 / per-voice |
| Phonemizer | espeak-ng (bundled by sherpa-onnx for Piper models) | **GPL-3** ⚠️ |
| Banglish transliteration | Avro-phonetic-style rule table (own TS implementation) | own |
| Audio DSP / mixing | Kotlin (native module), streaming file-based | own |
| Encoders | LAME (MP3), MediaCodec (AAC, FLAC, Opus) | LGPL / platform |
| Training tools (desktop) | Python, Piper/VITS training, PyTorch, ONNX export | GPL-3 / BSD |

---

## D. The 12 Steps

Each step lists: **Goal → Tasks → Deliverables → Done when**.
Tip: when using an AI coding agent, give it the master prompt + this roadmap and say *"Do Step N only."*

---

### Step 1 — Research spike, engine decision & test set *(no app code yet)*

**Goal:** Prove on a PC which models really speak good Bangladeshi Bengali, English, and mixed text — before building anything.

**Tasks**
1. Install sherpa-onnx CLI on the PC. Run candidate models: `mms-tts-ben` (VITS), any available Piper/VITS Bengali models, Kokoro English, Piper English.
2. Build the **shared test set** (§72): short/long Bengali, English, mixed-script, Roman-Banglish, numbers, `৳1,250`, `10:30 AM`, `25%`, dates, `API / SQL / React.js / PostgreSQL`, questions, a 10,000-char narration.
3. Score each model: Bengali quality, English quality, mixed behavior, cloning/fine-tune path, Android support, RTF on CPU, RAM, size, **license**.
4. Run a quick Android feasibility check: the official sherpa-onnx Android TTS demo APK on a **mid-range phone** (e.g. 4 GB RAM) with the best candidate.
5. Fill the license matrix (models, datasets, espeak-ng, LAME, music). Decide: open-source app (GPL ok) or closed/commercial (avoid GPL phonemizer → use character-based VITS).

**Deliverables:** `docs/tts-engine.md` (decision + numbers), `docs/model-licenses.md`, `tests/fixtures/tts-test-set.json`, sample WAVs per model.

**Done when:** one engine + model format is chosen with measured RTF/RAM on a real phone and a written license decision.

---

### Step 2 — Bangladeshi Bengali base voice (desktop pipeline v1)

**Goal:** Own a good, legally redistributable **Bangladeshi** Bengali voice (male + female if data allows). This is the foundation for milestone 1 and for personal-voice fine-tuning later.

**Tasks**
1. Create `tools/voice-training/` (Python, pinned `requirements.txt`, README).
2. Dataset prep scripts (§67): resample to 22.05 kHz mono, trim silence, loudness-normalize, transcript validation, duplicate/corrupt detection, train/val split, `metadata.csv`.
3. Train / fine-tune a VITS (Piper-format) model on a permissive Bangladeshi Bengali dataset (e.g. **OpenSLR-37 `bn_bd`, CC-BY-SA-4.0 — verify**). Include some English + mixed sentences so it can speak code-mixed text with one voice.
4. Export to ONNX, test FP32 vs INT8 (size / speed / quality, §70), produce sherpa-onnx-compatible files.
5. Define the **`.voicepack` v1 format** (§24): `manifest.json` (version, engine, sample rate, languages, speakers/styles, sha256 per file, license, created date), `model/`, `config/`, `dictionary/`, `assets/preview.wav`. Write `tools/voice-package/pack.py` + `validate.py`.
6. Document realistic hardware (§69): NVIDIA GPU with 8 GB+ VRAM recommended; CPU-only training is not practical; time ranges, not promises.

**Deliverables:** `bn_bd-base.voicepack`, training README, benchmark table.
*(While this trains, development can continue with `mms-tts-ben` for testing only — non-commercial.)*

**Done when:** the voicepack validates and speaks the test set clearly on the PC via sherpa-onnx CLI.

---

### Step 3 — App scaffold & architecture

**Goal:** A clean, runnable React Native Android app with the full architecture skeleton.

**Tasks**
1. Monorepo: `/mobile`, `/tools`, `/models` (metadata only), `/docs`, `/tests` (§103).
2. RN + TypeScript strict, ESLint/Prettier, Jest, absolute imports, feature folders from §7.
3. Bottom tabs: **Home · Voices · Projects · Settings** (React Navigation).
4. Theme tokens (System / Light / Dark), Bangla font (e.g. Noto Sans Bengali / Hind Siliguri, OFL), accessible contrast.
5. i18n with `bn` + `en` resource files — no hard-coded strings.
6. SQLite with migrations: `voices, models, projects, generation_jobs, history, pronunciation_entries, recording_sessions, recordings`.
7. Zustand stores split by concern: preferences, session, generation, player, models.
8. Domain types: `TTSProvider`, `VoiceProfile`, `SynthesisRequest/Result`, `GenerationJob`, `LanguageSegment`.
9. Two build flavors: `offline` (no INTERNET permission) and `standard`.
10. Structured logger (no user text / audio in production logs).

**Deliverables:** app runs on a device, empty states shown (§81), CI runs lint + tests.

**Done when:** `npx react-native run-android` works for both flavors, theme + language switch work, DB migrates.

---

### Step 4 — Native inference engine + basic Model Manager → **Milestone 1**

**Goal:** Generate genuinely usable Bangladeshi Bengali speech **offline on a real Android phone**.

**Tasks**
1. Kotlin TurboModule wrapping sherpa-onnx: `initializeEngine, loadModel, unloadModel, synthesize, cancelSynthesis, getModelInfo, getRuntimeInfo` (§63), typed requests/responses.
2. Model lifecycle: load → warmup → synthesize → idle → unload; no duplicate init; check free RAM before loading (§56, §58).
3. Synthesis writes **chunk WAV files to disk** (not giant JS buffers); progress + cancel events to JS.
4. **Foreground service** for long jobs (screen lock / backgrounding, §31).
5. `.voicepack` import: Storage Access Framework picker → copy to app storage → **path-traversal-safe unzip**, size limits, sha256 check, manifest schema validation, never execute anything inside (§24, §60).
6. Model Manager screen: installed models, size, languages, engine, version, Test, Delete, Import. (Download added in Step 12, `standard` flavor only.)
7. Audio validation after generation (§76): file exists, duration > 0, valid sample rate, readable.
8. `BuiltInBengaliProvider` implementing `TTSProvider`.

**Deliverables:** debug screen: type Bangla → WAV plays. Benchmark: load time, first-audio latency, RTF, RAM.

**Done when:** in **airplane mode**, the phone speaks the Bengali test set with the Step-2 voice, and a corrupt voicepack is rejected cleanly.

---

### Step 5 — Text intelligence pipeline (pure TypeScript, fully tested)

**Goal:** Turn any Bangla / English / Banglish text into correct, speakable chunks.

**Tasks**
1. **Roman Banglish transliterator** — detect Roman-script Bengali words (`ami`, `tumi`, `kemon`, `achi`) vs real English using a word list + rules; convert with Avro-style phonetic rules. Language option `Banglish (Roman)`; Auto tries to detect it.
2. **LanguageSegmenter** (§11) — Unicode-script based, merges adjacent same-language words into phrases, keeps punctuation/whitespace and offsets.
3. **Normalizers** (§12) for bn and en: numbers (Bangla numerals ০-৯ and Western), `৳` / `$` currency, dates, time, %, decimals, units, phone numbers, URLs, emails, acronyms (`API` → A P I), `.js`, `PostgreSQL`. Output a *synthesis representation*; original text is never changed.
4. **Pronunciation dictionary** (§13) — global / per-language / per-project entries, enable/disable, applied before phonemization.
5. **English-in-Bangla lexicon** — common tech/English words with Bangladeshi pronunciation for the fallback path.
6. **Sentence splitter + chunker** (§29) — splits on `।` `?` `!` `.` etc., respects model char limit, never splits numbers / abbreviations / names; attaches pause lengths (comma, sentence, paragraph).
7. Unit tests: critical sentence (§74), 500 / 2,000 / 10,000-char inputs (§75), Roman Banglish, all normalization examples.

**Deliverables:** `src/domain/text/` module + ~100% test coverage on it.

**Done when:** `আজকে আমরা React Native দিয়ে একটি offline application তৈরি করবো।` segments exactly as §11 expects and no text is lost or reordered in any test.

---

### Step 6 — Home screen, generation jobs & player → **MVP core**

**Goal:** The main user flow works end-to-end.

**Tasks**
1. Home screen (§9–10): large editor (virtualized/chunked for long text so UI never freezes), character + word count, estimated duration, paste, clear, import `.txt`, undo/redo, auto-save draft + restore.
2. Language selector (`Auto` default, বাংলা, English, বাংলা + English, Banglish Roman), voice selector, speed (0.7–1.5×, model-native `length_scale`), style + pitch **hidden unless the voice supports them**.
3. **Job system** (§64): queued → preparing → generating → mixing → completed/failed/cancelled; persisted in SQLite; real progress ("Paragraph 4 of 12 · 42%"), Cancel.
4. Stitch chunks with natural pauses, loudness-normalize (simple LUFS target), write final WAV.
5. Player (§35): play/pause, seek, time, restart, ±10 s, waveform (pre-computed peaks), background playback with media notification.
6. Basic export: **WAV** + **MP3 (LAME via NDK)**, default name `voice_YYYYMMDD_HHmmss`, filename sanitizing, save via SAF, share sheet.
7. Friendly error messages for every case in §55 (no stack traces).

**Done when:** in airplane mode a user types Bangla, generates, plays, exports MP3 and shares it — and cancelling mid-job leaves no corrupt file marked complete.

---

### Step 7 — English voice & natural mixed-language speech → **Milestone 2**

**Goal:** Bangla + English + Banglish in one sentence sounds natural and understandable.

**Tasks**
1. Add the built-in English voice (`KokoroProvider` or Piper English, per Step 1 decision).
2. **Same-voice code-mixing:** for Bengali voices, English segments are phonemized with the English phonemizer and fed to the bilingual Bengali model (trained in Step 2 with mixed data). Compare against the lexicon fallback; keep whichever sounds better per voice, configurable in the voicepack manifest.
3. For English-only text with an English voice → English path directly.
4. Pause / prosody tuning at segment boundaries (no clicks — short crossfades).
5. Quality modes (§27) only if real: e.g. **Fast** = INT8 model, **Balanced** = FP32 / FP16, **Studio** = larger model or higher `noise_scale` tuning. Hide modes a voice doesn't ship.
6. A/B listening review with 3–5 Bangladeshi listeners on the test set; record notes in `docs/tts-engine.md`.

**Done when:** the critical sentence (§74) plays with one consistent voice, every English word understandable, no dropped words, natural pauses — on a real phone.

---

### Step 8 — Projects, history, dictionary UI, search & settings → **MVP complete**

**Goal:** Everything is saved, findable, and configurable offline.

**Tasks**
1. Projects (§44): text, voice, language, style, speed, pitch, music, generation info, export history, dates. Auto-save on interval + app background (§89).
2. History (§45): play, open project, rename, export, share, delete.
3. Pronunciation dictionary screen: add / edit / delete / enable, scopes, test-speak an entry.
4. Local search (§46) over projects, audio, voices, dictionary (SQLite FTS5).
5. Settings (§47–51): General, Audio, Voice, Storage (sizes per category, clear cache, delete unused audio — **never** delete recordings without confirmation), Models, Privacy (delete everything controls, §3), Appearance, About + Licenses.
6. Crash recovery (§90): on start, mark interrupted jobs, delete invalid temp audio, keep project text.
7. First-launch onboarding — 3 short screens (§80).

**Done when:** all items in §91 MVP work in airplane mode; kill the app mid-generation → reopen → text is safe and job shows "Interrupted".

---

### Step 9 — Audio Studio: background music, mixer & all export formats

**Goal:** Make finished, publishable audio on the phone.

**Tasks**
1. Native Kotlin mixer (streaming, file-based): voice + music, music loop, voice volume (default 100%), music volume (default 12%), fade in/out, trim start/end, silence padding (§36–39).
2. **Auto-duck** (ON/OFF): music lowered under speech using the voice envelope, gently raised in long pauses; Advanced mode exposes amount/attack/release.
3. Soft limiter on the master bus to prevent clipping; final loudness normalization.
4. Music library: import user audio (decoded via MediaExtractor/MediaCodec) + bundled tracks **only with redistributable licenses** (e.g. CC0), attribution stored (§84).
5. Export screen (§42): name, format, bitrate (128/192/256/320, default 192 — hidden for lossless), sample rate, location, estimated size, metadata tags.
6. Encoders: **MP3** (LAME), **M4A/AAC** + **FLAC** (MediaCodec), **OGG/Opus** (MediaCodec + MediaMuxer, API 29+). Probe device encoders at runtime; hide unsupported formats (§40).
7. Export tests: every format decodes back, duration matches within tolerance.

**Done when:** voice + ambient music with ducking exports to MP3, WAV, M4A, FLAC (and OGG on Android 10+) offline, with music clearly below narration and no clipping.

---

### Step 10 — Personal Voice Studio (recording on the phone)

**Goal:** Let a user record a clean, well-labelled dataset of their **own** voice — privately, on the device.

**Tasks**
1. Flow (§16): Create Voice → **Consent screen** ("I confirm that this is my voice or I have permission from the speaker…") → name, primary/extra language, accent, description (§17).
2. Recording guide + mic check with live input meter (§18). `RECORD_AUDIO` permission with clear denial handling.
3. Recorder: 48 kHz (or 44.1 kHz) 16-bit mono **PCM WAV** (§65), no lossy re-encoding.
4. Prompt sets (own, copyright-free sentences, §19): Bengali, English, mixed, Roman-Banglish-style reading, numbers, dates, tech terms, questions, short/long — ~600 sentences total, plus optional **style packs** (Natural, Friendly, Energetic, Professional, Calm, Storytelling; ~150 each).
5. Per-take quality analysis (§66): duration, peak, clipping, leading/trailing silence, RMS, noise-floor estimate → Accept / Retry, with plain-language reasons.
6. Dataset progress dashboard (§21) with total clean minutes vs target (15 min min, 30–60 min recommended).
7. **Export dataset** → `polash.voicedataset.zip` (WAVs + `metadata.csv` + manifest with consent record) to a user-chosen location. Delete recordings / voice controls.
8. "Train Voice" button is **honest**: it explains the desktop step (Step 11) — no fake progress (§99).

**Done when:** a user records 30+ min, gets real quality feedback, and exports a dataset that `tools/voice-training/validate_dataset.py` accepts.

---

### Step 11 — Personal voice training, styles & import → **Milestone 3**

**Goal:** The user's own voice (with styles) speaks Bangla + English offline on the phone.

**Tasks**
1. `tools/voice-training/train_personal.py`: takes the dataset zip → preprocess → **fine-tune from the Step-2 Bengali base checkpoint** (multi-speaker: one speaker ID per recorded style) → ONNX export → INT8 option → evaluation samples on the shared test set → `polash.voicepack`.
2. One-command scripts for Windows + Linux, CPU check, GPU/VRAM detection, resumable training, clear logs. Free Colab notebook only as an optional fallback (online, user's choice).
3. Android: import the personal voicepack (Step 4 validator), `CustomVoiceProvider`, style selector populated **from the manifest's speaker list** — only styles actually trained are shown (§20, §32).
4. Pitch control only if implemented as a small, quality-safe shift (Lower / Normal / Higher); otherwise hidden (§34).
5. Voice detail screen: preview, styles, size, created date, delete voice + recordings.
6. *(Experimental, Phase 3)* evaluate zero-shot voice conversion (OpenVoice tone-color converter, MIT) on top of the base Bengali voice for "quick voice from 1 minute" — ship only if it runs acceptably on a mid-range phone.

**Done when:** the full §100 workflow works — "My Voice · Auto · Friendly · 1.0× · Light Electronic Ambient" → Generate in airplane mode → sounds like the authorized speaker, Bangla and English understandable.

---

### Step 12 — Hardening, optional download, docs & release

**Goal:** Real product quality, not a demo.

**Tasks**
1. Performance & low-memory (§56–58): test on a 3–4 GB RAM phone; unload idle models; streaming everywhere; measure model load, first-audio latency, RTF, merge/export time (§57, §71).
2. Optional **model download** (`standard` flavor only, §26): catalog JSON, resume, progress, cancel, retry, sha256, free-space check, Wi-Fi-only setting; partial files never marked installed. Offline message (§87) when a model is missing.
3. Full **airplane-mode checklist** (§86) on a physical device.
4. Accessibility (§54): TalkBack labels, 48 dp targets, font scaling, long Bangla labels, state not by color only.
5. Tests (§73): unit + integration + native module + voicepack validation + persistence + export; release CI.
6. Security review: path traversal, file validation, no secrets, no analytics.
7. Docs (§97): README + `architecture, tts-engine, voice-training, voice-packages, audio-pipeline, android-build, model-licenses, privacy, troubleshooting`; `THIRD_PARTY_NOTICES` (GPL/LGPL/CC obligations satisfied).
8. Release: small base APK/AAB (models not bundled except optionally one small Fast voice), signed builds for both flavors.

**Done when:** the Definition of Done (§98) holds for every shipped feature and both flavors pass the airplane-mode checklist on a real mid-range device.

---

## E. Milestone gates (do not skip)

| Gate | After step | Must be true |
|---|---|---|
| 🟢 M1 | Step 4 | Usable Bangladeshi Bengali speech offline on a real phone |
| 🟢 M2 | Step 7 | Bangla + English + Banglish understandable in one consistent voice |
| 🟢 MVP | Step 8 | Everything in §91 works in airplane mode |
| 🟢 M3 | Step 11 | Authorized personal voice (with styles) works offline |
| 🚀 Release | Step 12 | §98 Definition of Done + licenses cleared |

If a gate fails, fix speech quality before adding features (§101).

## F. Main risks to watch

1. **Bengali quality of the base voice** — depends on dataset quality; budget time for Step 2.
2. **GPL components** (espeak-ng, Piper training) — fine for open-source; for closed/commercial use, switch to a character-based model or get legal advice.
3. **Personal voice quality** — depends mostly on the user's recording quality and minutes recorded; the Studio must enforce good data.
4. **Low-end phones** — keep an INT8 "Fast" variant of every voice.
5. **Misuse** — consent screen, no impersonation features, consent stored in the dataset manifest.
