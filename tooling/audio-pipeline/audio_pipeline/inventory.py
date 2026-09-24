"""Inventory of ``Skyrim - Sounds.bsa``: counts, formats, bytes, durations by folder.

    python3 -m audio_pipeline.inventory            # writes tooling/audio-pipeline/inventory.json
    python3 -m audio_pipeline.inventory --extract sound/fx/fst   # unpack a folder to the vault to audition

wav headers are parsed in place (RIFF ``fmt``/``data`` chunks); xWMA
durations come from ffprobe. The tracked JSON is a folder-level summary
(two levels under ``sound/fx``, one under ``music``) so it stays small; the
per-file rows go to the vault (``output/audio/sounds-bsa-files.json``).
"""

from __future__ import annotations

import argparse
import json
import struct
import tempfile
from collections import defaultdict
from pathlib import Path

from . import codec, paths
from pipeline.bsa import BSAArchive  # reused reader


def wav_info(data: bytes) -> dict:
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return {"format": "wav?", "channels": 0, "sampleRate": 0, "durationS": 0.0}
    pos, fmt, size = 12, None, 0
    while pos + 8 <= len(data):
        cid, clen = data[pos:pos + 4], struct.unpack_from("<I", data, pos + 4)[0]
        if cid == b"fmt ":
            fmt = struct.unpack_from("<HHIIHH", data, pos + 8)
        elif cid == b"data":
            size = min(clen, len(data) - pos - 8)
        pos += 8 + clen + (clen & 1)
    if not fmt:
        return {"format": "wav?", "channels": 0, "sampleRate": 0, "durationS": 0.0}
    tag, ch, sr, byte_rate, _align, bits = fmt
    return {"format": f"wav-{'pcm' if tag == 1 else hex(tag)}-{bits}bit", "channels": ch, "sampleRate": sr,
            "durationS": round(size / byte_rate, 3) if byte_rate else 0.0}


def folder_key(path: str) -> str:
    parts = path.split("/")
    return "/".join(parts[:4] if parts[0] == "sound" else parts[:2])


def run() -> dict:
    bsa = BSAArchive(paths.SOUNDS_BSA)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for name in bsa.namelist():
            data = bsa.read(name)
            ext = name.rsplit(".", 1)[-1]
            if ext == "wav":
                info = wav_info(data)
            else:
                f = Path(tmp) / f"x.{ext}"
                f.write_bytes(data)
                try:
                    p = codec.probe(f)
                    info = {"format": f"{ext}-{p['codec']}", "channels": p["channels"],
                            "sampleRate": p["sampleRate"], "durationS": round(p["duration"], 3)}
                except Exception:  # noqa: BLE001 - an unreadable file is itself a finding
                    info = {"format": f"{ext}-unreadable", "channels": 0, "sampleRate": 0, "durationS": 0.0}
            rows.append({"path": name, "bytes": len(data), **info})
    folders: dict[str, dict] = defaultdict(lambda: {"files": 0, "bytes": 0, "durationS": 0.0, "formats": defaultdict(int)})
    for r in rows:
        f = folders[folder_key(r["path"])]
        f["files"] += 1
        f["bytes"] += r["bytes"]
        f["durationS"] = round(f["durationS"] + r["durationS"], 3)
        f["formats"][r["format"]] += 1
    formats: dict[str, int] = defaultdict(int)
    for r in rows:
        formats[r["format"]] += 1
    summary = {
        "schemaVersion": 1,
        "archive": paths.SOUNDS_BSA.name,
        "depotManifest": "72851/430694959351693705",
        "files": len(rows),
        "bytes": sum(r["bytes"] for r in rows),
        "formats": dict(sorted(formats.items())),
        "folders": {k: {**v, "formats": dict(sorted(v["formats"].items()))} for k, v in sorted(folders.items())},
    }
    paths.INVENTORY.write_text(json.dumps(summary, indent=1) + "\n")
    paths.VAULT_OUT.mkdir(parents=True, exist_ok=True)
    (paths.VAULT_OUT / "sounds-bsa-files.json").write_text(json.dumps(rows, indent=0))
    return summary


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--extract", help="unpack every file under this archive folder to the vault")
    a = ap.parse_args()
    if a.extract:
        bsa = BSAArchive(paths.SOUNDS_BSA)
        pre = a.extract.rstrip("/") + "/"
        got = bsa.extract([n for n in bsa.namelist() if n.startswith(pre)], paths.EXTRACTED)
        print(f"{len(got)} files -> {paths.EXTRACTED}")
        return
    s = run()
    print(s["files"], "files", s["bytes"], "bytes", s["formats"])


if __name__ == "__main__":
    _main()
