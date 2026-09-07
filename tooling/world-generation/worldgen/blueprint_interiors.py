"""What the kits say each parcel has inside, and which doors are missing.

Owner ruling 2026-09-05: *"Very few buildings have doors. Everything intended to
have an interior must have one and must have a door/entrance."* The derivation
lives in the asset pipeline
(``tooling/asset-pipeline/pipeline/interiors_index.py`` → per kit,
``output/kits/<kit>.interiors.json``); this module is the world-generation side
of it — the library the blueprint validator reads, and a report the design
agents run to see what their blueprint still owes.

Index record, per kit asset (see the pipeline module for how each is derived):

    interior          "matched" | "tileset" | "shell" | "none"
    interiorAssetRef  the pool's own matched interior mesh (interior=matched)
    tileset           the interior kit Phase 12 builds it from (interior=tileset)
    doorways          [{sideDeg, offsetM [x,z], arcM, doorwaySource, radial?,
                      radiusM?}] in the asset's LOCAL frame, north = 0,
                      clockwise — so a parcel's world-facing doorway bearing is
                      ``sideDeg + yawDeg``. `doorwaySource` is "assembly" (the
                      offset of a door part in a mined composite) or "geometry"
                      (an opening measured off the shell). A radial doorway
                      carries `radial: true` + `radiusM` and no `sideDeg`: any
                      bearing is a way in, but the door must stand on the ring.
    sizeClass         "small" (<40 m²) | "medium" (<120 m²) | "large"

Run (from tooling/world-generation/):
  python3 -m worldgen.blueprint_interiors --report ../../world/sources/blueprints/<place>.json
  python3 -m worldgen.blueprint_interiors --report <dir>          # every blueprint in a directory
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"

# The world facing of a door must be within this of a measured doorway side.
# Tighter than the footprint-edge check (±100°) because a doorway bearing is a
# measured direction, not a hull chord: ±45° still allows a door placed at a
# corner of the opening, but not one claimed on a blank wall.
DOORWAY_TOLERANCE_DEG = 45.0

# A radial doorway (a ring, no fixed side) takes any bearing, but the door has
# to stand ON the ring: the threshold within this of the measured radius.
RADIAL_TOLERANCE_M = 0.5

NEEDS_INTERIOR = ("matched", "tileset", "shell")

SIZE_CLASS_SMALL_MAX_M2 = 40.0
SIZE_CLASS_MEDIUM_MAX_M2 = 120.0


def size_class(area_m2: float) -> str:
    if area_m2 < SIZE_CLASS_SMALL_MAX_M2:
        return "small"
    if area_m2 < SIZE_CLASS_MEDIUM_MAX_M2:
        return "medium"
    return "large"


class InteriorLibrary:
    """Every built kit's interiors index, keyed by kit asset id."""

    def __init__(self, kits_dir: Path = KITS_DIR):
        self.by_asset: dict[str, dict] = {}
        self.kit_of: dict[str, str] = {}
        if not kits_dir.exists():
            return
        for path in sorted(kits_dir.glob("*.interiors.json")):
            data = json.loads(path.read_text())
            for asset_id, record in data.get("assets", {}).items():
                self.by_asset.setdefault(asset_id, record)
                self.kit_of.setdefault(asset_id, data.get("kit", path.stem))

    def __bool__(self) -> bool:
        return bool(self.by_asset)

    def get(self, asset_id: str) -> dict | None:
        return self.by_asset.get(asset_id)

    def interior_ref(self, record: dict) -> str | None:
        """What a door's ``interiorClaim.interiorRef`` must name for this piece:
        the matched interior mesh, or the tileset it is built from."""
        return record.get("interiorAssetRef") or record.get("tileset")


#: The mined exterior->interior door manifest (worldgen.mine_door_links).
LINKS_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources" / "placement"
              / "exterior-interior-links.json")
_LINKS: dict[str, list[dict]] | None = None


def linked_shells(path: Path = LINKS_PATH) -> dict[str, list[dict]]:
    """Shell asset id -> its mined door links (best-evidenced first).

    The mods' own load doors, so this is evidence and not inference: a shell in
    here HAS an interior, whatever a filename or a ray probe thinks.
    """
    global _LINKS
    if _LINKS is None:
        try:
            _LINKS = json.loads(path.read_text()).get("shells", {})
        except (OSError, json.JSONDecodeError):
            _LINKS = {}
    return _LINKS


