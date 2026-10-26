# VoiceStudio voice training kit

This kit turns your recordings from the VoiceStudio app into a `.voicepack` that the app plays
**fully offline**. It also rebuilds the Bangladeshi Bangla base voice.

Training needs an NVIDIA GPU, so it runs on a computer (or on free Google Colab), never on the phone.
Only training uses the internet: downloading the trainer and the base checkpoint once.

| File | Purpose |
|---|---|
| `colab/VoiceStudio_Train.ipynb` | Free GPU notebook: the easiest path |
| `prepare_dataset.py` | App dataset zip → Piper training folder (checks, 22.05 kHz, trimming, loudness) |
| `train.py` | Fine-tune (resumable), then export a `.voicepack` |
| `export_voice.py` | Piper checkpoint → sherpa-onnx ONNX → `.voicepack`, with test synthesis |
| `voicepack.py` | Writes and validates `.voicepack` files (same rules as the app) |
| `voices/bn-bd-base.json` | Details of the Bangladeshi Bangla base voice |

## 1. Record in the app

**Voices → Create my voice**: give consent, check the room, then record the *Natural* set. Optionally
record style packs (Friendly, Energetic, Professional, Calm, Storytelling). Each style needs at least
30 takes to become its own style of your voice.

| Clean speech | Result |
|---|---|
| under 15 min | not enough; the voice will be unclear |
| 15–30 min | usable |
| 30–60 min | recommended |
| 60+ min | best |

Then tap **Save dataset** to get `<name>.voicedataset.zip`.

## 2a. Train on Google Colab (free)

1. Put the dataset zip and this whole `voice-training` folder in Google Drive under `MyDrive/VoiceStudio/`.
2. Open `colab/VoiceStudio_Train.ipynb` in [Google Colab](https://colab.research.google.com/)
   (*File → Upload notebook*) and choose *Runtime → Change runtime type → T4 GPU*.
3. Set `DATASET` in the settings cell and run all cells. 30–60 min of recordings with 1000 epochs takes
   about 2–4 hours on a T4. Checkpoints are saved to Drive, so a disconnect only needs the *Resume* cell.

## 2b. Train on your own PC

Requires Linux (or Windows with WSL2), Python 3.10–3.12, an NVIDIA GPU with 8 GB+ VRAM, and
`build-essential cmake ninja-build`.

```bash
git clone --depth 1 --branch v1.8.0 https://github.com/OHF-voice/piper1-gpl.git
cd piper1-gpl
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[train]'
./build_monotonic_align.sh
python setup.py build_ext --inplace
pip install -r /path/to/tools/voice-training/requirements.txt
cd /path/to/tools/voice-training

python prepare_dataset.py --dataset ~/my-voice.voicedataset.zip --out work/my-voice
python train.py --data work/my-voice                  # Bangla base, 1000 epochs
python train.py --data work/my-voice --resume         # continue after stopping (Ctrl+C is safe)
python train.py --data work/my-voice --export-only    # export the newest checkpoint again
```

The voicepack is written to `dist/personal-<name>.voicepack`, and test sentences for each style go to
`runs/<name>/export/samples/`. Listen to them before you copy the voice to your phone.

### Which base?

| `--base` | Pronunciation | Licence of the result |
|---|---|---|
| `bangla` (default) | Best Bangla | Commercial use allowed; credit *Piper bn_BD / OpenSLR 37 (CC BY-SA 4.0) / CMU Indic* |
| `ljspeech` | Weaker Bangla with small datasets | Public-domain base + your recordings: no credit required |

Under the hood, `train.py` warm-starts from the base: every layer whose shape matches is copied, and the
speaker/style layers start fresh. That is how one base can become a voice with your own set of styles.

## 3. Import on the phone

Copy the `.voicepack` to the phone and open **Voices → Import**. The app re-checks every file's SHA-256,
test-loads the model, and shows your styles in the style selector.

## Bangla base voice (roadmap step 2)

```bash
python export_voice.py --checkpoint cache/bn_BD-google-medium.ckpt \
  --piper-config bn_BD-google-medium.json --voice voices/bn-bd-base.json \
  --out dist/bn-bd-base-medium.voicepack
```

The checkpoint and config come from
`https://huggingface.co/datasets/rhasspy/piper-checkpoints/tree/main/bn/bn_BD/google/medium`.
The voice keeps only the six Bangladeshi speakers (OpenSLR 37 `bn_bd`) of the 16 in the checkpoint.

## Quality checks built into the kit

- `prepare_dataset.py` refuses datasets without a consent record and skips clipped, silent, duplicate
  and too short or too long takes.
- `export_voice.py` synthesizes a test sentence in every style with **sherpa-onnx 1.13.8, the same
  engine the app uses**. On Linux/Colab it also proves that the app turns text into exactly the same
  phonemes as training did, by comparing noise-free renders sample for sample.
  (sherpa-onnx's Windows build mishandles non-Latin text, so that check is skipped on Windows.)
- `voicepack.py <file>` validates a package the same way the app does.

## Known limits

- Training a voice **from scratch** needs many hours of studio data; this kit fine-tunes instead.
- The model reads English words through Bangla pronunciation, which is how the app sends mixed text to
  Bangla voices. For a native-English personal voice, run `prepare_dataset.py --language en`
  (needs 15+ min of English takes) and train a second voice.
- Pitch shifting is not offered: it lowers quality. Record a style instead.
