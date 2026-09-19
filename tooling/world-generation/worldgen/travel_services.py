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
`rootways[]`   the rootworm edges, rebuilt each run from the authored
               `routes/rootworm-stations.json` (nodes, their places and their
               Waykeeper slots).
`harbourStations`
               where each of the eight major cities boards a boat: the city's
               own quay when its gate stands on a lane, otherwise the place
               named in the authored `routes/harbour-stations.json`.

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

WHAT GATES AND WHAT ONLY REPORTS (owner 2026-09-18, 16g deliverable 6)
----------------------------------------------------------------------
* CONNECTEDNESS gates. `check()` fails when the active stations and active
  services are not ONE component: a station a traveller cannot reach from the
  rest of the network is a hole in the world.
* DEPTH only reports. A hop or a berth shallower than the craft's
  `dock_spec.HULL_CLASS_DEPTH_M` becomes a `warnings[]` row
  (`{kind, depthM, needM, at}`) and the service stays `active`; 16h answers it
  with the craft or the jetty. A shortfall that is NOT written down is still
  an error — a silent shallow is the defect, not a shallow one.
* `unmatched` is reserved for three faults: a landing on DRY ground (no water
  entity within 30 m of the bank point), a station whose place is not a live
  record with a position, and a hop whose chain of lanes does not exist.

Every station-run hop is re-solved each run from the stations' CURRENT record
positions (a place the plot moves takes its station with it) and pathed over
the published waterways — `province/waterways.json` plus the minor channels of
`province/waterways-minor.json` — so `follows` is `{lanes: [...]}`, the chain
actually walked, and `lengthM` is its geometry.
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
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
WATERWAYS = PROVINCE / "waterways.json"
WATERWAYS_MINOR = PROVINCE / "waterways-minor.json"
HARBOURS = REPO_ROOT / "world" / "sources" / "routes" / "harbour-stations.json"
ROOT_STATIONS = REPO_ROOT / "world" / "sources" / "routes" / "rootworm-stations.json"
ANCHORS = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"

SCHEMA_VERSION = 1

SERVICE_KINDS = ["ferry", "boat", "rootworm", "guide", "cart", "porter"]
STATION_KINDS = ["place", "ferry-landing", "root-node"]
HOP_FOLLOWS = ["lane", "lanes", "bodies", "rivers", "reaches", "rootway", "road"]
FORMS = {"road-crossing", "station-run"}
STATUSES = {"active", "placeholder", "deferred", "unmatched", "retired"}
#: A retired service is kept as a record of a decision, never re-resolved:
#: the derive leaves it alone and the checks read `retiredWhy`.
RETIRED = "retired"

#: How far a crossing's bank midpoint may sit from a ferry's authored landing
#: midpoint and still be the same crossing.
#: crossing.major.025 sits 408 m off the Onkobra bond ferry; the 8 m miss is
#: noise, not a re-site.
MATCH_RADIUS_M = 450.0
#: How far in from the bank the berth search walks before giving up.
BERTH_SEARCH_M = 30.0
#: Step of that walk, in metres.
BERTH_STEP_M = 1.0
BOAT_FARE_GOLD = 5
#: How far a station may sit from the nearest published lane vertex and still
#: board from it WITHOUT comment (16g deliverable 6, rule 3). Beyond it the
#: station still boards, over a jetty, and the run says so.
STATION_LANE_M = 60.0
#: The 16e BERTH WALK (decision 0069; 16g deliverable 6, "connectedness over
#: depth"): how far a station may sit from the nearest published lane vertex
#: and still board at all. A station within the walk reaches the water over a
#: jetty whose length is recorded on the hop as `jettyM`; only past this limit
#: is the hop `unmatched`. Connectedness is what a traveller feels; the length
#: of the walk and the depth at its end are reported, not gated.
STATION_BERTH_WALK_M = 250.0
#: Two stations this close together, or resolving to the same place, are one
#: interchange: a traveller steps from one to the other on foot. The
#: rootworm's `root-node.*` and the boat network's `station.*` meet here.
TRANSFER_M = 300.0
#: How close two lane polylines must pass to be one navigable network.
LANE_JOIN_M = 60.0
#: What a change of lane costs the search (not the answer): without it a hop
#: zig-zags between two lanes that run parallel within the join radius, and
#: the chain of lanes it reports is noise. The reported `lengthM` is always
#: the true walked geometry, never this cost.
LANE_SWITCH_PENALTY_M = 250.0
#: A landing with no water entity within this radius of its bank point is DRY
#: — the one berth condition that still unmatches a service (rule 2).
DRY_LANDING_M = 30.0
#: Spacing of the depth samples taken along a resolved hop.
HOP_SAMPLE_M = 50.0
WARNING_KINDS = {"shallow-hop", "shallow-berth"}
#: The eight major anchors that must each have a harbour station (rule 4).
MAJOR_RANK = "major"


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
# the published lane network — where a boat may actually go
# --------------------------------------------------------------------------

