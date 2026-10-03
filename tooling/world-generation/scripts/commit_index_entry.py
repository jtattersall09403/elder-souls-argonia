"""Commit ONE place's rows of the published index and ground sidecar.

A place publish rewrites `settlements/index.json` and `ground-overlays.json`
whole; other lanes' places in the same working-tree files may be mid-publish.
This takes HEAD's two files, replaces only `<place>`'s row in each with the
working tree's row (removing it when the working tree no longer has it), and
commits those two blobs plus any extra pathspecs, through a temporary git
index, so no other row and nothing else staged in the real index is touched.

    python3 tooling/world-generation/scripts/commit_index_entry.py <place-id> -m "msg" [-- extra paths]

The real index entries for the two files are moved to the new blobs when they
still equal the old HEAD's, so `git status` does not show a reverse change.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SETTLEMENTS_DIR = "apps/world-studio/public/province/settlements"
INDEX_PATH = f"{SETTLEMENTS_DIR}/index.json"
GROUND_PATH = f"{SETTLEMENTS_DIR}/ground-overlays.json"


def _dumps(doc: dict) -> bytes:
    """The published bytes (settlement_bundles.dumps): minified, key-sorted."""
    return json.dumps(doc, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"


def merge_rows(head: list[dict], work: list[dict], place: str) -> list[dict]:
    """HEAD's rows with `place`'s row replaced by the working tree's (removed
    when the working tree has none; inserted before the first HEAD row that
    follows it in the working tree's order when HEAD had none)."""
    new = next((r for r in work if r["id"] == place), None)
    rows = [dict(r) for r in head]
    at = next((i for i, r in enumerate(rows) if r["id"] == place), None)
    if new is None:
        return [r for r in rows if r["id"] != place]
    if at is not None:
        rows[at] = new
        return rows
    order = [r["id"] for r in work]
    later = set(order[order.index(place) + 1:])
    at = next((i for i, r in enumerate(rows) if r["id"] in later), len(rows))
    rows.insert(at, new)
    return rows


def merge_index(head: dict, work: dict, place: str) -> dict:
    return {**head, "places": merge_rows(head["places"], work["places"], place)}


def merge_ground(head: dict, work: dict, place: str) -> dict:
    return {**head, "settlements": merge_rows(head["settlements"], work["settlements"], place)}


def _git(repo: Path, *args: str, env: dict | None = None, data: bytes | None = None) -> bytes:
    out = subprocess.run(["git", "-C", str(repo), *args], input=data, capture_output=True,
                         env={**os.environ, **(env or {})})
    if out.returncode:
        raise RuntimeError(f"git {' '.join(args)}: {out.stderr.decode().strip()}")
    return out.stdout


def commit_entry(repo: Path, place: str, message: str, extras: list[str] = ()) -> str:
    """Build and make the commit; returns the new commit id."""
    blobs: dict[str, str] = {}
    for path, merge in ((INDEX_PATH, merge_index), (GROUND_PATH, merge_ground)):
        head_doc = json.loads(_git(repo, "show", f"HEAD:{path}"))
        work_doc = json.loads((repo / path).read_bytes())
        merged = merge(head_doc, work_doc, place)
        blobs[path] = _git(repo, "hash-object", "-w", "--stdin", data=_dumps(merged)).decode().strip()
    with tempfile.TemporaryDirectory() as tmp:
        env = {"GIT_INDEX_FILE": str(Path(tmp) / "index")}
        _git(repo, "read-tree", "HEAD", env=env)
        for path, blob in blobs.items():
            _git(repo, "update-index", "--add", "--cacheinfo", f"100644,{blob},{path}", env=env)
        if extras:
            _git(repo, "add", "-A", "--", *extras, env=env)
        before = _git(repo, "rev-parse", "HEAD").decode().strip()
        _git(repo, "commit", "-q", "-m", message, env=env)
    # keep the real index in step for every committed path it still holds at the old HEAD's state
    for line in _git(repo, "diff-tree", "-r", "--no-renames", before, "HEAD").decode().splitlines():
        meta, path = line.split("\t", 1)
        _, new_mode, old_sha, new_sha, _status = meta.lstrip(":").split()
        staged = _git(repo, "ls-files", "-s", "--", path).split()
        held = staged[1].decode() if len(staged) >= 2 else None
        if held != (None if set(old_sha) == {"0"} else old_sha):
            continue
        if set(new_sha) == {"0"}:
            _git(repo, "update-index", "--force-remove", "--", path)
        else:
            _git(repo, "update-index", "--add", "--cacheinfo", f"{new_mode},{new_sha},{path}")
    return _git(repo, "rev-parse", "HEAD").decode().strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("place")
    ap.add_argument("-m", "--message", required=True)
    ap.add_argument("--repo", type=Path, default=Path.cwd())
    ap.add_argument("extras", nargs="*", help="extra pathspecs committed with the two files")
    args = ap.parse_args()
    print(commit_entry(args.repo, args.place, args.message, args.extras))
    return 0


if __name__ == "__main__":
    sys.exit(main())
