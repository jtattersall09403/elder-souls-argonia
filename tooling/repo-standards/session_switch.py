#!/usr/bin/env python3
"""What does a fresh session cost against this one? (decision 0083)

Runs as a UserPromptSubmit hook in the owner's interactive session only, so the
numbers ride the next instruction or wake and never force an extra model call.
Prices are in the planner's own usage (units: fresh-input-token equivalents,
session_tokens.WEIGHT); subagent usage is the same either way and is left out.

  one-off  = hand-off here (HANDOFF_CALLS calls, each re-reading the whole
             context, plus their writing) + orientation (what THIS session
             spent before its first work call: the fresh session pays it again)
  per step = every planner call re-reads its context at the cached rate:
             C_now x 0.1 here, C_fresh x 0.1 in a fresh session

The tool cannot see how much work is left, so it reports the one-off cost, the
saving per step and the break-even, and the planner prices the next part for
the owner at each check-in (the natural break, where a hand-off is short and
lossless). Past BIG_CONTEXT it also tells the owner, once, that every step is
now several times a fresh one.

    python3 tooling/repo-standards/session_switch.py              # hook mode (stdin JSON)
    python3 tooling/repo-standards/session_switch.py --report     # newest transcript, the table
    python3 tooling/repo-standards/session_switch.py --report --transcript X.jsonl
"""
import argparse, glob, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_tokens import PROJ, WEIGHT, Calls, cost_units  # one cost model, one project path

INTERACTIVE_ENTRYPOINT = "cli"  # "sdk-cli" is headless (`claude -p`, the review gate)
# leaving at a natural break: the PROGRESS row and the brief's Starting state are
# already current, so one call writes the last of them and one hands the owner the
# line. No commit, no tests, no preflight (owner 2026-09-23).
HANDOFF_CALLS = 2
BIG_CONTEXT = 300_000  # past this the owner is told once; each step is ~6x a fresh one
STEPS = (5, 10, 20, 40, 80)
WORK_TOOLS = {"Edit", "Write", "NotebookEdit", "Workflow"}
# subagents that do work; find/Explore/research only look, so they are orientation
WORK_AGENTS = {"deliver", "run", "preflight", "general-purpose", "claude", "fork"}


def is_prompt(d):
    """A main-chain user record that starts a turn: a typed prompt or a wake, not a tool result."""
    if d.get("type") != "user" or d.get("isMeta"):
        return False
    c = (d.get("message") or {}).get("content")
    if isinstance(c, str):
        return True
    if not isinstance(c, list):
        return False
    kinds = {b.get("type") for b in c if isinstance(b, dict)}
    return "tool_result" not in kinds and "text" in kinds


def starts_work(d):
    for b in (d.get("message") or {}).get("content") or []:
        if not isinstance(b, dict) or b.get("type") != "tool_use":
            continue
        if b.get("name") in WORK_TOOLS:
            return True
        if b.get("name") in ("Agent", "Task") and \
                (b.get("input") or {}).get("subagent_type", "general-purpose") in WORK_AGENTS:
            return True
    return False


def read_session(path):
    """Main-chain calls (folded by message.id), the call index each turn starts at,
    the index of the first work call (or None), and the entrypoint."""
    calls, turn_starts, work_at, entry = Calls(), [], None, None
    for line in open(path, errors="replace"):
        # tool results are most of the bytes and never start a turn
        if '"usage"' not in line and '"type":"tool_result"' in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        entry = entry or d.get("entrypoint")
        if d.get("isSidechain"):
            continue
        if is_prompt(d):
            turn_starts.append(len(calls.calls))
        elif d.get("type") == "assistant":
            calls.add(d)
            if work_at is None and calls.calls and starts_work(d):
                mid = (d.get("message") or {}).get("id")
                work_at = calls._ids.get(mid, len(calls.calls) - 1)
    return calls.calls, turn_starts, work_at, entry


def context(u):
    return u["input"] + u["cache_read"] + u["cache_create"]


def assess(calls, turn_starts, work_at):
    """One-off switch cost, per-step prices and break-even; None while still orienting."""
    if not calls:
        return None
    first_turn_end = next((s for s in turn_starts if s > 0), len(calls))
    orient_end = min(work_at if work_at is not None else len(calls), first_turn_end)
    if orient_end < 1 or orient_end >= len(calls):
        return None  # no work since orientation yet: this session is the fresh one
    bounds = [s for s in turn_starts if s <= len(calls)] + [len(calls)]
    sizes = [b - a for a, b in zip(bounds, bounds[1:]) if b > a]
    later = sizes[1:] or sizes  # the first turn carries orientation
    n = sum(later) / len(later)
    read = WEIGHT["cache_read"]

    last = calls[-1]
    C_now = context(last) + last["output"]  # the last reply joins the context
    C_fresh = context(calls[orient_end])    # what the first work call carried
    O = sum(cost_units(u) for u in calls[:orient_end])
    work_rest = [cost_units(u) - u["cache_read"] * read for u in calls[orient_end:]]
    per_call_work = sum(work_rest) / len(work_rest)  # writes + output of an average call here
    handoff = HANDOFF_CALLS * (C_now * read + per_call_work)
    stay_step, fresh_step = C_now * read, C_fresh * read
    saving = stay_step - fresh_step
    return {"calls": len(calls), "turns": len(sizes), "n": n, "C_now": C_now, "C_fresh": C_fresh,
            "O": O, "orient_calls": orient_end, "handoff": handoff, "one_off": handoff + O,
            "stay_step": stay_step, "fresh_step": fresh_step, "saving": saving,
            "break_even": math.ceil((handoff + O) / saving) if saving > 0 else None}


