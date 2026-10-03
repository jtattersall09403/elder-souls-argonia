"""Record coherence (walk 8, owner: Riverwalk's prose put it "between Stormhold
and Alten Corimont" on a coast lane it is nowhere near, and its quest LV40
premised a channel it does not have).

``coherence_failures`` checks what a place record and the quests anchored at
it SAY against what the world HAS: every place, city and registry route the
prose names must relate to the place (relations, 5 km, or a route within
3 km that ends there); "between A and B" needs a route A-B within 3 km; a
feature a quest premises (channel, ferry, shrine ...) must exist in the
record's structure, the compiled place, or the water within 3 km.

Names are read from their home tables (catalogue, anchors, route registry;
standard 18); route geometry is the shipped province data, px converted the
way ``audit_place_semantics.load_routes`` does it ((p + 0.5) * metresPerPixel).

A plant the record's prose says grows here needs a handful of frozen
vegetation instances within 200 m (owner walk 9: "cove in mangrove forest"
with no mangrove in sight). The packet's scene section says what stands on
land, water or islet, what each run's ends touch and what grows nearby.

CLI: ``--place <id>`` or ``--all-built`` writes
``tooling/.reports/16k/<short-id>/coherence-packet.md``; ``--changed`` grades
every record a change set touches and every place referencing one and writes
``tooling/.reports/16k/changeset-packet.md`` (before/after per record);
``--receipt`` refreshes ``world/sources/catalogue/coherence-receipt.json`` and
fails on a record green at HEAD and red now (``record.regression``).
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import catalogue
from .promise_gate import PHYSICAL_NOUNS

REPO = catalogue.REPO_ROOT
SRC = REPO / "world" / "sources"
PROVINCE = REPO / "apps" / "world-studio" / "public" / "province"
REPORTS = REPO / "tooling" / ".reports" / "16k"
BUILT = ("place.dunmer-north.riverwalk", "place.imperial-fringe.claywater-station",
         "place.hist-heartland.greenspring")

NEAR_M = 5000.0
ROUTE_M = 3000.0
MIN_NAME = 4
TOWN_PLUS = {"M3", "M4", "M5"}

# keys whose strings are identifiers, references or machine data, never prose
SKIP_KEYS = {"id", "aliases", "sources", "assetPlan", "scourSiteIds", "relations", "sockets",
             "classification", "regionClasses", "landformClasses", "candidatesConsidered",
             "position", "positionM", "deedCounterKeys", "rumourPoolKey", "eraLayers",
             "occupants", "tierOwnership", "traversalModes", "provenance", "confidence",
             "status", "workflow", "densityLayer", "entrance", "season", "culture"}
QUEST_PROSE = ("title", "premise", "provision", "summary", "hook", "notes")

# feature -> (prose pattern, satisfier tokens in compiled ids and assets, water
# classes nearby): one noun table (promise_gate.PHYSICAL_NOUNS), plus the
# water that keeps a water noun
FEATURE_WATER = {"channel": ("channel", "river", "lane"), "canal": ("channel",),
                 "ferry": ("lane", "crossing"), "boat": ("lane", "crossing", "channel", "river")}
FEATURES: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    noun: (pat, toks, FEATURE_WATER.get(noun, ())) for noun, (pat, toks) in PHYSICAL_NOUNS.items()}


@dataclass
class Route:
    id: str
    name: str
    cls: str
    ends: tuple[str | None, str | None]   # endpoint place ids (None: unresolved)
    raw_ends: tuple[str, str]
    pts: np.ndarray | None                # (n, 2) metres, or None when unlaid
    source: str = ""


@dataclass
class Index:
    places: dict[str, dict]
    place_file: dict[str, str]
    names: dict[str, tuple[str, str]]       # name -> (kind, id)
    name_re: re.Pattern
    routes: dict[str, Route]
    channels: list[dict]                    # waterways-minor channels (pointsM)
    services: dict
    quests: list[tuple[str, dict]]          # (file, quest)
    lines: dict[str, dict[str, int]] = field(default_factory=dict)
    # frozen vegetation, chunk -> (speciesOrder index per instance, (n, 2) x/z); None: undressed.
    # Tests inject a dict here; build_index leaves it lazily filled from disk.
    vegetation: dict[tuple[int, int], tuple[np.ndarray, np.ndarray] | None] = field(default_factory=dict)
    vegetation_dir: Path | None = None
    cache: dict = field(default_factory=dict)   # per-index memo (vegetation meta, station places)
    _reverse: dict[str, dict[str, set[str]]] | None = None


def _px_pts(px, mpp: float) -> np.ndarray:
    a = np.asarray(px, dtype=np.float64)
    return (a + 0.5) * mpp


def build_index() -> Index:
    places, place_file = {}, {}
    for rf in catalogue.load_region_files():
        for p in rf.places:
            places[p["id"]] = p
            place_file[p["id"]] = str(rf.path.relative_to(REPO))
    # A route place (16k type 10) has its home row in the route-place table.
    from .blueprint import ROUTE_PLACES, route_place_records
    for pid, rec in route_place_records().items():
        places.setdefault(pid, rec)
        place_file.setdefault(pid, str(ROUTE_PLACES.relative_to(REPO)))
    by_name: dict[str, list[str]] = {}
    for pid in sorted(places):
        n = places[pid].get("name") or ""
        if len(n) >= MIN_NAME:
            by_name.setdefault(n, []).append(pid)
    anchors = json.loads((SRC / "anchors" / "settlement-anchors.json").read_text())["anchors"]

    def resolve_end(eid: str) -> str | None:
        if eid.startswith("place."):
            return eid if eid in places else None
        for a in anchors:
            if a["id"] == eid and by_name.get(a["name"]):
                return by_name[a["name"]][0]
        hits = sorted(pid for pid in places if pid.rsplit(".", 1)[-1] == eid)
        return hits[0] if hits else None

    mpp = float(json.loads((PROVINCE / "hydrology-meta.json").read_text())["metresPerPixel"])
    geom: dict[str, tuple[np.ndarray, str]] = {}
    for r in json.loads((PROVINCE / "routes.json").read_text())["routes"]:
        geom[r["id"]] = (_px_pts(r["px"], mpp), "routes.json")
    for lane in json.loads((PROVINCE / "waterways.json").read_text())["lanes"]:
        geom[lane["id"]] = (_px_pts(lane["px"], mpp), "waterways.json")
    minor = json.loads((PROVINCE / "routes-minor.json").read_text())
    mmpp = float(minor["grid"]["metresPerPixel"])
    for t in minor["tracks"]:
        if t.get("registryRoute"):
            geom.setdefault(t["registryRoute"], (_px_pts(t["px"], mmpp), "routes-minor.json"))
    channels = json.loads((PROVINCE / "waterways-minor.json").read_text())["channels"]
    for c in channels:
        geom.setdefault(c["id"], (np.asarray(c["pointsM"], dtype=np.float64), "waterways-minor.json"))

    routes: dict[str, Route] = {}
    for r in json.loads((SRC / "routes" / "registry.json").read_text())["routes"]:
        g = geom.get(r.get("geometryId") or r["id"])
        routes[r["id"]] = Route(r["id"], r.get("name") or "", r.get("class") or r.get("mode") or "",
                                (resolve_end(r["from"]), resolve_end(r["to"])), (r["from"], r["to"]),
                                g[0] if g else None, g[1] if g else "unlaid")
    names: dict[str, tuple[str, str]] = {}
    for n, ids in by_name.items():
        names[n] = ("place", ids[0])
    for rid in sorted(routes):
        n = routes[rid].name
        bare = re.sub(r"^the\s+", "", n)
        if len(bare) >= MIN_NAME and bare[:1].isupper():
            names.setdefault(bare, ("route", rid))
    alts = sorted(names, key=lambda s: (-len(s), s))
    name_re = re.compile(r"(?<![\w-])(" + "|".join(re.escape(n) for n in alts) + r")(?![\w-])")
    quests = []
    for f in sorted(glob.glob(str(SRC / "quests" / "*.json"))):
        doc = json.loads(Path(f).read_text())
        for q in doc.get("quests", []) if isinstance(doc, dict) else []:
            quests.append((str(Path(f).relative_to(REPO)), q))
    services = json.loads((SRC / "routes" / "travel-services.json").read_text())
    return Index(places, place_file, names, name_re, routes, channels, services, quests,
                 vegetation_dir=PROVINCE / "vegetation")


# --------------------------------------------------------------- geometry

def poly_dist(pts: np.ndarray | None, p) -> float:
    if pts is None or len(pts) == 0:
        return math.inf
    q = np.asarray(p[:2], dtype=np.float64)
    if len(pts) == 1:
        return float(np.hypot(*(pts[0] - q)))
    a, b = pts[:-1], pts[1:]
    ab = b - a
    t = np.clip(((q - a) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-12), 0.0, 1.0)
    d = a + ab * t[:, None] - q
    return float(np.sqrt((d * d).sum(1)).min())


def pdist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


# --------------------------------------------------------------- record views

def prose_strings(obj, path: str = "") -> list[tuple[str, str]]:
    """(field path, text) for every prose string; ids, refs and numbers skipped."""
    out: list[tuple[str, str]] = []
    if isinstance(obj, dict):
        for k in sorted(obj):
            if k in SKIP_KEYS or k.endswith(("Id", "Ids", "Ref", "Refs", "Path")):
                continue
            out += prose_strings(obj[k], f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += prose_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str) and " " in obj.strip():
        out.append((path, obj))
    return out


def anchored_quests(place_id: str, index: Index) -> list[tuple[str, dict]]:
    if "anchored" not in index.cache:
        by: dict[str, list[tuple[str, dict]]] = {}
        for f, q in index.quests:
            for pid in dict.fromkeys([q.get("settlement")] + list(q.get("anchorPlaces") or [])):
                if isinstance(pid, str):
                    by.setdefault(pid, []).append((f, q))
        index.cache["anchored"] = by
    return list(index.cache["anchored"].get(place_id, []))


def quest_prose(q: dict) -> list[tuple[str, str]]:
    return [(k, q[k]) for k in QUEST_PROSE if isinstance(q.get(k), str)]


def routes_near(pos, index: Index, within: float = ROUTE_M) -> list[tuple[float, Route]]:
    out = [(poly_dist(r.pts, pos), r) for r in index.routes.values()]
    return sorted(((d, r) for d, r in out if d <= within), key=lambda x: (x[0], x[1].id))


def station_place(st: dict, index: Index) -> str | None:
    pos = st.get("positionM")
    if not pos:
        return None
    key = ("station", tuple(pos))
    if key not in index.cache:
        best = min(((pdist(pos, p["positionM"]), pid) for pid, p in index.places.items()
                    if p.get("positionM")), default=None)
        index.cache[key] = best[1] if best else None
    return index.cache[key]


def travel_rows(place_id: str, index: Index) -> tuple[list[dict], set[str]]:
    """Services that touch the place (operator or a hop station nearest it),
    and every place those services reach."""
    rec = index.places[place_id]
    stations = {s["id"]: s for s in index.services.get("stations", [])}
    near = {sid for sid, s in stations.items()
            if s.get("positionM") and rec.get("positionM")
            and pdist(s["positionM"], rec["positionM"]) <= (rec.get("footprintRadiusM") or 100) + 300}
    rows, reached = [], set()
    for sv in index.services.get("services", []):
        hop_st = {h.get(k) for h in sv.get("hops") or [] for k in ("from", "to")} - {None}
        op = (sv.get("operator") or {}).get("nearestPlaceId")
        if op == place_id or hop_st & near:
            rows.append(sv)
            for sid in sorted(hop_st):
                pid = station_place(stations[sid], index) if sid in stations else None
                if pid:
                    reached.add(pid)
            if op:
                reached.add(op)
    return rows, reached


def related_ids(rec: dict, index: Index) -> set[str]:
    out: set[str] = set()
    for vals in (rec.get("relations") or {}).values():
        for v in vals if isinstance(vals, list) else [vals]:
            if isinstance(v, str):
                out.add(v)
                if v in index.routes:
                    out.update(e for e in index.routes[v].ends if e)
    for pr in (rec.get("why") or {}).get("pressuresWith", []) if isinstance(rec.get("why"), dict) else []:
        if isinstance(pr, str):
            out.add(pr)
    return out


# --------------------------------------------------------------- the gate

def _shows(blob: str, toks: tuple[str, ...]) -> bool:
    """An asset blob shows a feature token: a word of four letters or more
    anywhere in an asset name (`argonianbone01`, `roadsign`), a shorter one
    at a word start (`orestack`, never `shore`)."""
    return any((t in blob) if len(t) >= 4 else re.search(rf"(?<![a-z]){t}", blob) for t in toks)


def _feature_satisfiers(rec: dict, compiled: dict | None, index: Index) -> str:
    """Lower-case blob of the assets the compiled bundle places, and nothing
    else: never the record (a record cannot keep its own promise, audit10)
    and never a placement or parcel id (a parcel named `hatching-shed` is no
    shed). A place with no bundle has an empty blob."""
    parts = [str(p.get("assetId") or p.get("asset") or "")
             for key in ("placements", "compiledObjects") for p in (compiled or {}).get(key) or []]
    blob = " ".join(parts).lower()
    # another place's slug inside an id (travel.x.ferry-channel-cross-village) is a
    # reference to that place, never this place's feature
    for slug in sorted({pid.rsplit(".", 1)[-1] for pid in index.places} - {rec["id"].rsplit(".", 1)[-1]},
                       key=lambda s: (-len(s), s)):
        if slug in blob:
            blob = blob.replace(slug, " ")
    return blob


def _water_near(rec: dict, classes: tuple[str, ...], index: Index) -> bool:
    if not classes:
        return False
    pos = rec["positionM"]
    for d, r in routes_near(pos, index):
        if r.cls in classes:
            return True
    reach = (rec.get("footprintRadiusM") or 100) + 45.0
    for c in index.channels:
        if c.get("class") in classes and (c.get("from") == rec["id"] or c.get("to") == rec["id"]
                                          or poly_dist(np.asarray(c["pointsM"]), pos) <= reach):
            return True
    return False


def coherence_failures(place_id: str, index: Index, compiled: dict | None = None) -> list[str]:
    rec = index.places.get(place_id)
    if rec is None or not rec.get("positionM"):
        return [f"record.coherence: no catalogue record with positionM for {place_id}"]
    pos = rec["positionM"]
    texts = [(f"record {k}", t) for k, t in prose_strings(rec)]
    quests = anchored_quests(place_id, index)
    for _, q in quests:
        texts += [(f"quest {q['id']} {k}", t) for k, t in quest_prose(q)]
    related = related_ids(rec, index)
    _, reached = travel_rows(place_id, index)
    related |= reached
    near = routes_near(pos, index)
    near_ends = {e for _, r in near for e in r.ends if e}
    fails: list[str] = []
    seen: set[tuple[str, str]] = set()
    for where, text in texts:
        hits = []
        for m in index.name_re.finditer(text):
            kind, nid = index.names[m.group(1)]
            hits.append((m.start(), m.group(1), kind, nid))
            if nid == place_id or (where, nid) in seen:
                continue
            seen.add((where, nid))
            if kind == "route":
                d = poly_dist(index.routes[nid].pts, pos)
                if d > ROUTE_M:
                    fails.append(f"record.coherence: {where} names the route {m.group(1)} ({nid}) "
                                 f"and it passes {d / 1000:.1f} km away (bar {ROUTE_M / 1000:.0f} km)")
                continue
            p = index.places[nid]
            d = pdist(pos, p["positionM"]) if p.get("positionM") else math.inf
            if nid in related or d <= NEAR_M or nid in near_ends:
                continue
            fails.append(f"record.coherence: {where} names {m.group(1)} ({nid}, {d / 1000:.1f} km away) "
                         f"and nothing relates it to the place (no dependsOn, toll, travel link, "
                         f"route within 3 km)")
        for bm in re.finditer(r"\bbetween\b", text):
            after = [h for h in hits if h[0] > bm.end() and h[2] == "place"][:2]
            if len(after) < 2 or after[0][0] - bm.end() > 40:
                continue
            a, b = after[0][3], after[1][3]
            linking = [r for r in index.routes.values() if set(r.ends) == {a, b}]
            ok = [r for r in linking if poly_dist(r.pts, pos) <= ROUTE_M]
            if ok:
                continue
            if linking:
                dmin = min(poly_dist(r.pts, pos) for r in linking)
                best = min(linking, key=lambda r: (poly_dist(r.pts, pos), r.id))
                why = (f"the nearest route linking them ({best.id}) passes "
                       + (f"{dmin / 1000:.1f} km away" if math.isfinite(dmin) else "nowhere (unlaid)"))
            else:
                why = "no route links them"
            fails.append(f"record.coherence: {where} puts the place between {after[0][1]} and "
                         f"{after[1][1]}; {why}")
    # the physical features the record's own prose and its quests' premises
    # name, each shown by an asset the compiled bundle places (or the water
    # within 3 km): read only once the place is built, since nothing else
    # can keep a physical promise (audit10)
    said = [] if compiled is None else (
        [("the record", " ".join(t for _, t in prose_strings(rec)), None)]
        + [(f"quest {q['id']}", " ".join(t for k, t in quest_prose(q) if k in ("premise", "provision")), q)
           for _, q in quests])
    blob = _feature_satisfiers(rec, compiled, index) if compiled is not None else ""
    for who, prem, q in said:
        for feat, (pat, toks, water) in sorted(FEATURES.items()):
            if not re.search(pat, prem, re.I if feat != "Hist tree" else 0):
                continue
            if _shows(blob, toks):
                continue
            if feat == "toll" and (rec.get("relations") or {}).get("tolls"):
                continue
            if _water_near(rec, water, index):
                continue
            # a quest anchored at several places holds each premise feature at one
            # of them: MQ01's Hist stands at the upriver Hist village, not at the
            # gang's camp (walk 9); another anchor keeps it when its bundle
            # shows it, or when it is not built yet (its own gate reads it then)
            if q and any((c := load_compiled(a)) is None
                         or _shows(_feature_satisfiers(index.places[a], c, index), toks)
                         for a in q.get("anchorPlaces") or [] if a != place_id and a in index.places):
                continue
            fails.append(f"record.coherence: {who} names a {feat} and the built place and the "
                         f"water within 3 km have none")
    fails += relation_failures(place_id, index, compiled)
    fails += ecology_failures(place_id, index, compiled)
    return sorted(set(fails))


def load_door_count(compiled: dict) -> int:
    """Doors the build links to an interior cell (decision 0114)."""
    return sum(1 for d in compiled.get("doors") or [] if d.get("interiorClaim"))


def relation_failures(place_id: str, index: Index, compiled: dict | None = None) -> list[str]:
    """entranceCount against the build; rival-and-dependency; supply and rivalry reciprocity."""
    rec = index.places[place_id]
    rel = rec.get("relations") or {}
    fails: list[str] = []
    if compiled is not None:
        want = (rec.get("interior") or {}).get("entranceCount")
        have = load_door_count(compiled)
        # an absent entranceCount is "not recorded": nothing to compare
        if want is not None and want != have:
            fails.append(f"record.coherence: interior.entranceCount is {want} and the build has "
                         f"{have} load doors")
    service_ids = {sv.get("id") for sv in index.services.get("services", [])}
    for edge in rel.get("travelServiceEdges") or []:
        if isinstance(edge, str) and edge.startswith("service:") and edge[8:] not in service_ids:
            fails.append(f"record.coherence: relations.travelServiceEdges {edge!r} names no id in "
                         f"world/sources/routes/travel-services.json")
    rivals = set(rel.get("rivals") or [])
    for key in ("dependsOn", "supplies"):
        for pid in sorted(rivals & set(rel.get(key) or [])):
            fails.append(f"record.coherence: {pid} is in both relations.rivals and relations.{key}")
    supplies = set(rel.get("supplies") or [])
    rev = _reverse(index)
    for oid in sorted(rev["dependsOn"].get(place_id, set()) - {place_id} - supplies):
        fails.append(f"record.coherence: {oid} dependsOn this place and relations.supplies "
                     f"does not name it")
    for oid in sorted(rev["rivals"].get(place_id, set()) - {place_id} - rivals):
        fails.append(f"record.coherence: {oid} names this place a rival and relations.rivals "
                     f"does not name it back")
    for oid in sorted(rivals):
        o = index.places.get(oid)
        if o is not None and place_id not in ((o.get("relations") or {}).get("rivals") or []):
            fails.append(f"record.coherence: relations.rivals names {oid} and its record does not "
                         f"name this place back")
    return fails


def _reverse(index: Index) -> dict[str, dict[str, set[str]]]:
    """target -> the places whose relations.<key> name it (built once per index)."""
    if index._reverse is None:
        rev: dict[str, dict[str, set[str]]] = {"dependsOn": {}, "rivals": {}}
        for oid, o in index.places.items():
            orel = o.get("relations") or {}
            for key in rev:
                for t in orel.get(key) or []:
                    if isinstance(t, str):
                        rev[key].setdefault(t, set()).add(oid)
        index._reverse = rev
    return index._reverse


# --------------------------------------------------------------- what grows there

# A growing plant the prose names -> the species-name token that proves it in
# the frozen vegetation (tokens taken from the species of world/sources/flora/
# palettes.json; test_ecology_tokens_are_palette_species holds them to it).
# "reed thatch", "bamboo hut", "pine planks" are materials, never ecology.
_MATERIAL = (r"(?![-\s](?:thatch\w*|mats?|matting|roofs?|walls?|screens?|baskets?|rope|planks?|"
             r"boards?|poles?|wood|timber|huts?|cloth|weave|woven|frames?|beams?|staves?|pipes?|"
             r"wine|oil|beads?|carvings?|furniture|decks?|floors?|lattice)\b)")
ECOLOGY: dict[str, tuple[str, str]] = {
    "mangrove": (r"\bmangroves?\b", "mangrove"),
    "palm": (r"\bpalms?\b", "palm"),
    "reed": (r"\breeds?\b(?:\s+beds?\b)?", "reed"),
    "cypress": (r"\bcypress(?:es)?\b", "cypress"),
    "willow": (r"\bwillows?\b", "willow"),
    "fern": (r"\bferns?\b|\bbracken\b", "fern"),
    "moss": (r"\bmoss(?:es|y)?\b", "moss"),
    "kelp": (r"\bkelp\b", "kelp"),
    "bamboo": (r"\bbamboo\b", "bamboo"),
    "lily": (r"\b(?:water\s?)?lil(?:y|ies)\b|\blily\s?pads?\b", "lil"),
    "pine": (r"\bpines?\b", "pine"),
    "aspen": (r"\baspens?\b", "aspen"),
    "vine": (r"\bvines?\b", "vine"),
    "coral": (r"\bcorals?\b", "coral"),
    "seaweed": (r"\bseaweeds?\b", "seaweed"),
}
ECOLOGY_M = 200.0
ECOLOGY_MIN = 5          # "a handful": fewer and the prose is about something absent
# "mangrove forest", "palm grove", "reed beds": a stand needs more than a handful
_STAND = r"[\s-]*(?:forests?|woods?|woodland|groves?|stands?|thickets?|swamps?|beds?|belts?|jungle)\b"
ECOLOGY_STAND_MIN = 60
_PLANT_RE = {n: re.compile(p + _MATERIAL, re.I) for n, (p, _) in ECOLOGY.items()}
_ANY_PLANT = re.compile("|".join(p for p, _ in ECOLOGY.values()), re.I)
CLEARANCE_SEED = 0x5CA77E5   # apply_vegetation_patches main's default seed (clearanceFilter.ts)
# fields that are siting machinery, never a claim about the built place
ECOLOGY_SKIP = ("plotFacts", "sitingPrefs", "sitingNote")
# building-material fields: "mud and reed at the rear" is a wall, not a reed bed
ECOLOGY_SKIP_LEAF = ("materials", "palette")


def _veg_chunk(index: Index, cx: int, cz: int):
    """(speciesOrder index per instance, (n, 2) float32 x/z) of one frozen vegetation
    cell, read once per index; None when the cell is not dressed."""
    key = (cx, cz)
    if key not in index.vegetation:
        vdir = index.vegetation_dir
        blob = vdir / f"chunk_{cx}_{cz}_vegetation.bin" if vdir else None
        if blob is None or not blob.exists():
            index.vegetation[key] = None
        else:
            from .scatter import INSTANCE_STRUCT, MAGIC, SPECIES_HEADER_STRUCT
            raw = blob.read_bytes()
            if raw[:4] != MAGIC:
                raise ValueError(f"{blob}: not a vegetation bundle")
            count = int.from_bytes(raw[8:12], "little")
            off, heads = 12, []
            for _ in range(count):
                heads.append(SPECIES_HEADER_STRUCT.unpack_from(raw, off)[:2])
                off += SPECIES_HEADER_STRUCT.size
            names, parts = [], []
            row = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("b", "u1", (5,))])
            assert row.itemsize == INSTANCE_STRUCT.size
            for sp, n in heads:
                arr = np.frombuffer(raw, dtype=row, count=n, offset=off)
                off += n * row.itemsize
                names.append(np.full(n, sp, dtype=np.int32))
                parts.append(np.stack([arr["x"], arr["z"]], axis=1))
            idx = np.concatenate(names) if names else np.zeros(0, np.int32)
            xz = np.concatenate(parts) if parts else np.zeros((0, 2), np.float32)
            index.vegetation[key] = (idx, xz)
    return index.vegetation[key]


def _veg_meta(index: Index) -> dict:
    """speciesOrder and chunkMetres of the frozen vegetation index, read once."""
    if "veg" not in index.cache:
        path = index.vegetation_dir / "vegetation-index.json" if index.vegetation_dir else None
        doc = json.loads(path.read_text()) if path and path.exists() else {}
        index.cache["veg"] = {"order": doc.get("speciesOrder", []),
                              "cm": float(doc.get("chunkMetres") or 467.93)}
    return index.cache["veg"]


def _species_order(index: Index) -> list[str]:
    return _veg_meta(index)["order"]


def vegetation_near(index: Index, pos, radius: float = ECOLOGY_M,
                    clearance: dict | None = None) -> dict[str, int] | None:
    """Species (leaf name) -> frozen instances within the radius that the
    place's own clearance keeps (tree tier, ``apply_vegetation_patches.survives``
    at the origin); None when no cell there is dressed."""
    x, z = float(pos[0]), float(pos[1])
    cm = _veg_meta(index)["cm"]
    out: dict[str, int] = {}
    dressed = False
    for cx in range(int((x - radius) // cm), int((x + radius) // cm) + 1):
        for cz in range(int((z - radius) // cm), int((z + radius) // cm) + 1):
            ch = _veg_chunk(index, cx, cz)
            if ch is None:
                continue
            dressed = True
            sp, xz = ch
            if not len(xz):
                continue
            hit = np.nonzero(np.hypot(xz[:, 0] - x, xz[:, 1] - z) <= radius)[0]
            if clearance and len(hit):
                from . import apply_vegetation_patches as avp
                keep = avp.survives_mask(xz[hit, 0], xz[hit, 1], clearance, CLEARANCE_SEED,
                                         avp.patch_id_hash(clearance["id"]))
                hit = hit[keep]
            order = _species_order(index)
            for i, n in zip(*np.unique(sp[hit], return_counts=True)):
                leaf = (order[i] if i < len(order) else "?").rsplit("/", 1)[-1]
                out[leaf] = out.get(leaf, 0) + int(n)
    return out if dressed else None


def _clearance(compiled: dict | None) -> dict | None:
    c = ((compiled or {}).get("settlement") or {}).get("vegetationClearance")
    return c if c and c.get("id") else None


def ecology_failures(place_id: str, index: Index, compiled: dict | None = None) -> list[str]:
    """A plant the record's prose says grows here has a handful of frozen instances within 200 m."""
    rec = index.places[place_id]
    texts = [(k, t) for k, t in prose_strings(rec)
             if not k.startswith(ECOLOGY_SKIP) and not k.rsplit(".", 1)[-1].startswith(ECOLOGY_SKIP_LEAF)]
    claims: dict[str, str] = {}
    for where, text in texts:
        if not _ANY_PLANT.search(text):
            continue
        for noun, pat in _PLANT_RE.items():
            for m in pat.finditer(text):
                stand = bool(re.match(_STAND, text[m.end():], re.I))
                if noun not in claims or (stand and not claims[noun][1]):
                    claims[noun] = (where, stand)
    if not claims:
        return []
    near = vegetation_near(index, rec["positionM"], clearance=_clearance(compiled))
    if near is None:
        return []          # no dressed chunk here: nothing to measure against
    fails = []
    for noun, (where, stand) in sorted(claims.items()):
        tok = ECOLOGY[noun][1]
        n = sum(c for leaf, c in near.items() if tok in leaf.lower())
        bar = ECOLOGY_STAND_MIN if stand else ECOLOGY_MIN
        if n < bar:
            what = f"a {noun} forest or stand" if stand else f"{noun}"
            fails.append(f"record.coherence: record {where} says {what} grows here and the frozen "
                         f"vegetation the place keeps has {n} {noun} instance(s) within "
                         f"{ECOLOGY_M:.0f} m (bar {bar})")
    return fails


