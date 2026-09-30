"""Per-place settlement bundles and their index (S8, 16k method review round 2 N0).

The export's whole settlement record (the old ``province/settlements.json``)
is published as one minified bundle per place and one per route, plus an
index the runtime reads first:

* ``province/settlements/<place-id>.json``: one place's rows (its settlement
  record under ``settlement``, its placements, treatments, navmesh rows,
  doors, compiled objects, register rows, receipts, the kits it places and
  the runtime ``lod`` contract carrying the place's OWN collider part budget);
* ``province/settlements/routes/<route-id>.json``: one route's structure pieces
  (the route kits ride here);
* ``province/settlements/index.json``: ``{"schemaVersion": 1, "places": [...],
  "routes": [...]}``, each entry ``{"id", "positionM": [x, z], "radiusM",
  "bundle", "sha256"}`` sorted by id (contract 2 of lane 3A).

Every whole-file field is either carried by exactly one bundle or derived on
reassembly (``stats``, ``groundOverlayCount``, the budget as the max of the
bundles' budgets, the sink gaps as the sum of their counts), so
``assemble(split(whole)) == whole``: ``load_published`` hands every Python
reader the old whole-file shape, and ``packages/game-core/src/settlement/
settlementIndex.ts`` does the same in the browser for the places in range.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .atomic_write import atomic_write_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
BUNDLE_DIR = "settlements"
INDEX_NAME = "index.json"
INDEX_SCHEMA = 1
PLACE_KIND = "settlement-place-bundle"
ROUTE_KIND = "settlement-route-bundle"
ROUTE_KITS = ("route-structures-v1",)

# The whole-file keys and how each one travels (a new key refuses the split
# until it is given a home, so nothing is silently dropped).
ROW_LISTS = ("placements", "groundTreatments", "navmeshCuts", "navmeshLinks", "doors",
             "compiledObjects", "knownRedWarnings", "phase11ObligationReceipts")
DERIVED = ("stats", "groundOverlayCount", "designedSinkGaps", "lod", "kits",
           "settlements", "schemaVersion", "collisionFrame")
WHOLE_KEYS = set(ROW_LISTS) | set(DERIVED)


def dumps(doc: dict) -> bytes:
    """The published bytes of a bundle or index: minified, key-sorted."""
    return json.dumps(doc, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"


def place_bundle_path(place_id: str) -> str:
    return f"{BUNDLE_DIR}/{place_id}.json"


def route_bundle_path(route_id: str) -> str:
    return f"{BUNDLE_DIR}/routes/{route_id}.json"


def _place_order_key(place_id: str) -> str:
    # a full export's order: compiled files sorted by name (merge_bundle)
    return f"{place_id}.settlement.json"


def split(whole: dict, budgets: dict[str, int]) -> tuple[dict[str, dict], dict[str, dict]]:
    """The whole record as ({place id: bundle}, {route id: bundle}).

    `budgets` is each place's own collider part budget (decision 0052:
    round(resident parts x headroom)); the whole file's budget is their max."""
    unknown = sorted(set(whole) - WHOLE_KEYS)
    if unknown:
        raise ValueError(f"settlement bundle split: no home for whole-file keys {unknown}")
    places = [s["id"] for s in whole["settlements"]]
    place_set = set(places)
    owner: dict[str, tuple[str, str]] = {}
    for p in whole["placements"]:
        if p.get("kind") == "route-structure":
            owner[p["id"]] = ("route", p["sourceId"])
        elif p.get("sourceId") in place_set:
            owner[p["id"]] = ("place", p["sourceId"])
        else:
            raise ValueError(f"settlement bundle split: placement {p['id']} belongs to "
                             f"no published place ({p.get('sourceId')})")
    routes = sorted({o[1] for o in owner.values() if o[0] == "route"})

    def blank(kind: str, oid: str) -> dict:
        return {"schemaVersion": whole["schemaVersion"], "collisionFrame": whole["collisionFrame"],
                "kind": PLACE_KIND if kind == "place" else ROUTE_KIND,
                ("placeId" if kind == "place" else "routeId"): oid,
                "lod": {**whole["lod"], "colliderPartBudget": budgets.get(oid, 0)
                        if kind == "place" else 0},
                "kits": {}, **{field: [] for field in ROW_LISTS}, "designedSinkGaps": []}

    docs = {("place", pid): blank("place", pid) for pid in places}
    docs.update({("route", rid): blank("route", rid) for rid in routes})
    for s in whole["settlements"]:
        docs[("place", s["id"])]["settlement"] = s

    def put(field: str, row: dict, key: tuple[str, str] | None, what: str) -> None:
        if key is None or key not in docs:
            raise ValueError(f"settlement bundle split: {field} row {what} has no owner")
        docs[key][field].append(row)

    for p in whole["placements"]:
        put("placements", p, owner[p["id"]], p["id"])
    for row in whole.get("groundTreatments") or []:
        put("groundTreatments", row, owner.get(row["id"].removeprefix("treatment.")), row["id"])
    for field in ("navmeshCuts", "navmeshLinks"):
        for row in whole.get(field) or []:
            put(field, row, owner.get(row["placementId"]), row["id"])
    for row in whole.get("doors") or []:
        put("doors", row, ("place", row["settlementId"]), row["id"])
    for field in ("compiledObjects", "knownRedWarnings", "phase11ObligationReceipts"):
        for row in whole.get(field) or []:
            put(field, row, ("place", row.get("placeId")), str(row.get("id", row.get("placeId"))))

    kits = whole.get("kits") or {}
    used = set()
    for doc in docs.values():
        names = {p["kit"] for p in doc["placements"]}
        used |= names
        doc["kits"] = {name: kits[name] for name in sorted(names) if name in kits}
    leftover = {name: kits[name] for name in sorted(set(kits) - used)}
    stray = sorted(set(leftover) - set(ROUTE_KITS))
    if stray:
        raise ValueError(f"settlement bundle split: kits {stray} are placed by no bundle")
    carriers = [k for k in docs if k[0] == "route"] or [k for k in docs if k[0] == "place"]
    for key in carriers:
        docs[key]["kits"].update(leftover)

    gaps = {row["asset"] for row in whole.get("designedSinkGaps") or []}
    for doc in docs.values():
        counts: dict[str, int] = {}
        for p in doc["placements"]:
            key = f"{p['kit']}/{p['assetId']}"
            if key in gaps:
                counts[key] = counts.get(key, 0) + 1
        doc["designedSinkGaps"] = [{"asset": k, "placements": n} for k, n in sorted(counts.items())]
    return ({k[1]: d for k, d in docs.items() if k[0] == "place"},
            {k[1]: d for k, d in docs.items() if k[0] == "route"})


