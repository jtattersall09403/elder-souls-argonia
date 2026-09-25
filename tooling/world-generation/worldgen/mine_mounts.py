"""Which kit pieces the makers hung ON another piece, and what each piece anchors to.

Phase 16h item 1, second half. A lantern, a sconce or a sign is not placed on
the ground: the makers hung it off a parent mesh, and its position in our
world is the parent's runtime transform plus a fixed local offset. That offset,
and every kit asset's ``anchorClass``, is evidence in the plugins, read here by
REAL MESH-TO-MESH CONTACT (16h round 6, owner 2026-09-23). Five rounds of
bounding-box rules each produced a different noisy wall set (chairs, planks,
waterfall FX, shore rocks); boxes are now only the candidate filter.

**Contact** (per placed unit-scale kit reference, the child):

* Candidates: every STAT/TREE reference (kit or not) in the child's cell or the
  8 neighbouring exterior cells whose bounds come within 0.5 m of the child's.
* Both real meshes are placed with the recorded position, rotation (x, y, z,
  clockwise, applied x then y then z) and scale: the kit GLB for a kit asset,
  the vault NIF (dumped once to ``output/mesh-cache`` by
  ``pipeline/blender/dump_nif_meshes.py``) for anything else. The child's
  surface is sampled to 300 points (seeded); a point is in contact when it is
  within 0.03 m of the parent's surface (trimesh proximity). Candidate pairs are
  deduplicated on (child model, parent model, relative transform rounded to
  1 cm / 0.01) before any distance query.
* Terrain: the child's points within 0.03 m above the cell's LAND heightfield,
  or below it, are contact with the ground.
* A contact patch's class is the direction of the mean outward normal of the
  child's contact points, in the child's own frame: down (z <= -0.5 of the
  unit mean) ``under``; up (>= 0.5) ``top``; otherwise ``side``. Terrain
  contact is always ``under``.

**Per reference** (support from below takes precedence, owner amendment):
under-contact with anything means the piece STANDS there: ``deck`` when one of
those supports is a kit piece, else ``ground`` (terrain or a non-kit static);
its other contacts are recorded as ``abuts`` and are never an anchor or a pair.
With nothing under it: ``wall`` by side contact, ``hanging`` by top contact
(side contact wins when it has both, round 16); no contact at all: ``ground``.
Round 15 (planner ruling 2026-09-24): a top contact is ``hanging`` only when
the parent reaches more than ``HANGS_BELOW_M`` (0.05 m) below the contact
height (median of the contact points, parent frame); a parent wholly at or
above it lies ON the child (``rests-on``): a neighbour contact recorded in
``abuts``, never a vote. A reference held by nothing but such pieces is
``free``/``water`` as with no contact (``restsOnOnly`` on the asset row).
Round 16 (planner rulings 2026-09-24, support from below wins, 0085): (a) a
child whose foot is SET INTO a piece (its lowest point at most ``SET_INTO_M``
0.05 m above that piece's lowest, its top above that piece's top, the contact
on that piece's top face) is supported by it (``set-into``, as ``under``:
deck on a kit piece, else ground); (b) the interior floor under a child is
found by a ray cast down (the child's own -z) from its footprint through each
candidate's real mesh, room shells included (``floor_gap``), never from a
candidate's bounds top; (c) only with no support from below and no side
contact does a top contact make the child ``hanging`` (side contact wins).
Ruling 2: a door with no frame contact takes its category row's class
(``CATEGORY_REF_CLASS``: ``hanging``), never ``free``.
Round 17 (planner ruling 1, 2026-09-24): a non-kit static whose model lies
under ``effects/`` or ``magic/`` (``NON_SUPPORT_STATIC_DIRS``: the light-spell
art a lantern is set into) is never a candidate, for any contact kind; and
kit clutter (a kit piece that is not a shell) never supports a shell, under
or set-into, nor is its floor (``supports``), extending the interior-zero
clutter exclusion.
Round 19 (planner ruling 2, 2026-09-24): the terrain wins for the vote as it
does for the designed sink: a piece whose lowest point touches the LAND
(``touches_terrain``, ``TERRAIN_TOUCH_M`` 0.05 m) stands on the terrain even
when it is also set into or on a neighbour (``ground``, or ``water`` on
submerged terrain per round 11); the neighbour is an abut
(``terrainOverNeighbour`` on the asset row counts such references).
Round 20 (brief 16h miner lane, fixes (a) and (c)): ground (with ``free``)
and ``deck`` references are pooled as ONE support vote before the plurality
against ``wall``, ``hanging``, ``water`` and ``fx`` (support from below wins,
0085; M19's ``wrfencestr01`` ground 17 / wall 15 / deck 6 is supported, not
wall); inside the pool the larger of ground and deck is the class (a tie is
ground) and ``share`` is the pool's. Non-kit statics under ``sky/`` (cloud
meshes) join ``NON_SUPPORT_STATIC_DIRS``. An ``assetPlacement`` row naming an
``anchorClass`` in ``placement-policies.json`` (planner ruling 2026-09-24,
reviewed per asset) decides the class ahead of the vote and every other
policy, ``anchorClassEvidence`` and ``evidence`` ``policy`` with
``votedClass``, and its ``designedWaterlineM`` is the waterline (evidence
``policy``), so the record says what the refreshed manifests say.
Interior structure (round 7): in an interior cell a shell piece
(``SHELL_CATEGORIES``) that no non-kit static top or LAND supports and whose
every structural contact is a kit shell (a copy of itself counts; kit clutter
such as a sconce on it is ignored) is ``ground`` with provenance
``interior-zero`` (the shell is the floor datum; ``support`` on the asset row).
Round 13: an interior shell whose support from below (its under contacts, or
the floor top under it) is only kit shells is ``ground``/``interior-zero``
too, whatever it touches at the side; a non-shell piece on a shell stays
``deck``. Round 14 (planner ruling 2026-09-23): a VANILLA dungeon-kit static
(a non-kit base whose model lies under ``meshes/dungeons/`` in the vanilla
pool: the Imperial, Nordic, Dwemer and cave families, ``impfloorchunk01``
included) is a shell in both rules, so a free wall standing among the vanilla
floor and pillar pieces is on the shell datum.

**Water** (rounds 9–10; replaces the round 7 cell-water band): an exterior
reference is in a WATER COLUMN when the cell water (the last override's XCLW,
else the worldspace default) stands above the floor at its pivot: the LAND
there (unsculpted LAND at the worldspace default counts), else the cell's flat
placeholder, else the worldspace default land. Contacts decide first,
everywhere (round 10): support from below (terrain, a deck, a floor), then
wall/hanging contact, exactly as above, whether or not the reference is in a
water column; but terrain contact on SUBMERGED ground (below the cell or
placed water surface there) is ``water`` (round 11: stems on the lake bed
stand in the water), while a kit or static underneath stays deck/ground. Only a reference with NO contact at all is classed by the
column: ``water`` inside one (at any depth; the designed sink miner measures
the depth), ``free`` outside. A pivot within ``WATERLINE_BAND_M`` (0.10 m)
of a PLACED water surface (a reference whose base model lies under
``meshes/water/``, pivot inside its bounds) is ``water`` wherever it is.

**No LAND is not evidence** (round 8): outside a water column, an exterior
reference whose cell has no usable LAND (none, and no vanilla city parent's at
the same grid; or an unresolved flat placeholder) is dropped from
classification and counted on the asset as ``droppedNoLand``. **Buried is
ground** (round 14, planner ruling 2026-09-23): a reference whose pivot lies
more than ``BURIED_M`` (2 m) below the LAND stands in the ground; it votes
``ground`` and is counted as ``buriedGround`` (round 8 dropped it because the
reader then misread the LAND; round 9 fixed the reader). Interior cells are
exempt from both.

**The load order** (round 9): the pool's plugins load as vanilla masters,
then ``.esm`` files, then ``.esp`` files. Form ids resolve through each
plugin's master list, so a reference whose base a master defines (a Black
Marsh North lily pad placed from Black Marsh.esm) is mined like its own. Every
exterior cell is merged over the load order before contact is measured: the
last real LAND override wins (a flat placeholder never displaces real LAND),
the last CELL override's water wins, a reference override replaces the
original, and all plugins' references in a cell are each other's neighbours.
Interior cells are merged the same way (round 10).

**Per asset**: ``water`` first (over-water samples n>=3, waterline IQR < 0.5 m,
ground samples absent or loose, from ``mine_designed_sink``). The VOTE (round
10) is the usable references placed by the file that defines the base; other
files' references vote only while it has fewer than 3 (counted as
``otherFileRefsNotVoting``; their contacts still feed the pairs). Then the
majority class over the voting references when n >= 3, or with n = 1..2 the class all
of them agree on (``evidence: thin``; disagreement is ground). When dropping
no-LAND references left fewer than 3 usable ones, the asset falls back:
``water`` when the sink record's waterline passes the water test (``evidence:
sink-waterline``), else the class of its placement-policy row (``water-zero``
is water, every other policy ground; ``evidence: policy``). An AMBIGUOUS vote
(1 <= n < 3, or the winning share < 0.6; ``is_ambiguous``) whose policy row
names a class of its own (``water-zero`` water, ``deck`` deck) takes that class, ``evidence:
policy``, ``votedClass`` the vote (round 12: the ship hull, swamp cedar and
stilt house carry such rows, each with its why in ``assetPolicyEvidence``).
Round 17 ruling 2: policy rows decide. An ASSET row that names a class
decides that asset's class whatever the vote share (a row is a recorded
design fact); a KIT row applies only to an ambiguous vote and only if it
names a class; otherwise the vote stands (``policy_override``).
Round 15 ruling 2: a thin water vote whose every reference had no contact
(the water column alone) and no mined waterline is ambiguous by definition
and takes its policy row whatever class it names (asset row, else the kit
row, else ground; ``evidence: policy``, ``votedClass``). The record
carries ``n``, ``share`` (the winning class's share), ``refClasses`` and the ten
most frequent ``abuts`` parents. Round 17 ruling 3: a water-class asset whose
sink record has no waterline carries ``waterline`` ``{p50, n, evidence}``:
cell water minus pivot, median over the defining file's water-column
references when n >= 3 (``column``), else the resolved policy row's
``fallbackWaterlineM`` (asset row, else kit row; ``policy``; round 18
ruling 3). Round 18 ruling 1: an interior ray-cast floor within
``FLOOR_SUPPORT_M`` 0.10 m under the footprint is support. Round 18
ruling 4: a non-kit static's NIF is looked up in its pool, then in the
BSA beside the pool's plugins (``plugin_archives``), then vanilla. Evidence strings are
``placement_metadata.EVIDENCE_VOCABULARY``. An asset with no placed reference is ``ground``
with ``anchorClassEvidence: unplaced``.

**Mount pairs**: for a wall (hanging) asset, every KIT parent one of its wall
(hanging) references is in side (top) contact with, offsets from exactly those
references. Shapes (schemaVersion 3):

* ``band`` — n >= 3 and, in the parent frame split into ``along`` (the
  parent's longer horizontal bounds axis, ``alongAxis`` "x" or "y"), ``out``
  (the other horizontal axis) and ``up`` (z), the IQR of out and of up are
  both under 0.3 m. Records ``outM``/``upM`` (medians), ``alongMinM``/
  ``alongMaxM`` (observed range), ``yawDeg`` (median relative yaw).
* ``points`` — otherwise: the distinct offsets, clustered within 0.3 m, each
  ``{offsetM, n, yawDeg}``, most frequent first.

Both carry ``offsetM`` and ``yawDeg``. Offsets are in the PARENT's local z-up
frame divided by its scale (``parentScale`` on the pair is the median scale),
from ``mine_assemblies.local_offset`` so this record and
``kit-assemblies-mined.json`` never drift apart.

Usage:
  python3 -m worldgen.mine_mounts            # needs the mesh cache (--dump-meshes)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import numpy as np

from . import asset_registry
from .esp_index import UNITS_PER_METRE, Plugin
from .mine_assemblies import local_offset
from .mine_designed_sink import (
    DEFAULT_OUT as SINK_RECORD,
    FormResolver,
    LoadOrderIndex,
    PoolJoin,
    kit_assets,
    load_order,
    pool_plugins,
)

from pipeline.placement_metadata import (  # noqa: E402  (path set by mine_designed_sink)
    ANCHOR_EVIDENCE,
    ANCHOR_ROW_EVIDENCE,
    REFERENCE_SOURCES,
    WATERLINE_EVIDENCE,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO_ROOT / "world" / "sources" / "placement" / "kit-mounts-mined.json"
RAW_KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
MESH_CACHE = REPO_ROOT / "tooling" / "world-generation" / "output" / "mesh-cache"

MIN_SAMPLES = 3
"""Fewest co-placements that make a band rather than points."""

MAX_SPREAD_M = 0.3
"""Band gate (IQR of out and of up) and the points cluster radius."""

STATIC_PARENT_TYPES = ("STAT", "TREE")
NON_KIT_PREFIX = "plugin-static:"
NON_SUPPORT_STATIC_DIRS = tuple(NON_KIT_PREFIX + d for d in ("effects/", "magic/", "sky/"))
"""Round 17 ruling 1: non-kit statics here (effect and spell art; round 20
fix (c): the sky's cloud meshes) are never candidate parents, for any
contact kind."""
CELL_UNITS = 4096.0
CONTAINMENT_MARGIN_M = 0.25
"""Slack on a parent's horizontal reach for the cheap radius pre-filter."""
CANDIDATE_GAP_M = 0.5
"""Bounds within this of each other: the pair is worth a mesh distance query."""
CONTACT_M = 0.03
"""A child surface point within this of the parent surface is in contact."""
CHILD_SAMPLES = 300
NORMAL_SPLIT = 0.5
HANGS_BELOW_M = 0.05
"""A top contact is hanging only when the parent's lowest point lies more
than this below the contact height (round 15 ruling 1): the child hangs FROM
it. A parent wholly at or above the child's top rests ON it (``rests-on``, a
neighbour contact, never a vote)."""
SET_INTO_M = 0.05
"""Round 16 ruling 1a: a child whose lowest point is at most this above the
parent's lowest point, whose top rises above the parent's top, and whose
contact lies on the parent's top face has its foot SET INTO the parent (the
railing through the walkway plank): support from below (``set-into``)."""
SET_INTO_TOP_SHARE = 0.25
"""Share of the contact points that must lie on the parent's top face."""
CATEGORY_REF_CLASS = {"door": "hanging"}
"""Round 16 ruling 2: the class a reference takes from its category row when
its own rule has nothing to read (a door with no frame contact hangs by the
door rule, never ``free``)."""
ANCHOR_MIN_SAMPLES = 3
MARKER_WORDS = ("marker", "xmarker", "triggerbox", "collisionbox")
SCALE_TOLERANCE = 1e-3
ABUTS_KEPT = 10
MOUNTED_CLASSES = ("wall", "hanging")
SUPPORT_CLASSES = ("ground", "deck")
"""Round 20 fix (a): the classes pooled as support before the plurality vote."""
SHELL_CATEGORIES = ("architecture", "dungeon-kit", "ruin")
"""Kit manifest categories that are building structure (interior shells)."""
VANILLA_SHELL_PREFIX = NON_KIT_PREFIX + "dungeons/"
"""A non-kit static from the vanilla pool whose model lies here is a dungeon
shell piece too (round 14)."""


def is_vanilla_shell(static_id: str, pool: str | None) -> bool:
    """A non-kit vanilla dungeon-kit static (round 14 ruling 2)."""
    return pool == "vanilla" and static_id.casefold().startswith(VANILLA_SHELL_PREFIX)
BURIED_M = 2.0
"""A pivot this far below the LAND under it was not placed on that LAND."""
WATER_MODEL_PREFIX = "water/"
WATERLINE_BAND_M = 0.10
"""A pivot this close to a PLACED water surface's top floats on it (round 7)."""
"""A base record whose model lies here is a placed water surface."""
ANCHOR_CLASSES = ("ground", "wall", "hanging", "deck", "water", "fx")


@dataclass(slots=True)
class Instance:
    """A placed reference, in the attribute shape ``local_offset`` expects."""

    asset_id: str
    x: float
    y: float
    z: float
    yaw_deg: float
    scale: float = 1.0
    kit: bool = True
    tree: bool = False
    rx: float = 0.0
    ry: float = 0.0
    door: bool = False
    own: bool = True
    """The file that created the reference defines its base (round 10 vote)."""
    ref_id: int = 0

    @property
    def unit_scale(self) -> bool:
        return abs(self.scale - 1.0) <= SCALE_TOLERANCE


def is_marker(model_key: str) -> bool:
    name = model_key.rsplit("/", 1)[-1]
    return any(word in name for word in MARKER_WORDS)


def bounds_of(asset: dict) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    """Local-frame ``(min, max)`` in metres from the manifest's measured box.

    ``build_kit`` writes ``originOffsetM = -bboxMin`` of the transformed LOD0
    bounds, so the box is recoverable exactly.
    """
    size = asset.get("sizeM")
    offset = asset.get("originOffsetM")
    if not (isinstance(size, list) and isinstance(offset, list)
            and len(size) == 3 and len(offset) == 3):
        return None
    low = tuple(-float(offset[i]) for i in range(3))
    return low, tuple(low[i] + float(size[i]) for i in range(3))


def median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return 0.5 * (ordered[middle - 1] + ordered[middle])


def circular_median_deg(values: list[float]) -> float:
    """Median direction — 359 and 1 must not average to 180."""
    sin = sum(math.sin(math.radians(v)) for v in values)
    cos = sum(math.cos(math.radians(v)) for v in values)
    return round(math.degrees(math.atan2(sin, cos)) % 360.0, 2)


def obnd_box(bounds) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    """A base record's ``OBND`` (game units) as a local ``(min, max)`` in metres."""
    if not bounds:
        return None
    low = tuple(bounds[i] / UNITS_PER_METRE for i in range(3))
    high = tuple(bounds[i + 3] / UNITS_PER_METRE for i in range(3))
    if any(high[i] <= low[i] for i in range(3)):
        return None
    return low, high


def parent_reach(boxes: dict[str, tuple]) -> dict[str, float]:
    """Unscaled horizontal reach (metres) of each parent box from its pivot."""
    return {asset_id: max(abs(v) for corner in box for v in corner[:2])
            + CONTAINMENT_MARGIN_M for asset_id, box in boxes.items()}


def border_parents(rows: list[Instance], grid: tuple[int, int],
                   reach: dict[str, float]) -> list[Instance]:
    """The refs of a neighbouring cell whose reach crosses into ``grid``'s cell."""
    size = CELL_UNITS
    x0, y0 = grid[0] * size, grid[1] * size
    kept = []
    for row in rows:
        extent = reach.get(row.asset_id)
        if extent is None:
            continue
        radius = extent * UNITS_PER_METRE * row.scale * 1.5
        if (x0 - radius <= row.x <= x0 + size + radius
                and y0 - radius <= row.y <= y0 + size + radius):
            kept.append(row)
    return kept


def quartile_range(values: list[float]) -> float:
    """Interquartile range, linear interpolation between order statistics."""
    ordered = sorted(values)

    def at(q: float) -> float:
        pos = q * (len(ordered) - 1)
        low = math.floor(pos)
        high = min(low + 1, len(ordered) - 1)
        return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)

    return at(0.75) - at(0.25)


