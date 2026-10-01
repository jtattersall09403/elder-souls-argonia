"""Mine what vanilla Skyrim stands beside its roads (16k type 10; road-dressing.md § Proving it).

Reads the per-instance dump of `worldgen.mine_placement` over Skyrim.esm's
Tamriel worldspace (`--dump-instances`), finds the road meshes
(`landscape/roads/*`, the stone-flagged hold roads), and measures every other
reference whose distance to the nearest road chunk's edge is 0 to 12 m:

* families per km of road (rocks, walls kept and tumbled, signposts, shrines,
  cairns, campfires, carts, lights);
* how far off the road edge each family stands;
* how they clump (single link at 6 m);
* where they stand: within 300 m of a settlement building or not, at a bend
  chunk, at a three-way junction chunk;
* the wall kept-to-tumbled ratio near settlements and away from them.

Expectations, written before the first run (road-dressing.md, vanilla as
walked): E1 rocks are the commonest made-or-natural verge family after
plants and trees; E2 most wall pieces stand within 300 m of a settlement
building; E3 most signposts stand within 30 m of a junction chunk; E4 the
verge dressing per chunk is higher at bends than on straights; E5 most
dressing stands 2 to 6 m off the edge. `--halves` runs the west half (the
sample) and the east half (the fresh batch) separately so a rule is only
taken when both halves agree.

Usage (worldgen):
  python3 -m worldgen.mine_placement --plugin <Skyrim.esm> --world Tamriel \\
      --out output/roadside-mine/tamriel-profile.json \\
      --dump-instances output/roadside-mine/tamriel-instances.jsonl
  python3 -m worldgen.mine_roadside --instances output/roadside-mine/tamriel-instances.jsonl \\
      --out ../../world/sources/placement/vanilla-roadside-dressing.json [--halves]
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

BAND_M = 12.0
CLUMP_LINK_M = 6.0
SETTLEMENT_M = 300.0
JUNCTION_M = 30.0

#: (family, test) in order; the first match wins. Paths are vanilla mesh paths.
FAMILIES: list[tuple[str, tuple[str, ...]]] = [
    ("signpost", ("clutter/signage/roadsigns/",)),
    ("shrine", ("clutter/shrines/",)),
    ("cairn", ("burialcairn", "rockcairn", "cairn")),
    ("campfire", ("woodfires/campfire", "woodfires/firepit")),
    ("cart", ("clutter/carts/", "wagon")),
    ("light", ("lantern", "lamppost", "lightpost", "torchsconce")),
    ("wall-kept", ("farmhouse/stonewall/stonewall0",)),
    ("wall-end", ("farmhouse/stonewall/stonewallend",)),
    ("wall-tumbled", ("rubble", "impextwall", "ruin")),
    ("fence", ("fence",)),
    ("rock", ("landscape/rocks/", "landscape/tundra/rocktundra")),
    ("tree", ("landscape/trees/",)),
    ("plant", ("landscape/plants/", "plants/", "landscape/grass/")),
    ("building", ("architecture/",)),
]
DRESSING = ("signpost", "shrine", "cairn", "campfire", "cart", "light",
            "wall-kept", "wall-end", "wall-tumbled", "fence", "rock")


def family(species: str) -> str:
    s = species.lower()
    for name, keys in FAMILIES:
        if any(k in s for k in keys):
            return name
    return "other"


def is_settlement_building(inst: dict) -> bool:
    s = inst["species"].lower()
    size = inst.get("size_m") or [0, 0, 0]
    return (s.startswith("architecture/") and "fence" not in s and "stonewall" not in s
            and "walkway" not in s and max(size[:2]) >= 6.0)


def _pct(vals, pts=(5, 25, 50, 75, 95)) -> dict:
    if not vals:
        return {}
    a = np.asarray(vals, dtype=np.float64)
    return {f"p{p}": round(float(np.percentile(a, p)), 2) for p in pts}


def _clumps(points: np.ndarray, link: float) -> list[int]:
    """Single-link clump sizes."""
    if len(points) == 0:
        return []
    tree = cKDTree(points)
    parent = list(range(len(points)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i, j in tree.query_pairs(link):
        a, b = find(i), find(j)
        if a != b:
            parent[a] = b
    sizes = Counter(find(i) for i in range(len(points)))
    return list(sizes.values())


def measure(road: list[dict], other: list[dict], buildings: np.ndarray) -> dict:
    R = np.array([[r["x"], r["y"]] for r in road], dtype=np.float64)
    half = np.array([max((r.get("size_m") or [14, 14])[:2]) / 2 for r in road])
    length_km = float(sum(max((r.get("size_m") or [14, 14])[:2]) for r in road)) / 1000.0
    kind = np.array([("junction" if "3way" in r["species"] or "4way" in r["species"]
                      else "bend" if "curve" in r["species"] else "straight") for r in road])
    tree = cKDTree(R)
    O = np.array([[o["x"], o["y"]] for o in other], dtype=np.float64)
    k = min(4, len(R))
    dist, idx = tree.query(O, k=k)
    dist = dist.reshape(len(O), k)
    idx = idx.reshape(len(O), k)
    edge_all = dist - half[idx]
    best = edge_all.argmin(axis=1)
    edge = edge_all[np.arange(len(O)), best]
    chunk = idx[np.arange(len(O)), best]
    near = (edge > 0) & (edge <= BAND_M)
    btree = cKDTree(buildings) if len(buildings) else None
    junctions = R[kind == "junction"]
    jtree = cKDTree(junctions) if len(junctions) else None

    fam_rows: dict[str, dict] = defaultdict(lambda: {"count": 0, "offsetM": [], "nearSettlement": 0,
                                                      "atBend": 0, "atJunction": 0, "species": Counter(),
                                                      "settlementM": []})
    pts_by_fam: dict[str, list] = defaultdict(list)
    wall_near = Counter()
    for i in np.nonzero(near)[0]:
        f = family(other[i]["species"])
        row = fam_rows[f]
        row["count"] += 1
        row["offsetM"].append(float(edge[i]))
        row["species"][other[i]["species"]] += 1
        bd = float(btree.query(O[i])[0]) if btree is not None else 1e9
        row["settlementM"].append(min(bd, 5000.0))
        ns = bd <= SETTLEMENT_M
        row["nearSettlement"] += ns
        ck = kind[chunk[i]]
        row["atBend"] += ck == "bend"
        jd = jtree.query(O[i])[0] if jtree is not None else 1e9
        row["atJunction"] += jd <= JUNCTION_M
        pts_by_fam[f].append(O[i])
        if f in ("wall-kept", "wall-end", "wall-tumbled"):
            wall_near[(f, "near" if ns else "far")] += 1
    chunk_counts = Counter(kind.tolist())
    dressing_by_chunk = Counter()
    for i in np.nonzero(near)[0]:
        if family(other[i]["species"]) in DRESSING:
            dressing_by_chunk[kind[chunk[i]]] += 1
    out_fams = {}
    for f, row in sorted(fam_rows.items(), key=lambda kv: -kv[1]["count"]):
        n = row["count"]
        sizes = _clumps(np.array(pts_by_fam[f]), CLUMP_LINK_M)
        out_fams[f] = {
            "count": n, "perKm": round(n / length_km, 2) if length_km else None,
            "offsetM": _pct(row["offsetM"]),
            "nearSettlementShare": round(row["nearSettlement"] / n, 3),
            "toSettlementBuildingM": _pct(row["settlementM"]),
            "atBendShare": round(row["atBend"] / n, 3),
            "atJunctionShare": round(row["atJunction"] / n, 3),
            "clumpSize": _pct(sizes), "clumps": len(sizes),
            "topSpecies": row["species"].most_common(6),
        }
    return {
        "roadChunks": len(road), "roadKmApprox": round(length_km, 2),
        "chunkKinds": dict(chunk_counts),
        "dressingPerChunk": {k: round(dressing_by_chunk[k] / chunk_counts[k], 3)
                             for k in chunk_counts if chunk_counts[k]},
        "families": out_fams,
        "walls": {f"{a}/{b}": n for (a, b), n in sorted(wall_near.items())},
    }


def expectations(m: dict) -> dict:
    f = m["families"]

    def g(name, key, default=0.0):
        return (f.get(name) or {}).get(key, default) or default
    dressing = [n for n in DRESSING if n in f]
    off = [f[n]["offsetM"].get("p50", 0) for n in dressing if f[n]["offsetM"]]
    walls = sum(g(n, "count") for n in ("wall-kept", "wall-end"))
    walls_near = sum(g(n, "count") * g(n, "nearSettlementShare") for n in ("wall-kept", "wall-end"))
    return {
        "E1 rocks the commonest dressing family": max(dressing, key=lambda n: f[n]["count"]) == "rock" if dressing else False,
        "E2 most kept walls within 300 m of a settlement": walls > 0 and walls_near / walls > 0.5,
        "E3 most signposts within 30 m of a junction chunk": g("signpost", "atJunctionShare") > 0.5,
        "E4 more dressing per chunk at bends than straights":
            m["dressingPerChunk"].get("bend", 0) > m["dressingPerChunk"].get("straight", 0),
        "E5 dressing median offset 2-6 m": bool(off) and 2.0 <= float(np.median(off)) <= 6.0,
    }


def run(instances_path: Path, halves: bool) -> dict:
    road, other = [], []
    with instances_path.open() as fh:
        for line in fh:
            d = json.loads(line)
            if d["species"].startswith("landscape/roads/"):
                road.append(d)
            elif d["species"].startswith(("markers/", "critters/")) or "marker" in d["species"]:
                continue
            else:
                other.append(d)
    buildings = np.array([[o["x"], o["y"]] for o in other if is_settlement_building(o)])
    doc = {"all": measure(road, other, buildings)}
    doc["all"]["expectations"] = expectations(doc["all"])
    if halves:
        for name, keep in (("west-sample", lambda d: d["x"] < 0), ("east-fresh", lambda d: d["x"] >= 0)):
            r = [d for d in road if keep(d)]
            m = measure(r, other, buildings)
            m["expectations"] = expectations(m)
            doc[name] = m
    return doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m worldgen.mine_roadside", description=__doc__)
    ap.add_argument("--instances", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--halves", action="store_true")
    a = ap.parse_args(argv)
    doc = {"schemaVersion": 1,
           "_": ("Vanilla Skyrim roadside dressing: every Skyrim.esm Tamriel reference 0-12 m off a "
                 "landscape/roads chunk's edge, by family. Generated by worldgen.mine_roadside from "
                 "worldgen.mine_placement's instance dump; never hand-edited. Read by "
                 "docs/research/placement-settlements/road-dressing.md (the rule set)."),
           "source": {"plugin": "Skyrim.esm", "worldspace": "Tamriel", "bandM": BAND_M,
                      "clumpLinkM": CLUMP_LINK_M, "settlementM": SETTLEMENT_M, "junctionM": JUNCTION_M},
           **run(Path(a.instances), a.halves)}
    Path(a.out).write_text(json.dumps(doc, indent=1, default=lambda o: o if not isinstance(o, np.generic) else o.item()) + "\n")
    print(json.dumps({k: v.get("expectations") for k, v in doc.items() if isinstance(v, dict) and "expectations" in v}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
