"""The studio's places.json is a faithful, byte-stable projection of the catalogue."""

import json
from pathlib import Path

import pytest

from . import catalogue
from .export_places import (
    OUT_PATH, SCHEMA_VERSION, _condition_line, build_bundle, export, render, zone_colours,
)

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
        # schemaVersion 2 structured blocks stay lean (short strings/arrays only)
        if p["purposeDetail"]:
            assert set(p["purposeDetail"]) == {"primary", "impact", "secondary"}
        if p["stanceDetail"]:
            assert p["stanceDetail"]["baseline"] == p["stance"]
            assert all(f.startswith("→ ") for f in p["stanceDetail"]["flips"]), p["id"]
        if p["contents"]:
            assert set(p["contents"]) == {"creatures", "npcs", "loot"}
            assert all(isinstance(line, str) for v in p["contents"].values() for line in v)
        if p["travelStation"]:
            assert all(set(d) == {"id", "name"} for d in p["travelStation"]["destinations"])
        assert isinstance(p["questProvisions"], list)


@pytest.mark.skipif(not HAVE_CATALOGUE, reason="no catalogue committed")
def test_interior_detail_agrees_with_the_summary_line():
    for p in build_bundle()["places"]:
        assert (p["interiorDetail"] is None) == (p["interior"] is None), p["id"]
        if p["interiorDetail"]:
            assert p["interior"].startswith(str(p["interiorDetail"]["kind"]))


def test_condition_line_is_a_short_human_clause():
    assert _condition_line(None) == "always"
    assert _condition_line({"notorietyTier": ["region.x", "hunted"]}) == "notorietyTier region.x hunted"
    assert _condition_line({"b": 1, "a": 2}) == "a 2, b 1"


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
    bundle = {"schemaVersion": SCHEMA_VERSION, "zoneColours": {}, "unsitedCount": 0, "places": []}
    assert render(bundle) == render(json.loads(render(bundle)))
    assert render(bundle).endswith("\n")
