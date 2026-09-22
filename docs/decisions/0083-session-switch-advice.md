# 0083 — Tell the owner when a fresh session is cheaper than this one

Owner 2026-09-22. Extends 0079 (the bill is turns x context).

Every turn re-reads the whole session context at the cached rate, so a long
planner session gets dearer per turn; a fresh session pays a one-off
orientation cost and then runs cheaper. Nobody measured the crossing point.

`tooling/repo-standards/session_switch.py` measures it; a `Stop` hook reports it.

A turn's cost is in units — fresh-input-token equivalents, the rule of thumb
for how the weekly limit is metered: cached read 0.1, cache write 2 (the
1-hour TTL rate here), input 1, output 5. A turn is one main-chain model
call: the transcript writes one assistant record per content block, each
repeating the call's usage, so records are folded by `message.id`
(`session_tokens.Calls`, shared by the token report and the hook). A turn's
context is input + cache_read + cache_creation. That per-turn cost is compared
with a fresh-session turn, and both are projected over a typical session's
length (the baseline median, floor 20), reported as a share of the last 7 days
of interactive planner usage — Fable's own weekly limit, subagent and headless
usage excluded (`window_totals(..., interactive_only=True)`).

The fresh-session baseline is the median over the last ten other interactive
transcripts long enough to hold both windows: `O` is the cost of their first
eight turns, `C_fresh` the context at turn eight. The saving per turn is
`(C_now - C_fresh) x 0.1`. A switch costs `O` plus four hand-off turns at
this session's rate (PROGRESS row, Starting state, pathspec commits, the
preflight hand-off), and the break-even is `B = switch / saving`, rounded up.
B <= 20 reports the pay-back at the next natural break, B <= 8 at the next
commit; above that, nothing is said. `C_now` is the median context over the
last fifteen turns (a compaction or resume re-write drops out), and only the
excess-context re-read is the saving: cache writes and output are the work
itself and cost the same in either session.

The tool cannot see how much of the chunk is left, so it never asserts that a
fresh session is cheaper: it reports B, and the planner judges B against the
planner turns the chunk still needs (subagent work does not count). A job that
finishes in fewer turns than B stays where it is.

Correction 2026-09-22: the first cut subtracted whole per-turn costs
(`now_per_turn - fresh_per_turn`, cache writes at 2x and output at 5x
included) and compared any session, however young, against a baseline
measured at turns 8 to 18. A fresh session's own early turns write the system
prompt, CLAUDE.md and the orientation reads to cache once, so the hook told
two brand-new sessions (turn 3, turn 19) that a fresh session was cheaper.
The code now uses the formula above, and a session says nothing until it has
passed its own orientation and fresh windows (18 turns at the defaults).

Second correction 2026-09-22: turns were counted per transcript record, so a
38-call 16h session read as "turn 79", every baseline sum and the weekly
total were roughly doubled, the 100-turn horizon was two and a half real
sessions, and leaving was charged nothing. The owner, 53 minutes into that
session with little planner work done, was told to switch. Records now fold
by call, the horizon is a typical session, the hand-off is charged, and the
line reports a pay-back for the planner to judge (B was 25 for that session:
silent).

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
