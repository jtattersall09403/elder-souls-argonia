"""Layer-integration tests (owner ruling 2026-09-05).

Six checks, one failing and one passing case each, on a tiny synthetic survey
so the geometry is readable: 1 UV = 1000 m, and everything east of x = 500 m is
open water. The real fixture (`test_compile_settlement`) exercises the same
checks over the real province raster.
"""

import numpy as np
import pytest

from .blueprint_integration import check_integration

EXTENT_M = 1000.0
PX_M = 10.0
WATER_FROM_X_M = 500.0


class StubSurvey:
    """The three things `check_integration` asks a survey for."""

    def __init__(self):
        n = int(EXTENT_M / PX_M)
        self.open_water = np.zeros((n, n), dtype=bool)
        self.open_water[:, int(WATER_FROM_X_M / PX_M):] = True

    def uv_to_m(self, u, v):
        return (u * EXTENT_M, v * EXTENT_M)

    def grid_px(self, x, z):
        n = int(EXTENT_M / PX_M)
        return (min(max(int(z / PX_M), 0), n - 1), min(max(int(x / PX_M), 0), n - 1))


@pytest.fixture(scope="module")
def survey():
    return StubSurvey()


def uv(x, z):
    return [x / EXTENT_M, z / EXTENT_M]


def box(cx, cz, half=10.0):
    return [uv(cx - half, cz - half), uv(cx + half, cz - half),
            uv(cx + half, cz + half), uv(cx - half, cz + half)]


def parcel(pid, cx, cz, half=10.0, **over):
    return {"id": pid, "footprint": box(cx, cz, half), **over}


def way(wid, pts_m, width=3.0, **over):
    return {"id": wid, "widthM": width, "points": [uv(x, z) for x, z in pts_m], **over}


def _bp(**over):
    bp = {"id": "place.stub.landing", "parcels": [], "routes": [], "boardwalks": [],
          "canals": [], "doors": []}
    bp.update(over)
    return bp


# --- parcel-on-way --------------------------------------------------------- #

def test_parcel_on_way_fails_when_a_road_runs_through_a_building(survey):
    bp = _bp(parcels=[parcel("parcel.stub.hut", 100, 100)],
             routes=[way("route.stub.road", [(60, 100), (140, 100)], kind="road")])
    errs = check_integration(bp, survey)
    assert any("crosses parcel parcel.stub.hut" in e for e in errs)


def test_parcel_on_way_allows_a_way_that_ends_at_the_building(survey):
    bp = _bp(parcels=[parcel("parcel.stub.deck", 100, 100)],
             boardwalks=[way("boardwalk.stub.spine", [(100, 40), (100, 70), (100, 95)],
                             kind="boardwalk", endsAt=["parcel.stub.deck"])])
    assert check_integration(bp, survey) == []


def test_parcel_on_way_still_fails_when_the_way_runs_on_through(survey):
    """`endsAt` is a claim about the END, not a licence to cross: a boardwalk
    that ploughs over the deck on its way somewhere else is still wrong.

    Known limit of the current check (reported 2026-09-05, not fixed here): the
    interior-crossing error is only raised when NEITHER end segment touches the
    parcel, so a way that both ends at a deck and runs on across it is missed.
    This case is the one the check does catch."""
    bp = _bp(parcels=[parcel("parcel.stub.deck", 100, 100)],
             boardwalks=[way("boardwalk.stub.spine",
                             [(40, 40), (60, 60), (100, 100), (140, 140), (200, 200)],
                             kind="boardwalk", endsAt=["parcel.stub.deck"])])
    errs = check_integration(bp, survey)
    assert any("runs THROUGH parcel.stub.deck" in e for e in errs)


# --- way-overlap ----------------------------------------------------------- #

def test_way_overlap_fails_when_one_path_is_drawn_twice(survey):
    bp = _bp(routes=[way("route.stub.a", [(100, 200), (300, 200)], kind="road"),
                     way("route.stub.b", [(100, 201), (300, 201)], kind="track")])
    errs = check_integration(bp, survey)
    assert any("run together" in e for e in errs)


