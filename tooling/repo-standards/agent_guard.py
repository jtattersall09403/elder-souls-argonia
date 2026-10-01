#!/usr/bin/env python3
"""PreToolUse hook for subagents (decision 0118): a lead only plans.

Walk-7 leads ran 0 children, 2,511 turns, 53.4 units (method review r6).
agent_type `lead`: Edit/Write/MultiEdit/NotebookEdit outside tooling/.reports/
and build/test/publish Bash commands are refused.

Every other agent and the planner (no agent_id) are never touched. Not wired,
or any error: allows.
"""
import json, os, re, sys

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
REPORTS = "tooling/.reports/"
LEAD_WORK = re.compile(
    r"\bwb\.py\b|\bpytest\b|\bnpm\s+(test\b|run\s+(\S*:)?\S*(test|build|publish|compile|export|preflight|look)\S*)"
    r"|\bjob_guard\.sh\b|\bblender\b|\bnode\s+\S*(build|publish|compile|export)\S*\.mjs")


def under_reports(p):
    return REPORTS in str(p or "").replace(os.sep, "/")


def decide(d):
    """(exit code, message)."""
    if not d.get("agent_id") or (d.get("agent_type") or "").lower() != "lead":
        return 0, ""
    tool, inp = d.get("tool_name", ""), d.get("tool_input") or {}
    if tool in EDIT_TOOLS and not under_reports(inp.get("file_path") or inp.get("notebook_path")):
        return 2, ("[agent guard, decision 0118] a lead never edits: brief a `deliver`, `deliver-small` or "
                   "`place-builder` agent with the files, mechanism and check; integrate by reading its report. "
                   "Only your own report under tooling/.reports/ is yours to write.\n")
    if tool == "Bash" and LEAD_WORK.search(inp.get("command", "")):
        return 2, ("[agent guard, decision 0118] a lead runs no build, test or publish job (wb.py, pytest, "
                   "npm test/build/publish, job_guard, blender): send it to a `run` agent and verify from its "
                   "pass/fail lines; a look-up goes to `find`.\n")
    return 0, ""


def main():
    try:
        code, msg = decide(json.load(sys.stdin))
    except Exception:
        return 0
    if code == 2:
        sys.stderr.write(msg)
    return code


if __name__ == "__main__":
    sys.exit(main())
