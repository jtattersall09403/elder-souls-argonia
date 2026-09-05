"""Co-placement templates: which kit pieces the source authors snap together.

Owner ruling 2026-09-05: *"Many buildings are made of two or more pieces
snapped together by rules; many pieces are never used alone. Doors sit where
the exterior is designed to have them."* Our blueprints place single assets,
so this module mines the evidence that says which pieces belong together and
at what offset, ready for the kit pipeline's COMPOSITE assets (`compose.parts`,
decision 0036).

Method, in short:

1. Walk the requested exterior worldspaces of each source plugin set and keep
   the STRUCTURAL references only — architecture, ruin, dungeon-kit and bridge
   categories, plus anything whose file name says door, dock, quay, stair,
   ramp, scaffold or walkway, and minus anything filed under a trees/plants/
   rocks directory or smaller than 1.5 cubic metres (doors excepted). Flora,
   cave rocks and clutter are not assembly pieces and would swamp the pair
   search: a boulder stack repeats as faithfully as a wall chain.
2. For every ordered pair of pieces within ``--radius`` metres, express the
   second piece in the FIRST piece's own frame: the offset rotated by the
   anchor's yaw, and the yaw difference. The anchor of a mixed pair is the
   bulkier piece (bounds volume, lexicographic tie-break), which is what makes
   the mined offsets read as "the door sits here on the shell". For a pair of
   the same mesh (wall chains, walkway runs) the direction whose local offset
   points into the forward half-plane is kept, so a chain does not split into
   two mirrored clusters.
3. Cluster each pair's relative transforms greedily at ``--offset-tol`` metres
   and ``--yaw-tol`` degrees. A cluster with at least ``--min-count`` members,
   an offset spread under the tolerance and a yaw spread under the tolerance,
   is a TEMPLATE: the authors placed those two pieces in that exact relation
   that many times, which no coincidence of siting produces. The pairs left
   over are clustered a second time on distance, height and relative yaw with
   the bearing free, which catches the piece an author slid round a round
   shell (HTBM's bamboo hut door); those templates are marked ``radial``.
4. Templates that share an anchor INSTANCE compose into groups — the shell plus
   its door plus its stair — reported when the same set of templates fires on
   at least ``--min-count`` anchors.
5. Per piece, count the instances that took part in no template at all. A piece
   with instances and none alone is a piece the authors never used by itself.

Doorways fall out of step 3 for free: a template whose part is a door mesh
records where that door sits on its shell, in the shell's own frame. That is
the designed doorway, measured from placements rather than from rays through
the shell's geometry, and it is written to ``doorwaysFromAssemblies`` for
``pipeline/interiors_index.py`` to consume (see the companion doc for the join;
this module does not edit that one).

Statistics and relations only; no authored layout is reproduced (00-core rule
6). Deterministic: refs sorted by form id before clustering, metres and degrees
rounded to 2 dp, no timestamps.

Usage:
  python3 -m worldgen.mine_assemblies \\
      --set vanilla --label "Vanilla Skyrim" \\
      --plugin "<vault>/Data/Skyrim.esm" --world Tamriel \\
      --set bmv-blackmarsh --label "BM&V Black Marsh" \\
      --plugin ".../Black Marsh.esm" --world BlackMarsh \\
      --names "<vault>/Data/Skyrim.esm" \\
      --out world/sources/placement/kit-assemblies-mined.json \\
      --report docs/research/placement-settlements/kit-assemblies-evidence.md
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import UNITS_PER_METRE, Plugin

SCHEMA_VERSION = 1

REPO_ROOT = Path(__file__).resolve().parents[3]
KIT_CONFIG_DIR = REPO_ROOT / "tooling/asset-pipeline/pipeline/config/kits"
KIT_OUTPUT_DIR = REPO_ROOT / "tooling/asset-pipeline/output/kits"

#: Categories that can be part of a building assembly.
STRUCTURAL_CATEGORIES = {"architecture", "ruin", "dungeon-kit", "bridge"}

#: File-name words that pull a reference in whatever its category says: the
#: pieces that snap onto a shell and the dock/quay families.
STRUCTURAL_WORDS = (
    "door", "dock", "pier", "quay", "jetty", "stair", "ramp",
    "scaffold", "piling", "walkway", "boardwalk", "balcon", "kiosk",
)

#: Directory words that mark a pool's natural dressing rather than its
#: building pieces. BM&V files its trees under `architecture/phitt/trees` and
#: its cave rocks under `dungeons/caves/green/rocks`, so both otherwise read as
#: structural: a boulder stack repeats at a fixed offset as faithfully as a
#: wall chain, and it is not an assembly.
NATURAL_DIR_WORDS = ("tree", "plant", "rock", "flora", "landscape", "grass",
                     "moss", "bush", "shrub")

#: Bounds volume under which a reference is clutter, not a building piece.
#: A geometric gate, not a label (owner ruling 2026-09-04) — it is what keeps
#: a mine's gold ingots, strewn in their hundreds at fixed offsets, out of the
#: `dungeon-kit` category. Door pieces are exempt: a door is a thin slab.
MIN_PIECE_VOLUME_M3 = 1.5

#: A door PIECE — a separate mesh that is the entrance, not a DOOR record.
DOOR_WORDS = ("door", "porte", "gate", "entrance")

#: Pool prefixes for the asset ids the kit configs use, keyed by plugin file
#: name (lower case). Keep in step with `pipeline/build_kit.py:pool_sources`.
PLUGIN_POOLS = {
    "skyrim.esm": "vanilla",
    "update.esm": "vanilla",
    "black marsh.esm": "bmv",
    "black marsh north.esp": "bmv",
    "valenwood.esp": "bmv",
    "here there be monsters - curse of cipactli.esp": "htbm",
}


def pool_for(plugin_name: str) -> str:
    return PLUGIN_POOLS.get(plugin_name.lower(), "?")


def asset_ref(pool: str, model_key: str) -> str:
    path = model_key[:-4] if model_key.lower().endswith(".nif") else model_key
    return f"{pool}:{path}"


def short(model_key: str) -> str:
    return model_key.rsplit("/", 1)[-1].removesuffix(".nif")


def is_door_piece(model_key: str) -> bool:
    return any(w in short(model_key) for w in DOOR_WORDS)


def bearing_of(dx: float, dy: float) -> float:
    """North = +y, clockwise — the `sideDeg` convention of interiors_index."""
    return round(math.degrees(math.atan2(dx, dy)) % 360.0, 2)


# --- collection --------------------------------------------------------------


@dataclass
class Ref:
    model_key: str
    pool: str
    x: float
    y: float
    z: float
    yaw_deg: float
    scale: float
    volume_m3: float
    cell: tuple[int, int]
    world: str


@dataclass
class SourceSet:
    set_id: str
    label: str
    plugins: list[str]
    worldspaces: list[str]
    refs: list[Ref] = field(default_factory=list)
    cells_walked: int = 0
    unresolved: int = 0
    skipped: int = 0


def wanted(model_key: str, volume_m3: float) -> bool:
    name = short(model_key)
    door = is_door_piece(model_key)
    directories = model_key.split("/")[:-1]
    if any(w in d for d in directories for w in NATURAL_DIR_WORDS):
        return False
    if "natural" in classify(model_key).tags:
        return False
    if not door and volume_m3 < MIN_PIECE_VOLUME_M3:
        return False
    if classify(model_key).category in STRUCTURAL_CATEGORIES:
        return True
    return door or any(w in name for w in STRUCTURAL_WORDS)


def collect(plugin_paths: list[str], worlds: set[str], name_paths: list[str],
            set_id: str, label: str) -> SourceSet:
    plugins = [Plugin(p) for p in plugin_paths]
    names = [Plugin(p) for p in name_paths]
    bases: dict[tuple[str, int], object] = {}
    for plugin in plugins + names:
        for form_id, base in plugin.base_objects().items():
            if base.model:
                bases.setdefault(
                    (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), base)

    out = SourceSet(set_id, label, [Path(p).name for p in plugin_paths],
                    sorted(worlds))
    seen_worlds: set[str] = set()
    for plugin in plugins:
        pool = pool_for(Path(plugin.path).name)
        spaces = plugin.worldspaces()
        keep = {fid for fid, ws in spaces.items()
                if not worlds or ws.editor_id in worlds}
        if not keep:
            continue
        for cell in plugin.exterior_cells(with_land=False):
            if cell.world not in keep or cell.grid is None:
                continue
            out.cells_walked += 1
            world_name = spaces[cell.world].editor_id or f"0x{cell.world:06x}"
            seen_worlds.add(world_name)
            for ref in cell.refs:
                if ref.distant:
                    continue
                base = bases.get(
                    (plugin.source_of(ref.base).lower(), ref.base & 0xFFFFFF))
                if base is None or not base.model:
                    out.unresolved += 1
                    continue
                key = base.model_key or ""
                volume = 0.0
                if base.bounds:
                    x1, y1, z1, x2, y2, z2 = base.bounds
                    volume = abs((x2 - x1) * (y2 - y1) * (z2 - z1)) \
                        * ref.scale ** 3 / UNITS_PER_METRE ** 3
                if not wanted(key, volume):
                    out.skipped += 1
                    continue
                out.refs.append(Ref(
                    key, pool,
                    ref.pos[0] / UNITS_PER_METRE,
                    ref.pos[1] / UNITS_PER_METRE,
                    ref.pos[2] / UNITS_PER_METRE,
                    math.degrees(ref.rot[2]) % 360.0,
                    ref.scale, volume, cell.grid, world_name))
    out.refs.sort(key=lambda r: (r.world, r.cell, r.model_key,
                                 round(r.x, 3), round(r.y, 3), round(r.z, 3)))
    if not out.worldspaces:
        out.worldspaces = sorted(seen_worlds)
    return out


# --- relative transforms -----------------------------------------------------


def neighbours(refs: list[Ref], radius: float):
    """Yield index pairs (i, j), i < j, within `radius` metres in plan."""
    grid: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for i, r in enumerate(refs):
        grid[(hash(r.world) & 0xFFFF, int(r.x // radius), int(r.y // radius))].append(i)
    r2 = radius * radius
    for (w, gx, gy), members in sorted(grid.items()):
        pool: list[int] = []
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                pool += grid.get((w, gx + ox, gy + oy), ())
        for i in members:
            a = refs[i]
            for j in pool:
                if j <= i:
                    continue
                b = refs[j]
                if a.world != b.world:
                    continue
                dx, dy, dz = b.x - a.x, b.y - a.y, b.z - a.z
                if dx * dx + dy * dy + dz * dz <= r2:
                    yield i, j


def local_offset(anchor: Ref, part: Ref) -> tuple[float, float, float, float]:
    """The part in the anchor's own frame: offset x, y, z and relative yaw.

    A reference's `rot.z` behaves as a CLOCKWISE compass heading here, not as a
    maths-convention counter-clockwise angle: measured against vanilla's
    `farmhouse01` + `farmhouseldoor01`, whose door yaw tracks its house yaw
    exactly, the bearing of the door from the house is constant at 207 degrees
    only when the anchor's yaw is SUBTRACTED from the clockwise bearing. That
    is the rotation applied below; getting it the other way round turns every
    fixed relation into a ring of the right radius and the wrong bearings.
    """
    a = math.radians(anchor.yaw_deg)
    dx, dy = part.x - anchor.x, part.y - anchor.y
    lx = dx * math.cos(a) - dy * math.sin(a)
    ly = dx * math.sin(a) + dy * math.cos(a)
    return lx, ly, part.z - anchor.z, (part.yaw_deg - anchor.yaw_deg) % 360.0


def order_pair(a: Ref, b: Ref) -> tuple[Ref, Ref]:
    """Anchor first: the bulkier piece, lexicographic tie-break. For a pair of
    the same mesh, the direction pointing into the forward half-plane."""
    if a.model_key == b.model_key:
        lx, ly, _, _ = local_offset(a, b)
        forward = ly > 1e-6 or (abs(ly) <= 1e-6 and lx >= 0)
        return (a, b) if forward else (b, a)
    if abs(a.volume_m3 - b.volume_m3) > 1e-6:
        return (a, b) if a.volume_m3 > b.volume_m3 else (b, a)
    return (a, b) if a.model_key <= b.model_key else (b, a)


def yaw_delta(a: float, b: float) -> float:
    d = (a - b) % 360.0
    return min(d, 360.0 - d)


@dataclass
class Cluster:
    ox: float
    oy: float
    oz: float
    yaw: float
    members: list[tuple[int, int]] = field(default_factory=list)
    samples: list[tuple[float, float, float, float]] = field(default_factory=list)
    bearings: list[float] = field(default_factory=list)

    def add(self, sample, member):
        self.samples.append(sample)
        self.members.append(member)
        n = len(self.samples)
        self.ox += (sample[0] - self.ox) / n
        self.oy += (sample[1] - self.oy) / n
        self.oz += (sample[2] - self.oz) / n
        # circular mean of the yaw, so 359 and 1 do not average to 180
        sx = sum(math.cos(math.radians(s[3])) for s in self.samples)
        sy = sum(math.sin(math.radians(s[3])) for s in self.samples)
        self.yaw = math.degrees(math.atan2(sy, sx)) % 360.0

    def fits(self, sample, offset_tol: float, yaw_tol: float) -> bool:
        return (math.dist((self.ox, self.oy, self.oz), sample[:3]) <= offset_tol
                and yaw_delta(self.yaw, sample[3]) <= yaw_tol)

    def offset_spread(self) -> float:
        return max(math.dist((self.ox, self.oy, self.oz), s[:3])
                   for s in self.samples)

    def yaw_spread(self) -> float:
        return max(yaw_delta(self.yaw, s[3]) for s in self.samples)

    def bearing_spread(self) -> float:
        """Widest gap between any two member bearings, on the circle."""
        if len(self.bearings) < 2:
            return 0.0
        vals = sorted(self.bearings)
        gaps = [b - a for a, b in zip(vals, vals[1:])] + [vals[0] + 360 - vals[-1]]
        return min(180.0, 360.0 - max(gaps))


#: A radial template whose members' bearings spread this wide is a piece the
#: author slid round its shell rather than snapped to one face.
RADIAL_BEARING_SPREAD_DEG = 20.0


def cluster_pairs(refs: list[Ref], radius: float, offset_tol: float,
                  yaw_tol: float, min_count: int, max_clusters: int = 400):
    """Two clusterings of the same pairs, in order.

    The `fixed` pass clusters the whole relative transform: the part sits at
    one point on the anchor. The `radial` pass then takes only the pairs the
    fixed pass could not template, and clusters distance, height and relative
    yaw, leaving the bearing free — which is how HTBM's bamboo hut door is
    placed, at a constant 2.8 m from the hut's pivot and a constant yaw against
    it, on whichever side of the round hut the author wanted. A relation the
    fixed test cannot see, and the one that carries that kit's doorway. Chains
    of one mesh are excluded from the radial pass: a grid of identical modules
    is at a constant distance in every direction by construction.
    """
    pairs: list[tuple[tuple[str, str], int, int, tuple]] = []
    for i, j in neighbours(refs, radius):
        anchor, part = order_pair(refs[i], refs[j])
        ai = i if anchor is refs[i] else j
        pi = j if anchor is refs[i] else i
        pairs.append(((anchor.model_key, part.model_key), ai, pi,
                      local_offset(anchor, part)))

    def run(rows, polar: bool):
        buckets: dict[tuple[str, str], list[Cluster]] = defaultdict(list)
        for key, ai, pi, sample in rows:
            value = ((math.hypot(sample[0], sample[1]), 0.0, sample[2], sample[3])
                     if polar else sample)
            found = None
            for c in buckets[key]:
                if c.fits(value, offset_tol, yaw_tol):
                    found = c
                    break
            if found is None:
                if len(buckets[key]) >= max_clusters:
                    continue
                found = Cluster(value[0], value[1], value[2], value[3])
                buckets[key].append(found)
                found.samples.append(value)
                found.members.append((ai, pi))
            else:
                found.add(value, (ai, pi))
            found.bearings.append(bearing_of(sample[0], sample[1]))
        return buckets

    def qualifies(c: Cluster) -> bool:
        return (len(c.members) >= min_count and c.offset_spread() <= offset_tol
                and c.yaw_spread() <= yaw_tol)

    fixed = run(pairs, polar=False)
    templated: set[tuple[int, int]] = set()
    for clusters in fixed.values():
        for c in clusters:
            if qualifies(c):
                templated.update(c.members)
    left = [row for row in pairs
            if (row[1], row[2]) not in templated and row[0][0] != row[0][1]]
    radial = run(left, polar=True)
    return fixed, radial


# --- kit membership ----------------------------------------------------------


def kit_membership() -> dict[str, str]:
    """assetRef -> kit id, from the shipped kit configs."""
    out: dict[str, str] = {}
    if not KIT_CONFIG_DIR.is_dir():
        return out
    for path in sorted(KIT_CONFIG_DIR.glob("*.json")):
        config = json.loads(path.read_text())
        kit = config.get("id", path.stem)
        for entry in config.get("assets", []):
            ref = entry.get("asset", "")
            out.setdefault(ref, kit)
            for part in entry.get("compose", {}).get("parts", []):
                out.setdefault(part.get("asset", ""), kit)
    return out


def family_of(model_key: str, ref: str, kits: dict[str, str]) -> str:
    kit = kits.get(ref)
    if kit:
        return kit
    parts = [p for p in model_key.split("/")[:-1] if p]
    return "/".join(parts[:2]) if parts else "?"


# --- analysis ----------------------------------------------------------------


def analyse(source: SourceSet, radius: float, offset_tol: float, yaw_tol: float,
            min_count: int, kits: dict[str, str],
            max_templates: int = 600) -> dict:
    fixed, radial = cluster_pairs(source.refs, radius, offset_tol, yaw_tol,
                                  min_count)
    refs = source.refs

    templates: list[dict] = []
    for kind, buckets in (("fixed", fixed), ("radial", radial)):
        for (anchor_key, part_key), clusters in buckets.items():
            for c in clusters:
                if len(c.members) < min_count:
                    continue
                if c.offset_spread() > offset_tol or c.yaw_spread() > yaw_tol:
                    continue
                spread = c.bearing_spread()
                if kind == "radial" and spread < RADIAL_BEARING_SPREAD_DEG:
                    continue  # the fixed pass already has this one
                anchor_ref = asset_ref(refs[c.members[0][0]].pool, anchor_key)
                part_ref = asset_ref(refs[c.members[0][1]].pool, part_key)
                example = refs[c.members[0][0]]
                templates.append({
                    "id": "",
                    "kind": kind,
                    "anchor": anchor_ref,
                    "part": part_ref,
                    "anchorPiece": short(anchor_key),
                    "partPiece": short(part_key),
                    "family": family_of(anchor_key, anchor_ref, kits),
                    "count": len(c.members),
                    "offsetM": ([round(c.ox, 2), round(c.oy, 2), round(c.oz, 2)]
                                if kind == "fixed" else None),
                    "radiusM": round(c.ox if kind == "radial"
                                     else math.hypot(c.ox, c.oy), 2),
                    "riseM": round(c.oz, 2),
                    "yawDeg": round(c.yaw, 2),
                    "sideDeg": (bearing_of(c.ox, c.oy) if kind == "fixed"
                                else None),
                    "bearingSpreadDeg": round(spread, 2),
                    "offsetSpreadM": round(c.offset_spread(), 3),
                    "yawSpreadDeg": round(c.yaw_spread(), 2),
                    "isDoor": is_door_piece(part_key),
                    "selfChain": anchor_key == part_key,
                    "exampleWorldspace": example.world,
                    "exampleCell": list(example.cell),
                    "_members": c.members,
                })
    templates.sort(key=lambda t: (-t["count"], t["kind"], t["anchor"], t["part"],
                                  t["offsetM"] or [t["radiusM"]], t["yawDeg"]))
    for n, t in enumerate(templates):
        t["id"] = f"{source.set_id}:t{n:04d}"

    # groups: templates that fire on the same anchor instance
    by_anchor: dict[int, set[str]] = defaultdict(set)
    for t in templates:
        if t["kind"] != "fixed":
            continue
        for ai, _ in t["_members"]:
            by_anchor[ai].add(t["id"])
    group_counts: dict[tuple[str, ...], list[int]] = defaultdict(list)
    for ai, ids in by_anchor.items():
        if len(ids) >= 2:
            group_counts[tuple(sorted(ids))].append(ai)
    index = {t["id"]: t for t in templates}
    groups = []
    for ids, anchors in sorted(group_counts.items(),
                               key=lambda kv: (-len(kv[1]), kv[0])):
        if len(anchors) < min_count:
            continue
        first = index[ids[0]]
        groups.append({
            "anchor": first["anchor"],
            "family": first["family"],
            "count": len(anchors),
            "templates": list(ids),
            "parts": [{"part": index[i]["part"], "offsetM": index[i]["offsetM"],
                       "radiusM": index[i]["radiusM"],
                       "yawDeg": index[i]["yawDeg"], "isDoor": index[i]["isDoor"]}
                      for i in ids],
            "exampleWorldspace": refs[sorted(anchors)[0]].world,
            "exampleCell": list(refs[sorted(anchors)[0]].cell),
        })

    # piece use: instances that took part in no template
    in_template: set[int] = set()
    for t in templates:
        for ai, pi in t["_members"]:
            in_template.add(ai)
            in_template.add(pi)
    instances: dict[str, int] = defaultdict(int)
    alone: dict[str, int] = defaultdict(int)
    piece_family: dict[str, str] = {}
    for i, r in enumerate(refs):
        ref = asset_ref(r.pool, r.model_key)
        instances[ref] += 1
        piece_family.setdefault(ref, family_of(r.model_key, ref, kits))
        if i not in in_template:
            alone[ref] += 1
    piece_use = []
    for ref in sorted(instances):
        piece_use.append({
            "asset": ref,
            "piece": short(ref),
            "family": piece_family[ref],
            "instances": instances[ref],
            "aloneInstances": alone[ref],
            "neverAlone": alone[ref] == 0 and instances[ref] >= min_count,
        })

    for t in templates:
        t.pop("_members")

    # The long tail is thousands of three-off relations inside one dungeon.
    # Keep the most-repeated `max_templates` per set, plus anything a group
    # cites, and say how many were dropped rather than pretending they never
    # existed.
    found = len(templates)
    keep = {t["id"] for t in templates[:max_templates]}
    keep.update(i for g in groups for i in g["templates"])
    templates = [t for t in templates if t["id"] in keep]

    families: dict[str, dict] = defaultdict(
        lambda: {"templates": 0, "groups": 0, "neverAlonePieces": 0, "pieces": 0})
    for t in templates:
        families[t["family"]]["templates"] += 1
    for g in groups:
        families[g["family"]]["groups"] += 1
    for p in piece_use:
        families[p["family"]]["pieces"] += 1
        if p["neverAlone"]:
            families[p["family"]]["neverAlonePieces"] += 1

    return {
        "label": source.label,
        "plugins": source.plugins,
        "worldspaces": source.worldspaces,
        "macro": {
            "cellsWalked": source.cells_walked,
            "structuralRefs": len(source.refs),
            "nonStructuralRefsSkipped": source.skipped,
            "unresolvedRefs": source.unresolved,
            "distinctPieces": len(instances),
            "templatesFound": found,
            "templatesKept": len(templates),
            "templates": len(templates),
            "groups": len(groups),
            "neverAlonePieces": sum(1 for p in piece_use if p["neverAlone"]),
        },
        "byFamily": {k: families[k] for k in sorted(families)},
        "templates": templates,
        "groups": groups,
        "pieceUse": piece_use,
    }


# --- doorways ----------------------------------------------------------------


def doorways_from(sets: dict[str, dict], interiors: dict[str, dict]) -> dict:
    """Every door-piece template, keyed by the shell it sits on.

    `offsetLocalM` is [x, y, z] metres in the shell's own z-up local frame,
    pivot-relative and de-rotated by the shell's yaw — the same frame
    `compose.parts.offsetM` uses. `sideDeg` is the bearing of the door from the
    shell centre, north = 0, clockwise, matching `interiors_index`'s `sideDeg`.
    """
    out: dict[str, dict] = {}
    for set_id, data in sorted(sets.items()):
        for t in data["templates"]:
            if not t["isDoor"] or t["selfChain"]:
                continue
            record = interiors.get(t["anchor"], {})
            entry = out.setdefault(t["anchor"], {
                "shell": t["anchor"],
                "family": t["family"],
                "anchorEncloses": (None if not record else
                                   record.get("interior") in
                                   {"matched", "tileset", "shell"}),
                "anchorInterior": record.get("interior"),
                "doorways": []})
            entry["doorways"].append({
                "kind": t["kind"],
                "doorAsset": t["part"],
                "doorPiece": t["partPiece"],
                "offsetLocalM": t["offsetM"],
                "radiusM": t["radiusM"],
                "riseM": t["riseM"],
                "yawDeg": t["yawDeg"],
                "sideDeg": t["sideDeg"],
                "bearingSpreadDeg": t["bearingSpreadDeg"],
                "count": t["count"],
                "offsetSpreadM": t["offsetSpreadM"],
                "sourceSet": set_id,
                "exampleWorldspace": t["exampleWorldspace"],
                "exampleCell": t["exampleCell"],
            })
    for entry in out.values():
        entry["doorways"].sort(key=lambda d: (-d["count"], d["doorAsset"]))
    return {k: out[k] for k in sorted(out)}


def interior_records() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not KIT_OUTPUT_DIR.is_dir():
        return out
    for path in sorted(KIT_OUTPUT_DIR.glob("*.interiors.json")):
        data = json.loads(path.read_text())
        kit = data.get("kit", path.name.split(".")[0])
        for ref, record in data.get("assets", {}).items():
            record = dict(record)
            record["kit"] = kit
            out.setdefault(ref, record)
    return out


def gaps_from(doorways: dict, interiors: dict[str, dict]) -> list[dict]:
    """Enclosed shells with no door piece and no ray-detected opening."""
    rows = []
    for ref, record in sorted(interiors.items()):
        if record.get("interior") not in {"matched", "tileset", "shell"}:
            continue
        if record.get("doorways"):
            continue
        if ref in doorways:
            continue
        rows.append({
            "asset": ref,
            "kit": record.get("kit"),
            "interior": record.get("interior"),
            "sizeClass": record.get("sizeClass"),
            "planAreaM2": record.get("planAreaM2"),
            "why": record.get("doorwaysWhy", ""),
        })
    return rows


# --- report ------------------------------------------------------------------


def offset_text(entry: dict) -> str:
    """Human-readable placement of a template's part on its anchor."""
    offset = entry.get("offsetM") or entry.get("offsetLocalM")
    if offset:
        ox, oy, oz = offset
        return f"{ox}, {oy}, {oz}"
    return (f"radius {entry.get('radiusM')} m, rise {entry.get('riseM')} m, "
            "bearing free")