# --------------------------------------------------------------- the scene

SCENE_PAD_M = 150.0


def _water_window(water, x: float, z: float, half: float):
    """Dry-ground components of the frozen water record around (x, z): the
    component touching the window edge is the mainland, any other is an islet."""
    from scipy import ndimage
    m = float(water.mpp2)
    c0, r0 = max(0, int((x - half) / m)), max(0, int((z - half) / m))
    c1, r1 = int((x + half) / m) + 1, int((z + half) / m) + 1
    depth = water.depth2[r0:r1, c0:c1]
    lab, _ = ndimage.label(depth <= 0.0)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]).tolist())) - {0}
    dist, (ir, ic) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    return {"m": m, "c0": c0, "r0": r0, "lab": lab, "edge": edge, "depth": depth,
            "dist": dist * m, "ir": ir, "ic": ic}


def _where(win, x: float, z: float) -> dict:
    r, c = int(z / win["m"]) - win["r0"], int(x / win["m"]) - win["c0"]
    lab = win["lab"]
    if not (0 <= r < lab.shape[0] and 0 <= c < lab.shape[1]):
        return {"on": "outside", "depthM": None}
    L = int(lab[r, c])
    kind = lambda l: "land" if l in win["edge"] else "islet"  # noqa: E731
    out = {"on": "water" if L == 0 else kind(L), "depthM": round(float(win["depth"][r, c]), 2)}
    if L == 0:
        nl = int(lab[win["ir"][r, c], win["ic"][r, c]])
        out["nearestDry"] = {"on": kind(nl) if nl else "none", "m": round(float(win["dist"][r, c]), 1)}
    return out


