#!/usr/bin/env python3
"""The interior light record: window apertures, kind, size, humidity, dust and floor mist per published cell (decision 0112 §6).

One home table, keyed by cell id, for every bundle under
``apps/world-studio/public/province/interiors/``. The runtime reads it for the
window beams and the cell's volumetric medium; nothing about a cell's light is
hand-written. Run it whenever an interior cell is published or re-published:

    python3 tooling/volumetrics/interior_light.py            # every published cell
    python3 tooling/volumetrics/interior_light.py --cells A,B --merge

``interiorLight.test.ts`` fails when a published cell has no row.

Apertures, from the plugin's own placed refs (0112 section 6, 0114). A placed ref
gives window apertures when its base record is a window by the plugin's data:
- a window piece: the base model's leaf is ``window<NN>`` (KotM MudHutWindow01/02)
  or a light-ray FX static; the whole piece is one aperture;
- a piece carrying window panes: sub-meshes of its model whose base-colour
  image is a window texture (farmwindowinterior01, riftenwindows02), read by
  window_meshes.mjs from the published part; each coplanar pane group is one
  aperture.
Frame: the published part's own (Y up), placed as the runtime places it
(position + Euler(pitch, -yaw, roll, 'YXZ') x scale; pitch/roll ~0 on walls).
Outward = the aperture's thin horizontal axis, signed away from the centroid of
the cell's placements. A cell with none is written ``apertures: []`` with a reason.

Kind, size, humidity, dust and floor mist, derived (schema 2), dust overridable per cell in DUST_OVERRIDES:
- kind (``kindWhy`` says which rule): ``damp`` when the cell's lighting template
  is a cave, mine, barrow or ruin one (DAMP_TEMPLATE); else the use class the
  door claim gives the cell (worldgen.blueprint_interiors.cell_use_class over
  the cell's mined furniture mix in exterior-interior-links.json). The mined
  mix, never the published bundle: the bundle drops markers (a tanning-rack
  marker makes KeebaHouseSnailMinder a smithy). A mix with no use evidence at
  all (no bed, counter, hearth, shrine or smithy piece: the CIPHTBM huts) says
  nothing, so it is never "no bed = storage": the kind comes from the shell the
  plugin's door stands in (SHELL_DWELLING on its editor id: a hut or house is a
  dwelling), else ``unknown``;
- volumeClass: small / medium / large from the volume of the cell's AABB (every
  placement's part bounds, placed), VOLUME_CLASS_M3; ``boundsM`` records it;
- humid: the room is built of an Argonian hut family (HUMID_PATH on the mined
  link's ``interiorFamily``: KotM mud huts, CIPHTBM village huts);
- dust band from DUST_OF_KIND, one band lower when humid (wet air holds little dust);
- floorMist {topM, density} from FLOOR_MIST by (damp | humid) x volumeClass, null on a dry cell.

Deterministic: cells, refs and panes sorted.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INTERIORS = ROOT / "apps/world-studio/public/province/interiors"
KITS = ROOT / "apps/world-studio/public/kits"
OUT = ROOT / "packages/game-core/src/air/volumetrics/interiorLight.json"
MESHES = ROOT / "tooling/volumetrics/window_meshes.mjs"

WINDOW_LEAF = re.compile(r"^window\d*[a-z]?$")
FX_LEAF = re.compile(r"(lightray|lightbeam|godray|fxlightrays?|sunray)")
LIGH_NEAR_M = 2.0
RADIUS_OF_MIN_SIDE = 0.3
RADIUS_MIN_M, RADIUS_MAX_M = 0.2, 1.0
MERGE_GAP_M, PLANE_TOL_M = 0.3, 0.15

sys.path.insert(0, str(ROOT / "tooling/world-generation"))
from worldgen.blueprint_interiors import cell_use_class, linked_shells  # noqa: E402  (the claim's own rule and input)

#: Lighting templates of damp underground cells (the cell record's LGTM editor id).
DAMP_TEMPLATE = re.compile(r"cave|mine|dungeon|sewer|barrow|nordic|dwemer|falmer|ruin|grotto|crypt|tomb", re.I)
#: How visible sun shafts are, by what the room is: lived-in and swept rooms low;
#: incense and hearth smoke medium; grain, hay, sawdust, forge soot high.
DUST_OF_KIND = {"dwelling": "low", "shop": "low", "barracks": "medium", "inn": "medium", "shrine": "medium",
                "damp": "medium", "storage": "high", "smithy": "high", "workshop": "high"}
DUST_BANDS = ("low", "medium", "high")
#: Argonian hut room families (the mined link's interiorFamily): KotM argonia/mudhuts, CIPHTBM villages/argonian.
HUMID_PATH = re.compile(r"/(mudhuts?|villages/argonian)(/|$)", re.I)
#: A shell (the plugin's door stands in it) that is somebody's home, on its editor id.
SHELL_DWELLING = re.compile(r"hut|house|home|shack|pod", re.I)
#: Cell AABB volume (m^3) upper bounds of small and medium; above is large (one-room hut ~600, a
#: great house ~1300, a KotM pod with its shell 6-10k, a cave system 100k+).
VOLUME_CLASS_M3 = (("small", 1000.0), ("medium", 15000.0))
#: Floor mist (top above the floor in m, density 1/m) by medium x volumeClass: a damp cave pools
#: knee-to-waist deep; a humid hut a shin-deep breath of marsh air; a bigger room lets it lie deeper.
FLOOR_MIST = {
    "damp": {"small": (0.6, 0.3), "medium": (0.9, 0.35), "large": (1.3, 0.4)},
    "humid": {"small": (0.25, 0.08), "medium": (0.35, 0.1), "large": (0.5, 0.12)},
}
#: cellId -> (dust band, why): a cell whose derived dust is wrong for a reason the rules cannot see.
DUST_OVERRIDES: dict[str, tuple[str, str]] = {}
#: The record's `dustWhy` is one of these ids (machine data); the humid step-down is the separate `humid` boolean.
DUST_WHY = ("use-class", "damp-template", "override")
#: The record's `kindWhy` ids.
KIND_WHY = ("damp-template", "use-class", "shell", "unknown")


def piece_kind(asset_id: str) -> str | None:
    path = asset_id.split(":", 1)[-1].lower()
    leaf = path.rsplit("/", 1)[-1]
    if WINDOW_LEAF.match(leaf):
        return "window-piece"
    if path.startswith("effects/") and FX_LEAF.search(leaf):
        return "light-ray-fx"
    return None


def part_file(kit: str, asset_id: str, index_cache: dict) -> Path | None:
    if kit not in index_cache:
        f = KITS / kit / "parts/index.json"
        index_cache[kit] = json.loads(f.read_text())["assets"] if f.exists() else {}
    row = index_cache[kit].get(asset_id)
    return KITS / kit / "parts" / row["file"] if row else None


def read_parts(files: list[Path]) -> dict[str, dict]:
    if not files:
        return {}
    out = subprocess.run(["node", str(MESHES), *map(str, files)], cwd=ROOT, check=True,
                         capture_output=True, text=True).stdout
    return json.loads(out)


def merge_panes(panes: list[dict]) -> list[dict]:
    """Coplanar panes within MERGE_GAP_M of each other are one window."""
    boxes = [[[c - s / 2 for c, s in zip(p["centre"], p["size"])],
              [c + s / 2 for c, s in zip(p["centre"], p["size"])]] for p in panes]
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                thin = min((0, 2), key=lambda k: a[1][k] - a[0][k])
                coplanar = abs((a[0][thin] + a[1][thin]) - (b[0][thin] + b[1][thin])) / 2 < PLANE_TOL_M
                near = all(max(a[0][k], b[0][k]) - min(a[1][k], b[1][k]) < MERGE_GAP_M for k in range(3))
                if coplanar and near:
                    boxes[i] = [[min(a[0][k], b[0][k]) for k in range(3)], [max(a[1][k], b[1][k]) for k in range(3)]]
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break
    return [{"centre": [(lo + hi) / 2 for lo, hi in zip(*b)], "size": [hi - lo for lo, hi in zip(*b)]}
            for b in sorted(boxes)]


def yaw_rotate(v, yaw_deg: float):
    t = math.radians(-yaw_deg)
    c, s = math.cos(t), math.sin(t)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def aperture(p: dict, local_c, size, kind: str, bundle: dict, cx: float, cz: float) -> dict:
    scale = p.get("scale", 1.0)
    yaw = p["rotationDeg"][1]
    dc = yaw_rotate(tuple(x * scale for x in local_c), yaw)
    centre = [p["positionM"][i] + dc[i] for i in range(3)]
    thin = (0.0, 0.0, 1.0) if size[2] <= size[0] else (1.0, 0.0, 0.0)
    ox, _, oz = yaw_rotate(thin, yaw)
    if ox * (centre[0] - cx) + oz * (centre[2] - cz) < 0:
        ox, oz = -ox, -oz
    side = min(size[1], max(size[0], size[2])) * scale
    radius = min(RADIUS_MAX_M, max(RADIUS_MIN_M, RADIUS_OF_MIN_SIDE * side))
    near = sum(1 for l in bundle["lights"] if math.dist(l["positionM"], centre) < LIGH_NEAR_M)
    return {"refId": p["id"].split(".")[-1], "base": p.get("base"), "kind": kind,
            "centreM": [round(v, 4) for v in centre], "outward": [round(ox, 4), 0.0, round(oz, 4)],
            "radiusM": round(radius, 3), "lightsNear": near}


def cell_bounds(bundle: dict, parts: dict, index_cache: dict) -> tuple[list[float], list[float]] | None:
    """The cell's AABB (cell frame): every placement's part bounds, scaled and turned by its yaw."""
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for p in bundle["placements"]:
        f = part_file(p.get("kit", ""), p["assetId"], index_cache)
        geo = parts.get(str(f)) if f else None
        if not geo:
            continue
        b, s = geo["bounds"], p.get("scale", 1.0)
        for corner in ((x, y, z) for x in (b["lo"][0], b["hi"][0]) for y in (b["lo"][1], b["hi"][1]) for z in (b["lo"][2], b["hi"][2])):
            d = yaw_rotate(tuple(c * s for c in corner), p["rotationDeg"][1])
            for k in range(3):
                v = p["positionM"][k] + d[k]
                lo[k], hi[k] = min(lo[k], v), max(hi[k], v)
    return (lo, hi) if lo[0] < math.inf else None


def volume_class(bounds: tuple[list[float], list[float]] | None) -> str:
    if bounds is None:
        return "medium"
    vol = math.prod(h - l for l, h in zip(*bounds))
    return next((name for name, top in VOLUME_CLASS_M3 if vol <= top), "large")


def cell_apertures(bundle: dict, parts: dict, index_cache: dict) -> dict:
    places = sorted(bundle["placements"], key=lambda q: q["id"])
    n = max(1, len(places))
    cx = sum(p["positionM"][0] for p in places) / n
    cz = sum(p["positionM"][2] for p in places) / n
    found = []
    for p in places:
        f = part_file(p.get("kit", ""), p["assetId"], index_cache)
        geo = parts.get(str(f)) if f else None
        if not geo:
            continue
        kind = piece_kind(p["assetId"])
        if kind:
            lo, hi = geo["bounds"]["lo"], geo["bounds"]["hi"]
            panes = [{"centre": [(a + b) / 2 for a, b in zip(lo, hi)], "size": [b - a for a, b in zip(lo, hi)]}]
        else:
            kind, panes = "window-panes", merge_panes(geo["panes"])
        for pane in panes:
            found.append(aperture(p, pane["centre"], pane["size"], kind, bundle, cx, cz))
    bounds = cell_bounds(bundle, parts, index_cache)
    row = {"plugin": bundle["plugin"], **cell_medium(bundle, mined_link(bundle["plugin"], bundle["cellId"]), volume_class(bounds)),
           "boundsM": [[round(v, 2) for v in b] for b in bounds] if bounds else None, "apertures": found}
    if not found:
        row["reason"] = "no placed ref has a window piece or window-textured panes in its model"
    return row


def mined_link(plugin: str, cell: str, shells: dict | None = None) -> dict:
    """The cell's row in the mined door links: its furniture mix (`pieces`), shell editor id, room family."""
    for rows in (linked_shells() if shells is None else shells).values():
        for row in rows:
            if row.get("plugin") == plugin and row.get("interiorCell") == cell:
                return row
    raise SystemExit(f"interior_light: {plugin} {cell} has no row in exterior-interior-links.json; "
                     "a published cell is always one a shell links (0114)")


