# 16f — Vegetation and dressing on the frozen water

**Goal.** The scatter reads channel membership from the hydrology graph so
nothing grows in a river; rocks dress falls, strips and cliff bands the way
Skyrim dresses them; and the owner's open dressing questions (grass coverage,
plants in rows, hanging roots, bare rock under trees, bare uplands, boulder
regions) are answered with measurements and delivered where the answer is yes.

Needs ruling 10 (already given for 16b); no new ruling.

## Starting state (2026-09-13; the closing 16e agent rewrites this)

- **Ground cover is a runtime ring, not a bundle** (world 65 §T3):
  `apps/world-studio/src/vegetation/Groundcover.tsx` (736 lines) regenerates
  it from the land-cover raster within a 75 m ring, reading
  `world/sources/flora/groundcover.json` (density in instances per hectare,
  a survival rule and a `maxInstances` cap). Deliverable 0 changes that
  file, the table and `mine_groundcover.py`, not `compile_scatter`; there
  are no "groundcover bundles in git history" to diff — measure by sampling
  the ring's placement function at each site against the pre-0048 table.
  The file is app-private (0038); do not grow it, 10b extracts it.
- **The graph's reach vocabulary** (0058, commit 443c33fb) is
  `horizontal-channel | horizontal-tidal | horizontal-backwater |
  sloped-riffle | sloped-rapid | sloped-chute | vertical-fall`; bodies are
  `ocean, lagoon, lake-lowland, tarn-upland, pond, pool, plunge-pool,
  marsh-fringe, marsh-deep, swamp, backswamp, mudflat`. There is no
  `horizontal-river`, `horizontal-stream` or `drowned-forest`. Every reach
  (615) carries `centreline`, `widthM`, `depthM`, `season`, `band`; no
  reach-owner raster is needed.
- **The gate is missing, not broken**: `scatter.Layer.gate` reads region,
  water depth, slope and land cover only; `compile_scatter.ProvinceFields`
  decodes only `water-surface.png`; `SCATTER_INPUTS` names no graph file
  (root cause: audit-hydrology-data-model §5).
- **`stripBoulderCandidates` is TypeScript in the water renderer**
  (`packages/game-core/src/water/render/ChannelStrips.ts`, 1 boulder per
  160 m² of wetted bed), not a compiler export; reimplement the rule
  deterministically in Python from `water-meta` channels with that file as
  the spec; give the constant one home.
- **No rock kit exists** (31 kit configs, none `rocks-v1`); the vault rock
  candidates are world 90 §76, not the chain audit §5 (which is cliffs).
  `underwater-v1` holds 23 assets.
- **The delta and corridor answer is written** (16a ledger §"thin
  classes": one delta, `river.889-484`; corridor classes follow band-3
  channel reaches); deliverable 4 applies it.
- **Ladder rows exist**: `[16f]="compile_scatter"` and `rebake_landcover`
  on 16b's row; confirm, never duplicate; bump `DELIVERED_THROUGH`.
- **`test_vegetation_ladder.py` is green today** (wired into
  `test:placement`); 0048's "stays red pending the rollout" is history.
  Inherited red, not yours: four catalogue-export tests owned by 16g.
- **The committed vegetation bundles are stale**: `ladder.json` ran through
  16b and skipped `compile_scatter` and `compile_water`; "shown failing on
  today's bundles" measures a pre-freeze world — say so or rebake first.

## Read

- [research/phase16/audit-hydrology-data-model.md](../../research/phase16/audit-hydrology-data-model.md) §5.
- decisions 0036, 0048 (the density ladder — read before changing any
  density); `world/65`; `research/vegetation/openworld-vegetation-placement-architecture.md`
  (macro → meso → micro; water-margin dressing);
  `research/rendering/waterfalls-realtime.md` §6 (rock recipe at falls).
- `worldgen/scatter.py`, `compile_scatter.py`, `world/sources/flora/palettes.json`
  (the WADING rule M1), `groundcover.json`; world 90 §76 (rock meshes in the vault; no rock kit exists).

## Deliver

## Record reads (decision 0066) — the gate this chunk must add

