"""Which kit buildings have an INSIDE, and where their door goes.

Owner ruling 2026-09-05: *"Very few buildings have doors. Everything intended to
have an interior must have one and must have a door/entrance. Derive from our
building kits which buildings should have interiors and what interiors they
should have."*

This module is the derivation. It reads the built kits in
``tooling/asset-pipeline/output/kits/`` and writes, per kit,
``<kit>.interiors.json`` — for every asset, whether it has an interior, which
interior, and where the doorway is in the asset's own local frame.

Vanilla Skyrim's model is the one we follow (module 70 §47): an exterior shell
stands in the world and the interior is a SEPARATE cell built from an interior
tileset; the door is the link. The exterior NIF carries no door marker, so the
door position has to come from the exterior mesh's own doorway opening — which
is what the geometry pass below measures.

Classification, in order (first rule that fires wins):

  a. **matched**  — the asset's own pool ships a sibling mesh named
     ``<base>*int*`` in the same directory (HTBM's ``bamboohut01`` +
     ``bamboohut01_int``, Mud Mother Grove's ``mudhut01`` +
     ``mudhut01intnew``). The pair was authored to fit: use it.
     ``interiorAssetRef`` names the sibling.
  b. **tileset**  — the family is exterior-only shells whose interiors come
     from a tileset (``world/sources/placement/settlement-asset-inventory.json``
     records this per family in prose; ``TILESET_RULES`` below is that prose as
     a path table). ``tileset`` names the interior kit Phase 12 builds it from.
     Requires the enclosure measurement to pass too — a farmhouse walkway is
     not a farmhouse.
  c. **shell**    — measured to enclose a volume, with no matched interior and
     no tileset rule: a building that needs a Phase 12 interior claim.
  d. **none**     — everything else: platforms, decks, walkways, boardwalks,
     fences, boats, props, and the interior tilesets' own modules.

The enclosure measurement (rule c, and the gate on rule b) is geometric, never
a label (owner ruling 2026-09-04), and it asks the only question that matters:
**can you stand inside it?** We put an eye at the piece's plan centroid, 1.6 m
above a candidate floor, and fire 72 rays outwards on the horizontal, one up and
one down, against the asset's own triangles. A ray that hits found a wall; a ray
that escapes found open sky. The piece encloses a volume when

  * ``ringFraction`` >= 0.75 — three quarters of the horizontal rays hit a wall;
  * the upward ray hits — something is overhead (this is what rejects docks,
    decks, platforms, boats and free-standing wall segments, which all have a
    ring but no roof); and
  * ``medianWallM`` >= 1.5 m — there is room to stand. A solid block (a stone
    plinth, a pier, a rubble mass) hits in every direction at nearly zero range.

The floor is searched over a ladder of offsets above the piece's base (0–8 m)
and the storey that reads most enclosed wins, which is what lets a stilt house —
whose base is its pile feet, with open air under the deck — be measured at its
deck rather than at its piles. Ties go to the lowest storey.

**Doorways** fall out of the same probe: a doorway is the direction in which a
ray fired from inside at 1.6 m escapes, while its neighbours do not — the lintel
above it and the jambs either side keep the rest of the ring inside. Each
contiguous run of escaping rays whose arc length at the flanking wall distance
is 0.8–5.0 m, and whose angular width is at most 60°, is emitted as
``{sideDeg, offsetM, arcM}``, largest first. ``sideDeg`` is the bearing of the
doorway face in the asset's local frame (north = 0, clockwise, the same
convention as a parcel's ``yawDeg``, so the world facing is
``sideDeg + yawDeg``); ``offsetM`` is the ``[x, z]`` point on the wall, in
metres, in the pivot-centred local frame ``measure_footprints`` uses.

Where the geometry yields no opening the record carries ``doorways: []`` and a
``doorwaysWhy`` saying so — a piece can be a genuine shell whose door is a
separate mesh (HTBM ships ``bamboohutdoor01`` as its own NIF), whose front is
open wider than a doorway, or whose walls are modular pieces measured one at a
time. The validator then checks only that a door exists, not where it points.

``sizeClass`` is the footprint area class the blueprint validator checks a
door's ``interiorClaim.sizeClass`` against: small < 40 m², medium < 120 m²,
large otherwise.

Deterministic: assets sorted by id, angles and metres rounded to 2 dp, no
timestamps.

Run (from tooling/asset-pipeline/):
  python3 -m pipeline.interiors_index                       # every built kit
  python3 -m pipeline.interiors_index --kit settlement-stilt-v1
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from .measure_footprints import (
    KITS_DIR,
    LOD_SUFFIXES,
    _asset_vertices,
    _resolve_node,
    convex_hull_2d,
    glb_asset_id_nodes,
    kit_names,
    polygon_area,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"
SCHEMA_VERSION = 1

# --- enclosure / doorway measurement constants ----------------------------- #
BINS = 72                      # 5° rays around the horizon
EYE_HEIGHT_M = 1.6             # where the stander's eye sits above the floor
ENCLOSURE_MIN_RING = 0.75      # share of horizontal rays that must hit a wall
ENCLOSURE_MIN_ROOM_M = 1.5     # median wall distance: a room, not a solid block
DOOR_BAND_M = 1.1              # eye height for the door probe (below any lintel)
LINTEL_BAND_M = 2.4            # eye height for the wall probe (above any lintel)
DOOR_RECESS_RATIO = 0.8        # door bin: <= this share of the wall's distance
MIN_CEILING_M = 2.2            # a room you can stand up in, not a crawl space
FLOOR_LADDER_M = (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0)
DOORWAY_MIN_ARC_M = 0.8
DOORWAY_MAX_ARC_M = 5.0
DOORWAY_MAX_BINS = BINS // 6   # 60°
MAX_DOORWAYS = 4

# Pieces smaller than this are never buildings; skipped before any geometry
# work (an urn cannot have an interior).
MIN_BUILDING_AREA_M2 = 6.0
MIN_BUILDING_HEIGHT_M = 2.2

# Size classes the blueprint validator checks interiorClaim.sizeClass against.
SIZE_CLASS_SMALL_MAX_M2 = 40.0
SIZE_CLASS_MEDIUM_MAX_M2 = 120.0

# --- rule (a): what a matched interior sibling looks like ------------------- #
INTERIOR_TOKENS = ("_int", "int", "interior", "inside")

# --- rule (b): family prose, as a path table -------------------------------- #
# Each entry is (asset-id prefix, tileset id, why). Sourced from
# world/sources/placement/settlement-asset-inventory.json's family `pieces`
# prose and docs/world/70-dungeons-interiors.md. Longest prefix wins.
TILESET_RULES: tuple[tuple[str, str, str], ...] = (
    ("vanilla:architecture/farmhouse/",
     "vanilla-farmhouse-int",
     "vanilla farmhouse shells: Skyrim builds their interiors from the farmhouse interior tileset"),
    ("vanilla:architecture/imperial/",
     "vanilla-imperial-int",
     "vanilla Imperial shells: interiors from the Imperial interior tileset"),
    ("mwkeep:",
     "vanilla-imperial-int",
     "Morrowind Imperial keep exteriors ship no interiors; the Imperial interior tileset dresses them"),
    ("hlaalu:",
     "vanilla-imperial-int",
     "Hlaalu domestic exteriors ship no interiors; the Imperial interior tileset is the nearest we own"),
    ("xanmeer:",
     "xanmeer-interior-v1",
     "Xanmeer exteriors are a terrace kit with no interior; xanmeer-interior-v1 is its matched interior kit"),
    ("ayleidkit:igsresources/dungeons/ayleidruins/exterior/",
     "xanmeer-interior-v1",
     "Ayleid exterior massing; the pool's own /interior/ modules are packaged as xanmeer-interior-v1"),
    ("htbm:here there be monsters - curse of cipactli/architecture/ruins/",
     "xanmeer-interior-v1",
     "HTBM xanmeer ruin massing ships no interior; xanmeer-interior-v1 is the interior kit for it"),
    ("bmv:architecture/citebosmer/",
     "dungeon-root-v1",
     "grown-root exteriors; the root dungeon kit is the interior grammar that matches them"),
    ("bmv:telvanni/",
     "dungeon-root-v1",
     "grown/organic exteriors; the root dungeon kit is the interior grammar that matches them"),
)

# Kits that ARE interiors: their modules are the inside, so they never claim one.
INTERIOR_KITS = ("xanmeer-interior-v1", "dungeon-root-v1")

# Path fragments that mark a piece as an interior module wherever it lives.
INTERIOR_PATH_MARKERS = ("/interior/", "/interiors/")

# Name tokens that DISQUALIFY a piece whatever it measures. These only ever
# exclude — geometry is still the sole reason anything is called a building
# (owner ruling 2026-09-04) — but a hull, a hollow tree and a raised floor slab
# all measure like a room from the inside, and no amount of ray casting will
# tell you that the thing you are standing in is a boat.
# matched as whole segments of the basename (split on digits, "_", "-"), so
# "mwimparchguardtower01" is not caught by "arch" while "walkwaycwallgate02"
# is caught by "gate"/"wall"/"walkway" via its containing segment tokens below
NON_BUILDING_NAME_TOKENS = ("ship", "boat", "canoe", "ferry", "raft", "tree", "floor", "walkway", "gate", "wall", "fence", "bridge", "stair", "stairs", "ramp", "pillar", "column")

# Categories that can never enclose a dwelling, whatever they measure.
NON_BUILDING_CATEGORIES = {
    "clutter", "container", "furniture", "creature", "weapon", "boat", "vehicle",
    "tree", "root", "grass", "deadfall", "aquatic-plant",
}


# --------------------------------------------------------------------------- #
# pool registries (rule a)
# --------------------------------------------------------------------------- #
def load_pool_ids(registry_dir: Path = REGISTRY_DIR) -> dict[str, list[str]]:
    """pool -> sorted asset ids, read from ``registry-<pool>.jsonl``.

    The registries are the whole vault, not just what a kit packaged: a matched
    interior mesh usually exists in the pool without having been added to the
    kit (nothing placed it yet). Rule (a) has to see it anyway, because it is
    the answer to "what interior should this building have?".
    """
    pools: dict[str, list[str]] = {}
    if not registry_dir.exists():
        return pools
    for path in sorted(registry_dir.glob("registry-*.jsonl")):
        pool = path.name.removeprefix("registry-").removesuffix(".jsonl")
        ids: list[str] = []
        with path.open() as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                asset_id = row.get("id")
                if isinstance(asset_id, str):
                    ids.append(asset_id)
        pools[pool] = sorted(ids)
    return pools


def _tail(asset_id: str) -> tuple[str, str]:
    """(directory, stem) of a kit asset id ``pool:dir/dir/stem``."""
    body = asset_id.split(":", 1)[1] if ":" in asset_id else asset_id
    directory, _, stem = body.rpartition("/")
    return directory, stem


def find_matched_interior(asset_id: str, pool_ids: dict[str, list[str]]) -> str | None:
    """A sibling in the same pool + directory whose name is this piece's name
    with an interior token bolted on. Deterministic: shortest match wins, ties
    broken lexicographically."""
    pool = asset_id.split(":", 1)[0] if ":" in asset_id else ""
    directory, stem = _tail(asset_id)
    if not stem or any(token in stem for token in ("_int", "interior", "inside")):
        return None  # this piece IS an interior
    candidates = []
    for other in pool_ids.get(pool, ()):
        if other == asset_id:
            continue
        other_dir, other_stem = _tail(other)
        if other_dir != directory or not other_stem.startswith(stem):
            continue
        rest = other_stem[len(stem):]
        if rest and any(token in rest for token in INTERIOR_TOKENS):
            candidates.append((len(other_stem), other))
    if not candidates:
        return None
    return sorted(candidates)[0][1]


def find_tileset(asset_id: str) -> tuple[str, str] | None:
    """(tileset id, why) for the longest matching path rule, or None."""
    best: tuple[int, str, str] | None = None
    for prefix, tileset, why in TILESET_RULES:
        if asset_id.startswith(prefix) and (best is None or len(prefix) > best[0]):
            best = (len(prefix), tileset, why)
    return (best[1], best[2]) if best else None


def size_class(area_m2: float) -> str:
    if area_m2 < SIZE_CLASS_SMALL_MAX_M2:
        return "small"
    if area_m2 < SIZE_CLASS_MEDIUM_MAX_M2:
        return "medium"
    return "large"


# --------------------------------------------------------------------------- #
# geometry loading
# --------------------------------------------------------------------------- #
def asset_triangles(scene, root_node: str):
    """LOD0 triangles of an asset, in the asset root node's frame.

    The vertex twin of this lives in ``measure_footprints._asset_vertices``;
    the enclosure probe needs faces as well, because a ray has to hit a
    surface, not a point cloud (kit walls are large low-poly quads whose
    vertices are only at their corners)."""
    import numpy as np
    import trimesh

    graph = scene.graph
    children = graph.transforms.children
    root_matrix, _ = graph.get(root_node)
    inverse = np.linalg.inv(root_matrix)

    stack = [root_node]
    chunks = []
    while stack:
        node = stack.pop()
        if node != root_node and node.endswith(LOD_SUFFIXES):
            continue
        stack.extend(children.get(node, []))
        matrix, geometry = graph.get(node)
        if geometry is None:
            continue
        mesh = scene.geometry.get(geometry)
        if mesh is None or not hasattr(mesh, "faces") or len(getattr(mesh, "faces", ())) == 0:
            continue
        points = trimesh.transform_points(mesh.vertices, inverse @ matrix)
        chunks.append(points[mesh.faces])
    if not chunks:
        return None
    return np.vstack(chunks).astype(np.float64)


# --------------------------------------------------------------------------- #
# geometry: does the piece have an inside, and where is the hole in the wall
# --------------------------------------------------------------------------- #
def _bearing_deg(x: float, z: float) -> float:
    """Local bearing of a direction, north = 0, clockwise. World axes are
    x east and z south (measure_footprints' GLB frame), so north is -z and the
    bearing is ``atan2(x, -z)`` - the same convention as a parcel's yawDeg,
    which is why a world facing is simply ``sideDeg + yawDeg``."""
    return math.degrees(math.atan2(x, -z)) % 360.0


def _ray_distances(triangles, origin, directions):
    """Nearest forward intersection distance per direction, or +inf.

    Vectorised Moller-Trumbore, chunked over triangles so a 20k-triangle piece
    against 74 rays stays inside a few MB. Culling is two-sided on purpose:
    kit meshes are single-sided and often wound inconsistently, and we only
    care THAT a wall is there, not which way it faces.
    """
    import numpy as np

    v0 = triangles[:, 0, :]
    edge1 = triangles[:, 1, :] - v0
    edge2 = triangles[:, 2, :] - v0
    out = np.full(len(directions), np.inf, dtype=np.float64)
    for i, direction in enumerate(directions):
        pvec = np.cross(direction, edge2)
        det = np.einsum("ij,ij->i", edge1, pvec)
        ok = np.abs(det) > 1e-9
        if not ok.any():
            continue
        inv = np.zeros_like(det)
        inv[ok] = 1.0 / det[ok]
        tvec = origin - v0
        u = np.einsum("ij,ij->i", tvec, pvec) * inv
        qvec = np.cross(tvec, edge1)
        v = (qvec @ direction) * inv
        t = np.einsum("ij,ij->i", edge2, qvec) * inv
        hit = ok & (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1.0 + 1e-6) & (t > 1e-4)
        if hit.any():
            out[i] = float(t[hit].min())
    return out


def _horizontal_directions():
    import numpy as np

    step = 360.0 / BINS
    dirs = []
    for i in range(BINS):
        rad = math.radians((i + 0.5) * step)
        dirs.append([math.sin(rad), 0.0, -math.cos(rad)])  # bearing -> (x, y, z)
    return np.asarray(dirs, dtype=np.float64)


def probe_from_inside(triangles, centre: tuple[float, float], eye_y: float) -> dict:
    """Stand at ``centre`` at ``eye_y`` and look around, up and down.

    This is the enclosure test, and it is the same probe vanilla Skyrim's model
    implies: a building is a thing you can stand INSIDE. A ray that escapes the
    mesh means open sky in that direction.

      * ``ringFraction`` - share of the 72 horizontal rays that hit a wall.
      * ``medianWallM``  - median wall distance; a solid block (a stone plinth,
        a pier deck) hits in every direction at almost zero range, so a real
        room has to have ``>= ENCLOSURE_MIN_ROOM_M`` of air around the stander.
      * ``roof``/``headroomM`` - the upward ray hits, and far enough away that
        the ceiling clears MIN_CEILING_M above the floor. A boat, a dock, a
        platform and a wall segment have no roof at all; the crawl space under
        a raised plaza deck has one 0.2 m over your head, which is how a
        substructure used to sneak past this test as a room.
    """
    import numpy as np

    dirs = _horizontal_directions()
    up_down = np.asarray([[0.0, 1.0, 0.0], [0.0, -1.0, 0.0]], dtype=np.float64)
    origin = np.asarray([centre[0], eye_y, centre[1]], dtype=np.float64)
    all_dirs = np.vstack([dirs, up_down])
    dist = _ray_distances(triangles, origin, all_dirs)
    ring = dist[:BINS]
    finite = ring[np.isfinite(ring)]
    return {
        "ring": [float(d) for d in ring],
        "ringFraction": float(len(finite)) / BINS,
        "medianWallM": float(np.median(finite)) if len(finite) else 0.0,
        "roof": bool(np.isfinite(dist[BINS])),
        "floor": bool(np.isfinite(dist[BINS + 1])),
        "headroomM": float(dist[BINS]) if np.isfinite(dist[BINS]) else float("inf"),
        "eyeY": eye_y,
    }


def best_floor(triangles, centre: tuple[float, float], base_y: float, height_m: float) -> dict:
    """Search the floor ladder for the storey a player could stand a room in.

    A stilt house's base is its pile feet, so an eye at base level stands in
    open air under the deck; probing at deck level is the only way its walls
    read at all. The LOWEST qualifying storey wins — it is the one a walking
    player uses, and stopping there is deterministic and cheap. If none
    qualifies, the most enclosed storey is returned so the record can say what
    was measured and why it fell short."""
    best: dict | None = None
    for offset in FLOOR_LADDER_M:
        if offset + EYE_HEIGHT_M >= height_m:
            break
        probe = probe_from_inside(triangles, centre, base_y + offset + EYE_HEIGHT_M)
        probe["floorOffsetM"] = offset
        if is_enclosure(probe):
            return probe
        if best is None or probe["ringFraction"] > best["ringFraction"]:
            best = probe
    return best or {"ring": [math.inf] * BINS, "ringFraction": 0.0, "medianWallM": 0.0,
                    "roof": False, "floor": False, "headroomM": float("inf"),
                    "eyeY": base_y, "floorOffsetM": 0.0}


def is_enclosure(probe: dict) -> bool:
    return (probe["ringFraction"] >= ENCLOSURE_MIN_RING
            and probe["roof"]
            and probe["headroomM"] + EYE_HEIGHT_M >= MIN_CEILING_M
            and probe["medianWallM"] >= ENCLOSURE_MIN_ROOM_M)


def doorways_from_probe(triangles, centre: tuple[float, float], floor_y: float,
                        height_m: float) -> tuple[list[dict], str | None]:
    """Where the doorway is, measured against the wall above it.

    Skyrim's exterior meshes carry no door marker (the openable door is a
    separately placed reference), so a doorway shows up in one of two ways, and
    both are found by probing the ring TWICE from inside — once at door height
    (1.1 m) and once above the lintel (2.4 m):

      * an **open** doorway — the door ray escapes where the lintel ray hits;
      * a **filled** doorway — the door leaf or its blocking panel is set into
        the wall, so the door ray comes back materially nearer than the lintel
        ray in the same direction (<= 80 % of it). This is the common case: a
        vanilla farmhouse, a Mud Mother Grove hut and an HTBM bamboo hut are
        all closed shells with the door modelled in.

    Comparing each bin against the SAME bin above the lintel is what makes this
    work on domes and thatch: a roof that closes in shortens every ray equally,
    so only the doorway stands out. Runs are then filtered by arc length at the
    wall line: 0.8–5.0 m is a door or a gateway, wider is an open front.

    Returns (doorways, why-not).
    """
    import numpy as np

    lintel_y = floor_y + LINTEL_BAND_M
    if LINTEL_BAND_M >= height_m:
        return [], (f"the piece is only {height_m:.1f} m tall, so there is no wall above a lintel "
                    f"to measure a doorway against")
    door = probe_from_inside(triangles, centre, floor_y + DOOR_BAND_M)
    wall = probe_from_inside(triangles, centre, lintel_y)
    d = np.asarray(door["ring"])
    w = np.asarray(wall["ring"])

    is_door = np.zeros(BINS, dtype=bool)
    for i in range(BINS):
        if not np.isfinite(w[i]):
            continue                       # no wall above: nothing to be a door in
        if not np.isfinite(d[i]):
            is_door[i] = True              # an open hole under a solid lintel
        elif d[i] <= DOOR_RECESS_RATIO * w[i]:
            is_door[i] = True              # a leaf or blocker set into the wall

    if not is_door.any():
        return [], ("no direction reads as a doorway — the ring at 1.1 m matches the wall above the "
                    "lintel all the way round, so the door is a separate mesh or the piece is a "
                    "modular wall segment; place the door on the side the design wants")
    if is_door.all():
        return [], "every direction reads as a doorway, so the measurement is not trustworthy here"

    start = next(i for i in range(BINS) if is_door[i] and not is_door[(i - 1) % BINS])
    runs: list[list[int]] = []
    current: list[int] = []
    for step in range(BINS):
        index = (start + step) % BINS
        if is_door[index]:
            current.append(index)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)

    out = []
    bin_rad = 2.0 * math.pi / BINS
    for run in runs:
        if len(run) > DOORWAY_MAX_BINS:
            continue
        wall_r = [float(w[i]) for i in run if np.isfinite(w[i])]
        if not wall_r:
            continue
        radius = sum(wall_r) / len(wall_r)
        arc = radius * bin_rad * len(run)
        if not (DOORWAY_MIN_ARC_M <= arc <= DOORWAY_MAX_ARC_M):
            continue
        face = [float(d[i]) for i in run if np.isfinite(d[i])]
        face_r = sum(face) / len(face) if face else radius
        mid = (run[0] + (len(run) - 1) / 2.0) % BINS
        side_deg = ((mid + 0.5) * (360.0 / BINS)) % 360.0
        rad = math.radians(side_deg)
        out.append({
            "sideDeg": round(side_deg, 2),
            "offsetM": [round(centre[0] + face_r * math.sin(rad), 2),
                        round(centre[1] - face_r * math.cos(rad), 2)],
            "arcM": round(arc, 2),
        })
    out.sort(key=lambda item: (-item["arcM"], item["sideDeg"]))
    if not out:
        return [], ("the openings measured are wider than 5.0 m or narrower than 0.8 m — an open "
                    "front or a texture seam, not a doorway")
    return out[:MAX_DOORWAYS], None


# --------------------------------------------------------------------------- #
# per-kit derivation
# --------------------------------------------------------------------------- #
def classify_asset(asset: dict, kit: str, verts, triangles,
                   pool_ids: dict[str, list[str]]) -> dict:
    """One asset's interior record. ``verts``/``triangles`` may be None."""
    asset_id = asset["id"]
    record: dict = {"category": asset.get("category"), "doorways": []}

    if kit in INTERIOR_KITS or any(m in asset_id for m in INTERIOR_PATH_MARKERS):
        record.update(interior="none",
                      why=f"{kit} is an interior kit — these modules ARE the inside",
                      doorwaysWhy="interior modules have no exterior doorway")
        return record

    matched = find_matched_interior(asset_id, pool_ids)

    # Measure first: the enclosure probe gates rules (b) and (c), and rule (a)
    # still wants the size class and the doorway.
    have_geometry = verts is not None and len(verts) > 0
    plan = convex_hull_2d([(float(v[0]), float(v[2])) for v in verts]) if have_geometry else []
    area = round(polygon_area(plan), 2) if plan else 0.0
    if have_geometry:
        base_y = float(min(v[1] for v in verts))
        height = round(float(max(v[1] for v in verts)) - base_y, 2)
    else:
        base_y, height = 0.0, 0.0
    record["planAreaM2"] = area
    record["heightM"] = height
    record["sizeClass"] = size_class(area)

    big_enough = area >= MIN_BUILDING_AREA_M2 and height >= MIN_BUILDING_HEIGHT_M
    stem = _tail(asset_id)[1]
    import re as _re
    _segs = [x for x in _re.split(r"[\d_\-]+", stem.lower()) if x]
    banned = next((t for t in NON_BUILDING_NAME_TOKENS
                   if any(seg == t or (len(t) >= 4 and t in seg and seg.startswith((t, "walkway", "stone", "wood", "tamu", "mwimparch"))) for seg in _segs)), None)
    category_ok = asset.get("category") not in NON_BUILDING_CATEGORIES and banned is None
    encloses = False
    probe: dict | None = None
    if big_enough and triangles is not None and len(triangles):
        cx = sum(p[0] for p in plan) / len(plan)
        cz = sum(p[1] for p in plan) / len(plan)
        probe = best_floor(triangles, (cx, cz), base_y, height)
        record["ringFraction"] = round(probe["ringFraction"], 3)
        record["medianWallM"] = round(probe["medianWallM"], 2)
        record["roofOverhead"] = probe["roof"]
        record["headroomM"] = round(min(probe["headroomM"] + EYE_HEIGHT_M, 99.0), 2)
        record["floorOffsetM"] = probe["floorOffsetM"]
        encloses = is_enclosure(probe)
        if encloses:
            doors, why_not = doorways_from_probe(
                triangles, (cx, cz), base_y + probe["floorOffsetM"], height - probe["floorOffsetM"])
            record["doorways"] = doors
            if why_not:
                record["doorwaysWhy"] = why_not

    if matched:
        record.update(interior="matched", interiorAssetRef=matched,
                      why=(f"the {asset_id.split(':', 1)[0]} pool ships {matched} as this piece's "
                           f"matched interior, authored to fit it"))
        return record

    tileset = find_tileset(asset_id)
    if tileset and encloses and category_ok:
        record.update(interior="tileset", tileset=tileset[0], why=tileset[1])
        return record

    if encloses and category_ok:
        record.update(interior="shell",
                      why=(f"measured to enclose a volume — {record['ringFraction']:.0%} of the ring "
                           f"at 1.6 m hits a wall, there is a roof overhead and {record['medianWallM']:.1f} m "
                           f"of room to stand — with no matched interior and no tileset rule, so Phase 12 "
                           f"must claim an interior for it"))
        return record

    if not big_enough:
        why = f"too small to hold an interior ({area:.1f} m² plan, {height:.1f} m tall)"
    elif not category_ok:
        why = (f"name token {banned!r} — a hull, a hollow tree or a floor slab, not a building"
               if banned else f"category {asset.get('category')!r} is never a building")
    elif probe is None:
        why = "no LOD0 geometry resolved, so no enclosure could be measured"
    elif not probe["roof"]:
        why = ("open to the sky — nothing overhead from inside it, so it is a platform, deck, "
               "walkway, quay, hull or wall segment, not an enclosure")
    elif probe["headroomM"] + EYE_HEIGHT_M < MIN_CEILING_M:
        why = (f"a crawl space, not a room — only {probe['headroomM'] + EYE_HEIGHT_M:.1f} m of "
               f"headroom (a room needs {MIN_CEILING_M} m), so this is the underside of a deck, "
               f"plaza or platform")
    elif probe["ringFraction"] < ENCLOSURE_MIN_RING:
        why = (f"open sided — only {probe['ringFraction']:.0%} of the ring at 1.6 m hits a wall, "
               f"so it does not enclose anything")
    else:
        why = (f"solid, not hollow — walls are only {probe['medianWallM']:.1f} m away at 1.6 m "
               f"(a room needs {ENCLOSURE_MIN_ROOM_M} m), so this is massing, not a building you enter")
    record.update(interior="none", why=why, doorways=[],
                  doorwaysWhy="not an enclosure, so no doorway is derived")
    return record


