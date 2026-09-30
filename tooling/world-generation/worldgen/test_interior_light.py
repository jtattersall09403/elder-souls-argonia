"""The interior lighting rule and its illuminance check (interior_light.py)."""

import copy
import re
from pathlib import Path

import numpy as np

from worldgen.interior_light import DARK_E, FILL_E, MIN_SOURCE_LED_FRACTION, apply_light_rule, irradiance, light_balance, light_report

LOADER = Path(__file__).resolve().parents[3] / "packages/game-core/src/interior/interiorLoader.ts"
LANTERN = {"radiusUnits": 256, "colourRgb": [242, 240, 223], "offsetM": [0.0, 0.6, 0.0],
           "editorId": "DefaultCandleLight01NSDesat"}


def _bundle():
    return {
        "ambient": {"colorRGB": [44, 33, 27], "intensity": 1.0},
        "lighting": {"directionalRGB": [77, 62, 55]},
        "lights": [{"refId": "A", "positionM": [0.0, 1.0, 0.0], "radiusM": 4.6, "colorRGB": [180, 99, 28],
                    "fade": 2.5, "falloffExponent": 1.0, "base": "Hearth", "raw": {}}],
        "placements": [
            {"id": "c.1", "assetId": "lantern", "positionM": [8.0, 0.0, 0.0], "rotationDeg": [0, 90, 0], "scale": 1},
            {"id": "c.2", "assetId": "lantern", "positionM": [0.3, 0.0, 0.0], "rotationDeg": [0, 0, 0], "scale": 1},
        ],
    }


def _floor():
    xs, zs = np.meshgrid(np.arange(-5, 10, 0.5), np.arange(-4, 4, 0.5))
    return np.column_stack([xs.ravel(), np.zeros(xs.size), zs.ravel()])


def test_constants_match_the_runtime():
    src = LOADER.read_text()
    assert re.search(r"INTERIOR_LIGHT_INTENSITY_PER_FADE = Math\.PI", src)
    assert re.search(r"INTERIOR_AMBIENT_SCALE = Math\.PI", src)
    assert re.search(r"INTERIOR_LIGHT_DECAY = 2;", src)


def test_a_plugin_lit_cell_reads_dark_and_the_rule_lifts_it():
    b = _bundle()
    before = light_report(b, _floor())
    assert not before["ok"] and before["darkFraction"] > 0.9
    did = apply_light_rule(b, {"lantern": LANTERN})
    after = light_report(b, _floor())
    assert after["ok"] and after["darkFraction"] == 0.0
    assert min(irradiance(b, _floor() + [0, 1.2, 0])) >= FILL_E - 1e-6 > DARK_E
    # the far lantern gets its mined LIGH; the one beside the hearth light does not
    assert did["fixtureLights"] == 1
    added = [lt for lt in b["lights"] if lt["refId"].startswith("fixture:")]
    assert added[0]["refId"] == "fixture:c.1" and added[0]["radiusM"] == 3.641
    assert np.allclose(added[0]["positionM"], [8.0, 0.6, 0.0])


def test_the_rule_is_idempotent():
    b = _bundle()
    apply_light_rule(b, {"lantern": LANTERN})
    once = copy.deepcopy(b)
    apply_light_rule(b, {"lantern": LANTERN})
    assert b == once


def test_the_balance_check_tells_a_fill_lit_room_from_a_source_lit_one():
    pts = _floor() + [0, 1.2, 0]
    flat = _bundle()
    flat["ambient"]["intensity"] = 12.0          # the fill carries the room
    assert light_balance(flat, pts)["flat"]
    lit = _bundle()
    lit["lights"] = [{"refId": f"L{i}", "positionM": [x, 2.0, z], "radiusM": 6.0, "colorRGB": [220, 140, 60],
                      "fade": 3.0, "falloffExponent": 1.0} for i, (x, z) in enumerate([(-4, 0), (0, 0), (4, 0), (8, 0)])]
    got = light_balance(lit, pts)
    assert not got["flat"] and got["sourceLedFraction"] >= MIN_SOURCE_LED_FRACTION
    rep = light_report(flat, _floor(), strict_balance=True)
    assert not rep["ok"] and any(f.startswith("flat:") for f in rep["failures"])
    assert "flat:" not in " ".join(light_report(flat, _floor())["failures"])


