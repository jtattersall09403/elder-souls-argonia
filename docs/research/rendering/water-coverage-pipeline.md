# Province water coverage and map agreement

Current implementation direction after the owner's2026-09-07 request and an
independent read-only subagent review. This is unfinished work, not a coverage
certificate. Main authority: [water-handoff.md](water-handoff.md).

## Review outcome

Keep the generic fixes already found through individual examples: connected
seasonal support, physical ownership, exact coordinates, shared clipped joins
and additive landing geometry. Do not replace the hydraulic solver without
evidence. Its connected-component machinery and preservation checks are useful.

The inefficient part is choosing successive local dry points before measuring
the whole problem. The4,303-point regression set surrounds already changed
heads. It cannot prioritise the province. Province-wide channel and pond-hollow
audits now support fixes grouped by cause; complete basin/swamp target recovery
remains open.

## Proven map and semantic drift

- `apps/world-studio/src/App.tsx` and `map/provinceMap.ts` load
  `hydro-rivers.png`/`hydro-wetlands.png` from the original coarse hydrology.
  Map hover already uses shared runtime water, so the displayed area and query
  need not agree.
- `worldgen/refine_province.py` writes `refined/flood-wet.png` from terrain below
  global0.05+1.4m connected to terrain below0.05m. It does not use each inland
  water plane, its stage response, access barriers or channel surfaces.
- `worldgen/site_fields.py` decodes the old hydrology colours and consumes that
  flood mask as semantic wet-season coverage. It deliberately prefers
  `water/natural` for siting, avoiding a grading→siting→grading feedback loop.
  Preserve that distinction when replacing physical coverage inputs.

Do not rerun the original hydrology pass to overwrite accepted geography or
repaint PNGs independently. Ecological wetland, region, soil and river hierarchy
are not interchangeable with physical inundation. Audit affected semantic
records after physical coverage changes; update classifications only when the
new evidence warrants it.

## Next implementation batch

1. Extend `audit_water_authored_footprints.py` using verified authoring history
   to include initial rivers, lake/feeders, oxbows, wetland pools, swamp areas
   and portage water. Preserve naturally low parts that required no cut.
   Distinguish explicit authored extents from Gaussian carving tails and
   intentional islands/land. Report missing target provenance explicitly;
   neither a cut-only mask nor an arbitrary cutoff proves the complete target.
2. Audit targets by tile, with bounded memory and compact aggregate reports.
   Classify rejected reach, missing surface, insufficient connected peak and
   incompatible owner; retain body/reach/component identifiers. Use field
   screening for prioritisation, actual exported triangles for mesh evidence.
   A flowing raster proxy cannot certify channel coverage. Mark tiles lacking
   emitted geometry as unverified rather than reporting every point as dry.
3. Calculate connected peak requirements across those complete targets. Choose
   a coherent upper-stage proposal from the distribution, preserving lows,
   original pools/spills and retaining bounds. Fix infeasible connected groups,
   then run one fresh native compilation for the coherent proposal.
4. Export versioned low/base/maximum physical coverage from those same accepted
   planes, responses, access barriers and surfaces. Bind it to terrain stage
   (natural or graded), terrain/geometry hashes, grid coordinates and stage
   bounds. Derive Studio water/flood overlays and physical semantic wetness from
   this output. Include map, blueprint backdrop and minimap consumers. Keep
   temporary higher-stage diagnostics separate from deployed data.
5. Verify one coherent bundle: original-water/low-stage preservation, complete
   authored targets, mesh joins, map/query agreement, semantic consumers and
   loading/performance. Use focused fixtures during iteration, broader gates
   when that bundle is ready. Do not repeat large point-query scans when a
   tile/triangle pass can answer the same question once.

## Implemented field screening

`worldgen.water_coverage` applies the shared low/base/maximum bounds and runtime
still-water thresholds (depth>4mm, access≤offset+1mm). It never treats kind128
flowing proxies as standing coverage. `worldgen.audit_water_coverage` processes
target tiles, aggregates by footprint family and body/class, and retains a
deterministic example per group. Tests cover stage changes without altered lows,
access barriers, proxy exclusion, overlapping families and tile-size invariance.

The first accepted62-state screen covers every vertex of both recovered channel
families, not just the4,303 local samples:

