"""What the kits say each parcel has inside, and which doors are missing.

Owner ruling 2026-09-05: *"Very few buildings have doors. Everything intended to
have an interior must have one and must have a door/entrance."* The derivation
lives in the asset pipeline
(``tooling/asset-pipeline/pipeline/interiors_index.py`` → per kit,
``output/kits/<kit>.interiors.json``); this module is the world-generation side
of it — the library the blueprint validator reads, and a report the design
agents run to see what their blueprint still owes.

Index record, per kit asset (see the pipeline module for how each is derived):

    interior          "matched" | "tileset" | "shell" | "promised" | "none"
    interiorAssetRef  the pool's own matched interior mesh (interior=matched)
    tileset           the interior kit Phase 12 builds it from (interior=tileset)
    entrance          THE canonical way in, or null (owner ruling 2026-09-07:
                      one entrance per piece, ranked from the mod's own load
                      door down — esp-door > assembly > door-piece > leaf >
                      opening > open-front). {kind, sideDeg, offsetM [x,z],
                      arcM?, radial?, radiusM?} in the asset's LOCAL frame,
                      north = 0, clockwise — so the world bearing is
                      ``sideDeg + yawDeg``. A radial entrance carries
                      `radial: true` + `radiusM` and no `sideDeg`: the authors'
                      own placements turned the door to different sides, so any
                      bearing is a way in, but the door must stand on the ring.
    provenance        the losing door evidence, for audit only — never drawn,
                      never matched against.
    front             {deg, evidence, outside, why} or null, for a piece with
                      no entrance: which way it goes round, derived from how
                      its author placed it (`pipeline/piece_front.py`).
    sizeClass         "small" (<40 m²) | "medium" (<120 m²) | "large"

Run (from tooling/world-generation/):
  python3 -m worldgen.blueprint_interiors --report ../../world/sources/blueprints/<place>.json
  python3 -m worldgen.blueprint_interiors --report <dir>          # every blueprint in a directory
  python3 -m worldgen.blueprint_interiors --claim <blueprint>.json  # tier A claims; a lookup in
      the batch pre-pass table (worldgen.batch_prepass) when current, else the plugin reads (warned)
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
# Tracked record (world/sources/placement/kit-interiors): CI and local both
# validate against this copy. `output/kits` (the local build) is the fallback
# for a kit rebuilt but not yet re-committed. `ES_ASSET_PIPELINE_ROOT` (set by
# `preflight.mjs --runner` to an empty temp dir) overrides the base so runner
# mode hides this local build the same way the GitHub runner has it hidden.
import os

_PIPELINE_ROOT = Path(os.environ["ES_ASSET_PIPELINE_ROOT"]).expanduser() if os.environ.get("ES_ASSET_PIPELINE_ROOT") else REPO_ROOT
TRACKED_KITS_DIR = REPO_ROOT / "world" / "sources" / "placement" / "kit-interiors"
LOCAL_KITS_DIR = _PIPELINE_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"


def _default_kits_dir() -> Path:
    if TRACKED_KITS_DIR.exists() and any(TRACKED_KITS_DIR.glob("*.interiors.json")):
        return TRACKED_KITS_DIR
    return LOCAL_KITS_DIR


#: Back-compat single-directory default (some readers only need one path, e.g.
#: for a glob). Prefer `_merged_interior_files()` where a kit could exist in
#: only one of the two locations.
KITS_DIR = _default_kits_dir()


def _merged_interior_files() -> list[Path]:
    """One `*.interiors.json` path per kit, tracked copy first: a kit rebuilt
    locally but not yet re-committed is still picked up (from `LOCAL_KITS_DIR`)
    without losing a kit that only exists as the tracked record."""
    by_name: dict[str, Path] = {}
    if LOCAL_KITS_DIR.exists():
        for path in LOCAL_KITS_DIR.glob("*.interiors.json"):
            by_name[path.name] = path
    if TRACKED_KITS_DIR.exists():
        for path in TRACKED_KITS_DIR.glob("*.interiors.json"):
            by_name[path.name] = path  # tracked wins per kit
    return [by_name[name] for name in sorted(by_name)]


def library_available() -> bool:
    """True when at least one kit has an `*.interiors.json` in either the
    tracked record or the local kit build. False means door-facing validation
    cannot check a piece's measured entrance against any source."""
    return bool(_merged_interior_files())

# The world facing of a door must be within this of the canonical entrance.
# Tighter than the footprint-edge check (±100°) because an entrance bearing is a
# measured direction, not a hull chord: ±45° still allows a door placed at a
# corner of the opening, but not one claimed on a blank wall.
DOORWAY_TOLERANCE_DEG = 45.0

# A radial entrance (a ring, no fixed side) takes any bearing, but the door has
# to stand ON the ring: the threshold within this of the measured radius.
RADIAL_TOLERANCE_M = 0.5

NEEDS_INTERIOR = ("matched", "tileset", "shell", "promised")

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

    def __init__(self, kits_dir: Path | None = None):
        self.by_asset: dict[str, dict] = {}
        self.kit_of: dict[str, str] = {}
        # `kits_dir=None` (the normal case): merge tracked + local per kit,
        # tracked winning for a kit present in both. An explicit `kits_dir`
        # (tests, a scratch build) reads that one directory only.
        paths = _merged_interior_files() if kits_dir is None else (
            sorted(kits_dir.glob("*.interiors.json")) if kits_dir.exists() else [])
        for path in paths:
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
_LIBRARY_DIR: list[Path | None] = [None]


def library(kits_dir: Path | None = None) -> InteriorLibrary:
    """Process-wide cache (read-only data, loaded once). `kits_dir=None` (the
    normal case) merges tracked + local per kit; see `InteriorLibrary`."""
    global _LIBRARY
    if _LIBRARY is None or _LIBRARY_DIR[0] != kits_dir:
        _LIBRARY_DIR[0] = kits_dir
        _LIBRARY = InteriorLibrary(kits_dir)
    return _LIBRARY


