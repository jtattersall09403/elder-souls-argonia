#!/usr/bin/env python3
"""Where do our Claude Code tokens go, and are the 0079 controls working?

Reads this repo's session transcripts (planner sessions and their subagents)
and reports three time windows side by side, so a drift shows as a trend,
not a guess.

    python3 tooling/repo-standards/session_tokens.py              # windows: last 7 d, previous 7 d, older
    python3 tooling/repo-standards/session_tokens.py --days 3     # window width in days
    python3 tooling/repo-standards/session_tokens.py --brief      # one line for the SessionStart hook
    python3 tooling/repo-standards/session_tokens.py --sessions 8 # also list the costliest sessions of the latest window

Numbers:
  cached/new/out   billed input classes of the PLANNER session (M tokens); cost ≈ turns × length,
                   so cached dominates and is the number to watch
  sub(model)       the subagents' own tokens, by model, from <session>/subagents/*.jsonl
  cost units       a relative weight: cached×0.1 + new×2 + uncached×1 + output×5 (Anthropic's
                   published price ratios), summed over planner + subagents; compare windows, not currencies
  planner shell    Bash calls typed by the planner; explore = look-around commands; sleeps; guard = hook refusals
  context sources  share of what the planner carried (each result × the turns after it); images at a
                   flat 1,600 tokens (how they are billed), text at bytes/4
Decision 0079 records the baseline these controls were measured against.
"""
import argparse, collections, datetime as dt, glob, json, os, sys

PROJ = os.path.expanduser(
    "~/.claude/projects/-home-analyticalplatform-workspace-elder-souls-dev-elder-souls-argonia")
import re
EXPLORE = re.compile(r"(^|[;&|]\s*)(rtk\s+)?(cat|head|tail|sed\s+-n|grep|rg|ls|find|tree|wc|"
                     r"git\s+(log|status|diff|show|grep)|python3?\s+-\s*<<|python3?\s+-c|jq|stat|du|file)\b")
# 1-hour cache TTL on this machine writes at 2x base (was 1.25, the 5-minute rate;
# owner-side cost model, 2026-09-22)
WEIGHT = {"cache_read": 0.1, "cache_create": 2.0, "input": 1.0, "output": 5.0}
BASELINE = {"cached": 111, "turns": 280, "shell": 68}  # per-session averages, 25 sessions before 0079 (2026-09-19)


def short_model(m):
    m = m or "?"
    for k in ("fable", "opus", "sonnet", "haiku"):
        if k in m:
            return k
    return m[:8]


def classify(name, inp):
    if name == "Bash":
        return "bash-explore" if EXPLORE.search(inp.get("command", "")) else "bash-do"
    if name == "Read":
        p = inp.get("file_path", "").lower()
        return "image" if p.endswith((".png", ".jpg", ".jpeg")) else ("read-doc" if p.endswith(".md") else "read-code")
    return name


class Calls:
    """Per-model-call usage for one transcript, folded by message.id.

    Claude Code writes one assistant record per content block (text, then the
    tool call), each repeating the whole call's usage, so summing records
    doubles every token count and turn count (a 38-call session reported as
    81 turns, owner 2026-09-22). `add(record)` folds a record in; `calls` is the
    list of {"cache_read","cache_create","input","output","model"} per call in
    order, and `total()` the summed Counter over the four token classes.
    """

    def __init__(self):
        self.calls, self._ids = [], {}

    def add(self, d):
        """Fold one transcript record; True when it carried usage."""
        m = d.get("message")
        if not isinstance(m, dict) or not m.get("usage"):
            return False
        x = m["usage"]
        u = {"cache_read": x.get("cache_read_input_tokens", 0),
             "cache_create": x.get("cache_creation_input_tokens", 0),
             "input": x.get("input_tokens", 0), "output": x.get("output_tokens", 0),
             "model": short_model(m.get("model"))}
        mid = m.get("id")
        if mid and mid in self._ids:
            prev = self.calls[self._ids[mid]]  # a later record carries the fuller output count
            for k in ("cache_read", "cache_create", "input", "output"):
                prev[k] = max(prev[k], u[k])
            return False
        if mid:
            self._ids[mid] = len(self.calls)
        self.calls.append(u)
        return True

    def total(self):
        u = collections.Counter()
        for c in self.calls:
            for k in ("cache_read", "cache_create", "input", "output"):
                u[k] += c[k]
        return u

    def models(self):
        return collections.Counter(c["model"] for c in self.calls)


def usage_of(path):
    """Token classes and model counts for one transcript (planner or subagent)."""
    calls = Calls()
    for line in open(path, errors="replace"):
        if '"usage"' not in line:
            continue
        try:
            calls.add(json.loads(line))
        except ValueError:
            continue
    return calls.total(), calls.models()


def cost_units(u):
    return sum(u[k] * w for k, w in WEIGHT.items())


