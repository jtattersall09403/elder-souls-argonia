#!/usr/bin/env python3
"""When is continuing this session dearer than starting a fresh one?

Decision 0079: the bill is turns x context. Every turn re-reads the whole
context at the cached rate, so a long session gets steadily dearer per turn; a
fresh session pays a one-off orientation cost and then each turn is cheaper. This
Stop hook reports the break-even in turns, and the cost of not switching as a
share of last week's usage (owner 2026-09-22: couched in weekly usage). That
week is the planner's own interactive usage — the limit the owner watches —
with subagent and headless (`claude -p`) usage excluded.

Cost units are fresh-input-token equivalents under WEIGHT (a cached read counts
0.1, a cache write 2, an output token 5) — the rule of thumb for how the weekly
limit is metered.

    python3 tooling/repo-standards/session_switch.py            # hook mode (stdin JSON)
    python3 tooling/repo-standards/session_switch.py --report   # numbers + baseline table
"""
import argparse, glob, json, math, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_tokens import PROJ, WEIGHT, Calls, cost_units, window_totals  # one cost model, one project path

# Only interactive planner sessions belong in the baseline, and only an
# interactive planner session is advised by the hook. "sdk-cli" is the
# headless entrypoint (the code-review gate, `claude -p`); "cli" is a real session.
INTERACTIVE_ENTRYPOINT = "cli"
CACHE_TTL = 3600  # seconds a cached baseline stays usable in hook mode


def turns_of(path):
    """(per-turn usage dicts, entrypoint). One entry per model call on the main chain.

    Claude Code writes one assistant record per content block (text, then the
    tool call), each carrying the whole call's usage, so records must be folded
    by message.id: counting records doubled the turn count, the orientation
    window and every baseline sum (the 16h session's "turn 79" was 38 calls,
    owner 2026-09-22). session_tokens.usage_of aggregates a whole transcript, so
    it cannot serve the per-turn shape this tool needs; the field names and cost
    weights are shared.
    """
    calls, entry = Calls(), None
    for line in open(path, errors="replace"):
        if entry is not None and '"usage"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        entry = entry or d.get("entrypoint")
        if d.get("isSidechain"):
            continue
        calls.add(d)
    return calls.calls, entry


def context(u):
    return u["input"] + u["cache_read"] + u["cache_create"]


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


FRESH_WINDOW = 10  # turns after orientation that define a fresh session's per-turn cost
# the projection runs over a typical session's length (baseline median calls, floor
# below): a fixed 100 was ~2.5 sessions once turns were counted per call, and made
# every young session look worth leaving (owner 2026-09-22)
HORIZON_MIN = 20
# leaving costs turns too: PROGRESS row, Starting state, pathspec commits, the
# preflight hand-off. Charged at this session's per-turn cost on the switch side.
HANDOFF_TURNS = 4
# a resume or compaction re-writes the whole context once; the median over 15
# turns lets that one-off drop out (owner session 2026-09-22)
NOW_WINDOW = 15


def baseline(directory, exclude, count, orient):
    """(medians dict, rows) over other recent interactive transcripts.

    A session qualifies only with at least max(20, orient + FRESH_WINDOW) turns, so
    both the orientation window and the fresh-per-turn window sit inside the session.
    """
    files = sorted(glob.glob(os.path.join(directory, "*.jsonl")), key=os.path.getmtime, reverse=True)
    rows = []
    need = max(20, orient + FRESH_WINDOW)
    for f in files:
        if os.path.abspath(f) == os.path.abspath(exclude or ""):
            continue
        t, entry = turns_of(f)
        if len(t) < need or entry != INTERACTIVE_ENTRYPOINT:
            continue
        rows.append({"id": os.path.basename(f)[:8],
                     "O": sum(cost_units(u) for u in t[:orient]),
                     "C_fresh": context(t[orient - 1]),
                     "fresh_per_turn": median([cost_units(u) for u in t[orient:orient + FRESH_WINDOW]]),
                     "turns": len(t)})
        if len(rows) >= count:
            break
    if len(rows) < 3:
        return None, rows
    return {"O": median([r["O"] for r in rows]),
            "C_fresh": median([r["C_fresh"] for r in rows]),
            "fresh_per_turn": median([r["fresh_per_turn"] for r in rows]),
            "median_turns": median([r["turns"] for r in rows])}, rows


