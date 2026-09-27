"""Apply a batch's REQUEST rows to the shared files (lane 3A contract 7).

Builders never edit a shared file (a zone catalogue, a yard set, the
registers, the receipt, type-recipes.json...): each change is a row in
`tooling/.reports/16k/<place-id>/requests.jsonl`, and one integrator lane
applies a batch's rows with this tool (method review r3 finding E; place-build
SKILL § Builders write only per-place files).

A row: {"schemaVersion": 1, "placeId", "file": repo-relative, "op", "path",
"value", "reason"}. Ops:

- `json-merge`: deep-merge the object `value` at `path` (a missing key is
  created; a non-object value replaces).
- `json-append`: append `value` to the list at `path`, unless an equal item is
  already there.
- `json-upsert`: in the list at `path`, replace the item whose `key` field
  equals `value[key]`, or append `value` when none does (a re-accepted place
  replaces its receipt and its type-recipes entry, never adds a second one).
- `text-append`: append the text `value` to the file, unless the file already
  holds it.
- `text-line-upsert`: replace the one line starting with `match` by the
  one-line `value` (which starts with `match`), else append it (a re-accepted
  place replaces its creative-register row).
- `text-section-append`: the text-append, at the end of the section under the
  markdown `heading` line (created at the end of the file when absent), so a
  row lands under its own heading whatever sections follow it.

`path` is a list of object keys; an element that is itself an object, such as
{"type": "road-station"}, selects the one list item whose fields match it (so
a row can address a type's entry in type-recipes.json).

Every target file and every requests file is changed under its write lock
(worldgen.atomic_write, decision 0104 decision 9) and replaced by rename. A
file is one transaction: all its rows apply to one parsed copy and it is
written once, or a bad row leaves the file and all its rows untouched. A
JSON target keeps its indent, key order and ASCII escaping. An applied row is
marked with `appliedAt` and never applied again, and every op is a no-op when
its change is already present, so a re-run after a crash changes nothing.

    python3 -m worldgen.apply_requests --batch <place-id>,<place-id>,... [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from .atomic_write import locked_write_text, write_lock

REPO_ROOT = Path(__file__).resolve().parents[3]
REPORTS = Path("tooling/.reports/16k")
SCHEMA_VERSION = 1
OPS = ("json-merge", "json-append", "json-upsert", "text-append", "text-section-append", "text-line-upsert")
TEXT_OPS = ("text-append", "text-section-append", "text-line-upsert")


class RequestError(ValueError):
    pass


def requests_path(place_id: str, repo: Path = REPO_ROOT) -> Path:
    return repo / REPORTS / place_id / "requests.jsonl"


def read_requests(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def validate(row: dict, place_id: str) -> None:
    if row.get("schemaVersion") != SCHEMA_VERSION:
        raise RequestError(f"schemaVersion must be {SCHEMA_VERSION}")
    if row.get("placeId") != place_id:
        raise RequestError(f"placeId {row.get('placeId')!r} is not {place_id!r}")
    f = row.get("file")
    if not isinstance(f, str) or not f or Path(f).is_absolute() or ".." in Path(f).parts:
        raise RequestError(f"file {f!r} is not a repo-relative path")
    if row.get("op") not in OPS:
        raise RequestError(f"op {row.get('op')!r} is not one of {OPS}")
    if row["op"].startswith("json-") and not isinstance(row.get("path"), list):
        raise RequestError("a json op needs a path list")
    if row["op"] in TEXT_OPS and not isinstance(row.get("value"), str):
        raise RequestError(f"{row['op']} needs a text value")
    if row["op"] == "text-section-append" and not str(row.get("heading") or "").startswith("#"):
        raise RequestError("text-section-append needs a markdown heading line")
    if row["op"] == "text-line-upsert" and not (isinstance(row.get("match"), str) and row["match"]
                                                and "\n" not in row["value"].strip("\n")
                                                and row["value"].startswith(row["match"])):
        raise RequestError("text-line-upsert needs a match prefix and a one-line value starting with it")
    if row["op"] == "json-upsert" and not (isinstance(row.get("key"), str) and isinstance(row.get("value"), dict)
                                           and row["key"] in row["value"]):
        raise RequestError("json-upsert needs a key field present in an object value")
    if row["op"] == "json-merge" and row.get("path") == [] and not isinstance(row.get("value"), dict):
        raise RequestError("json-merge at the root needs an object value")
    if not row.get("reason"):
        raise RequestError("a request needs a reason")


def json_style(text: str) -> dict:
    """The dump options that reproduce `text`: indent (spaces or none) and ASCII escaping."""
    m = re.search(r"\n([ \t]+)\S", text)
    indent = None if m is None else (len(m.group(1)) if m.group(1).strip(" ") == "" else m.group(1))
    ascii_only = not any(ord(c) > 127 for c in text) and "\\u" in text
    return {"indent": indent, "ensure_ascii": ascii_only,
            "trailing": "\n" if text.endswith("\n") else ""}


def dump_json(doc, style: dict) -> str:
    kw = {"indent": style["indent"], "ensure_ascii": style["ensure_ascii"]}
    if style["indent"] is None:
        kw["separators"] = (", ", ": ")
    return json.dumps(doc, **kw) + style["trailing"]


def _step(node, key, create: bool):
    if isinstance(key, dict):
        if not isinstance(node, list):
            raise RequestError(f"selector {key} needs a list, found {type(node).__name__}")
        hits = [x for x in node if isinstance(x, dict) and all(x.get(k) == v for k, v in key.items())]
        if len(hits) != 1:
            raise RequestError(f"selector {key} matches {len(hits)} items, not 1")
        return hits[0]
    if not isinstance(node, dict):
        raise RequestError(f"key {key!r} needs an object, found {type(node).__name__}")
    if key not in node:
        if not create:
            raise RequestError(f"key {key!r} missing")
        node[key] = {}
    return node[key]


def _merge(dst: dict, src: dict) -> bool:
    changed = False
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            changed |= _merge(dst[k], v)
        elif dst.get(k, object()) != v:
            dst[k] = v
            changed = True
    return changed


def apply_json(doc, row: dict) -> bool:
    """Apply one json row to `doc` in place; True when it changed anything."""
    path = row["path"]
    if row["op"] == "json-merge":
        if not path:
            return _merge(doc, row["value"])
        parent = doc
        for key in path[:-1]:
            parent = _step(parent, key, create=True)
        last = path[-1]
        if isinstance(last, dict):
            target = _step(parent, last, create=False)
            if not isinstance(row["value"], dict):
                raise RequestError("merging into a selected item needs an object value")
            return _merge(target, row["value"])
        if isinstance(row["value"], dict) and isinstance(parent.get(last), dict):
            return _merge(parent[last], row["value"])
        if parent.get(last, object()) == row["value"]:
            return False
        parent[last] = row["value"]
        return True
    node = doc
    for key in path[:-1]:
        node = _step(node, key, create=True)
    if path:
        last = path[-1]
        if isinstance(last, str) and isinstance(node, dict) and last not in node:
            node[last] = []
        node = _step(node, last, create=False)
    if not isinstance(node, list):
        raise RequestError(f"{row['op']} needs a list at {path}")
    if row["op"] == "json-upsert":
        k = row["key"]
        hits = [i for i, x in enumerate(node) if isinstance(x, dict) and x.get(k) == row["value"][k]]
        if len(hits) > 1:
            raise RequestError(f"json-upsert: {len(hits)} items with {k} = {row['value'][k]!r}")
        if hits:
            if node[hits[0]] == row["value"]:
                return False
            node[hits[0]] = row["value"]
            return True
    if row["value"] in node:
        return False
    node.append(row["value"])
    return True


def apply_text(text: str, value: str) -> str | None:
    """The new text, or None when `value` is already in it."""
    if value in text:
        return None
    if text and not text.endswith("\n"):
        text += "\n"
    return text + value + ("" if value.endswith("\n") else "\n")


def apply_section_text(text: str, heading: str, value: str) -> str | None:
    """`value` appended at the end of the section under `heading` (the next
    heading of the same or a higher level ends it), or None when the section
    already holds it. A missing heading is added at the end of the file."""
    lines = text.splitlines(keepends=True)
    level = len(heading) - len(heading.lstrip("#"))
    start = next((i for i, ln in enumerate(lines) if ln.rstrip("\n") == heading), None)
    if start is None:
        base = text if not text or text.endswith("\n") else text + "\n"
        return base + "\n" + heading + "\n\n" + value.strip("\n") + "\n"
    end = len(lines)
    for i in range(start + 1, len(lines)):
        m = len(lines[i]) - len(lines[i].lstrip("#"))
        if 0 < m <= level and lines[i][m:m + 1] == " ":
            end = i
            break
    if value.strip("\n") in "".join(lines[start:end]):
        return None
    body = lines[start:end]
    while len(body) > 1 and body[-1].strip() == "":
        body.pop()
    tail = lines[start + len(body):end]
    block = "".join(body)
    if not block.endswith("\n"):
        block += "\n"
    block += value.strip("\n") + "\n"
    rest = "".join(lines[end:])
    return "".join(lines[:start]) + block + ("".join(tail) if tail else ("\n" if rest else "")) + rest


def apply_file(rel: str, text: str, rows: list[dict]) -> tuple[str | None, list[bool]]:
    """Apply every row for one file to ONE parsed document (or one text) and
    return (the new text or None when nothing changed, per-row changed flags).
    Raises RequestError naming the first bad row; the caller then writes nothing."""
    did: list[bool] = []
    if rel.endswith(".json") and all(r["op"].startswith("json-") for r in rows):
        style = json_style(text) if text else {"indent": 2, "ensure_ascii": False, "trailing": "\n"}
        doc = json.loads(text) if text else {}
        for n, row in enumerate(rows):
            try:
                did.append(apply_json(doc, row))
            except RequestError as err:
                raise RequestError(f"row {n + 1} of this file ({row['op']}): {err}") from None
        return (dump_json(doc, style) if any(did) else None), did
    cur = text
    for n, row in enumerate(rows):
        if row["op"] == "text-append":
            got = apply_text(cur, row["value"])
        elif row["op"] == "text-section-append":
            got = apply_section_text(cur, row["heading"], row["value"])
        elif row["op"] == "text-line-upsert":
            got = apply_line_upsert(cur, row["match"], row["value"])
        else:
            raise RequestError(f"row {n + 1} of this file: {row['op']} on a file that takes text rows")
        did.append(got is not None)
        if got is not None:
            cur = got
    return (cur if any(did) else None), did


def apply_line_upsert(text: str, match: str, value: str) -> str | None:
    """Replace the one line starting with `match` by `value`, or append `value`
    when no line does; None when that line already reads `value`."""
    lines = text.splitlines(keepends=True)
    hits = [i for i, ln in enumerate(lines) if ln.startswith(match)]
    if len(hits) > 1:
        raise RequestError(f"text-line-upsert: {len(hits)} lines start with {match!r}")
    if not hits:
        return apply_text(text, value)
    i = hits[0]
    if lines[i].rstrip("\n") == value:
        return None
    lines[i] = value + ("\n" if lines[i].endswith("\n") else "")
    return "".join(lines)


def apply_batch(place_ids: list[str], repo: Path = REPO_ROOT, dry_run: bool = False,
                now: str | None = None) -> dict:
    """Apply every unapplied row of the batch. Returns {"applied", "unchanged",
    "failed": [(place, index, error)], "files": [...]}."""
    now = now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pending: dict[str, list[tuple[str, int, dict]]] = {}
    books: dict[str, list[dict]] = {}
    failed = []
    for pid in sorted(set(place_ids)):
        rows = read_requests(requests_path(pid, repo))
        books[pid] = rows
        for i, row in enumerate(rows):
            if row.get("appliedAt"):
                continue
            try:
                validate(row, pid)
            except RequestError as err:
                failed.append((pid, i, str(err)))
                continue
            pending.setdefault(row["file"], []).append((pid, i, row))
    applied, unchanged, done = 0, 0, set()
    for rel in sorted(pending):
        target = repo / rel
        rows = pending[rel]
        with write_lock(target):
            text = target.read_text() if target.exists() else ""
            try:
                new_text, did = apply_file(rel, text, [r for _, _, r in rows])
            except RequestError as err:
                # one file is one transaction: a bad row leaves the file and all its rows as they were
                failed.extend((pid, i, f"{rel}: {err}; the file's {len(rows)} row(s) left unapplied")
                              for pid, i, _ in rows)
                continue
            if new_text is not None and not dry_run:
                locked_write_text(target, new_text)
        applied += sum(did)
        unchanged += len(did) - sum(did)
        done.update((pid, i) for pid, i, _ in rows)
    if not dry_run:
        for pid, rows in books.items():
            marks = [i for i in range(len(rows)) if (pid, i) in done]
            if not marks:
                continue
            path = requests_path(pid, repo)
            with write_lock(path):
                fresh = read_requests(path)            # rows appended meanwhile are kept
                for i in marks:
                    if i < len(fresh) and fresh[i].get("file") == rows[i].get("file"):
                        fresh[i]["appliedAt"] = now
                locked_write_text(path, "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in fresh))
    return {"applied": applied, "unchanged": unchanged, "failed": failed, "files": sorted(pending)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batch", required=True, help="comma-separated place ids")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--repo", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    ids = [p.strip() for p in a.batch.split(",") if p.strip()]
    t0 = time.perf_counter()
    got = apply_batch(ids, a.repo.resolve(), a.dry_run)
    for pid, i, err in got["failed"]:
        print(f"apply_requests: FAILED {pid} row {i + 1}: {err}", file=sys.stderr)
    verb = "would apply" if a.dry_run else "applied"
    print(f"apply_requests: {verb} {got['applied']} row(s), {got['unchanged']} already present, "
          f"{len(got['failed'])} failed, {len(got['files'])} file(s), {time.perf_counter() - t0:.2f} s")
    return 1 if got["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