def read_session(path):
    sid = os.path.basename(path)[:-6]
    s = {"id": sid[:8], "turns": 0, "first": None, "last": None, "bash": 0, "explore": 0, "sleeps": 0, "guard": 0,
         "agents": collections.Counter(), "added": collections.Counter(), "carried": collections.Counter(),
         "planner": collections.Counter(), "sub": collections.Counter(), "sub_units": 0.0, "model": collections.Counter()}
    ids, turns, calls = {}, [], Calls()
    for line in open(path, errors="replace"):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        ts = d.get("timestamp")
        if ts:
            s["first"] = s["first"] or ts; s["last"] = ts
        m = d.get("message")
        if not isinstance(m, dict):
            continue
        if calls.add(d):
            s["turns"] += 1
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for x in c:
            t = x.get("type")
            if t == "tool_use":
                inp = x.get("input") or {}; k = classify(x["name"], inp); ids[x["id"]] = k
                if x["name"] == "Bash":
                    s["bash"] += 1; s["explore"] += k == "bash-explore"; s["sleeps"] += bool(re.search(r"\bsleep\s+\d", inp.get("command", "")))
                elif x["name"] == "Agent":
                    s["agents"][inp.get("subagent_type") or "(default)"] += 1
            elif t == "tool_result":
                k = ids.get(x.get("tool_use_id"), "?"); body = json.dumps(x.get("content"))
                if "[shell guard" in body:
                    s["guard"] += 1
                tok = 1600 if k == "image" else len(body) / 4
                turns.append((s["turns"], k, tok))
    s["planner"] = calls.total(); s["model"] = calls.models()
    n = s["turns"]
    for at, k, tok in turns:
        s["added"][k] += tok; s["carried"][k] += tok * max(1, n - at)
    for sub in glob.glob(os.path.join(os.path.dirname(path), sid, "subagents", "*.jsonl")):
        u, models = usage_of(sub)
        mdl = models.most_common(1)[0][0] if models else "?"
        s["sub"][mdl] += sum(u.values()); s["sub_units"] += cost_units(u)
    s["units"] = cost_units(s["planner"]) + s["sub_units"]
    return s


def when(s):
    return dt.datetime.fromisoformat(s["last"].replace("Z", "+00:00")) if s["last"] else None


def window_totals(directory, days, interactive_only=False):
    """Totals over the sessions whose last timestamp falls in the last `days` days.

    {"units": float, "turns": int, "sessions": int}. With interactive_only the
    measure is the planner's OWN usage — transcripts whose top-level
    `entrypoint` is "cli", main-chain records only, no subagent transcripts —
    which is what the weekly limit the owner watches meters. Without it,
    interactive and headless alike plus subagents, the set the report's newest
    window counts. Used by session_switch.py to express a saving as a share of
    the weekly usage.
    """
    cut = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    units, turns, n = 0.0, 0, 0
    for f in glob.glob(os.path.join(directory, "*.jsonl")):
        calls = Calls(); last = None; entry = None
        try:
            for line in open(f, errors="replace"):
                if entry is not None and '"usage"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                entry = entry or d.get("entrypoint")
                if interactive_only and d.get("isSidechain"):
                    continue
                if calls.add(d):
                    last = d.get("timestamp") or last
        except OSError:
            continue
        u, nturns = calls.total(), len(calls.calls)
        if interactive_only and entry != "cli":
            continue
        if not last or dt.datetime.fromisoformat(last.replace("Z", "+00:00")) <= cut:
            continue
        sub_units = 0.0
        if not interactive_only:
            sid = os.path.basename(f)[:-6]
            for sub in glob.glob(os.path.join(directory, sid, "subagents", "*.jsonl")):
                sub_units += cost_units(usage_of(sub)[0])
        units += cost_units(u) + sub_units; turns += nturns; n += 1
    return {"units": units, "turns": turns, "sessions": n}