def _extent(doc: dict) -> tuple[list[float], float]:
    """(centre [x, z], bounding radius) in metres: the centre of the place's
    boundary box (of its pieces when it has no boundary, as a route), the
    radius over the boundary, every piece position and footprint and every
    pad piece, rounded outward."""
    points: list[tuple[float, float]] = []
    site = doc.get("settlement") or {}
    boundary = [(float(x), float(z)) for x, z in site.get("boundaryM") or []]
    for p in doc["placements"]:
        points.append((float(p["positionM"][0]), float(p["positionM"][2])))
        points += [(float(x), float(z)) for x, z in p.get("footprintM") or []]
    for pad in (site.get("groundOverlays") or {}).get("pads") or []:
        for piece in pad.get("pieces") or []:
            points += [(float(q[0]), float(q[1])) for q in piece.get("polygonM") or []]
    box = boundary or points
    if not box:
        return [0.0, 0.0], 0.0
    xs = [q[0] for q in box]
    zs = [q[1] for q in box]
    cx, cz = round((min(xs) + max(xs)) / 2, 2), round((min(zs) + max(zs)) / 2, 2)
    radius = max((((x - cx) ** 2 + (z - cz) ** 2) ** 0.5 for x, z in boundary + points), default=0.0)
    return [cx, cz], float(int(radius * 10) + 1) / 10


