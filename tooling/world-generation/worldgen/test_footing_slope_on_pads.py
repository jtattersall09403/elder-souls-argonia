"""97 B3 on patched ground (planner rulings 7a and 7b, Claywater Station
2026-09-26): the footing-slope rule reads the padded surface wherever a
footprint touches a building pad, never the frozen analysis grid under it;
and a retaining wall of a kit's wall family (0101 rule R1) carries no
footing-slope rule at all, since it stands where the ground steps by design.
Fakes only (no rasters): CI-safe."""

from __future__ import annotations

import json
import math

import numpy as np

from . import compile_settlement as cs
from .settlement_run_pads import PaddedSurvey, pad_polygon

FALL = 0.2                                     # 0.2 m per metre east: 11.3 degrees
STEEP_DEG = math.degrees(math.atan(FALL))
DIRECT = {"kit": "settlement-imperial-v1", "id": "vanilla:clutter/barrel01",
          "placement": {"evidence": {"policyId": "direct"}}}
WALL = {"kit": "settlement-imperial-v1", "id": "vanilla:architecture/farmhouse/stonewall/stonewall01",
        "placement": {"evidence": {"policyId": "pad"}}}


class _Survey:
    """Frozen ground falling east; its 5.48 m analysis grid reads the fall."""
    grid_px_m = 5.48
    extent_m = 200.0

    def __init__(self):
        self.slope_grid = np.full((40, 40), STEEP_DEG)

    @staticmethod
    def height_at(x, z):
        return 40.0 - FALL * x


# B1's footprint with a 2 m apron, graded flat to one datum
HOUSE = [[50.0, 50.0], [63.0, 50.0], [63.0, 60.0], [50.0, 60.0]]
PAD = {"polygonM": pad_polygon(HOUSE, 2.0), "datumM": 28.5}
BARREL_ON_APRON = [[63.6, 54.0], [64.4, 54.0], [64.4, 54.8], [63.6, 54.8]]   # 0.6 m past the wall


def test_a_barrel_on_the_apron_reads_the_flat_pad_not_the_frozen_grid():
    frozen, padded = _Survey(), PaddedSurvey(_Survey(), [PAD])
    assert cs.fit_slope_failure(DIRECT, cs.footprint_max_slope_deg(BARREL_ON_APRON, frozen))
    assert cs.footprint_max_slope_deg(BARREL_ON_APRON, padded) == 0.0
    assert cs.fit_slope_failure(DIRECT, cs.footprint_max_slope_deg(BARREL_ON_APRON, padded)) is None


def test_off_the_pad_and_across_its_blend_the_rule_still_fails():
    padded = PaddedSurvey(_Survey(), [PAD])
    far = [[x + 60.0, z] for x, z in BARREL_ON_APRON]                 # 60 m east: no pad
    assert cs.footprint_max_slope_deg(far, padded) == STEEP_DEG      # the grid, as before
    across = [[65.5, 54.0], [67.5, 54.0], [67.5, 55.0], [65.5, 55.0]]  # straddles the pad edge
    assert cs.fit_slope_failure(DIRECT, cs.footprint_max_slope_deg(across, padded))


def test_a_retaining_wall_of_the_kit_family_is_exempt_but_nothing_else_is():
    assert cs.is_retaining_wall(WALL)
    assert cs.fit_slope_failure(WALL, 25.0) is None
    assert cs.fit_slope_failure(DIRECT, 25.0)                        # a floor piece still fails
    mud = {**WALL, "kit": "settlement-mud-v1"}                       # a kit with no wall family
    assert not cs.is_retaining_wall(mud) and cs.fit_slope_failure(mud, 25.0)
    assert cs.fit_slope_failure({**WALL, "id": "vanilla:clutter/barrel01"}, 25.0)


class _SteppedFlatGrid(_Survey):
    """A nearest-pixel height raster (3.66 m cells) whose 0.7 m steps a
    0.5 m probe reads as 54 degrees, over an analysis grid that reads it flat."""

    def __init__(self):
        self.slope_grid = np.zeros((40, 40))

    @staticmethod
    def height_at(x, z):
        return 40.0 - 0.7 * math.floor(x / 3.66)


def test_the_part_off_the_pad_reads_the_grid_not_the_raster_steps():
    padded = PaddedSurvey(_SteppedFlatGrid(), [PAD])
    edge = PAD["polygonM"][1][0]                                     # the pad's west edge x
    straddle = [[edge - 1.0, 54.0], [edge + 0.4, 54.0], [edge + 0.4, 55.0], [edge - 1.0, 55.0]]
    assert cs.footprint_max_slope_deg(straddle, padded) == 0.0
    steep = PaddedSurvey(_Survey(), [PAD])                           # the grid reads 11.3 off it
    assert cs.footprint_max_slope_deg(straddle, steep) == STEEP_DEG


