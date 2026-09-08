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
     ``interiorAssetRef`` names the sibling. A sibling that a kit PACKAGES is
     reported as rule (b) against that kit instead, with the mesh kept in
     ``matchedInteriorMesh``: the door links to a built kit, not to a loose
     mesh id, so the interior it promises can actually be loaded.
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
    ring but no roof);
  * ``medianWallM`` >= 1.5 m — there is room to stand. A solid block (a stone
    plinth, a pier, a rubble mass) hits in every direction at nearly zero range;
    and
  * ``frontFaceFraction`` >= 0.6 — the walls FACE the stander.

The last one is the one that stops the measurement lying. Game meshes are
hollow shells, so an eye dropped inside a closed prop — a plinth, a pool basin,
a stair block, a foundation, a plaza deck, a solid tower mass — measures a
perfect ring with a roof over it and metres of air, and reads as a room. It is
not a room; it is a lump seen from the wrong side. The difference is which way
the surfaces point: a real interior wall faces INWARD and shows the stander its
FRONT face, while a closed prop's faces all point outward and show only backs.
Measured across the built kits the two populations do not overlap — a piece
scores 0.00 or 1.00, hardly ever between — and it demotes 35 pieces the older
four criteria called buildings, each with a ``why`` that names the criterion and
a reported ``frontFaceFraction``.

The up and down rays are measured the same way and reported as ``roofFront``
and ``floorFront``, but they do NOT gate: most exterior shells ship no floor
mesh at all (the ground is the terrain), so a floor test would demote every
open-fronted stable and shed along with the props.

A closed shell is not automatically massing, though. A shell whose door is a
SEPARATE mesh is a real building that reads exactly like a prop from inside —
Morrowind Imperial keeps and HTBM's bamboo huts both do. So a piece that has
the shape of a room but fails the front-face test is promoted back to a
building when, and only when, something says it has a door: an opening or leaf
measured in its own mesh, a door piece the source authors placed against it, or
a door piece the kit composes onto it. No door evidence, no building
(``closedShellPromotedBy`` records which it was).

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

There are four ways a doorway is derived, tried in this order, and every one of
them is a measurement:

  1. **opening** — a contiguous arc, 0.8–5.0 m wide and at most 60 deg, where a
     ray fired from inside at 1.1 m escapes while the ring above the lintel
     holds, or where the door band comes back materially nearer than the wall
     above it (a leaf or blocking panel set into the wall).
  2. **open-front** — the same escaping arc, but wider than a door or with
     nothing overhead at all: a stable mouth, a cart shed, a veranda, a tent
     flap, a hall front. Accepted up to 120 deg so long as the rest of the ring
     is still wall. A 6 m stable mouth is an entrance a player walks through,
     and calling it "no door" was the older pass's mistake.
  3. **leaf** — the shut door modelled INTO the shell, so nothing escapes
     anywhere. Found by its plane: probe the ring at a ladder of heights, take
     each bin's farthest hit as the bare wall behind, and look for a patch that
     stands 0.02–0.3 m in front of that wall, 0.8–2.0 m wide and 1.8–3.0 m
     tall, standing on the floor. Validated against a case the placements also
     answer: on vanilla ``farmhouse02`` the leaf pass reads the door at
     bearing 170.0 deg and the 13 mined placements of its door piece put it at
     180.0-180.3 deg — 10 deg apart, inside the 15 deg the check allows. A
     shape name containing "door" is corroboration that may be recorded, never
     the evidence.
  4. **door-piece** — the entrance the family authored as its own mesh, when
     the shell's geometry and the placement mine both come back empty. The
     candidate is a sibling in the shell's own pool directory; the evidence is
     the FIT, measured in the shell's own frame: the piece's plan centre sits
     on the shell's measured wall line (or in the gap in it) within 0.4 m, its
     head stands 1.5-4.5 m above the shell's floor, and its foot is on that
     floor. BM&V's ``kioskaccesd01``/``kioskaccesi01`` land in ``kiosk01``'s
     two ring gaps to within 0.11 m and 0.02 m, which is what makes them that
     kiosk's way in and not a fence.

If the centroid pass finds no doorway at all, the probe stands again on a
one-metre lattice across the plan and keeps the reading that opens the widest
arc (``doorwayProbeCentreM`` records where it stood). The eye goes at the plan
centroid, and for a compact hut that is the middle of the room — but for a
piece whose plan takes in a veranda or a wing, BM&V's stilt house among them,
the centroid lands on the deck, outside the room, with the way in behind it.
The retry only ever runs when the first pass came back empty, so it can add a
doorway and never remove one.

