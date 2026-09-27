"""Mine **exterior -> interior door links** out of the shipped plugins.

Owner ruling 2026-09-07: *every exterior designed to have an interior must be
matched to the actual interior it is designed to go with, and must have a
derived entrance.* Filenames cannot answer that; the plugins can. A modder
links a building to its inside with a **load door**: an exterior door ``REFR``
carrying an ``XTEL`` teleport subrecord whose target is a door ``REFR`` sitting
inside an interior ``CELL``. That cell's own ``REFR`` list is the complete piece
set of the interior. See
`docs/research/placement-settlements/exterior-interior-linking-in-skyrim-mods.md`.

What this module derives, per link:

* **shell** — the building the exterior door belongs to. Rule, and it is a
  measurement, not a label: among the ``STAT``/``MSTT``/``SCOL`` refs within
  ``SHELL_RADIUS_M`` of the door whose base object is big enough to be a
  building (``OBND`` diagonal >= ``SHELL_MIN_OBND_M``), the door's own
  building is the one whose ``OBND`` box (scaled by the reference) holds it,
  among candidates whose scaled box is of the building footprint class
  (``footprint_class``: trim never wins a door, planner ruling 7, round 4),
  then one within ``DOOR_IN_WALL_M`` of it (planner ruling 4, interiors
  round 3), then one within ``GAP_MAX_M``; inside each band the larger ``OBND`` volume wins (an
  ivy overlay or a stair block against the same door is a fraction of the
  house). Only when nothing is against the door does the nearest pivot
  decide. Small props are excluded by the size floor, not by name.
* **doorOffsetInShell** — the exterior door's position and yaw expressed in the
  shell's own frame (`to_local`: rot.z is a clockwise heading). **This is the
  derived entrance**: where, on this shell, the way in is.
* **interiorPieces** — every ``STAT``/``FURN``/``CONT``/``LIGH``/``DOOR``/
  ``MSTT``/``ACTI`` ref in the target cell, as model -> count.
* **interiorSizeM** — the plan/height extent of those pieces.

Both directions are read: a load door in an interior whose target REFR lives in
an exterior cell evidences the same link, and some mods only author one side.

Deterministic: plugins sorted, models sorted, metres rounded, no timestamps.
Provenance: plugin file name plus sha256 for every plugin mined.

Run (from tooling/world-generation/):
  python3 -m worldgen.mine_door_links            # every pool plugin in the vault
  python3 -m worldgen.mine_door_links --out <path>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from .asset_registry import DEFAULT_VAULT, POOLS, REPO_ROOT, _resolve
from .asset_taxonomy import classify
#: The room ratio band is the claim's own (one number, `blueprint_interiors`).
from .blueprint_interiors import FIT_RATIO
from .esp_index import (GT_WORLD_CHILDREN, UNITS_PER_METRE, Plugin, decode_ref)

OUT_PATH = REPO_ROOT / "world" / "sources" / "placement" / "exterior-interior-links.json"
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"
SCHEMA_VERSION = 1

#: How far from a door we will look for the building it is hung on.
SHELL_RADIUS_M = 12.0
#: A building's bounding box diagonal floor — under this it is a prop.
SHELL_MIN_OBND_M = 2.5
SHELL_TYPES = {"STAT", "MSTT", "SCOL"}
#: A door is hung on a *building*, so the candidate is filtered by what it
#: cannot be rather than by what it is called: the taxonomy's living, loose and
#: prop categories are never a shell however large their bounding box, but
#: `misc` stays in because several mods file their whole house mesh under a
#: private directory the taxonomy has no rule for (`gv_meshes/argoniannest/`,
#: `dmargonian/`) and a whitelist would throw those buildings away.
NOT_SHELL_CATEGORIES = frozenset({
    "lod", "tree", "plant", "shrub", "grass", "fungus", "aquatic-plant", "root",
    "deadfall", "creature", "boat", "vehicle", "weapon", "armour", "ammo",
    "ice", "rock", "door", "light", "container", "furniture", "clutter",
    "signage", "terrain-feature", "effect",
})
#: Directory evidence beats any category: nothing under these is geometry a
#: player can enter (quest markers, particle effects, the skydome).
NOT_SHELL_DIRS = ("markers/", "effects/", "sky/", "interface/")
#: Footprint class (planner ruling 7, interiors round 4): a candidate is a
#: BUILDING only when its scaled ``OBND`` box could hold a person walking in —
#: both plan sides at least ``BUILDING_MIN_SIDE_M`` (a door leaf is ~1.2 m
#: wide, so a thinner piece is a wall panel, flag, door trim or beam), at
#: least ``BUILDING_MIN_HEIGHT_M`` tall (standing room: floor chunks, roads,
#: rubble and planters are lower) and at least ``BUILDING_MIN_PLAN_M2`` in
#: plan (arches, braziers, pillars are smaller). Everything else is TRIM and
#: never wins a door, whatever its name; a door with only trim around it is
#: reported ``shellNotFound``. Measured on the r3 moved cells: Windhelm flags
#: 1.4 x 5.4 x 1.7 m, door trim 3.0 x 0.57 m, a castle arch 2.7 x 2.15 m
#: (5.8 m2) are trim; the smallest real shells kept are the Imperial fort
#: door-hole module 2.42 x 3.76 x 3.64 m (9.1 m2) and a shack frame
#: 3.83 x 2.11 x 4.71 m.
BUILDING_MIN_SIDE_M = 2.0
BUILDING_MIN_HEIGHT_M = 2.0
BUILDING_MIN_PLAN_M2 = 6.0


def footprint_class(dims_m: tuple[float, float, float]) -> str:
    """``"building"`` or ``"trim"`` from a scaled OBND ``(x, y, z)`` in metres."""
    dx, dy, dz = dims_m
    if (min(dx, dy) >= BUILDING_MIN_SIDE_M and dz >= BUILDING_MIN_HEIGHT_M
            and dx * dy >= BUILDING_MIN_PLAN_M2):
        return "building"
    return "trim"


def obnd_dims_m(base, scale: float = 1.0) -> tuple[float, float, float]:
    """The base object's OBND extents in metres, times the reference scale."""
    if not base or not base.bounds:
        return (0.0, 0.0, 0.0)
    x0, y0, z0, x1, y1, z1 = base.bounds
    k = float(scale or 1.0) / UNITS_PER_METRE
    return (abs(x1 - x0) * k, abs(y1 - y0) * k, abs(z1 - z0) * k)


