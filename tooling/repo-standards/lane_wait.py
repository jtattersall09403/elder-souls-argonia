#!/usr/bin/env python3
"""lane_wait.py (decision 0118 rule 8): a lead's foreground wait on its children.

A lead launches its children in the background, each told to write its report
file last, then calls this script in the foreground and re-calls it on every
`timeout` line until `all done`. The lead never ends its turn while a child
runs, so the harness never treats it as finished and the children's reports
reach the lead, not the planner. The shell guard refuses `sleep` and poll
loops; this script is the sanctioned wait.

    python3 tooling/repo-standards/lane_wait.py --files A.md B.md [--timeout 540] [--poll 5]

A file is done when it exists and has not been modified for 3 s (its writer
finished). Prints `done <path>` / `waiting <path>` per file, then `all done`
or `timeout: N of M done`. Exit 0 in both cases: a timeout is a normal
re-call. The default timeout stays under the 600 s foreground Bash cap.
"""
import argparse
import os
import time

SETTLE_S = 3.0


def is_done(path, now):
    try:
        return now - os.stat(path).st_mtime >= SETTLE_S
    except OSError:
        return False


def wait(files, timeout, poll):
    deadline = time.monotonic() + timeout
    while True:
        states = [is_done(f, time.time()) for f in files]
        if all(states) or time.monotonic() >= deadline:
            return states
        time.sleep(min(poll, max(0.0, deadline - time.monotonic())))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--files", nargs="+", required=True, help="report files the children write last")
    ap.add_argument("--timeout", type=float, default=540, help="seconds before returning (default 540)")
    ap.add_argument("--poll", type=float, default=5, help="seconds between checks (default 5)")
    args = ap.parse_args(argv)
    states = wait(args.files, args.timeout, args.poll)
    for f, ok in zip(args.files, states):
        print(("done " if ok else "waiting ") + f)
    n = sum(states)
    print("all done" if n == len(states) else f"timeout: {n} of {len(states)} done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
