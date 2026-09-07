# Historical water repair investigations

Archived evidence and rejected approaches. These are not current inputs or counts.
Use [the current handoff](WATER_REPAIR_HANDOFF.md) before reusing any cache.

## Reviewed retaining restoration (2026-09-06)

Ten further vertices now meet their immutable retaining bound (partial height
restoration, not new excavation). Source319's sampling anchor moves from native
(187,1833) to (187,1832), inside the same original4.190784m pool. Its old anchor
was originally dry4.723274m ground; excavating that bank to keep an artificial
pool margin wet was the wrong requirement. Both incident routes (307,319) move
with the shared anchor. `routing-audit.json.stationOverrides` retains exact
original/new coordinates and original pool-head evidence; the compiler checks
native alignment, a2-interval maximum displacement, originally dry source and
originally wet destination. No original wet anchor or pool plane can move.

Fresh native-domain acceptance:311 constraints, zero new failures; all423,268
original impoundment interior samples retain planes within0.1mm, no missing
samples and exactly zero spill-potential difference. The interior mask is
`finite(referencePool) & referencePool > originalGround+.01 & originalPotential > originalGround+.02`.
The broader reference fringe has inherited discrepancies; no previously
accepted original-ground wet sample lost or changed its plane in this repair.
Final full-geometry coverage must still include those fringes.

The earlier all251-bound restoration trial introduced187 new failures.
A diagnostic94-anchor/170-route proposal reduced that to127 new failures,
resolving2 old sources; it is **rejected**, not an accepted next overlay.
`/tmp/water-original-pool-routes-audit.json` retains its exact evidence against
the predecessor311 cache. Most new conflicts occur at actual pool exits,
where minimising a reach's highest bed can overlook a lower, locally impassable
retaining crest. Source399 is one diagnosed example. Do not replay the whole
proposal on the new checkpoint; use bounded bank-aware exit components.

Source399's pool exit subsequently passed the same fresh-domain checks.
Its shared anchor moves from native(201,1777) to(200,1777); both incident routes
are updated. A bank-aware path retains the original maximum saddle and needs
seven bounded support adjustments, at most0.361629m additional/original cut,
while restoring retaining vertex812410 to0.189129m. No new failures or original
pool/spill changes;240 retaining-bound violations remain. That intermediate overlay had
15,418 corrections. The original all-group proposal remains rejected.

### Restored cut-created marine anchors

Earlier cuts had lowered positive original riverbeds below sea level near
sources14037,14047,6871,6898. Restoring15 affected vertices to their original
heights removes that false sea-level authority. A fresh native compile resolves
source6871, introduces no failures, and leaves310 constraints (15 pinned).
All423,268 original impoundment interiors, their planes and spill potential,
all original marine samples, and previously accepted original-ground wet pool
planes are preserved. Corrections fall to15,403; retaining violations remain240.
Evidence: `/tmp/water-cut-created-marine-audit.json`,
`/tmp/water-coastal-anchor-fresh.json` and
`/tmp/water-coastal-anchor-preservation.json`.

### Bank-aware routing and false-pool support restorations

A152-route diagnostic batch resolved17 sources but introduced18; rejected.
Selecting only routes associated with resolved sources and excluding the
source3994 component leaves15 route changes. A fresh native compile confirms
15 failures resolved and none introduced. Three original-height restorations
at2624816,12515003,12595903 remove false pool anchors; combined fresh domains
resolve18 sources overall, leaving292 constraints (10 pinned),15,400 corrections,
35 route overrides, and240 retaining-bound violations. All original pool/spill,
marine and previously accepted original-ground wet pool samples pass.
The durable input audits carry exact routes/supports and acceptance evidence.
Temporary evidence: `/tmp/water-bank-aware-safe-audit.json`,
`/tmp/water-artificial-pinned-supports-audit.json`,
`/tmp/water-bank-aware-restored-fresh.json`, and
`/tmp/water-bank-aware-restored-preservation.json`.

The local component helper previously selected only each conflict's summary
node, omitting181 obstructed nodes on101 reaches at the310 checkpoint. It now
selects every `nodeBankCaps` entry and couples obstructions sharing a source
as well as native terrain support. The next check exposed fixed rejected
intervening heads; the helper now includes each complete affected reach.
A two-obstruction-plus-intervening-sill actual solver regression
passes;11 focused local/reach tests pass. The complete-reach proposal resolved73
in cached geometry and72 in fresh domains, with no new channel failures.
However, five original wet fringe vertices lost their original pool coverage.
Entire components6944,13468,15499/15503 were omitted, together with11251,
which had not resolved after the fresh rebuild. The remaining proposal passes
fresh native domains:224 constraints,68 resolved, no new failures, no changes
to any original impoundment or previously accepted original-ground wet pool
coverage/planes. Marine coverage and original spill potential remain exact;
240 retaining-bound violations remain. Durable audits include full support
and component evidence. Do not replay the earlier rejected/provisional subsets.
Evidence: `/tmp/water-complete-local-reach-safe.audit.json`,
`/tmp/water-complete-local-reach-safe-fresh.json`,
`/tmp/water-complete-local-reach-safe-preservation.json`.

### Coupled original-pool retaining components

A newly rebuilt candidate restored all240 remaining bounds and moved89 dry
sampling anchors into verified original pools. It preserved original pools but
introduced110 new channel failures. The complete-reach helper now optionally
includes longitudinal obstruction corridors (`--include-longitudinal`), avoiding
fixed downstream fallback heads;five focused component tests pass. Its one
bounded solve resolved40 candidate failures, insufficient to accept the whole.

Restorations, anchor moves and exact LP supports were grouped by shared native
support and stable source IDs. Unsafe groups were omitted without rerunning
LPs. A fresh subset exposed interactions near2294,11355,13513; their causal
components2294,11371,13512 were removed. Components6944,13468,15499/15503
were also removed because they lost the same five original wet fringe samples.
Those five native vertices are now explicitly protected against repeat cuts.

