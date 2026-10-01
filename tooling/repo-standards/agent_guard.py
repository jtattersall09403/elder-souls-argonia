#!/usr/bin/env python3
"""PreToolUse hook for subagents (decision 0118): an Opus agent is capped by
context, and a lead only plans.

1. Context cap. Method review r6: 14 Opus agents over 200 turns, carrying
   160k-290k tokens per turn, spent 112.6 of 276.5 units (41 %). The agent's
   own transcript (<project>/<session>/subagents/[workflows/<run>/]agent-<id>.jsonl,
   lane_resume.py's layout) gives its turn count (distinct assistant message ids).
   - at NUDGE_TURNS: the call runs, with a nudge to write the hand-off note
     and return;
   - at REFUSE_TURNS: every call is refused except a Write/Edit under
     tooling/.reports/ (the report), SubagentHandback and StructuredOutput.
   Applies to CAPPED types (the Opus tiers); find/run/deliver-small are cheap.
2. Leads never do the work (r6: walk-7 leads ran 0 children, 2,511 turns,
   53.4 units). agent_type `lead`: Edit/Write/MultiEdit/NotebookEdit outside
   tooling/.reports/ and build/test/publish Bash commands are refused.

The planner (no agent_id) is never touched. Not wired, or any error: allows.
"""
import glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

NUDGE_TURNS = 150
REFUSE_TURNS = 180
CAPPED = {"deliver", "place-builder", "lead", "research"}
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
# how an agent returns: SubagentHandback, or StructuredOutput for a Workflow agent with a schema
RETURN_TOOLS = {"SubagentHandback", "StructuredOutput"}
REPORTS = "tooling/.reports/"
LEAD_WORK = re.compile(
    r"\bwb\.py\b|\bpytest\b|\bnpm\s+(test\b|run\s+(\S*:)?\S*(test|build|publish|compile|export|preflight|look)\S*)"
    r"|\bjob_guard\.sh\b|\bblender\b|\bnode\s+\S*(build|publish|compile|export)\S*\.mjs")


def transcript(d):
    sid, aid = d.get("session_id"), d.get("agent_id")
    tp = d.get("transcript_path") or ""
    roots = [os.path.join(os.path.dirname(tp), sid)] if tp and sid else []
    if sid:
        from lane_resume import project_dir
        roots.append(os.path.join(str(project_dir()), sid))
    for r in roots:
        for p in (os.path.join(r, "subagents", f"agent-{aid}.jsonl"),
                  *glob.glob(os.path.join(r, "subagents", "workflows", "*", f"agent-{aid}.jsonl"))):
            if os.path.isfile(p):
                return p
    return None


MID = re.compile(rb'"id":\s*"(msg_[A-Za-z0-9_]+)"')
ASSISTANT = re.compile(rb'"type":\s*"assistant"')


def turns(path):
    """Distinct assistant message ids: one per model turn (a turn's blocks
    are written as several records sharing the id)."""
    ids = set()
    with open(path, "rb") as f:
        for line in f:
            if b"assistant" in line and ASSISTANT.search(line):
                m = MID.search(line)
                if m:
                    ids.add(m.group(1))
    return len(ids)


def under_reports(p):
    p = str(p or "")
    return REPORTS in p.replace(os.sep, "/")


def decide(d, n_turns=None):
    """(exit code, message)."""
    aid, kind = d.get("agent_id"), (d.get("agent_type") or "").lower()
    if not aid:
        return 0, ""
    tool, inp = d.get("tool_name", ""), d.get("tool_input") or {}
    if kind == "lead":
        if tool in EDIT_TOOLS and not under_reports(inp.get("file_path") or inp.get("notebook_path")):
            return 2, ("[agent guard, decision 0118] a lead never edits: brief a `deliver`, `deliver-small` or "
                       "`place-builder` agent with the files, mechanism and check; integrate by reading its report. "
                       "Only your own report under tooling/.reports/ is yours to write.\n")
        if tool == "Bash" and LEAD_WORK.search(inp.get("command", "")):
            return 2, ("[agent guard, decision 0118] a lead runs no build, test or publish job (wb.py, pytest, "
                       "npm test/build/publish, job_guard, blender): send it to a `run` agent and verify from its "
                       "pass/fail lines; a look-up goes to `find`.\n")
    if kind not in CAPPED:
        return 0, ""
    if n_turns is None:
        p = transcript(d)
        if not p:
            return 0, ""
        n_turns = turns(p)
    if n_turns >= REFUSE_TURNS:
        if tool in RETURN_TOOLS or (tool in EDIT_TOOLS and under_reports(inp.get("file_path"))):
            return 0, ""
        return 2, (f"[agent guard, decision 0118] {n_turns} turns: past the {REFUSE_TURNS}-turn context cap. "
                   "Write your hand-off note (what is green, the exact next step) to your report under "
                   "tooling/.reports/ and call SubagentHandback; a fresh agent continues from the note.\n")
    if n_turns >= NUDGE_TURNS:
        return 0, (f"[agent guard, decision 0118] {n_turns} turns: past the {NUDGE_TURNS}-turn nudge. Finish the "
                   "step in hand, write your hand-off note and return; a fresh agent continues from the note "
                   f"(tool calls are refused at {REFUSE_TURNS}).\n")
    return 0, ""


def main():
    try:
        d = json.load(sys.stdin)
        code, msg = decide(d)
    except Exception:
        return 0
    if code == 2:
        sys.stderr.write(msg)
        return 2
    if msg:
        # a nudge reaches the model as additional context; the call proceeds
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                 "additionalContext": msg.strip()}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
