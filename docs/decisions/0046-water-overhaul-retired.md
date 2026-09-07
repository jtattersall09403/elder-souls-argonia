# 0046 — The terrain-constrained water overhaul is retired; the field water is the runtime

2026-09-07. Supersedes the runtime parts of [0045](0045-reversible-water-overhaul.md).
The owner reported the deployed overhaul as a regression (floating 2D water on
dry land, gaps and hollows in rivers and ponds, hard water/land edges, lost
surf/whitecaps/wind response, a terrain rebuild loop and a frame-rate collapse
under `?waterDataset=preview`) and asked for it to be put right.

## What was found (evidence in the three research reports behind this record)

- **The default build ran on a stripped compile.** `water/v2/` lacked the
  access raster, native ground, cross-sections and matched terrain that the new
  renderer needs; every dry/shore gate degraded silently. With no access
  raster the wet test became "bed up to 2 m above the plane counts as water"
  (`inlandAdaptiveLeaves.ts`), and class *none* under a support pixel was
  relabelled *lake* (`waterData.ts`). Province-wide, 34 % of pixels were
  "supported" with the bed at or above the surface: that population is the
  hovering water. The owner's example site (4.57 km E, 3.87 km S) is dry in
  the original data (W 2.55 m under 4.2 m ground) and "0.9 m deep" in v2.
- **Rectangles and hard edges** came from the raster-domain partition (whole
  axis-aligned cells kept or dropped, no depth term) with three of the four
  shore-refining discards disabled by the missing data.
- **Zigzag gaps and hollows** came from per-vertex wet culling at LOD spacing
  (up to 117 m between tested vertices) and from ribbon-envelope subtraction
  with most of the ribbons absent.
- **The full dataset is not viable either.** The preview set is 478 MB
  (369 MB of duplicate terrain at ten times the triangle count), the terrain
  LOD choice has no hysteresis so chunks flap, evict and re-download every
  frame, and the compiler had become a reach-by-reach repair treadmill
  (80 compiler modules, "62 channel constraints, 59 retaining-bound violations"
  still open).
- **The legacy renderer already has what the owner misses**: depth-fade shore
  blending, surf/run-up, whitecaps, wind and rain response, foam, slope-river
  shading, waterfall shading, SSR, refraction, ripples. Its known gaps are
  particles, a real waterfall mesh, projected caustics, and steep narrow
  streams (a 3.66 m raster bilinearly blended across a one-texel ribbon).
- **What the owner liked is separable.** The interaction and particle stack
  (contact emitter, interaction stream, effects, bubbles, buoyancy, rigid
  bodies, displacement registry, local pool patch) depends only on the
  `WorldWaterQuery` contract, not on the raster-owner machinery.

## Decision

1. The **field water model** (W surface raster + depth proxy + shore/flow/class
   rasters, decision 0025) is the runtime again, moved into
   `packages/game-core/src/water/render` per the package rule and driven by
   the `WaterRuntime` injection interface the overhaul introduced. The
   `?water=legacy` switch and the `legacy/` copies go; there is one path.
2. The **interaction/particle stack is kept** and wired to the field query.
   The body-isolating ripple simulation is kept (it closes the "ripples leak
   between pools" backlog item).
3. **Deleted**: the raster-owner/native-ground/ribbon/marine/adaptive-terrain
   renderer modules and their tests, the `v2` and `preview` datasets, the
   bed overlay and diagonal-topology terrain repairs, the adaptive terrain
   loader, and the 76 overhaul compiler modules. `compile_water.py` returns to
   its 0b67e12 form and grows from there.
4. **Steep streams, waterfalls and caustics are built on the field model** as
   bounded additions: explicit channel strips only where the compiled station
   chain is steep, ballistic-arc waterfall sheets with spray/mist from the
   kept particle stack at compiled cascade lips, and projected bed caustics on
   the terrain material. Ocean whitecaps, surf and wind response come back
   with the field material; the FFT open-sea tier stays a backlog row unless
   it can ride the kept spectral module cheaply.
5. **Tests move from unit counts to invariants**: compiled-data invariants
   (no wet cell with its surface below its bed, no enclosed dry hole inside a
   body, monotone station chains, strips only on steep reaches and joined to
   the field at both ends, cascade lip above plunge) and a handful of
   deployed-build numeric probes at named key sites.

## Why not fix forward

Fixing forward means shipping the 478 MB dataset, finishing an open-ended
hydraulic solver, and tuning a renderer whose correct behaviour depends on
five optional data files being present. The field model was owner-approved,
is 8 MB of data, and its defects are local and well understood.