def scene_summary(place_id: str, index: Index, compiled: dict | None, water=None) -> dict:
    """What is built where and what grows around it, read from the compiled
    bundle, the frozen water record and the frozen vegetation (owner walk 9:
    the reader packet named kits and doors but not the scene)."""
    rec = index.places[place_id]
    pos = rec["positionM"]
    out: dict = {"vegetationWithin200m": vegetation_near(index, pos, clearance=_clearance(compiled))}
    if compiled is None:
        out["built"] = None
        return out
    if water is None:
        from .water_report import ShippedWater
        water = ShippedWater(heights=None)
    half = (rec.get("footprintRadiusM") or 100.0) + SCENE_PAD_M
    win = _water_window(water, pos[0], pos[1], half)
    structures, by_class, runs = [], {}, {}
    short = lambda pid: pid.split(".parcel.", 1)[-1] if ".parcel." in pid else pid  # noqa: E731
    for p in compiled.get("placements") or []:
        x, z = p["positionM"][0], p["positionM"][2]
        w = _where(win, x, z)
        run = (p.get("run") or {}).get("id")
        cls = "run piece" if run else (p.get("layer") or "structure")
        by_class.setdefault(cls, {}).setdefault(w["on"], 0)
        by_class[cls][w["on"]] += 1
        if run:
            runs.setdefault(run, []).append((p["run"].get("index", 0), x, z, w))
        elif cls == "structure":
            structures.append({"id": short(p["id"]), "asset": str(p.get("assetId", "")).rsplit("/", 1)[-1],
                               "xz": [round(x, 1), round(z, 1)], **w})
    run_rows = []
    for rid, pieces in sorted(runs.items()):
        pieces.sort(key=lambda t: t[0])
        ends = []
        for _, x, z, w in (pieces[0], pieces[-1]):
            near = min(((math.hypot(s["xz"][0] - x, s["xz"][1] - z), s["id"]) for s in structures),
                       default=(math.inf, None))
            ends.append({**w, "xz": [round(x, 1), round(z, 1)],
                         "nearestStructure": near[1] if near[0] <= 15.0 else None,
                         "nearestStructureM": round(near[0], 1) if near[0] <= 15.0 else None})
        length = sum(math.hypot(b[1] - a[1], b[2] - a[2]) for a, b in zip(pieces, pieces[1:]))
        on = {}
        for *_, w in pieces:
            on[w["on"]] = on.get(w["on"], 0) + 1
        run_rows.append({"id": short(rid), "pieces": len(pieces), "lengthM": round(length, 1),
                         "piecesOn": on, "ends": ends})
    out["built"] = {"structures": structures, "byClass": by_class, "runs": run_rows}
    return out