def lane_polylines(paths=None) -> list[tuple[str, list[list[float]]]]:
    """Every published navigable polyline, in metres: the anchor lanes of
    `province/waterways.json` plus the minor channels `compile_minor_waterways`
    solves into `province/waterways-minor.json` (optional: a run before that
    stage has no minor file, and the hops then path over the majors alone)."""
    from .scale import hydro_pixel_center_to_metres as px_m

    out: list[tuple[str, list[list[float]]]] = []
    for path in (paths if paths is not None else (WATERWAYS, WATERWAYS_MINOR)):
        path = Path(path)
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for key in ("lanes", "channels"):
            for lane in doc.get(key) or []:
                pts = lane.get("pointsM") or [[px_m(p[0]), px_m(p[1])]
                                              for p in lane.get("px") or []]
                pts = [[float(p[0]), float(p[1])] for p in pts]
                if len(pts) >= 2 and lane.get("id"):
                    out.append((lane["id"], pts))
    return sorted(out, key=lambda r: r[0])


class LaneNetwork:
    """The lane polylines as one navigable graph: a node per vertex, an edge
    along each polyline, and an edge wherever two lanes pass within
    `LANE_JOIN_M` of each other (the published lanes meet at shared water, not
    at shared vertices). Deterministic: nodes are added in lane-id order."""

    def __init__(self, polylines: list[tuple[str, list[list[float]]]], join_m=LANE_JOIN_M):
        self.join_m = float(join_m)
        self.pts: list[list[float]] = []
        self.lane: list[str] = []
        self.adj: dict[int, list[tuple[int, float]]] = {}
        self._cell = max(self.join_m, 1.0)
        self._grid: dict[tuple[int, int], list[int]] = {}
        for lid, pts in polylines:
            first = len(self.pts)
            for i, p in enumerate(pts):
                n = len(self.pts)
                self.pts.append(p)
                self.lane.append(lid)
                self._grid.setdefault(self._key(p), []).append(n)
                if n > first:
                    self._edge(n - 1, n, _dist(self.pts[n - 1], p))
        for n, p in enumerate(self.pts):
            for m in self._near_nodes(p):
                if m > n and self.lane[m] != self.lane[n]:
                    d = _dist(p, self.pts[m])
                    if d <= self.join_m:
                        self._edge(n, m, d + LANE_SWITCH_PENALTY_M)

    def _key(self, p):
        return (int(math.floor(p[0] / self._cell)), int(math.floor(p[1] / self._cell)))

    def _edge(self, a: int, b: int, w: float) -> None:
        self.adj.setdefault(a, []).append((b, w))
        self.adj.setdefault(b, []).append((a, w))

    def _near_nodes(self, p, rings: int = 1) -> list[int]:
        cx, cy = self._key(p)
        out = []
        for i in range(cx - rings, cx + rings + 1):
            for j in range(cy - rings, cy + rings + 1):
                out.extend(self._grid.get((i, j), ()))
        return out

    def nearest(self, p) -> tuple[int | None, float]:
        """The nearest lane vertex and its distance (searches outward rings so
        a station far off the network still gets a measured distance)."""
        best, best_d = None, None
        rings = 1
        while rings <= 64:
            for n in self._near_nodes(p, rings):
                d = _dist(p, self.pts[n])
                if best_d is None or d < best_d or (d == best_d and n < best):
                    best, best_d = n, d
            if best is not None and best_d <= rings * self._cell:
                break
            rings *= 2
        return best, (best_d if best_d is not None else float("inf"))

    def path(self, a: int, b: int) -> tuple[list[str], float, list[list[float]]] | None:
        """Dijkstra between two vertices. Returns the ordered lane ids walked
        (consecutive repeats collapsed), the summed polyline length, and the
        points walked — or None when the two are not on one network."""
        import heapq
        dist = {a: 0.0}
        prev: dict[int, int] = {}
        q = [(0.0, a)]
        while q:
            d, n = heapq.heappop(q)
            if n == b:
                break
            if d > dist.get(n, float("inf")):
                continue
            for m, w in sorted(self.adj.get(n, ())):
                nd = d + w
                if nd < dist.get(m, float("inf")) - 1e-9:
                    dist[m] = nd
                    prev[m] = n
                    heapq.heappush(q, (nd, m))
        if b not in dist:
            return None
        chain = [b]
        while chain[-1] != a:
            chain.append(prev[chain[-1]])
        chain.reverse()
        lanes: list[str] = []
        for n in chain:
            if not lanes or lanes[-1] != self.lane[n]:
                lanes.append(self.lane[n])
        points = [self.pts[n] for n in chain]
        walked = sum(_dist(points[i], points[i + 1]) for i in range(len(points) - 1))
        return lanes, round(walked, 1), points


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

def _warn(obj: dict, kind: str, depth_m, need_m, at: str) -> None:
    """Record a depth shortfall. Depth is REPORTED, never gated (rule 2): the
    service keeps its status and carries the measurement for 16h to answer."""
    obj.setdefault("warnings", []).append({
        "kind": kind,
        "depthM": (None if depth_m is None else round(float(depth_m), 2)),
        "needM": round(float(need_m), 2),
        "at": at,
    })


