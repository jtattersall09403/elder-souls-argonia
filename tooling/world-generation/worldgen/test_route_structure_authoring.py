"""The authoring debt gate for route structures.

`worldgen.author_route_structures` never stops a terrain rebuild: a survivor
whose way has no authored `why`, or whose region has no family, is emitted with
its measured window (the grader needs that exclusion window — without it the
second grading pass cuts the hillside the structure was meant to stand on) and
marked `unauthored`. The debt is gated HERE, in CI, where it is visible and red
until someone looks at the ground and writes the sentence.

Standard 12: prose is written against the record it describes, by a separate
agent, through the `text-review` skill. Nothing in the pipeline may invent it.
"""

import json
import math

import numpy as np

from .grade_routes import STRUCTURES_PATH
from .author_route_structures import (DECK_THICKNESS_M, GRADIENT_CAP_KIND,
                                      NO_WATER, SpanWater,
                                      _highest_suffix_by_way, _kind,
                                      _reconcile_prior_windows, _refresh,
                                      _way_length_m, _window_rise,
                                      obstacle_span)
from .compile_route_structures import (RAMP_KINDS, RAMP_MAX_DEG, SPAN_KINDS,
                                       compile_structure, measure_window,
                                       ramp_ok)
from .test_route_structures import _kit_stub, _slope_way


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

    rise = _window_rise(chain, heights, 8.0, 28.0)

    assert rise == 5.2
    assert _kind(20.0, rise, worst_deg=10.0, way_kind="trail") == "stair"


def test_prior_windows_follow_a_rerouted_way_endpoint():
    way = {"id": "track.region.place", "kind": "track", "px": [[0, 0], [10, 0]]}
    end_m = _way_length_m(way)
    prior = [
        {"id": "structure.valid", "wayId": way["id"], "fromM": 5, "toM": 10},
        {"id": "structure.crosses", "wayId": way["id"],
         "fromM": end_m - 5, "toM": end_m + 20},
        {"id": "structure.past", "wayId": way["id"],
         "fromM": end_m + 10, "toM": end_m + 20},
        {"id": "structure.missing", "wayId": "track.region.gone",
         "fromM": 5, "toM": 10},
    ]

    kept, dropped, clipped = _reconcile_prior_windows(prior, {way["id"]: way})

    assert [row["id"] for row in kept] == ["structure.valid", "structure.crosses"]
    assert kept[1]["toM"] == round(end_m, 2)
    assert [row[0]["id"] for row in dropped] == ["structure.past", "structure.missing"]
    assert [row[0]["id"] for row in clipped] == ["structure.crosses"]


def test_author_cannot_choose_a_kind_the_compiler_would_refuse():
    """The invariant that broke the deploy on 2026-09-09.

    `_kind` picks the piece from a window's shape; `compile_structure` refuses a
    deck, bridge or lip-step over RAMP_MAX_DEG. When the two measured the window
    separately the author emitted four ramp kinds the compiler would not build
    (worst: 12.2 deg over a 12 deg cap). They now share `measure_window`, so
    every shape `_kind` can be handed must yield a kind `ramp_ok` accepts.

    Pure arithmetic over the decision surface — no province rebuild, no
    heightfield, milliseconds.
    """
    bad = []
    for way_kind in ("trail", "track", "road", "trunk_road"):
        for span in (0.5, 2.0, 9.8, 18.6, 21.1, 29.9, 30.0, 30.1, 60.0,
                     119.9, 120.0, 120.1, 400.0, 2_000.0):
            for rise in (0.0, 0.6, 2.4, 3.5, 4.0, 4.12, 8.0, 25.0, 300.0):
                for signed in (rise, -rise):
                    for worst in (0.0, 12.0, 27.9, 28.0, 45.0, 89.0):
                        kind = _kind(span, signed, worst, way_kind)
                        grade = math.degrees(math.atan(abs(signed) / max(span, 1e-6)))
                        if not ramp_ok(kind, grade):
                            bad.append((way_kind, span, signed, worst, kind,
                                        round(grade, 2)))
    assert not bad, (
        f"_kind returned a level-surface kind over the {RAMP_MAX_DEG:.0f} deg deck "
        f"cap for {len(bad)} shapes, e.g. {bad[:5]} — compile_route_structures "
        "will raise on every one of them")


def test_a_refreshed_record_compiles_on_the_ground_it_was_measured_on():
    """Author and compiler must agree window for window, on real geometry.

    The stored record here is stale in both ways that shipped: a `riseM` from an
    older heightfield, and a `toM` past the way's current end. Refreshing must
    hand the compiler something it can build.
    """
    way, heights = _slope_way(cells=240, rise_per_m=0.45)
    end_m = _way_length_m(way)
    GRADIENT_CAP_KIND[way["id"]] = way["kind"]
    stored = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
              "kind": "lip-step", "family": "dunmer-stone",
              "fromM": end_m - 20.0, "toM": end_m + 40.0,
              "riseM": 0.6, "worstDeg": 18.32}

    refreshed = _refresh(stored, {way["id"]: way}, heights)

    assert refreshed["toM"] == round(end_m, 2)          # clipped to real ground
    assert refreshed["kind"] not in RAMP_KINDS          # 24 deg is a flight
    placements, row = compile_structure(refreshed, way, heights, _kit_stub())
    assert placements and row["pieces"] == len(placements)
    # The two modules now read one number, not two.
    assert row["toM"] == refreshed["toM"]
    assert abs(row["riseM"] - refreshed["riseM"]) <= 0.01