_LIBRARY: InteriorLibrary | None = None
_LIBRARY_DIR: list[Path] = [KITS_DIR]


def library(kits_dir: Path = KITS_DIR) -> InteriorLibrary:
    """Process-wide cache (read-only data, loaded once)."""
    global _LIBRARY
    if _LIBRARY is None or _LIBRARY_DIR[0] != kits_dir:
        _LIBRARY_DIR[0] = kits_dir
        _LIBRARY = InteriorLibrary(kits_dir)
    return _LIBRARY


def angle_delta(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def doorway_bearings(record: dict, yaw_deg: float) -> list[float]:
    """The measured doorway sides of a piece, turned into world bearings by the
    parcel's yaw. Local sideDeg and yawDeg share one convention (north = 0,
    clockwise, x east / z south), so the world bearing is their sum.
    Radial doorways (a ring of ways in, no fixed side) are not listed here."""
    return [(float(d["sideDeg"]) + float(yaw_deg)) % 360.0
            for d in record.get("doorways", []) if "sideDeg" in d and not d.get("radial")]


def doorways(record: dict | None) -> list[dict]:
    return list((record or {}).get("doorways") or [])


def is_radial(doorway: dict) -> bool:
    return bool(doorway.get("radial")) or "sideDeg" not in doorway


def rotate_m(x: float, z: float, yaw_deg: float) -> tuple[float, float]:
    """Local (x, z) turned by a compass yaw — the same rotation
    `blueprint_footprints` uses for the hull, so a doorway lands on the
    outline it was measured against."""
    t = math.radians(float(yaw_deg))
    c, s = math.cos(t), math.sin(t)
    return (x * c - z * s, x * s + z * c)


def doorway_offset_m(doorway: dict, yaw_deg: float) -> tuple[float, float] | None:
    """Where the doorway sits relative to the parcel centre, in world metres."""
    off = doorway.get("offsetM")
    if not (isinstance(off, list) and len(off) >= 2):
        return None
    return rotate_m(float(off[0]), float(off[1]), yaw_deg)


def doorway_radius_m(doorway: dict) -> float | None:
    """The ring radius of a radial doorway — from `radiusM`, else measured off
    its own offset."""
    r = doorway.get("radiusM")
    if isinstance(r, (int, float)):
        return float(r)
    off = doorway.get("offsetM")
    if isinstance(off, list) and len(off) >= 2:
        return math.hypot(float(off[0]), float(off[1]))
    return None


def match_doorway(record: dict | None, yaw_deg: float, facing_deg: float | None,
                  threshold_m: tuple[float, float] | None = None,
                  centre_m: tuple[float, float] | None = None,
                  ) -> tuple[int | None, str]:
    """Which derived doorway a door sits on: `(index, reason)`.

    A fixed doorway accepts a facing within ``DOORWAY_TOLERANCE_DEG`` of its
    world bearing (`sideDeg + yawDeg`). A radial doorway (a rotunda, a ring of
    posts) accepts any bearing, but the threshold must lie within
    ``RADIAL_TOLERANCE_M`` of the ring radius measured from the parcel centre.
    `index` is None when nothing matches; `reason` is the plain-English detail
    the validator prints.
    """
    ways = doorways(record)
    if not ways:
        return None, "the kit derives no doorway for this piece"
    best: tuple[float, int] | None = None
    radial_notes: list[str] = []
    for i, dw in enumerate(ways):
        if is_radial(dw):
            radius = doorway_radius_m(dw)
            if radius is None or threshold_m is None or centre_m is None:
                radial_notes.append(f"#{i} radial (no threshold to measure)")
                continue
            got = math.hypot(threshold_m[0] - centre_m[0], threshold_m[1] - centre_m[1])
            if abs(got - radius) <= RADIAL_TOLERANCE_M:
                return i, f"#{i} radial ring at {radius:.1f} m"
            radial_notes.append(f"#{i} radial ring at {radius:.1f} m, "
                                f"the threshold stands {got:.1f} m out")
            continue
        if facing_deg is None:
            continue
        off = angle_delta(float(facing_deg), (float(dw["sideDeg"]) + float(yaw_deg)) % 360.0)
        if best is None or off < best[0]:
            best = (off, i)
    if best is not None and best[0] <= DOORWAY_TOLERANCE_DEG:
        return best[1], f"#{best[1]} at {best[0]:.0f}° off"
    sides = doorway_bearings(record, yaw_deg)
    shown = ", ".join(f"{s:.0f}°" for s in sides) if sides else "none fixed"
    detail = f"nearest fixed doorway is {best[0]:.0f}° off (sides at {shown})" if best \
        else f"fixed sides at {shown}"
    if radial_notes:
        detail += "; " + "; ".join(radial_notes)
    return None, detail


# --------------------------------------------------------------------------- #
# the report the design agents run
# --------------------------------------------------------------------------- #
def report_lines(bp: dict, lib: InteriorLibrary | None = None) -> list[str]:
    lib = lib if lib is not None else library()
    lines: list[str] = [f"{bp.get('id', '<no id>')}: interiors and doors"]
    if not lib:
        lines.append("  (no interiors index built — run "
                     "`python3 -m pipeline.interiors_index` in tooling/asset-pipeline/)")
        return lines

    doors_by_parcel: dict[str, list[dict]] = {}
    for door in bp.get("doors", []) or []:
        doors_by_parcel.setdefault(door.get("parcelId"), []).append(door)

    owed = 0
    for parcel in bp.get("parcels", []) or []:
        pid = parcel.get("id")
        ref = parcel.get("assetRef")
        record = lib.get(ref) if isinstance(ref, str) else None
        doors = doors_by_parcel.get(pid, [])
        if record is None:
            lines.append(f"  {pid}: assetRef {ref!r} is not in the interiors index — "
                         f"is the kit built?")
            continue
        kind = record.get("interior")
        want = lib.interior_ref(record) or "(a Phase 12 interior claim)"
        sides = doorway_bearings(record, parcel.get("yawDeg") or 0.0)
        side_text = (", ".join(f"{s:.0f}°" for s in sides) if sides
                     else f"none derivable — {record.get('doorwaysWhy', 'not measured')}")
        head = (f"  {pid}: {kind} [{record.get('sizeClass')}, "
                f"{record.get('planAreaM2', 0):.0f} m²] → {want}")
        problems: list[str] = []
        if kind in NEEDS_INTERIOR:
            if not doors:
                problems.append("MISSING a door — this piece has an inside and must have an entrance")
            for door in doors:
                claim = door.get("interiorClaim") or {}
                got = claim.get("interiorRef")
                expect = lib.interior_ref(record)
                if expect is None and not (isinstance(got, str) and got.strip()):
                    problems.append(f"{door.get('id')}: interiorClaim.interiorRef is missing — this is a "
                                    f"shell, so name the interior kit Phase 12 builds it from")
                elif expect is not None and got != expect:
                    problems.append(f"{door.get('id')}: interiorClaim.interiorRef is {got!r}, "
                                    f"should be {expect!r}")
                if claim.get("sizeClass") != record.get("sizeClass"):
                    problems.append(f"{door.get('id')}: interiorClaim.sizeClass is "
                                    f"{claim.get('sizeClass')!r}, the piece measures "
                                    f"{record.get('planAreaM2', 0):.0f} m² = {record.get('sizeClass')!r}")
                facing = door.get("facingDeg")
                if sides and isinstance(facing, (int, float)):
                    off = min(angle_delta(float(facing), s) for s in sides)
                    if off > DOORWAY_TOLERANCE_DEG:
                        problems.append(f"{door.get('id')}: facingDeg {float(facing):.0f}° is "
                                        f"{off:.0f}° off the nearest doorway ({side_text})")
        elif doors:
            problems.append(f"has {len(doors)} door(s) but no interior — {record.get('why', '')}")
        lines.append(head + f"; doorway sides {side_text}")
        for problem in problems:
            lines.append(f"      ! {problem}")
        owed += len(problems)

    lines.append(f"  {owed} problem(s)")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--report", required=True,
                    help="a blueprint json, or a directory of them")
    ap.add_argument("--kits-dir", default=str(KITS_DIR))
    args = ap.parse_args()

    target = Path(args.report)
    paths = sorted(target.glob("*.json")) if target.is_dir() else [target]
    lib = library(Path(args.kits_dir))
    for path in paths:
        data = json.loads(path.read_text())
        bp = data.get("blueprint", data)
        print("\n".join(report_lines(bp, lib)))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