def build_index(places: dict[str, dict], routes: dict[str, dict]
                ) -> tuple[dict, dict[str, bytes]]:
    """The index and {relative bundle path: bytes} for every bundle."""
    blobs: dict[str, bytes] = {}

    def entries(docs: dict[str, dict], path_of) -> list[dict]:
        rows = []
        for oid in sorted(docs):
            data = dumps(docs[oid])
            rel = path_of(oid)
            blobs[rel] = data
            centre, radius = _extent(docs[oid])
            rows.append({"id": oid, "positionM": centre, "radiusM": radius, "bundle": rel,
                         "sha256": hashlib.sha256(data).hexdigest()})
        return rows

    index = {"schemaVersion": INDEX_SCHEMA, "places": entries(places, place_bundle_path),
             "routes": entries(routes, route_bundle_path)}
    return index, blobs


def assemble(docs: list[dict]) -> dict:
    """The whole-file record from bundles (any order)."""
    places = sorted((d for d in docs if d["kind"] == PLACE_KIND),
                    key=lambda d: _place_order_key(d["placeId"]))
    routes = sorted((d for d in docs if d["kind"] == ROUTE_KIND), key=lambda d: d["routeId"])
    ordered = places + routes
    if not ordered:
        raise ValueError("settlement bundles: nothing published")
    rank = {d["placeId"]: i for i, d in enumerate(places)}
    kits: dict[str, dict] = {}
    gaps: dict[str, int] = {}
    for d in ordered:
        kits.update(d["kits"])
        for row in d.get("designedSinkGaps") or []:
            gaps[row["asset"]] = gaps.get(row["asset"], 0) + row["placements"]
    settlements = [d["settlement"] for d in places]
    placements = sorted((p for d in ordered for p in d["placements"]), key=lambda p: p["id"])
    whole = {
        "schemaVersion": max(d["schemaVersion"] for d in ordered),
        "collisionFrame": ordered[0]["collisionFrame"],
        "lod": {**ordered[0]["lod"],
                "colliderPartBudget": max(d["lod"]["colliderPartBudget"] for d in ordered)},
        "kits": {name: kits[name] for name in sorted(kits)},
        "settlements": settlements,
        "placements": placements,
        **{field: [row for d in ordered for row in d[field]]
           for field in ("groundTreatments", "navmeshCuts", "navmeshLinks", "doors")},
        "compiledObjects": sorted((o for d in places for o in d["compiledObjects"]),
                                  key=lambda o: (o["id"], rank.get(o.get("placeId"), len(rank)))),
        "knownRedWarnings": sorted((r for d in places for r in d["knownRedWarnings"]),
                                   key=lambda r: (r["placeId"], r["subjectId"], r["rule"])),
        "phase11ObligationReceipts": sorted(
            (r for d in places for r in d["phase11ObligationReceipts"]),
            key=lambda r: r["placeId"]),
        "designedSinkGaps": [{"asset": k, "placements": n} for k, n in sorted(gaps.items())],
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": sum(
                      1 for p in placements if p.get("kind") == "route-structure")},
    }
    if any("groundOverlays" in s for s in settlements):
        whole["groundOverlayCount"] = sum(
            len((s.get("groundOverlays") or {}).get("pads") or []) for s in settlements)
    return whole


def read_index(province_dir: Path | None = None) -> dict:
    path = Path(province_dir or PROVINCE) / BUNDLE_DIR / INDEX_NAME
    index = json.loads(path.read_text())
    if index.get("schemaVersion") != INDEX_SCHEMA:
        raise ValueError(f"{path}: index schemaVersion {index.get('schemaVersion')}, "
                         f"this reader reads {INDEX_SCHEMA}")
    return index


