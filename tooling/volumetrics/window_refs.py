#!/usr/bin/env python3
"""Window apertures read from the plugin's own placed refs (decisions 0112 §6, 0114).

For every published interior bundle, the refs whose BASE model (the plugin's
model path, carried as the placement's assetId) is a window piece
(leaf ``window<NN>``) or a light-ray FX static (under ``effects/`` with a
light-ray/beam leaf) become apertures: centre = the piece's bounds centre in
the cell frame, outward = the piece's thin horizontal axis, signed away from
the centroid of the cell's placements. Window LIGH refs are the bundle's
lights within ``LIGH_NEAR_M`` of an aperture (counted, for the record).

Writes packages/game-core/src/air/volumetrics/windowRefs.json (schemaVersion 1,
keyed by cell id). Deterministic: cells and refs sorted by id.
Run: python3 tooling/volumetrics/window_refs.py
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INTERIORS = ROOT / "apps/world-studio/public/province/interiors"
KITS = ROOT / "apps/world-studio/public/kits"
OUT = ROOT / "packages/game-core/src/air/volumetrics/windowRefs.json"

WINDOW_LEAF = re.compile(r"^window\d*[a-z]?$")
FX_LEAF = re.compile(r"(lightray|lightbeam|godray|fxlightrays?|sunray)")
LIGH_NEAR_M = 2.0
RADIUS_OF_MIN_SIDE = 0.3
RADIUS_MIN_M, RADIUS_MAX_M = 0.2, 1.0


def kit_assets() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in sorted(KITS.glob("*.kit.json")):
        for a in json.loads(f.read_text()).get("assets", []):
            out.setdefault(a["id"], a)
    return out


def is_aperture_ref(asset_id: str) -> str | None:
    path = asset_id.split(":", 1)[-1].lower()
    leaf = path.rsplit("/", 1)[-1]
    if WINDOW_LEAF.match(leaf):
        return "window-piece"
    if path.startswith("effects/") and FX_LEAF.search(leaf):
        return "light-ray-fx"
    return None


def yaw_rotate(v: tuple[float, float, float], yaw_deg: float) -> tuple[float, float, float]:
    # bundle frame: Euler(pitch, -yaw, roll, 'YXZ'); pitch/roll are ~0 on wall pieces
    t = math.radians(-yaw_deg)
    c, s = math.cos(t), math.sin(t)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def cell_apertures(bundle: dict, assets: dict[str, dict]) -> dict:
    places = bundle["placements"]
    n = max(1, len(places))
    cx = sum(p["positionM"][0] for p in places) / n
    cz = sum(p["positionM"][2] for p in places) / n
    found = []
    for p in sorted(places, key=lambda q: q["id"]):
        kind = is_aperture_ref(p["assetId"])
        if not kind:
            continue
        a = assets.get(p["assetId"])
        scale = p.get("scale", 1.0)
        yaw = p["rotationDeg"][1]
        size = a["sizeM"] if a else [1.0, 1.0, 0.2]
        off = a["originOffsetM"] if a else [0.5, 0.5, 0.1]
        local_c = tuple((size[i] / 2 - off[i]) * scale for i in range(3))
        dc = yaw_rotate(local_c, yaw)
        centre = [p["positionM"][i] + dc[i] for i in range(3)]
        thin = (0.0, 0.0, 1.0) if size[2] <= size[0] else (1.0, 0.0, 0.0)
        ox, _, oz = yaw_rotate(thin, yaw)
        if ox * (centre[0] - cx) + oz * (centre[2] - cz) < 0:
            ox, oz = -ox, -oz
        side = min(size[1], max(size[0], size[2])) * scale
        radius = min(RADIUS_MAX_M, max(RADIUS_MIN_M, RADIUS_OF_MIN_SIDE * side))
        near = sum(1 for l in bundle["lights"]
                   if math.dist(l["positionM"], centre) < LIGH_NEAR_M)
        found.append({"refId": p["id"].split(".")[-1], "base": p.get("base"), "kind": kind,
                      "centreM": [round(v, 4) for v in centre],
                      "outward": [round(ox, 4), 0.0, round(oz, 4)],
                      "radiusM": round(radius, 3), "lightsNear": near})
    return {"plugin": bundle["plugin"], "apertures": found}


def main() -> int:
    assets = kit_assets()
    cells = {}
    for f in sorted(INTERIORS.glob("*.json")):
        b = json.loads(f.read_text())
        cells[b["cellId"]] = cell_apertures(b, assets)
    OUT.write_text(json.dumps({"schemaVersion": 1,
                               "source": "tooling/volumetrics/window_refs.py over public/province/interiors",
                               "cells": cells}, indent=1) + "\n")
    for k, v in cells.items():
        print(f"{k}: {len(v['apertures'])} refs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
