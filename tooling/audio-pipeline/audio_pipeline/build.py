"""Selection -> shipped audio: extract, convert, measure, write the manifest.

    python3 -m audio_pipeline.build                       # selection.json -> packages/audio/files
    python3 -m audio_pipeline.build --selection S --out D # a sample run into a scratch dir
    python3 -m audio_pipeline.build --check              # manifest vs files (hash, bytes)

A *set* is one or more vanilla SNDR records named in the selection (or
generated from the plugin's footstep sets and region tables, see ``expand``); its
variants are their ANAM tracks, its loop flag and variance come from the
record (never from filenames). An *asset* is one source file; its id is the
archive path without ``sound/`` and extension, prefixed ``skyrim/``, so two
sets sharing a file share the asset. Output is deterministic: sorted keys,
bit-exact WebM, hashes of both source and output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

import numpy as np

from . import codec, esm_sounds, loops, paths
from pipeline.bsa import BSAArchive  # reused reader

SCHEMA_VERSION = 1
CATEGORIES = ("combat", "movement", "ambient", "weather", "object", "ui", "music")
#: Decoder priming offsets a loop must survive: trimmed, left in, over-trimmed.
SHIFTS = (0, 312, -312)


#: Recorded in place of an infinite seam score (digital silence at the join, or a
#: loop too short to score): JSON has no infinity.
SCORE_CAP = 999.0


def _score(x: float) -> float:
    return round(min(float(x), SCORE_CAP), 3)


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def asset_id(archive_path: str) -> str:
    stem = archive_path.rsplit(".", 1)[0]
    return "skyrim/" + (stem[6:] if stem.startswith("sound/") else stem)


def resolve_track(track: str, names: set[str]) -> str | None:
    """The engine plays ``x.xwm`` when an SNDR names ``x.wav`` and only the xwm exists."""
    if track in names:
        return track
    alt = track.rsplit(".", 1)[0] + ".xwm"
    return alt if alt in names else None


_GAITS = (("JumpDown", "jump-down"), ("JumpUp", "jump-up"), ("Sneak", "sneak"), ("Scuff", "scuff"),
          ("Sprint", "sprint"), ("Run", "run"), ("Walk", "walk"))


def gait_of(fstp_edid: str) -> str:
    return next((g for key, g in _GAITS if key in fstp_edid), "other")


def slug(edid: str, prefix: str = "") -> str:
    """``AMBrCricketsMarshDay01LPSD`` -> ``crickets-marsh-day01-lpsd`` (stable: vanilla ids never change)."""
    e = edid[len(prefix):] if prefix and edid.startswith(prefix) else edid
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "-", e).lower()


def expand(selection: dict, records: dict) -> tuple[list[dict], list[str]]:
    """Explicit sets plus the two plugin-driven generators: footstep sets and region tables.

    - ``footsteps``: every FSTP of each named FSTS (footwear), classified into
      a gait by its record id, resolved per named MATT through IPDS -> IPCT ->
      SNDR; left and right feet join one set ``footstep.<footwear>.<gait>.<surface>``.
    - ``regions``: every RDSA entry of each named REGN becomes
      ``ambient.<region>.<slug>`` with the vanilla chance and weather flags kept.
    """
    entries = [dict(e) for e in selection.get("sets", [])]
    problems: list[str] = []
    fs = selection.get("footsteps")
    if fs:
        for fsts, footwear in fs["footwear"].items():
            by_key: dict[str, list[str]] = {}
            for step in esm_sounds.footstep_set(records, fsts):
                gait = gait_of(step["fstp"])
                if gait not in fs["gaits"]:
                    continue
                per_matt = esm_sounds.footstep_sounds(records, step["fstp"])
                for matt, surface in fs["materials"].items():
                    snd = per_matt.get(matt)
                    if snd is None:
                        problems.append(f"{fsts}/{step['fstp']}: no sound for {matt}")
                        continue
                    lst = by_key.setdefault(f"footstep.{footwear}.{gait}.{surface}", [])
                    if snd not in lst:
                        lst.append(snd)
            entries += [{"id": k, "category": "movement", "sndr": v} for k, v in by_key.items()]
    for region, key in selection.get("regions", {}).items():
        for row in esm_sounds.region_sounds(records, region):
            entries.append({"id": f"ambient.{key}.{slug(row['sndr'], 'AMBr')}", "category": "ambient",
                            "sndr": [row["sndr"]],
                            "region": {"regn": region, "chance": row["chance"], "weather": row["weather"]}})
    seen: dict[str, dict] = {}
    for e in entries:
        if e["id"] in seen and seen[e["id"]] != e:
            problems.append(f"{e['id']}: defined twice with different records or region rows")
        seen.setdefault(e["id"], e)
    return list(seen.values()), problems


def plan(selection: dict, records: dict, names: set[str]) -> tuple[dict, dict, list[str]]:
    """``(sets, assets_to_build {assetId: {path, loop}}, problems)`` without touching audio."""
    sndr = esm_sounds.by_edid(records, "sndr")
    sets: dict[str, dict] = {}
    assets: dict[str, dict] = {}
    entries, problems = expand(selection, records)
    for entry in entries:
        sid, cat = entry["id"], entry["category"]
        if cat not in CATEGORIES:
            problems.append(f"{sid}: unknown category {cat}")
            continue
        recs = []
        for edid in entry["sndr"]:
            if edid not in sndr:
                problems.append(f"{sid}: no SNDR {edid} in Skyrim.esm")
                continue
            recs.append(sndr[edid])
        if not recs:
            continue
        looping = {r.get("looping", "none") for r in recs}
        if len(looping) > 1:
            problems.append(f"{sid}: records disagree on looping {sorted(looping)}")
        is_loop = bool(looping & esm_sounds.LOOPING_MODES)
        variants: list[str] = []
        variant_att: list[float] = []
        for r in recs:
            for t in r["tracks"]:
                path = resolve_track(t, names)
                if path is None:
                    problems.append(f"{sid}: {r['edid']} track {t} not in the archive")
                    continue
                aid = asset_id(path)
                if aid not in variants:
                    variants.append(aid)
                    variant_att.append(float(r.get("staticAttenuationDb", 0.0)))
                prev = assets.get(aid)
                if prev and prev["loop"] != is_loop:
                    problems.append(f"{aid}: used as both loop and one-shot")
                assets[aid] = {"path": path, "loop": is_loop}
        # A set merging several records (left and right foot) keeps each record's own
        # attenuation per variant when they differ (13 of 90 generated sets, up to
        # 2.6 dB); the variances must agree or the records do not belong together.
        if len({(r.get("dbVariance", 0), r.get("freqVariancePct", 0)) for r in recs}) > 1:
            problems.append(f"{sid}: records disagree on dB or pitch variance")
        base_att = min(variant_att) if variant_att else 0.0
        sets[sid] = {
            "category": cat,
            "loop": is_loop,
            "variants": variants,
            "gainDb": -round(base_att, 2),
            "dbVariance": int(recs[0].get("dbVariance", 0)),
            "pitchVariancePct": int(recs[0].get("freqVariancePct", 0)),
            "source": {"plugin": "Skyrim.esm", "sndr": [r["edid"] for r in recs]},
        }
        if len(set(variant_att)) > 1:
            sets[sid]["variantGainDb"] = [-round(a - base_att, 2) for a in variant_att]
        if entry.get("region"):
            sets[sid]["source"]["region"] = entry["region"]
        if entry.get("note"):
            sets[sid]["note"] = entry["note"]
    return sets, assets, problems


def bitrate_kbps(enc: dict, channels: int, source_rate: int) -> int:
    """Opus target: the category base, scaled down for sources with less bandwidth.

    Vanilla ships beds and one-shots at 8-44.1 kHz; a 8 kHz bird call has
    nothing above 4 kHz, so spending a 32 kHz source's bitrate on it buys
    nothing (sample 1: 36 KB for 3 s). Scaled by ``rate / 32000``, floored at
    ``minKbps``, capped at the base.
    """
    base = enc["stereoKbps"] if channels > 1 else enc["monoKbps"]
    return int(max(enc["minKbps"], min(base, round(base * source_rate / 32000))))


def convert_asset(raw: bytes, is_loop: bool, dest: Path, enc: dict, work: Path) -> dict:
    src = work / "src"
    src.write_bytes(raw)
    info = codec.probe(src)
    sr = codec.SAMPLE_RATE
    pcm = codec.decode(src, info["channels"])
    kbps = bitrate_kbps(enc, info["channels"], info["sampleRate"])
    rec: dict = {"channels": info["channels"], "sourceCodec": info["codec"], "sourceSampleRate": info["sampleRate"]}
    if is_loop:
        native = codec.decode(src, info["channels"], rate=None)
        loop, method, src_score = loops.make_loop(native, info["sampleRate"], sr)
        padded, ls, le = loops.pad_periodic(loop, sr, enc["loopPadS"])
        codec.encode_opus_webm(padded, dest, kbps)
        dec = codec.decode(dest, info["channels"])
        fade = int(round(enc["loopFadeS"] * sr))
        hard = max(loops.decoded_seam_score(dec, ls, le, sh) for sh in SHIFTS)
        runtime = {str(sh): _score(loops.runtime_join_score(dec, ls, le, fade, sh)) for sh in SHIFTS}
        rec.update(durationS=round(len(padded) / sr, 4),
                   loop={"startS": round(ls / sr, 6), "endS": round(le / sr, 6), "fadeS": enc["loopFadeS"],
                         "method": method, "sourceSeam": _score(src_score), "hardLoopSeam": _score(hard),
                         "runtimeJoin": runtime})
    else:
        codec.encode_opus_webm(pcm, dest, kbps)
        rec.update(durationS=round(len(pcm) / sr, 4), loop=None)
    peak = float(np.abs(pcm).max()) if len(pcm) else 0.0
    rec["peakDb"] = round(20 * np.log10(peak), 2) if peak > 0 else -120.0
    rec["kbps"] = kbps
    return rec


def build(selection_path: Path, out_dir: Path, manifest_path: Path, provenance_path: Path) -> dict:
    """Ship ``out_dir/<assetId>.webm`` + the runtime manifest; evidence goes to ``provenance_path``.

    The shipped manifest carries what the runtime and the budget need (file,
    bytes, hash, duration, loop points, source path); the provenance record
    (source hash, codec, bitrate, peak, seam evidence) stays in the repo and
    is not downloaded.
    """
    selection = json.loads(selection_path.read_text())
    records = esm_sounds.load()
    bsa = BSAArchive(paths.SOUNDS_BSA)
    names = set(bsa.namelist())
    sets, todo, problems = plan(selection, records, names)
    if problems:
        raise SystemExit("selection problems:\n  " + "\n  ".join(problems))
    enc = selection["encoding"]
    assets: dict[str, dict] = {}
    provenance: dict[str, dict] = {}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for aid in sorted(todo):
            spec = todo[aid]
            raw = bsa.read(spec["path"])
            rel = f"{aid}.webm"
            dest = out_dir / rel
            rec = convert_asset(raw, spec["loop"], dest, enc, work)
            data = dest.read_bytes()
            loop = rec.pop("loop")
            assets[aid] = {"file": rel, "bytes": len(data), "sha256": _sha(data), "durationS": rec.pop("durationS"),
                           "channels": rec["channels"], "source": spec["path"],
                           "loop": {k: loop[k] for k in ("startS", "endS", "fadeS")} if loop else None}
            provenance[aid] = {"archive": paths.SOUNDS_BSA.name, "path": spec["path"], "sha256": _sha(raw), **rec,
                               **({"loopEvidence": {k: v for k, v in loop.items() if k not in ("startS", "endS", "fadeS")}}
                                  if loop else {})}
            print(f"{aid}  {len(data)} B  {'loop ' + loop['method'] if loop else ''}", flush=True)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generator": "tooling/audio-pipeline (python3 -m audio_pipeline.build)",
        "source": selection["source"],
        "provenance": "tooling/audio-pipeline/provenance.json",
        "codec": {"container": "webm", "codec": "opus", "sampleRate": codec.SAMPLE_RATE, **enc},
        "sets": {k: sets[k] for k in sorted(sets)},
        "assets": {k: assets[k] for k in sorted(assets)},
    }
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    provenance_path.write_text(json.dumps({"schemaVersion": SCHEMA_VERSION,
                                           "assets": {k: provenance[k] for k in sorted(provenance)}},
                                          indent=1, sort_keys=True, allow_nan=False) + "\n")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True, allow_nan=False) + "\n")
    # Files no longer named by the manifest are removed so the shipped tree is exactly the manifest.
    keep = {out_dir / a["file"] for a in assets.values()}
    for f in out_dir.rglob("*.webm"):
        if f not in keep:
            f.unlink()
    return manifest


def check(manifest_path: Path = paths.MANIFEST, provenance_path: Path | None = paths.PROVENANCE) -> list[str]:
    """Every asset file exists with the recorded bytes and hash; every variant is an asset;
    every loop's measured runtime join passes."""
    m = json.loads(manifest_path.read_text())
    prov = json.loads(provenance_path.read_text())["assets"] if provenance_path and provenance_path.exists() else None
    root = manifest_path.parent
    errs = []
    if m.get("schemaVersion") != SCHEMA_VERSION:
        errs.append(f"schemaVersion {m.get('schemaVersion')} != {SCHEMA_VERSION}")
    for aid, a in m["assets"].items():
        f = root / a["file"]
        if not f.exists():
            errs.append(f"{aid}: missing {a['file']}")
            continue
        data = f.read_bytes()
        if len(data) != a["bytes"] or _sha(data) != a["sha256"]:
            errs.append(f"{aid}: bytes/hash differ from the manifest")
        if prov is not None:
            p = prov.get(aid)
            if p is None:
                errs.append(f"{aid}: no provenance record")
            elif a["loop"] and not all(v <= loops.JOIN_PASS for v in p["loopEvidence"]["runtimeJoin"].values()):
                errs.append(f"{aid}: loop join fails {p['loopEvidence']['runtimeJoin']}")
    for sid, s in m["sets"].items():
        for v in s["variants"]:
            if v not in m["assets"]:
                errs.append(f"{sid}: variant {v} is not an asset")
    shipped = {p.relative_to(root).as_posix() for p in root.rglob("*.webm")}
    extra = shipped - {a["file"] for a in m["assets"].values()}
    errs += [f"unlisted file {e}" for e in sorted(extra)]
    return errs


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--selection", type=Path, default=paths.SELECTION)
    ap.add_argument("--out", type=Path, default=paths.AUDIO_FILES, help="files root (manifest written inside)")
    ap.add_argument("--provenance", type=Path, default=None,
                    help="default: the tracked provenance.json for the shipped files, <out>/provenance.json otherwise")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if a.provenance is None:
        shipped = a.out.resolve() == paths.AUDIO_FILES.resolve()
        a.provenance = paths.PROVENANCE if shipped else a.out / paths.PROVENANCE.name
    if a.check:
        errs = check(a.out / paths.MANIFEST.name, a.provenance)
        print("\n".join(errs) or "audio manifest OK")
        sys.exit(1 if errs else 0)
    build(a.selection, a.out, a.out / paths.MANIFEST.name, a.provenance)


if __name__ == "__main__":
    _main()
