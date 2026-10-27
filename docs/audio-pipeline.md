# Audio pipeline

Everything below runs on the phone, offline, in Kotlin (`mobile/android/app/src/main/java/com/voicestudio/offline/audio/`).
Audio is always streamed file-to-file in blocks of 8192 samples; no step holds a whole recording in memory.

```
text ─▶ chunks ─▶ VoiceEngine (sherpa-onnx) ─▶ chunk_00000.wav … (cache/jobs/<id>/)
                                                    │
                    AudioTools.concatenateWav ◀─────┘  pauses, 6 ms edge fades,
                                                       speech loudness → -20 dBFS, peak ≤ -1 dBFS
                                                    │
                          files/generated/<id>.wav ─┘  (history, 16-bit mono, voice sample rate)
                                                    │
         [optional] AudioTools.mixAudio ◀───────────┤◀── files/music/<track>.wav (decoded once on import)
                    cache/mix/<id>.wav              │
                                                    ▼
                          AudioTools.exportAudio ─▶ WAV · MP3 (LAME) · M4A/AAC · FLAC · OGG/Opus
                                                    + title/artist tags (WAV, MP3, FLAC)
```

## Generation join (`AudioToolsModule.concatenateWav`)
Two passes. Pass 1 measures RMS over samples above a speech gate (0.02) and the true peak. Pass 2 writes with one
gain (target ≈ -20 dBFS speech, clamped 0.25–8×, never above -1 dBFS peak), 6 ms fades at every chunk edge and the
pause after each chunk. Output is written to `<name>.part` and renamed only when complete.

## Mixer (`Mixer.kt`)
Timeline: `[silence before][voice, trimmed][silence after]`, music under the whole timeline.

| Stage | Detail |
|---|---|
| Sample rate | voice rate when there is no music; 44.1 kHz with music (resampled copies in a `.work` folder, deleted after) |
| Voice | gain 0–2×, trim start/end, 6 ms fades at the cut points |
| Music | gain 0–1 (default 12 %), loop by reopening the file, 30 ms fades at every loop seam and at an early end |
| Fades | music fade in from timeline start, fade out to timeline end; voice is never faded |
| Auto-duck | 10 ms hops; a hop is speech if voice RMS > 0.015 (≈ -36 dBFS). Ducked if speech occurs within `[hop − 600 ms hold, hop + attack]` (music dips *before* a word, short pauses don't pump). One-pole smoothing with attack (120 ms) / release (600 ms). Default depth −10 dB. Gain is interpolated per sample. |
| Loudness | pass 1 renders the mix and measures RMS above the gate; master gain clamped 0.25–4× |
| Limiter | 5 ms lookahead; gain = sliding min of required gain (with 80 ms release) then box-filtered over the same window, so no sample exceeds -1 dBFS and the gain never steps |

The mix is rendered twice (measure, then write) instead of being stored as float audio.

## Music import (`AudioDecoder.kt`)
`MediaExtractor` + `MediaCodec` decode any format the device supports (MP3, AAC/M4A, OGG/Vorbis/Opus, FLAC, WAV)
to 16-bit mono WAV, capped at 20 minutes. A file that does not decode is rejected with `invalid_audio_file`.
The original is not kept. Only the user's own files exist in the library today; bundled tracks must be CC0 or
similarly redistributable and carry their license/attribution in `music_tracks`.

## Export (`exportAudio`)
| Format | Encoder | Tags |
|---|---|---|
| WAV | own writer (+ resampler) | RIFF `LIST/INFO` (INAM, IART, ICMT, ISFT), UTF-8 |
| MP3 | LAME via NDK, CBR, MPEG-2 rates bumped to 44.1 kHz above 160 kbps | ID3v2.4 UTF-8 (TIT2, TPE1, COMM, TSSE) |
| M4A | MediaCodec AAC-LC + MediaMuxer MP4 | none (MediaMuxer cannot write them) |
| FLAC | MediaCodec FLAC, raw stream | VORBIS_COMMENT block |
| OGG/Opus | MediaCodec Opus + MediaMuxer OGG, Android 10+ | none |

Formats whose encoder is missing on the device are not offered. Every export is written to `.part`, renamed,
then re-opened (WAV header or `MediaExtractor`) to prove it decodes and has a duration.
