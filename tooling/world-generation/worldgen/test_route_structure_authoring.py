"""Gates on `author_route_structures`: the spans come from the crossing
record bank to bank, the dry windows become flights, never bridges; the
author and the compiler measure one window the same way."""
import json
import math

import numpy as np

from .grade_routes import STRUCTURES_PATH
from .author_route_structures import (MARSH_DECK_FAMILY, STAIR_MIN_DEG, _chain_and_z, _kind,
                                      _way_length_m, author, steep_runs)
from .compile_route_structures import (FAMILIES, RAMP_KINDS, RAMP_MAX_DEG, SPAN_KINDS,
                                       measure_window, ramp_ok)
from .scale import RAW_M
from .test_route_structures import _slope_way
from .ladder import requires_stage


#: The most unauthored windows the province may carry. A RATCHET, and it is
#: deliberately not zero.
#:
#: The set churns by design: an over-cap window is measured on the graded
#: ground, so every regrade produces a different set, and a structure's window
#: is grading-exempt — which means authoring one CHANGES the ground and can
#: raise a window somewhere else. Chasing it to zero with a hand-maintained
#: table is a game the table cannot win, and the polish backlog has recorded
#: exactly that ("the authoring tables chase the ground") since 2026-09-08.
#:
#: What actually matters is enforced hard below and always was: **an
#: unauthored structure is never PUBLISHED**. It exists only as a grading
#: exclusion, so no piece without a reason reaches the world. This ratchet
#: holds the remaining debt from growing while the churn is fixed at its root,
#: and it is lowered — never raised — as ways are authored. Set to today's
#: measured count on 2026-09-09, after MIN_STRUCTURE_RISE_M retired 234
#: phantom structures and six ways were authored.
#: OWNER RULING 2026-09-09 closed this: "I don't mind things like bridges and
#: stairs not having a written prose reason to exist. It's generally pretty
#: obvious why they exist — they're there to enable the road/path/way." So a
#: structure now carries a plain default reason (`_default_why`) and the debt
#: is zero rather than ratcheted. Kept as a gate, not deleted: if the default
#: ever stops being applied the count rises and this catches it.
MAX_UNAUTHORED_WINDOWS = 0


@requires_stage("compile_route_structures")
def test_no_published_route_structure_is_unauthored():
    """HARD: nothing without a reason reaches the world. Never ratcheted."""
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    assert structures, f"no structures in {STRUCTURES_PATH}"
    published = [s for s in structures if not s.get("unauthored")]
    assert published, "every structure is unauthored — the author has stopped working"
    bad = [f"{s['id']} ({s['wayId']})" for s in published
           if not (isinstance(s.get("why"), str) and s["why"].strip())
           or not s.get("family") or not s.get("pieceRef")]
    assert not bad, (
        f"{len(bad)} structures are PUBLISHED without a reason or a piece, which is "
        f"the one thing this may never do: {', '.join(bad[:8])}")


@requires_stage("compile_route_structures")
def test_the_unauthored_debt_does_not_grow():
    """A ratchet on the churning half. Lower it as ways are authored."""
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    bad = []
    for s in structures:
        miss = []
        if s.get("unauthored"):
            miss.append("marked unauthored")
        if not isinstance(s.get("why"), str) or not s["why"].strip():
            miss.append("no `why` sentence")
        if not s.get("family") or not s.get("pieceRef"):
            miss.append("no family/piece")
        if miss:
            bad.append(f"{s['id']} ({s['wayId']}): {', '.join(sorted(set(miss)))}; "
                       f"length {s['toM'] - s['fromM']:.1f} m, rise {s['riseM']:.2f} m, "
                       f"worst gradient {s['worstDeg']:.2f} deg")
    ways = len({b.split("(")[1].split(")")[0] for b in bad})
    assert len(bad) <= MAX_UNAUTHORED_WINDOWS, (
        f"{len(bad)} unauthored route structures on {ways} ways, over the "
        f"{MAX_UNAUTHORED_WINDOWS} the province is allowed to carry — add the "
        f"sentence to WHY (and the region to FAMILY_BY_REGION) in "
        f"worldgen/author_route_structures.py, and LOWER the ratchet:\n  "
        + "\n  ".join(bad))
    if bad and len(bad) < MAX_UNAUTHORED_WINDOWS:
        print(f"\nRATCHET: {len(bad)} unauthored windows on {ways} ways, against a "
              f"cap of {MAX_UNAUTHORED_WINDOWS}. Lower MAX_UNAUTHORED_WINDOWS to "
              f"{len(bad)} in this file.")


def test_structure_kind_uses_exact_window_endpoints():
    """A steep endpoint between samples must not be hidden by sample snapping."""
    chain = np.array([0.0, 10.0, 20.0, 30.0])
    heights = np.array([0.0, 0.0, 2.0, 6.0])

    rise = round(measure_window(chain, heights, 8.0, 28.0)["riseM"], 2)

    assert rise == 5.2
    assert _kind(20.0, rise, worst_deg=10.0, way_kind="trail") == "stair"