def angle_delta(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def entrance(record: dict | None) -> dict | None:
    """THE canonical way in of a piece, or None (owner ruling 2026-09-07)."""
    return (record or {}).get("entrance") or None


def front(record: dict | None) -> dict | None:
    """The derived front of a piece that has no entrance, or None when it is
    symmetric and any yaw will do."""
    return (record or {}).get("front") or None


def is_radial(way: dict | None) -> bool:
    return bool((way or {}).get("radial")) or "sideDeg" not in (way or {})


def entrance_bearing(record: dict | None, yaw_deg: float) -> float | None:
    """The world bearing of a piece's entrance under a parcel yaw. Local
    `sideDeg` and `yawDeg` share one convention (north = 0, clockwise, x east /
    z south), so the world bearing is their sum. A radial entrance has none."""
    way = entrance(record)
    if way is None or is_radial(way):
        return None
    return (float(way["sideDeg"]) + float(yaw_deg)) % 360.0


def rotate_m(x: float, z: float, yaw_deg: float) -> tuple[float, float]:
    """Local (x, z) turned by a compass yaw — the same rotation
    `blueprint_footprints` uses for the hull, so an entrance lands on the
    outline it was measured against."""
    t = math.radians(float(yaw_deg))
    c, s = math.cos(t), math.sin(t)
    return (x * c - z * s, x * s + z * c)


def entrance_offset_m(way: dict, yaw_deg: float) -> tuple[float, float] | None:
    """Where the entrance sits relative to the parcel centre, in world metres."""
    off = way.get("offsetM")
    if not (isinstance(off, list) and len(off) >= 2):
        return None
    return rotate_m(float(off[0]), float(off[1]), yaw_deg)


def entrance_radius_m(way: dict) -> float | None:
    """The ring radius of a radial entrance — from `radiusM`, else measured off
    its own offset."""
    r = way.get("radiusM")
    if isinstance(r, (int, float)):
        return float(r)
    off = way.get("offsetM")
    if isinstance(off, list) and len(off) >= 2:
        return math.hypot(float(off[0]), float(off[1]))
    return None


def match_entrance(record: dict | None, yaw_deg: float, facing_deg: float | None,
                   threshold_m: tuple[float, float] | None = None,
                   centre_m: tuple[float, float] | None = None,
                   ) -> tuple[bool, str]:
    """Does a door sit on the piece's canonical entrance: `(ok, reason)`.

    A fixed entrance accepts a facing within ``DOORWAY_TOLERANCE_DEG`` of its
    world bearing (`sideDeg + yawDeg`). A radial entrance (a rotunda, a door the
    authors turned to the street) accepts any bearing, but the threshold must
    lie within ``RADIAL_TOLERANCE_M`` of the ring radius measured from the
    parcel centre. `reason` is the plain-English detail the validator prints.
    """
    way = entrance(record)
    if way is None:
        return False, "the kit derives no entrance for this piece"
    kind = way.get("kind") or "?"
    if is_radial(way):
        radius = entrance_radius_m(way)
        if radius is None or threshold_m is None or centre_m is None:
            return False, f"the {kind} entrance is radial and there is no threshold to measure"
        got = math.hypot(threshold_m[0] - centre_m[0], threshold_m[1] - centre_m[1])
        if abs(got - radius) <= RADIAL_TOLERANCE_M:
            return True, f"{kind}, radial ring at {radius:.1f} m"
        return False, (f"the {kind} entrance is a radial ring at {radius:.1f} m, but the "
                       f"threshold stands {got:.1f} m out")
    if facing_deg is None:
        return False, f"the door has no facingDeg to check against the {kind} entrance"
    bearing = (float(way["sideDeg"]) + float(yaw_deg)) % 360.0
    off = angle_delta(float(facing_deg), bearing)
    if off <= DOORWAY_TOLERANCE_DEG:
        return True, f"{kind} entrance at {bearing:.0f}°, {off:.0f}° off"
    return False, f"the {kind} entrance faces {bearing:.0f}°, {off:.0f}° away"


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
        yaw = float(parcel.get("yawDeg") or 0.0)
        way = entrance(record)
        bearing = entrance_bearing(record, yaw)
        side_text = (f"{(way or {}).get('kind', '?')} at {bearing:.0f}°" if bearing is not None
                     else (f"{(way or {}).get('kind', '?')}, radial" if way
                           else f"none derivable — {record.get('entranceWhy', 'not measured')}"))
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
                if bearing is not None and isinstance(facing, (int, float)):
                    off = angle_delta(float(facing), bearing)
                    if off > DOORWAY_TOLERANCE_DEG:
                        problems.append(f"{door.get('id')}: facingDeg {float(facing):.0f}° is "
                                        f"{off:.0f}° off the entrance ({side_text})")
        elif doors:
            problems.append(f"has {len(doors)} door(s) but no interior — {record.get('why', '')}")
        lines.append(head + f"; entrance {side_text}")
        for problem in problems:
            lines.append(f"      ! {problem}")
        owed += len(problems)

    lines.append(f"  {owed} problem(s)")
    return lines


# --------------------------------------------------------------------------- #
# the tier A claim per door (decision 0103 decision 2; 16i item 4 fit rule)
# --------------------------------------------------------------------------- #
#: Footprint ratio band: the cell's ROOM plan (`interior_cells.room_of`: the
#: largest enclosing structural piece plus the structural pieces overlapping
#: it, never the yard, measured in that piece's own frame; planner rulings 1
#: and 2, interiors rounds 3 and 4) over the shell's measured `planAreaM2`
#: times its placed scale squared (ruling 1, round 4: `shell_scale`).
#: The band is derived from measured pairs (planner ruling 3, round 4): the
#: vanilla farmhouse cells over their own shells run 1.03-1.25 (Dawnstar
#: Brina's house 1.115, the farmhouse02 cells 1.034 up), the King of the
#: Murkmire pods over theirs 1.50-1.65 (KeebaHouseFisher over smpodext02
#: 1.504); 1.7 holds both with the pod's thickness of wall, 0.6 keeps a cell
#: no smaller than the smallest a builder would cut a house into.
FIT_RATIO = (0.6, 1.7)

#: A service no vanilla or mod interior serves (planner ruling 4, interiors
#: round 4): a stable is open-sided and no plugin authors a stable interior,
#: so a parcel offering only these is reserved to that pool (Phase 12 tier
#: B) and never claims a house cell.
NO_INTERIOR_SERVICES = {
    "stable": "no vanilla or mod plugin authors an interior for an open stable",
}

#: Which cell use-classes serve a parcel service (16i item 4: the use class
#: comes from the furniture mix). A parcel with no services is matched on its
#: `use`.
SERVICE_CLASSES = {
    "lodging": ("inn", "dwelling"),
    "trader": ("shop", "inn"),
    "smith": ("smithy",),
    "shrine": ("shrine",),
}
USE_CLASSES = {
    "dwelling": ("dwelling",),
    "storage": ("storage", "barracks"),
    # 0105 R26 (planner 2026-09-28): a parcel whose use is literally `work`
    # takes a smithy or a storage cell (`cell_use_class`; storage is its
    # bedless fallback). `workshop` is in the ruling's list but no cell is
    # classed so yet. Keyed on the exact use, so quays, docks and pens (the
    # `work` bucket in blueprint.USE_BUCKET) are unaffected.
    "work": ("smithy", "workshop", "storage"),
}

CONFIG_KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "kits"
_COMPOSITE_BASES: dict[str, str] | None = None


def composite_base(asset_id: str) -> str | None:
    """The base shell a composite is anchored on: the kit config's first
    `compose.parts` entry with no offset (0103 decision 1: a composite
    inherits its base shell's links)."""
    global _COMPOSITE_BASES
    if _COMPOSITE_BASES is None:
        _COMPOSITE_BASES = {}
        for path in sorted(CONFIG_KITS_DIR.glob("*.json")):
            try:
                cfg = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            for entry in cfg.get("assets", []) or []:
                parts = (entry.get("compose") or {}).get("parts") or []
                anchor = next((pt for pt in parts if not pt.get("offsetM")), parts[0] if parts else None)
                if anchor and isinstance(entry.get("asset"), str):
                    _COMPOSITE_BASES.setdefault(entry["asset"], anchor["asset"])
    return _COMPOSITE_BASES.get(asset_id)


#: 0105 R56 (planner 2026-09-28): the interior kits of a culture group and
#: the exterior shells their cells are linked from, named by the mod's own
#: architecture folders (the kit configs' descriptions name the cells): King
#: of the Murkmire's Argonian houses, pods and Hist-tree huts; Black Marsh &
#: Valenwood's grown tree-houses; HTBM's Argonian bamboo huts. Their linked
#: cells join the group's pool beside the exterior kits' own shells.
CULTURE_INTERIOR_KITS = {
    "argonian": {
        "interior-kotm-v1": ("kotm:argonia/blackwood/", "kotm:argonia/mudhuts/",
                             "kotm:argonia/trees/hist trees/", "kotm:denoffen/architecture/argonian/"),
        "bmv-treehouse-int": ("bmv:architecture/citebosmer/houses/",),
        "htbm-hut-int": ("htbm:here there be monsters - curse of cipactli/architecture/villages/argonian/",),
    },
}


def culture_shells(culture: str | None, links: dict[str, list[dict]] | None = None) -> list[str]:
    """Every asset the kit configs of `culture`'s kit sets list
    (`blueprint.KIT_SETS`; the sets sharing `cultureGroup` == culture when any
    do, else the sets of that `culture`), composites resolved to their base
    shell, then every linked shell under a `CULTURE_INTERIOR_KITS` folder of
    the group (R56)."""
    if not culture:
        return []
    shells = list(_culture_kit_shells(culture))
    folders = tuple(f for fs in (CULTURE_INTERIOR_KITS.get(culture) or {}).values() for f in fs)
    for shell in sorted(links if links is not None else linked_shells()):
        if folders and shell.startswith(folders) and shell not in shells:
            shells.append(shell)
    return shells


@lru_cache(maxsize=None)
def _culture_kit_shells(culture: str) -> tuple[str, ...]:
    """The kit-config half of `culture_shells`, parsed once per process."""
    from .blueprint import KIT_SETS
    grouped = [s for s in KIT_SETS.values() if s.get("cultureGroup") == culture]
    sets = grouped or [s for s in KIT_SETS.values() if s.get("culture") == culture]
    kits = sorted({k for s in sets for k in s["kits"]})
    shells: list[str] = []
    for kit in kits:
        path = CONFIG_KITS_DIR / f"{kit}.json"
        try:
            cfg = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for entry in cfg.get("assets", []) or []:
            asset = entry.get("asset")
            if isinstance(asset, str):
                base = composite_base(asset) or asset if asset.startswith("composite:") else asset
                if base not in shells:
                    shells.append(base)
    return tuple(shells)


def culture_pool_rows(culture: str | None, links: dict[str, list[dict]],
                      pools=None) -> list[dict]:
    """The culture pool (R52): every cell a plugin links to any shell of the
    culture's kits, once per cell, each row tagged with the `nativeShell` it
    is linked to (its room plan is measured under that shell). `pools`
    (culture -> shells) is injectable for tests."""
    shells = (pools or {}).get(culture) if pools is not None else culture_shells(culture, links)
    rows, seen = [], set()
    for shell in shells or []:
        for row in links.get(shell) or []:
            key = (row["plugin"], row["interiorCell"])
            if key in seen:
                continue
            seen.add(key)
            rows.append({**row, "nativeShell": shell})
    return rows


def _leaf(model: str) -> str:
    return model.rsplit("/", 1)[-1].lower()


def cell_use_class(pieces: list[dict]) -> tuple[str, dict]:
    """The use class of a cell from its furniture mix (16i item 4): beds and a
    bar = inn, counter = shop, shrine = shrine, beds with no hearth = barracks,
    a bed and a hearth = dwelling, no bed = storage. Beds are FURN pieces under
    `furniture/`; counters are the `clutter/counterset/` directory; the hearth
    is a fireplace, hearth wall, cooking spit, oven or fire pit."""
    beds = counters = hearths = shrines = smithy = 0
    for piece in pieces or []:
        model = str(piece.get("model", "")).lower()
        n = int(piece.get("count", 1))
        leaf = _leaf(model)
        if "/furniture/" in f"/{model.split(':', 1)[-1]}" and "bed" in leaf and "marker" not in leaf:
            beds += n
        if "/counterset/" in model:
            counters += n
        if "shrine" in leaf or "altar" in leaf:
            shrines += n
        if any(t in leaf for t in ("fireplace", "hearth", "cookingspit", "oven", "firepit")):
            hearths += n
        if any(t in leaf for t in ("anvil", "forge", "smelter", "tanningrack")):
            smithy += n
    evidence = {"beds": beds, "counters": counters, "hearths": hearths,
                "shrines": shrines, "smithy": smithy}
    if shrines:
        return "shrine", evidence
    if counters and beds >= 3:
        return "inn", evidence
    if counters:
        return "shop", evidence
    if smithy:
        return "smithy", evidence
    if beds >= 3 and not hearths:
        return "barracks", evidence
    if beds:
        return "dwelling", evidence
    return "storage", evidence


def wanted_classes(parcel: dict) -> list[tuple[str, tuple[str, ...]]]:
    """`[(need, acceptable classes)]` for a parcel: one row per service, or
    its `use` when it offers none."""
    services = [s for s in (parcel.get("services") or []) if isinstance(s, str)]
    if services:
        return [(s, SERVICE_CLASSES.get(s, ())) for s in services]
    use = parcel.get("use")
    return [(f"use:{use}", USE_CLASSES.get(use, ()))] if use else []


def _pool_of(asset_id: str) -> str:
    return asset_id.split(":", 1)[0] if ":" in asset_id else "?"


def shell_entrances(record: dict) -> list[float | None]:
    """The shell's exterior entrances as bearings (north = 0, clockwise, in
    its own frame; None for a radial one): `entrances[]` when the kit record
    lists several, else its one canonical `entrance`."""
    ways = record.get("entrances") or ([record["entrance"]] if record.get("entrance") else [])
    return [None if is_radial(w) else float(w["sideDeg"]) % 360.0 for w in ways]


_MANIFEST_SCALES: dict[str, float] | None = None
PUBLISHED_KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"


def manifest_scale(asset_id: str) -> float | None:
    """The shell's `placedScaleMedian` from its published kit manifest (the
    plugins' median placed scale, `placement_metadata`), or None."""
    global _MANIFEST_SCALES
    if _MANIFEST_SCALES is None:
        _MANIFEST_SCALES = {}
        for path in sorted(PUBLISHED_KITS_DIR.glob("*.kit.json")):
            try:
                doc = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            for row in doc.get("assets", []) or []:
                if isinstance(row.get("placedScaleMedian"), (int, float)):
                    _MANIFEST_SCALES.setdefault(row["id"], float(row["placedScaleMedian"]))
    return _MANIFEST_SCALES.get(asset_id)


def shell_scale(parcel: dict, ref: str | None, scales=manifest_scale) -> float:
    """The scale the parcel's shell stands at (planner ruling 1, interiors
    round 4): the parcel's own `scale` when the layout set one, else the
    shell's plugin median placed scale (the workbench `place` default), else
    1. A composite is assembled at its authored scale already: 1."""
    own = parcel.get("scale")
    if isinstance(own, (int, float)) and own > 0:
        return float(own)
    if not isinstance(ref, str) or ref.startswith("composite:"):
        return 1.0
    return float(scales(ref) or 1.0)


def _count(n, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def prefer_cell(door: dict) -> tuple[str, str] | None:
    """A door's `preferCell` `{cellId, why}`: the story's choice of cell for
    its parcel, honoured when that cell passes the fit rule. Malformed is an
    error, never silently ignored."""
    pref = door.get("preferCell")
    if pref is None:
        return None
    if not (isinstance(pref, dict) and isinstance(pref.get("cellId"), str) and pref["cellId"]
            and isinstance(pref.get("why"), str) and pref["why"].strip()
            and set(pref) == {"cellId", "why"}):
        raise ValueError(f"door {door.get('id')}: preferCell must be {{cellId, why}} with both set")
    return pref["cellId"], pref["why"].strip()


_SOURCING_ENV: dict = {}


def vault_holds_mesh(model: str, registry: dict, manifest: set[str]) -> bool:
    """A mesh the vault holds somewhere: a registered pool asset, or a path in
    the vanilla archives' mesh manifest (``skyrim-source/manifest-skyrim-meshes.txt``)."""
    key = model.lower() if model.lower().startswith("meshes/") else "meshes/" + model.lower()
    return key in registry or key in manifest


def process_plugin_cache():
    """This process's `plugin_cache.PluginCache`, held in the per-process
    environment `bundle_sourcing` already keeps (paths, pools, registry), so
    `plugin_profile` and `bundle_sourcing` parse each plugin once between them
    whoever calls them (``--claim``, the batch pre-pass). A caller that owns
    its own cache passes it as ``cache=``."""
    if "cache" not in _SOURCING_ENV:
        from .plugin_cache import PluginCache
        _SOURCING_ENV["cache"] = PluginCache()
    return _SOURCING_ENV["cache"]


def bundle_sourcing(plugin: str, cell: str, cache=None) -> dict:
    """``{unsourced, misses, gate}`` for one cell, from its bundle as
    `export_interior_bundle` builds it against the published kits and its
    recorded stand-ins: ``unsourced`` the missing pieces we hold nowhere (a
    mesh ``vault_holds_mesh`` does not find, or a base in a master we do not
    hold), ``misses`` their count by class (the planner's asset rule
    2026-09-27: only clutter and furniture may be stood in), and the
    acceptance gate's findings (`export_interior_bundle.check`: every
    reference placed, dropped or stood in, no missing architecture piece; and
    no ``no-kit-asset`` drop). Read once per cell."""
    from . import export_interior_bundle as ex
    key = (plugin, cell)
    if key in _SOURCING_ENV:
        return _SOURCING_ENV[key]
    if "env" not in _SOURCING_ENV:
        from .asset_registry import DEFAULT_VAULT
        paths, pools, registry = ex._environment()
        manifest_path = DEFAULT_VAULT / "skyrim-source" / "manifest-skyrim-meshes.txt"
        manifest = ({line.strip().lower() for line in manifest_path.read_text(errors="replace").splitlines()}
                    if manifest_path.exists() else set())
        _SOURCING_ENV["env"] = (paths, pools, registry, manifest, ex.published_kit_assets())
    paths, pools, registry, manifest, kit_assets = _SOURCING_ENV["env"]
    bundle = ex.export_cell(plugin, cell, paths, registry, kit_assets, lambda n: pools.get(n),
                            cache=cache if cache is not None else process_plugin_cache())
    gaps = [d for d in bundle["drops"] if d["reason"] == "no-kit-asset"]
    gate = ex.check(bundle)
    if gaps:
        models = sorted({d.get("model") or "?" for d in gaps})
        gate.append(f"{len(gaps)} references need a mesh no published kit holds: {', '.join(models)}")
    missing = [d for d in bundle["drops"] if d["reason"] == "unresolved-base"
               or (d["reason"] == "no-kit-asset" and d.get("model")
                   and not vault_holds_mesh(d["model"], registry, manifest))]
    out = {"unsourced": [d.get("model") or d.get("baseForm") or "?" for d in missing],
           "misses": dict(sorted(Counter(d.get("class", "unclassed") for d in missing).items())),
           "gate": gate}
    _SOURCING_ENV[key] = out
    _SOURCING_ENV[("kits",) + key] = {
        "kits": sorted(bundle.get("kits") or []),
        "missingAssets": sorted({d["assetId"] for d in gaps if d.get("assetId")})}
    return out


def bundle_kits(plugin: str, cell: str) -> dict:
    """``{kits, missingAssets}`` of one cell's bundle (the same read as
    ``bundle_sourcing``): the published kits its placements and stand-ins
    use, and the asset ids no published kit holds yet (the batch pre-pass
    builds the kit config that lists them)."""
    bundle_sourcing(plugin, cell)
    return _SOURCING_ENV[("kits", plugin, cell)]


def claim_for_parcel(parcel: dict, lib: InteriorLibrary, links: dict[str, list[dict]],
                     profile, scales=manifest_scale, prefer: tuple[str, str] | None = None,
                     used: set[str] | frozenset = frozenset(), sourcing=None,
                     culture: str | None = None, pools=None, whole_pool: bool = False) -> dict:
    """The tier A (or reserved) claim for one enterable parcel, with every
    candidate's measurements. `profile(plugin, cell, shell) -> dict | None`
    is the cell's measured profile (`interior_cells.profile_cell`: structural
    plan, storeys, exterior load doors; injected so tests stay off the
    vault). `prefer` `(cellId, why)` picks that cell when it fits; otherwise
    the parcel takes the fitting cell with the most placements that no
    earlier parcel of the same shell holds (`used`), and only when every
    fitting cell is held does it share one. `sourcing(plugin, cell) ->
    {unsourced, gate}` (``bundle_sourcing``; injected, None skips it) makes
    the rule asset-aware (16k interiors r8, owner rule): a cell whose bundle
    fails the acceptance gate does not fit, and a cell needing a mesh the vault
    holds nowhere ranks below every fitting cell whose meshes all resolve.
    A shell no plugin links to a cell (R52, the owner's correction of 0103
    decision 1) is fitted against every linked cell of its `culture` pool
    (`culture_pool_rows`), each profiled under the shell it is linked to.
    The missing pieces are counted over clutter only (planner ruling
    2026-09-27): a cell missing a piece of any other class (architecture, a
    container, a light, an unclassed base in an absent master) does not fit,
    and fitting cells rank by how many clutter pieces still lack a stand-in.
    `whole_pool` measures the shell's linked cells and every cell of the
    culture pool (0105 R57: the fit set `interiors.variety` judges reuse by)."""
    from .interior_cells import pair_doors
    ref = parcel.get("assetRef")
    record = lib.get(ref) if isinstance(ref, str) else None
    shell = ref
    inherited = None
    if isinstance(ref, str) and ref.startswith("composite:"):
        inherited = composite_base(ref)
        shell = inherited or ref
    rows = links.get(shell) or []
    pool = _pool_of(shell or "?")
    services = [s for s in (parcel.get("services") or []) if isinstance(s, str)]
    if services and all(s in NO_INTERIOR_SERVICES for s in services):
        return {"tier": "reserved", "pool": services[0],
                "why": NO_INTERIOR_SERVICES[services[0]],
                "candidates": []}
    if record is None:
        return {"tier": "reserved", "pool": pool,
                "why": f"{ref!r} is not in the interiors index, so no footprint to fit against",
                "candidates": []}
    unlinked = not rows
    if unlinked:
        # 0103 decision 1 as corrected by the owner 2026-09-28 (R52): a shell
        # with a door and no plugin-linked cell takes a cell from its culture
        # pool by the same fit rule; it is never left without a room.
        rows = culture_pool_rows(culture, links, pools=pools)
        if not rows:
            via = f" (the base shell of {ref})" if inherited else ""
            return {"tier": "reserved", "pool": pool,
                    "why": (f"no plugin links {shell}{via} to a furnished cell and the "
                            f"{culture or 'unknown'} culture pool has no linked cell"),
                    "candidates": []}
    scale = shell_scale(parcel, ref, scales)
    area = float(record.get("planAreaM2") or 0.0) * scale * scale
    entrances = shell_entrances(record)
    shell_storeys = record.get("storeys")
    needs = wanted_classes(parcel)
    def measure(row: dict) -> dict:
        prof = profile(row["plugin"], row["interiorCell"], row.get("nativeShell") or shell) or {}
        plan_m = prof.get("structuralPlanM") or [0.0, 0.0]
        plan = float(plan_m[0]) * float(plan_m[1])
        ratio = round(plan / area, 3) if area > 0 and plan > 0 else None
        storeys = prof.get("storeys")
        ext = prof.get("exteriorDoors") or []
        cls, evidence = cell_use_class(row.get("pieces") or [])
        served = [need for need, ok in needs if cls in ok]
        fails = []
        if not prof:
            fails.append("the cell could not be read from its plugin")
        if ratio is None or not (FIT_RATIO[0] <= ratio <= FIT_RATIO[1]):
            fails.append(f"footprint ratio {ratio} outside {FIT_RATIO[0]}-{FIT_RATIO[1]}")
        # ruling 2 (interiors round 3): a cell may have more storeys than its
        # shell shows (stairs inside), never fewer.
        if shell_storeys is not None and (storeys or 0) < shell_storeys:
            fails.append(f"{storeys} storeys, the shell has {shell_storeys}")
        pairing, pair_why = pair_doors(entrances, [float(d["bearingDeg"]) for d in ext],
                                       [float(d["positionM"][2]) for d in ext])
        if pairing is None:
            fails.append(f"door pairing refused: {pair_why}")
        if needs and not served:
            fails.append(f"use class {cls} serves none of {[n for n, _ in needs]}")
        src = sourcing(row["plugin"], row["interiorCell"]) if sourcing else {}
        if src.get("gate"):
            fails.append(f"its bundle fails the acceptance gate: {'; '.join(src['gate'])}")
        hard = {c: n for c, n in (src.get("misses") or {}).items()
                if c not in SUBSTITUTABLE_CLASSES}
        if hard:
            fails.append("it misses pieces no stand-in may replace: "
                         + ", ".join(f"{n} {c}" for c, n in sorted(hard.items())))
        return {
            "cellId": row["interiorCell"], "plugin": row["plugin"],
            "ratio": ratio, "structuralPlanM": plan_m, "storeys": storeys,
            "shellScale": scale, "shellPlanM2": round(area, 2),
            "exteriorLoadDoors": len(ext), "interiorLoadDoors": prof.get("interiorDoors"),
            "pairing": pair_why,
            "doors": [ext[j] for j in pairing] if pairing is not None else [],
            "closedDoors": ([d["refId"] for j, d in enumerate(ext) if j not in pairing]
                            if pairing is not None else []),
            "useClass": cls, "furniture": evidence, "served": served,
            "placements": int(row.get("placements") or 0), "fails": fails,
            **({"nativeShell": row["nativeShell"]} if row.get("nativeShell") else {}),
            **({"unsourced": list(src.get("unsourced") or []),
                "misses": dict(src.get("misses") or {})} if sourcing else {}),
        }

    candidates = [measure(row) for row in rows]
    linked_fit = [c for c in candidates if not c["fails"]]
    extended = ""
    if not unlinked and culture and (whole_pool or not any(c["cellId"] not in used
                                                          for c in linked_fit)):
        # R52: no linked cell fits, or every fitting one already furnishes
        # another building here, so the culture pool offers the next fitting
        # cell before any building shares one; with no linked cell fitting,
        # a held pool cell is shared rather than the building left without
        # a room (the unlinked-shell case). `whole_pool` (R57) always adds it.
        linked_cells = {(c["plugin"], c["cellId"]) for c in candidates}
        extra = [measure(row) for row in culture_pool_rows(culture, links, pools=pools)
                 if (row["plugin"], row["interiorCell"]) not in linked_cells]
        if (whole_pool or not linked_fit
                or any(not c["fails"] and c["cellId"] not in used for c in extra)):
            candidates += extra
            extended = "held" if linked_fit else "unfit"
    fit = [c for c in candidates if not c["fails"]]
    linked_to = (f"the {culture} culture pool (no plugin links {shell})" if unlinked
                 else str(shell))
    if not fit:
        lead = (f"the 1 cell of {linked_to} does not pass" if len(candidates) == 1 else
                f"0 of the {len(candidates)} cells of {linked_to} pass")
        return {"tier": "reserved", "pool": pool,
                "why": (f"{lead} the fit rule "
                        f"(room footprint {FIT_RATIO[0]}-{FIT_RATIO[1]}, at least the shell's storeys, "
                        f"an exterior load door for every entrance, use class"
                        f"{', the acceptance gate' if sourcing else ''})"),
                "candidates": candidates}
    fit.sort(key=lambda c: (len(c.get("unsourced") or []), -len(c["served"]), -c["placements"],
                            c["cellId"]))
    chosen = next((c for c in fit if prefer and c["cellId"] == prefer[0]), None)
    free = [c for c in fit if c["cellId"] not in used]
    # every fitting cell held: share the one fewest buildings here hold
    # (`used` may map cell -> holders; a plain set counts each once)
    held_by = (lambda c: used.get(c["cellId"], 0)) if isinstance(used, dict) else (lambda c: 1)
    best = chosen or (free[0] if free else min(fit, key=held_by))
    via = f" (the base shell of {ref})" if inherited else ""
    at = f" at scale {scale:g}" if scale != 1.0 else ""
    if chosen:
        pick = f"chosen for this door: {prefer[1]}"
    elif prefer:
        pick = f"{prefer[0]} was asked for but does not fit, so the most-used free cell is taken"
    elif len(free) < len(fit):
        held = sorted(c["cellId"] for c in fit if c["cellId"] in used)
        pick = (f"{', '.join(held)} already furnished another building here, so the plugin's "
                f"most-used free cell is taken ({_count(best['placements'], 'door link')})")
    elif len(fit) == 1:
        pick = ""               # "1 of N cells ... fit" already says it
    else:
        pick = (f"ties broken on the plugin's most-used cell "
                f"({_count(best['placements'], 'door link')}), then cell id")
    source = (f"cells of the {culture} culture pool fit {shell}{via}, which no plugin links to a "
              f"cell" if unlinked else
              f"cells linked to {shell}{via} or in the {culture} culture pool fit, every linked "
              f"one already furnishing another building here" if extended == "held" else
              f"cells linked to {shell}{via} or in the {culture} culture pool fit, no linked "
              f"one passing the fit rule" if extended == "unfit" else
              f"cells linked to {shell}{via} fit")
    why = (f"{len(fit)} of {len(candidates)} {source}; {best['cellId']} "
           f"is a {best['useClass']} serving {', '.join(best['served']) or 'its use'}, room "
           f"footprint ratio {best['ratio']} to the shell{at}, {_count(best['storeys'], 'storey')}, "
           f"{_count(best['exteriorLoadDoors'], 'exterior load door')}"
           f"{f' ({pairing})' if (pairing := best['pairing']) and best['closedDoors'] else ''}"
           f"{f'; {pick}' if pick else ''}")
    return {"tier": "A", "cellId": best["cellId"], "plugin": best["plugin"], "why": why,
            "doors": best["doors"], "closedDoors": best["closedDoors"], "candidates": candidates}


from .export_interior_bundle import SUBSTITUTABLE_CLASSES  # noqa: E402
from .interior_cells import game_marker  # noqa: E402

_PROFILE_PATHS: dict[str, Path] | None = None


def plugin_profile(plugin: str, cell: str, shell: str | None, cache=None) -> dict | None:
    """The cell's measured profile, read from its plugin (`interior_cells`)."""
    global _PROFILE_PATHS
    from . import interior_cells as ic
    if _PROFILE_PATHS is None:
        _PROFILE_PATHS = ic.plugin_paths()
    world = ic.world_for(plugin, _PROFILE_PATHS.get,
                         cache if cache is not None else process_plugin_cache())
    return ic.profile_cell(world, cell, shell) if world is not None else None


def claim_doors(bp: dict, lib: InteriorLibrary | None = None,
                links: dict[str, list[dict]] | None = None,
                profile=plugin_profile, scales=manifest_scale, sourcing=None) -> list[dict]:
    """Write `interiorClaim` onto every door of a blueprint: tier A with
    cellId/plugin/why, the paired `interiorLoadDoorRef` and this door's
    `arrivalMarker` (the bundle's cell frame: game y-up metres),
    or tier reserved/pool/why, and its `doorType` (door_types: load or
    swing; a door of an open-fronted building with no interior is dropped);
    returns one report row per door with the candidates. Doors of one parcel take the paired load doors in order
    (entrance i -> the door paired to it). Existing claim fields
    (owner, culture) are kept; interiorRef and sizeClass are rewritten from
    the parcel's piece whenever the interiors index holds it."""
    lib = lib if lib is not None else library()
    links = links if links is not None else linked_shells()
    parcels = {p.get("id"): p for p in bp.get("parcels", []) or []}
    out = []
    seen: dict[str, int] = {}
    cache: dict[str, dict] = {}
    doors = bp.get("doors", []) or []
    prefs: dict[str, tuple[str, str]] = {}
    for door in doors:
        pref = prefer_cell(door)
        if pref is not None:
            prefs.setdefault(door.get("parcelId"), pref)
    # parcels that name a cell claim first, so a later parcel of the same
    # shell never takes the cell the story gave another building
    used: dict[str, dict[str, int]] = {}
    order = [d.get("parcelId") for d in doors if d.get("parcelId") in prefs]
    order += [d.get("parcelId") for d in doors if d.get("parcelId") not in prefs]
    for pid in order:
        if pid in cache:
            continue
        parcel = parcels.get(pid) or {}
        ref = parcel.get("assetRef")
        shell = (composite_base(ref) or ref) if isinstance(ref, str) and ref.startswith("composite:") else ref
        # one cell furnishes one building per place while a free one fits,
        # then the least-held is shared (R52: the culture pool is shared by
        # every shell, so the count is place-wide)
        held = used.setdefault("*", {})
        culture = next(((d.get("interiorClaim") or {}).get("culture") for d in doors
                        if d.get("parcelId") == pid and (d.get("interiorClaim") or {}).get("culture")),
                       None)
        cache[pid] = claim_for_parcel(parcel, lib, links, profile, scales,
                                      prefer=prefs.get(pid), used=dict(held),
                                      sourcing=sourcing, culture=culture)
        if cache[pid]["tier"] == "A":
            held[cache[pid]["cellId"]] = held.get(cache[pid]["cellId"], 0) + 1
    from .door_types import door_type
    dropped: set[int] = set()
    for door in doors:
        pid = door.get("parcelId")
        parcel = parcels.get(pid) or {}
        result = cache[pid]
        nth = seen.get(pid, 0)
        seen[pid] = nth + 1
        claim = dict(door.get("interiorClaim") or {})
        for key in ("tier", "cellId", "plugin", "pool", "why", "interiorLoadDoorRef",
                    "arrivalMarker"):
            claim.pop(key, None)
        # the piece's own interior kit and size class follow the shell, so a
        # shell swap never keeps the old shell's (GREENSPRING5: a hut -> pod
        # swap kept 'vanilla-farmhouse-int' and failed the schema check)
        record = lib.get(parcel.get("assetRef")) if isinstance(parcel.get("assetRef"), str) else None
        if record is not None:
            want = record.get("interiorAssetRef") or record.get("tileset")  # InteriorLibrary.interior_ref
            if want is not None:
                claim["interiorRef"] = want
            if record.get("sizeClass") is not None:
                claim["sizeClass"] = record["sizeClass"]
        tier = result["tier"]
        paired = (result.get("doors") or [])
        if tier == "A" and nth >= len(paired):
            tier = "reserved"
            claim["tier"] = tier
            claim["pool"] = _pool_of(parcel.get("assetRef") or "?")
            claim["why"] = (f"{result['cellId']} has {_count(len(paired), 'exterior load door')}; this is "
                            f"door {nth + 1} of the parcel")
        elif tier == "A":
            claim["tier"] = "A"
            claim["cellId"] = result["cellId"]
            claim["plugin"] = result["plugin"]
            claim["interiorLoadDoorRef"] = paired[nth]["refId"]
            claim["arrivalMarker"] = game_marker(paired[nth]["arrivalMarker"])
            claim["why"] = result["why"]
        else:
            claim["tier"] = tier
            claim["pool"] = result["pool"]
            claim["why"] = result["why"]
        door["interiorClaim"] = claim
        # the door's type from its claim first (door_types; planner ruling
        # 2026-09-27): None = no interior and an open front, so no door
        kind = door_type(door, parcel.get("assetRef"))
        if kind is None:
            door.pop("doorType", None)
            dropped.add(id(door))
        else:
            door["doorType"] = kind
        out.append({"door": door.get("id"), "parcel": parcel.get("id"),
                    "assetRef": parcel.get("assetRef"), "doorType": kind, **result})
    if dropped:
        bp["doors"] = [d for d in doors if id(d) not in dropped]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--report", help="a blueprint json, or a directory of them")
    ap.add_argument("--claim", help="a blueprint json: write each door's interiorClaim "
                    "(tier A cell or reserved, decision 0103) and print the picks")
    ap.add_argument("--parcels", default="",
                    help="with --claim: extra comma-separated parcel ids to report (no write)")
    ap.add_argument("--kits-dir", default=str(KITS_DIR))
    ap.add_argument("--no-table", action="store_true",
                    help="with --claim: read every cell from its plugin, ignoring the batch "
                         "pre-pass claim table (worldgen.batch_prepass)")
    args = ap.parse_args()
    if args.claim:
        # every cell read from its plugin is a heavy job (Greenspring
        # 2026-09-29: minutes of CPU); run it where the watchdog cannot
        # stop it and a heavy slot bounds it (worldgen.job_guard).
        from .job_guard import reexec_guarded
        reexec_guarded("interiors-claim", "worldgen.blueprint_interiors")
        return claim_main(Path(args.claim), [p for p in args.parcels.split(",") if p],
                          use_table=not args.no_table)
    if not args.report:
        ap.error("--report or --claim is required")

    target = Path(args.report)
    if target.is_dir():
        # the one rule (blueprint_files.py): a blueprint's own .layout.json
        # is not a blueprint and is never read as one, even when --report
        # points at the blueprints folder itself.
        paths = [p for p in sorted(target.glob("*.json")) if not p.name.endswith(".layout.json")]
    else:
        paths = [target]
    lib = library(Path(args.kits_dir))
    for path in paths:
        data = json.loads(path.read_text())
        bp = data.get("blueprint", data)
        print("\n".join(report_lines(bp, lib)))
        print()
    return 0


def table_or_plugin(table, miss_error):
    """(profile, sourcing) that look a cell up in the claim table and read it
    from its plugin, with a warning, when the table has no entry for it."""
    def profile(plugin, cell, shell):
        try:
            return table.profile(plugin, cell, shell)
        except miss_error as err:
            print(f"claim: WARNING {err.message}; reading it from its plugin", file=sys.stderr)
            return plugin_profile(plugin, cell, shell)

    def sourcing(plugin, cell):
        try:
            return table.sourcing(plugin, cell)
        except miss_error as err:
            print(f"claim: WARNING {err.message}; reading it from its plugin", file=sys.stderr)
            return bundle_sourcing(plugin, cell)
    return profile, sourcing


def claim_main(path: Path, extra_parcels: list[str], use_table: bool = True) -> int:
    """`--claim`. With the batch pre-pass table present (S16), every cell's
    profile and sourcing are looked up in it, never read from the plugins.
    A table whose inputs moved falls back to the plugin reads (~21 s) with a
    warning naming the rebuild command, and a cell the table lacks is read
    from its plugin with a warning (walk 3 L8 rec 2: a commit to one input
    code file once refused every claim, exit 2). No table: the plugin reads."""
    data = json.loads(path.read_text())
    bp = data.get("blueprint", data)
    profile, sourcing = plugin_profile, bundle_sourcing
    if use_table:
        from . import batch_prepass
        try:
            table = batch_prepass.current_table()
        except batch_prepass.TableError as err:
            print(f"claim: WARNING {err.message}; reading every cell from its plugin instead",
                  file=sys.stderr)
        else:
            if table is not None:
                profile, sourcing = table_or_plugin(table, batch_prepass.TableError)
                print(f"claim: looked up in {batch_prepass._label(table.path)} "
                      f"(inputs {table.doc['inputsDigest'][:8]}, current)", file=sys.stderr)
            else:
                print("claim: no batch pre-pass table, reading every cell from its plugin "
                      "(python3 -m worldgen.batch_prepass --places <ids> makes this a lookup)",
                      file=sys.stderr)
    try:
        rows = claim_doors(bp, profile=profile, sourcing=sourcing)
        parcels = {p.get("id"): p for p in bp.get("parcels", []) or []}
        lib, links = library(), linked_shells()
        for pid in extra_parcels:
            rows.append({"door": None, "parcel": pid, "assetRef": parcels[pid].get("assetRef"),
                         **claim_for_parcel(parcels[pid], lib, links, profile,
                                            sourcing=sourcing)})
    except SystemExit as err:
        if getattr(err, "message", None):
            print(f"claim: {err.message}", file=sys.stderr)
        raise
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(rows, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