def scene_lines(scene: dict) -> list[str]:
    out = []
    b = scene.get("built")
    if b is None:
        out.append("- not compiled")
    else:
        out.append("Where each structure stands (frozen water record: land = the mainland, islet = dry "
                   "ground cut off by water, water = in the water, depth in m):")
        for s in b["structures"]:
            extra = (f", nearest dry ground {s['nearestDry']['on']} {s['nearestDry']['m']} m"
                     if s.get("nearestDry") else "")
            out.append(f"- {s['id']} ({s['asset']}) at {s['xz']}: on {s['on']}, depth {s['depthM']}{extra}")
        out.append("Placements by class and where they stand: " + "; ".join(
            f"{c} {sorted(v.items())}" for c, v in sorted(b["byClass"].items())))
        out.append("Runs (plank walks, docks) and what their ends touch:")
        for r in b["runs"]:
            ends = []
            for e in r["ends"]:
                t = f"on {e['on']}"
                if e.get("nearestDry"):
                    t += f" ({e['nearestDry']['m']} m from {e['nearestDry']['on']})"
                if e.get("nearestStructure"):
                    t += f", {e['nearestStructureM']} m from {e['nearestStructure']}"
                ends.append(t)
            out.append(f"- {r['id']}: {r['pieces']} pieces, {r['lengthM']} m, pieces on {r['piecesOn']}; "
                       f"start {ends[0]}; end {ends[1]}")
    veg = scene.get("vegetationWithin200m")
    if veg is None:
        out.append("Vegetation within 200 m: no dressed chunk here")
    else:
        top = sorted(veg.items(), key=lambda kv: (-kv[1], kv[0]))
        out.append("Vegetation within 200 m (frozen scatter, instances): "
                   + ", ".join(f"{k} {v}" for k, v in top[:30]))
        groups = {n: sum(c for leaf, c in veg.items() if t in leaf.lower()) for n, (_, t) in ECOLOGY.items()}
        out.append("By plant the prose may name: " + ", ".join(f"{n} {c}" for n, c in sorted(groups.items())))
    return out


