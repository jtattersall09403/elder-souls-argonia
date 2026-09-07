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
Owner addition2026-09-07: update Studio water mapping alongside changed physical
coverage/stages, and update affected semantic world data. These are release
requirements, not optional follow-up work. The approach review and next batch
are in [water-coverage-pipeline.md](water-coverage-pipeline.md).
The owner allows a few load-bearing image inspections, but requests economical
usage: focused checks and concise output during iteration, one broad release
gate once coherent. No repeated screenshot attempts or broad research loops.

## Release and ownership

- Last verified live: `70a0762`, successful Actions `34121702407`, studio bundle
  `index-DSB_cShX.js` (2026-09-07). Root tests, typecheck, credits and build passed
  in Actions. Live HTML references the successful build bundle; its downloaded
  SHA-256 is `1e50435d56bee842282c3e0f73d1ca7e36440f2a7fc6329bd6c7412a76b92576`. Public water metadata SHA-256:
  `669f5f70348d248803ce76fc2da77e5af1ecab5482e7919809e6902e52fdc2ba`.
- The deployed checkpoint adds prepared cutouts, lossless river packing, native
  inland class subdivision reduction and zero-area face removal. Local source
  additionally packs displayed inland attributes, shares the original combined
  geometry limits, and reuses immutable displayed backing through source spans.
  Both actual-native views now load completely with zero rejections: normal
  110,291,355 array bytes, low 105,554,964. Bounds rejection and unchanged-triangle reuse reduce settling to 7,912 normal
  / 6,734 low updates, still too slow. Loading latency and physical coverage
  remain open. Prepared cutouts now validate class-grid and surface origins.
- Final hydraulic/native/adaptive/terrain-gradient assets are **not deployed**.
  Accepted62 preview assets remain local at `/tmp/water-live-preview`. Next:
  address runtime construction latency, verify prepared-asset provenance and
  coherent preview/map publication, then continue remaining physical coverage
  constraints. See the coverage pipeline doc for retained evidence; do not
  rerun unchanged full probes.
- Do not describe local source fixes as live. Recheck remote and Actions before
  every push: combat work is independently owned and must survive deployment.
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
The62 remaining constraints below still require resolution before final export.

## Immediate compiler work

**Priority change after independent approach review2026-09-07:** build the
province-wide classified coverage audit and shared map/physical-semantic output
described in [water-coverage-pipeline.md](water-coverage-pipeline.md). Keep the
accepted repairs and preservation gates; stop selecting the next isolated dry
vertex as the main work loop. Complete footprint families, measure failure
classes, then repair connected groups. Local fixtures remain regression tests.

Authoritative terrain: `tooling/world-generation/water-repair-inputs/bed-overlay.json`.
Matching solver cache: `/tmp/water-accepted-62-seasonal-state.npz`; check the input
manifest/compiler handoff for any newer accepted checkpoint before proceeding.
All423,268 original wet samples preserve their spill potential exactly, their
coverage, and their original planes within0.1mm. Restored346 retaining supports plus192 minimum-bound restorations,
1,103 unnecessary submerged floor cuts and6 artificial-anchor supports;
15,562 corrections remain. **62 channel constraints remain**, not completed
geometry. Immutable retaining bounds are enforced. Two reviewed full-river
groups passed fresh checks. A routine local-bank proposal resolved91 but caused
16 new failures and was rejected wholesale. A subsequent shared-support proposal
resolved38 with no new failures after omitting the causally unsafe component10244;
fresh pool/domain checks passed. Next: diagnose remaining infeasible connected
components and59 inherited retaining-bound violations, not another tail loop.

Do not reuse stale pool occupancy after terrain changes. Original retaining
banks and spill planes take precedence over making a constraint count smaller.
The25 direction discrepancies are reconciled:24 restore original drainage;
source4328 retains authored inflow into its receiving pool and backwaters.
Use the durable reviewed orientation file, not raw local film heights.
Routine cuts are bounded to3m; deeper indexed exceptions up to5m require the
existing explicit reviewed exception manifest, never retaining-bank excavation.
The [compiler repair handoff](../../../tooling/world-generation/worldgen/WATER_REPAIR_HANDOFF.md)
contains exact rebuild commands. Durable inputs and hashes are under
`tooling/world-generation/water-repair-inputs/`; large temporary caches are
disposable and reconstructible. Never promote a diagnostic `/tmp` bundle.

