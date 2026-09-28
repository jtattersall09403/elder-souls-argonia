# 0106 — How we work: fix at source in minutes, one preflight per batch, scoped for real, review code only, incremental mining, hard budgets, rulings as rows

**Date:** 2026-09-28. **Owner's words:** "we are in a pickle: too slow,
overcautious; every VM minute and token costs me; make the improvements
definitely taken forward and obeyed by all agents and subagents from now on,
so the slower ways never creep back in: golden rules, hooks, whatever it
takes." **Evidence:** the workflow cost review
[`docs/research/process/workflow-cost-review-2026-09-28.md`](../research/process/workflow-cost-review-2026-09-28.md)
(session 925af94b, 16k walk 3). **Supersedes:** 0079 rule 8's "the first
preflight on an unreviewed diff triggers a review" for non-code diffs and
its 20 min fix window; 0087 §3 "a lane preflights its own files" and "no
lane cap"; the preflight lines of 0099 and 0102; 0102's "everything a tool
can measure is a check rule" where the check would cost 5 s or more;
the addenda of 0105 (now rows of the rulings table).

## The numbers (one specimen day, 07:47–15:29)

- 22 deliver lanes carried 545 M of the session's ~680 M tokens (96 %
  cache reads); orientation alone was ~75k tokens per lane, re-read on
  every turn (~160 M tokens).
- Preflight ran 16 times for 7 commits; all 16 ended red on the same two
  tests red on HEAD; 60 min of summed wall. Placement ran 168 of 168 test
  files in 8 of 16 "scoped" runs (a README in the suite folder selected the
  whole suite; a kit or record change selected ~90 %).
- The code review ran 13 times (36.5 M tokens), docs-only diffs included.
- One Riften stable set off an 83 min abuts full run and a 17.8 min mounts
  full run.
- Process lanes (rules, method, docs) took 14 % of deliver time and 17 % of
  its tokens; 0105 grew 50 rulings and 4 addenda in two days.

## Decisions

1. **Fix at source, in minutes.** A new gate or check is added only when it
   costs under 5 s per run and the same failure class has already occurred
   twice; otherwise a unit test sits beside the fix.
2. **Red on HEAD blocks.** `preflight.mjs` lists a test red on HEAD by name
   under BLOCKED and exits 1; it is fixed at source by whoever meets it,
   never labelled and tolerated.
3. **Preflight once per commit batch, scoped for real.** The planner's
   `preflight` agent runs `npm run preflight -- --paths <batch>`; a bare
   `npm run preflight` is refused; `--runner` is the full run, once before a
   merge to main. A scoped run over 60 s wall is a FAIL. `select_tests.py`:
   .md, README, docs/, tooling/.reports/ and .claude/ select no test; a data
   file (world/, apps/world-studio/public/, tooling/*/output/) selects only
   the tests whose test-reads row opened it; an unread file never selects a
   whole suite. The full `--runner` run is the backstop for a missed reader.
4. **No preflight for a docs-, report- or rulings-only batch**, and none
   twice over the same paths on the same HEAD with the same files
   (`tooling/repo-standards/hooks/preflight_guard.py`, stamp in
   `tooling/.reports/preflight/batch-stamps.json`).
5. **The code review reads code only** (`.py .ts .tsx .mjs .js` under
   packages/, apps/, tooling/), once per batch (60 min fix window).
   Text-review runs once per batch, listed only in the place-build skill's
   batch step.
6. **Miners merge per asset.** `mine_abuts`, `mine_mounts` and
   `mine_designed_sink` take `--assets <ids> --merge` (abuts: the pieces'
   families, rows keyed by (parent, child), lists re-derived from the
   merged rows; 13.7 s for a wall family, identical rows to the full run).
   A full run is for a miner rule change only and carries `--rule-change`;
   the hook refuses it otherwise. `build_kit` re-derives the abuts lists
   that depend on the kits after every build (`--refresh-derived`, 0.5 s).
7. **Hard budgets, at most 4 lanes.** Every deliver brief carries
   `Budget: <N> min (hard)` (the hook refuses an Agent or Workflow call
   launching a deliver lane without it); `job_guard.sh <lane> --budget <N>`
   kills a job at its budget after a checkpoint line. At most 4 lanes run
   at once, one per area.
8. **Rulings are rows.** `.claude/skills/place-build/references/rulings.md`
   is the only home of the place rulings (R1–R55: rule, gate, source); a
   decision record is written only when a contract or architecture
   changes. `lessons.md` is an index over `lessons/<section>.md`; orient
   reads the site packet's rows for its type and the rulings table (orient
   read 27.6k → 17.9k tokens).
9. **Gates that never go:** site-refs, bundle-load, the repo standards
   (0104 ids, credits), typecheck, the place's own gates, and the full
   `--runner` run before a merge to main.
10. **Drift is measured weekly** by the `cost-review` skill's § Workflow
    drift, each measure with a red threshold.

### Addendum 2026-09-28 (owner, after walk 4: "it might be fine now, but own this problem")

11. **When an agent caused the defect, change the agent.** A defect whose
    root cause is agent behaviour is fixed by changing what the agent reads
    and does (skill step, reader checklist row, workbench command, brief
    template), so it cannot recur; a test beside that change is welcome, a
    test instead of it is a plaster. Every fix round names per defect the
    instruction or tool that changed. Walk 4's evidence: a stable sunk to
    its roof, a hanging flower stood on the ground, a boardwalk a body
    height above its shore, two sign arms level and parallel, a lantern in
    the floor, particle flames dropped by the exporter: every one visible
    to a measurement or a render reader before the owner walked.
12. **A batch is a fix round or a delivered chunk**, never a lane, a commit
    or a file. In 16k: all the lanes' work between one owner walk and the
    next packet. One preflight, one review, one text-review per batch.
13. **The review runs once, exhaustively, never in rounds.** High effort,
    a "this is the only pass" prompt with a coverage line, findings under
    `tooling/.reports/review/` (never under `.claude/`), and the stamp
    holds while HEAD is unchanged: fixes after the review are not
    re-reviewed; the next commit batch gets its own review.
14. **A budget stop is a diagnosis, never a result.** The planner reads the
    stop note, finds the cause of the overrun (walk 3's causes: a survey
    and scan pass re-run per round, 22–44 min a place; orient 12–17 min a
    place; a stable sited by hand for 45 min; 3 preflights at 5 min), fixes
    it in minutes, relaunches from the note. Work cut by a budget is never
    handed to the owner as a gap.
15. **Direct Blender for placement.** When the workbench lacks a placement
    ability, the deliver agent runs its own script against the loaded scene
    (`wb.py bpy`) and adds the command in the same lane; "needs a new
    tool" is never a hand-off line (0079 rule 19 widened).
16. **Reports live in `tooling/.reports/`** (per run, per area), never in
    `.claude/`, the repo root or a docs folder; `.claude/` holds only
    settings, agents and skills.

## Where each lives

- `tooling/repo-standards/preflight.mjs`, `review_gate.py`,
  `hooks/preflight_guard.py`, `job_guard.sh`; the hook lines to paste in
  [`docs/standards/hooks.md`](../standards/hooks.md).
- `tooling/world-generation/scripts/select_tests.py`;
  `worldgen/mine_abuts.py` (`merge_scope`, `near_scope`, `merge_abuts`);
  `pipeline/build_kit.py` (`refresh_abuts_derived`).
- CLAUDE.md § How we work; the `place-build`, `kit-mining`,
  `modular-runs` and `cost-review` skills; `docs/standards/engineering.md`.
