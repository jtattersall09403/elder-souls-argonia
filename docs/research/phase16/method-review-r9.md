# Method review round 9: walk-10 close (2026-10-03 09:16 UTC)

Headline: not yet minimum-waste. Most r8 and tick tweaks landed as rules or tools. The largest remaining cost is leads re-arming `lane_wait` at 150-200k context while 25-80 min pod captures run. Those captures are long because settlement build time dominates load (79.6 s complete on webgpu, builds 224-345 s per view).

## Reconciliation
- Live docs: `docs/research/phase16/method-reviews.md` (index, rows 7-8), `method-review-r8.md`, `.claude/agents/lead.md`, `tooling/gpu-lane/README.md`, `docs/phases/lanes/performance-lane.md`.
- r8 losses #2 (background-job stalls) and #6 (shared Chrome) did not recur. #1 (two harnesses) recurred once (monitor-1455: gputool2 vs branch tool) and was then closed at lead.md:53.
- Writer: add row 9 to method-reviews.md and put this file beside r8. No new doc.

## 1. Ledger (lane_status --hours 40, raw in tooling/.reports/16k/walk10/method-review-r9-raw/lane_status.txt)
Span 2026-10-02 08:33 to 2026-10-03 09:16 (~24.7 h). 1063 agents, 11,353 agent-min, 397.3 units. session_tokens --sessions 1: session 55d9cb60, 547 planner turns, 251.7M cached.

| type | agents | agent-min | units |
|---|---|---|---|
| deliver | 228 | 2153 | 124.9 |
| lead | 43 | 4762 | 118.7 |
| run | 190 | 2991 | 41.8 |
| research | 195 | 394 | 34.9 |
| place-builder | 31 | 535 | 33.5 |
| deliver-small | 126 | 282 | 22.2 |
| find | 77 | 126 | 12.2 |
| image-reader | 167 | 107 | 8.5 |

Lead launches by lane (lane_status labels): perf 14, webgpu 11, vol 10, audit 7, walk 1. Top-level `#` headers per note: perf-lead.md 13, webgpu-lead.md 10, vol-lead.md 10, audit-lead.md 6, walk-lead.md 1. Of the 43 leads, 30 peaked over 150k context and 6 over 200k: 266k, 225k, 223k, 222k, 214k, 201k.

Pods, from the notes' ledgers at $0.13/h each:
- perf: one pod since 08:53, about $2.2 at the last entry.
- vol: pod 1 about $1.93; second pod 6v9g about $0.52.
- audit: three rounds of three community RTX 3070s, about $0.45 + $0.21 + $0.20.
- webgpu and walk: about $2 and under $0.3.
- Total about $7-8 against the $15/month cap (0119).

## 2. Tweaks: made vs recurred
Made, each with a commit:
- lane_wait `--since` (d75a222e, ccc03484)
- light slot pool for pod-driving jobs (bca65f5d)
- pkill and kill-by-pattern refused (489cfb23)
- lane_watch mechanical watchdog (bb3f0723)
- no waiting lines (49caf381)
- standards look-up once per lane, and capture after the wave's last fix (0bda5747)
- smoke before full capture and one pod per lane (28d0ea2d)
- one pod per fan-out worker (08f63330)
- Chrome liveness and hand-off while measuring (67a79b96)
- context-hygiene rule (0) (ba906ac3)
- one place per place-builder (dfbdf4c4)
- voloff withParam (6eb92582), pod-sync add-only (96705de1), prep-time split with build skip (prep 3516 s to 12.9 s), shader compile check (55ef3dfe), fixes.md ledger

| class | occurrences in ticks | after the rule landed? |
|---|---|---|
| idle wait or "waiting" turns | ~130 turns, over 13 ticks with 2-11 each (0025-0550, 1455-2345) | yes: 0350 ×7, 0510 ×5, 0550 ×8 after 49caf381 |
| lead idle on a capture with no parallel work | 13 spans, 17-46 min, ~390 lead-min (0225, 0710, 1020, 1220, 1300, 1420, 1500, 1700, 1820, 2025) | yes; it is legal under lead.md |
| stale captures (pre-fix build, or cause already known) | 8: iter15, iter25, iter27×3, iter30, iter9b, c5m1, vol r9 (1700/1820) | yes: iter30 and r9 came after 0bda5747 |
| duplicate children or jobs | 5: perf gsw ×3 (1140), smoke2 ×2 (2020), gputool2 vs branch tool (1455), perf republish of audit's re-export (2020), vol double merge (1140) | yes |
| leads over 150k context | 30 of 43 (over 200k: 6) | yes, falling: late leads 119-191k |
| pattern kills | 1: vol pkill killed 4 webgpu captures, ~35 min (1905) | no, after 489cfb23 |
| pods idle or extra | 6: vol 8fk2 (0510), audit ×3 (1220), audit w2 20 min (1300), webgpu left up (1500), second pods (1730, 1820) | yes, after lane_watch |
| shared cause reported by several lanes | settlement build reported as FAIL by 3 lanes (1540, 1700, 1820); vol re-found webgpu's fix (2225); fire-buffer class (2020) | yes: the 1540 tweak was not applied |

