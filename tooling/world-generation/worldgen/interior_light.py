"""How lit a tier A interior is where the player walks (interior lighting rule, 16k walk 5).

Mirrors the runtime light model of ``packages/game-core/src/interior/interiorLoader.ts``
(no shadows, so a light reaches through walls exactly as it does in the studio):

* every colour is sRGB/255 -> linear (``colorFromRGB``);
* the ambient is ``ambient.colorRGB * intensity * INTERIOR_AMBIENT_SCALE`` and the
  directional is ``lighting.directionalRGB * INTERIOR_AMBIENT_SCALE`` from straight up;
* a point light is ``fade * INTERIOR_LIGHT_INTENSITY_PER_FADE``, three.js decay
  ``2 * falloffExponent`` with the ``radiusM`` cutoff window
  ``saturate(1 - (d/r)^4)^2 / max(d^decay, 0.01)``.

Both scales are pi and three's Lambert BRDF is albedo/pi, so the returned
``E`` is what a surface's albedo is multiplied by on screen (exposure 1 inside,
``InteriorEnvironment``). ``E`` is the luminance (Rec. 709) of that factor,
averaged over the five faces a player looks at from 1.2 m above a walk node:
the floor (up) and the four horizontal directions (walls, furniture fronts).

``apply_light_rule`` is the interior lighting rule (place-build
doors-interiors-sockets.md § 7): (1) every lit fixture placement whose kit asset
carries a mined LIGH (``light`` in its kit manifest) and has no plugin light within
``FIXTURE_LIT_M`` gets that light, ``refId: "fixture:<placement id>"``; (2) the cell
ambient's intensity is raised so the unlit mean reaches ``FILL_E``. Both are derived
from records, idempotent, and run by the exporter before it writes the bundle.

A node is DARK when ``E < DARK_E``: an albedo-0.3 wall then reflects under
0.015 linear, under ~30/255 after ACES at exposure 1 (reads black). The bar
(``MAX_DARK_FRACTION``) is on the roofed standable floor nodes of ``interior_walk``
(0.5 m grid; ``--reached`` keeps only those reached from the doors, ~30 s a cell).
"""

from __future__ import annotations

import numpy as np

