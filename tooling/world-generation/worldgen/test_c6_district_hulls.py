"""97 C6 per district (0101 rule 5, planner ruling 2026-09-26, Claywater
slice 1c): the built ground is the union of the district hulls, each buffered
by half the column's maximum building spacing (breadth-bars.json), and the
band is the column the place is built under. On the old rule (one 15 m-buffered
hull across the road and ford, the M2 village band) Claywater read 7.5/ha
against 15-33/ha."""

from __future__ import annotations

import json

from . import blueprint as B
from . import breadth_bars as bb
from . import parcel_kinds as pk



def _claywater():
    path = next(p for p in B.blueprint_paths() if p.name == "place.imperial-fringe.claywater-station.json")
    return json.loads(path.read_text())["blueprint"]


def _counted(bp):
    kinds = pk.kinds_of(bp)
    return kinds, [p for p in pk.counted_parcels(bp, kinds) if (p.get("use") or "") not in ("fence", "wall")]


def test_claywater_is_built_under_the_hamlet_column_with_its_own_band_and_buffer():
    bp = _claywater()
    kinds, _ = _counted(bp)
    column, band, buffer_m = B.density_column(bp, kinds, B.size_class(bp))
    assert B.size_class(bp) == "M2" and column == "M1"
    assert band == (7.0, 16.0) and buffer_m == 9.5


def test_claywater_c6_is_the_union_of_its_district_hulls_and_passes():
    bp = _claywater()
    kinds, parcels = _counted(bp)
    one_hull = len(parcels) / B.built_hull_area_ha(bp, parcels)          # the old measure
    assert one_hull < 15.0     # below the old M2 village band's floor (15-33/ha)
    _, band, buffer_m = B.density_column(bp, kinds, B.size_class(bp))
    area, per = B.district_hull_area_ha(bp, parcels, buffer_m)
    # the landing stage folded into the-landing (walk-2 residual, L73)
    assert set(per) == {"district.claywater-station.the-well", "district.claywater-station.the-landing"}
    assert area <= sum(a for _, a in per.values()) + 1e-9               # a union, never a span
    assert band[0] <= len(parcels) / area <= band[1]
    assert not [w for w in B._placement_warnings(bp) if "97 C6" in w]


def test_two_districts_far_apart_are_not_one_hull_across_the_gap():
    bp = _claywater()
    _, parcels = _counted(bp)
    far = []
    for p in parcels:                                    # the landing 1 km further north
        q = dict(p)
        if q["districtId"].endswith("the-landing"):
            q["footprint"] = [[u, v - 1000.0 / B.fp.PROVINCE_EXTENT_M] for u, v in q["footprint"]]
        far.append(q)
    near_area, _ = B.district_hull_area_ha(bp, parcels, 9.5)
    far_area, _ = B.district_hull_area_ha(bp, far, 9.5)
    assert abs(far_area - near_area) < 0.05                             # the gap adds nothing


def test_every_column_carries_its_c6_band_and_spacing():
    record = bb.load()
    for tier in bb.TIERS:
        lo, hi = record["tiers"][tier]["densityPerHa"]["value"]
        assert 0 < lo < hi
        assert len(record["tiers"][tier]["buildingSpacingM"]["value"]) == 2
    assert bb.built_column(5, record) == "M1" and bb.built_column(8, record) == "M2"
    assert bb.built_column(2, record) is None
