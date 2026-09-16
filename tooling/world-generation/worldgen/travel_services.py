"""The province's travel-service graph — talk, pay, arrive (decision 0068).

ONE record, `world/sources/routes/travel-services.json`, holds every service
that carries a traveller: ferries, boat lanes, the rootworm Underground
Express, and (Phase 15) guides, carts and porters. It replaces the two
retired files `ferry-crossings.json` and `anchors/root-transit.json`, so the
travel system, the quest system and the map read one graph instead of three.

THE SHAPE
---------
`stations[]`   where a traveller boards: a catalogue place, a bare ferry
               landing, or a rootworm node. A landing carries a `berth`
               (the first point walking in from the bank where the service's
               hull floats, its measured depth, and the jetty length that
               reaches it).
`services[]`   who runs what, for what fare, and when they refuse. Each has
               `serviceKind` (ferry/boat/rootworm/...), a `form`
               (road-crossing | station-run) and `hops[]` — a leg between two
               stations, following a named lane, road or rootway.
`rootways[]`   the rootworm edges, placeholders until 16g.

Nothing here simulates a vessel (owner ruling 2026-09-09): the player speaks
to the operator, pays, and arrives.

RUNNING
-------
    python3 -m worldgen.travel_services --from-legacy   # one-time migration
    python3 -m worldgen.travel_services                 # derive (chain stage)
    python3 -m worldgen.travel_services --check         # reference integrity

`derive` joins every `road-crossing` ferry to its measured crossing in
`water-crossings.json`, moves its two landings onto that crossing's dry
`banks`, and walks each berth out from the bank to the first floating depth. A ferry whose
crossing is no longer there (the roads moved) is marked `unmatched` with the
nearest candidate named — it is never moved by guesswork.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICES = REPO_ROOT / "world" / "sources" / "routes" / "travel-services.json"
LEGACY_FERRIES = REPO_ROOT / "world" / "sources" / "routes" / "ferry-crossings.json"
LEGACY_ROOT = REPO_ROOT / "world" / "sources" / "anchors" / "root-transit.json"
CROSSINGS = REPO_ROOT / "world" / "sources" / "routes" / "water-crossings.json"
REGISTRY = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
CATALOGUE = REPO_ROOT / "world" / "sources" / "catalogue"
TEXT_ENTRIES = REPO_ROOT / "packages" / "text-catalogue" / "src" / "entries.ts"
VOCABULARY = REPO_ROOT / "docs" / "quests" / "85-condition-vocabulary.md"
QUEST_PLACE_MAP = REPO_ROOT / "docs" / "quests" / "25-quest-place-map.md"
KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"

SCHEMA_VERSION = 1

SERVICE_KINDS = ["ferry", "boat", "rootworm", "guide", "cart", "porter"]
STATION_KINDS = ["place", "ferry-landing", "root-node"]
HOP_FOLLOWS = ["lane", "reaches", "rootway", "road"]
FORMS = {"road-crossing", "station-run"}
STATUSES = {"active", "placeholder", "deferred", "unmatched"}

#: How far a crossing's bank midpoint may sit from a ferry's authored landing
#: midpoint and still be the same crossing.
MATCH_RADIUS_M = 400.0
#: How far in from the bank the berth search walks before giving up.
BERTH_SEARCH_M = 30.0
#: Step of that walk, in metres.
BERTH_STEP_M = 1.0
BOAT_FARE_GOLD = 5


# --------------------------------------------------------------------------
# shared readers
# --------------------------------------------------------------------------

def _text_ids() -> set[str]:
    if not TEXT_ENTRIES.exists():
        return set()
    return set(re.findall(r'id:\s*"(text\.[^"]+)"', TEXT_ENTRIES.read_text(encoding="utf-8")))


def _predicates() -> set[str]:
    if not VOCABULARY.exists():
        return set()
    return set(re.findall(r"^\|\s*`(\w+)`", VOCABULARY.read_text(encoding="utf-8"), re.M))


def _places() -> dict:
    out = {}
    for f in sorted(CATALOGUE.glob("places-*.json")):
        for pl in json.loads(f.read_text(encoding="utf-8")).get("places", []):
            out[pl["id"]] = pl
    return out


def _registry() -> list[dict]:
    if not REGISTRY.exists():
        return []
    doc = json.loads(REGISTRY.read_text(encoding="utf-8"))
    return [r for r in (doc.get("routes") or doc.get("entries") or []) if isinstance(r, dict)]


def _route_ids(rows: list[dict]) -> set[str]:
    ids = {r["id"] for r in rows if "id" in r}
    for r in rows:
        ids.update(r.get("aliases") or [])
    return ids


def _kit_pieces(kit: str) -> set[str]:
    path = KITS / f"{kit}.kit.json"
    if not path.exists():
        return set()
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {a.get("id") for a in doc.get("assets", []) if a.get("id")}


def station_id_for_place(place_id: str) -> str:
    return "station." + place_id[len("place."):] if place_id.startswith("place.") else place_id


def _dist(a, b) -> float:
    return math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))


def _mid(a, b):
    return [(float(a[0]) + float(b[0])) / 2.0, (float(a[1]) + float(b[1])) / 2.0]


def _suffix_index(places: dict) -> dict:
    """anchor id (a place-id suffix) -> the one place that carries it."""
    out: dict[str, list[str]] = {}
    for pid in places:
        parts = pid.split(".", 2)
        if len(parts) == 3:
            out.setdefault(parts[2], []).append(pid)
    return {k: v[0] for k, v in out.items() if len(v) == 1}


# --------------------------------------------------------------------------
# migration from the two legacy files
# --------------------------------------------------------------------------

def migrate() -> dict:
    """Build the travel-service graph from the two retired records."""
    legacy = json.loads(LEGACY_FERRIES.read_text(encoding="utf-8"))
    roots = json.loads(LEGACY_ROOT.read_text(encoding="utf-8"))
    places = _places()
    reg = _registry()
    by_suffix = _suffix_index(places)
    lanes = [r for r in reg if r.get("class") in ("lane", "channel")]

    stations: dict[str, dict] = {}
    warnings: list[str] = []

    def place_station(place_id: str, status: str = "active") -> str:
        sid = station_id_for_place(place_id)
        rec = places.get(place_id) or {}
        pos = rec.get("positionM")
        st = stations.get(sid)
        if st is None:
            stations[sid] = {
                "id": sid, "kind": "place", "placeId": place_id,
                "positionM": [round(float(pos[0]), 1), round(float(pos[1]), 1)] if pos else None,
                "status": status if rec.get("status") != "deferred" else "deferred",
            }
        elif status == "active":
            st["status"] = st["status"] if st["status"] == "deferred" else "active"
        return sid

    def lane_between(a_place: str, b_place: str) -> str | None:
        a = a_place.split(".", 2)[2]
        b = b_place.split(".", 2)[2]
        for r in lanes:
            if {r.get("from"), r.get("to")} == {a, b}:
                return r["id"]
        return None

    def pos_of(sid: str):
        return (stations[sid] or {}).get("positionM")

    services: list[dict] = []
    for s in legacy.get("services", []):
        form = s.get("kind")
        out = {
            "id": s["id"],
            "serviceKind": "ferry",
            "form": form,
            "status": s.get("status"),
            "severs": s.get("severs") or [],
            "water": s.get("water"),
            "measured": s.get("measured"),
            "hullClass": s.get("hullClass"),
            "craft": s.get("craft"),
            "fare": s.get("fare"),
            "available": s.get("available") or [],
            "refusedIf": s.get("refusedIf") or [],
            "text": s.get("text"),
            "why": s.get("why"),
            "questUse": s.get("questUse"),
        }
        if s.get("deferredWhy"):
            out["deferredWhy"] = s["deferredWhy"]

        if form == "road-crossing":
            ids = []
            for lg in s.get("landings") or []:
                stations[lg["id"]] = {
                    "id": lg["id"], "kind": "ferry-landing", "positionM": list(lg["positionM"]),
                    "status": s.get("status"), "piece": lg.get("piece"),
                }
                ids.append(lg["id"])
            out["landings"] = ids
            out["crossing"] = None
            socket = ids[0] if ids else None
            road = (s.get("severs") or [None])[0]
            hops = []
            if len(ids) == 2:
                hops.append({"from": ids[0], "to": ids[1],
                             "follows": {"road": road} if road else {"reaches": []},
                             "lengthM": round(_dist(pos_of(ids[0]), pos_of(ids[1])), 1)})
            out["hops"] = hops
        else:
            ids = [place_station(p, s.get("status") or "active") for p in s.get("stations") or []]
            out["stations"] = ids
            socket = ids[0] if ids else None
            hops = []
            for a, b in zip(ids, ids[1:]):
                lane = lane_between(stations[a]["placeId"], stations[b]["placeId"])
                if lane:
                    follows = {"lane": lane}
                    unresolved = False
                else:
                    follows = {"reaches": []}
                    unresolved = True
                    warnings.append(f"{s['id']}: no registry lane joins {a} and {b} "
                                    f"— hop left unresolved (never invent a lane)")
                hop = {"from": a, "to": b, "follows": follows,
                       "lengthM": round(_dist(pos_of(a), pos_of(b)), 1)
                       if pos_of(a) and pos_of(b) else None}
                if unresolved:
                    hop["unresolved"] = True
                hops.append(hop)
            out["hops"] = hops

        op = dict(s.get("operator") or {})
        if socket:
            op["socket"] = {"stationId": socket}
        out["operator"] = op
        services.append(out)

    # --- boat lanes between catalogue stations that declare `boat` ---------
    for r in lanes:
        if r.get("mode") != "boat":
            continue
        a, b = by_suffix.get(r.get("from") or ""), by_suffix.get(r.get("to") or "")
        if not a or not b:
            continue

        def declares_boat(pid):
            pl = places.get(pid) or {}
            return "boat" in ((pl.get("travelStation") or {}).get("modes") or [])

        if not (declares_boat(a) and declares_boat(b)):
            continue
        sa, sb = place_station(a), place_station(b)
        slug = f"{r['from']}-{r['to']}"
        sid = f"boat.{slug}"
        services.append({
            "id": sid,
            "serviceKind": "boat",
            "form": "station-run",
            "status": "active",
            "stations": [sa, sb],
            "hops": [{"from": sa, "to": sb, "follows": {"lane": r["id"]},
                      "lengthM": round(_dist(pos_of(sa), pos_of(sb)), 1)
                      if pos_of(sa) and pos_of(sb) else None}],
            "operator": {"slotId": f"boat-slot.{slug}.owner", "role": "boat owner",
                         "ownerFaction": None, "nearestPlaceId": a,
                         "socket": {"stationId": sa}},
            "fare": {"gold": BOAT_FARE_GOLD, "freeIf": []},
            "available": [],
            "refusedIf": [],
            "text": {"name": f"text.boat.{slug}.name", "hail": f"text.boat.{slug}.hail"},
            "why": (f"The registry lane `{r['id']}` joins two catalogue stations that both "
                    f"declare `boat` in `travelStation.modes`. The edge is written down so the "
                    f"travel system reads one graph rather than re-deriving it from the place "
                    f"records."),
            "questUse": None,
        })

    # --- the rootworm network --------------------------------------------
    root_ids = {}
    for st in roots.get("stations", []):
        name = st["id"][len("root-"):] if st["id"].startswith("root-") else st["id"]
        sid = f"root-node.{name}"
        root_ids[st["id"]] = sid
        from .scale import uv_to_metres
        stations[sid] = {
            "id": sid, "kind": "root-node",
            "positionM": [round(uv_to_metres(st["u"]), 1), round(uv_to_metres(st["v"]), 1)],
            "status": "placeholder", "notes": st.get("notes"),
        }
    rootways = []
    hops = []
    for e in roots.get("edges", []):
        a, b = root_ids[e["from"]], root_ids[e["to"]]
        rid = f"rootway.{a.split('.', 1)[1]}-{b.split('.', 1)[1]}"
        rootways.append({"id": rid, "from": a, "to": b, "status": "placeholder"})
        hops.append({"from": a, "to": b, "follows": {"rootway": rid},
                     "lengthM": round(_dist(stations[a]["positionM"],
                                            stations[b]["positionM"]), 1)})
    if root_ids:
        services.append({
            "id": "rootworm.underground-express",
            "serviceKind": "rootworm",
            "form": "station-run",
            "status": "placeholder",
            "placeholderWhy": ("Pass-1 network; re-authored at the hero Hist nodes in 16g "
                               "(decision 0068)"),
            "stations": list(root_ids.values()),
            "hops": hops,
            "operator": {"slotId": "rootworm-slot.underground-express.waykeeper",
                         "role": "Waykeeper", "ownerFaction": None, "nearestPlaceId": None,
                         "socket": {"stationId": root_ids[roots["stations"][0]["id"]]}},
            "fare": {"gold": 0, "freeIf": []},
            "available": [],
            "refusedIf": [],
            "text": {"name": "text.rootworm.underground-express.name",
                     "hail": "text.rootworm.underground-express.hail"},
            "why": roots.get("note"),
            "questUse": None,
        })

    for w in warnings:
        print("travel_services: WARNING " + w)

    craft = dict(legacy.get("craft") or {})
    craft["_"] = (craft.get("_", "").replace(
        "`watercraft-v1` is built (45/45) but is NOT yet in any compiled settlement and its GLB "
        "is not yet deployed to apps/world-studio/public/kits - see "
        "docs/phases/P-polish/backlog.md.",
        "`watercraft-v1` is built (45/45) and its GLB is deployed to "
        "apps/world-studio/public/kits."))
    return {
        "_": ("The province's travel services: who will carry you, from where to where, for "
              "what, and when they will not. ONE graph for every kind of service - the ferries "
              "that repair a named break in a road, the scheduled boat and ferry runs between "
              "catalogued stations, the rootworm Underground Express, and the guides, carts and "
              "porters Phase 15 adds - so the travel system, the quest system and the map read "
              "one record rather than re-deriving a network from 800 place records. AUTHORED "
              "except where a derive stage measures it: "
              "`world/sources/routes/water-crossings.json` says where a way stands in water, and "
              "this file says which of those the world answers with a boat and why. A "
              "`road-crossing` service repairs a break in a way - the road arrives at water it "
              "cannot bridge and continues on the far bank, and the service is the only lawful "
              "join. A `station-run` is a scheduled passage between stations that already "
              "declare the mode in `travelStation.modes`, the Morrowind-style pay-and-go "
              "network. Every service is `talk and teleport` (owner ruling 2026-09-09): the "
              "player speaks to the operator, pays, and arrives. No boat is simulated and no "
              "service is a vehicle. Every string a player reads is a `text.*` id in "
              "packages/text-catalogue (engineering standard 4); every gate is a predicate from "
              "docs/quests/85-condition-vocabulary.md (standard 10). Derived and checked by "
              "`python3 -m worldgen.travel_services` and `--check`."),
        "schemaVersion": SCHEMA_VERSION,
        "policy": legacy.get("policy"),
        "operatorModel": legacy.get("operatorModel"),
        "craft": craft,
        "vocabulary": {"kinds": SERVICE_KINDS, "stationKinds": STATION_KINDS,
                       "hopFollows": HOP_FOLLOWS},
        "stations": [stations[k] for k in sorted(stations)],
        "services": sorted(services, key=lambda s: s["id"]),
        "rootways": rootways,
    }


# --------------------------------------------------------------------------
# derive — join the road-crossing ferries to the measured crossings
# --------------------------------------------------------------------------

def derive(doc: dict, crossings: list[dict], sw=None) -> list[str]:
    """Match, move and measure in place. Returns the per-service summary lines."""
    from .dock_spec import HULL_CLASS_DEPTH_M

    stations = {s["id"]: s for s in doc["stations"]}
    lines: list[str] = []
    for s in doc["services"]:
        if s.get("serviceKind") != "ferry" or s.get("form") != "road-crossing":
            continue
        land = [stations[i] for i in s.get("landings") or []]
        if len(land) != 2:
            lines.append(f"{s['id']}: not two landings, skipped")
            continue
        want = _mid(land[0]["positionM"], land[1]["positionM"])
        severs = set(s.get("severs") or [])
        best, best_m = None, None
        for c in crossings:
            if not (severs & set(c.get("servesRoutes") or [])):
                continue
            banks = c.get("banks")
            if not banks:
                continue
            d = _dist(_mid(banks[0], banks[1]), want)
            if best_m is None or d < best_m:
                best, best_m = c, d
        if best is None or best_m > MATCH_RADIUS_M:
            s["status"] = "unmatched"
            s["crossing"] = None
            s["unmatchedWhy"] = (
                f"No crossing on {sorted(severs)} lies within {MATCH_RADIUS_M:.0f} m of the "
                + (f"authored landings; the nearest is {best['id']} at {best_m:.0f} m "
                   f"({best['spanM']} m, {best['entityId']})."
                   if best is not None
                   else "authored landings; no crossing on those routes stands in water at all."))
            for st in land:
                st["status"] = "unmatched"
            lines.append(f"{s['id']}: UNMATCHED — {s['unmatchedWhy']}")
            continue

        s["crossing"] = {"id": best["id"], "entityId": best["entityId"],
                         "entityKind": best["entityKind"], "spanM": best["spanM"],
                         "maxDepthM": best["maxDepthM"]}
        s["measured"] = {"spanM": best["spanM"], "maxDepthM": best["maxDepthM"],
                         "source": "world/sources/routes/water-crossings.json"}
        banks = [list(map(float, b)) for b in best["banks"]]
        # nearest bank to each landing, without giving both landings one bank
        if _dist(land[0]["positionM"], banks[0]) + _dist(land[1]["positionM"], banks[1]) > \
           _dist(land[0]["positionM"], banks[1]) + _dist(land[1]["positionM"], banks[0]):
            banks = [banks[1], banks[0]]
        hull = s.get("hullClass")
        need = HULL_CLASS_DEPTH_M.get(hull, 0.0)
        for st, bank, other in ((land[0], banks[0], banks[1]), (land[1], banks[1], banks[0])):
            st["positionM"] = [round(bank[0], 1), round(bank[1], 1)]
            st["status"] = s.get("status")
            if sw is None:
                continue
            st["berth"] = _berth(sw, bank, other, hull, need)
            if not st["berth"]["floats"]:
                b = st["berth"]
                s["status"] = "unmatched"
                s["unmatchedWhy"] = (
                    f"berth at {st['id']} reaches {b['depthM']} m within "
                    f"{BERTH_SEARCH_M:.0f} m; hull class {hull} needs {need} m — change the "
                    f"craft or move the landing (the Alten Corimont precedent, ruling 6: "
                    f"no dredging)")
        for st in land:
            st["status"] = s.get("status")
        if s.get("hops"):
            s["hops"][0]["lengthM"] = round(_dist(land[0]["positionM"], land[1]["positionM"]), 1)
        floats = [bool((st.get("berth") or {}).get("floats")) for st in land if st.get("berth")]
        jetties = [(st.get("berth") or {}).get("jettyM") for st in land if st.get("berth")]
        lines.append(f"{s['id']}: matched {best['id']} at {best_m:.0f} m, span {best['spanM']} m, "
                     f"depth {best['maxDepthM']} m, berths float={floats or 'not measured'}, "
                     f"jettyM={jetties or 'not measured'}"
                     + (f" — UNMATCHED: {s['unmatchedWhy']}"
                        if s.get("status") == "unmatched" else ""))
    return lines


def _berth(sw, bank, other, hull: str, need: float) -> dict:
    """Walk from the bank into the water along the way and stop at the first
    sample the hull floats in. The distance walked is the jetty 16h places."""
    L = _dist(bank, other) or 1.0
    ux, uz = (other[0] - bank[0]) / L, (other[1] - bank[1]) / L
    deepest, at = None, None
    d = BERTH_STEP_M
    while d <= BERTH_SEARCH_M + 1e-9:
        px, pz = bank[0] + ux * d, bank[1] + uz * d
        rec = sw.water_at(px, pz) or {}
        depth = round(float(rec.get("depthM") or 0.0), 2)
        if depth >= need:
            return {"entityId": rec.get("id"), "entityKind": rec.get("kind"),
                    "depthM": depth, "hullClass": hull, "floats": True,
                    "positionM": [round(px, 1), round(pz, 1)], "jettyM": round(d, 1)}
        if deepest is None or depth > deepest[0]:
            deepest, at = (depth, rec), (px, pz)
        d += BERTH_STEP_M
    depth, rec = deepest if deepest else (0.0, {})
    px, pz = at if at else (bank[0], bank[1])
    return {"entityId": rec.get("id"), "entityKind": rec.get("kind"),
            "depthM": depth, "hullClass": hull, "floats": False,
            "positionM": [round(px, 1), round(pz, 1)], "jettyM": None}


# --------------------------------------------------------------------------
# check
# --------------------------------------------------------------------------

ID_PREFIXES = ("ferry.", "boat.", "rootworm.", "guide.", "cart.", "porter.")
STATION_PREFIXES = {"place": "station.", "ferry-landing": "ferry-landing.",
                    "root-node": "root-node."}


def check(doc: dict | None = None) -> list[str]:
    from .dock_spec import HULL_CLASS_DEPTH_M  # noqa: F401  (kept with the berth rule)

    errs: list[str] = []
    if doc is None:
        doc = json.loads(SERVICES.read_text(encoding="utf-8"))
    if "schemaVersion" not in doc:
        errs.append("travel-services.json: no schemaVersion (engineering standard 7)")

    crossings = {}
    if CROSSINGS.exists():
        crossings = {c["id"]: c for c in
                     json.loads(CROSSINGS.read_text(encoding="utf-8"))["crossings"]}
    else:
        errs.append("water-crossings.json is missing — run `python3 -m worldgen.derive_crossings`")

    text_ids, predicates, places = _text_ids(), _predicates(), _places()
    reg = _registry()
    routes = _route_ids(reg)

    craft = doc.get("craft", {})
    for name, c in craft.items():
        if name == "_":
            continue
        pieces = _kit_pieces(c.get("kit", ""))
        if not pieces:
            continue  # kit not built on this machine; the asset audit covers it
        for key in ("pieceRef", "mooringPost", "gangplank"):
            ref = c.get(key)
            if ref and ref not in pieces:
                errs.append(f"craft {name}.{key}: {ref!r} is not in kit {c['kit']}")

    stations = {}
    for st in doc.get("stations", []):
        sid = st.get("id", "<no id>")
        kind = st.get("kind")
        if kind not in STATION_KINDS:
            errs.append(f"station {sid}: kind must be one of {STATION_KINDS}")
        elif not str(sid).startswith(STATION_PREFIXES[kind]):
            errs.append(f"station {sid}: a {kind} station id must start "
                        f"`{STATION_PREFIXES[kind]}` (standard 2)")
        if sid in stations:
            errs.append(f"station {sid}: duplicate id")
        stations[sid] = st
        if st.get("status") not in STATUSES:
            errs.append(f"station {sid}: status must be one of {sorted(STATUSES)}")
        pid = st.get("placeId")
        if pid is not None and pid not in places:
            errs.append(f"station {sid}: placeId {pid!r} is not a catalogue place")
        pos = st.get("positionM")
        if st.get("status") == "active" and not (isinstance(pos, list) and len(pos) == 2):
            errs.append(f"station {sid}: an active station needs a positionM")

    rootways = {r["id"] for r in doc.get("rootways", []) if "id" in r}
    for r in doc.get("rootways", []):
        if not str(r.get("id", "")).startswith("rootway."):
            errs.append(f"rootway {r.get('id')!r}: id must be `rootway.*` (standard 2)")
        for end in ("from", "to"):
            if r.get(end) not in stations:
                errs.append(f"rootway {r.get('id')}: {end} {r.get(end)!r} is not a station")

    seen: set[str] = set()
    service_ids: set[str] = set()
    for s in doc.get("services", []):
        sid = s.get("id", "<no id>")
        service_ids.add(sid)
        kind = s.get("serviceKind")
        if kind not in SERVICE_KINDS:
            errs.append(f"service {sid}: serviceKind must be one of {SERVICE_KINDS}")
        elif not str(sid).startswith(kind + "."):
            errs.append(f"service {sid}: id must be namespaced `{kind}.*` (standard 2)")
        if not str(sid).startswith(ID_PREFIXES):
            errs.append(f"service {sid}: id must be namespaced {ID_PREFIXES} (standard 2)")
        if sid in seen:
            errs.append(f"service {sid}: duplicate id")
        seen.add(sid)
        if s.get("form") not in FORMS:
            errs.append(f"service {sid}: form must be one of {sorted(FORMS)}")
        status = s.get("status")
        if status not in STATUSES:
            errs.append(f"service {sid}: status must be one of {sorted(STATUSES)}")
        if status == "deferred" and not str(s.get("deferredWhy") or "").strip():
            errs.append(f"service {sid}: deferred needs deferredWhy")
        if status == "placeholder" and not str(s.get("placeholderWhy") or "").strip():
            errs.append(f"service {sid}: placeholder needs placeholderWhy")
        if s.get("craft") is not None and s["craft"] not in craft:
            errs.append(f"service {sid}: craft {s.get('craft')!r} is not in the craft table")

        for rid in s.get("severs") or []:
            if routes and rid not in routes:
                errs.append(f"service {sid}: severs route {rid!r}, not in the route registry")

        ids = list(s.get("landings") or []) + list(s.get("stations") or [])
        if not ids:
            errs.append(f"service {sid}: names no stations")
        for stid in ids:
            st = stations.get(stid)
            if st is None:
                errs.append(f"service {sid}: station {stid!r} is not in `stations`")
                continue
            if s.get("form") == "station-run" and st.get("placeId"):
                modes = (places.get(st["placeId"], {}).get("travelStation") or {}).get("modes") or []
                if kind in ("ferry", "boat", "rootworm") and kind not in modes:
                    errs.append(f"service {sid}: station {stid!r} does not declare {kind!r} in "
                                f"travelStation.modes — the catalogue and this graph must agree")
        if s.get("form") == "station-run" and len(ids) < 2:
            errs.append(f"service {sid}: a station-run needs at least two stations")
        if s.get("form") == "road-crossing" and len(s.get("landings") or []) != 2:
            errs.append(f"service {sid}: a road-crossing has exactly two landings")

        for hop in s.get("hops") or []:
            for end in ("from", "to"):
                if hop.get(end) not in stations:
                    errs.append(f"service {sid}: hop {end} {hop.get(end)!r} is not a station")
            follows = hop.get("follows") or {}
            if not follows or set(follows) - set(HOP_FOLLOWS):
                errs.append(f"service {sid}: hop follows must be one of {HOP_FOLLOWS}")
            for key in ("lane", "road"):
                if follows.get(key) and routes and follows[key] not in routes:
                    errs.append(f"service {sid}: hop follows {key} {follows[key]!r}, which is not "
                                f"in the route registry")
            if follows.get("rootway") and follows["rootway"] not in rootways:
                errs.append(f"service {sid}: hop follows rootway {follows['rootway']!r}, which "
                            f"is not in `rootways`")

        op = s.get("operator") or {}
        if not str(op.get("slotId", "")).endswith(".owner") and "-slot." not in str(op.get("slotId", "")):
            errs.append(f"service {sid}: operator.slotId {op.get('slotId')!r} must be a `*-slot.*` "
                        f"id, not an `npc.*` registry id — Phase 13 stamps the register ref here")
        socket = (op.get("socket") or {}).get("stationId")
        if socket is not None and socket not in stations:
            errs.append(f"service {sid}: operator.socket.stationId {socket!r} is not a station")
        npid = op.get("nearestPlaceId")
        if npid and npid not in places:
            errs.append(f"service {sid}: operator.nearestPlaceId {npid!r} is not a catalogue place")

        for field in ("available", "refusedIf"):
            for cond in s.get(field) or []:
                p = cond.get("predicate")
                if predicates and p not in predicates:
                    errs.append(f"service {sid}.{field}: {p!r} is not in the condition vocabulary "
                                f"(docs/quests/85-condition-vocabulary.md)")
        for cond in (s.get("fare") or {}).get("freeIf") or []:
            p = cond.get("predicate")
            if predicates and p not in predicates:
                errs.append(f"service {sid}.fare.freeIf: {p!r} is not in the condition vocabulary")

        for key, tid in (s.get("text") or {}).items():
            if text_ids and tid not in text_ids:
                errs.append(f"service {sid}.text.{key}: {tid!r} is not registered in "
                            f"packages/text-catalogue (engineering standard 4)")

        cr = s.get("crossing")
        if cr is not None:
            if crossings and cr.get("id") not in crossings:
                errs.append(f"service {sid}: crossing {cr.get('id')!r} is not in "
                            f"water-crossings.json")
        if kind == "ferry" and s.get("form") == "road-crossing":
            if status == "active" and cr is None:
                errs.append(f"service {sid}: an active road-crossing ferry has no matched "
                            f"crossing — an unmatched service must carry status `unmatched`")
            if status == "unmatched" and not str(s.get("unmatchedWhy") or "").strip():
                errs.append(f"service {sid}: unmatched needs unmatchedWhy")
            if status == "active":
                for stid in s.get("landings") or []:
                    berth = (stations.get(stid) or {}).get("berth")
                    if berth is None:
                        errs.append(f"service {sid}: landing {stid} has no berth — run "
                                    f"`python3 -m worldgen.travel_services`")
                    elif not berth.get("floats"):
                        errs.append(f"service {sid}: landing {stid} berth is "
                                    f"{berth.get('depthM')} m, which does not float a "
                                    f"{berth.get('hullClass')}")
                    elif berth.get("jettyM") is None:
                        errs.append(f"service {sid}: landing {stid} berth carries no jettyM — "
                                    f"the dock length 16h places; run "
                                    f"`python3 -m worldgen.travel_services`")

    errs.extend(_check_fast_nodes(service_ids))
    return errs


def _check_fast_nodes(service_ids: set[str]) -> list[str]:
    """Every `FAST <slug>` node in the quest place map resolves to a service."""
    if not QUEST_PLACE_MAP.exists():
        return []
    errs = []
    for slug in re.findall(r"^\|\s*`FAST\s+([^`]+)`", QUEST_PLACE_MAP.read_text(encoding="utf-8"),
                           re.M):
        want = re.split(r"[.\-]", slug.strip().replace("_", "-"))
        hit = False
        for sid in service_ids:
            have = re.split(r"[.\-]", sid)
            if have[0] == want[0] and len(have) >= len(want) \
                    and have[len(have) - len(want) + 1:] == want[1:]:
                hit = True
                break
        if not hit:
            errs.append(f"quests 25: `FAST {slug}` resolves to no service in "
                        f"travel-services.json")
    return errs


# --------------------------------------------------------------------------

def dump(doc: dict) -> str:
    return json.dumps(doc, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--from-legacy", action="store_true",
                    help="rebuild the graph from the two retired records (lineage)")
    ap.add_argument("--check", action="store_true", help="reference integrity only")
    a = ap.parse_args(argv)

    if a.check:
        errs = check()
        if errs:
            raise SystemExit("travel-services.json:\n  " + "\n  ".join(errs))
        doc = json.loads(SERVICES.read_text(encoding="utf-8"))
        live = [s for s in doc["services"] if s.get("status") == "active"]
        print(f"travel_services: {len(doc['stations'])} stations, {len(doc['services'])} services "
              f"({len(live)} active), all references resolve")
        return

    if a.from_legacy:
        doc = migrate()
        SERVICES.write_text(dump(doc), encoding="utf-8")
        print(f"travel_services: migrated -> {SERVICES} "
              f"({len(doc['stations'])} stations, {len(doc['services'])} services)")
        return

    doc = json.loads(SERVICES.read_text(encoding="utf-8"))
    crossings = json.loads(CROSSINGS.read_text(encoding="utf-8"))["crossings"]
    try:
        from .water_report import ShippedWater
        sw = ShippedWater()
    except (FileNotFoundError, OSError) as e:
        sw = None
        print(f"travel_services: berths not measured, the water bundle is absent ({e})")
    for line in derive(doc, crossings, sw):
        print("travel_services: " + line)
    SERVICES.write_text(dump(doc), encoding="utf-8")


if __name__ == "__main__":
    main()
