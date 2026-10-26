#!/usr/bin/env python3
"""
Piper checkpoint (.ckpt) -> sherpa-onnx ONNX -> .voicepack the app can import.

    python export_voice.py \
        --checkpoint runs/my-voice/lightning_logs/version_0/checkpoints/last.ckpt \
        --piper-config runs/my-voice/config.json \
        --voice voice.json \
        --out dist/my-voice.voicepack

voice.json holds the human details (id, name, license, consent, style labels).
See voices/*.json for examples. Runs on CPU; no GPU needed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tarfile
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np

from voicepack import write_voicepack, validate_voicepack

ESPEAK_DATA_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/espeak-ng-data.tar.bz2"
LANG_NAMES = {"bn": "Bengali", "en-us": "English", "en": "English"}


def export_onnx(checkpoint: Path, onnx_path: Path) -> tuple[int, int]:
    """Same graph as `python -m piper.train.export_onnx`, using the TorchScript exporter
    (VITS has data-dependent shapes the newer dynamo exporter does not handle)."""
    import torch
    from piper.train.vits.lightning import VitsModel

    torch.manual_seed(1234)
    model = VitsModel.load_from_checkpoint(checkpoint, map_location="cpu")
    g = model.model_g
    g.eval()
    with torch.no_grad():
        g.dec.remove_weight_norm()

    def infer_forward(text, text_lengths, scales, sid=None):
        audio = g.infer(
            text,
            text_lengths,
            noise_scale=scales[0],
            length_scale=scales[1],
            noise_scale_w=scales[2],
            sid=sid,
        )[0].unsqueeze(1)
        return audio

    g.forward = infer_forward
    num_symbols, num_speakers = g.n_vocab, g.n_speakers
    seq = torch.randint(low=0, high=num_symbols, size=(1, 50), dtype=torch.long)
    lengths = torch.LongTensor([seq.size(1)])
    sid = torch.LongTensor([0]) if num_speakers > 1 else None
    scales = torch.FloatTensor([0.667, 1.0, 0.8])
    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = dict(
        model=g,
        args=(seq, lengths, scales, sid),
        f=str(onnx_path),
        verbose=False,
        opset_version=15,
        input_names=["input", "input_lengths", "scales", "sid"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size", 1: "phonemes"},
            "input_lengths": {0: "batch_size"},
            "output": {0: "batch_size", 2: "time"},
        },
    )
    try:
        torch.onnx.export(**kwargs, dynamo=False)
    except TypeError:  # older torch without the dynamo flag
        torch.onnx.export(**kwargs)
    return num_symbols, num_speakers


def add_sherpa_metadata(onnx_path: Path, config: dict):
    """sherpa-onnx reads these keys to treat the model as a Piper VITS voice."""
    import onnx

    model = onnx.load(str(onnx_path))
    voice = config["espeak"]["voice"]
    meta = {
        "model_type": "vits",
        "comment": "piper",
        "language": LANG_NAMES.get(voice, voice),
        "voice": voice,
        "has_espeak": 1,
        "n_speakers": config.get("num_speakers", 1),
        "sample_rate": config["audio"]["sample_rate"],
    }
    del model.metadata_props[:]
    for key, value in meta.items():
        prop = model.metadata_props.add()
        prop.key, prop.value = key, str(value)
    onnx.save(model, str(onnx_path))


def write_tokens(config: dict, path: Path):
    """sherpa-onnx reads one code point per token. Piper's default map also lists
    multi-character vowel clusters, but those ids are only produced when the voice was
    trained with `vowel_clusters`, which sherpa-onnx cannot phonemize."""
    if config.get("vowel_clusters"):
        sys.exit("This voice was trained with vowel_clusters, which sherpa-onnx does not support.")
    # "\n" only: sherpa-onnx on Android mis-parses the space token if lines end in "\r\n".
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for symbol, ids in config["phoneme_id_map"].items():
            if len(symbol) == 1:
                f.write(f"{symbol} {ids[0]}\n")


def quantize_int8(src: Path, dst: Path):
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QUInt8)


def get_espeak_data(explicit: str | None, cache: Path) -> Path:
    if explicit:
        path = Path(explicit)
        if not (path / "phontab").exists():
            sys.exit(f"--espeak-data {path} does not look like espeak-ng-data (no phontab)")
        return path
    target = cache / "espeak-ng-data"
    if (target / "phontab").exists():
        return target
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / "espeak-ng-data.tar.bz2"
    print(f"Downloading espeak-ng-data (one time) from {ESPEAK_DATA_URL}")
    urllib.request.urlretrieve(ESPEAK_DATA_URL, archive)
    with tarfile.open(archive) as t:
        t.extractall(cache, filter="data")
    archive.unlink()
    return target


def smoke_test(model_dir: Path, onnx_name: str, speakers: list[dict], sentence: str, samples_dir: Path):
    """Synthesizes the test sentence for each style with sherpa-onnx (the app's engine)."""
    try:
        import sherpa_onnx
    except ImportError:
        print("sherpa-onnx not installed; skipping the synthesis check (pip install sherpa-onnx)")
        return
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(model_dir / onnx_name),
                tokens=str(model_dir / "tokens.txt"),
                data_dir=str(model_dir / "espeak-ng-data"),
            ),
            num_threads=2,
        ),
    )
    tts = sherpa_onnx.OfflineTts(cfg)
    samples_dir.mkdir(parents=True, exist_ok=True)
    for s in speakers:
        start = time.time()
        audio = tts.generate(sentence, sid=s["id"], speed=1.0)
        took = time.time() - start
        pcm = np.clip(np.array(audio.samples), -1, 1)
        seconds = len(pcm) / audio.sample_rate
        if seconds < 0.3 or not np.isfinite(pcm).all() or np.abs(pcm).max() < 0.01:
            sys.exit(f"Synthesis check FAILED for style '{s['key']}' ({seconds:.2f}s of audio)")
        out = samples_dir / f"{s['key']}.wav"
        with wave.open(str(out), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(audio.sample_rate)
            w.writeframes((pcm * 32767).astype("<i2").tobytes())
        print(f"  {s['key']:<14} {seconds:5.2f}s audio in {took:4.2f}s  (RTF {took / seconds:.2f})  -> {out}")


def phonemizer_check(model_dir: Path, onnx_name: str, piper_config: Path, espeak_voice: str, work: Path):
    """The app (sherpa-onnx) must turn text into the same phonemes as training (piper).
    With all noise disabled both produce identical audio, so equal lengths prove it."""
    try:
        import sherpa_onnx
        from piper import PiperVoice, SynthesisConfig
    except ImportError:
        print("    piper/sherpa-onnx not installed; skipping the phonemizer check")
        return
    if sys.platform == "win32" and espeak_voice != "en-us":
        print("    NOTE: sherpa-onnx's Windows build mangles non-Latin text, so this check only runs on")
        print("    Linux / Colab. Test the voice on the phone before sharing it.")
        return
    check_onnx = work / "piper_check.onnx"
    shutil.copyfile(model_dir / onnx_name, check_onnx)
    shutil.copyfile(piper_config, work / "piper_check.onnx.json")
    voice = PiperVoice.load(str(check_onnx), config_path=str(work / "piper_check.onnx.json"))
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=str(model_dir / onnx_name), tokens=str(model_dir / "tokens.txt"),
            data_dir=str(model_dir / "espeak-ng-data"), noise_scale=0.0, noise_scale_w=0.0, length_scale=1.0),
        num_threads=2)))
    sentences = (
        ["আমি বাংলায় কথা বলতে পারি।", "বিজ্ঞান ও প্রযুক্তির উন্নতিতে আমাদের জীবন অনেক সহজ হয়েছে।"]
        if espeak_voice == "bn"
        else ["This is a simple test of my voice.", "Please call me back after the meeting."]
    )
    syn = SynthesisConfig(speaker_id=0, noise_scale=0.0, noise_w_scale=0.0, length_scale=1.0)
    for text in sentences:
        a = len(tts.generate(text, sid=0, speed=1.0).samples)
        b = sum(len(c.audio_float_array) for c in voice.synthesize(text, syn_config=syn))
        ratio = a / max(1, b)
        print(f"    app {a} vs training {b} samples (ratio {ratio:.3f})")
        if not 0.95 <= ratio <= 1.05:
            sys.exit("Phonemizer mismatch: the app would pronounce this voice differently from training.\n"
                     "Use the espeak-ng-data that matches sherpa-onnx (default download) and report the issue.")
    check_onnx.unlink()


