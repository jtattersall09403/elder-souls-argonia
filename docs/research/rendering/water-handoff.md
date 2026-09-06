# Continue water work

Read this after `CLAUDE.md` and the required startup documents. This is the
active-work entry point, not a completion report. Keep it current when changing
the next action, checkpoint, verification result or deployed version.

## Owner contract

Deliver the entire [water completion checklist](water-completion-audit.md),
including all later defect reports, in the deployed studio. Preserve existing low-water limits, geography, original pools, reflections, god rays and the
underwater upward view. Owner correction 2026-09-06: upper tide/season limits
may increase as needed. At maximum combined seasonal/tidal stage, water must
fill the whole terrain-shaped and painted channel/pond/swamp footprint,
including upland riverbed and bank mud. Audit both height and connected
coverage; raising a level cannot fix a truncated water domain. Do not declare visual perfection from numeric tests.
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
- Local committed source checkpoints include `c4d9dd1`, `a103eeb` and `08e2ada` after the
  live commit. Read `git status` and the recent log for newer checkpoints.
- Dirty `docs/polish-backlog.md` and untracked `output/` belong to the owner;
  never stage, discard or clean them as part of water work.
- The combat agent is actively editing combat/character/UI/asset-pipeline files
  and package manifests/lockfile in this same worktree. Stage explicit water
  paths only; a broad `git add packages` would mix unrelated unfinished work.
- Keep water-only reversible commits. `?water=legacy` is a renderer fallback,
  not a bit-exact rollback of shared physics changes. Never reset combat work.

## Peak coverage correction (2026-09-06)

[Bankfull findings](water-bankfull.md): 1,589/2,970 active upland river stations
cannot reach even their lower retaining bank at the current maximum; lowlands
541/6,133. Stored hydric paint also extends onto valley sides far above some
channels. Do not choose a global upper level from the most extreme paint.
Independent high/low `stageRange` is implemented through compilation, runtime,
adaptive water and terrain protection. Defaults and public assets are unchanged.
Next: combine actual carved footprint targets with connected peak coverage and
correct unrelated slope paint; include standing ponds/swamps, not just stations.
The 311 base constraints below still require resolution before final export.

## Immediate compiler work

Authoritative terrain: `tooling/world-generation/water-repair-inputs/bed-overlay.json`.
Matching solver cache: `/tmp/water-accepted-311-state.npz`; check the input
manifest/compiler handoff for any newer accepted checkpoint before proceeding.
All423,268 original wet samples preserve their spill potential exactly, their
coverage, and their original planes within0.1mm. Restored345 retaining supports,
1,103 unnecessary submerged floor cuts and3 artificial-anchor supports;
15,415 corrections remain. **311 channel constraints remain**, not completed
geometry. Immutable retaining bounds are enforced. Two reviewed full-river
groups passed fresh checks. A routine local-bank proposal resolved91 but caused
16 new failures and was rejected wholesale. A subsequent shared-support proposal
resolved38 with no new failures after omitting the causally unsafe component10244;
fresh pool/domain checks passed. Next: diagnose remaining infeasible connected
components and251 inherited retaining-bound violations, not another tail loop.

Do not reuse stale pool occupancy after terrain changes. Original retaining
banks and spill planes take precedence over making a constraint count smaller.
Do not silently reverse links to fit repaired terrain:25 links in the old frozen
orientation differ from the coherent immutable reference and need reconciliation.
Routine cuts are bounded to3m; deeper indexed exceptions up to5m require the
existing explicit reviewed exception manifest, never retaining-bank excavation.
The [compiler repair handoff](../../../tooling/world-generation/worldgen/WATER_REPAIR_HANDOFF.md)
contains exact rebuild commands. Durable inputs and hashes are under
`tooling/world-generation/water-repair-inputs/`; large temporary caches are
disposable and reconstructible. Never promote a diagnostic `/tmp` bundle.

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

Marine integration is local, native-data-only, and not deployed. `MarineWaterSurface`
is wired into `WaterSurface`: displayed coarse publications update a small
atlas-prefix readiness mask; a bounded fine patch copies the actual coarse
perimeter and retains0.125m player detail. The old patch remains while a valid
replacement builds, only while its displayed parent is unchanged. Generation
keys avoid rebuilding for unrelated tiles that share a draw batch.
`NativeWaterAtlas` unions hero/readiness dirty rows without another sampler.
Per-instance uniform ownership prevents old tier cleanup erasing new masks.
Actual-builder lifecycle, animated seam, mask/mesh parity and fly-disable tests
pass. **Final native geometry performance, fine-class/owner coherence and
loading experience remain unverified**. Do not claim variable-stage horizon
fallback is geometrically exact before coarse geometry becomes resident.

## Verification and next release

- Independent-stage checkpoint (2026-09-06): 38 focused runtime tests and
  39 compiler/boundary/stage tests pass, including a full synthetic compile
  with higher peak reach and identical base channel levels. All workspace
  tests passed after rerunning the existing child-process test outside its
  sandbox restriction (7 tests); root typecheck passes. No production
  amplitudes, accepted terrain corrections or public water assets changed.

- Water runtime checkpoint `7296f17`: all332 water tests pass across65 files
  (19:45UTC,16.3s); one final-artifact gate is intentionally skipped without
  matching final data. This includes legacy production budgets, actual marine
  seams/lifecycle, atlas updates and new boundary fixtures. Core typecheck passes.
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
- Actual local browser shader linkage after explicit raster binding passes:
  water and terrain use16 fragment samplers, blit8, no shader/GL failure.
  Ground material compiled and gradient ready. No image was ingested; this is
  shader/loading evidence, not final native-data appearance certification.
- User-facing estimate remains~65% complete,35% remaining, uncertain. Do not
  increment it simply because a test or intermediate checkpoint passes.