def assess(t, transcript, directory, orient, count, cached=None):
    # A session still inside its own orientation + fresh window IS the fresh
    # session; its early turns carry the one-off cache writes (system prompt,
    # CLAUDE.md, orientation reads at 2x) that a steady-state baseline never
    # shows, so any comparison before this point misreads a new session as dear
    # (fired at turn 3 and turn 19 of fresh sessions, 2026-09-22).
    if not t or len(t) < orient + FRESH_WINDOW:
        return None
    # the context this session carries: a median over the same window as the
    # per-turn cost, so a compaction or resume re-write is a one-off, not the reading
    C_now = median([context(u) for u in t[-NOW_WINDOW:]])
    if cached and cached.get("week") is not None:
        base, rows, week = cached, [], cached["week"]
    else:
        base, rows = baseline(directory, transcript, count, orient)
        week = window_totals(directory, 7, interactive_only=True)["units"]
    if base is None:
        return None
    O, C_fresh = base["O"], base["C_fresh"]
    fresh_per_turn = base["fresh_per_turn"]
    # Decision 0083: the only thing a switch saves is re-reading the excess
    # context every turn, at the cached rate. Cache writes and output are the
    # work itself and cost the same in either session, so they are not the
    # difference; subtracting whole per-turn costs (the earlier code) made a
    # fresh session's own cache writes look like a reason to leave it.
    s = (C_now - C_fresh) * WEIGHT["cache_read"]
    now_per_turn = fresh_per_turn + s
    # what a switch costs: the fresh session's orientation plus the hand-off
    # turns this session spends leaving the tree ready. Only the excess-context
    # saving can repay it, so B is the number of further planner turns the chunk
    # must still need before leaving pays; whether it needs them is the
    # planner's call, not this tool's (owner 2026-09-22).
    switch = O + HANDOFF_TURNS * now_per_turn
    B = math.ceil(switch / s) if s > 0 else None
    horizon = max(HORIZON_MIN, int(base["median_turns"]))
    cont = horizon * now_per_turn
    fresh = horizon * fresh_per_turn + switch
    return {"turns": len(t), "C_now": C_now, "C_fresh": C_fresh, "O": O, "s": s, "B": B,
            "switch": switch, "horizon": horizon,
            "now_per_turn": now_per_turn, "fresh_per_turn": fresh_per_turn,
            "median_turns": base["median_turns"], "cont": cont, "fresh": fresh,
            "week": week, "rows": rows}


def band_of(B):
    if B is None:
        return None
    if B <= 8:
        return "now"
    if B <= 20:
        return "soon"
    return None


ADVICE = {"now": "a switch pays back within {B} more planner turns: switch at the next commit "
                 "unless the chunk is nearly done",
          "soon": "a switch pays back after {B} more planner turns: worth it at the next natural "
                  "break (commit or hand-off) only if the chunk still needs more than that"}


# What the planner is told alongside the owner's warning (owner 2026-09-22): the
# tool cannot see how much of the chunk is left, so the planner judges B against
# the work remaining; if it leaves, it leaves the tree ready for a fresh agent and
# hands the owner the one-line invocation, on a turn that does work, never a turn
# of its own.
HANDOFF = (" Planner: judge this against the planner turns this chunk still needs (subagent "
           "work does not count; a job you can finish in fewer turns than the pay-back stays "
           "here). If you do switch, before you end this turn leave everything set up so a "
           "fresh agent continues seamlessly from a short instruction (PROGRESS.md row current, "
           "the active brief's Starting state rewritten, finished parts committed by pathspec, "
           "open steps and blockers recorded where the brief says). Then tell the owner, in "
           "plain English, the exact one-line instruction to start the next session with "
           "(e.g. 'continue phase 12 delivery', 'continue renderer lane in line with my "
           "feedback below'). Do this on the turn you are on; never spend a turn on it alone.")


def message(a, band):
    week = a["week"]
    cont_share = (f" ({a['cont']/week*100:.1f}% of last week's Fable usage)" if week else "")
    fresh_share = (f" ({a['fresh']/week*100:.1f}%)" if week else "")
    return (f"[session-switch] each turn here costs ~{a['now_per_turn']/1000:.1f}k units, "
            f"{a['now_per_turn']/a['fresh_per_turn']:.1f}x a fresh-session turn "
            f"(context {a['C_now']/1000:.0f}k). Over a typical session ({a['horizon']} turns) that is "
            f"~{a['cont']/1e6:.2f}M units here{cont_share} vs ~{a['fresh']/1e6:.2f}M{fresh_share} "
            f"in a fresh session including re-orientation and the hand-off. "
            f"{ADVICE[band].format(B=a['B'])}. (turn {a['turns']})")


