"""The terrain chain must SETTLE: no stage may be carved for its own output.

This is the cheap, repeatable stand-in for the acceptance test nobody can
afford to run often — "two chain runs on unchanged sources publish
byte-identical files". A full province build is minutes; these fixtures are
milliseconds, and they fail on the exact code sites where the cycle lived.

Re-run this whenever you change the chain. If a new stage starts reading a
published route file inside the carve, the first test here catches it before
the province does.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import carve_routes
from .routes_raster import rasterize_minor_paint

PKG = Path(__file__).resolve().parent


def _province(tmp_path: Path) -> Path:
    p = tmp_path / "province"
    p.mkdir()
    (p / "routes-natural.json").write_text(json.dumps(
        {"routes": [{"class": "road", "px": [[2, 2], [2, 20], [20, 20]]}]}))
    (p / "routes.json").write_text((p / "routes-natural.json").read_text())
    (p / "routes-minor.json").write_text(json.dumps(
        {"tracks": [{"kind": "track", "px": [[4, 4], [4, 18]]}]}))
    return p


def _repaired(px):
    """What `reroute_majors` does to a road: bend it round steep ground."""
    return [[x + 1, y] for x, y in px]


def test_carve_is_deaf_to_the_roads_it_causes(tmp_path):
    """`reroute_majors` rewriting `routes.json` must not move the next carve."""
    p = _province(tmp_path)
    before = carve_routes.carve_polylines(p)
    assert before, "fixture produced no polylines"

    doc = json.loads((p / "routes.json").read_text())
    doc["routes"][0]["px"] = _repaired(doc["routes"][0]["px"])
    (p / "routes.json").write_text(json.dumps(doc))

    assert carve_routes.carve_polylines(p) == before
    assert carve_routes.drift(p) == [], "majors are frozen from routes-natural.json"


def test_minor_paint_is_deaf_to_the_network_it_causes(tmp_path):
    """`compile_minor_routes` re-solving must not move the next minor paint."""
    p = _province(tmp_path)
    shape = (32, 32)
    snap = carve_routes.carve_source("routes-minor.json", p)
    before = rasterize_minor_paint(shape, 1, (0, 0), path=snap)

    (p / "routes-minor.json").write_text(json.dumps(
        {"tracks": [{"kind": "track", "px": [[9, 4], [9, 18]]}]}))

    after = rasterize_minor_paint(
        shape, 1, (0, 0), path=carve_routes.carve_source("routes-minor.json", p))
    assert np.array_equal(before, after)
    assert carve_routes.drift(p) == ["routes-minor.json"], "drift must be REPORTED"


def test_promote_is_the_only_way_the_carve_moves(tmp_path):
    p = _province(tmp_path)
    carve_routes.carve_source("routes-minor.json", p)
    (p / "routes-minor.json").write_text(json.dumps(
        {"tracks": [{"kind": "track", "px": [[9, 4], [9, 18]]}]}))
    assert carve_routes.promote(p)
    assert carve_routes.drift(p) == []
    assert carve_routes.promote(p) == [], "promote is idempotent"


def test_no_carve_stage_reads_a_published_route_file():
    """The carve reads `carve-inputs/`; the published files stay downstream."""
    text = (PKG / "refine_province.py").read_text()
    for published in ('"routes.json"', '"routes-minor.json"', '"routes-natural.json"'):
        assert published not in text.replace('carve_source("routes-minor.json")', ""), \
            f"refine_province reads the published {published} again — the cycle is back"


def test_the_frozen_inputs_are_in_the_tree():
    """A deterministic build needs its carve inputs COMMITTED, not seeded from
    whatever the last run happened to publish on this machine."""
    for name in carve_routes.SOURCES:
        assert (carve_routes.PROVINCE / carve_routes.SNAP_DIR / name).exists(), (
            f"province/carve-inputs/{name} is missing — run "
            f"`python3 -m worldgen.carve_routes --promote` and commit it")
