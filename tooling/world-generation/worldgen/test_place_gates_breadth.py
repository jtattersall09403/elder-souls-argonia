"""place_gates breadth gates: dressing per dwelling (p50 within 12 m), dressing
asset kinds and top share, light fixture kinds; the injected clock."""
from __future__ import annotations

import inspect

from . import place_gates as pg

ROW = {"dressingPiecesPerDwellingWithin12mMin": 3, "dressingAssetKindsMin": 3,
       "dressingAssetShareMax": 0.5, "lightKindsMin": 2}


def _p(kind, asset, pos, layer=None, parcel=None, pid=None):
    return {"objectKind": kind, "assetId": asset, "positionM": list(pos), "layer": layer,
            "parcelId": parcel, "id": pid or f"x.{asset}"}


def _scene():
    house = _p("parcel", "house", (0, 0, 0), parcel="parcel.a", pid="place.x.parcel.a.building")
    far = _p("parcel", "house", (100, 0, 0), parcel="parcel.b", pid="place.x.parcel.b.building")
    near = [_p("assembly", "barrel", (3, 0, 0), "clutter"), _p("assembly", "barrel", (0, 0, 11.9), "clutter"),
            _p("assembly", "lantern", (1, 2, 0), "light"),
            _p("assembly", "stairs", (1, 0, 1), "steps"),               # R6 counts it; no dressing kind
            _p("assembly", "barrel", (12.5, 0, 0), "clutter"),          # beyond 12 m
            _p("assembly", "barrel", (0, 20, 0), "clutter"),            # 20 m above
            _p("effect", "fx:smoke", (0, 0, 1), "light"),               # an effect: no fixture; R6 counts it
            {**_p("parcel", "wall", (2, 0, 0), parcel="parcel.w", pid="place.x.parcel.w.piece.1"),
             "run": {"id": "parcel.w"}},                                # a modular-run piece: R6 drops it
            _p("fence", "fence", (0, 0, 2))]                            # a fence piece: R6 drops it
    return [house, far] + near


def test_measure_counts_dressing_within_reach_of_each_dwelling():
    m = pg.breadth_measure(_scene(), {"parcel.a", "parcel.b"})
    # R6: 3 dressing + the stairs + the effect; not the shells, the run or the fence
    assert m["dressingPerDwelling"] == {"parcel.a": 5, "parcel.b": 0}
    assert m["dressingPerDwellingP50"] == 2.5
    assert m["dressingPieces"] == 5 and m["dressingAssetKinds"] == 2
    assert m["topDressingAsset"] == "barrel" and m["topDressingAssetShare"] == 0.8
    assert m["lightKinds"] == ["lantern"] and m["dwellingsWithoutAnchor"] == []


def test_each_bar_fails_on_its_own_shortfall():
    m = pg.breadth_measure(_scene(), {"parcel.a", "parcel.b"})
    f = pg.breadth_failures(m, ROW, "M1")
    assert set(f) == set(pg.BREADTH_BARS)
    assert all(len(v) == 1 for v in f.values()), f
    f = pg.breadth_failures(m, {**ROW, "dressingPiecesPerDwellingWithin12mMin": 3}, "M1")
    assert "p50 2.5 < 3" in f["dressingPiecesPerDwellingWithin12mMin"][0]
    assert "barrel is 0.80" in f["dressingAssetShareMax"][0]
    loose = {"dressingPiecesPerDwellingWithin12mMin": 1, "dressingAssetKindsMin": 2,
             "dressingAssetShareMax": 0.8, "lightKindsMin": 1}
    assert not any(pg.breadth_failures(m, loose, "M1").values())


def test_r6_reach_is_measured_from_the_footprint_not_the_pivot():
    """0105 R6: within 12 m of the dwelling's footprint: a piece 12.5 m from
    the pivot but 2.5 m from a 10 m-wide footprint counts."""
    square = {"parcel.a": [(-10, -5), (10, -5), (10, 5), (-10, 5)]}
    by_pivot = pg.breadth_measure(_scene(), {"parcel.a"})["dressingPerDwelling"]["parcel.a"]
    by_footprint = pg.breadth_measure(_scene(), {"parcel.a"}, square)["dressingPerDwelling"]["parcel.a"]
    assert by_footprint == by_pivot + 1