def along_axis(box) -> int:
    """0 (x) or 1 (y): the parent's longer horizontal bounds axis."""
    low, high = box
    return 0 if high[0] - low[0] >= high[1] - low[1] else 1


def cluster_points(rows) -> list[dict]:
    """Offsets clustered within MAX_SPREAD_M of a cluster's first member,
    in sorted order (deterministic); most frequent first."""
    clusters: list[list] = []
    for row in sorted(rows, key=lambda r: (tuple(r[0]), r[1])):
        for cluster in clusters:
            if math.dist(cluster[0][0], row[0]) < MAX_SPREAD_M:
                cluster.append(row)
                break
        else:
            clusters.append([row])
    points = []
    for cluster in clusters:
        points.append({
            "offsetM": [round(sum(r[0][i] for r in cluster) / len(cluster), 4)
                        for i in range(3)],
            "n": len(cluster),
            "yawDeg": circular_median_deg([r[1] for r in cluster]),
        })
    points.sort(key=lambda pt: (-pt["n"], pt["offsetM"]))
    return points


def summarise(samples, kits: dict[str, dict] | None = None) -> list[dict]:
    """Every eligible (child, parent) as one ``band`` or ``points`` pair.

    The caller has already kept only eligible (child, parent) samples."""
    kits = kits or {}
    pairs: list[dict] = []
    for (child, parent), rows in sorted(samples.items()):
        if not rows:
            continue
        rows = [(tuple(row[0]), row[1], row[2] if len(row) > 2 else 1.0)
                for row in rows]
        offsets = [row[0] for row in rows]
        box = bounds_of(kits.get(parent, {}))
        axis = along_axis(box) if box else 0
        across = 1 - axis
        base = {"child": child, "parent": parent,
                "parentScale": round(median([row[2] for row in rows]), 4),
                "n": len(rows), "evidence": "plugin"}
        if (len(rows) >= MIN_SAMPLES
                and quartile_range([o[across] for o in offsets]) < MAX_SPREAD_M
                and quartile_range([o[2] for o in offsets]) < MAX_SPREAD_M):
            centre = [round(median([o[i] for o in offsets]), 4) for i in range(3)]
            pairs.append({
                "kind": "band", **base,
                "alongAxis": "xy"[axis],
                "outM": centre[across], "upM": centre[2],
                "alongMinM": round(min(o[axis] for o in offsets), 4),
                "alongMaxM": round(max(o[axis] for o in offsets), 4),
                "offsetM": centre,
                "yawDeg": circular_median_deg([row[1] for row in rows]),
            })
            continue
        points = cluster_points(rows)
        pairs.append({"kind": "points", **base, "points": points,
                      "offsetM": points[0]["offsetM"],
                      "yawDeg": points[0]["yawDeg"]})
    return pairs


def _finite3(value) -> bool:
    return (isinstance(value, list) and len(value) == 3
            and all(isinstance(v, (int, float)) and math.isfinite(v) for v in value))


def validate_pairs(pairs: list[dict]) -> list[str]:
    """Contract findings on a mounts record — the gate the tests exercise."""
    findings: list[str] = []
    seen: set[tuple[str, str]] = set()
    for pair in pairs:
        child = pair.get("child", "?")
        for key in ("child", "parent", "evidence"):
            if not isinstance(pair.get(key), str) or not pair[key]:
                findings.append(f"{child}: mount {key} must be a non-empty id")
        if not _finite3(pair.get("offsetM")):
            findings.append(f"{child}: mount offsetM must be three finite metres")
        n = pair.get("n")
        kind = pair.get("kind")
        if kind == "band":
            if not isinstance(n, int) or n < MIN_SAMPLES:
                findings.append(f"{child}: a band needs n >= {MIN_SAMPLES}")
            if pair.get("alongAxis") not in ("x", "y") or not (
                    pair.get("alongMinM", 1) <= pair.get("alongMaxM", 0)):
                findings.append(f"{child}: a band needs alongAxis and alongMin <= alongMax")
        elif kind == "points":
            points = pair.get("points") or []
            if not points or not all(_finite3(pt.get("offsetM")) for pt in points):
                findings.append(f"{child}: points must list finite offsets")
            elif sum(pt.get("n", 0) for pt in points) != n:
                findings.append(f"{child}: points counts must sum to n")
        else:
            findings.append(f"{child}: mount kind must be band or points")
        if pair.get("child") == pair.get("parent"):
            findings.append(f"{child}: a piece cannot mount on itself")
        key = (child, pair.get("parent", "?"))
        if key in seen:
            findings.append(f"{child}: mount on {key[1]} listed twice")
        seen.add(key)
    return findings


def rotation(ref: Instance) -> np.ndarray:
    """Local -> world rotation: clockwise angles, x then y then z (the yaw alone
    reproduces ``local_offset``)."""
    ax, ay, az = -ref.rx, -ref.ry, -math.radians(ref.yaw_deg)
    cx, sx, cy, sy, cz, sz = (math.cos(ax), math.sin(ax), math.cos(ay),
                              math.sin(ay), math.cos(az), math.sin(az))
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def relative_pose(parent: Instance, child: Instance) -> tuple[np.ndarray, np.ndarray]:
    """``(A, b)``: child-local metres -> parent-local UNSCALED metres."""
    rp_t = rotation(parent).T
    delta = np.array([child.x - parent.x, child.y - parent.y,
                      child.z - parent.z]) / UNITS_PER_METRE
    a = rp_t @ rotation(child) * (child.scale / parent.scale)
    return a, rp_t @ delta / parent.scale


def box_gap_ok(a: np.ndarray, b: np.ndarray, child_box, parent_box, parent_scale: float) -> bool:
    """Do the child's bounds, placed in the parent frame, come within
    CANDIDATE_GAP_M of the parent's bounds?"""
    low, high = child_box
    corners = np.array([[x, y, z] for x in (low[0], high[0])
                        for y in (low[1], high[1]) for z in (low[2], high[2])])
    placed = corners @ a.T + b
    gap = CANDIDATE_GAP_M / parent_scale
    plow, phigh = parent_box
    return bool(np.all(placed.max(axis=0) >= np.array(plow) - gap)
                and np.all(placed.min(axis=0) <= np.array(phigh) + gap))


