#!/usr/bin/env python3
"""PreToolUse hook (decision 0106, owner 2026-09-28): the lean workflow is
the only workflow. Reads the hook JSON on stdin; exit 2 with the rule on
stderr refuses the call. Every check is a few git calls (< 1 s).

Bash:
  * `npm run preflight` with no `--paths` and no `--runner` is refused (the
    full run is `--runner`, once before a merge to main);
  * a preflight whose changed files under `--paths` are all docs, reports or
    rulings is refused (no test reads them; the prose linter does);
  * a preflight over the same pathspec, on the same HEAD, with the same
    changed files (path, size, mtime) as the last one is refused: once per
    batch; a commit or an edit under those paths lets it run again. The
    stamp is written by preflight.mjs through `--stamp` at the end of a run;
  * a FULL miner run (mine_abuts / mine_mounts / mine_designed_sink with no
    `--assets`, `--only`, `--set`, `--sample…`, `--rederive`,
    `--refresh-derived`, `--complete-only`, `--dump-meshes`) is refused unless it carries `--rule-change`: a
    piece joining the pool is mined with `--assets … --merge` in seconds.
Agent / Task / Workflow:
  * a call that launches a `deliver` lane is refused unless its prompt (or
    the Workflow script) carries a `Budget: <N> min` line.

Manual: `preflight_guard.py --stamp <true|false> <paths...>` writes the stamp.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.dirname(HERE))
STAMPS = os.path.join(ROOT, "tooling", ".reports", "preflight", "batch-stamps.json")

PROSE_ROOTS = ("docs/", "tooling/.reports/", ".claude/")
MINERS = re.compile(r"\bmine_(abuts|mounts|designed_sink)\b")
MINER_SCOPED = ("--assets", "--only", "--set", "--sample", "--rederive", "--refresh-derived",
                "--complete-only", "--dump-meshes", "--help", "-h")
BUDGET = re.compile(r"Budget:\s*\d+(\.\d+)?\s*min", re.I)
DELIVER = re.compile(r"""(subagent_type|agentType|agent_type|agent)["']?\s*[:=]\s*["']deliver["']""")


def is_prose(path: str) -> bool:
    """Docs, READMEs, reports and the rulings table: no test reads them."""
    name = path.rsplit("/", 1)[-1]
    return path.endswith(".md") or name.startswith("README") or path.startswith(PROSE_ROOTS)


def git(*args: str) -> list[str]:
    out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout
    return [line for line in out.split("\n") if line]


def changed(paths: list[str]) -> list[str]:
    return sorted(set(git("diff", "--name-only", "HEAD", "--", *paths))
                  | set(git("ls-files", "-o", "--exclude-standard", "--", *paths)))


def batch_key(paths: list[str]) -> str:
    return "\0".join(sorted(paths))


def fingerprint(paths: list[str]) -> str:
    """HEAD plus every changed file's path, size and mtime in the WHOLE tree:
    a fix outside the pathspec (a red on HEAD elsewhere) lets the run go again."""
    h = hashlib.sha256(("\n".join(git("rev-parse", "HEAD")) + "\0" + batch_key(paths)).encode())
    for f in changed(["."]):
        try:
            st = os.stat(os.path.join(ROOT, f))
            h.update(f"{f} {st.st_size} {st.st_mtime_ns}\n".encode())
        except OSError:
            h.update(f"{f} gone\n".encode())
    return h.hexdigest()[:16]


def read_stamps() -> dict:
    try:
        with open(STAMPS) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def write_stamp(paths: list[str], passed: bool) -> None:
    stamps = read_stamps()
    stamps[batch_key(paths)] = {"paths": sorted(paths), "fingerprint": fingerprint(paths),
                                "passed": passed}
    os.makedirs(os.path.dirname(STAMPS), exist_ok=True)
    tmp = STAMPS + f".{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(stamps, f, indent=1, sort_keys=True)
    os.replace(tmp, STAMPS)


def check_preflight(cmd: str) -> str | None:
    from review_gate import is_preflight_command, preflight_paths
    if not is_preflight_command(cmd):
        return None
    if "--runner" in cmd:
        return None
    if "--paths" not in cmd:
        return ("[0106] preflight is scoped: `npm run preflight -- --paths <the batch's paths>`, "
                "run once per commit batch by the planner's preflight agent; the full run is "
                "`npm run preflight -- --runner`, once before a merge to main.")
    paths = preflight_paths(cmd)
    if not paths:                       # a computed pathspec: preflight.mjs itself decides
        return None
    files = changed(paths)
    if files and all(is_prose(f) for f in files):
        return (f"[0106] no preflight for a docs-, report- or rulings-only batch ({len(files)} files, "
                "none read by a test): commit it; the prose linter (`npm run docs:check`) is its gate.")
    st = read_stamps().get(batch_key(paths))
    if st and st.get("fingerprint") == fingerprint(paths):
        verdict = "passed" if st.get("passed") else "failed"
        return (f"[0106] this pathspec was preflighted on this HEAD with these same files ({verdict}); "
                "once per batch: fix at source (an edit under the paths lets it run again) or commit.")
    return None


def check_miner(cmd: str) -> str | None:
    if not MINERS.search(cmd) or not re.search(r"python3?\b", cmd):
        return None
    tail = cmd[MINERS.search(cmd).end():]
    if any(re.search(rf"(^|\s){re.escape(flag)}(\s|=|$)", tail) for flag in (*MINER_SCOPED, "--rule-change")):
        return None
    if re.search(r"(^|\s)(--sample-max|--sample-seed)(\s|=|$)", tail):
        return None
    return ("[0106] a full miner run is only for a miner RULE change: add `--rule-change` and name it "
            "in the brief. A piece joining the pool is mined with `--assets <ids> --merge` (seconds).")


def _strings(value) -> list[str]:
    """Every string in the tool input, raw (json.dumps would escape quotes)."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    return []


def check_lane(tool_input: dict) -> str | None:
    text = "\n".join(_strings(tool_input))
    is_deliver = (tool_input.get("subagent_type") == "deliver") or bool(DELIVER.search(text))
    if not is_deliver or BUDGET.search(text):
        return None
    return ("[0106] a deliver lane carries a hard budget: add a `Budget: <N> min (hard)` line to its "
            "brief; at the stop the lane writes what is green and the next step, and returns.")


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--stamp":
        write_stamp(sys.argv[3:], sys.argv[2] == "true")
        return 0
    try:
        d = json.load(sys.stdin)
    except ValueError:
        return 0
    tool, tool_input = d.get("tool_name"), d.get("tool_input") or {}
    if tool == "Bash":
        cmd = tool_input.get("command", "")
        why = check_preflight(cmd) or check_miner(cmd)
    elif tool in ("Agent", "Task", "Workflow"):
        why = check_lane(tool_input)
    else:
        why = None
    if why:
        sys.stderr.write(why + "\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