## 3. Five largest remaining losses
| # | loss | minutes | root cause |
|---|---|---|---|
| 1 | Leads re-arming 9-min lane_wait at 150-200k on long captures | ~390 lead-min, ~45 turns, ~7M tokens (leads are 30 % of units) | lead.md:70 makes the lead the waiter; Bash caps a wait at 600 s |
| 2 | Captures voided by harness validity defects: voloff never off (r2-r7), paused clock (all of iter ≤9b), rate=30 units (c4m1, c4m2), iter24 crash after 8/23 views, iter7/iter32 Chrome gone, r2a capture-timeout | ~250 (≈2 invalid rounds plus ~70 direct) | the harness accepts a run whose clock did not advance or whose off twin equals on; rules exist (lead.md:163), no check fails |
| 3 | Stale captures | ~160 pod/run-min | no capture records which commit it measures against the lane's latest fix |
| 4 | Cross-lane duplication: settlement-load FAIL rows in 3 lanes, re-found fixes, dup harness/republish, merges | ~100 | no owner field per shared cause; fixes.md is read by vol only |
| 5 | Capture wall itself: 2-3.8 min per view (vol r1 79.8 min, r4 2035 s, iter28 35 min), dominated by settlement builds | ~20-40 per round per lane | perf's 0120 stage 2 (dd0fe53b: complete 23.1 s on dev) is not on the webgpu/vol branches (native complete 57.9 s, 2020) |

## 4. Proposals (after adversarial pass)
| P | change | file and mechanism | saves | make now |
|---|---|---|---|---|
| A | Park, don't wait: a lead whose next step is a capture expected over 20 min writes its note and returns "parked: <done-marker>". The planner holds one lane_wait over all lanes' markers and relaunches from the note | `.claude/agents/lead.md` wait rule (line 70); planner protocol in `docs/phases/16-foundation-and-places/16k-place-loop.md` | ~3 re-arms at 170k (510k) per wait vs a ~70k fresh start; ~5M tokens per walk | yes |
| B | Validity checks that fail: pod-capture asserts the game clock advanced between ready and capture, rejects duplicate URL params, and checks that an `-off` twin's hash differs from on. It aborts the view with `invalid:` in summary.md | `tooling/gpu-lane/pod-capture.mjs` view loop; test beside | ~1 invalid round per walk (≥60 min). Two occurrences each, so it meets the 0106 gate bar | yes (~15 min) |
| C | Stale-capture flag: every summary.md records the dist sha. lane_watch flags a running capture whose sha predates a newer fix commit on its branch under packages/, unless the brief says `--baseline` | `pod-capture.mjs` summary header; `tooling/repo-standards/lane_watch.py` rule | ~20 min per incident, 8 incidents | no (~20 min) |
| D | One owner per shared cause: a "Shared causes" table (cause, owner lane, status) at the top of fixes.md. Judges mark rows owned by another lane as "owned", not FAIL | `tooling/.reports/16k/walk10/fixes.md` template → `tooling/gpu-lane/README.md` "Lanes" section; lead.md line 80 | ~15 min per lane per round | yes |
| E | Take 0120 stage 2 onto webgpu and webgpu-vol before their next capture round | merge dev (dd0fe53b) into the branches | ~35 s per view load, ~10-20 min per capture | yes (merge job, product work) |

Adversarial:
- **A:** "the parked lead loses live judgement". The notes already carry it: successors oriented in 1-2 min (monitor-0820, 1540). "The planner then pays the wait". One planner re-arm covers four lanes, instead of four leads at 170k. Survives.
- **B:** "lead.md already says rate=0.5". The rule existed and the paused clock still voided rounds in two lanes (2105; audit, 0305), so a rule is not enough. Survives.
- **C:** "the 0bda5747 rule covers it". iter30 and r9 ran after it. Survives, as a lane_watch rule and not a new gate.
- **D:** "fixes.md exists". It has no owner column, and the settlement row was re-reported after the 1540 tweak. Survives.
- **E:** product rather than process, but it is the biggest lever on loss #1. Kept.
- **Rejected:** longer lane_wait timeouts (the 600 s Bash cap); fewer lanes (the losses are per lane, not caused by parallelism); a planner monitor tick shorter than 40 min (the ticks already cost 0.1 units each, and their tweaks land).

## 5. Verdict
No. The process now prevents most of the classes it measured, but waste remains in leads idling at high context on long captures, the single biggest inefficiency (#1, fixed by A, shrunk by E), and in captures the harness lets run invalid or stale (#2, #3; B, C).