def _station_site(place: dict) -> list[float] | None:
    """Where a traveller boards at a place: its quay gate when the record
    carries a city layout, otherwise the record's own position. Read from the
    record every run, so a place the plot moves takes its station with it."""
    gate = (place.get("cityLayout") or {}).get("gate")
    pos = gate or place.get("positionM")
    if not (isinstance(pos, (list, tuple)) and len(pos) == 2):
        return None
    return [round(float(pos[0]), 1), round(float(pos[1]), 1)]


def _resite_place_stations(doc: dict, places: dict, lines: list[str]) -> None:
    """Every station that names a place is re-sited from that place's current
    record (rule 7). A station whose place is not a live record with a
    position is `unmatched` — never left standing on a stale point."""
    for st in doc["stations"]:
        pid = st.get("placeId")
        if not pid:
            continue
        if st.get("status") == RETIRED:
            # A retired station records a decision, exactly as a retired
            # service does: the derive never re-sites it back into the world.
            continue
        place = places.get(pid)
        site = _station_site(place) if place else None
        if place is not None and site is None and place.get("status") == "deferred":
            # A place the plot has not sited yet is deferred, not broken.
            st["status"] = "deferred"
            st["positionM"] = None
            continue
        if place is None or site is None:
            st["status"] = "unmatched"
            st["unmatchedWhy"] = (
                f"placeId {pid!r} is not a catalogue place" if place is None else
                f"place {pid} carries no positionM — a station cannot stand nowhere")
            lines.append(f"{st['id']}: UNMATCHED — {st['unmatchedWhy']}")
            continue
        moved = st.get("positionM") != site
        st["positionM"] = site
        st.pop("unmatchedWhy", None)
        if place.get("status") == "deferred":
            st["status"] = "deferred"
        elif st.get("status") == "unmatched":
            st["status"] = "active"
        if moved:
            lines.append(f"{st['id']}: re-sited to {site} from {pid}")


def derive(doc: dict, crossings: list[dict], sw=None, places=None, net=None,
           roots=None, harbours=None, anchors=None) -> list[str]:
    """Match, move and measure in place. Returns the per-service summary lines."""
    from .dock_spec import HULL_CLASS_DEPTH_M

    places = _places() if places is None else places
    for obj in list(doc.get("stations", [])) + list(doc.get("services", [])):
        obj.pop("warnings", None)
        for hop in obj.get("hops") or []:
            hop.pop("warnings", None)

    lines: list[str] = []
    _resite_place_stations(doc, places, lines)
    _apply_rootworm(doc, places, roots, lines)
    stations = {s["id"]: s for s in doc["stations"]}
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

        if s.get("status") == "unmatched":
            s["status"] = "active"
        s.pop("unmatchedWhy", None)
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
            b = st["berth"]
            if b.get("entityId") is None:
                # DRY ground: the walk in from the bank met no water entity at
                # all. This is the one berth fault that unmatches (rule 2).
                s["status"] = "unmatched"
                s["unmatchedWhy"] = (
                    f"landing {st['id']} is dry — no water entity within "
                    f"{DRY_LANDING_M:.0f} m of the bank point; the crossing the service "
                    f"repairs is not under it")
            elif not b["floats"]:
                # Depth is reported, never gated (rule 2, owner 2026-09-18):
                # 16h answers a shallow berth with the craft or the jetty.
                _warn(s, "shallow-berth", b["depthM"], need, st["id"])
                _warn(st, "shallow-berth", b["depthM"], need, st["id"])
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

    if net is None:
        net = LaneNetwork(lane_polylines())
    lines.extend(_resolve_station_hops(doc, stations, net, sw, places))
    lines.extend(_derive_harbours(doc, places, harbours, anchors, net))
    # The edges that join the network without a hop of their own, derived here
    # and written down for `_check_connected` to read (decision 0066).
    stations = {s["id"]: s for s in doc["stations"]}
    live = {sid for sid, st in stations.items() if st.get("status") == "active"}
    doc["roadEdges"] = _road_edges(doc, stations, live)
    doc["transferEdges"] = _transfer_edges(doc)
    lines.append(f"{len(doc['roadEdges'])} road edge(s) and {len(doc['transferEdges'])} "
                 f"transfer edge(s) join the network off its hops")
    return lines


# --------------------------------------------------------------------------
# station-run hops follow the published waterways (rule 3)
# --------------------------------------------------------------------------

def _accepted_homeless() -> set[str]:
    """The place ids the owner has accepted as unsited (`macro_plot`'s
    register, read once)."""
    from .macro_plot import accepted_homeless
    return set(accepted_homeless())


def _station_bodies(station: dict, places: dict, node, net, sw) -> set[str]:
    """The recorded water bodies a station stands on the edge of.

    Two records answer it and neither is re-derived (decision 0066): the
    station's place carries the body the plot measured it against
    (`plotFacts.water.entityId`), and the lane vertex its berth walk lands on
    stands in a compiled body. A station may touch both.
    """
    out: set[str] = set()
    place = places.get(station.get("placeId")) if station.get("placeId") else None
    entity = ((place or {}).get("plotFacts") or {}).get("water") or {}
    if entity.get("entityId"):
        out.add(entity["entityId"])
    if sw is not None and node is not None:
        rec = sw.water_at(net.pts[node][0], net.pts[node][1]) or {}
        if rec.get("id"):
            out.add(rec["id"])
    return {i for i in out if str(i).startswith("body.")}