| Footprint | Vertices | Standing-field peak wet | Depth shortfall | Access blocked | Flow mesh unverified | Unsupported |
|---|---:|---:|---:|---:|---:|---:|
| Continuum channels | 362,040 | 279,264 | 42,512 | 6,182 | 33,128 | 954 |
| Rivulets | 163,667 | 121,599 | 13,362 | 4,197 | 24,184 | 325 |

Families overlap. These are **field classifications, not final wet/dry counts**:
channel meshes may also cover standing-field shortfalls. Groups number411/1,090;
body indices refer to the hash-bound captured fields. Full report:
`/tmp/water-province-channel-field-screen.json`; compact durable counts, largest
groups, input hashes and limits: `water-repair-inputs/province-coverage-field-screen.json`.
Neither screen changes physical inputs, stage selection or published maps.

From `tooling/world-generation`, rebuild with:

```sh
python3 -m worldgen.audit_water_coverage --fields /tmp/water-drainage-seasonal-full-fields.npz --targets /tmp/water-authored-channel-footprints.npz --ground PATH_TO_ORIGINAL_NATIVE_NPY --bed-overlay water-repair-inputs/bed-overlay.json --out /tmp/water-province-channel-field-screen.json
```

The ground path is `worldgen.compile_chunks.DEFAULT_HEIGHTS`; overlay corrections
are applied in memory. Optional `--stage-range` reads all four bounds from JSON.
It cannot exceed `--field-stage-range` (original bounds by default): unvisited
access sentinels are not measured sills. Fresh higher-stage fields are required.
This guard invalidated12 standing additions and two claimed peak-preservation
fallbacks in the old3m experiment; corrected evidence is in the main handoff.

## Implemented channel triangle audit

`export_water_audit_mesh.cjs` invokes the actual runtime triangle builder via
TypeScript transpilation, without copying or changing runtime source. It writes
hash-bound binary batches with compiled stage bounds and source identities.
`worldgen.water_mesh_coverage` evaluates those Float32 triangles against actual
native terrain vertices with the sampler's depth/access/barycentric rules.
Overlapping blocked faces cannot hide lower wet faces. Scratch work is tiled;
results accumulate across batches. No slow individual sampler scan is needed.

Pass `--channel-mesh DIRECTORY` to the existing coverage command. It reports
channel wetness and its union with standing-field evidence separately, and
removes mesh-covered samples from unresolved body/class groups. Optional
`--channel-result FILE.npz` retains the sampled mask and coverage for reuse;
unsampled zeros never mean dry land. This is still not final native-refined
standing/channel mesh or map acceptance.

The first1,584-record/318,260-triangle pass took16.06seconds over the recovered
channel families plus the local regression set. It reproduced all3,847 local
channel peak positives and4,136 combined positives (including three falling
sheet cases excluded from the older4,133 ordinary-water count). Evidence:
`/tmp/water-province-selected-mesh-screen.json`.

The full accepted62-state export is now captured in
`/tmp/water-all-accepted-ribbons.json`:15,085 accepted longitudinal records plus
1,309 landing fills. It preserves all1,584 earlier records exactly. Binary mesh:
`/tmp/water-all-accepted-mesh/manifest.json`,3,364,584 triangles in257 batches.
The full target audit took156.59seconds; geometry export took506.37seconds and
did not rebuild physical fields or change the accepted solution.

| Family | Peak channel/standing-field union | Still unresolved | Of those: mesh present / absent |
|---|---:|---:|---:|
| Continuum channels | 337,485 / 362,040 | 24,555 | 10,438 / 14,117 |
| Rivulets | 158,142 / 163,667 | 5,525 | 1,655 / 3,870 |
| Local regression | 4,136 / 4,303 | 167 | 96 / 71 |

These remain screening counts, not final rendered-water acceptance. The local
ordinary-water count remains4,133 plus three falling-sheet cases. Body/class
groups now exclude samples covered by supplied channel meshes. There are206
continuum and497 rivulet unresolved groups; families can overlap.
Durable summary/provenance: `water-repair-inputs/province-channel-mesh-screen.json`.
Full groups: `/tmp/water-province-all-channel-mesh-screen.json`. Reusable sampled
mask, mesh presence and stage bits: `/tmp/water-all-accepted-channel-coverage.npz`.
Do not rerun this unchanged baseline. `/tmp/compile-water-all-accepted-ribbons.py`
rebuilds the disposable complete geometry from the matching saved state.

