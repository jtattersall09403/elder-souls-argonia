# Water compiler repair checkpoint

This is **not a release bundle**. Main task/renderer handoff:
[water-handoff.md](../../../docs/research/rendering/water-handoff.md).
Do not promote diagnostic water or overwrite original terrain/water assets.

## Authority and current state

Run commands below from `tooling/world-generation`.
Small authoritative inputs are retained in `water-repair-inputs/`; their
manifest records SHA-256 hashes and the immutable source hashes. They contain
the exact indexed original/current heights and restoration/exception evidence,
149 reviewed course overrides,76 reviewed original-pool and eight original-channel sampling-anchor relocations,
and the reviewed original-drainage orientation. They are
not runtime assets. The original heightfield/hydrology live in the sibling
asset vault at the paths resolved by `worldgen.compile_chunks.DEFAULT_HEIGHTS`.
Native grid 4033, spacing 1.82784 m, origin 0; 67 original-height-preserving diagonal
flips are derived deterministically from those sources.

Current overlay:15,562 corrections;62 unresolved channels with the accepted
seasonal profile (32 authored rivulets,30 banked rivers). Without that explicit
profile the base-only graph remains126. These are not completion counts.
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

Current next action: finish the remaining32 minor/30 banked channel constraints,
59 retaining issues and full authored peak footprints. The shared-seasonal
checkpoint below is accepted after its landing and precision gaps were fixed.
It is not a release bundle or whole-province coverage acceptance.

Useful disposable caches on this VM:

| Path | Meaning |
|---|---|
| `/tmp/water-spill-guard-reference.npz` | Corrected immutable-source pool/geometry reference |
| `/tmp/water-accepted-62-seasonal-state.npz` | Current62-channel/59-retaining state; captured full native fields, verified actual stage budgets and canonical accepted profile hash |
| `/tmp/water-accepted-72-restored-banks-state.npz` | Previous72-channel checkpoint before connected seasonal support |
| `/tmp/water-accepted-73-restored-banks-state.npz` | Previous73-channel/63-retaining-violation state, before the latest three sampling moves |
| `/tmp/water-accepted-73-seasonal-state.npz` | Previous73-channel/69-retaining-violation state, before four pool sampling corrections |
| `/tmp/water-accepted-77-seasonal-state.npz` | Previous seasonal checkpoint, before four additional existing-stage repairs |
| `/tmp/water-accepted-127-state.npz` | Historical base-only graph for rebuilding a seasonal proposal after route changes |
| `/tmp/water-independent-local-fresh-audit.json` | Fresh global proof accepting the independent shared-support components |
| `/tmp/water-two-reach-fresh-audit.json` | Fresh global proof accepting the two reviewed joint groups |
| `/tmp/water-retaining-restoration-audit.json` | Fresh global evaluation accepting the last 104 restorations |
| `/tmp/water-immutable-retaining-bounds.npy` | Derived bounds, not terrain edits |
| `/tmp/water-retaining-bound-violations.json` | Historical 352-support audit; current remaining count is59 |

The matching state carries `terrain_overlay_sha256`; it must equal the durable
overlay hash. Older `/tmp/water-*` variants are historical diagnostics, not
alternatives to this checkpoint. Never reuse a cached flood after excavation
or an outlet/crest restoration. The current cache captures freshly rebuilt domains. An older checkpoint reused
a verified flood after five submerged floor restorations; that historical
monotonicity proof does not apply to ordinary cuts.

## Rebuild disposable caches when missing

Build the immutable source reference once (no correction overlay):

```sh
python3 -m worldgen.audit_water_profiles --original --summary --out /tmp/water-reference.json --solver-cache /tmp/water-reference.npz
```

Then rebuild current geometry, pool domains and immutable bounds coherently:

```sh
python3 -m worldgen.audit_water_profiles water-repair-inputs/bed-overlay.json --orientation water-repair-inputs/orientation.npy --reference-pools /tmp/water-reference.npz --routing-overrides water-repair-inputs/routing-audit.json --seasonal-profile water-repair-inputs/seasonal-profile.npz --details --out /tmp/water-current.json --solver-cache /tmp/water-current.npz
```