# --------------------------------------------------------------- receipt and change sets

RECEIPT = SRC / "catalogue" / "coherence-receipt.json"
RECEIPT_SCHEMA = 1


def built_places(index: Index) -> list[str]:
    """Every place with a published bundle (the built places), sorted."""
    return sorted(pid for pid in index.places
                  if (PROVINCE / "settlements" / f"{pid}.json").exists())


def grade(index: Index, ids, compiled: dict[str, dict | None] | None = None
          ) -> tuple[dict[str, str], dict[str, list[str]]]:
    """green / red and the failures of the named place records that have a position;
    a built place is graded with its bundle (``compiled`` overrides; each bundle read once)."""
    compiled = dict(compiled or {})
    built = set(built_places(index))
    status: dict[str, str] = {}
    fails: dict[str, list[str]] = {}
    for pid in sorted(set(ids)):
        if not (index.places.get(pid) or {}).get("positionM"):
            continue
        if pid not in compiled:
            compiled[pid] = load_compiled(pid) if pid in built else None
        fails[pid] = coherence_failures(pid, index, compiled[pid])
        status[pid] = "red" if fails[pid] else "green"
    return status, fails


def gate_statuses(index: Index, place_id: str, compiled: dict | None, before: dict[str, str]
                  ) -> tuple[dict[str, str], dict[str, list[str]]]:
    """The place gate's grading (walk 9 review: under 1 s a place). Only the records whose
    status this tree can have moved are graded: the place, every built place and the
    change set's re-check set (``changed_records``); every other record carries its HEAD
    status (``before``) forward unchanged."""
    _, recheck = changed_records(index)
    ids = {place_id} | set(built_places(index)) | recheck
    graded, fails = grade(index, ids, {place_id: compiled} if compiled is not None else None)
    now = {p: v for p, v in before.items() if p in index.places}
    now.update(graded)
    return now, fails


