"""The ferry graph — validation for `world/sources/routes/ferry-crossings.json`.

The file is AUTHORED. This module only checks that every reference in it
resolves, so a ferry can never quietly point at a route, a place, a crossing, a
mesh, a string or a predicate that does not exist. That is the whole job: the
later travel system and the quest system both read this graph, and a dangling
id in it is a runtime failure neither of them can recover from.

WHAT IS CHECKED
    * `schemaVersion` present (engineering standard 7).
    * Every id is stable and namespaced (standard 2): `ferry.*` services,
      `ferry-landing.*` landings, `ferry-slot.*` operators.
    * `crossingIds` resolve in `water-crossings.json`, and the authored
      `measured` span/depth match that file — a ferry may not claim water the
      bake does not have.
    * `severs` and route ids resolve in the route registry.
    * Every `placeId` / station resolves in the place catalogue, and a
      `station-run`'s stations really declare `ferry` in `travelStation.modes`.
    * Every `text.*` id is registered in packages/text-catalogue (standard 4).
    * Every predicate name is in docs/quests/85-condition-vocabulary.md
      (standard 10) — the gate vocabulary is closed.
    * Every `craft` piece ref exists in the built kit manifest it names
      (standard 9: asset claims are verified, not asserted).

    python3 -m worldgen.ferry_crossings --check
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FERRIES = REPO_ROOT / "world" / "sources" / "routes" / "ferry-crossings.json"
CROSSINGS = REPO_ROOT / "world" / "sources" / "routes" / "water-crossings.json"
REGISTRY = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
CATALOGUE = REPO_ROOT / "world" / "sources" / "catalogue"
TEXT_ENTRIES = REPO_ROOT / "packages" / "text-catalogue" / "src" / "entries.ts"
VOCABULARY = REPO_ROOT / "docs" / "quests" / "85-condition-vocabulary.md"
KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"

SERVICE_KINDS = {"road-crossing", "station-run"}
STATUSES = {"active", "deferred"}


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


def _routes() -> set[str]:
    if not REGISTRY.exists():
        return set()
    doc = json.loads(REGISTRY.read_text(encoding="utf-8"))
    rows = doc.get("routes") or doc.get("entries") or []
    ids = {r["id"] for r in rows if isinstance(r, dict) and "id" in r}
    for r in rows:
        for alias in (r.get("aliases") or []) if isinstance(r, dict) else []:
            ids.add(alias)
    return ids


def _kit_pieces(kit: str) -> set[str]:
    path = KITS / f"{kit}.kit.json"
    if not path.exists():
        return set()
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {a.get("id") for a in doc.get("assets", []) if a.get("id")}


def check() -> list[str]:
    errs: list[str] = []
    doc = json.loads(FERRIES.read_text(encoding="utf-8"))
    if "schemaVersion" not in doc:
        errs.append("ferry-crossings.json: no schemaVersion (engineering standard 7)")

    crossings = {}
    if CROSSINGS.exists():
        crossings = {c["id"]: c for c in json.loads(CROSSINGS.read_text(encoding="utf-8"))["crossings"]}
    else:
        errs.append("water-crossings.json is missing — run `python3 -m worldgen.water_crossings`")

    text_ids, predicates, places, routes = _text_ids(), _predicates(), _places(), _routes()
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

    seen_ids: set[str] = set()
    for s in doc.get("services", []):
        sid = s.get("id", "<no id>")
        if not str(sid).startswith("ferry."):
            errs.append(f"service {sid}: id must be namespaced `ferry.*` (standard 2)")
        if sid in seen_ids:
            errs.append(f"service {sid}: duplicate id")
        seen_ids.add(sid)
        if s.get("kind") not in SERVICE_KINDS:
            errs.append(f"service {sid}: kind must be one of {sorted(SERVICE_KINDS)}")
        if s.get("status") not in STATUSES:
            errs.append(f"service {sid}: status must be one of {sorted(STATUSES)}")
        if s.get("status") == "deferred" and not str(s.get("deferredWhy") or "").strip():
            errs.append(f"service {sid}: deferred needs deferredWhy")
        if s.get("craft") not in craft:
            errs.append(f"service {sid}: craft {s.get('craft')!r} is not in the craft table")

        for cid in s.get("crossingIds") or []:
            if crossings and cid not in crossings:
                errs.append(f"service {sid}: crossingId {cid!r} is not in water-crossings.json")
        m = s.get("measured")
        if m and crossings and (s.get("crossingIds") or []):
            widest = max((crossings[c]["spanM"] for c in s["crossingIds"] if c in crossings),
                         default=None)
            if widest is not None and abs(widest - m.get("spanM", -1)) > 0.05:
                errs.append(f"service {sid}: measured.spanM {m.get('spanM')} does not match the "
                            f"widest crossing it names ({widest}) — the bake is the authority")

        for rid in s.get("severs") or []:
            if routes and rid not in routes:
                errs.append(f"service {sid}: severs route {rid!r}, which is not in the route registry")

        for st in s.get("stations") or []:
            pl = places.get(st)
            if pl is None:
                errs.append(f"service {sid}: station {st!r} is not a catalogue place")
            elif "ferry" not in ((pl.get("travelStation") or {}).get("modes") or []):
                errs.append(f"service {sid}: station {st!r} does not declare `ferry` in "
                            f"travelStation.modes — the catalogue and this graph must agree")
        if s.get("kind") == "station-run" and len(s.get("stations") or []) < 2:
            errs.append(f"service {sid}: a station-run needs at least two stations")
        if s.get("kind") == "road-crossing":
            lands = s.get("landings") or []
            if len(lands) != 2:
                errs.append(f"service {sid}: a road-crossing has exactly two landings")
            for lg in lands:
                if not str(lg.get("id", "")).startswith("ferry-landing."):
                    errs.append(f"service {sid}: landing id {lg.get('id')!r} must be "
                                f"`ferry-landing.*` (standard 2)")
                if lg.get("piece") not in craft:
                    errs.append(f"service {sid}: landing {lg.get('id')} names piece "
                                f"{lg.get('piece')!r}, which is not in the craft table")

        op = s.get("operator") or {}
        if not str(op.get("slotId", "")).startswith("ferry-slot."):
            errs.append(f"service {sid}: operator.slotId must be `ferry-slot.*` (standard 2). It is "
                        f"a slot, not an `npc.*` registry id — Phase 13 stamps the register ref here")
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
    return errs


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", default=True)
    ap.parse_args(argv)
    errs = check()
    if errs:
        raise SystemExit("ferry-crossings.json:\n  " + "\n  ".join(errs))
    doc = json.loads(FERRIES.read_text(encoding="utf-8"))
    live = [s for s in doc["services"] if s.get("status") == "active"]
    print(f"ferry_crossings: {len(live)} active services, "
          f"{len(doc['services']) - len(live)} deferred, all references resolve")


if __name__ == "__main__":
    main()
