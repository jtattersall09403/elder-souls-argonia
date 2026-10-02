# Method review round 6: where the walk-6, walk-7 and walk-8 agent spend went (2026-10-01)

Headline: 14 long-running Opus agents (over 200 turns each, carrying 160k–290k tokens of context per turn) spent 112.6 of the 276.5 cost units the three rounds used (41 %). Opus look-up and heredoc-edit turns cost another ~51 units (18 %), although `deliver.md:32` and `place-builder.md:19` already forbid them. The adversarial-review loop stopped because its trigger went blind: no build-ledger run row has been written since 09-29, so "a run over target" can no longer fire.

Read-only. Parsers and raw tables are in `/tmp/mr6/` (`parse.py`, `sum.py`, `lanes.py`, `cmd.py`, `summary.txt`, `lanes.txt`, `planner-<session>.txt`). Cost units use the `session_tokens.py:36` weights (cache read 0.1, cache create 2.0, input 1, output 5). Tool time is the gap between each tool_use and its tool_result. Model time is the gap before an assistant entry when no tool was pending.

## Reconciliation

- Live docs that cover this: `method-reviews.md` (index, rounds 1–5; round 5 was 09-28, walk 3). The walk-4 and walk-5 process audits (`tooling/.reports/16k/walk5/process/report.md`, `tooling/.reports/16k/walk6/process-audit.md`) ran as a separate, unindexed loop; the last one ran 09-30 13:10. `docs/research/agent-ops/cost-reviews.md` covers token cost by window.
- Confirmed: the walk-5 audit's finding that look-ups cost turns and therefore money (its proposal 4). Turn share is still 19–28 % below.
- Contradicted: the index rule "a new round opens only when `build_ledger.py --report` lists a run over its target". The report still lists four over-target runs (Riverwalk walk-0 92.9 > 40, Claywater walk-3 105.3 > 10, Greenspring walk-1 64.3 > 10, Greenspring #1 64.0 > 40), and none opened a round. Walks 4–8 have gate rows only (stage rows stop on 09-29), so the trigger cannot see a fix round. `workflow_drift.py:69` counts `reviewFires` from `stamp.json` `stamps`, which `--close` empties (stamp now `{'stamps': {}}`), so it reports 0 while three reviews fired in walk 7. A check that cannot fail.
- Single doc to edit: this index (`method-reviews.md`). Rules go to `.claude/agents/{lead,deliver,place-builder}.md`; tools are named per row below.

## 1. What the loop was and why it stopped

| Loop | Last ran | Trigger | Why it stopped |
|---|---|---|---|
| Adversarial method review (rounds 1–5) | 09-28, round 5, walk 3 | build-ledger run over target | Fix rounds from walk 4 on are never timed as runs (no `stage --start --walk N` rows after 09-29). The trigger has seen nothing since. |
| Process audit (walk-4, walk-5) | 09-30 13:10, inside walk 6 | the planner's choice; no index row | Walk 7 hit the weekly usage limit at 22:15 (`You've hit your weekly limit · resets Oct 2`). The session then moved to the Godot, WebGPU and resource-gate work, and nothing scheduled the next audit. |

## 2. The three rounds, measured

Session spans: walk 6 is planner session `1ddb963a` (09-30 13:03–17:34). Walk 7 is `f630615b` (09-30 21:46 to 10-01 11:38). Walk 8 is `006d39bb` (10-01 12:59 onward, still open).

| Round | Agents | Agent-min | Busy wall | Peak concurrent | Units | Commits | Dead time |
|---|---|---|---|---|---|---|---|
| walk 6 | 158 | 1,768 | 219 min | 21 | 162.5 | 55 | 42 min (14:28–15:09, every lane killed at the session limit, then relaunched as "resume") |
| walk 7 | 58 | 506 | 219 min | 6 | 85.2 | 26 | 606 min (22:15–08:21, weekly limit) |
| walk 8 (partial) | 32 | 208 | 53 min | 7 | 28.9 | 7 | none |

Units by agent type: walk 6 place-builder 62.2, deliver 45.0, lead 24.9, planner 7.3, find 8.1. Walk 7 lead 53.4, deliver 10.3, planner 8.9. Across all three rounds, Opus agents (deliver, lead, place-builder, research) spent 220.0 units and the cheap tiers (find, run, deliver-small, preflight, Sonnet judges) 37.6. Cache reads were 161.7 units, cache creation 108.8 and output 5.9. The bill is turns × context.

### Per lane (the lane's subtree; full list in `/tmp/mr6/lanes.txt`)

| Round | Lane | Own wall / budget | Children | Subtree agent-min | Turns | Tool min | Units | Look-ups | Waste seen |
|---|---|---|---|---|---|---|---|---|---|
| 6 | PLACES lead (+ resume) | 74 + 82 / 180 + 150 | 16 + 21 | 520 | 2,877 | 164 | 56.0 | 631 | killed at the session limit and re-oriented; place-builders at 160–220k context per turn |
| 6 | INTERIORS lead (+ resume) | 74 + 76 / 150 + 120 | 11 + 15 | 451 | 2,090 | 129 | 42.1 | 425 | "Fix interior-shell matching rules": 428 turns at 287k (15.3 units, the costliest agent), 57 heredoc edits; "Garbled interiors" 56 min against a 50-min budget (the only overrun of 192 budgeted agents) |
| 6 | VOLUMETRICS lead (+ resume) | 74 + 89 / 180 + 120 | 18 + 23 | 464 | 1,968 | 91 | 29.9 | 486 | four look-judge iterations through Sonnet `general-purpose` judges; 18 polls |
| 6 | RENDER lead (+ resume) | 74 + 8 / 150 + 120 | 25 + 3 | 234 | 1,253 | 63 | 20.2 | 368 | a 31-min "who destroys the GPU device" probe (14.5 min of headless-Chrome wait) |
| 7 | lead:places ×2 | 70 + 20 / none + 180 | 0 | 90 | 735 | 42 | 20.1 | 129 | the lead did the work itself (495 turns at 270k, 22 min of `wb` of its own); relaunched after the weekly limit |
| 7 | lead:webgpu ×2 | 39 + 20 / none + 180 | 0 | 59 | 765 | 22 | 17.0 | 223 | 555 turns at 191k, no children; relaunched |
| 7 | lead:rendering ×2 + rendering-2 | 16 + 20 + 8 | 0 | 44 | 418 | 19 | 6.8 | 132 | three launches for one lane |
| 7 | lead:flames ×2 + flames-2 + deliver-small | 3 + 20 + 15 + 7 | 0 | 45 | 648 | 21 | 7.7 | 164 | 122 `date; grep` polls in 5 min by "Finish flames lane measurements" |
| 7 | close: preflight ×3, review ×3 | 6 + 6 + 6 min | — | 18 + reviewers | — | 19 | ~1 | — | three scoped preflights at 10:12, 10:23 and 10:32 on the same paths, each followed by a reviewer session (`e32d3b71`, `9cf79089`, `6f8d65e7`) |
| 8 | Lane C (deliver) | 50 / 120 | 4 | 69 | 518 | 27 | 9.6 | 103 | 361 turns at 186k |
| 8 | Lane B (deliver) | 42 / 120 | 0 | 42 | 168 | 24 | 2.9 | 46 | 20 min of foreground `python3 -c` `pgrep` waits (two calls of ~10 min) |
| 8 | Lane A (lead) | 36 / 150 | 9 | 71 | 469 | 18 | 7.9 | 113 | none beyond look-ups |

### Waste classes

| Class | Measure | Units (of 276.5) or minutes |
|---|---|---|
| Long-context agents | 14 agents over 200 turns: 112.6 units at 160–290k context per turn | ~55 units recoverable if split at ~150 turns (est.: mean context ~100k instead of ~200k) |
| Look-ups and heredoc edits by Opus | 1,328 / 973 / 224 look-ups against 6,948 / 3,497 / 1,092 Opus turns (19 / 28 / 21 %); 517 heredoc edits | 50.8 units on those turns |
| Leads doing the work themselves | walk-7 leads ran with 0 children: 2,511 turns, 53.4 units | inside the long-context row |
| Relaunch after a limit | walk 6: four leads killed at 14:28 and resumed. Walk 7: four leads killed at 22:15 and relaunched at 08:21; flames and rendering then had a third launch | re-orientation ~10 % of the relaunched subtrees (est. ~8 units); 606 + 42 min of idle VM |
| Duplicate close | 3 preflights + 3 reviews in 20 min (walk 7) | 18 min of wall; three Opus reviewer sessions |
| Foreground polls past the guard | `python3 -c … pgrep` (20 min), `date; grep` ×122, `tail -f` | ~30 min of wall, ~150 turns |
| Contention | 21 concurrent agents (walk 6). `tsc` p50 7 s, but 15 of 123 calls took over 120 s (max 217 s). The watchdog paused a walk-8 test run for 243 s (`/tmp/es-jobs/watchdog.log` 13:47) | ~30 min of lane wall (est.) |
| Planner wakes with nothing to do | 134 of 203 wakes ended with no tool call (64 / 51 / 19). Planner cost per turn 0.029–0.038 units | ~4.5 units |
| Rulings waits | none found in walks 6–8 | 0 |

Not waste: budgets work (1 overrun in 192). `find` is cheap (Haiku: 12.6 units over 50 agents).

## 3. Changes, ranked by saving per week

A week is about three of these rounds (~550 units at the measured rate). The weekly subscription limit was hit on 09-30, so units are the binding £: every unit saved is output bought back inside the same subscription. VM time matters only as idle hours (the 10 h overnight in walk 7).

| # | Change | Kind (file) | Evidence | Saves per week (est.) |
|---|---|---|---|---|
| 1 | **Context ceiling per agent.** At 150 turns (or when a turn's context passes ~150k), an Opus agent writes its hand-off note and returns. Its lead (or the planner) relaunches a fresh agent from the note. | Hook: a PreToolUse hook beside `agent_cap.py` that reads the agent's own transcript turn count and refuses further tool calls past the ceiling with "write the note and hand back". Rule in `deliver.md`, `place-builder.md`, `lead.md`. | 14 agents, 112.6 units at 160–290k per turn | ~100 units (18 %) |
| 2 | **Leads never work.** A lead makes no edits and runs no build jobs. Every job goes to a `deliver`/`place-builder` with a fresh context. | Hook: refuse Edit/Write and `wb.py`/`pytest` Bash for `agentType == lead`, the same way `shell_guard.py` keys on the planner. Rule in `lead.md:11`. | walk-7 leads: 0 children, 2,511 turns, 53.4 units | overlaps 1; makes 1 cheap to apply |
| 3 | **Look-ups as a tool, not a rule.** The rule exists (`deliver.md:32`) and is not obeyed. A hook on Bash counts consecutive single-command look-ups by an Opus agent and, at the third, answers "batch them in one call or send one `find`". Heredoc `python3 - <<` edits of a repo file are refused in favour of Edit. | Hook (`shell_guard.py`) | 19–28 % of Opus turns, 50.8 units; 517 heredoc edits | ~45 units (8 %) |
| 4 | **Pace to the weekly limit.** The SessionStart line prints the week's units used against the limit. The planner launches no new lane wave above ~85 % and never launches a wave in the last hour before an unattended stretch. | Tool: `session_tokens.py --brief` plus the SessionStart hook; rule in CLAUDE.md "Model policy" | 22:15 limit with four leads just launched → 606 min idle and four relaunches | ~15 units of relaunches; ~10 VM-h per hit |
| 5 | **One close per batch.** A red preflight re-runs only the gates that were red (`--only <gates>`). A re-run inside an open batch never fires a reviewer. `workflow_drift` counts fires from an append-only log, not from the stamps `--close` empties. | Tool: `preflight.mjs`, `review_gate.py`, `workflow_drift.py:69` | walk 7: 3 × 6 min preflights and 3 reviewers in 20 min; drift shows `reviewFires 0` | ~10 units and ~30 min of wall per week |
| 6 | **Close the poll loopholes.** `pgrep` loops, `date; grep` repeats and `while … ; do` waits are refused like `sleep`, pointing to `run_in_background`. | Hook (`shell_guard.py`) | 20 min (walk-8 Lane B), 122 calls (walk 7) | ~5 units; ~30 min of lane wall |
| 7 | **Time the fix rounds again.** `wb.py round` writes the run start and end for `<place>#walk-N` itself. The method-review trigger then reads the fix rounds it currently cannot see. | Tool: `wb.py` / `build_ledger.py` | no stage rows after 09-29; four over-target runs never acted on | enables the loop (item 4 of the trigger) |
| 8 | **Planner wakes.** A lane's interim hand-backs go to its lead, never to the planner. Wave lanes run inside one Workflow, so the planner wakes once per wave. | Rule: brief template (`lead.md`, 16k packet step) | 134 of 203 wakes with no action | ~9 units |

## 4. Should the adversarial-review loop resume?

Yes, on a measurement, not on a calendar. A process audit (this shape, a research agent, under 40 min) runs at the close of every second walk round, and at once if any of these holds:

- `session_tokens.py --days 1` shows a round above 120 units.
- `workflow_drift.py` is red on any row.
- `build_ledger.py --report` lists a fix round over target. This needs change 7 first.

Each audit gets an index row here. The place-method review proper (rounds 1–5) resumes only once change 7 is in place, so its trigger sees fix rounds again.

## Recommendations

- Apply 1, 2, 3 and 6 as one hooks change. They share the transcript-reading code `agent_cap.py` already has. Make each refusal fail on purpose in a test before trusting it: `workflow_drift`'s `reviewFires` is the latest gate that could not fail (§ Reconciliation).
- Fix `workflow_drift.py:69` in the same change as 5. The drift report is the trigger for § 4.
- The walk-6 round ran 21 agents at once and 15 `tsc` calls took over 120 s. `agent_cap.py` admits on memory only, so CPU contention is unmeasured. Add the loadavg sample the walk-5 audit asked for before raising lane counts.
- Index note: the `docs/research/phase16/README.md:41` row still says "rounds 1–3"; the index now runs to round 6.

Covered: tooling/.reports/16k/walk2 (method-review*, speed-deep-dive), walk3/method-review-r5.md, walk6/process-audit.md, the walk6/walk7/walk8 folder listings, the build ledger, the planner sessions 1ddb963a, f630615b and 006d39bb with all 248 agent transcripts, reviewer sessions a2dcf767, e32d3b71, 9cf79089 and 6f8d65e7, the watchdog log, review stamp.json, workflow_drift.py, session_tokens.py, and the agents' rules in deliver.md, lead.md and place-builder.md · Skipped: the 1,024 job-guard logs (sizes 0.2–3 KB, peaks only; no wall beyond the transcripts), lane_resume.py (no timing output), the owner's Claude-plan price (units are reported, not £)