**Doorways from assemblies.** A shell whose door is a SEPARATE mesh has no
opening in its own geometry, so the ray pass can never find one. For those the
second source is ``world/sources/placement/kit-assemblies-mined.json``
(``doorwaysFromAssemblies``, keyed by the shell's asset id): the offset at which
the source authors repeatedly placed a door piece against that shell, measured
from their own placements. The join, in order:

  1. the ray pass runs first and always;
  2. where it found an opening, that opening stands — the mesh's own geometry is
     the stronger evidence — and the mined doors are recorded alongside it under
     ``doorwaysCorroboration``;
  3. where it found none, the mined doors become the ``doorways``, each carrying
     ``doorwaySource: "assembly"``, the template ``count`` and ``doorAsset``,
     with no ``arcM`` (the placement says where the door is, not how wide the
     hole is);
  4. ``doorwaySource`` on the record says which pass produced the doorways
     (``"geometry"`` or ``"assembly"``), and ``doorwaysWhy`` names the door
     piece.

A mined door is either ``fixed`` — one repeated offset, so ``sideDeg`` and
``offsetM`` are known — or ``radial``: the authors placed the door at a constant
RADIUS but on any bearing (a round shell, a stronghold entrance turned to face
the street). A radial door is emitted as ``{radial: true, radiusM, ...}`` with
NO ``sideDeg`` and no ``offsetM``: the distance from the pivot is evidence, the
bearing is a siting decision the placer makes.

A COMPOSITE (a shell built with its door as one assembly, ``compose`` in the kit
config) has an id the mine has never seen. Its doors are its ANCHOR part's mined
doors, filtered to the door pieces the composite actually carries — the same
placement evidence that put the door in the composite in the first place.

Mined doorways are only ever attached to a piece the geometry already calls a
building (a matched, tileset or shell interior). A walkway that happened to have
a door placed at its end is still a walkway.

Where no pass yields an opening the record carries ``entrance: null`` and an
``entranceWhy`` saying so — a piece can be a genuine shell whose door is a
separate mesh (HTBM ships ``bamboohutdoor01`` as its own NIF), whose front is
open wider than a doorway, or whose walls are modular pieces measured one at a
time.

**ONE canonical entrance** (owner ruling 2026-09-07). A shell often carries
several of the evidences above at once, and the studio was drawing all of them:
"three different answers for where the door is". So the passes above are now
RANKED (``ENTRANCE_RANK``) and the record exports exactly one ``entrance``:

    esp-door > assembly > door-piece > leaf > opening > open-front

The losers are kept in ``provenance[]`` for audit — they are never drawn, and a
blueprint door is matched only against ``entrance``. ``entrance.radial`` is set
only where the plugin's or the authors' OWN placements put the door on different
sides across placements; a ray-measured opening is always a fixed side.

**A derived front for a piece with no entrance** (owner ruling 2026-09-07). A
gate arch, a wall stub, a tower, a deck or a shrine has no door to orient it,
and Skyrim ships no "front" metadata. ``front: {deg, evidence, outside, why}``
is derived in ``piece_front.py`` from how the authors themselves placed the
piece (the bearing away from its mined neighbours), else from which face they
detailed, else ``null`` for a symmetric piece. The blueprint validator holds
gate/wall/tower parcels to it: the outside face looks away from the settlement.


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

from . import piece_front as pf
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
ASSEMBLIES_PATH = (REPO_ROOT / "world" / "sources" / "placement"
                   / "kit-assemblies-mined.json")
#: The mined truth about which interior a shell opens onto (owner ruling
#: 2026-09-07). Produced by `worldgen.mine_door_links`; outranks every rule
#: below, because it is the mod's own load door rather than an inference.
LINKS_PATH = (REPO_ROOT / "world" / "sources" / "placement"
              / "exterior-interior-links.json")
SCHEMA_VERSION = 1

# --- enclosure / doorway measurement constants ----------------------------- #
BINS = 72                      # 5° rays around the horizon
EYE_HEIGHT_M = 1.6             # where the stander's eye sits above the floor
ENCLOSURE_MIN_RING = 0.75      # share of horizontal rays that must hit a wall
ENCLOSURE_MIN_ROOM_M = 1.5     # median wall distance: a room, not a solid block
ENCLOSURE_MIN_FRONT_FACE = 0.6  # share of ring hits whose triangle faces the eye
DOOR_BAND_M = 1.1              # eye height for the door probe (below any lintel)
LINTEL_BAND_M = 2.4            # eye height for the wall probe (above any lintel)
DOOR_RECESS_RATIO = 0.8        # door bin: <= this share of the wall's distance
MIN_CEILING_M = 2.2            # a room you can stand up in, not a crawl space
FLOOR_LADDER_M = (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0)
DOORWAY_MIN_ARC_M = 0.8
DOORWAY_MAX_ARC_M = 5.0
DOORWAY_MAX_BINS = BINS // 6   # 60°
MAX_DOORWAYS = 4
OPEN_FRONT_MAX_BINS = BINS // 3   # 120°: a stable front, a veranda, a hall mouth
LEAF_MIN_ARC_M = 0.8              # a baked-in door leaf is door-width, not wall-width
LEAF_MAX_ARC_M = 2.0
LEAF_MIN_TALL_M = 1.8             # ...and door-height
LEAF_MAX_TALL_M = 3.0
LEAF_MIN_PROUD_M = 0.02           # set into, or standing proud of, its frame
LEAF_MAX_PROUD_M = 0.3
LEAF_BAND_STEP_M = 0.3
LEAF_SILL_MAX_M = 0.6             # a door starts at the floor, not halfway up

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
    ("htbm:here there be monsters - curse of cipactli/architecture/villages/kothringi/swamp house",
     "htbm-hut-int",
     "the Kothringi swamp house takes the Kothringi `bamboohut01_int` room, packaged in htbm-hut-int"),
    ("mudmother:gv_meshes/argoniannest/",
     "vanilla-farmhouse-int",
     "Argonian nest exteriors are one-room mud dwellings; the farmhouse interior tileset is the "
     "single-room rustic grammar we own that fits them"),
    ("mudmother:gv_meshes/argoniannest/histtree",
     "dungeon-root-v1",
     "a hollow Hist trunk, not a built room: the root dungeon kit is the grown interior grammar for it"),
    ("bmv:architecture/huts/",
     "vanilla-farmhouse-int",
     "BM&V marsh hut exteriors ship no interior; the farmhouse interior tileset is the nearest "
     "single-room grammar we own"),
    ("bmv:architecture/stilthouse/",
     "vanilla-farmhouse-int",
     "the BM&V stilt house exterior ships no interior; its deck-level room is dressed from the "
     "farmhouse interior tileset"),
    ("bmv:architecture/ships/",
     "vanilla-imperial-int",
     "an Imperial ship's below-decks cabin: the Imperial interior tileset is the matching grammar"),
)

# Kits that ARE interiors: their modules are the inside, so they never claim one.
INTERIOR_KITS = ("xanmeer-interior-v1", "dungeon-root-v1", "vanilla-farmhouse-int",
                 "vanilla-imperial-int", "htbm-hut-int", "mudmother-hut-int",
                 "bmv-treehouse-int")

# --- rule (0): the plugin's own load door, which beats every rule below ----- #
# The manifest names the interior CELL a shell's door teleports to and the
# modal DIRECTORY of that cell's structural pieces (`interiorFamily`). This
# table is the only judgement left: which built kit packages that family. Keyed
# by directory prefix, longest match wins.
INTERIOR_FAMILY_KITS: tuple[tuple[str, str], ...] = (
    ("htbm:here there be monsters - curse of cipactli/architecture/villages/",
     "htbm-hut-int"),
    ("mudmother:gv_meshes/argoniannest", "mudmother-hut-int"),
    ("bmv:architecture/citebosmer/houses", "bmv-treehouse-int"),
    ("bmv:telvanni", "bmv-treehouse-int"),
    ("vanilla:architecture/farmhouse/interior", "vanilla-farmhouse-int"),
    ("vanilla:architecture/farmhouse", "vanilla-farmhouse-int"),
    ("vanilla:dungeons/imperial", "vanilla-imperial-int"),
    ("vanilla:architecture/imperial", "vanilla-imperial-int"),
    ("bmv:dungeons/ayleidruins", "xanmeer-interior-v1"),
    ("htbm:here there be monsters - curse of cipactli/architecture/ruins/xanmeer",
     "xanmeer-interior-v1"),
)

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


_LINKS_CACHE: dict | None = None


def load_door_links(path: Path = LINKS_PATH) -> dict[str, list[dict]]:
    """shell asset id -> its mined links, best-evidenced first."""
    global _LINKS_CACHE
    if _LINKS_CACHE is None:
        try:
            _LINKS_CACHE = json.loads(path.read_text()).get("shells", {})
        except (OSError, json.JSONDecodeError):
            _LINKS_CACHE = {}
    return _LINKS_CACHE


#: Distinct own-pool pieces an interior cell must share with a kit before that
#: kit is called its interior. One shared mesh is a coincidence.
MIN_KIT_PIECE_HITS = 3

_KIT_PIECES_CACHE: dict[str, set[str]] | None = None


def interior_kit_pieces(config_dir: Path | None = None) -> dict[str, set[str]]:
    """Built interior kit -> the asset ids it packages."""
    global _KIT_PIECES_CACHE
    if _KIT_PIECES_CACHE is None:
        config_dir = config_dir or (Path(__file__).resolve().parent / "config" / "kits")
        out: dict[str, set[str]] = {}
        for kit in INTERIOR_KITS:
            path = config_dir / f"{kit}.json"
            if not path.exists():
                continue
            try:
                cfg = json.loads(path.read_text())
            except json.JSONDecodeError:
                continue
            out[kit] = {a["asset"] for a in cfg.get("assets", []) if a.get("asset")}
        _KIT_PIECES_CACHE = out
    return _KIT_PIECES_CACHE


def kit_for_pieces(link: dict) -> str | None:
    """The interior kit that packages most of what this cell is actually made of.

    Stronger than any path table: the plugin says which pieces the interior is
    built from, so the kit that ships those pieces IS the kit for it.
    """
    pieces = {p["model"]: p.get("count", 1) for p in link.get("pieces") or []}
    if not pieces:
        return None
    # Only DISCRIMINATING pieces count. Half the interior kits ship the same
    # vanilla barrels and hay, so shared pieces say nothing about which kit an
    # interior is; a piece only one kit packages says everything.
    packaged_in: dict[str, int] = {}
    for packaged in interior_kit_pieces().values():
        for model in packaged:
            packaged_in[model] = packaged_in.get(model, 0) + 1
    best: tuple[int, int, str] | None = None
    for kit, packaged in sorted(interior_kit_pieces().items()):
        # A kit built on a mod's own pool is identified by THAT pool's pieces.
        # Its vanilla dressing is shared furniture and identifies nothing (a
        # Nord barracks and an Argonian mud hut both hold hay and sacks).
        own = {m.split(":", 1)[0] for m in packaged} - {"vanilla"}
        hits = [m for m in pieces
                if m in packaged and packaged_in.get(m) == 1
                and (not own or m.split(":", 1)[0] in own)]
        if not hits:
            continue
        if len(hits) < MIN_KIT_PIECE_HITS:
            continue   # one shared piece is a coincidence, not an identification
        score = (sum(pieces[m] for m in hits), len(hits), kit)
        if best is None or score[:2] > best[:2]:
            best = score
    return best[2] if best else None


