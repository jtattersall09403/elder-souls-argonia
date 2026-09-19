"""Apply the 16g review's remedies to the place catalogue, from a record.

    cd tooling/world-generation
    python3 -m worldgen.plot_remedies --check      # the record is valid and every remedy still holds
    python3 -m worldgen.plot_remedies --dry-run    # what would change
    python3 -m worldgen.plot_remedies --apply      # apply (idempotent)

WHY
---
The 16g review decides ONE remedy per failing record. Hand-editing eight
region files to carry those decisions is neither reproducible nor idempotent,
and the write-back rule (docs/world/96-placement-playbook.md §1) forbids
hand-writing a position at all. So the decisions live as rows in
`world/sources/sites/plot-remedies.json` and this tool realises them: re-run
it and nothing changes; re-run the review and the same rows produce the same
catalogue.

The mechanism for "put this record somewhere else" is never a written
position. A record with no committed position is re-sited by the chain's
seeded `macro_plot` (`macro_plot.seed_from_committed`: "no committed
position" → resite), so `pin-by-siting` and `re-type` state the record's
preferences and REMOVE its position fields; a `meso-move` under 150 m writes
an override row that `apply_sitings --stage` applies.

This tool never loads the province survey: it is catalogue JSON work only
(metres ↔ uv comes from `worldgen.scale`, the frame `site_fields` uses).
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from pathlib import Path

from . import catalogue
from . import scale

REMEDIES_PATH = catalogue.REPO_ROOT / "world" / "sources" / "sites" / "plot-remedies.json"
OVERRIDES_PATH = catalogue.REPO_ROOT / "world" / "sources" / "sites" / "macro-plot-overrides.json"
ROUTE_REGISTRY_PATH = catalogue.REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
TYPE_RECIPES_NAME = "type-recipes.json"

SCHEMA_VERSION = 1
MESO_MOVE_MAX_M = 150.0
OVERRIDE_SOURCE = "plot-remedies"

KINDS = {"pin-by-siting", "meso-move", "re-type", "re-reference", "prose",
         "merge", "cut", "status", "field"}

#: The position block a re-site must NOT carry. `footprintRadiusM`,
#: `footprintSource` and `footprintPolygon` are in the list because
#: `catalogue._validate_16g_fields` ties them to `positionM` ("footprintRadiusM/
#: footprintSource belong to a positioned record"); the plot re-derives them.
POSITION_FIELDS = ("positionM", "position", "plotFacts", "whySiteWon",
                   "candidatesConsidered", "scourSiteId",
                   "footprintRadiusM", "footprintSource", "footprintPolygon")

#: The prose fields a `prose` remedy may replace (dotted paths).
PROSE_FIELDS = {"why.founding", "why.siteAdvantages", "why.pressures",
                "vibe.approach", "sitingNote", "playerPurpose.hook",
                "questHooks.opportunity"}

#: The first path segment a `field` remedy may write: the schema fields 16g
#: added. Anything else is refused — `field` is an escape hatch, not a hole.
FIELD_ALLOWLIST = {"ownerGuided", "vasteiTutorialScene", "reservedFor",
                   "coSitedWith", "underwaterAccessDetail", "heroHist", "interior"}

#: The relation lists that carry ROUTE ids (the rest carry place ids).
ROUTE_RELATION_KEYS = ("patrols", "tolls", "travelServiceEdges")

RELATION_BLOCKS = ("relations", "relationsReserved")

LIVE_STATUSES_EXCLUDED = {"cut", "deferred"}


class RemedyError(Exception):
    """A remedy that cannot be applied as written."""


# --------------------------------------------------------------------------- io

def load_remedies(path: Path = REMEDIES_PATH) -> list[dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise RemedyError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    rem = doc.get("remedies")
    if not isinstance(rem, list):
        raise RemedyError(f"{path}: 'remedies' must be a list")
    return rem


def load_route_ids(path: Path = ROUTE_REGISTRY_PATH) -> set[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {r["id"] for r in doc.get("routes", [])}


def load_type_recipes(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict[str, dict]:
    doc = json.loads((catalogue_dir / TYPE_RECIPES_NAME).read_text(encoding="utf-8"))
    return {t["type"]: t for t in doc.get("types", [])}


def load_overrides(path: Path = OVERRIDES_PATH) -> dict:
    if not path.exists():
        return {"schemaVersion": 1, "overrides": []}
    return json.loads(path.read_text(encoding="utf-8"))


def dump_overrides(doc: dict, path: Path = OVERRIDES_PATH) -> None:
    # byte-compatible with worldgen.apply_sitings' own writer (indent 1)
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


# ------------------------------------------------------------------- small helpers

def get_path(obj: dict, path: str):
    cur = obj
    for seg in path.split("."):
        if not isinstance(cur, dict) or seg not in cur:
            return None
        cur = cur[seg]
    return cur


def set_path(obj: dict, path: str, value) -> None:
    segs = path.split(".")
    cur = obj
    for seg in segs[:-1]:
        nxt = cur.get(seg)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[seg] = nxt
        cur = nxt
    cur[segs[-1]] = value


def merge_prefs(target: dict, patch: dict) -> None:
    """Merge a partial `sitingPrefs` in: dicts merge key-wise, everything
    else (lists included, so `hardConstraints` replaces) is replaced."""
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(target.get(k), dict):
            merge_prefs(target[k], v)
        else:
            target[k] = copy.deepcopy(v)


def prefs_hold(target: dict, patch: dict) -> bool:
    for k, v in patch.items():
        cur = target.get(k)
        if isinstance(v, dict) and isinstance(cur, dict):
            if not prefs_hold(cur, v):
                return False
        elif cur != v:
            return False
    return True


def clear_position(rec: dict) -> bool:
    """Remove the committed position so the seeded plot re-sites the record,
    and drop the record's workflow to `derived` with it.

    `REQUIRED_AT["plotted"]` demands position/whySiteWon/candidatesConsidered,
    so a record left at `plotted` with no position fails `validate_catalogue`
    in the window between `--apply` and the chain's `macro_plot` run. The
    demotion closes that window; `macro_plot.apply_to_records` writes
    `plotted` back when it sites the record. No restore path is needed for
    `authored`: the only authored records are the five Part 6 exemplars, and
    16i re-authors those (owner ruling, 16g remedy lane).
    """
    hit = False
    for key in POSITION_FIELDS:
        if key in rec:
            del rec[key]
            hit = True
    if rec.get("workflow") != "derived":
        rec["workflow"] = "derived"
        hit = True
    return hit


def position_cleared(rec: dict) -> bool:
    return not any(k in rec for k in POSITION_FIELDS) and rec.get("workflow") == "derived"


def metres_to_uv_pair(x: float, z: float) -> tuple[float, float]:
    """The same frame `apply_sitings.build_overrides` uses: the survey's
    `m_to_uv` divides by `extent_m`, which IS `scale.AUTHORED_UV_EXTENT_M`."""
    return scale.metres_to_uv(x), scale.metres_to_uv(z)


# ------------------------------------------------------------------------ context

class Context:
    """Everything a remedy reads, loaded once."""

    def __init__(self, catalogue_dir: Path = catalogue.CATALOGUE_DIR,
                 route_registry: Path = ROUTE_REGISTRY_PATH,
                 overrides_path: Path = OVERRIDES_PATH):
        self.catalogue_dir = catalogue_dir
        self.overrides_path = overrides_path
        self.files = list(catalogue.load_region_files(catalogue_dir))
        self.by_id: dict[str, dict] = {}
        self.file_of: dict[str, catalogue.RegionFile] = {}
        for rf in self.files:
            for rec in rf.places:
                self.by_id[rec["id"]] = rec
                self.file_of[rec["id"]] = rf
        self.route_ids = load_route_ids(route_registry)
        self.recipes = load_type_recipes(catalogue_dir)
        self.overrides = load_overrides(overrides_path)
        self.dirty_files: set[Path] = set()
        self.overrides_dirty = False

    def write(self) -> list[Path]:
        written = []
        for rf in self.files:
            if rf.path in self.dirty_files:
                catalogue.dump_json(rf.path, {"schemaVersion": rf.schema_version,
                                              "region": rf.region, "seed": rf.seed,
                                              "places": rf.places})
                written.append(rf.path)
        if self.overrides_dirty:
            dump_overrides(self.overrides, self.overrides_path)
            written.append(self.overrides_path)
        return written


# ------------------------------------------------------------------------- kinds
# Each handler returns a list of human-readable changes. With apply=False it
# reports what WOULD change and mutates nothing (the record is deep-copied).

def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RemedyError(msg)


def _pin_by_siting(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    patch = rem.get("sitingPrefs")
    _require(isinstance(patch, dict) and patch, "pin-by-siting needs a non-empty sitingPrefs object")
    prefs = rec.setdefault("sitingPrefs", {}) if apply else copy.deepcopy(rec.get("sitingPrefs") or {})
    changes = []
    if not prefs_hold(prefs, patch):
        changes.append(f"sitingPrefs += {sorted(patch)}")
        if apply:
            merge_prefs(prefs, patch)
    if not position_cleared(rec):
        changes.append("position fields removed, workflow → derived (the seeded plot re-sites it)")
        if apply:
            clear_position(rec)
    return changes


def _meso_move(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    to = rem.get("toM")
    _require(isinstance(to, list) and len(to) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in to),
             "meso-move needs toM [x, z] in metres")
    now = rec.get("positionM")
    _require(isinstance(now, list) and len(now) == 2,
             f"meso-move needs a committed positionM on {rec['id']}")
    dist = math.hypot(float(to[0]) - float(now[0]), float(to[1]) - float(now[1]))
    _require(dist <= MESO_MOVE_MAX_M,
             f"meso-move is {dist:.1f} m, beyond the {MESO_MOVE_MAX_M:.0f} m meso limit "
             f"— a move this big is a pin-by-siting, not a nudge")
    u, v = metres_to_uv_pair(float(to[0]), float(to[1]))
    row = {"id": rec["id"], "u": round(u, 6), "v": round(v, 6),
           "why": rem.get("why", ""), "source": OVERRIDE_SOURCE}
    rows = ctx.overrides.setdefault("overrides", [])
    existing = next((r for r in rows if r["id"] == rec["id"] and r.get("source") == OVERRIDE_SOURCE), None)
    if existing == row:
        return []
    if apply:
        if existing is None:
            rows.append(row)
        else:
            existing.clear()
            existing.update(row)
        rows.sort(key=lambda r: r["id"])
        ctx.overrides_dirty = True
    return [f"override row u={row['u']} v={row['v']} ({dist:.1f} m; apply_sitings --stage moves the dot)"]


def _re_type(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    t = rem.get("type")
    _require(isinstance(t, str) and t in ctx.recipes,
             f"re-type: '{t}' is not a type in {TYPE_RECIPES_NAME}")
    recipe = ctx.recipes[t]
    want = {"type": t}
    for key in ("family", "class", "variant"):
        if key in rem:
            want[key] = rem[key]
        elif key in recipe and key != "variant":
            want[key] = recipe[key]
    cls = rec.setdefault("classification", {}) if apply else copy.deepcopy(rec.get("classification") or {})
    changes = []
    if any(cls.get(k) != v for k, v in want.items()):
        changes.append("classification " + ", ".join(f"{k}={v}" for k, v in sorted(want.items())))
        if apply:
            cls.update(want)
    if not position_cleared(rec):
        changes.append("position fields removed, workflow → derived (a new type is re-sited)")
        if apply:
            clear_position(rec)
    return changes


def _re_reference(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    repl = rem.get("replace")
    _require(isinstance(repl, dict) and repl, "re-reference needs a non-empty replace map")
    for new in repl.values():
        _require(new in ctx.route_ids, f"re-reference: '{new}' is not a route in routes/registry.json")
    changes = []
    for block in RELATION_BLOCKS:
        blk = rec.get(block)
        if not isinstance(blk, dict):
            continue
        for key in ROUTE_RELATION_KEYS:
            lst = blk.get(key)
            if not isinstance(lst, list):
                continue
            new = [repl.get(v, v) if isinstance(v, str) else v for v in lst]
            if new != lst:
                changes.append(f"{block}.{key}: " + ", ".join(
                    f"{a}→{b}" for a, b in zip(lst, new) if a != b))
                if apply:
                    blk[key] = new
    return changes


def _prose(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    field = rem.get("field")
    _require(field in PROSE_FIELDS, f"prose field must be one of {sorted(PROSE_FIELDS)}")
    text = rem.get("text")
    _require(isinstance(text, str) and text.strip(), "prose needs non-empty text")
    if get_path(rec, field) == text:
        return []
    if apply:
        set_path(rec, field, text)
    return [f"{field} rewritten ({len(text)} chars)"]


def _merge(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    group = rem.get("group")
    _require(isinstance(group, str) and group.startswith("group.") and len(group.split(".")) == 2 and group.split(".")[1],
             "merge needs group 'group.<slug>'")
    changes = []
    if rec.get("designGroup") != group:
        changes.append(f"designGroup = {group}")
        if apply:
            rec["designGroup"] = group
    bound = (rem.get("sitingPrefs") or {}).get("boundTo")
    if bound is not None:
        changes += _pin_by_siting(ctx, rec, {"sitingPrefs": {"boundTo": bound}}, apply)
    return changes


def _cut(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    rid = rec["id"]
    changes = []
    if rec.get("status") != "cut":
        changes.append("status = cut")
        if apply:
            rec["status"] = "cut"
            why = rem.get("why", "")
            if rid not in why:
                rem["why"] = (why.rstrip() + f" Cut: {rid}.").strip()
    # every live inbound edge on ANOTHER record moves to relationsReserved
    for other_id, other in sorted(ctx.by_id.items()):
        if other_id == rid:
            continue
        rel = other.get("relations")
        if not isinstance(rel, dict):
            continue
        for key, lst in sorted(rel.items()):
            if not isinstance(lst, list) or rid not in lst:
                continue
            changes.append(f"{other_id}.relations.{key} → relationsReserved.{key}")
            if apply:
                rel[key] = [v for v in lst if v != rid]
                res = other.setdefault("relationsReserved", {}).setdefault(key, [])
                if rid not in res:
                    res.append(rid)
                ctx.dirty_files.add(ctx.file_of[other_id].path)
    return changes


def _status(ctx: Context, rec: dict, rem: dict, apply: bool) -> list[str]:
    st = rem.get("status")
    _require(st in catalogue.STATUSES, f"status must be one of {sorted(catalogue.STATUSES)}")
    if rec.get("status") == "deferred" and st == "active":
        _require(isinstance(rec.get("sitingPrefs"), dict) and rec["sitingPrefs"],
                 f"{rec['id']}: promoting deferred → active needs sitingPrefs (the plot must be able to site it)")
        _require(position_cleared(rec),
                 f"{rec['id']}: a promoted record must have no committed position (the plot sites it)")
    if rec.get("status") == st:
        return []
    if apply:
        rec["status"] = st
    return [f"status = {st}"]


def _field(ctx: Context, rem_rec: dict, rem: dict, apply: bool) -> list[str]:
    path = rem.get("path")
    _require(isinstance(path, str) and path, "field needs a dotted path")
    head = path.split(".")[0]
    _require(head in FIELD_ALLOWLIST,
             f"field path '{path}': '{head}' is not in the 16g allowlist {sorted(FIELD_ALLOWLIST)}")
    _require("value" in rem, "field needs a value")
    if get_path(rem_rec, path) == rem["value"]:
        return []
    if apply:
        set_path(rem_rec, path, rem["value"])
    return [f"{path} = {json.dumps(rem['value'], ensure_ascii=False)[:80]}"]


HANDLERS = {
    "pin-by-siting": _pin_by_siting,
    "meso-move": _meso_move,
    "re-type": _re_type,
    "re-reference": _re_reference,
    "prose": _prose,
    "merge": _merge,
    "cut": _cut,
    "status": _status,
    "field": _field,
}


# ------------------------------------------------------------------------- driver

def run(ctx: Context, remedies: list[dict], apply: bool) -> tuple[list[str], list[str]]:
    """(report lines, errors). With apply=False nothing is mutated."""
    report, errors = [], []
    for i, rem in enumerate(remedies):
        rid = rem.get("id")
        kind = rem.get("kind")
        if not isinstance(rid, str) or rid not in ctx.by_id:
            errors.append(f"remedies[{i}]: '{rid}' is not a catalogue id")
            continue
        if kind not in KINDS:
            errors.append(f"{rid}: kind '{kind}' is not one of {sorted(KINDS)}")
            continue
        if not isinstance(rem.get("why"), str) or not rem["why"].strip():
            errors.append(f"{rid}: every remedy needs a `why` (the measured reason)")
            continue
        rec = ctx.by_id[rid] if apply else copy.deepcopy(ctx.by_id[rid])
        try:
            changes = HANDLERS[kind](ctx, rec, rem, apply)
        except RemedyError as e:
            errors.append(f"{rid} ({kind}): {e}")
            continue
        if changes and apply:
            ctx.dirty_files.add(ctx.file_of[rid].path)
        for c in changes:
            report.append(f"  {'APPLY' if apply else 'would'} {rid} [{kind}] {c}")
        if not changes:
            report.append(f"  ok    {rid} [{kind}] already applied")
    return report, errors


def check(ctx: Context, remedies: list[dict]) -> list[str]:
    """Every remedy is valid AND its state still holds (a cut record is still
    cut, a re-referenced edge still points at the new route, …). A remedy that
    was never applied fails too: the order is add the row, `--apply`, commit."""
    report, errors = run(ctx, remedies, apply=False)
    for line in report:
        if "already applied" not in line:
            errors.append("state no longer holds:" + line[len("  would"):])
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--apply", action="store_true", help="apply every remedy (idempotent)")
    g.add_argument("--check", action="store_true", help="validate the record and that every remedy still holds")
    g.add_argument("--dry-run", action="store_true", help="print what would change")
    ap.add_argument("--remedies", type=Path, default=REMEDIES_PATH)
    a = ap.parse_args(argv)
    try:
        remedies = load_remedies(a.remedies)
    except RemedyError as e:
        print(f"plot_remedies: {e}", file=sys.stderr)
        return 1
    ctx = Context()
    if a.check:
        errors = check(ctx, remedies)
        for e in errors:
            print(f"  FAIL {e}", file=sys.stderr)
        print(f"plot_remedies --check: {len(remedies)} remedy/remedies, {len(errors)} failure(s)")
        return 1 if errors else 0
    report, errors = run(ctx, remedies, apply=a.apply)
    for line in report:
        print(line)
    for e in errors:
        print(f"  FAIL {e}", file=sys.stderr)
    if errors:
        return 1
    if a.apply:
        for p in ctx.write():
            print(f"wrote {p.relative_to(catalogue.REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
