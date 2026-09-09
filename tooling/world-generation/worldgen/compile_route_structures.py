"""Compile the authored route structures into placed kit pieces.

    cd tooling/world-generation
    python3 -m worldgen.compile_route_structures

Reads `world/sources/routes/route-structures.json` (authored by
`worldgen.author_route_structures` from the grader's measured over-cap
stretches), the route geometry and the graded heightfield, and lays real kit
pieces along each way's centreline between the structure's `fromM` and `toM`.

Writes:

  * `output/route-structures/<way-slug>.json` (gitignored) — placements with
    GenerationProvenance fields, in the shape `compile_settlement` emits.
  * `world/sources/sites/route-structures.md` (committed) — per way: the kind,
    the pieces placed, the total rise carried and the residual over-cap metres
    left after the structure.

Scope: this compiler produces PLACEMENTS (position, yaw, asset id). Rendering
the pieces in 3D is Round B's job; nothing here loads a mesh.

GEOMETRY RULES (measured, never inferred from a piece's name)
------------------------------------------------------------
Every piece's run, rise and width below is read off the built kit
(`tooling/asset-pipeline/output/kits/route-structures-v1.kit.json`,
`sizeM` / `originOffsetM`) and re-checked against it at load: rebuild the kit
with different geometry and this module fails rather than placing a piece that
no longer fits. Families never mix pieces from different authored sets
(CLAUDE.md: kits only combine pieces designed to combine).

Caps:
  * FLIGHT_MAX_DEG (35) — the steepest a masonry flight may be. A piece
    steeper than this is not a flight and the compiler refuses it.
  * LADDER_MAX_DEG (48) — lashed-timber companionway pieces (the stockade
    scaffold stair, the passerelle stair segment) are authored steeper than
    masonry on purpose; they are stepped, hand-over-rail climbs, and this is
    the cap that applies to them. Recorded separately so the masonry rule is
    never quietly relaxed.
  * RAMP_MAX_DEG (12) — a deck or span is a surface a cart crosses, so its
    end-to-end grade may not exceed this. A window steeper than that is a
    stair, and `author_route_structures._kind` must not have called it a deck.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
from pathlib import Path

import numpy as np

from .grade_routes import STRUCTURES_PATH, resample, sample_bilinear, ways
from .scale import RAW_M

SCHEMA_VERSION = 1
GENERATOR_ID = "worldgen.compile_route_structures"
GENERATOR_VERSION = 1

KIT = "route-structures-v1"
KIT_PATH = (Path(__file__).resolve().parents[2] / "asset-pipeline" / "output"
            / "kits" / f"{KIT}.kit.json")
OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "route-structures"
REPORT_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources"
               / "sites" / "route-structures.md")
STUDIO_PATH = (Path(__file__).resolve().parents[3] / "apps" / "world-studio"
               / "public" / "province" / "route-structures.json")

FLIGHT_MAX_DEG = 35.0
LADDER_MAX_DEG = 48.0
RAMP_MAX_DEG = 12.0
SIZE_TOLERANCE_M = 0.15        # how far a piece may drift before we refuse it

# Family -> role -> piece. `runM` is the chainage a piece consumes along the
# way, `riseM` the height it carries, `widthM` the cross-way extent; each is a
# measured extent of the built asset, named in the comment beside it. `ladder`
# marks a lashed-timber climb (LADDER_MAX_DEG rather than FLIGHT_MAX_DEG).
FAMILIES: dict[str, dict] = {
    "stone-civic": {          # roads and trunk roads: Imperial engineering
        "culture": "imperial",
        "stair": {"asset": "vanilla:architecture/whiterun/wrterrain/wrcastlestairs01",
                  # sizeM [13.212, 18.652, 12.609]: run = y, rise = z, width = x
                  "runM": 18.652, "riseM": 12.609, "widthM": 13.212},
        "landing": {"asset": "vanilla:architecture/whiterun/wrterrain/wrstairsplatform01",
                    # sizeM [30.021, 29.632, 12.144]; the flight's own platform
                    "runM": 29.632, "riseM": 0.0, "widthM": 30.021},
        "deck": {"asset": "vanilla:architecture/whiterun/wrterrain/wrbridgestone01",
                 # sizeM [4.216, 4.047, 1.302]: a free-standing stone road span
                 "runM": 4.216, "riseM": 0.0, "widthM": 4.047},
    },
    "stone-rural": {          # the Imperial fringe's farm-terrace stone
        "culture": "imperial-fringe",
        "stair": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterracestairs01",
                  # sizeM [7.283, 8.232, 2.495]: run = y, rise = z -> 16.9 deg
                  "runM": 8.232, "riseM": 2.495, "widthM": 7.283},
        "landing": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterrace01",
                    # sizeM [3.641, 8.265, 2.486]: the set's retaining terrace
                    "runM": 3.641, "riseM": 0.0, "widthM": 8.265},
        "deck": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterracerampup01",
                 # sizeM [7.283, 8.497, 3.355]: the terrace's own ramp
                 "runM": 8.497, "riseM": 0.0, "widthM": 7.283},
    },
    "dunmer-stone": {         # the Dunmer north: Hlaalu Hammerfell masonry
        "culture": "dunmer",
        "stair": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/stairs01",
                  # sizeM [7.35, 6.064, 2.283]: run = y, rise = z -> 20.6 deg
                  "runM": 6.064, "riseM": 2.283, "widthM": 7.350},
        "landing": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/trgmbridge01",
                    # sizeM [6.654, 3.03, 3.124]: the short span, same set,
                    # authored at the same deck height as the flights
                    "runM": 6.654, "riseM": 0.0, "widthM": 3.030},
        "deck": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/trgmbridge02",
                 # sizeM [13.312, 3.11, 5.485]: the long span
                 "runM": 13.312, "riseM": 0.0, "widthM": 3.110},
    },
    "root-timber": {          # the Hist heartland: BM&V passerelle deck
        "culture": "argonian-root",
        "ladder": True,
        "stair": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passesc128h64d01",
                  # 128-unit run / 64-unit rise at 0.014224 m per unit (the
                  # author's encoded contract), x extent 1.982 m confirms it
                  "runM": 1.821, "riseM": 0.910, "widthM": 3.081},
        "landing": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl128d01",
                    # sizeM [1.982, 3.081, 3.031]: the flat 128-unit segment
                    "runM": 1.821, "riseM": 0.0, "widthM": 3.081},
        "deck": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl256d01",
                 # sizeM [3.803, 3.081, 3.031]: the flat 256-unit segment
                 "runM": 3.641, "riseM": 0.0, "widthM": 3.081},
    },
    "scaffold-timber": {      # the pirate freeholds: lashed stockade scaffold
        "culture": "freehold",
        "ladder": True,
        "stair": {"asset": "vanilla:clutter/stockade/stockadescaffoldstairs01",
                  # sizeM [3.583, 3.457, 3.448]: run = y, rise = z -> 44.9 deg,
                  # a companionway, base-anchored (originOffsetM z = 0)
                  "runM": 3.457, "riseM": 3.448, "widthM": 3.583},
        "landing": {"asset": "vanilla:clutter/stockade/stockadescaffoldbridge01",
                    # sizeM [6.579, 3.798, 1.209]: the short scaffold deck
                    "runM": 6.579, "riseM": 0.0, "widthM": 3.798},
        "deck": {"asset": "vanilla:clutter/stockade/stockadescaffoldbridgenarrow",
                 # sizeM [12.041, 1.997, 1.543]: the long footpath-width deck
                 "runM": 12.041, "riseM": 0.0, "widthM": 1.997},
    },
}

# The piece each structure kind chains, by role.
KIND_ROLE = {"stair": "stair", "stepped-ascent": "stair",
             "deck": "deck", "bridge": "deck", "lip-step": "landing"}

# The kinds that lay a level surface a cart crosses, and so answer to
# RAMP_MAX_DEG rather than to a flight cap.
RAMP_KINDS = frozenset({"deck", "bridge", "lip-step"})


# --------------------------------------------------------------------------
# kit validation
# --------------------------------------------------------------------------
def load_kit(path: Path | None = None) -> dict:
    path = path or KIT_PATH
    return {a["id"]: a for a in json.loads(path.read_text())["assets"]}


def validate(kit: dict, families: dict | None = None) -> None:
    """Refuse a family whose pieces no longer measure what the table claims, or
    whose flight is steeper than its cap."""
    for fam, spec in (families or FAMILIES).items():
        cap = LADDER_MAX_DEG if spec.get("ladder") else FLIGHT_MAX_DEG
        for role, piece in spec.items():
            if not isinstance(piece, dict):
                continue
            asset = kit.get(piece["asset"])
            if asset is None:
                raise ValueError(f"{fam}/{role}: {piece['asset']} is not in kit {KIT}")
            extents = [round(v, 3) for v in asset["sizeM"]]
            for key in ("runM", "widthM"):
                if not any(abs(piece[key] - e) <= SIZE_TOLERANCE_M for e in extents) \
                        and not (key == "runM" and spec.get("ladder")):
                    raise ValueError(
                        f"{fam}/{role}: {key}={piece[key]} is no longer an extent of "
                        f"{piece['asset']} (sizeM {extents}); re-measure the kit")
            if piece["riseM"] > 0.0:
                # Built manifests are [x, plan-y, vertical-z].  Checking rise
                # against "any extent" let a horizontal width accidentally
                # certify a flight.  A tread-to-tread rise may be smaller than
                # the full vertical bbox (the root passerelle includes its
                # supporting posts), but it can never exceed it.
                vertical_m = extents[2]
                if piece["riseM"] > vertical_m + SIZE_TOLERANCE_M:
                    raise ValueError(
                        f"{fam}/{role}: riseM={piece['riseM']} exceeds the vertical z bbox "
                        f"{vertical_m} m of {piece['asset']} (sizeM {extents}); the x/y plan "
                        f"extents cannot certify a climb")
                deg = math.degrees(math.atan(piece["riseM"] / piece["runM"]))
                if deg > cap + 1e-6:
                    raise ValueError(
                        f"{fam}/{role}: {piece['asset']} climbs {deg:.1f} deg, over the "
                        f"{cap:.0f} deg cap for this family — it is not a walkable flight")


# --------------------------------------------------------------------------
# placement
# --------------------------------------------------------------------------
def _profile(way: dict, heights: np.ndarray):
    """(chainage m, world x m, world z m, ground height m) along the centreline."""
    pts = resample(way["px"])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1])
    return chain, pts[:, 0] * RAW_M, pts[:, 1] * RAW_M, z


def _at(chain, xs, zs, hs, c: float):
    """World position and ground height at chainage `c` (linear)."""
    return (float(np.interp(c, chain, xs)), float(np.interp(c, chain, zs)),
            float(np.interp(c, chain, hs)))


def _yaw_deg(chain, xs, zs, c: float, run: float) -> float:
    """Heading of the centreline at `c`, degrees. 0 = +X (east), increasing
    towards +Z (south) — the studio/world convention (module 00-core §8)."""
    x0, z0, _ = _at(chain, xs, zs, zs, max(c - run * 0.5, float(chain[0])))
    x1, z1, _ = _at(chain, xs, zs, zs, min(c + run * 0.5, float(chain[-1])))
    return round(math.degrees(math.atan2(z1 - z0, x1 - x0)), 2)


def measure_window(chain: np.ndarray, hs: np.ndarray,
                   from_m: float, to_m: float) -> dict:
    """THE measurement of a structure window. One function, both modules.

    `author_route_structures._kind` chooses the piece from a window's shape and
    this module refuses a piece the shape cannot carry. When the two measured
    the same window separately they disagreed — the author read a raw stored
    `toM` and a rise taken on a different heightfield, the compiler clipped
    `toM` to the current route end and read the rise on the current ground — so
    the author emitted lip-steps the compiler then correctly refused (four of
    them, 2026-09-09, one at 12.2 deg over a 12 deg cap). Both callers now take
    the span, the rise and the grade from here, so a kind the author approves is
    a kind this module can build.

    `toM` is clipped to the route's current end: chainage past the end does not
    name ground. Heights are interpolated at the exact endpoints, never snapped
    to the nearest route sample.
    """
    end = float(chain[-1])
    a = float(from_m)
    b = min(float(to_m), end)
    span = max(b - a, 0.0)
    rise = float(np.interp(b, chain, hs)) - float(np.interp(a, chain, hs))
    grade = math.degrees(math.atan(abs(rise) / max(span, 1e-6)))
    return {"fromM": a, "toM": b, "spanM": span, "riseM": rise,
            "gradeDeg": grade, "routeEndM": end}


def ramp_ok(kind: str, grade_deg: float) -> bool:
    """Whether a level-surface kind may sit on this grade (RAMP_MAX_DEG)."""
    return kind not in RAMP_KINDS or grade_deg <= RAMP_MAX_DEG + 1e-6


def compile_structure(st: dict, way: dict, heights: np.ndarray,
                      kit: dict) -> tuple[list[dict], dict]:
    """Placements for one structure, plus its summary row."""
    fam = FAMILIES[st["family"]]
    role = KIND_ROLE[st["kind"]]
    piece, landing = fam[role], fam["landing"]
    chain, xs, zs, hs = _profile(way, heights)
    m = measure_window(chain, hs, st["fromM"], st["toM"])
    a, b, span, rise = m["fromM"], m["toM"], m["spanM"], m["riseM"]
    if span <= 0.05:
        raise ValueError(
            f"{st['id']}: authored window {a:.2f}-{float(st['toM']):.2f} m "
            f"does not overlap the current {m['routeEndM']:.2f} m route; "
            "re-run author_route_structures against the current route geometry"
        )

    corrected = None
    if not ramp_ok(st["kind"], m["gradeDeg"]):
        # The author measures between the two grading passes and this compiler
        # measures after the second, so a window's ground CAN move between them
        # even though pass 2 leaves the inside of a window alone: its endpoints
        # sample the shoulder the second pass benched. Refusing to build was the
        # right instinct while the two modules measured differently, but they no
        # longer do — `ramp_ok` is one rule and this measurement is the
        # authoritative one, so the honest act is to build what the ground can
        # carry and SAY SO, rather than stop the chain on a piece nobody chose
        # deliberately. A ramp that cannot be a ramp is a flight; the record is
        # rewritten by the next author pass, and the correction is reported so
        # the drift stays visible rather than becoming a quiet fixup.
        corrected = {"id": st["id"], "wayId": st["wayId"], "was": st["kind"],
                     "now": "stepped-ascent", "gradeDeg": round(m["gradeDeg"], 1),
                     "recordRiseM": round(float(st.get("riseM", 0.0)), 2),
                     "groundRiseM": round(rise, 2)}
        st = dict(st, kind="stepped-ascent")
        role = KIND_ROLE[st["kind"]]
        piece, landing = fam[role], fam["landing"]

    placements: list[dict] = []
    c = a
    n = 0
    while c < b - 0.05 and n < 400:
        run = piece["runM"]
        use = piece
        if piece["riseM"] > 0.0:
            # A landing goes in wherever the ground over the next run is flatter
            # than the flight itself: a stair laid there would leave a step at
            # its foot instead of meeting the ground.
            _, _, h0 = _at(chain, xs, zs, hs, c)
            _, _, h1 = _at(chain, xs, zs, hs, min(c + run, b))
            if abs(h1 - h0) < 0.5 * piece["riseM"]:
                use, run = landing, landing["runM"]
        x, z, h = _at(chain, xs, zs, hs, c)
        placements.append({
            "id": f"{st['id']}.p{n + 1}",
            "assetId": use["asset"],
            "role": "landing" if use is landing and use is not piece else role,
            "posM": [round(x, 3), round(h, 3), round(z, 3)],
            "yawDeg": _yaw_deg(chain, xs, zs, min(c + run * 0.5, b), run),
            "fromM": round(c, 2), "toM": round(min(c + run, b), 2),
            "provenance": {
                "sourceStructureId": st["id"],
                "sourceWayId": st["wayId"],
                "generatorId": GENERATOR_ID,
                "generatorVersion": GENERATOR_VERSION,
                "seed": st["id"],
                "ruleId": f"route-structure/{st['kind']}/{st['family']}",
                "assetId": use["asset"],
                "sourceDataHashes": [],
            },
        })
        c += run
        n += 1
    row = {"structureId": st["id"], "wayId": st["wayId"], "kind": st["kind"],
           "family": st["family"], "pieces": len(placements),
           "spanM": round(span, 1), "riseM": round(rise, 2),
           "fromM": round(a, 2), "toM": round(b, 2)}
    if corrected is not None:
        row["kindCorrected"] = corrected
    return placements, row


def compile_all(structures: list[dict], ways_by_id: dict, heights: np.ndarray,
                kit: dict) -> tuple[dict[str, dict], list[dict]]:
    by_way: dict[str, dict] = {}
    rows: list[dict] = []
    familyless: list[str] = []
    for st in sorted(structures, key=lambda s: s["id"]):
        # `author_route_structures` emits a survivor whose region has no family
        # anyway, because the grader needs the exclusion window or its second
        # pass cuts the hillside away. Nobody has said who builds there, so
        # there is no kit to lay and nothing to compile — this used to be a bare
        # KeyError: None. The debt is gated by
        # test_route_structure_authoring.test_no_shipped_route_structure_is_unauthored.
        if not st.get("family"):
            familyless.append(st["id"])
            continue
        way = ways_by_id[st["wayId"]]
        placements, row = compile_structure(st, way, heights, kit)
        doc = by_way.setdefault(st["wayId"], {
            "schemaVersion": SCHEMA_VERSION, "wayId": st["wayId"], "kit": KIT,
            "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION},
            "structures": [], "placements": []})
        doc["structures"].append({k: v for k, v in st.items()})
        doc["placements"].extend(placements)
        rows.append(row)
    corrections = [r["kindCorrected"] for r in rows if r.get("kindCorrected")]
    if corrections:
        print(f"[route-structures] {len(corrections)} structure(s) could not carry "
              f"the piece the author chose on the ground this compile measures, and "
              f"were built as a flight instead — the author runs between the two "
              f"grading passes and this compiler after the second:")
        for c in corrections:
            print(f"    {c['id']} ({c['wayId']}): {c['was']} -> {c['now']}, "
                  f"{c['gradeDeg']} deg; record rise {c['recordRiseM']} m, "
                  f"ground rise {c['groundRiseM']} m")
    if familyless:
        print(f"[route-structures] {len(familyless)} authored structures name no "
              f"family and cannot be built: {', '.join(sorted(familyless)[:6])}"
              f"{' …' if len(familyless) > 6 else ''}")
    return by_way, rows


# --------------------------------------------------------------------------
# residual + report
# --------------------------------------------------------------------------
def residual_over_cap(stretch_doc: dict, structures: list[dict]) -> dict[str, float]:
    """Over-cap metres per way that no structure window covers."""
    spans: dict[str, list[tuple[float, float]]] = {}
    for st in structures:
        spans.setdefault(st["wayId"], []).append((st["fromM"], st["toM"]))
    out: dict[str, float] = {}
    for entry in stretch_doc["ways"]:
        wid, cap = entry["wayId"], entry["capDeg"]
        left = 0.0
        for s in entry["stretches"]:
            if s["worstDeg"] <= cap + 1.0:
                continue
            covered = any(a - 0.01 <= s["fromM"] and s["toM"] <= b + 0.01
                          for a, b in spans.get(wid, []))
            if not covered:
                left += s["overM"]
        if left > 0.0:
            out[wid] = round(left, 1)
    return out


def write_report(rows: list[dict], residual: dict[str, float], path: Path) -> str:
    by_way: dict[str, list[dict]] = {}

    for r in rows:
        by_way.setdefault(r["wayId"], []).append(r)
    lines = [
        "# Route structures",
        "",
        "Generated by `python3 -m worldgen.compile_route_structures` "
        "(deterministic).",
        "",
        f"The {len(by_way)} ways that stayed over their gradient cap after "
        "grading are walked on built geometry instead of on a deeper cut: a flight, a "
        "stepped ascent, a ramped deck, a span, or one step over a lip. The "
        "windows come from the grader's own measurement "
        "(`output/route-grading-stretches.json`), the pieces from "
        f"`{KIT}`, and each family uses one authored set only.",
        "",
        f"Caps: a flight may reach {FLIGHT_MAX_DEG:.0f} deg in masonry and "
        f"{LADDER_MAX_DEG:.0f} deg in lashed timber; a deck or span may grade "
        f"{RAMP_MAX_DEG:.0f} deg end to end.",
        "",
        "| way | structures | kinds | pieces | rise m | residual over-cap m |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for wid in sorted(by_way):
        rs = by_way[wid]
        kinds = ", ".join(sorted({r["kind"] for r in rs}))
        lines.append("| `{}` | {} | {} | {} | {:.1f} | {:.0f} |".format(
            wid, len(rs), kinds, sum(r["pieces"] for r in rs),
            sum(abs(r["riseM"]) for r in rs), residual.get(wid, 0.0)))
    lines += ["", "| structure | kind | family | from m | to m | rise m | pieces |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for r in sorted(rows, key=lambda r: r["structureId"]):
        lines.append("| `{}` | {} | {} | {:.0f} | {:.0f} | {:.1f} | {} |".format(
            r["structureId"], r["kind"], r["family"], r["fromM"], r["toM"],
            r["riseM"], r["pieces"]))
    left = {k: v for k, v in residual.items() if v > 0.0}
    lines += ["", "Ways with over-cap metres no structure covers: "
              + ("none." if not left else
                 ", ".join(f"`{k}` ({v:.0f} m)" for k, v in sorted(left.items()))), ""]
    text = "\n".join(lines) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return text


def studio_export(by_way: dict[str, dict], rows: list[dict]) -> dict:
    """The studio feed: one segment per structure in world metres, plus the
    label the routes layer shows on hover. 3D rendering of the pieces is Round
    B's job — this is the 2D footprint only."""
    row_by_id = {r["structureId"]: r for r in rows}
    out = []
    unplaced: list[str] = []
    unauthored: list[str] = []
    for wid in sorted(by_way):
        doc = by_way[wid]
        for st in doc["structures"]:
            ps = [p for p in doc["placements"] if p["provenance"]["sourceStructureId"] == st["id"]]
            r = row_by_id[st["id"]]
            # A window no piece of its family fits carries no piece, so there
            # is nothing for the studio to draw and nothing built on the
            # ground. It stays in the authored record — that is where the debt
            # lives — but shipping it here would publish a structure of zero
            # pieces as if it existed. Re-grading changes the window lengths,
            # so this is a moving set: the count is printed every run.
            if not r["pieces"]:
                unplaced.append(st["id"])
                continue
            # The studio labels a structure with its authored sentence, so a
            # record without one has nothing to publish: shipping `why: null`
            # puts an empty label on the map and breaks the feed's contract
            # (apps/world-studio/src/routes/routesData.test.ts). The window
            # stays in world/sources/routes/route-structures.json, which is
            # where the authoring debt is carried and gated.
            if not isinstance(st.get("why"), str) or not st["why"].strip():
                unauthored.append(st["id"])
                continue
            out.append({
                "id": st["id"], "wayId": wid, "kind": st["kind"],
                "family": st["family"], "pieces": r["pieces"],
                "riseM": r["riseM"], "spanM": r["spanM"], "why": st["why"],
                "pointsM": [[p["posM"][0], p["posM"][2]] for p in ps],
            })
    for label, ids in (("place no piece", unplaced),
                       ("carry no authored `why`", unauthored)):
        if ids:
            print(f"[route-structures] {len(ids)} structures {label} and are not "
                  f"published: {', '.join(sorted(ids)[:6])}"
                  f"{' …' if len(ids) > 6 else ''}")
    return {"schemaVersion": SCHEMA_VERSION,
            "_": "Route structures for the studio routes layer, world metres "
                 "(X east, Z south). Written by worldgen.compile_route_structures. "
                 "Structures whose window fits no piece of their family are "
                 "recorded in world/sources/routes/route-structures.json but not "
                 "published here: nothing is built on the ground.",
            "structures": out}