A fresh-domain repair now restores10 more retaining vertices, with no new
channel failures or original impoundment-plane/spill changes. One reviewed
sampling anchor moves1.82784m from originally dry bank into its original pool,
with both incident paths updated. At that intermediate checkpoint,240 retaining-bound violations remained.
A second verified pool-exit component restores one more retaining vertex
with seven bounded support adjustments (maximum0.362m) and no new failures.
The compiler handoff records why the larger127-new-failure proposal was rejected
and records15 accepted bank-aware routes plus three false-pool support
restorations. Their combined fresh rebuild resolves18 further failures.
The local proposal helper now includes every obstruction on a reach; the old
summary-node selection omitted181 obstructions. Its corrected bounded
complete-reach proposal passed a fresh rebuild after omitting the components
that changed five original wet fringe vertices. It resolves68 further failures
with no new ones;11 focused regression tests pass. A subsequent connected
restoration group restores120 more bank supports, relocates55 originally dry
sampling points into their original pools, and resolves20 channels. Fresh
domains preserve original pools, wet fringes and marine coverage. The20 removed
wet samples were originally dry extensions created by earlier repairs.
The helper can now include downstream obstruction corridors;five focused
component tests pass after that addition. A further49 bank restorations,
11 original-pool anchor corrections and29 bounded route changes pass a joint
fresh rebuild with the direction reconciliation. It resolves8 more channels
and preserves all original wet coverage. The route-cost helper now considers
immutable excavation floors and fixed pool heads;four focused tests pass.

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

- Retaining-anchor checkpoint:24 focused Python tests pass. One fresh4033
  native compile verifies the ten restorations and shared-anchor relocation;
  manifest/cache terrain and routing hashes match. Runtime source is unchanged
  from the preceding passing workspace/typecheck checkpoint.

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

Latest accepted compiler group uses the full existing channel width:17 more
constraints resolved without new failures, two more retaining supports
restored, one original-pool anchor moved and67 routes reviewed. Fresh domains
preserve original wet areas and exact spill potential. The103 changed wet
samples belonged to earlier repair-created extensions on originally dry land.
That checkpoint has179 constraints and69 retaining violations.

The subsequent connected-incident solve resolves17 more channels with no new
failures after excluding two unsafe groups. That accepted state:162
constraints,69 retaining violations,15,613 corrections. Original wet areas,
planes and spill potential pass. Eight focused solver tests pass; details
and rejected approaches are in the compiler handoff. Exact natural carving
footprints are now reproducible via `audit_water_carver_history` for peak
coverage work; production upper levels and final export remain unfinished.

The latest accepted bend-aware routing group resolves seven more channels:
155 remain, with69 retaining violations and15,619 corrections. Original water
preservation passes; five focused routing tests pass. The subsequent joint restoration repair resolves13512 and13936 without new
failures:122 previous supports rise toward original ground and nine receive
bounded cuts. The accepted state is153 constraints,69 retaining violations
and15,561 corrections. Original wet coverage, pool planes and spill potential
pass, with no lost repair-created extensions either. Seventeen focused solver
and anchor tests pass. Eight later lateral sampling corrections within the original rivulet
footprint pass fresh checks,153→145, without terrain changes or any original
water loss. The broad48-point trial was rejected for24 new failures. Complete
continuum/rivulet target masks are now recovered from exact carving replay;
see the bankfull findings. Peak coverage and remaining basins are still open.

Three specifically reviewed upland river repairs (1740,1659,850) pass fresh
domains and original-water checks,145→142. Seven new supports are indexed;
six need the existing reviewed exception policy above3m, maximum4.606644m.
No retaining bank is excavated;69 inherited bound violations remain. Current
corrections:15,568. The whole69-support restoration plus signed connected
solve was rejected:205 constraints, no improvement from that solve.

A peak-footprint diagnostic exposed a separate ownership defect near a cliff:
a low plunge reach won a horizontal nearest-channel test on high bank ground
it cannot reach at peak. Source now chooses the nearest eligible portion of
a channel, retaining actual sill and standing-pool checks. At native23935, a
4m diagnostic upper stage reaches8.104m on the affected bank instead of being
truncated at4.413m. This is source/probe evidence, not final exported coverage.
Production stage values, whole footprint coverage and native budgets remain
unverified. Twenty-one boundary tests pass, plus seven stage tests before the
last additional nearest-search case.

Latest solver checkpoint:131 constraints, no terrain/input-route changes.
Bank measurements now include exact native triangle creases, matching section
export; bounded reach proposals, shared-support grouping and bank-aware routing
use the same knots. A final incremental graph pass restores reaches whose
rejection became unnecessary after their downstream obstruction was excluded.
Fresh domains resolve11 sources with no new failures. Original wet
coverage/planes/spill potential pass;166 repair-created extension samples rise
by at most0.020153m, none disappear. Seventy focused compiler/geometry tests
pass. The manifest records the solver-source hashes and exact changed indices.

