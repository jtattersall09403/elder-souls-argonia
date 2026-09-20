"""Names for the water and the land — the record, its checks and its text.

`world/sources/hydrology/names.json` is the record: one entry per named
entity, keyed by the id the hydrology graph already carries (or, for the
things the graph does not model — sea regions, peaks, passes — by a stable id
of its own). The graph itself is NOT edited: its `contentSha256` is recorded
downstream by `carve_province` and `compile_water`, so a name written into it
would silently stale those meta blocks. Readers join on `entityId`.

    python3 -m worldgen.hydrology_names --check       # every rule in `_rules`
    python3 -m worldgen.hydrology_names --emit-text   # the text-catalogue file
    python3 -m worldgen.hydrology_names --publish     # the studio's map copy

All three are deterministic: same input, byte-identical output.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
NAMES = REPO_ROOT / "world" / "sources" / "hydrology" / "names.json"
GRAPH = REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json"
SITES = REPO_ROOT / "world" / "sources" / "sites" / "candidate-sites.json"
TEXT_TS = (REPO_ROOT / "packages" / "text-catalogue" / "src" / "generated"
           / "hydrology-names.ts")
PUBLISHED = (REPO_ROOT / "apps" / "world-studio" / "public" / "province"
             / "hydrology-names.json")

GRAPH_KINDS = {"river", "body", "reach-fall"}
IMAGERY = ("reed", "root", "water", "stone", "shadow", "blood", "bone")
IMAGERY_MAX = 2
# Verb-clause shares are the per-region naming register's, not one global cap
# (world/sources/catalogue/README.md, "Per-region naming register"): the
# saxhleel-coast row is "the hyphenated-verb register at its purest — over half
# the names are a clause", and the ≤⅓ cap of quests 35 §54 is a cast-list rule
# that applies to the other registers here. (name, minimum share, maximum share)
CLAUSE_SHARE_DEFAULT_MAX = 1.0 / 3.0
CLAUSE_SHARE_MIN = {"saxhleel-coast": 0.5}
PROMINENCE_MIN_M = 60.0
MASSIF_RADIUS_M = 600.0

# The attested joins decided for 16g (docs/research/phase16/16g-mining.md §1.1).
# Every one of these ids must carry its name, or the record has drifted.
ATTESTED_JOINS = {
    "river.352-503": "the Onkobra River",
    "river.487-510": "the Panther River",
    "river.490-536": "the Panther River",
    "river.619-579": "the Panther River",
    "river.720-1110": "the Keel-Sakka River",
    "river.731-1121": "the Keel-Sakka River",
    "river.879-763": "the Archon Estuary",
    "river.889-484": "the Stormhold River",
    "river.292-1189": "the Bramman",
    "body.1284-3448": "Blackrose Lake",  # the compiled lake; 1290-3508 is unrealised (owner 2026-09-20)
    "body.1189-2027": "Lake Blackwood",
    "sea.oliis-bay": "Oliis Bay",
    "sea.topal-bay": "Topal Bay",
    "sea.southern-sea": "the Southern Sea",
    "sea.padomaic-ocean": "the Padomaic Ocean",
}


def load(path: Path = NAMES) -> dict:
    return json.loads(path.read_text())


def _is_clause(name: str) -> bool:
    """A verb clause is the Argonian Verb-The-Noun form: three or more
    hyphen-joined capitalised words ("Reaches-The-Low-Branch")."""
    parts = name.split("-")
    return len(parts) >= 3 and all(re.match(r"^[A-Z][a-z]+$", p) for p in parts)


def check(doc: dict, graph: dict | None = None, sites: dict | None = None) -> list[str]:
    errs: list[str] = []
    entries = doc["names"]
    if [e["entityId"] for e in entries] != sorted(e["entityId"] for e in entries):
        errs.append("names are not sorted by entityId")

    # -- identity -------------------------------------------------------
    seen: dict[str, str] = {}
    for e in entries:
        if seen.setdefault(e["entityId"], e["name"]) != e["name"]:
            errs.append(f"{e['entityId']}: listed twice")
        if e["textKey"] != "text.hydrology.name." + e["entityId"]:
            errs.append(f"{e['entityId']}: textKey does not follow the entity id")

    # -- no two identical names, unless they are one canon river ---------
    by_name: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_name[e["name"]].append(e)
    for name, group in sorted(by_name.items()):
        if len(group) == 1:
            continue
        chains = {e.get("chain") for e in group}
        if len(chains) != 1 or None in chains:
            errs.append(f"duplicate name {name!r} on "
                        + ", ".join(e["entityId"] for e in group))

    # -- the entity has to exist ----------------------------------------
    if graph is not None:
        live = ({x["id"] for x in graph["rivers"]}
                | {x["id"] for x in graph["bodies"]}
                | {x["id"] for x in graph["reaches"]})
        for e in entries:
            if e["kind"] in GRAPH_KINDS and e["entityId"] not in live:
                errs.append(f"{e['entityId']}: not an entity in the hydrology graph")

    # -- every attested join present ------------------------------------
    have = {e["entityId"]: e["name"] for e in entries}
    for eid, name in sorted(ATTESTED_JOINS.items()):
        if have.get(eid) != name:
            errs.append(f"attested join missing or renamed: {eid} should be {name!r}, "
                        f"is {have.get(eid)!r}")

    # -- grounding -------------------------------------------------------
    for e in entries:
        g = e.get("grounding") or {}
        if g.get("kind") == "attested":
            if not str(g.get("uesp", "")).startswith("Lore:"):
                errs.append(f"{e['entityId']}: attested name without a Lore: page")
        elif g.get("kind") in ("extrapolated", "catalogue"):
            if not g.get("rule"):
                errs.append(f"{e['entityId']}: {g['kind']} name without a register rule")
        else:
            errs.append(f"{e['entityId']}: grounding.kind is not attested/extrapolated/catalogue")
        if not g.get("why"):
            errs.append(f"{e['entityId']}: grounding has no why")

    # -- register style: imagery and verb clauses ------------------------
    per_register: dict[str, list[str]] = defaultdict(list)
    for e in entries:
        if e["grounding"].get("kind") == "attested":
            continue           # canon's own words are not ours to ration
        per_register[e["culture"]].append(e["name"])
    for register, names in sorted(per_register.items()):
        lowered = [n.lower() for n in names]
        for word in IMAGERY:
            hits = [n for n in lowered if word in n]
            if len(hits) > IMAGERY_MAX:
                errs.append(f"{register}: {word!r} used {len(hits)} times "
                            f"(at most {IMAGERY_MAX}): {', '.join(hits)}")
        clauses = [n for n in names if _is_clause(n)]
        minimum = CLAUSE_SHARE_MIN.get(register)
        if minimum is not None:
            if len(clauses) < math.ceil(len(names) * minimum):
                errs.append(f"{register}: {len(clauses)} of {len(names)} names are verb "
                            f"clauses (its register needs at least "
                            f"{minimum:.0%})")
        elif len(clauses) > math.floor(len(names) * CLAUSE_SHARE_DEFAULT_MAX):
            errs.append(f"{register}: {len(clauses)} of {len(names)} names are verb "
                        f"clauses (at most a third)")

    # -- peaks obey the prominence rule ----------------------------------
    if sites is not None:
        by_id = {s["id"]: s for s in sites["sites"]}
        peaks = [e for e in entries if e["kind"] == "peak"]
        for e in peaks:
            s = by_id.get(e.get("siteId") or e["entityId"])
            if s is None:
                errs.append(f"{e['entityId']}: no such site in candidate-sites.json")
                continue
            if s["landform"] != "summit":
                errs.append(f"{e['entityId']}: site is a {s['landform']}, not a summit")
            if s["scores"]["prominenceM"] < PROMINENCE_MIN_M:
                errs.append(f"{e['entityId']}: prominence {s['scores']['prominenceM']} m "
                            f"is below the {PROMINENCE_MIN_M:.0f} m rule")
        # one name per massif, and every qualifying massif named
        qualifying = sorted((s for s in sites["sites"]
                             if s["landform"] == "summit"
                             and s["scores"]["prominenceM"] >= PROMINENCE_MIN_M),
                            key=lambda s: -s["scores"]["prominenceM"])
        want: list[dict] = []
        for s in qualifying:
            if all(math.dist(s["worldM"], k["worldM"]) > MASSIF_RADIUS_M for k in want):
                want.append(s)
        named = {e.get("siteId") or e["entityId"] for e in peaks}
        for s in want:
            if s["id"] not in named:
                errs.append(f"summit {s['id']} qualifies under the peak rule but is unnamed")
        for extra in sorted(named - {s["id"] for s in want}):
            errs.append(f"{extra}: named but it is not the highest summit of its massif")

    # -- coverage: every entity the extrapolation rule reaches -----------
    if graph is not None:
        for x in graph["rivers"]:
            if (x["strahler"] >= 2 or x["accumKm2"] >= 4) and x["id"] not in have:
                errs.append(f"{x['id']}: qualifies for a name (strahler/accumulation) but has none")
        for x in graph["bodies"]:
            if x["id"] == "body.ocean":
                continue
            # A body the graph marks `realisedBy` another is never compiled
            # (decision 0065: the compile realises the graph); the name lives
            # on the body that ships (owner 2026-09-20, Blackrose Lake).
            if x.get("realisedBy"):
                continue
            if (x["areaM2"] >= 10000 or x["kind"] == "lagoon") and x["id"] not in have:
                errs.append(f"{x['id']}: qualifies for a name (area/lagoon) but has none")
        for x in graph["reaches"]:
            if x["kind"] == "vertical-fall" and x["id"] not in have:
                errs.append(f"{x['id']}: a vertical fall with no name")
    return errs


# ---------------------------------------------------------------- text ----

def text_entries(doc: dict) -> list[dict]:
    return [{"id": e["textKey"], "surface": "descriptive", "text": e["name"],
             "note": e["grounding"]["why"]} for e in doc["names"]]


def _ts(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def emit_text(doc: dict) -> str:
    rows = "".join(
        f"  {{ id: {_ts(e['id'])}, surface: {_ts(e['surface'])}, "
        f"text: {_ts(e['text'])}, note: {_ts(e['note'])} }},\n"
        for e in text_entries(doc))
    return (
        "// GENERATED by `python3 -m worldgen.hydrology_names --emit-text` "
        "from world/sources/hydrology/names.json.\n"
        "// Do not edit by hand: edit the record and regenerate.\n"
        'import type { TextEntry } from "../catalogue.js";\n\n'
        "export const HYDROLOGY_NAME_TEXT: readonly TextEntry[] = [\n"
        f"{rows}"
        "];\n")


def publish(doc: dict) -> str:
    small = {"schemaVersion": doc["schemaVersion"],
             "names": [{k: v for k, v in e.items()
                        if k in ("entityId", "kind", "name", "aliases", "textKey",
                                 "culture", "centreM", "radiusM")}
                       for e in doc["names"]]}
    return json.dumps(small, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--emit-text", action="store_true")
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    doc = load()
    rc = 0
    if args.check or not (args.emit_text or args.publish):
        errs = check(doc, json.loads(GRAPH.read_text()), json.loads(SITES.read_text()))
        for e in errs:
            print("FAIL", e)
        counts = Counter(e["grounding"]["kind"] for e in doc["names"])
        kinds = Counter(e["kind"] for e in doc["names"])
        print(f"{len(doc['names'])} names: "
              + ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
              + " | " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
        rc = 1 if errs else 0
    if args.emit_text:
        TEXT_TS.parent.mkdir(parents=True, exist_ok=True)
        TEXT_TS.write_text(emit_text(doc))
        print("wrote", TEXT_TS.relative_to(REPO_ROOT))
    if args.publish:
        PUBLISHED.write_text(publish(doc))
        print("wrote", PUBLISHED.relative_to(REPO_ROOT))
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
