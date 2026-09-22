# 0083 — Tell the owner when a fresh session is cheaper than this one

Owner 2026-09-22. Extends 0079 (the bill is turns x context).

Every turn re-reads the whole session context at the cached rate, so a long
planner session gets dearer per turn; a fresh session pays a one-off
orientation cost and then runs cheaper. Nobody measured the crossing point.

`tooling/repo-standards/session_switch.py` measures it; a `Stop` hook reports it.

A turn's cost is in units — fresh-input-token equivalents, the rule of thumb
for how the weekly limit is metered: cached read 0.1, cache write 2 (the
1-hour TTL rate here), input 1, output 5. A turn is a main-chain assistant
record with `message.usage`; its context is input + cache_read +
cache_creation. That per-turn cost is compared with a fresh-session turn, and both are
projected over a fixed 100-turn horizon (no guess at how long the session
will actually run), reported as a share of the last 7 days of interactive
planner usage — Fable's own weekly limit, subagent and headless usage
excluded (`window_totals(..., interactive_only=True)`).

The fresh-session baseline is the median over the last ten other interactive
transcripts long enough to hold both windows: `O` is the cost of their first
eight turns, `C_fresh` the context at turn eight. The saving per turn is
`(C_now - C_fresh) x 0.1` and the break-even is `B = O / saving`, rounded up.
B <= 20 advises a switch at the next natural break, B <= 8 now; above that,
nothing is said.

The hook fires once per turn and costs nothing in the planner's context:
`systemMessage` shows the owner the line, `additionalContext` lets the planner
fold it into its next progress update. It never fires for subagents, emits
only on a band change (state in `$TMPDIR/session_switch_<id>.json`), and exits
0 on any error. Tune with `--report`; `--orient-turns` sets the assumed
orientation length. The line also tells the planner to leave the tree ready
for a fresh agent (current PROGRESS row, the active brief's Starting state
rewritten, work committed by pathspec) and to hand the owner the one-line
instruction that resumes the work — on the turn already carrying the hook's
line, never a turn of its own.

The preflight review gate (0079 §8) fires for subagents too, and the
`preflight` agent is the standard caller.