def pose_key(child: str, parent: str, a: np.ndarray, b: np.ndarray,
             parent_scale: float) -> tuple:
    return (child, parent, round(parent_scale, 3),
            tuple(np.round(b / 0.01).astype(int).tolist()),
            tuple(np.round(a.ravel() / 0.01).astype(int).tolist()))


@dataclass(slots=True)
class ChildRef:
    asset_id: str
    rotation: np.ndarray
    origin_m: np.ndarray
    scale: float
    land: tuple | None
    """``(heights ndarray, (gx, gy))`` for an exterior cell with LAND."""
    links: list
    """``(pose key, parent asset id, parent is kit, (offset, yaw, scale),
    parent is a TREE, parent lies inside the child's bounds, parent is a
    shell, parent is a copy of the child)``; copies are linked only for an
    interior shell child (the interior-zero test)."""
    door: bool = False
    water_m: float | None = None
    """The cell's water height (exterior: XCLW of the last override, else the
    worldspace default), metres."""
    floor: tuple | None = None
    """Interior: ``(top z metres, is kit, is a shell)`` of the nearest surface
    a ray cast down from its footprint meets within FLOOR_REACH_M (round 16:
    the candidate's mesh, never its bounds top; set by ``resolve_floors``
    after the contact pass; two-item tuples read as not a shell)."""
    tree: bool = False
    interior: bool = False
    shell: bool = False
    """The child is interior structure (a ``SHELL_CATEGORIES`` kit piece)."""
    on_water: bool = False
    """The pivot is within WATERLINE_BAND_M of a placed water surface."""
    buried: bool = False
    """Exterior, outside a water column, with no usable LAND under the pivot
    (none, or an unresolved placeholder): dropped, never classified."""
    water_column: bool = False
    """Exterior: the cell water stands above the floor at the pivot."""
    own: bool = True
    """Placed by the file that defines its base: only these vote while there
    are ANCHOR_MIN_SAMPLES of them (round 10)."""
    ref_id: int = 0
    """Resolved form id of the reference (LoadOrderIndex)."""
    placed_water_m: float | None = None
    """Top of a placed water surface over the pivot, metres (round 11)."""
    below_land: bool = False
    """Exterior, outside a water column, the pivot more than BURIED_M below
    the LAND: stands in the ground (round 14)."""


def surface_samples(mesh) -> tuple[np.ndarray, np.ndarray]:
    """Seeded surface points and their outward face normals (child frame)."""
    import trimesh
    points, faces = trimesh.sample.sample_surface(mesh, CHILD_SAMPLES, seed=0)
    return np.asarray(points), np.asarray(mesh.face_normals[faces])


def patch_class(normals: np.ndarray) -> str:
    mean = normals.mean(axis=0)
    length = float(np.linalg.norm(mean))
    if length < 1e-9:
        return "side"
    z = mean[2] / length
    return "under" if z <= -NORMAL_SPLIT else "top" if z >= NORMAL_SPLIT else "side"


def land_heights_m(heights: np.ndarray, grid, xs_units: np.ndarray, ys_units: np.ndarray) -> np.ndarray:
    """Bilinear LAND height (metres) at world x/y (units), clamped to the cell
    (``esp_index.height_at``'s formula, vectorised)."""
    step = CELL_UNITS / 32.0
    fx = np.clip((xs_units - grid[0] * CELL_UNITS) / step, 0.0, 31.999)
    fy = np.clip((ys_units - grid[1] * CELL_UNITS) / step, 0.0, 31.999)
    c0, r0 = fx.astype(int), fy.astype(int)
    tx, ty = fx - c0, fy - r0
    top = heights[r0, c0] * (1 - tx) + heights[r0, c0 + 1] * tx
    bottom = heights[r0 + 1, c0] * (1 - tx) + heights[r0 + 1, c0 + 1] * tx
    return (top * (1 - ty) + bottom * ty) / UNITS_PER_METRE


FLOOR_REACH_M = 0.3
"""Interior floor: a surface at most this far below the child's lowest point
(and at most CONTACT_M above it), found by a ray cast down from the child's
footprint through the candidate's mesh (round 16 ruling 1b), is a floor."""
FLOOR_SUPPORT_M = 0.10
"""Round 18 ruling 1: a ray-cast floor at most this far under the child's
lowest point supports it (``wickerchair01`` 0.085 m over the hut floor is
deck); CONTACT_M stays the tolerance for side and top contacts."""
TERRAIN_TOUCH_M = 0.05
"""Round 18 ruling 2: a reference whose lowest point is at most this above
the LAND under it (or below it) touches the terrain, and the terrain wins for the designed
sink even when it also overlaps (or is set into) a neighbour
(``static_supported_refs``). Round 19 ruling 2: the terrain wins for the
mounts vote too (``classify_reference``, ``terrainOverNeighbour``)."""
FOOT_BAND_M = 0.05
"""The child's footprint: its vertices within this of its lowest point."""
FOOT_RAYS = 32
"""At most this many footprint rays per candidate pose (evenly spaced)."""
INSIDE_MARGIN_M = 0.05


def is_placeholder_land(heights: np.ndarray) -> bool:
    """A LAND whose every vertex has one height carries no terrain (BM&V ships
    flat placeholders over its worldspace; the master holds the real one)."""
    return float(heights.min()) == float(heights.max())


def below_land(land: tuple | None, origin_m: np.ndarray) -> bool:
    """The pivot lies more than BURIED_M below a readable LAND (placeholders
    already resolved to the master's or dropped to None by ``collect``)."""
    return land is not None and not usable_terrain(land, origin_m)


def usable_terrain(land: tuple | None, origin_m: np.ndarray) -> bool:
    """A LAND with the pivot no more than BURIED_M below it."""
    if land is None:
        return False
    heights, grid = land
    ground = land_heights_m(heights, grid, np.array([origin_m[0] * UNITS_PER_METRE]),
                            np.array([origin_m[1] * UNITS_PER_METRE]))[0]
    return float(origin_m[2]) >= float(ground) - BURIED_M


def water_box(bounds) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    """A water record's OBND in metres; a flat plane (zero thickness) is valid."""
    if not bounds:
        return None
    low = tuple(bounds[i] / UNITS_PER_METRE for i in range(3))
    high = tuple(bounds[i + 3] / UNITS_PER_METRE for i in range(3))
    return (low, high) if all(high[i] >= low[i] for i in range(3)) else None


def water_column(land: tuple | None, flat_m: float | None, water_m: float | None,
                 origin_m: np.ndarray) -> bool:
    """Round 9: the cell water stands above the floor at the pivot. The floor
    is the LAND there, else the cell's flat placeholder height, else the
    worldspace default (``flat_m`` carries whichever of the two applies)."""
    if water_m is None:
        return False
    if land is not None:
        heights, grid = land
        floor = float(land_heights_m(heights, grid,
                                     np.array([origin_m[0] * UNITS_PER_METRE]),
                                     np.array([origin_m[1] * UNITS_PER_METRE]))[0])
    elif flat_m is not None:
        floor = flat_m
    else:
        return False
    return water_m > floor


def cell_water_planes(cell, resolve: Callable[[int], int],
                      water_bases: dict[int, tuple]) -> dict[int, tuple]:
    """``resolved ref id -> (Instance, box)`` for every placed water reference
    in the cell (its base a placed water surface in any on-disk plugin)."""
    planes = {}
    for ref in cell.refs:
        box = water_bases.get(resolve(ref.base))
        if box is None or ref.scale <= 0.0:
            continue
        x, y, z = ref.pos
        planes[resolve(ref.form_id)] = (
            Instance("water", x, y, z, math.degrees(ref.rot[2]) % 360.0, ref.scale, False),
            box)
    return planes


def placed_water_top(child: Instance, planes: Iterable) -> float | None:
    """The highest placed water surface (metres) whose footprint holds the
    child's pivot, or None."""
    top = None
    for plane, box in planes:
        _, b = relative_pose(plane, child)
        if box[0][0] <= b[0] <= box[1][0] and box[0][1] <= b[1] <= box[1][1]:
            surface_m = (plane.z / UNITS_PER_METRE) + box[1][2] * plane.scale
            top = surface_m if top is None else max(top, surface_m)
    return top


def on_placed_water(child: Instance, planes: Iterable) -> bool:
    """The child's pivot lies inside a water surface's footprint and within
    WATERLINE_BAND_M of its top."""
    for plane, box in planes:
        _, b = relative_pose(plane, child)
        if not (box[0][0] <= b[0] <= box[1][0] and box[0][1] <= b[1] <= box[1][1]):
            continue
        surface_m = (plane.z / UNITS_PER_METRE) + box[1][2] * plane.scale
        if abs(child.z / UNITS_PER_METRE - surface_m) <= WATERLINE_BAND_M:
            return True
    return False


@dataclass(slots=True)
class PluginView:
    """One plugin's base objects, its own plus its on-disk masters', keyed by
    resolved form id (the plugin's master order, then its own overrides)."""

    pool: str
    wanted: dict[int, str]
    statics: dict[int, str]
    tree_forms: set[int]
    door_forms: set[int]
    master_forms: set[int]
    """Resolved ids of the kit bases a master defines (the round 9 gain)."""


