"""Mine each flame-bearing kit piece's Skyrim light (the kit-config `light` block).

Skyrim draws a fixture's glow with a separate LIGH reference the plugin places
beside the piece: of the fixtures' models only the torch is itself a LIGH
base (Skyrim.esm, Update.esm, ArgonianLakeHouse.esl and King of the
Murkmire.esp carry six LIGH records with a model, none of them a kit piece).
So a piece's light is the LIGH its source plugins place with it: for every
reference of the piece's base objects (any base whose model is the piece's
NIF), the nearest LIGH reference in the same cell within `NEAR_UNITS`; the
most frequent LIGH wins, and `offsetM` is the per-axis median of those hits
in the piece's frame (glTF Y-up metres, divided by the ref's scale). This is
the walk-2 method (test_kit_light_records) promoted from a report script.

A piece whose modal LIGH is nearest to fewer than `MIN_HITS` of its refs gets no light and is listed.
The values are the LIGH record's own: DATA radius, colour, flags, flicker,
burn time, and FNAM fade. Nothing is guessed.

    python3 -m pipeline.mine_kit_lights --kit interior-farmhouse-v1 \
        --assets vanilla:clutter/candles/candlehorntable01 --merge

Without `--assets` the candidates are the kit's flame-bearing pieces (built
manifest `flames`, `glows` or `flameCardMaterials`). `--merge` writes the
mined blocks into the kit config (other assets untouched); a block whose
`evidence` does not come from this miner is never overwritten.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

from .build_kit import DEFAULT_VAULT, registry_index
from .placement_metadata import KIT_CONFIG_DIR

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tooling/world-generation"))
from worldgen.esp_index import BASE_OBJECT_TYPES, Plugin, _cstr  # noqa: E402
from worldgen.mine_door_links import to_local  # noqa: E402

SOURCE = DEFAULT_VAULT / "skyrim-source"
PLUGINS = (
    SOURCE / "Data/Skyrim.esm",
    SOURCE / "Data/Update.esm",
    SOURCE / "mod-sources/mud-mother-grove-146557/extracted/ArgonianLakeHouse.esl",
    SOURCE / "mod-sources/king-of-the-murkmire-190459/extracted/Kotm BSA Test/King of the Murkmire.esp",
)
BUILT = REPO / "tooling/asset-pipeline/output/kits"
#: A LIGH ref this close (plugin units, same cell) belongs to the piece.
NEAR_UNITS = 200.0
EVIDENCE_TAG = "nearest LIGH ref"
#: Fewer hits than this is no evidence: mudmother argonianlanterns01's one
#: ref has a LIGH 3.6 m below and 2.4 m aside, another fixture's light.
MIN_HITS = 2
LIGH_FLAGS = ((0x1, "dynamic"), (0x2, "canBeCarried"), (0x4, "negative"), (0x8, "flicker"),
              (0x20, "offByDefault"), (0x40, "flickerSlow"), (0x80, "pulse"),
              (0x400, "shadowSpotlight"), (0x800, "shadowHemisphere"), (0x1000, "shadowOmni"),
              (0x2000, "portalStrict"))


def ligh_record(fields: dict[bytes, bytes], form_id: str) -> dict | None:
    """The `light` block values of one LIGH record (DATA + FNAM)."""
    data = fields.get(b"DATA", b"")
    if len(data) < 40:
        return None
    burn, radius = struct.unpack_from("<iI", data)
    flags = struct.unpack_from("<I", data, 12)[0]
    _falloff, _fov, _near, period, i_amp, m_amp = struct.unpack_from("<6f", data, 16)
    out = {"formId": form_id, "editorId": _cstr(fields.get(b"EDID", b"\0")),
           "burnSeconds": burn, "radiusUnits": radius, "colourRgb": list(data[8:11]),
           "flicker": {"frequency": round(1.0 / period, 3) if period > 0 else 0.0,
                       "intensityAmplitude": round(i_amp, 4),
                       "movementAmplitude": round(m_amp, 4)},
           "flags": [name for bit, name in LIGH_FLAGS if flags & bit]}
    if b"FNAM" in fields and len(fields[b"FNAM"]) >= 4:
        out["fade"] = round(struct.unpack("<f", fields[b"FNAM"][:4])[0], 4)
    return out


def median_offset(points: list[tuple[float, float, float]]) -> list[float]:
    return [round(statistics.median(axis), 2) for axis in zip(*points)]


def mine(models: dict[str, str], plugins=PLUGINS) -> dict[str, dict]:
    """asset id -> {light, hits, refs, runnerUp} for the pieces whose model
    (lower-case, relative to meshes/) is in `models` (asset id -> model)."""
    loaded = [Plugin(p) for p in plugins if Path(p).is_file()]
    key = lambda p, fid: (p.source_of(fid), fid & 0xFFFFFF)  # noqa: E731
    lighs, targets = {}, {}
    by_model = defaultdict(list)
    for asset, model in models.items():
        by_model[model].append(asset)
    for p in loaded:
        for rec, _ in p.records():
            if rec.type == b"LIGH":
                fields: dict[bytes, bytes] = {}
                for st, pl in rec.subrecords():
                    fields.setdefault(st, pl)
                src = p.source_of(rec.form_id)
                fid = rec.form_id & 0xFFFFFF if src == "Skyrim.esm" else rec.form_id
                light = ligh_record(fields, f"{fid:08x}")
                if light is not None:
                    light["_plugin"] = src
                    lighs[key(p, rec.form_id)] = light
        for fid, base in p.base_objects(tuple(t for t in BASE_OBJECT_TYPES if t != b"LIGH")).items():
            if base.model_key in by_model:
                targets[key(p, fid)] = by_model[base.model_key]
    hits = defaultdict(lambda: defaultdict(list))
    refs = Counter()

    def cells(p):
        yield from p.interior_cells()
        yield from p.exterior_cells(with_land=False)

    for p in loaded:
        for cell in cells(p):
            pieces = [(targets[key(p, r.base)], r) for r in cell.refs if key(p, r.base) in targets]
            if not pieces:
                continue
            ls = [(key(p, r.base), r) for r in cell.refs if key(p, r.base) in lighs]
            for assets, r in pieces:
                best = min(((math.dist(r.pos, lr.pos), k, lr) for k, lr in ls
                            if math.dist(r.pos, lr.pos) < NEAR_UNITS), default=None,
                           key=lambda t: t[0])
                s = r.scale or 1.0
                for asset in assets:
                    refs[asset] += 1
                    if best is None:
                        continue
                    x, y, z = to_local(r, best[2].pos)
                    hits[asset][best[1]].append((x / s, z / s, -y / s))
    out = {}
    for asset in models:
        ranked = sorted(hits[asset].items(), key=lambda kv: (-len(kv[1]), kv[0]))
        if not ranked or len(ranked[0][1]) < MIN_HITS:
            out[asset] = {"light": None, "refs": refs[asset]}
            continue
        (lkey, pts), rest = ranked[0], ranked[1:]
        light = dict(lighs[lkey])
        plugin = light.pop("_plugin")
        light["offsetM"] = median_offset(pts)
        runner = (f"next: {lighs[rest[0][0]]['editorId']} {len(rest[0][1])}; "
                  if rest else "")
        none = refs[asset] - sum(len(v) for _, v in ranked)
        light["evidence"] = (
            f"{plugin}: {light['editorId']} is the {EVIDENCE_TAG} (< {NEAR_UNITS:.0f} units, "
            f"same cell) to {len(pts)} of {refs[asset]} {Path(models[asset]).stem} refs "
            f"({runner}none {none}); offset is the median of those {len(pts)} in the piece's "
            f"frame, glTF Y-up metres (pipeline/mine_kit_lights.py).")
        out[asset] = {"light": light, "refs": refs[asset], "hits": len(pts)}
    return out


def flame_bearers(kit: str) -> list[str]:
    manifest = BUILT / f"{kit}.kit.json"
    if not manifest.is_file():
        manifest = REPO / "apps/world-studio/public/kits" / f"{kit}.kit.json"
    rows = json.loads(manifest.read_text()).get("assets", [])
    return [r["id"] for r in rows
            if r.get("flames") or r.get("glows") or r.get("flameCardMaterials")]


def merge_into_config(kit: str, mined: dict[str, dict], config_dir: Path = KIT_CONFIG_DIR) -> list[str]:
    """Write each mined light into the kit config; never overwrite a block
    this miner did not write. Returns the assets written."""
    path = config_dir / f"{kit}.json"
    text = path.read_text()
    config = json.loads(text)
    second = text.split("\n", 2)[1]
    indent = len(second) - len(second.lstrip(" ")) or 1
    written = []
    for entry in config["assets"]:
        got = mined.get(entry["asset"])
        if got is None or got["light"] is None:
            continue
        old = entry.get("light")
        if old and "mine_kit_lights" not in str(old.get("evidence", "")):
            continue
        if old and old.get("fixtureKind"):
            got["light"]["fixtureKind"] = old["fixtureKind"]
        entry["light"] = got["light"]
        written.append(entry["asset"])
    path.write_text(json.dumps(config, indent=indent, ensure_ascii=text.isascii()) + "\n")
    return written


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--kit", action="append", required=True)
    ap.add_argument("--assets", nargs="*", default=None,
                    help="asset ids (default: the kit's flame-bearing pieces)")
    ap.add_argument("--merge", action="store_true", help="write into the kit config")
    args = ap.parse_args(argv)
    wanted: dict[str, list[str]] = {}
    for kit in args.kit:
        config = json.loads((KIT_CONFIG_DIR / f"{kit}.json").read_text())
        ids = {e["asset"] for e in config["assets"]}
        assets = [a for a in (args.assets or flame_bearers(kit)) if a in ids]
        wanted[kit] = sorted(set(assets))
    all_ids = sorted({a for v in wanted.values() for a in v})
    index = registry_index({a.split(":", 1)[0] for a in all_ids})
    models = {a: index[a]["path"].lower().removeprefix("meshes/") for a in all_ids}
    mined = mine(models)
    for kit, assets in wanted.items():
        for a in assets:
            got = mined[a]
            lt = got["light"]
            print(f"{kit} {a}: " + (f"{lt['editorId']} {got['hits']}/{got['refs']} r{lt['radiusUnits']} "
                                    f"rgb{lt['colourRgb']} fade {lt.get('fade')} off {lt['offsetM']}"
                                    if lt else f"NO LIGH ({got['refs']} refs)"))
        if args.merge:
            print(f"{kit}: wrote {merge_into_config(kit, {a: mined[a] for a in assets})}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
