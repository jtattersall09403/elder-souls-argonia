"""The on-disk A* route cache (street_router.ROUTE_CACHE_DIR): the same search
is read back in a fresh field, and any change to the terminals, the obstacles
or the ground is a different key."""

import pytest

from . import street_router as sr
from .test_street_router import SurveyStub, _bp, uv


@pytest.fixture
def disk_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(sr, "ROUTE_CACHE_DIR", tmp_path / "street-routes")
    monkeypatch.delenv("ES_ROUTE_CACHE", raising=False)
    calls = []
    original = sr.LocalField._astar_search

    def counted(self, start, goal):
        calls.append((start, goal))
        return original(self, start, goal)

    monkeypatch.setattr(sr.LocalField, "_astar_search", counted)
    sr._FIELD_CACHE.clear()
    sr._ROUTE_CACHE.clear()
    return tmp_path / "street-routes", calls


def _way(end=(330, 320)):
    return {"id": "route.t.disk", "kind": "track", "widthM": 3.0, "routing": "terrain",
            "via": [uv(150, 150), uv(*end)]}


def _hill(x, z):
    return 20.0 if 220 < x < 260 and 200 < z < 280 else 0.0


def _search(way, bp, survey):
    field = sr.LocalField(way, bp, survey)          # a fresh field: no in-memory reuse
    a, b = way["via"][0], way["via"][-1]
    ext = sr._extent_m(survey)
    return field.astar(field.rc(a[0] * ext, a[1] * ext), field.rc(b[0] * ext, b[1] * ext))


def test_same_inputs_hit_the_disk_cache(disk_cache):
    root, calls = disk_cache
    way = _way()
    first = _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 1
    assert len(list(root.rglob("*.json"))) == 1
    second = _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 1, "an identical search in a fresh field must be read from disk"
    assert second == first


def test_a_changed_terminal_obstacle_or_ground_misses(disk_cache):
    root, calls = disk_cache
    way = _way()
    _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 1
    moved = _way(end=(330, 300))
    _search(moved, _bp(moved), SurveyStub(_hill))
    assert len(calls) == 2, "a moved terminal is a new search"
    house = {"id": "parcel.t.house", "footprint": [uv(230, 230), uv(250, 230), uv(250, 250), uv(230, 250)]}
    _search(way, _bp(way, parcels=[house]), SurveyStub(_hill))
    assert len(calls) == 3, "a new obstacle is a new search"
    _search(way, _bp(way), SurveyStub(lambda x, z: _hill(x, z) * 2.0))
    assert len(calls) == 4, "changed ground is a new search"
    assert len(list(root.rglob("*.json"))) == 4


def test_a_changed_cost_constant_misses(disk_cache, monkeypatch):
    _root, calls = disk_cache
    way = _way()
    _search(way, _bp(way), SurveyStub(_hill))
    monkeypatch.setattr(sr, "K_SLOPE", sr.K_SLOPE * 2.0)
    _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 2
    monkeypatch.setattr(sr, "ROUTE_CACHE_VERSION", sr.ROUTE_CACHE_VERSION + 1)
    _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 3


def test_env_switch_disables_the_disk_level(disk_cache, monkeypatch):
    root, calls = disk_cache
    monkeypatch.setenv("ES_ROUTE_CACHE", "0")
    way = _way()
    _search(way, _bp(way), SurveyStub(_hill))
    _search(way, _bp(way), SurveyStub(_hill))
    assert len(calls) == 2
    assert not root.exists()


def test_a_corrupt_entry_is_a_miss_and_is_rewritten(disk_cache):
    root, calls = disk_cache
    way = _way()
    first = _search(way, _bp(way), SurveyStub(_hill))
    (entry,) = root.rglob("*.json")
    entry.write_text("{not json")
    assert _search(way, _bp(way), SurveyStub(_hill)) == first
    assert len(calls) == 2
    assert _search(way, _bp(way), SurveyStub(_hill)) == first
    assert len(calls) == 2
    assert not list(root.rglob("*.tmp"))
