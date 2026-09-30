"""`wb.py paint-check` (16k walk 6): each measure fails on the defect the
owner walked into, and passes once the way is authored right."""
from workbench import paint_rules as pr

BOUNDARY = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]


def _way(rid, pts, width=1.2, **extra):
    from shapely.geometry import LineString
    poly = LineString(pts).buffer(width / 2 + 0.35)
    return {"id": f"paint.{rid}", "routeId": rid, "kind": "footpath", "texture": "track_mud", "edgeM": 0.7,
            "peakAlpha": 0.5, "widthM": width, "centrelineM": pts,
            "polygonM": [list(c) for c in list(poly.exterior.coords)[:-1]], **extra}


def _site(*ways):
    return {"boundaryM": BOUNDARY, "groundPaint": {"schemaVersion": 2, "entries": list(ways)}}


MAIN = _way("main", [[1.0, 50.0], [50.0, 50.0], [50.0, 99.0]], width=2.5, runOutEnds=["start"])
DOOR = {"id": "door.a", "thresholdM": [80.0, 50.0]}


def test_a_spur_that_stops_short_of_the_way_is_dangling():
    got = pr.measure(_site(MAIN, _way("spur", [[53.4, 60.0], [80.0, 50.0]])), [DOOR])
    assert sorted(d["way"] for d in got["danglingEnds"]) == ["main", "spur"]   # 3.4 m off; main's far end is no run-out
    ok = pr.measure(_site({**MAIN, "runOutEnds": ["start", "end"]},
                          _way("spur", [[50.0, 60.0], [80.0, 50.0]])), [DOOR])
    assert ok["danglingEnds"] == [] and ok["doorGaps"] == [] and ok["failures"] == []


def test_two_spurs_off_one_corner_are_acute():
    lodge = _way("lodge", [[50.0, 50.0], [80.0, 50.0]])
    herald = _way("herald", [[50.0, 50.0], [70.0, 35.0], [70.0, 30.0]])      # 37 deg off lodge
    got = pr.measure(_site({**MAIN, "runOutEnds": ["start", "end"]}, lodge, herald),
                     [DOOR, {"id": "door.b", "thresholdM": [70.0, 30.0]}])
    assert {(j["way"], j["host"]) for j in got["acuteJoins"]} >= {("herald", "lodge"), ("lodge", "herald")}
    herald = _way("herald", [[62.0, 50.0], [62.0, 30.0], [70.0, 30.0]])      # off lodge's middle at 90 deg
    ok = pr.measure(_site({**MAIN, "runOutEnds": ["start", "end"]}, lodge, herald),
                    [DOOR, {"id": "door.b", "thresholdM": [70.0, 30.0]}])
    assert ok["acuteJoins"] == [] and ok["failures"] == []


def test_a_door_the_paint_stops_short_of_is_a_gap():
    main = {**MAIN, "runOutEnds": ["start", "end"]}
    got = pr.measure(_site(main, _way("spur", [[50.0, 60.0], [79.0, 60.0]])),
                     [{"id": "door.c", "thresholdM": [80.2, 60.0]}])
    assert [g["door"] for g in got["doorGaps"]] == ["door.c"]


def test_paint_on_the_province_road_fails():
    from shapely.geometry import box
    got = pr.measure(_site({**MAIN, "runOutEnds": ["start", "end"]}), [], road=box(20.0, 40.0, 30.0, 60.0))
    assert got["roadOverlapM2"] > 10 and any("province road" in f for f in got["failures"])


def test_the_old_schema_is_refused():
    got = pr.measure({"groundPaint": {"schemaVersion": 1, "entries": []}}, [])
    assert got["failures"] == ["groundPaint schemaVersion 1, expected 2"]
