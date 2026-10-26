# Third-party notices

| Component | Version | License | How it is used |
|---|---|---|---|
| sherpa-onnx | 1.13.8 | Apache-2.0 | Offline TTS runtime (downloaded AAR, unmodified) |
| ONNX Runtime | bundled in sherpa-onnx | MIT | Neural network inference |
| LAME | 3.100 | LGPL-2.0-or-later | MP3 encoder. Unmodified source in `mobile/android/lame/src/main/cpp/lame`, built as the separate shared library `liblamejni.so` so it can be replaced. License text: `mobile/android/lame/COPYING-LAME` |
| espeak-ng data | inside voice packages only | GPL-3.0 | Phonemizer data shipped inside some `.voicepack` files, not in the APK |
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

Voice models are **not** part of the app. Each `.voicepack` carries its own license metadata, which is shown in the app before use.
