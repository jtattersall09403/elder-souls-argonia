# Peak-water coverage investigation

Owner correction, 2026-09-06: upper tide and wet-season limits may increase;
existing low-water limits remain. At peak combined stage, water must fill the
whole terrain-shaped and painted water area. This includes upland channels,
ponds and swamps. Do not erase a genuine carved water footprint to make an
underfilled river pass.

## Findings

The predecessor 311-constraint native cache (overlay SHA-256 beginning
`3e8a57b0`) was checked against its terrain and overlay hashes. These measurements
precede the ten later retaining-bound restorations and one pool-anchor move. `worldgen.audit_water_bankfull` measures active non-falling
river stations against native triangle sections. It distinguishes the lower
retaining-bank height, the landcover distance stencil, and the stored silt,
river-mud and wet-bank materials sampled along that stencil. Stage responses
are estimated from source salinity; final compiled fields must replace this
estimate at release. Lowland/upland below uses base water elevation <14 m / ≥14 m,
not administrative region membership.

| Check | Lowland stations short | Upland stations short |
|---|---:|---:|
| Even the lower retaining bank exceeds available peak rise | 541 / 6,133 | 1,589 / 2,970 |
| Stored silt/river-mud/wet-bank samples exceed peak rise | 1,000 / 5,426 | 2,341 / 2,824 |

Upland lower-bank rise is 1.50 m median, 3.77 m at the 90th percentile;
stored hydric material needs 3.31 m median, 7.28 m at the 90th percentile.
These are separate measurements: reaching the lower bank does not prove the
opposite bank is full. The lower-bank test alone confirms the owner's upland
underfilling observation.

`landcover.py` paints channel silt/mud/banks by distance regardless of height
or flood connectivity. Some sampled paint lies on steep valley sides tens of
metres above the river; two low-elevation station sections encounter >90 m
rises. These are diagnostic outliers, not proposed water-level increases.
Inspect original terrain and the actual footprint before treating a painted
slope as a bankfull target. Do not raise every lowland water body to satisfy
an unrelated upper valley wall.

## Implemented foundation

- Independent high/low tide and wet/dry season amplitudes in optional compiled
  `stageRange`; legacy fallback is unchanged. CPU water offsets still supply
  the renderer, so no additional GPU sampler or divergent visual water model.
- Flood access and river cross-sections grow to the specified upper stage.
  The inaccessible sentinel and RG16 encoding also grow; otherwise the old
  2 m sentinel would classify untouched land as reachable above that level.
- Adaptive water error bounds, the final confluence gate and native terrain
  shore protection consume the same independent extrema.
- Deterministic, hash-checked read-only station diagnostic. Reproduction command
  is in [the compiler handoff](../../../tooling/world-generation/worldgen/WATER_REPAIR_HANDOFF.md).

## Verification

38 focused runtime tests and 39 compiler/boundary/stage tests pass. The
synthetic compiler test proves a higher stage expands potential inundation
without changing base channel levels. Root typecheck passes. Workspace tests
pass with the existing seven child-process tests rerun outside the sandbox
that initially blocked their Node subprocess. This is source/algorithm
verification, not a production bankfull or appearance pass.

## Work still required

### Morphology evidence for the footprint audit

[Garber et al. (2024), HydXS](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023WR035269)
estimates bankfull from the maximum of a smoothed hydraulic-depth curve
(wetted cross-sectional area divided by top width). The method follows the
channel-connected depression, handles neighbouring depressions separately,
and rejects unresolved sections whose inferred bank hits the sampling edge.
Inset benches remain a limitation. Its reference delineation uses the lower
of two independently identified banks; it does not identify a whole valley
wall as the riverbank.

Application here is a proposed diagnostic, not an adopted production target:
compare this morphological transition with the actual carver footprint and
stored materials. Retain ambiguous sections explicitly for review. A detected
inner bench must not shrink the owner's intended high-water channel or swamp;
nor can a morphology estimate replace connected whole-area coverage checks.
The procedural carver history provides evidence that a real-world DEM alone
does not have, so recover that evidence before choosing peak levels.