def newest(directory):
    files = sorted(glob.glob(os.path.join(directory, "*.jsonl")), key=os.path.getmtime)
    return files[-1] if files else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--transcript")
    ap.add_argument("--dir", default=PROJ)
    ap.add_argument("--orient-turns", type=int, default=8)
    ap.add_argument("--baseline-sessions", type=int, default=10)
    a = ap.parse_args()

    if a.report:
        path = a.transcript or newest(a.dir)
        if not path:
            sys.exit(f"no transcripts under {a.dir}")
        t, _ = turns_of(path)
        r = assess(t, path, a.dir, a.orient_turns, a.baseline_sessions)
        if not r:
            sys.exit(f"not enough baseline sessions (need 3 interactive ones with "
                     f">= {max(20, a.orient_turns + FRESH_WINDOW)} turns)")
        print(f"current: {os.path.basename(path)[:8]}  turns {r['turns']}  "
              f"C_now {r['C_now']/1000:.1f}k  C_fresh {r['C_fresh']/1000:.1f}k  "
              f"O {r['O']/1000:.1f}k units  switch (O + {HANDOFF_TURNS} hand-off turns) {r['switch']/1000:.1f}k  "
              f"saving/turn {r['s']/1000:.1f}k units  "
              f"B {r['B'] if r['B'] else 'n/a (no saving)'}  (orient-turns {a.orient_turns})")
        print(f"per turn: now {r['now_per_turn']/1000:.1f}k units  fresh {r['fresh_per_turn']/1000:.1f}k units  "
              f"(median session {r['median_turns']:.0f})  "
              f"last 7 d {r['week']/1e6:.1f}M units (interactive planner)")
        print(f"next {r['horizon']} turns: continue ~{r['cont']/1e6:.2f}M units"
              + (f" ({r['cont']/r['week']*100:.1f}% of last 7 d)" if r["week"] else "")
              + f"  vs fresh ~{r['fresh']/1e6:.2f}M units"
              + (f" ({r['fresh']/r['week']*100:.1f}%)" if r["week"] else ""))
        print(f"\n{'session':10s}{'O (k units)':>14s}{'C_fresh (k)':>14s}{'fresh/turn (k)':>16s}{'turns':>8s}")
        for row in r["rows"]:
            print(f"{row['id']:10s}{row['O']/1000:14.1f}{row['C_fresh']/1000:14.1f}"
                  f"{row['fresh_per_turn']/1000:16.1f}{row['turns']:8d}")
        return

    # hook mode: a hook must never break a session, so everything below is guarded
    try:
        d = json.loads(sys.stdin.read() or "{}")
        if d.get("agent_id"):
            return
        path = d.get("transcript_path")
        sid = d.get("session_id") or "unknown"
        if not path or not os.path.exists(path):
            return
        t, entry = turns_of(path)
        # only the interactive planner session the owner is in; headless review
        # runs and `claude -p` never advise (owner 2026-09-22)
        if entry != INTERACTIVE_ENTRYPOINT:
            return
        state = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"session_switch_{sid}.json")
        prev = {}
        if os.path.exists(state):
            try:
                prev = json.load(open(state)) or {}
            except Exception:
                prev = {}
        b = prev.get("baseline") or {}
        reuse = (b.get("orient") == a.orient_turns and b.get("count") == a.baseline_sessions
                 and time.time() - b.get("computed_at", 0) < CACHE_TTL)
        r = assess(t, path, os.path.dirname(path) or a.dir, a.orient_turns, a.baseline_sessions,
                   cached=b if reuse else None)
        if not r:
            return
        if not reuse:
            b = {"O": r["O"], "C_fresh": r["C_fresh"], "fresh_per_turn": r["fresh_per_turn"],
                 "median_turns": r["median_turns"], "week": r["week"], "orient": a.orient_turns,
                 "count": a.baseline_sessions, "computed_at": time.time()}
        band = band_of(r["B"])
        last = prev.get("band")
        with open(state, "w") as fh:
            json.dump({"band": band, "baseline": b}, fh)
        if band is None or band == last:
            return
        msg = message(r, band)
        print(json.dumps({
            "systemMessage": msg,
            "hookSpecificOutput": {
                "hookEventName": "Stop",
                "additionalContext": msg + HANDOFF}}))
    except Exception:
        return


if __name__ == "__main__":
    main()
