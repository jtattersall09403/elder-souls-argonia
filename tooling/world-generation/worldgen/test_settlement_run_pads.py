"""16k lane F: run pads (carried item 13) — seat, emit, merge, apply."""

from __future__ import annotations

import numpy as np

from . import terrain_patches as tp
from . import pad_overlay
from .settlement_run_pads import (PAD_HARD_RADIUS_PX, SEAT_BAR_M, declare_order,
                                  merge_pad_patches, run_pad_patches)


def _row(i: int, x0: float, rise: float = 0.0) -> dict:
    return {"id": f"place.t.run.piece.{i}", "run": {"id": "place.t.run", "riseM": rise},
            "anchor": {"designedSinkM": {"p50": 0.1}}, "scale": 1.0,
            "footprintM": [[x0, 0.0], [x0 + 4.0, 0.0], [x0 + 4.0, 1.0], [x0, 1.0]]}


def _falling(x: float, _z: float) -> float:
    """Ground 10 m high to x = 8, then falling 0.2 m per metre."""
    return 10.0 if x <= 8.0 else 10.0 - 0.2 * (x - 8.0)


def test_only_the_members_the_ground_falls_away_from_get_a_pad():
    rows = [_row(0, 0.0), _row(1, 4.0), _row(2, 8.0), _row(3, 12.0)]
    (patch,) = run_pad_patches(rows, "place.t", _falling)
    assert patch["id"] == "patch.pad.settlement.place.t.run" and patch["kind"] == "settlement-pad"
    pieces = {r["placementId"][-1]: r for r in patch["params"]["pieces"]}
    assert set(pieces) == {"2", "3"}                       # the datum and its level twin sit
    assert all(r["gapM"] > SEAT_BAR_M for r in pieces.values())
    assert pieces["3"]["targetM"] == 10.0                   # the chain's ground line (datum 9.9 + sink)
    assert not tp.validate([patch])
    assert run_pad_patches(rows, "place.t", lambda x, z: 10.0) == []
    assert run_pad_patches(rows, "place.t", _falling, is_wet=lambda x, z: x > 8.0) == []


def test_the_merge_is_cumulative_a_pad_that_worked_is_never_dropped():
    rows = [_row(0, 0.0), _row(1, 4.0), _row(2, 8.0), _row(3, 12.0)]
    first = run_pad_patches(rows, "place.t", _falling)
    other = {"id": "patch.poling.x", "kind": "poling-channel", "order": 0, "after": [],
             "bboxM": [100.0, 100.0, 110.0, 110.0], "maxDeltaM": 1.0}
    merged = merge_pad_patches([other], first)
    # re-measured on the ground the pad already raised: no gap, nothing emitted
    again = merge_pad_patches(merged, run_pad_patches(rows, "place.t", lambda x, z: 10.0))
    assert sorted(p["id"] for p in again) == sorted(p["id"] for p in merged)
    assert again == merged
    declare_order(again)
    assert not tp.validate(again)


def test_the_pad_seats_every_footprint_sample_and_tapers_outside():
    mpp = 2.0
    h = np.zeros((40, 40), np.float32)
    patch = {"id": "patch.pad.settlement.t.r", "kind": "settlement-pad", "bboxM": [30.0, 30.0, 38.0, 34.0],
             "blendM": 3.0, "maxDeltaM": 2.0,
             "params": {"pieces": [{"placementId": "a", "targetM": 0.5,
                                    "footprintM": [[30.0, 30.0], [38.0, 30.0], [38.0, 34.0], [30.0, 34.0]]}]}}
    overlay = pad_overlay.overlay_from_patch(patch, PAD_HARD_RADIUS_PX * mpp)
    out = pad_overlay.apply_grid(h, (0.5 * mpp, 0.5 * mpp), mpp, [overlay])
    for x, z in patch["params"]["pieces"][0]["footprintM"] + [[34.0, 32.0]]:
        assert out[int(z / mpp), int(x / mpp)] == 0.5       # the nearest-pixel sampler reads the seat
    assert out[0, 0] == 0.0 and 0.0 < out[16, 12] < 0.5      # far ground untouched; a taper between
    assert out.max() == 0.5 and out.min() == 0.0
    assert "settlement-pad" in tp.KINDS and tp.SCHEMA_VERSION == 2