def committed_receipt(rel: str | None = None) -> dict[str, str]:
    import subprocess
    rel = rel or str(RECEIPT.relative_to(REPO))
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=REPO, capture_output=True, text=True)
    return json.loads(r.stdout).get("records", {}) if r.returncode == 0 else {}


def regression_failures(now: dict[str, str], before: dict[str, str],
                        fails: dict[str, list[str]] | None = None) -> list[str]:
    """A record green at HEAD and red in the working tree: a later change broke a fit made
    earlier; ``fails`` (from ``grade``) supplies each one's first failure."""
    out = []
    for pid in sorted(before):
        if before[pid] == "green" and now.get(pid) == "red":
            f = (fails or {}).get(pid) or []
            out.append(f"record.regression: {pid} was coherent at HEAD and is not now"
                       f"{': ' + f[0] if f else ''}")
    return out


def write_receipt(statuses: dict[str, str]) -> None:
    doc = {"schemaVersion": RECEIPT_SCHEMA,
           "about": "record_coherence status per place record; written by place_gates and "
                    "record_coherence --receipt; gate record.regression compares HEAD with the tree",
           "records": dict(sorted(statuses.items()))}
    text = json.dumps(doc, indent=1, ensure_ascii=False) + "\n"
    if not RECEIPT.exists() or RECEIPT.read_text() != text:
        RECEIPT.write_text(text, encoding="utf-8")


