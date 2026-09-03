"""The route registry: stable ids and names for every road, lane and track.

    python3 -m worldgen.route_registry --check   # validate + confirm geometry matches
    python3 -m worldgen.route_registry --attach  # stamp id/name/class onto the studio geometry files

Data: ``world/sources/routes/registry.json`` (authored; see its `_` note).
Geometry: ``apps/world-studio/public/province/routes.json`` (roads) and
``waterways.json`` (boat lanes), written by ``worldgen.compile_society`` and
matched here by (from, to) in either direction. A registry entry with
``solved: false`` has no geometry yet (a canon corridor the lane solver did
not keep, or a named minor route awaiting ``compile_minor_routes``).

Why a registry: the catalogue's relations named routes eighteen different
ways (``route.blackwood-road``, ``boat:onkobra``, ``ferry.archon-portdun-mont``…)
with no file behind any of them. Quests, the map, fast travel and the
road-painting compiler all need one id per route (engineering standard 2).
``resolve()`` maps every legacy spelling to its registry id via ``aliases``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ROADS_PATH = PROVINCE / "routes.json"
LANES_PATH = PROVINCE / "waterways.json"

SCHEMA_VERSION = 1
MODES = {"road", "boat", "track"}   # track = named minor land route (geometry from compile_minor_routes)
CLASSES = {"trunk", "road", "lane", "channel", "track", "footpath", "boardwalk", "causeway"}
CONFIDENCES = {"CANON_NAMED", "CANON_DERIVED", "LORE_IMPLIED", "AGENT_INVENTED"}
PREFIX = {"road": "route.road.", "boat": "route.boat.", "track": "route.track."}
# Minor named routes carry the `route.track.*` prefix whatever mode they are
# travelled by (README, decision 0041 Part 4 step 2): the prefix records that
# they are outside the Phase 4 anchor-to-anchor network and have no geometry
# until worldgen.compile_minor_routes solves them.
MINOR_CLASSES = {"track", "footpath", "boardwalk", "channel"}  # "minor boat corridor" per the registry note: a named channel is a route.track.* too


def load(path: Path = REGISTRY_PATH) -> list[dict]:
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    return data["routes"]


def alias_map(routes: list[dict] | None = None) -> dict[str, str]:
    """Every accepted spelling (id or alias) → registry id."""
    routes = routes if routes is not None else load()
    out: dict[str, str] = {}
    for r in routes:
        out[r["id"]] = r["id"]
        for a in r.get("aliases", []):
            out[a] = r["id"]
    return out


def resolve(ref: str, aliases: dict[str, str] | None = None) -> str | None:
    aliases = aliases if aliases is not None else alias_map()
    if ref in aliases:
        return aliases[ref]
    # legacy service strings "<mode>:<a>-<b>" / "<mode>.<a>-<b>" — try the pair
    for sep in (":", "."):
        if sep in ref:
            mode, _, pair = ref.partition(sep)
            key = f"route.{'boat' if mode in ('boat', 'ferry', 'lighter', 'pilot', 'watertaxi') else 'road'}.{pair}"
            if key in aliases:
                return aliases[key]
            a, _, b = pair.partition("-")
            # reversed pair
            for cand in aliases:
                if cand.endswith(f".{b}-{a}"):
                    return aliases[cand]
    return None


def _geometry_pairs() -> dict[str, set[tuple[str, str]]]:
    roads = json.loads(ROADS_PATH.read_text())["routes"] if ROADS_PATH.exists() else []
    lanes = json.loads(LANES_PATH.read_text())["lanes"] if LANES_PATH.exists() else []
    return {"road": {(r["from"], r["to"]) for r in roads}, "boat": {(l["from"], l["to"]) for l in lanes}, "track": set()}


def validate(routes: list[dict] | None = None) -> list[str]:
    routes = routes if routes is not None else load()
    errors: list[str] = []
    seen: set[str] = set()
    all_refs: set[str] = set()
    geom = _geometry_pairs()
    for r in routes:
        rid = r.get("id", "<missing>")
        if rid in seen:
            errors.append(f"{rid}: duplicate id")
        seen.add(rid)
        mode = r.get("mode")
        if mode not in MODES:
            errors.append(f"{rid}: mode must be one of {sorted(MODES)}")
            continue
        # route.track.* is any named minor route whatever its mode (the region
        # agents' convention); major routes carry the mode prefix
        allowed = (PREFIX[mode], "route.track.")
        if not rid.startswith(allowed):
            errors.append(f"{rid}: id must start with one of {list(allowed)}")
        if rid.startswith("route.track.") and r.get("solved", True):
            errors.append(f"{rid}: a route.track.* entry has no geometry yet — set solved:false")
        if r.get("class") not in CLASSES:
            errors.append(f"{rid}: class must be one of {sorted(CLASSES)}")
        if r.get("confidence") not in CONFIDENCES:
            errors.append(f"{rid}: confidence must be one of {sorted(CONFIDENCES)}")
        if not (r.get("name") or "").strip():
            errors.append(f"{rid}: needs a name")
        if not r.get("sources"):
            errors.append(f"{rid}: needs sources")
        for a in r.get("aliases", []):
            if a in all_refs:
                errors.append(f"{rid}: alias {a!r} claimed twice")
            all_refs.add(a)
        pair = (r.get("from"), r.get("to"))
        has_geom = pair in geom[mode] or pair[::-1] in geom[mode]
        if r.get("solved", True) and not has_geom:
            errors.append(f"{rid}: no geometry for {pair} in {'routes' if mode == 'road' else 'waterways'}.json (set solved:false or fix from/to)")
        if not r.get("solved", True) and has_geom:
            errors.append(f"{rid}: marked solved:false but geometry exists")
    ids = [r["id"] for r in routes]
    if ids != sorted(ids):
        pass  # authored order is by meaning (trunks first); not enforced
    # every geometry pair must have a registry entry
    for mode, pairs in geom.items():
        same = [r for r in routes if r.get("mode") == mode]
        by_pair = {(r["from"], r["to"]): r for r in same} | {(r["to"], r["from"]): r for r in same}
        for pr in pairs:
            if pr not in by_pair:
                errors.append(f"{mode} geometry {pr} has no registry entry")
    return errors


def attach() -> None:
    """Stamp id / name / class onto routes.json and waterways.json in place
    (deterministic, idempotent). Consumers (studio, road painting, fast travel)
    read the id from the geometry and never re-derive it from the pair."""
    routes = load()
    for path, key, mode in ((ROADS_PATH, "routes", "road"), (LANES_PATH, "lanes", "boat")):
        if not path.exists():
            continue
        same = [r for r in routes if r["mode"] == mode]
        by_pair = {(r["from"], r["to"]): r for r in same} | {(r["to"], r["from"]): r for r in same}
        data = json.loads(path.read_text())
        for entry in data[key]:
            r = by_pair.get((entry["from"], entry["to"]))
            if r:
                stamped = {"id": r["id"], "name": r["name"], "class": r["class"]}
                # keep id/name/class first, then the compiler's own keys
                rest = {k: v for k, v in entry.items() if k not in stamped}
                entry.clear()
                entry.update(stamped)
                entry.update(rest)
        # same encoding compile_society uses, so a re-run then --attach is byte-stable
        path.write_text(json.dumps(data), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    errors = validate()
    for e in errors:
        print(f"route-registry: {e}", file=sys.stderr)
    if "--attach" in argv and not errors:
        attach()
        print("route-registry: ids attached to routes.json / waterways.json")
    print(f"route-registry: {len(load())} routes, {'FAIL' if errors else 'OK'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