def collect(kits: dict[str, dict], vault: Path, progress: bool = False,
            plugins: list[tuple[str, Path]] | None = None,
            only: set[str] | None = None):
    """Walk every plugin: the child references with their candidate parents
    (deduplicated poses), plus which NIF each non-kit parent needs.

    Round 9: base objects resolve through each plugin's on-disk masters;
    exterior cells are merged over the whole load order (LAND, cell water and
    references: last override wins) before any contact is measured."""
    by_pool: dict[str, list[str]] = defaultdict(list)
    for asset_id in kits:
        by_pool[asset_id.partition(":")[0]].append(asset_id)
    joins = {pool: PoolJoin(ids) for pool, ids in by_pool.items()}
    boxes = {asset_id: bounds_of(asset) for asset_id, asset in kits.items()}
    cell_boxes = {asset_id: box for asset_id, box in boxes.items() if box is not None}
    children: list[ChildRef] = []
    poses: dict[tuple, tuple[np.ndarray, np.ndarray]] = {}
    static_pool: dict[str, str] = {}
    stats = {"cellsWalked": 0, "candidatePairs": 0, "borderParents": 0,
             "childRefs": 0, "childRefsDefiningFile": 0, "childRefsOtherFile": 0}
    trees: set[str] = set()
    effects = {asset_id for asset_id, asset in kits.items()
               if asset.get("category") == "effect"}
    shells = {asset_id for asset_id, asset in kits.items()
              if asset.get("category") in SHELL_CATEGORIES}

    index = LoadOrderIndex(pool_plugins(vault) if plugins is None else plugins)
    rows_in = index.rows
    # A worldspace is a vanilla city (WhiterunWorld, ...) by its DEFINING file,
    # not by whichever plugin overrides its WRLD record last.
    worlds: dict[int, tuple] = {}
    """resolved WRLD id -> (default land m, default water m, parent id,
    defined by a vanilla file)."""
    for gid, (world, parent) in index.worlds.items():
        worlds[gid] = (
            None if world.default_land is None else world.default_land / UNITS_PER_METRE,
            None if world.default_water is None else world.default_water / UNITS_PER_METRE,
            parent, index.pool_of.get(index.file_of(gid)) == "vanilla")
    water_bases: dict[int, tuple] = {}
    for bases in index.file_bases.values():
        for gid, base in bases.items():
            key = base.model_key
            box = water_box(base.bounds)
            if key and key.startswith(WATER_MODEL_PREFIX) and box is not None:
                water_bases[gid] = box
    stats["placedWaterForms"] = len(water_bases)

    views: dict[str, PluginView] = {}
    for pool, path in rows_in:
        name = path.name.casefold()
        view = PluginView(pool, {}, {}, set(), set(), set())
        for gid, (base, source) in index.visible(name).items():
            key = base.model_key
            if not key or is_marker(key):
                continue
            if base.type == "TREE":
                view.tree_forms.add(gid)
            if base.type == "DOOR":
                view.door_forms.add(gid)
            asset_id = index.kit_asset(joins, pool, source, key, name)
            if asset_id is not None:
                view.wanted[gid] = asset_id
                if source != name:
                    view.master_forms.add(gid)
                if base.type == "TREE":
                    trees.add(asset_id)
                if asset_id not in cell_boxes and obnd_box(base.bounds):
                    cell_boxes[asset_id] = obnd_box(base.bounds)
            elif base.type in STATIC_PARENT_TYPES and obnd_box(base.bounds):
                static_id = NON_KIT_PREFIX + key
                view.statics[gid] = static_id
                static_pool.setdefault(static_id, index.model_pool(source, key, index.pool_of[source]))
                cell_boxes.setdefault(static_id, obnd_box(base.bounds))
        views[name] = view
    resolver = index.resolver
    del index
    reach = parent_reach(cell_boxes)
    vanilla_shells = {static_id for static_id, pool in static_pool.items()
                      if is_vanilla_shell(static_id, pool)}
    stats["vanillaShellStatics"] = len(vanilla_shells)

    def is_shell(asset_id: str) -> bool:
        return asset_id in shells or asset_id in vanilla_shells

    def scan(rows, parents, land, water_m=None, interior=False, planes=(),
             flat_m=None):
        for child in rows:
            if (not child.unit_scale or not child.kit or child.asset_id not in cell_boxes
                    or child.asset_id in effects
                    or (only is not None and child.asset_id not in only)):
                continue
            stats["childRefs"] += 1
            stats["childRefsDefiningFile" if child.own else "childRefsOtherFile"] += 1
            links = []
            child_shell = child.asset_id in shells
            copies = interior and child_shell
            child_box = cell_boxes[child.asset_id]
            for parent in parents:
                same = parent.asset_id == child.asset_id
                if (parent is child or (same and not copies) or parent.asset_id in effects
                        or (not parent.kit
                            and parent.asset_id.startswith(NON_SUPPORT_STATIC_DIRS))):
                    continue
                box = cell_boxes.get(parent.asset_id)
                if box is None:
                    continue
                radius = (reach[parent.asset_id] * parent.scale + reach[child.asset_id]
                          + CANDIDATE_GAP_M) * UNITS_PER_METRE
                if abs(child.x - parent.x) > radius or abs(child.y - parent.y) > radius:
                    continue
                a, b = relative_pose(parent, child)
                if not box_gap_ok(a, b, cell_boxes[child.asset_id], box, parent.scale):
                    continue
                key = pose_key(child.asset_id, parent.asset_id, a, b, parent.scale)
                poses.setdefault(key, (a, b, parent.scale))
                lx, ly, lz, yaw = local_offset(parent, child)
                unit = UNITS_PER_METRE * parent.scale
                # A piece lying wholly inside the child's bounds (the candle in
                # a lantern) is carried content: never support, never a parent.
                ia, ib = relative_pose(child, parent)
                corners = np.array([[x, y, z] for x in (box[0][0], box[1][0])
                                    for y in (box[0][1], box[1][1])
                                    for z in (box[0][2], box[1][2])]) @ ia.T + ib
                inside = bool(np.all(corners >= np.array(child_box[0]) - INSIDE_MARGIN_M)
                              and np.all(corners <= np.array(child_box[1]) + INSIDE_MARGIN_M))
                links.append((key, parent.asset_id, parent.kit,
                              ((lx / unit, ly / unit, lz / unit), yaw, parent.scale),
                              parent.tree, inside, is_shell(parent.asset_id), same))
                stats["candidatePairs"] += 1
            origin = np.array([child.x, child.y, child.z]) / UNITS_PER_METRE
            wet = not interior and water_column(land, flat_m, water_m, origin)
            children.append(ChildRef(
                child.asset_id, rotation(child), origin,
                child.scale, land, links, child.door, water_m, None, child.tree,
                interior, child_shell,
                bool(planes) and on_placed_water(child, planes),
                not interior and not wet and land is None,
                wet, child.own, child.ref_id,
                placed_water_top(child, planes) if planes else None,
                not interior and not wet and below_land(land, origin)))

    # ---- pass 2: every cell merged over the load order ------------------ #
    exterior: dict[tuple[int, int, int], dict[int, Instance]] = defaultdict(dict)
    interior: dict[int, dict[int, Instance]] = defaultdict(dict)
    home: dict[int, tuple[dict, object]] = {}
    lands: dict[tuple[int, int, int], np.ndarray] = {}
    flats: dict[tuple[int, int, int], float] = {}
    waters: dict[tuple[int, int, int], float | None] = {}
    planes: dict[object, dict[int, tuple]] = defaultdict(dict)

    def place(store: dict, key, cell, view: PluginView, resolve) -> None:
        """The cell's references into the merged store: an override (same
        resolved ref id) replaces the earlier row, wherever that stood."""
        for ref in cell.refs:
            gid = resolve(ref.base)
            asset_id = view.wanted.get(gid)
            kit = asset_id is not None
            if not kit:
                asset_id = view.statics.get(gid)
            ref_id = resolve(ref.form_id)
            old = home.pop(ref_id, None)
            if old is not None:
                old[0][old[1]].pop(ref_id, None)
            if asset_id is None or ref.scale <= 0.0:
                continue
            x, y, z = ref.pos
            # ``own``: the file that created the reference defines its base.
            store[key][ref_id] = Instance(
                asset_id, x, y, z, math.degrees(ref.rot[2]) % 360.0, ref.scale, kit,
                gid in view.tree_forms, ref.rot[0], ref.rot[1], gid in view.door_forms,
                (ref_id >> 24) == (gid >> 24), ref_id)
            home[ref_id] = (store, key)

    for pool, path in rows_in:
        view = views[path.name.casefold()]
        if not view.wanted and not view.statics:
            continue
        plugin = Plugin(path)
        resolve = resolver.of(plugin)
        before = stats["cellsWalked"]
        for cell in plugin.exterior_cells(with_land=True, with_refs=True,
                                          land_layers=False):
            stats["cellsWalked"] += 1
            key3 = (resolve(cell.world), *cell.grid)
            found = cell_water_planes(cell, resolve, water_bases)
            if found:
                planes[key3].update(found)
            if cell.land is not None and cell.land.heights is not None:
                heights = np.asarray(cell.land.heights, dtype=np.float32)
                if not is_placeholder_land(heights):
                    lands[key3] = heights          # the last real override wins
                    flats.pop(key3, None)
                elif key3 not in lands:
                    # A flat placeholder never displaces real terrain, so the
                    # result does not depend on which file came first.
                    flats[key3] = float(heights[0, 0]) / UNITS_PER_METRE
                    stats["placeholderLand"] = stats.get("placeholderLand", 0) + 1
            # The last CELL override's water (XCLW, or its own worldspace
            # default); None falls back to the resolved worldspace below.
            waters[key3] = (None if cell.water_height is None
                            else cell.water_height / UNITS_PER_METRE)
            place(exterior, key3, cell, view, resolve)
        for cell in plugin.interior_cells(with_refs=True):
            stats["cellsWalked"] += 1
            key = resolve(cell.form_id)
            found = cell_water_planes(cell, resolve, water_bases)
            if found:
                planes[("interior", key)].update(found)
            place(interior, key, cell, view, resolve)
        del plugin
        if progress:
            print(f"  {path.name}: {len(view.wanted)} kit base objects "
                  f"({len(view.master_forms)} from masters), {len(view.statics)} other "
                  f"statics, {stats['cellsWalked'] - before} cells", flush=True)
    del home
    for key, by_id in interior.items():
        rows = list(by_id.values())
        if any(row.kit for row in rows):
            scan(rows, rows, None, interior=True,
                 planes=list(planes.get(("interior", key), {}).values()))
    del interior
    # A vanilla city worldspace (WhiterunWorld, ...) has no LAND of its own:
    # the engine draws its parent's (WNAM) at the same grid.
    for key3, rows in exterior.items():
        world = worlds.get(key3[0])
        if (key3 not in lands and world is not None and world[3] and world[2] is not None
                and any(row.kit for row in rows.values())
                and (world[2], *key3[1:]) in lands):
            lands[key3] = lands[(world[2], *key3[1:])]
            stats["inheritedLand"] = stats.get("inheritedLand", 0) + 1
    for (world_id, gx, gy), by_id in exterior.items():
        rows = list(by_id.values())
        if not any(row.kit for row in rows):
            continue
        border: list[Instance] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx or dy:
                    border += border_parents(
                        exterior.get((world_id, gx + dx, gy + dy), {}).values(),
                        (gx, gy), reach)
        stats["borderParents"] += len(border)
        key3 = (world_id, gx, gy)
        heights = lands.get(key3)
        world = worlds.get(world_id, (None, None, None, False))
        water_m = waters.get(key3)
        if water_m is None:
            water_m = world[1]
        flat_m = flats.get(key3, world[0]) if heights is None else None
        near_planes = [plane for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                       for plane in planes.get((world_id, gx + dx, gy + dy), {}).values()]
        scan(rows, rows + border, None if heights is None else (heights, (gx, gy)),
             water_m, planes=near_planes, flat_m=flat_m)
    stats["trees"] = sorted(trees)
    stats["distinctPoses"] = len(poses)
    return children, poses, static_pool, stats


# --------------------------------------------------------------------------- #
# meshes
# --------------------------------------------------------------------------- #
def nif_cache_path(nif_rel: str, size: int, cache: Path = MESH_CACHE) -> Path:
    digest = hashlib.sha1(f"{nif_rel.lower()}|{size}".encode()).hexdigest()[:20]
    return cache / f"{digest}.npz"


class MeshLibrary:
    """Real meshes by asset id: kit assets from the raw kit GLBs, non-kit
    statics from the NIF cache. Missing meshes are counted, never boxed."""

    def __init__(self, raw_kits: Path = RAW_KITS_DIR, cache: Path = MESH_CACHE,
                 nif_index: dict[str, Path] | None = None):
        sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
        from pipeline.mesh_ground_line import KitGeometry
        self._geometry_type = KitGeometry
        self._nodes: dict[str, tuple[Path, str]] = {}
        for path in sorted(raw_kits.glob("*.kit.json")):
            glb = path.with_name(path.name.removesuffix(".kit.json") + ".glb")
            for asset in json.loads(path.read_text()).get("assets", []):
                if isinstance(asset.get("node"), str) and glb.exists():
                    self._nodes.setdefault(asset["id"], (glb, asset["node"]))
        self._glbs: dict[Path, object] = {}
        self._nif_index = nif_index or {}
        self._args = (raw_kits, cache, self._nif_index)
        self._meshes: dict[str, object] = {}
        self.missing: Counter = Counter()

    def __reduce__(self):
        # A contact worker rebuilds the library (its own caches, sys.path).
        return (MeshLibrary, self._args)

    def __call__(self, asset_id: str):
        if asset_id in self._meshes:
            return self._meshes[asset_id]
        import trimesh
        mesh = None
        if asset_id in self._nodes:
            glb, node = self._nodes[asset_id]
            if glb not in self._glbs:
                self._glbs[glb] = self._geometry_type(glb)
            got = self._glbs[glb].triangles(node)
            if got is not None:
                mesh = trimesh.Trimesh(*got, process=False)
        elif asset_id in self._nif_index and self._nif_index[asset_id].exists():
            data = np.load(self._nif_index[asset_id])
            if len(data["faces"]):
                mesh = trimesh.Trimesh(data["vertices"], data["faces"], process=False)
        if mesh is None:
            self.missing[asset_id] += 1
        self._meshes[asset_id] = mesh
        return mesh


CONTACT_WORKERS = 5
"""Processes for the distance queries (forked; each keeps its own mesh cache)."""

_SHARED: dict = {}


def _init_worker(meshes: Callable[[str], object]) -> None:
    _SHARED["meshes"] = meshes


def _measure_task(task: tuple) -> tuple[dict, dict]:
    """A chunk's contacts and the meshes this worker could not load (ruling 4:
    counted in the worker, summed by the parent)."""
    keys, poses, floor_keys = task
    results = _measure_keys(keys, poses, floor_keys)
    return results, dict(getattr(_SHARED["meshes"], "missing", {}))


def footprint(vertices: np.ndarray) -> np.ndarray:
    """Ray origins (child frame): the child's foot-band vertices, at most
    FOOT_RAYS evenly spaced, raised CONTACT_M above its lowest point."""
    low = float(vertices[:, 2].min())
    foot = np.unique(np.round(vertices[vertices[:, 2] <= low + FOOT_BAND_M, :2], 3), axis=0)
    if len(foot) > FOOT_RAYS:
        foot = foot[np.linspace(0, len(foot) - 1, FOOT_RAYS).astype(int)]
    foot = np.vstack([foot, foot.mean(axis=0)])
    return np.column_stack([foot, np.full(len(foot), low + CONTACT_M)])


def floor_gap(origins: np.ndarray, a: np.ndarray, b: np.ndarray, parent_scale: float,
              parent_mesh) -> float | None:
    """Round 16 ruling 1b: cast a ray DOWN (the child's own -z) from each
    footprint origin through the candidate's real mesh; the metres from the
    child's lowest point down to the nearest surface met within the floor
    window (negative: that far above it), or None."""
    placed = origins @ a.T + b
    down = a @ np.array([0.0, 0.0, -1.0])
    down = down / np.linalg.norm(down)
    low, high = parent_mesh.bounds
    reach = (FLOOR_REACH_M + 2 * CONTACT_M) / parent_scale
    # The candidate's bounds only filter which rays are worth casting.
    ends = placed + down * reach
    lo, hi = np.minimum(placed, ends), np.maximum(placed, ends)
    worth = np.all((hi >= low) & (lo <= high), axis=1)
    if not worth.any():
        return None
    starts = placed[worth]
    locations, index_ray, index_tri = parent_mesh.ray.intersects_location(
        starts, np.tile(down, (len(starts), 1)), multiple_hits=False)
    if not len(locations):
        return None
    t = np.einsum("ij,j->i", locations - starts[index_ray], down) * parent_scale
    gaps = t - CONTACT_M
    # A floor faces up at the ray: a wall's underside or side face met by a
    # ray along its edge is not something to stand on.
    facing = parent_mesh.face_normals[index_tri] @ -down >= NORMAL_SPLIT
    gaps = gaps[facing & (gaps >= -CONTACT_M) & (gaps <= FLOOR_REACH_M)]
    return float(gaps.min()) if len(gaps) else None