On 2026-09-14 `compile_scatter` and `rebake_landcover` read the graph
**zero** times. `rebake_landcover` paints shore and wet classes from height
≤ 0 and its own water test ("sea-level shorelines only") — an inland
sea-level marsh paints as beach, the exact 16c round-1 error in ground
paint. `compile_scatter` decodes `water-surface.png` alone. Before any
dressing work:

- `rebake_landcover` takes every shore, wet and marsh paint class from the
  compiled water's class raster keyed to `water-meta` body kinds (a
  `swamp` body paints swamp margin, an `ocean` body paints beach), and its
  16b-ladder fallback is named as such in `ladder.json`, never silent;
- the channel gate (deliverable 1) and the submerged band (3b) take kinds
  from graph ids and only *depth* from the signed-depth raster;
- the rock kit and any landmark tree (Hist trees, the Anvil composite)
  carry a **per-asset designed ground contact** measured from the source
  plugin's placements with `mine_placement.py`'s pivot-minus-`height_at`
  method (the flora C1–C2 rule), stored on the kit manifest with evidence,
  not a class default (16h deliverable 3 does the same for buildings);
- **provenance gate:** every scatter exclusion and every land-cover paint
  class that came from water names the body or reach id; a test joins them
  back and fails on a missing id or a disagreeing kind, shown failing first
  on today's bundles.

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
   graph's reach centrelines and widths and excludes trees and shrubs inside any reach of kind `horizontal-channel`,
   `horizontal-tidal`, `sloped-riffle | sloped-rapid | sloped-chute` or
   `vertical-fall` and its wetted margin (`widthM` plus a margin);
   `horizontal-backwater` reaches and `marsh-fringe`, `marsh-deep`,
   `swamp` and `backswamp` bodies keep their flora (a filter that names a
   kind the vocabulary lacks matches nothing and is a gate that cannot fail); a `season` argument is passed
   (the wet-season extent decides). Test: zero trunks inside any reach polygon
   on the shipped bundles, shown failing on today's bundles first.
2. **A rock kit** (sourcing job, not art): build `rocks-v1` from vanilla
   `landscape/rocks/` and `landscape/mountains/` (Tropical Skyrim retextures),
   measured footprints and ground fit, credited; then scatter on cliff bands
   (16b's band raster), along every strip and at every fall lip and side
   (the `stripBoulderCandidates` rule, ported from the water renderer) and in surf
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
3b. **The submerged band and the wreck statics** (moved here from Phase 9
   by decision 0062; this is the one scatter compiler and it is being
   rewritten in this chunk): the depth-gated submerged scatter band of
   world 65 (kelp and eelgrass analogues, shell beds, sunken debris) reading
   the graph's bodies and the season-aware signed depth; the wreck and
   submerged-ruin statics of world 60 and 90 §76 sourced from the vault
   (`underwater-v1` holds 23 assets; gaps are sourcing jobs, credited in the
   same change). The owner judges them in the 9a swim slice; here the
   acceptance is numeric (instances per m² by depth band, zero above the
   waterline, shown failing on today's bundles).
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
   the *where* changes (the height-above-water rule is 16c's item 9). Coordinate with that agent if their work is still
   in flight (their files, their tuning). Test: every firefly patch centre
   samples wet or marsh ground at the wet season; every dragonfly patch
   centre is over a standing body; shown failing on the noise version.
7. Rebuild the bundles once on the frozen world (`compile_scatter` after
   `settlement_ground_control`, per the chain order).

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `rebake_landcover` and `compile_scatter` (the rewritten scatter); they already run on the 16b ladder as the old code and both rows are
  already written. Confirm them in `tooling/world-generation/scripts/terrain-chain.sh` (never duplicate `rebake_landcover` into the 16f row) and bump `DELIVERED_THROUGH`
  to this chunk in the delivering commit; until then a plain chain run skips
  them and their published JSON is stale.

- Channel gate green and proven failable; rock kit credited and in the
  bundle; each dressing question has a number and a decision in the record.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): the ground, the water, the routes and the vegetation. No buildings yet.


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