def test_a_retaining_wall_sill_is_measured_on_the_pad_side():
    """Planner ruling 3 (2026-09-26, b1w-sb4 read 0.43 m): the ordinary sill
    (the mean ground under the outline against the ground at the pivot) reads
    the drop the wall retains; on the pad side against the padded ground the
    wall's top meets the pad."""
    padded = PaddedSurvey(_Survey(), [PAD])
    edge = PAD["polygonM"][2][0]                                     # the pad's east edge x
    wall = [(edge - 0.5, 50.0), (edge + 1.5, 50.0), (edge + 1.5, 53.6), (edge - 0.5, 53.6)]
    pivot = (edge + 0.5, 51.8)
    ordinary = abs(sum(padded.height_at(x, z) for x, z in wall) / len(wall) - padded.height_at(*pivot))
    assert ordinary > 0.15
    datum = PAD["datumM"]
    sill = cs.retaining_sill(WALL, padded.height_at, padded.pad_index, wall, pivot, datum + 0.8)
    assert sill == 0.0                                               # its top meets the pad
    short = cs.retaining_sill(WALL, padded.height_at, padded.pad_index, wall, pivot, datum - 0.5)
    assert short is not None and short > 0.15                        # a wall sunk below the pad fails
    assert cs.retaining_sill(DIRECT, padded.height_at, padded.pad_index, wall, pivot, datum + 0.8) is None
    far = [(x + 30.0, z) for x, z in wall]
    assert cs.retaining_sill(WALL, padded.height_at, padded.pad_index, far, (pivot[0] + 30, pivot[1]),
                             datum + 0.8) is None                      # off every pad: the ordinary sill


def test_a_parcel_takes_its_own_piece_fit_not_its_last_dressing_row():
    """compiled_blueprint_objects filled an unauthored groundFit from every
    placement row carrying the parcelId, so a parcel took the fit of its
    last assembly or dressing row and the compile and the export disagreed
    (Claywater publish refusal, 2026-09-26)."""
    class Survey:
        @staticmethod
        def uv_to_m(u, v):
            return u * 100, v * 100

    bp = {"id": "place.t", "parcels": [{"id": "parcel.t.house", "districtId": "d", "use": "dwelling"}]}
    rows = [{"id": "place.t.parcel.t.house.building", "parcelId": "parcel.t.house",
             "objectKind": "parcel", "groundFit": "plinth"},
            {"id": "place.t.parcel.t.house.assembly.a", "parcelId": "parcel.t.house",
             "objectKind": "assembly", "groundFit": "direct"}]
    for order in (rows, rows[::-1]):
        objects, _ = cs.compiled_blueprint_objects(bp, order, [], Survey())
        house = next(o for o in objects if o["id"] == "parcel.t.house")
        assert house["spec"]["groundFit"] == "plinth"


def test_an_assembly_row_carries_the_fit_its_policy_names_not_the_policy_id():
    """Claywater's mudmother baskets and urns rode `interior-zero` into their
    assembly rows (the policy id), which the exporter refuses as an unknown
    groundFit; the row carries the fit the policy names (`record_ground_fit`)."""
    import pytest
    from .site_fields import ProvinceSurvey

    shelf = cs.KitShelf()
    if not shelf.assets_by_kit:
        pytest.skip("built asset kits unavailable (asset-pipeline output is build output)")
    path = next(p for p in cs.bp_mod.blueprint_paths() if p.name.startswith("place.imperial-fringe.claywater"))
    bp = json.loads(path.read_text())["blueprint"]
    result = cs.compile_blueprint(bp, ProvinceSurvey(), shelf)
    fits = {row["groundFit"] for row in result["placements"] if row.get("objectKind") == "assembly"}
    assert fits and fits <= {"direct", "plinth", "pad", "stilt", "dug-in"}, fits
    assert cs.record_ground_fit({"placement": {"evidence": {"policyId": "interior-zero"}}}) == "direct"


def test_a_member_that_left_its_rebuilt_run_leaves_its_pad():
    """A run cut from 5 pieces to 3 keeps no grading under the two it lost
    (merge_pad_patches, review 2026-09-26)."""
    from .settlement_run_pads import merge_pad_patches, pad_patch
    rows = [{"placementId": f"place.t.run.piece.{i}", "targetM": 10.0, "gapM": 0.2,
             "footprintM": [[i * 4.0, 0.0], [i * 4.0 + 4, 0.0], [i * 4.0 + 4, 1.0], [i * 4.0, 1.0]]}
            for i in range(1, 6)]
    old = pad_patch("place.t", "place.t.run", rows, "run")
    live = {"runs": {"place.t.run"}, "buildings": set(),
            "placements": {f"place.t.run.piece.{i}" for i in range(1, 4)}}
    (merged,) = merge_pad_patches([old], [], {"place.t": live})
    assert sorted(r["placementId"] for r in merged["params"]["pieces"]) == sorted(live["placements"])

