# 0047 — Water: one physical model on the real terrain (round 2 of the rescue)

2026-09-08. Follows [0046](0046-water-overhaul-retired.md). The owner's round-2
review of the deployed field water failed most inland sites: surfaces ending
in mid-air above lower ground, hovering blobs, holes in rivers, a wet season
that lifts plates instead of flooding, brown "conveyor belt" strips flowing
uphill, waterfalls declared on ordinary slopes, zigzag trenches under upland
streams, micro-jagged shorelines, no visible flow on lowland rivers, a dry
"mountain lake". The tests and probes all passed. Fable 5.1 subagents deliver
this round (owner instruction 2026-09-08, this session only).

## Root causes (measured on the shipped data, 2026-09-08)

1. **Levels were painted by masks, not found by flooding.** River cells took
   the nearest station's level inside a hydraulic-width mask; pools took a
   priority-flood level computed on a *smoothed* grid and laid over the raw
   one; a centreline "film backstop" put `ground + 0.12` on nearest-upsampled
   coarse river cells. Result: 13,896 wet texels have a dry 4-neighbour whose
   ground is lower than their own surface (the "stops in mid-air" edge); the
   marsh at 1.51 E / 5.30 S is a speckle of isolated one-texel puddles; the
   cliff foot at 2.53 E / 0.32 S carries the lip's level (144 m over 16 m
   ground) because nearest-station assignment crosses the cliff.
2. **"Wet" meant "was assigned a value".** `wet2 = ~isnan(w2)` counted cells
   whose W lies below their ground, so smoothing, shore distance, the fringe
   and the class raster were all computed against the wrong shoreline.
3. **Half-texel misregistration.** The surface raster texel `i` holds refined
   sample `2i` (world `2i·1.828 m`), but the shader and CPU sampler place texel
   `i`'s centre at `(i+0.5)·3.656 m` = sample `2i+1`. Every W, depth, shore and
   owner value is 1.83 m off the terrain in both axes; strips were emitted at
   `(sx+0.5)·mpp2` on top of that; the cascade profile sampler assumed yet
   another convention.
4. **Season lift without footprint growth.** The fragment shader discards where
   the *compiled dry-season* depth proxy is 0, so a 1.4 m wet-season rise
   cannot wet a single new texel: the plate rises and its edge hangs in the
   air. The "fringe" cells meant to give headroom carry depth 0 and are
   discarded too.
5. **Coarse-cell carving.** `carve_to_profile` cuts around station *cells* of
   the 5.48 m flow graph (a chain of blocks stepping diagonally), so upland
   channels are zigzag trenches with vertical walls; strips run straight
   between stations and float beside them.
6. **Waterfall = any 2.5 m station step.** `FALL_DROP_M = 2.5` over a 5.48 m
   segment is a 25° chute, so hillside streams received both a strip and a
   ballistic sheet, overlapping and misaligned. Steep strips are drawn with the
   river material (silt albedo, Beer–Lambert over a few cm), which is brown; a
   fixed-direction detail-ripple drift reads as upstream motion.
7. **Slow rivers show nothing.** Speed bands floor at 0.3 m/s where every
   flow term is gated off (`esSpeed > 0.3`), narrow rivers get no wave
   exposure, so a lowland river is a flat still plate.
8. **Shoreline cut by a 3.66 m raster and by the refracted depth.** The wet
   test is a hard per-fragment discard on the bilinear depth proxy, and the
   edge fade/contact foam read the depth through the *refracted* UV, so the
   ripple-sim texel grid (0.25 m) and the raster grid print into the
   waterline as a sawtooth.

## Decision

**One physical model, one grid, one definition shared by carve and compile.**

- **Full-resolution terrain is the truth.** The compile runs on the 4033²
  refined grid the studio renders at LOD 1 (1.828 m). Exported rasters sample
  that solution at the texel centres the runtime uses (`(i+0.5)·mpp`), so
  texel `i` of the 2017 surface grid is full-res sample `2i+1`. A test asserts
  the registration against `game-core/terrain/heightfield.ts` conventions.
- **Every level is a flood level.** Sea: 0 on ocean-connected ground below 0.
  Standing water: priority flood of the *raw* full-res terrain; a depression
  is accepted by the existing geometry rules (relief, floor slope, extent,
  marsh leniency, deep-basin rescue, road cap) but its extent is the flood
  extent, never a mask. Rivers: a monotone long profile along a smooth
  centreline; every cell within the channel width carries the profile level;
  lateral spread is a bounded flood from the channel cells at their own
  level; a profile is never allowed above the bank it would overtop
  (bankfull constraint on the pre-carve terrain, with a small levee raise
  allowed on a cross-slope). Invariant, tested: no wet cell has a lower dry
  neighbour; pools are flat bodies; no wet cell stands more than its body's
  real flood depth above its ground.
- **Channels are one object** — a new `worldgen/channels.py` owns the
  centreline construction (coarse flow graph → smoothed polyline per reach,
  resampled at ~2 m), the long profile, the cross-section carve, the reach
  classification (field / steep strip / fall) and the rasterisation helpers.
  `refine_province.carve_to_profile` and `compile_water` both call it, so the
  carved trench and the water that fills it are the same curve. No more
  station-cell carving.
- **A waterfall is a cliff.** A `fall` reach requires the terrain along the
  centreline to drop ≥ 3 m at a mean slope ≥ 1.0 (45°) with the steep part
  contiguous; everything steeper than the field raster can carry (slope ≥
  0.035) but not a cliff is a `steep` strip. Strips end at a lip and resume at
  the plunge; the sheet bridges; the field is masked under both.
- **Signed depth ships.** `water-surface.png` B = signed `W − ground` with
  `surface.depthMinM = −6`, `surface.depthSpanM = 30.6` (0.12 m quanta; the
  meta already carries `depthMinM`). Cells within the tide+season reach of a
  body carry that body's level (a bounded uphill flood to +2 m), so the
  runtime decides wetness as `signedDepth + lift > 0` and the season floods
  and drains physically. Truly dry ground stays buried at `ground − 3 m`;
  the shader treats `signedDepth ≤ −2.5` as buried.
- **The terrain cuts the shoreline.** The per-fragment raster discard becomes
  a coarse buried-guard only; the visible edge is the surface plane meeting
  the terrain mesh under the hardware depth test, softened by a *vertical*
  depth fade computed from the unrefracted scene depth. Contact foam uses the
  same vertical thickness.
- **Whitewater is a look, not a colour.** Strips render aerated: albedo and
  opacity from slope×speed, streak noise scrolled along the ribbon's own arc
  length (never world-time × world position, never a fixed world drift), no
  shoreline terms, no refraction. Lowland rivers get a speed floor by band,
  along-flow travelling surface undulation (CPU/GLSL twin in `waves.ts` so
  buoyancy agrees) and sparse drifting foam flecks on the transport clock.
- **Tests test the defects.** Compiled-data invariants (hovering edges,
  flat bodies, registration, strips inside their trench, falls on cliffs,
  every coarse river cell wet along its centreline, season footprint growth
  monotone) are the gate; the browser probe is one session, numeric, at the
  key sites, under two minutes.

## Why not patch again

Nine rounds of local patches produced 30 tunables and no invariant that the
owner's eye could not break. Each symptom above is the same mistake seen from
a different site: a level asserted somewhere water could not stand. Making
every level a flood on the real terrain removes the class.

## Records

Delivery: PROGRESS.md Phase P row; handoff in
[research/rendering/water-handoff.md](../research/rendering/water-handoff.md);
probe and runbook in [water-quality.md](../research/rendering/water-quality.md).
