"""Author `terrain-patches.json` from the sources that still shape ground (Phase 16b).

    python3 -m worldgen.author_terrain_patches            # rewrite the file
    python3 -m worldgen.author_terrain_patches --check    # exit 1 if it would change

Two sources become patches, deterministically:

* `world/sources/routes/authored-minor-waterways.json` -> one `poling-channel`
  patch per line (ruling 6: poling channels are patches; dock and lane
  dredges of natural water are retired — a berth goes where the water
  floats the hull).
* the catalogue's typed `terrainRequests` -> one `terrain-request` patch per
  PLACE (its requests compose as `terrain_request_raster.apply_plan` composes
  them: raises first, then cuts). The bounds are the plan's own operation
  bounds; `maxDeltaM` is the largest delivery delta of the place's requests.
  Kinds that ask for water (`pool`, `sinkhole`, `hollow`, `spring`) declare
  `makesWater`; the rest do not, and a request that would move frozen water
  is REFUSED by `apply_terrain_patches` — the place adapts (16g).

Grading (16e) and settlement pads (16h) author their own kinds into the same
file with the same contract. Run this after editing either source and commit
the result; `apply_terrain_patches` reads only the file.
"""

from __future__ import annotations

import json
import sys

from . import terrain_patches as tp
from .authored_waterways import CHANNEL_HALF_WIDTH_M, CONNECT_SEARCH_M, SHOULDER_M
from .dock_spec import HULL_CLASS_DEPTH_M

WATER_KINDS = ("pool", "sinkhole", "hollow", "spring")
POLING_MAX_DELTA_M = 4.0     # deeper than this through a bank is not a "local patch": the line moves


def poling_patches() -> list[dict]:
    from .hydrology_intent import load_authored_minor_waterways
    ways, errors = load_authored_minor_waterways()
    if errors:
        raise SystemExit("authored minor waterways: " + "; ".join(errors))
    out = []
    reach = CHANNEL_HALF_WIDTH_M + SHOULDER_M + CONNECT_SEARCH_M
    for w in ways:
        xs = [p[0] for p in w["pointsM"]]
        zs = [p[1] for p in w["pointsM"]]
        out.append({
            "id": f"patch.poling.{w['id']}", "kind": "poling-channel", "order": 0,
            "after": [], "crosses": [], "makesWater": True,
            "bboxM": [round(min(xs) - reach, 1), round(min(zs) - reach, 1), round(max(xs) + reach, 1), round(max(zs) + reach, 1)],
            "blendM": 0.0, "maxDeltaM": POLING_MAX_DELTA_M,
            "source": {"waterway": w["id"], "file": "world/sources/routes/authored-minor-waterways.json"},
            "params": {"waterway": {k: w[k] for k in ("id", "pointsM", "terminalM") if k in w}},
            "why": f"an authored poling channel to {w.get('terminalId', 'its landing')} "
                   f"(canoe class, {HULL_CLASS_DEPTH_M['canoe']} m); joins the frozen water it ends in",
        })
    return out


def request_patches() -> list[dict]:
    from . import terrain_requests as tr
    records = [r for r in tr.catalogue_records() if r.get("terrainRequests")]
    out = []
    for r in sorted(records, key=lambda x: x["id"]):
        record = {"id": r["id"], "position": r["position"], "terrainRequests": r["terrainRequests"]}
        plan, errs = tr.build_plan([record])
        if errs:
            raise SystemExit(f"{r['id']}: " + "; ".join(errs))
        ops = plan["operations"]
        x0 = min(o["boundsM"]["minXM"] for o in ops); x1 = max(o["boundsM"]["maxXM"] for o in ops)
        z0 = min(o["boundsM"]["minZM"] for o in ops); z1 = max(o["boundsM"]["maxZM"] for o in ops)
        out.append({
            "id": f"patch.request.{r['id']}", "kind": "terrain-request", "order": 1,
            "after": [], "crosses": [],
            "makesWater": any(q["kind"] in WATER_KINDS for q in r["terrainRequests"]),
            "bboxM": [round(x0, 1), round(z0, 1), round(x1, 1), round(z1, 1)],
            "blendM": 0.0, "maxDeltaM": round(sum(float(o["parameters"]["deltaM"]) for o in ops) + 0.05, 3),
            "source": {"place": r["id"], "file": "world/sources/catalogue/", "planDigest": plan["planDigest"]},
            "params": {"record": record},
            "why": "; ".join(f"{q['kind']}: {q['note'].strip()}" for q in r["terrainRequests"])[:400],
        })
    return out


def author() -> list[dict]:
    patches = poling_patches() + request_patches()
    # overlapping regions must declare an order: later id waits for the earlier
    # (deterministic, and the applier then runs them in that order)
    boxes = {p["id"]: tp.region_box(p, (4033, 4033)) for p in patches}
    for i, a in enumerate(patches):
        for b in patches[i + 1:]:
            if tp._intersects(boxes[a["id"]], boxes[b["id"]]):
                if a["id"] not in b["after"]:
                    b["after"].append(a["id"])
    return patches


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    patches = author()
    errs = tp.validate(patches)
    if errs:
        print("\n".join(errs))
        return 1
    if "--check" in args:
        current = tp.load()
        same = json.dumps(current, sort_keys=True) == json.dumps(tp.ordered(patches), sort_keys=True)
        print("terrain-patches.json: current" if same else "terrain-patches.json: STALE — run author_terrain_patches")
        return 0 if same else 1
    tp.save(patches)
    print(f"terrain-patches.json: {len(patches)} patches ({sum(1 for p in patches if p['kind'] == 'poling-channel')} poling channels, "
          f"{sum(1 for p in patches if p['kind'] == 'terrain-request')} places' terrain requests)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