#: interiorLoader.ts INTERIOR_LIGHT_INTENSITY_PER_FADE / INTERIOR_AMBIENT_SCALE are pi and
#: cancel against the Lambert 1/pi; INTERIOR_LIGHT_DECAY is 2 (read by the test beside this).
INTERIOR_LIGHT_DECAY = 2.0
EYE_M = 1.2
#: ~37/255 on an albedo-0.3 wall after ACES at exposure 1: the darkest a walked spot may read.
DARK_E = 0.12
MAX_DARK_FRACTION = 0.30
#: The fill floor (the rule's step 2): the cell ambient's intensity is raised until the
#: unlit five-face mean reaches this (~45/255 on albedo 0.3; ~70/255 on albedo 0.5).
FILL_E = 0.15
#: A lit fixture within this of a plugin light is already lit by it (the plugins place
#: the LIGH beside the lantern: 0.61 m median for candlelanternwithcandle01).
FIXTURE_LIT_M = 1.0
_NORMALS = np.array([[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], float)
_LUMA = np.array([0.2126, 0.7152, 0.0722])


def srgb_to_linear(rgb) -> np.ndarray:
    c = np.asarray(rgb, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def irradiance(bundle: dict, points: np.ndarray) -> np.ndarray:
    """Luminance of the albedo multiplier at each point (see the module docstring)."""
    pts = np.asarray(points, float).reshape(-1, 3)
    amb = bundle.get("ambient") or {}
    base = float(_LUMA @ srgb_to_linear(amb.get("colorRGB", [0, 0, 0]))) * float(amb.get("intensity", 1.0))
    per_normal = np.full((len(pts), len(_NORMALS)), base)
    d_rgb = (bundle.get("lighting") or {}).get("directionalRGB")
    if d_rgb:
        per_normal[:, 0] += float(_LUMA @ srgb_to_linear(d_rgb))
    for light in bundle.get("lights") or []:
        lum = float(_LUMA @ srgb_to_linear(light["colorRGB"])) * (1.0 if light.get("fade") is None else float(light["fade"]))
        decay = INTERIOR_LIGHT_DECAY * float(light.get("falloffExponent") or 1.0)
        v = np.asarray(light["positionM"], float) - pts
        d = np.linalg.norm(v, axis=1)
        r = float(light["radiusM"])
        window = np.clip(1 - (d / r) ** 4, 0, 1) ** 2 if r > 0 else np.ones_like(d)
        att = window / np.maximum(d ** decay, 0.01)
        cos = np.clip((v / np.maximum(d, 1e-6)[:, None]) @ _NORMALS.T, 0, 1)
        per_normal += lum * att[:, None] * cos
    return per_normal.mean(axis=1)


def kit_lights(kits_dir) -> dict[str, dict]:
    """asset id -> its mined LIGH (`light` with radiusUnits and colourRgb) over every
    published kit manifest."""
    import json
    from pathlib import Path
    out: dict[str, dict] = {}
    for path in sorted(Path(kits_dir).glob("*.kit.json")):
        for a in json.loads(path.read_text()).get("assets") or []:
            lt = a.get("light")
            if isinstance(lt, dict) and lt.get("radiusUnits") and lt.get("colourRgb"):
                out.setdefault(a["id"], lt)
    return out


def apply_light_rule(bundle: dict, lights_by_asset: dict[str, dict]) -> dict:
    """Apply the interior lighting rule in place (module docstring); returns what it did."""
    from worldgen.esp_index import UNITS_PER_METRE
    from worldgen.interior_walk import euler_matrix
    plugin = [lt for lt in bundle.get("lights") or [] if not str(lt.get("refId", "")).startswith("fixture:")]
    added = []
    for p in bundle.get("placements") or []:
        lt = lights_by_asset.get(p["assetId"])
        if not lt:
            continue
        m = euler_matrix(p["rotationDeg"]) * float(p.get("scale", 1.0))
        pos = np.asarray(p["positionM"], float) + m @ np.asarray(lt.get("offsetM") or [0, 0, 0], float)
        if any(np.linalg.norm(np.asarray(q["positionM"], float) - pos) <= FIXTURE_LIT_M for q in plugin):
            continue
        added.append({"refId": f"fixture:{p['id']}", "positionM": [round(float(v), 4) for v in pos],
                      "radiusM": round(float(lt["radiusUnits"]) / UNITS_PER_METRE, 3),
                      "colorRGB": list(lt["colourRgb"]), "fade": lt.get("fade"), "flags": 0,
                      "falloffExponent": 1.0, "base": lt.get("editorId") or "fixture",
                      "raw": {"xrdsUnits": None, "baseRadiusUnits": lt["radiusUnits"]}})
    bundle["lights"] = plugin + added
    amb = bundle["ambient"]
    amb_lum = float(_LUMA @ srgb_to_linear(amb["colorRGB"]))
    d_rgb = (bundle.get("lighting") or {}).get("directionalRGB")
    dir_share = float(_LUMA @ srgb_to_linear(d_rgb)) / len(_NORMALS) if d_rgb else 0.0
    need = (FILL_E - dir_share) / amb_lum if amb_lum > 0 else 1.0
    amb["intensity"] = round(max(1.0, need), 3)
    amb["rule"] = "interior-light-floor"
    bundle.setdefault("counts", {})["lights"] = len(bundle["lights"])
    return {"fixtureLights": len(added), "ambientIntensity": amb["intensity"]}


def light_report(bundle: dict, nodes: np.ndarray) -> dict:
    """The rule's numbers for one bundle over its floor nodes ([x, floor y, z])."""
    nodes = np.asarray(nodes, float).reshape(-1, 3)
    if not len(nodes):
        return {"ok": False, "nodes": 0, "failures": ["no floor node to sample"]}
    e = irradiance(bundle, nodes + [0.0, EYE_M, 0.0])
    dark = float((e < DARK_E).mean())
    out = {
        "nodes": int(len(nodes)), "lights": len(bundle.get("lights") or []),
        "medianE": round(float(np.median(e)), 4), "p10E": round(float(np.percentile(e, 10)), 4),
        "darkFraction": round(dark, 3), "darkE": DARK_E, "maxDarkFraction": MAX_DARK_FRACTION,
        "failures": [],
    }
    if not out["lights"]:
        out["failures"].append("no light record in the cell")
    if dark > MAX_DARK_FRACTION:
        out["failures"].append(f"{dark:.0%} of the walked floor reads dark (E < {DARK_E}); "
                               f"bar {MAX_DARK_FRACTION:.0%}")
    out["ok"] = not out["failures"]
    return out


def light_bundle(bundle: dict, kits_dir=None, reached: bool = False) -> dict:
    """Measure the light over the bundle's standable floor nodes (interior_walk's
    layered grid); `reached` keeps only nodes reached from the doors (slower: the joins)."""
    from worldgen import interior_walk as iw
    mesh, owner, _missing = iw.bundle_mesh(bundle, kits_dir or iw.RAW_KITS)
    starts = [d["arrivalMarker"]["positionM"] for d in bundle.get("doors") or [] if d.get("arrivalMarker")] or \
        [bundle["arrivalMarker"]["positionM"]]
    if reached:
        walk = iw.walk_mesh(mesh, owner, starts, [], want_reached=True)
        nodes = walk.get("reachedPositions") or []
    else:
        nodes = iw.walk_mesh(mesh, owner, starts, [], nodes_only=True).get("positions") or []
    return light_report(bundle, np.asarray(nodes, float))


def main(argv: list[str] | None = None) -> int:
    import argparse
    import json
    from pathlib import Path
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("bundles", nargs="+", type=Path, help="interior bundle JSON files")
    ap.add_argument("--apply", action="store_true",
                    help="apply the rule to the bundles and write them (what the exporter does on export)")
    ap.add_argument("--reached", action="store_true", help="only nodes reached from the doors (slow)")
    a = ap.parse_args(argv)
    bad = 0
    lights_by_asset = kit_lights(Path(__file__).resolve().parents[3] / "apps" / "world-studio"
                                 / "public" / "kits") if a.apply else {}
    for path in a.bundles:
        if a.apply:
            b = json.loads(path.read_text())
            did = apply_light_rule(b, lights_by_asset)
            path.write_text(json.dumps(b, indent=1) + "\n")
            print(json.dumps({"cell": path.stem, "applied": did}))
        rep = light_bundle(json.loads(path.read_text()), reached=a.reached)
        bad += not rep["ok"]
        print(json.dumps({"cell": path.stem, **rep}))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