The old142-state ordinary-river proposal (`/tmp/water-remaining-ordinary-proposal.json`)
is unaccepted: it proposes four additional repairs against superseded bank
measurements. Prefer the exact-geometry baseline before reviewing any of those
cuts. Peak coverage,69 retaining violations and final export remain open.

The subsequent exact-bank connected proposal repairs2497 within the routine
budget:14 cuts and36 restorations, maximum resulting cut1.441132m, instead of
the earlier3.262788m proposal. Fresh domains preserve all original and prior
repair-created pool coverage/planes. Accepted count130,15,555 corrections,
69 retaining violations. No higher stage or final assets are deployed.

The latest connected-pool checkpoint restores211 original wet fringe pool
samples (missing pool fields249→38) and preserves all existing pool planes and
channel geometry. Closure carries a pool spill through already wet patches
of the same plane. The bounded actual-channel/standing-field check now covers
all257 flagged original fringe targets at peak and250 at base, with no prior
positive lost. Final raster meshes and complete authored peak footprints are
still unverified;127 constraints and69 retaining violations remain.

Seasonal/tidal response ownership now follows actual connected standing
planes, including recovered pools omitted by the old initial selection list.
A durable reference preserves their existing seasonal, tidal and combined
low-water ranges exactly; all3,745 resulting groups containing prior standing
water pass, with no uneven response across any connected plane. Final exports
must include `--pool-stage-reference water-repair-inputs/pool-stage-response-reference.json`.
Source/input hashes and proof are in
`tooling/world-generation/water-repair-inputs/connected-pool-stage-audit.json`.
Thirty focused pool/compiler tests pass. Workspace dependencies are now restored;
root tests and typecheck pass at the seasonal-contract checkpoint below.
No production amplitudes or native assets deployed.

Next: complete authored channel/pond/swamp peak coverage and actual raster
ownership, then remaining hydraulic repairs and the final bundle gates.
The compiler handoff includes one changed extrapolated fringe owner that
remains covered at existing peak; do not waive its final geometry check.

Latest verified river repair resolves1071,2517 and14047 with seven support
adjustments:127 remain,15,559 corrections,69 retaining violations. Two indexed
ordinary-river cuts require3.048187m and3.302067m; protected retaining banks
remain untouched. Fresh domains preserve original water and all reviewed
pool-stage reference seeds/planes and merged low bounds. Exact source-set
comparison uses reports, not the cache's authored `original_links` graph.

An explicit opt-in seasonal profile/export contract now permits authored
wetland rivulets to dry at base only when their exported peak clears the bed.
Permanent/shared supports retain their bounds; default profiles reproduce the
accepted127 levels exactly. This is source support, not compiler activation.
The real-API cached diagnostic resolves50 of84 eligible rejected rivulets,
with no new failures (77 diagnostic constraints; still127 accepted).
Selected909-ribbon geometry checks cover376 new path centres:367 ordinary
peak samples at original coordinates, eight more at exported Float32 centres,
and one falling-sheet-only sample. This does not certify whole footprints.
The first seasonal native fields retained77 constraints with no new failures.
Intermediate pool response contacts now keep554 wet point comparisons over
five stages within0.05mm. Five native depth budgets needed reductions against
these actual responses; re-solving leaves every candidate head unchanged.
`compute(..., seasonal_profile=...)` and CLI `--seasonal-profile` now validate
exact graph identity, rejected authored-rivulet eligibility, protected shared
nodes, no new failures and actual fresh response budgets. The final guarded
compilation reproduces all six native fields and909 selected records exactly.
All482,078 accepted standing samples keep identical coverage and planes.
`seasonal-profile.npz` is now accepted with a matching fresh profile audit and
cached re-solve; both reproduce the full compiler's exact levels and accepted
links. All423,268 original wet samples retain spill potential, coverage and
planes; all482,078 previously accepted standing samples retain exact planes.
Four further existing-stage repairs resolve9043,9064,11449,11450. Fresh fields
and cached solving agree;999 selected records pass600 wet pool contacts and
all earlier centre coverage remains. The manifest records73 remaining
constraints (43 rivulets,30 banked rivers),63
retaining violations and15,560 terrain corrections after the sampling correction below. Full compilation
and profile audits must include `--seasonal-profile water-repair-inputs/seasonal-profile.npz`;
full exports also require the reviewed pool-stage reference. Without the seasonal
profile, the baseline deliberately remains127. Cached route solving preserves
budgets; route replacement requires a regenerated proposal. Whole authored peak
footprints and final rendered-confluence gates remain open. Eleven focused cache/
seasonal tests pass; workspace gates passed at c00c7ed, with no runtime edits since.
See `seasonal-profile-acceptance.json` and the compiler handoff.

