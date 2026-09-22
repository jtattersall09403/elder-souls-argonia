#!/usr/bin/env python3
"""When is continuing this session dearer than starting a fresh one?

Decision 0079: the bill is turns x context. Every turn re-reads the whole
context at the cached rate, so a long session gets steadily dearer per turn; a
fresh session pays a one-off orientation cost and then each turn is cheaper. This
Stop hook reports the break-even in turns.

    python3 tooling/repo-standards/session_switch.py            # hook mode (stdin JSON)
    python3 tooling/repo-standards/session_switch.py --report   # numbers + baseline table
"""
import argparse, glob, json, math, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_tokens import PROJ, WEIGHT, cost_units  # one cost model, one project path

# Only interactive planner sessions belong in the baseline. "sdk-cli" is the
# headless entrypoint (the code-review gate, `claude -p`); "cli" is a real session.
INTERACTIVE_ENTRYPOINT = "cli"
CACHE_TTL = 3600  # seconds a cached baseline stays usable in hook mode


def turns_of(path):
    """(per-turn usage dicts, entrypoint). Main-chain assistant records with message.usage.

    session_tokens.usage_of aggregates a whole transcript, so it cannot serve the
    per-turn shape this tool needs; the field names and cost weights are shared.
    """
    out, entry = [], None
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
        m = d.get("message")
        if not isinstance(m, dict) or not m.get("usage"):
            continue
        x = m["usage"]
        out.append({"cache_read": x.get("cache_read_input_tokens", 0),
                    "cache_create": x.get("cache_creation_input_tokens", 0),
                    "input": x.get("input_tokens", 0),
                    "output": x.get("output_tokens", 0)})
    return out, entry


def context(u):
    return u["input"] + u["cache_read"] + u["cache_create"]


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def baseline(directory, exclude, count, orient):
    """(median O, median C_fresh, rows) over other recent interactive transcripts.

    A session qualifies only with at least max(20, orient) turns, so the orientation
    window always sits inside the session.
    """
    files = sorted(glob.glob(os.path.join(directory, "*.jsonl")), key=os.path.getmtime, reverse=True)
    rows = []
    need = max(20, orient)
    for f in files:
        if os.path.abspath(f) == os.path.abspath(exclude or ""):
            continue
        t, entry = turns_of(f)
        if len(t) < need or entry != INTERACTIVE_ENTRYPOINT:
            continue
        rows.append({"id": os.path.basename(f)[:8],
                     "O": sum(cost_units(u) for u in t[:orient]),
                     "C_fresh": context(t[orient - 1]),
                     "turns": len(t)})
        if len(rows) >= count:
            break
    if len(rows) < 3:
        return None, None, rows
    return median([r["O"] for r in rows]), median([r["C_fresh"] for r in rows]), rows


def assess(transcript, directory, orient, count, cached=None):
    t, _ = turns_of(transcript)
    if not t:
        return None
    C_now = context(t[-1])
    if cached:
        O, C_fresh, rows = cached["O"], cached["C_fresh"], []
    else:
        O, C_fresh, rows = baseline(directory, transcript, count, orient)
    if O is None:
        return None
    s = (C_now - C_fresh) * WEIGHT["cache_read"]
    B = math.ceil(O / s) if s > 0 else None
    return {"turns": len(t), "C_now": C_now, "C_fresh": C_fresh, "O": O, "s": s, "B": B, "rows": rows}


def band_of(B):
    if B is None:
        return None
    if B <= 8:
        return "now"
    if B <= 20:
        return "soon"
    return None


ADVICE = {"now": "switch now",
          "soon": "worth a switch at the next natural break (commit or hand-off)"}


# What the planner is told alongside the owner's warning (owner 2026-09-22): it
# leaves the tree ready for a fresh agent and hands the owner the one-line
# invocation that resumes the work, on a turn that does work, never a turn of its own.
HANDOFF = (" Planner: a fresh session is now cheaper. Before you end this turn, leave "
           "everything set up so a fresh agent continues seamlessly from a short instruction "
           "(PROGRESS.md row current, the active brief's Starting state rewritten, finished "
           "parts committed by pathspec, open steps and blockers recorded where the brief "
           "says). Then tell the owner, in plain English, the exact one-line instruction to "
           "start the next session with (e.g. 'continue phase 12 delivery', 'continue "
           "renderer lane in line with my feedback below'). Do this on the turn you are on; "
           "never spend a turn on it alone.")


def message(a, band):
    return (f"[session-switch] context now ~{a['C_now']/1000:.0f}k tokens vs "
            f"~{a['C_fresh']/1000:.0f}k after a fresh start; a new session pays for itself in "
            f"{a['B']} turns (orientation ~ {a['O']/1000:.0f}k cost units). {ADVICE[band]}. "
            f"(turn {a['turns']})")


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
        r = assess(path, a.dir, a.orient_turns, a.baseline_sessions)
        if not r:
            sys.exit(f"not enough baseline sessions (need 3 interactive ones with "
                     f">= {max(20, a.orient_turns)} turns)")
        print(f"current: {os.path.basename(path)[:8]}  turns {r['turns']}  "
              f"C_now {r['C_now']/1000:.1f}k  C_fresh {r['C_fresh']/1000:.1f}k  "
              f"O {r['O']/1000:.1f}k units  saving/turn {r['s']/1000:.1f}k units  "
              f"B {r['B'] if r['B'] else 'n/a (no saving)'}  (orient-turns {a.orient_turns})")
        print(f"\n{'session':10s}{'O (k units)':>14s}{'C_fresh (k)':>14s}{'turns':>8s}")
        for row in r["rows"]:
            print(f"{row['id']:10s}{row['O']/1000:14.1f}{row['C_fresh']/1000:14.1f}{row['turns']:8d}")
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
        r = assess(path, os.path.dirname(path) or a.dir, a.orient_turns, a.baseline_sessions,
                   cached=b if reuse else None)
        if not r:
            return
        if not reuse:
            b = {"O": r["O"], "C_fresh": r["C_fresh"], "orient": a.orient_turns,
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
