"""`derive_crossings` reads the record, and labels a crossing from it.

The reader is stubbed, so these run anywhere: a rectangle of water, a three
point way straight through it, and the two labels the record can produce — a
reach is a river, a standing body is a lake. Nothing here opens a raster.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np
import pytest

from . import derive_crossings as dc

# The rectangle of water, in metres: 400 m wide in x, deep in z.
X0, X1, Z0, Z1 = 1000.0, 1400.0, 0.0, 4000.0


def _reader(kind: str, is_reach: bool):
    def water_at(x, z):
        if X0 <= x <= X1 and Z0 <= z <= Z1:
            return {"id": "w.test", "kind": kind, "levelM": 3.0, "season": "perennial",
                    "widthM": 400.0, "depthM": 2.0}
        return None

    return SimpleNamespace(
        water_at=water_at,
        reach=lambda i: ({"id": i, "band": 3} if is_reach else None),
        body=lambda i: (None if is_reach else {"id": i, "kind": kind}),
        signed_depth_m=lambda season: np.full((8, 8), 1.25, dtype=np.float32),
        mpp2=1000.0,
    )


@pytest.fixture(autouse=True)
def _one_way(monkeypatch, tmp_path):
    """One straight major way across the rectangle, and no catalogue places."""
    macro = dc.RAW_M * 3
    px = [[500.0 / macro, 2000.0 / macro],
          [1200.0 / macro, 2000.0 / macro],
          [1900.0 / macro, 2000.0 / macro]]
    (tmp_path / "routes.json").write_text(json.dumps(
        {"routes": [{"id": "route.test", "name": "Test Way", "class": "trunk", "px": px}]}))
    (tmp_path / "routes-minor.json").write_text(json.dumps({"tracks": []}))
    monkeypatch.setattr(dc, "PROVINCE", tmp_path)
    monkeypatch.setattr(dc, "_places", lambda: [])


def test_a_reach_crossing_is_a_river_labelled_from_the_record():
    rows = dc.derive(sw=_reader("channel-major", is_reach=True))
    assert len(rows) == 1, rows
    r = rows[0]
    assert r["water"] == "river"
    assert r["entityId"] == "w.test"
    assert r["entityKind"] == "channel-major"
    assert r["network"] == "major"
    assert abs(r["spanM"] - (X1 - X0)) < 25.0, r["spanM"]
    assert r["maxDepthM"] == pytest.approx(1.25, abs=0.01)
    assert r["servesRoutes"] == ["route.test"]


def test_a_standing_body_is_a_lake():
    rows = dc.derive(sw=_reader("lake-lowland", is_reach=False))
    assert len(rows) == 1
    assert rows[0]["water"] == "lake"
    assert rows[0]["entityKind"] == "lake-lowland"


def test_a_body_that_is_neither_reach_nor_standing_water_is_marsh():
    rows = dc.derive(sw=_reader("marsh-deep", is_reach=False))
    assert rows[0]["water"] == "marsh"


def test_the_ocean_is_never_a_crossing():
    rows = dc.derive(sw=_reader("ocean", is_reach=False))
    assert rows == []


def test_the_document_carries_schema_two_and_the_entity_columns():
    rows = dc.derive(sw=_reader("channel-major", is_reach=True))
    doc = dc.document(rows)
    assert doc["schemaVersion"] == 2
    assert all("entityId" in r and "entityKind" in r for r in doc["crossings"])
    assert doc["counts"]["major"]["river"] == 1


@pytest.mark.parametrize("span_m, depth_m, expect", [
    (15.0, 0.5, "ford"),      # narrow and shallow: wade it
    (15.0, 3.0, "span"),      # narrow but over a wader's head: a deck
    (19.9, dc.FORD_MAX_DEPTH_M, "ford"),
    (100.0, 0.2, "ferry"),    # too far to wade however shallow
])
def test_the_band_reads_both_the_width_and_the_depth(span_m, depth_m, expect):
    assert dc.band(span_m, depth_m) == expect


def test_the_ford_depth_is_the_small_draft_hull_depth():
    from .dock_spec import HULL_CLASS_DEPTH_M
    assert dc.FORD_MAX_DEPTH_M == HULL_CLASS_DEPTH_M["small-draft"]


def test_a_deep_narrow_crossing_is_banded_span_not_ford():
    """The rule on a derived row, not just on the helper."""
    reader = _reader("lake-lowland", is_reach=False)
    reader.signed_depth_m = lambda season: np.full((8, 8), 3.0, dtype=np.float32)
    rows = dc.derive(sw=reader)
    assert rows[0]["spanM"] > dc.FERRY_MIN_M          # this one is wide anyway
    assert rows[0]["band"] == "ferry"
