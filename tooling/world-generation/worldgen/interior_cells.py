"""What an interior cell measures, read from its plugin (decision 0103
decision 2, the 16i fit rule; planner rulings 1-3 and B of interiors round 2).

One profile per ``(plugin, cell)``:

* ``exteriorDoors`` — the cell's load doors whose XTEL target is an EXTERIOR
  door (a reference in a worldspace, not in any interior cell of the plugin or
  its masters). Interior-to-interior doors (a cellar, a jail, the next cell of
  a dungeon) are ignored: the fit rule counts only the ways out to the world.
  Each carries its position, its bearing around the structure's centre (north
  = 0, clockwise) and the arrival marker: the destination the plugin's own
  exterior door (the partner) teleports the player to, in the cell frame.
* ``structure`` — the cell's STRUCTURAL pieces only (ruling 2): static
  references whose base mesh is kit architecture (``asset_taxonomy``
  category architecture, dungeon-kit or ruin) or lives in the shell's own
  mesh family (its directory or below: ``argonia/mudhuts/manorint`` for the
  KotM pod, ``gv_meshes/argoniannest/mudhut01intnew`` for the Mud Mother
  hut) and is not a dressing category, and at least ``STRUCT_MIN_DIAG_M`` across (the miner's shell floor:
  smaller pieces are trim). The footprint is the ROOM among them
  (`room_of`, planner ruling 1 of interiors round 3): the largest enclosing
  piece plus the pieces overlapping it, never the yard; each piece's plan is
  its OBND box turned by its yaw.
* ``storeys`` — the room's floor levels clustered (ruling 3; compared as
  cell storeys >= shell storeys, ruling 2 of round 3): a flat
  structural piece (OBND at most ``FLAT_MAX_M`` deep) is a floor at its top,
  a standing one (at least ``STANDING_MIN_M`` tall) stands on a floor at its
  bottom; tilted pieces (beams, windows) are not levels. Levels closer than
  ``STOREY_GAP_M`` are one storey. The shell side of the same rule lives in
  ``tooling/asset-pipeline/pipeline/interiors_index.py`` (``storeys``), same
  gap.
"""

from __future__ import annotations

import math
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import GT_WORLD_CHILDREN, UNITS_PER_METRE, Plugin, decode_ref

#: Levels further apart than this are separate storeys (ruling 3; the twin
#: constant is interiors_index.STOREY_GAP_M).
STOREY_GAP_M = 2.4
STRUCT_MIN_DIAG_M = 2.5
STRUCTURAL_CATEGORIES = frozenset({"architecture", "dungeon-kit", "ruin"})
STRUCT_TYPES = {"STAT", "MSTT", "SCOL"}
#: A shell family's directory also holds its dressing (tables, shelves,
#: clutter): those categories are never structure.
DRESSING_CATEGORIES = frozenset({"furniture", "clutter", "container", "light", "plant", "deadfall"})
FLAT_MAX_M = 0.6
STANDING_MIN_M = 2.0
TILT_MAX_DEG = 10.0
#: A piece with at least this share of its plan inside the room is part of
#: it and never moves its edge (ruling 1, interiors round 3).
ROOM_INSIDE_FRACTION = 0.5
#: Where the arrival marker goes when the partner door's XTEL is not found:
#: this far in from the load door, toward the structure's centre.
ARRIVAL_FALLBACK_IN_M = 1.2


def storeys_from_levels(levels: list[float], gap_m: float = STOREY_GAP_M) -> int:
    """Single-linkage clusters of heights: a new storey where the next level
    up is more than `gap_m` above the last."""
    if not levels:
        return 0
    ordered = sorted(levels)
    return 1 + sum(1 for a, b in zip(ordered, ordered[1:]) if b - a > gap_m)


def bearing_deg(dx: float, dy: float) -> float:
    """Plugin frame (x east, y north): compass bearing, north = 0, clockwise."""
    return math.degrees(math.atan2(dx, dy)) % 360.0


def _key(plugin: Plugin, form_id: int) -> tuple[str, int]:
    return plugin.source_of(form_id).lower(), form_id & 0xFFFFFF