# --- building pads (decision 0101) -------------------------------------------------
from .settlement_run_pads import (MAX_PAD_DELTA_M, RETAIN_BAR_M, building_pad_patches,  # noqa: E402
                                  pad_edges, pad_ground, pad_polygon, resolve_pad,
                                  surface_slope_deg)

_HOUSE = [[0.0, 0.0], [10.0, 0.0], [10.0, 6.0], [0.0, 6.0]]


def test_one_writer_names_a_building_pad_by_its_parcel_and_merges_beside_run_pads():
    rows = [{"id": "place.t.b1.building",
             "pad": {"parcelId": "b1", "datumM": 11.0, "polygonM": pad_polygon(_HOUSE)}},
            {"id": "other"}]
    (patch,) = building_pad_patches(rows, "place.t")
    assert patch["id"] == "patch.pad.settlement.place.t.b1" and patch["kind"] == "settlement-pad"
    assert patch["source"]["buildingId"] == "b1" and patch["params"]["pieces"][0]["targetM"] == 11.0
    assert patch["bboxM"] == [-1.5, -1.5, 11.5, 7.5]          # footprint + the 1.5 m apron
    run = run_pad_patches([_row(0, 0.0), _row(1, 4.0), _row(2, 8.0), _row(3, 12.0)],
                          "place.t", _falling)
    merged = merge_pad_patches(run, [patch])
    moved = building_pad_patches([{**rows[0], "pad": {**rows[0]["pad"], "datumM": 11.5}}], "place.t")
    again = merge_pad_patches(merged, moved)                    # re-export replaces its one member
    assert len(again) == 2
    assert {p["id"]: p for p in again}[patch["id"]]["params"]["pieces"][0]["targetM"] == 11.5
    declare_order(again)
    assert not tp.validate(again)


def test_the_datum_is_the_median_clamped_to_the_fill_and_cut_limit():
    got = resolve_pad([10.0, 10.0, 10.0, 10.0, 13.0])            # median 10: cut 3 m
    assert got["datumM"] == 11.0 and got["how"] == "median-clamped"
    assert got["cutM"] == MAX_PAD_DELTA_M and got["fillM"] == 1.0 and got["error"] is None
    assert resolve_pad([10.0, 10.4, 10.6])["how"] == "median"
    # a range no datum can hold: the compile refuses it
    assert "limit 2.0 m" in resolve_pad([10.0, 10.0, 14.5])["error"]
    assert resolve_pad([10.0, 10.5], datum_m=12.6)["error"]    # an authored datum is checked too


def test_the_flood_floor_raises_the_datum_and_never_lowers_it():
    got = resolve_pad([10.0, 10.2, 10.4], floor_min_m=11.5)
    assert got["datumM"] == 11.5 and got["how"] == "flood-floor" and got["fillM"] == 1.5
    assert resolve_pad([12.0, 12.2], floor_min_m=11.5)["datumM"] == 12.1


def test_r1_flags_every_edge_that_stands_more_than_the_bar_off_the_ground():
    poly = pad_polygon(_HOUSE)                                  # 13 x 9 m with the apron

    def edges_on(fall: float) -> dict:
        slope = lambda x, z: 10.0 - fall * x                    # falls east
        datum = resolve_pad([slope(x, 0.0) for x in range(-1, 12)])["datumM"]
        return {("x" if e["fromM"][0] == e["toM"][0] else "z") + str(round(e["fromM"][0])):
                e for e in pad_edges(poly, datum, slope)}
    steep = edges_on(0.2)                                       # 2.6 m across the pad
    assert steep["x-2"]["cutM"] > RETAIN_BAR_M and steep["x12"]["fillM"] > RETAIN_BAR_M
    assert all(e["needsWall"] for e in steep.values())          # the long sides run downhill too
    gentle = edges_on(0.05)                                     # 0.65 m across: +-0.33 at the ends
    assert not any(e["needsWall"] for e in gentle.values())