def kit_for_family(family: str | None) -> str | None:
    best: tuple[int, str] | None = None
    if not family:
        return None
    for prefix, kit in INTERIOR_FAMILY_KITS:
        if family.startswith(prefix) and (best is None or len(prefix) > best[0]):
            best = (len(prefix), kit)
    return best[1] if best else None


def esp_link_for(asset_id: str, links: dict[str, list[dict]]) -> tuple[dict, str] | None:
    """The best-evidenced link for this shell whose interior family we build.

    A link whose family no kit packages is not usable evidence — it is a gap —
    so the search walks the link's ranked families before giving up.
    """
    for row in links.get(asset_id, ()):
        kit = kit_for_pieces(row)
        if kit:
            return row, kit
        families = [f["family"] for f in row.get("interiorFamilies") or []]
        for family in ([row.get("interiorFamily")] if row.get("interiorFamily") else []) + families:
            kit = kit_for_family(family)
            if kit:
                return row, kit
    return None


def find_tileset(asset_id: str) -> tuple[str, str] | None:
    """(tileset id, why) for the longest matching path rule, or None.

    FALLBACK ONLY. These rules guess an interior from a path prefix; the door
    manifest knows. A rule that fires is a shell no plugin links, and it warns
    so the gap stays visible.
    """
    best: tuple[int, str, str] | None = None
    for prefix, tileset, why in TILESET_RULES:
        if asset_id.startswith(prefix) and (best is None or len(prefix) > best[0]):
            best = (len(prefix), tileset, why)
    if best is None:
        return None
    print(f"  WARN interiors_index: {asset_id} has no mined door link; falling back to "
          f"the path rule '{best[0] and asset_id[:best[0]]}' -> {best[1]}")
    return (best[1], best[2])


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


def _ray_hits(triangles, origin, directions):
    """Nearest forward intersection per direction: (distance, front-face flag).

    Vectorised Moller-Trumbore, chunked over triangles so a 20k-triangle piece
    against 74 rays stays inside a few MB. Culling is two-sided on purpose:
    kit meshes are single-sided and often wound inconsistently, and for the
    *enclosure* question we care THAT a wall is there.

    The second return says which way the surface we hit was facing. A real
    interior wall faces INWARD, so the stander sees its front face
    (``normal . direction < 0``). A closed prop — a plinth, a pool basin, a
    solid tower mass — is a hollow shell whose faces all point OUTWARD, so an
    eye placed inside it sees only BACK faces. That is the measurable
    difference between "a room" and "the inside of a lump" (see
    ``frontFaceFraction``).
    """
    import numpy as np

    v0 = triangles[:, 0, :]
    edge1 = triangles[:, 1, :] - v0
    edge2 = triangles[:, 2, :] - v0
    normals = np.cross(edge1, edge2)
    out = np.full(len(directions), np.inf, dtype=np.float64)
    front = np.zeros(len(directions), dtype=bool)
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
            index = int(np.flatnonzero(hit)[np.argmin(t[hit])])
            out[i] = float(t[index])
            front[i] = bool(float(normals[index] @ direction) < 0.0)
    return out, front