def index_kit(kit_name: str, kits_dir: Path = KITS_DIR,
              registry_dir: Path = REGISTRY_DIR) -> dict:
    import trimesh

    manifest = json.loads((kits_dir / f"{kit_name}.kit.json").read_text())
    scene = trimesh.load(kits_dir / f"{kit_name}.glb", process=False)
    node_names = set(scene.graph.nodes)
    by_asset_id = glb_asset_id_nodes(kits_dir / f"{kit_name}.glb")
    pool_ids = load_pool_ids(registry_dir)

    assets: dict[str, dict] = {}
    for asset in sorted(manifest["assets"], key=lambda a: a["id"]):
        node = _resolve_node(asset, node_names, by_asset_id)
        verts = _asset_vertices(scene, node) if node else None
        triangles = asset_triangles(scene, node) if node else None
        assets[asset["id"]] = classify_asset(asset, kit_name, verts, triangles, pool_ids)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kit": manifest.get("kit", kit_name),
        "assets": assets,
        "rules": {
            "enclosureMinRing": ENCLOSURE_MIN_RING,
            "eyeHeightM": EYE_HEIGHT_M,
            "enclosureMinRoomM": ENCLOSURE_MIN_ROOM_M,
            "doorwayArcM": [DOORWAY_MIN_ARC_M, DOORWAY_MAX_ARC_M],
            "sizeClassMaxM2": {"small": SIZE_CLASS_SMALL_MAX_M2,
                               "medium": SIZE_CLASS_MEDIUM_MAX_M2},
        },
    }


def write_kit(kit_name: str, kits_dir: Path = KITS_DIR) -> Path:
    data = index_kit(kit_name, kits_dir)
    out = kits_dir / f"{kit_name}.interiors.json"
    out.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kit", action="append", default=None,
                    help="kit name (repeatable); default every non-probe/flora kit")
    ap.add_argument("--kits-dir", default=str(KITS_DIR))
    args = ap.parse_args()

    kits_dir = Path(args.kits_dir)
    for name in (args.kit or kit_names(kits_dir)):
        out = write_kit(name, kits_dir)
        data = json.loads(out.read_text())
        tally: dict[str, int] = {}
        doors = 0
        for record in data["assets"].values():
            tally[record["interior"]] = tally.get(record["interior"], 0) + 1
            doors += 1 if record.get("doorways") else 0
        summary = ", ".join(f"{k} {tally[k]}" for k in sorted(tally))
        print(f"interiors_index: {out.name} — {summary}; {doors} with derived doorways")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
