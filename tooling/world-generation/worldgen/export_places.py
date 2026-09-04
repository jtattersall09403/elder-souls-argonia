"""Export the plotted place catalogue for World Studio's 2D map.

    python3 -m worldgen.export_places            # from tooling/world-generation

Writes ``apps/world-studio/public/province/places.json`` — the owner's Phase 11
Part 4 review medium (decision 0041 Part 0 item 5) — from the authoring
catalogue ``world/sources/catalogue/places-<region>.json``. Only records with a
``position`` are exported (the map can only draw sited places); each record is
projected to the review fields the layer needs, so the browser never reads the
authoring files directly. The region-zone colours are copied from
``society.CULTURES`` so the studio and the Python plot pictures agree by
construction.

Deterministic (standard 6) and byte-stable: sorted by id, ``indent=2``,
``ensure_ascii=False``, one trailing newline. The TypeScript view of this shape
is ``PlottedPlacesBundle`` in ``packages/contracts``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import catalogue
from .society import CULTURES

QUESTS_REGISTRY = catalogue.REPO_ROOT / "world" / "sources" / "registries" / "quests.json"
LINES_PATH = catalogue.REPO_ROOT / "world" / "sources" / "quests" / "lines.json"
QUEST_CODE = re.compile(r"\b([A-Z]{2})(\d{2})\b")
LINE_CODE = re.compile(r"\b([A-Z]{2})-line\b")
ANCHOR_PROVISION = re.compile(r"^quest\.provision\.([a-z]{2})(\d{2})-anchor$")
# registry `kind` → the studio's quest grouping (owner 2026-09-04: main / each
# faction / other questlines / minor side quests). `world/sources/quests/lines.json`
# carries an explicit `group` per line when it exists and wins over this map.
KIND_GROUP = {"main-quest": "main", "faction-quest": "faction", "daedric-quest": "other",
              "local-quest": "minor", "proposed-quest": "minor"}
# Settlement magnitude → rough count of enterable structures (world-plan rule:
# 100 % of settlement structures enterable; docs/research/morrowind-content-density.md §4).
MAGNITUDE_STRUCTURES = {"M1": "1–3", "M2": "3–8", "M3": "8–20", "M4": "20–60", "M5": "60+"}

SCHEMA_VERSION = 2
OUT_PATH = catalogue.REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "places.json"

WHY_FIELDS = ("founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf")


def _hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(c) for c in rgb)


def zone_colours() -> dict[str, str]:
    """Region-zone → CSS hex, from the one place the palette is authored."""
    return {name: _hex(spec["colour"]) for name, spec in CULTURES.items()}


def _condition_line(when: dict | None) -> str:
    """A schema-v2 flip condition as one short human clause (studio review only —
    the authoritative vocabulary is docs/quests/85-condition-vocabulary.md)."""
    if not when:
        return "always"
    parts = []
    for key, val in sorted(when.items()):
        if isinstance(val, (list, tuple)):
            val = " ".join(str(v) for v in val)
        elif isinstance(val, dict):
            val = _condition_line(val)
        # `val is True` (not ==): a flag with no argument reads as just its key,
        # but a numeric 1 must keep its number.
        parts.append(str(key) if val is True else f"{key} {val}")
    return ", ".join(parts)


def _flip_lines(host: dict | None) -> list[str]:
    out = []
    for flip in (host or {}).get("flips") or []:
        scope = flip.get("scope")
        out.append(f"→ {flip.get('to')} when {_condition_line(flip.get('when'))}"
                   + (f" [{scope}]" if scope and scope != "place" else ""))
    return out


def _slot_line(slot: dict, kind: str) -> str:
    """One short line per contents slot: role, danger/payoff, count, note."""
    bits = [str(slot.get("role") or "?")]
    if kind == "loot":
        for k in ("payoff", "valueTier", "provenance"):
            if slot.get(k):
                bits.append(str(slot[k]))
    else:
        if slot.get("danger"):
            bits.append(str(slot["danger"]))
        if slot.get("count"):
            bits.append(str(slot["count"]))
        if slot.get("named"):
            bits.append("named")
        if slot.get("trigger"):
            bits.append(f"on {slot['trigger']}")
    line = " · ".join(bits)
    if slot.get("note"):
        line += f" — {slot['note']}"
    return line


def _contents(rec: dict) -> dict | None:
    c = rec.get("contents") or {}
    out = {k: [_slot_line(s, k) for s in (c.get(k) or [])] for k in ("creatures", "npcs", "loot")}
    return out if any(out.values()) else None


def _travel_station(rec: dict, names: dict[str, str]) -> dict | None:
    ts = rec.get("travelStation") or {}
    if not ts.get("modes") and not ts.get("destinations"):
        return None
    return {
        "modes": list(ts.get("modes") or []),
        "destinations": [{"id": d, "name": names.get(d, d)} for d in (ts.get("destinations") or [])],
    }


def load_quest_lookup() -> dict[str, dict]:
    """Quest code (MQ29, LQ07 …) → {title, line, lineName, group, tier} from the
    registry, plus per-line rows keyed by code prefix ("BC" → the Chainbreakers
    line) so `BC-line · tier-2` ownership strings resolve too. Empty when the
    registry is absent (the export still works; the studio just has no quest filter)."""
    out: dict[str, dict] = {}
    if not QUESTS_REGISTRY.exists():
        return out
    reg = json.loads(QUESTS_REGISTRY.read_text(encoding="utf-8"))
    lines = {}
    if LINES_PATH.exists():
        lines = {ln["id"]: ln for ln in json.loads(LINES_PATH.read_text(encoding="utf-8")).get("lines", [])}
    line_names = {e["id"]: e.get("name") for e in reg.get("entries", []) if e.get("kind") == "questline"}
    for e in reg.get("entries", []):
        code = e.get("code")
        if not code:
            continue
        line = e.get("line")
        ln = lines.get(line) or {}
        group = ln.get("group") or KIND_GROUP.get(e.get("kind"), "minor")
        if group == "line":
            group = "other"
        tier = e.get("tier")
        out[code] = {
            "code": code,
            "title": e.get("title") or e.get("name") or code,
            "line": line,
            "lineName": ln.get("name") or line_names.get(line) or (line or "").split(".")[-1],
            "group": group,
            "tier": tier if isinstance(tier, int) else ({"main": 0, "faction": 2}.get(group, 3)),
        }
        prefix = code[:2]
        out.setdefault(prefix + "-line", {**out[code], "code": prefix + "-line", "title": None})
    return out


def _quest_links(rec: dict, quests: dict[str, dict]) -> list[dict]:
    """Every quest this place is tied to, from `questHooks.tierOwnership` codes
    and `quest.provision.<qid>-anchor` ids; one row per quest, deterministic."""
    q = rec.get("questHooks") or {}
    seen: dict[str, dict] = {}
    text = q.get("tierOwnership") or ""
    for m in QUEST_CODE.finditer(text):
        seen.setdefault(m.group(0), {"role": "owner"})
    for m in LINE_CODE.finditer(text):
        seen.setdefault(m.group(0), {"role": "line"})
    for pid in q.get("provisions") or []:
        m = ANCHOR_PROVISION.match(pid)
        if m:
            seen.setdefault((m.group(1) + m.group(2)).upper(), {"role": "anchor"})
    links = []
    for code in sorted(seen):
        info = quests.get(code)
        if not info and code.endswith("-line"):
            continue
        links.append({
            "code": code,
            "title": (info or {}).get("title"),
            "line": (info or {}).get("line"),
            "lineName": (info or {}).get("lineName") or code[:2],
            "group": (info or {}).get("group") or ("main" if code.startswith("MQ") else "minor"),
            "tier": (info or {}).get("tier"),
            "role": seen[code]["role"],
        })
    return links


def _interior_scope(rec: dict) -> str | None:
    """One line that says how many interiors the place really has, so a
    settlement's single `interior` block (its principal interior) is not read as
    "one door in the whole town" (owner 2026-09-04)."""
    cls = rec.get("classification") or {}
    it = rec.get("interior") or {}
    kind = it.get("kind")
    if cls.get("class") == "settlement":
        n = MAGNITUDE_STRUCTURES.get(cls.get("magnitude") or "", "several")
        return f"settlement: about {n} structures, every one enterable; the block below is the principal interior"
    if kind in (None, "none"):
        return None
    n = it.get("entranceCount") or 1
    return "one interior" + (f" with {n} entrances" if n > 1 else "")


def project_record(rec: dict, region: str, names: dict[str, str], quests: dict[str, dict] | None = None) -> dict:
    quests = quests if quests is not None else {}
    cls = rec.get("classification") or {}
    why = rec.get("why") or {}
    prefs = rec.get("sitingPrefs") or {}
    rel = rec.get("relations") or {}
    reward = rec.get("rewardProfile") or {}
    return {
        "id": rec["id"],
        "name": rec.get("name") or rec.get("namingRule") or rec["id"],
        "region": region,
        "class": cls.get("class"),
        "family": cls.get("family"),
        "type": cls.get("type"),
        "magnitude": cls.get("magnitude"),
        "importanceTier": rec.get("importanceTier"),
        "dangerTier": rec.get("dangerTier"),
        "densityLayer": rec.get("densityLayer"),
        "status": rec.get("status"),
        "workflow": rec.get("workflow"),
        "culture": rec.get("culture"),
        "position": {"u": rec["position"]["u"], "v": rec["position"]["v"]},
        "positionM": rec.get("positionM"),
        "plotFacts": rec.get("plotFacts"),
        "whySiteWon": rec.get("whySiteWon"),
        "why": {k: why.get(k) for k in WHY_FIELDS},
        "hardConstraints": list(prefs.get("hardConstraints") or []),
        "reachedVia": list(rel.get("reachedVia") or []),
        "discovery": rec.get("discovery"),
        "valueTier": reward.get("valueTier"),
        # schemaVersion 2 (owner feedback round): purpose, stance, interior in one line each
        "purpose": _purpose_line(rec.get("playerPurpose")),
        "hook": (rec.get("playerPurpose") or {}).get("hook"),
        "stance": (rec.get("hostility") or {}).get("baseline"),
        "interior": _interior_line(rec.get("interior")),
        # ...and the structured view of the same v2 blocks, for the studio's
        # detail panel and its filters. Short strings and short arrays only:
        # the bundle is a review projection, never a copy of the record.
        "purposeDetail": (lambda pp: pp and {
            "primary": pp.get("primary"), "impact": pp.get("impact"),
            "secondary": list(pp.get("secondary") or []),
        })(rec.get("playerPurpose")) or None,
        "stanceDetail": (lambda h: h and {
            "baseline": h.get("baseline"), "owner": h.get("owner"),
            "clearable": h.get("clearable"), "respawn": h.get("respawn"),
            "flips": _flip_lines(h),
        })(rec.get("hostility")) or None,
        "interiorDetail": (lambda it: it and it.get("kind") not in (None, "none") and {
            "kind": it.get("kind"), "family": it.get("family"), "sizeBand": it.get("sizeBand"),
            "wetFraction": it.get("wetFraction"), "entranceCount": it.get("entranceCount"),
            "exteriorShell": it.get("exteriorShell"),
            "verticalRelationship": it.get("verticalRelationship"),
        })(rec.get("interior")) or None,
        "entrance": rec.get("entrance"),
        "underwaterAccess": rec.get("underwaterAccess"),
        "contents": _contents(rec),
        "travelStation": _travel_station(rec, names),
        "questProvisions": list((rec.get("questHooks") or {}).get("provisions") or []),
        "tierOwnership": (rec.get("questHooks") or {}).get("tierOwnership"),
        "questLinks": _quest_links(rec, quests),
        "interiorScope": _interior_scope(rec),
    }


def _purpose_line(pp: dict | None) -> str | None:
    if not pp:
        return None
    sec = ", ".join(pp.get("secondary") or [])
    return f"{pp.get('primary')} ({pp.get('impact')})" + (f" + {sec}" if sec else "")


def _interior_line(it: dict | None) -> str | None:
    if not it or it.get("kind") in (None, "none"):
        return None
    wet = it.get("wetFraction")
    return f"{it.get('kind')} · {it.get('family')} · {it.get('sizeBand')}" + (f" · wet {wet:.0%}" if isinstance(wet, (int, float)) else "")


def build_bundle(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict:
    region_files = list(catalogue.load_region_files(catalogue_dir))
    # id → name for every record (sited or not), so travel-station destinations
    # can be shown by name even when the far end is not on the map.
    names = {rec["id"]: (rec.get("name") or rec["id"]) for rf in region_files for rec in rf.places}
    quests = load_quest_lookup()
    places = []
    unsited = 0
    for rf in region_files:
        for rec in rf.places:
            # only LIVE plotted records reach the map: a deferred record may
            # still carry a stale position from an earlier plot
            if rec.get("position") and rec.get("status") not in ("deferred", "cut"):
                places.append(project_record(rec, rf.region, names, quests))
            else:
                unsited += 1
    places.sort(key=lambda p: p["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/catalogue/places-*.json via worldgen.export_places",
        "zoneColours": zone_colours(),
        "unsitedCount": unsited,
        "questGroups": _quest_groups(places),
        "places": places,
    }


def _quest_groups(places: list[dict]) -> list[dict]:
    """The filter chips: one row per (group, line) that any exported place links
    to — main, each faction line, other lines, minor — with a place count."""
    rows: dict[tuple[str, str], dict] = {}
    for p in places:
        for l in p["questLinks"]:
            key = (l["group"], l["lineName"] if l["group"] == "faction" else l["group"])
            row = rows.setdefault(key, {"group": l["group"], "label": key[1], "line": l["line"] if l["group"] == "faction" else None, "places": 0, "_ids": set()})
            row["_ids"].add(p["id"])
    out = []
    order = {"main": 0, "faction": 1, "other": 2, "minor": 3}
    for key in sorted(rows, key=lambda k: (order.get(k[0], 9), k[1])):
        r = rows[key]
        out.append({"group": r["group"], "label": r["label"], "line": r["line"], "places": len(r["_ids"])})
    return out


def render(bundle: dict) -> str:
    return json.dumps(bundle, indent=2, ensure_ascii=False) + "\n"


def export(out_path: Path = OUT_PATH, catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict:
    bundle = build_bundle(catalogue_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(bundle), encoding="utf-8")
    return bundle


def main() -> None:
    bundle = export()
    print(f"wrote {OUT_PATH.relative_to(catalogue.REPO_ROOT)}: "
          f"{len(bundle['places'])} plotted places ({bundle['unsitedCount']} unsited, not exported)")


if __name__ == "__main__":
    main()