def test_author_cannot_choose_a_kind_the_compiler_would_refuse():
    """`_kind` picks the piece from a window's shape; `compile_structure`
    refuses a lip-step over RAMP_MAX_DEG. Every shape `_kind` can be handed
    must yield a kind `ramp_ok` accepts, and never a span (a span is
    authored from the crossing record)."""
    bad = []
    for way_kind in ("trail", "track", "road", "trunk_road"):
        for span in (0.5, 2.0, 9.8, 18.6, 21.1, 29.9, 30.0, 30.1, 60.0,
                     119.9, 120.0, 120.1, 400.0, 2_000.0):
            for rise in (0.0, 0.6, 2.4, 3.5, 4.0, 4.12, 8.0, 25.0, 300.0):
                for signed in (rise, -rise):
                    for worst in (0.0, 12.0, 27.9, 28.0, 45.0, 89.0):
                        kind = _kind(span, signed, worst, way_kind)
                        grade = math.degrees(math.atan(abs(signed) / max(span, 1e-6)))
                        if kind in SPAN_KINDS or not ramp_ok(kind, grade):
                            bad.append((way_kind, span, signed, worst, kind, round(grade, 2)))
    assert not bad, (
        f"_kind returned a span or a level-surface kind over the {RAMP_MAX_DEG:.0f} deg deck "
        f"cap for {len(bad)} shapes, e.g. {bad[:5]}")


def test_measure_window_clips_to_the_route_end():
    chain = np.array([0.0, 10.0, 20.0])
    heights = np.array([0.0, 0.0, 5.0])

    m = measure_window(chain, heights, 5.0, 500.0)

    assert m["toM"] == 20.0 and m["spanM"] == 15.0 and m["riseM"] == 5.0
    assert round(m["gradeDeg"], 2) == 18.43


@requires_stage("compile_route_structures")
def test_every_published_span_stands_on_a_crossing_record():
    """THE invariant, on the shipped file: a bridge or a deck names the
    crossing it carries (owner 2026-09-16: no bridges over dry ground)."""
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    spans = [s for s in structures if s["kind"] in SPAN_KINDS]
    assert spans, "the province publishes no spans at all — the author has stopped working"
    dry = [f"{s['id']} ({s['toM'] - s['fromM']:.1f} m on {s['wayId']})"
           for s in spans if not s.get("crossingId") or not float(s.get("gapM") or 0.0) > 0.0]
    assert not dry, f"{len(dry)} published spans carry no crossing record: {', '.join(dry[:8])}"


@requires_stage("compile_route_structures")
def test_every_published_structure_stands_on_a_way_that_exists():
    """The staleness that shipped, and nothing caught it.

    On 2026-09-09 the committed `route-structures.json` carried 177 structures
    (28 % of the file) whose ways had been re-solved shorter or renamed since it
    was last authored — chainage that names no ground. `author` reconciles them
    loudly when it runs, but nothing made it run, so the file and
    `routes-minor.json` were committed out of step with each other. This is the
    gate that says so.
    """
    from .grade_routes import ways as _ways
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    lengths = {w["id"]: _way_length_m(w) for w in _ways()}
    stale = []
    for s in structures:
        end = lengths.get(s["wayId"])
        if end is None:
            stale.append(f"{s['id']}: way {s['wayId']} is not in the current route set")
        elif float(s["fromM"]) >= end:
            stale.append(f"{s['id']}: starts at {float(s['fromM']):.0f} m, "
                         f"way ends at {end:.0f} m")
    assert not stale, (
        f"{len(stale)} published route structures name ground the current routes do "
        f"not have — re-run `python3 -m worldgen.author_route_structures` and "
        f"`compile_route_structures`:\n  " + "\n  ".join(stale[:10]))


# --------------------------------------------------------------------------
# THE CROSSING RECORD DECIDES WHAT IS BUILT (decision 0068; owner 2026-09-16)
# --------------------------------------------------------------------------
def _flat_road():
    """A flat ROAD and the stretch doc for it; the water is a stub crossing
    row, exactly the shape `derive_crossings` writes."""
    cells = 240
    heights = np.zeros((cells, cells), dtype=np.float32)
    way = {"id": "route.road.test", "kind": "road",
           "px": [[4, 20], [60, 20]], "name": "Test Road"}
    length = _way_length_m(way)
    wet0, wet1 = length / 3.0, 2.0 * length / 3.0
    stretch_doc = {"ways": [{"wayId": way["id"], "kind": "road",
                             "stretches": [{"fromM": wet0 - 5.0, "toM": wet1 + 5.0,
                                            "worstDeg": 20.0, "overM": 50.0}]}]}
    return way, heights, stretch_doc, (wet0, wet1)


def _crossing(band: str, water_label: str, way, banks_m):
    a, b = banks_m
    return {"id": f"crossing.test.{band}.{water_label}", "band": band,
            "water": water_label, "spanM": round(b - a, 1), "maxDepthM": 1.0,
            "entityId": "w.test", "entityKind": "channel-major",
            "servesRoutes": [way["id"]],
            # world points, projected onto the way's own chainage
            "banks": [[a, 20 * 3 * RAW_M], [b, 20 * 3 * RAW_M]]}