def publish_route_outputs(by_way: dict[str, dict], out_dir: Path = OUT_DIR) -> None:
    """Publish the exact compiled file set without retaining stale way files.

    Every JSON is completed in a sibling staging directory before the prior
    shelf moves aside. A failed write leaves the old complete shelf in place;
    a process death during the two renames leaves no shelf rather than a stale
    file falsely satisfying an authored way.
    """
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.stage.", dir=out_dir.parent))
    backup = stage.with_name(f"{stage.name}.previous")
    old_moved = False
    try:
        for wid, doc in sorted(by_way.items()):
            slug = wid.split(".", 1)[1].replace(".", "-")
            (stage / f"{slug}.json").write_text(
                json.dumps(doc, indent=2, sort_keys=True) + "\n")
        if out_dir.exists():
            os.replace(out_dir, backup)
            old_moved = True
        os.replace(stage, out_dir)
        if old_moved:
            shutil.rmtree(backup)
            old_moved = False
    except Exception:
        if old_moved and not out_dir.exists() and backup.exists():
            os.replace(backup, out_dir)
            old_moved = False
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if backup.exists() and not old_moved:
            shutil.rmtree(backup)


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS
    from .grade_routes import STRETCHES_PATH

    kit = load_kit()
    validate(kit)
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    heights = np.load(DEFAULT_HEIGHTS)
    by_way, rows = compile_all(structures, {w["id"]: w for w in ways()}, heights, kit)
    publish_route_outputs(by_way)
    residual = residual_over_cap(json.loads(STRETCHES_PATH.read_text()), structures)
    write_report(rows, residual, REPORT_PATH)
    STUDIO_PATH.write_text(json.dumps(studio_export(by_way, rows),
                                      indent=2, sort_keys=True) + "\n")
    print(f"{len(rows)} structures, {sum(r['pieces'] for r in rows)} pieces, "
          f"{len(by_way)} ways -> {OUT_DIR}")


if __name__ == "__main__":
    main()
