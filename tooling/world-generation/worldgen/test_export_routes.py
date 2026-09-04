"""routes-index.json is a faithful, byte-stable projection of the route registry."""

from pathlib import Path

import pytest

from . import route_registry
from .export_routes import OUT_PATH, SCHEMA_VERSION, build_bundle, export, render


def test_bundle_keys_every_registry_route_by_id():
    bundle = build_bundle()
    ids = [r["id"] for r in route_registry.load()]
    assert bundle["schemaVersion"] == SCHEMA_VERSION
    assert sorted(bundle["routes"]) == sorted(ids)
    for rid, r in bundle["routes"].items():
        assert rid.startswith("route.")
        assert r["mode"] and r["class"] and r["from"] and r["to"]
        assert isinstance(r["sources"], list) and isinstance(r["aliases"], list)


@pytest.mark.skipif(not OUT_PATH.exists(), reason="routes-index.json not exported")
def test_committed_export_matches_registry(tmp_path: Path):
    fresh = tmp_path / "routes-index.json"
    export(fresh)
    assert fresh.read_bytes() == OUT_PATH.read_bytes(), (
        "apps/world-studio/public/province/routes-index.json is stale — run "
        "`python3 -m worldgen.export_routes` from tooling/world-generation")


def test_render_is_byte_stable():
    out = render({"schemaVersion": SCHEMA_VERSION, "routes": {}})
    assert out.endswith("\n") and render({"schemaVersion": SCHEMA_VERSION, "routes": {}}) == out