def test_exported_lights_follow_skyrims_curve_at_half_and_three_quarter_radius():
    from worldgen.interior_light import SKYRIM_FIT_X, _runtime_shape, skyrim_curve
    for r, fade in [(4.624, 2.5), (7.283, 1.0), (2.514, 2.0), (0.908, 3.0)]:
        lt = {"radiusM": r, "fade": fade, "colorRGB": [180, 99, 28], "falloffExponent": 1.0, "raw": {}}
        fit = skyrim_curve(lt)
        assert not fit["capped"] and fit["recordFade"] == fade
        for x in SKYRIM_FIT_X:
            got = fit["fade"] * float(_runtime_shape(x, r, fit["falloffExponent"]))
            assert abs(got / (fade * (1 - x * x)) - 1) < 0.06, (r, x, got)


def test_the_near_field_cap_and_idempotence():
    from worldgen.interior_light import MAX_NEAR_CHANNEL_E, NEAR_M, _runtime_shape, skyrim_curve, srgb_to_linear
    hot = {"radiusM": 6.0, "fade": 9.0, "colorRGB": [255, 200, 120], "falloffExponent": 1.0, "raw": {}}
    fit = skyrim_curve(hot)
    near = fit["fade"] * float(_runtime_shape(NEAR_M / 6.0, 6.0, fit["falloffExponent"])) * srgb_to_linear([255, 200, 120]).max()
    assert fit["capped"] and abs(near - MAX_NEAR_CHANNEL_E) < 1e-3
    b = _bundle()
    apply_light_rule(b, {"lantern": LANTERN})
    hearth = b["lights"][0]
    assert hearth["raw"]["recordFade"] == 2.5 and hearth["falloffExponent"] == 0.01 and hearth["fade"] != 2.5


def test_the_ambient_cube_lights_each_face_with_its_own_axis():
    from worldgen.interior_light import _LUMA, _NORMALS, ambient_per_normal, cube_irradiance
    cube = {"px": [0.1] * 3, "nx": [0.2] * 3, "py": [0.4] * 3, "ny": [0.0] * 3, "pz": [0.05] * 3, "nz": [0.3] * 3}
    axes = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], float)
    assert np.allclose(cube_irradiance(cube, axes)[:, 0], [0.1, 0.2, 0.4, 0.0, 0.05, 0.3])
    flat = {k: [0.25, 0.2, 0.1] for k in cube}
    tilted = np.array([[0.6, 0.8, 0.0], [0.0, -0.6, 0.8]])
    assert np.allclose(cube_irradiance(flat, tilted), [0.25, 0.2, 0.1])   # a uniform cube is flat
    b = {"ambient": {"colorRGB": [0, 0, 0], "intensity": 1.0}, "lighting": {"ambientCube": cube}}
    assert np.isclose(ambient_per_normal(b)[0], 0.4 * _LUMA.sum())   # the floor (up) face reads +Y
    assert list(_NORMALS[0]) == [0, 1, 0]


def test_a_cell_with_a_cube_gets_no_fill():
    b = _bundle()
    b["lighting"]["ambientCube"] = {k: [0.02, 0.015, 0.01] for k in ("px", "nx", "py", "ny", "pz", "nz")}
    did = apply_light_rule(b, {"lantern": LANTERN})
    assert did["ambientIntensity"] == 1.0 and b["ambient"]["rule"] == "ambient-cube"
    fallback = _bundle()
    apply_light_rule(fallback, {"lantern": LANTERN})
    assert fallback["ambient"]["rule"] == "interior-light-floor" and fallback["ambient"]["intensity"] > 1.0
