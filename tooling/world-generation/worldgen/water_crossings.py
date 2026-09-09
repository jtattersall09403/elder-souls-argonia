"""Where a way crosses standing water — the measured, re-derivable list.

WHY THIS MODULE EXISTS
----------------------
Three docs carried "57 water crossings need ferries (45 lake, 12 river)" with
no script, test or committed report behind it (`git log -S "45 lake"` finds
only the docs that quote it). It is not reproducible from the shipped bake, and
its lake/river split is inverted relative to every measurement: the water
compiler's own cell counts are river-dominant (`water-meta.json`
`roadCellsDeepBy` = sea 5795 / lake 919 / river 1348). A number nobody can
re-derive is not evidence, so this module replaces it with one that anybody can
re-run in a minute.

WHAT A CROSSING IS
------------------
A contiguous run of way samples standing in NON-SEA water deeper than
`DEEP_M`, using the water compiler's own threshold and its own sea mask, over
the live bake. `spanM` is the arc length of that run along the way — the
distance the traveller must actually get across. `maxDepthM` is the deepest
sample on it. Both are measured; nothing here is inferred from a name.

Two ways that share trunk geometry (routes.json reuses the same polyline
between several route ids) produce the same crossing several times, so runs are
deduped onto a `DEDUPE_GRID_M` cell, keeping the widest, and the routes that
share it are listed in `servesRoutes`.

THE BANDS, AND WHY THEY ARE THE DECISION
----------------------------------------
Every crossing in the province is at most 1.25 m deep. Depth is therefore never
what stops a traveller — WIDTH is, and so the band is set on span:

  ford    span <  FORD_MAX_M   wade it; this is a real ford, not a defect
  span    FORD_MAX_M..FERRY_MIN_M   a deck on posts, the families the route
                                    structure compiler already ships
  ferry   span >= FERRY_MIN_M  too far to wade a trunk road; a boat, or a
                               legal reason a boat is the only lawful way

`FERRY_MIN_M` is a physical claim, not a taste: it is roughly the point at
which wading stops being a crossing and becomes a swim-adjacent slog with
cargo. Crossings that clear it are then checked against the catalogue for a
causal reason before any of them becomes a ferry — see
`world/sources/routes/ferry-crossings.json`, which is authored, not generated.

RUNNING
-------
    python3 -m worldgen.water_crossings            # writes both outputs
    python3 -m worldgen.water_crossings --check    # re-derive and diff

Needs the asset vault (it recomputes the water pass in memory). Skips with a
clear message where the vault is absent, like the other slow measurements.
Nothing here writes terrain, settlements or route structures.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
CATALOGUE = REPO_ROOT / "world" / "sources" / "catalogue"
OUT_JSON = REPO_ROOT / "world" / "sources" / "routes" / "water-crossings.json"
OUT_MD = REPO_ROOT / "world" / "sources" / "sites" / "water-crossings.md"

SCHEMA_VERSION = 1

#: The water compiler's own "deep enough to matter" threshold
#: (`compile_water.compute`, `roadCellsDeepInWater`). Kept identical so the
#: crossing list and the cell statistics can never disagree about what is wet.
DEEP_M = 0.3
#: Samples per macro pixel when densifying a way's polyline, matching
#: `standing_water.placement_cells`.
SAMPLES_PER_PX = 6
#: Runs whose centres fall in the same cell, of the same water class, are one
#: crossing. 30 m is under the shortest gap between two genuinely separate
#: crossings measured on the current bake and over the sampling jitter.
DEDUPE_GRID_M = 30.0

FORD_MAX_M = 20.0
FERRY_MIN_M = 70.0


def band(span_m: float) -> str:
    if span_m >= FERRY_MIN_M:
        return "ferry"
    if span_m >= FORD_MAX_M:
        return "span"
    return "ford"


def _live_water():
    """Recompute the water pass in memory. Reads only; writes nothing."""
    from . import channels as ch
    from . import compile_water as cw
    from . import standing_water as sw

    refined = np.load(cw.DEFAULT_HEIGHTS)
    npz = np.load(cw.DEFAULT_HEIGHTS.parent.parent / "hydrology-pass1.npz")
    sol = ch.ChannelSolution.load(cw.DEFAULT_HEIGHTS.parent / cw.CHANNELS_FILE)
    placement = sw.load_placement(cw.DEFAULT_HEIGHTS.parent / "placement-at-carve.npz")
    r = cw.compute(refined, npz, sol, placement=placement, log=lambda *a, **k: None)
    return refined, r["W"], r["wet"], r["bodies"].body, r["bodies"].sea


def _places():
    """(name, id, x, z) for every catalogued place with a plotted position."""
    out = []
    for f in sorted(CATALOGUE.glob("places-*.json")):
        for pl in json.loads(f.read_text(encoding="utf-8")).get("places", []):
            pos = pl.get("positionM")
            if isinstance(pos, list) and len(pos) == 2:
                out.append((pl.get("name") or pl["id"], pl["id"], float(pos[0]), float(pos[1])))
    return out


def _densify(way: dict) -> list[tuple[float, float]]:
    macro = RAW_M * 3
    pts: list[tuple[float, float]] = []
    px = way.get("px", [])
    for (x0, y0), (x1, y1) in zip(px, px[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) * SAMPLES_PER_PX + 2
        for t in np.linspace(0.0, 1.0, n):
            pts.append(((x0 + (x1 - x0) * t) * macro, (y0 + (y1 - y0) * t) * macro))
    return pts


def derive() -> list[dict]:
    """Every deduped crossing on the live bake, widest first."""
    ground, W, wet, body, sea = _live_water()
    depth = W - ground
    h, w = ground.shape
    places = _places()
    pa = np.array([[p[2], p[3]] for p in places]) if places else None

    runs: list[dict] = []
    for fname in ("routes.json", "routes-minor.json"):
        doc = json.loads((PROVINCE / fname).read_text(encoding="utf-8"))
        ways = list(doc.get("routes") or []) + list(doc.get("tracks") or [])
        for way in ways:
            if way.get("kind") == "boardwalk":
                continue
            run = None
            for xm, zm in _densify(way):
                iy = min(max(int(round(zm / RAW_M)), 0), h - 1)
                ix = min(max(int(round(xm / RAW_M)), 0), w - 1)
                d = float(depth[iy, ix])
                if bool(wet[iy, ix]) and d > DEEP_M and not bool(sea[iy, ix]):
                    kind = "lake" if body[iy, ix] > 0 else "river"
                    if run is None:
                        run = {"way": way, "file": fname, "kind": kind, "pts": [], "dep": []}
                    run["pts"].append((xm, zm))
                    run["dep"].append(d)
                    if kind == "lake":
                        run["kind"] = "lake"
                elif run is not None:
                    runs.append(run)
                    run = None
            if run is not None:
                runs.append(run)

    rows: list[dict] = []
    for r in runs:
        pts = np.array(r["pts"])
        arc = float(np.sum(np.hypot(*np.diff(pts, axis=0).T))) if len(pts) > 1 else 0.0
        x, z = float(pts[:, 0].mean()), float(pts[:, 1].mean())
        near_name, near_id, near_m = "", None, None
        if pa is not None:
            k = int(np.argmin(np.hypot(pa[:, 0] - x, pa[:, 1] - z)))
            near_name, near_id = places[k][0], places[k][1]
            near_m = round(float(np.hypot(pa[k, 0] - x, pa[k, 1] - z)), 1)
        way = r["way"]
        rows.append({
            "wayId": way.get("id"),
            "wayName": way.get("name"),
            "wayClass": way.get("class") or way.get("kind"),
            "network": "major" if r["file"] == "routes.json" else "minor",
            "water": r["kind"],
            "positionM": [round(x, 1), round(z, 1)],
            "spanM": round(arc, 1),
            "maxDepthM": round(float(max(r["dep"])), 2),
            "nearestPlaceId": near_id,
            "nearestPlaceName": near_name,
            "nearestPlaceM": near_m,
        })

    rows.sort(key=lambda r: (-r["spanM"], r["wayId"] or ""))
    out: list[dict] = []
    seen: dict[tuple, dict] = {}
    for r in rows:
        cell = (int(r["positionM"][0] // DEDUPE_GRID_M),
                int(r["positionM"][1] // DEDUPE_GRID_M), r["water"], r["network"])
        if cell in seen:
            other = seen[cell]
            if r["wayId"] not in other["servesRoutes"]:
                other["servesRoutes"].append(r["wayId"])
            continue
        r = dict(r)
        r["servesRoutes"] = [r.pop("wayId")]
        r["band"] = band(r["spanM"])
        seen[cell] = r
        out.append(r)
    for i, r in enumerate(out, 1):
        r["id"] = f"crossing.{r['network']}.{i:03d}"
    return out


def document(rows: list[dict]) -> dict:
    major = [r for r in rows if r["network"] == "major"]
    minor = [r for r in rows if r["network"] == "minor"]

    def tally(rs):
        return {b: sum(1 for r in rs if r["band"] == b) for b in ("ferry", "span", "ford")}

    return {
        "_": ("Every place a way stands in non-sea water deeper than "
              f"{DEEP_M} m, measured over the live water bake. Generated by "
              "`python3 -m worldgen.water_crossings` — never hand-edited. The "
              "band is set on SPAN, because no crossing in the province is "
              "deeper than the deepest row here and depth therefore never "
              "decides anything. Which of the `ferry`-band crossings actually "
              "becomes a ferry is authored in "
              "`world/sources/routes/ferry-crossings.json`, against a causal "
              "reason, not against this file."),
        "schemaVersion": SCHEMA_VERSION,
        "thresholds": {"deepM": DEEP_M, "fordMaxM": FORD_MAX_M,
                       "ferryMinM": FERRY_MIN_M, "dedupeGridM": DEDUPE_GRID_M},
        "counts": {
            "major": {"total": len(major), "lake": sum(1 for r in major if r["water"] == "lake"),
                      "river": sum(1 for r in major if r["water"] == "river"), "bands": tally(major)},
            "minor": {"total": len(minor), "lake": sum(1 for r in minor if r["water"] == "lake"),
                      "river": sum(1 for r in minor if r["water"] == "river"), "bands": tally(minor)},
        },
        "deepestM": max((r["maxDepthM"] for r in rows), default=0.0),
        "widestM": max((r["spanM"] for r in rows), default=0.0),
        "crossings": rows,
    }


def markdown(doc: dict) -> str:
    c = doc["counts"]
    lines = [
        "# Water crossings — where a way stands in water",
        "",
        "Generated by `python3 -m worldgen.water_crossings`; the data is",
        "`world/sources/routes/water-crossings.json`. Do not hand-edit either.",
        "",
        f"- **{c['major']['total']} on the major network** "
        f"({c['major']['river']} river, {c['major']['lake']} lake): "
        f"{c['major']['bands']['ferry']} ferry-band, {c['major']['bands']['span']} span-band, "
        f"{c['major']['bands']['ford']} ford-band.",
        f"- **{c['minor']['total']} on tracks and footpaths** "
        f"({c['minor']['river']} river, {c['minor']['lake']} lake): "
        f"{c['minor']['bands']['ferry']} ferry-band, {c['minor']['bands']['span']} span-band, "
        f"{c['minor']['bands']['ford']} ford-band.",
        f"- Deepest crossing anywhere: **{doc['deepestM']} m**. Widest: "
        f"**{doc['widestM']} m**. Nothing in the province is too deep to wade, "
        "so span is what decides a crossing, not depth.",
        "",
        "## Major network, widest first",
        "",
        "| id | water | span m | depth m | band | position | nearest place | m |",
        "|---|---|---:|---:|---|---|---|---:|",
    ]
    for r in doc["crossings"]:
        if r["network"] != "major":
            continue
        x, z = r["positionM"]
        lines.append(f"| `{r['id']}` | {r['water']} | {r['spanM']} | {r['maxDepthM']} | "
                     f"{r['band']} | {x}, {z} | {r['nearestPlaceName']} | {r['nearestPlaceM']} |")
    lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="re-derive and fail if the committed file disagrees")
    a = ap.parse_args(argv)
    try:
        rows = derive()
    except FileNotFoundError as e:
        print(f"water_crossings: skipped, the asset vault is absent ({e})")
        return
    doc = document(rows)
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    if a.check:
        have = OUT_JSON.read_text(encoding="utf-8") if OUT_JSON.exists() else ""
        if have != text:
            raise SystemExit("water-crossings.json is stale — re-run "
                             "`python3 -m worldgen.water_crossings`")
        print(f"water_crossings: {len(rows)} crossings, up to date")
        return
    OUT_JSON.write_text(text, encoding="utf-8")
    OUT_MD.write_text(markdown(doc), encoding="utf-8")
    print(f"water_crossings: {len(rows)} crossings -> {OUT_JSON}")


if __name__ == "__main__":
    main()