def shell_candidate_model(model: str) -> bool:
    """A base model the shell rule may consider at all (taxonomy and
    directory exclusions; the footprint class is applied per reference)."""
    if classify(model).category in NOT_SHELL_CATEGORIES:
        return False
    return not any(model.startswith(d) or f"/{d}" in model for d in NOT_SHELL_DIRS)


#: Record types whose refs count as an interior's pieces.
PIECE_TYPES = {"STAT", "FURN", "CONT", "LIGH", "DOOR", "MSTT", "ACTI"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def registry_index() -> dict[str, dict[str, str]]:
    """`meshes/...nif` path -> {pool: asset id}, from the built asset registry.

    One mesh path can be registered in several pools — a mod that bundles a
    credited resource ships the same relative path the resource does — so the
    caller resolves with the pool of the plugin it is reading.
    """
    out: dict[str, dict[str, str]] = {}
    for jsonl in sorted(REGISTRY_DIR.glob("registry-*.jsonl")):
        for line in jsonl.read_text(errors="replace").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            out.setdefault(row["path"].lower(), {})[row["pool"]] = row["id"]
    return out


def asset_id_for(model_key: str | None, index, pool: str | None = None) -> str | None:
    if not model_key:
        return None
    key = model_key if model_key.startswith("meshes/") else "meshes/" + model_key
    pools = index.get(key)
    if not pools:
        return None
    if pool and pool in pools:
        return pools[pool]
    if "vanilla" in pools:
        return pools["vanilla"]
    return pools[sorted(pools)[0]]


#: Plugins in the vault that no `Pool` row owns because the mod ships no
#: meshes of its own (it dresses vanilla assets) — but which still evidence
#: real door links, so they are mined.
EXTRA_PLUGINS: tuple[tuple[str, str], ...] = (
    ("marshrest", "{vault}/skyrim-source/mod-sources/marsh-rest-50111/extracted/"
                  "ArgonianHome.esp"),
)


def discover_plugins(vault: Path) -> list[tuple[str, Path]]:
    """`(pool id, path)` for every plugin a registered pool ships or contains."""
    found: dict[Path, str] = {}
    for pool in POOLS:
        for template in pool.plugins:
            path = _resolve(template, vault)
            if path.exists():
                found.setdefault(path, pool.id)
        if pool.directory:
            directory = _resolve(pool.directory, vault)
            if directory.exists():
                for path in sorted(directory.rglob("*")):
                    if path.suffix.lower() in (".esp", ".esm", ".esl") and path.is_file():
                        found.setdefault(path, pool.id)
    # The one list of plugins a register pool declares outside its row
    # (`mine_designed_sink.EXTRA_POOL_PLUGINS`: FOMOD cores, player homes,
    # ferries); interiors round 4: the door-link record missed `boatsanim`
    # because this miner kept a list of its own.
    from .mine_designed_sink import EXTRA_POOL_PLUGINS
    extras = list(EXTRA_PLUGINS) + [(pool_id, template)
                                    for pool_id, templates in EXTRA_POOL_PLUGINS.items()
                                    for template in templates]
    for pool_id, template in extras:
        path = _resolve(template, vault)
        if path.exists():
            found.setdefault(path, pool_id)
    return sorted(((pid, p) for p, pid in found.items()), key=lambda r: str(r[1]))


def _obnd_metres(base) -> tuple[float, float]:
    """`(diagonal, volume)` in metres from a base object's OBND, or `(0, 0)`."""
    if not base or not base.bounds:
        return (0.0, 0.0)
    x0, y0, z0, x1, y1, z1 = base.bounds
    dx, dy, dz = (abs(x1 - x0) / UNITS_PER_METRE, abs(y1 - y0) / UNITS_PER_METRE,
                  abs(z1 - z0) / UNITS_PER_METRE)
    return (math.sqrt(dx * dx + dy * dy + dz * dz), dx * dy * dz)


#: How far outside a candidate's own bounding box the door may stand and still
#: be that candidate's door. A door is set INTO the wall of the building it
#: opens, so the gap is the wall's own thickness plus the placement slop a
#: level designer leaves; three metres is generous and still excludes the
#: neighbouring house.
GAP_MAX_M = 3.0
#: A door inside a building's own box or this close to its wall belongs to
#: that building before any bigger candidate within `GAP_MAX_M` (ruling 4,
#: interiors round 3: King of the Murkmire's mud hut door KeebaHouseFisher
#: stands inside mudhut01's box and was given to the pod 2.1 m away).
DOOR_IN_WALL_M = 1.0
#: ...and only a candidate at least this share of the biggest one within
#: `GAP_MAX_M` counts as a building for that: the door frame, stairs or
#: walkway the door is set in hold it too (mudhut01 is 0.46 of the pod).
BUILDING_SHARE = 0.25


def to_local(ref, pos) -> tuple[float, float, float]:
    """A world position (plugin units) in the reference's own frame, metres.

    ``rot.z`` is a CLOCKWISE compass heading (`mine_assemblies.local_offset`,
    measured on vanilla farmhouse01 + its door; `interior_cells`): local
    ``(x, y)`` -> world ``(x cos + y sin, -x sin + y cos)``, so world -> local
    is ``(dx cos - dy sin, dx sin + dy cos)``. Interiors round 6: this module
    turned by ``-yaw`` until then, which mirrors every rotated box."""
    yaw = _yaw(ref)
    dx = (pos[0] - ref.pos[0]) / UNITS_PER_METRE
    dy = (pos[1] - ref.pos[1]) / UNITS_PER_METRE
    dz = (pos[2] - ref.pos[2]) / UNITS_PER_METRE
    c, s = math.cos(yaw), math.sin(yaw)
    return dx * c - dy * s, dx * s + dy * c, dz


def _box_gap(ref, base, door) -> float:
    """Distance from the door to the candidate's OBND box, 0 when inside.

    OBND is in the base object's local frame, so the door is rotated back into
    it. Pivot distance is the wrong measure — a large building's pivot can be
    ten metres from its own front door while a pebble's pivot is at its face.
    """
    if not base.bounds:
        return float("inf")
    lx, ly, dz = to_local(ref, door.pos)
    # OBND is the unscaled mesh: a reference's scale (Mud Mother sets its hut
    # at 1.92-2.3) scales the box the door stands in.
    k = float(getattr(ref, "scale", None) or 1.0) / UNITS_PER_METRE
    x0, y0, z0, x1, y1, z1 = [v * k for v in base.bounds]
    gaps = [max(lo - v, v - hi, 0.0) for v, lo, hi in (
        (lx, min(x0, x1), max(x0, x1)),
        (ly, min(y0, y1), max(y0, y1)),
        (dz, min(z0, z1), max(z0, z1)))]
    return math.sqrt(sum(g * g for g in gaps))


class Vault:
    """Every mined plugin, with cross-plugin form-id resolution."""

    def __init__(self, plugins: list[tuple[str, Path]]):
        self.entries: list[tuple[str, Path, Plugin]] = []
        #: plugin file (lower case) -> the base objects it defines or overrides;
        #: `base_of` resolves through the asking plugin's own load order
        self.own_bases: dict[str, dict[tuple[str, int], object]] = {}
        #: key -> the first definition seen, for a plugin whose chain lacks it
        self.bases: dict[tuple[str, int], object] = {}
        #: (source plugin, local id) -> (plugin name, interior cell editor id)
        self.interior_of_ref: dict[tuple[str, int], tuple[str, str]] = {}
        #: (plugin name, cell editor id) -> piece refs
        self.interior_cells: dict[tuple[str, str], list] = {}
        #: (source plugin, local id) -> (plugin name, ref) for every ref in a
        #: worldspace, persistent group included — teleport doors are almost
        #: always persistent, so a cell-grid walk misses them entirely.
        self.exterior_refs: dict[tuple[str, int], tuple[str, object]] = {}
        #: plugin name -> {(gx, gy): [refs]} spatial hash on SHELL_RADIUS_M
        self.ext_hash: dict[str, dict[tuple[int, int], list]] = {}
        #: (pool, base model key) -> every worldspace reference scale placing
        #: it (the placed-scale record, planner ruling 1, interiors round 4)
        self.placed_scales: dict[tuple[str, str], list[float]] = defaultdict(list)
        self.placed_bases: dict[tuple[str, str], object] = {}
        #: (plugin name, cell editor id) -> the cell's room seed family
        self.seed_family: dict[tuple[str, str], str | None] = {}
        #: interiors round 6: the room-ratio and wall tests' inputs (`main`
        #: fills them; None leaves the test off, as in unit tests)
        self.lib = None
        self.meshes = None
        self.doorways: set[str] = set()
        self.ratios: dict[tuple[str, str], RoomRatio] = {}
        for pool_id, path in plugins:
            try:
                plugin = Plugin(path)
            except Exception as exc:                       # unreadable plugin
                print(f"  ! {path.name}: {exc}")
                continue
            self.entries.append((pool_id, path, plugin))

    def key(self, plugin: Plugin, form_id: int) -> tuple[str, int]:
        return (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF)

    def index(self) -> None:
        for _pool, path, plugin in self.entries:
            own = self.own_bases.setdefault(path.name.lower(), {})
            for form_id, base in plugin.base_objects().items():
                key = self.key(plugin, form_id)
                own[key] = base
                self.bases.setdefault(key, base)
        for pool, path, plugin in self.entries:
            for cell in plugin.interior_cells(with_refs=True):
                edid = cell.editor_id or f"cell{cell.form_id:08X}"
                cell_key = (path.name, edid)
                self.interior_cells[cell_key] = cell.refs
                for ref in cell.refs:
                    self.interior_of_ref[self.key(plugin, ref.form_id)] = cell_key
            buckets: dict[tuple[int, int], list] = {}
            for ref in world_refs(plugin):
                self.exterior_refs[self.key(plugin, ref.form_id)] = (path.name, ref)
                buckets.setdefault(bucket_of(ref.pos), []).append(ref)
                base = self.base_of(plugin, ref.base)
                if base is not None and base.type in SHELL_TYPES and base.model_key:
                    self.placed_scales[(pool, base.model_key)].append(
                        float(getattr(ref, "scale", None) or 1.0))
                    self.placed_bases.setdefault((pool, base.model_key), base)
            self.ext_hash[path.name] = buckets

    def near(self, plugin_name: str, pos) -> list:
        """Every worldspace ref within one bucket of `pos`."""
        gx, gy = bucket_of(pos)
        buckets = self.ext_hash.get(plugin_name, {})
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                out.extend(buckets.get((gx + dx, gy + dy), ()))
        return out

    def pool_of(self, plugin_name: str) -> str | None:
        for pool, path, _p in self.entries:
            if path.name == plugin_name:
                return pool
        return None

    def base_of(self, plugin: Plugin, form_id: int):
        """The base as `plugin` sees it: its load order is its masters in MAST
        order, then itself, and the last of them to define the record wins
        (a pool mixes unrelated mods, so there is no one global order)."""
        key = self.key(plugin, form_id)
        for name in [plugin.path.name, *reversed(plugin.masters)]:
            base = self.own_bases.get(name.lower(), {}).get(key)
            if base is not None:
                return base
        return self.bases.get(key)


def bucket_of(pos) -> tuple[int, int]:
    span = SHELL_RADIUS_M * UNITS_PER_METRE
    return (int(math.floor(pos[0] / span)), int(math.floor(pos[1] / span)))


def world_refs(plugin: Plugin):
    """Every REFR anywhere in a worldspace — temporary, distant AND persistent.

    `Plugin.exterior_cells` keys refs to a grid cell and so drops the
    worldspace's persistent cell, which is exactly where the Creation Kit puts
    load doors. Door mining has to see them.
    """
    in_world = False
    for rec, stack in plugin.records():
        types = [f.type for f in stack]
        in_world = GT_WORLD_CHILDREN in types
        if rec.type == b"REFR" and in_world:
            ref = decode_ref(rec)
            if ref is not None:
                yield ref


def _yaw(ref) -> float:
    return ref.rot[2] if ref.rot else 0.0


def shell_for(door, refs, vault: Vault, plugin: Plugin, seed_family: str | None = None,
              ratio_of=None, has_wall=None):
    """The building the exterior door is hung on (see the module docstring).

    ``seed_family`` is the directory of the target cell's room seed
    (`room_seed_family`): among the building candidates within ``GAP_MAX_M``
    of the door, those of the seed's family are preferred over every other
    (planner ruling 1, interiors round 5: a pod's interior belongs to the
    pod, not to the farmhouse its door stands against).

    Interiors round 6 (planner rulings 1 and 3), applied first when more than
    one building candidate stands within ``GAP_MAX_M``:

    * ``has_wall(ref, base) -> True | False | None``: a candidate whose box
      holds the door, with no other building candidate within
      ``DOOR_IN_WALL_M``, but has no wall at it (`WallTest`) is dropped while
      a walled candidate remains (a walkway or steps the door stands on);
    * ``ratio_of(ref, base) -> float | None``: the target cell's room plan
      over the candidate's plan (`RoomRatio`); the candidates whose ratio is
      inside ``FIT_RATIO`` are the only ones kept when any is and every
      candidate's ratio is measurable (KeebaHouseFisher
      stands inside mudhut01's box but its room is the pod's, 1.5 against 2.2).
    """
    radius = SHELL_RADIUS_M * UNITS_PER_METRE
    cands = []
    for ref in refs:
        if ref.form_id == door.form_id:
            continue
        base = vault.base_of(plugin, ref.base)
        if base is None or base.type not in SHELL_TYPES or not base.model:
            continue
        diag, volume = _obnd_metres(base)
        k = float(getattr(ref, "scale", None) or 1.0)
        diag, volume = diag * k, volume * k ** 3
        if diag < SHELL_MIN_OBND_M:
            continue
        if not shell_candidate_model(base.model_key):
            continue
        if footprint_class(obnd_dims_m(base, k)) != "building":
            continue
        d = math.dist(ref.pos, door.pos)
        if d > radius:
            continue
        cands.append((_box_gap(ref, base, door), volume, d, ref, base))
    if not cands:
        return (None, None)
    near = [c for c in cands if c[0] <= GAP_MAX_M]
    if len(near) > 1 and has_wall is not None:
        # only a box holding the door with no other building within
        # `DOOR_IN_WALL_M` (r5 Recommendation 3: a tree kiosk holding its door
        # with the door's own frame beside it is not tested)
        walled = [c for c in near if not (
            c[0] <= 0.0 and not any(o is not c and o[0] <= DOOR_IN_WALL_M for o in near)
            and has_wall(c[3], c[4]) is False)]
        if walled and len(walled) < len(near):
            cands = [c for c in cands if c[0] > GAP_MAX_M or c in walled]
            near = walled
    if len(near) > 1 and ratio_of is not None:
        ratios = [ratio_of(c[3], c[4]) for c in near]
        # only when every candidate's ratio is measurable: a cell that holds
        # the candidate's own mesh (Seekhat's thatchhouse06) measures no room
        # against it and would hand the door to the walkway beside it
        fits = [c for c, r in zip(near, ratios) if _fits(r)]
        if fits and all(r is not None for r in ratios):
            cands = fits
    if seed_family:
        kin = [c for c in cands if c[0] <= GAP_MAX_M and _family(c[4].model_key) == seed_family]
        if kin:
            cands = kin
    # A door standing inside a building's own box, or within `DOOR_IN_WALL_M`
    # of its wall, is THAT building's door (planner ruling 4, interiors round
    # 3): a bigger neighbour a couple of metres off never takes it, and a box
    # that holds the door beats one it only stands near (a hut's door on the
    # platform the hut stands on belongs to the hut). A building here is at
    # least `BUILDING_SHARE` of the biggest candidate against the door: the
    # door frame, stairs or walkway the door is set in hold it too and are
    # trim. Within one band the BIGGEST is the building (ivy overlays and
    # lampposts stand against the same door). Only if nothing is against the
    # door at all does bare pivot distance decide.
    near_max = max((v for g, v, *_ in cands if g <= GAP_MAX_M), default=0.0)

    def band(g: float, v: float) -> int:
        building = v >= BUILDING_SHARE * near_max
        if building and g <= 0.0:
            return 0
        if building and g <= DOOR_IN_WALL_M:
            return 1
        return 2 if g <= GAP_MAX_M else 3

    best = min(cands, key=lambda c: (band(c[0], c[1]), -c[1] if band(c[0], c[1]) < 3 else 0.0,
                                     round(c[0], 3), round(c[2], 3)))
    return best[3], best[4]




def _fits(ratio: float | None) -> bool:
    return ratio is not None and FIT_RATIO[0] <= ratio <= FIT_RATIO[1]


class RoomRatio:
    """``ratio_of(ref, base)`` for one target cell: the cell's ROOM plan
    (`interior_cells.structural_parts` + `room_in_seed_frame`, the claim's
    measure, the candidate itself left out of the room) over the candidate's
    plan at the reference's scale: the kit interiors index ``planAreaM2``
    when the shell is a kit asset, else its scaled OBND plan."""

    def __init__(self, vault: "Vault", host: Plugin, cell_refs, index, pool, lib):
        self.vault, self.host, self.refs = vault, host, cell_refs
        self.index, self.pool, self.lib = index, pool, lib
        self._room: dict[str, float] = {}

    def room_m2(self, shell_id: str) -> float:
        if shell_id not in self._room:
            from .interior_cells import room_in_seed_frame, structural_parts
            parts = structural_parts(self.refs, lambda fid: self.vault.base_of(self.host, fid),
                                     shell_id)
            px, py = room_in_seed_frame(parts)["planM"]
            self._room[shell_id] = px * py
        return self._room[shell_id]

    def __call__(self, ref, base) -> float | None:
        shell_id = asset_id_for(base.model_key, self.index, self.pool) or base.model_key
        k = float(getattr(ref, "scale", None) or 1.0)
        record = self.lib.get(shell_id) if self.lib else None
        area = (float(record.get("planAreaM2") or 0.0) * k * k if record
                else _plan_m2(base, k))
        room = self.room_m2(shell_id)
        return round(room / area, 3) if area > 0 and room > 0 else None


#: How far the door's width may stand from a candidate's vertical faces and
#: still be set in its wall (r5 measured 0.07-0.41 m at mudhut01's wall and
#: 0.05-0.55 m at the pod's doorway module; walkways sit metres off).
WALL_REACH_M = 1.0
WALL_SAMPLES = 5


def doorway_pieces(path: Path | None = None) -> set[str]:
    """Asset ids of the DOORWAY pieces: pieces the plugins set a door in at a
    repeated offset (`kit-assemblies-mined.json` ``doorwaysFromAssemblies``)
    that do not enclose a room themselves (``smpodextdoor``: KotM's pod
    doorway, template kotm:t0034)."""
    path = path or REPO_ROOT / "world" / "sources" / "placement" / "kit-assemblies-mined.json"
    try:
        rows = json.loads(path.read_text()).get("doorwaysFromAssemblies", {})
    except (OSError, ValueError):
        return set()
    return {aid for aid, row in rows.items() if row.get("anchorEncloses") is False}


class WallTest:
    """``has_wall(ref, base)`` for one door (interiors round 6, planner ruling
    1): True when a doorway piece of the candidate's own directory family
    stands against the door (it is that building's wall), else when the
    median distance from ``WALL_SAMPLES`` points across the door's width (at
    35 % of its height) to the candidate's vertical faces is within
    ``WALL_REACH_M``; None when the candidate's mesh is not available."""

    def __init__(self, door, door_base, refs, vault, plugin, index, pool, meshes, doorways):
        self.door, self.door_base, self.refs = door, door_base, refs
        self.vault, self.plugin, self.index, self.pool = vault, plugin, index, pool
        self.meshes, self.doorways = meshes, doorways
        self.no_mesh = 0

    def _doorway_family(self) -> set[str]:
        fams = set()
        for ref in self.refs:
            base = self.vault.base_of(self.plugin, ref.base)
            if base is None or not base.model_key or not base.bounds:
                continue
            aid = asset_id_for(base.model_key, self.index, self.pool)
            if aid in self.doorways and _box_gap(ref, base, self.door) <= DOOR_IN_WALL_M:
                fams.add(_family(base.model_key))
        return fams

    def __call__(self, ref, base) -> bool | None:
        if _family(base.model_key) in self._doorway_family():
            return True
        aid = asset_id_for(base.model_key, self.index, self.pool)
        mesh = self.meshes(aid) if (aid and self.meshes) else None
        if mesh is None or not self.door_base or not self.door_base.bounds:
            self.no_mesh += 1
            return None
        import numpy as np
        import trimesh
        k = float(getattr(ref, "scale", None) or 1.0)
        vertical = np.abs(mesh.face_normals[:, 2]) < 0.5
        if not vertical.any():
            return False
        walls = trimesh.Trimesh(mesh.vertices * k, mesh.faces[vertical], process=False)
        x0, _y0, z0, x1, _y1, z1 = [v / UNITS_PER_METRE for v in self.door_base.bounds]
        yaw = _yaw(self.door)
        c, s = math.cos(yaw), math.sin(yaw)
        pts = []
        for f in np.linspace(0.1, 0.9, WALL_SAMPLES):
            lx = x0 + (x1 - x0) * f
            world = (self.door.pos[0] + lx * c * UNITS_PER_METRE,
                     self.door.pos[1] - lx * s * UNITS_PER_METRE,
                     self.door.pos[2] + (z0 + (z1 - z0) * 0.35) * UNITS_PER_METRE)
            pts.append(to_local(ref, world))
        _cp, dist, _tri = trimesh.proximity.closest_point(walls, np.array(pts))
        return float(np.median(dist)) <= WALL_REACH_M


def door_offset(door, shell) -> dict:
    """The exterior door in the shell's own frame, in metres and degrees."""
    yaw = _yaw(shell)
    lx, ly, dz = to_local(shell, door.pos)
    rel = math.degrees(_yaw(door) - yaw) % 360.0
    return {"xM": round(lx, 3), "yM": round(ly, 3), "zM": round(dz, 3),
            "yawDeg": round(rel, 2),
            "sideDeg": round(math.degrees(math.atan2(lx, ly)) % 360.0, 2),
            "radiusM": round(math.hypot(lx, ly), 3)}


STRUCTURAL_CATEGORIES = frozenset({"architecture", "dungeon-kit", "ruin"})


def _family(model: str) -> str:
    """Directory identity of a piece — `<pool>:a/b/c/x` -> `<pool>:a/b/c`.

    Directory names are the reliable signal in asset archives; the filename is
    not (CLAUDE.md). The modal structural family of an interior cell is what
    names the interior KIT that cell belongs to.
    """
    return model.rsplit("/", 1)[0] if "/" in model else model


def _plan_m2(base, scale: float) -> float:
    dx, dy, _dz = obnd_dims_m(base, scale)
    return dx * dy


def room_seed_family(refs, vault: Vault, plugin: Plugin) -> str | None:
    """The directory family of the cell's room seed: the structural piece
    (`asset_taxonomy` architecture, dungeon-kit or ruin; a STAT/MSTT/SCOL at
    least ``interior_cells.STRUCT_MIN_DIAG_M`` across) that encloses (rises at
    least ``interior_cells.STANDING_MIN_M`` above its pivot and is that tall)
    with the biggest plan, the seed `interior_cells.room_of` grows the room
    from. None when the cell has no enclosing piece."""
    from .interior_cells import STANDING_MIN_M, STRUCT_MIN_DIAG_M
    best: tuple[float, str] | None = None
    for ref in refs:
        base = vault.base_of(plugin, ref.base)
        if base is None or base.type not in SHELL_TYPES or not base.model_key or not base.bounds:
            continue
        if classify(base.model_key).category not in STRUCTURAL_CATEGORIES:
            continue
        k = float(getattr(ref, "scale", None) or 1.0)
        dx, dy, dz = obnd_dims_m(base, k)
        rise = max(base.bounds[2], base.bounds[5]) * k / UNITS_PER_METRE
        if math.hypot(dx, dy, dz) < STRUCT_MIN_DIAG_M or dz < STANDING_MIN_M or rise < STANDING_MIN_M:
            continue
        key = (dx * dy, base.model_key)
        if best is None or key > best:
            best = key
    return _family(best[1]) if best else None


def interior_profile(refs, vault: Vault, plugin: Plugin, index, pool=None) -> dict:
    counts: Counter = Counter()
    #: family -> plan area of its building-class structural pieces (planner
    #: ruling 2, interiors round 5: a cell's family is its building geometry
    #: weighted by plan area, not a piece count: one pod room outweighs 18
    #: small farmhouse modules, one hut room 32 clutter pieces).
    families: Counter = Counter()
    #: interiors round 6 (planner ruling 1): a cell with no building-class
    #: structural piece (the Seekhat thatch huts, DMArgonianHaus) is named by
    #: its structural pieces' plan area instead
    structural: Counter = Counter()
    xs, ys, zs = [], [], []
    for ref in refs:
        base = vault.base_of(plugin, ref.base)
        if base is None or base.type not in PIECE_TYPES or not base.model_key:
            continue
        model = asset_id_for(base.model_key, index, pool) or base.model_key
        counts[model] += 1
        k = float(getattr(ref, "scale", None) or 1.0)
        if base.type in SHELL_TYPES and classify(base.model_key).category in STRUCTURAL_CATEGORIES:
            structural[_family(model)] += _plan_m2(base, k)
            if footprint_class(obnd_dims_m(base, k)) == "building":
                families[_family(model)] += _plan_m2(base, k)
        xs.append(ref.pos[0]); ys.append(ref.pos[1]); zs.append(ref.pos[2])
    if not families:
        families = +structural
    size = {}
    if xs:
        size = {
            "planXM": round((max(xs) - min(xs)) / UNITS_PER_METRE, 2),
            "planYM": round((max(ys) - min(ys)) / UNITS_PER_METRE, 2),
            "heightM": round((max(zs) - min(zs)) / UNITS_PER_METRE, 2),
        }
    return {
        "interiorFamily": (min(families.items(), key=lambda r: (-r[1], r[0]))[0]
                           if families else None),
        "interiorFamilies": [{"family": f, "planM2": round(a, 2)}
                             for f, a in sorted(families.items(), key=lambda r: (-r[1], r[0]))[:5]],
        "pieces": [{"model": m, "count": n} for m, n in sorted(counts.items())],
        "pieceRefs": sum(counts.values()),
        "distinctPieces": len(counts),
        "interiorSizeM": size,
    }


def mine(vault: Vault, index) -> tuple[dict, set]:
    """`(links by shell asset, the interior cells that got linked)`."""
    links: dict[str, dict[tuple, dict]] = defaultdict(dict)
    linked_cells: set[tuple[str, str]] = set()
    diagnostics: dict[str, Counter] = {}
    for _pool, path, plugin in vault.entries:
        stats = diagnostics.setdefault(path.name, Counter())
        # exterior side: a load door in the worldspace pointing INTO a cell
        for refs in vault.ext_hash.get(path.name, {}).values():
            for door in refs:
                if not door.teleport:
                    continue
                stats["exteriorLoadDoors"] += 1
                target = vault.interior_of_ref.get(vault.key(plugin, door.teleport[0]))
                if target is None:
                    stats["targetNotAnInterior"] += 1
                    continue
                record_link(links, linked_cells, vault, plugin, door,
                            vault.near(path.name, door.pos), target, index, stats)
        # interior side: a load door inside a cell pointing OUT at an exterior
        # door — some mods author only this half.
        for cell in plugin.interior_cells(with_refs=True):
            edid = cell.editor_id or f"cell{cell.form_id:08X}"
            for ref in cell.refs:
                if not ref.teleport:
                    continue
                ext = vault.exterior_refs.get(vault.key(plugin, ref.teleport[0]))
                if ext is None:
                    continue
                ext_plugin_name, ext_door = ext
                host = next((pl for _c, hp, pl in vault.entries
                             if hp.name == ext_plugin_name), plugin)
                record_link(links, linked_cells, vault, host, ext_door,
                            vault.near(ext_plugin_name, ext_door.pos),
                            (path.name, edid), index, stats)
    return links, linked_cells, diagnostics


def record_link(links, linked_cells, vault, plugin, door, refs, target, index, stats):
    cell_plugin, _edid = target
    host = next((p for _c, _hp, p in vault.entries if p.path.name == cell_plugin), plugin)
    seeds = vault.seed_family
    if target not in seeds:
        seeds[target] = room_seed_family(vault.interior_cells.get(target, []), vault, host)
    pool = vault.pool_of(plugin.path.name)
    ratio_of = has_wall = None
    if vault.lib is not None:
        if target not in vault.ratios:
            vault.ratios[target] = RoomRatio(vault, host, vault.interior_cells.get(target, []),
                                             index, pool, vault.lib)
        ratio_of = vault.ratios[target]
    if vault.meshes is not None or vault.doorways:
        has_wall = WallTest(door, vault.base_of(plugin, door.base), refs, vault, plugin,
                            index, pool, vault.meshes, vault.doorways)
    shell, shell_base = shell_for(door, refs, vault, plugin, seeds[target], ratio_of, has_wall)
    if has_wall is not None and has_wall.no_mesh:
        stats["wallTestNoMesh"] += has_wall.no_mesh
    if shell is None:
        stats["shellNotFound"] += 1
        return
    shell_id = asset_id_for(shell_base.model_key, index, pool) or shell_base.model_key
    door_base = vault.base_of(plugin, door.base)
    door_id = (asset_id_for(door_base.model_key, index, pool)
               if door_base and door_base.model_key else None)
    cell_plugin, cell_edid = target
    key = (cell_plugin, cell_edid)
    entry = links[shell_id].get(key)
    if entry is None:
        refs_in = vault.interior_cells.get(target, [])
        host = next((p for _c, _hp, p in vault.entries
                     if p.path.name == cell_plugin), plugin)
        profile = interior_profile(refs_in, vault, host, index,
                                   vault.pool_of(cell_plugin))
        entry = {
            "plugin": cell_plugin,
            "interiorCell": cell_edid,
            "doorModel": door_id or (door_base.model_key if door_base else None),
            "doorOffsetsInShell": [],
            "shellEditorId": shell_base.editor_id,
            **profile,
        }
        links[shell_id][key] = entry
    entry["doorOffsetsInShell"].append(door_offset(door, shell))
    linked_cells.add(target)
    stats["linked"] += 1


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def consolidate(links) -> dict:
    out: dict[str, list] = {}
    for shell_id in sorted(links):
        rows = []
        for key in sorted(links[shell_id]):
            entry = dict(links[shell_id][key])
            offsets = entry.pop("doorOffsetsInShell")
            entry["placements"] = len(offsets)
            entry["doorOffsetInShell"] = {
                field: round(_median([o[field] for o in offsets]), 3)
                for field in ("xM", "yM", "zM", "yawDeg", "sideDeg", "radiusM")
            }
            entry["doorOffsetSpreadM"] = round(
                max(math.dist((o["xM"], o["yM"]), (entry["doorOffsetInShell"]["xM"],
                                                   entry["doorOffsetInShell"]["yM"]))
                    for o in offsets), 3)
            rows.append(entry)
        rows.sort(key=lambda r: (-r["placements"], r["interiorCell"]))
        out[shell_id] = rows
    return out


def _pct(ordered: list[float], q: float) -> float:
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def kit_asset_ids() -> set[str]:
    """Every kit asset id (published and raw manifests; `mine_designed_sink`)."""
    from .mine_designed_sink import kit_assets
    return set(kit_assets())


def placed_scales(vault: Vault, index, kit_ids: set[str]) -> dict[str, dict]:
    """``assetId -> {median, p10, p90, n}`` over every worldspace reference
    placing a kit shell (planner ruling 1, interiors round 4: Mud Mother sets
    its mudhut01 at 1.92-2.3, so a shell's footprint is only meaningful at the
    scale its author placed it). A shell is a base the shell rule could
    consider whose OBND at the median scale is of the building class."""
    scales: dict[str, list[float]] = defaultdict(list)
    bases: dict[str, object] = {}
    for (pool, model_key), values in vault.placed_scales.items():
        asset_id = asset_id_for(model_key, index, pool)
        if asset_id is None or asset_id not in kit_ids or not shell_candidate_model(model_key):
            continue
        scales[asset_id].extend(values)
        bases.setdefault(asset_id, vault.placed_bases[(pool, model_key)])
    out = {}
    for asset_id in sorted(scales):
        ordered = sorted(scales[asset_id])
        median = _median(ordered)
        if footprint_class(obnd_dims_m(bases[asset_id], median)) != "building":
            continue
        out[asset_id] = {"median": round(median, 3), "p10": round(_pct(ordered, 0.1), 3),
                         "p90": round(_pct(ordered, 0.9), 3), "n": len(ordered)}
    return out


def main() -> None:
    from .mine_assemblies import provenance
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    index = registry_index()
    plugins = discover_plugins(args.vault)
    print(f"mining {len(plugins)} plugins")
    vault = Vault(plugins)
    vault.index()
    from .blueprint_interiors import library
    from .mine_mounts import MeshLibrary, nif_index
    vault.lib = library()
    vault.meshes = MeshLibrary(nif_index=nif_index())
    vault.doorways = doorway_pieces()
    links, linked_cells, diagnostics = mine(vault, index)
    shells = consolidate(links)

    unlinked = []
    for (plugin_name, edid) in sorted(vault.interior_cells):
        if (plugin_name, edid) in linked_cells:
            continue
        refs = vault.interior_cells[(plugin_name, edid)]
        if len(refs) >= 5:
            unlinked.append({"plugin": plugin_name, "interiorCell": edid,
                             "refs": len(refs)})

    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "worldgen.mine_door_links",
        "rule": {
            "link": "exterior door REFR XTEL -> interior door REFR -> its CELL",
            "shell": (f"STAT/MSTT/SCOL ref within {SHELL_RADIUS_M} m of the exterior door "
                      f"whose OBND diagonal is >= {SHELL_MIN_OBND_M} m (boxes scaled by the "
                      f"reference): first one whose box holds the door, then one within "
                      f"{DOOR_IN_WALL_M} m of it, then one within "
                      f"{GAP_MAX_M} m (the larger OBND volume within each band), else the "
                      "nearest pivot; building candidates within "
                      f"{GAP_MAX_M} m of the directory family of the target cell's room seed "
                      "are preferred over all others; when several building candidates stand within "
                      f"{GAP_MAX_M} m, one whose box holds the door, with no other within {DOOR_IN_WALL_M} m, but has no wall within "
                      f"{WALL_REACH_M} m of the door's width (a doorway piece of its own directory "
                      "family counts as its wall) is dropped while a walled one remains, then the "
                      "candidates whose room ratio (the target cell's room plan over the candidate's "
                      f"plan at the reference scale) is inside {FIT_RATIO[0]}-{FIT_RATIO[1]} are the "
                      "only ones kept when any is and all are measurable; only candidates of the building footprint class "
                      f"(scaled box plan sides >= {BUILDING_MIN_SIDE_M} m, height >= "
                      f"{BUILDING_MIN_HEIGHT_M} m, plan >= {BUILDING_MIN_PLAN_M2} m2), "
                      "trim never"),
            "placedScales": ("per kit shell asset: the scale of every worldspace reference "
                             "placing it in the mined plugins (median, p10, p90, n); a shell "
                             "is a STAT/MSTT/SCOL the shell rule may consider whose box at "
                             "the median scale is of the building footprint class"),
            "entrance": "doorOffsetInShell: the exterior door in the shell's own frame",
            "interiorFamily": ("the directory with the most plan area (m2) of the cell's "
                               "building-class structural pieces; of all its structural "
                               "pieces when it has no building-class one"),
        },
        "plugins": [
            {"pool": pool, "file": path.name, "sha256": sha256(path)}
            for pool, path, _p in sorted(vault.entries, key=lambda e: e[1].name)
        ],
        "diagnostics": {name: dict(sorted(c.items()))
                        for name, c in sorted(diagnostics.items()) if c},
        "interiorCellsSeen": len(vault.interior_cells),
        "interiorCellsLinked": len(linked_cells),
        "shells": shells,
        "placedScales": placed_scales(vault, index, kit_asset_ids()),
        "unlinkedInteriors": unlinked,
        "provenance": provenance(__file__, [p.name for _pool, p, _pl in vault.entries],
                                 [pool for pool, _p, _pl in vault.entries]),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1, sort_keys=False) + "\n")
    print(f"  {len(shells)} shells linked, {len(linked_cells)} interior cells, "
          f"{len(unlinked)} unlinked interiors -> {args.out}")


if __name__ == "__main__":
    main()