def set_into(placed_vertices: np.ndarray, low, high, parent_scale: float,
             hit_normals: np.ndarray) -> bool:
    """Round 16 ruling 1a: the child's foot is SET INTO the parent (the
    railing through the walkway plank): its lowest point at most SET_INTO_M
    above the parent's lowest, its top above the parent's top, and the contact
    on the parent's top face (at least SET_INTO_TOP_SHARE of the contact
    points nearest an up-facing parent triangle, parent frame: a foot through
    a plank touches its top and bottom faces about equally)."""
    child_low = float(placed_vertices[:, 2].min())
    child_top = float(placed_vertices[:, 2].max())
    return bool((child_low - float(low[2])) * parent_scale <= SET_INTO_M
                and child_top > float(high[2])
                and np.mean(hit_normals[:, 2] >= NORMAL_SPLIT) >= SET_INTO_TOP_SHARE)


def _measure_keys(keys: list, poses: dict | None = None,
                  floor_keys: set | None = None) -> dict:
    from trimesh.proximity import ProximityQuery
    poses = _SHARED["poses"] if poses is None else poses
    floor_keys = _SHARED.get("floor_keys", set()) if floor_keys is None else floor_keys
    meshes = _SHARED["meshes"]
    samples: dict[str, tuple | None] = {}
    queries: dict[str, object] = {}
    results: dict[tuple, object] = {}
    for key in keys:
        child_id, parent_id = key[0], key[1]
        if child_id not in samples:
            mesh = meshes(child_id)
            if mesh is None or not len(mesh.vertices):
                samples[child_id] = None
            else:
                vertices = np.asarray(mesh.vertices)
                samples[child_id] = (*surface_samples(mesh), vertices, footprint(vertices))
        if parent_id not in queries:
            mesh = meshes(parent_id)
            queries[parent_id] = None if mesh is None else (ProximityQuery(mesh), mesh.bounds,
                                                            mesh)
        if samples[child_id] is None or queries[parent_id] is None:
            results[key] = None
            continue
        points, normals, vertices, origins = samples[child_id]
        a, b, parent_scale = poses[key]
        query, (low, high), parent_mesh = queries[parent_id]
        if key in floor_keys:
            gap = floor_gap(origins, a, b, parent_scale, parent_mesh)
            if gap is not None:
                results[("floor", key)] = gap
        placed = points @ a.T + b
        slack = CONTACT_M / parent_scale      # the parent's unscaled frame
        near = np.all((placed >= low - slack) & (placed <= high + slack), axis=1)
        if not near.any():
            results[key] = None
            continue
        _, distance, triangles = query.on_surface(placed[near])
        close = distance * parent_scale <= CONTACT_M
        hit = np.zeros(len(points), dtype=bool)
        hit[np.flatnonzero(near)[close]] = True
        if not hit.any():
            results[key] = None
            continue
        kind = patch = patch_class(normals[hit])
        if kind != "under" and set_into(vertices @ a.T + b, low, high, parent_scale,
                                        parent_mesh.face_normals[triangles[close]]):
            # Round 16 ruling 1a: support from below, whatever the patch reads.
            kind = "set-into"
        elif kind == "top":
            # Round 15 ruling 1: the parent must reach below the contact (the
            # child hangs from it); a piece lying ON the child's top rests on it.
            contact_z = float(np.median(placed[hit][:, 2]))
            if (contact_z - float(low[2])) * parent_scale <= HANGS_BELOW_M:
                kind = "rests-on"
        # (class, contact points, the patch's own normal class: diagnostics)
        results[key] = (kind, int(hit.sum()), patch)
    return results


def measure_contacts(children: list[ChildRef], poses: dict,
                     meshes: Callable[[str], object],
                     workers: int = CONTACT_WORKERS,
                     floor_keys: set | None = None) -> dict[tuple, object]:
    """Per distinct pose: ``(class, contact points, normal class)`` or None
    (the class is the normal class unless set-into or rests-on); and, for
    an interior child's candidate (``floor_keys``), ``("floor", key)`` -> the
    ray-cast floor gap (``floor_gap``). Keys are grouped by parent so each
    worker loads a parent mesh once."""
    floor_keys = floor_keys or set()
    keys = sorted(poses, key=lambda k: (k[1], k[0]))
    _SHARED.update(poses=poses, meshes=meshes, floor_keys=floor_keys)
    if workers <= 1 or len(keys) < 2000:
        return _measure_keys(keys)
    import multiprocessing
    by_parent: dict[str, list] = defaultdict(list)
    for key in keys:
        by_parent[key[1]].append(key)
    chunks: list[list] = [[] for _ in range(workers * 24)]
    for index, group_keys in enumerate(sorted(by_parent.values(), key=len, reverse=True)):
        min(chunks, key=len).extend(group_keys)
    results: dict = {}
    # Workers start from a forkserver (not a fork of this process: touching the
    # parent's million-row heap copied it into every worker) and take one chunk
    # each, its poses sent with it, so a worker's mesh and proximity caches die
    # with the chunk (16h round 10: the whole-catalogue run reached 10 GiB).
    tasks = [(chunk, {key: poses[key] for key in chunk},
              {key for key in chunk if key in floor_keys}) for chunk in chunks if chunk]
    context = multiprocessing.get_context("forkserver")
    with context.Pool(workers, initializer=_init_worker, initargs=(meshes,),
                      maxtasksperchild=1) as pool:
        missing: Counter = Counter()
        for part, part_missing in pool.imap_unordered(_measure_task, tasks):
            results.update(part)
            missing.update(part_missing)
    if hasattr(meshes, "missing"):
        # The parent's library loaded none of these: every miss is a worker's.
        meshes.missing.update(missing)
    return results


def floor_candidate_keys(children: list[ChildRef]) -> set:
    """Pose keys whose parent may be an interior child's floor: every
    candidate of an interior child but trees and copies of itself."""
    return {link[0] for child in children if child.interior
            for link in child.links if not link[4] and not link[7]}


def resolve_floors(children: list[ChildRef], contacts: dict,
                   meshes: Callable[[str], object]) -> None:
    """Set each interior child's ``floor`` from the ray-cast gaps: the nearest
    surface under its footprint, as ``(top z metres, is kit, is a shell)``."""
    lows: dict[str, np.ndarray | None] = {}
    for child in children:
        if not child.interior:
            continue
        best = None
        for key, _parent, kit, _row, tree, _inside, shell, same in child.links:
            if child.shell and kit and not shell:
                continue            # round 17 ruling 1: clutter never floors a shell
            gap = None if tree or same else contacts.get(("floor", key))
            if gap is not None and (best is None or gap < best[0]):
                best = (gap, kit, shell)
        if best is None:
            continue
        if child.asset_id not in lows:
            mesh = meshes(child.asset_id)
            lows[child.asset_id] = None if mesh is None else np.asarray(mesh.vertices)
        vertices = lows[child.asset_id]
        if vertices is None or not len(vertices):
            continue
        world_low = float((vertices @ (child.rotation * child.scale).T + child.origin_m)[:, 2].min())
        child.floor = (world_low - best[0], best[1], best[2])


def support_from_below(child: ChildRef, vertices: np.ndarray | None) -> str | None:
    """``ground`` / ``deck`` when the piece stands on the terrain or (indoors)
    the floor: its lowest vertex at or below LAND + CONTACT_M, or within
    FLOOR_SUPPORT_M of the ray-cast floor under it (round 18); ``water`` when every terrain
    contact lies on SUBMERGED ground (below the cell or placed water surface,
    round 11: a stem on the lake bed stands in the water); else None."""
    if vertices is None or not len(vertices):
        return None
    world = vertices @ (child.rotation * child.scale).T + child.origin_m
    if child.land is not None:
        heights, grid = child.land
        ground = land_heights_m(heights, grid, world[:, 0] * UNITS_PER_METRE,
                                world[:, 1] * UNITS_PER_METRE)
        touching = world[:, 2] <= ground + CONTACT_M
        if np.any(touching):
            surfaces = [w for w in (child.water_m, child.placed_water_m) if w is not None]
            if surfaces and np.all(ground[touching] < max(surfaces)):
                return "water"
            return "ground"
    if child.floor is not None and float(world[:, 2].min()) <= child.floor[0] + FLOOR_SUPPORT_M:
        return "deck" if child.floor[1] else "ground"
    return None




def contact_patches(child: ChildRef, contacts: dict) -> tuple[list, list, list]:
    """``(patches, carried parent ids, copy patches)`` of a reference; a patch
    is ``(kind, points, parent, parent is kit, offset row, parent is a tree,
    parent is a shell)``, kind under/top/side (a tree crown is always top)."""
    patches, carried, copies = [], [], []
    for (key, parent_id, parent_kit, offset, parent_tree, inside, parent_shell,
         same) in child.links:
        found = contacts.get(key)
        if found is None:
            continue
        if inside:
            carried.append(parent_id)
            continue
        # A tree crown is never stood on: whatever touches it hangs from it.
        kind = "top" if parent_tree else found[0]
        patch = (kind, found[1], parent_id, parent_kit, offset, parent_tree, parent_shell)
        # A copy of the child is evidence only for the interior-zero test.
        (copies if same else patches).append(patch)
    return patches, carried, copies


SUPPORT_KINDS = ("under", "set-into")
"""Contact kinds that are support from below (round 16 ruling 1a)."""


def supports(child: ChildRef, patch: tuple) -> bool:
    """The patch holds the child up: support from below, except kit clutter
    (a kit piece that is not a shell) under a shell (round 17 ruling 1: the
    hut shell set into its hay)."""
    return patch[0] in SUPPORT_KINDS and not (child.shell and patch[3] and not patch[6])


def on_a_mesh(child: ChildRef, contacts: dict) -> bool:
    """Mesh contact from below on a static or kit piece (the sink miner drops
    such a reference from the terrain statistic, 16h round 10)."""
    return any(supports(child, patch) for patch in contact_patches(child, contacts)[0])


def classify_reference(child: ChildRef, contacts: dict,
                       vertices: np.ndarray | None) -> tuple[str, list, list, str | None]:
    """``(class, [(parent, offset row)] it is mounted by, [abutted parents],
    hangingFrom)``. Classes: ground (supported), free (no contact), deck,
    wall, hanging, water."""
    patches, carried, copies = contact_patches(child, contacts)
    if child.door:
        # A door hangs in its frame (0064/M5 rule): its kit contacts are the frame.
        # The frame may be a non-kit static (then no pair, still hanging).
        frame = [p for p in patches if p[0] not in SUPPORT_KINDS] or patches
        if frame:
            return ("hanging", [(p[2], p[4]) for p in frame if p[3]],
                    sorted({p[2] for p in patches if p not in frame} | set(carried)), "frame")
        # Round 16 ruling 2: no frame contact at all; the door rule's class
        # comes through the category row, never ``free``.
        return CATEGORY_REF_CLASS["door"], [], sorted(set(carried)), "category"
    if child.on_water:
        # Floating on a placed water surface, whatever its stems touch (round 7 b).
        return "water", [], sorted({p[2] for p in patches} | set(carried)), None
    if child.below_land:
        # Round 14: a pivot more than BURIED_M under the LAND stands in the ground.
        return "ground", [], sorted({p[2] for p in patches} | set(carried)), "buried"
    # Round 10: contacts decide first, in a water column or not.
    under = [p for p in patches if supports(child, p)]
    support = support_from_below(child, vertices)
    # Structure contacts: kit clutter on a shell (a sconce on a wall) is ignored.
    # A shell is a kit shell or a vanilla dungeon-kit static (round 14).
    structural = [p for p in patches + copies if not (p[3] and not p[6])]
    floor_shell = (child.floor is not None and len(child.floor) > 2
                   and bool(child.floor[2]))
    if (child.interior and child.shell and (support != "ground" or floor_shell)
            and structural and all(p[6] for p in structural)):
        # Interior structure (round 7 rule a): a shell held only by other kit
        # shells (copies of itself included) stands on the shell datum.
        return "ground", [], sorted({p[2] for p in patches} | set(carried)), "interior-zero"
    # Round 13: a shell standing ON another kit shell (its support from below)
    # is structure on the shell datum too, whatever else it touches
    # (imphall4way01 voted deck 14 / ground 12); a non-shell piece on a shell
    # stays deck.
    under_all = under + [p for p in copies if supports(child, p)]
    shell_floor = support is None or (support in ("deck", "ground") and floor_shell)
    if (child.interior and child.shell and shell_floor
            and (under_all or support in ("deck", "ground"))
            and all(p[6] for p in under_all)):
        return "ground", [], sorted({p[2] for p in patches if p not in under}
                                    | set(carried)), "interior-zero"
    if under and touches_terrain(child, vertices):
        # Round 19 ruling 2 (terrain wins, as for the designed sink): a piece
        # whose lowest point touches the LAND stands on the terrain even when
        # its foot is also set into (or on) a neighbour; the neighbour is an
        # abut. Submerged terrain stays water (round 11).
        return ("water" if support == "water" else "ground"), [], sorted(
            {p[2] for p in patches} | set(carried)), "terrain"
    if under or support in ("ground", "deck"):
        anchor = "deck" if (any(p[3] for p in under) or support == "deck") else "ground"
        return anchor, [], sorted({p[2] for p in patches if p not in under}
                                  | set(carried)), None
    if support == "water":
        # Round 11: standing on submerged terrain is standing in the water.
        return "water", [], sorted({p[2] for p in patches} | set(carried)), None
    side = [p for p in patches if p[0] == "side"]
    top = [p for p in patches if p[0] == "top"]
    # Round 15 ruling 1: a piece lying ON the child's top is a neighbour; so is
    # kit clutter a shell is set into or stands on (round 17 ruling 1).
    resting = [p for p in patches if p[0] == "rests-on"]
    clutter = [p for p in patches if p[0] in SUPPORT_KINDS and p not in under]
    if not side and not top:
        # No holding contact: the water column holds it up, at any depth.
        source = "rests-on" if resting else "column" if child.water_column else None
        return (("water" if child.water_column else "free"), [],
                sorted({p[2] for p in resting + clutter} | set(carried)), source)
    # Round 16 ruling 1c: a top contact makes the child hanging only with no
    # support from below (above) and no side contact at all.
    use_side = bool(side)
    chosen = side if use_side else top
    others = (top if use_side else side) + resting + clutter
    mounts = [(p[2], p[4]) for p in chosen if p[3]]
    source = None if use_side else ("crown" if any(p[5] for p in chosen) else "arm")
    return (("wall" if use_side else "hanging"), mounts,
            sorted({p[2] for p in others} | set(carried)), source)