class PluginWorld:
    """A plugin and its masters: bases by key, interior cells with their refs,
    and the interior ref set (to tell an exterior-bound load door).

    `self.plugins` is in load order (the masters in the main plugin's MAST
    order, the main plugin last) and the last plugin to define a base object
    or a worldspace reference owns it, as the game resolves an override."""

    def __init__(self, name: str, path_of):
        self.name = name
        self.plugins: dict[str, Plugin] = {}
        self.missing: list[str] = []
        main = Plugin(path_of(name))
        self.main = main
        for master in main.masters:
            p = path_of(master)
            if p is None:
                self.missing.append(master)
                continue
            self.plugins[master] = Plugin(p)
        self.plugins[name] = main
        self.bases: dict[tuple[str, int], object] = {}
        self.interior_refs: set[tuple[str, int]] = set()
        self.cells: dict[str, list] = {}
        for pname, plugin in self.plugins.items():
            for fid, base in plugin.base_objects().items():
                self.bases[_key(plugin, fid)] = base          # load order: last wins
            for cell in plugin.interior_cells(with_refs=True):
                for ref in cell.refs:
                    self.interior_refs.add(_key(plugin, ref.form_id))
                if pname == name and cell.editor_id:
                    self.cells[cell.editor_id] = cell.refs
        self._world: dict[tuple[str, int], object] = {}

    def base(self, form_id: int):
        return self.bases.get(_key(self.main, form_id))

    def world_refs(self, keys: set[tuple[str, int]]) -> dict[tuple[str, int], object]:
        """The worldspace references with these keys (partner exterior doors)."""
        want = {k for k in keys if k not in self._world}
        if want:
            for plugin in self.plugins.values():             # load order: last wins
                for rec, stack in plugin.records():
                    if rec.type != b"REFR" or not any(f.type == GT_WORLD_CHILDREN for f in stack):
                        continue
                    k = _key(plugin, rec.form_id)
                    if k in want:
                        ref = decode_ref(rec)
                        if ref is not None:
                            self._world[k] = ref
        return {k: self._world[k] for k in keys if k in self._world}


def _family_dir(asset_or_model: str) -> str:
    tail = asset_or_model.split(":", 1)[-1].replace("\\", "/").lower()
    return tail.rsplit("/", 1)[0] if "/" in tail else ""


def _mesh_key(asset_or_model: str) -> str:
    """``pool:dir/stem`` or ``meshes\\dir\\stem.nif`` -> ``dir/stem``."""
    tail = asset_or_model.split(":", 1)[-1].replace("\\", "/").lower()
    tail = tail[len("meshes/"):] if tail.startswith("meshes/") else tail
    return tail[:-4] if tail.endswith(".nif") else tail


def _obnd(base) -> tuple[float, float, float, float, float, float] | None:
    b = getattr(base, "bounds", None)
    if not b:
        return None
    return tuple(float(v) / UNITS_PER_METRE for v in b)  # type: ignore[return-value]


def _area(b) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _overlap(a, b) -> float:
    return _area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))


def _encloses(p: dict) -> bool:
    """A piece with walls: it rises at least ``STANDING_MIN_M`` above its own
    pivot (a room mesh, a wall run, a room end). A floor slab or the thick
    floor disc a mod sets a hut on (``roundfloor01``: 3 m deep, all of it
    below its pivot) does not."""
    return p["dz"] >= STANDING_MIN_M and p["rise"] >= STANDING_MIN_M