The dominant missing-surface versus height/access split now comes from
the whole recovered channel domain, not from selecting another isolated point.

### Pond hollow targets

`audit_water_authored_footprints` now also recovers `wetlandPoolHollows` from
the pool deepener's exact selection predicate. The full continuation replays
levees, oxbows, wetland compaction, pool deepening, deltas and bed conditioning
with the original RNG sequence, checks recorded cuts, and requires exact final
equality with the saved natural terrain. This catches additions that positive
cut snapshots alone cannot verify. `--channels-only` retains the earlier mode.

The province replay succeeded: 1,500,146 pond-hollow vertices, no actual pool
cuts outside the recovered footprint, and both previous channel masks exactly
unchanged. Six focused tests cover generation preservation, shallow cuts that
round away, exclusions and rejection of mismatched final terrain. Recovery:
`/tmp/water-authored-water-footprints.npz` and matching JSON. This adds targets;
it does not change physical terrain, water levels or published assets.

At the accepted stage bounds, the standing-field/all-accepted-channel union
covers 1,237,909 of those vertices at maximum, leaving 262,237 unresolved.
After removing channel-covered samples, those split into 125,910 unsupported,
125,048 standing depth shortfalls, 10,807 access failures and 472 flowing
samples without verified wet geometry. These are 1,865 body/class groups;
body zero combines unassigned areas and is not one physical pond. Durable
summary: `water-repair-inputs/province-pond-hollow-screen.json`. Full groups:
`/tmp/water-pond-hollow-coverage.json`; sampled channel evidence:
`/tmp/water-pond-hollow-channel-coverage.npz`. Reused the existing mesh export;
no channel compilation was repeated. These remain numerical screening results,
not final standing-mesh or map acceptance.

Independent review confirms that hollows are only part of the pond target:
enclosing basin slopes, pools within 40 metres of channels and connecting swamp
sheets still require separate recovery. Other target families and final
standing/native-refined meshes remain open. Never substitute this hollow mask
for the complete intended pond footprint or for a map of actual water.

### Shared pond-selection repair under verification

The unsupported hollow group contains 48,278 vertices inside actual closed
depressions and 77,632 outside them. Of the closed-depression group, 42,294
fail the mean-ground-slope filter, 17,370 the area filter, 1,862 depth and 313
coarse semantic allowance (overlapping counts). No affected component passes
all existing selection gates. This is a measured selection defect, not evidence
that simply raising the wet-season amplitude will fill every missing pond.

`water_authored_pools.retain_authored_pool_basins` adds verified authored
components using the existing marsh thresholds: maximum depth at least 0.10m
and area at least 24 native vertices. It bypasses coarse semantic majority and
mean ground slope only for that additive authored branch. Closed bowls may have
steep sides while their water plane remains flat. Existing selection is retained
verbatim, whole components are kept, and original-head preservation still runs
after selection. Smaller/shallow hollows remain targets, not waived failures.

The candidate adds 2,149 basins (263,520 basin vertices), including 31,745
previously unsupported hollow targets. It is currently available only through
the explicit `compute(authored_pool_hollows=...)` diagnostic argument; no public
assets or accepted repair manifest have changed. The diagnostic caller verifies
the footprint's exact natural replay and terrain/overlay/routing hashes.
Twenty-four focused selection/domain/synthetic compiler tests pass; independent code review found no
blocking selection defect. Evidence: `water-repair-inputs/pond-selection-proposal.json`.

Fresh profile diagnostic: `/tmp/compile-water-authored-pond-profile.py`. Its
first attempt correctly rejected the old seasonal proposal's stale geometry.
The fresh unseasonal solve then completed in113seconds: 136 rejected channels
(not comparable with the seasonal accepted62), 249,710 new pool vertices, but
2,364 changed accepted pool heads. Of those changes, 2,363 lie where repaired
spill potential differs from original potential: the original-only preservation
guard cannot protect them. No raw basin contains incompatible accepted heads.

The candidate now also accepts an explicit `retained_pool_reference` with
accepted levels and their matching potential. It applies the existing head
preserver before domain closure and locks those basins against later freeboard
retuning, while keeping original spill/retaining references separate. Follow-up
diagnostic: `/tmp/compile-water-authored-pond-retained-profile.py`; its result
completed in125seconds with 249,380 new pool vertices. All but eight accepted
pool vertices keep exact heads; those eight lose shoreline support and remain
a preservation failure. The candidate is not accepted.

