# Method review round 8: walk-10 round, live at 12:15 UTC (2026-10-02)

Headline: the two GPU lanes cost 39.8 of 42.8 measured units. Their largest avoidable loss was building and running two separate pod harnesses in parallel. Each child of either lane that ended its turn on a background job stalled the critical path for 21–29 min. Pod dollars are negligible ($0.13/h per pod); the loss is wall time and lead context.

Session 55d9cb60 (the brief's id 07f5b4c0 is the walk-9 session folder; this round's transcripts are under the 55d9cb60 session folder). Raw data: tooling/.reports/16k/walk10/method-review-r8-raw/ls.txt (lane_status), tooling/.reports/16k/walk10/method-review-r8-raw/p.py (tool-wait parser).

## Reconciliation
- **Live docs:** `docs/research/phase16/method-reviews.md` (index), `method-review-r7.md`, `tooling/gpu-lane/README.md`, `.claude/agents/lead.md`, decision 0118, decision 0119, `docs/phases/lanes/performance-lane.md`.
- **Confirmed:** r7's finding that long lead contexts are the main unit cost. Leads are 14.8 of 42.8 units.
- **Already landed, not re-proposed:** lane_wait, image-reader, Workflow for leaf agents only, lane_status, the foreground-job rule (04f0f22f, 12:05; it fixes loss #2 below), pods by id, measure.mjs closing orphan tabs (83b33d7b), and the pod Chrome no-throttle flags with a capture window per tab (a8e7e4df, 12:00).
- **Writer edits:** add a round-8 row to `method-reviews.md` and put this file beside r7. Make the P-changes in the files named below. No new doc.

## 1. Ledger (lane_status at 12:14; the WebGPU lead and the perf successor are still live)
| lane | agents | agent-min | units |
|---|---|---|---|
| WebGPU (lead a3f4bbaa + children) | 36 | 507 | 21.2 |
| Perf (leads ab7ab984, a86fc54a + children) | 30 | 581 | 18.5 |
| Planner side (finds, r7, ways-of-working) | 14 | 31 | 3.1 |

| type | agent-min | units |
|---|---|---|
| deliver | 474 | 19.2 |
| lead | 415 | 14.8 |
| research | 36 | 3.1 |
| run | 166 | 3.0 |
| find | 19 | 1.6 |
| deliver-small | 8 | 1.0 |
| image-reader | 2 | 0.2 |

Most expensive single agents:
- WebGPU lead: 7.81 units, 149 messages, 21.0M context summed. It crossed 200k at 10:29 and was still live at 256k at 12:14.
- Perf lead: 6.74 units, 17.3M summed. It crossed 200k at 11:44 and split at 12:05.
- Merge resolver a72c7905: 1.54 units. Necessary (24 conflicts).
- Batch 3b aa5ca6b0: 1.30 units, 30 min. It hand-patched probe scripts in /tmp five times, each followed by a 4–7 min wait.
- Fix twin leak ae228132: 1.14 units.
- Leak hunt a460106c: 1.09 units, 38 min, budget stop. Its cause was data streaming over the tunnel; see loss #1.

The leads' work was necessary. Their context was not: 42 `lane_wait` calls returned at the 9.0-min cap with no news (perf 22, WebGPU about 20). Each one is a lead turn at 150–250k context, about 8M of the 38M lead tokens.

Planner: 79 messages, 42 with text only, peak context 167k. It was silent from 10:03 to 12:03, while the WebGPU lead ran past 200k for 94 min before anyone asked it to split.

## 2. RunPod
| pod | lane | span | measuring (job-guard wall) | $ |
|---|---|---|---|---|
| x3lo34wf7lpiai | walk-9 leftover | 00:08–~09:45, 577 min idle, key lost | 0 | ~1.25 |
| 2nektax0vb41u2 | perf (WebGL) | 08:53–live (~200 min at 12:14) | ~70 min: base 23.7 (killed, exit 143), base2 ~20, base3 14, r1 ~8, r2 ~8 | ~0.45 |
| knj4qxcjtw1j1b | WebGPU | 09:05–live (~190 min) | ~60 min of captures, each ~5 min while data streamed over the tunnel (until 11:41) | ~0.42 |

Time per perf iteration, measured:

| step | time | evidence |
|---|---|---|
| build + compose | 22–42 s | job-guard perf10 |
| sync | incremental rsync | 540 MB first time, `perf-measure-base.md:3` |
| pod setup | 43–46 s, once | |
| ready | 21–26 s per spot | |
| settle + capture | 10 s + about 40 s per spot | |
| 7 spots + walk | ~8 min | |

The full loop from fix launch to the next fix launch took ~85 min (f1 10:12 → r1 10:31–10:40 → diag 10:44–11:02 → f4 11:06–11:33 → r2 11:36–11:44 → diag2 11:45–12:03):
- fix ≈ 25 min
- diagnose ≈ 18 min
- measure ≈ 9 min
- the rest is hand-offs at lane_wait granularity

Build and sync are not where the time goes; hot reload would save under 1 min per iteration.

Duplication between the lanes:
- **Two harnesses.** Perf stood up `tooling/gpu-lane` at 08:46: measure.mjs, sync-dist, a serve on the pod. WebGPU wrote /tmp/webgpu10/capture.mjs, capture3.mjs and measure.sh (`webgpu-iter1.md:5`, `webgpu-iter3.md:2`). It served from the VM through a reverse tunnel, so its data streamed and each measure took ~5 min (`webgpu-lead.md` item 18). It then canonicalised pod-capture.mjs (ad418952, 14 min) and moved serving onto the pod (a8a7dac3, 7 min, 11:41).
- **Two calibrations.** Perf r = 1.38 on base3 (`perf-lead.md` Calibration). WebGPU built its own dev dist (`/tmp/webgpu10/dist-dev`) and got r = 1.46, then 1.57–1.62, then used 1.5 (`webgpu-lead.md` item 14).
- **Port 9222 clash on the VM.** WebGPU's first iter1 run was discarded (`webgpu-iter1.md:27`).
- **Same host.** Both pods sit on host 64.119.209.250, on different ports.

One pod for both lanes is not advised: concurrent captures perturb each other's fps, and the second pod costs $0.13/h.

## 3. Looping
| lane | measure rounds | what each found |
|---|---|---|
| Perf | base (void: vsync cap, ready timeout), base2 (void: ready fired while streaming), base3 (valid at 09:59), r1, r2; r2clean+r3 live | base3 profile: program churn and rapier. r1: the 3 s and 2 s hitches remained, so diag found the pivot heightfield query, the setSpawnKm re-render and the retry timer. r2: diag2 found O1–O11 (660 of 1508 draws empty, material clones, matrixAutoUpdate), none of which the base3 diagnosis looked for (no per-draw census) |
| WebGPU | iter1, iter1b, iter2, iter3, plus 3 diagnosis-on-pod children | each found a new blocking class (destroyed texture → wasm OOM → black composite → depth mismatch from a second renderer → night). Serial by nature: each fix unmasked the next. Three budget stops: depth (unproven), leak (streaming), night (stalled tabs) |

Children that stalled by ending their turn on a background job:
- ac120c3a: 23.6 min.
- a8b5980c: 21.2 min, then 91 min idle after a partial report.
- a7d2448c: 8.7 + 29.2 min.

That is ~83 min, all on critical paths (the perf baseline, WebGPU iter2). The rule landed at 12:05.

Relaunches:
- "Pod measure after batch 1 (retry)" aaaba270: r1.sh exited 1 after 13 s, and r1-ab1 exited 1 once.
- "Resume leak hunt with pod serve" a6c747fb, after the streaming stop.

## 4. Duplication
- Standards look-ups ran once per lane (afed98a4, a84670d0), 0.18 units together. Both lanes read the same `engineering.md`. Small.
- Orientation: the successor perf lead a86fc54a launched batch 5 within 1 min of start, at 66k context. The hand-off note works.
- In-agent repeats:
  - aa5ca6b0 edited /tmp/perf10/probe-f4*.mjs five times, each followed by a 4–7 min re-run.
  - a460106c ran five sequential 3–6 min heap runs (D, E, diff).
  These are serial probe loops, not re-reads.

## 5. Planner and splits
- The planner has 79 messages; none is a bare "interim" wake. That fixes r7's #9.
- Gap: two hours with no check-in (10:03–12:03), during which the WebGPU lead passed 200k at 10:29.
- The perf split cost ~1 min of successor orientation and a 66k start. It avoided at least 20 min of turns at 225k+. It paid. It should have come about 40 min earlier, at 150k (10:30).

## Top ten losses
| # | loss | minutes | root cause |
|---|---|---|---|
| 1 | Second, ad-hoc WebGPU harness with VM-side serving: streamed captures, port clash, canonicalisation, podserve, leak-hunt budget stop | ~80 agent-min | the lead brief did not name tooling/gpu-lane as the single pod harness for both lanes |
| 2 | Children ended their turn on a background job | ~83 critical-path min | landed 04f0f22f |
| 3 | Perf baseline: 08:55→09:59 to the first valid numbers (base killed at 1420 s, base2 void) | ~45 | no 1-spot smoke gate (vsync cap, ready gate, non-black) before a 7-spot run |
| 4 | Diagnoses that found causes one round late (diag2's O1–O11 were present at base3) | ~85 (one iteration) | the first pod diagnosis had no per-draw census or walk-hitch timeline |
| 5 | Lead lane_wait timeouts at 150–256k context; WebGPU lead >200k for 105 min | ~8M tokens | split threshold 200k, applied by the planner, not by the lead itself |
| 6 | Shared pod Chrome contamination: orphan tabs in r2 (r2 1 % lows void, r2clean re-run), stalled background tabs in fix-night (3 of 8 runs) | ~45 | landed 12:00 and 83b33d7b |
| 7 | WebGPU fix-depth budget stop with the fix unproven | ~13 | fix agent had no pod measure step of its own |
| 8 | Leftover walk-9 pod idle | 577 pod-min, $1.25 | r7 P4 (pods by id) landed |
| 9 | Duplicate calibration (dev dist build plus E-runs in two iterations) | ~10 | r not recorded in one place for both lanes |
| 10 | Probe-script hand-patching loops in /tmp (batch 3b, leak hunt) | ~30 | no reusable probe hooks in gpu-lane (program-relink counter, heap diff) |

## Proposals
| P | change | file and mechanism | saves per round | make now |
|---|---|---|---|---|
| A | One pod harness. tooling/gpu-lane is the only tool for any pod work, WebGL or WebGPU, and the site is always served from the pod (sync then serve; never a VM serve over a reverse tunnel). Each lane uses its own CDP port, chosen per lane in the README table. GPU-lane briefs name it | `tooling/gpu-lane/README.md` (one "Lanes" table: port, key path, pod id); `.claude/agents/lead.md` GPU-lane line; fold capture3/measure.sh into pod-capture.mjs (already canonical) | ~60–80 agent-min | yes (docs); the code merge is already done |
| B | A smoke gate before any baseline: one spot, 60 s. It checks fps above the 58.5 cap, ready within 40 s, luma non-black, 0 GPU errors, and that every tab is owned. A full 7-spot run only after it passes | `tooling/gpu-lane/measure.mjs --smoke` (exits non-zero on any check) and README step 1 | ~40 min per new lane or branch | no (~30 min) |
| C | The first pod diagnosis is one canned run: profile, per-draw census (draws by material/object, empty instanced draws), walk-hitch timeline and heap slope. The diagnosis lists every cause before the first fix batch | `measure.mjs --census` (count renderBufferDirect per object, the instance count==0 flag); lead.md "diagnose before fixing: census + profile + walk" | ~1 iteration ≈ 85 min wall on a perf lane | no |
| D | Calibration r has one home and one owner. performance-lane.md holds r, its build sha, its spot and its date. A lane re-measures r only when the pod GPU type or the reference build changes | `docs/phases/lanes/performance-lane.md` calibration row; README pointer | ~10 min plus the 1.38 vs 1.5 ambiguity | yes |
| E | The lead splits itself. After every lane_wait it reads its own context from `lane_status.py --self` (or its transcript), and at 150k it writes its note and returns | `.claude/agents/lead.md` wait loop; `lane_status.py --agent <id>` one-line mode | ~3–5M lead tokens (~2 units) per lane | yes (lead.md); `--agent` 10 min |
| F | Probe hooks ship in gpu-lane, not /tmp: a relink counter, a heap-diff and an object-growth counter selectable by `?diag=` flags, so a diagnosis toggles flags rather than editing scripts | `tooling/gpu-lane/probes/` plus measure.mjs `--probe` | ~30 agent-min | no |

## Adversarial
- **A:** "the WebGPU lane needed WebGPU-specific capture (GPU errors, luma)". True, but pod-capture.mjs now carries both, and serving from the pod is backend-independent. The 5-min streaming alone justifies it. Survives.
- **B:** "base3 found the bugs anyway". The 64 min to a valid baseline is the cost, and both voiding defects (vsync cap, early ready) were checkable in 60 s. The README gotchas now record them, so the next lane may avoid them without a gate. Survives with reduced value (~20 min). Kept, because the r7 rule is 'make a check that can fail'.
- **C:** "WebGPU's causes were serial by nature; a census would not have found the black composite". Correct for WebGPU, so C is scoped to perf/CPU lanes. For perf, the O1 count was derivable from the base3 calls/draws gap (969 calls vs 524 draws, noted at `webgpu-lead.md` item 10 for the other lane). Survives for perf lanes only.
- **D:** "1.38 vs 1.5 is within the 20 % agreement bar". Yet the WebGPU lane spent two capture slots on E-runs and a separate build. Survives as a doc row (cheap).
- **E:** "splitting loses the lead's live judgement". The perf successor relaunched in 1 min at 66k. Survives.
- **F:** "probes are per-bug; a library is over-engineering". The relink counter was used three times (f1, f4a, f4b) and the heap diff twice. Survives as two probes only.
- **Rejected:**
  - Hot reload or a persistent Chrome reload instead of rebuild and sync: the build is 22–42 s and rsync is incremental, so it saves under 1 min per iteration.
  - One pod for both lanes: fps contention, for $0.13/h saved.
  - Batching candidate fixes behind flags into one run: perf already does this (r1-ab `occl=0`, ab3 water/veg=0).
  - Correctness on SwiftShader on the VM: the smoke at 0.5 fps (`perf-gpulane.md:8`) and walk 9's 6–12 min probes show it is slower than a pod run.

## Verdict
Not yet as efficient as possible. Today's lanes ran without planner waste, but two GPU harnesses ran side by side. The largest remaining inefficiency is structural: the ~85-min fix–measure loop is mostly fix (25 min) and diagnosis (18 min) at lead-turn granularity, and diagnoses find causes one round late (C).
