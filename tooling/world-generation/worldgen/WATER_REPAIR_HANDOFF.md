# Water compiler repair checkpoint

This is **not a release bundle**. Main task/renderer handoff:
[water-handoff.md](../../../docs/research/rendering/water-handoff.md).
Do not promote diagnostic water or overwrite original terrain/water assets.

## Authority and current state

Run commands below from `tooling/world-generation`.
Small authoritative inputs are retained in `water-repair-inputs/`; their
manifest records SHA-256 hashes and the immutable source hashes. They contain
the exact indexed original/current heights and restoration/exception evidence,
149 reviewed course overrides,69 reviewed original-pool and eight original-channel sampling-anchor relocations,
and the reviewed original-drainage orientation. They are
not runtime assets. The original heightfield/hydrology live in the sibling
asset vault at the paths resolved by `worldgen.compile_chunks.DEFAULT_HEIGHTS`.
Native grid 4033, spacing 1.82784 m, origin 0; 67 original-height-preserving diagonal
flips are derived deterministically from those sources.

Current overlay:15,555 corrections;130 unresolved channels
(5 pinned; these are not completion counts).
Strict preservation: 423,268 original wet samples, zero missing or shifted
original planes over 0.1 mm, **exactly zero original spill-potential difference**.
345 retaining/fringe supports, 1,103 unnecessary pool-floor vertices and three
diagnosed artificial-anchor supports were restored. The last 104 restorations
resolved sources 885,898,10480,10481,13114 with zero new failures.
Two reviewed joint reach repairs subsequently resolved 245 and 2691 with fresh
domains, zero new failures and exact original-pool preservation. Their 12
changed vertices retain indexed evidence; maximum original lowering 4.838562 m.
The next shared-support local proposal resolved 38 more with fresh domains and
the same preservation gates: 68 changed vertices, maximum additional cut
2.451859 m, maximum original cut at those vertices 2.997326 m (no new exception).
This checkpoint retains the original amplitudes. Owner correction 2026-09-06
allows higher upper stages while preserving lows; see the main handoff
for the bankfull investigation and matching stage contract. Routine cuts are at most 3 m; any existing
indexed exception is at most 5 m and cannot override an immutable retaining bound.

Useful disposable caches on this VM:

| Path | Meaning |
|---|---|
| `/tmp/water-spill-guard-reference.npz` | Corrected immutable-source pool/geometry reference |
| `/tmp/water-accepted-130-state.npz` | Matching130-constraint geometry, immutable bounds and durable overlay hash; use for proposals |
| `/tmp/water-independent-local-fresh-audit.json` | Fresh global proof accepting the independent shared-support components |
| `/tmp/water-two-reach-fresh-audit.json` | Fresh global proof accepting the two reviewed joint groups |
| `/tmp/water-retaining-restoration-audit.json` | Fresh global evaluation accepting the last 104 restorations |
| `/tmp/water-immutable-retaining-bounds.npy` | Derived bounds, not terrain edits |
| `/tmp/water-retaining-bound-violations.json` | Earlier 352-support audit; 283 since restored,69 remain to resolve |

The matching state carries `terrain_overlay_sha256`; it must equal the durable
overlay hash. Older `/tmp/water-*` variants are historical diagnostics, not
alternatives to this checkpoint. Never reuse a cached flood after excavation
or an outlet/crest restoration. The final cache reused a verified flood only
after five floor restorations strictly below its unchanged filled potential;
that monotonicity proof does not apply to ordinary cuts.

## Rebuild disposable caches when missing

Build the immutable source reference once (no correction overlay):

```sh
python3 -m worldgen.audit_water_profiles --original --summary --out /tmp/water-reference.json --solver-cache /tmp/water-reference.npz
```

Then rebuild current geometry, pool domains and immutable bounds coherently:

```sh
python3 -m worldgen.audit_water_profiles water-repair-inputs/bed-overlay.json --orientation water-repair-inputs/orientation.npy --reference-pools /tmp/water-reference.npz --routing-overrides water-repair-inputs/routing-audit.json --details --out /tmp/water-current.json --solver-cache /tmp/water-current.npz
```

`--reference-pools` supplies both immutable potential and original pool planes.
These commands write only disposable diagnostics. Do not run them merely to
reconfirm unchanged caches; use the existing matching cache where valid.

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

Next ownership repro: native4876976 (row1209,col1079), ground8.2213745m,
nearest lower plane4.9355526m; original/higher adjacent pool8.2440119m has wet
samples at(row1210,col1080) and(row1211,col1079). Resolve connected competing
standing planes before interpreting this as insufficient upper stage.
Original-fringe complete mesh coverage, authored channel/pond/swamp peak
coverage, remaining constraints/bounds and final release remain open.