Reinterpolating the reviewed seasonal budgets along geometrically unchanged
courses on the new graph (`/tmp/rebase-water-authored-pond-seasonal.py`) gives
93 rejected candidates and32 connected supporters. The cached-domain screen
leaves76 failures,14 more than accepted:13 new limiting caps come from added
low pond heads, while one added pond head exceeds a channel bank cap. This
proposal still needs fresh response validation. Next fix is shared pond/outlet
level reconciliation and retained fringe ownership; do not promote a selection
change that adds ponds by removing accepted rivers. Saved fresh state:
`/tmp/water-authored-pond-retained-profile.npz`; proposal and solved heads:
`/tmp/water-authored-pond-seasonal-{proposal,solved}.npz`; conflict details:
`/tmp/water-authored-pond-seasonal-conflicts.json`. Reuse these unchanged domains
for connected-group diagnostics before another native compilation.

Production acceptance still needs
footprint provenance in CLI/cache/manifest, fresh seasonal response and low-water
preservation checks, channel feasibility, new flat-plane/ownership checks and
the shared map/semantic export. A profile-only solve cannot certify those.

Next: complete target families and full actual geometry evidence, then derive
the shared map/semantic coverage output. Keep source, terrain-stage and stage
provenance when reusing any diagnostic cache.

## Accepted62 preview assembly and rendering costs (2026-09-07)

The owner requested a live progress deployment. Source through `10eecc5` is
live (Actions `34110124664`); HTML, JS and unchanged public water metadata
match the Pages artifact byte-for-byte. Native preview assets are not live.

Reuse `/tmp/water-live-preview/`: accepted62 channels/cascades, native ground,
all256 adaptive terrain chunks in six variants, and the matching46446-texel
gradient patch have finished. The publication surface is2017²/3.65568m;
native terrain remains4033²/1.82784m. `/tmp/export-water-accepted-preview.py`
verified every cached feature field and every emitted channel record against
the accepted full export before reusing it. `/tmp/assemble-water-live-preview.py`
finished all assets before its old map-grid assumption failed; the corrected
map exporter subsequently completed. Do not rerun either expensive assembly.

`export_water_coverage.py` samples graded public terrain on the publication
grid and combines standing fields with the existing accepted channel mesh
archive. Its preview maps contain low/base/maximum wet counts of
1459703/1650020/2393980. They explicitly do not certify final rendered/native
coverage. Map/semantic acceptance remains open. Local Studio plumbing selects
the matching water/terrain/gradient/maps with `?waterDataset=preview` (separate
from the existing waterways toggle `water=1`), preserves the query parameter,
and scales the lower-resolution maps. Those assets are not in public yet.

The actual dataset fails the unchanged runtime budgets. Use
`WATER_COMPILED_ASSETS=/tmp/water-live-preview` and
`WATER_COMPILED_PROVINCE=$PWD/apps/world-studio/public/province` with the
`waterProductionBudget.test.ts` test; optional `WATER_BUDGET_REPORT=1` prints
counts. Passing the legacy/default asset test does not certify this preview.
Lossless, resumable vertex indexing now removes duplicated inland clipping
vertices. Before:527603 inland triangles used100594922bytes; after:999979
triangles use92737184bytes, with698 tiles still pending at the triangle cap.
Ribbons still exhaust64MiB:754869 triangles/67106806bytes,59 failed admissions.
Do not increase caps, omit visible water or publish this as a coherent preview.

Three actual tiles confirm the shared inland triangle floor; clipping reduced,
rather than caused, the original counts. Tile10,1:724 leaves/1214 domain
cells/3122 final triangles;14,8:1352/5454/14359;20,16:1738/6970/14448.
Every standing owner in those tiles has constant base/tide/season coefficients
(2/15/17 owners). Source evidence: `/tmp/water-inland-storage.json`.

The native inland renderer now proves constant owner fields from exact source
stencils plus an interpolation halo (`WaterData.rasterVertexAt`,
`constantRasterOwners`). Beyond requestedStep2 it emits coarse conservative
owner patches; varying owners retain the existing partition path. It keeps
shared tile-edge knots and native channel subtraction, filtering cutters only
when they cannot touch any of that owner's supported cells. Explicit raster
fragments reject other owner IDs. Flat patches use exact pixel proxy depth
where the sparse native atlas is absent and sample their actual fragment flow
with zero surface grade, rather than inheriting a nearby river's flow.

