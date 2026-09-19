#!/usr/bin/env python3
"""PreToolUse hook (decision 0079): the planner session may not type
exploratory or waiting shell commands; they belong to the `find` / `run`
agents. Subagents are exempt. Reads the hook JSON on stdin; exit 2 with a
reason on stderr blocks the call and shows the reason to the model.

Set SHELL_GUARD_LOG=1 in the environment to append each decision to
/tmp/shell_guard.log (debugging only).
"""
import json, os, re, sys

BLOCK = re.compile(
    r"(^|[;&|]\s*)(rtk\s+)?("
    r"cat|head|tail|less|more|sed\s+-n|grep|rg|egrep|fgrep|ag|find|tree|"
    r"git\s+(diff|show|grep|blame)|git\s+log(?!\s+-1\b)|"
    r"sleep|"
    r"python3?\s+-\s*<<|python3?\s+-c\s"
    r")\b")


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        return 0
    if d.get("tool_name") != "Bash":
        return 0
    cmd = (d.get("tool_input") or {}).get("command", "")
    # the harness adds agent_id/agent_type to a subagent's hook input (verified 2026-09-19)
    is_sub = bool(d.get("agent_id")) or bool(d.get("agent_type"))
    hit = BLOCK.search(cmd)
    if os.environ.get("SHELL_GUARD_LOG"):
        with open("/tmp/shell_guard.log", "a") as f:
            f.write(json.dumps({"sub": is_sub, "agent": d.get("agent_type"), "hit": bool(hit), "cmd": cmd[:80]}) + "\n")
    if is_sub or not hit:
        return 0
    word = hit.group(3).split()[0]
    sys.stderr.write(
        f"[shell guard, decision 0079] `{word}` is not run from the planner session. "
        "Looking things up (cat/grep/sed/find/git log|diff|show, inline python) goes to the `find` agent; "
        "a job that needs waiting goes to the `run` agent or run_in_background, never `sleep`. "
        "Ask the agent the question and act on its few-line answer.\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
