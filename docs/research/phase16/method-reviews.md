# Place-builder method reviews: index

Adversarial read-only reviews of the place-build method (the place-build
skill, the round recipe, the workbench and the gates), each costed in
seconds of builder wall per place over the 580-place rollout. The reviews
themselves live in `tooling/.reports/16k/walk2/` (gitignored: local to the build
machine); their queued items are the
S rows in [16k § New rows and speed items](../../phases/16-foundation-and-places/16k-place-loop.md).
A new round opens only when `tooling/repo-standards/build_ledger.py --report`
lists a run over its target (16k § Build cost is measured as data).

| Round | Date | Review | Saving per place | Exit reason | Top findings |
|---|---|---|---|---|---|
| 1 | 2026-09-27 | `method-review.md` | ~6,900 s (record to walk packet ~140 min serial; proven-type target ~25 min) | continued: round 2 followed | ~24 of 36 reader rows are rules (tag them, read only the rest); a site packet replaces the full reads that grow with N; preflight, review and deploy per batch, not per place; tool gaps go to a parallel lane; readers in one Workflow |
| 2 | 2026-09-27 | `method-review-r2.md` | ~1,000 s | continued: round 3 followed | the runtime reads `settlements.json` whole, a rollout blocker at 580 places (S8); the layout-template generator had no queue row (S10); the slice close and the per-place commit as tools (S11, S12); a lock on the review stamp (S9) |
| 3 | 2026-09-27 | `method-review-r3.md` | ~330 s (est.) | exited on measurement: most of the saving rests on one timing row and a slot model, so round 4 is the timing of place 2 of type 1 through S8–S18 | the per-place interior claim (111.5 s) becomes a pre-pass lookup (S16); the wb pool ignores the job-guard share; design briefs fill the review cap; shared files change only by REQUEST rows; the 0098 signature is claimed under a lock; the round hand-off folder (S17) |
| 4 | 2026-09-27 | the build ledger (`build_ledger.py --report`, `tooling/.reports/16k/walk2/ledger-report.txt`), not a read-only review | measured, not estimated: Greenspring (type 2, new type) 64 min wall against 40; Claywater's walk-2 fix round 3.4 min of `wb round` process time over 18 distinct rounds against 10 (the agents' own wall was not recorded) | no round 5: the one over-target run is filed as 16k S27, and stage events now time every stage without a hand row | the survey (15 min) and the layout-to-compile (22 min) stages carry the overrun; dressing seated by hand on a slope (S20) and overlapping pads found only at check (S21) are the tool tasks |

## Round 4 delivered: round-3 findings A–I measured on Greenspring (2026-09-28)

One place (`place.hist-heartland.greenspring`, its committed layout and
blueprint), one job-guard slot (`ES_JOB_CORES=2`, cores 1-7), the machine
otherwise idle; wall seconds from `/usr/bin/time`. Seconds per place are
what a builder waits for, per place; per-batch costs are named as such.

| # | Finding | Before (s per place) | After (s per place) | Status |
|---|---|---|---|---|
| A | interior claim | 21.0 (`--claim --no-table`, plugin reads; Claywater's 09-26 row was 111.5) | 0.26 (table lookup, identical output) | delivered (S16); the table rebuild is 101 s per batch and is needed whenever one of its inputs moves, code files included (5 had moved in a day); since wave 2 (L11) a stale table or a missing cell falls back to the 21 s plugin read with a warning instead of refusing |
| B | wb pool in the slot share | `apply --full` 11.6 wall with 7 workers | 16.6 wall with the share of 2 (29.6 serial); CPU 43.7 / 42.6 / 43.8 s user | delivered; then (wave 2, L11) the pool is the pool cores idle at fork time up to 7 with the share as the floor, so an idle machine gets its 7 workers back and a busy one keeps the share |
| C | yard gates out of the place gates | 32.3 (`place_gates` 20.3 + `test_proving_ground` 12.0) | 20.3 | delivered (S14); the yard gates run in the placement suite, once per batch |
| D | design briefs out of the review diff | 17.5 KB of reviewed diff (brief 15.3 + dossier 2.2): ~14 places per 250 KB review | 2.2 KB: ~110 places per review | delivered; the cap stays in bytes |
| E | commit_place stages per-place files | whole files, shared ones included | 0.03 (7 manifest files; shared files refused, changed by REQUEST rows) | delivered (S12) |
| F | signature claimed at the brief | check-then-act at the batch gate | 0.08 (`claim_signature --check`, locked append) | delivered |
| G | hand-off folder | summary and rounds under `output/apply/`; the builder copied them by hand | `wb round` writes the place's current round folder by default (`tooling/.reports/16k/<place>/round-N/`), `--waiting-on TASK[=RULE]` writes `waiting-on.json`, and the `ownerOkRule` check fails an op accepted at git HEAD (`ownerOk`) that changed without a `cause` | delivered (walk 3 wave 2, lane L11; 0105 R13) |
| H | text-review reads the brief's delta | 14.4 KB reviewed | unchanged: both briefs are hand-written (0 and 1 lines verbatim in the type sheet), no brief generator marks a delta | dropped for now (0105 R13): the briefs share no lines with the type sheets |
| I | interior kits in the site budget | not counted | `batch_prepass` lists the batch's kits and checks the total: 554.3 MB composed + 7.1 MB new = 561.4 MB against 750 / 900 | delivered in `batch_prepass`; `compose.mjs` unchanged |

A cached `wb.py apply` of the same layout takes 5.5 s.
Stage events (`build_ledger.py stage --start --start-run --path fix-round`)
open a fix-round run for each place, checked on a copy of the ledger.