def _head_json(rel: str):
    import subprocess
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=REPO, capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else None


def changed_records(index: Index) -> tuple[dict[str, tuple[dict | None, dict | None]], set[str]]:
    """Place and quest records that differ from HEAD (id -> (before, after)), and
    every place a change set must re-check: the touched places, the places their
    quests anchor at, and every place whose relations or prose name a touched one."""
    touched: dict[str, tuple[dict | None, dict | None]] = {}
    files = sorted({index.place_file[p] for p in index.places}) + sorted({f for f, _ in index.quests})
    for rel in files:
        head = _head_json(rel) or {}
        now = json.loads((REPO / rel).read_text())
        key = "places" if ("catalogue" in rel or "routes" in rel) else "quests"
        b = {r["id"]: r for r in head.get(key, []) if isinstance(r, dict) and "id" in r}
        a = {r["id"]: r for r in now.get(key, []) if isinstance(r, dict) and "id" in r}
        for rid in sorted(set(a) | set(b)):
            if a.get(rid) != b.get(rid):
                touched[rid] = (b.get(rid), a.get(rid))
    places: set[str] = set()
    for rid, (b, a) in touched.items():
        rec = a or b or {}
        if rid in index.places:
            places.add(rid)
        places.update(p for p in [rec.get("settlement")] + list(rec.get("anchorPlaces") or [])
                      if isinstance(p, str) and p in index.places)
    base = set(places)
    names = {index.places[p].get("name") for p in base if len(index.places[p].get("name") or "") >= MIN_NAME}
    for oid, o in index.places.items():
        blob = json.dumps(o.get("relations") or {})
        if any(p in blob for p in base) or any(n in t for n in names for _, t in prose_strings(o)):
            places.add(oid)
    for _, q in index.quests:          # a quest that names a touched place: its anchors
        if any(n in t for n in names for _, t in quest_prose(q)):
            places.update(p for p in [q.get("settlement")] + list(q.get("anchorPlaces") or [])
                          if isinstance(p, str) and p in index.places)
    return touched, {p for p in places if index.places[p].get("positionM")}


def changeset_packet(index: Index) -> tuple[str, list[str]]:
    touched, recheck = changed_records(index)
    out = ["# Change-set packet (record coherence, set dimension)", "",
           f"Records this change set touches ({len(touched)}), before (HEAD) and after (tree):", ""]
    for rid, (b, a) in sorted(touched.items()):
        out += [f"## {rid}", "", "Before:", "```json", json.dumps(b, indent=1, ensure_ascii=False), "```",
                "After:", "```json", json.dumps(a, indent=1, ensure_ascii=False), "```", ""]
    out += ["## Re-checked places (touched, anchored by a touched quest, or naming a touched place)", ""]
    before = committed_receipt()
    fails_all: list[str] = []
    built = set(built_places(index))
    for pid in sorted(recheck):
        f = coherence_failures(pid, index, load_compiled(pid) if pid in built else None)
        was = before.get(pid, "unrecorded")
        out.append(f"- {pid}: {'red' if f else 'green'} (HEAD {was}{', built' if pid in built else ''})")
        out += [f"  - {x}" for x in f]
        # every record the change set touches is green, every built place is green,
        # and no record green at HEAD went red
        if f and (pid in touched or pid in built or was == "green"):
            fails_all += [f"{pid}: {x}" for x in f]
    return "\n".join(out) + "\n", fails_all


def load_compiled(place_id: str) -> dict | None:
    p = PROVINCE / "settlements" / f"{place_id}.json"
    return json.loads(p.read_text()) if p.exists() else None


# --------------------------------------------------------------- reader packet

def _line_of(index: Index, rel: str, needle: str) -> int:
    lines = index.lines.get(rel)
    if lines is None:
        lines = {}
        for i, ln in enumerate((REPO / rel).read_text().splitlines(), 1):
            m = re.search(r'"id":\s*"([^"]+)"', ln)
            if m and m.group(1) not in lines:
                lines[m.group(1)] = i
        index.lines[rel] = lines
    return lines.get(needle, 0)


