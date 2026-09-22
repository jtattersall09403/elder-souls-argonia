# 0083 — Tell the owner when a fresh session is cheaper than this one

Owner 2026-09-22. Extends 0079 (the bill is turns x context).

## Context

Every turn re-reads the whole session context at the cached rate, so a long
planner session gets steadily dearer per turn. A fresh session pays a one-off
orientation cost and then runs cheaper for every turn after it. Nobody was
measuring where those two lines cross, so the switch happened on a hunch.

## Decision

`tooling/repo-standards/session_switch.py` measures the crossing point and a
`Stop` hook reports it in the UI.

Cost units per turn, relative to the base input price = 1 (this machine uses
the 1-hour cache TTL): cache_read 0.1, cache_creation 2.0, input 1.0,
output 5.0. A turn is a main-chain assistant record carrying `message.usage`;
its context is input + cache_read + cache_creation.

The fresh-session baseline is the median over the last ten other transcripts
with at least 20 turns: `O` is the cost of their first eight turns, `C_fresh`
the context at turn eight. The saving per turn is
`(C_now - C_fresh) x 0.1`, and the break-even is `B = O / saving`, rounded up.
B <= 20 advises a switch at the next natural break; B <= 8 advises switching
now; above that, nothing is said.

A `Stop` hook fires once per turn and costs nothing in the planner's context:
`systemMessage` puts the line in front of the owner, `additionalContext` lets
the planner fold it into its next progress update rather than spending a turn.
It never fires for subagents, emits only when the band changes (state in
`$TMPDIR/session_switch_<id>.json`), and exits 0 on any error.

Tune with `python3 tooling/repo-standards/session_switch.py --report`, which
prints the current numbers and the baseline table with no band gating;
`--orient-turns` sets how much orientation a fresh session is assumed to need.

Owner 2026-09-22. The line the hook hands the planner also instructs it to
leave the tree ready for a fresh agent — a current PROGRESS row, the active
brief's Starting state rewritten, work committed by pathspec — and to give
the owner the exact one-line instruction that resumes the work (for example
"continue phase 12 delivery"). This rides on the current turn, the one
already carrying the hook's line into the planner's next progress update; it
never spends a turn of its own.