def _ray_distances(triangles, origin, directions):
    """Distances only — kept for callers that do not need face orientation."""
    return _ray_hits(triangles, origin, directions)[0]


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
    dist, front = _ray_hits(triangles, origin, all_dirs)
    ring = dist[:BINS]
    hit = np.isfinite(ring)
    finite = ring[hit]
    ring_front = front[:BINS][hit]
    return {
        "ring": [float(d) for d in ring],
        "ringFront": [bool(f) for f in front[:BINS]],
        "ringFraction": float(len(finite)) / BINS,
        "frontFaceFraction": (float(ring_front.sum()) / len(finite)) if len(finite) else 0.0,
        "medianWallM": float(np.median(finite)) if len(finite) else 0.0,
        "roof": bool(np.isfinite(dist[BINS])),
        "roofFront": bool(np.isfinite(dist[BINS]) and front[BINS]),
        "floor": bool(np.isfinite(dist[BINS + 1])),
        "floorFront": bool(np.isfinite(dist[BINS + 1]) and front[BINS + 1]),
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
        # A storey that has the SHAPE of a room but whose faces point outward
        # (a closed prop, or a shell whose door is a separate mesh) is still the
        # best storey to report: the door-evidence join decides which it is.
        rank = (encloses_shape(probe), probe["ringFraction"])
        if best is None or rank > (encloses_shape(best), best["ringFraction"]):
            best = probe
    return best or {"ring": [math.inf] * BINS, "ringFront": [False] * BINS,
                    "ringFraction": 0.0, "frontFaceFraction": 0.0, "medianWallM": 0.0,
                    "roof": False, "roofFront": False, "floor": False, "floorFront": False,
                    "headroomM": float("inf"), "eyeY": base_y, "floorOffsetM": 0.0}


def is_enclosure(probe: dict) -> bool:
    """All five criteria: a ring of walls, a roof, headroom, room to stand, and
    the walls/roof/floor FACING the stander (criterion 5 — see ``_ray_hits``).

    Criterion 5 is what separates a room from the inside of a closed prop. Game
    meshes are hollow shells, so an eye dropped inside a plinth, a pool basin,
    a stair block or a solid tower mass measures a perfect ring with a roof
    over it. It is not a room; it is a lump seen from the wrong side, and its
    faces all point away. A real interior shows its front faces inward."""
    return encloses_shape(probe) and faces_inward(probe)


def encloses_shape(probe: dict) -> bool:
    """Criteria 1-4: a ring of walls, a roof, headroom, and room to stand."""
    return (probe["ringFraction"] >= ENCLOSURE_MIN_RING
            and probe["roof"]
            and probe["headroomM"] + EYE_HEIGHT_M >= MIN_CEILING_M
            and probe["medianWallM"] >= ENCLOSURE_MIN_ROOM_M)


def faces_inward(probe: dict) -> bool:
    """Criterion 5: the surfaces around the stander are turned TOWARDS them.

    Only the RING gates. The up and down rays are measured and reported
    (``roofFront``, ``floorFront``) but cannot gate: measured across the built
    kits, most exterior shells ship no floor mesh at all (the ground is the
    terrain), so a down-ray floor test would demote every open-fronted stable
    and shed along with the props, and plenty of genuine single-sided kit roofs
    show their back face to a stander underneath. The ring is 72 samples, and it
    separates the populations well but not cleanly: measured 2026-09-07 over the
    built kits, 47 of 379 measured pieces score strictly between 0.00 and 1.00,
    and 31 of the 49 pieces that fail this 0.6 gate are reinstated as buildings
    by the door-promotion branch below.
    """
    return probe.get("frontFaceFraction", 1.0) >= ENCLOSURE_MIN_FRONT_FACE


def _contiguous_runs(flags) -> list[list[int]]:
    """Contiguous runs of True around the ring, wrapping at 360 degrees."""
    if not flags.any() or flags.all():
        return []
    start = next(i for i in range(BINS) if flags[i] and not flags[(i - 1) % BINS])
    runs: list[list[int]] = []
    current: list[int] = []
    for step in range(BINS):
        index = (start + step) % BINS
        if flags[index]:
            current.append(index)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


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
    is_open_front = np.zeros(BINS, dtype=bool)
    for i in range(BINS):
        if not np.isfinite(w[i]):
            # Nothing overhead in this direction. Under a lintel that would be
            # a doorway; with no lintel it is the piece's OPEN FRONT — a stable
            # mouth, a veranda, a tent flap, a hall front — open from the floor
            # to the eaves. Still the way in, so it is collected separately and
            # emitted as `kind: "open-front"`.
            if not np.isfinite(d[i]):
                is_open_front[i] = True
            continue
        if not np.isfinite(d[i]):
            is_door[i] = True              # an open hole under a solid lintel
        elif d[i] <= DOOR_RECESS_RATIO * w[i]:
            is_door[i] = True              # a leaf or blocker set into the wall

    if not is_door.any() and not is_open_front.any():
        return [], ("no direction reads as a doorway — the ring at 1.1 m matches the wall above the "
                    "lintel all the way round, so the door is a separate mesh or the piece is a "
                    "modular wall segment; place the door on the side the design wants")
    if is_door.all():
        return [], "every direction reads as a doorway, so the measurement is not trustworthy here"

    # A run that escapes the wall is ONE entrance whether or not it keeps a
    # lintel for its whole width: a stable mouth is open under its gable in the
    # middle and under a header at its jambs. So the runs are cut on the union,
    # and a run is an OPEN FRONT if any of its bins has nothing overhead.
    escape = is_door | is_open_front
    runs = _contiguous_runs(escape)

    out = []
    bin_rad = 2.0 * math.pi / BINS
    wall_hits = int(np.isfinite(w).sum())
    ring = np.where(np.isfinite(d), d, np.nan)
    ring_median = float(np.nanmedian(ring)) if np.isfinite(ring).any() else 0.0
    for run in runs:
        open_front = bool(is_open_front[run].any())
        wall_r = [float(w[i]) for i in run if np.isfinite(w[i])]
        if wall_r:
            radius = sum(wall_r) / len(wall_r)
        else:
            # nothing overhead anywhere across the run: measure the entrance at
            # the wall line the rest of the ring stands on
            radius = ring_median
        if radius <= 0.0:
            continue
        arc = radius * bin_rad * len(run)
        if arc < DOORWAY_MIN_ARC_M:
            continue
        face = [float(d[i]) for i in run if np.isfinite(d[i])]
        face_r = sum(face) / len(face) if face else radius
        mid = (run[0] + (len(run) - 1) / 2.0) % BINS
        side_deg = ((mid + 0.5) * (360.0 / BINS)) % 360.0
        rad = math.radians(side_deg)
        entry = {
            "sideDeg": round(side_deg, 2),
            "offsetM": [round(centre[0] + face_r * math.sin(rad), 2),
                        round(centre[1] - face_r * math.cos(rad), 2)],
            "arcM": round(arc, 2),
        }
        if not open_front and len(run) <= DOORWAY_MAX_BINS and arc <= DOORWAY_MAX_ARC_M:
            entry["kind"] = "opening"
            out.append(entry)
            continue
        # An OPEN FRONT: a stable, a veranda, a tent mouth, a xanmeer hall. It
        # is wider than a door leaf, but it is still the way in — the rest of
        # the ring is wall and a player walks straight through it. Emitted as a
        # doorway of its own kind so the blueprint side treats it as an
        # entrance; a 6 m stable mouth is not "no door".
        rest_ring = int(np.isfinite(d).sum()) - len([i for i in run if np.isfinite(d[i])])
        if (len(run) <= OPEN_FRONT_MAX_BINS
                and rest_ring / max(BINS - len(run), 1) >= ENCLOSURE_MIN_RING):
            entry["kind"] = "open-front"
            out.append(entry)
    out.sort(key=lambda item: (-item["arcM"], item["sideDeg"]))
    if not out:
        return [], ("the openings measured are wider than an open front or narrower than 0.8 m — "
                    "a texture seam or a ring of modular walls, not a doorway")
    return out[:MAX_DOORWAYS], None


#: the retry probe stands on a lattice this many metres apart (at least), and
#: never uses more than RETRY_MAX_POINTS of them, so a big plan costs the same.
RETRY_STEP_M = 1.0
RETRY_MAX_POINTS = 144
RETRY_MIN_RING = 0.5


def doorways_retry_off_centre(triangles, plan, centre, floor_y, height_m):
    """Second try from off the plan centroid, when the centroid found no door.

    The eye goes at the piece's plan centroid, and for a compact hut that is the
    middle of the room. For a piece whose plan includes a veranda, a deck or a
    wing — BM&V's stilt house is a room with a veranda across its whole front —
    the centroid lands OUTSIDE the room, on the deck, where the doorway is
    behind the eye and every ray that would find it hits the house wall first.

    So when the centroid finds nothing, stand at a deterministic grid of points
    across the plan bounds instead and keep the reading from the enclosed point
    that opens the widest total arc. Only ever ADDS doorways: it does not run
    unless the centroid pass came back empty, and every point it uses has to
    pass the same enclosure test.
    """
    xs = [p[0] for p in plan]
    zs = [p[1] for p in plan]
    x0, x1 = min(xs), max(xs)
    z0, z1 = min(zs), max(zs)
    width = max(x1 - x0, RETRY_STEP_M)
    depth = max(z1 - z0, RETRY_STEP_M)
    step = max(RETRY_STEP_M,
               math.sqrt(width * depth / RETRY_MAX_POINTS))
    nx = max(int(width / step), 1)
    nz = max(int(depth / step), 1)
    best: tuple[float, list[dict], tuple[float, float]] | None = None
    for i in range(nx + 1):
        for j in range(nz + 1):
            point = (round(x0 + i * width / nx, 3), round(z0 + j * depth / nz, 3))
            if abs(point[0] - centre[0]) < 1e-6 and abs(point[1] - centre[1]) < 1e-6:
                continue
            probe = probe_from_inside(triangles, point, floor_y + EYE_HEIGHT_M)
            # The PIECE has already qualified as an enclosure at its centroid;
            # this second point only has to be inside it — under its roof, with
            # its walls facing the stander and half the ring still hitting one.
            if (not probe["roof"] or not faces_inward(probe)
                    or probe["ringFraction"] < RETRY_MIN_RING
                    or probe["medianWallM"] < ENCLOSURE_MIN_ROOM_M):
                continue
            doors, _ = doorways_from_probe(triangles, point, floor_y, height_m)
            if not doors:
                continue
            total = sum(d["arcM"] for d in doors)
            if best is None or total > best[0]:
                best = (total, doors, point)
    if best is None:
        return [], None
    return best[1], best[2]


def leaf_doorways(triangles, centre: tuple[float, float], floor_y: float,
                  height_m: float) -> list[dict]:
    """Doorways whose LEAF is modelled into the shell, found by its offset plane.

    Some exterior shells ship the shut door as part of the mesh, so no ray ever
    escapes and the opening/recess pass above finds nothing. What is still true
    of the geometry is that a door leaf sits on its own plane: set into its
    frame, or standing proud of the wall, by a couple of centimetres to a third
    of a metre — and only over a door-shaped patch, 0.8-2.0 m wide and
    1.8-3.0 m tall, standing on the floor.

    So: probe the ring at a ladder of heights, take each bin's FARTHEST hit over
    the ladder as the bare wall behind, and look for bins whose surface stands
    ``LEAF_MIN_PROUD_M``-``LEAF_MAX_PROUD_M`` in front of that wall over a
    contiguous height span of door height starting at the floor. Measured only:
    a shape name containing "door" is corroboration, never the evidence.
    """
    import numpy as np

    bands = []
    y = LEAF_BAND_STEP_M
    while y <= min(LEAF_MAX_TALL_M + LEAF_BAND_STEP_M, height_m - 0.05):
        bands.append(y)
        y += LEAF_BAND_STEP_M
    if len(bands) < int(LEAF_MIN_TALL_M / LEAF_BAND_STEP_M):
        return []
    rings = np.asarray([probe_from_inside(triangles, centre, floor_y + b)["ring"]
                        for b in bands], dtype=np.float64)
    backing = np.where(np.isfinite(rings), rings, -np.inf).max(axis=0)
    proud = backing[None, :] - rings
    leafish = (np.isfinite(rings) & (proud >= LEAF_MIN_PROUD_M) & (proud <= LEAF_MAX_PROUD_M))

    # per bin: the tallest run of leaf-ish bands that starts at the floor
    tall = np.zeros(BINS, dtype=np.float64)
    for i in range(BINS):
        run_h = 0.0
        for j, b in enumerate(bands):
            if leafish[j, i]:
                run_h += LEAF_BAND_STEP_M
            else:
                if b - run_h <= LEAF_SILL_MAX_M + 1e-6 and run_h >= LEAF_MIN_TALL_M:
                    break
                run_h = 0.0
        tall[i] = run_h
    is_leaf = (tall >= LEAF_MIN_TALL_M) & (tall <= LEAF_MAX_TALL_M + 1e-6)
    if not is_leaf.any() or is_leaf.all():
        return []

    start = next(i for i in range(BINS) if is_leaf[i] and not is_leaf[(i - 1) % BINS])
    runs: list[list[int]] = []
    current: list[int] = []
    for step in range(BINS):
        index = (start + step) % BINS
        if is_leaf[index]:
            current.append(index)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)

    bin_rad = 2.0 * math.pi / BINS
    out = []
    for run in runs:
        radii = [float(backing[i]) for i in run if np.isfinite(backing[i])]
        if not radii:
            continue
        radius = sum(radii) / len(radii)
        arc = radius * bin_rad * len(run)
        if not (LEAF_MIN_ARC_M <= arc <= LEAF_MAX_ARC_M):
            continue
        mid = (run[0] + (len(run) - 1) / 2.0) % BINS
        side_deg = ((mid + 0.5) * (360.0 / BINS)) % 360.0
        rad = math.radians(side_deg)
        face_r = float(np.median(rings[:, run][np.isfinite(rings[:, run])])) or radius
        out.append({
            "sideDeg": round(side_deg, 2),
            "offsetM": [round(centre[0] + face_r * math.sin(rad), 2),
                        round(centre[1] - face_r * math.cos(rad), 2)],
            "arcM": round(arc, 2),
            "heightM": round(float(tall[run].max()), 2),
            "kind": "leaf",
        })
    out.sort(key=lambda item: (-item["arcM"], item["sideDeg"]))
    return out[:MAX_DOORWAYS]