`--reference-pools` supplies both immutable potential and original pool planes.
For full field generation, prefer `compile_water --profile-cache PATH` to save
the native profile in the same pass. API callers can use `capture_profile=True`
and `save_profile_cache(path, result['profile_state'], orientation, **provenance)`. Full seasonal captures retain the verified-response flag;
profiles-only audits remain explicitly unverified.
These commands write only disposable diagnostics. Do not run them merely to
reconfirm unchanged caches; use the existing matching cache where valid.

## Earlier investigations

Earlier repairs, rejected proposals and one-time probes are archived in
[WATER_REPAIR_HISTORY.md](WATER_REPAIR_HISTORY.md). Read the relevant historical
section before repeating a previously attempted repair; use current inputs above.

## Accepted seasonal checkpoints:77 then73 constraints (2026-09-07)

`water_channel_response.py` shares exactly the exported response interpolation
with exclusive-node peak budgets. Reconciliation lowers five allowances by at
most0.311111m; candidate heads remain bit-identical, with no new failures.
`/tmp/water-seasonal-reconciled-budget.{json,npz}` records this.
`compute(..., seasonal_profile=...)` and `compile_water --seasonal-profile PATH`
validate exact graph identity, eligibility, protected shared nodes, no new failed
sources and actual fresh response budgets. The export CLI requires a fixed
`--bed-overlay` without `--continue-repairs` and records the profile SHA.

Accepted `water-repair-inputs/seasonal-profile.npz` is versioned and pickle-free:
exact graph arrays,97 eligible source IDs and608 positive native budgets after
the four additional repairs described below.
Its SHA and acceptance evidence are in the manifest and
`water-repair-inputs/seasonal-profile-acceptance.json`. All final compiles and
current profile audits require this file; full exports additionally require
`--pool-stage-reference water-repair-inputs/pool-stage-response-reference.json`.
Without the seasonal file, the ordinary graph deliberately remains127.

`/tmp/water-seasonal-integrated-{fields.npz,ribbons.json,summary.json}` runs the
real compiler parameter; its only wrapper limits emission to909 records while
retaining all accepted owners. The verified six native fields and909 records
are identical to the pool-contact-corrected candidate, preserving the earlier
runtime checks (554 wet pool contacts over five stages, within0.05mm).
`/tmp/water-seasonal-integration-proof.json` records equality. Sampling donors
are restricted to actual standing water: discarded6.53mm/9.72mm seed corners
carried raw climate values and are not authoritative pool response owners.

The fresh seasonal-aware audit is `/tmp/water-seasonal-77-fresh-audit.json` and
its raw cache `/tmp/water-seasonal-77-fresh-state.npz`. It reproduces the full
compiler's levels and accepted links exactly. `audit_water_routes.solve` now
retains `diagnostic_peakDepthBudget`; cached re-solving reproduces the same
levels and failure source set. `replace_paths` rejects stale nonzero seasonal
budgets instead of applying them to another graph; ordinary replacements rebuild
zero-budget arrays at the new native length. Nine focused regression tests pass.

`/tmp/water-seasonal-checkpoint-proof.json` proves original423,268 wet samples,
spill potential and marine coverage preserved, plus all482,078 accepted standing
samples unchanged. There are77 failures, no new sources,69 retaining violations
and15,559 unchanged corrections. That77 cache is historical; current accepted cache is
`/tmp/water-accepted-73-restored-banks-state.npz` after the restoration below. Each accepted cache links its verified-response status
to the full native field hash, acceptance record and profile SHA. Raw profiles-only
audits explicitly report stage responses unverified; rebuilding that cache alone
is not full-field acceptance. Compare failure sets/`accepted_links`, never the
AUTHORED `original_links` graph.

Four additional repairs resolve9043,9064,11449,11450 at unchanged stage limits.
`/tmp/water-seasonal-residual-{budget.json,budget.npz,profile.npz,fields.npz,ribbons.json,summary.json}`
contains the proposal and successful fresh compilation. Only budgets exclusive
to the47 then-rejected rivulets increased; existing accepted/shared budgets stayed
fixed. Two earlier active heads rise by at most0.240166m; none lower. Fresh
responses pass the compiler guard, and cached solving matches exact levels and
accepted links. No terrain/routing input changed; all482,078 standing samples and
planes remain identical. Those unchanged physical domains are reused in the73
cache, with the new diagnostics and a link to the full fresh field hash. No second
profiles-only domain recomputation was needed. Acceptance evidence explicitly
distinguishes that reuse from the previous77 standalone profile audit.