def _station_rivers(station: dict, places: dict, node, net, sw) -> set[str]:
    """The rivers a station stands on, through the REACH records it touches.

    Same two witnesses as `_station_bodies` — the plot's measured water fact
    and the berth-walk vertex — read one step further: a reach belongs to a
    river, and two stations on the same river are joined by it whether or not
    a lane has been drawn between them (16g, 2026-09-19).
    """
    if sw is None:
        return set()
    ids: set[str] = set()
    place = places.get(station.get("placeId")) if station.get("placeId") else None
    entity = ((place or {}).get("plotFacts") or {}).get("water") or {}
    if entity.get("entityId"):
        ids.add(entity["entityId"])
    if node is not None:
        rec = sw.water_at(net.pts[node][0], net.pts[node][1]) or {}
        if rec.get("id"):
            ids.add(rec["id"])
    out = set()
    for i in ids:
        reach = sw.reach(i) if not str(i).startswith("body.") else None
        river = (reach or {}).get("river")
        if river:
            out.add(str(river))
    return out


def _resolve_station_hops(doc: dict, stations: dict, net, sw=None, places=None) -> list[str]:
    """Every station-run hop is re-solved from the stations' current positions:
    a hop with no registry lane of its own is pathed over the published lane
    network (majors + the minor channels), and the lanes it walks are written
    down. A station further than `STATION_BERTH_WALK_M` from any lane vertex
    cannot be boarded from the water, and its hops are `unmatched` with the
    distance named — never moved by guesswork.

    A hop whose two stations stand on the SAME recorded body needs no lane at
    all: a lake ferry crosses its lake. That hop `follows: {"bodies": [id]}`
    and is matched on the body, which is what the lane network is a
    convenience for.
    """
    from .dock_spec import HULL_CLASS_DEPTH_M

    places = {} if places is None else places
    lines: list[str] = []
    snap: dict[str, tuple[int | None, float]] = {}

    def nearest(sid: str):
        if sid not in snap:
            pos = (stations.get(sid) or {}).get("positionM")
            snap[sid] = net.nearest(pos) if pos else (None, float("inf"))
        return snap[sid]

    for s in doc["services"]:
        if s.get("form") != "station-run" or s.get("serviceKind") == "rootworm":
            continue
        if s.get("status") == RETIRED:
            continue
        # A station whose place the owner has ACCEPTED as unsited stands
        # nowhere, so its service cannot be solved and is not a failure
        # either: it is DEFERRED until the place has ground (16g, 2026-09-19).
        homeless = sorted(sid for sid in (s.get("stations") or [])
                          if (stations.get(sid) or {}).get("placeId") in _accepted_homeless())
        if homeless:
            s["status"] = "deferred"
            s["deferredWhy"] = (f"{homeless[0]} is in the accepted-homeless register"
                                if len(homeless) == 1 else
                                ", ".join(homeless) + " are in the accepted-homeless register")
            s.pop("unmatchedWhy", None)
            continue
        need = HULL_CLASS_DEPTH_M.get(s.get("hullClass"), 0.0)
        if s.get("status") == "unmatched":
            s["status"] = "active"
            s.pop("unmatchedWhy", None)
        for hop in s.get("hops") or []:
            a, b = stations.get(hop["from"]), stations.get(hop["to"])
            if not (a and b and a.get("positionM") and b.get("positionM")):
                continue
            straight = round(_dist(a["positionM"], b["positionM"]), 1)
            follows = hop.get("follows") or {}
            if (follows.get("lane") or follows.get("road")) and not hop.get("unresolved"):
                hop["lengthM"] = straight
                continue
            (na, da), (nb, db) = nearest(hop["from"]), nearest(hop["to"])
            ends = [(hop["from"], na, da), (hop["to"], nb, db)]
            far = [(sid, d) for sid, _n, d in ends if d > STATION_BERTH_WALK_M]
            shared = sorted(_station_bodies(a, places, na, net, sw)
                            & _station_bodies(b, places, nb, net, sw))
            if shared and (far or na is None or nb is None or net.path(na, nb) is None):
                # One body under both ends: the crossing IS the body. No lane
                # is needed and none is invented.
                hop["follows"] = {"bodies": [shared[0]]}
                hop["lengthM"] = straight
                hop.pop("unresolved", None)
                lines.append(f"{s['id']}: hop {hop['from']} -> {hop['to']} crosses "
                             f"{shared[0]} for {straight} m (both stations stand on it; "
                             f"no lane joins them)")
                continue
            rivers = sorted(_station_rivers(a, places, na, net, sw)
                            & _station_rivers(b, places, nb, net, sw))
            if rivers and (far or na is None or nb is None or net.path(na, nb) is None):
                # One river under both ends: the run follows the river, which
                # is what a lane between them would only be a drawing of.
                hop["follows"] = {"rivers": [rivers[0]]}
                hop["lengthM"] = straight
                hop.pop("unresolved", None)
                lines.append(f"{s['id']}: hop {hop['from']} -> {hop['to']} follows "
                             f"{rivers[0]} for {straight} m (both stations stand on it; "
                             f"no lane joins them)")
                continue
            if na is None or nb is None or far:
                s["status"] = "unmatched"
                why = ("; ".join(f"{sid} is {d:.0f} m from the nearest lane vertex "
                                 f"(berth walk {STATION_BERTH_WALK_M:.0f} m)" for sid, d in far)
                       or "the published lane network is empty")
                s["unmatchedWhy"] = f"hop {hop['from']} -> {hop['to']}: {why}"
                hop["unresolved"] = True
                lines.append(f"{s['id']}: UNMATCHED — {s['unmatchedWhy']}")
                continue
            walk = net.path(na, nb)
            if walk is None:
                s["status"] = "unmatched"
                s["unmatchedWhy"] = (
                    f"hop {hop['from']} -> {hop['to']}: the two stations board on lane "
                    f"{net.lane[na]} and lane {net.lane[nb]}, which are not one navigable "
                    f"network — no chain of published lanes joins them")
                hop["unresolved"] = True
                lines.append(f"{s['id']}: UNMATCHED — {s['unmatchedWhy']}")
                continue
            lane_ids, length_m, points = walk
            hop["follows"] = {"lanes": lane_ids}
            hop["lengthM"] = round(length_m + da + db, 1)
            hop.pop("unresolved", None)
            # The 16e berth walk, written down: how far each end walks out to
            # the lane it boards from, and how deep that lane is where it is
            # boarded. Both are REPORTED; neither gates (deliverable 6).
            hop["jettyM"] = {sid: round(d, 1) for sid, _n, d in ends}
            hop["laneDepthM"] = {
                sid: (None if sw is None else
                      round(float((sw.water_at(net.pts[n][0], net.pts[n][1]) or {})
                                  .get("depthM") or 0.0), 2))
                for sid, n, _d in ends}
            for sid, _n, d in ends:
                if d > STATION_LANE_M:
                    lines.append(
                        f"warn: {s['id']}: {sid} boards over a {d:.0f} m jetty walk "
                        f"(past the {STATION_LANE_M:.0f} m quayside limit, within the "
                        f"{STATION_BERTH_WALK_M:.0f} m berth walk); lane depth there is "
                        f"{hop['laneDepthM'][sid]} m")
            lines.append(f"{s['id']}: hop {hop['from']} -> {hop['to']} follows "
                         f"{len(lane_ids)} lane(s) {lane_ids} for {hop['lengthM']} m "
                         f"(boarding {da:.0f} m / {db:.0f} m off the network)")
            if sw is not None and need:
                shallow = _shallowest(sw, points)
                if shallow is not None and shallow[0] < need:
                    _warn(s, "shallow-hop", shallow[0], need,
                          f"{hop['from']} -> {hop['to']} at "
                          f"[{shallow[1][0]:.0f}, {shallow[1][1]:.0f}]")
    return lines


