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
