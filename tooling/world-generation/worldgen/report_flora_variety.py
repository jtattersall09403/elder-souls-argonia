"""Regional flora variety report — how much each region class's species set
overlaps the others (decision 0036, 2026-09-08 record).

    python3 -m worldgen.report_flora_variety                 # current palettes
    python3 -m worldgen.report_flora_variety --git HEAD~1    # a committed version

Two views, both weighted by authored instances/ha: TREE roles only (canopy,
emergent, giants, waterline, gallery, drowned, fungal-giant) and everything
that is not an aquatic belt or a rock. "Overlap with B" is the share of A's
weight sitting in species B also uses — presence-weighted, so two regions
that use one shrub in common at low weight still register. Read it with the
"dominant tree" column: a region is distinct when its lead tree is its own.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import defaultdict
from pathlib import Path

from .regions import REGION_CLASSES

REPO_ROOT = Path(__file__).resolve().parents[3]
PALETTES = REPO_ROOT / "world/sources/flora/palettes.json"
TREE_ROLES = ("canopy", "emergent", "landmark-giant", "waterline-tree",
              "basin-mangrove", "gallery", "drowned-tree", "drowned-tree-dry",
              "fungal-giant")
NON_WOODY = ("aquatic-reeds", "aquatic-lilypads", "aquatic-kelp", "rock",
             "cliff-dressing")


def weights(data: dict, keep) -> dict[int, dict[str, float]]:
    out: dict[int, dict[str, float]] = {}
    for region, entry in data["byRegionClass"].items():
        w: dict[str, float] = defaultdict(float)
        for layer in entry["layers"]:
            if keep(layer["role"]):
                w[layer["species"]] += layer["instances_per_hectare"]
        out[int(region)] = dict(w)
    return out


def overlap(a: dict[str, float], b: dict[str, float]) -> float:
    total = sum(a.values()) or 1.0
    return sum(c for s, c in a.items() if s in b) / total


def report(data: dict) -> str:
    trees = weights(data, lambda r: r in TREE_ROLES)
    woody = weights(data, lambda r: r not in NON_WOODY)
    regions = sorted(trees)
    lines = ["| rg | region | tree spp | woody spp | dominant tree (share) | "
             "max tree overlap | max woody overlap | woody pairs >0.5 |",
             "|---|---|---|---|---|---|---|---|"]
    for a in regions:
        tw, ww = trees[a], woody[a]
        tt = sum(tw.values()) or 1.0
        st = {b: overlap(tw, trees[b]) for b in regions if b != a}
        sw = {b: overlap(ww, woody[b]) for b in regions if b != a}
        mt, mw = max(st, key=st.get), max(sw, key=sw.get)
        top = max(tw.items(), key=lambda kv: kv[1]) if tw else None
        dom = f"`{top[0].split('/')[-1]}` ({top[1] / tt:.2f})" if top else "—"
        pairs = ", ".join(str(b) for b in regions if b != a and sw[b] > 0.5)
        lines.append(f"| {a} | {REGION_CLASSES[a][0]} | {len(tw)} | {len(ww)} | "
                     f"{dom} | {st[mt]:.2f} ({mt}) | {sw[mw]:.2f} ({mw}) | "
                     f"{pairs or '—'} |")
    every = set.intersection(*[set(w) for w in woody.values()])
    distinct = set().union(*woody.values())
    lines.append(f"\nSpecies in every region: {sorted(every) or 'none'}; "
                 f"distinct woody+plant species: {len(distinct)}.")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--git", default=None,
                    help="read palettes.json from this git revision instead")
    args = ap.parse_args()
    if args.git:
        rel = PALETTES.relative_to(REPO_ROOT)
        text = subprocess.check_output(["git", "show", f"{args.git}:{rel}"],
                                       cwd=REPO_ROOT, text=True)
    else:
        text = PALETTES.read_text()
    print(report(json.loads(text)))


if __name__ == "__main__":
    main()