def build_speakers(config: dict, voice: dict) -> list[dict]:
    id_map: dict[str, int] = config.get("speaker_id_map") or {}
    labels: dict[str, dict] = voice.get("speakerLabels") or {}
    if config.get("num_speakers", 1) <= 1 or not id_map:
        label = labels.get("default", {"key": "default", "label": "Default"})
        return [{"id": 0, "key": label["key"], "label": label["label"]}]
    order = voice.get("speakerOrder") or list(id_map.keys())
    speakers = []
    for name in order:
        if name not in id_map:
            sys.exit(f"speakerOrder: '{name}' is not in the model's speaker_id_map {list(id_map)}")
        label = labels.get(name, {"key": str(name).lower(), "label": str(name).title()})
        speakers.append({"id": id_map[name], "key": label["key"], "label": label["label"]})
    return speakers


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checkpoint", required=True, type=Path)
    ap.add_argument("--piper-config", required=True, type=Path, help="config.json written by piper training")
    ap.add_argument("--voice", required=True, type=Path, help="voice details json (see voices/)")
    ap.add_argument("--out", required=True, type=Path, help="output .voicepack")
    ap.add_argument("--work", type=Path, default=Path("work/export"))
    ap.add_argument("--espeak-data", help="existing sherpa-onnx espeak-ng-data folder (else downloaded once)")
    ap.add_argument("--reuse-onnx", action="store_true", help="reuse work/raw.onnx from a previous run of the same checkpoint")
    ap.add_argument("--int8", action="store_true", help="also quantize to INT8 and package that (smaller, slightly lower quality)")
    ap.add_argument("--test-sentence", default="আমি বাংলায় কথা বলতে পারি। আজকের meeting টা খুব important ছিল।")
    args = ap.parse_args()

    config = json.loads(args.piper_config.read_text(encoding="utf-8"))
    voice = json.loads(args.voice.read_text(encoding="utf-8"))
    espeak_voice = config["espeak"]["voice"]
    model_dir = args.work / "model"
    if model_dir.exists():
        shutil.rmtree(model_dir)
    model_dir.mkdir(parents=True)

    print("1/5 Exporting ONNX ...")
    raw = args.work / "raw.onnx"
    if args.reuse_onnx and raw.exists():
        print(f"    reusing {raw}")
    else:
        num_symbols, num_speakers = export_onnx(args.checkpoint, raw)
        if num_speakers != config.get("num_speakers", 1):
            sys.exit(f"Checkpoint has {num_speakers} speakers but config says {config.get('num_speakers')}")
        print(f"    {raw.stat().st_size / 1e6:.1f} MB, {num_symbols} symbols, {num_speakers} speaker(s)")
    fp32 = model_dir / "model.onnx"
    shutil.copyfile(raw, fp32)

    print("2/5 Adding sherpa-onnx metadata and tokens ...")
    add_sherpa_metadata(fp32, config)
    write_tokens(config, model_dir / "tokens.txt")
    shutil.copytree(get_espeak_data(args.espeak_data, args.work.parent / "cache"), model_dir / "espeak-ng-data")

    onnx_name = "model.onnx"
    if args.int8:
        print("    Quantizing to INT8 ...")
        quantize_int8(fp32, model_dir / "model.int8.onnx")
        fp32.unlink()
        onnx_name = "model.int8.onnx"

    speakers = build_speakers(config, voice)
    print("3/5 Test synthesis with sherpa-onnx ...")
    sentence = args.test_sentence if espeak_voice == "bn" else "This is my own voice, running fully offline."
    smoke_test(model_dir, onnx_name, speakers, sentence, args.work / "samples")
    print("    Checking that the app reads text exactly like training did ...")
    phonemizer_check(model_dir, onnx_name, args.piper_config, espeak_voice, args.work)

    print("4/5 Writing the .voicepack ...")
    is_bn = espeak_voice == "bn"
    inference = config.get("inference", {})
    manifest_base = {
        "id": voice["id"],
        "name": voice["name"],
        "description": voice.get("description"),
        "version": voice.get("version", "1.0.0"),
        "engine": "vits",
        "languages": ["bn"] if is_bn else ["en"],
        "languageHandling": {"bn": "native", "en": "transliterate"} if is_bn else {"en": "native"},
        "locale": voice.get("locale", "bn-BD" if is_bn else "en-US"),
        "accent": voice.get("accent"),
        "gender": voice.get("gender"),
        "quality": voice.get("quality", "balanced"),
        "sampleRate": config["audio"]["sample_rate"],
        "maxChunkChars": voice.get("maxChunkChars", 180),
        "personal": bool(voice.get("personal", False)),
        "files": {"model": f"model/{onnx_name}", "tokens": "model/tokens.txt", "dataDir": "model/espeak-ng-data"},
        "speakers": speakers,
        "defaults": {
            "noiseScale": voice.get("noiseScale", inference.get("noise_scale", 0.667)),
            "noiseScaleW": voice.get("noiseScaleW", inference.get("noise_w", 0.8)),
            "lengthScale": voice.get("lengthScale", inference.get("length_scale", 1.0)),
        },
        "supports": {"speed": True, "pitch": False},
        "license": voice["license"],
    }
    if voice.get("consent"):
        manifest_base["consent"] = voice["consent"]
    manifest_base = {k: v for k, v in manifest_base.items() if v is not None}
    include = {"model": model_dir}
    preview = args.work / "samples" / f"{speakers[0]['key']}.wav"
    if preview.exists():
        include["assets/preview.wav"] = preview
    manifest = write_voicepack(manifest_base, include, args.out)

    print("5/5 Validating the package like the app does ...")
    _, problems = validate_voicepack(args.out)
    if problems:
        sys.exit("INVALID package:\n  " + "\n  ".join(problems))
    size = args.out.stat().st_size / 1e6
    print(f"\nDone: {args.out}  ({size:.0f} MB, {len(manifest['checksums'])} files, styles: "
          f"{', '.join(s['label'] for s in speakers)})")
    print("Copy it to your phone and import it in VoiceStudio -> Voices -> Import.")


if __name__ == "__main__":
    main()