def packet(place_id: str, index: Index) -> str:
    rec = index.places[place_id]
    pos = rec["positionM"]
    rf = index.place_file[place_id]
    compiled = load_compiled(place_id)
    out = [f"# Coherence packet: {rec.get('name')} ({place_id})", ""]
    out += ["## Gate failures (record.coherence)", ""]
    fails = coherence_failures(place_id, index, compiled)
    out += [f"- {f}" for f in fails] or ["- none"]
    out += ["", f"## Record ({rf}:{_line_of(index, rf, place_id)})", "", "```json",
            json.dumps(rec, indent=1, ensure_ascii=False), "```", ""]
    out += ["## Routes passing within 3 km (world/sources/routes/registry.json; geometry as cited)", ""]
    reg = "world/sources/routes/registry.json"
    for d, r in routes_near(pos, index):
        out.append(f"- {r.id} '{r.name}' ({r.cls}) {r.raw_ends[0]} -> {r.raw_ends[1]}: {d / 1000:.2f} km "
                   f"[{reg}:{_line_of(index, reg, r.id)}, {r.source}]")
    if not routes_near(pos, index):
        out.append("- none")
    out += ["", "## Neighbours within 5 km", ""]
    nb = sorted((pdist(pos, p["positionM"]), pid) for pid, p in index.places.items()
                if pid != place_id and p.get("positionM") and pdist(pos, p["positionM"]) <= NEAR_M)
    for d, pid in nb:
        p = index.places[pid]
        c = p.get("classification") or {}
        out.append(f"- {p.get('name')} ({pid}, {c.get('class')}/{c.get('magnitude')}): {d / 1000:.2f} km "
                   f"[{index.place_file[pid]}:{_line_of(index, index.place_file[pid], pid)}]")
    towns = [(pdist(pos, p["positionM"]), pid) for pid, p in index.places.items()
             if (p.get("classification") or {}).get("class") == "settlement"
             and (p.get("classification") or {}).get("magnitude") in TOWN_PLUS and p.get("positionM")
             and pid != place_id]
    out += ["", "## Nearest towns and cities (M3+)", "", "Straight line:"]
    for d, pid in sorted(towns)[:3]:
        out.append(f"- {index.places[pid]['name']} ({pid}): {d / 1000:.1f} km")
    out.append("By route (a registry route within 3 km that ends there):")
    town_ids = {pid for _, pid in towns}
    byroute = sorted({(d, r.id, e) for d, r in routes_near(pos, index) for e in r.ends if e in town_ids})
    out += [f"- {index.places[e]['name']} ({e}) via {rid}, joined {d / 1000:.1f} km from the place"
            for d, rid, e in byroute[:3]] or ["- none"]
    rows, _ = travel_rows(place_id, index)
    ts = "world/sources/routes/travel-services.json"
    out += ["", f"## Travel services touching the place ({ts})", ""]
    out += [f"- {sv['id']} ({sv.get('form')}) operator near {(sv.get('operator') or {}).get('nearestPlaceId')}; "
            f"hops {[(h.get('from'), h.get('to')) for h in sv.get('hops') or []]} "
            f"[{ts}:{_line_of(index, ts, sv['id'])}]" for sv in rows] or ["- none"]
    anchored = anchored_quests(place_id, index)
    name = rec.get("name") or "\0"
    naming = [(f, q) for f, q in index.quests if (f, q) not in anchored
              and any(name in t for _, t in quest_prose(q))]
    ids = {q["id"] for _, q in anchored + naming}
    cast = {p for _, q in anchored for p in (q.get("anchorPlaces") or [])} - {place_id}
    deps = [(f, q) for f, q in index.quests if q["id"] not in ids and (
        set(q.get("touches") or []) & ids
        or any(t in {x for _, qq in anchored for x in (qq.get("touches") or [])} for t in [q["id"]])
        or (set(q.get("anchorPlaces") or []) & cast))]
    for title, group in (("Quests anchored at the place", anchored), ("Quests naming the place", naming),
                         ("Quests they depend on or that share their cast", deps)):
        out += ["", f"## {title}", ""]
        for f, q in group:
            out += [f"### {q['id']} [{f}:{_line_of(index, f, q['id'])}]", "", "```json",
                    json.dumps(q, indent=1, ensure_ascii=False), "```", ""]
        if not group:
            out.append("- none")
    out += ["", "## Lore dossiers that bear (world/sources/lore/)", ""]
    lore = SRC / "lore"
    stems = {Path(f).stem: f for f in glob.glob(str(lore / "**" / "*.md"), recursive=True)}
    named = {index.places[n]["name"] for n in (related_ids(rec, index) | {e for _, r in routes_near(pos, index)
                                                                           for e in r.ends if e})
             if n in index.places}
    want = {re.sub(r"[^a-z]+", "-", n.lower()).strip("-") for n in named}
    want |= {rec.get("culture") or "", "waters", "secondary-settlements", "roads-and-routes-4e201"}
    region_docs = sorted(str(Path(f).relative_to(REPO)) for f in glob.glob(str(lore / "regions" / "*.md")))
    out += [f"- {Path(stems[s]).relative_to(REPO)}" for s in sorted(want) if s in stems]
    out += [f"- {r} (region module; pick by the place's region {rf.split('places-')[-1][:-5]})"
            for r in region_docs]
    out += ["", f"## Compiled place (apps/world-studio/public/province/settlements/{place_id}.json)", ""]
    if compiled is None:
        out.append("- not compiled")
    else:
        kits: dict[str, int] = {}
        for p in compiled.get("placements") or []:
            kits[str(p.get("kit"))] = kits.get(str(p.get("kit")), 0) + 1
        out.append("- placements by kit: " + ", ".join(f"{k} {v}" for k, v in sorted(kits.items())))
        out.append(f"- doors {len(compiled.get('doors') or [])}; interiors "
                   f"{sorted({str((d.get('interiorClaim') or {}).get('cellId')) for d in compiled.get('doors') or []})}")
        objs = compiled.get("compiledObjects") or []
        kinds: dict[str, int] = {}
        for o in objs:
            kinds[o.get("kind", "?")] = kinds.get(o.get("kind", "?"), 0) + 1
        out.append("- compiled objects by kind: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
        out.append("- sockets/obligations: " + ", ".join(sorted(o["id"] for o in objs if o.get("kind") != "approach"))[:2000])
        out.append("- travel station: " + (", ".join(sv["id"] for sv in rows) or "none"))
        gt: dict[str, int] = {}
        for t in compiled.get("groundTreatments") or []:
            gt[str(t.get("kind") or t.get("treatment"))] = gt.get(str(t.get("kind") or t.get("treatment")), 0) + 1
        out.append("- ground treatments: " + ", ".join(f"{k} {v}" for k, v in sorted(gt.items())))
    out += ["", "## Scene (what stands on land, water or islet; what the runs join; what grows within 200 m)", ""]
    out += scene_lines(scene_summary(place_id, index, compiled))
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--place", action="append", default=[])
    ap.add_argument("--all-built", action="store_true", help="every place with a published bundle")
    ap.add_argument("--changed", action="store_true",
                    help="the change-set check: every place and quest record that differs from HEAD, "
                         "re-graded with every place that references one; writes the set packet")
    ap.add_argument("--receipt", action="store_true",
                    help="refresh world/sources/catalogue/coherence-receipt.json and run record.regression")
    a = ap.parse_args(argv)
    index = build_index()
    ids = list(a.place) + (built_places(index) if a.all_built else [])
    if not (ids or a.changed or a.receipt):
        ap.error("--place <id>, --all-built, --changed or --receipt")
    rc = 0
    for pid in ids:
        short = pid.rsplit(".", 1)[-1]
        path = REPORTS / short / "coherence-packet.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(packet(pid, index), encoding="utf-8")
        fails = coherence_failures(pid, index, load_compiled(pid))
        print(f"{pid}: {len(fails)} failure(s) -> {path.relative_to(REPO)}")
        for f in fails:
            print(f"  {f}")
        rc |= bool(fails)
    if a.changed:
        text, fails = changeset_packet(index)
        path = REPORTS / "changeset-packet.md"
        path.write_text(text, encoding="utf-8")
        print(f"change set: {len(fails)} failure(s) over the re-checked places -> {path.relative_to(REPO)}")
        for f in fails:
            print(f"  {f}")
        rc |= bool(fails)
    if a.receipt:
        now, grades = grade(index, index.places)
        reg = regression_failures(now, committed_receipt(), grades)
        write_receipt(now)
        print(f"receipt: {sum(v == 'green' for v in now.values())} green, "
              f"{sum(v == 'red' for v in now.values())} red -> {RECEIPT.relative_to(REPO)}")
        for f in reg:
            print(f"  {f}")
        rc |= bool(reg)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
