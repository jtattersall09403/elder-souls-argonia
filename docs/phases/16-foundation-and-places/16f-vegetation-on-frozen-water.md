# 16f — Vegetation and dressing on the frozen water

**Goal.** The scatter reads channel membership from the hydrology graph so
nothing grows in a river; rocks dress falls, strips and cliff bands the way
Skyrim dresses them; and the owner's open dressing questions (grass coverage,
plants in rows, hanging roots, bare rock under trees, bare uplands, boulder
regions) are answered with measurements and delivered where the answer is yes.

Needs ruling 10 (already given for 16b); no new ruling.

## Read

- [research/phase16/audit-hydrology-data-model.md](../../research/phase16/audit-hydrology-data-model.md) §5.
- decisions 0036, 0048 (the density ladder — read before changing any
  density); `world/65`; `research/vegetation/openworld-vegetation-placement-architecture.md`
  (macro → meso → micro; water-margin dressing);
  `research/rendering/waterfalls-realtime.md` §6 (rock recipe at falls).
- `worldgen/scatter.py`, `compile_scatter.py`, `world/sources/flora/palettes.json`
  (the WADING rule M1), `groundcover.json`; the chain audit §5 (rock meshes
  in the vault; no rock kit exists).

## Deliver

0. **Ground cover density and variety** (C9, owner 2026-09-11). Measure first:
   the groundcover bundles now shipping against the pre-0048 bundles in git
   history at the jungle site (`x=4.02&z=4.61`) and four other region sites —
   instances per m², mean height, coverage fraction inside a 30 m ring. Then
   research briefly how shipped open-world games do ground cover (near-camera
   density, height and clump classes by land cover, distance fade and
   impostor tiers) and record it in `research/vegetation/`. Deliver: a
   coverage floor so low grass is present nearly everywhere the land cover
   allows; tall, chunky classes where the ecology says so (jungle floor,
   reed beds, floodplain); variation by land cover and wetness rather than one
   density; the tiered fade tuned so the floor holds within the walking view.
   The tree ladder (0048) is not retuned by this; the groundcover layer is.
   Test: coverage fraction per region site at or above a stated floor, shown
   failing on today's bundles.

1. **Channel membership as a hard gate** (C8): `compile_scatter` reads the
   graph's reach centrelines and widths (or a reach-owner raster compiled by
   16c) and excludes trees and shrubs inside any `horizontal-river/stream`,
   `sloped-*` or `vertical-fall` reach and its wetted margin; marsh, backwater
   and drowned-forest bodies keep their flora; a `season` argument is passed
   (the wet-season extent decides). Test: zero trunks inside any reach polygon
   on the shipped bundles, shown failing on today's bundles first.
2. **A rock kit** (sourcing job, not art): build `rocks-v1` from vanilla
   `landscape/rocks/` and `landscape/mountains/` (Tropical Skyrim retextures),
   measured footprints and ground fit, credited; then scatter on cliff bands
   (16b's band raster), along every strip and at every fall lip and side
   (`stripBoulderCandidates` already exported by the runtime) and in surf
   zones at the reviewed beach.
3. **The owner's dressing questions**, each measured then delivered or
   recorded as "no" with the number: grass coverage per region against the
   Skyrim.esm cross-check; ordered-row artefacts (a nearest-neighbour angle
   histogram; jitter where it fails); hanging-root decorations still
   appearing (find the placement rule and remove it); ground under trees on
   bare rock (a land-cover class under canopy on rock); bare uplands (a
   mountain dressing palette from the vault: heather, scree, dead wood);
   lowland boulder regions (survey the map for two or three candidate sites;
   place one as an exemplar if a site fits).
4. **Thin classes**: apply the graph's answer from 16a to the tidal delta and
   deep river corridor ladders.
5. Rebuild the bundles once on the frozen world (see 7).
6. **Life over the water** (C10). `packages/game-core/src/air/ambientAir.ts`
   chooses where fireflies, midges and dragonflies gather with value-noise
   "world-anchored density patches" (its own comment says fireflies work wet
   ground, midges and dragonflies standing water). Replace the noise with the
   real thing: sample the shipped wetness (`ShippedWater`-equivalent on the
   runtime side, the season-aware signed depth) and the graph's body kinds so
   fireflies weight to marsh and wet ground at dusk, midges and dragonflies to
   standing bodies, pollen and leaf fall to canopy from the land cover. Keep
   the clock, weather and lighting behaviour the other agent has tuned; only
   the *where* changes. Coordinate with that agent if their work is still
   in flight (their files, their tuning). Test: every firefly patch centre
   samples wet or marsh ground at the wet season; every dragonfly patch
   centre is over a standing body; shown failing on the noise version.
7. Rebuild the bundles once on the frozen world (`compile_scatter` after
   `settlement_ground_control`, per the chain order).

## Acceptance

- Channel gate green and proven failable; rock kit credited and in the
  bundle; each dressing question has a number and a decision in the record.

## Owner check

- Jungle `?view=character&x=4.02&z=4.61&t=12:00` first: is the floor as dense
  as you remember it, and denser than the open floodplain?
- Lowland river `?view=character&x=1.85&z=4.89&t=12:00`: nothing growing in
  the channel; reeds at the margin still there?
- Gorge fall `x=2.53&z=0.32`: rocks at the lip and sides, boulders in the
  pool; does the cliff band read as rock with rocks on it?
- Jungle `x=4.02&z=4.61`, mangrove `x=5.17&z=4.45`, floodplain `x=3.01&z=2.45`,
  rootland `x=2.84&z=3.02`, mountains `x=0.93&z=0.92`: any plants in rows;
  any hanging roots; is the upland less bare?
- Marsh `x=1.50&z=5.28&t=20:00`: fireflies over the wet ground at dusk, and
  dragonflies over the pond by day (`t=13:00`); none over dry high ground at
  `x=0.93&z=0.92`.
- Beach `x=6.12&z=1.638`: rocks in the surf with foam behind them?

## Gotchas

- Do not retune the density ladder (0048); membership and dressing only.
- Leaf-card fitting and collider budgets are per-asset rules from Phase 10;
  the rock kit obeys them.