Actual999-record runtime checks cover410 centres:401 ordinary peak samples at
original coordinates, eight more at exported Float32 centres, one falling sheet.
No earlier positive is lost;600 wet pool contacts across five stages agree within
0.05mm. Files: `/tmp/water-seasonal-residual-{runtime-audit,joins,boundary-audit}.json`.
That seasonal checkpoint recorded73 remaining constraints (43 rivulets,
30 banked rivers),54 recovered seasonal reaches and69 retaining violations.

Retaining investigation: `active_geometry_probes` now uses verified seasonal
peak depth on flowing nodes, preserves pinned pool base support, and excludes
rejected outgoing segments at shared endpoints. It requires explicit accepted
links or failure sources; ten focused seasonal/cache/restoration tests pass.
All69 minimum-bound restorations fail the fixed-head support screen; allowing
heads to adjust with cached domains produces132 constraints versus73,59 new
failures. Fresh routing on restored terrain without the seasonal proposal gives
185 versus127 base-only constraints,58 new failures, and75637 versus75635 native
points. This also proves the old seasonal proposal would be stale. Never promote
`/tmp/water-retaining-69-restored-proposal.json`; audit/state are
`/tmp/water-retaining-69-rerouted-{audit.json,state.npz}`.

68 of69 supports touch pinned nodes. Among23 affected pinned original stations,
13 have legal alternative native vertices within two original grid intervals,
in the same original pool at its unchanged plane:1734,2295,3420,5024,8299,8451,
9458,10338,10480,10818,11393,11411,11426. Full options and support investigation
are in `water-repair-inputs/retaining-support-investigation.json` and
`/tmp/water-retaining-pool-anchor-options.json`. Next: test targeted sampling
relocations and associated support restoration, then regenerate and freshly
verify the seasonal proposal against the new graph. Do not repeat blanket69
restoration. A cached upper-stage sensitivity at1.8/2.4/3.2m resolved no more than
the same four channels; it does not justify global amplitude changes. Whole
painted/carved peak footprints still need independent assessment.

Native jobs must run one at a time: the first residual full-field run was killed
with exit137 while the restoration audit ran. The audit completed; a sequential
retry loading only needed NPZ arrays passed. `/tmp/probe-water-residual-seasonal-fields.py`
contains that memory reduction. The capture support below now avoids redundant full-domain work while
preserving exact graph/stage acceptance checks.
## Four accepted pool sampling corrections:63 retaining violations

Sources2295,3420,8299,10338 move to legal wet vertices of their unchanged original
pools. Six supports restore to their immutable bounds; one returns fully to its
original height and loses its correction row. Two new bed cuts, both0.071779m,
clear the adjacent channel. The input overlay now has15,560 corrections,73
channel constraints and63 retaining violations. Original-pool anchors total73
plus eight channel-thalweg anchors. Course overrides remain149.

The thirteen-point/24-support trial was rejected:137 base-only constraints,
11 new failures. Three bounded correction passes still left eight new failures.
The independent four-point/six-support subset, with only its two associated
shallow bed cuts, preserves the exact127 base-only failure source set. Its fresh
base cache is `/tmp/water-targeted-four-pool-state.npz`; proposal overlay/routing
are `/tmp/water-targeted-four-pool-{overlay,routing}.json`. The accepted seasonal
paths are geometrically unchanged; all97 paths and608 positive budgets rebase
exactly to the new75641-node graph. The full seasonal result still has73 failures.

`/tmp/compile-water-four-pool-fields.py` ran the real compiler with
`capture_profile=True`. Files: `/tmp/water-four-pool-full-{fields.npz,state.npz,ribbons.json,summary.json}`.
The state is captured directly from that full compilation, including actual
stage verification and exact pool domains; no inferred or second-run cache.
`water_profile_cache.save_profile_cache` is shared by audits and full compiles;
it preserves budgets and verification status and rejects object/pickle payloads.
CLI `--profile-cache` binds the saved state to the produced overlay and metadata.
Eleven focused tests pass, and the real full capture matches exported levels/links.

