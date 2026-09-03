"""The studio's places.json is a faithful, byte-stable projection of the catalogue."""

import json
from pathlib import Path

import pytest

from . import catalogue
from .export_places import OUT_PATH, SCHEMA_VERSION, build_bundle, export, render, zone_colours

HAVE_CATALOGUE = any(catalogue.CATALOGUE_DIR.glob("places-*.json"))


def test_zone_colours_are_css_hex_for_every_culture():
    for name, hex_ in zone_colours().items():
        assert hex_.startswith("#") and len(hex_) == 7, name


@pytest.mark.skipif(not HAVE_CATALOGUE, reason="no catalogue committed")
def test_bundle_shape():
    bundle = build_bundle()
    assert bundle["schemaVersion"] == SCHEMA_VERSION
    ids = [p["id"] for p in bundle["places"]]
    assert ids == sorted(ids) and len(ids) == len(set(ids))
    for p in bundle["places"]:
        assert 0.0 <= p["position"]["u"] <= 1.0 and 0.0 <= p["position"]["v"] <= 1.0
        assert p["region"] in bundle["zoneColours"], p["id"]
        assert set(p["why"]) == {"founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf"}


@pytest.mark.skipif(not HAVE_CATALOGUE, reason="no catalogue committed")
@pytest.mark.skipif(not OUT_PATH.exists(), reason="places.json not exported")
def test_committed_export_matches_catalogue(tmp_path: Path):
    """Re-export to a temp dir and compare bytes: a catalogue edit without a
    re-export (python3 -m worldgen.export_places) fails here, not in review."""
    fresh = tmp_path / "places.json"
    export(fresh)
    assert fresh.read_bytes() == OUT_PATH.read_bytes(), (
        "apps/world-studio/public/province/places.json is stale — run "
        "`python3 -m worldgen.export_places` from tooling/world-generation")


def test_render_is_byte_stable():
    bundle = {"schemaVersion": 1, "zoneColours": {}, "unsitedCount": 0, "places": []}
    assert render(bundle) == render(json.loads(render(bundle)))
    assert render(bundle).endswith("\n")