# --------------------------------------------------------------------------- #
# doorways from mined assemblies
# --------------------------------------------------------------------------- #
#: Interior classes whose piece is a building, and so may take a mined door.
BUILDING_INTERIORS = ("matched", "tileset", "shell")


KIT_CONFIG_DIR = Path(__file__).resolve().parent / "config" / "kits"


def composite_parts(kit_name: str, config_dir: Path = KIT_CONFIG_DIR) -> dict[str, list[str]]:
    """composite asset id -> the registry ids of its parts, in order.

    A composite is authored in the kit config, not in the built manifest, so
    the config is the only place that still knows which real asset each part
    is. The join needs it because ``doorwaysFromAssemblies`` is keyed by the
    SHELL's id: a `hut + door` composite has a new id of its own and would
    otherwise fall through both passes.
    """
    path = config_dir / f"{kit_name}.json"
    if not path.exists():
        return {}
    config = json.loads(path.read_text())
    out: dict[str, list[str]] = {}
    for entry in config.get("assets", []):
        compose = entry.get("compose")
        if compose:
            out[entry["asset"]] = [p["asset"] for p in compose.get("parts", [])]
    return out


def composite_doorways(parts: list[str],
                       mined: dict[str, list[dict]]) -> list[dict]:
    """The mined doors of a composite's ANCHOR that this composite actually
    contains.

    The anchor (part 0) is the shell, and the composite exists precisely
    because the authors hang a separate door on it — so the doors worth
    reporting are the ones whose door piece IS one of the composite's parts.
    A composite that stacks blocks or chains deck sections has none, and gets
    none.
    """
    if not parts:
        return []
    present = set(parts[1:])
    return [d for d in mined.get(parts[0], ()) if d.get("doorAsset") in present]


def load_assembly_doorways(path: Path = ASSEMBLIES_PATH) -> dict[str, list[dict]]:
    """asset id -> the mined door placements against that shell.

    Missing file is not an error: the index still builds from geometry alone
    (the mine is a separate, re-runnable pass over the source plugins).
    """
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    out: dict[str, list[dict]] = {}
    for shell, record in sorted((data.get("doorwaysFromAssemblies") or {}).items()):
        doors = record.get("doorways") or []
        if doors:
            out[shell] = doors
    return out


def assembly_doorway_entries(doors: list[dict]) -> list[dict]:
    """Mined door placements as ``doorways`` entries in the index's own frame.

    The mine measures ``offsetLocalM`` as ``[x, y, z]`` metres in the shell's
    own Z-UP local frame (Blender/NIF source space); this index reports plan
    offsets in the GLB frame the kit is exported to, where the same point is
    ``[x, -y]`` (glTF y-up export maps ``(x, y, z) -> (x, z, -y)``). ``sideDeg``
    needs no conversion at all: the mine's bearing is ``atan2(x, y)`` in the
    z-up frame and this module's is ``atan2(x, -z)`` in the GLB frame, which is
    the same angle about the same axis.

    No ``arcM`` is emitted — a placement says where the door stands, not how
    wide the hole in the wall is.
    """
    out: list[dict] = []
    for door in doors:
        entry: dict = {
            "doorwaySource": "assembly",
            "doorAsset": door.get("doorAsset"),
            "count": door.get("count"),
        }
        if door.get("kind") == "radial" or door.get("offsetLocalM") is None:
            entry["radial"] = True
            entry["radiusM"] = round(float(door.get("radiusM") or 0.0), 2)
        else:
            x, y, _z = door["offsetLocalM"]
            entry["sideDeg"] = round(float(door["sideDeg"]), 2)
            entry["offsetM"] = [round(float(x), 2), round(-float(y), 2)]
            entry["radiusM"] = round(float(door.get("radiusM") or 0.0), 2)
        out.append(entry)
    out.sort(key=lambda e: (-(e.get("count") or 0), e.get("sideDeg", 999.0)))
    return out[:MAX_DOORWAYS]


def _door_piece_names(doors: list[dict]) -> str:
    seen: list[str] = []
    for door in doors:
        piece = door.get("doorPiece") or door.get("doorAsset") or "a door piece"
        if piece not in seen:
            seen.append(piece)
    return ", ".join(seen)