def room_of(parts: list[dict], seed: dict | None = None) -> tuple[tuple | None, list[dict], str | None]:
    """The cell's ROOM (planner ruling 1, interiors round 3): the largest
    enclosing structural piece (the biggest in plan of those that rise at
    least ``STANDING_MIN_M`` above their pivot, `_encloses`: a room mesh or a
    modular room end, never a floor disc, a yard or a fence), plus every structural piece overlapping
    it, never the yard. Read on the pieces' plan boxes:

    * a piece that overlaps the room with at least ``ROOM_INSIDE_FRACTION`` of
      its plan inside is part of the room and does not move its edge (stairs,
      an inner floor, a door frame set into the wall);
    * an enclosing piece no bigger than the seed that overlaps the room but lies
      mostly outside it extends the room (the next module of a modular vanilla
      interior: its ends, doorway and hearth wall overlap by the wall's
      thickness), and the test repeats on the grown room;
    * anything else (a flat yard floor, a low fence, the floor disc a mod
      sets the whole hut on) stays out.

    The boxes are read in whatever frame the caller gives them;
    `profile_cell` gives them in the seed's own frame (planner ruling 2,
    interiors round 4) and names the seed it chose.

    Returns ``(room box (x0, y0, x1, y1) or None, member pieces, seed model)``."""
    standing = [p for p in parts if _encloses(p)]
    if not standing:
        return None, [], None
    if seed is None:
        seed = max(standing, key=lambda p: (_area(p["box"]), p["model"]))
    room = seed["box"]
    members = [seed]
    rest = sorted((p for p in parts if p is not seed), key=lambda p: (-_area(p["box"]), p["model"], p["box"]))
    grew = True
    while grew:
        grew = False
        for p in list(rest):
            ov = _overlap(room, p["box"])
            if ov <= 0.0:
                continue
            a = _area(p["box"]) or 1e-9
            if ov / a >= ROOM_INSIDE_FRACTION:
                members.append(p)
                rest.remove(p)
            elif _encloses(p) and a <= _area(seed["box"]):
                members.append(p)
                rest.remove(p)
                room = (min(room[0], p["box"][0]), min(room[1], p["box"][1]),
                        max(room[2], p["box"][2]), max(room[3], p["box"][3]))
                grew = True
    return room, members, seed["model"]


def structural_parts(refs, base_of, shell_asset: str | None = None) -> list[dict]:
    """The cell's structural pieces (see the module docstring), each with its
    plan corners in the cell frame; ``base_of(form_id)`` resolves a reference's
    base object (a `PluginWorld` or the door-link miner's vault)."""
    shell_dir = _family_dir(shell_asset) if shell_asset else ""
    shell_mesh = _mesh_key(shell_asset) if shell_asset else None
    parts: list[dict] = []
    for ref in refs:
        base = base_of(ref.base)
        if base is None or base.type not in STRUCT_TYPES or not base.model:
            continue
        model = base.model.replace("\\", "/").lower()
        # ruling 3 (interiors round 5): the linked exterior shell set inside
        # its own cell (00MudHut01's mudhut01) is never part of the room
        if shell_mesh and _mesh_key(model) == shell_mesh:
            continue
        box = _obnd(base)
        if box is None:
            continue
        s = float(ref.scale or 1.0)
        dx, dy, dz = (box[3] - box[0]) * s, (box[4] - box[1]) * s, (box[5] - box[2]) * s
        if math.hypot(dx, dy, dz) < STRUCT_MIN_DIAG_M:
            continue
        in_family = bool(shell_dir) and (_family_dir(model) + "/").startswith(shell_dir + "/")
        category = classify(model).category
        if category in DRESSING_CATEGORIES:
            continue
        if not in_family and category not in STRUCTURAL_CATEGORIES:
            continue
        px, py, pz = (c / UNITS_PER_METRE for c in ref.pos)
        yaw = ref.rot[2]
        c, sn = math.cos(yaw), math.sin(yaw)
        xs, ys = [], []
        # Skyrim's z rotation is clockwise from above: local (x, y) -> world
        for lx in (box[0] * s, box[3] * s):
            for ly in (box[1] * s, box[4] * s):
                xs.append(px + lx * c + ly * sn)
                ys.append(py - lx * sn + ly * c)
        level = None
        if math.degrees(math.hypot(ref.rot[0], ref.rot[1])) <= TILT_MAX_DEG:
            if dz <= FLAT_MAX_M:
                level = round(pz + box[5] * s, 3)
            elif dz >= STANDING_MIN_M:
                level = round(pz + box[2] * s, 3)
        parts.append({"model": model, "corners": list(zip(xs, ys)),
                      "planArea": (box[3] - box[0]) * (box[4] - box[1]) * s * s,
                      "pivot": (px, py), "yaw": yaw,
                      "dz": dz, "rise": box[5] * s, "level": level})
    return parts


