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

CLI: ``python3 -m worldgen.record_coherence --place <id>`` or ``--all-built``
writes ``tooling/.reports/16k/<short-id>/coherence-packet.md``.
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

# feature -> (premise pattern, satisfier tokens in structural ids, water classes nearby)
FEATURES: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    "channel": (r"\bchannels?\b", ("channel", "canal"), ("channel", "river", "lane")),
    "canal": (r"\bcanals?\b", ("canal", "channel"), ("channel",)),
    "ferry": (r"\bferry\b|\bferries\b", ("ferry",), ("lane", "crossing")),
    "well": (r"\bwells?\b", ("well",), ()),
    "spring": (r"\bsprings?\b", ("spring",), ()),
    "Hist tree": (r"\bHist\b", ("hist",), ()),
    "toll": (r"\btolls?\b", ("toll",), ()),
    "bridge": (r"\bbridges?\b", ("bridge",), ()),
    "dock": (r"\bdocks?\b|\bjett(?:y|ies)\b|\bpiers?\b|\bquays?\b",
             ("dock", "jetty", "pier", "quay", "landing", "stage"), ()),
    "shrine": (r"\bshrines?\b", ("shrine",), ()),
    "mine": (r"\bmines?\b(?!\s+(?:is|was))", ("mine", "diggings"), ()),
    "tower": (r"\btowers?\b", ("tower",), ()),
}


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


def _px_pts(px, mpp: float) -> np.ndarray:
    a = np.asarray(px, dtype=np.float64)
    return (a + 0.5) * mpp


def build_index() -> Index:
    places, place_file = {}, {}
    for rf in catalogue.load_region_files():
        for p in rf.places:
            places[p["id"]] = p
            place_file[p["id"]] = str(rf.path.relative_to(REPO))
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
    return Index(places, place_file, names, name_re, routes, channels, services, quests)


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
    return [(f, q) for f, q in index.quests
            if q.get("settlement") == place_id or place_id in (q.get("anchorPlaces") or [])]


def quest_prose(q: dict) -> list[tuple[str, str]]:
    return [(k, q[k]) for k in QUEST_PROSE if isinstance(q.get(k), str)]


def routes_near(pos, index: Index, within: float = ROUTE_M) -> list[tuple[float, Route]]:
    out = [(poly_dist(r.pts, pos), r) for r in index.routes.values()]
    return sorted(((d, r) for d, r in out if d <= within), key=lambda x: (x[0], x[1].id))


def station_place(st: dict, index: Index) -> str | None:
    pos = st.get("positionM")
    if not pos:
        return None
    best = min(((pdist(pos, p["positionM"]), pid) for pid, p in index.places.items()
                if p.get("positionM")), default=None)
    return best[1] if best else None


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

def _feature_satisfiers(rec: dict, compiled: dict | None, index: Index) -> str:
    """Lower-case blob of the structural ids the place owns (never its prose)."""
    parts: list[str] = []
    for k in ("sockets", "contents", "stance", "assetPlan", "relations"):
        parts.append(json.dumps(rec.get(k) or {}))
    _, reached = travel_rows(rec["id"], index)
    for sv in index.services.get("services", []):
        if (sv.get("operator") or {}).get("nearestPlaceId") == rec["id"]:
            parts.append(sv.get("id", "") + " " + sv.get("form", ""))
    if compiled:
        parts += [json.dumps(compiled.get("kits") or [])]
        parts += [p.get("id", "") + " " + str(p.get("kit", "")) + " " + str(p.get("asset", ""))
                  for p in compiled.get("placements") or []]
        parts += [o.get("id", "") for o in compiled.get("compiledObjects") or []]
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
    blob = None
    for _, q in quests:
        prem = " ".join(t for k, t in quest_prose(q) if k in ("premise", "provision"))
        for feat, (pat, toks, water) in sorted(FEATURES.items()):
            if not re.search(pat, prem, re.I if feat != "Hist tree" else 0):
                continue
            blob = blob if blob is not None else _feature_satisfiers(rec, compiled, index)
            if any(re.search(rf"(?<![a-z]){t}", blob) for t in toks):
                continue
            if feat == "toll" and (rec.get("relations") or {}).get("tolls"):
                continue
            if _water_near(rec, water, index):
                continue
            fails.append(f"record.coherence: quest {q['id']} premises a {feat} and the record, the "
                         f"build and the water within 3 km have none")
    fails += relation_failures(place_id, index, compiled)
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
        if want != have:
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
    for oid in sorted(index.places):
        if oid == place_id:
            continue
        orel = index.places[oid].get("relations") or {}
        if place_id in (orel.get("dependsOn") or []) and oid not in supplies:
            fails.append(f"record.coherence: {oid} dependsOn this place and relations.supplies "
                         f"does not name it")
        if place_id in (orel.get("rivals") or []) and oid not in rivals:
            fails.append(f"record.coherence: {oid} names this place a rival and relations.rivals "
                         f"does not name it back")
    for oid in sorted(rivals):
        o = index.places.get(oid)
        if o is not None and place_id not in ((o.get("relations") or {}).get("rivals") or []):
            fails.append(f"record.coherence: relations.rivals names {oid} and its record does not "
                         f"name this place back")
    return fails


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
                   f"{sorted({str(d.get('interior') or d.get('interiorCell') or d.get('cell')) for d in compiled.get('doors') or []})}")
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
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--place", action="append", default=[])
    ap.add_argument("--all-built", action="store_true")
    a = ap.parse_args(argv)
    ids = list(a.place) + (list(BUILT) if a.all_built else [])
    if not ids:
        ap.error("--place <id> or --all-built")
    index = build_index()
    for pid in ids:
        short = pid.rsplit(".", 1)[-1]
        path = REPORTS / short / "coherence-packet.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(packet(pid, index), encoding="utf-8")
        fails = coherence_failures(pid, index, load_compiled(pid))
        print(f"{pid}: {len(fails)} failure(s) -> {path.relative_to(REPO)}")
        for f in fails:
            print(f"  {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
