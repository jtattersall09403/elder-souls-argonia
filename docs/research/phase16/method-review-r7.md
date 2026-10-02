# Method review round 7: where walk 8 and walk 9 spent time and money (2026-10-02)

Headline: walk 9 cost 212 units, 9× walk 8 (23.9). 132 of its 203 subagent units (65 %) were spent on turns carrying more than 200k context, nearly all by first-of-type place-builders that ran to 520k–830k context inside one Workflow. Second: the planner told the owner "nothing else is pending on my side" (01:02) while the WebGPU lane was still running. The owner stopped the VM at 01:11 and the lane died mid-job. The WebGPU build then failed to load because the `webgpu` branch is 110 commits behind `dev`.

This file replaces the partial round-7 review written at 17:28 on 10-01, which measured walk 9 before most of it ran. Read-only. Parsers and raw tables are in `/tmp/mr7b/` (`parse.py`, `all.txt` lists every agent in both sessions, Workflow children included; `tl-w8.txt` and `tl-w9.txt` are the planner timelines; `jobguard.txt`). Units use the `week_usage.py` weights: cache read 0.1, cache create 2, input 1, output 5, per M tokens.

## Reconciliation

- **Live docs that cover this:** `method-reviews.md` (index, rounds 1–7), `method-review-r6.md`, decision 0118, decision 0119, CLAUDE.md "How we work" and "Update on progress".
- **Confirmed:** the r6/r7 finding that long contexts are the largest cost. It grew from 30 % of units (walk 8) to 65 % (walk 9).
- **Contradicted:** 0118 d1's "monitored by the planner" did not happen. The planner answered 117 wakes with "Interim; nothing to act on" while D4 place-type-5 grew to 830k context. No tool shows it an agent's context.
- **Superseded:** the round-7 index row ("walk 8 spent 24 units…"). The writer edits that row in `method-reviews.md`; no new file.
- **Already landed, not re-proposed:** the lead foreground wait (`lane_wait.py`, `lead.md:49-60`, commit f4c9797f at 08:42 today).

## 1. Time ledger

| | Walk 8 (`006d39bb`) | Walk 9 (`07f5b4c0`) |
|---|---|---|
| Session span | 12:59–16:42, 223 min | 16:42–01:11 (VM stopped), 509 min |
| Agents (Workflow children included) | 37 | 99 |
| Agent-minutes | 335 | 2,130 |
| Units | 23.9 | 212.0 |
| Units by type | deliver 16.4, planner 2.2, find 1.6, research 1.0, gp 0.9, lead 0.9 | place-builder 136.1, deliver 50.3, lead 10.4, planner 8.9, find 2.7, gp 2.2 |
| Peak concurrent agents | 7 | 13 (21:34) |
| VM up with no agent running | 89 min: 7 min orientation, then 81 min (15:21–16:42) on the owner's walk of packet 9 | 17 min: owner set-up of RunPod and orientation (16:42–16:53, 16:57–17:03) |
| VM up after the packet | — | 54 min (00:17–01:11): WebGPU lane 3 working. Its last job was cut by the VM stop |
| Job-guard jobs (from 12:59) | 765 jobs, 712 min of job wall, 227 non-zero exits; peak 9.5 GiB (laneB) | |
| Pods | none | ≥314 min, about $0.68: lanes 1 and 2 101 min; loop 3 48.5 + 39.8 + 64 min; x3lo34wf7lpiai from 00:08 for at least 61 min. Pod 9rg8lcctgoqnwi (from 21:20) has no end time recorded. No deletion is recorded for x3lo34wf7lpiai (`webgpu-loop-3-night3.md:30` "Left RUNNING for the lead") |

The VM was off from 01:11 to 07:59, so no VM time was lost overnight. `idle-stop.sh` did not fire: its last log line is `01:03:12Z idle for 0 min`, and the 01:11 SIGTERM came from outside the machine.

### Top ten single losses