def apply_assembly_doorways(record: dict, doors: list[dict]) -> None:
    """Fold the mined doors into a finished record, geometry first.

    Only ever called for a piece the geometry already calls a building.
    """
    entries = assembly_doorway_entries(doors)
    if not entries:
        return
    pieces = _door_piece_names(doors)
    if record.get("doorways"):
        record["doorwaySource"] = "geometry"
        record["doorwaysCorroboration"] = entries
        return
    record["doorways"] = entries
    record["doorwaySource"] = "assembly"
    record.pop("doorwaysWhy", None)
    top = entries[0]
    where = ("at a constant radius but on no fixed bearing"
             if top.get("radial") else f"at {top['sideDeg']:.0f} deg in the piece's own frame")
    record["doorwaysWhy"] = (
        f"the shell's own mesh has no opening — its door is a separate piece "
        f"({pieces}), which the source authors placed against it "
        f"{top['count']} times {where}; measured from placements, not geometry")


# --------------------------------------------------------------------------- #
# doorways from the family's own door piece (mechanism 4)
# --------------------------------------------------------------------------- #
#: basename fragments that a piece authored AS a door carries. Corroboration
#: only: a candidate is accepted on the FIT measurement below, never on this.
DOOR_PIECE_TOKENS = ("door", "entrance", "acces", "porte", "gateway")
DOOR_PIECE_FIT_M = 0.4          # how near the shell's wall line the piece must sit
DOOR_PIECE_MIN_TALL_M = 1.5
DOOR_PIECE_MAX_TALL_M = 4.5
DOOR_PIECE_MAX_SILL_M = 1.5     # its foot stands on (or just above) the floor


def door_piece_doorways(record: dict, asset_id: str,
                        bounds: dict[str, tuple]) -> list[dict]:
    """Doorways taken from the door piece the family authored for this shell.

    Last resort, and still a measurement. A modular set often ships its
    entrance as its own mesh — BM&V's ``kioskaccesd01`` for ``kiosk01``, its
    ``stilthousedooranim`` for ``stilthouseext`` — modelled in the SAME local
    frame as the shell it belongs to, which is exactly how the set was designed
    to be combined. So the candidate is any sibling mesh in the shell's own pool
    directory, and the evidence that it is THIS shell's door is the fit: the
    piece's plan centre has to sit on the shell's measured wall line, within
    ``DOOR_PIECE_FIT_M``, at the shell's own floor storey, and stand door
    height. A name containing "door" is corroboration recorded in the why; it
    is never the reason.
    """
    import numpy as np

    probe = record.get("_probe")
    if not probe:
        return []
    cx, cz = probe["centre"]
    ring = np.asarray(probe["ring"], dtype=np.float64)
    folder = asset_id.rsplit("/", 1)[0] if "/" in asset_id else asset_id
    out = []
    for other, (lo, hi) in sorted(bounds.items()):
        if other == asset_id or not other.startswith(folder + "/"):
            continue
        stem = other.rsplit("/", 1)[-1].lower()
        if not any(tok in stem for tok in DOOR_PIECE_TOKENS):
            continue
        # measured against the SHELL's floor, not the piece's own box: an
        # entrance is a thing whose head is at door height above the floor you
        # walk in on, and whose foot is at or near that floor.
        head = float(hi[1]) - probe["floorY"]
        foot = float(lo[1]) - probe["floorY"]
        if not (DOOR_PIECE_MIN_TALL_M <= head <= DOOR_PIECE_MAX_TALL_M):
            continue
        if foot > DOOR_PIECE_MAX_SILL_M:
            continue
        tall = head - max(foot, 0.0)
        px = float(lo[0] + hi[0]) / 2.0 - cx
        pz = float(lo[2] + hi[2]) / 2.0 - cz
        radius = math.hypot(px, pz)
        if radius <= 0.1:
            continue
        side_deg = _bearing_deg(px, pz)
        wall = float(ring[int(side_deg / (360.0 / BINS)) % BINS])
        span = float(np.median(ring[np.isfinite(ring)])) if np.isfinite(ring).any() else 0.0
        if math.isfinite(wall):
            # the piece stands ON the shell's wall line
            fit = abs(wall - radius)
            if fit > DOOR_PIECE_FIT_M:
                continue
            how = "on the wall line"
        else:
            # the shell's ring ESCAPES on this bearing and the piece stands in
            # that gap at the same radius as the wall either side: the opening
            # and the piece made for it are the same place, which is the
            # strongest fit the geometry can give.
            fit = abs(span - radius)
            if fit > DOOR_PIECE_FIT_M:
                continue
            how = "in the gap in the ring"
        out.append({
            "sideDeg": round(side_deg, 2),
            "offsetM": [round(cx + px, 2), round(cz + pz, 2)],
            "kind": "door-piece",
            "doorAsset": other,
            "fitM": round(fit, 3),
            "fitHow": how,
            "pieceHeightM": round(tall, 2),
        })
    out.sort(key=lambda item: (item["fitM"], item["sideDeg"]))
    return out[:MAX_DOORWAYS]


# --------------------------------------------------------------------------- #
# per-kit derivation
# --------------------------------------------------------------------------- #
def classify_asset(asset: dict, kit: str, verts, triangles,
                   pool_ids: dict[str, list[str]],
                   assembly_doors: list[dict] | None = None,
                   anchor_id: str | None = None) -> dict:
    """One asset's interior record, geometry first and assemblies second.

    ``verts``/``triangles`` may be None. ``assembly_doors`` is this asset's
    entry from ``doorwaysFromAssemblies`` (see ``apply_assembly_doorways``);
    it is only consulted for a piece the geometry calls a building.
    """
    links = load_door_links()
    link = (esp_link_for(anchor_id, links) if anchor_id else None) or \
        esp_link_for(asset["id"], links)
    record = _classify_geometry(asset, kit, verts, triangles, pool_ids,
                                door_evidence=bool(assembly_doors) or link is not None,
                                anchor_id=anchor_id)
    # The plugin decides WHICH interior a building opens onto and WHERE its
    # door is. It does not decide what counts as a building: that stays with
    # the geometry (owner ruling 2026-09-04), or a walkway with a door standing
    # on it would become a house.
    if link is not None and kit not in INTERIOR_KITS and record.get("interior") != "none":
        row, interior_kit = link
        shell_links = links.get(anchor_id or asset["id"]) or links.get(asset["id"]) or [row]
        apply_esp_link(record, row, interior_kit, shell_links)
        if assembly_doors:
            # The plugin's door leads, but a shell the source authors ALSO hung
            # a separate door piece on has both ways in; dropping the mined one
            # would blank a wall a blueprint already stands a threshold on.
            mined = {"doorways": [], "interior": record["interior"]}
            apply_assembly_doorways(mined, assembly_doors)
            esp = [d for d in record["doorways"] if d.get("kind") == "esp-door"]
            others = ([d for d in record["doorways"] if d.get("kind") != "esp-door"]
                      + [d for d in mined["doorways"] if d not in record["doorways"]])
            record["doorways"] = others[:MAX_DOORWAYS - len(esp)] + esp
        return record
    if assembly_doors and record.get("interior") in BUILDING_INTERIORS:
        apply_assembly_doorways(record, assembly_doors)
    elif record.get("doorways"):
        record["doorwaySource"] = "geometry"
    return record


ESP_DOOR_RADIAL_SPREAD_DEG = 45.0