def test_a_dwelling_without_an_anchor_fails():
    m = pg.breadth_measure(_scene(), {"parcel.a", "parcel.gone"})
    assert m["dwellingsWithoutAnchor"] == ["parcel.gone"]
    assert "parcel.gone" in pg.breadth_failures(m, ROW, "M1")["dressingPiecesPerDwellingWithin12mMin"][0]


def test_gates_one_row_per_bar_and_no_compile_fails_each():
    g = pg.Gates()
    pg.breadth_gates(g, {"placements": _scene()}, {"parcel.a"}, "M1", ROW)
    rows = {r["id"]: r for r in g.rows}
    assert list(rows) == [f"breadth.{b}" for b in pg.BREADTH_BARS]
    assert rows["breadth.dressingPiecesPerDwellingWithin12mMin"]["ok"]
    assert rows["breadth.lightKindsMin"]["bar"] == 2 and not rows["breadth.lightKindsMin"]["ok"]
    g = pg.Gates()
    pg.breadth_gates(g, None, {"parcel.a"}, "M1", ROW)
    assert len(g.rows) == len(pg.BREADTH_BARS) and not any(r["ok"] for r in g.rows)


def test_measured_bars_are_not_listed_as_not_measured():
    assert not set(pg.BREADTH_BARS) & set(pg.NOT_MEASURED)


def test_run_takes_its_clock_from_the_caller():
    """Standard 6: run() reads no wall clock; the CLI injects `now`."""
    param = inspect.signature(pg.run).parameters["now"]
    assert param.kind is param.KEYWORD_ONLY and param.default is param.empty
    assert "datetime" not in inspect.getsource(pg)


def test_r6_leaves_out_natural_references_and_markers_but_counts_crops():
    # 0105 R33: the bar was measured with trees, rocks, wild plants and markers left out
    base = {"objectKind": "assembly", "positionM": [0.0, 0.0, 0.0]}
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:trees/treepineforest01"})
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:landscape/rocks/rocklargemoss01"})
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:plants/fernbush01"})
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:markers/idlemarker"})
    assert pg.is_r6_counted({**base, "assetId": "vanilla:plants/farmcabbage01"})
    assert pg.is_r6_counted({**base, "assetId": "vanilla:clutter/barrel01"})
    # a mod's wild plant outside a top-level plants/ folder, an ambient mist, a named run piece
    assert not pg.is_r6_counted({**base, "assetId": "tropicalskyrim:landscaping/plants/fern01"})
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:effects/fxmistlow01"})
    assert not pg.is_r6_counted({**base, "assetId": "vanilla:architecture/farmhouse/fencefarm01"})


def test_0098_place_reads_the_type_bar_from_the_record():
    """GREENSPRING3 ruling 1 (planner 2026-09-28): a Hist village (type 2)
    carries shellsMin 3 / topShellShareMax 0.50 from breadth-bars.json's type
    overrides; a road station (type 1) keeps its column's numbers."""
    from . import breadth_bars as bb
    record = bb.load()
    hist = pg.place_bars({"classification": {"type": "hist-village"}, "culture": "argonian-mud"}, 8)
    road = pg.place_bars({"classification": {"type": "road-station-village"}, "culture": "imperial"}, 8)
    over = record["types"]["2"]["overrides"]
    assert hist[:2] == ("M2", 2) and road[:2] == ("M2", 1)
    assert hist[2]["shellsMin"] == over["shellsMin"]["value"] == 3
    assert hist[2]["topShellShareMax"] == over["topShellShareMax"]["value"] == 0.5
    assert all(v.get("why") for v in over.values())
    m2 = record["tiers"]["M2"]
    assert road[2]["shellsMin"] == m2["shellsMin"]["value"]
    assert road[2]["topShellShareMax"] == m2["topShellShareMax"]["value"]
