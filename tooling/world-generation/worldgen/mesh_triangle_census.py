"""Full-mesh triangles standing inside their own mesh reach at a site.

The frame is a triangle budget (decision 0084: ~4 M a frame on the owner's
M2). This counts what the LOD ladder charges for LEVEL 0 geometry at a spot,
360 degrees: every shipped instance whose distance from the site is inside the
full-mesh reach its species runs, times that species' level-0 triangle count.
Cards, decimated levels and the shadow pass are not counted; this is the
number the mesh ladder controls.

Two ladders are reported so a change can be read as a before/after:

* ``three-ring``  - the pre-round-9 rings. A folded species carried its LEVEL
  0 geometry at all three rungs (nothing to decimate down to), so it paid full
  mesh out to ring 2, ``clamp(height x 8, 100, 260)``; a real chain paid it
  only to ring 0, ``clamp(height x 2.5, 18, 60)``.
* ``folded``      - round 9: an alpha-tested (folded) species runs ONE reach,
  ``clamp(height x 5, 30, 140)``, and its card takes over there; a real chain
  keeps the three-ring ladder. Mirrors ``floraKit.lodDistances``.

Usage::

    python -m worldgen.mesh_triangle_census [--x 4020] [--z 4610]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .vegetation_ladder import PROVINCE, _decode_positions

KIT = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "kits"

MIN_MESH_LOD_REACH_M = 18.0


def three_ring_reach(height_m: float) -> float:
    return min(60.0, max(MIN_MESH_LOD_REACH_M, height_m * 2.5))


def ring2_reach(height_m: float) -> float:
    return min(260.0, max(100.0, height_m * 8.0))


def folded_reach(height_m: float) -> float:
    return min(140.0, max(30.0, height_m * 5.0))


def _assets() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for name in ("flora-province-v1.kit.json", "underwater-v1.kit.json"):
        path = KIT / name
        if not path.exists():
            continue
        for asset in json.loads(path.read_text())["assets"]:
            out.setdefault(asset["id"], asset)
    return out


def census(x: float, z: float) -> dict:
    import numpy as np

    assets = _assets()
    index = json.loads((PROVINCE / "vegetation" / "vegetation-index.json").read_text())
    order = index["speciesOrder"]
    per_species: dict[str, list[float]] = {}
    for key in index["chunks"]:
        bundle = PROVINCE / "vegetation" / f"chunk_{key}_vegetation.bin"
        if not bundle.exists():
            continue
        for species, xs, zs in _decode_positions(bundle, order):
            asset = assets.get(species)
            if asset is None or xs.size == 0:
                continue
            d = np.hypot(xs - x, zs - z)
            height = float(asset["sizeM"][2])
            folded = bool(asset.get("alphaTest"))
            tris = float(asset.get("triangles", 0))
            old = int((d < (ring2_reach(height) if folded
                            else three_ring_reach(height))).sum())
            new = int((d < (folded_reach(height) if folded else three_ring_reach(height))).sum())
            row = per_species.setdefault(species, [0.0, 0.0, tris, height, folded])
            row[0] += old * tris
            row[1] += new * tris
    old_total = sum(r[0] for r in per_species.values())
    new_total = sum(r[1] for r in per_species.values())
    top = sorted(per_species.items(), key=lambda kv: -kv[1][1])[:5]
    return {"site": [x, z], "threeRing": old_total, "folded": new_total, "top": top}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--x", type=float, default=4020.0)
    ap.add_argument("--z", type=float, default=4610.0)
    args = ap.parse_args()
    r = census(args.x, args.z)
    print(f"site {r['site'][0]:.0f},{r['site'][1]:.0f}")
    print(f"three-ring full-mesh triangles: {r['threeRing'] / 1e6:.2f} M")
    print(f"folded ladder   full-mesh triangles: {r['folded'] / 1e6:.2f} M")
    print("top five species by folded-ladder triangles:")
    for species, (old, new, tris, height, folded) in r["top"]:
        print(f"  {species}: {new / 1e6:.2f} M (was {old / 1e6:.2f} M), "
              f"{tris:.0f} tris, {height:.1f} m, folded={folded}")


if __name__ == "__main__":
    main()