Independent review caught a wave-seam defect in the first candidate: native
vertex depth differed from the detailed path's proxy-depth wave input. Both
paths now use the same proxy and one-sided owner sampling at shared vertices;
clipped flat vertices resample that same rule. Regression fixtures cover
neighbouring heads, low/base/high stages, a one-cell island, a dry hole,
height/season changes in the halo, and animated coarse-to-detailed edges with
native and proxy depths deliberately different. This is not visual acceptance;
remaining appearance interpolation and final rendered coverage need evidence.

Intermediate sample reductions were3122 unchanged/2698/7528 triangles. After
source-stencil CPU optimisation, the normal-view native budget still failed:
344 tiles/987507 triangles/95963426bytes admitted,541 pending after10000frames;
no budget rejection yet, so pending work is not proof of exhausted memory.
Ribbons still have59 rejected admissions at64MiB. This measurement predates the
final wave-edge correction. `/tmp/water-flat-owner-fast-budget.log` retains it.
Next work: remove redundant fragmentation from sequential native-footprint
subtraction on coarse owner patches, then settle the complete view and address
ribbon storage/topology. Do not raise caps or omit visible water. Update any
CPU rendered-coverage oracle for the new explicit-owner discard and marker2
pixel-depth fallback before using it as final acceptance evidence.

Verification: root typecheck passed. Root tests found two shader-string
expectations affected by the new fragment-flow binding; both were corrected
and their focused reruns pass, along with the constant-owner/edge regressions.
The remaining root failure is four prose-lint hits in concurrently edited
settlement blueprints (Mazzatun/Lilmoth/Wamasu Pond). Linting the committed
blueprint versions, with all other current inputs unchanged, passes with zero
hard hits/density breaches. Water work did not edit those blueprint records.
The final-artifact gate is still skipped without published final assets.

One bounded ribbon diagnostic (`/tmp/water-ribbon-storage.json`) ruled out
large normal-only welding savings for representative distant patch4,27:
6724 cross-section samples already reduce to1545;2280 triangles use2279
vertices/154978bytes. Int16 normals give2272vertices/140912bytes; removing
normals diagnostically gives2268vertices/127080bytes. Neither change was
applied. Normals feed actual slope/wave shading; do not discard them. Review
the remaining longitudinal topology and attribute storage together instead
of repeating already-active cross-section LOD and indexing work.

## Unpublished native preview: shared geometry work (2026-09-07)

Runtime polygon union was measured against the exact channel footprints and
an independent Shapely area oracle. `polygon-clipping` preserved the area but
cost several milliseconds per coarse cell even with pre-unioned cutters;
`polyclip-ts` returned an incorrect empty result on the retained dense case.
Neither dependency was added. Primary implementations:
https://github.com/mfogel/polygon-clipping and
https://github.com/luizbarboza/polyclip-ts. Evidence lives in
`/tmp/water-polygon-probe` and `/tmp/water-polygon-comparison.json`.

The uncommitted alternative prepares exact runtime channel cutouts once during
export: `export_water_footprint_tiles.cjs` exports the sampler's footprint
triangles; `worldgen.prepare_water_cutouts` unions them with Shapely and
constrained-triangulates coarse cells at steps4/8/16, preserving shared tile
edge knots. Runtime loading verifies source ribbons, packed sections, grid,
length and SHA-256, then uses typed triangles without repeated subtraction.
The complete prepared file in `/tmp/water-cutouts-prepared` is16,730,688bytes
(3,716,389 gzip), SHA-256
`7ead96e752316933e1b2ea663fc5062f9112297c120a07e8228c42e22c7a30ff`.
Its676,525 triangles cover all three offline LOD variants, not one resident view.
It is attached only to `/tmp/water-live-preview`; public assets are unchanged.

