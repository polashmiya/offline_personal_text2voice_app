#!/usr/bin/env python3
"""
Fine-tune a personal voice from a prepared dataset, then build the .voicepack.

    python train.py --data work/my-voice                       # Bangla base (recommended)
    python train.py --data work/my-voice --base ljspeech       # public-domain English base
    python train.py --data work/my-voice --resume              # continue after a break

Training is resumable: checkpoints land in <run-dir>/lightning_logs/*/checkpoints/last.ckpt.
When it finishes (or with --export-only) the newest checkpoint is exported to
dist/<voice-id>.voicepack, ready to import in the app.

Hardware: an NVIDIA GPU (8 GB+ VRAM). CPU training is far too slow for a real voice.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
HF = "https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main"
BASES = {
    # 16-speaker Bangla (Bangladesh + India) Piper voice; CC BY-SA 4.0 data (OpenSLR 37) + CMU Indic.
    "bangla": {
        "url": f"{HF}/bn/bn_BD/google/medium/last.ckpt",
        "file": "bn_BD-google-medium.ckpt",
        "license": {
            "name": "Personal voice fine-tuned from Piper bn_BD (CC-BY-SA-4.0 OpenSLR 37 + CMU Indic data)",
            "url": "https://www.openslr.org/37/",
            "commercialUse": True,
            "attribution": "Voice built on Piper bn_BD (google, medium) trained with Google's Bengali TTS data "
                           "(OpenSLR 37, CC BY-SA 4.0) and CMU Indic data.",
        },
    },
    # Single-speaker English Piper voice trained from scratch on LJ Speech (public domain).
    "ljspeech": {
        "url": f"{HF}/en/en_US/ljspeech/medium/lj-med_1000.ckpt",
        "file": "en_US-ljspeech-medium.ckpt",
        "license": {
            "name": "Personal voice (own recordings) fine-tuned from Piper LJ Speech (public-domain data)",
            "commercialUse": True,
        },
    },
}
STYLE_LABELS = {
    "natural": "Natural",
    "friendly": "Friendly",
    "energetic": "Energetic",
    "professional": "Professional",
    "calm": "Calm",
    "storytelling": "Storytelling",
}


def run(cmd: list[str]):
    print("\n$ " + " ".join(cmd), flush=True)
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(f"Command failed with exit code {result.returncode}")


def download(url: str, target: Path):
    if target.exists() and target.stat().st_size > 0:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading base checkpoint (one time, ~900 MB): {url}")
    tmp = target.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(target)


def gpu_batch_size(allow_cpu: bool) -> tuple[str, int]:
    import torch

    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        vram = props.total_memory / 1024**3
        batch = 32 if vram >= 22 else 16 if vram >= 14 else 12 if vram >= 10 else 8
        print(f"GPU: {props.name}, {vram:.0f} GB VRAM -> batch size {batch}")
        if vram < 7.5:
            print("WARNING: less than 8 GB VRAM; training may run out of memory.")
        return "gpu", batch
    if not allow_cpu:
        sys.exit("No NVIDIA GPU found. Use the free Google Colab notebook (colab/VoiceStudio_Train.ipynb), "
                 "or pass --allow-cpu for a short smoke test only.")
    print("WARNING: training on CPU. This is only useful as a smoke test.")
    return "cpu", 2


def newest_checkpoint(run_dir: Path) -> Path | None:
    ckpts = sorted(run_dir.glob("lightning_logs/*/checkpoints/*.ckpt"), key=lambda p: p.stat().st_mtime)
    last = [p for p in ckpts if p.name == "last.ckpt"]
    return (last or ckpts or [None])[-1]


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]
    return s or "my-voice"


def write_voice_json(info: dict, base: str, path: Path) -> dict:
    is_bn = info["language"] == "bn"
    styles = info["styles"]
    voice = {
        "id": f"personal-{slug(info['voiceName'])}",
        "name": info["voiceName"],
        "description": f"Personal voice of {info.get('speakerName') or 'the speaker'} "
                       f"({info['minutes']:.0f} min of recordings).",
        "version": datetime.now(timezone.utc).strftime("%Y.%m.%d"),
        "locale": "bn-BD" if is_bn else "en-US",
        "accent": info.get("accent"),
        "gender": info.get("gender") if info.get("gender") in ("male", "female", "other") else None,
        "quality": "balanced",
        "personal": True,
        "consent": {"confirmed": True, "confirmedAt": info["consent"].get("confirmedAt", "")[:40]},
        "license": BASES[base]["license"] if base in BASES else {"name": "Personal voice", "commercialUse": True},
        "speakerOrder": styles if len(styles) > 1 else None,
        "speakerLabels": (
            {s: {"key": s, "label": STYLE_LABELS.get(s, s.title())} for s in styles}
            if len(styles) > 1
            else {"default": {"key": "natural", "label": "Natural"}}
        ),
    }
    voice = {k: v for k, v in voice.items() if v is not None}
    path.write_text(json.dumps(voice, ensure_ascii=False, indent=2), encoding="utf-8")
    return voice


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True, type=Path, help="folder made by prepare_dataset.py")
    ap.add_argument("--base", default="bangla", help="bangla (default), ljspeech, or a path to a Piper .ckpt")
    ap.add_argument("--run-dir", type=Path, help="default: runs/<voice>")
    ap.add_argument("--epochs", type=int, default=1000, help="total epochs (default 1000)")
    ap.add_argument("--batch-size", type=int)
    ap.add_argument("--resume", action="store_true", help="continue from the newest checkpoint in --run-dir")
    ap.add_argument("--export-only", action="store_true", help="skip training; export the newest checkpoint")
    ap.add_argument("--int8", action="store_true", help="export an INT8 model (smaller, slightly lower quality)")
    ap.add_argument("--allow-cpu", action="store_true")
    ap.add_argument("--out", type=Path, help="default: dist/<voice-id>.voicepack")
    ap.add_argument("--espeak-data", help="sherpa-onnx espeak-ng-data folder (downloaded if omitted)")
    args = ap.parse_args()

    info = json.loads((args.data / "dataset_info.json").read_text(encoding="utf-8"))
    run_dir = args.run_dir or HERE / "runs" / slug(info["voiceName"])
    run_dir.mkdir(parents=True, exist_ok=True)
    config_path = run_dir / "config.json"
    python = sys.executable

    if not args.export_only:
        accelerator, batch = gpu_batch_size(args.allow_cpu)
        batch = args.batch_size or batch
        cmd = [
            python, str(HERE / "piper_fit.py"), "fit",
            "--data.voice_name", slug(info["voiceName"]),
            "--data.csv_path", str(args.data / "metadata.csv"),
            "--data.audio_dir", str(args.data / "wavs"),
            "--data.espeak_voice", info["espeakVoice"],
            "--data.cache_dir", str(run_dir / "cache"),
            "--data.config_path", str(config_path),
            "--data.batch_size", str(batch),
            "--data.validation_split", "0.05",
            "--data.num_test_examples", "3",
            "--model.sample_rate", "22050",
            "--model.num_speakers", str(info["numSpeakers"]),
            "--trainer.accelerator", accelerator,
            "--trainer.devices", "1",
            "--trainer.max_epochs", str(args.epochs),
            "--trainer.default_root_dir", str(run_dir),
        ]
        last = newest_checkpoint(run_dir)
        if args.resume:
            if not last:
                sys.exit(f"--resume: no checkpoint found in {run_dir}")
            print(f"Resuming from {last}")
            cmd += ["--ckpt_path", str(last)]
        else:
            if last:
                sys.exit(f"{run_dir} already has checkpoints. Use --resume to continue, or another --run-dir.")
            if args.base in BASES:
                base_ckpt = HERE / "cache" / BASES[args.base]["file"]
                download(BASES[args.base]["url"], base_ckpt)
            else:
                base_ckpt = Path(args.base)
                if not base_ckpt.is_file():
                    sys.exit(f"--base: {base_ckpt} not found")
            # Copies every weight whose shape matches; speaker/style layers start fresh.
            cmd += ["--model.warmstart_ckpt", str(base_ckpt)]
        (run_dir / "base.txt").write_text(args.base, encoding="utf-8")
        run(cmd)

    ckpt = newest_checkpoint(run_dir)
    if not ckpt or not config_path.exists():
        sys.exit(f"No trained checkpoint/config in {run_dir}")
    base = (run_dir / "base.txt").read_text(encoding="utf-8").strip() if (run_dir / "base.txt").exists() else args.base
    voice = write_voice_json(info, base, run_dir / "voice.json")
    out = args.out or HERE / "dist" / f"{voice['id']}.voicepack"
    export = [
        python, str(HERE / "export_voice.py"),
        "--checkpoint", str(ckpt),
        "--piper-config", str(config_path),
        "--voice", str(run_dir / "voice.json"),
        "--out", str(out),
        "--work", str(run_dir / "export"),
    ]
    if args.int8:
        export.append("--int8")
    if args.espeak_data:
        export += ["--espeak-data", args.espeak_data]
    run(export)


if __name__ == "__main__":
    main()
