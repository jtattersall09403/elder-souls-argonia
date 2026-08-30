"""Path-driven semantic classification for sourced meshes.

One classifier, shared by the asset registry sweep and the placement mining, so
"is this a tree?" is answered the same way everywhere. Rules are **directory
first** (a mesh under `landscape/trees/` is a tree whatever it is called),
with filename hints only refining the answer — matching the repo rule that
directory names are the reliable signal in asset archives and keyword search is
not (CLAUDE.md).

Every rule is data in the tables below; adding a source pool means adding rows,
not code. `classify()` returns the category plus tags and a confidence so the
registry can record how much a row is worth trusting.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# --- categories --------------------------------------------------------------
# Kept deliberately coarse: enough for a compiler to pick a pool from, not a
# botanical hierarchy. Sub-identity lives in tags.

CATEGORIES = (
    "tree", "shrub", "plant", "grass", "aquatic-plant", "fungus", "root",
    "rock", "terrain-feature", "deadfall", "ice",
    "architecture", "ruin", "dungeon-kit", "bridge", "dock",
    "furniture", "clutter", "container", "signage", "light", "trap", "door",
    "boat", "wreck", "vehicle",
    "creature", "character", "armour", "weapon", "ammo",
    "effect", "sky", "water", "lod", "marker", "misc",
)

#: Categories a scatter compiler may place on the ground layer.
SCATTER_CATEGORIES = frozenset({
    "tree", "shrub", "plant", "grass", "aquatic-plant", "fungus", "root",
    "rock", "deadfall", "terrain-feature",
})

#: Categories that are engine plumbing rather than world content — swept for
#: completeness counts but not worth a registry row.
NON_CONTENT_CATEGORIES = frozenset({"lod", "marker", "sky", "effect", "water"})


@dataclass(frozen=True)
class Classification:
    category: str
    cultures: tuple[str, ...] = ()
    biomes: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    confidence: float = 0.5

    def merged(self, **kw) -> "Classification":
        data = dict(
            category=self.category, cultures=self.cultures, biomes=self.biomes,
            tags=self.tags, confidence=self.confidence,
        )
        data.update(kw)
        return Classification(**data)


# --- rule tables -------------------------------------------------------------
# (path fragment, category, cultures, biomes, tags). Fragments are matched
# against the normalised forward-slashed lower-cased path; longer fragments win.

_DIR_RULES: tuple[tuple[str, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]], ...] = (
    # --- flora -------------------------------------------------------------
    ("landscape/trees", "tree", (), (), ()),
    ("landscape/dry trees", "tree", (), (), ("dead",)),
    ("landscape/plants", "plant", (), (), ()),
    ("landscape/grass", "grass", (), (), ()),
    ("landscape/rocks", "rock", (), (), ()),
    ("landscape/mountains", "terrain-feature", (), (), ("mountain",)),
    ("landscape/ice", "ice", (), ("alpine",), ()),
    ("landscape/roots", "root", (), (), ()),
    ("landscape/logs", "deadfall", (), (), ()),
    ("landscaping", "plant", (), (), ()),
    ("plants", "plant", (), (), ()),
    ("meshes/flora", "plant", (), (), ()),
    ("vurt_shroom", "fungus", (), (), ()),
    ("mushrooms", "fungus", (), (), ()),
    ("garden", "plant", (), (), ("cultivated",)),
    # --- terrain -----------------------------------------------------------
    ("stalactite", "terrain-feature", (), ("cave",), ()),
    ("terrain", "terrain-feature", (), (), ()),
    # --- structures --------------------------------------------------------
    ("architecture", "architecture", (), (), ()),
    ("dungeons", "dungeon-kit", (), ("cave",), ()),
    ("dungeons/caves", "dungeon-kit", (), ("cave",), ("natural",)),
    ("dungeons/ayleidruins", "ruin", ("ayleid",), (), ()),
    ("dungeons/dwemer", "dungeon-kit", ("dwemer",), (), ()),
    ("dungeons/nordic", "dungeon-kit", ("nordic",), (), ()),
    ("dungeons/imperial", "dungeon-kit", ("imperial",), (), ()),
    ("dungeons/mines", "dungeon-kit", (), (), ("mine",)),
    ("architecture/animal bones", "clutter", (), (), ("bones",)),
    ("architecture/xanmeer/interior", "dungeon-kit", ("argonian",), (), ()),
    ("architecture/xanmeer/furniture", "furniture", ("argonian",), (), ()),
    ("architecture/xanmeer/props", "clutter", ("argonian",), (), ()),
    # --- objects -----------------------------------------------------------
    ("clutter", "clutter", (), (), ()),
    ("furniture", "furniture", (), (), ()),
    ("furn", "furniture", (), (), ()),
    ("food", "clutter", (), (), ("food",)),
    ("clothes", "armour", (), (), ("clothing",)),
    ("armor", "armour", (), (), ()),
    ("weapons", "weapon", (), (), ()),
    ("ammo", "ammo", (), (), ()),
    ("traps", "trap", (), (), ()),
    ("actors", "creature", (), (), ()),
    ("critters", "creature", (), (), ("ambient",)),
    ("mihail monsters and animals", "creature", (), (), ()),
    # --- craft -------------------------------------------------------------
    ("nordships", "boat", ("nordic",), (), ()),
    ("breticships", "boat", ("breton",), (), ()),
    ("randomresourceships", "boat", (), (), ()),
    ("transport", "vehicle", (), (), ()),
    # --- landscape features (vanilla) --------------------------------------
    ("landscape/roads", "terrain-feature", (), (), ("road",)),
    ("landscape/bridges", "bridge", (), (), ()),
    ("landscape/dirtcliffs", "terrain-feature", (), (), ("cliff",)),
    ("landscape/snowdrifts", "terrain-feature", (), ("cold",), ()),
    ("landscape/volcanic", "terrain-feature", (), ("arid",), ()),
    ("landscape/tundra", "terrain-feature", (), ("cold",), ()),
    ("landscape/unique", "terrain-feature", (), (), ("unique",)),
    # --- bundled modder resources inside the BM&V pool ----------------------
    # BM&V ships other authors' resource packs under their own folder names;
    # these rows keep ~1.5k usable meshes out of the unclassified tail.
    ("lor/trees", "tree", (), (), ()),
    ("lor/valenwood", "tree", ("bosmer",), ("jungle",), ()),
    ("vurt/deadtrees", "tree", (), (), ("dead",)),
    ("trdata/flora", "plant", ("dunmer",), (), ()),
    ("trdata/mushrooms", "fungus", ("dunmer",), (), ()),
    ("trdata/wayshrine", "architecture", ("dunmer",), (), ("shrine",)),
    ("trdata/mausoleum", "ruin", ("dunmer",), (), ()),
    ("vvardenfell/rocks", "rock", (), (), ()),
    ("vvardenfell/flora", "plant", ("dunmer",), (), ()),
    ("vvardenfell/ashlanderhut", "architecture", ("dunmer",), ("arid",), ()),
    ("jokerinesresources", "clutter", (), (), ()),
    ("jokerinesresources/blankinnsign", "signage", (), (), ()),
    ("sheogorad", "architecture", ("nordic",), (), ()),
    ("manny_gf/alikr", "architecture", ("redguard",), ("arid",), ()),
    ("manny_gf/mausoleum", "ruin", (), (), ()),
    ("stroti", "clutter", (), (), ()),
    ("stroti/newcastle", "architecture", (), (), ()),
    ("stroti/dragonstone", "architecture", (), (), ()),
    ("stroti/tree house", "architecture", (), (), ("stilted",)),
    ("stroti/old mill", "architecture", (), (), ()),
    ("stroti/rustic furniture", "furniture", (), (), ()),
    ("griffon fortress", "architecture", (), (), ("fort",)),
    ("griffon fortress/crypt", "dungeon-kit", (), (), ()),
    ("griffon fortress/interior", "dungeon-kit", (), (), ()),
    ("tamira", "clutter", (), (), ()),
    ("billyro", "armour", (), (), ()),
    ("clutterresource", "clutter", (), (), ()),
    ("generalstores", "clutter", (), (), ()),
    ("oaristys", "clutter", (), (), ()),
    ("deco", "clutter", (), (), ()),
    ("signage", "signage", (), (), ()),
    ("garden", "plant", (), (), ("cultivated",)),
    ("telvanni", "architecture", ("dunmer",), (), ()),
    ("imp", "architecture", ("imperial",), (), ()),
    ("deity", "clutter", (), (), ("shrine",)),
    ("toys", "clutter", (), (), ()),
    ("shadowscale", "armour", ("argonian",), (), ()),
    ("1mjytropicalstuff", "ruin", (), ("underwater", "jungle"), ()),
    ("22mjymeshes", "architecture", (), ("jungle",), ()),
    ("spell_of_madness", "clutter", (), (), ()),
    ("[enz] - nightshade", "plant", (), (), ()),
    # --- plumbing ----------------------------------------------------------
    ("meshes/lod", "lod", (), (), ()),
    ("markers", "marker", (), (), ()),
    ("meshes/sky", "sky", (), (), ()),
    ("effects", "effect", (), (), ()),
    ("magic", "effect", (), (), ("magic",)),
    ("meshes/water", "water", (), (), ()),
    ("cameras", "marker", (), (), ()),
    ("interface", "marker", (), (), ()),
    ("loadscreenart", "marker", (), (), ()),
    ("shadertests", "marker", (), (), ()),
    ("animobjects", "misc", (), (), ("animation-prop",)),
    ("mps", "misc", (), (), ()),
)

#: Filename fragments that refine a flora/rock classification. Applied only
#: when the directory rule already put the asset in a plant-ish category, so a
#: "bush" in a weapons folder is not reclassified.
_FLORA_HINTS: tuple[tuple[str, str], ...] = (
    ("lilypad", "aquatic-plant"), ("lillipad", "aquatic-plant"),
    ("lilly", "aquatic-plant"), ("kelp", "aquatic-plant"),
    ("seaweed", "aquatic-plant"), ("coral", "aquatic-plant"),
    ("reed", "aquatic-plant"), ("cattail", "aquatic-plant"),
    ("bulrush", "aquatic-plant"), ("papyrus", "aquatic-plant"),
    ("mushroom", "fungus"), ("shroom", "fungus"), ("fungus", "fungus"),
    ("fungal", "fungus"), ("toadstool", "fungus"),
    ("root", "root"), ("vine", "plant"), ("liana", "plant"),
    ("bush", "shrub"), ("shrub", "shrub"), ("braken", "shrub"),
    ("bracken", "shrub"), ("hedge", "shrub"),
    ("fern", "plant"), ("grass", "grass"), ("moss", "plant"),
    ("log", "deadfall"), ("stump", "deadfall"), ("deadfall", "deadfall"),
    ("branch", "deadfall"), ("driftwood", "deadfall"),
    ("tree", "tree"), ("palm", "tree"), ("mangrove", "tree"),
    ("cypress", "tree"),
)

#: Filename fragments that add a biome tag anywhere.
_BIOME_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("snow", ("alpine", "cold")), ("frozen", ("alpine", "cold")),
    ("ice", ("alpine", "cold")), ("tundra", ("cold",)),
    ("swamp", ("swamp",)), ("marsh", ("swamp",)), ("bog", ("swamp",)),
    ("mangrove", ("swamp", "coastal")), ("bittercoast", ("swamp", "coastal")),
    ("jungle", ("jungle",)), ("tropical", ("jungle", "coastal")),
    ("palm", ("coastal", "jungle")), ("beach", ("coastal",)),
    ("coast", ("coastal",)), ("reef", ("underwater", "coastal")),
    ("underwater", ("underwater",)), ("water", ("aquatic",)),
    ("cave", ("cave",)), ("blackreach", ("cave",)),
    ("ashland", ("arid",)), ("desert", ("arid",)),
    ("deadtree", ("blighted",)), ("burnt", ("blighted",)),
)

#: Directory fragments that imply a culture (architecture and dungeon kits).
_CULTURE_HINTS: tuple[tuple[str, str], ...] = (
    ("whiterun", "nordic"), ("windhelm", "nordic"), ("solitude", "nordic"),
    ("riften", "nordic"), ("markarth", "reach"), ("nordic", "nordic"),
    ("imperial", "imperial"), ("rochester", "imperial"),
    ("dwemer", "dwemer"), ("dwarven", "dwemer"),
    ("ayleid", "ayleid"), ("falmer", "falmer"),
    ("telvanni", "dunmer"), ("vvardenfell", "dunmer"), ("phitt", "dunmer"),
    ("redoran", "dunmer"), ("velothi", "dunmer"),
    ("citebosmer", "bosmer"), ("bosmer", "bosmer"), ("valenwood", "bosmer"),
    ("argonian", "argonian"), ("xanmeer", "argonian"),
    ("shadowscale", "argonian"), ("hist", "argonian"),
    ("bshighrock", "breton"), ("breton", "breton"),
    ("orcish", "orsimer"), ("khajiit", "khajiit"),
)

#: Filename tokens strong enough to override a directory rule — assets filed
#: under the wrong tree (BM&V keeps its Morrowind trama roots under
#: `architecture/`, and they are placed as vegetation 2.9k times).
_STRONG_FLORA_TOKENS: tuple[tuple[str, str], ...] = (
    ("tramaroot", "root"), ("hangingroot", "root"), ("caveroot", "root"),
    ("mangrove", "tree"), ("palmtree", "tree"),
    ("lilypad", "aquatic-plant"), ("lillipad", "aquatic-plant"),
    ("kelp", "aquatic-plant"), ("seaweed", "aquatic-plant"),
    ("mushroom", "fungus"), ("toadstool", "fungus"),
)

_LOD_RE = re.compile(r"(_lod(_flat)?|_distant|lod_flat)\.nif$", re.I)


def normalise(path: str) -> str:
    return path.replace("\\", "/").lower().lstrip("/")


_SEGMENT_SUFFIXES = ("-", "_", " ", ".")


def _segment_match(segments: list[str], fragment: str) -> bool:
    """Directory rules match on **path segments**, never raw substrings.

    Substring matching quietly mis-files things (`xav_armorie_01.nif` is not
    armour), and asset archives are exactly where a wrong guess is expensive.
    The last part of a fragment may be a prefix of its segment so that
    `randomresourceships` still matches `randomresourceships-beds`.
    """
    parts = fragment.split("/")
    for start in range(len(segments) - len(parts) + 1):
        window = segments[start : start + len(parts)]
        if window[:-1] != parts[:-1]:
            continue
        tail, want = window[-1], parts[-1]
        if tail == want or (
            tail.startswith(want) and tail[len(want) : len(want) + 1] in _SEGMENT_SUFFIXES
        ):
            return True
    return False


def _hint_scan(text: str, table) -> tuple[str, ...]:
    found: list[str] = []
    for fragment, value in table:
        if fragment in text:
            values = value if isinstance(value, tuple) else (value,)
            for v in values:
                if v not in found:
                    found.append(v)
    return tuple(found)


def classify(path: str) -> Classification:
    """Classify one mesh path into a category plus culture/biome tags."""
    norm = normalise(path)
    stem = norm.rsplit("/", 1)[-1]

    if _LOD_RE.search(norm):
        return Classification("lod", confidence=0.95, tags=("lod-variant",))

    segments = norm.split("/")
    best: tuple[int, str, tuple[str, ...], tuple[str, ...], tuple[str, ...]] | None = None
    for fragment, category, cultures, biomes, tags in _DIR_RULES:
        if _segment_match(segments, fragment) and (best is None or len(fragment) > best[0]):
            best = (len(fragment), category, cultures, biomes, tags)

    if best is None:
        category, cultures, biomes, tags, confidence = "misc", (), (), (), 0.2
    else:
        _, category, cultures, biomes, tags = best
        confidence = 0.8

    # Flora/rock refinement from the filename.
    if category in {"tree", "plant", "shrub", "grass", "rock", "root", "fungus",
                    "aquatic-plant", "deadfall", "terrain-feature"}:
        for fragment, refined in _FLORA_HINTS:
            if fragment in stem:
                category = refined
                confidence = 0.85
                break
    else:
        for fragment, refined in _STRONG_FLORA_TOKENS:
            if fragment in stem:
                category = refined
                confidence = 0.55
                tags = tags + ("reclassified-by-name",)
                break

    biomes = tuple(dict.fromkeys(biomes + _hint_scan(norm, _BIOME_HINTS)))
    cultures = tuple(dict.fromkeys(cultures + _hint_scan(norm, _CULTURE_HINTS)))
    return Classification(category, cultures, biomes, tags, confidence)


def is_scatterable(category: str) -> bool:
    return category in SCATTER_CATEGORIES