def apply_esp_link(record: dict, link: dict, kit: str,
                   shell_links: list[dict] | None = None) -> None:
    """Overwrite a record with the plugin's own answer.

    Owner ruling 2026-09-07: an interior is what the mod's own door teleports
    to, never a filename guess, and the exterior door's offset in the shell is
    the derived entrance. So this outranks the matched-sibling rule, the path
    rules and the ray probe: the shell IS a building (something teleports into
    it), its interior IS this kit, and its doorway IS where the plugin hung the
    door.
    """
    offset = link.get("doorOffsetInShell") or {}
    record["interior"] = "tileset"
    record["tileset"] = kit
    # The tileset is now the answer to "what is inside"; a matched-sibling mesh
    # guess must not outrank it in `blueprint_interiors.interior_ref`.
    record.pop("interiorAssetRef", None)
    record["interiorSource"] = "esp-door"
    record["espLink"] = {
        "plugin": link.get("plugin"),
        "interiorCell": link.get("interiorCell"),
        "interiorFamily": link.get("interiorFamily"),
        "placements": link.get("placements"),
        "doorModel": link.get("doorModel"),
        "interiorSizeM": link.get("interiorSizeM"),
    }
    record["why"] = (
        f"{link.get('plugin')} teleports from this shell into interior cell "
        f"{link.get('interiorCell')} ({link.get('placements')} placements of the load "
        f"door); that cell is built from {link.get('interiorFamily')}, which is packaged "
        f"as {kit}")
    if offset:
        # Across every cell this shell opens onto, is the door always on the
        # same side, or at the same RADIUS on any side? A round hut whose
        # authors turned it to face each lane is the second kind, and calling
        # one of its bearings THE door would be a fiction (the same distinction
        # the mined-assembly doors already draw).
        rows = shell_links or [link]
        bearings = [float((r.get("doorOffsetInShell") or {}).get("sideDeg", 0.0))
                    for r in rows if r.get("doorOffsetInShell")]
        radial = False
        if len(bearings) > 1:
            first = bearings[0]
            spread = max(abs((b - first + 180.0) % 360.0 - 180.0) for b in bearings)
            radial = spread > ESP_DOOR_RADIAL_SPREAD_DEG
        radii = [float((r.get("doorOffsetInShell") or {}).get("radiusM", 0.0))
                 for r in rows if r.get("doorOffsetInShell")]
        placements = sum(int(r.get("placements") or 0) for r in rows)
        door = {
            "kind": "esp-door",
            "doorAsset": link.get("doorModel"),
            "placements": placements,
            "radiusM": round(sorted(radii)[len(radii) // 2], 3) if radii else None,
        }
        if radial:
            door["radial"] = True
        else:
            door.update(sideDeg=offset.get("sideDeg"),
                        offsetM=[offset.get("xM"), offset.get("yM")],
                        heightM=offset.get("zM"),
                        yawDeg=offset.get("yawDeg"))
        # A mesh with two ways in has two ways in: the shell's own measured
        # openings keep their INDEX (blueprints reference doorways by index)
        # and the plugin's door is added to them. `doorwaySource` records that
        # the link, not the probe, is what says this shell has an entrance.
        existing = [d for d in record.get("doorways", []) if d.get("kind") != "esp-door"]
        # The plugin's door is never the one dropped by the cap: it is the only
        # doorway backed by a teleport, and the validator looks for it.
        record["doorways"] = existing[:MAX_DOORWAYS - 1] + [door]
        record["doorwaySource"] = "esp-door"
        record["doorwaysWhy"] = (
            f"the exterior door {link.get('doorModel')} that opens this interior, "
            + ("at a constant radius on any bearing across the plugin's placements"
               if door.get("radial") else
               "at the offset the plugin places it in this shell's own frame")
            + f" ({placements} placements)")


def _classify_geometry(asset: dict, kit: str, verts, triangles,
                       pool_ids: dict[str, list[str]],
                       door_evidence: bool = False,
                       anchor_id: str | None = None) -> dict:
    """The geometric pass: everything measured from the asset's own mesh."""
    asset_id = asset["id"]
    record: dict = {"category": asset.get("category"), "doorways": []}

    if kit in INTERIOR_KITS or any(m in asset_id for m in INTERIOR_PATH_MARKERS):
        record.update(interior="none",
                      why=f"{kit} is an interior kit — these modules ARE the inside",
                      doorwaysWhy="interior modules have no exterior doorway")
        return record

    matched = find_matched_interior(anchor_id or asset_id, pool_ids)

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
        record["frontFaceFraction"] = round(probe.get("frontFaceFraction", 0.0), 3)
        record["medianWallM"] = round(probe["medianWallM"], 2)
        record["roofOverhead"] = probe["roof"]
        record["headroomM"] = round(min(probe["headroomM"] + EYE_HEIGHT_M, 99.0), 2)
        record["floorOffsetM"] = probe["floorOffsetM"]
        floor_y = base_y + probe["floorOffsetM"]
        room_h = height - probe["floorOffsetM"]
        record["_probe"] = {"centre": [cx, cz], "floorY": floor_y, "roomH": room_h,
                            "ring": probe["ring"]}
        encloses = is_enclosure(probe)
        closed_shell = encloses_shape(probe) and not faces_inward(probe)
        if encloses or closed_shell:
            doors, why_not = doorways_from_probe(triangles, (cx, cz), floor_y, room_h)
            if not doors:
                # the leaf pass: a door modelled shut into the shell
                doors = leaf_doorways(triangles, (cx, cz), floor_y, room_h)
                if doors:
                    why_not = None
            if not doors:
                doors, point = doorways_retry_off_centre(
                    triangles, plan, (cx, cz), floor_y, room_h)
                if doors:
                    why_not = None
                    record["doorwayProbeCentreM"] = [round(point[0], 2), round(point[1], 2)]
            record["doorways"] = doors
            if why_not:
                record["doorwaysWhy"] = why_not
        # A shell with the SHAPE of a room whose faces point outward is either a
        # closed prop or a building whose door is a separate piece. The evidence
        # that decides it is a door: one measured in its own mesh (a leaf, an
        # open front), or one the source authors placed against it / the kit
        # composes onto it. No evidence, no building.
        if closed_shell and (record["doorways"] or door_evidence):
            encloses = True
            record["closedShellPromotedBy"] = (
                "own-geometry-door" if record["doorways"] else "door-piece")

    if matched:
        # A matched sibling that a kit PACKAGES is reported against the kit: a
        # door links to a built, measured interior, and a loose mesh id is not
        # one. The mesh stays on the record as `matchedInteriorMesh`.
        packaged = find_tileset(anchor_id or asset_id)
        if packaged:
            record.update(interior="tileset", tileset=packaged[0],
                          matchedInteriorMesh=matched, why=packaged[1])
        else:
            record.update(interior="matched", interiorAssetRef=matched,
                          why=(f"the {asset_id.split(':', 1)[0]} pool ships {matched} as this piece's "
                               f"matched interior, authored to fit it"))
        return record

    # A composite has an id of its own (``composite:<family>/<name>``) that no
    # family rule can match, so the interior link is the one its ANCHOR part
    # carries: the composite IS that shell, with its door hung on.
    tileset = find_tileset(anchor_id or asset_id)
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
    elif probe.get("frontFaceFraction", 1.0) < ENCLOSURE_MIN_FRONT_FACE:
        why = (f"a closed prop seen from inside, not a room — only "
               f"{probe.get('frontFaceFraction', 0.0):.0%} of the ring hits show a face turned "
               f"towards the stander (a room needs {ENCLOSURE_MIN_FRONT_FACE:.0%}"
               + ("" if probe.get("floorFront", True) else ", and the down ray finds no up-facing floor")
               + ("" if probe.get("roofFront", True) else ", and the up ray finds no down-facing ceiling")
               + f"): the mesh is a hollow shell whose faces all point outward, so this is massing "
                 f"— a plinth, a basin, a stair block, a tower mass — usable as a solid, never entered")
    else:
        why = (f"solid, not hollow — walls are only {probe['medianWallM']:.1f} m away at 1.6 m "
               f"(a room needs {ENCLOSURE_MIN_ROOM_M} m), so this is massing, not a building you enter")
    record.update(interior="none", why=why, doorways=[],
                  doorwaysWhy="not an enclosure, so no doorway is derived")
    return record


# --------------------------------------------------------------------------- #
# ONE canonical entrance (owner ruling 2026-09-07)
# --------------------------------------------------------------------------- #
#: The evidence ladder for where a piece's door is, best first. A shell can
#: carry several kinds of evidence at once — the plugin's own load door, a door
#: part the authors hung on it, a leaf modelled into the mesh, an opening the
#: ray probe measured, an open front — and drawing all of them gave "three
#: different answers for where the door is" (owner ruling 2026-09-07). The
#: index now RANKS them and exports exactly one `entrance`; the losers stay in
#: `provenance` for audit, and are never drawn or matched against.
ENTRANCE_RANK: tuple[str, ...] = (
    "esp-door",     # the mod's own door teleport offset: evidence, not inference
    "assembly",     # a door part the source authors repeatedly placed on this shell
    "door-piece",   # the entrance mesh the family authored, fitted to the wall line
    "leaf",         # a shut door modelled into the shell
    "opening",      # a hole in the wall, measured by ray
    "open-front",   # a front wider than a door: a way in, but not a doorway
)


def entrance_kind(entry: dict) -> str:
    """The evidence kind of a doorway entry, however it was recorded."""
    return entry.get("kind") or entry.get("doorwaySource") or "opening"


def _entrance_sort_key(entry: dict) -> tuple:
    kind = entrance_kind(entry)
    rank = ENTRANCE_RANK.index(kind) if kind in ENTRANCE_RANK else len(ENTRANCE_RANK)
    weight = float(entry.get("placements") or entry.get("count") or 0)
    return (rank, -weight, float(entry.get("sideDeg", 999.0)))


def finalise_entrance(record: dict) -> None:
    """Collapse a record's doorway evidence into ONE `entrance` + `provenance`.

    Ranked by ``ENTRANCE_RANK``. The winner keeps its own measured fields; a
    radial winner (the door turned to different sides across the plugin's or
    the authors' own placements) keeps `radial` and its ring radius, and only
    the plugin/assembly passes can produce one — a ray-measured opening is
    always a fixed side.
    """
    candidates = [dict(d) for d in (record.pop("doorways", None) or [])]
    candidates += [dict(d) for d in (record.pop("doorwaysCorroboration", None) or [])]
    record.pop("doorwaySource", None)
    why = record.pop("doorwaysWhy", None)
    for entry in candidates:
        entry["kind"] = entrance_kind(entry)
    candidates.sort(key=_entrance_sort_key)
    if not candidates:
        record["entrance"] = None
        record["provenance"] = []
        record["entranceWhy"] = why or "no door evidence of any kind for this piece"
        return
    winner = candidates[0]
    if winner.get("radial") and winner["kind"] not in ("esp-door", "assembly"):
        # Only placement evidence can show a door turned to different sides;
        # geometry measures one opening on one side.
        winner.pop("radial", None)
    record["entrance"] = winner
    record["provenance"] = candidates[1:]
    if why:
        record["entranceWhy"] = why


def index_kit(kit_name: str, kits_dir: Path = KITS_DIR,
              registry_dir: Path = REGISTRY_DIR) -> dict:
    import trimesh

    manifest = json.loads((kits_dir / f"{kit_name}.kit.json").read_text())
    scene = trimesh.load(kits_dir / f"{kit_name}.glb", process=False)
    node_names = set(scene.graph.nodes)
    by_asset_id = glb_asset_id_nodes(kits_dir / f"{kit_name}.glb")
    pool_ids = load_pool_ids(registry_dir)
    mined_doors = load_assembly_doorways()
    parts_of = composite_parts(kit_name)

    coplacements = pf.load_coplacements()

    assets: dict[str, dict] = {}
    bounds: dict[str, tuple] = {}
    tris_of: dict[str, object] = {}
    for asset in sorted(manifest["assets"], key=lambda a: a["id"]):
        node = _resolve_node(asset, node_names, by_asset_id)
        verts = _asset_vertices(scene, node) if node else None
        triangles = asset_triangles(scene, node) if node else None
        tris_of[asset["id"]] = triangles
        # A composite has an id of its own that the mine has never seen, so its
        # doors come from its ANCHOR part's mined record, filtered to the door
        # pieces the composite actually carries.
        doors = (composite_doorways(parts_of[asset["id"]], mined_doors)
                 if asset["id"] in parts_of else mined_doors.get(asset["id"]))
        anchor = parts_of[asset["id"]][0] if asset["id"] in parts_of and parts_of[asset["id"]] else None
        assets[asset["id"]] = classify_asset(
            asset, kit_name, verts, triangles, pool_ids, doors, anchor_id=anchor)
        if verts is not None and len(verts):
            bounds[asset["id"]] = (verts.min(axis=0), verts.max(axis=0))

    # mechanism 4: a building the mesh and the mine both left doorless takes the
    # door piece its own family authored for it, fitted to its measured wall.
    for asset_id, record in assets.items():
        # An esp-door on its own is a link, not an opening in this mesh: the
        # door-piece pass still runs so the shell keeps its authored entrance.
        if record.get("interior") in BUILDING_INTERIORS and not [
                d for d in record.get("doorways") or [] if d.get("kind") != "esp-door"]:
            source = parts_of.get(asset_id, [asset_id])[0]
            doors = door_piece_doorways(record, source, bounds)
            if doors:
                record["doorways"] = (record.get("doorways") or []) + doors
                record["doorwaySource"] = "door-piece"
                pieces = ", ".join(sorted({d["doorAsset"].rsplit("/", 1)[-1] for d in doors}))
                record["doorwaysWhy"] = (
                    f"the shell's own mesh has no opening — its entrance is a separate piece its "
                    f"pool ships in the same directory ({pieces}), modelled in the shell's own "
                    f"frame and measured to sit on its wall line to within "
                    f"{max(d['fitM'] for d in doors):.2f} m")
    # ONE canonical entrance per piece, and — for the pieces that have none — a
    # derived front, so a gate arch or a wall stub still knows which way round
    # it goes (owner rulings 2026-09-07).
    for asset_id, record in assets.items():
        record.pop("_probe", None)
        finalise_entrance(record)
        if record.get("entrance") is None:
            source = parts_of.get(asset_id, [asset_id])[0]
            record["front"] = (pf.derive_front(asset_id, tris_of.get(asset_id), coplacements)
                               or pf.derive_front(source, None, coplacements))

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
            "entranceRank": list(ENTRANCE_RANK),
            "entranceRankWhy": (
                "one canonical entrance per piece (owner ruling 2026-09-07), ranked from "
                "the mod's own load door down to an open front; the losing evidence stays "
                "in `provenance` for audit and is never drawn or matched against"),
            "frontEvidence": ["co-placement (the bearing away from the neighbours the "
                              "source authors planted around this piece)",
                              "asymmetry (the bearing band with the highest triangle "
                              "density: the detailed, outward face)"],
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
        by_kind: dict[str, int] = {}
        by_front: dict[str, int] = {}
        for record in data["assets"].values():
            tally[record["interior"]] = tally.get(record["interior"], 0) + 1
            entrance = record.get("entrance")
            if entrance:
                kind = entrance.get("kind") or "?"
                by_kind[kind] = by_kind.get(kind, 0) + 1
            front = record.get("front")
            if front:
                by_front[front["evidence"]] = by_front.get(front["evidence"], 0) + 1
        summary = ", ".join(f"{k} {tally[k]}" for k in sorted(tally))
        entrances = ", ".join(f"{k} {by_kind[k]}" for k in sorted(by_kind)) or "none"
        fronts = ", ".join(f"{k} {by_front[k]}" for k in sorted(by_front)) or "none"
        print(f"interiors_index: {out.name} — {summary}; entrances by evidence: "
              f"{entrances}; fronts: {fronts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
