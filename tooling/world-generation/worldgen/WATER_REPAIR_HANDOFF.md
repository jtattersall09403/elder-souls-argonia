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

Current overlay: 15,482 corrections; 356 unresolved channels
(254 local-bank constraints, 29 pinned; these are not completion counts).
Strict preservation: 423,268 original wet samples, zero missing or shifted
original planes over 0.1 mm, **exactly zero original spill-potential difference**.
244 retaining supports and 1,103 unnecessary pool-floor vertices were restored.
Tide/season amplitudes are unchanged. Routine cuts are at most 3 m; any existing
indexed exception is at most 5 m and cannot override an immutable retaining bound.

Useful disposable caches on this VM:

| Path | Meaning |
|---|---|
| `/tmp/water-spill-guard-reference.npz` | Corrected immutable-source pool/geometry reference |
| `/tmp/water-preservation-complete.npz` | Matching 356-constraint geometry for the durable overlay |
| `/tmp/water-bounded-preservation-state.npz` | Same geometry plus immutable retaining lower bounds; use for cut proposals |
| `/tmp/water-immutable-retaining-bounds.npy` | Derived bounds, not terrain edits |
| `/tmp/water-retaining-bound-violations.json` | 352 existing below-bound corrections; proposals not yet applied |

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
   helpers. Their 187,399 support vertices currently expose 352 earlier cuts
   below a bound (maximum 2.200 m deficit). Classify and restore only diagnosed
   unnecessary retaining/fringe cuts, retaining exact indexed evidence and
   checking valid channel/receiving support before acceptance.
   `audit_water_restore_retaining` produces an explicitly unaccepted proposal;
   its active native-crease checks are not a replacement for fresh domains.
2. Inspect the cut-created pool anchor near source 13114/13115. Original bed
   at native (2989,2439) is 4.441438 m, intended head 4.521438 m; an inherited 2.925 m
   cut created a 1.623104 m pool where immutable terrain had none. Restore only
   unnecessary supports, then refresh actual domains; do not deepen adjacent
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
python3 -m worldgen.audit_water_joint_cuts /tmp/water-bounded-preservation-state.npz water-repair-inputs/bed-overlay.json --source SOURCE_INDEX --out /tmp/water-reviewed-proposal.json
```

Replace `SOURCE_INDEX` with the diagnosed source; do not run an indiscriminate
province-wide proposal sweep. Helpers reject old caches lacking retaining
bounds. `audit_water_solve` still has a cached-domain iteration loop: never
mistake that for final convergence or use it to justify repeated moving-bank
millimetre tails.

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