`/tmp/water-four-pool-preservation.json` proves all423,268 original interior wet
samples, exact spill potential, pool planes and marine coverage preserved. The
38 original pool-field omissions are the same as before, not new regressions.
Seven previously repair-created samples leave the10mm base standing seed domain;
this does not necessarily remove a thinner rendered film. All seven retain peak
coverage: six standing fields, one actual native channel. Exact checks are
`/tmp/water-four-pool-restored-bank-coverage.json`. None was originally wet.
Selected461 centre checks give452 ordinary peak samples at original coordinates,
eight additional exported Float32 centre samples and one falling sheet; no old
positive is lost. All951 wet pool contacts over five stages, including changed
permanent reaches, agree within0.05mm. Files:
`/tmp/water-four-pool-{runtime-audit,joins,boundary-audit}.json`.

Acceptance is `water-repair-inputs/pool-sampling-restoration-acceptance.json`.
That checkpoint cache: `/tmp/water-accepted-73-restored-banks-state.npz`. Only metadata
and the original-height no-op were normalized after compilation; float32 terrain
values are identical. The fully restored vertex is protected at original height;
five partial restorations are protected by immutable lower bounds. Old indexed
excavation authority on restored supports is revoked; both new cuts have evidence.

## Previous sampling checkpoint:72 channels and59 retaining issues

Sources10480,11393,11411 move to[2459,2544],[2663,2262],[2665,2263] in the same
original pools. Four supports restore to immutable bounds; none fully reaches
original height, so their protection remains the lower-bound field. Three bed
corrections lower at most0.101700m additionally, maximum original cut0.421917m.
Two are new correction rows;15,562 remain. Old excavation authority on all four
restored supports is revoked. Original-pool anchors now total76 plus8 channel
anchors; course overrides stay149.

The29 local alternative screens avoid repeated province floods. Two choices
pass independently; moving neighbouring11411 as well recovers11425. Exact
screen/changes are in `water-repair-inputs/pool-anchor-alternative-screen.json`.
Fresh ordinary audit `/tmp/water-three-pool-{audit.json,state.npz}` gives126 with
no new failure sources. Seasonal rebasing removes11425 from candidates because
it is now base-accepted; all remaining96 candidate paths are coordinate-identical.
604 positive budgets map exactly onto75645 native nodes. Cached seasonal solving
and full compilation agree on72 failures and all54 seasonal repairs.

Full artifacts: `/tmp/water-three-pool-full-{fields.npz,state.npz,ribbons.json,summary.json}`;
run by `/tmp/compile-water-three-pool-fields.py`, with1224 selected records.
Captured state verifies actual stage budgets. The preservation proof is
`/tmp/water-three-pool-preservation.json`: all423,268 original interior samples,
planes, spill potential and marine coverage unchanged; the38 original pool-field
omissions are the same as before. Five repair-created samples leave the10mm
standing seed domain. One has standing peak coverage; four have actual native
channel coverage. `/tmp/water-three-pool-restored-bank-coverage.json` proves all5.

Previous target world coordinates are preserved even when routes move.495
selected targets give486 ordinary raw-coordinate peak samples,8 more at exported
Float32 centres and1 falling sheet. No previous positive is lost.1,018 wet pool
contacts at five stages agree within0.05mm. Proof files are
`/tmp/water-three-pool-{runtime-comparison,joins,boundary-audit}.json`.
Runtime scripts under `/tmp/water-fringe-runtime/three-pool-*.mjs` require Node's
`--experimental-transform-types` (strip-only mode cannot parse parameter properties).

Acceptance: `water-repair-inputs/pool-sampling-restoration-72-acceptance.json`.
Sampling checkpoint cache: `/tmp/water-accepted-72-restored-banks-state.npz`, restamped only for
accepted metadata after proving exact physical float32 equality. All current
input/evidence hashes are in the manifest. No runtime/source changes or new
broad test runs in this repair; full native/selected runtime checks above apply.

