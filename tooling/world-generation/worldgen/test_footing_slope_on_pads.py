"""97 B3 on patched ground (planner rulings 7a and 7b, Claywater Station
2026-09-26): the footing-slope rule reads the padded surface wherever a
footprint touches a building pad, never the frozen analysis grid under it;
and a retaining wall of a kit's wall family (0101 rule R1) carries no
footing-slope rule at all, since it stands where the ground steps by design.
Fakes only (no rasters): CI-safe."""

from __future__ import annotations

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
