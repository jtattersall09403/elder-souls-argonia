# Method review round 7: walk 8 and walk 9 agent spend (2026-10-01)

Headline: not at the efficient frontier. Long-context agents remain the largest cost; the owner ruled after this review (walk 9) that there is no turn cap: briefs are chunked to one context and the planner monitors elapsed against expected (0118 d1). In walk 8, one deliver ran 257 turns at up to 342k context per turn and cost 6.28 units, 17.5 % of both sessions. The week is at 904 of 825 calibrated units (110 %, `week_usage.py`), and `enforce` is false.

Read-only. Parser and raw tables: `/tmp/mr7/parse.py`, `/tmp/mr7/agents.txt` (every agent in both sessions), `/tmp/mr7/8cab.txt` (walk 5, for comparison). Units use the `week_usage.py:27` weights (cache read 0.1, cache create 2.0, input 1, output 5, per M tokens). Turns are distinct assistant message ids. Minutes run from an agent's first to its last transcript entry.

## Reconciliation

- Live docs that cover this: `method-reviews.md` (index, rounds 1–6), `method-review-r6.md`, decision 0118, `docs/standards/hooks.md`.
- Confirmed: r6's look-up hook works. Opus single look-ups fell from 19–28 % of turns to at most 8 per agent.
- Contradicted: `method-reviews.md:9-10` still says "A new round opens only when `build_ledger.py --report` lists a run over its target". Its own round-6 row and 0118 replaced that rule with the every-second-walk audit. `tooling/.reports/16k/walk9/find-process.md` gives `REFUSE_TURNS = 180`. The code (`agent_guard.py:25`) and the agent files (`deliver.md:39`, `lead.md:45`, `research.md:16`) say 220.
- Single doc to edit: `method-reviews.md` (the trigger sentence and a round-7 row). This lane could not make that edit: no Edit tool, and `shell_guard` refuses heredoc writes to tracked files.

## 1. The two sessions

Walk 8 is planner `006d39bb` (Fable 5.1), 12:59–16:41: 222 min of session span, 136 min with any agent running, 38 agents, 23.8 units. Walk 9 is `07f5b4c0`, from 16:42, measured at 17:28: 45 min, 30 min busy, 20 agents, 12.0 units. The total is 35.8 units. Walk 5 (`8cab1619`, 09-29/30) spent 210 units, so per round the spend is down about 6×. 86 of walk 8's 222 VM minutes had no agent running: the owner was walking, plus the planner's own turns.

| Session | Agent | Model | Turns | Cache read / create / out (M) | Max ctx | Units | Min | Delivered | Cheapest way? |
|---|---|---|---|---|---|---|---|---|---|
| w8 | Lane C chairs, sockets, dressing | Opus deliver | 257 | 54.9 / 0.34 / 0.02 | 342k | 6.28 | 64 | seats, sockets, dressing review | No. Split at 150 turns: about 3 units saved |
| w8 | Lane F bloom, A2C, grade | Opus deliver | 91 | 9.8 / 0.61 / 0.01 | 161k | 2.24 | 46 | bloom and grade (the owner now calls the sun and lantern bloom too strong) | Yes; one tuning iteration short |
| w8 | planner | Fable | 79 | 14.8 / 0.25 / 0.05 | 263k | 2.24 | 222 | orchestration and packet 9 | Context too long: 263k by the end |
| w8 | Lane G ways of working | Opus deliver | 106 | 14.9 / 0.20 / 0.02 | 208k | 2.01 | 14 | 0118 hooks and tests | Yes, but the settings line was left to the owner and never pasted |
| w8 | Lane B WebGPU | Opus deliver | 96 | 8.9 / 0.51 / 0.00 | 148k | 1.92 | 42 | a console-clean build; the owner reports it still broken | No. Fixed blind, with no GPU frame to check against |
| w8 | coherence: lead A, synthesis, 3 Sonnet readers, tool+gate, follow-ups | Opus/Sonnet | 222 | 17.9 / 0.84 / 0.02 | 162k | 4.42 | 36 | record-coherence gate and five records edited | No. The owner found false Riverwalk prose: the gate read text, not the built scene |
| w8 | 10 find agents | Haiku | 171 | 5.6 / 0.50 / 0.00 | 61k | 1.62 | ~2 each | orientation notes | Yes |
| w8 | review fixes, preflight reds, two sign kits, text review, Lane D, Lane E, research ×5 | mixed | 287 | — | ≤106k | 3.54 | 1–10 | as named | Yes |
| w8 | preflight ×2, run | Sonnet | 15 | — | 34k | 0.35 | 32 | merge and deploy | Yes; two runner preflights at 15:04 and 15:13 (290 s, 276 s) for one merge |
| w9 | 11 find agents (orientation) | Haiku | 300 | 10.4 / 0.62 / 0.00 | 83k | 2.28 | ~2 each | `walk9/find-*.md` | Partly (§ Orientation) |
| w9 | B1 lights-and-post | Opus deliver | 131 | 19.6 / 0.23 / 0.03 | 229k | 2.56 | 18 | running | Context past 200k; the cap would nudge at 150 |
| w9 | C1 record-coherence | Opus deliver | 83 | 10.3 / 0.17 / 0.02 | 180k | 1.46 | 13 | running | Yes |
| w9 | A1 WebGPU-loop lead | Opus lead | 74 | 8.7 / 0.19 / 0.00 | 186k | 1.25 | 25 | running | No: 17 python heredocs. The lead is working, which `agent_guard` would refuse |
| w9 | C2 dressing-three-places | Opus place-builder | 56 | 6.6 / 0.27 / 0.00 | 158k | 1.20 | 12 | running | Yes |
| w9 | D2 rasters, B2 wind-seam, D1 process | Opus deliver | 149 | 14.6 / 0.38 / 0.03 | 143k | 2.42 | 5–19 | running | Yes |
| w9 | planner | Fable | 29 | 2.3 / 0.15 / 0.04 | 161k | 0.72 | 45 | briefs | Yes |