Next: remaining local candidates1734,5024,8451,9458,10818,11426 have no passing
ordinary sampling choice in the bounded screen. Investigate their incident
routes/shared supports; do not repeat the same29 choices or blanket restoration.
Two optimistic1.9m seasonal feasibility bounds on the HISTORICAL all69-restored
terrain remain rejected. Restricting budgets to rejected authored rivulets gives
105 failures and33 new versus current-before-this-turn73. Allowing all authored
rivulets, including accepted minor neighbours (outside current profile eligibility),
gives85 with23 new and11 resolved. These are theoretical upper envelopes, not
actual stage-response evidence or authorization to relax permanent channels.
They show shared minor-channel nodes exclude some useful seasonal head allowance,
but no wholesale policy change or restoration is accepted. Exact source lists
and scope are in the diagnostic evidence above. Remaining scope:72 channels,
59 retaining issues, complete authored peak footprints, and final mesh/export
checks. No upper amplitudes or native assets have been deployed.

Historical source validation:74 focused Python tests; root `npm test` and `npm run typecheck` pass.
Dependencies restored without changing package manifests/lockfile. A held NFS
native library prevented initial cleanup; its ignored generated directory was
moved to `.water-dependency-recovery/node_modules`, preserving live handles.
No process was killed. Do not repeat broad gates absent new changes/failures.


## Accepted connected seasonal support:62 constraints

`water-repair-inputs/seasonal-profile.npz` now contains96 primary candidates,
32 explicitly connected base-accepted minor supporters and the768 captured
positive budgets. It recovers64 formerly rejected rivulets,10 more than the72
checkpoint. Recovered and supporting reaches are reported separately; the96
actually exported seasonal sources may be dry at base. All unselected and
banked-river nodes remain protected. Keep `supporting_sources` when rebasing.
Newly recovered:2313,3316,4663,10540,10881,11499,12725,14036,14257,15127.
No terrain, routing, stage amplitudes or original pool planes changed.

The full native solve captured in `/tmp/water-drainage-seasonal-full-{fields,state}.npz`
reconciles28 unused excess budgets only after re-solving yields identical heads,
active nodes and accepted links. The accepted profile uses those captured bounds.
Its matching restamped cache is `/tmp/water-accepted-62-seasonal-state.npz`;
profile hash, budgets and stage-verification flag were checked after acceptance.
The earlier raw requested cache is historical; do not use its raw-profile hash
as the current canonical hash. Acceptance: `seasonal-supporting-acceptance.json`;
input hashes and supporting evidence are in the manifest.

The rejected geometry investigations are archived in WATER_REPAIR_HISTORY.md.
Retained fixes: exact native world coordinates; no decimal pre-rounding of
section offsets;169 additive `geometryRole: landing` fills that retain existing
sections; shared clipped endpoints within each record; finite projection for
zero-length landing records. The final0.128mm edge miss was an under-resolved
ownership bisection. The search now stops when both bracket endpoints map to
the same packed-offset/Float32-world vertex (bounded at32 iterations), keeping
the compatible endpoint. No sidecar format change or arbitrary water expansion.

Latest selected geometry: `/tmp/water-full-owner-resolution-ribbons.json`:
1,415 longitudinal records plus169 landing fills. All1,584 record centres,
heads, centre beds and stage responses match the captured fields. Original
423,268 interior wet samples/planes/spills, marine coverage and482,066 standing
samples are preserved.38 historical original pool-field omissions remain.
4,303 actual Float32 authored vertices around lowered heads: old4,088/new4,133,
+45/-0,170 still dry.32,007 expanded vertices versus the preceding precision
export:29,214 wet,+2/-0. These are bounded checks, not whole-footprint acceptance.
All645 selected centres and1,152 pool contacts across five stages pass; maximum
contact discrepancy0.0469mm.38 focused boundary/seasonal tests pass; runtime
unchanged since c725181 workspace test/typecheck gates.

Scripts: `/tmp/compile-water-full-owner-resolution.py`,
`/tmp/water-fringe-runtime/owner-resolution-{footprint,expanded,centres}.mjs`,
`/tmp/check-water-owner-resolution-joins.py`, and the executed
`/tmp/accept-water-owner-resolution-seasonal.py`. The old72 comparison geometry
`/tmp/water-drainage-seasonal-old-local-ribbons.json` remains immutable. Evidence:
`owner-boundary-resolution-verification.json` and `seasonal-supporting-acceptance.json`.

