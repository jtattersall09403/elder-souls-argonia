"""Commit one place's own files, from its manifest (16k S12).

Parallel place builders share one worktree, so a whole-tree or whole-folder
commit carries another lane's half-made work. The exporter writes each
place's manifest (`tooling/.reports/16k/<place-id>/manifest.json`, lane 3A
contract 1: the place's bundle, its interior cells and its own source files);
this tool stages and commits exactly those files with a pathspec commit, and
refuses:

- a path the manifest does not list (when paths are named on the command line);
- a shared file (a zone catalogue, a yard set, a published kit sidecar, the
  lessons, the registers, the receipt, the published index, the signature
  claims...): those change only through REQUEST rows (`apply_requests`), so a
  manifest that lists one is wrong and the whole commit is refused;
- a path outside the repo, or one neither on disk nor tracked.

    python3 -m worldgen.commit_place --place <id> [--dry-run] [-m MSG] [PATH ...]
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
REPORTS = Path("tooling/.reports/16k")
MANIFEST_SCHEMA = 1
# Shared files: every place's builder may need to change them, so they change
# only through REQUEST rows applied by one integrator lane (method review r3
# finding E; place-build SKILL § Builders write only per-place files).
SHARED_PATTERNS = (
    "world/sources/catalogue/places-*.json",
    "world/sources/catalogue/type-recipes.json",
    "world/sources/placement/yard-sets/*",
    "world/sources/placement/accepted-places.json",
    "world/sources/placement/signature-claims.json",
    "world/sources/placement/register-digest.md",
    "world/sources/quests/*",
    "apps/world-studio/public/kits/*",
    "apps/world-studio/public/province/settlements/index.json",
    ".claude/skills/place-build/references/*",
    "docs/phases/16-foundation-and-places/build-ledger.jsonl",
    "docs/phases/P-polish/backlog.md",
    "*/lessons.md", "lessons.md",
    "*/creative-register.md",
)


def is_shared(path: str) -> bool:
    return any(fnmatch.fnmatchcase(path, pat) for pat in SHARED_PATTERNS)


def manifest_path(place_id: str, repo: Path = REPO_ROOT) -> Path:
    return repo / REPORTS / place_id / "manifest.json"


def load_manifest(place_id: str, repo: Path = REPO_ROOT) -> list[str]:
    path = manifest_path(place_id, repo)
    if not path.exists():
        raise SystemExit(f"commit_place: no manifest at {path.relative_to(repo)}; "
                         f"export the place with --places {place_id} first")
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != MANIFEST_SCHEMA or doc.get("placeId") != place_id \
            or not isinstance(doc.get("files"), list):
        raise SystemExit(f"commit_place: {path.relative_to(repo)} is not a schemaVersion "
                         f"{MANIFEST_SCHEMA} manifest for {place_id}")
    return list(doc["files"])


def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=check)


def plan(place_id: str, named: list[str], repo: Path = REPO_ROOT) -> tuple[list[str], list[str]]:
    """(paths to commit, refusals). Any refusal refuses the whole commit."""
    files = load_manifest(place_id, repo)
    listed = set(files)
    refusals = []
    for p in named:
        if p not in listed:
            refusals.append(f"{p}: not in {place_id}'s manifest")
    chosen = sorted(set(named) if named else listed)
    tracked = set(_git(repo, "ls-files", "--", *chosen).stdout.split()) if chosen else set()
    for p in chosen:
        if Path(p).is_absolute() or ".." in Path(p).parts:
            refusals.append(f"{p}: not a repo-relative path")
        elif is_shared(p):
            refusals.append(f"{p}: a shared file; change it through a REQUEST row "
                            f"(tooling/.reports/16k/{place_id}/requests.jsonl, apply_requests)")
        elif not (repo / p).exists() and p not in tracked:
            refusals.append(f"{p}: neither on disk nor tracked")
    return chosen, refusals


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--place", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("-m", "--message")
    ap.add_argument("--repo", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    ap.add_argument("paths", nargs="*", help="a subset of the manifest (default: all of it)")
    a = ap.parse_args(argv)
    repo = a.repo.resolve()
    chosen, refusals = plan(a.place, a.paths, repo)
    if refusals:
        for r in refusals:
            print(f"commit_place: REFUSED {r}", file=sys.stderr)
        return 2
    changed = [line[3:] for line in _git(repo, "status", "--porcelain", "--untracked-files=all",
                                         "--", *chosen).stdout.splitlines()] if chosen else []
    if not changed:
        print(f"commit_place: nothing to commit for {a.place} ({len(chosen)} manifest file(s) unchanged)")
        return 0
    msg = a.message or f"{a.place}: the place's own files, from its manifest (commit_place)"
    if a.dry_run:
        print(f"commit_place: would commit {len(changed)} changed of {len(chosen)} manifest file(s):")
        for p in changed:
            print(f"  {p}")
        return 0
    _git(repo, "add", "--", *chosen)
    got = _git(repo, "commit", "-m", msg, "--", *chosen, check=False)
    if got.returncode:
        print(f"commit_place: git commit failed: {(got.stdout + got.stderr).strip()[-600:]}",
              file=sys.stderr)
        return 1
    sha = _git(repo, "rev-parse", "--short", "HEAD").stdout.strip()
    print(f"commit_place: {sha} committed {len(changed)} file(s) for {a.place}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
