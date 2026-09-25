"""Blueprint map renderer tests (Phase 11 Part 0 item 5, decision 0041).

The fixture blueprint lives in worldgen/testdata/ on purpose: it is not a real
place, and world/sources/blueprints/ is reserved for places whose IDs are
permanent.
"""

from pathlib import Path

from . import blueprint, render_blueprint

FIXTURE = Path(__file__).parent / "testdata" / "place.fixture.mire-landing.json"


def test_fixture_blueprint_is_schema_valid():
    bp = render_blueprint.load_blueprint(FIXTURE)
    assert blueprint.validate_blueprint(bp, None) == []


def test_renders_a_png_with_every_element_drawn(tmp_path):
    bp = render_blueprint.load_blueprint(FIXTURE)
    out = tmp_path / "map.png"
    summary = render_blueprint.render(bp, out, terrain=False, seed=6)

    assert out.exists() and out.stat().st_size > 10_000
    assert out.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    # Every authored element reaches the diagram.
    assert summary["districts"] == len(bp["districts"])
    assert summary["parcels"] == len(bp["parcels"])
    assert summary["doors"] == len(bp["doors"])
    assert summary["landmarks"] == len(bp["landmarks"])
    assert summary["docks"] == len(bp["docks"])
    assert summary["sockets"] == len(bp["questSockets"])
    assert summary["combatSpaces"] == len(bp["combatSpaces"])
    assert summary["ways"] == len(bp["routes"]) + len(bp["canals"]) + len(bp["boardwalks"])


def test_render_is_deterministic_given_the_seed(tmp_path):
    bp = render_blueprint.load_blueprint(FIXTURE)
    a, b = tmp_path / "a.png", tmp_path / "b.png"
    render_blueprint.render(bp, a, terrain=False, seed=6)
    render_blueprint.render(bp, b, terrain=False, seed=6)
    assert a.read_bytes() == b.read_bytes()


def test_crop_covers_every_authored_coordinate(tmp_path):
    bp = render_blueprint.load_blueprint(FIXTURE)
    summary = render_blueprint.render(bp, tmp_path / "c.png", terrain=False, seed=6)
    x0, z0, x1, z1 = summary["cropM"]
    for u, v in render_blueprint.collect_uv(bp):
        x, z = u * render_blueprint.PROVINCE_EXTENT_M, v * render_blueprint.PROVINCE_EXTENT_M
        assert x0 <= x <= x1 and z0 <= z <= z1


def test_renders_over_the_real_terrain_hillshade(tmp_path):
    """The committed refined rasters are the backdrop — proves the loader path."""
    bp = render_blueprint.load_blueprint(FIXTURE)
    out = tmp_path / "terrain.png"
    summary = render_blueprint.render(bp, out, terrain=True, seed=6)
    assert summary["terrain"] is True
    assert out.exists() and out.stat().st_size > 10_000


def test_plan_overlay_draws_only_what_a_top_view_cannot(tmp_path):
    """0100 decision 3: clearance tiers, kept features, door facings and
    sockets; ground deltas need the terrain, so none without it."""
    bp = render_blueprint.load_blueprint(FIXTURE)
    summary = render_blueprint.render(bp, tmp_path / "p.png", terrain=False, seed=6, plan=True)
    plan = summary["plan"]
    clear = bp["clearance"]
    assert plan["clearance"] == len(clear["hardClear"]) + len(clear["thinned"])
    assert plan["kept"] == len(clear["kept"])
    assert plan["doorFacings"] == sum(1 for d in bp["doors"] if d.get("facingDeg") is not None)
    assert plan["terminals"] == sum(1 for t in bp["networkTerminals"] if t.get("entryUV"))
    assert plan["padDeltas"] == 0
    assert "plan" not in render_blueprint.render(bp, tmp_path / "q.png", terrain=False, seed=6)


def test_plan_ground_delta_is_measured_on_the_terrain(tmp_path):
    bp = render_blueprint.load_blueprint(FIXTURE)
    summary = render_blueprint.render(bp, tmp_path / "t.png", terrain=True, seed=6, plan=True)
    assert summary["plan"]["padDeltas"] == sum(
        1 for p in bp["parcels"] if p.get("footprint") and p.get("centreUV"))


def test_layout_input_refuses_a_layout_changed_since_apply(tmp_path):
    import hashlib
    import json

    import pytest
    layout = tmp_path / "x.layout.json"
    layout.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.x", "ops": []}))
    out = tmp_path / "apply"
    out.mkdir()
    with pytest.raises(ValueError, match="run `wb.py apply"):
        render_blueprint.applied_blueprint(layout, out)
    doc = json.loads(FIXTURE.read_text())
    sha = hashlib.sha256(layout.read_bytes()).hexdigest()
    doc["blueprint"]["authoredOn"] = {"layout": {"path": "x", "sha256": sha}}
    (out / "place.x.blueprint.json").write_text(json.dumps(doc))
    assert render_blueprint.applied_blueprint(layout, out) == out / "place.x.blueprint.json"
    layout.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.x", "ops": [1]}))
    with pytest.raises(ValueError, match="changed since the last apply"):
        render_blueprint.applied_blueprint(layout, out)
