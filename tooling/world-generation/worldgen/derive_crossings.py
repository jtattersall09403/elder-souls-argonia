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
A contiguous run of way samples standing in NON-SEA water on the record:
any flowing reach or standing body the way meets, and a marsh body where the
compiled depth is over `DEEP_M` (see `_crossing_cell`). The entity under the
sample comes from `ShippedWater.water_at`, its kind and id come from the
signed hydrology graph, and only the depth is measured, on the compiled
surface raster. Major roads only: the minor network is 16g's. Nothing here re-runs the water compile or decides "river",
"lake" or "sea" for itself. `spanM` is the arc length of that run along the way — the
distance the traveller must actually get across. `maxDepthM` is the deepest
sample on it. Both are measured; nothing here is inferred from a name.

Two ways that share trunk geometry (routes.json reuses the same polyline
between several route ids) produce the same crossing several times, so runs are
deduped onto a `DEDUPE_GRID_M` cell, keeping the widest, and the routes that
share it are listed in `servesRoutes`.

THE BANDS: WIDTH AND DEPTH BOTH DECIDE
--------------------------------------
A traveller is stopped by how far the water reaches AND by how deep it is, and
the record now carries lake crossings 18 m deep, so both are read:

  ford    span < FORD_MAX_M and depth <= FORD_MAX_DEPTH_M — wade it; this is a
          real ford, not a defect
  span    anything narrower than FERRY_MIN_M that is too deep to wade, or wide
          enough that wading it is a slog: a deck on posts, the families the
          route structure compiler already ships
  ferry   span >= FERRY_MIN_M  too far to wade a trunk road; a boat, or a
                               legal reason a boat is the only lawful way

`FORD_MAX_DEPTH_M` is the small-draft hull depth from `dock_spec`, the same
number the docks promise their water: at that depth a laden traveller is
swimming, not wading, and a hull floats where a cart drowns.

`FERRY_MIN_M` is a physical claim, not a taste: it is roughly the point at
which wading stops being a crossing and becomes a swim-adjacent slog with
cargo. Crossings that clear it are then checked against the catalogue for a
causal reason before any of them becomes a ferry — see
`world/sources/routes/travel-services.json`, which is authored, not generated.

RUNNING
-------
    python3 -m worldgen.derive_crossings            # writes both outputs
    python3 -m worldgen.derive_crossings --check    # re-derive and diff
    python3 -m worldgen.derive_crossings --dry-run  # print the summary only

Reads the published water bundle and the published routes; skips with a clear
message where they are absent. Nothing here writes terrain, settlements or
route structures.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .dock_spec import HULL_CLASS_DEPTH_M
from .scale import RAW_M
from .water_report import ShippedWater

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
CATALOGUE = REPO_ROOT / "world" / "sources" / "catalogue"
OUT_JSON = REPO_ROOT / "world" / "sources" / "routes" / "water-crossings.json"
OUT_MD = REPO_ROOT / "world" / "sources" / "sites" / "water-crossings.md"

SCHEMA_VERSION = 2

#: The water compiler's own "deep enough to matter" threshold
#: (`compile_water.compute`, `roadCellsDeepInWater`). Kept identical so the
#: crossing list and the cell statistics can never disagree about what is wet.
DEEP_M = 0.3
#: Entity kinds that are a standing body a traveller must cross by boat rather
#: than a flowing reach or a waded marsh. Read from the graph's vocabulary.
LAKE_KINDS = frozenset({"ocean", "lagoon", "lake-lowland", "tarn-upland", "pond", "pool",
                        "plunge-pool"})
#: Samples per macro pixel when densifying a way's polyline, matching
#: `standing_water.placement_cells`.
SAMPLES_PER_PX = 6
#: Runs whose centres fall in the same cell, of the same water class, are one
#: crossing. 30 m is under the shortest gap between two genuinely separate
#: crossings measured on the current bake and over the sampling jitter.
DEDUPE_GRID_M = 30.0

FORD_MAX_M = 20.0
FERRY_MIN_M = 70.0
#: The deepest water a ford may stand in — the small-draft hull depth the docks
#: are dredged to (`dock_spec.HULL_CLASS_DEPTH_M`). One number, two uses: below
#: it a cart fords, above it a boat floats.
FORD_MAX_DEPTH_M = HULL_CLASS_DEPTH_M["small-draft"]


def band(span_m: float, max_depth_m: float = 0.0, water: str = "river") -> str:
    """The crossing's band, from its width, its depth and the water's kind.
    A marsh is never a ferry crossing (owner 2026-09-15): a road over deep
    marsh is carried on a boardwalk deck however long, or the router keeps
    it out of the marsh; the ferry band is for lakes and rivers."""
    if span_m < FORD_MAX_M and max_depth_m <= FORD_MAX_DEPTH_M:
        return "ford"
    if span_m < FERRY_MIN_M or water == "marsh":
        return "span"
    return "ferry"


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


