"""The plot must refuse ground that cannot deliver a record's typed promise.

Every case is built from synthetic rasters, so the assertions are about the
RULE, not about today's province: a mutation of each rule has to go red.
"""

from __future__ import annotations

import numpy as np
import pytest

from . import terrain_siting as ts

EXTENT_M = 512.0
N = 128
PX = EXTENT_M / N


class _Water:
    def __init__(self, level, cls, flow, owner):
        self.w2, self.mpp2 = level, PX
        self.depth2 = None
        self.cls, self.mppc = cls, PX
        self.flow, self.mppf = flow, PX
        self.owner2 = owner


class _Survey:
    """The five rasters the gate reads, on one shared grid."""

    def __init__(self, *, ground=0.0, level=-10.0, depth=-10.0, cls=0, flow=0.0, channel=0):
        full = lambda v, dtype=np.float32: np.full((N, N), v, dtype)   # noqa: E731
        self.fields = type("F", (), {"height_m": full(ground)})()
        self.height_px_m = PX
        self.water_level_m = full(level)
        self.water_signed_depth_m = full(depth)
        self.water_class_names = ["none", "coast", "estuary", "river", "lake", "marsh"]
        self.water = _Water(self.water_level_m, full(cls, np.uint8), full(flow),
                            full(channel, np.uint8))


def _request(kind, delivery, radius=40.0):
    return {"kind": kind, "radiusM": radius, "delivery": delivery, "note": "test"}


def _blockers(survey, request, x=256.0, z=256.0, **kwargs):
    return ts.TerrainPromiseGate(survey).blockers([request], x, z, **kwargs)


def test_a_raise_is_credited_but_cannot_invent_relief_it_does_not_have():
    request = _request("elevated-cliff-bench",
                       {"feature": "bench", "heightM": 40, "access": "climb-only"}, radius=30.0)
    # A raise is credited at its MEASURED relief efficiency:
    # 40 x 0.7 = 28 m, which flat ground turns into 28 m of relief and a 40 m
    # promise does not accept. A slope that already supplies 12 m does.
    assert any("heightM" in row for row in
               _blockers(_Survey(ground=10.0), request))
    slope = _Survey(ground=10.0)
    zs = np.linspace(0.0, 260.0, N, dtype=np.float32)   # ~0.5 m per metre
    slope.fields.height_m = np.repeat(zs[:, None], N, axis=1)
    assert not _blockers(slope, request, z=EXTENT_M * 0.75)


def test_a_carve_cannot_fill_a_dry_hole_with_water():
    dry = _Survey(ground=10.0, depth=-3.0)
    request = _request("sinkhole", {"feature": "hole", "depthM": 40})
    assert _blockers(dry, request) == ["sinkhole:depthM no-water"]
    # Shallow water plus the 40 m carve does reach it — the carve is real —
    # but only where the carve has not already run (see the committed case).
    puddle = _Survey(ground=10.0, depth=2.0, level=12.0)
    assert not _blockers(puddle, request)
    assert any("depthM" in row for row in
               _blockers(puddle, request, committed=(256.0, 256.0)))


def test_a_channel_relation_needs_a_labelled_channel_that_holds_water():
    request = _request("cut", {"feature": "link", "waterRelation": "channel-linked",
                               "depthClass": "navigable"})
    unlabelled = _Survey(ground=0.0, depth=1.0, level=1.0, cls=4)
    assert "cut:waterRelation no-wet-channel" in _blockers(unlabelled, request)
    labelled = _Survey(ground=0.0, depth=1.0, level=1.0, cls=3, channel=128)
    assert not _blockers(labelled, request)
    # A labelled channel that is dry is not a channel to link to.
    dry_label = _Survey(ground=0.0, depth=-1.0, level=-1.0, cls=3, channel=128)
    assert "cut:waterRelation no-wet-channel" in _blockers(dry_label, request)


def test_a_standing_body_is_neither_the_sea_nor_a_channel():
    delivery = {"feature": "shaft", "depthClass": "below-bed",
                "waterRelation": "below-lake-bed", "widthM": 9}
    request = _request("sinkhole", delivery)
    lake = _Survey(ground=-8.0, depth=8.0, level=4.0, cls=4)
    assert not _blockers(lake, request)
    sea = _Survey(ground=-8.0, depth=8.0, level=0.0, cls=1)
    assert any("standing-body" in row for row in _blockers(sea, request))
    channel = _Survey(ground=-8.0, depth=8.0, level=4.0, cls=4, channel=128)
    assert any("standing-body" in row for row in _blockers(channel, request))