Additional local changes index nearest same-owner support rectangles, use
actual per-tile water heights for pre-build visibility, keep view buffers
horizontal, and clip flat proxies to the complete owner support rectangle.
No target footprint, stage or shoreline is reduced. Latest actual native
normal-view test (`/tmp/water-tight-owner-budget.log`) still fails:
381 inland tiles,923,047 triangles,89,210,606bytes and434 pending tiles after
10,000 updates; zero inland budget rejections. Ribbons admit288 patches at
67,107,680bytes with57 rejected admissions. Pending inland work is not evidence
of memory exhaustion. Next address loading work and lossless native-ribbon
attribute storage together; do not increase caps or discard visible water.
Native rivers now use a distinct material layout retaining Float32 flow,
response and normals, reusing position.y as head and storing the response-valid
flag as an unnormalized byte. This saves11 bytes per vertex and also preserves
older records without explicit seasonal responses. Above/below variants share
uniforms, have separate program keys and are selected by geometry layout.
Independent review found no fidelity or material-selection defect.

After packing, the same normal-view test admits all345 river patches:
885,393 triangles,65,595,378bytes, zero pending/rejected patches. Inland still
has479 pending tiles; concurrent typecheck makes its timing incomparable with
the earlier run. River storage now fits this view without changing caps;
complete standing-water loading and other views remain open. Retain
`/tmp/water-packed-ribbon-budget.log` rather than repeating it unchanged.

Native layout preservation and shader-binding/streaming tests:14 passed;
renderer/loader/index tests:20 passed; prepared-cutout Python checks:3 passed.
A headless WebGL2 check compiles and draws both old/new layouts above and below
with the actual Studio aerial binding: all four link, zero GL errors and no
console errors (`/tmp/water-native-layout-gpu.mjs`, matching `.log`). No images
were captured or ingested. Root typecheck passes. Root tests pass all water
checks (game-core781 passed, one final-asset test skipped). The combat
child-process test hit sandbox EPERM then passed its seven focused tests with
normal process permission. The remaining root failure is the same four
concurrent settlement blueprint prose hits; none of those records is part of
the water change. These do not certify final rendered coverage or native preview
performance. Reuse the completed assets; do not repeat full native compilation.

## Standing-water cost classification after river packing

One diagnostic constructed all815 requested normal-view standing tiles, then
disposed each geometry without applying admission caps. It took25.24s and
produced1,590,686 triangles /77,519,334source bytes, before displayed-batch
copies. This proves a geometry/storage problem as well as loading time;
raising the10000-update test limit cannot make this fit unchanged budgets.
Step16 accounts for1,047,871 triangles across633 tiles. Retain
`/tmp/water-all-standing-tile-costs.json` and
`/tmp/waterNativeWorkDiagnostic.test.ts`; do not repeat the full screen unchanged.

A bounded20-tile owner classification (`/tmp/water-standing-owner-ranges.json`,
script `/tmp/waterStandingOwnerRangesDiagnostic.test.ts`) identifies the shared
cause: the large owner6 wetland often has exactly constant base head and tide,
but its season response varies from0.6666667 to1 across portions of a tile.
The current whole-owner proof rejects all of it and invokes fine partitioning.
Native-ground checks confirm thousands of these samples are truly wet; they
cannot be culled as buried/dry or have their stage response flattened away.

The coarse-cell piecewise experiment was implemented, measured and rejected:
1,636,640 triangles / 77,070,985 source bytes, with extra boundaries cancelling
the savings. Its code is archived in `/tmp/water-rejected-piecewise`; no part
of that experiment remains in the renderer.

The effective shared fix removes unnecessary native inland class boundaries
from adaptive subdivision. River/lake/marsh fragments already sample the exact
class, and share the same vertex wave regime. Owner, support, height, all-stage
error and marine transitions still refine. This reduces the same complete view
to 1,111,178 triangles. Removing faces with exactly zero XZ area after Float32
conversion then gives **1,026,192 triangles / 54,471,767 source bytes** across
all 815 tiles, constructed in 14.40 seconds. No nonzero-area face is removed.
Exact duplicate removal saved nothing and was discarded. Evidence:
`/tmp/water-clean-standing-costs.json`; do not repeat unchanged.

The displayed native inland merge now writes a compact layout directly:
39 bytes/vertex instead of 49, with unchanged Float32 head, sample coordinates,
ground and tide/season coefficients. Raster mode and up normals are validated
constants; flags 0/1/2 remain exact Uint8 values. Unannotated tiles are promoted
with flag zero, preserving raster sampling. Retained source tiles stay unchanged.
Above/below material variants explicitly reconstruct the constants, share
uniforms and are selected by the displayed geometry's attributes. Independent
review found no field-loss or material-selection defect.