def _crossing_cell(sw, rec: dict | None, depth_m: float) -> bool:
    """Is this way sample standing in water a traveller has to cross?

    A flowing reach or a standing body on the record is a crossing wherever
    the way meets it, whatever the compiled depth reads at that texel: the
    road line crosses the mapped river, so the map must show a crossing
    there (owner 2026-09-16: roads crossed streams with no crossing record
    because a narrow channel read under `DEEP_M` at one texel). A marsh
    body is an AREA the road may run through on ground that is dry most of
    the year, so there the measured depth still decides.
    """
    if rec is None or rec.get("kind") == "ocean":
        return False
    if sw.reach(rec.get("id")) is not None or rec.get("kind") in LAKE_KINDS:
        return True
    return depth_m > DEEP_M


def _label(sw, entity_id: str, kind: str) -> str:
    """river / lake / marsh, from the RECORD — never from a raster."""
    if sw.reach(entity_id) is not None:
        return "river"
    return "lake" if kind in LAKE_KINDS else "marsh"


def derive(sw=None) -> list[dict]:
    """Every deduped crossing on the shipped water record, widest first."""
    sw = sw if sw is not None else ShippedWater()
    depth = sw.signed_depth_m("base")
    mpp = sw.mpp2
    h, w = depth.shape
    places = _places()
    pa = np.array([[p[2], p[3]] for p in places]) if places else None

    runs: list[dict] = []
    # The MAJOR roads only (owner 2026-09-16): the minor lines on this ground
    # are the stale Phase 11 solve that 16g re-solves, and their crossings
    # were drawing over the map as if they were decided. 16g derives its own
    # when its tracks exist.
    for fname in ("routes.json",):
        doc = json.loads((PROVINCE / fname).read_text(encoding="utf-8"))
        ways = list(doc.get("routes") or []) + list(doc.get("tracks") or [])
        for way in ways:
            if way.get("kind") == "boardwalk":
                continue
            run = None
            prev_dry = None
            for xm, zm in _densify(way):
                rec = sw.water_at(xm, zm)
                iy = min(max(int(round(zm / mpp)), 0), h - 1)
                ix = min(max(int(round(xm / mpp)), 0), w - 1)
                d = float(depth[iy, ix])
                if _crossing_cell(sw, rec, d):
                    if run is None:
                        run = {"way": way, "file": fname, "pts": [], "dep": [], "ent": [],
                               "banks": [prev_dry if prev_dry is not None else (xm, zm), None]}
                    run["pts"].append((xm, zm))
                    run["dep"].append(d)
                    run["ent"].append((rec.get("id"), rec.get("kind")))
                else:
                    prev_dry = (xm, zm)
                    if run is not None:
                        run["banks"][1] = (xm, zm)
                        runs.append(run)
                        run = None
            if run is not None:
                run["banks"][1] = run["pts"][-1]
                runs.append(run)

    rows: list[dict] = []
    for r in runs:
        pts = np.array(r["pts"])
        arc = float(np.sum(np.hypot(*np.diff(pts, axis=0).T))) if len(pts) > 1 else 0.0
        x, z = float(pts[:, 0].mean()), float(pts[:, 1].mean())
        # The run's entity is the one most of its samples stand in.
        tally: dict[tuple, int] = {}
        for ent in r["ent"]:
            tally[ent] = tally.get(ent, 0) + 1
        (ent_id, ent_kind), _n = max(tally.items(), key=lambda kv: kv[1])
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
            "water": _label(sw, ent_id, ent_kind),
            "entityId": ent_id,
            "entityKind": ent_kind,
            "positionM": [round(x, 1), round(z, 1)],
            "banks": [[round(float(bx), 1), round(float(bz), 1)] for bx, bz in r["banks"]],
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
        r["band"] = band(r["spanM"], r["maxDepthM"], r.get("water", "river"))
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
        "_": ("Every place a MAJOR road meets a flowing reach or a standing "
              f"body on the water record, or stands in marsh deeper than {DEEP_M} m "
              "(the entity "
              "and its kind come from the signed hydrology graph; only the "
              "depth is measured). `banks` are the two DRY approach points "
              "of the run: the way sample just before it enters the water "
              "and the sample just after it leaves. Generated by "
              "`python3 -m worldgen.derive_crossings` — never hand-edited. The "
              "band is set on SPAN AND DEPTH: a ford is narrower than "
              f"{FORD_MAX_M:.0f} m and no deeper than {FORD_MAX_DEPTH_M} m, the "
              "small-draft hull depth to which the docks are dredged. Which of the "
              "`ferry`-band crossings actually "
              "becomes a ferry is authored in "
              "`world/sources/routes/travel-services.json`, against a causal "
              "reason, not against this file."),
        "schemaVersion": SCHEMA_VERSION,
        "thresholds": {"deepM": DEEP_M, "fordMaxM": FORD_MAX_M,
                       "fordMaxDepthM": FORD_MAX_DEPTH_M,
                       "ferryMinM": FERRY_MIN_M, "dedupeGridM": DEDUPE_GRID_M},
        "counts": {
            "major": {"total": len(major), "lake": sum(1 for r in major if r["water"] == "lake"),
                      "river": sum(1 for r in major if r["water"] == "river"),
                      "marsh": sum(1 for r in major if r["water"] == "marsh"), "bands": tally(major)},
            "minor": {"total": len(minor), "lake": sum(1 for r in minor if r["water"] == "lake"),
                      "river": sum(1 for r in minor if r["water"] == "river"),
                      "marsh": sum(1 for r in minor if r["water"] == "marsh"), "bands": tally(minor)},
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
        "Generated by `python3 -m worldgen.derive_crossings`; the data is",
        f"`world/sources/routes/water-crossings.json` (schema {doc['schemaVersion']}).",
        "Do not hand-edit either.",
        "",
        "Derived ON THE RECORD (decision 0066): the water entity under each way",
        "sample, its id and its kind come from the signed hydrology graph through",
        "the shipped bundle; only the depth is measured, on the compiled surface.",
        "Positions are on whatever `province/routes.json` and `routes-minor.json`",
        "are published at the time of the run — re-run after any route rebuild.",
        "",
        f"- **{c['major']['total']} on the major network** "
        f"({c['major']['river']} river, {c['major']['lake']} lake, {c['major']['marsh']} marsh): "
        f"{c['major']['bands']['ferry']} ferry-band, {c['major']['bands']['span']} span-band, "
        f"{c['major']['bands']['ford']} ford-band.",
        f"- **{c['minor']['total']} on tracks and footpaths** "
        f"({c['minor']['river']} river, {c['minor']['lake']} lake, {c['minor']['marsh']} marsh): "
        f"{c['minor']['bands']['ferry']} ferry-band, {c['minor']['bands']['span']} span-band, "
        f"{c['minor']['bands']['ford']} ford-band.",
        f"- Deepest crossing anywhere: **{doc['deepestM']} m**. Widest: "
        f"**{doc['widestM']} m**. A crossing is a ford only where it is both "
        f"narrower than {FORD_MAX_M:.0f} m and no deeper than "
        f"{FORD_MAX_DEPTH_M} m — the small-draft hull depth the docks are "
        "dredged to — so width and depth both decide the band.",
        "",
        "## Major network, widest first",
        "",
        "| id | water | entity | span m | depth m | band | position | nearest place | m |",
        "|---|---|---|---:|---:|---|---|---|---:|",
    ]
    for r in doc["crossings"]:
        if r["network"] != "major":
            continue
        x, z = r["positionM"]
        lines.append(f"| `{r['id']}` | {r['water']} | `{r['entityId']}` | {r['spanM']} | {r['maxDepthM']} | "
                     f"{r['band']} | {x}, {z} | {r['nearestPlaceName']} | {r['nearestPlaceM']} |")
    lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="re-derive and fail if the committed file disagrees")
    ap.add_argument("--dry-run", action="store_true",
                    help="derive and print the summary; write nothing")
    a = ap.parse_args(argv)
    try:
        rows = derive()
    except FileNotFoundError as e:
        print(f"derive_crossings: skipped, the asset vault is absent ({e})")
        return
    doc = document(rows)
    if a.dry_run:
        print(json.dumps({k: doc[k] for k in ("schemaVersion", "counts", "deepestM", "widestM")},
                         indent=2))
        return
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    if a.check:
        have = OUT_JSON.read_text(encoding="utf-8") if OUT_JSON.exists() else ""
        if have != text:
            raise SystemExit("water-crossings.json is stale — re-run "
                             "`python3 -m worldgen.derive_crossings`")
        print(f"derive_crossings: {len(rows)} crossings, up to date")
        return
    OUT_JSON.write_text(text, encoding="utf-8")
    OUT_MD.write_text(markdown(doc), encoding="utf-8")
    print(f"derive_crossings: {len(rows)} crossings -> {OUT_JSON}")


if __name__ == "__main__":
    main()