# --------------------------------------------------------------------------- #
# anchor class
# --------------------------------------------------------------------------- #
def load_sink_record(path: Path = SINK_RECORD) -> dict[str, dict]:
    try:
        document = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return document.get("assets", {}) if document.get("schemaVersion") == 1 else {}


def is_water(sink: dict) -> bool:
    waterline = sink.get("waterline")
    ground_iqr = sink.get("iqrM") if sink.get("evidence") == "plugin" else None
    return (isinstance(waterline, dict) and waterline.get("n", 0) >= ANCHOR_MIN_SAMPLES
            and waterline.get("iqrM", 1e9) < 0.5
            and (ground_iqr is None or ground_iqr > 1.0))


POLICY_ANCHOR = {"water-zero": "water", "deck": "deck"}
"""Placement-policy row -> anchor class for the thin-after-drop fallback and an
ambiguous vote; any other policy (direct, plinth, pad, stilt, dug-in, ...)
grounds the piece. ``deck`` (round 13): a piece that rests on a host by design
(the Telvanni treehouse connector on its tree)."""


def policy_anchor_class(asset_id: str, kit_id: str | None,
                        inventory: dict | None = None) -> str:
    """The anchor class the asset's placement-policy row implies (asset row
    first, then its kit's), ground where it has none."""
    if inventory is None:
        sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
        from pipeline.placement_metadata import load_inventory
        inventory = load_inventory()
    key = asset_id.strip().replace("\\", "/").casefold()
    policy = inventory.get("assetPolicies", {}).get(key) or \
        inventory.get("kitPolicies", {}).get(kit_id or "")
    return POLICY_ANCHOR.get(policy, "ground")


AMBIGUOUS_SHARE = 0.6
"""A vote whose winning class holds less than this share is ambiguous."""


def is_ambiguous(fields: dict) -> bool:
    """The ONE definition (round 12): 1 <= n < 3, or the winning share < 0.6."""
    n = fields.get("n", 0)
    return 1 <= n < ANCHOR_MIN_SAMPLES or (n >= ANCHOR_MIN_SAMPLES
                                           and fields.get("share", 1.0) < AMBIGUOUS_SHARE)


def policy_rows(asset_id: str, kit_id: str | None,
                inventory: dict) -> tuple[str | None, str | None]:
    """``(asset row, kit row)`` policy ids of an asset (either may be None)."""
    key = asset_id.strip().replace("\\", "/").casefold()
    return (inventory.get("assetPolicies", {}).get(key),
            inventory.get("kitPolicies", {}).get(kit_id or ""))


def placement_row(asset_id: str, inventory: dict) -> dict:
    """The asset's ``assetPlacement`` row (planner ruling 2026-09-24), or {}."""
    key = asset_id.strip().replace("\\", "/").casefold()
    return inventory.get("assetPlacement", {}).get(key, {})


def apply_placement_row(anchor_class: str, evidence: str, fields: dict,
                        row: dict, sink_row: dict | None = None) -> tuple[str, str]:
    """Round 20: a reviewed ``assetPlacement`` row decides ahead of the vote and
    every other policy, as the manifest writer applies it
    (``placement_metadata.apply_placement_metadata``): its ``anchorClass``
    (``anchorClassEvidence`` and ``evidence`` policy, ``votedClass`` the vote)
    and, on a water class, the waterline the writer takes from the row: its
    ``designedWaterlineM``, else its deck line (the sink record's deck-top
    tell less ``deckClearanceM``, ``placement_metadata.deck_support_line``).
    Mutates ``fields``; returns ``(anchorClass, anchorClassEvidence)``."""
    if "anchorClass" not in row:
        return anchor_class, evidence
    fields.update(votedClass=anchor_class, evidence="policy")
    if row["anchorClass"] == "water":
        tell = (sink_row or {}).get("groundLineTell") or {}
        level = (row["designedWaterlineM"] if "designedWaterlineM" in row
                 else float(tell["deckTopM"]) - float(row["deckClearanceM"])
                 if "deckClearanceM" in row and isinstance(tell.get("deckTopM"), (int, float))
                 else None)
        if level is not None:
            fields["waterline"] = {"p50": round(float(level), 4), "n": 0,
                                   "evidence": "policy", "policyId": "assetPlacement"}
    return row["anchorClass"], "policy"


def policy_override(anchor_class: str, fields: dict, asset_policy: str | None,
                    kit_policy: str | None) -> str | None:
    """Round 17 ruling 2, policy rows decide: an ASSET row naming a class
    (``POLICY_ANCHOR``) decides whatever the vote share; with no asset row, a
    KIT row naming a class decides an ambiguous vote (``is_ambiguous``);
    otherwise None (the vote stands). Returns the class only when it differs."""
    if asset_policy is not None:
        imposed = POLICY_ANCHOR.get(asset_policy)
    elif is_ambiguous(fields):
        imposed = POLICY_ANCHOR.get(kit_policy)
    else:
        imposed = None
    return imposed if imposed is not None and imposed != anchor_class else None


def water_column_waterline(levels: list[float], asset_policy: str | None,
                           kit_policy: str | None, inventory: dict) -> dict | None:
    """Round 17 ruling 3: the waterline row of a water-class asset the sink
    record has none for: cell water minus pivot over the defining file's
    water-column references, median, when n >= 3 (``column``); else the
    resolved policy row's fallbackWaterlineM (asset row, else kit row;
    ``policy``; round 18 ruling 3: never the row's ground sink). A row
    with no fallbackWaterlineM gives no waterline."""
    if len(levels) >= ANCHOR_MIN_SAMPLES:
        return {"p50": round(median(levels), 4), "n": len(levels),
                "iqrM": round(quartile_range(levels), 4), "evidence": "column"}
    policy_id = asset_policy or kit_policy
    policy = inventory.get("policies", {}).get(policy_id or "")
    if policy is None or "fallbackWaterlineM" not in policy:
        return None
    return {"p50": round(float(policy["fallbackWaterlineM"]), 4), "n": len(levels),
            "evidence": "policy", "policyId": policy_id}


def classify_anchor(ref_classes: list[str], sink: dict,
                    abuts: Counter | None = None,
                    hanging_from: Counter | None = None,
                    dropped: int = 0,
                    policy_class: str = "ground") -> tuple[str, str, dict]:
    """``(anchorClass, evidence, fields)`` under the rule in this docstring.
    ``free`` references (no contact) count as ground; a tie between ground and
    wall/hanging goes to wall/hanging only when no reference is supported.
    ``dropped`` no-LAND references leaving n < 3 take the fallback."""
    n = len(ref_classes)
    thin_after_drop = dropped > 0 and n < ANCHOR_MIN_SAMPLES
    extra = {"droppedNoLand": dropped} if dropped else {}
    if is_water(sink):
        fields = {"n": sink["waterline"]["n"], **extra}
        if thin_after_drop:
            fields["evidence"] = "sink-waterline"
        return "water", "plugin", fields
    raw = Counter(ref_classes)
    if thin_after_drop:
        fields = {"n": n, **extra, "evidence": "policy"}
        if n:
            fields["refClasses"] = dict(sorted(raw.items()))
        return policy_class, "plugin", fields
    if not n:
        return "ground", "unplaced", {"n": 0}
    tally = Counter("ground" if c == "free" else c for c in ref_classes)
    supported = raw.get("ground", 0) + raw.get("deck", 0)
    fields: dict = {"n": n, **extra, "refClasses": dict(sorted(raw.items()))}
    if abuts:
        fields["abuts"] = dict(abuts.most_common(ABUTS_KEPT))
    if n < ANCHOR_MIN_SAMPLES:
        anchor = next(iter(tally)) if len(tally) == 1 else "ground"
        fields.update(share=round(tally[anchor] / n, 3), evidence="thin")
    else:
        # Round 20 fix (a), support from below wins (0085): ground (with
        # free) and deck vote as ONE support class against wall, hanging,
        # water and fx; the pool then splits ground vs deck (a tie is ground).
        pooled = Counter({c: k for c, k in tally.items() if c not in SUPPORT_CLASSES})
        pool = sum(tally[c] for c in SUPPORT_CLASSES)
        if pool:
            pooled["support"] = pool
        best = max(pooled.values())
        leaders = sorted(c for c, k in pooled.items() if k == best)
        mounted = [c for c in leaders if c in MOUNTED_CLASSES]
        if len(leaders) > 1 and "support" in leaders:
            anchor = mounted[0] if (mounted and not supported) else "support"
        else:
            anchor = leaders[0]
        if anchor == "support":
            anchor = "deck" if tally["deck"] > tally["ground"] else "ground"
        fields["share"] = round(best / n, 3)
    by_class = Counter({source: k for (cls, source), k in (hanging_from or {}).items()
                        if cls == anchor})
    if anchor == "hanging" and by_class:
        fields["hangingFrom"] = by_class.most_common(1)[0][0]
    if anchor == "ground" and by_class.get("interior-zero", 0) * 2 > tally["ground"]:
        fields["support"] = "interior-zero"
    buried = sum(k for (cls, source), k in (hanging_from or {}).items()
                 if source == "buried")
    if buried:
        fields["buriedGround"] = buried
    terrain = sum(k for (cls, source), k in (hanging_from or {}).items()
                  if source == "terrain")
    if terrain:
        fields["terrainOverNeighbour"] = terrain
    resting = sum(k for (cls, source), k in (hanging_from or {}).items()
                  if source == "rests-on")
    if resting:
        fields["restsOnOnly"] = resting
    return anchor, "plugin", fields


def is_mount_parent(anchor: dict) -> bool:
    return anchor.get("anchorClass") in ("ground", "deck")


def validate_anchors(anchors: dict[str, dict]) -> list[str]:
    findings: list[str] = []
    for asset_id, anchor in sorted(anchors.items()):
        anchor_class = anchor.get("anchorClass")
        if anchor_class not in ANCHOR_CLASSES:
            findings.append(f"{asset_id}: unknown anchorClass {anchor_class!r}")
        # Every evidence string is from placement_metadata.EVIDENCE_VOCABULARY.
        if anchor.get("anchorClassEvidence") not in ANCHOR_EVIDENCE:
            findings.append(f"{asset_id}: anchorClassEvidence must be one of "
                            f"{sorted(ANCHOR_EVIDENCE)}")
        if "evidence" in anchor and anchor["evidence"] not in ANCHOR_ROW_EVIDENCE:
            findings.append(f"{asset_id}: evidence {anchor['evidence']!r} not in the vocabulary")
        for key in ("hangingFrom", "support"):
            if key in anchor and anchor[key] not in REFERENCE_SOURCES:
                findings.append(f"{asset_id}: {key} {anchor[key]!r} not in the vocabulary")
        waterline = anchor.get("waterline")
        if waterline is not None and (anchor_class != "water"
                                      or waterline.get("evidence") not in WATERLINE_EVIDENCE):
            findings.append(f"{asset_id}: waterline row needs anchorClass water and "
                            f"evidence from {sorted(WATERLINE_EVIDENCE)}")
        if anchor_class in ("wall", "hanging", "deck") and \
                anchor.get("evidence") != "policy" and \
                anchor.get("refClasses", {}).get(anchor_class, 0) == 0:
            findings.append(f"{asset_id}: {anchor_class} with no reference in contact")
    return findings


