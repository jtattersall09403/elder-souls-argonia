"""The authored-route override: the shipped file is valid, and a line the file
names is published exactly as drawn rather than used as a hint."""

import json

import pytest

from worldgen import authored_routes as ar


def _write(tmp_path, routes):
    path = tmp_path / "authored-routes.json"
    path.write_text(json.dumps({"schemaVersion": 1, "kind": "authored-routes",
                                "routes": routes}))
    return path


def test_shipped_file_is_valid():
    rows, errors = ar.load_authored_routes()
    assert errors == []
    assert isinstance(rows, list)


def test_every_shipped_line_records_why():
    # Standard 12: an authored line is a world record, so it carries the record.
    for row in ar.load_by_id().values():
        assert len(row["why"]) >= ar.MIN_WHY_CHARS


def test_a_line_without_a_why_is_rejected(tmp_path):
    path = _write(tmp_path, [{"id": "route.road.x", "pointsM": [[10, 10], [20, 20]]}])
    rows, errors = ar.load_authored_routes(path)
    assert rows == []
    assert any("why" in e for e in errors)
    with pytest.raises(ValueError):
        ar.load_by_id(path)


def test_a_point_outside_the_province_is_rejected(tmp_path):
    path = _write(tmp_path, [{"id": "route.road.x", "why": "w" * 50,
                              "pointsM": [[10, 10], [10, ar.PROVINCE_EXTENT_M + 1]]}])
    _, errors = ar.load_authored_routes(path)
    assert any("outside the province" in e for e in errors)


def test_the_authored_line_is_preserved_exactly(tmp_path):
    """The rasterised chain visits the authored ends and stays on the drawn
    line — it is the source, not a seed for a re-solve."""
    px_m, grid_n = 5.0, 100
    pts = [[10.0, 10.0], [110.0, 10.0], [110.0, 60.0]]
    path = _write(tmp_path, [{"id": "route.road.x", "why": "w" * 50, "pointsM": pts}])
    row = ar.load_by_id(path)["route.road.x"]
    px = ar.to_px(row, px_m, grid_n)
    assert px[0] == [2, 2] and px[-1] == [22, 12]
    assert all(px[i] != px[i + 1] for i in range(len(px) - 1))     # deduped
    # every step is 8-connected: a dense chain, like a solved one
    assert all(max(abs(a[0] - b[0]), abs(a[1] - b[1])) == 1 for a, b in zip(px, px[1:]))
    # and every cell is on one of the drawn legs (rows 2, then column 22)
    assert all(c[1] == 2 or c[0] == 22 for c in px)


def test_the_digest_moves_when_the_line_moves(tmp_path):
    def digest(points):
        (tmp_path / "d").mkdir(exist_ok=True)
        path = _write(tmp_path / "d", [{"id": "r", "why": "w" * 50, "pointsM": points}])
        return ar.load_by_id(path)["r"]["contentDigest"]

    assert digest([[1, 1], [2, 2]]) != digest([[1, 1], [2, 3]])