A one-off actual native normal-view test passed in 29.1 seconds: all requested
standing tiles and river patches finished, zero budget rejections, and aggregate
geometry stayed below 2,048,576 triangles / 160 MiB. The test temporarily allowed
standing water to use spare river triangle capacity; that allocation change is
not yet in production. Evidence: `/tmp/waterNativePackedDiagnostic.test.ts` and
`/tmp/water-native-inland-packed-budget.log`. Existing measured source rows plus
the exact new merge layout calculate 54,471,767 standing source bytes +
44,695,977 displayed bytes + 65,595,378 river bytes = 164,763,122 bytes. This is
normal-view evidence only, not a low-quality or moving-camera acceptance claim.
Do not repeat this unchanged diagnostic.

The shared ledger is now implemented and injected per WaterSurface. It retains
2,048,576 triangles and normal/low 160/128 MiB, atomically replaces allocations,
and releases them on eviction/disposal. Inland reservations retain source arrays
plus the larger of displayed/replacement layouts until publication. The extra
resumable merge overlap is separately exposed as `transientMergeBytes`. Existing
synchronous cancellation precedes resuming any merge after its sources change.
A targeted regression pauses a merge, evicts its sources, verifies cancellation
and checks displayed/source accounting each frame. Independent review retracted
an initial missed-cancellation concern; no demonstrated lifecycle defect remains.

## Shared immutable standing-water storage

Published native inland batches now also provide immutable source tile spans.
Each span records vertex/index ranges; the merger explicitly rebases global
indices and copies unchanged packed attributes. Changed tiles still build
independently. On publication every participating source switches to the new
backing; raw input geometries are disposed. Marine sources keep their original
representation. Complete backing allocations are counted once until every
source/display reference releases them. A partially evicted batch remains fully
counted while surviving tiles or its displayed geometry still reference it.

Native admission reserves the larger of current reachable backing bytes and
future merged bytes. `transientMergeBytes` exposes the additional construction
overlap. Synchronous cancellation prevents stale merges from publishing after
source eviction. Focused tests cover reordered spans plus fresh geometry,
unchanged fields/indices, complete backing retention after partial removal,
native rebuild/eviction/return, and paused-merge cancellation. Independent review
found an unpacked-span field-offset defect; it was fixed and given a regression.
No further lifecycle defect was identified.

**Both canonical actual-native quality tests now pass**, including zero pending
and zero rejected geometry, with the unchanged combined limits:

| View | Standing tiles / triangles | River patches / triangles | Combined array bytes | Updates to settle |
|---|---|---|---|---|
| Normal | 815 / 1,026,192 | 345 / 885,393 | 110,291,355 | 9,285 |
| Low | 695 / 948,520 | 347 / 865,930 | 105,554,964 | 8,740 |

Normal standing storage is 44,695,977 bytes, down from 99,167,744 before sharing;
low is 41,296,794. Peak merge overlap was 1,655,721 / 1,690,620 bytes respectively.
Both views together took 54.24 seconds in the headless CPU test. Evidence:
`/tmp/water-native-shared-storage.log` and
`/tmp/water-shared-storage-budget-{normal,low}.json`. The canonical test accepts
`WATER_BUDGET_REPORT_PATH` to retain reports. Do not repeat unchanged.

The prior low failure (525 tiles, 132 rejected, 38 pending) is resolved by
removing duplicate storage, not increasing limits or removing water. **Loading
latency remains open:** around nine thousand update cycles is too slow for a
finished streaming experience, even though residency and memory now pass.
Measure/solve repeated runtime construction with shared preparation or caching;
do not call this final performance acceptance. Physical peak-coverage holes,
final asset/map/semantic publication and the full water checklist remain open.

Accounting: `waterGeometryBytes` counts JS geometry attribute/index arrays;
unique backing counting preserves that metric. It does not independently
measure GPU/driver allocations. Geometry still uploads to the GPU, and shared
JS storage must not be described as eliminating that separate device cost.
Final shared-storage root verification: game-core 795 passed, one final-asset
test skipped; all other runtime suites pass and root typecheck passes. The
sole root failure is concurrent settlement prose lint
(`/tmp/water-shared-storage-root.log`). Standalone preview assets are about 481 MiB, current Studio public assets about
166 MiB; combined Pages size needs to include the other app before publication.

