# 0118 — Work is chunked to one context and monitored, leads only plan, look-ups are batched by hook

Status: accepted (16k walk 8, 2026-10-01). Amends 0079 rule 20 (the lead
tier) and 0106 decisions 19 and 20 in place. Evidence:
[method review r6](../research/phase16/method-review-r6.md).

## Context

The owner's measure is output per pound of VM time and subscription; the
weekly subscription limit was hit on 2026-09-30 at 22:15, so cost units
are the binding pound. Walks 6 to 8 spent 276.5 units. Method review r6
measured where they went:

- 14 Opus agents ran past 200 turns at 160k–290k tokens of context per
  turn: 112.6 units (41 %). The bill is turns × context.
- Opus look-up and heredoc-edit turns: 19–28 % of Opus turns, 50.8 units,
  517 heredoc edits, although `deliver.md` and `place-builder.md` already
  forbade them. A rule nobody enforces is not obeyed.
- Walk-7 leads ran with no children: 2,511 turns, 53.4 units of doing the
  work themselves at lead context.
- The limit hit with four leads just launched: 606 min of idle VM and four
  relaunches.
- Walk 7's close ran three 6-min preflights and three reviewers in 20 min;
  `workflow_drift` reported 0 review fires because it read the stamps
  `--close` empties.
- Polls slipped past the guard: a 20-min `python3 -c … pgrep` wait, 122
  `date; grep` ticks in 5 min.
- No fix round was timed after 09-29, so the method-review trigger
  ("a build-ledger run over target") could not fire.
- 134 of 203 planner wakes ended with no action.

## Decisions

1. **Chunking, never a cap** (owner, walk 9: no turn cap). The planner or
   lead sizes every brief to one deliverable an agent finishes in one
   context: one mechanism, one place or one tool. The brief names the
   hand-off note the agent writes when it returns (what is green, the next
   step, the files). The next chunk starts a fresh agent from that note
   plus the brief. A lead that finds a chunk bigger than briefed splits it
   and returns the split; it never pushes on. Long-running work is
   monitored by the planner, never capped: at every check-in it compares
   elapsed with expected, and when a lane is over it finds the
   inefficiency, stops the lane and resumes it with the improved process.
   The brief's `Budget: N min (hard)` line is that checkpoint, not a
   limit.
2. **Leads only plan.** A lead briefs, integrates by reading reports and
   verifies through `find`/`run` agents. `agent_guard.py` refuses its
   Edit/Write outside `tooling/.reports/` and its build, test and publish
   commands; pathspec commits stay the lead's.
3. **Look-ups are batched by hook.** `shell_guard.py` nudges an Opus agent
   at its third single look-up command in a row, and refuses for every
   agent a heredoc that writes a git-tracked file (the Edit tool exists).
4. **Pace to the weekly limit.** `week_usage.py` measures the week's units
   since the reset against the calibrated limit; the SessionStart line
   prints the share; `agent_cap.py` refuses a lane wave (a second launch
   within 60 s) above 85 % unless the brief's `Budget:` is under 30 min. No
   wave launches in the last hour before an unattended stretch.
5. **One close per batch.** Inside an open review batch, preflight re-runs
   only the gates red last time and the reviewer does not fire again;
   review fires go to an append-only log that `workflow_drift.py` counts,
   red at more than one fire per batch.
6. **Polls are refused** like `sleep`: pgrep loops, python sleep
   one-liners, waiting while-loops, `date; grep` ticks.
7. **Fix rounds are timed.** `wb.py round --walk N` opens
   `<place>#walk-N` in the build ledger on the walk's first round;
   `--end-walk` ends it, so `build_ledger.py --report` lists an
   over-target fix round again.
8. **Interim hand-backs go to the lead.** A lane spawned by a lead reports
   to that lead, never to the planner, and a wave runs inside one Workflow
   so its caller wakes once per wave. Known exception: the Workflow tool
   was missing from some sessions; a wave then runs as background Agent
   calls and the caller ignores wakes with nothing actionable (0079 rule
   11). The harness routes a hand-back to whoever spawned the agent; no
   hook can re-route it, so this is a brief and agent-file rule.

The process audit (r6 § 4) runs at the close of every second walk round,
or at once on a `workflow_drift` red, a day above 120 units, or a fix
round over target (the 16k brief, § Build cost is measured as data).

## Where each lives

- 1 lives in the brief templates and the agent files; no hook.
- `tooling/repo-standards/agent_guard.py` (2), `shell_guard.py` (3, 6),
  `week_usage.py` + `weekly_limit.json` + `agent_cap.py` +
  `session_tokens.py --brief` (4), `preflight.mjs` +
  `preflight_select.mjs` `rerunOnlyFailed` + `review_gate.py` +
  `workflow_drift.py` (5), `tooling/placement-workbench/wb.py`
  `walk_clock` (7); tests beside each.
- `.claude/agents/{deliver,place-builder,lead,research}.md`;
  [`docs/standards/hooks.md`](../standards/hooks.md) holds the settings
  line for `agent_guard.py`.