def _shallowest(sw, points: list[list[float]]) -> tuple[float, list[float]] | None:
    """The shallowest sample along a walked path, sampled every
    `HOP_SAMPLE_M`. Dry ground counts as 0 m: a lane over dry land is the
    shallowest water there is."""
    worst = None
    walked = HOP_SAMPLE_M
    prev = points[0] if points else None
    total = sum(_dist(points[i], points[i + 1]) for i in range(len(points) - 1))
    run = 0.0
    for p in points:
        step = _dist(prev, p)
        walked += step
        run += step
        prev = p
        # The boarding ends are the jetty's problem (16h), not the passage's:
        # the water at a quay point is nearly always ankle deep.
        if run < HOP_SAMPLE_M or total - run < HOP_SAMPLE_M:
            continue
        if walked < HOP_SAMPLE_M:
            continue
        walked = 0.0
        rec = sw.water_at(p[0], p[1]) or {}
        depth = float(rec.get("depthM") or 0.0)
        if worst is None or depth < worst[0]:
            worst = (round(depth, 2), p)
    return worst


# --------------------------------------------------------------------------
# a harbour station per city (rule 4)
# --------------------------------------------------------------------------

HARBOUR_MODES = {"boat", "ferry", "lighter"}


def _major_anchors(anchors=None) -> list[str]:
    if anchors is None:
        if not ANCHORS.exists():
            return []
        anchors = json.loads(ANCHORS.read_text(encoding="utf-8")).get("anchors") or []
    return [a["id"] for a in anchors if a.get("rank") == MAJOR_RANK]


