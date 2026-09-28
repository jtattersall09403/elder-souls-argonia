# Workflow cost review, 2026-09-28 (specimen: session 925af94b, 16k walk 3)

Headline: the day's real cost was 22 Opus deliver lanes carrying 116k–339k tokens of
orientation each, which then waited on a placement preflight that was never scoped and
never green. 545 M of the session's ~680 M tokens went to deliver lanes (96 % cache reads).
The preflight ran 16 times against 7 commits, and each of the 16 runs ended red on tests
already red on HEAD. The code review ran 13 times (36.5 M tokens), docs-only diffs
included. One kit piece set off an 83 min abuts full run and a 17.8 min mounts full run.

Raw extracts behind every number: /tmp/cr/ (925.txt per-agent wall/tokens/bash buckets,
table.md, cr-tokens.txt at /tmp/cr-tokens.txt, an.py, pf.py, pf2.py, or.py). The
transcripts are at `~/.claude/projects/-workspaces-elder-souls-argonia/925af94b-…/subagents/`.

## Reconciliation

- `docs/research/agent-ops/cost-reviews.md` (the cost-review skill's rolling log) covers
  planner-side cost (turns, explore calls, sleeps). This review confirms those controls
  hold: 1.0 shell calls and 0 sleeps per session over the last day (/tmp/cr-tokens.txt).
  It adds the side that log does not measure: subagent lanes, gates and miners.
- Decision 0079 rule 8 and CLAUDE.md:84 say preflight runs "once before a commit" and
  the review runs itself first. Today's measurement contradicts the practice (16 runs,
  7 commits) and the premise of scoping (placement ran 168 of 168 test files in 8 of 16 runs).
- `brief-L19.md:52-60` (owner rulings 2026-09-28) already names S29 (incremental
  mining) and S30 (scope the placement gate). The numbers below confirm and size both.
- Single doc to edit when the owner accepts: CLAUDE.md lines 61-62, 71, 73, 82-85
  (the replacement text is at the end of this file), plus decision 0079 as the dated record.

## 1. The specimen day (07:47–15:29, 462 min of planner wall)

| agent class | count | lane-min | tokens M (cache-read M) |
|---|---|---|---|
| planner (Fable) | 1 | 462 | 47.8 (46.8) |
| deliver (Opus) | 22 | 637 | 545 (533) |
| find (Haiku) | 17 | 45 | 28.7 (26.4) |
| research (Opus) | 3 | 16 | 10.1 |
| run + preflight (Sonnet) | 9 | 11 | 3.9 |
| headless code review (Opus, review_gate.py) | 13 | 21 | 36.5 |
| headless text-review | 6 | 6 | 3.3 |