def test_the_patched_ground_is_flat_under_the_footprint_and_tapers_beyond():
    slope = lambda x, z: 10.0 - 0.2 * x
    patched = pad_ground(slope, [{"polygonM": pad_polygon(_HOUSE), "datumM": 9.0}])
    assert patched(5.0, 3.0) == 9.0 and patched(40.0, 3.0) == slope(40.0, 3.0)
    assert surface_slope_deg(patched, _HOUSE) == 0.0
    assert surface_slope_deg(slope, _HOUSE) > 11.0


class _Survey:
    """A 64 m province, 1 m pixels: ground falling east, water from x = 50."""
    extent_m = 64.0

    def __init__(self, fall: float):
        self.fall = fall
        self.water_signed_depth_m = np.where(np.arange(64)[None, :] >= 50, 1.0, -1.0) * np.ones((64, 1))

    def height_at(self, x: float, z: float) -> float:
        return 20.0 - self.fall * x


def test_the_compile_seats_a_pad_on_patched_ground_and_refuses_one_over_the_limit():
    from .compile_settlement import building_pad
    foot = [[x + 10.0, z + 10.0] for x, z in _HOUSE]
    assert building_pad({"id": "b1"}, foot, _Survey(0.2)) == (None, None)
    pad, why = building_pad({"id": "b1", "pad": {"datumM": 17.4}}, foot, _Survey(0.2))
    assert why is None and pad["slopeDeg"] == 0.0 and pad["fillM"] <= MAX_PAD_DELTA_M
    _, why = building_pad({"id": "b1", "pad": {"datumM": 17.4}}, foot, _Survey(0.5))
    assert "limit 2.0 m" in why                                  # 0.5 m/m over 13 m: no datum holds
    _, why = building_pad({"id": "b1", "pad": {"apronM": 1.5}}, foot, _Survey(0.2))
    assert "no datumM" in why
    _, why = building_pad({"id": "b1", "pad": {"datumM": 17.4, "floorMinM": 18.0}}, foot, _Survey(0.2))
    assert "flood floor" in why
    wet = [[x + 40.0, z + 10.0] for x, z in _HOUSE]              # reaches x = 51.5: water
    _, why = building_pad({"id": "b1", "pad": {"datumM": 20.0}}, wet, _Survey(0.0))
    assert "never fills water" in why


def test_a_building_pad_is_realised_as_pad_ground_describes_it():
    """The patch the export writes (hardM 0) grades exactly the polygon and
    blends over PAD_BLEND_M; `pad_ground` (the compile's and the workbench's
    surface) reads the same heights at the raster's samples."""
    from .settlement_run_pads import PaddedSurvey
    mpp = 1.0
    h = np.fromfunction(lambda r, c: 20.0 - 0.2 * c, (60, 60))
    poly = pad_polygon([[20, 20], [33, 20], [33, 30], [20, 30]])
    rows = [{"id": "pl.b1", "pad": {"parcelId": "b1", "datumM": 15.0, "polygonM": poly}}]
    (patch,) = building_pad_patches(rows, "place.t")
    assert patch["hardM"] == 0.0
    out = pad_overlay.apply_grid(h, (0.0, 0.0), mpp, [pad_overlay.overlay_from_patch(patch, 0.0)])
    frozen = lambda x, z: float(h[int(round(z)), int(round(x))])  # noqa: E731
    surface = pad_ground(frozen, [{"polygonM": poly, "datumM": 15.0}])
    for x in (25, 36, 40):                       # inside, 1.5 m out, past the blend
        assert abs(float(out[25, x]) - surface(x, 25)) < 1e-4, x
    assert float(out[25, 40]) == float(h[25, 40])
    padded = PaddedSurvey(type("S", (), {"height_at": staticmethod(frozen), "extent_m": 60.0})(),
                          [{"polygonM": poly, "datumM": 15.0}])
    assert padded.height_at(25, 25) == 15.0 and padded.extent_m == 60.0


