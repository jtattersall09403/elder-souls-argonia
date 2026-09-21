#!/usr/bin/env python3
"""PostToolUse hook: lint player-facing prose the moment a file is saved.

Owner 2026-09-21: an agent should get a prose-lint hit in the same turn as
the edit, not at the gate. Runs after Edit/Write on any file under the
linted roots (world/sources, packages/text-catalogue) and, on hits, exits 2
with the hits on stderr so the editing agent (planner or subagent) sees
them as feedback and fixes them before moving on. Exemptions are the
linter's own (reasoned EXEMPT_DIRS/EXEMPT_KEYS in worldgen/lint_prose.py);
this script adds none. Silent and exit 0 on a clean file, a file outside
the roots, or any failure of its own (a broken hook never blocks work).
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROOTS = ("world/sources/", "packages/text-catalogue/")
WORLDGEN = os.path.join(ROOT, "tooling", "world-generation")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    path = (payload.get("tool_input") or {}).get("file_path") or ""
    if not path:
        return 0
    rel = os.path.relpath(os.path.abspath(path), ROOT).replace(os.sep, "/")
    if not rel.startswith(ROOTS) or not os.path.isfile(path):
        return 0
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "worldgen.lint_prose", "--file", path],
            cwd=WORLDGEN, capture_output=True, text=True, timeout=30,
        )
    except Exception:
        return 0
    if proc.returncode == 0:
        return 0
    hits = (proc.stdout or proc.stderr).strip()
    if not hits:
        return 0
    sys.stderr.write(
        "[prose lint, standard 8] this file is player-facing text and the "
        "edit introduced or left these hits; fix them now against "
        "docs/standards/text/style-guide.md (rule names below):\n" + hits + "\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