def _derive_harbours(doc: dict, places: dict, harbours=None, anchors=None, net=None) -> list[str]:
    """Every major city boards a boat somewhere. A city whose own record
    declares a water mode AND whose gate stands on a lane's water is its own
    harbour; otherwise the authored `harbour-stations.json` names the place
    that is."""
    if harbours is None:
        harbours = (json.loads(HARBOURS.read_text(encoding="utf-8")).get("harbours") or {}
                    if HARBOURS.exists() else {})
    if net is None:
        net = LaneNetwork(lane_polylines())
    by_suffix = _suffix_index(places)
    stations = {s["id"]: s for s in doc["stations"]}
    out: dict[str, dict] = {}
    lines: list[str] = []
    for anchor in _major_anchors(anchors):
        pid = by_suffix.get(anchor)
        place = places.get(pid) if pid else None
        gate = (place or {}).get("cityLayout", {}).get("gate")
        modes = set(((place or {}).get("travelStation") or {}).get("modes") or [])
        own = None
        if place and (modes & HARBOUR_MODES) and gate:
            _, d = net.nearest(gate)
            if d <= STATION_LANE_M:
                own = {"stationId": station_id_for_place(pid), "placeId": pid,
                       "why": "the city's own quay"}
        authored = harbours.get(anchor) or {}
        # A harbour may be a ferry landing rather than a place: those stations
        # are derived, not catalogue records, so the authored row may name the
        # station id directly (`stationId`) instead of a `placeId`.
        row = own or {
            "stationId": (authored.get("stationId")
                          or (station_id_for_place(authored["placeId"])
                              if authored.get("placeId") else None)),
            "placeId": authored.get("placeId"),
            "why": authored.get("why"),
        }
        out[anchor] = row
        if row["placeId"] is None and row["stationId"] is None:
            lines.append(f"harbour {anchor}: NOT SET — the city's gate is "
                         + (f"{net.nearest(gate)[1]:.0f} m off the lane network"
                            if gate else "absent")
                         + "; world/sources/routes/harbour-stations.json must name the "
                           "place that harbours it")
        elif row["stationId"] not in stations:
            lines.append(f"harbour {anchor}: {row['placeId']} is not a station in this graph")
    doc["harbourStations"] = out
    return lines


# --------------------------------------------------------------------------
# the rootworm network (rule 5)
# --------------------------------------------------------------------------

ROOT_KINDS = {"hub", "station", "seasonal"}


def _apply_rootworm(doc: dict, places: dict, roots=None, lines=None) -> None:
    """Re-site every root node at its place, rebuild the rootways and the
    Underground Express hops from them, and give every node its Waykeeper
    slot. A node whose place is not yet chosen stays `placeholder` on its
    pass-1 point — it is never invented a position."""
    lines = lines if lines is not None else []
    if roots is None:
        if not ROOT_STATIONS.exists():
            return
        roots = json.loads(ROOT_STATIONS.read_text(encoding="utf-8"))
    stations = {s["id"]: s for s in doc["stations"]}
    for row in roots.get("stations") or []:
        sid = row["id"]
        st = stations.get(sid) or {"id": sid, "kind": "root-node", "positionM": None}
        st["kind"] = "root-node"
        st["placeId"] = row.get("placeId")
        st["rootKind"] = row.get("kind")
        st["why"] = row.get("why")
        slug = sid.split(".", 1)[1]
        st["operator"] = {"role": "Waykeeper", "slotId": f"rootworm-slot.{slug}.keeper",
                          "socket": {"stationId": sid}}
        place = places.get(row["placeId"]) if row.get("placeId") else None
        site = _station_site(place) if place else None
        if site is not None:
            st["positionM"] = site
            st["status"] = "deferred" if place.get("status") == "deferred" else "active"
            lines.append(f"{sid}: sited at {site} from {row['placeId']}")
        else:
            st["status"] = "placeholder"
        if sid not in stations:
            doc["stations"].append(st)
            stations[sid] = st

    rootways, hops = [], []
    for edge in roots.get("rootways") or []:
        a, b = edge["from"], edge["to"]
        rid = f"rootway.{a.split('.', 1)[1]}-{b.split('.', 1)[1]}"
        live = all((stations.get(x) or {}).get("status") == "active" for x in (a, b))
        rootways.append({"id": rid, "from": a, "to": b,
                         "status": "active" if live else "placeholder"})
        pa, pb = (stations.get(a) or {}).get("positionM"), (stations.get(b) or {}).get("positionM")
        hops.append({"from": a, "to": b, "follows": {"rootway": rid},
                     "lengthM": round(_dist(pa, pb), 1) if pa and pb else None})
    if not rootways:
        return
    doc["rootways"] = rootways
    for s in doc["services"]:
        if s.get("serviceKind") != "rootworm":
            continue
        s["stations"] = sorted({e[k] for e in rootways for k in ("from", "to")})
        s["hops"] = hops
        live = all(r["status"] == "active" for r in rootways)
        s["status"] = "active" if live else "placeholder"
        if s["status"] == "active":
            s.pop("placeholderWhy", None)
        socket = (s.get("operator") or {}).get("socket") or {}
        if socket.get("stationId") not in stations:
            s["operator"]["socket"] = {"stationId": s["stations"][0]}
    lines.append(f"rootworm: {len(rootways)} rootways, "
                 f"{sum(1 for r in rootways if r['status'] == 'active')} active")


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


