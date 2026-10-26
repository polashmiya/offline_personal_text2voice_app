"""
.voicepack v1 writer and validator (Python twin of tools/voice-package/make-voicepack.mjs).

A .voicepack is a zip:  manifest.json + model/... (+ optional dictionary/, assets/).
Every file except manifest.json is listed in manifest["checksums"] with its SHA-256.
The app re-verifies every checksum before installing, so a damaged download or a
modified file is always rejected.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

FORMAT_VERSION = 1
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
KEY_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
SHA_RE = re.compile(r"^[a-f0-9]{64}$")
MAX_PACKAGE_BYTES = int(1.5 * 1024**3)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_rel(path: str) -> str:
    if not path or path.startswith("/") or ".." in path or "\\" in path or ":" in path:
        raise ValueError(f"Unsafe package path: {path}")
    return path


def collect(include: dict[str, Path]) -> list[tuple[str, Path]]:
    """include: package path -> file or folder on disk."""
    entries: list[tuple[str, Path]] = []
    for package_path, source in include.items():
        source = Path(source)
        if source.is_dir():
            for file in sorted(p for p in source.rglob("*") if p.is_file()):
                rel = file.relative_to(source).as_posix()
                entries.append((_safe_rel(f"{package_path}/{rel}"), file))
        elif source.is_file():
            entries.append((_safe_rel(package_path), source))
        else:
            raise FileNotFoundError(source)
    entries.sort(key=lambda e: e[0])
    return entries


def validate_manifest(m: dict) -> list[str]:
    """The essential rules of the app's zod schema (src/domain/voicepack/manifest.ts)."""
    errors: list[str] = []

    def need(cond: bool, msg: str):
        if not cond:
            errors.append(msg)

    need(m.get("formatVersion") == FORMAT_VERSION, "formatVersion must be 1")
    need(bool(ID_RE.match(str(m.get("id", "")))), "id: lowercase letters, digits, . _ - (3-64 chars)")
    need(0 < len(str(m.get("name", "")).strip()) <= 80, "name: 1-80 characters")
    need(m.get("engine") in ("vits", "kokoro", "matcha"), "engine must be vits/kokoro/matcha")
    langs = m.get("languages") or []
    need(bool(langs) and all(l in ("bn", "en") for l in langs), "languages: bn and/or en")
    handling = m.get("languageHandling") or {}
    need(all(handling.get(l) == "native" for l in langs), "every declared language must be 'native'")
    need(m.get("quality") in ("fast", "balanced", "studio"), "quality must be fast/balanced/studio")
    need(isinstance(m.get("sampleRate"), int) and 8000 <= m["sampleRate"] <= 48000, "sampleRate 8000-48000")
    files = m.get("files") or {}
    need(bool(files.get("model")) and bool(files.get("tokens")), "files.model and files.tokens are required")
    speakers = m.get("speakers") or []
    need(len(speakers) >= 1, "at least one speaker")
    for s in speakers:
        need(isinstance(s.get("id"), int) and 0 <= s["id"] <= 10000, f"speaker id invalid: {s}")
        need(bool(KEY_RE.match(str(s.get("key", "")))), f"speaker key invalid: {s.get('key')}")
        need(0 < len(str(s.get("label", ""))) <= 40, f"speaker label 1-40 chars: {s.get('label')}")
    lic = m.get("license") or {}
    need(0 < len(str(lic.get("name", ""))) <= 200, "license.name: 1-200 characters")
    need(isinstance(lic.get("commercialUse"), bool), "license.commercialUse must be true/false")
    need(len(str(lic.get("attribution", ""))) <= 500, "license.attribution: max 500 characters")
    if m.get("personal"):
        consent = m.get("consent") or {}
        need(consent.get("confirmed") is True, "personal voices need consent.confirmed = true")
    for path, digest in (m.get("checksums") or {}).items():
        _safe_rel(path)
        need(bool(SHA_RE.match(digest)), f"bad checksum for {path}")
    for key in ("model", "tokens", "lexicon", "voices", "vocoder"):
        ref = files.get(key)
        if ref and ref not in (m.get("checksums") or {}):
            errors.append(f"files.{key} ({ref}) is not in the package")
    return errors


def write_voicepack(manifest_base: dict, include: dict[str, Path], out: Path) -> dict:
    """Builds the package. Returns the final manifest."""
    entries = collect(include)
    checksums = {name: sha256_file(path) for name, path in entries}
    manifest = {
        **manifest_base,
        "formatVersion": FORMAT_VERSION,
        "checksums": checksums,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }
    errors = validate_manifest(manifest)
    if errors:
        raise ValueError("Invalid manifest:\n  " + "\n  ".join(errors))
    total = sum(p.stat().st_size for _, p in entries)
    if total > MAX_PACKAGE_BYTES:
        raise ValueError(f"Package payload {total} bytes exceeds the app limit")

    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".part")
    with zipfile.ZipFile(tmp, "w", allowZip64=False) as z:
        def add(name: str, data_path: Path | None, data: bytes | None = None):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            size = len(data) if data is not None else data_path.stat().st_size
            store = name.endswith(".onnx") or size > 8 * 1024 * 1024
            info.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
            if data is not None:
                z.writestr(info, data, compresslevel=None if store else 9)
            else:
                with open(data_path, "rb") as src, z.open(info, "w", force_zip64=False) as dst:
                    for block in iter(lambda: src.read(1 << 20), b""):
                        dst.write(block)

        add("manifest.json", None, json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
        for name, path in entries:
            add(name, path)
    tmp.replace(out)
    return manifest


def validate_voicepack(path: Path) -> tuple[dict, list[str]]:
    """Opens a .voicepack and checks manifest + every checksum, like the app does."""
    errors: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        if "manifest.json" not in names:
            return {}, ["manifest.json missing"]
        manifest = json.loads(z.read("manifest.json").decode("utf-8"))
        errors += validate_manifest(manifest)
        listed = manifest.get("checksums") or {}
        for name in sorted(names - {"manifest.json"}):
            if name.endswith("/"):
                continue
            if name not in listed:
                errors.append(f"unlisted file: {name}")
                continue
            digest = hashlib.sha256()
            with z.open(name) as f:
                for block in iter(lambda: f.read(1 << 20), b""):
                    digest.update(block)
            if digest.hexdigest() != listed[name]:
                errors.append(f"checksum mismatch: {name}")
        for name in listed:
            if name not in names:
                errors.append(f"listed but missing: {name}")
    return manifest, errors


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("usage: python voicepack.py <file.voicepack>   (validates a package)")
        sys.exit(2)
    manifest, problems = validate_voicepack(Path(sys.argv[1]))
    if problems:
        print("INVALID:\n  " + "\n  ".join(problems))
        sys.exit(1)
    print(f"OK  {manifest['id']}  '{manifest['name']}'  {len(manifest['checksums'])} files verified")
