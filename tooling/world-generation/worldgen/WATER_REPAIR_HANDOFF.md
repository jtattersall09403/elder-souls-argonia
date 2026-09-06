# Water compiler repair checkpoint

This is **not a release bundle**. Main task/renderer handoff:
[water-handoff.md](../../../docs/research/rendering/water-handoff.md).
Do not promote diagnostic water or overwrite original terrain/water assets.

## Authority and current state

Run commands below from `tooling/world-generation`.
Small authoritative inputs are retained in `water-repair-inputs/`; their
manifest records SHA-256 hashes and the immutable source hashes. They contain
the exact indexed original/current heights and restoration/exception evidence,
16 audited course overrides, and the frozen pre-repair orientation. They are
not runtime assets. The original heightfield/hydrology live in the sibling
asset vault at the paths resolved by `worldgen.compile_chunks.DEFAULT_HEIGHTS`.
Native grid 4033, spacing 1.82784 m, origin 0; 67 original-height-preserving diagonal
flips are derived deterministically from those sources.

Current overlay: 15,379 corrections; 349 unresolved channels
(19 pinned; these are not completion counts).
Strict preservation: 423,268 original wet samples, zero missing or shifted
original planes over 0.1 mm, **exactly zero original spill-potential difference**.
345 retaining/fringe supports, 1,103 unnecessary pool-floor vertices and three
diagnosed artificial-anchor supports were restored. The last 104 restorations
resolved sources 885,898,10480,10481,13114 with zero new failures.
Two reviewed joint reach repairs subsequently resolved 245 and 2691 with fresh
domains, zero new failures and exact original-pool preservation. Their 12
changed vertices retain indexed evidence; maximum original lowering 4.838562 m.
Tide/season amplitudes are unchanged. Routine cuts are at most 3 m; any existing
indexed exception is at most 5 m and cannot override an immutable retaining bound.

Useful disposable caches on this VM:

| Path | Meaning |
|---|---|
| `/tmp/water-spill-guard-reference.npz` | Corrected immutable-source pool/geometry reference |
| `/tmp/water-accepted-349-state.npz` | Matching 349-constraint geometry, immutable bounds and durable overlay hash; use for proposals |
| `/tmp/water-two-reach-fresh-audit.json` | Fresh global proof accepting the two reviewed joint groups |
| `/tmp/water-retaining-restoration-audit.json` | Fresh global evaluation accepting the last 104 restorations |
| `/tmp/water-immutable-retaining-bounds.npy` | Derived bounds, not terrain edits |
| `/tmp/water-retaining-bound-violations.json` | Earlier 352-support audit; 101 since restored, 251 remain to resolve |

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

## Immediate next work

1. Immutable lower bounds are now enforced by routine and joint/indexed cut
   helpers. Their 187,399 support vertices exposed 352 earlier cuts
   below a bound; 101 were restored without new global failures. Classify the
   remaining 251 and restore only diagnosed
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
3. Reconcile 25 stale orientation links only against the immutable reference.
   Many former false pool holes are now one flat pool. A diagnostic switch
   resolved 11496 but exposed 4328,4329,11861; no switch was accepted. Never
   derive orientation from corrected terrain or silently replace the file.
4. Continue bounded connected-reach proposals; fixed real junction/pool
   authority, no-new-neighbour-failure checks, and strict original-pool
   preservation remain required. A cached geometry solve is not a fresh
   domain/flood acceptance after meaningful terrain edits.

For a specific **reviewed** full-river source, the bounded joint proposal is:

```sh
python3 -m worldgen.audit_water_joint_cuts /tmp/water-accepted-349-state.npz water-repair-inputs/bed-overlay.json --source SOURCE_INDEX --out /tmp/water-reviewed-proposal.json
```

Replace `SOURCE_INDEX` with the diagnosed source; do not run an indiscriminate
province-wide proposal sweep. Helpers reject old caches lacking retaining
bounds. The routine proposal helper now permits exactly one pass, verifies the
input overlay hash, and rejects the whole proposal on any new global failure
or no resolved constraints. It does not establish fresh-domain acceptance:

```sh
python3 -m worldgen.audit_water_solve /tmp/water-accepted-349-state.npz water-repair-inputs/bed-overlay.json --local-only --out /tmp/water-local-bank-proposal.json
```

Never use repeated cached proposals to justify moving-bank millimetre tails.
The one authorized routine local-bank trial at this checkpoint was rejected:
91 old constraints resolved but 16 new neighbouring failures appeared (435
updates, maximum new cut 1.673485 m). The accepted overlay remains unchanged.
`/tmp/water-local-bank-proposal.convergence.json` records that rejection;
the proposal JSON is byte-identical to the accepted overlay. Do not rerun the
same trial. Next work needs bounded shared-bank/fixed-neighbour constraints,
not an independent-cut iteration. Later CLI runs retain exact proposed support
indices even when rejected; this first rejected trial predates that addition.

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