Accepted fresh result:120 retaining restorations,55 original-pool anchor moves,
82 bounded support adjustments (maximum additional0.952782m, maximum original
cut2.145524m). There are204 constraints (10 pinned),120 bound violations,
15,507 corrections,57 total anchor overrides and35 route overrides. Original
impoundments, spill potential, marine samples and previously accepted original
wet fringes remain exact. The20 removed wet samples had NO originally wet
reference coverage: they were earlier repair-created extensions on originally
dry ground, not lost original pools. Exact indices and reference evidence are
in `retainingSupportRestorationAudit`; do not force preservation of those
artificial extensions at the expense of restoring original geography.

Evidence: `/tmp/water-retaining-safe.audit.json`,
`/tmp/water-retaining-safe-fresh.json`,
`/tmp/water-retaining-safe-original-preservation.json`.
The unaccepted all240-restoration diagnosis is
`/tmp/water-retaining-residuals.json`:96 new residual sources after its cached
LP,59 local and2 pinned;69 touch one original pool,9 have both endpoints in the
same original pool. Most obstructions are protected pool-exit crests; routing
must account for fixed receiving heads and immutable cut floors. These indices
belong to that candidate, not the current204 cache. Do not replay it wholesale.

### Bounded route costs and reviewed drainage

The route candidate cost now measures immutable excavation floors, actual banks
and fixed pool heads. It leaves original saddle/endpoints/corridor guards intact;
only the joint solve plus fresh domains can accept a route. Four focused tests
cover retaining-crest avoidance, shallow fixed pools, deterministic defaults and
semantic channel width. Reviewed overrides may use the existing channel radius,
matching automatic routing, rather than an unrelated two-pixel cap. Anchor
relocations still require original-wet evidence within two native intervals.
The196-constraint checkpoint did not depend on the wider allowance; the next
accepted group below uses it explicitly.

A fresh bounded subset accepts49 more retaining restorations,11 anchor moves
and29 route changes. The original raw-reference direction comparison would have
introduced4328/4329/11861. Reviewing immutable drainage resolves the distinction:
24 discrepancies restore authored flow_to (mostly flat original pools);4328
already follows authored inflow into pool4329. Its lower raw film target requires
backwatering, not reversing drainage. Its orientation marker is raised to the
receiving original pool's ordering value; no physical plane is retuned. Five
bounded outlet support adjustments handle11861. The combined fresh rebuild has
196 constraints,71 retaining violations,15,521 corrections,68 anchor overrides,
and64 route overrides. It resolves6898,6944,9363,11251,11496,13468,15499,15503,
with no new failures or any original wet coverage/plane/spill changes.

Evidence: `/tmp/water-bounded-retaining-subset.audit.json`,
`/tmp/water-reviewed-orientation.json`, `/tmp/water-combined-reviewed-fresh.json`,
`/tmp/water-combined-reviewed-preservation.json`. Durable audits retain exact
support, routing and original-drainage evidence. `--source` on the component
helper scopes a proposal to reviewed current failures, while still checking
all neighbours globally. No old prototype cache is authoritative.

## Immediate next work

1. Immutable lower bounds are now enforced by routine and joint/indexed cut
   helpers. Their 187,399 support vertices exposed 352 earlier cuts
   below a bound; 281 now meet their bound without new global failures. Classify the
   remaining69 and restore only diagnosed
   unnecessary retaining/fringe cuts, retaining exact indexed evidence and
   checking valid channel/receiving support before acceptance.
   `audit_water_restore_retaining` produces an explicitly unaccepted proposal;
   its active native-crease checks are not a replacement for fresh domains.
2. The diagnosed cut-created pool anchor near source 13114 was restored.
   Original bed
   at native (2989,2439) is 4.441438 m, intended head 4.521438 m; an inherited 2.925 m
   cut had created a 1.623104 m pool where immutable terrain had none. Fresh
   domains now contain no pool at that anchor and its head is 4.521438 m again.
   Apply this causal diagnosis to other actual cases; never deepen adjacent
   channels merely to accommodate a pool created by our repair.
3. The25 orientation discrepancies are reconciled. Use the durable reviewed
   orientation; do not substitute raw reference film levels.24 directions now
   follow original drainage.4328 retains original inflow/backwatering into
   pool4329; the ordering marker is not a surface level. Exact review evidence
   is in `routing-audit.json.orientationReconciliation`.
4. Continue bounded connected-reach proposals; fixed real junction/pool
   authority, no-new-neighbour-failure checks, and strict original-pool
   preservation remain required. A cached geometry solve is not a fresh
   domain/flood acceptance after meaningful terrain edits.

For a specific **reviewed** full-river source, the bounded joint proposal is:

```sh
python3 -m worldgen.audit_water_joint_cuts /tmp/water-accepted-155-state.npz water-repair-inputs/bed-overlay.json --source SOURCE_INDEX --out /tmp/water-reviewed-proposal.json
```

Replace `SOURCE_INDEX` with the diagnosed source; do not run an indiscriminate
province-wide proposal sweep. Helpers reject old caches lacking retaining
bounds. The routine proposal helper now permits exactly one pass, verifies the
input overlay hash, and rejects the whole proposal on any new global failure
or no resolved constraints. It does not establish fresh-domain acceptance:

```sh
python3 -m worldgen.audit_water_solve /tmp/water-accepted-155-state.npz water-repair-inputs/bed-overlay.json --local-only --out /tmp/water-local-bank-proposal.json
```

Never use repeated cached proposals to justify moving-bank millimetre tails.
The one authorized routine local-bank trial at the preceding 349 checkpoint was rejected:
91 old constraints resolved but 16 new neighbouring failures appeared (435
updates, maximum new cut 1.673485 m). The accepted overlay remains unchanged.
`/tmp/water-local-bank-proposal.convergence.json` records that rejection;
the proposal JSON is byte-identical to that earlier overlay. Do not rerun the
same trial. Next work needs bounded shared-bank/fixed-neighbour constraints,
not an independent-cut iteration. Later CLI runs retain exact proposed support
indices even when rejected; this first rejected trial predates that addition.