def test_flooded_to_rim_fails_on_ground_the_water_already_covers():
    request = _request("sinkhole", {"feature": "hole", "waterRelation": "flooded-to-rim"})
    survey = _Survey(ground=0.0, depth=-1.0, level=-1.0)
    # a rim ring above a flooded floor: gap within tolerance
    survey.water_signed_depth_m = np.full((N, N), -1.0, np.float32)
    survey.water_signed_depth_m[N // 2 - 6:N // 2 + 6, N // 2 - 6:N // 2 + 6] = 2.0
    survey.water_level_m = np.full((N, N), 0.2, np.float32)
    survey.water.w2 = survey.water_level_m
    assert not _blockers(survey, request)
    drowned = _Survey(ground=0.0, depth=2.0, level=2.0)     # water over every rim
    assert any("rim-drowned" in row for row in _blockers(drowned, request))
    # ...and a rim standing well clear of a pool the carve cannot flood
    high = _Survey(ground=0.0, depth=-1.0, level=-1.0)
    high.water_signed_depth_m = np.full((N, N), -1.0, np.float32)
    high.water_signed_depth_m[N // 2, N // 2] = 1.0
    high.water_level_m = np.full((N, N), -40.0, np.float32)
    high.water.w2 = high.water_level_m
    assert any("rim" in row for row in _blockers(high, request))


def test_a_clearance_promise_measures_the_water_beside_the_rise():
    request = _request("dry-rise", {"feature": "rise", "heightClass": "flood-free",
                                    "waterRelation": "above-flood"})
    # 2.5 m raise over ground level with the water: not 1.4 m clear? it is.
    clear = _Survey(ground=0.0, depth=1.0, level=0.0)
    assert not _blockers(clear, request)
    drowning = _Survey(ground=0.0, depth=1.0, level=2.0)
    assert any("clearance" in row for row in _blockers(drowning, request))


def test_drainage_decides_the_current_and_no_profile_rescues_it():
    request = _request("pool", {"feature": "pool", "current": "standing",
                                "depthClass": "swimming", "waterRelation": "underwater-entry"})
    slack = _Survey(ground=0.0, depth=2.0, level=2.0, flow=0.05)
    assert not _blockers(slack, request)
    river = _Survey(ground=0.0, depth=2.0, level=2.0, flow=0.9)
    assert any("current" in row for row in _blockers(river, request))


def test_a_record_is_not_credited_its_own_already_executed_carve():
    """The shipped rasters carry the last chain's work.

    Inside its own support a record must be judged on the state as it stands,
    or a promise the compiler measurably failed to deliver reads as fine.
    """
    puddle = _Survey(ground=10.0, depth=2.0, level=12.0)
    request = _request("sinkhole", {"feature": "hole", "depthM": 5.0})
    assert not _blockers(puddle, request)                       # 2 m + a 5 m cut
    assert any("depthM" in row for row in
               _blockers(puddle, request, committed=(256.0, 256.0)))


def test_a_water_owned_known_red_request_is_not_the_plots_to_judge(monkeypatch):
    request = _request("sinkhole", {"feature": "hole", "depthM": 40})
    dry = _Survey(ground=10.0, depth=-3.0)
    place = "place.test.somewhere"
    request_id = ts.tr._request_id(place, request)
    monkeypatch.setattr(ts, "load_known_red", lambda: {request_id: {"placeId": place}})
    assert not _blockers(dry, request, place_id=place)
    assert _blockers(dry, request, place_id="place.test.elsewhere")


def test_cross_grid_reads_go_through_world_metres():
    """A raster is never indexed at another raster's pitch."""
    coarse = np.arange(16, dtype=np.float32).reshape(4, 4)
    fine = np.zeros((8, 8), np.float32)
    fine[6, 6] = 1.0
    x, z = np.array([6.0 * 10.0]), np.array([6.0 * 10.0])
    assert ts._sample(fine, 10.0, x, z)[0] == pytest.approx(1.0)
    assert ts._sample(coarse, 20.0, x, z)[0] == pytest.approx(coarse[3, 3])
