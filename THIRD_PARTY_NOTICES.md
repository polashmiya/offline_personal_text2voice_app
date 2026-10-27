# Third-party notices

| Component | Version | License | How it is used |
|---|---|---|---|
| sherpa-onnx | 1.13.8 | Apache-2.0 | Offline TTS runtime (downloaded AAR, unmodified) |
| ONNX Runtime | bundled in sherpa-onnx | MIT | Neural network inference |
| LAME | 3.100 | LGPL-2.0-or-later | MP3 encoder. Unmodified source in `mobile/android/lame/src/main/cpp/lame`, built as the separate shared library `liblamejni.so` so it can be replaced. License text: `mobile/android/lame/COPYING-LAME` |
| espeak-ng data | as shipped in sherpa-onnx model archives | GPL-3.0 | Phonemizer data inside `.voicepack` files, including the two built-in voice packs in the APK (unmodified; source: https://github.com/espeak-ng/espeak-ng) |
| React Native | 0.88 | MIT | App framework |
| React Navigation | 7.x | MIT | Navigation |
| react-native-screens | 4.x | MIT | Native screens |
| react-native-safe-area-context | 5.x | MIT | Insets |
| react-native-svg | 15.x | MIT | Icons, waveform |
| @op-engineering/op-sqlite | 18.x | MIT | Local database (bundles SQLite, public domain) |
| Zustand | 5.x | MIT | State |
| Zod | 4.x | MIT | Manifest validation |
| i18next / react-i18next | 26.x / 17.x | MIT | Localization |
| @react-native-clipboard/clipboard | 1.16 | MIT | Paste button |
| Bundled music loops (`assets/music/*.wav`) | — | CC0-1.0 | Synthesized from code by `tools/music/generate-music.mjs` (no samples or third-party audio); dedicated to the public domain |

Built-in voices (in the APK): **Norman** and **John** — Piper voices by Bryce Beattie, public domain (LibriVox recordings), INT8 by sherpa-onnx. Other voice models are **not** part of the app. Each `.voicepack` carries its own license metadata, which is shown in the app before use.