The shared-support successor (`audit_water_local_components`) jointly constrains
bed, banks, fixed incident graph heads and valid neighbouring bank heads under
the same routine 3 m and immutable bounds. Its first combined proposal exposed
two failures, both caused by component/source 10244: fixing its first local
obstruction exposed a different unresolved downstream obstruction 54593, whose
30.278061 m requirement propagated back into an unchanged 29.869982 m pool.
The entire causal component was omitted with `audit_water_component_subset`,
without rerunning any LP or changing its terrain. Remaining independent cuts
passed one global check and fresh domains, producing the accepted 311 state.
Exact component/support evidence is in the durable overlay's
`coupledLocalProposalAudit`. Sources 10223/10256 remain valid, and 10244 remains
explicitly unresolved. No cached tail pass is pending or authorised.

For a newly diagnosed bounded proposal, these tools require a matching state
and overlay hash. They emit provisional artifacts only; do not replay the
already accepted 349-state proposal against the 311 checkpoint. Investigate
remaining components' fixed incident/retaining constraints before another solve.

## Tests and eventual export

Use only the changed-function Python modules while solving. Latest broad
checkpoint passed 120 tests; later spill/bound and joint tests also pass.
Do not repeatedly run broad suites or browser probes during hydraulic work.

Only after zero unhandled constraints and original-pool/boundary gates, stage
the 2017 raster/native-channel bundle (never directly into public):

```sh
python3 -m worldgen.compile_water --web-step 2 --max-bed-lowering 3 --bed-overlay water-repair-inputs/bed-overlay.json --orientation water-repair-inputs/orientation.npy --routing-overrides water-repair-inputs/routing-audit.json --out-dir /tmp/water-final-staging --cache /tmp/water-final-staging.npz
```

This command does not declare the current checkpoint valid. Final matched
native-ground, adaptive-terrain and gradient exporters belong to the rendering
handoff. Runtime compiled/confluence gates must cover all preserved stage
extremes, actual native triangles and the owner repros (2370,190),(1960,220),
(3840,1120), before coordinated promotion/deployment and owner review.
Also audit final fine supported standing pixels (`support.R=255`, excluding
native proxy128): a coarse marine class1/2 must not select any elevated base
plane beyond encoding precision. Report counts/coordinates; if nonzero, export
a coherent fine marine ownership/class selector rather than guessing from
height in the renderer. This requires no additional hydraulic flood solve.


## Peak-stage contract

`compile_water --stage-range <json>` accepts four nonnegative magnitudes:
`tidalAmplitudeM`, `seasonalAmplitudeM`, `lowTideAmplitudeM`,
`drySeasonAmplitudeM`. Omission retains .5/1.4/.5/.28 m. The compiler exports
these bounds in metadata and uses them for flood access, ribbon cross-sections
and access encoding. Runtime and adaptive terrain use that same record.
Recompile the whole matching bundle when changing it; metadata-only edits
cannot grow a previously truncated water domain. No new production bounds
have yet been selected.

The read-only bankfull diagnostic requires matching cache/overlay/source
hashes and writes only the requested report:

```sh
python3 -m worldgen.audit_water_bankfull /tmp/water-accepted-155-state.npz water-repair-inputs/bed-overlay.json --out /tmp/water-bankfull-audit.json
```

Its river-station sections are diagnostic, not the final whole-area gate.
Standing ponds/swamps, connected ownership, inter-station terrain and actual
compiled response fields remain to check. See [the findings](../../../docs/research/rendering/water-bankfull.md).

### Full existing channel width (179-constraint checkpoint)

Restoring all remaining71 bounds plus23 pool anchors produced257 constraints.
A full semantic-width candidate search changed117 routes; its fresh rebuild
had259 constraints, and the coupled proposal reached247. This whole candidate
was rejected. Shared-support/source grouping retained a provisional subset,
but fresh domains exposed six new failures. Omitting causal groups2294,6774,
9587,11371,13512 produced the accepted179-constraint rebuild with no new
failures. It restores two retaining supports, moves one originally dry pool
anchor and accepts67 bounded routes plus four coupled support proposals.
There are69 remaining retaining violations,15,543 corrections,69 station
overrides and131 route overrides. Original impoundment interiors, original
wet fringes and marine coverage pass; original spill difference is exactly
zero. Changed103 previously wet samples were originally dry extensions made
by earlier repairs; their indices are durable in the acceptance audit.

Evidence: `/tmp/water-semantic-width-safe.audit.json`,
`/tmp/water-semantic-width-safe-fresh.json`,
`/tmp/water-semantic-width-safe-preservation.json`.
Use `/tmp/water-accepted-155-state.npz`; source/runtime algorithms are unchanged
from the previous passing focused tests. Next diagnose remaining infeasible
components; do not repeat the same complete route/restoration batch.

### Connected incident heads (162-constraint checkpoint)

`--include-connected` expands a proposal across incident unpinned reaches,
including coincident native crossings, stopping propagation at fixed pool
junctions. Calculated neighboring river heads may then move consistently;
real standing planes, immutable retaining bounds and routine cut limits stay
fixed. LP equality constraints now match the global solver at coincident
routed points. Eight focused component tests pass.

The maximum-cut objective also permits an unchanged, previously reviewed
cut deeper than the routine limit. Each vertex's NEW cut budget remains
unchanged; tests reject using that old exception to deepen another vertex
beyond3m. This bug fix produced identical terrain proposals on the179 cache,
so no duplicate native rebuild was needed for that correction.

The connected proposal predicted160 constraints. Fresh domains instead had
162 with a new13513 failure, and removed five original wet fringe samples
through a cut at11746351. Omitting entire groups13512 and12639 gives the
accepted162 result:17 resolved, zero new failures, no original wet/plane/spill
changes and no changed repair-created wet extensions. The195 adjusted
supports have maximum additional cut1.436377m and maximum original cut
2.187382m;15,619 corrections remain. Native11746351 is now protected.
There remain69 retaining violations and five pinned source constraints.