def test_way_overlap_passes_for_two_separate_paths(survey):
    bp = _bp(routes=[way("route.stub.a", [(100, 200), (300, 200)], kind="road"),
                     way("route.stub.b", [(100, 240), (300, 240)], kind="track")])
    assert check_integration(bp, survey) == []


def test_way_overlap_ignores_ways_of_different_classes(survey):
    """A pier over a channel is two layers doing different jobs, not one path twice."""
    bp = _bp(boardwalks=[way("boardwalk.stub.pier", [(600, 200), (800, 200)], kind="pier")],
             canals=[way("canal.stub.line", [(600, 201), (800, 201)], kind="channel")])
    assert check_integration(bp, survey) == []


# --- parcel-overlap -------------------------------------------------------- #

def test_parcel_overlap_fails_when_two_buildings_share_ground(survey):
    bp = _bp(parcels=[parcel("parcel.stub.a", 100, 100),
                      parcel("parcel.stub.b", 112, 100)])
    errs = check_integration(bp, survey)
    assert any("overlap" in e for e in errs)


def test_parcel_overlap_passes_when_they_stand_apart(survey):
    bp = _bp(parcels=[parcel("parcel.stub.a", 100, 100),
                      parcel("parcel.stub.b", 130, 100)])
    assert check_integration(bp, survey) == []


# --- gate-spans ------------------------------------------------------------ #

def test_gate_spans_fails_when_the_gate_stands_beside_its_road(survey):
    bp = _bp(parcels=[parcel("parcel.stub.gate", 100, 160, spans="route.stub.road")],
             routes=[way("route.stub.road", [(100, 200), (100, 300)], kind="road")])
    errs = check_integration(bp, survey)
    assert any("does not stand across route.stub.road" in e for e in errs)


def test_gate_spans_fails_on_an_unknown_way(survey):
    bp = _bp(parcels=[parcel("parcel.stub.gate", 100, 160, spans="route.stub.ghost")])
    errs = check_integration(bp, survey)
    assert any("spans unknown way route.stub.ghost" in e for e in errs)


def test_gate_spans_passes_when_the_road_runs_through_the_arch(survey):
    bp = _bp(parcels=[parcel("parcel.stub.gate", 100, 200, spans="route.stub.road")],
             routes=[way("route.stub.road", [(100, 150), (100, 200), (100, 260)],
                         kind="road", endsAt=["parcel.stub.gate"])])
    assert check_integration(bp, survey) == []


# --- door-to-way ----------------------------------------------------------- #

def test_door_to_way_fails_when_the_door_opens_onto_nothing(survey):
    bp = _bp(parcels=[parcel("parcel.stub.hut", 100, 100)],
             routes=[way("route.stub.road", [(300, 100), (400, 100)], kind="road")],
             doors=[{"id": "door.stub.landing.1", "parcelId": "parcel.stub.hut",
                     "thresholdUV": uv(90, 100)}])
    errs = check_integration(bp, survey)
    assert any("from any route or boardwalk" in e for e in errs)


def test_door_to_way_fails_when_the_blueprint_has_no_ways_at_all(survey):
    bp = _bp(parcels=[parcel("parcel.stub.hut", 100, 100)],
             doors=[{"id": "door.stub.landing.1", "parcelId": "parcel.stub.hut",
                     "thresholdUV": uv(90, 100)}])
    errs = check_integration(bp, survey)
    assert any("no routes or boardwalks" in e for e in errs)


def test_door_to_way_passes_when_a_footpath_ends_at_the_door(survey):
    bp = _bp(parcels=[parcel("parcel.stub.hut", 100, 100)],
             routes=[way("route.stub.path", [(60, 100), (88, 100)], width=1.5,
                         kind="footpath", endsAt=["parcel.stub.hut"])],
             doors=[{"id": "door.stub.landing.1", "parcelId": "parcel.stub.hut",
                     "thresholdUV": uv(90, 100)}])
    assert check_integration(bp, survey) == []