def validate_mount_shapes(pairs: list[dict], anchors: dict[str, dict]) -> list[str]:
    findings: list[str] = []
    for pair in pairs:
        child, parent = pair.get("child", "?"), pair.get("parent", "?")
        if anchors.get(child, {}).get("anchorClass") not in MOUNTED_CLASSES:
            findings.append(f"{child}: a mount child must be wall or hanging")
        if not is_mount_parent(anchors.get(parent, {})):
            findings.append(f"{child}: mount parent {parent} is not ground or deck")
    return findings


def build_document(kits: dict[str, dict], vault: Path, progress: bool = False,
                   sink: dict[str, dict] | None = None,
                   plugins: list[tuple[str, Path]] | None = None,
                   meshes: Callable[[str], object] | None = None,
                   only: set[str] | None = None,
                   sample_max: int | None = None, sample_seed: int = 0,
                   jobs: int = CONTACT_WORKERS) -> dict:
    """The mounts record; ``only`` mines just those child assets (the golden
    and held-out batches) and records only their anchors; ``sample_max`` keeps
    at most that many references per asset (seeded) so a barrel does not pull
    thousands of parent meshes."""
    children, poses, contacts, meshes, stats = mine_contacts(
        kits, vault, progress=progress, plugins=plugins, meshes=meshes, only=only,
        sample_max=sample_max, sample_seed=sample_seed, jobs=jobs)
    return classify_document(kits, children, contacts, meshes, stats, sink, only)


def mine_contacts(kits: dict[str, dict], vault: Path, progress: bool = False,
                  plugins: list[tuple[str, Path]] | None = None,
                  meshes: Callable[[str], object] | None = None,
                  only: set[str] | None = None, sample_max: int | None = None,
                  sample_seed: int = 0, jobs: int = CONTACT_WORKERS,
                  keep: Callable[[ChildRef], bool] | None = None):
    """``(children, poses, contacts, meshes, stats)``: every (kept) kit
    reference with its measured contacts. Shared by the mounts record and the
    designed sink miner (16h round 10)."""
    children, poses, static_pool, stats = collect(kits, vault, progress=progress,
                                                  plugins=plugins, only=only)
    if keep is not None:
        children = [child for child in children if keep(child)]
        used = {link[0] for child in children for link in child.links}
        poses = {key: pose for key, pose in poses.items() if key in used}
        stats["distinctPoses"] = len(poses)
    if sample_max is not None:
        import random
        by_asset: dict[str, list[ChildRef]] = defaultdict(list)
        for child in children:
            by_asset[child.asset_id].append(child)
        children = []
        for asset_id in sorted(by_asset):
            # Round 11: the defining file's references first, others only to fill.
            # Round 15: a seed per asset, so a batch does not depend on which
            # other assets are in the run.
            rng = random.Random(f"{sample_seed}:{asset_id}")
            own = [child for child in by_asset[asset_id] if child.own]
            others = [child for child in by_asset[asset_id] if not child.own]
            if len(own) >= sample_max:
                children += rng.sample(own, sample_max)
            else:
                children += own + rng.sample(others, min(len(others), sample_max - len(own)))
        used = {link[0] for child in children for link in child.links}
        poses = {key: pose for key, pose in poses.items() if key in used}
        stats["distinctPoses"] = len(poses)
    if meshes is None:
        # The NIF cache is filled on demand: only the parents these candidates need.
        cached = nif_index()
        needed = {key[1] for key in poses
                  if key[1].startswith(NON_KIT_PREFIX) and key[1] not in cached}
        if needed:
            print(f"  dumping {len(needed)} parent meshes", flush=True)
            print("  ", dump_meshes({s: static_pool[s] for s in needed}, vault), flush=True)
        meshes = MeshLibrary(nif_index=nif_index())
    contacts = measure_contacts(children, poses, meshes, workers=jobs,
                                floor_keys=floor_candidate_keys(children))
    resolve_floors(children, contacts, meshes)
    return children, poses, contacts, meshes, stats


def touches_terrain(child: ChildRef, vertices: np.ndarray | None) -> bool:
    """Round 18 ruling 2: the placed mesh's lowest point (its vertices within
    FOOT_BAND_M of the lowest) at most TERRAIN_TOUCH_M above the LAND under
    it, or below it. A higher vertex meeting a slope does not count."""
    if child.land is None or vertices is None or not len(vertices):
        return False
    world = vertices @ (child.rotation * child.scale).T + child.origin_m
    world = world[world[:, 2] <= float(world[:, 2].min()) + FOOT_BAND_M]
    heights, grid = child.land
    ground = land_heights_m(heights, grid, world[:, 0] * UNITS_PER_METRE,
                            world[:, 1] * UNITS_PER_METRE)
    return bool(np.any(world[:, 2] <= ground + TERRAIN_TOUCH_M))


def static_supported_refs(kits: dict[str, dict], vault: Path, **options) -> set[int]:
    """Resolved ids of the exterior kit references standing on a static or kit
    mesh (contact from below) and clear of the terrain, which the designed
    sink must not read against the heightmap (16h round 10; round 18 ruling
    2: a reference touching the LAND is terrain-supported whatever else it
    overlaps)."""
    children, _poses, contacts, meshes, _stats = mine_contacts(
        kits, vault, keep=lambda child: not child.interior and child.links, **options)
    vertices: dict[str, np.ndarray | None] = {}
    supported: set[int] = set()
    for child in children:
        if not on_a_mesh(child, contacts):
            continue
        if child.asset_id not in vertices:
            mesh = meshes(child.asset_id)
            vertices[child.asset_id] = None if mesh is None else np.asarray(mesh.vertices)
        if not touches_terrain(child, vertices[child.asset_id]):
            supported.add(child.ref_id)
    return supported


def classify_document(kits: dict[str, dict], children: list[ChildRef], contacts: dict,
                      meshes: Callable[[str], object], stats: dict,
                      sink: dict[str, dict] | None, only: set[str] | None) -> dict:
    """Classes, the vote and the pairs over measured references."""
    sink = load_sink_record() if sink is None else sink
    ref_classes: dict[str, list[str]] = defaultdict(list)
    abuts: dict[str, Counter] = defaultdict(Counter)
    mounted: dict[str, list[tuple[str, tuple]]] = defaultdict(list)
    hanging_from: dict[str, Counter] = defaultdict(Counter)
    vertex_cache: dict[str, object] = {}
    dropped: Counter = Counter()
    water_column = Counter()
    # Round 10 vote: the file that defines the base decides with its own
    # usable references; other files' references vote only while it has fewer
    # than ANCHOR_MIN_SAMPLES. Pairs are collected from every file.
    own_usable = Counter(child.asset_id for child in children
                         if child.own and not child.buried)
    outvoted: Counter = Counter()
    column_levels: dict[str, list[float]] = defaultdict(list)
    for child in children:
        if child.buried:
            # No LAND under the pivot: not evidence, never classified.
            dropped[child.asset_id] += 1
            continue
        if child.asset_id not in vertex_cache:
            mesh = meshes(child.asset_id)
            vertex_cache[child.asset_id] = None if mesh is None else np.asarray(mesh.vertices)
        anchor, mounts, abutted, source = classify_reference(
            child, contacts, vertex_cache[child.asset_id])
        if child.water_column:
            water_column[anchor] += 1
            if child.own and child.water_m is not None:
                # Round 17 ruling 3: cell water minus pivot (the sink's sign).
                column_levels[child.asset_id].append(child.water_m - float(child.origin_m[2]))
        mounted[child.asset_id] += [(anchor, parent, row) for parent, row in mounts]
        if not child.own and own_usable[child.asset_id] >= ANCHOR_MIN_SAMPLES:
            outvoted[child.asset_id] += 1
            continue
        ref_classes[child.asset_id].append(anchor)
        abuts[child.asset_id].update(abutted)
        if source:
            hanging_from[child.asset_id][(anchor, source)] += 1
    anchors: dict[str, dict] = {}
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
    from pipeline.placement_metadata import load_inventory
    inventory = load_inventory()
    for asset_id in sorted(kits if only is None else only & set(kits)):
        if kits[asset_id].get("category") == "effect":
            # Effects are placed by their own system (0064), never by contact.
            anchors[asset_id] = {"anchorClass": "fx", "anchorClassEvidence": "category",
                                 "n": 0}
            continue
        policy_class = policy_anchor_class(asset_id, kits[asset_id].get("kit"), inventory)
        asset_policy, kit_policy = policy_rows(asset_id, kits[asset_id].get("kit"), inventory)
        anchor_class, evidence, fields = classify_anchor(
            ref_classes.get(asset_id, []), sink.get(asset_id, {}), abuts.get(asset_id),
            hanging_from.get(asset_id), dropped[asset_id], policy_class)
        imposed = (policy_override(anchor_class, fields, asset_policy, kit_policy)
                   if evidence == "plugin" and fields.get("evidence", "thin") == "thin"
                   else None)
        if imposed is not None:
            # Round 17 ruling 2 (was round 12, ambiguous votes only): policy rows decide.
            fields.update(votedClass=anchor_class, evidence="policy")
            anchor_class = imposed
        elif (evidence == "plugin" and fields.get("evidence") == "thin"
                and anchor_class == "water" and policy_class != "water"
                and hanging_from.get(asset_id, Counter())[("water", "column")]
                == fields["n"]):
            # Round 15 ruling 2: a thin water vote from references with no
            # contact and no mined waterline (is_water failed above) is
            # ambiguous by definition and takes its policy row (asset row,
            # else the kit row, else ground).
            fields.update(votedClass=anchor_class, evidence="policy")
            anchor_class = policy_class
        placement = placement_row(asset_id, inventory)
        anchor_class, evidence = apply_placement_row(anchor_class, evidence, fields,
                                                     placement, sink.get(asset_id))
        if outvoted[asset_id]:
            fields["otherFileRefsNotVoting"] = outvoted[asset_id]
        sink_waterline = (sink.get(asset_id, {}).get("waterline") or {}).get("p50")
        if (anchor_class == "water" and "waterline" not in fields
                and not isinstance(sink_waterline, (int, float))):
            waterline = water_column_waterline(column_levels.get(asset_id, []),
                                               asset_policy, kit_policy, inventory)
            if waterline is not None:
                fields["waterline"] = waterline
        anchors[asset_id] = {"anchorClass": anchor_class,
                             "anchorClassEvidence": evidence, **fields}
    samples: dict[tuple[str, str], list] = defaultdict(list)
    for child, rows in mounted.items():
        child_class = anchors[child]["anchorClass"]
        # A parent outside an ``only`` batch has no anchor row: count it by
        # the full record's class when there is one.
        for ref_class, parent, row in rows:
            parent_ok = (is_mount_parent(anchors[parent]) if parent in anchors
                         else only is not None)
            if ref_class == child_class and parent_ok:
                samples[(child, parent)].append(row)
    pairs = summarise(samples, kits)
    findings = validate_pairs(pairs) + validate_anchors(anchors)
    if only is None:
        findings += validate_mount_shapes(pairs, anchors)
    if findings:
        raise ValueError("mined mounts break the contract: " + "; ".join(findings[:20]))
    tally = Counter(anchor["anchorClass"] for anchor in anchors.values())
    fallbacks = Counter(anchor["evidence"] for anchor in anchors.values()
                        if anchor.get("evidence") in ("sink-waterline", "policy"))
    waterlines = Counter(anchor["waterline"]["evidence"] for anchor in anchors.values()
                         if "waterline" in anchor)
    kinds = Counter(pair["kind"] for pair in pairs)
    missing = getattr(meshes, "missing", Counter())
    return {
        "schemaVersion": 3,
        "shapes": "A pair is one (child, parent) of one kind, offsets in the "
                  "parent's unscaled local z-up frame (x, y horizontal, z up; "
                  "parent yaw removed, origin at its pivot). band: n >= 3 and the "
                  "IQR of out and of up both < 0.3 m, where along is the parent's "
                  "longer horizontal bounds axis (alongAxis) and out the other; "
                  "records outM, upM (medians), alongMinM..alongMaxM (observed), "
                  "yawDeg (median relative yaw). points: otherwise; the distinct "
                  "offsets clustered within 0.3 m, each {offsetM, n, yawDeg}, most "
                  "frequent first. Both carry offsetM + yawDeg.",
        "source": "vanilla Skyrim.esm plus every source-mod plugin named by "
                  "worldgen.asset_registry.POOLS (exterior and interior cells)",
        "method": "Real mesh-to-mesh contact per placed unit-scale kit reference: "
                  "candidates are STAT/TREE refs (this cell and the 8 neighbours) "
                  "whose bounds come within 0.5 m; both meshes placed with the "
                  "recorded position, rotation and scale (kit GLB, else the vault "
                  "NIF via the mesh cache); 300 seeded child surface samples; "
                  "contact = within 0.03 m of the parent surface (trimesh "
                  "proximity), or at/below the cell LAND. A patch is under/top/side "
                  "by its mean outward normal in the child frame (z <= -0.5, >= "
                  "0.5, else side); terrain is under. A reference with any under "
                  "contact stands: deck on a kit piece, else ground; its other "
                  "contacts are abuts. Otherwise side contact is wall, top contact "
                  "is hanging only with no side contact, none is ground; a top "
                  "contact whose parent reaches no more than 0.05 m below the "
                  "contact height lies ON the child (rests-on, an abut, never "
                  "a vote). A child whose foot is set into a piece (lowest "
                  "point within 0.05 m of its lowest, top above its top, "
                  "contact on its top face) stands on it. An interior floor is "
                  "a ray cast down from the child's footprint through each "
                  "candidate mesh (0.3 m reach). A door with no frame contact "
                  "hangs (category row). A pivot "
                  "within 0.10 m of a placed water surface (a reference whose base "
                  "model lies under meshes/water/, pivot inside its bounds) is "
                  "water. Contacts decide first everywhere (terrain contact only on "
                  "ground below the cell or placed water surface is water); a "
                  "reference with no "
                  "contact at all is water in a water column (the cell water, else "
                  "the worldspace default, above the LAND, else the flat placeholder "
                  "or worldspace default land, at its pivot), at any depth, and "
                  "ground (free) outside one. Interior: a shell piece "
                  "(architecture, dungeon-kit, ruin) that no non-shell static or "
                  "LAND supports and whose every structural contact is a shell "
                  "(kit shells, copies of itself, and vanilla dungeon-kit statics "
                  "under meshes/dungeons/; kit clutter ignored), or whose "
                  "support from below is only shells, is ground "
                  "(support interior-zero). Outside a water column an exterior "
                  "reference with no usable LAND (missing, or an unresolved "
                  "flat placeholder) is dropped (droppedNoLand); one whose pivot "
                  "lies more than 2 m below the LAND is ground (buriedGround). Base records resolve through each "
                  "plugin's on-disk masters; exterior cells are merged over the "
                  "load order (vanilla, .esm, .esp; last LAND, water and reference "
                  "override wins; interiors too) before contact is measured. The "
                  "vote per asset is the defining file's usable references, others "
                  "only while it has fewer than 3; pairs use every file's. "
                  "Asset class = "
                  "majority over n >= 3 references, or all of n 1..2 agreeing "
                  "(thin), else ground; water first from the mined waterline; "
                  "when the drop leaves n < 3: water on the sink waterline "
                  "(evidence sink-waterline), else the placement-policy row "
                  "(water-zero water, else ground; evidence policy); an "
                  "asset policy row naming a class (water-zero water, deck deck) "
                  "decides whatever the vote share, a kit row naming one only an "
                  "ambiguous vote (1 <= n < 3 or winning share < 0.6) of an asset "
                  "with no asset row (evidence policy, votedClass); "
                  "a thin water vote from references with no contact and no "
                  "mined waterline takes its policy row (asset, else kit, else "
                  "ground; evidence policy); "
                  "unplaced assets are ground. A water-class asset with no sink "
                  "waterline carries waterline: cell water minus pivot, median over "
                  "the defining file's water-column references (n >= 3, evidence "
                  "column), else the policy row's fallbackWaterlineM (evidence policy). "
                  "Ground (with free) and deck references pool as one support "
                  "vote before the plurality, then split ground vs deck (tie "
                  "ground); an assetPlacement row's anchorClass decides ahead of "
                  "everything (evidence policy, votedClass; its designedWaterlineM "
                  "is the waterline). "
                  "Non-kit statics under effects/, magic/ and sky/ are never candidates; "
                  "kit clutter never supports a shell; an interior ray-cast floor "
                  "within 0.10 m under the footprint supports; a non-kit static's "
                  "mesh comes from its pool, then the BSA beside the pool's plugins, "
                  "then vanilla. Pairs: every kit ground/deck parent "
                  "a wall (hanging) reference is in side (top) contact with. "
                  "worldgen/mine_mounts.py",
        "pairKindCounts": dict(sorted(kinds.items())),
        "cellsWalked": stats["cellsWalked"],
        "candidatePairs": stats["candidatePairs"],
        "distinctPoses": stats["distinctPoses"],
        "borderParents": stats["borderParents"],
        "meshesMissing": len(missing),
        "meshesMissingIds": sorted(missing),
        "anchorClassCounts": dict(sorted(tally.items())),
        "droppedNoLand": sum(dropped.values()),
        "buriedGround": sum(k for counts in hanging_from.values()
                            for (_cls, source), k in counts.items() if source == "buried"),
        "childRefs": stats["childRefs"],
        "childRefsDefiningFile": stats["childRefsDefiningFile"],
        "childRefsOtherFile": stats["childRefsOtherFile"],
        "otherFileRefsNotVoting": sum(outvoted.values()),
        "waterColumnRefClasses": dict(sorted(water_column.items())),
        "fallbackCounts": dict(sorted(fallbacks.items())),
        "waterlineCounts": dict(sorted(waterlines.items())),
        "anchors": anchors,
        "pairs": pairs,
    }