Per deliver or research lane (bash-time buckets are summed tool-call durations inside the
lane; background jobs such as L12's 83 min abuts run fall outside them):

| start | lane | wall min | tokens M | preflight min/runs-calls | kit min | miner min | tests min | produced |
|---|---|---|---|---|---|---|---|---|
| 08:06 | Fix compose pruning, gates, read | 27.9 | 24.36 | 12.6 |  |  |  | deploy fix: empty places (bf9def16) |
| 08:13 | L2 lights | 2.4 | 0.80 |  |  |  | 0.6 | lights band |
| 08:13 | L3 renders | 8.4 | 5.18 |  |  |  | 3.0 | text-free renders |
| 08:13 | L4 sourcing + kits | 18.4 | 19.40 |  | 1.0 | 5.0 |  | Murkmire platform sourcing, kits |
| 08:13 | L6 rules, gates, docs | 14.2 | 14.90 |  |  |  |  | 0105 rules, gates, docs |
| 08:13 | L5 sick Hist tree | 31.7 | 20.46 |  | 9.1 | 6.6 |  | sick Hist tree + lanterns |
| 08:13 | L8 speed-up | 9.2 | 5.59 |  |  |  |  | fixture_density/per-dwelling speed-up |
| 08:52 | Fix the three review items, reru | 25.4 | 16.63 | 4.9 |  |  | 1.1 | review-item fixes + preflight reruns |
| 09:19 | L9 Riften stables kit + imperial | 29.0 | 16.68 |  | 12.7 | 4.2 |  | Riften stables kit |
| 09:19 | L10 sink miner reads the master' | 51.1 | 16.83 |  |  | 23.8 |  | sink miner fix, 2 full runs |
| 09:19 | L11 workbench hand-off state, me | 17.9 | 23.56 |  |  |  | 2.5 | workbench hand-off, method docs |
| 10:11 | L12 close wave 2 | 97.5 | 72.39 | 16.4 | 16.8 | 3.2 | 5.3 | close wave 2 (abuts full run 83 min, background) |
| 11:51 | L7 | 21.0 | 21.42 |  |  |  |  | Claywater stable siting |
| 11:51 | L13 | 38.0 | 25.56 | 3.8 |  | 4.2 |  | setting class, mounts full run 1066 s |
| 12:30 | L7b fix round | 47.1 | 53.36 | 10.0 | 2.1 | 1.0 |  | Claywater stable siting |
| 12:30 | Method review round 5 (adversari | 7.0 | 6.42 |  |  |  |  | adversarial method review r5 |
| 12:38 | L14 interior cell supply | 39.5 | 14.92 | 7.4 | 12.0 | 2.8 | 0.8 | interior cell supply (+328 meshes) |
| 13:18 | L15 method follow-ups | 31.8 | 38.62 | 4.7 |  | 0.5 | 2.5 | 0105 addendum 3, R31-R40, ledger |
| 13:18 | L17 Murkmire stand-ins | 17.5 | 13.05 | 4.0 |  |  |  | 29 stand-in records |
| 13:36 | L18 absent-form classing | 34.6 | 22.15 | 5.1 | 2.3 |  | 5.7 | absent-form classing (239 rows) |
| 13:50 | Re-count the per-dwelling dressi | 8.2 | 3.35 |  |  |  |  | re-count dwelling bar |
| 14:12 | L16 Greenspring + Claywater repu | 61.3 | 102.94 | 11.4 | 2.6 | 2.0 | 4.5 | Greenspring + Claywater republish |
| 15:14 | L20 Greenspring last reds | 6.7 | 7.82 |  |  |  |  | Greenspring last reds (2 runs) |
| 15:21 | L20 Greenspring last reds | 6.6 | 8.19 |  |  |  |  | Greenspring last reds (2 runs) |
| 15:29 | Whole-workflow cost review (Opus | 0.9 | 0.35 |  |  |  |  |  |

Where the 637 deliver lane-minutes went (bash buckets, all lanes): preflight 82 min
(the 16 completed runs), kit builds 59 min, miners 53 min in the foreground plus 83 min
of abuts in the background (deliver-L12.md:30), tests 26 min, publish 14 min, lint 4 min,
review gate in-lane 3 min. The rest is model turns: reading, editing and reasoning.

Process-on-process lanes (rules, method, docs, reviews of method): L6, L8, L11, L15,
method review r5, re-count. Together they took 88 lane-min and 92 M tokens, 14 % of deliver
time and 17 % of deliver tokens.

Overruns against the brief's own budget: L12 150/75 min (deliver-L12.md:1), L15 100/75
(deliver-L15.md:3), L7 95/90 (deliver-L7.md:51). L16 ran 61 min on 103 M tokens.

Time to first edit (or.py): 5.3–97 min. Context carried at that moment: 116k–339k tokens
(median ~200k). Every later turn re-reads that context: that is the 533 M of cache reads.

## 2. Preflight

**What "scoped" skips.** `preflight_select.mjs:107-121` picks gates by input prefixes.
The Python suites then select tests with `tooling/world-generation/scripts/select_tests.py`,
and that script falls back to the WHOLE suite when:
- a shared file changes (conftest, `__init__`, pytest.ini): `select_tests.py:384-387`;
- any non-.py file inside the suite's own folder has no literal reader: `:426-430`. A
  README.md or a testdata JSON is enough. Logs: "168 of 168 test files (whole suite: no literal
  names tooling/world-generation/README.md; readers unknown)" (/tmp/pg/preflight1.txt,
  /tmp/l16/preflight.log).
- a kit or world-record change selects about 90 % of placement even when scoped: `select_tests.py:36-38`.

The placement suite holds 168 files and 3,405 tests (/tmp/l16/preflight.log: "3405 passed
… in 160.76s"). Placement ran whole in 8 of 16 runs and 67–123 files in the rest. Its wall
time was never under 109 s.

**Per-gate wall times across the 16 runs** (from the logs named in the brief):

| gate | min s | max s | typical |
|---|---|---|---|
| placement | 109 | 355 | 150–180 |
| workbench | 88 | 303 | 110–140 |
| pipeline | 6 | 750 | 60–250 |
| npm-test | 30 | 123 | 35–55 |
| typecheck | 20 | 257 | 25–33 |
| water | 12 | 62 | 25–35 |
| rasters, credits, site-refs, python-deps, bundle-load | 1 | 17 | 1–10 |

Wall per run is the slowest gate: 109–750 s, 3,615 s (60 min) summed over the 16 runs.
Workbench runs all 20–23 of its files in every run (never scoped). pipeline's 750 s
(/tmp/l12/preflight.log) and typecheck's 257 s (/tmp/preflight-3.log) are load spikes,
because they ran beside other lanes' miners and kit builds.

**Runs versus policy.** Completed runs: 16 (pf2.py). Commits: 7. CLAUDE.md:84 allows one
per commit, so 9 were re-runs. The worst case, settlement-fatal plus its review-fix lane,
ran 4 preflights for 1 commit (08:27, 08:33, 09:01, 09:17).

**Never green.** All 16 runs ended with at least one FAIL. Two reds sat on HEAD all day:
`test_mine_abuts::test_the_record_single_use_is_the_derived_set` (first red at 8f8222e5)
and `test_placement_metadata::test_repository_used_asset_coverage…` (first red at b14d07e5).
preflight.mjs:341-350 already labels such tests PRE-EXISTING and says "do not re-run for
them", but a red board still reads as a red board, so lanes re-ran. The two reds were never
fixed at source, and each run paid 110–180 s of placement time only to report them again.

**Review gate.** `review_gate.py:1-17` fires on any `npm run preflight` while an
uncommitted diff is unstamped. The only exclusions are `*.design.md` and dossiers
(`review_gate.py:250-251`), so docs, JSON records and rulings tables are reviewed like code.
FIX_WINDOW_MIN = 20 (`:41`). It fired 13 times today: 36.5 M tokens and ~21 min of wall,
0.8–3.8 min each. One review spawned a dedicated 25.4 min, 16.6 M-token fix lane with 4
preflight runs. L15's pathspec, mostly docs/decisions, was reviewed too.

**Text-review.** 6 headless runs, 3.3 M tokens, ~6 min. This one is cheap; batching saves little.

## 3. Mining

`kit-mining/SKILL.md:111-116` already says "mine per kit on demand" and keeps the
full-pool run for an overnight job. Two of the three miners can already do this:
- mounts: `mine_mounts.py:2447-2452` `--assets … --merge` replaces those assets' anchor
  rows and pairs. L13 still ran the full run anyway (1066 s, deliver-L13.md:36), although its
  brief said "no full run (affected rows only via the protocol)" (brief-L13.md:22).
- sink: `mine_designed_sink.py:1293-1297` `--assets … --merge`. L10 ran two full runs
  (761 s, then ~13 min: deliver-L10.md:33-35) because the miner's rule changed. That is a
  legitimate full run.
- abuts: `mine_abuts.py:738-747` has `--only/--set`, `--out` and `--write`, but no
  merge. `--write` replaces the whole `abuts` section. So skill step 20 is "the sample
  command over every set, no `--only`, plus `--write`" (SKILL.md:132), and one Riften
  stable cost 83 min (deliver-L12.md:30). The skill itself records 278 s and 251 s for the
  same run (SKILL.md:133); today's 18× gap is pool growth plus contention, and I did not
  separate the two.

**What incremental abuts needs.** The record is `kit-assemblies-mined.json` `abuts`.
Its `pairs` (329) and `familyPairs` (294) are rows keyed by (parent, child). Its
per-asset maps are `placedAssets` (545), `endFaces`, `doubleFaces`, `terminates`
and `runJointBars`. `families`, `singleUse` (1021) and `placedNoPairs` (472) are
derived lists. An `--assets X --merge` mode would:
1. walk only the cells whose references include X, keeping pairs where X is parent or child;
2. replace every row and per-asset key that names X;
3. recompute the derived lists (families, singleUse, placedNoPairs, familyPairs) from the
   merged rows as a pure function.

That split into rows plus derivation is also what `test_the_record_single_use_is_the_derived_set`
(red all day) asserts, so the same change probably fixes that red. `provenance` gains a
`merges[]` entry, as the mounts merge does.

## 4. Tokens

- Last 1 day, per session: planner 7 M cached, Opus subagents 46.3 M, Sonnet 1.1 M,
  Haiku 0.4 M, 8.7 M cost units. Last 7 days: planner 12 M, Opus subagents 53.2 M, 12.3 M
  units (/tmp/cr-tokens.txt, `session_tokens.py` per cost-review SKILL.md §1).
- Opus subagent tokens run 4–7× the planner's. The planner-side controls from 0079 work
  (bash-explore 0.3 % of carried context against the 68 % baseline).
- Costliest session in the window: 9fa85ef4 (yesterday into today), 155 turns, 112.5 M
  units, 15 deliver lanes.
- By lane type today (tokens, cache-read share): deliver 545 M (98 %), find 28.7 M, research
  10.1 M, run 3.8 M, preflight 0.1 M, headless reviews 39.8 M. find lanes are cheap
  per token (Haiku) but still averaged 1.7 M each, because a find lane also reads CLAUDE.md
  and its area.

## 5. Process overhead

| item | measure |
|---|---|
| decision records | 105 (0001–0105); 23 added in the last 7 days (git log --diff-filter=A) |
| 0105 alone | 321 lines, 20 KB, 50 rulings (R1–R50), 4 addenda, written 2026-09-27/28; L20 brief reaches R55 |
| rulings table | `place-build/references/rulings.md` 60 lines, 50 rows |
| place gates | 22 per place (deliver-L7b.md "22/22 gates"); `place_gates.py` 1213 lines |
| workbench | `wb.py` 116.5 KB; its suite 20–23 files, 88–303 s per preflight |
| place-build skill + references | 29 KB + 99 KB (lessons.md alone 37 KB) |
| always-loaded | CLAUDE.md 26.6 KB; 00-core 9.5 KB; PROGRESS 17.5 KB |
| 16k brief + phase README | 79 KB + 49 KB |

Orientation load for a place lane: CLAUDE.md, the skill, references, 0105, the 16k brief
and the lane brief come to ~290 KB, about 70–75k tokens before the lane opens a code file.
Measured context at first edit was 116k–339k, reached after 5–97 min. With 22 lanes
averaging 96 tool calls each, the ~75k-token rulebook alone is re-read about
22 × 96 × 75k ≈ 160 M tokens, ~30 % of the day's deliver tokens.

## 6. Gates that must stay (they caught or would catch owner-visible failure)

1. **site-refs + bundle-load** (1–17 s): deploy integrity. Today's worst defect, empty
   places on the deployed site, was a compose/deploy integrity failure (bf9def16). These
   are the cheapest gates on the board.
2. **npm-test's repo standards**, including the standard 18 / 0104 id-integrity check
   (check.mjs:248) and credits (1 s): data integrity and licence. A dangling id or a missing
   credit is invisible until it ships.
3. **typecheck** (20–33 s unloaded): the runtime contract across packages and the controller boundary.
4. **The place's own 22 gates plus its publish** (`commit_place`): what the owner walks.
   These run inside the place lane, not in preflight.
5. **One full `preflight -- --runner` before a merge to main** (standard 16): once per walk.
   The Pages deploy itself takes 2.4–5.3 min (gh run list).

## Recommendations (ranked: saving per week ÷ risk of a defect reaching the owner)

A week is taken as five specimen-like days. Savings are lane-wall minutes and tokens.

1. **Fix the two HEAD reds at source today; a red on HEAD blocks new lanes until
   fixed.** Save: 9 re-runs/day × ~3.5 min, about 2.6 h/week, plus the review-fix loops.
   Risk: none. Mechanism: the lane that turned HEAD red fixes it in the same batch; preflight
   prints PRE-EXISTING reds as a single line, not a FAIL. Changes CLAUDE.md:69 in practice
   (a defect found is fixed now) and preflight.mjs:341.
2. **Preflight once per commit batch, by the planner's `preflight` agent, never inside
   lanes; never for a docs-, report- or ruling-only diff.** 16 runs → 3–4/day. Save about 40
   lane-min/day and the lane context held while waiting, ~3.5 h/week. Risk: low, because
   the batch run covers the same gates. Changes CLAUDE.md:84, 0087 §3 ("a lane preflights its
   own files").
3. **Make scoped mean scoped: a 30 s target.** In `select_tests.py`, a README or .md in a
   suite folder selects nothing (:426). Unread testdata selects only the tests that open it,
   using the test-reads map. Scope workbench the same way. Label known-red tests and do not
   run them. Record changes select by the reads map, not by "reads kits via
   compile_settlement". Save: placement 150–180 s → ≤30 s on most runs, about 2 h/week of
   lane wall. Risk: low to medium (a missed reader), so the full `--runner` run before
   merge stays. Changes preflight_select.mjs, select_tests.py (brief-L19 S30).
4. **Incremental abuts (`--assets --merge`), and use the mounts/sink merge that already
   exists.** A full run only when a miner rule changes. Save today: 83 + 17.8 min, about
   8 h/week of heavy-slot time. Risk: low (sample-then-merge is the existing protocol;
   derived lists become recomputed). Changes kit-mining SKILL.md steps 18–20 (brief-L19 S29).
5. **Review gate: code diffs only, once per batch.** Skip when the pathspec diff is only
   *.md, *.json under world/ or public/, *.jsonl ledgers or reports. Otherwise run one review
   per commit batch, not per lane pathspec. Raise FIX_WINDOW to cover the batch. 13 → ~4/day:
   ~27 M tokens/day saved, ~135 M/week, plus fix lanes. Risk: low for data/docs (the
   standards checks and place gates cover data). Changes decision 0079 rule 8 and review_gate.py:250.
6. **Fewer, fatter lanes: at most 4 concurrent, merged by area.** Each lane costs ~70k tokens
   of orientation and ~150k of carried context per turn. Heavy jobs slowed 2–18× under
   contention (pipeline 60→750 s, abuts 4.6→83 min). Merge same-area lanes (L14/L17/L18 were
   one area: interiors). Save: about 25 % of deliver tokens, ~130 M/day. Risk: slower wall
   time on a day with many independent areas. Changes 0087 ("no lane cap") and CLAUDE.md:61.
7. **Hard stops with a checkpoint.** At budget, the lane stops, writes what is green and the
   next step, and returns. L12/L15 overran by 75/25 min. Risk: none (work resumes from the
   report). Already an owner ruling 2026-09-28 (brief-L19.md:52); write it into
   `fix-round-brief-template.md`.
8. **Rulings go into `references/rulings.md` rows only.** No per-lane decision addenda, and
   no method-review lanes between walks. 0105 grew 50 rulings and 4 addenda in two days, and
   process lanes took 14 % of deliver time. Fold a decision record only when a ruling changes
   an architecture or contract. Split `lessons.md` (37 KB) so a lane loads the section its
   job needs. Save ~90 lane-min and ~90 M tokens/day, plus orient load for every later lane.
   Risk: low. Changes 0079 rule 5 practice, the place-build skill.
9. **Few-minute fix by default.** Fix at source in minutes. Add a gate only if it costs
   < 5 s per run AND the same failure class has occurred twice. Otherwise add a unit test
   next to the fix. Risk: low. It refines CLAUDE.md:71 (0102 "everything a tool can measure
   is a check rule").
10. **Keep deploy-per-walk.** Pages takes 2.4–5.3 min and one `--runner` preflight runs
    per walk. The saving from dropping it is small, and it spares the owner's VM minutes.
11. **Text-review: one run per commit batch** over the concatenated prose delta. 6 → 2–3/day,
    ~2 M tokens. Low priority.

The ground was one session and its tooling; it was not too wide to walk whole.

## Proposed replacement for CLAUDE.md lines 71, 84 and 85 (for the owner to accept)

> - **How we work: cheap by default, careful where it ships** (owner 2026-09-28,
>   cost review docs/research/process/workflow-cost-review-2026-09-28.md).
>   1. **Lanes.** At most 4 concurrent, one per area; same-area jobs share a lane. Every
>      brief names a hard wall-clock stop. At the stop the lane writes what is green and the
>      next step, and returns.
>   2. **Fix at source, in minutes.** A new gate or check is added only when it costs under
>      5 s and the same failure class has already occurred twice; otherwise a unit test sits
>      beside the fix.
>   3. **Red on HEAD is fixed first.** A lane never starts on a red HEAD it could fix. A
>      pre-existing red is never a reason to re-run.
>   4. **Preflight once per commit batch.** The planner's `preflight` agent runs it,
>      scoped to the batch's paths; lanes run only the tests beside their change. No
>      preflight for docs-, report- or ruling-only commits. The full `--runner` run happens
>      once before each merge to main.
>   5. **Code review once per batch, code only.** The review hook skips diffs that are only
>      docs, reports, ledgers or world/published JSON; data is covered by the standards
>      checks and the place's gates.
>   6. **Text-review once per batch** over the concatenated prose delta.
>   7. **Miners merge per asset.** A piece joining the pool is mined with `--assets … --merge`;
>      a full run happens only when a miner rule changes, overnight at lowest priority.
>   8. **Rulings are rows.** A ruling goes into `place-build/references/rulings.md`; a
>      decision record is written only when a contract or architecture changes.
>   9. **Gates that never go:** site-refs, bundle-load, the repo standards (incl. 0104 ids
>      and credits), typecheck, the place's own gates, and the full run before merge.

Covered: tooling/.reports/16k/walk3/ (all briefs and deliver reports, by name and grep); session 925af94b transcript + 41 subagent transcripts + 15 workflow folders; 23 headless sessions of 2026-09-28; /tmp preflight logs named in the brief; tooling/repo-standards/{preflight.mjs, preflight_select.mjs, review_gate.py}; select_tests.py; kit-mining SKILL.md; miner CLIs; place-build skill sizes. Skipped: session 9fa85ef4's lanes (read as a token total only; it spans 09-27), wb.py check-by-check count (size given instead).