def test_merging_a_building_pad_patch_keeps_hardm_zero():
    """Regression: merge_pad_patches rebuilds the patch dict via pad_patch,
    which has no opinion on hardM; a merge must re-apply the building pads'
    hardM 0.0 or a re-export silently falls back to PAD_HARD_RADIUS_PX past
    the judged polygon."""
    from .settlement_run_pads import merge_pad_patches
    poly = pad_polygon([[20, 20], [33, 20], [33, 30], [20, 30]])
    rows = [{"id": "pl.b1", "pad": {"parcelId": "b1", "datumM": 15.0, "polygonM": poly}}]
    (first,) = building_pad_patches(rows, "place.t")
    moved = [{"id": "b1", "pad": {"parcelId": "b1", "datumM": 15.2, "polygonM": poly}}]
    (second,) = building_pad_patches(moved, "place.t")
    (merged,) = merge_pad_patches([first], [second])
    assert merged["hardM"] == 0.0


def test_one_pad_maths_every_python_sampler_agrees_on_claywater_family_hut():
    """Decision 0102: the workbench's `pad_ground`, the yard gates'
    `patched_height_at` and the bundle overlay (`pad_overlay`, the runtime's
    twin) read the same padded ground on Claywater's family-hut pad: its core,
    blend and outside golden points, within 1e-4."""
    import json
    from pathlib import Path
    from . import pad_overlay
    from .settlement_run_pads import patched_height_at
    fixture = json.loads((Path(__file__).resolve().parents[3] / "packages/game-core/src/terrain"
                          / "__fixtures__/ground-overlays-claywater.json").read_text())
    overlays = fixture["overlays"]
    hut = next(o for o in overlays if o["id"].endswith(".family-hut"))
    points = [p for p in fixture["points"] if p["pad"] == hut["id"]]
    assert {p["zone"] for p in points} == {"core", "blend", "outside"}
    for p in points:
        base = lambda x, z, b=p["baseM"]: b  # noqa: E731  the frozen ground at the point
        want = pad_overlay.overlay_height(p["baseM"], p["x"], p["z"], overlays)
        assert abs(want - p["expectedM"]) < 1e-4
        workbench = pad_ground(base, [{"id": hut["id"], "polygonM": hut["pieces"][0]["polygonM"],
                                       "datumM": hut["pieces"][0]["datumM"]}])(p["x"], p["z"])
        gates = patched_height_at(type("S", (), {"height_at": staticmethod(base)})(),
                                  overlays)(p["x"], p["z"])
        assert abs(workbench - want) < 1e-4, (p["zone"], workbench, want)
        assert abs(gates - want) < 1e-4, (p["zone"], gates, want)


def test_footprint_samples_are_the_per_point_grid_in_the_same_order():
    """The vectorised sampler returns exactly the vertices then the inside
    grid row by row, as the per-Point loop it replaced did (0 of 300 differed
    on the speed proof; this pins a skewed quad and a concave L)."""
    from shapely.geometry import Point, Polygon
    from worldgen.settlement_run_pads import PAD_SAMPLE_STEP_M, footprint_samples

    def reference(polygon, step=PAD_SAMPLE_STEP_M):
        poly = Polygon(polygon)
        x0, z0, x1, z1 = poly.bounds
        pts = [(float(x), float(z)) for x, z in polygon]
        for i in range(int((z1 - z0) // step) + 1):
            for j in range(int((x1 - x0) // step) + 1):
                x, z = x0 + (j + 0.5) * step, z0 + (i + 0.5) * step
                if poly.contains(Point(x, z)):
                    pts.append((x, z))
        return pts

    quad = [(1203.37, -877.1), (1219.9, -878.4), (1221.2, -861.05), (1201.8, -863.3)]
    ell = [(0.0, 0.0), (9.0, 0.0), (9.0, 3.0), (3.0, 3.0), (3.0, 8.0), (0.0, 8.0)]
    for polygon in (quad, ell):
        assert footprint_samples(polygon) == reference(polygon)
        assert footprint_samples(polygon, 0.7) == reference(polygon, 0.7)