def _author(crossing, services=None, with_window=True):
    way, heights, doc, banks = _flat_road()
    chain, xs, zs, _z = _chain_and_z(way, heights)
    a = float(np.interp(banks[0], chain, xs))
    b = float(np.interp(banks[1], chain, xs))
    rows = [] if crossing is None else [_crossing(*crossing, way, (a, b))]
    if not with_window:
        doc = {"ways": []}
    return author(doc, {way["id"]: way}, heights, crossings=rows, services=services or {})


def test_a_marsh_crossing_on_a_road_is_a_boardwalk_not_a_stone_bridge():
    out = _author(("span", "marsh"))
    assert len(out["structures"]) == 1, out["structures"]
    st = out["structures"][0]
    assert st["kind"] == "deck"
    assert st["family"] == MARSH_DECK_FAMILY
    assert st["pieceRef"] == FAMILIES[MARSH_DECK_FAMILY]["deck"]["asset"]


def test_a_marsh_crossing_is_a_boardwalk_at_any_band():
    for band in ("ford", "span"):
        st = _author((band, "marsh"))["structures"]
        assert len(st) == 1 and st[0]["kind"] == "deck", (band, st)


def test_a_ferry_band_crossing_builds_nothing_and_is_reported():
    out = _author(("ferry", "lake"))
    assert out["structures"] == []
    assert len(out["ferryCrossings"]) == 1
    row = out["ferryCrossings"][0]
    assert row["wayId"] == "route.road.test"
    assert row["crossingId"].endswith("ferry.lake")
    assert row["serviceId"] is None


def test_a_ferry_window_names_the_service_that_serves_it():
    out = _author(("ferry", "lake"), services={"crossing.test.ferry.lake": "boat.test"})
    assert out["ferryCrossings"][0]["serviceId"] == "boat.test"


def test_a_river_span_crossing_is_a_bridge_bank_to_bank():
    way, heights, _doc, banks = _flat_road()
    out = _author(("span", "river"))
    st = out["structures"]
    assert len(st) == 1 and st[0]["kind"] == "bridge"
    assert st[0]["family"] == "stone-civic"
    assert st[0]["crossingId"] == "crossing.test.span.river"
    assert abs(st[0]["fromM"] - banks[0]) < 2.0 and abs(st[0]["toM"] - banks[1]) < 2.0
    assert st[0]["gapM"] > 0.0


def test_a_crossing_is_built_even_where_the_grader_flagged_nothing():
    """The defect on the 2026-09-16 map: roads crossed rivers on flat banks
    with no span, because a span was only ever authored from an over-cap
    window. The crossing record alone is enough."""
    st = _author(("span", "river"), with_window=False)["structures"]
    assert len(st) == 1 and st[0]["kind"] == "bridge"


def test_a_shallow_narrow_ford_on_a_river_builds_nothing():
    assert _author(("ford", "river"))["structures"] == []


def test_a_dry_window_is_never_a_span():
    """A dry over-cap window on a road is a flight, never a bridge (owner
    2026-09-16: the map showed bridges over dry hollows)."""
    way, heights = _slope_way(cells=240, rise_per_m=0.45)
    end_m = _way_length_m(way)
    doc = {"ways": [{"wayId": way["id"], "kind": way["kind"],
                     "stretches": [{"fromM": end_m * 0.4, "toM": end_m * 0.6,
                                    "worstDeg": 24.0, "overM": end_m * 0.2}]}]}
    st = author(doc, {way["id"]: way}, heights, crossings=[], services={})["structures"]
    assert len(st) == 1
    assert st[0]["kind"] not in SPAN_KINDS and st[0]["kind"] not in RAMP_KINDS
    assert st[0]["gapM"] == 0.0 and "crossingId" not in st[0]


def test_a_window_on_a_crossing_is_not_authored_twice():
    """The grader's window over the river banks is the crossing's: one bridge,
    not a bridge plus a flight."""
    out = _author(("span", "river"))
    assert [s["kind"] for s in out["structures"]] == ["bridge"]


def test_ids_are_numbered_per_way_in_chainage_order():
    st = _author(("span", "river"))["structures"]
    assert st[0]["id"] == "structure.road-test.1"


def test_a_gentle_window_with_one_wrinkle_gets_one_short_flight_not_a_long_one():
    """The 518 m stepped ascent of 2026-09-16: a refused window over a
    gentle slope with one 2 m lip inside it. The flight is the lip."""
    chain = np.arange(0.0, 500.0, 1.83)
    z = chain * 0.02                       # a 1.1 deg slope
    lip = (chain > 240.0) & (chain < 246.0)
    z[lip] += np.linspace(0.0, 2.0, lip.sum())
    z[chain >= 246.0] += 2.0
    runs = steep_runs(chain, z, 0.0, 500.0)
    assert len(runs) == 1 and 235.0 < runs[0][0] < 246.0 and runs[0][1] - runs[0][0] < 15.0


def test_a_gentle_window_builds_nothing():
    chain = np.arange(0.0, 300.0, 1.83)
    z = chain * np.tan(np.radians(STAIR_MIN_DEG - 3.0))
    assert steep_runs(chain, z, 0.0, 300.0) == []
