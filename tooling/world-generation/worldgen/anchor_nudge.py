"""Phase 11 Part 4 step 2 — anchor nudge proposals (owner feedback 2026-09-03).

    cd tooling/world-generation
    python3 -m worldgen.anchor_nudge            # writes world/sources/sites/anchor-nudge-proposals.md

The nine settlement anchors were approved as APPROXIMATE positions with a
`toleranceUV` circle each. The owner is happy for a city to shift inside its
circle if the ground is better (Blackrose stays centred on its lake island).
This scans each circle on a fixed lattice and scores every candidate on what a
city of that role needs:

  * buildable ground in the footprint (land, slope < 8°, above the wet-season
    flood line) — weight by magnitude
  * water frontage: ports want the coast/estuary within reach of the centre,
    river cities want a river band, everything wants fresh water nearby
  * stays inside its own culture territory and off danger ≥ 4 ground
  * the plain cost of moving: every metre from the approved pin is a small
    penalty, so a nudge only wins when the ground is really better

It never moves anything. It writes a table per anchor (current pin vs the best
three alternatives, with the measured facts) for the owner to rule on. Applying
a nudge is an edit to settlement-anchors.json followed by the society and
terrain rebuild chain (see the report footer).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .regions import REGION_CLASSES
from .site_fields import ProvinceSurvey

REPO_ROOT = Path(__file__).resolve().parents[3]
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
REPORT_MD = REPO_ROOT / "world" / "sources" / "sites" / "anchor-nudge-proposals.md"

STEP_M = 30.0
FOOTPRINT_M = {"major": 320.0, "secondary": 220.0}
BUILDABLE_SLOPE_DEG = 8.0
FIXED = {"blackrose"}               # owner: stays centred on its island
# what each city wants from water (owner-approved roles in the anchors file)
WATER_NEED = {
    "stormhold": "river", "thorn": "river-or-coast", "gideon": "river",
    "helstrom": "marsh", "archon": "coast", "blackrose": "lake",
    "lilmoth": "coast", "soulrest": "coast", "alten-corimont": "river",
}


def _disc_mask(shape: tuple[int, int], row: int, col: int, r_px: float) -> np.ndarray:
    rr, cc = np.ogrid[: shape[0], : shape[1]]
    return (rr - row) ** 2 + (cc - col) ** 2 <= r_px * r_px


def footprint_facts(s: ProvinceSurvey, x: float, z: float, radius_m: float) -> dict:
    row, col = s.grid_px(x, z)
    r_px = radius_m / s.grid_px_m
    m = _disc_mask(s.region_grid.shape, row, col, r_px)
    land = s.land[m]
    slope = s.slope_grid[m]
    danger = s.danger[m]
    n = max(1, int(m.sum()))
    buildable = float(((land) & (slope < BUILDABLE_SLOPE_DEG)).sum()) / n
    return {
        "buildable": round(buildable, 3),
        "landFraction": round(float(land.sum()) / n, 3),
        "meanSlopeDeg": round(float(slope[land].mean()) if land.any() else 90.0, 2),
        "dangerMax": int(danger.max()),
        "dangerMean": round(float(danger.mean()), 2),
    }


def water_fit(need: str, sm: dict) -> float:
    h = sm["hydrology"]
    coast, shore, river = h["coastDistanceM"], h["shoreDistanceM"], h["riverBand"]
    if need == "coast":
        return 1.0 if coast <= 250 else 0.5 if coast <= 500 else 0.0
    if need == "lake":
        return 1.0 if h["onLake"] or shore <= 120 else 0.0
    if need == "river":
        return 1.0 if river >= 2 or shore <= 90 else 0.5 if shore <= 250 else 0.0
    if need == "river-or-coast":
        return max(1.0 if coast <= 300 else 0.0, 1.0 if river >= 2 or shore <= 90 else 0.5 if shore <= 250 else 0.0)
    if need == "marsh":
        return 1.0 if shore <= 200 else 0.5
    return 0.5


def score_site(a: dict, s: ProvinceSurvey, x: float, z: float, home_zone: str | None,
               dx_m: float) -> tuple[float, dict]:
    sm = s.sample(x, z)
    fp = footprint_facts(s, x, z, FOOTPRINT_M[a["rank"]])
    parts = {
        "buildable": 2.0 * fp["buildable"],
        "water": 1.0 * water_fit(WATER_NEED.get(a["id"], "marsh"), sm),
        "danger": -0.6 * max(0, fp["dangerMax"] - 3) - 0.3 * max(0.0, fp["dangerMean"] - 2.5),
        "zone": 0.0 if (home_zone is None or sm["cultureTerritory"] == home_zone) else -1.5,
        "flood": -0.5 if sm["hydrology"]["wetSeasonInundated"] else 0.0,
        "onWater": -3.0 if sm["hydrology"]["waterDepthM"] > 0.3 else 0.0,
        "move": -0.35 * (dx_m / 300.0),
    }
    facts = {
        "x": round(x, 1), "z": round(z, 1), "moveM": round(dx_m, 0),
        "buildablePct": round(100 * fp["buildable"]), "landPct": round(100 * fp["landFraction"]),
        "meanSlope": fp["meanSlopeDeg"], "dangerMax": fp["dangerMax"],
        "coastM": sm["hydrology"]["coastDistanceM"], "shoreM": sm["hydrology"]["shoreDistanceM"],
        "riverBand": sm["hydrology"]["riverBand"], "region": sm["regionName"],
        "zone": sm["cultureTerritory"], "elev": sm["elevationM"],
    }
    return sum(parts.values()), {**facts, "parts": {k: round(v, 2) for k, v in parts.items()}}


def scan(s: ProvinceSurvey | None = None) -> dict:
    s = s or ProvinceSurvey()
    data = json.loads(ANCHORS_PATH.read_text())
    out = {}
    for a in data["anchors"]:
        ax, az = s.uv_to_m(a["u"], a["v"])
        home_zone = s.sample(ax, az)["cultureTerritory"]
        cur_score, cur = score_site(a, s, ax, az, home_zone, 0.0)
        entry = {"current": {"score": round(cur_score, 2), **cur}, "alternatives": [], "fixed": a["id"] in FIXED}
        if a["id"] not in FIXED:
            tol_m = a.get("toleranceUV", 0.0) * s.extent_m
            cands = []
            n = int(tol_m // STEP_M)
            for i in range(-n, n + 1):
                for j in range(-n, n + 1):
                    dx, dz = i * STEP_M, j * STEP_M
                    d = math.hypot(dx, dz)
                    if d == 0 or d > tol_m:
                        continue
                    x, z = ax + dx, az + dz
                    if not (0 < x < s.extent_m and 0 < z < s.extent_m):
                        continue
                    sc, facts = score_site(a, s, x, z, home_zone, d)
                    cands.append((sc, facts))
            cands.sort(key=lambda t: (-t[0], t[1]["x"], t[1]["z"]))
            # keep the best three that are at least 150 m from each other
            kept: list[tuple[float, dict]] = []
            for sc, f in cands:
                if all(math.hypot(f["x"] - k["x"], f["z"] - k["z"]) >= 150.0 for _, k in kept):
                    kept.append((sc, f))
                if len(kept) == 3:
                    break
            entry["alternatives"] = [{"score": round(sc, 2), **f} for sc, f in kept]
            entry["toleranceM"] = round(tol_m)
        out[a["id"]] = entry
    return out


def digest(res: dict) -> str:
    lines = ["# Anchor nudge proposals (Phase 11 Part 4 step 2)", "",
             "Generated by `python3 -m worldgen.anchor_nudge`. Scores: higher is better; the",
             "`move` term charges 0.35 per 300 m so a nudge must earn its keep. Buildable = land",
             f"with slope < {BUILDABLE_SLOPE_DEG:.0f}° in the footprint disc. Nothing is moved by this tool.", ""]
    cols = ["score", "moveM", "buildablePct", "landPct", "meanSlope", "dangerMax", "coastM", "shoreM", "riverBand", "region", "zone", "elev"]
    for aid, e in res.items():
        lines.append(f"## {aid}" + ("  (fixed by owner ruling)" if e["fixed"] else f"  (tolerance {e['toleranceM']} m)"))
        lines.append("")
        lines.append("| which | " + " | ".join(cols) + " |")
        lines.append("|---|" + "---|" * len(cols))
        lines.append("| current | " + " | ".join(str(e["current"].get(c, "")) for c in cols) + " |")
        for i, alt in enumerate(e["alternatives"], 1):
            gain = alt["score"] - e["current"]["score"]
            lines.append(f"| alt {i} (+{gain:.2f}) | " + " | ".join(str(alt.get(c, "")) for c in cols) + " |")
        best = e["alternatives"][0] if e["alternatives"] else None
        if best and best["score"] - e["current"]["score"] >= 0.5:
            lines.append("")
            lines.append(f"**Worth proposing**: alt 1 gains {best['score'] - e['current']['score']:.2f} "
                         f"({best['moveM']:.0f} m away): buildable {e['current']['buildablePct']}% → {best['buildablePct']}%, "
                         f"coast {e['current']['coastM']} → {best['coastM']} m, danger max {e['current']['dangerMax']} → {best['dangerMax']}.")
        lines.append("")
    lines += ["## If a nudge is applied", "",
              "Edit `world/sources/anchors/settlement-anchors.json` (u, v), then re-run",
              "`compile_society` (roads, lanes, danger, cultures) → `refine_province` (roads",
              "are rasterised into the land cover) → `compile_chunks` → `export_web_chunks` →",
              "`compile_water` → `rebake_landcover` → `compile_scatter` for any exemplar chunk",
              "the road moved through → `macro_plot` → `compile_minor_routes` → `export_places`.",
              "Quest provisions that name the city's neighbours (docs/quests/20) are unaffected;",
              "the root-transit stations (anchors/root-transit.json) are positioned relative to",
              "Helstrom and should be re-checked if Helstrom moves.", ""]
    return "\n".join(lines)


def main() -> None:
    res = scan()
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text(digest(res), encoding="utf-8")
    for aid, e in res.items():
        best = e["alternatives"][0] if e["alternatives"] else None
        print(f"{aid:16s} current {e['current']['score']:5.2f} buildable {e['current']['buildablePct']:3d}%"
              + (f"  best alt {best['score']:5.2f} at {best['moveM']:.0f} m buildable {best['buildablePct']}%" if best else ""))
    print(f"wrote {REPORT_MD}")


if __name__ == "__main__":
    main()