# --------------------------------------------------------------------------- #
# the NIF mesh cache
# --------------------------------------------------------------------------- #
def plugin_archives(vault: Path) -> dict[str, list[Path]]:
    """``pool id -> mesh archives beside its plugins``: the BSA the game loads
    with a plugin (``<plugin stem>*.bsa``, texture archives left out). Round
    18 ruling 4: King of the Murkmire's own ``argonia/`` meshes sit in its
    BSA, not in the ``mwkeep`` pool directory."""
    archives: dict[str, list[Path]] = defaultdict(list)
    for pool, plugin in pool_plugins(vault):
        for bsa in sorted(plugin.parent.glob(f"{plugin.stem}*.bsa")):
            if "textures" not in bsa.name.casefold() and bsa not in archives[pool]:
                archives[pool].append(bsa)
    return archives


def nif_sources(static_pool: dict[str, str], vault: Path) -> dict[str, tuple[object, str]]:
    """``static id -> (archive source, NIF rel path)``: the plugin's own pool
    first, then the archives beside that pool's plugins, then vanilla."""
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
    from pipeline.build_kit import BsaSource, pool_sources
    archives = plugin_archives(vault)
    sources: dict[object, object] = {}
    found: dict[str, tuple[object, str]] = {}
    for static_id, pool in sorted(static_pool.items()):
        rel = "meshes/" + static_id[len(NON_KIT_PREFIX):]
        for candidate in dict.fromkeys((pool, *archives.get(pool, ()), "vanilla")):
            if candidate not in sources:
                try:
                    sources[candidate] = (BsaSource(candidate) if isinstance(candidate, Path)
                                          else pool_sources(candidate, vault).meshes)
                except (KeyError, OSError):
                    sources[candidate] = None
            source = sources[candidate]
            if source is not None and source.contains(rel):
                found[static_id] = (source, rel)
                break
    return found


CACHE_INDEX = MESH_CACHE / "index.json"
DUMP_BATCH = 400
DUMPERS = 2
"""Blender processes dumping in parallel (each ~1 GiB under Wine)."""


def nif_index(static_pool: dict[str, str] | None = None, vault: Path | None = None,
              cache: Path = MESH_CACHE) -> dict[str, Path]:
    """``static id -> cached npz`` from the cache index ``dump_meshes`` wrote."""
    try:
        index = json.loads((cache / "index.json").read_text())
    except (OSError, ValueError):
        return {}
    return {static_id: cache / row["npz"] for static_id, row in index.items()}


def dump_meshes(static_pool: dict[str, str], vault: Path, cache: Path = MESH_CACHE) -> dict:
    """Extract every needed non-kit NIF and dump its triangles through Blender
    (``pipeline/blender/dump_nif_meshes.py``), keyed on NIF path + size;
    existing cache files are skipped."""
    import subprocess
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
    from pipeline.build import TOOLCHAIN, _expand, to_windows
    found = nif_sources(static_pool, vault)
    work = cache.parent / "mesh-cache-work"
    data_root = work / "data-root"
    data_root.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    by_source: dict[int, tuple[object, set[str]]] = {}
    for source, rel in found.values():
        by_source.setdefault(id(source), (source, set()))[1].add(rel)
    for source, rels in by_source.values():
        todo = sorted(rel for rel in rels if not (data_root / rel).exists())
        source.extract_many(todo, data_root)
    index, jobs = {}, []
    for static_id, (_source, rel) in sorted(found.items()):
        nif = data_root / rel
        if not nif.exists():
            continue
        out = nif_cache_path(rel, nif.stat().st_size, cache)
        index[static_id] = {"nif": rel, "size": nif.stat().st_size, "npz": out.name}
        if not out.exists() and all(job["out"] != to_windows(out) for job in jobs):
            jobs.append({"nif": to_windows(nif), "out": to_windows(out)})
    script = REPO_ROOT / "tooling/asset-pipeline/pipeline/blender/dump_nif_meshes.py"
    env = dict(__import__("os").environ, WINEPREFIX=str(_expand(TOOLCHAIN["winePrefix"])),
               WINEDEBUG="-all")
    def run_batch(start: int):
        plan = work / f"plan-{start}.json"
        plan.write_text(json.dumps({
            "build_kit_script": to_windows(script.with_name("build_kit.py")),
            "metresPerUnit": 1.0 / UNITS_PER_METRE,
            "jobs": jobs[start:start + DUMP_BATCH]}))
        return start, subprocess.run(
            [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
             "--background", "--python", to_windows(script)],
            env={**env, "DUMP_PLAN": to_windows(plan)}, capture_output=True, text=True,
            timeout=3600)

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(DUMPERS) as pool:
        batches = list(pool.map(run_batch, range(0, len(jobs), DUMP_BATCH)))
    for start, proc in batches:
        tail = [line for line in proc.stdout.splitlines() if line.startswith("[dump]")]
        print(f"  batch {start}: {tail[-1] if tail else 'no summary'}", flush=True)
        for line in tail[:-1][:5]:
            print("   ", line[:300], flush=True)
        if not tail:
            print(proc.stdout[-1500:], proc.stderr[-1500:], flush=True)
    try:
        merged = json.loads((cache / "index.json").read_text())
    except (OSError, ValueError):
        merged = {}
    merged.update(index)
    (cache / "index.json").write_text(json.dumps(merged, indent=0, sort_keys=True))
    return {"nifsNeeded": len(static_pool), "nifsFound": len(found),
            "cached": len(index), "dumped": len(jobs)}


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--kits-dir", type=Path, action="append", default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--vault", type=Path, default=asset_registry.DEFAULT_VAULT)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--assets", nargs="+", default=None,
                        help="mine only these child asset ids; print, write nothing")
    parser.add_argument("--jobs", type=int, default=CONTACT_WORKERS,
                        help="processes for the contact queries")
    parser.add_argument("--dump-meshes", action="store_true",
                        help="fill the NIF mesh cache for every candidate parent, then stop")
    args = parser.parse_args(list(argv) if argv is not None else None)
    kits = kit_assets(*(args.kits_dir or []))
    if args.dump_meshes:
        _children, _poses, static_pool, stats = collect(kits, args.vault)
        needed = {parent for key in _poses for parent in [key[1]]
                  if parent.startswith(NON_KIT_PREFIX)}
        print(f"{stats['candidatePairs']} candidates, {stats['distinctPoses']} "
              f"distinct poses, {len(needed)} non-kit meshes")
        print(dump_meshes({s: static_pool[s] for s in needed}, args.vault))
        return 0
    if args.assets:
        document = build_document(kits, args.vault, only=set(args.assets))
        print(json.dumps({"anchors": document["anchors"], "pairs": document["pairs"],
                          "distinctPoses": document["distinctPoses"],
                          "meshesMissing": document["meshesMissing"]}, indent=1))
        return 0
    document = build_document(kits, args.vault, progress=not args.quiet, jobs=args.jobs)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=1) + "\n", encoding="utf-8")
    if not args.quiet:
        print(f"{len(document['pairs'])} mount pairs {document['pairKindCounts']}; "
              f"{document['distinctPoses']} distinct poses of "
              f"{document['candidatePairs']} candidates; anchor classes "
              f"{document['anchorClassCounts']} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