By kind: cache reads were 220 M tokens (22 units, 62 %), cache creation 6.4 M (12.8 units, 36 %), output 0.3 M (1.5 units). Opus wrote 216 python heredocs in 1,492 Opus turns (14 %). Heredocs that write a tracked file are refused. Heredocs that read are not.

## 2. The ten largest costs

| # | Cost | Units | Share of 35.8 |
|---|---|---|---|
| 1 | Opus agents past 150 turns or 200k context (Lane C, B1, G) | 10.85 | 30 % |
| 2 | Coherence work redone because the gate read prose, not the scene (walk 8; C1 repeats it in walk 9) | 5.88 | 16 % |
| 3 | Find fan-outs for orientation (21 agents) | 3.90 | 11 % |
| 4 | WebGPU fixed blind (Lane B, A1; walk 5's WebGPU lead spent another 14.98) | 3.17 | 9 % |
| 5 | Planner context (walk 8 ended at 263k) | 2.96 | 8 % |
| 6 | Bloom tuned without a judged frame, so the owner re-reports it (Lane F) | 2.24 | 6 % |
| 7 | Python-heredoc read turns by Opus (216 turns at ~150k) | ~2.2 (est.) | 6 % |
| 8 | Lead doing the work (A1) | 1.25 | 3 % |
| 9 | Two runner preflights per merge | 0.2 units, 10 VM-min | <1 % |
| 10 | VM idle while the owner walks (86 min in walk 8) | VM only | — |

## 3. The cheapest fix for each

| # | Change | Kind | Saving per week (3 rounds) |
|---|---|---|---|
| 1, 8 | One deliverable per brief, sized to one context, with a named hand-off note; the planner monitors elapsed against expected (0118 d1). Leads only plan (`agent_guard.py`, lead rule). | brief template + monitoring | ~25 units |
| 2 | The coherence gate checks each claim against the built layout (`wb.py whatchanged` / scene nouns), not against other prose. The C1 brief must name that. | tool + brief | ~10 units of rework, and fewer owner walk findings |
| 3 | A cached orientation set: `standards`, `process` and `16k-brief` notes keyed by their source files' git blob hashes, re-run only on a hash change. Task-specific areas stay fresh. | find brief + a 20-line cache check | ~1.5 units |
| 4 | The RunPod GPU loop (this round's A1) is the fix. No WebGPU fix lands without a judged GPU frame. | brief rule | ~5 units |
| 5 | The planner hands off at ~150k context, not only at check-ins. The session-switch line already prints it. | rule in CLAUDE.md "One chunk or round" | ~2 units |
| 6 | Visual tuning lanes get one Sonnet frame judge against the owner's complaint before they return. | brief template | ~2 units |
| 7 | `shell_guard` counts a read heredoc as a single look-up, so the third-in-a-row nudge covers it. | hook (`shell_guard.py:135`) | ~2 units |
| 9 | Merge: one runner preflight. A second runs only on a red. | `preflight` agent brief | 10 VM-min |

## 4. Status of the r6 proposals

| r6 # | Proposal | Status | Evidence |
|---|---|---|---|
| 1 | Context cap | dropped by the owner (walk 9); replaced by chunking (0118 d1) | Lane C 257 t, B1 131 t at 229k |
| 2 | Leads only plan | adopted, not wired | same hook; A1 lead wrote 17 heredocs |
| 3 | Look-up nudge, heredoc-write refusal | adopted, wired | `settings.json:77`, `shell_guard.py:207`; Opus look-ups ≤8 per agent; it refused this lane's own index edit |
| 4 | Pace to the weekly limit | wired, nudge only | `weekly_limit.json` `enforce: false`, 825 units calibrated; week at 110 % |
| 5 | One close per batch | wired | `preflight.mjs:336` `rerunOnlyFailed`; `reviews.jsonl`; drift `reviewFiresPerBatchMax 1` |
| 6 | Polls refused | wired | `shell_guard.py:44-53`; no poll loops in either session |
| 7 | Fix rounds timed | wired, partly used | `wb.py:2402` `walk_clock`; Greenspring `#walk-1` rows 10-01 14:05; no Riverwalk or Claywater walk-8 rows |
| 8 | Hand-backs to the lead | rule only (cannot be hooked, 0118 d8) | — |

New defect: `workflow_drift.py:71-73` reports `minerFullRuns 30` RED. 21 of the 30 rows are pytest or preflight runs whose arguments name a `test_mine_*.py` file; the 9 real full runs all date 09-26 to 09-28. The fix is to match only `tool` starting `worldgen.mine_`. Until then the drift trigger for the audit is permanently red: it fires falsely, so nobody reads it. `scopedWallP50S 158` is also red, on runner-free scoped runs from 09-30. Walk 8's scoped runs were 92 s and 70 s.

## 5. Adversarial challenges

1. **"The cap is a plaster; you pay for re-orientation."** Conceded in part. The relaunch re-reads the brief and the note: about 40k tokens of cache creation, ~0.1 units. Lane C's turns 150–257 at ~250k cost ~2.7 units. The owner's worry about lost context holds only if the note is thin. The real control is brief size, and Lane C's brief joined three jobs. Answer (owner ruling, walk 9): no cap; briefs carry one job each and the planner monitors (0118 d1).
2. **"Your gates make agents do the work twice."** Conceded. Coherence cost 5.9 units in walk 8 and is being redone in walk 9, because the gate passed prose that contradicts the built scene. A gate that cannot fail on the defect class the owner reports is waste. See change 2.
3. **"Orientation is the new waste: 21 find agents and 3.9 units to read docs that barely changed."** Partly answered. Haiku costs 0.1–0.3 units per area against ~1.5 for an Opus self-orientation. But the standards, process and brief areas are re-mined every session. See change 3.

## Orientation in this session

The 11 find agents spent 10.6 M billed tokens (2.28 units, 19 % of walk 9 so far, about 2 min of wall each, in parallel). Almost all of that is cache reads of each agent's own transcript. The planner received ~45 KB of notes. A per-area notes cache keyed by source-file hashes would have served `standards`, `process` and `16k-brief` (0.33 units, 15 %) unchanged. The other eight areas were task-specific and needed fresh reads. The saving is ~0.3 units per session, not a large lever.

## 6. Verdict

Not at the frontier. Spend per round fell from ~85–160 units (walks 5–7) to 24 units (walk 8). The largest remaining block, 30 %, is long contexts, cut by one-context briefs (0118 d1). The next three changes, in order:

1. Make the coherence gate compare against the built scene, not prose.
2. Calibrate the weekly limit from the owner's "% used" reading: units used now ÷ the shown % = limitUnits. Then set `enforce: true`.
3. Fix the `minerFullRuns` matcher so the drift trigger can go green.

The loop continues. The next audit runs at the close of walk 10, or at once when drift goes red after the matcher fix.

## Recommendations

- `workflow_drift.py:71`: replace the args regex with `t.get("tool","").startswith("worldgen.mine_")`, plus a test with a pytest row that names `test_mine_mounts.py`.
- `week_usage.py`: add `--calibrate <percent>`, which writes `limitUnits = units_since_reset / (percent/100)`. That turns the owner's usage-page figure into the limit.
- Brief template: one job per deliver brief. Lane C held three.
- Research agents doing doc output need the Edit/Write tools, or the brief should say "report only".

Covered: both planner transcripts and all 58 subagent transcripts and meta files of `006d39bb` and `07f5b4c0`; `.claude/settings.json`; `tooling/repo-standards/{agent_guard,shell_guard,workflow_drift,week_usage,build_ledger,preflight}`; `tooling/.reports/16k/walk8`, `walk9` listings · Skipped: walk 9 agents still running (measured at 17:28), job-guard logs (peaks only)
