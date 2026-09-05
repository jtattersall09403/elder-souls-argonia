"""Derive parcel footprints from the measured kit geometry (Part 6, 2026-09-05).

Owner ruling 2026-09-05: a blueprint must show each building's ACTUAL outline,
and every building's orientation must be authored with a reason. So a parcel is
authored as **where** (`centreUV`), **which piece** (`assetRef`), **which way**
(`yawDeg`) and **why that way** (`orientationWhy`); its `footprint` polygon is
DERIVED here and never hand-edited.

Derivation: take the asset's measured ground hull from
``tooling/asset-pipeline/output/kits/<kit>.footprints.json`` (metres, in the
asset's local frame, centred on the pivot ``compile_settlement`` places — see
``pipeline/measure_footprints.py``), rotate it by `yawDeg`, translate it to
`centreUV` in metres, and convert back to province UV.

Angle convention (shared with the door arrows in ``render_blueprint``): world
axes are x = east, z = south, so north is −z and `yawDeg` is a compass bearing,
degrees CLOCKWISE from north. Rotating a local point (x, z) by θ gives
``(x·cosθ − z·sinθ, x·sinθ + z·cosθ)``, which reads clockwise on the map because
z runs south.

Run (from tooling/world-generation/):
  python3 -m worldgen.blueprint_footprints --apply <blueprint.json> [...]
  python3 -m worldgen.blueprint_footprints --check <blueprint.json> [...]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
# ProvinceSurvey().extent_m — the single province square (module 00-core §8,
# ×3 world scale, decision 0006). Held as a constant so the validator does not
# have to load the raster stack for a schema check. It is the SAME number
# render_blueprint holds; if the province is ever rescaled, both move together
# and every blueprint needs --apply re-running.
PROVINCE_EXTENT_M = 7373.50656
UV_ROUND = 9
DERIVED_TOLERANCE_UV = 1e-6


class FootprintLibrary:
    """Measured footprints for every built kit, keyed by kit asset id."""

    def __init__(self, kits_dir: Path = KITS_DIR):
        self.by_asset: dict[str, dict] = {}
        self.kit_of: dict[str, str] = {}
        if not kits_dir.exists():
            return
        for path in sorted(kits_dir.glob("*.footprints.json")):
            data = json.loads(path.read_text())
            for asset_id, record in data.get("assets", {}).items():
                self.by_asset.setdefault(asset_id, record)
                self.kit_of.setdefault(asset_id, data.get("kit", path.stem))

    def __bool__(self) -> bool:
        return bool(self.by_asset)

    def get(self, asset_ref: str) -> dict | None:
        return self.by_asset.get(asset_ref)


_LIBRARY: FootprintLibrary | None = None


def library(kits_dir: Path = KITS_DIR) -> FootprintLibrary:
    """Process-wide cache (read-only data, loaded once)."""
    global _LIBRARY
    if _LIBRARY is None or _LIBRARY_DIR[0] != kits_dir:
        _LIBRARY_DIR[0] = kits_dir
        _LIBRARY = FootprintLibrary(kits_dir)
    return _LIBRARY


_LIBRARY_DIR: list[Path] = [KITS_DIR]


def rotate_m(points_m, yaw_deg: float) -> list[tuple[float, float]]:
    t = math.radians(float(yaw_deg))
    c, s = math.cos(t), math.sin(t)
    return [(x * c - z * s, x * s + z * c) for x, z in points_m]


def derive_footprint(record: dict, centre_uv, yaw_deg: float,
                     extent_m: float = PROVINCE_EXTENT_M,
                     outline_key: str = "footprintM", scale: float = 1.0) -> list[list[float]]:
    """The parcel's UV polygon: measured hull → uniform scale → rotated → placed at centreUV."""
    poly_m = [[p[0] * scale, p[1] * scale] for p in (record.get(outline_key) or record.get("planOutlineM") or [])]
    cx = float(centre_uv[0]) * extent_m
    cz = float(centre_uv[1]) * extent_m
    out = []
    for x, z in rotate_m([(p[0], p[1]) for p in poly_m], yaw_deg):
        out.append([round((cx + x) / extent_m, UV_ROUND),
                    round((cz + z) / extent_m, UV_ROUND)])
    return out