def summarise(rows):
    n = len(rows) or 1
    agg = {"sessions": len(rows), "turns": sum(r["turns"] for r in rows) / n,
           "cached": sum(r["planner"]["cache_read"] for r in rows) / n / 1e6,
           "new": sum(r["planner"]["cache_create"] + r["planner"]["input"] for r in rows) / n / 1e6,
           "out": sum(r["planner"]["output"] for r in rows) / n / 1e6,
           "units": sum(r["units"] for r in rows) / n / 1e6,
           "bash": sum(r["bash"] for r in rows) / n, "explore": sum(r["explore"] for r in rows) / n,
           "sleeps": sum(r["sleeps"] for r in rows), "guard": sum(r["guard"] for r in rows)}
    sub = collections.Counter(); agents = collections.Counter(); carried = collections.Counter()
    for r in rows:
        sub.update(r["sub"]); agents.update(r["agents"]); carried.update(r["carried"])
    agg["sub"] = {k: v / n / 1e6 for k, v in sub.items()}
    agg["agents"] = dict(agents)
    tot = sum(carried.values()) or 1
    agg["shares"] = {k: 100 * v / tot for k, v in carried.most_common()}
    agg["shell"] = agg["shares"].get("bash-do", 0) + agg["shares"].get("bash-explore", 0)
    return agg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=PROJ)
    ap.add_argument("--days", type=float, default=7, help="window width in days (default 7)")
    ap.add_argument("--min-turns", type=int, default=20, help="ignore sessions shorter than this")
    ap.add_argument("--sessions", type=int, default=0, help="list the N costliest sessions of the latest window")
    ap.add_argument("--brief", action="store_true", help="one line for the SessionStart hook (last 10 sessions)")
    ap.add_argument("--last", type=int, default=10, help="with --brief: how many recent sessions")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.dir, "*.jsonl")), key=os.path.getmtime)
    if not files:
        sys.exit(f"no transcripts under {a.dir}")
    rows = [s for s in (read_session(f) for f in files) if s["turns"] >= a.min_turns and s["last"]]

    if a.brief:
        recent = rows[-a.last:]
        if not recent:
            return
        g = summarise(recent)
        print(f"[token report, decision 0079] last {len(recent)} sessions: avg {g['cached']:.0f}M cached input, "
              f"{g['turns']:.0f} turns, shell {g['shell']:.0f}% of carried context, planner shell {g['bash']:.0f}/session, "
              f"{g['sleeps']} sleeps, {g['guard']} guard refusals "
              f"(baseline {BASELINE['cached']}M, {BASELINE['turns']} turns, {BASELINE['shell']}%). "
              f"Full report: python3 tooling/repo-standards/session_tokens.py")
        return

    now = dt.datetime.now(dt.timezone.utc); w = dt.timedelta(days=a.days)
    windows = [(f"last {a.days:g} d", [r for r in rows if when(r) > now - w]),
               (f"previous {a.days:g} d", [r for r in rows if now - 2 * w < when(r) <= now - w]),
               ("older", [r for r in rows if when(r) <= now - 2 * w])]
    print(f"{len(rows)} sessions with >= {a.min_turns} turns; per-session averages unless marked total\n")
    hdr = f"{'':22s}" + "".join(f"{name:>16s}" for name, _ in windows)
    print(hdr)
    G = [(name, summarise(r)) for name, r in windows]
    def line(label, key, fmt="{:.1f}"):
        print(f"{label:22s}" + "".join(f"{fmt.format(g[key]) if g['sessions'] else '-':>16s}" for _, g in G))
    line("sessions", "sessions", "{:.0f}"); line("turns", "turns", "{:.0f}")
    line("planner cached (M)", "cached", "{:.0f}"); line("planner new (M)", "new"); line("planner output (M)", "out", "{:.2f}")
    line("cost units (M)", "units", "{:.1f}")
    for mdl in ("fable", "opus", "sonnet", "haiku"):
        print(f"{'sub '+mdl+' tokens (M)':22s}" + "".join(f"{g['sub'].get(mdl, 0):16.1f}" if g["sessions"] else f"{'-':>16s}" for _, g in G))
    line("planner shell calls", "bash"); line("  of which explore", "explore")
    line("sleeps (total)", "sleeps", "{:.0f}"); line("guard refusals (total)", "guard", "{:.0f}")
    print(f"{'agent calls (total)':22s}" + "".join(f"{sum(g['agents'].values()):16d}" for _, g in G))
    print(f"{'  by type':22s}" + "".join(f"{','.join(f'{k}:{v}' for k, v in sorted(g['agents'].items(), key=lambda kv: -kv[1])[:4]):>16s}" for _, g in G))
    print("\ncontext carried by the planner, share by source")
    keys = ["bash-do", "bash-explore", "read-code", "read-doc", "image", "Agent"]
    for k in keys:
        print(f"{'  '+k:22s}" + "".join(f"{g['shares'].get(k, 0):15.1f}%" if g["sessions"] else f"{'-':>16s}" for _, g in G))
    print(f"\nbaseline before 0079 (25 sessions): {BASELINE['cached']}M cached, {BASELINE['turns']} turns, shell {BASELINE['shell']}%")
    if a.sessions:
        latest = sorted(windows[0][1], key=lambda r: -r["units"])[:a.sessions]
        print(f"\ncostliest sessions, {windows[0][0]}:  id  turns  cached(M)  units(M)  shell/explore/sleeps/guard  agents")
        for r in latest:
            ag = ",".join(f"{k}:{v}" for k, v in r["agents"].most_common(3))
            print(f"  {r['id']}  {r['turns']:5d}  {r['planner']['cache_read']/1e6:9.1f}  {r['units']/1e6:8.1f}  "
                  f"{r['bash']:3d}/{r['explore']:3d}/{r['sleeps']:2d}/{r['guard']:2d}  {ag}")


if __name__ == "__main__":
    main()
