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
from .author_route_structures import (GRADIENT_CAP_KIND, _highest_suffix_by_way,
                                      _kind, _reconcile_prior_windows, _refresh,
                                      _way_length_m, _window_rise)
from .compile_route_structures import (RAMP_KINDS, RAMP_MAX_DEG,
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
MAX_UNAUTHORED_WINDOWS = 40


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
