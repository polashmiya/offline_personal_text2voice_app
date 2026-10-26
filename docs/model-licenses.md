# Model licenses

Checked on 2026-10-26. **Re-verify before any commercial release.**

| Voice config | Model | Training data | Weights license | Commercial use |
|---|---|---|---|---|
| `models/voices/bn-mimic3-multi-low.json` | Mimic 3 `bn/multi_low` (Mycroft), converted by sherpa-onnx | OpenSLR 37 (Google crowdsourced Bengali, CC BY-SA 4.0) + CMU Indic (permissive) | not stated in mimic3-voices | ❌ not cleared |
| `tools/voice-training/voices/bn-bd-base.json` (**Bangla (Bangladesh)**, recommended) | Piper `bn_BD-google-medium` checkpoint (rhasspy/piper-checkpoints), exported by our `export_voice.py`; only the 6 `bn_bd` speakers | OpenSLR 37 (CC BY-SA 4.0) + CMU Indic (permissive); fine-tuned from LibriTTS-R (CC BY 4.0) | follows its data: CC BY-SA 4.0 | ✅ with attribution (credit line shown in the app) |
| `models/voices/en-piper-ljspeech-medium-int8.json` | Piper `en_US-ljspeech-medium` (int8) | LJ Speech (public domain) | piper-voices repo: MIT | ✅ with attribution |

Other candidates checked:

- **Meta MMS `mms-tts-ben`**: CC-BY-NC-4.0, so non-commercial only.
- **Kokoro**: Apache-2.0, but no Bengali.
- **Coqui `bn custom_female`**: dataset license unclear.
- **espeak-ng data** (inside Piper/Mimic packs): GPL-3.0. Distributing it inside voice packs carries GPL obligations for those packs.

Decision (ROADMAP step 2): ship **Bangla (Bangladesh)**, built from the openly published Piper `bn_BD` checkpoint (trained on OpenSLR 37 + CMU Indic). It replaces the Mimic 3 development voice. Its weights follow CC BY-SA 4.0, so commercial use (for example monetized videos) is allowed with the credit line. Re-sharing the model itself must keep the same license.

## Personal voices

A personal voice trained with `tools/voice-training` contains your recordings plus the base it was fine-tuned from:

- `--base bangla`: the CC BY-SA 4.0 credit applies (as above).
- `--base ljspeech`: the base is public-domain data (LJ Speech), so the result is yours with no credit required.

Only train voices of people who gave consent; the app records that consent in every dataset and voice pack.
