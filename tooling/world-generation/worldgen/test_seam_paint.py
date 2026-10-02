"""The building-to-ground seam (16k walk 9): `export_settlement_bundle.seam_paint`."""
from shapely.geometry import Point, Polygon

from . import export_settlement_bundle as ex


def _row(pid, fp, fit="direct", pad=None):
    return {"id": pid, "footprintM": fp, "anchor": {"groundFit": fit},
            **({"pad": {"polygonM": pad}} if pad else {})}


def _site():
    return {"groundPaint": {"schemaVersion": 2, "entries": []}}


def test_every_building_gets_a_trampled_ring_and_a_contact_shade_with_a_floor_hole():
    site = _site()
    rows = [_row("p.a.building", [[0, 0], [10, 0], [10, 8], [0, 8]]),
            _row("p.a.assembly.basket", [[1, 1], [3, 1], [3, 3], [1, 3]]),     # not a building
            _row("p.well.building", [[20, 0], [21, 0], [21, 1], [20, 1]])]     # under 4 m2
    ex.seam_paint(site, rows, lambda x, z: False)
    by_kind = {e["kind"]: e for e in site["groundPaint"]["entries"]}
    assert sorted(by_kind) == ["seam-ring", "shade"]
    ring, shade = by_kind["seam-ring"], by_kind["shade"]
    assert ring["texture"] == ex.SEAM_RING_TEXTURE and shade["texture"] == "shade"
    assert Polygon(ring["polygonM"]).contains(Point(-1.4, 4))
    assert not Polygon(ring["polygonM"]).contains(Point(-1.6, 4))
    assert Polygon(shade["polygonM"]).contains(Point(0.1 - ex.SEAM_SHADE_GROW_M, 4))
    assert not Polygon(shade["polygonM"]).contains(Point(-0.1 - ex.SEAM_SHADE_GROW_M, 4))
    # the floor is a hole inset from the walls; the shade peaks at the wall
    assert Polygon(shade["holeM"]).contains(Point(5, 4))
    assert not Polygon(shade["holeM"]).contains(Point(0.3, 4))
    assert shade["edgeM"] == ex.SEAM_SHADE_GROW_M and shade["peakAlpha"] == ex.SEAM_SHADE_ALPHA


def test_a_stilt_building_gets_shade_only_on_dry_ground_and_a_pad_widens_the_ring():
    site = _site()
    rows = [_row("p.s.building", [[0, 0], [10, 0], [10, 8], [0, 8]], fit="stilt"),
            _row("p.h.building", [[30, 0], [36, 0], [36, 6], [30, 6]],
                 pad=[[28, -2], [38, -2], [38, 8], [28, 8]])]
    ex.seam_paint(site, rows, lambda x, z: 5 < x < 20)     # the stilt house's east half stands in water
    stilt = [e for e in site["groundPaint"]["entries"] if ".p.s." in e["id"]]
    assert [e["kind"] for e in stilt] == ["shade"] and "holeM" not in stilt[0]
    assert max(x for x, _ in stilt[0]["polygonM"]) <= 5.0 + ex.SEAM_WET_CELL_M   # wet cells at 0.5 m
    [ring] = [e for e in site["groundPaint"]["entries"] if e["kind"] == "seam-ring"]
    assert Polygon(ring["polygonM"]).contains(Point(26.7, 3))       # 1.5 m past the pad, not the walls


def test_the_paint_clip_keeps_a_seam_under_its_floor():
    site = _site()
    ex.seam_paint(site, [_row("p.a.building", [[0, 0], [10, 0], [10, 8], [0, 8]])], lambda x, z: False)
    before = [dict(e) for e in site["groundPaint"]["entries"]]
    ex.clip_ground_paint(site, [{"id": "treatment.p.a.building", "kind": "floor",
                                 "footprintM": [[0, 0], [10, 0], [10, 8], [0, 8]]}], road=None)
    assert site["groundPaint"]["entries"] == before