def render_report(payload: dict, top: int = 10) -> str:
    sets = payload["sets"]
    lines = ["# Kit assemblies: which pieces the source authors snap together",
             "",
             "Generated by `worldgen/mine_assemblies.py --report`; do not "
             "hand-edit the tables. Every figure is measured from the shipped "
             "plugins named below. Statistics and relations only: no authored "
             "layout is reproduced (00-core rule 6).",
             "",
             "A **template** is a pair of pieces the authors placed at the "
             "same relative offset and yaw at least "
             f"{payload['parameters']['minCount']} times, with the offset "
             f"spread under {payload['parameters']['offsetToleranceM']} m and "
             f"the yaw spread under {payload['parameters']['yawToleranceDeg']}"
             " degrees. The anchor is the bulkier piece, so an offset reads as "
             "\"the part sits here on the shell\". Offsets are metres in the "
             "anchor's own z-up local frame, the frame `compose.parts.offsetM` "
             "uses.",
             ""]

    lines += ["## Sources and totals", "",
              "| set | plugins | worldspaces | cells | structural refs | "
              "distinct pieces | templates found | kept | groups | "
              "never-alone pieces |",
              "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
              " ---: |"]
    for set_id, data in sets.items():
        m = data["macro"]
        lines.append(
            f"| {set_id} | {', '.join(data['plugins'])} | "
            f"{', '.join(data['worldspaces']) or '(all)'} | {m['cellsWalked']} | "
            f"{m['structuralRefs']} | {m['distinctPieces']} | "
            f"{m['templatesFound']} | {m['templatesKept']} | "
            f"{m['groups']} | {m['neverAlonePieces']} |")
    lines.append("")

    for set_id, data in sets.items():
        lines += [f"## {data['label']} (`{set_id}`)", "",
                  "### Families", "",
                  "| family | pieces | templates | groups | never alone |",
                  "| --- | ---: | ---: | ---: | ---: |"]
        for family, row in sorted(data["byFamily"].items(),
                                  key=lambda kv: (-kv[1]["templates"], kv[0]))[:20]:
            lines.append(f"| `{family}` | {row['pieces']} | {row['templates']} | "
                         f"{row['groups']} | {row['neverAlonePieces']} |")
        lines += ["", f"### The {top} most-repeated templates", "",
                  "| anchor | part | count | offset x,y,z (m) | rel. yaw | "
                  "side | spread (m) | example |",
                  "| --- | --- | ---: | --- | ---: | ---: | ---: | --- |"]
        for t in data["templates"][:top]:
            lines.append(
                f"| `{t['anchorPiece']}` | `{t['partPiece']}`"
                f"{' (door)' if t['isDoor'] else ''} | {t['count']} | "
                f"{offset_text(t)} | {t['yawDeg']} | "
                f"{t['sideDeg'] if t['sideDeg'] is not None else '-'} | "
                f"{t['offsetSpreadM']} | {t['exampleWorldspace']} "
                f"{t['exampleCell'][0]},{t['exampleCell'][1]} |")
        mixed = [t for t in data["templates"] if not t["selfChain"]][:top]
        if mixed:
            lines += ["", f"### The {top} most-repeated templates between "
                      "DIFFERENT pieces", "",
                      "The composite candidates: a chain of one module repeats "
                      "by construction, two different pieces at one offset do "
                      "not.", "",
                      "| anchor | part | count | placement (m) | rel. yaw | "
                      "family | example |",
                      "| --- | --- | ---: | --- | ---: | --- | --- |"]
            for t in mixed:
                lines.append(
                    f"| `{t['anchorPiece']}` | `{t['partPiece']}`"
                    f"{' (door)' if t['isDoor'] else ''} | {t['count']} | "
                    f"{offset_text(t)} | {t['yawDeg']} | `{t['family']}` | "
                    f"{t['exampleWorldspace']} "
                    f"{t['exampleCell'][0]},{t['exampleCell'][1]} |")
        groups = data["groups"][:top]
        if groups:
            lines += ["", "### Multi-piece groups (one anchor, several parts)", "",
                      "| anchor | parts | count | example |",
                      "| --- | --- | ---: | --- |"]
            for g in groups:
                parts = ", ".join(
                    f"`{short(p['part'])}` at {offset_text(p)}, yaw "
                    f"{p['yawDeg']}" for p in g["parts"])
                lines.append(f"| `{short(g['anchor'])}` | {parts} | {g['count']} "
                             f"| {g['exampleWorldspace']} "
                             f"{g['exampleCell'][0]},{g['exampleCell'][1]} |")
        never = [p for p in data["pieceUse"] if p["neverAlone"]]
        never.sort(key=lambda p: (-p["instances"], p["asset"]))
        if never:
            lines += ["", "### Pieces never used alone", "",
                      "| piece | family | instances |",
                      "| --- | --- | ---: |"]
            for p in never[:25]:
                lines.append(f"| `{p['piece']}` | `{p['family']}` | "
                             f"{p['instances']} |")
        solo = [p for p in data["pieceUse"]
                if p["instances"] >= 3 and p["aloneInstances"] == p["instances"]]
        solo.sort(key=lambda p: (-p["instances"], p["asset"]))
        if solo:
            lines += ["", "### Pieces only ever placed alone", "",
                      "| piece | family | instances |",
                      "| --- | --- | ---: |"]
            for p in solo[:15]:
                lines.append(f"| `{p['piece']}` | `{p['family']}` | "
                             f"{p['instances']} |")
        lines.append("")

    doorways = payload["doorwaysFromAssemblies"]
    lines += ["## Doorways derived from assemblies", "",
              "Each row is a door piece the authors placed on a shell at a "
              "repeated offset. `offsetLocalM` is metres in the shell's own "
              "z-up local frame; `sideDeg` is the bearing of the door from the "
              "shell's pivot, north = 0, clockwise — the convention "
              "`pipeline/interiors_index.py` already uses for its ray-derived "
              "`doorways[].sideDeg`.", "",
              "A `radial` row is a door the author slid round its shell: the "
              "distance from the shell's pivot and the door's yaw against the "
              "shell repeat exactly, the bearing does not. The composite "
              "should place such a door at the radius given, on whichever "
              "side the site wants.", "",
              "The `shell` column says whether the kit interiors pass measures "
              "the anchor as something you can stand inside. `not in a kit` "
              "means the piece is not in any kit we build, so the relation is "
              "recorded but unverified.", "",
              "| shell | door piece | placement (m) | rel. yaw | side | "
              "count | shell | set |",
              "| --- | --- | --- | ---: | ---: | ---: | --- | --- |"]
    skipped = 0
    for shell, entry in doorways.items():
        if entry.get("anchorEncloses") is False:
            skipped += len(entry["doorways"])
            continue
        shell_state = ("measured shell" if entry.get("anchorEncloses")
                       else "not in a kit")
        for d in entry["doorways"]:
            lines.append(f"| `{short(shell)}` | `{d['doorPiece']}` | "
                         f"{offset_text(d)} | {d['yawDeg']} | "
                         f"{d['sideDeg'] if d['sideDeg'] is not None else '-'} | "
                         f"{d['count']} | {shell_state} | {d['sourceSet']} |")
    if not doorways:
        lines.append("| (none) | | | | | | | |")
    lines += ["",
              f"A further {skipped} door templates in the JSON sit on anchors "
              "the kit interiors pass measures as NOT enclosures — walkway "
              "segments, signposts, dock stairs, door frames. They are the "
              "record of a door standing NEAR something, not of a doorway, and "
              "the composite work should ignore them."]
    lines += ["",
              "### The join into `interiors_index.py`", "",
              "`interiors_index.py` derives a doorway from the shell's own "
              "geometry: it fires rays from inside at 1.6 m and reports the "
              "arcs that escape. A shell whose door is a SEPARATE mesh has no "
              "opening to find, so it lands on `doorways: []` with a "
              "`doorwaysWhy` saying the door is a separate mesh. This file "
              "closes that case from the other side.",
              "",
              "The join, for the agent who wires it (this module does not edit "
              "`interiors_index.py`):",
              "",
              "1. Load `world/sources/placement/kit-assemblies-mined.json` and "
              "read `doorwaysFromAssemblies`, keyed by the shell's asset id — "
              "the same id the kit config and `<kit>.interiors.json` use.",
              "2. For an asset whose ray pass found no opening, emit one "
              "`doorways` entry per mined door: `sideDeg` straight across, "
              "`offsetM` as `[x, y]` from `offsetLocalM` (the ray pass reports "
              "a wall point in the same pivot-centred metres), `arcM` unknown "
              "and therefore omitted rather than guessed.",
              "3. Carry `doorwaySource: \"assembly\"` and the template's "
              "`count`, so a doorway measured from placements is never "
              "confused with one measured from geometry, and set "
              "`doorwaysWhy` to name the door piece.",
              "4. Where both passes fire, keep the geometric one and record "
              "the mined one as corroboration — the mesh's own opening is the "
              "stronger evidence.",
              "",
              "## Enclosed shells with no door, from either pass", "",
              "Honest gaps: the piece measures as something you can stand "
              "inside, its geometry yields no opening, and no source placement "
              "puts a door piece on it. Each one needs a sourced door piece, a "
              "different shell, or an authored composite before it can carry "
              "an interior claim.", "",
              "| asset | kit | interior | size | plan m2 |",
              "| --- | --- | --- | --- | ---: |"]
    for row in payload["gaps"]["shellsWithoutDoor"]:
        lines.append(f"| `{row['asset']}` | {row['kit']} | {row['interior']} | "
                     f"{row['sizeClass']} | {row['planAreaM2']} |")
    if not payload["gaps"]["shellsWithoutDoor"]:
        lines.append("| (none) | | | | |")
    lines += ["",
              "## How to author the composites", "",
              "Which mined templates should become `compose.parts` entries in "
              "a kit config, and which must stay separate placements. The "
              "authored `snapLogic` prose in each kit config is the ruling "
              "authority on what may combine (kits-only-combine-designed-"
              "pieces, owner ruling 2026-09-04); a template is evidence that "
              "the source authors used a combination, and it supplies the "
              "offset, but it never licenses a combination the piece authors "
              "did not intend.", "",
              "**Author as composites.**", "",
              "1. `settlement-stilt-v1` — the HTBM bamboo hut. "
              "`bamboohut01` takes `bamboohutdoor01` at -2.45, 1.4, 0.0 and "
              "`bamboohut02` at -2.47, 1.4, 0.0, both with the door yawed 120 "
              "degrees against the hut, sixteen placements between them. One "
              "offset, two shells, and the composite that turns a doorless "
              "shell into an enterable building: it comes first.",
              "2. `settlement-mud-v1` — the mud hut's entrance. "
              "`hutexterior` takes `doorframe01` at 3.22, -5.98, -3.91, "
              "twenty-two times, with `ruinswooddoorload01` hung in that "
              "frame. Three pieces, one building: the hut is not shipped with "
              "its entrance. Two further frame offsets (3.04, -5.57 and 3.42, "
              "-6.35) are the same doorway shifted along the wall, so pick "
              "the commonest and leave the variants.",
              "3. The phitt marsh house — the strongest evidence in the mod "
              "sets, and a family no kit of ours yet carries, so it is a "
              "sourcing decision before it is a composite. `house03` carries "
              "`overhang05` at -0.21, -5.16, -1.24 and four `window` pieces "
              "(-3.13, -2.82, -0.97; -1.76, 4.01, -0.71; 1.94, 4.06, -0.71; "
              "2.8, -3.0, -0.97), all twenty-seven times, and the overhang "
              "carries four more windows of its own. Six pieces, one house, "
              "one composite — and the clearest case of a piece (`overhang05`, "
              "`window`) that is never placed alone.",
              "4. `works-v1` — the stockade scaffold. "
              "`stockadescaffoldbase4sided01` carries the next stage exactly "
              "2.73 m above itself, twenty-eight times, which is the same "
              "rule the kit's `stockade-scaffold` prose states in words. "
              "Author the two-stage and three-stage towers as composites and "
              "leave the bridges, ramps and props as separate placements — "
              "they join platforms, and what they join is a site decision.",
              "5. `docks-v1` — BM&V's shore entry. `dockstrent01` takes "
              "`dockstrent02` at 0.02, -7.1, -0.07 forty-seven times, and the "
              "three-piece run appears as a group. Author a two-piece and a "
              "three-piece quay module; the columns, ropes and cleats stay "
              "separate, because `snapLogic` places them against the deck at "
              "the waterline, not against a neighbouring deck.",
              "6. `settlement-imperial-v1` — the vanilla farmhouse. "
              "`farmhouse01` takes `farmhouseldoor01` at -1.82, -3.56, 0.0 "
              "and `farmhouse02` at 0.0, -3.11, -0.01, with a second, raised "
              "door at 3.18 m for the loft. The farmhouse family is the "
              "densest source of wall/roof module templates in the vanilla "
              "set; author the shell-plus-door pair first and treat the "
              "modules as a later pass.",
              "7. `ruin-monumental-v1` — the Ayleid `arblock01` lattice. "
              "The block tiles at 2.65 m in x and y and 0.87 m in z, hundreds "
              "of times. Author a small number of pre-stacked block masses as "
              "composites so a ruin is placed in three or four parcels rather "
              "than three hundred.", "",
              "**Keep as separate placements.**", "",
              "* Every walkway family in `settlement-root-v1`. Its "
              "`passerelles` prose encodes length, rise and handrail side in "
              "the file names, and a run is a sum of those; freezing two "
              "segments into a composite would fix a length the router needs "
              "to choose. The mined `passl*` templates are a record of runs, "
              "not of modules.",
              "* `settlement-root-v1` house accessories. The prose is "
              "explicit that each house form takes its OWN balcony, access "
              "and window family and that forms must not be crossed; the "
              "mined `housegland001` + `casexfreelgdoor01` templates give the "
              "radius but the bearing follows the walkway that reaches the "
              "house, which is a siting decision.",
              "* `dungeon-root-v1` and the tree kits. `trees` and "
              "`trunkColumns` state there are no snap points and that boughs "
              "are matched by hand against the geometry; a mined offset there "
              "reproduces one authored layout rather than a rule.",
              "* Anything whose template count is 3 or 4 on a single "
              "worldspace. That is a copied-and-pasted building, not a kit "
              "rule.", "",
              "Offsets go into `compose.parts[].offsetM` unchanged: both this "
              "module and `compose` measure metres in the anchor's own z-up "
              "local frame, and `yawDeg` is likewise the part's yaw against "
              "the anchor. Re-measure the footprint and the interiors index "
              "after building a composite — a hut with its door is a "
              "different silhouette and, for the first time, a shell with an "
              "opening.", "",
              "## Reading this evidence", "",
              "* A template is evidence of an authored relation, not proof of "
              "one. Two pieces placed identically thirty times were snapped "
              "together by a rule; two placed identically three times may have "
              "been copied and pasted.",
              "* The anchor is chosen by bulk, so a template between two "
              "similar-sized modules (two wall segments) reads in whichever "
              "direction the lexicographic tie-break fell. Chains are marked "
              "`selfChain`.",
              "* `neverAlone` is measured within one source set. A piece with "
              "few instances can read as never-alone on a thin sample; the "
              "instance count is in the table for that reason.",
              "* Unresolved references (a base object in a master not loaded) "
              "are lost from the pair search entirely, so counts are floors.",
              "* All lengths carry the 0.45 % `UNITS_PER_METRE` bias recorded "
              "in the companion placement docs.",
              ""]
    return "\n".join(lines) + "\n"


