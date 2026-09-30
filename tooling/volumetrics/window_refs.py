#!/usr/bin/env python3
"""Window apertures read from the plugin's own placed refs (decisions 0112 §6, 0114).

A placed ref gives window apertures when its base record is a window by the
plugin's own data:
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

Writes packages/game-core/src/air/volumetrics/windowRefs.json (schemaVersion 1,
keyed by cell id). Deterministic: cells, refs and panes sorted.
Run: python3 tooling/volumetrics/window_refs.py [--cells a,b --merge]
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INTERIORS = ROOT / "apps/world-studio/public/province/interiors"
KITS = ROOT / "apps/world-studio/public/kits"
OUT = ROOT / "packages/game-core/src/air/volumetrics/windowRefs.json"
MESHES = ROOT / "tooling/volumetrics/window_meshes.mjs"

WINDOW_LEAF = re.compile(r"^window\d*[a-z]?$")
FX_LEAF = re.compile(r"(lightray|lightbeam|godray|fxlightrays?|sunray)")
LIGH_NEAR_M = 2.0
RADIUS_OF_MIN_SIDE = 0.3
RADIUS_MIN_M, RADIUS_MAX_M = 0.2, 1.0
MERGE_GAP_M, PLANE_TOL_M = 0.3, 0.15


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
    row = {"plugin": bundle["plugin"], "apertures": found}
    if not found:
        row["reason"] = "no placed ref has a window piece or window-textured panes in its model"
    return row


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cells", help="comma-separated cell ids (default: every published interior)")
    ap.add_argument("--merge", action="store_true", help="keep the other cells already in the sidecar")
    args = ap.parse_args()
    want = set(args.cells.split(",")) if args.cells else None
    bundles = [json.loads(f.read_text()) for f in sorted(INTERIORS.glob("*.json"))
               if want is None or f.stem in want]
    index_cache: dict = {}
    files = sorted({f for b in bundles for p in b["placements"]
                    if (f := part_file(p.get("kit", ""), p["assetId"], index_cache))})
    parts = read_parts(files)
    cells = json.loads(OUT.read_text())["cells"] if args.merge and OUT.exists() else {}
    for b in bundles:
        cells[b["cellId"]] = cell_apertures(b, parts, index_cache)
    OUT.write_text(json.dumps({"schemaVersion": 1,
                               "source": "tooling/volumetrics/window_refs.py over public/province/interiors",
                               "cells": dict(sorted(cells.items()))}, indent=1) + "\n")
    for b in bundles:
        row = cells[b["cellId"]]
        bases = sorted({a["base"] for a in row["apertures"]})
        print(f"{b['cellId']}: {len(row['apertures'])} apertures from {bases or row.get('reason')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
