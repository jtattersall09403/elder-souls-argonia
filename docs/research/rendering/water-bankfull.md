# Peak-water coverage investigation

Owner correction, 2026-09-06: upper tide and wet-season limits may increase;
existing low-water limits remain. At peak combined stage, water must fill the
whole terrain-shaped and painted water area. This includes upland channels,
ponds and swamps. Do not erase a genuine carved water footprint to make an
underfilled river pass.

## Findings

The accepted 311-constraint native cache was checked against its terrain and
overlay hashes. `worldgen.audit_water_bankfull` measures active non-falling
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

Resolve the existing base hydraulic constraints and retaining-bound violations;
those are not made valid by higher flood levels. Establish each actual carved
water footprint as the target, then solve peak levels and connected extent
against it. Correct distance-only painting on unrelated valley slopes while
retaining genuine channel/basin targets. Check whole-area coverage, including
both banks, inter-station triangles, ponds, swamps and all reported locations.
Choose and export matching production stage bounds only after those checks;
a single province-wide increase selected from a percentile cannot certify
fullness. No stage increases or new water assets have been deployed.