# --- cli ---------------------------------------------------------------------


def parse_sets(argv: list[str] | None):
    ap = argparse.ArgumentParser(description="mine co-placement templates")
    ap.add_argument("--set", action="append", default=[],
                    help="start a new source set with this id")
    ap.add_argument("--label", action="append", default=[])
    ap.add_argument("--plugin", action="append", default=[])
    ap.add_argument("--world", action="append", default=[])
    ap.add_argument("--names", action="append", default=[])
    ap.add_argument("--out", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--input", default=None,
                    help="mined json to render --report from, skipping the walk")
    ap.add_argument("--radius", type=float, default=12.0)
    ap.add_argument("--offset-tol", type=float, default=0.3)
    ap.add_argument("--yaw-tol", type=float, default=5.0)
    ap.add_argument("--min-count", type=int, default=3)
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--max-templates", type=int, default=600,
                    help="templates kept per set, most-repeated first")
    return ap


def grouped_sets(argv: list[str]) -> list[dict]:
    """Split the argv into one bundle per `--set`, so several sets can be
    mined in one deterministic run."""
    bundles: list[dict] = []
    current: dict | None = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--set":
            current = {"id": argv[i + 1], "label": "", "plugins": [],
                       "worlds": [], "names": []}
            bundles.append(current)
            i += 2
            continue
        if current is not None and arg in ("--label", "--plugin", "--world", "--names"):
            key = {"--label": "label", "--plugin": "plugins",
                   "--world": "worlds", "--names": "names"}[arg]
            if key == "label":
                current["label"] = argv[i + 1]
            else:
                current[key].append(argv[i + 1])
            i += 2
            continue
        i += 1
    return bundles


