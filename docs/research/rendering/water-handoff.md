# Continue water work

Read this after `CLAUDE.md` and the required startup documents. This is the
active-work entry point, not a completion report. Keep it current when changing
the next action, checkpoint, verification result or deployed version.

## Owner contract

Deliver the entire [water completion checklist](water-completion-audit.md),
including all later defect reports, in the deployed studio. Preserve authored
tide/season ranges, geography, original pools, reflections, god rays and the
underwater upward view. Do not declare visual perfection from numeric tests.
The owner allows a few load-bearing image inspections, but requests economical
usage: focused checks and concise output during iteration, one broad release
gate once coherent. No repeated screenshot attempts or broad research loops.

## Release and ownership

- Last verified live: `93904c2`, successful Actions `34047707975`, studio bundle
  `index-IZqpLs8B.js`. Public water metadata SHA-256:
  `669f5f70348d248803ce76fc2da77e5af1ecab5482e7919809e6902e52fdc2ba`.
- Final hydraulic/native/adaptive/terrain-gradient assets are **not deployed**.
  Do not describe a local source fix as live. Recheck remote and Actions before
  every push: combat work is independently owned and must survive deployment.
- Local committed source checkpoints include `c4d9dd1` and `a103eeb` after the
  live commit. Read `git status` and the recent log for newer checkpoints.
- Dirty `docs/polish-backlog.md` and untracked `output/` belong to the owner;
  never stage, discard or clean them as part of water work.
- Keep water-only reversible commits. `?water=legacy` is a renderer fallback,
  not a bit-exact rollback of shared physics changes. Never reset combat work.

## Immediate compiler work

Latest strict-preservation terrain: `/tmp/water-pools-strict-preserved.json`.
Matching solver cache: `/tmp/water-preservation-complete.npz`.
All423,268 original wet samples preserve their spill potential exactly, their
coverage, and their original planes within0.1mm. Restored244 retaining supports
and1,103 unnecessary submerged floor cuts;15,482 corrections remain.
**356 channel constraints remain** (254 local-bank,29 pinned): not completed
geometry. Next: immutable retaining-support bounds, then remove diagnosed
cut-created artificial pool anchors before considering further bed cuts.

Do not reuse stale pool occupancy after terrain changes. Original retaining
banks and spill planes take precedence over making a constraint count smaller.
Do not silently reverse links to fit repaired terrain:25 links in the old frozen
orientation differ from the coherent immutable reference and need reconciliation.
Routine cuts are bounded to3m; deeper indexed exceptions up to5m require the
existing explicit reviewed exception manifest, never retaining-bank excavation.
Compiler specialist is preparing a concise regeneration/resume recipe in
`tooling/world-generation/worldgen/WATER_REPAIR_HANDOFF.md`; until it exists,
do not infer missing temporary-cache dependencies or promote any `/tmp` bundle.

## Immediate rendering work

`InlandWaterTiles` now partitions hydraulic owner boundaries and supplies
one-sided vertex levels/semantic sample coordinates. Actual64×64m zigzag tests
cover4096m² with no missing strips or blended heads (equal and unequal levels,
LOD1/16). Shared edge knots prevent hanging edges; mixed-batch byte accounting
includes promoted attributes and32-bit merged indices.

This path requires `nativeChannelCoverage:true`. Current public assets are
legacy continuous rasters; preserve their old contract until matching final
assets are promoted. The production budget test passes again on those legacy
assets; **that does not certify the new native geometry's cost**.

Marine work is unfinished. Shared raster-domain helpers and datum binding exist;
the builder now accepts `budget.domain` and `onPublication(batchId, tiles)`.
Callbacks report the exact displayed merged-batch snapshot, not pending tiles.
A bounded coarse/fine controller is being built separately. It is **not wired
into the scene**. Preserve0.125m near-player spectral fidelity; do not publish
fine overlays until their animated perimeter is stitched to coarse geometry.
Do not mask horizon coverage before replacement geometry is displayed, nor
claim variable-stage horizon fallback is geometrically exact.

## Verification and next release

- Latest focused results:13 inland/shared-domain tests pass; legacy production
  budget2 tests pass in~18s; subsequent builder domain/publication and marine
  leaf selection tests pass12/12. Core typecheck passed after the builder change.
- Full suite last passed before these local geometry changes; rerun once the
  candidate is coherent. Earlier failed development budget runs are recorded
  in the checklist; do not raise caps or remove assertions to hide holes.
- Use [CONFLUENCE_GATE.md](../../../packages/game-core/src/water/CONFLUENCE_GATE.md)
  with one matching final bundle. It tests actual interpolated
  mesh levels, native ground, five stages and named user neighbourhoods:
  (2370,190), (1960,220), (3840,1120). Excluded marine/falling cases are not passes.
- Export matching native ground, adaptive bank terrain, sparse terrain-gradient
  patch and metadata together. Never mix earlier diagnostic bundles. Check
  hash linkage, final native budget, water/terrain shader sampler limits, and
  the full checklist before successful Actions/live-bundle verification.
- User-facing estimate remains~65% complete,35% remaining, uncertain. Do not
  increment it simply because a test or intermediate checkpoint passes.