def cell_kind(template: str, link: dict) -> tuple[str, str]:
    """(kind, kindWhy) of a cell (module doc): the template, then the mined mix, then the shell."""
    if DAMP_TEMPLATE.search(template):
        return "damp", "damp-template"
    use, evidence = cell_use_class(link.get("pieces") or [])
    if any(evidence.values()):
        return use, "use-class"
    if SHELL_DWELLING.search(str(link.get("shellEditorId") or "")):
        return "dwelling", "shell"
    return "unknown", "unknown"


def cell_medium(bundle: dict, link: dict, volume: str) -> dict:
    """Kind, size, humidity, dust band and floor mist of a cell (module doc); `link` its mined door-link row."""
    template = str((bundle.get("lighting") or {}).get("template") or "")
    kind, kind_why = cell_kind(template, link)
    humid = bool(HUMID_PATH.search(str(link.get("interiorFamily") or "")))
    band = DUST_OF_KIND.get(kind, "medium")
    why = DUST_WHY[1] if kind == "damp" else DUST_WHY[0]
    if humid:
        band = DUST_BANDS[max(0, DUST_BANDS.index(band) - 1)]
    if bundle["cellId"] in DUST_OVERRIDES:
        band, why = DUST_OVERRIDES[bundle["cellId"]][0], DUST_WHY[2]
    medium = "damp" if kind == "damp" else "humid" if humid else None
    mist = FLOOR_MIST[medium][volume] if medium else None
    return {"kind": kind, "kindWhy": kind_why, "volumeClass": volume, "humid": humid, "dust": band, "dustWhy": why,
            "floorMist": {"topM": mist[0], "density": mist[1]} if mist else None}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cells", help="comma-separated cell ids (default: every published interior)")
    ap.add_argument("--merge", action="store_true", help="keep the other cells already in the sidecar")
    ap.add_argument("--out", default=str(OUT), help="the record to write (default: the shipped interiorLight.json)")
    ap.add_argument("--interiors", default=str(INTERIORS), help="the folder of published cell bundles to read")
    args = ap.parse_args()
    out = Path(args.out)
    want = set(args.cells.split(",")) if args.cells else None
    bundles = [json.loads(f.read_text()) for f in sorted(Path(args.interiors).glob("*.json"))
               if want is None or f.stem in want]
    index_cache: dict = {}
    files = sorted({f for b in bundles for p in b["placements"]
                    if (f := part_file(p.get("kit", ""), p["assetId"], index_cache))})
    parts = read_parts(files)
    cells = json.loads(out.read_text())["cells"] if args.merge and out.exists() else {}
    for b in bundles:
        cells[b["cellId"]] = cell_apertures(b, parts, index_cache)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"schemaVersion": 2,
                               "source": "tooling/volumetrics/interior_light.py over public/province/interiors",
                               "cells": dict(sorted(cells.items()))}, indent=1) + "\n")
    for b in bundles:
        row = cells[b["cellId"]]
        bases = sorted({a["base"] for a in row["apertures"]})
        print(f"{b['cellId']}: {row['kind']} ({row['kindWhy']}), {row['volumeClass']}, humid {row['humid']}, "
              f"dust {row['dust']}, mist {row['floorMist']}; {len(row['apertures'])} apertures from {bases or row.get('reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