## Loading-path optimisation and prepared-grid provenance

A one-off full-view phase profile attributed about 12 seconds to leaf clipping,
not buffer copying (~0.33s) or initial sampling (~1.37s). Instrumentation itself
pushed that run to 10,000 updates with work remaining; it is diagnostic evidence,
not a residency acceptance result. The profile is retained at
`/tmp/water-loading-profile-normal.json`, script `/tmp/waterLoadingProfile.test.ts`.

The clipping routine previously ran polygon intersection against every cutter
in a coarse cell, even when their bounds were disjoint. It now skips strictly
disjoint original/polygon bounds, retains touching bounds for exact clipping,
and yields periodically through long skipped lists. When subtraction returns
its original points unchanged, InlandWaterTiles retains their original vertices
and hydraulic fields instead of rebuilding/re-interpolating them.

The twelve previously most expensive tiles retain identical triangle counts.
Their measured leaf-clip work fell from 4,475.7ms to 1,846.9ms. Bounds alone gave
2,296.3ms. An immutable cutter BVH gave 2,337.8ms (no useful additional saving)
and was removed; do not reintroduce it without new evidence. Retained evidence:
`/tmp/water-clip-profile{,-before-bounds,-bounds-only,-rejected-bvh}.json`,
`/tmp/waterClipProfile.test.ts`, `/tmp/water-rejected-RibbonFootprintIndex.ts`.

Both final actual-native views still pass with exactly the same total triangles
and array bytes as the shared-storage checkpoint. Normal settles in 7,912
updates; low in 6,734 (previously 9,285 / 8,740). Both tests took 51.36 seconds
total on this run. Timings vary with host load; this is useful reduced work,
**not acceptable final loading latency**. Reports:
`/tmp/water-fast-clip-budget-{normal,low}.json`, `/tmp/water-fast-clip-native.log`.
Do not repeat unchanged. Keep the outstanding physical coverage work active;
preparing static geometry should follow stable hydraulic inputs where possible.

Prepared cutout descriptors now bind the surface sample origin and the full
class grid (size, spacing, origin), in addition to existing channel/section
hashes and surface spacing. The loader rejects mismatches before fetching.
The Python builder emits these fields; the existing local preview descriptor
was upgraded directly from its verified original footprint header, checking
both footprint-file and binary hashes. The dependent coverage metadata input
hash was refreshed. Geometry, stages and map pixels were not regenerated.
Canonical channel-record hash still matches. Three loader tests and four
Python cutout tests pass, including distinct class-grid origin/spacing cases.
Final root runtime suites pass (game-core 796 passed, one final-asset test
skipped), and typecheck passes. Only concurrent settlement prose lint fails
(`/tmp/water-fast-clip-root.log`).

Five compact merge checks pass, including absent optional fields and rejection
of invalid constants. Six headless WebGL2 draws (general/ribbon/inland, above
and below) link with zero errors, using Studio aerial bindings and no images
(`/tmp/water-inland-layout-gpu.log`). Root typecheck passes. The final root
run passes runtime suites (game-core 789 passed, one final-asset test skipped);
its only failure is unrelated concurrent settlement prose lint. Results are in `/tmp/water-inland-packed-root-final.log`.

## Latest local evidence to retain, not repeat

- Generic terminal selection excludes rejected continuations. Of ten apparent
  end misses, only three are true terminal10585/source10573; seven belong to
  rejected upstream source12745. Generic emission remains diagnostic opt-in.
- Its216 unrefined triangles cost32,400bytes. A half-native-spacing screen
  sampled565 potentially wet triangle points (duplicates included), finding no
  incompatible owner. This does not certify continuous between-ray boundaries.
- Source12745 requires4.066539m beside a4.022641m bank cap. The limiting crest
  is identical in original and repaired terrain; restoring earlier cuts cannot
  remove this obstruction. A direct route-only alternative still leaves62
  failures, resolves none and adds none; do not promote or repeat it.
- Disposable evidence: `/tmp/water-source12745-diagnosis.json`,
  `/tmp/water-source12745-route-screen.json`,
  `/tmp/water-terminal-subcell-ownership.json`. No terrain, route, stage or
  production water assets changed in this review.