def check(doc: dict | None = None, warn: list[str] | None = None) -> list[str]:
    """Reference integrity. `warn` collects the findings that are reported and
    not gated (an unfilled harbour; a measured shallow), so a record that is
    honest about a shortfall still passes."""
    from .dock_spec import HULL_CLASS_DEPTH_M  # noqa: F401  (kept with the berth rule)

    errs: list[str] = []
    warn = warn if warn is not None else []
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
    published_lanes = {lid for lid, _ in lane_polylines()}
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
        if status == RETIRED and not str(s.get("retiredWhy") or "").strip():
            errs.append(f"service {sid}: retired needs retiredWhy")
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
            if follows.get("lanes") is not None:
                if not isinstance(follows["lanes"], list) or not follows["lanes"]:
                    errs.append(f"service {sid}: hop follows `lanes` must be a non-empty list "
                                f"of published lane ids")
                else:
                    unknown = [l for l in follows["lanes"]
                               if published_lanes and l not in published_lanes]
                    if unknown:
                        errs.append(f"service {sid}: hop follows lane(s) {unknown}, which are "
                                    f"not in the published waterways")
            if follows.get("bodies") is not None:
                bodies = follows["bodies"]
                if not isinstance(bodies, list) or not bodies \
                        or not all(str(b).startswith("body.") for b in bodies):
                    errs.append(f"service {sid}: hop follows `bodies` must be a non-empty list "
                                f"of `body.*` ids — the water the hop crosses")
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
                        # Depth is reported, never gated (rule 2): the shortfall
                        # must be WRITTEN DOWN, and a silent one is the defect.
                        if not [w for w in (s.get("warnings") or [])
                                if w.get("kind") == "shallow-berth" and w.get("at") == stid]:
                            errs.append(f"service {sid}: landing {stid} berth is "
                                        f"{berth.get('depthM')} m, which does not float a "
                                        f"{berth.get('hullClass')}, and the service carries no "
                                        f"`shallow-berth` warning for it")
                        else:
                            warn.append(f"service {sid}: landing {stid} berth is "
                                        f"{berth.get('depthM')} m, below the "
                                        f"{berth.get('hullClass')} line")
                    elif berth.get("jettyM") is None:
                        errs.append(f"service {sid}: landing {stid} berth carries no jettyM — "
                                    f"the dock length 16h places; run "
                                    f"`python3 -m worldgen.travel_services`")

    for obj in list(doc.get("stations", [])) + list(doc.get("services", [])):
        for w in obj.get("warnings") or []:
            if w.get("kind") not in WARNING_KINDS:
                errs.append(f"{obj.get('id')}: warning kind {w.get('kind')!r} is not one of "
                            f"{sorted(WARNING_KINDS)}")
            if not str(w.get("at") or "").strip():
                errs.append(f"{obj.get('id')}: a warning must name where it was measured (`at`)")

    errs.extend(_check_connected(doc))
    errs.extend(_check_harbours(doc, places, warn))
    errs.extend(_check_fast_nodes(service_ids))
    return errs


def _road_edges(doc: dict, stations: dict, live: set[str]) -> list[dict]:
    """Landing -> city station edges for the road-crossing ferries.

    A road-crossing ferry repairs a break in a named road, so its landings are
    on that road: each joins the nearest active city station that the same road
    id runs between (the registry row's `from`/`to` anchors).

    This is a DERIVE: it reads the route registry, so it runs once in
    `derive()` and is written down as `roadEdges`. `_check_connected` reads the
    record it produced and never recomputes it (decision 0066: read the record,
    never re-solve it) — which is what keeps the registry out of the check's
    read path.
    """
    by_anchor: dict[str, list[dict]] = {}
    for sid in live:
        st = stations[sid]
        if st.get("kind") != "place" or not st.get("positionM"):
            continue
        by_anchor.setdefault(sid.rsplit(".", 1)[-1], []).append(st)
    ends: dict[str, list[str]] = {}
    for row in _registry():
        for alias in [row.get("id")] + list(row.get("aliases") or []):
            if alias:
                ends[alias] = [row.get("from"), row.get("to")]

    edges: list[dict] = []
    for s in doc.get("services", []):
        if s.get("status") != "active" or s.get("form") != "road-crossing":
            continue
        cands: list[tuple[str, dict]] = []
        for route_id in s.get("severs") or []:
            for anchor in ends.get(route_id) or []:
                cands.extend((route_id, st) for st in (by_anchor.get(anchor) or []))
        if not cands:
            continue
        for lid in s.get("landings") or []:
            land = stations.get(lid)
            if lid not in live or not (land or {}).get("positionM"):
                continue
            road_id, near = min(cands, key=lambda c: _dist(land["positionM"], c[1]["positionM"]))
            edges.append({
                "from": lid, "to": near["id"], "roadId": road_id,
                "why": f"{s['id']} repairs the break in {road_id}; its landing stands on that "
                       f"road, which runs to {near['id']}",
            })

    # A named TRACK with stages carries the places it is counted through just
    # as a road does: a station standing at a stage of the Coast road is on
    # that track, and the track runs to the two ports it is counted between
    # (16g, 2026-09-19).
    for row in _registry():
        if row.get("class") != "track" or not row.get("stages"):
            continue
        anchors = [st for end in (row.get("from"), row.get("to"))
                   for st in (by_anchor.get(end) or [])]
        if not anchors:
            continue
        for stage in row["stages"]:
            for sid in sorted(live):
                st = stations[sid]
                if st.get("placeId") != stage or not st.get("positionM"):
                    continue
                near = min(anchors, key=lambda a: _dist(st["positionM"], a["positionM"]))
                if near["id"] == sid:
                    continue
                edges.append({
                    "from": sid, "to": near["id"], "roadId": row["id"],
                    "why": f"{stage} is a stage of {row['id']}, which carries it "
                           f"to {near['id']}",
                })
    return edges