def parcel_footprint(parcel: dict, lib: FootprintLibrary | None = None,
                     extent_m: float = PROVINCE_EXTENT_M) -> list[list[float]] | None:
    """Derived footprint for one parcel, or None if it cannot be derived."""
    lib = lib if lib is not None else library()
    ref = parcel.get("assetRef")
    if not isinstance(ref, str):
        return None
    record = lib.get(ref)
    if record is None:
        return None
    if not isinstance(parcel.get("centreUV"), list) or len(parcel["centreUV"]) != 2:
        return None
    if not isinstance(parcel.get("yawDeg"), (int, float)):
        return None
    outline = parcel.get("outline", "footprintM")
    scale = parcel.get("scale", 1.0)
    if not isinstance(scale, (int, float)) or scale <= 0:
        return None
    return derive_footprint(record, parcel["centreUV"], parcel["yawDeg"],
                            extent_m, outline, float(scale))


def polygons_match(a, b, tolerance: float = DERIVED_TOLERANCE_UV) -> bool:
    if not isinstance(a, list) or not isinstance(b, list) or len(a) != len(b):
        return False
    return all(abs(p[0] - q[0]) <= tolerance and abs(p[1] - q[1]) <= tolerance
               for p, q in zip(a, b))


def apply_to_blueprint(bp: dict, lib: FootprintLibrary | None = None,
                       extent_m: float = PROVINCE_EXTENT_M) -> list[str]:
    """Rewrite every parcel's `footprint` from its measured assetRef."""
    lib = lib if lib is not None else library()
    problems: list[str] = []
    for parcel in bp.get("parcels", []):
        derived = parcel_footprint(parcel, lib, extent_m)
        if derived is None:
            problems.append(
                f"{parcel.get('id')}: cannot derive footprint — needs assetRef "
                f"(measured), centreUV [u,v] and numeric yawDeg "
                f"(assetRef={parcel.get('assetRef')!r})")
            continue
        parcel["footprint"] = derived
    return problems


def _indent_of(text: str) -> int:
    """The file's own indent, so --apply does not reformat the whole blueprint
    (the live files are indent 1, the fixture is indent 2)."""
    for line in text.splitlines()[1:]:
        stripped = line.lstrip(" ")
        if stripped:
            return len(line) - len(stripped) or 1
    return 1


def apply_to_file(path: Path, lib: FootprintLibrary | None = None) -> list[str]:
    text = path.read_text()
    data = json.loads(text)
    problems = apply_to_blueprint(data.get("blueprint", {}), lib)
    path.write_text(json.dumps(data, indent=_indent_of(text)) + "\n")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="rewrite footprints in place")
    ap.add_argument("--check", action="store_true", help="report mismatches only")
    ap.add_argument("paths", nargs="+")
    args = ap.parse_args()
    if args.apply == args.check:
        ap.error("choose exactly one of --apply / --check")

    lib = library()
    if not lib:
        print("blueprint_footprints: no <kit>.footprints.json found — run "
              "python3 -m pipeline.measure_footprints from tooling/asset-pipeline/",
              file=sys.stderr)
        return 1

    failures = 0
    for raw in args.paths:
        path = Path(raw)
        data = json.loads(path.read_text())
        bp = data.get("blueprint", {})
        if args.apply:
            problems = apply_to_file(path, lib)
            for p in problems:
                print(f"blueprint_footprints: {path.name}: {p}", file=sys.stderr)
            failures += len(problems)
            print(f"blueprint_footprints: {path.name} — "
                  f"{len(bp.get('parcels', []))} parcels, {len(problems)} unresolved")
        else:
            for parcel in bp.get("parcels", []):
                derived = parcel_footprint(parcel, lib)
                if derived is None or not polygons_match(parcel.get("footprint"), derived):
                    print(f"blueprint_footprints: {path.name}: {parcel.get('id')}: "
                          "footprint is not the derived polygon — run --apply",
                          file=sys.stderr)
                    failures += 1
    print(f"blueprint_footprints: {'FAIL' if failures else 'OK'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
