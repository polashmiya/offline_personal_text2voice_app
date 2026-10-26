# Model licenses

Checked on 2026-10-26. **Re-verify before any commercial release.**

| Voice config | Model | Training data | Weights license | Commercial use |
|---|---|---|---|---|
| `models/voices/bn-mimic3-multi-low.json` | Mimic 3 `bn/multi_low` (Mycroft), converted by sherpa-onnx | OpenSLR 37 (Google crowdsourced Bengali, CC BY-SA 4.0) + CMU Indic (permissive) | not stated in mimic3-voices | ❌ not cleared |
| `models/voices/en-piper-ljspeech-medium-int8.json` | Piper `en_US-ljspeech-medium` (int8) | LJ Speech (public domain) | piper-voices repo: MIT | ✅ with attribution |

Other candidates checked:

- **Meta MMS `mms-tts-ben`**: CC-BY-NC-4.0, so non-commercial only.
- **Kokoro**: Apache-2.0, but no Bengali.
- **Coqui `bn custom_female`**: dataset license unclear.
- **espeak-ng data** (inside Piper/Mimic packs): GPL-3.0. Distributing it inside voice packs carries GPL obligations for those packs.

Decision (see ROADMAP step 2): train our own Bangladeshi Bengali VITS voice on OpenSLR 37 `bn_bd` (CC BY-SA 4.0) and release its weights under CC BY-SA 4.0.