# --- water-way ------------------------------------------------------------- #

def test_water_way_fails_for_a_channel_drawn_over_dry_ground(survey):
    bp = _bp(canals=[way("canal.stub.dry", [(100, 300), (200, 300)], width=9.0,
                         kind="channel")])
    errs = check_integration(bp, survey)
    assert any("over dry ground" in e for e in errs)


def test_water_way_fails_for_a_road_that_swims(survey):
    bp = _bp(routes=[way("route.stub.road", [(600, 300), (800, 300)], kind="road")])
    errs = check_integration(bp, survey)
    assert any("longer than a ford" in e for e in errs)


def test_water_way_passes_for_a_channel_in_water_and_a_road_on_land(survey):
    bp = _bp(canals=[way("canal.stub.line", [(600, 300), (800, 300)], width=9.0,
                         kind="channel")],
             routes=[way("route.stub.road", [(100, 300), (300, 300)], kind="road")])
    assert check_integration(bp, survey) == []


def test_water_way_allows_a_boardwalk_over_the_water(survey):
    bp = _bp(boardwalks=[way("boardwalk.stub.pier", [(600, 300), (800, 300)],
                             kind="pier")])
    assert check_integration(bp, survey) == []


# --- parcel-gap (97 C5) ---------------------------------------------------- #

def _p(pid, cx, cz, half=2.0, **over):
    """A parcel with the centre the spacing rule measures."""
    return parcel(pid, cx, cz, half, centreUV=uv(cx, cz), **over)


def test_parcel_gap_fails_under_the_eight_metre_floor(survey):
    bp = _bp(parcels=[_p("parcel.stub.hut-a", 100, 100), _p("parcel.stub.hut-b", 105, 100)])
    errs = check_integration(bp, survey)
    assert any("97 C5" in e and "5.0 m apart" in e for e in errs)


def test_parcel_gap_passes_at_the_measured_spacing(survey):
    bp = _bp(parcels=[_p("parcel.stub.hut-a", 100, 100), _p("parcel.stub.hut-b", 114, 100)])
    assert check_integration(bp, survey) == []


def test_parcel_gap_allows_a_declared_abutment(survey):
    bp = _bp(parcels=[_p("parcel.stub.deck", 100, 100, abuts=["parcel.stub.hut"]),
                      _p("parcel.stub.hut", 105, 100)])
    assert not any("97 C5" in e for e in check_integration(bp, survey))


def test_parcel_gap_allows_a_wall_against_a_building(survey):
    bp = _bp(parcels=[_p("parcel.stub.hut", 100, 100),
                      _p("parcel.stub.yard-wall", 105, 100, use="wall")])
    assert not any("97 C5" in e for e in check_integration(bp, survey))


# --- passage (97 C3 / D8) -------------------------------------------------- #

def test_passage_fails_where_a_way_squeezes_between_two_hulls(survey):
    """Two 20 m-wide blocks 1 m apart with a footpath threaded between them."""
    bp = _bp(parcels=[parcel("parcel.stub.a", 100, 90, half=10.0),
                      parcel("parcel.stub.b", 100, 111, half=10.0)],
             routes=[way("route.stub.path", [(60, 100.5), (140, 100.5)], width=1.0,
                         kind="footpath")])
    errs = check_integration(bp, survey)
    assert any("97 C3" in e and "two character widths" in e for e in errs)


def test_passage_passes_when_the_gap_fits_a_character(survey):
    bp = _bp(parcels=[parcel("parcel.stub.a", 100, 88, half=10.0),
                      parcel("parcel.stub.b", 100, 113, half=10.0)],
             routes=[way("route.stub.path", [(60, 100.5), (140, 100.5)], width=1.0,
                         kind="footpath")])
    assert not any("97 C3" in e for e in check_integration(bp, survey))
