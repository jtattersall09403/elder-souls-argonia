"""The slice-close mechanics for one accepted place (16k S11; place-build
SKILL § 8 Slice close).

Every change this makes to a shared file is a REQUEST row appended to
`tooling/.reports/16k/<place-id>/requests.jsonl` (lane 3A contract 7), which
the integrator lane applies for the whole batch with
`python3 -m worldgen.apply_requests --batch ...`; close_place itself edits no
shared file. It emits:

1. the acceptance receipt: an upsert (keyed by placeId, so a re-acceptance
   replaces it) in world/sources/placement/accepted-places.json
   (place id, the owner's date, the compiled-record and own-patches hashes of
   worldgen.accepted_places, the export's provenance), plus a
   docs/phases/P-polish/backlog.md bullet, under its own heading, for every report-mode row of this
   place in output/accepted-report.json (0100 decision 6);
2. the type-recipes.json entry: `builtPlaces` of the place's type (grammar and
   shells from the builder, yard sets and claimed interior cells read from the
   layout and the compiled record);
3. the creative-register row (references/creative-register.md), replaced by
   place name on a re-acceptance;

and runs, outside the request rows:

4. the register digest (`python3 -m worldgen.register_digest`, contract 5);
5. the next Starting-state stub, tooling/.reports/16k/<place-id>/starting-state.md
   (never into the 16k brief), quoting the last ledger rows;
6. the ledger row: close.json, then `build_ledger.py append --from-close`.

The builder's judgements come from `tooling/.reports/16k/<place-id>/close-input.json`:
{"schemaVersion": 1, "placeId", "creativeRow": {"typeCulture", "clutter",
"containers", "idle", "lights", "memorable"}, "typeRecipe": {"grammar",
"shells": [...]}}. A missing file or field refuses the close: a placeholder
row is unfinished work (decision 0102).

    python3 -m worldgen.close_place --place <id> --accepted-on YYYY-MM-DD [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

from . import accepted_places, apply_requests, place_type

REPO_ROOT = Path(__file__).resolve().parents[3]
WG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = Path("tooling/.reports/16k")
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"
LEDGER_TOOL = REPO_ROOT / "tooling" / "repo-standards" / "build_ledger.py"
LEDGER = REPO_ROOT / "docs" / "phases" / "16-foundation-and-places" / "build-ledger.jsonl"
ACCEPTED_REL = "world/sources/placement/accepted-places.json"
RECIPES_REL = "world/sources/catalogue/type-recipes.json"
CREATIVE_REL = ".claude/skills/place-build/references/creative-register.md"
BACKLOG_REL = "docs/phases/P-polish/backlog.md"
BACKLOG_HEADING = "## Report-mode findings on accepted places (0100 decision 6)"
CREATIVE_FIELDS = ("typeCulture", "clutter", "containers", "idle", "lights", "memorable")
SCHEMA_VERSION = 1


class CloseRefused(SystemExit):
    pass


def place_dir(place_id: str) -> Path:
    return REPO_ROOT / REPORTS / place_id


def catalogue_record(place_id: str) -> dict:
    rec = place_type.find_record(place_id)
    if rec is None:
        raise CloseRefused(f"close_place: {place_id} is not in any places-*.json")
    if not place_type.record_type(rec):
        raise CloseRefused(f"close_place: {place_id} has no classification.type")
    return rec


def find_layout(place_id: str) -> Path | None:
    for path in sorted(BLUEPRINTS.glob("*.layout.json")):
        try:
            if json.loads(path.read_text()).get("placeId") == place_id:
                return path
        except (OSError, ValueError):
            continue
    return None


def load_close_input(place_id: str) -> dict:
    path = place_dir(place_id) / "close-input.json"
    rel = path.relative_to(REPO_ROOT)
    if not path.exists():
        raise CloseRefused(f"close_place: REFUSED, no {rel}: the builder writes the creative-register "
                           f"cells {list(CREATIVE_FIELDS)} and typeRecipe {{grammar, shells}} there")
    doc = json.loads(path.read_text())
    missing = [f"creativeRow.{f}" for f in CREATIVE_FIELDS
               if not str((doc.get("creativeRow") or {}).get(f) or "").strip()]
    tr = doc.get("typeRecipe") or {}
    if not str(tr.get("grammar") or "").strip():
        missing.append("typeRecipe.grammar")
    if not isinstance(tr.get("shells"), list) or not tr["shells"]:
        missing.append("typeRecipe.shells")
    if doc.get("schemaVersion") != SCHEMA_VERSION or doc.get("placeId") != place_id:
        missing.append(f"schemaVersion {SCHEMA_VERSION} and placeId {place_id}")
    if missing:
        raise CloseRefused(f"close_place: REFUSED, {rel} lacks {', '.join(missing)}")
    return doc


def git_date(path: Path) -> str | None:
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)], cwd=REPO_ROOT,
                         capture_output=True, text=True).stdout.strip()
    return out or None


def receipt(place_id: str, accepted_on: str, compiled: dict, layout: Path | None) -> dict:
    authored = (git_date(layout) if layout else None) or accepted_on
    return {"placeId": place_id, "acceptedOn": accepted_on, "authoredOn": authored,
            "compiledHash": accepted_places.compiled_hash(compiled),
            "patchesHash": accepted_places.patches_hash(place_id),
            "provenance": {"sourceBlueprintSha256": compiled.get("sourceBlueprintSha256"),
                           "layout": str(layout.relative_to(REPO_ROOT)) if layout else None}}


def yard_sets(layout_doc: dict) -> list[str]:
    return sorted({op["name"] for op in layout_doc.get("ops", [])
                   if op.get("op") == "group" and op.get("action") == "place" and op.get("name")})


def claimed_cells(compiled: dict) -> list[str]:
    return sorted({(d.get("interiorClaim") or {}).get("cellId") for d in compiled.get("doors", [])}
                  - {None})


def report_rows(place_id: str) -> list[dict]:
    path = accepted_places.REPORT_PATH
    if not path.exists():
        return []
    return [r for r in json.loads(path.read_text()).get("rows", []) if r.get("placeId") == place_id]


def cell(text: str) -> str:
    return " ".join(str(text).split()).replace("|", "/")


def request_rows(place_id: str, rec: dict, accepted_on: str, compiled: dict,
                 layout: Path | None, close_in: dict) -> list[dict]:
    layout_doc = json.loads(layout.read_text()) if layout else {}
    tr = close_in["typeRecipe"]
    cr = close_in["creativeRow"]
    base = {"schemaVersion": SCHEMA_VERSION, "placeId": place_id}
    rows = [
        {**base, "file": ACCEPTED_REL, "op": "json-upsert", "path": ["places"], "key": "placeId",
         "value": receipt(place_id, accepted_on, compiled, layout),
         "reason": "acceptance receipt (0100 decision 6), slice close"},
        {**base, "file": RECIPES_REL, "op": "json-upsert", "key": "placeId",
         "path": ["types", {"type": place_type.record_type(rec)}, "builtPlaces"],
         "value": {"placeId": place_id, "acceptedOn": accepted_on, "grammar": tr["grammar"],
                   "shells": sorted(tr["shells"]), "yardSets": yard_sets(layout_doc),
                   "interiorCells": claimed_cells(compiled)},
         "reason": "type register entry (SKILL § 8 item 4), slice close"},
        {**base, "file": CREATIVE_REL, "op": "text-line-upsert",
         "match": f"| {cell(rec.get('name') or place_id)} |",
         "value": "| " + " | ".join([cell(rec.get("name") or place_id)]
                                     + [cell(cr[f]) for f in CREATIVE_FIELDS]) + " |",
         "reason": "creative-register row (SKILL § 8 item 5), slice close"},
    ]
    for r in report_rows(place_id):
        rows.append({**base, "file": BACKLOG_REL, "op": "text-section-append",
                     "heading": BACKLOG_HEADING,
                     "value": f"- **{place_id}: report-mode gate `{r['gate']}`** (gate added "
                              f"{r['gateAddedOn']}, place accepted {r['acceptedOn']}): "
                              f"{cell(r['finding'])} (close_place, from "
                              f"tooling/world-generation/output/accepted-report.json).",
                     "reason": "report-mode finding on an accepted place (0100 decision 6)"})
    return rows


def append_requests(place_id: str, rows: list[dict]) -> int:
    """Append the rows not already in requests.jsonl; returns how many were new."""
    path = apply_requests.requests_path(place_id, REPO_ROOT)
    key = lambda r: json.dumps([r["file"], r["op"], r.get("path"), r["value"]], sort_keys=True)  # noqa: E731
    have = {key(r) for r in apply_requests.read_requests(path)}
    new = [r for r in rows if key(r) not in have]
    if new:
        path.parent.mkdir(parents=True, exist_ok=True)
        with apply_requests.write_lock(path), path.open("a") as f:
            for r in new:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(new)


def run_register_digest() -> str:
    if not (WG_ROOT / "worldgen" / "register_digest.py").exists():
        return ("register digest: SKIPPED, worldgen/register_digest.py does not exist yet "
                "(lane 3A sub-lane C); run `python3 -m worldgen.register_digest` once it lands")
    got = subprocess.run([sys.executable, "-m", "worldgen.register_digest"], cwd=WG_ROOT,
                         capture_output=True, text=True)
    tail = (got.stdout + got.stderr).strip().splitlines()[-1:] or [""]
    return f"register digest: exit {got.returncode} {tail[0]}"


def last_ledger_rows(n: int = 5) -> list[dict]:
    if not LEDGER.exists():
        return []
    rows = [json.loads(x) for x in LEDGER.read_text().splitlines() if x.strip()]
    return rows[-n:]


def starting_state(place_id: str, rec: dict, accepted_on: str, n_requests: int) -> str:
    lines = [f"# Starting state after {place_id} (stub written by close_place)", "",
             f"- {rec.get('name') or place_id} ({place_type.record_type(rec)}) accepted by the owner on "
             f"{accepted_on}; its receipt, type-recipes entry and creative-register row are "
             f"REQUEST rows in `{REPORTS / place_id / 'requests.jsonl'}` ({n_requests} new this close).",
             "- Apply them with the batch: `cd tooling/world-generation && python3 -m "
             "worldgen.apply_requests --batch <every place id in the packet>`.",
             "- Next slice: choose by the contrast rule and rotate the shells (place-build SKILL "
             "§ 8 item 6); the planner copies this stub into the 16k brief's Starting state.",
             "", "## Last build-ledger rows", "",
             "| Place | Source | Path | Wall min | Rounds | Skill sha |", "|---|---|---|---|---|---|"]
    for r in last_ledger_rows():
        wall = r.get("wallMin") or {}
        total = wall.get("total", wall.get("gates"))
        lines.append(f"| {r.get('placeId')} | {r.get('source')} | {r.get('path')} | "
                     f"{'' if total is None else total} | {r.get('rounds') or ''} | "
                     f"{str(r.get('skillSha') or '')[:12]} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--place", required=True)
    ap.add_argument("--accepted-on", required=True, help="the owner's 'looks right' date, YYYY-MM-DD")
    ap.add_argument("--path", choices=("new-type", "template", "fix-round"),
                    help="the build path for the ledger (default: build_ledger infers it)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    dt.date.fromisoformat(a.accepted_on)
    pid = a.place
    rec = catalogue_record(pid)
    close_in = load_close_input(pid)
    compiled_path = accepted_places.SETTLEMENTS_DIR / f"{pid}.settlement.json"
    if not compiled_path.exists():
        raise CloseRefused(f"close_place: REFUSED, no compiled record at {compiled_path}; compile the place")
    compiled = json.loads(compiled_path.read_text())
    layout = find_layout(pid)
    rows = request_rows(pid, rec, a.accepted_on, compiled, layout, close_in)
    if a.dry_run:
        for r in rows:
            print(f"close_place: would request {r['op']} {r['file']} {json.dumps(r.get('path'))}")
        print(f"close_place: dry run, {len(rows)} request row(s); nothing written")
        return 0
    n_new = append_requests(pid, rows)
    print(f"close_place: {n_new} new request row(s) ({len(rows)} total) in "
          f"{REPORTS / pid / 'requests.jsonl'}; apply with worldgen.apply_requests --batch")
    print(run_register_digest())
    out = place_dir(pid)
    close_doc = {"schemaVersion": SCHEMA_VERSION, "placeId": pid, "type": place_type.record_type(rec),
                 "acceptedOn": a.accepted_on}
    if a.path:
        close_doc["path"] = a.path
    (out / "close.json").write_text(json.dumps(close_doc, indent=1, sort_keys=True) + "\n")
    if LEDGER_TOOL.exists():
        got = subprocess.run([sys.executable, str(LEDGER_TOOL), "append", "--from-close",
                              str(out / "close.json"), "--ledger", str(LEDGER)], capture_output=True, text=True)
        print((got.stdout + got.stderr).strip() or f"build_ledger exit {got.returncode}")
    (out / "starting-state.md").write_text(starting_state(pid, rec, a.accepted_on, n_new))
    print(f"close_place: starting-state stub {REPORTS / pid / 'starting-state.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