| # | Loss | Minutes | Units |
|---|---|---|---|
| 1 | First-of-type place-builders past 200k context: D4 type-5 (830k, 121 min), F1 type-7 (682k, 87), C3 type-4 (691k, 84), E1 type-6 (554k, 74), C2 dressing (517k, 78) | 444 agent-min | 99.7 of their 106.4 units were on turns over 200k |
| 2 | Owner walk with the VM up and nothing queued to run: 15:21–16:42 | 81 VM-min | — |
| 3 | Ten follow-up and follow-up-2 relaunches of Workflow lanes that returned NOT done (`lane-summaries.md:6-62`): lights ×2, rasters ×2, dressing ×2, wind, process, type-9, type-10 | 460 agent-min; integration waited about 80 min (19:58–21:21) | 31.1 |
| 4 | Sun and bloom diagnosed on SwiftShader: 15 `probe-bloom-sky` runs at 380–753 s each, plus a 572 s sunray probe, across five lanes. Three close-fix lanes in sequence (22:00, 22:20, 22:47) | 82 job-min; about 75 min on the packet's critical path | ~4.6 |
| 5 | Close: three runner preflights (299, 325 and 333 s), two scoped runs and two reviewer sessions (ae64361e at 23:14, fee8499f at 23:39), each told it was "the ONLY review" | 51 min, 23:14 → 00:05 | 3.4 for the reviewers |
| 6 | Type-9 and type-10 publishes blocked: another lane's uncommitted `displayName` rewrite of 59 kit manifests (`place-type-10.md:66-68`; "Finish type-9" hand-back) | inside #3: 130 agent-min | 14.3 |
| 7 | WebGPU lane cut by the VM stop. Its 01:02 job was lost and the next session re-oriented through two find Workflows (08:33–08:40) | 7 + 7 min | ~1 |
| 8 | `interior-kotm-v1` kit rebuilt 6 times in one lane (588, 617, 391 s …) | 32 job-min | — |
| 9 | Planner wakes answered "Interim; nothing to act on" (117 turns at up to 479k context) | — | ~4.4 |
| 10 | A worktree checkout for "before" shots cut at the 30-min tool limit on a busy machine (`lights-followup` hand-back) | 30 agent-min | ~0.5 |

The WebGPU build failing on the owner's walk ("setKTX2Loader must be called before loading KTX2 textures") is a defect, not minutes. `webgpu` lacks 110 `dev` commits (`git log webgpu..dev`), including f27a312f (character bodies ship KTX2). Both branches were pushed at 00:10 without a merge.

## 2. Root causes