## Higher-peak screen and missing terminal geometry

`water-repair-inputs/peak-envelope-investigation.json` records a geometry-only
screen at seasonal upper3m/tide0.5m, preserving dry0.28m/low-tide0.5m. Of the170
local ordinary-uncovered vertices,125 have wet ribbons (including falling
sheets) and14 more have measured standing-field support:31 remain dry or
unverified. **Correction:**12 of the formerly counted26 standing additions
used the old unvisited access sentinel2, not measured sills. This uses unchanged
standing fields/responses, **not fresh3m native fields or final standing meshes**.
All channel-only losses at low/base have wet standing-field fallback. Two peak
losses ([2676,1994],[2940,2394]) also used that sentinel and remain unverified;
final rendered ownership still needs verification. No default stage changed.

Among the19 definite misses,16 have flowing-field support but no ribbon; three need height/owner
diagnosis. Fifteen of the16 mesh misses persist at all four ±1mm probes. Removing
the descending guard only fills two; do not remove it. The generalized
descending-corner cap prototype fills none. The ownership ray to[658,3393] is
compatible throughout; an intervening owner barrier was ruled out there.

The manual two-end prototype filled ten misses, but **its terminal selection was
wrong**:12761 has rejected authored upstream source12745 (starting[2939,2415]).
Repair that reach for its seven misses; do not hide it with a terminal cap.
Only10585 (source10573) is a true end, covering the other three misses.

`water_terminal_fills.py` now provides generic selection and emission through
`compile_features(..., terminal_authored_links=...)`, an explicit diagnostic
opt-in; production feature inputs do not enable it yet. Selection requires
degree one in the unrejected authored graph and consistent endpoint geometry
in both graphs. It excludes coordinate junctions, conflicting coincident heads,
rejected continuations and routed hairpins. There are1,035 eligible province
stations. The generic two-source export emits only the eight valid cap sectors,
fills the three true-end misses and correctly leaves12761 uncapped. Existing
longitudinal sections stay intact; outer rays reuse exact serialized sections
and adjacent sectors share their ray objects.
The4,303-vertex same-stage ribbon comparison loses no coverage: low627→627,
base1,580→1,581, peak4,120→4,128. All1,584 preceding records are exactly preserved.
These queries omit native-ground refinement and final standing meshes.

Still required before production: between-ray access/owner boundaries, angular
convergence, final refined meshes, original pool contacts and province-wide
cost. The manual prototype's zero conflicts at566 native potential samples
and451 triangles are historical, not a substitute for those checks.79 focused
geometry/boundary/terminal tests passed; all five terminal tests then passed
after the authored-degree guard. Workspace typecheck passed. Workspace tests
passed except a sandbox-denied subprocess suite; its seven tests passed on a
targeted permitted retry. No visual ingestion or broad rerun was needed.

Disposable scripts: `/tmp/compile-water-peak-envelope.py`,
`/tmp/prototype-water-terminal-fill.py`, `/tmp/audit-water-terminal-fill-prototype.py`;
runtime probes in `/tmp/water-fringe-runtime/{peak-envelope-screen,peak-missing-geometry-detail,terminal-fill-prototype}.mjs`.
Geometry: `/tmp/water-peak-envelope-ribbons.json` and
`/tmp/water-terminal-fill-prototype.json`. Durable evidence records hashes,
exact remaining targets and acceptance limits. Generic export/probes:
`/tmp/compile-water-terminal-generic.py`,
`/tmp/water-terminal-generic-ribbons.json`, and
`/tmp/water-fringe-runtime/terminal-generic{,-preservation}.mjs`.
Finish generic terminal geometry acceptance and source12745, then the six other
mesh misses and three height/owner cases. Do not
choose a global upper stage from the anomalous standing donor at[2677,1977].

Continue whole continuum/rivulet/pond/swamp coverage and the62 channel/59 bank
constraints. Cross-record/refined-mesh seams and final native data/performance/
deployment gates remain open. No diagnostic asset bundle has been deployed.