Higher wet-season budgets1.8/2.4/3.2m did not resolve further channels in the
bounded sensitivity check; that is not a reason to raise global stages. Peak
footprint requirements still need their own evaluation. Blanket minimum-bound
restoration of all69 supports fails even with fresh routing (58 new base-only
failures). Thirteen legal sampling relocations inside original pools provide
the next targeted investigation; see `retaining-support-investigation.json`.
Run full native compilations sequentially and load only needed cache arrays:
a concurrent job was killed with exit137; the reduced-memory sequential retry
passed. No rejected restoration or diagnostic upper stage was promoted.

Four targeted sampling moves (2295,3420,8299,10338) are now accepted. Six
associated bank supports reach their immutable lower bounds; two bed supports
receive7.2cm cuts. Fresh compilation preserves original pool levels and spill
potential, all54 seasonal repairs and prior checked peak coverage. Seven
previously repair-created samples leave the base standing seed domain; six have
standing peak coverage and the seventh has native-channel peak coverage. The
38 already-missing original pool fields are unchanged. Selected461 centres and
951 wet pool contacts across five stages pass; this is not a final raster-mesh gate.
Nine alternative sampling candidates remain. `pool-sampling-restoration-acceptance.json`
records the inputs and proof. Use `--profile-cache` during full compilation to
capture the verified solver state without another domain calculation. Earlier
compiler investigations are archived beside the shorter current compiler handoff.


Latest accepted sampling repair:10480→[2459,2544],11393→[2663,2262],11411→[2665,2263].
Fresh domains recover11425 at base level, retain all54 seasonal repairs and
restore four additional bank supports. Current totals are72 channel constraints,
59 retaining violations and15,562 corrections. All five changed standing samples
remain peak covered (one standing owner, four native channels); original planes,
spill potential and marine coverage are preserved. Selected495 centres and1,018
wet pool contacts pass. Evidence: `pool-sampling-restoration-72-acceptance.json`.
The29 alternative-anchor screens are recorded in `pool-anchor-alternative-screen.json`;
do not repeat unchanged failed choices. See the compiler handoff for next routes
and the rejected optimistic seasonal-restoration bounds.


## Current priority: remaining feasibility and full peak footprints

The connected seasonal checkpoint is now accepted:62 channel constraints
(32 minor/30 banked) and59 retaining issues remain. It recovers10 more channels,
64 total, using32 explicit supporting minor reaches. No terrain, routing,
stage amplitudes or original pool planes changed. The default seasonal profile
and matching cache are updated; the manifest records the acceptance hashes.

Landing fills and precision fixes close the diagnosed geometry gaps. The final
owner-boundary search resolves its bracket to the actual rendered vertex.
Across4,303 Float32 authored vertices around changed heads, all4,088 previously
wet vertices remain covered and45 more are wet.170 remain dry; whole-footprint
coverage is unfinished. A32,007-vertex comparison also loses no coverage.
All645 selected centres and1,152 pool contacts pass. Original interior pools,
spill potential, marine coverage and482,066 standing samples are preserved.

The higher-peak screen now separates insufficient height from missing geometry:
at3m upper season/0.5m tide,139 of those170 vertices have supported ribbon or
standing-field evidence;31 remain dry or unverified. The earlier151 count
included12 unvisited flood sentinels, not measured access paths. Lows stay unchanged. This is a fixed-field diagnostic,
not a selected production stage or final standing-mesh acceptance. Ten remaining
misses initially appeared to lie beyond channel terminals. Generic topology
checks now identify only three true-end misses; the other seven belong to the
rejected upstream reach12745 and must be repaired there. Diagnostic end-fill
code covers the three true-end misses at unchanged heads and preserves existing
ribbons. Between-ray boundaries and final mesh/cost checks remain before
enabling it in production. Six other mesh misses and
three height/owner cases are separate. See `peak-envelope-investigation.json`
and the compiler handoff for exact targets and the next implementation step.

See `seasonal-supporting-acceptance.json` and the repair-input manifest for the
accepted checkpoint. Runtime remains at c725181's passing workspace gates;
the new Python terminal export is diagnostic opt-in and changes no physical input. Continue the
remaining constraints and authored peak footprints, then final coherent native
data and rendering gates.
Nothing from the diagnostic asset bundles has been deployed.