Evidence: `/tmp/water-connected-safe-proposal.audit.json`,
`/tmp/water-connected-safe-fresh.json`,
`/tmp/water-connected-safe-preservation.json`.
The all69-retaining restoration candidate (`/tmp/water-connected-retaining-*`)
has239 constraints; a connected proposal reaches222 but resolves NONE of
the61 failures introduced by restoration. Do not repeat that batch.
Updating ordering markers from moved-pool anchors also failed: it introduced
10326/10327/11457/11458 and resolved no accepted-baseline failures. Durable
orientation remains unchanged. No additional safe original-low-corner
diagonal correction was found along the failing routes.

### Bend-aware routing (155-constraint checkpoint)

The optional `turn_aware` search uses incoming/outgoing edge states and checks
the bisector section plus miter expansion at each bend. Straight-edge checks
alone miss these intermediate bank normals. Original saddle, corridor and
endpoint guards remain unchanged. Five focused routing tests pass.

The162-source batch changed38 routes. Cached routing alone resolved six but
introduced six other failures. A connected LP supplied four proposals;
shared-component filtering and a fresh rebuild then exposed6774/6790. Omitting
the6758 group, as well as the known unsafe13512 group, gives the accepted155
result:seven resolved, no new failures, original water preservation passes.
There are150 route overrides,69 pool anchors,69 retaining violations and
15,619 terrain corrections. The112 changed previously wet samples were
originally dry extensions created by older repairs; exact indices are durable.

Evidence: `/tmp/water-turn-aware-safe.audit.json`,
`/tmp/water-turn-aware-safe-fresh.json`,
`/tmp/water-turn-aware-safe-preservation.json`. The intermediate route cache
was proposal-only: terrain was unchanged, and final acceptance used a native
rebuild after the two retained LP terrain proposals.

Work in progress: allowing previous bank/centre cuts to return toward original
elevation during the joint solve; bounded lateral sampling within the actual
authored channel/rivulet footprint. These are NOT accepted input changes.
A15-anchor ordinary-river trial introduced six failures and resolved two;
ordinary anchors alone did not make the connected cuts feasible. Exact
carver/footprint evidence also identifies50 minor-channel candidates.

## Joint support restoration (2026-09-06)

`audit_water_local_components --include-connected --restore-supports` can
restore existing cuts on the actual reach banks while solving bounded bed
cuts and connected heads. Restoration stops at immutable original ground;
neighbouring channel depth and retaining bounds remain constraints. Signed
support records replay through `audit_water_component_subset`; restored
vertices no longer needing a deeper-cut exception lose that authority.

Accepted fresh proposal `/tmp/water-restored-supports-proposal.json` resolves
sources13512 and13936,155→153, with zero new failures. It restores122 prior
supports (maximum0.943074m) and cuts nine. There are15,561 retained corrections,
69 retaining violations and six pinned constraints. Proof:
`/tmp/water-restored-supports-preservation.json`; matching accepted cache is
listed above. Original wet planes/coverage and spill potential pass; no
earlier repair-created wet extensions change. Seventeen focused component
and anchor tests pass. Lateral anchor experiments are not accepted inputs.

## Original lateral channel sampling (2026-09-07)

Eight explicit `channel-thalweg` station overrides move to existing lower
original rivulet points:4537,4557,9045,9064,9206,9207,10881,11041. Compiler
validation recomputes the lateral choice from original centre/direction/width
and depth, rejects intervening banks and original standing/marine water, and
checks the actual authored rivulet footprint. One incident course override
is retired; automatic native routes update13 incident sources. No terrain
changes. Fresh result145, with zero new failures; resolves4514,4537,4557,9045,
9206,10872,10896,11042. Original wet planes/coverage/spill potential pass.
Evidence is durable in `routing-audit.json.channelThalwegAcceptanceAudit`;
`/tmp/water-minor-selected-thalweg-fresh.json` and its preservation JSON are
disposable reports. The48-point batch failed with24 new constraints and must
not be substituted for this subset. Ordinary-river lateral trials remain
unaccepted. The manifest counts pool and channel relocations separately.

`audit_water_authored_footprints` recovers the two complete channel authoring
domains, including untouched naturally low ground, from the verified carving
history. Commands, counts and remaining basin scope are in the bankfull doc.

## Three reviewed upland exceptions and rejected restoration (2026-09-07)

Sources1740,1659,850 now pass fresh global/native checks,145→142, with seven
indexed support changes. Six supports exceed the routine3m limit under the
existing reviewed ordinary-river exception policy; maximum original cut
4.606644m, all below5m and above immutable retaining bounds. Source1659's two
falling-role changes are incorporated into the same proposal before fresh
validation. Exact supports are in `indexedRepairAudit`; acceptance proof is
in `additionalJointReachFreshAcceptanceAudit`. Fresh report:
`/tmp/water-reviewed-upland-three-fresh.json`; original-water preservation
report has the same prefix. No original or earlier repair-created wet area
changes. The accepted overlay has15,568 corrections and69 retaining violations.

`/tmp/water-retaining-signed-145.*` restores all69 remaining bound violations
and moves22 original-pool anchors from the145 baseline. Fresh count205. The
new signed connected solve found no reduction and is rejected; do not rerun
that unchanged proposal. These files are not accepted geometry.

`ChannelOwnership` now filters competing channel portions by whether their
maximum possible head can reach queried native ground. It clips the eligible
portion of a falling segment and expands nearest searches until unseen
segments cannot win. Cross-sections still check intervening sills and original
standing water. Repro source2182/native23935, point[647,2589], upper stage4m:
a false plunge-owner boundary4.413m from the centre becomes a real terrain
bank8.104m away. Diagnostic `/tmp/water-cliff-ownership-peak4.json`. Full native
export, owner-partition/mesh gates and budget checks remain required.