def room_in_seed_frame(parts: list[dict]) -> dict:
    """The ROOM of `structural_parts` measured in its seed piece's own frame
    (ruling 2, interiors round 4: a room mesh turned 30 degrees in the cell
    is its own length and width, not the box round its turned outline; the
    seed is the biggest enclosing piece by its OWN plan area). Returns
    ``{"planM": (x, y), "centre": (x, y) cell frame, "members", "seed"}``."""
    standing = [p for p in parts if _encloses(p)]
    seed_part = max(standing, key=lambda p: (p["planArea"], p["model"])) if standing else None
    ox, oy = seed_part["pivot"] if seed_part else (0.0, 0.0)
    syaw = seed_part["yaw"] if seed_part else 0.0
    sc, ss = math.cos(syaw), math.sin(syaw)
    for p in parts:
        local = [((wx - ox) * sc - (wy - oy) * ss, (wx - ox) * ss + (wy - oy) * sc)
                 for wx, wy in p["corners"]]
        p["box"] = (min(q[0] for q in local), min(q[1] for q in local),
                    max(q[0] for q in local), max(q[1] for q in local))
    room, members, seed = room_of(parts, seed_part)
    if room:
        plan = (room[2] - room[0], room[3] - room[1])
        lcx, lcy = (room[0] + room[2]) / 2.0, (room[1] + room[3]) / 2.0
        # back from the seed's frame to the cell's
        centre = (ox + lcx * sc + lcy * ss, oy - lcx * ss + lcy * sc)
    else:
        plan = (0.0, 0.0)
        centre = (0.0, 0.0)
    return {"planM": plan, "centre": centre, "members": members, "seed": seed}


def profile_cell(world: PluginWorld, cell: str, shell_asset: str | None = None) -> dict | None:
    """The measured profile of one interior cell (see the module docstring)."""
    refs = world.cells.get(cell)
    if refs is None:
        return None
    parts = structural_parts(refs, world.base, shell_asset)
    measured = room_in_seed_frame(parts)
    members, seed = measured["members"], measured["seed"]
    levels = [p["level"] for p in members if p["level"] is not None]
    pieces = len(parts)
    plan_x, plan_y = measured["planM"]
    centre = measured["centre"]

    doors = []
    partners: dict[tuple[str, int], object] = {}
    for ref in refs:
        if not ref.teleport:
            continue
        target = _key(world.main, ref.teleport[0])
        if target in world.interior_refs:
            continue
        doors.append(ref)
        partners[target] = ref
    found = world.world_refs(set(partners)) if partners else {}
    out_doors = []
    for ref in sorted(doors, key=lambda r: r.form_id):
        px, py, pz = (c / UNITS_PER_METRE for c in ref.pos)
        partner = found.get(_key(world.main, ref.teleport[0]))
        if partner is not None and partner.teleport:
            dest, drot = partner.teleport[1], partner.teleport[2]
            arrival = {"positionM": [round(v / UNITS_PER_METRE, 4) for v in dest],
                       "yawDeg": round(math.degrees(drot[2]) % 360.0, 3),
                       "from": "the plugin's exterior door XTEL destination"}
        else:
            vx, vy = centre[0] - px, centre[1] - py
            n = math.hypot(vx, vy) or 1.0
            arrival = {"positionM": [round(px + vx / n * ARRIVAL_FALLBACK_IN_M, 4),
                                     round(py + vy / n * ARRIVAL_FALLBACK_IN_M, 4), round(pz, 4)],
                       "yawDeg": round(bearing_deg(vx, vy), 3),
                       "from": f"{ARRIVAL_FALLBACK_IN_M} m in from the load door (partner not found)"}
        out_doors.append({
            "refId": f"{ref.form_id:08X}",
            "positionM": [round(px, 4), round(py, 4), round(pz, 4)],
            "bearingDeg": round(bearing_deg(px - centre[0], py - centre[1]), 2),
            "arrivalMarker": arrival,
        })
    return {
        "cellId": cell, "plugin": world.name,
        "structuralPieces": pieces,
        "roomSeed": seed,
        "roomPieces": len(members),
        "structuralPlanM": [round(plan_x, 2), round(plan_y, 2)],
        "structuralCentreM": [round(centre[0], 3), round(centre[1], 3)],
        "floorLevelsM": sorted(levels),
        "storeys": storeys_from_levels(levels) or None,
        "exteriorDoors": out_doors,
        "interiorDoors": sum(1 for r in refs if r.teleport) - len(out_doors),
    }


