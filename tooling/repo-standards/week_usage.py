#!/usr/bin/env python3
"""This week's usage against the weekly subscription limit (decision 0118).

The weekly limit resets at a fixed time (`weekly_limit.json` `resetWeekday`,
`resetHourUTC`: the harness message "resets Oct 2, 5am (UTC)"). Usage is the
cost units (session_tokens.WEIGHT, in millions) of every assistant record in
this repo's transcripts (planners, subagents, Workflow agents) since the last
reset. `limitUnits` was calibrated from the week the limit was hit: the units
from that week's reset to the refusal (`calibratedFrom`). It meters this repo
only; the owner's other Claude use is not seen, so the share is a floor.

Incremental: a cache under $ES_WEEK_CACHE (default /tmp/es-week-usage.json)
keeps each transcript's byte offset and units, so a call re-reads only what
was appended (a hook can afford it). Any error returns None.

    python3 tooling/repo-standards/week_usage.py              # used / limit / share
    python3 tooling/repo-standards/week_usage.py --between 2026-09-25T05:00Z 2026-09-30T22:15Z
"""
import datetime as dt, glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lane_resume import project_dir  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "weekly_limit.json")
CACHE = os.environ.get("ES_WEEK_CACHE", "/tmp/es-week-usage.json")
WEIGHT = {"cache_read_input_tokens": 0.1, "cache_creation_input_tokens": 2.0,
          "input_tokens": 1.0, "output_tokens": 5.0}  # session_tokens.WEIGHT, raw usage keys
TS = re.compile(r'"timestamp":"([^"]+)"')


def _ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def week_start(now=None, cfg=None):
    cfg = cfg or json.load(open(CONFIG))
    now = dt.datetime.fromtimestamp(now or dt.datetime.now().timestamp(), dt.timezone.utc)
    start = now.replace(hour=cfg["resetHourUTC"], minute=0, second=0, microsecond=0)
    start -= dt.timedelta(days=(start.weekday() - cfg["resetWeekday"]) % 7)
    if start > now:
        start -= dt.timedelta(days=7)
    return start.timestamp()


def _record_units(d):
    u = (d.get("message") or {}).get("usage") or {}
    return sum(u.get(k, 0) * w for k, w in WEIGHT.items()) / 1e6


def scan(path, since, until, state):
    """Fold `path` from state['off'] on; state keeps units, last id/units."""
    with open(path, "rb") as f:
        f.seek(state.get("off", 0))
        for raw in f:
            if not raw.endswith(b"\n"):
                break  # a line still being written: next call reads it
            state["off"] = state.get("off", 0) + len(raw)
            line = raw.decode("utf-8", "replace")
            if '"usage"' not in line:
                continue
            m = TS.search(line)
            try:
                t = _ts(m.group(1)) if m else 0
                d = json.loads(line)
            except ValueError:
                continue
            if not (since <= t < until):
                continue
            mid, units = (d.get("message") or {}).get("id"), _record_units(d)
            if mid and mid == state.get("id"):
                state["units"] = state.get("units", 0) + max(0.0, units - state.get("last", 0))
                state["last"] = max(units, state.get("last", 0))
            else:
                state["units"] = state.get("units", 0) + units
                state["id"], state["last"] = mid, units
    return state


def units_between(since, until, directory=None, cache_path=None):
    directory = directory or str(project_dir())
    cache = {}
    if cache_path:
        try:
            cache = json.load(open(cache_path))
        except (OSError, ValueError):
            cache = {}
        if cache.get("since") != since:
            cache = {"since": since, "files": {}}
    files = cache.setdefault("files", {})
    total = 0.0
    for p in glob.glob(os.path.join(directory, "**", "*.jsonl"), recursive=True):
        try:
            st = os.stat(p)
        except OSError:
            continue
        if st.st_mtime < since:
            continue
        s = files.get(p, {})
        if s.get("off", 0) > st.st_size:
            s = {}
        if s.get("off", 0) < st.st_size:
            s = scan(p, since, until, s)
        files[p] = s
        total += s.get("units", 0)
    if cache_path:
        tmp = cache_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(cache, f)
        os.replace(tmp, cache_path)
    return total


def week_share(now=None, directory=None):
    """(used units, limit units, share 0..1) since the last reset; None on any error."""
    try:
        cfg = json.load(open(CONFIG))
        since = week_start(now, cfg)
        used = units_between(since, float("inf"), directory, CACHE)
        return used, cfg["limitUnits"], used / cfg["limitUnits"]
    except Exception:
        return None


def main():
    if "--between" in sys.argv:
        i = sys.argv.index("--between")
        a, b = _ts(sys.argv[i + 1]), _ts(sys.argv[i + 2])
        print(f"{units_between(a, b):.1f} units")
        return 0
    r = week_share()
    if r is None:
        print("week usage: unavailable")
        return 1
    print(f"week usage: {r[0]:.1f} of {r[1]:.0f} units ({100 * r[2]:.0f} %) since the weekly reset")
    return 0


if __name__ == "__main__":
    sys.exit(main())