## Exact bank crests and feasible reach recovery (2026-09-07)

Bank crests now use exact native triangle knots, rather than quarter-grid
samples that can miss a sharp retaining vertex. `water_bank_sections` supplies
both a vectorised maximum and the identical knots for bounded support proposals,
shared-support grouping, bank-aware route candidates and detailed audits.

`water_reach_acceptance.restore_feasible_reaches` reconsiders excluded records
after the initial rejection pass. A downstream record can have both a high
and low bank, causing its own rejection and an upstream rejection in the same
pass. Removing that downstream record removes the upstream cause. Incremental
head propagation restores the upstream reach only if all retained banks still
contain the full graph. Failed trials roll back their heads and edges; adding
constraints cannot make a previously failed trial feasible, so one deterministic
pass suffices. This produces maximal feasible coverage, not a claim of a globally
optimal choice between competing rejected records.

Fresh report `/tmp/water-exact-bank-restored-fresh.json`:142→131, no new failures;
resolved1250,1385,5427,6736,8504,8805,8833,9229,9403,10225,11411. No terrain or
route edits. Original wet planes/coverage and exact spill potential pass. The
166 changed repair-created pool samples all rise (maximum0.020153m); none are
original wet terrain and none lose coverage. Exact indices, solver source-file
hashes and acceptance are in `manifest.json.profileSolverAcceptance`. The
accepted131 cache includes `profile_algorithm_sha256`; older caches with the
same terrain/routing hashes still predate these algorithm changes. Seventy
focused tests pass: exact sharp crest, flipped/edge rays, graph rollback and
full conditioner reinsertion, existing geometry/regimes/components/routes.

An ordinary-river cut-only proposal on the OLD142 algorithm found four cached
repairs:2497,2517,1071,14047 (`/tmp/water-remaining-ordinary-proposal.json`). It
has NOT passed fresh domains and is not accepted. Do not promote those cuts
without reevaluating them against the exact solver and existing bounds.

## Routine repair after exact-bank correction (2026-09-07)

The connected signed proposal on131 fixes2497 with14 cuts and36 restorations;
maximum resulting original cut1.441132m. The old3.262788m exception proposal
for that source is unnecessary and remains unaccepted. Fresh report/proof:
`/tmp/water-exact-bank-connected-fresh.json` and
`/tmp/water-exact-bank-connected-preservation.json`. No original or earlier
repair-created pool coverage/planes change, no new failures. Current130
checkpoint has15,555 corrections and69 retaining violations. The preserved
solver-source hashes in the manifest still apply; its131 solver-acceptance
record is historical, while the checkpoint count and newest coupled fresh
acceptance record describe130.

Full-fringe audit `/tmp/water-original-fringe-131.json`:249 original wet fringe
vertices lack a current pool plane and eight have a different one. None is in
the protected impoundment interior. Check actual channel/standing ownership
and peak coverage before classifying these as physical losses or legitimate
flow handoffs. One missing pool-field vertex is now marine; that alone does
not certify its original water-plane requirement. The exact solver recovered
six previously missing fringe pool samples versus142, but the remaining
fringe scope is not closed.

## Standing-margin coverage checkpoint (2026-09-07)

Accepted terrain/routing remain20bf93d (130 constraints,69 retaining violations).
Channel ownership now ignores rejected native paths. Dry raster margins use
standing-water sources; wet flow cores retain identity and channel response
sampling retains the earlier all-water domain. Full native rebuild yields
bit-identical profile/geometry, pool/marine fields and station responses.
The historical manifest's whole-file water_geometry hash predates this
post-profile change; do not restamp old caches. Current source/input hashes
and equivalence evidence are in `../water-repair-inputs/fringe-coverage-audit.json`.

Diagnostic artifacts: `/tmp/water-fringe-standing-margin-fields.npz`,
`/tmp/water-fringe-standing-margin-ribbons.json` and
`/tmp/water-fringe-standing-margin-runtime-audit.json`. The full-field build
uses `/tmp/probe-water-fringe-standing-margin-fields.py`; only emitted ribbons
are filtered to589 records, while all accepted owners participate. Runtime
queries use the real ChannelRibbonSampler via Node22 transform-types and
`/tmp/water-fringe-runtime/standing-probe.mjs`. No final raster mesh proof.
Peak coverage256/257, base183/257; no prior positive lost. All6,440,578 earlier
standing wet field samples preserve heights and season/tide response exactly.

Accepted connected-pool/range checkpoint after34f03e6: closure carries a
pool's spill through existing equal-level wet seeds while retaining distinct
planes, real crests and lowered-outlet barriers. Native4876976 regains its
original8.2440119m plane. Fresh profiles preserve all existing pool planes,
channel geometry/levels and original-water checks;130 failures and69 retaining
violations remain. There are223 additional pool samples,211 originally wet;
missing original wet pool fields fall249→38. No terrain changes.

Pool responses now include recovered components and are uniform across actual
native-edge-connected standing planes. `pool-stage-response-reference.json`
preserves the reviewed ranges from34f03e6:3,748 original connected pools map
to3,745 current connected groups containing prior water. All retain seasonal,
tidal and combined low-water ranges exactly; no inconsistent response remains
within a connected plane. Reconnected pieces may share an existing range;
combining independent maxima is rejected if it invents a deeper minimum.
This replaces accidental zero responses from the stale initial keep list.

The range reference is an explicit compiler input. Every final export must add:
`--pool-stage-reference water-repair-inputs/pool-stage-response-reference.json`.
The compiler checks its native seeds/planes and low amplitudes, and exports
its SHA-256 in metadata. Reproduce the immutable reference with
`python3 -m worldgen.audit_water_pool_stage_reference /tmp/water-fringe-standing-margin-fields.npz --source-checkpoint 34f03e6 --out /tmp/reference.json`;
that output is verified byte-identical. Do not regenerate it from the new
candidate: that would redefine the ranges being preserved.

