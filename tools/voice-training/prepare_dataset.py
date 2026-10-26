#!/usr/bin/env python3
"""
App dataset (.voicedataset.zip) -> Piper training folder.

    python prepare_dataset.py --dataset my-voice.voicedataset.zip --out work/my-voice

What it does, take by take:
  * checks the archive (format, consent record, every listed WAV present and readable)
  * converts to 22,050 Hz mono, removes DC offset, trims long silences (keeps 0.25 s)
  * normalizes loudness of the speech to -20 dBFS RMS with a -1 dBFS peak ceiling
  * rejects clipped, silent, too short / too long and duplicate takes
  * keeps only styles with enough takes (each kept style becomes a speaker)

Output:  <out>/wavs/*.wav, <out>/metadata.csv (Piper format), <out>/dataset_info.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

import numpy as np

TARGET_RATE = 22050
MIN_SECONDS, MAX_SECONDS = 0.6, 25.0
MIN_MINUTES = 15
STYLE_MIN_TAKES = 30
TARGET_RMS_DB, PEAK_CEILING_DB = -20.0, -1.0


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-9))


def load_wav(data: bytes) -> tuple[np.ndarray, int]:
    import io

    import soundfile as sf

    audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return audio.mean(axis=1), rate


def resample(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst:
        return x
    import librosa

    return librosa.resample(x, orig_sr=src, target_sr=dst, res_type="soxr_hq").astype(np.float32)


def frame_db(x: np.ndarray, rate: int, frame_ms: int = 20) -> np.ndarray:
    n = rate * frame_ms // 1000
    frames = len(x) // n
    if frames == 0:
        return np.array([-96.0])
    f = x[: frames * n].reshape(frames, n)
    return np.array([db(v) for v in np.sqrt((f**2).mean(axis=1))])


def clean_take(x: np.ndarray, rate: int) -> tuple[np.ndarray | None, str]:
    x = x - float(np.mean(x))
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    if peak >= 0.999 and np.sum(np.abs(x) >= 0.999) > max(3, len(x) * 0.0002):
        return None, "clipped"
    levels = frame_db(x, rate)
    noise = float(np.percentile(levels, 10))
    threshold = max(noise + 12.0, -50.0)
    speech = np.where(levels > threshold)[0]
    if len(speech) == 0:
        return None, "no speech"
    hop = rate // 50
    keep = int(0.25 * rate)
    start = max(0, speech[0] * hop - keep)
    end = min(len(x), (speech[-1] + 1) * hop + keep)
    x = x[start:end]
    seconds = len(x) / rate
    if not MIN_SECONDS <= seconds <= MAX_SECONDS:
        return None, f"length {seconds:.1f}s"
    active = levels[speech[0] : speech[-1] + 1]
    active = active[active > threshold]
    rms_db = 10 * np.log10(np.mean(10 ** (active / 10))) if len(active) else -96.0
    if rms_db < -50:
        return None, "too quiet"
    gain_db = TARGET_RMS_DB - rms_db
    peak_after = db(float(np.max(np.abs(x)))) + gain_db
    if peak_after > PEAK_CEILING_DB:
        gain_db -= peak_after - PEAK_CEILING_DB
    return (x * (10 ** (gain_db / 20))).astype(np.float32), "ok"


def write_wav(path: Path, x: np.ndarray, rate: int):
    import soundfile as sf

    sf.write(str(path), np.clip(x, -1, 1), rate, subtype="PCM_16")


class Source:
    """Reads files from either the exported zip or an extracted folder."""

    def __init__(self, path: Path):
        self.zip = zipfile.ZipFile(path) if path.is_file() else None
        self.root = None if self.zip else path

    def read(self, name: str) -> bytes:
        if self.zip:
            return self.zip.read(name)
        return (self.root / name).read_bytes()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", required=True, type=Path, help=".voicedataset.zip from the app (or its extracted folder)")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--language", choices=["bn", "en"], default="bn",
                    help="bn (default): one Bangla voice that also reads English the way the app sends it. "
                         "en: an English-only voice from your English sentences.")
    ap.add_argument("--single-style", action="store_true", help="ignore style packs; train one style only")
    ap.add_argument("--min-minutes", type=float, default=MIN_MINUTES)
    args = ap.parse_args()

    src = Source(args.dataset)
    info = json.loads(src.read("dataset.json").decode("utf-8"))
    if info.get("format") != "voicestudio.dataset" or info.get("version") != 1:
        sys.exit("Not a VoiceStudio dataset (dataset.json format/version)")
    consent = info.get("consent") or {}
    if consent.get("confirmed") is not True:
        sys.exit("The dataset has no consent record. Only train voices of people who agreed.")

    takes = info["takes"]
    if args.language == "en":
        takes = [t for t in takes if t["category"] == "en"]
        text_of = lambda t: t["text"]  # noqa: E731
    else:
        text_of = lambda t: t["transcript"]  # noqa: E731

    styles = [s for s in info.get("styles", ["natural"]) if not args.single_style or s == "natural"]
    counts = {s: sum(1 for t in takes if t["style"] == s) for s in styles}
    styles = [s for s in styles if s == "natural" or counts[s] >= STYLE_MIN_TAKES]
    if args.single_style or len(styles) == 1:
        styles = ["natural"]
        takes = [t for t in takes if t["style"] == "natural"] or takes

    out_wavs = args.out / "wavs"
    out_wavs.mkdir(parents=True, exist_ok=True)
    rows, seen, rejected = [], set(), {}
    total = 0.0
    for t in takes:
        if len(styles) > 1 and t["style"] not in styles:
            continue
        text = " ".join(str(text_of(t)).replace("|", " ").replace('"', "").split())
        if not text:
            rejected["empty text"] = rejected.get("empty text", 0) + 1
            continue
        try:
            raw = src.read(t["file"])
        except KeyError:
            sys.exit(f"Missing audio in the archive: {t['file']}")
        digest = hashlib.sha256(raw).hexdigest()
        if digest in seen:
            rejected["duplicate"] = rejected.get("duplicate", 0) + 1
            continue
        seen.add(digest)
        x, rate = load_wav(raw)
        x = resample(x, rate, TARGET_RATE)
        cleaned, reason = clean_take(x, TARGET_RATE)
        if cleaned is None:
            rejected[reason] = rejected.get(reason, 0) + 1
            continue
        name = f"{t['promptId']}.wav"
        write_wav(out_wavs / name, cleaned, TARGET_RATE)
        total += len(cleaned) / TARGET_RATE
        rows.append((name, t["style"], text))

    multi = len(styles) > 1
    # Piper reads this with csv.reader(delimiter="|"): no pipes or double quotes in fields.
    with open(args.out / "metadata.csv", "w", encoding="utf-8", newline="\n") as f:
        for name, style, text in rows:
            f.write("|".join([name, style, text] if multi else [name, text]) + "\n")

    minutes = total / 60
    voice = info.get("voice", {})
    dataset_info = {
        "voiceName": voice.get("name", "My voice"),
        "speakerName": voice.get("speakerName"),
        "gender": voice.get("gender"),
        "accent": voice.get("accent"),
        "language": args.language,
        "espeakVoice": "bn" if args.language == "bn" else "en-us",
        "styles": styles if multi else ["natural"],
        "numSpeakers": len(styles) if multi else 1,
        "takes": len(rows),
        "minutes": round(minutes, 2),
        "consent": consent,
        "sourceDataset": args.dataset.name,
    }
    (args.out / "dataset_info.json").write_text(json.dumps(dataset_info, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Prepared {len(rows)} takes, {minutes:.1f} minutes of speech -> {args.out}")
    print(f"Styles (speakers): {', '.join(dataset_info['styles'])}")
    if rejected:
        print("Skipped: " + ", ".join(f"{k}: {v}" for k, v in sorted(rejected.items())))
    if minutes < args.min_minutes:
        sys.exit(f"Only {minutes:.1f} min of usable speech; at least {args.min_minutes:.0f} min is needed "
                 f"for a usable voice. Record more in the app (or pass --min-minutes to override).")


if __name__ == "__main__":
    main()
