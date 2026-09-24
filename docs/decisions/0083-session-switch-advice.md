# 0083 — Price a fresh session against this one; switch at natural breaks

Owner 2026-09-22, reshaped with the owner 2026-09-23. Extends 0079 (the bill
is turns x context).

Every planner call re-reads the whole session context at the cached rate, so a
long session gets dearer per step. A fresh session pays a one-off cost and then
runs cheaper. On tokens alone, short sessions win: with the context growing
~2k a step, the cheapest pattern is a session of ~40 steps ending near 130k.
But a mid-task hand-off loses what never reaches the notes (what was tried,
why it was rejected, what the owner said in passing), costs the owner a
restart each time, and gets sloppier the more often it happens. So the rule
is: **the numbers inform, the natural break decides.**

`tooling/repo-standards/session_switch.py` runs as a `UserPromptSubmit` hook
in the owner's interactive session only (entrypoint `cli`; never subagents or
headless runs). It rides the next instruction or wake, so it never forces an
extra model call. Units are fresh-input-token equivalents
(`session_tokens.WEIGHT`: cached read 0.1, cache write 2, input 1, output 5);
subagent usage is identical either way and is left out.

- **One-off cost of switching** = hand-off + orientation. The hand-off is two
  calls here (the last of the PROGRESS row and the brief's Starting state,
  then the line to the owner), each re-reading the whole context; no commit,
  tests or preflight (owner 2026-09-23). Orientation is what **this** session
  spent before its first work call (an edit, a workflow, or a
  `deliver`/`run`/`preflight`-type subagent; `find`/`research` look-ups are
  still orientation), or its whole first turn if that ends first: the fresh
  session pays it again. In practice the planner takes in only ~36k tokens at
  the first-read rate while orienting (22k of it the fixed start-up text); the
  subagents do the bulk reading.
- **Saving per step** = (C_now − C_fresh) x 0.1, where `C_fresh` is the
  context the first work call carried.
- **Break-even** = one-off / saving, in planner steps (~5–6 per owner turn).

After orientation the hook gives the planner one line per prompt: the
one-off, the saving per step, the break-even and a stay/switch table for 5,
10, 20, 40 and 80 remaining steps. **At each owner check-in the planner prices
the next part** (stay vs switch for the steps it needs) and the owner chooses;
switching happens only at such a break, with the PROGRESS row, the brief's
Starting state and the exact one-line instruction for the new session. Past
300k context the owner is told once (`systemMessage`) and the planner brings
the current work to the nearest sensible break and hands off. State lives in
`$TMPDIR/session_switch_<id>.json`; the hook exits 0 on any error.
`--report [--transcript X]` prints the table.

Measured 2026-09-23 on a 400k session: one-off ~213k, saving ~35k a step,
break-even ~6 steps; at 200k, ~176k / ~16k / ~11 steps; at 120k, ~154k / ~7k /
~22 steps.

## History

The first two cuts (2026-09-22) compared against a baseline of other sessions
and projected over an assumed session length; a third (2026-09-23) priced only
the next turn and blocked the stop to force a hand-off. The owner rejected the
first two as over-complicated and the third because a one-turn view never
fires (the hand-off alone re-read the context four times) while any longer
fixed horizon would chop a phase into many short sessions. The
records-per-call fold (`session_tokens.Calls`, one model call per
`message.id`) stands.