Acceptance evidence and source/input hashes:
`../water-repair-inputs/connected-pool-stage-audit.json` and the manifest.
Matching solver cache: `/tmp/water-accepted-130-connected-pools-state.npz`.
Fresh profile artifacts: `/tmp/water-connected-plane-spill-{state.npz,fresh.json,preservation.json}`.
Final bounded fields/ribbons/runtime audit:
`/tmp/water-fringe-range-reference-{fields.npz,ribbons.json,runtime-audit.json}`.
Range proof: `/tmp/water-pool-range-reference-proof.json`. All257 original
fringe targets have peak channel/standing-field coverage,250 at base; no
previous positive in that target set disappears. Thirty focused tests pass.

One other projected fringe (native13369875, originally outside a pool) changes
from a6.755622m owner to4.349884m; ground4.753976m, now requiring+0.404092m.
It still has existing-peak coverage. This is field ownership evidence, not
final raster mesh verification; keep it in the final ownership review.
Actual final meshes, whole authored channel/pond/swamp peak footprints,
remaining130 constraints/69 retaining violations and deployment remain open.

## Three river repairs and seasonal-rivulet investigation (2026-09-07)

The earlier three-river cache `/tmp/water-accepted-127-state.npz` matches the durable
overlay (15,559 corrections). Three reviewed ordinary-river repairs resolve
1071,2517,14047; seven supports change, two above3m (3.048187m,3.302067m),
none protected. Existing exception authority/history is retained. Fresh report,
cache and preservation proof are `/tmp/water-current-three-{fresh.json,state.npz,preservation.json}`;
`three-river-repair-audit.json` and the manifest record acceptance. All original
and previously accepted pool planes/coverage pass; all pool-stage reference
seeds still identify the same wet planes and merged low bounds are compatible.
No source algorithm or deployed asset changed in this repair.

Cache `original_links` is the AUTHORED routing graph, including rejected
records; it cannot prove nonregression by counting negative entries. Compare
fresh report `reaches[].source` sets. This127 cache additionally stores an
explicit `failed_sources` array. The prior pool checkpoint's130 source sets
were rechecked directly and are identical; no acceptance regression found.

Routine connected/restoration proposals on2517,1071,14047 were infeasible;
the smaller fixed-incident reviewed solve found the accepted seven changes.
A bounded3m probe on5937,4190,12997,6890 found no proposal (the helper's generic
failure text still says5m; `/tmp/probe-water-four-routine.py` explicitly forces3m).
Do not repeat those unchanged tests.

## Explicit seasonal contract: source only, not accepted data

`condition_channel_profiles(..., peak_depth_budget=...)` keeps semantic
minimum depths positive and subtracts the optional budget from base bounds,
including the shallow pool-outlet taper. Default budget0 reproduces accepted127
heads bit-for-bit. `compile_features(..., seasonal_sources=..., stage=...)`
requires authored wetland rivulets, finite response coefficients and a peak
more than4mm above every exported centre's bed. Runtime loading and compiled
artifact gates enforce the same `baseMayBeDry` record contract; permanent
river depth checks remain. Default compilation does not select seasonal channels;
the explicit guarded proposal path is described below.

The real-API diagnostic `/tmp/probe-water-seasonal-explicit-contract.py`
uses inherited c068 station responses from
`/tmp/water-fringe-range-reference-fields.npz`,84 eligible rejected sources
and524 nodes exclusive to those reaches. Existing1.4m wet-season budget
resolves50, with no new failure sources (77 diagnostic, NOT accepted).
New-path bank excess is at most0.000001886m; minimum peak centre depth0.522m.
Eight earlier active heads rise (maximum0.481m), none lower. Rebuild associated
water fields/current rather than attaching new ribbons to stale fields.

Artifacts: `/tmp/water-seasonal-explicit-contract-probe.{json,npz}`,
`/tmp/water-seasonal-explicit-contract-ribbons.json`,
`/tmp/water-seasonal-explicit-contract-runtime-audit.json`,
`/tmp/water-seasonal-explicit-boundary-audit.json`; durable summary is
`water-repair-inputs/seasonal-rivulet-proposal-audit.json`.
909 selected emitted ribbons include50 seasonal records,376 new centre targets.
Actual ChannelRibbonSampler returns367 ordinary peak columns at original double
coordinates; eight more have coverage at exported Float32 centres and within1mm;
the last is source13115/node65794's real falling sheet. These are centre/surface
checks, not whole footprints or five-stage confluence acceptance. All accepted
owners participated; the source filter restricts emission only. The earlier17
candidate negative-depth/function-copy prototype is superseded; do not reuse it.

Fresh investigation: `/tmp/probe-water-seasonal-fresh-fields.py` runs the full
native compiler with the existing diagnostic budget injected through a wrapper;
it verifies exact point/link identity and unchanged failure source sets. Fresh
`/tmp/water-seasonal-fresh-{fields.npz,profile.npz,ribbons.json,summary.json}`
retains77 constraints. Sixteen station responses differ from inherited c068 data;
minimum candidate peak centre depth is0.381m before the pool-contact correction.
Reviewed pool-stage range enforcement runs in the fresh compiler.

The five-stage native pool-contact check found97 wet comparisons separated by
more than1mm, maximum0.39645m. Endpoint-only response interpolation skipped
pools crossed inside a reach. `sample_standing_levels(..., return_owners=True)`
now exposes the exact admissible triangle donor; the compiler anchors native
contacts to that donor's season/tide response after reviewed range preservation.
`compile_features` interpolates piecewise between these contacts. The pool
planes and pool response fields themselves are unchanged.
`/tmp/probe-water-seasonal-pool-anchors.py` re-exports the909 selected records
from the fresh fields; no second full-domain solve needed. Result:
`/tmp/water-seasonal-pool-anchor-{ribbons.json,joins.json,runtime-audit.json,boundary-audit.json}`
and `/tmp/water-seasonal-pool-anchors.npz`. All554 wet contact comparisons pass
within0.00004686m. Actual runtime centre coverage remains367 original-coordinate
ordinary columns, eight additional exported-centre columns, one falling sheet.
These are point/contact checks, not final generated confluence mesh acceptance.