### Exact carving history recovered

`worldgen.audit_water_carver_history` replays refinement and records actual
lowering by channels, lake/feeders, portages, continuum rivers, rivulets,
oxbows, wetland compaction/pools, deltas and bed conditioning. Using the saved
`waterways-natural.json` reproduces all4033² samples of
`refined-height-ungraded-f32.npy` exactly. Current berth-adjusted lanes do not:
they differ at3,897 samples. Comparing directly with graded terrain instead
also includes later road/track earthworks; these are retained as a separate
signed delta, not silently attributed to river carving.

Reproduce from `tooling/world-generation`:

```sh
python3 -m worldgen.audit_water_carver_history --out /tmp/water-verified-carver-history
```

The diagnostic writes only the requested NPZ/JSON, with source and lane hashes,
and refuses to export if the natural-terrain reconstruction differs. Its
5cm counts describe significant carving, not an adopted boundary threshold:
Gaussian tails and broad peat compaction are not automatically water targets.
The actual rivulet stage lowers70,533 native samples,67,519 by at least5cm.
These provide exact carver evidence for the outstanding minor-channel coverage
check; they are not a claim that present water already covers them.

`worldgen.audit_water_authored_footprints --history /tmp/water-verified-carver-history.npz --out /tmp/water-authored-channel-footprints`
now recovers the complete continuum and rivulet authoring domains using the
carvers' own existing profile cutoff. Both stages reproduce their verified
actual cut deltas exactly. The continuum footprint contains362,040 native
vertices,302,108 of which that stage left unchanged because they were already
low enough. The rivulet footprint contains163,667 vertices,93,134 unchanged.
Neither footprint omits a carved sample. These masks remain targets even
where no excavation was needed; measuring cut deltas alone would omit most
of the continuum footprint. Four focused footprint/fluvial tests pass.

These two masks do not replace lake, portage, oxbow or swamp-basin targets,
and do not establish connected inundation. The5cm cutoff here is the actual
existing authoring-domain condition, not a new minimum observed carve depth.
No terrain or paint changes are made by recovery.

### Height-aware ownership at cliffs

A whole-footprint proximity diagnostic at the145 checkpoint found that a
low plunge reach can be horizontally closest to an upper-bank target. At
native[647,2593], terrain is123.322m; the low reach is7.758m, but the actual
upper channel nearby is121.374m. The apparent115m stage requirement is a
wrong water-plane association, not a proposed rise. Missing minor reaches
similarly cannot borrow the nearest sea plane as their target reference.
Therefore `/tmp/water-authored-footprint-heights.json` is only a proximity
diagnostic; its extrema/percentiles are not accepted production stages.

`ChannelOwnership` now considers the portion of each segment whose maximum
possible head can reach queried terrain. This removes a false boundary on
the upper channel's actual native23935 section: with a4m diagnostic upper
stage, that bank reaches8.104m from the centre instead of stopping at4.413m
against the remote plunge owner. Original standing-water and intervening-sill
checks remain. Twenty-one boundary tests pass, including the clipped falling
segment and adaptive search past nearby low channels. This local domain fix
does not certify the interpolated whole-area mesh or choose production stage
values. Final owner/geometry coverage remains necessary, especially near cliffs.

Resolve the existing base hydraulic constraints and retaining-bound violations;
those are not made valid by higher flood levels. Establish each actual carved
water footprint as the target, then solve peak levels and connected extent
against it. Correct distance-only painting on unrelated valley slopes while
retaining genuine channel/basin targets. Check whole-area coverage, including
both banks, inter-station triangles, ponds, swamps and all reported locations.
Choose and export matching production stage bounds only after those checks;
a single province-wide increase selected from a percentile cannot certify
fullness. No stage increases or new water assets have been deployed.