def _transfer_edges(doc: dict) -> list[dict]:
    """Where the rootworm and the boat network meet on foot.

    A `root-node.*` and a `station.*` that resolve to the same place, or that
    stand within `TRANSFER_M` of each other, are one interchange: a traveller
    steps between them without a service. The edge is undirected and is written
    down so `_check_connected` reads it rather than re-deriving it.
    """
    live = [st for st in doc.get("stations", [])
            if st.get("status") == "active" and st.get("positionM")]
    nodes = [st for st in live if str(st.get("id", "")).startswith("root-node.")]
    quays = [st for st in live if str(st.get("id", "")).startswith("station.")]
    edges: list[dict] = []
    for n in nodes:
        for q in quays:
            same = n.get("placeId") and n.get("placeId") == q.get("placeId")
            d = _dist(n["positionM"], q["positionM"])
            if not same and d > TRANSFER_M:
                continue
            edges.append({
                "from": n["id"], "to": q["id"],
                "why": (f"both stand at {n['placeId']}" if same else
                        f"{d:.0f} m apart, within the {TRANSFER_M:.0f} m walk"),
            })
    return edges


def _check_connected(doc: dict) -> list[str]:
    """The active network is ONE component (rule 1, owner 2026-09-18).
    Connectedness is what a traveller feels; depth is only reported. Every
    active station must be reachable from every other over the hops of active
    services — a station nobody can leave is a dead end in the world.
    A road-crossing ferry's landings join the network by the road they cross,
    and a rootworm node joins the quay beside it on foot (owner 2026-09-18:
    connectedness, not depth). Both sets of edges are READ from the record the
    derive wrote (`roadEdges`, `transferEdges`); the check never re-derives
    them, so it never reads the route registry."""
    stations = {st["id"]: st for st in doc.get("stations", [])}
    live = {sid for sid, st in stations.items() if st.get("status") == "active"}
    if len(live) < 2:
        return []
    adj: dict[str, set[str]] = {sid: set() for sid in live}
    for s in doc.get("services", []):
        if s.get("status") != "active":
            continue
        for hop in s.get("hops") or []:
            a, b = hop.get("from"), hop.get("to")
            if a in live and b in live:
                adj[a].add(b)
                adj[b].add(a)
    for edge in list(doc.get("roadEdges") or []) + list(doc.get("transferEdges") or []):
        a, b = edge.get("from"), edge.get("to")
        if a in live and b in live:
            adj[a].add(b)
            adj[b].add(a)
    seen, stack = set(), [min(live)]
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        stack.extend(adj[n] - seen)
    if seen == live:
        return []
    rest = sorted(live - seen)
    return [f"the active network is not connected: {len(seen)} of {len(live)} active stations "
            f"reach {min(live)}; {len(rest)} do not ({', '.join(rest[:8])}"
            f"{' ...' if len(rest) > 8 else ''}) — every station must reach every other by "
            f"some chain of active hops (rule 1)"]


def _check_harbours(doc: dict, places: dict, warn: list[str]) -> list[str]:
    """Every major city has a harbour station. An unfilled harbour is a
    WARNING until `harbour-stations.json` names them all; a harbour that
    points at something that is not a station is an error."""
    errs: list[str] = []
    block = doc.get("harbourStations")
    if block is None:
        return ["no `harbourStations` block — run `python3 -m worldgen.travel_services`"]
    stations = {st["id"]: st for st in doc.get("stations", [])}
    # Filled means the traveller has somewhere to board: a place OR, for a
    # ferry landing, the station id itself.
    missing = [k for k, v in sorted(block.items())
               if not ((v or {}).get("placeId") or (v or {}).get("stationId"))]
    for anchor in missing:
        warn.append(f"harbour {anchor}: no harbour place chosen yet "
                    f"(world/sources/routes/harbour-stations.json)")
    for anchor, row in sorted(block.items()):
        pid = (row or {}).get("placeId")
        if pid is None and not (row or {}).get("stationId"):
            continue
        if pid is not None and pid not in places:
            errs.append(f"harbour {anchor}: placeId {pid!r} is not a catalogue place")
        if (row or {}).get("stationId") not in stations:
            errs.append(f"harbour {anchor}: {row.get('stationId')!r} is not a station in this "
                        f"graph — a harbour must be somewhere a traveller can board")
        if not str((row or {}).get("why") or "").strip():
            errs.append(f"harbour {anchor}: needs a `why`")
    if missing:
        warn.append(f"{len(missing)} of {len(block)} harbours unfilled: {', '.join(missing)}")
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
        warn: list[str] = []
        errs = check(warn=warn)
        for w in warn:
            print("travel_services: reported (not gated) " + w)
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