# Shared-seasonal coverage investigation (superseded by accepted62 checkpoint)

The following records describe intermediate rejected states through c725181.
Owner-boundary refinement subsequently closed the final local miss; current
authority and remaining work are in WATER_REPAIR_HANDOFF.md.

## Shared-seasonal support:62 hydraulic constraints, unaccepted coverage

The32 explicitly reviewed supporting sources and proposal are durable in
`water-repair-inputs/seasonal-supporting-proposal.{json,npz}`. The manifest labels
these UNACCEPTED separately from its unchanged72-constraint inputs. This is
not a62 checkpoint and must not be deployed. Rejected candidates remain96;
supporters32; positive budget nodes768. Terrain, routing and stages are unchanged.

`load_seasonal_profile` now retains optional integer `supporting_sources` (empty
for old v1 files). Validation restricts these to base-accepted authored wetland
rivulets in graph-connected groups rooted in rejected candidates. Unselected
and banked-river nodes remain protected. Export marks both recovered sources
and explicit supporters `baseMayBeDry`; capture/audit report recovered and
supporting counts separately. Preserve this new field when rebasing proposals.

Broad actual-response screening recovered10 but lowered unrelated heads.
One-hop neighbours recovered7; extending arbitrary hop counts did not improve
that. Following the three actual obstruction drainage paths recovers all10
with32 supporters. Resolved:2313,3316,4663,10540,10881,11499,12725,14036,14257,15127.
92 previously active heads lower (maximum0.818647m);64 newly base-dry native
nodes belong to these explicitly seasonal groups. Current pool planes remain
fixed. Scripts/evidence: `/tmp/probe-water-{shared-seasonal-nodes,targeted-shared-seasonal-nodes,neighbour-seasonal-groups,neighbour-seasonal-blockers,drainage-seasonal-groups}.py`.
Do not repeat the broad or unchanged hop-count screens.

Fresh response donors reduced28 available budgets. `reconcile_peak_budgets`
clips only oversized active-node allowances and re-solves once; EVERY head,
active flag and accepted link must be bit-identical, with the same failures.
Otherwise `SeasonalResponseBudgetError` exposes the actual bounds for diagnostics.
No-op bounds never re-solve. The compiler callback binds authored links before
`dsk` is later rebound to the raster flow graph; an earlier attempt exposed that
closure bug and was fixed. Fourteen focused tests pass, including protection,
disconnected supporters, serialization and exact-solve reconciliation.

`/tmp/compile-water-drainage-seasonal-fields.py` completed the real full compute,
captured profile and1415 selected records. Files:
`/tmp/water-drainage-seasonal-full-{fields.npz,state.npz,ribbons.json,summary.json}`.
The raw requested profile is `/tmp/water-drainage-seasonal-profile.npz`; durable
proposal uses the captured reconciled budgets, with exact-head proof. The raw
full cache is VERIFIED FOR STAGE BUDGETS, NOT ACCEPTED FOR GEOMETRY. Do not label
it the accepted solver cache. Its62 failures split32 minor/30 banked rivers.

Preservation: all423,268 original interior samples, planes, spill potential and
marine coverage preserved; all482,066 prior standing samples unchanged. The38
historical original pool-field omissions remain.645 selected centres give636
ordinary raw-coordinate peak samples,8 additional Float32 centres and1 falling
sheet; no earlier positive lost.1,044 wet pool contacts over five stages agree
within0.05mm. `/tmp/water-drainage-seasonal-{preservation,runtime-comparison,joins}.json`.

The LOCAL authored footprint gate prevented acceptance. It measures4,303 exact
continuum/rivulet authoring vertices within20 native intervals of the92 lowered
heads, with actual old/new ribbons and native standing fields. Old1405-record
geometry reproduces all1224 previously emitted records exactly. Old peak-wet4060,
new4110:53 gained,3 raw lost,193 still dry. This is not the whole final footprint.
Two losses, native[2474,2029] and[3477,1151], are covered at Float32 native
coordinates; final representation/seam gates still apply. The substantive gap
is native[2564,1962], world[3586.22208,4686.58176], ground20.896479m. Old standing
field head23.186329m/support255/access-0.08 becomes flowing field21.982430m/
support128/access-1.085951. Both have season1/tide0. Neither old nor new ribbon
covers this point, even at Float32 coordinates: the new broad flowing-core
proxy steals its standing raster owner without corresponding rendered geometry.

The gap is now traced to the mesh: source10881 descends from23.369226m to
21.982430m over1.82784m. Runtime `descendingSection` limits the landing's
lateral spread; the following flat pool starts at a tilted bisector, leaving
an uncovered upstream wedge. Including falling sheets does not fill it.

Replacing flat landing miters with incoming perpendicular sections was REJECTED.
The one-point prototype fills the target, but the general change affects198
selected sections/280 records. Across32,007 authored vertices within20 native
intervals it loses89 previously wet vertices and gains28. That source change
was removed. Preserve existing sections when adding the missing pool footprint;
an alternative is reconciling flowing-core raster ownership against actual
rendered strips. Do not repeat the rejected section replacement.

The retained exporter change removes intermediate four-decimal x/z rounding.
Native4686.58176 becomes Float324686.58154296875 directly, but rounding to
4686.5818 first produces4686.58203125. A regression test locks the single
conversion.63 geometry/seasonal tests pass; no runtime edits or stage/input
changes. Coordinate-only geometry gives4,114 wet local vertices (+57/-3 versus
accepted geometry), but does NOT close the substantive wedge. Its expanded
comparison against the original proposal gains18/loses21 raw vertices;19 of
those21 are covered at native Float32 coordinates. Native[2339,2295] and
[2423,1944] remain uncovered there and require seam diagnosis. This is a
precision-contract correction, not final geometry acceptance.