def main(argv: list[str] | None = None) -> None:
    import sys
    argv = list(sys.argv[1:] if argv is None else argv)
    args = parse_sets(argv).parse_args(argv)
    kits = kit_membership()

    if args.input:
        payload = json.loads(Path(args.input).read_text())
    else:
        bundles = grouped_sets(argv)
        sets: dict[str, dict] = {}
        for bundle in bundles:
            source = collect(bundle["plugins"], set(bundle["worlds"]),
                             bundle["names"], bundle["id"],
                             bundle["label"] or bundle["id"])
            sets[bundle["id"]] = analyse(source, args.radius, args.offset_tol,
                                         args.yaw_tol, args.min_count, kits,
                                         args.max_templates)
            m = sets[bundle["id"]]["macro"]
            print(f"{bundle['id']}: {m['structuralRefs']} structural refs, "
                  f"{m['templates']} templates, {m['groups']} groups")
        interiors = interior_records()
        doorways = doorways_from(sets, interiors)
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "source": {
                "method": "worldgen.mine_assemblies — co-placement templates: "
                          "pairs and groups of pieces the source authors placed "
                          "at a repeated relative offset and yaw, plus the "
                          "doorways that fall out of the door-piece templates. "
                          "Relations only.",
                "sets": {k: {"label": v["label"], "plugins": v["plugins"],
                             "worldspaces": v["worldspaces"]}
                         for k, v in sets.items()},
            },
            "parameters": {
                "radiusM": args.radius,
                "offsetToleranceM": args.offset_tol,
                "yawToleranceDeg": args.yaw_tol,
                "minCount": args.min_count,
                "maxTemplatesPerSet": args.max_templates,
            },
            "sets": sets,
            "doorwaysFromAssemblies": doorways,
            "gaps": {"shellsWithoutDoor": gaps_from(doorways, interiors)},
        }
        if args.out:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(payload, indent=1, sort_keys=False) + "\n")
            print(f"-> {out}")

    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(render_report(payload, args.top))
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