def k(x):
    return f"{x/1000:.0f}k"


def table(r, steps=STEPS):
    """'N steps: stay X / switch Y' per horizon."""
    return "; ".join(f"{s} steps: stay {k(s*r['stay_step'])} / switch {k(r['one_off'] + s*r['fresh_step'])}"
                     for s in steps)


def planner_line(r):
    be = f"even after ~{r['break_even']} planner steps" if r["break_even"] else "never pays back"
    line = (f"[session-switch] context {k(r['C_now'])}; a fresh session starts at {k(r['C_fresh'])}. "
            f"Switching costs ~{k(r['one_off'])} once (hand-off {HANDOFF_CALLS} steps + catch-up), "
            f"then saves ~{k(r['saving'])} per planner step: {be} (~{r['n']:.0f} steps per turn here). "
            f"{table(r)}. At the next owner check-in, price the next part with these numbers "
            f"(stay vs switch for the steps it needs) and let the owner choose; switch only at a "
            f"natural break, and hand off with the PROGRESS row and the brief's Starting state plus "
            f"the exact one-line instruction for the new session, no commit, tests or preflight.")
    if r["C_now"] >= BIG_CONTEXT:
        line += (f" This session is past {k(BIG_CONTEXT)}: each step costs "
                 f"{r['stay_step']/r['fresh_step']:.0f}x a fresh one. Bring the current work to the "
                 f"nearest sensible break, then hand off as above.")
    return line


def owner_line(r):
    return (f"[session-switch] This session is at {k(r['C_now'])} context: each step now costs "
            f"~{r['stay_step']/r['fresh_step']:.0f}x a fresh session's. Switching costs ~{k(r['one_off'])} "
            f"once and saves ~{k(r['saving'])} per step after that. The agent will hand over at the "
            f"nearest sensible break and give you the line for the new session.")


def newest(directory):
    files = sorted(glob.glob(os.path.join(directory, "*.jsonl")), key=os.path.getmtime)
    return files[-1] if files else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--transcript")
    ap.add_argument("--dir", default=PROJ)
    a = ap.parse_args()

    if a.report:
        path = a.transcript or newest(a.dir)
        if not path:
            sys.exit(f"no transcripts under {a.dir}")
        calls, starts, work_at, entry = read_session(path)
        r = assess(calls, starts, work_at)
        if not r:
            sys.exit(f"{os.path.basename(path)[:8]}: still orienting (or empty), nothing to compare")
        print(f"{os.path.basename(path)[:8]} ({entry}): {r['calls']} calls over {r['turns']} turns, "
              f"~{r['n']:.1f} calls/turn; oriented in {r['orient_calls']} calls")
        print(f"context now {k(r['C_now'])} (step {k(r['stay_step'])})  fresh {k(r['C_fresh'])} "
              f"(step {k(r['fresh_step'])})  saving/step {k(r['saving'])}")
        print(f"one-off {k(r['one_off'])} = hand-off {k(r['handoff'])} + orientation {k(r['O'])}  "
              f"-> break-even {r['break_even'] or 'never'} steps")
        for s in STEPS:
            stay, switch = s * r["stay_step"], r["one_off"] + s * r["fresh_step"]
            print(f"  {s:3d} steps left: stay {k(stay):>7s}  switch {k(switch):>7s}  "
                  f"{'switch' if switch < stay else 'stay'}")
        return

    # hook mode: a hook must never break a session, so everything below is guarded
    try:
        d = json.loads(sys.stdin.read() or "{}")
        if d.get("agent_id"):
            return
        path = d.get("transcript_path")
        if not path or not os.path.exists(path):
            return
        calls, starts, work_at, entry = read_session(path)
        if entry != INTERACTIVE_ENTRYPOINT:
            return
        r = assess(calls, starts, work_at)
        if not r:
            return
        out = {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                      "additionalContext": planner_line(r)}}
        big = r["C_now"] >= BIG_CONTEXT
        state = os.path.join(os.environ.get("TMPDIR", "/tmp"),
                             f"session_switch_{d.get('session_id') or 'unknown'}.json")
        try:
            was = json.load(open(state)).get("big", False)
        except Exception:
            was = False
        with open(state, "w") as fh:
            json.dump({"big": big}, fh)
        if big and not was:  # once per crossing; a compaction that drops it back re-arms it
            out["systemMessage"] = owner_line(r)
        print(json.dumps(out))
    except Exception:
        return


if __name__ == "__main__":
    main()