Coordinate-only centre checks:635 raw ordinary+9 Float32 ordinary+1 falling
sheet cover645 targets.1,044 selected pool contacts remain within0.05mm.
Durable evidence: `water-repair-inputs/landing-coverage-investigation.json`.
Disposable geometry: `/tmp/water-{flat-landing,exact-coordinate}-ribbons.json`;
comparison reports use the same prefixes plus `local-footprint-coverage`,
`expanded-coverage`, and `expanded-lost-detail` where present. Expanded targets:
`/tmp/water-flat-landing-expanded-targets.json`. The rotation experiment's
`/tmp/compile-water-flat-landings.py` depends on REJECTED code and cannot run
against current source. Use saved geometry for comparisons. The immutable
baseline `/tmp/water-drainage-seasonal-old-local-ribbons.json` must not be
regenerated with changed source. The prepared acceptance script has NOT run.


## Added landing fills: geometry preserved, proposal still unaccepted

`flat_landing_normals` identifies consistent degree-two descending-to-flat
joins without changing `shared_section_normals`. The exporter measures the
additional incoming perpendicular section and emits only its upstream sector
against the existing bisector as a `geometryRole: landing` record. Its two
centres, water heads and seasonal/tidal responses match. It has no falling flag
or longitudinal current edge. The inner endpoint is `section-join`, not an
outer ownership boundary. Existing packed sections, terrain masks, streaming
and query/render triangles carry these records. Loader/runtime reject invalid
landing geometry. Do not resurrect the rejected rotated-section replacement.

Current source re-exported the saved full proposal fields to
`/tmp/water-production-landing-ribbons.json`: all1,415 earlier channel records
are exactly preserved, plus169 one-sided fills (3,294 compact triangles,
494,100 mesh-attribute bytes before native refinement). The source export differs
from the prototype because additional sections now get their own measurement;
use the production evidence, not prototype counts. At the reported gap,
ordinary water is2.445290m above ground at peak at both raw and Float32 native
coordinates.4,303 local vertices:4,118 wet,+60/-2 versus accepted reference;
the two raw boundary misses remain covered at Float32 coordinates.32,007
expanded vertices versus the exact-coordinate proposal:29,080 wet,+9/-0.
1,152 selected pool contacts over five stages agree within0.05mm.645 selected
centres remain covered (635 raw ordinary+9 Float32 ordinary+1 falling sheet).

Evidence: `water-repair-inputs/landing-fill-verification.json`; runtime scripts
`/tmp/water-fringe-runtime/production-landing-{addition,footprint,probe,boundary,mesh}.mjs`;
geometry re-export `/tmp/compile-water-production-landings.py`.51 geometry and14
seasonal Python tests pass;23 ribbon tests pass. Root typecheck passes. Root
tests passed apart from a sandbox EPERM on the combat measurement subprocess;
that sole suite passed7 tests on escalated retry. No combat source changed.

Those two coordinate-export seams are now fixed by the precision work below.
Preserve the accepted72 inputs until the remaining boundary is resolved.
The landing addition loses no previously covered vertex in its bounded check,
but does not prove whole-footprint coverage or final native geometry budgets.


## Section precision and clipping seams

Latest source removes decimal rounding from bank-section offsets before their
Float32 canonicalization/packing. This closes native[2339,2295] and[2423,1944]
at actual rendered coordinates. The canonicalizer still merges true Float32
duplicates, retaining the highest ground/access barrier; it no longer merges
separate representable offsets merely because their four-decimal values agree.
`/tmp/water-full-section-precision-ribbons.json` re-exports the same full fields:
1,584 records/207,037 section samples, with no changes to longitudinal positions,
heads, centre beds or responses.32,007 Float32 native targets versus the prior
landing export:29,211 wet,+7/-0. Do not substitute raw-coordinate counts for
native Float32 comparisons without recording which representation was queried.

Comparing4,303 targets against the accepted72 reference exposed two additional
misses. Native[659,3394] was a rounded clipping T-junction: the incident strip
created an endpoint the outgoing section did not share. Runtime now inserts
that endpoint into the following section before triangulation. The three-point
fixture `packages/game-core/src/water/fixtures/clipped-section-seam.json`
reproduced the failure before the fix. The same32,007-target runtime comparison
then gains1/loses0. Zero-length landing centreline projection is also guarded;
overlap-order regression passes. All645 selected centres remain covered.

The sole remaining local native Float32 miss is[2947,2396], world[4379.50464,
5386.64448], on `water-ribbon.province.cell-981-797`. The native vertex is
0.127530mm outside the rendered outer edge; raw coordinates and1mm west have
water depth~1.3757m. Current local comparison: old4,088/new4,132,+45/-1.
The62 proposal is STILL UNACCEPTED. Diagnose that edge against the authoritative
footprint and neighbouring ownership; do not waive it on hydraulic counts.
Float64 inline offsets and quantized clipping-centre prototypes did not close
it and were not retained. Do not migrate the sidecar based on that hypothesis.
Stitching currently handles adjacent sections within a record; final cross-record
and native-refinement seam gates remain required.

Durable evidence: `water-repair-inputs/section-precision-verification.json`.
Geometry re-export: `/tmp/compile-water-full-section-precision.py`.
Runtime comparisons: `/tmp/water-fringe-runtime/final-precision-{footprint,expanded,centres}.mjs`.
Diagnosis: `/tmp/water-seasonal-native-{boundary,triangle}-diagnosis.json`.
The final runtime module copied for those probes is `channelRibbonsFinalPrecision.ts`.
The old72 reference remains immutable.74 Python boundary/geometry tests and24
ribbon tests pass. Root tests/typecheck passed; affected game-core tests/types
were rerun and passed after the final stitching edit. No terrain, stage, default
repair input or deployed asset changes were made.