def test_measure_window_clips_to_the_route_end():
    chain = np.array([0.0, 10.0, 20.0])
    heights = np.array([0.0, 0.0, 5.0])

    m = measure_window(chain, heights, 5.0, 500.0)

    assert m["toM"] == 20.0 and m["spanM"] == 15.0 and m["riseM"] == 5.0
    assert round(m["gradeDeg"], 2) == 18.43


def test_new_ids_continue_past_the_highest_suffix_already_issued():
    """A dropped structure must not let a new one reuse a kept id.

    Counting survivors restarts the numbering inside the range already issued;
    ten duplicate ids across five ways shipped that way (found 2026-09-09).
    """
    kept = [{"id": "structure.region-place.1", "wayId": "track.region.place"},
            {"id": "structure.region-place.14", "wayId": "track.region.place"},
            {"id": "structure.region-other.3", "wayId": "track.region.other"}]

    assert _highest_suffix_by_way(kept) == {"track.region.place": 14,
                                            "track.region.other": 3}


# --------------------------------------------------------------------------
# The obstacle rule: a span crosses something, or it is not a span
# --------------------------------------------------------------------------
def _flat_profile(length_m: float, samples: int = 400):
    chain = np.linspace(0.0, length_m, samples)
    return chain, np.zeros(samples), np.zeros(samples)


def test_a_uniform_dry_slope_is_not_a_crossing():
    """The defect that shipped: 389.6 m of deck down a dry 4.4 % hillside.

    A slope has no gap in it at any length, so `obstacle_span` must find
    nothing however long the window is and however far it falls.
    """
    chain = np.linspace(0.0, 390.0, 600)
    ground = 65.0 - 0.044 * chain          # the measured Blackwood road hillside
    xs = zs = np.zeros_like(chain)

    assert obstacle_span(chain, xs, zs, ground, 0.0, 390.0, NO_WATER) is None


def test_a_gap_deeper_than_one_deck_is_a_crossing_and_is_trimmed_to_itself():
    """A dip in the middle of a long dry window: the span is the dip, not the
    window. The threshold is the deck's own thickness, read from the kit."""
    chain = np.linspace(0.0, 200.0, 401)
    ground = np.zeros_like(chain)
    dip = (chain > 80.0) & (chain < 120.0)
    ground[dip] = -4.0 * DECK_THICKNESS_M

    found = obstacle_span(chain, np.zeros_like(chain), np.zeros_like(chain),
                          ground, 0.0, 200.0, NO_WATER)

    assert found is not None
    assert 78.0 <= found[0] <= 82.0 and 118.0 <= found[1] <= 122.0


def test_water_alone_makes_a_crossing_on_perfectly_flat_ground():
    """A river crossing has no rise at all. The drop test can never see it, so
    the water test must — and the noise floor must not delete it."""
    chain, xs, zs = _flat_profile(120.0)
    ground = np.zeros_like(chain)
    # 1 m of standing water over the middle third of the way.
    depth = np.full((100, 100), -5.0, dtype=np.float32)
    depth[:, 33:67] = 1.0
    water = SpanWater(depth, metres_per_pixel=1.0)
    world_x = np.linspace(0.0, 99.0, len(chain))

    found = obstacle_span(chain, world_x, zs, ground, 0.0, 120.0, water)

    assert found is not None and found[1] - found[0] > 25.0


def test_a_measured_gap_is_never_answered_with_a_single_step():
    """`lip-step` is one tread over a terrace edge and has nothing under it.

    Without this, a trimmed crossing shorter than 30 m came back as a lip step,
    which is not a span, which left it untrimmed with no gap on the record —
    and the pass authored it again a run later under a new id.
    """
    bad = [(way_kind, span)
           for way_kind in ("trail", "track", "road", "trunk_road")
           for span in (2.0, 9.0, 17.7, 29.9)
           if _kind(span, 0.2, worst_deg=10.0, way_kind=way_kind,
                    gap_m=span) == "lip-step"]
    assert not bad, f"a measured gap was answered with a single step: {bad}"


def test_every_published_span_crosses_something():
    """THE invariant, on the shipped file. Never ratcheted, never waived."""
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    spans = [s for s in structures if s["kind"] in SPAN_KINDS]
    assert spans, "the province publishes no spans at all — the author has stopped working"
    bridges_over_nothing = [
        f"{s['id']} ({s['toM'] - s['fromM']:.1f} m on {s['wayId']})"
        for s in spans if not float(s.get("gapM") or 0.0) > 0.0]
    assert not bridges_over_nothing, (
        f"{len(bridges_over_nothing)} published spans carry no measured obstacle — "
        f"they are bridges over nothing, which is the defect `obstacle_span` exists "
        f"to end: {', '.join(bridges_over_nothing[:8])}")


def test_a_trimmed_span_keeps_the_window_it_was_trimmed_from():
    """Without the source window the pass is not a fixed point: re-measuring a
    trimmed window lowers its own chord, finds a smaller drop, and retires the
    crossing the previous run authored."""
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    trimmed = [s for s in structures if float(s.get("gapM") or 0.0) > 0.0]
    assert trimmed
    missing = [s["id"] for s in trimmed
               if "windowFromM" not in s or "windowToM" not in s]
    assert not missing, (
        f"{len(missing)} trimmed structures do not record the window they were "
        f"trimmed from: {', '.join(missing[:8])}")
    outside = [s["id"] for s in trimmed
               if s["fromM"] < s["windowFromM"] - 0.05
               or s["toM"] > s["windowToM"] + 0.05]
    assert not outside, f"a trimmed span reaches outside its own window: {outside[:8]}"


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