def game_position(p) -> list[float]:
    """Plugin frame (x east, y north, z up) -> game frame (x east, y up,
    z south), metres."""
    return [round(float(p[0]), 4), round(float(p[2]), 4), round(-float(p[1]) + 0.0, 4)]


def game_marker(marker: dict) -> dict:
    """An arrival marker in the game frame; the compass yaw is the same in
    both frames (north = 0, clockwise)."""
    return {"positionM": game_position(marker["positionM"]), "yawDeg": marker["yawDeg"]}


def angle_delta(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


#: A pairing further off than this is refused (owner ruling B).
PAIR_MAX_DEG = 60.0


def pair_doors(entrance_bearings: list[float | None], door_bearings: list[float],
               door_heights: list[float] | None = None) -> tuple[list[int] | None, str]:
    """Pair each shell entrance with ONE of the cell's exterior load doors by
    relative position (owner ruling B). The cell must have at least as many
    exterior load doors as the shell has entrances (planner ruling 3,
    interiors round 3); the doors left unpaired ship as closed doors. The
    cell is in its own frame, so the two sets are compared after turning the
    cell so that entrance 0 sits on one of its doors (each door tried); the
    other entrances then take the nearest unused door by bearing. The best
    turn is the one with the smallest worst error; refused when that worst
    error is over ``PAIR_MAX_DEG``. One entrance has no relative position:
    it takes the lowest door (``door_heights``; the ground-floor way in, not
    an upper-storey door), then the first. Returns ``(door index per
    entrance, why)``."""
    n = len(entrance_bearings)
    m = len(door_bearings)
    if m < n:
        return None, f"{m} exterior load door(s), the shell has {n} entrance(s)"
    if n == 0:
        return None, "the shell has no entrance" if m else "no entrance and no exterior load door"
    spare = f"; {m - n} load door(s) left closed" if m > n else ""
    if n == 1:
        heights = door_heights or [0.0] * m
        j = min(range(m), key=lambda i: (round(heights[i], 2), i))
        return [j], ("one entrance, one exterior load door" if m == 1
                     else f"one entrance, paired to the lowest of {m} exterior load doors{spare}")
    if any(b is None for b in entrance_bearings):
        return None, "a radial entrance has no bearing to pair by"
    best: tuple[float, list[int]] | None = None
    for first in range(m):
        turn = door_bearings[first] - entrance_bearings[0]
        used = {first}
        pick = [first]
        worst = 0.0
        for e in entrance_bearings[1:]:
            want = (e + turn) % 360.0
            j = min((j for j in range(m) if j not in used),
                    key=lambda j: (angle_delta(door_bearings[j], want), j))
            used.add(j)
            pick.append(j)
            worst = max(worst, angle_delta(door_bearings[j], want))
        if best is None or worst < best[0]:
            best = (worst, pick)
    worst, pick = best  # type: ignore[misc]
    if worst > PAIR_MAX_DEG:
        return None, f"the best pairing is {worst:.0f} deg off (over {PAIR_MAX_DEG:.0f})"
    return pick, f"{n} entrances paired by bearing, worst {worst:.0f} deg off{spare}"


_WORLDS: dict[str, PluginWorld] = {}


def world_for(plugin: str, path_of) -> PluginWorld | None:
    """Per-process cache (read-only plugin data, loaded once per plugin)."""
    if plugin not in _WORLDS:
        if path_of(plugin) is None:
            return None
        _WORLDS[plugin] = PluginWorld(plugin, path_of)
    return _WORLDS[plugin]


def plugin_paths() -> dict[str, Path]:
    from .asset_registry import DEFAULT_VAULT
    from .mine_door_links import discover_plugins
    out: dict[str, Path] = {}
    for _pool, path in discover_plugins(DEFAULT_VAULT):
        out.setdefault(path.name, path)
    return out
