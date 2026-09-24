"""The province survey cache (16h tooling lane step B #1).

`ProvinceSurvey`, `ProvinceFields` and `ShippedWater` read their decoded
rasters from `.npy` files under `output/survey-cache/`, opened memory-mapped,
keyed on the signature of every source file they derive from. These tests pin
the four promises the cache makes: the cached arrays equal the PNG decode
exactly, a touched source forces a rebuild, every served array is read-only,
and a second survey in one process costs under a second.
"""
from __future__ import annotations

import os
from pathlib import Path
import time

import numpy as np
import pytest

from worldgen import water_report as wr
from worldgen.compile_scatter import ProvinceFields
from worldgen.site_fields import PROVINCE, ProvinceSurvey, _survey_signature, shared_survey
from worldgen.water_report import ArrayCache, ShippedWater

pytestmark = pytest.mark.xdist_group("province-survey")


def _arrays(obj) -> dict[str, np.ndarray]:
    """Every ndarray the object holds or builds lazily. The lazy ones
    (cached_property) are forced first, so the set never depends on which
    of them an earlier test happened to touch."""
    from functools import cached_property
    for name in dir(type(obj)):
        if isinstance(getattr(type(obj), name, None), cached_property):
            getattr(obj, name)
    return {k: v for k, v in vars(obj).items() if isinstance(v, np.ndarray)}


def _assert_equal(cached, fresh, label):
    a, b = _arrays(cached), _arrays(fresh)
    assert a.keys() == b.keys(), f"{label}: {sorted(a.keys() ^ b.keys())}"
    for name in a:
        assert a[name].dtype == b[name].dtype, f"{label}.{name} dtype"
        assert np.array_equal(a[name], b[name]), f"{label}.{name} differs from the PNG decode"


@pytest.fixture(scope="module")
def cached_survey():
    return shared_survey()


def test_cached_arrays_equal_the_png_decode(cached_survey):
    fresh = ProvinceSurvey(PROVINCE, cache=False)
    _assert_equal(cached_survey, fresh, "survey")
    _assert_equal(cached_survey.fields, fresh.fields, "fields")
    _assert_equal(cached_survey.water, fresh.water, "water")
    # the standalone readers (vault height loaded) go through the same cache
    water = ShippedWater()
    _assert_equal(water, ShippedWater(cache=False), "ShippedWater()")


def test_cached_arrays_are_read_only(cached_survey):
    for label, obj in (("survey", cached_survey), ("fields", cached_survey.fields),
                       ("water", cached_survey.water)):
        arrays = _arrays(obj)
        writeable = [k for k, v in arrays.items() if v.flags.writeable]
        assert not writeable, f"{label}: writeable {writeable}"
    lazy = _arrays(cached_survey)
    for prop in ("aspect_grid", "slope_grid", "dist_to_water_m", "dist_to_route_m",
                 "_nearest_wet_index"):        # the walk must reach the lazy ones
        assert prop in lazy, prop


def test_array_cache_returns_read_only_arrays_with_and_without_a_cache(tmp_path):
    for root in (tmp_path / "cache", None):
        c = ArrayCache("t", ("A",), root=root) if root else ArrayCache(None)
        assert not c.array("a", lambda: np.arange(4)).flags.writeable
        assert not c.group("g", lambda: {"b": np.arange(4)})["b"].flags.writeable


def test_water_is_decoded_once(cached_survey):
    assert cached_survey.fields.water is cached_survey.water


def test_second_survey_constructs_under_a_second(cached_survey):
    t0 = time.perf_counter()
    ProvinceSurvey()
    assert time.perf_counter() - t0 < 1.0


def test_touched_source_forces_a_rebuild(tmp_path):
    source = tmp_path / "raster.bin"
    source.write_bytes(b"x")
    calls = []

    def build():
        calls.append(1)
        return {"a": np.arange(4, dtype=np.int64)}

    def load():
        sig = wr.file_signature([source])
        return ArrayCache("t", sig, root=tmp_path / "cache").group("g", build)

    first = load()
    assert np.array_equal(load()["a"], first["a"]) and len(calls) == 1
    st = source.stat()
    os.utime(source, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
    load()
    assert len(calls) == 1, "a save that changes nothing must keep the cache"
    source.write_bytes(b"yz")        # a different size: the key must move whatever the clock tick
    load()
    assert len(calls) == 2, "an edited source must never serve the stale cache"
    assert len(list((tmp_path / "cache" / "t").iterdir())) == 2, "a recent key must survive"


def test_publishing_a_key_keeps_recent_keys_and_prunes_old_ones(tmp_path):
    """Two agents with different signatures never delete each other's key
    (the rebuild thrash, 16h ledger step C); keys older than a week go."""
    root = tmp_path / "cache"

    def publish(sig):
        c = ArrayCache("t", sig, root=root)
        c.group("g", lambda: {"a": np.arange(4)})
        return c.dir

    a = publish(("A",))
    b = publish(("B",))
    assert a.exists() and b.exists(), "publishing key B deleted key A"
    week_ago = b.stat().st_mtime - wr.KEEP_KEYS_S - 60     # b was just published: now
    os.utime(a, (week_ago, week_ago))
    c = publish(("C",))
    assert not a.exists() and b.exists() and c.exists()


def test_namespace_keeps_the_three_most_recently_used_keys(tmp_path):
    root = tmp_path / "cache"

    def cache(sig):
        return ArrayCache("t", sig, root=root)

    def publish(sig, age_s):
        c = cache(sig)
        c.group("g", lambda: {"a": np.arange(4)})
        t = c.dir.stat().st_mtime - age_s                   # just published: now
        os.utime(c.dir, (t, t))
        return c.dir

    a, b, c = publish(("A",), 300), publish(("B",), 200), publish(("C",), 100)
    cache(("A",)).group("g", lambda: {"a": np.arange(4)})    # a hit: A is now the most recent
    d = cache(("D",))
    d.group("g", lambda: {"a": np.arange(4)})
    assert a.exists() and c.exists() and d.dir.exists()
    assert not b.exists(), "the least recently used key is pruned past three"
    assert len(list((root / "t").iterdir())) == 3


def test_survey_signature_covers_every_source():
    """Each file the three readers derive arrays from moves the signature."""
    from worldgen.compile_chunks import DEFAULT_HEIGHTS
    from worldgen.dressing_zones import ZONES_PATH
    from worldgen.routes_raster import REGISTRY_PATH
    sources = [PROVINCE / "hydro-soil.png", PROVINCE / "refined" / "height-rg.png",
               PROVINCE / "water" / "water-surface.png", wr.GRAPH_PATH,
               ZONES_PATH, REGISTRY_PATH, DEFAULT_HEIGHTS]
    signed = {Path(p).resolve() for p, _, _ in _survey_signature(PROVINCE)}
    for path in sources:
        if path.exists():
            assert Path(path).resolve() in signed, f"{path.name} not in the signature"


def test_a_no_op_save_of_a_decoder_module_keeps_the_signature():
    base = _survey_signature(PROVINCE)
    module = Path(wr.__file__)
    st = module.stat()
    try:
        os.utime(module, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
        assert _survey_signature(PROVINCE) == base
    finally:
        os.utime(module, ns=(st.st_atime_ns, st.st_mtime_ns))


def test_fields_standalone_uses_the_cache():
    fields = ProvinceFields()
    assert not fields.height_m.flags.writeable