| # | Root cause |
|---|---|
| 1 | A first-of-type place is briefed as one deliverable, but it is four: site and layout, kit sourcing and building, rounds to green, then publish and shots. "One context" in `place-builder.md:23` has no size and no stage boundary. Workflow children cannot be messaged, so the planner could not split them even if it had seen the size. |
| 2 | The packet step has nothing that runs while the owner walks. Walk-independent lanes (WebGPU, perf, method review) were launched after the walk, not during it. |
| 3 | Workflow children have no Agent tool, so lanes that needed reader fan-outs or image judges (coherence, lights, rasters, dressing) could not finish inside `walk9-round`. The lesson exists only at `packet-10.md:57`. CLAUDE.md "Update on progress" and `lead.md:41-43` still send fan-outs through a Workflow. |
| 4 | Decision 0119 confines the pod to the WebGPU loop, so a GPU-visual defect on WebGL (the sun disc and bloom) was probed with 6–12-min SwiftShader renders, five times over. |
| 5 | The review fired on a red first preflight and again on the re-run. The 23:59 runner went red on `placement` after the review-fixes lane. Lanes ran stale generated files (place names, blueprint export, purpose ledger: the planner's 23:26 line) without the regenerate step. |
| 6 | Shared-file writers ran beside publishers. The serialise-catalogue-writers lesson is in memory, not in any brief template or tool. |
| 7 | The planner's 01:02 close-out said "nothing else is pending on my side" while a lead, its child and a pod were live. No step makes a packet name the work still running. |
| 8 | The kit build has no incremental path for one changed piece; the lane rebuilt the whole kit per change. Not sized here. |
| 9 | Notifications for running lanes arrive at the planner whatever their content. Partly addressed by `lane_wait.py`, which routes children to their lead. |
| 10 | A full worktree checkout was used for "before" shots; a partial checkout or `git archive` of three folders is enough (the lane's own note). |

## 3. Proposals

Minutes per week assume three walk rounds, two of them with new types.

| P | Change | File and mechanism | Saves per week | Make now (<20 min) |
|---|---|---|---|---|
| P1 | A first-of-type place runs as three briefs, each a fresh place-builder continuing from the round folder: (a) site, layout and kits to compile-green; (b) `wb round` to check-green; (c) publish, text-review list and packet shots. | `.claude/skills/place-build/SKILL.md` (stage list) and the 16k place brief template in `16k-place-loop.md`. Sentence for `place-builder.md:23`: "A first-of-type place is three briefs (layout+kits, rounds, publish); return at each stage's green with the round folder as the note." | ~150–200 units (#1: ~100 recoverable per walk at a ~150k mean) | yes |
| P2 | Give "monitor" a measurement: `lane_status.py` prints, per running agent, elapsed, turns, current context and units from its transcript. The planner runs it on a goal check-in instead of answering "Interim". An agent past 2× its expected minutes or 300k context is split from its note by the planner's decision, never by a cap. | New `tooling/repo-standards/lane_status.py`, reusing `agent_guard.py`'s transcript reader. One sentence in CLAUDE.md "Chunk, monitor, never cap". | makes P1 visible; ~4 units of empty wakes become useful ones | yes |
| P3 | A Workflow carries only leaf agents (find, run, readers, judges). A lane that spawns agents (lead, place-builder, deliver with judges) launches with Agent `run_in_background`. | CLAUDE.md "Update on progress" last sentence; `lead.md:41-43` | ~30 units and ~80 min of wall (#3) | yes |
| P4 | Work runs while the owner walks: the packet step launches the walk-independent lanes before posting. A packet or close-out lists every live agent and pod with its expected end ("keep the VM up until ~HH:MM", or "stopped at green, note X"); it never says "nothing pending" while one runs. Every pod is deleted, or handed over by id, before its creating agent returns. | `16k-place-loop.md` packet step; `owner_inbox.py --post` prints the count of subagent transcripts written in the last 3 min; one line in `deliver.md` on pods | 81 VM-min per walk becomes work; the #7 loss; an orphaned pod (~$0.13/h) | yes |
| P5 | The packet merge job merges `dev` into `webgpu`, builds it and runs `webgpu-boot-check` (or at least its console-error pass), before pushing either branch. | `16k-place-loop.md` packet step; `run` brief for merge and deploy | the owner's failed WebGPU walk; one owner round trip | doc yes; the merge itself is a lane |
| P6 | Any render probe that takes over 5 min on SwiftShader runs on the pod (about $0.01 a run), WebGL included. | `docs/decisions/0119-runpod-is-the-gpu-lane.md` scope sentence; CLAUDE.md RunPod line | ~60 min of critical path per visual defect | yes; the owner authorised RunPod rule changes in `tmp/16k-user-instruction.md` (Goal 3) |
| P7 | A lane that rewrites a catalogue-wide file (every kit manifest, catalogue, ledger) runs before or after the publishing lanes, never beside them, and commits in the step that writes. | `lead.md` and the 16k brief template "Shared files" line | ~14 units and 130 agent-min (#6) | yes |
| P8 | The review fires only on a green scoped preflight, once per batch id that survives commits. Verify first whether `batchId` falls back to `head` (`workflow_drift.py:69`) and so mints a new batch after every commit. | `tooling/repo-standards/review_gate.py`, `preflight.mjs` | ~1.3 units and ~6 min per close | after a find confirms the cause |
| P9 | Fix the `minerFullRuns` matcher, which r7 recommended and nobody made: drift is still RED on it today. Match on `tool` starting with `worldgen.mine_`. | `tooling/repo-standards/workflow_drift.py:69-71` plus a test | makes the audit trigger readable | yes (5 min) |
| P10 | Every "not done" or "queued" line in a lane report gets a decision before the packet: done now, or a backlog row with an owning-phase reason (`backlog.md:3-5`). The packet lists none. | 16k packet step; `deliver.md` hand-off rule | ends the queued class below | yes |

### Queued, not delivered (each a line the owner asked to see)

- `tooling/.reports/16k/walk9/packet-10.md:56`: lead hand-back "fix queued for the next method review". Made since (f4c9797f).
- `packet-10.md:57`: "Lanes that need fan-out now launch directly, not through Workflow". Written in no rule (P3).
- `docs/research/phase16/method-review-r7.md` (the partial version), Recommendations: the `workflow_drift.py:71` matcher. Not made; still red (P9).
- `place-type-10.md:66-67`: `record_coherence` route fallback and promise-ledger `structure` rows, "dirty in another lane, so I did not edit it".
- `integration.md:10`: 11 request rows "queued to P-polish/backlog.md (tooling tasks)".
- `place-type-9.md:93` and `dressing-three-places.md:51`: backlog rows (brazier, two-end bunting hang).
- `webgpu-loop.md:17,96,139-165`: "queued below" and "Next WebGPU lane" items.
- `lights-followup.md:15`: the sun disc gives 0 glow at 06:30, left open.
- `wind-and-ground-seam.md:23`: the Chrome frame pair, not done.
- `process-and-policy.md:22`: the PROGRESS packet-9 row rewrite, left to the planner.

## 4. Adversarial pass

- **P1. "Splitting re-pays orientation."** Each new builder re-reads the skill and the round folder: about 40–60k of cache creation, about 0.1 units. D4 spent 33 units above 200k. "Is it a cap?" No. It is the chunking 0118 d1 already orders, given a size. **Kept.**
- **P2. "Monitoring adds planner turns at 400k context."** It replaces turns that already happen (117 "Interim" replies). "It is a cap in disguise." The planner decides, as 0118 d1 says; nothing refuses. **Kept.**
- **P3. "Without Workflow the planner wakes twice per lane: the cost 0079 rule 13 removed."** 11 lanes × 2 wakes × ~0.04 units is about 1 unit, against 31 units of relaunches. Leads now absorb their children's wakes (`lane_wait.py`). **Kept.**
- **P4. "Running lanes during the walk keeps the VM up longer."** The VM is up for the walk anyway (81 min). "The owner may want the VM off." The packet tells them what stopping it kills; the owner chooses. **Kept.**
- **P5. "Merging every packet costs a conflict-resolution lane, and 0111 keeps `webgpu` apart."** 0111 separates the renderer, not the assets. The deployed `/webgpu/` build already serves `dev`'s assets, so divergence breaks it by construction. **Kept.** The cheaper half (boot check before push) holds even if the merge cadence changes.
- **P6. "It moves the cost to dollars, and a pod boot takes 4–6 min."** A 7–12-min probe run 15 times against a $0.13/h pod: the dollars are cents, and 0119's own test ("faster end to end") passes. "It breaks 0119." It amends 0119, which the owner's instruction authorises. **Kept.**
- **P7. "Serialising costs wall time."** The displayName lane ran 7 min; running it first costs 7 min and saved 130 agent-min. **Kept.**
- **P8. "It may just move the review later and miss red code."** The review reads the diff, not test results. A red preflight's fixes are in the batch the review already covers. The cause is unverified. **Kept conditionally.**
- **P9.** No counter-argument. **Kept.**
- **P10. "It forces fixes the owner may not want now."** `backlog.md:3-5` already allows a row with an owning phase; P10 only forbids the unreasoned "queued". **Kept.**
- **Dropped: the runner preflight count (#5, 16 min).** CLAUDE.md already says the runner runs once before a merge, and "a red is fixed first". The third run followed a real red. P8 and the regenerate step (root cause 5) remove the cause. A new rule would duplicate an existing one.
- **Dropped: incremental kit build (#8).** Its size is unmeasured. It goes to the measured perf lane, not a rule.

## 5. Verdict

No, we are not running as efficiently as possible. Walk 8 showed the frontier: 24 units for a fix round. Walk 9 spent 212, and two-thirds of that bought nothing that a stage-sized brief would not have bought at a third of the context. The single biggest remaining inefficiency is one-context briefs with no size: a first-of-type place briefed as one job inside a Workflow, where nobody can see or split it. P1 and P2 together close it. P3 and P4 remove the next two losses: relaunches, and VM time spent waiting on the walk.

## Recommendations

- Make P1, P2, P3, P4, P6, P7, P9 and P10 this session as one ways-of-working change. The evidence is in the table rows above.
- Brief a `find` agent on P8 (`review_gate.py` batch key) before changing it.
- Ask the owner, or check the RunPod plugin, for pod `x3lo34wf7lpiai` (created 00:08, no deletion on record) and pod `9rg8lcctgoqnwi`. Delete them if they are still running.
- Merge `dev` into `webgpu` first in today's WebGPU lane (P5). It is the likely whole cause of the walk-10 load failure.
- Update the round-7 row of `method-reviews.md` to this file's figures. Run the next audit at the close of walk 10.

Covered: planner transcripts 006d39bb and 07f5b4c0 with all 136 subagent transcripts (Workflow children included); reviewer sessions 7beb4bad, ae64361e and fee8499f; workflows wf_850401f3, wf_a1bcaee9 and wf_4ecaba8f; `tooling/.reports/16k/walk8/` and `walk9/` (every file listed; the lane reports cited above read); `tooling/.reports/job-guard/` (765 logs from 10-01 12:59); `preflight/runs.jsonl`; `review/reviews.jsonl`; the owner inbox list; git log since 10-01; `workflow_drift.py` and `build_ledger.py --report`; `/var/log/es-idle.log`; journalctl at 01:11; `last -x` · Skipped: the RunPod account (no pod tool in this agent); walk 10's current session (out of scope); `session_tokens.py` per-session splits (its 2-day table mixes in older sessions; units here come from the transcripts)