def load_published(province_dir: Path | None = None) -> dict:
    """The published settlements in the old whole-file shape (contract 2)."""
    root = Path(province_dir or PROVINCE)
    index = read_index(root)
    docs = []
    for entry in index["places"] + index.get("routes", []):
        data = (root / entry["bundle"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"{entry['bundle']}: bytes do not match the index sha256")
        docs.append(json.loads(data))
    return assemble(docs)


def read_published(path: Path | None = None) -> dict:
    """The whole-file record from `path`: a province folder or a
    settlements/index.json (the bundles), or a legacy whole settlements.json;
    None is the published province."""
    if path is None:
        return load_published()
    path = Path(path)
    if path.is_dir():
        return load_published(path)
    if path.name == INDEX_NAME:
        return load_published(path.parent.parent)
    return json.loads(path.read_text())


def write_published(whole: dict, budgets: dict[str, int], province_dir: Path,
                    places=None) -> dict:
    """Publish `whole` as bundles + index under `province_dir`/settlements.

    A full publish (`places` None) writes every bundle and deletes the ones
    the previous index named that are gone. A --places publish writes the
    named places' bundles; any other bundle is written only when it is
    missing or the previous index names other bytes for it (a first publish,
    a repair). The index is written last. Returns {"index", "written",
    "removed"} with repo-style relative paths."""
    root = Path(province_dir)
    place_docs, route_docs = split(whole, budgets)
    if places is not None:
        absent = sorted(set(places) - set(place_docs))
        if absent:
            raise ValueError(f"--places names places that are not in the bundle: {absent}")
    index, blobs = build_index(place_docs, route_docs)
    index_path = root / BUNDLE_DIR / INDEX_NAME
    previous: dict[str, str] = {}
    if index_path.exists():
        try:
            old = json.loads(index_path.read_text())
            previous = {e["bundle"]: e["sha256"] for e in old.get("places", []) + old.get("routes", [])}
        except (ValueError, KeyError, TypeError):
            previous = {}
    scoped = None if places is None else {place_bundle_path(p) for p in places}
    written: list[str] = []
    for rel, data in sorted(blobs.items()):
        target = root / rel
        if scoped is not None and rel not in scoped:
            if target.exists() and previous.get(rel) == hashlib.sha256(data).hexdigest():
                continue
        atomic_write_bytes(target, data)
        written.append(rel)
    removed: list[str] = []
    if places is None:
        for rel in sorted(set(previous) - set(blobs)):
            target = root / rel
            if target.exists():
                target.unlink()
                removed.append(rel)
    atomic_write_bytes(index_path, dumps(index))
    return {"index": index, "written": written, "removed": removed}


def place_manifest(place_id: str, whole: dict, repo_root: Path = REPO_ROOT) -> dict:
    """Contract 1: the files a --places publish of `place_id` owns (its bundle,
    its interior cells claimed by no other place, its own source files: the
    blueprints, the site dossier and the promise ledger)."""
    files = {f"apps/world-studio/public/province/{place_bundle_path(place_id)}"}
    claims: dict[str, set[str]] = {}
    for door in whole.get("doors") or []:
        cell = (door.get("interiorClaim") or {}).get("cellId")
        if cell:
            claims.setdefault(cell, set()).add(door["settlementId"])
    for cell, owners in claims.items():
        rel = f"apps/world-studio/public/province/interiors/{cell}.json"
        if owners == {place_id} and (repo_root / rel).exists():
            files.add(rel)
    stem = place_id.rsplit(".", 1)[-1]
    blueprints = repo_root / "world" / "sources" / "blueprints"
    if blueprints.is_dir():
        for path in blueprints.iterdir():
            if path.is_file() and (path.name.startswith(stem + ".")
                                   or path.name.startswith(place_id + ".")):
                files.add(path.relative_to(repo_root).as_posix())
    # the site dossier and the promise ledger (place-build SKILL § A place's files)
    for rel in (f"world/sources/sites/dossiers/{stem}.json", f"world/sources/sites/dossiers/{stem}.md",
                f"world/sources/placement/promises/{place_id}.json"):
        if (repo_root / rel).is_file():
            files.add(rel)
    return {"schemaVersion": 1, "placeId": place_id, "writtenBy": "export_settlement_bundle",
            "files": sorted(files)}


def write_manifests(places, whole: dict, manifest_root: Path,
                    repo_root: Path = REPO_ROOT) -> list[Path]:
    """One contract-1 manifest per published place under `manifest_root`/<id>/."""
    out = []
    for place_id in sorted(places):
        path = Path(manifest_root) / place_id / "manifest.json"
        atomic_write_bytes(path, json.dumps(place_manifest(place_id, whole, repo_root),
                                            indent=1, sort_keys=True).encode("utf-8") + b"\n")
        out.append(path)
    return out
