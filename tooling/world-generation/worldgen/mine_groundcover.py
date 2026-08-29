"""Mine Bethesda's groundcover schema: GRAS parameters and LTEX->grass bindings.

Skyrim's grass is the one part of its exterior dressing that *is* procedural,
and its record format is a ready-made parameter list for our T3 groundcover
ring (module 65 §110): density, slope cut-off, distance-from-water rule,
position jitter, height/colour variance and a wind wave period, plus the
"which grasses may grow on this painted ground" list on each landscape texture.

We adopt the **schema as a checklist** and compute our own values from our own
fields (module 95 §86.0b) — this tool exists to record what the shipped games
actually set, so our numbers have a reference point.

Usage:
  python3 -m worldgen.mine_groundcover --plugin "<vault>/Tropical Skyrim.esp" \\
      --out world/sources/placement/groundcover-rules.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .esp_index import Plugin

#: GRAS "unit from water type" enum (UESP Skyrim Mod:Mod File Format, GRAS).
WATER_MODES = {
    0: "above-at-least",
    1: "above-at-most",
    2: "below-at-least",
    3: "below-at-most",
    4: "either-at-least",
    5: "either-at-most",
    6: "either-at-most-above",
    7: "either-at-most-below",
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    grasses: dict[str, dict] = {}
    textures: dict[str, dict] = {}
    names: dict[int, str] = {}

    for path in args.plugin:
        plugin = Plugin(path)
        for grass in plugin.grasses():
            names[grass.form_id] = grass.editor_id or f"{grass.form_id:08X}"
            grasses[names[grass.form_id]] = {
                "formId": f"{grass.form_id:08X}",
                "definedIn": plugin.source_of(grass.form_id),
                "model": grass.model,
                "density": grass.density,
                "slopeDeg": [grass.min_slope, grass.max_slope],
                "unitsFromWater": grass.unit_from_water,
                "waterRule": WATER_MODES.get(grass.water_mode, grass.water_mode),
                "positionJitterUnits": grass.position_range,
                "heightVariance": grass.height_range,
                "colourVariance": grass.colour_range,
                "wavePeriod": grass.wave_period,
                "flags": grass.flags,
            }
        for fid, entry in plugin.landscape_textures().items():
            key = entry.editor_id or f"{fid:08X}"
            textures[key] = {
                "formId": f"{fid:08X}",
                "definedIn": plugin.source_of(fid),
                "texture": entry.texture,
                "frictionRestitution": entry.friction_restitution,
                "grasses": [names.get(g, f"{g:08X}") for g in entry.grasses],
            }

    report = {
        "sources": [Path(p).name for p in args.plugin],
        "note": (
            "Schema adopted as a checklist; values are the shipped games' own "
            "and are recorded for reference, not copied into our compilers "
            "(module 95 §86.0b)."
        ),
        "grassesPerTexture": {
            "observedMax": max((len(t["grasses"]) for t in textures.values()), default=0),
            "distribution": _histogram(len(t["grasses"]) for t in textures.values()),
        },
        "grass": dict(sorted(grasses.items())),
        "landscapeTextures": dict(sorted(textures.items())),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{len(grasses)} grass records, {len(textures)} landscape textures -> {out}")


def _histogram(values) -> dict[str, int]:
    hist: dict[str, int] = {}
    for v in values:
        hist[str(v)] = hist.get(str(v), 0) + 1
    return dict(sorted(hist.items(), key=lambda kv: int(kv[0])))


if __name__ == "__main__":
    main()
