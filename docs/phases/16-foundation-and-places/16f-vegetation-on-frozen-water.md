# 16f — Vegetation and dressing on the frozen water

**Goal.** Dress the frozen world from its record. The land-cover bake and
the scatter compiler stop re-deriving water from rasters and read the
hydrology graph: no tree or shrub stands in a river; every shore and marsh
paint class carries the id of its body or reach; river beds and standing
bodies are dressed under the water by body kind and signed depth. The
ground underfoot is covered again with a system researched from Skyrim,
the mods in the vault and shipped open worlds: the jungle floor as dense as
the owner remembers it; low cover nearly everywhere else, varied, never one
identical grass; fast. Rocks dress what Skyrim dresses with rocks, in
and around rivers as well as on cliffs, at falls, in rocky surf and across
the uplands, with every placement rule derived from the plugin data so the
Phase 10 round-4 mistakes cannot recur. The owner's open dressing questions
(ordered rows, hanging roots, trees on bare rock, bare uplands, a boulder
region, grass coverage) each get a measurement and a fix. The insects
gather where the record says life is; the water's colour follows the
record and the canopy with soft edges; the chain gets a contract pass so
integration seams surface as one list. The wreck kit is built here and
placed by the place ladder.

**The sequence is one way (plan §3).** Frozen ground (the graded array
16e wrote, `refined-height-f32.npy`) and the frozen water record → the
land-cover bake painted from the record → the scatter placed on that bake,
the record and the major roads → the bundles published. Nothing here
touches a level, a channel, a route line or the plot; nothing above this
chunk's ladder row runs again. The scatter knows nothing of settlements or
minor tracks (owner 2026-09-16): their clearance is a **typed patch** on
the published bundles, applied later by 16g (tracks) and 16h (settlements)
without re-running the scatter; this chunk defines that patch kind and its
applier and reads none of the stale data.

**What this chunk realises physically and what it leaves to others.** 16f
owns the one scatter compiler and everything it places (trees, shrubs,
groundcover rules, rocks, the submerged band, dressing zones), the ground
paint, the vegetation clearance patch kind, the water's colour
constituents and the insects' habitat. It builds the wreck kit but places
no wreck: a wreck is a catalogue place with promises (decision 0062),
confirmed against the water record in 16g and stood up by 16h's runtime
with its place (16i, 16j, Phase 15). It keeps the *how high* 16c fixed
for the insects and moves only the *where*. It does not retune the tree
density ladder (0048). The seasonal foliage response goes to the polish
backlog (owner 2026-09-16); it is renderer-only and nothing here depends
on it.

Needs ruling 10 (already given for 16b); no new ruling.

## Owner asks (acceptance checks, not suggestions)

- **C8** (2026-09-11): no trees in rivers; wetland and drowned forest are
  fine. Rivers and standing bodies still get bed vegetation and rocks
  (2026-09-16).
- **C9** (2026-09-11, refined 2026-09-16): the jungle floor was better in
  the older, denser version; other regions were not, with long stretches
  of bare textured ground. Low cover nearly everywhere, varied by ecology,
  never huge swathes of identical grass; derived from how Skyrim, the vault
  mods and games in general do it; held to the edge of view at a high
  frame rate.
- **C10** (2026-09-11, extended 2026-09-16): fireflies, midges and
  dragonflies gather over real standing water and marsh; fireflies also in
  forest and jungle.
- **Rocks** (2026-09-16): derive precisely how Bethesda places rocks from
  the plugin data and use all of it, so hollow sides, rocks inside rocks,
  wrong sinks and wrong angles cannot come back; rocks in and around rivers.
- **Roads** (2026-09-16): vegetation and ground cover on and around the
  major roads follow the road's class and its authored state of repair.
- **Water colour** (2026-09-16): a greener tint for swamp water only if it
  patches on without recompiling the water or unfreezing anything; deep
  marsh may be black water in the lore, to be checked there; any tint
  grades smoothly with natural edges, never a straight line.
- **Performance** (2026-09-16): dig explicitly for bugs and poor
  implementation choices that cost frame rate; find efficient ways to
  keep the quality rather than lowering it.
- **Hanging roots** (owner confirmed 2026-09-16): they are the vine and
  moss pieces meant to hang on trunks, ending up in the air.
- **Backlog rows absorbed here** (plan §9): plants in ordered rows; trees
  stark on bare rock; bare uplands; a maze-like lowland boulder region
  (climbable, nooks for loot); grass coverage; waterfall sides need rocks;
  rocks in the surf; the chain's one-defect-per-run integration seams.
- **Sent here by other chunks:** the algae constituent (16c ledger), the
  submerged band and the wreck statics (0062 item 7).

## Starting state (2026-09-16, written by the reviewing Fable agent; replaces the 16e agent's)

- **The ladder is built through 16e** (`terrain-chain.sh` `DELIVERED_THROUGH="16e"`;
  `ladder.py` holds only `LADDER_ORDER` and `OWNER`, which has no row for
  `rebake_landcover` or `settlement_ground_control`). The ground is the
  graded array; water was compiled on the natural one and proved unmoved.
- **Rocks exist and ship.** Six rock meshes in `flora-province-v1`: five
  closed vanilla boulders `rockl04/rockl02/rockm03/rockm02/rocks03` as a
  size ladder (`build_palettes.boulders`) plus BM&V's `moss_rockcliff01` as
  `cliff_dressing` on ≥ 28° ground; laid to the slope (`align_to_slope`),
  big-to-small clearance, each sunk to its mined pivot offset
  (`composition-rules.json` `pivotOffsetM.p50`, −0.18 to −1.2 m). They are
  switched on in region classes 1 and 2 only; nothing at falls, in beds, in
  surf or in the lowlands. Skyrim's own use of its 71 `landscape/rocks/`
  meshes is already mined per species in `vanilla-tamriel-placement.json`
  (`sinkM`, `slopeDeg`, `tiltDeg`, `rotationZUniformity`, `scale`,
  `aboveWaterM`, `submergedFraction`, `groundWaterDepthM`,
  `meanNearestNeighbourM`, `clarkEvansR`, `clumping`, `groundTop`,
  `clearanceToBuiltM`; `associations` per species).
- **The hanging pieces are attachments** (`composition-rules.json` class
  `attachment`: `hangingvines1/2`, `florahangingmoss02/03aaa`, hosts
  tree-canopy/branch at 2–6 m) composed onto hosts by
  `composition.compose`; ten epiphyte/liana layers ship in regions 6, 7,
  11, 13, 14. The owner sees them in the air (confirmed 2026-09-16).
- **No cliff-band raster exists**: 16b's benching is a height operation
  (`sculpt.py` `BENCH_BAND_M = 26`); cliff materials are shader-side
  (`CLIFF_ROCK/CLIFF_DIRT` on the triplanar side projections). Cliff bands
  are derived from slope on the frozen height, which the scatter samples.
- **The aquatic band half exists**: 17 `aquatic-kelp` layers gated by land
  region class and `water_depth_m` 0.3–9 m; `underwater-v1` holds 23 assets
  and the palettes use four. The vault holds far more: Depths of Skyrim
  (`mod-sources/depths-of-skyrim-26913`: `DOS/Misc` 11 pieces, wrecked
  Atmoran and Breton ships and broken rowboats in `DOS/Ships` and
  `DOS/Boats`, underwater grass and trees; `DepthsOfSkyrim.esp` with
  its own placements), the Depths mesh fixes (174995), Underwater Treasure
  (`Underwater_Treasure.esp`, a placement source), Siren's Root, vanilla
  `dungeons/ship/shipwrecklarge01–04` and `clutter/shipwreck/*`; Tropical
  Skyrim retextures for vanilla pieces.
- **Ground cover is a runtime ring** (`Groundcover.tsx`: 75 m ring, 16 m
  tiles, 60k cap, scale-to-zero over the outer 20 %, no impostor tier),
  reading `ground-control.png`'s red channel and `hydro-regions.png`, table
  `groundcover.json` v2 keyed (region class, land cover) with region swaps
  replacing the base list; its `bare.covers` names 23 covers that carry
  nothing (mud, rock, sand, road, scree, cliff). Pre-0048 → HEAD: species
  rows 14 → 27, but the richest covers lost density (cover 19: 15,500 →
  9,950 /ha; 11: 11,200 → 8,800). Its asset pool is the
  `groundcover-province-v1` kit (34 meshes); a new species is a kit rebuild.
  The grass records of five vault plugins and Skyrim.esm are mined
  (`groundcover-rules.json`, `vanilla-groundcover-rules.json`).
- **The scatter samples a jittered grid** (`scatter.py` ~504–560, one cell
  size per layer from its expected count, Clark–Evans measured); `role` is
  an annotation the gate ignores; `Layer.gate` reads region, depth, slope,
  cover, altitude, shore, glade and coast only; `SCATTER_INPUTS` names no
  graph file; `ProvinceFields` decodes `water-surface.png` alone and takes
  the sea from `hydro-regions.png` class 0. It reads settlement clearance
  from `vegetation_patches.keep_raster` (stale 2026-09-09 blueprints) and
  route corridors from `routes_raster.corridor_masks` (the stale minor
  lines too); the runtime ring evaluates the same settlement function in
  `packages/game-core/src/vegetation/settlementClearance.ts`.
- **The route registry carries `condition`** (added 2026-09-16: `maintained
  | worn | decayed | broken`, `conditionSections` per chainage window, a
  `conditionWhy`; its header names 16f dressing as a consumer). No stage
  reads it yet.
- **The land-cover bake re-derives water**: `landcover.compile_ground_control`
  paints wet, shore, salt, mangrove-coast and lake-vs-pool from TWI, the
  Phase 3 wetlands and salinity, a height-at-zero test and a component-area
  test; it matches no `test_record_reads` pattern and has no allowlist row.
  `build_border_apron.py:311` calls it as `(h, region, rivers, slope,
  pitch_m, origin=, seed=, v_frac=)`.
- **The water runtime reads a per-entity table**: `water-meta.json` schema
  3 carries `entities[]` indexed by the `water-id.png` label;
  `water-class.png` carries per-texel class, turbidity and salinity that
  the shader samples. A colour constituent is one more per-texel channel
  or per-entity field; the levels and extents are not touched.
- **The air layer's patches are value noise** (`ambientAir.ts` ~225–307,
  `patchM` 34–70 m per species); the runtime water data carries depth and
  a tidal class, no kind. The air work is committed; nothing is in flight.
- **The record reader** is `ProvinceSurvey.water_at / reach / body` over
  `water_report.ShippedWater` (`kind_grid(kinds)`, `signed_depth_m`,
  `season_wetness`, `reach_band_grid`, `nearest_cascade`); the survey
  carries `channel_grid`, `standing_body_grid`, `reach_band_grid`,
  `marsh_grid`. Vocabulary: reach kinds `horizontal-channel |
  horizontal-tidal | horizontal-backwater | sloped-riffle | sloped-rapid |
  sloped-chute | vertical-fall` (615); body kinds `ocean, lagoon,
  lake-lowland, tarn-upland, pond, pool, plunge-pool, marsh-fringe,
  marsh-deep, swamp, backswamp, mudflat` (2,280); every reach carries
  `centreline`, `widthM`, `depthM`, `season`, `band`.
- **Thin classes, answered by 16a** (ledger §6): one delta, at the mouth of
  `river.889-484`; corridor dressing follows the graph's band-3 reaches,
  not the region paint. Region classes 3 and 5 are still painted and still
  key palettes, `landcover.py` and two 16g modules.
- **The chain** fingerprints each stage's code and the files it read and
  wrote last time (`chain_stages`, `chain-stamps.json`); it stops at the
  first failing stage; no pre-run contract check exists (16e failed twice
  in a row on downstream assumptions about upstream artefacts).
- **Lore on water colour**: the dossiers carry nothing on black or dark
  water; the vault UESP extract has "dark water" in the Murkmire texts
  (Keshu's rites, Scotti's border bridge). A dossier is written before any
  body is made black.
- **The chain would not skip the water (found 2026-09-16, after 16e 3b).**
  `compile_water`'s stamp records two vault inputs whose hashes have moved
  since 16c; its code hash has moved as well. A plain run would therefore
  recompile the water; the 16e route stages have no stamps at their
  current positions, so a plain run would re-solve and re-grade the roads.
  The owner wants nothing earlier rebuilt, refrozen or recompiled
  (2026-09-16). This chunk therefore (a) makes the chain SKIP `compile_water` on
  every routine run, the way it skips the six rungs above the gate (only a
  deliberate `--refreeze` reaches it); (b) it adds `chain_stages adopt`,
  which records the accepted on-disk outputs of a stage as its stamp
  without running it, used once here for the 16e stages. 16f's own runs
  start at `rebake_landcover`.
- **Tests**: `npm run test:placement` is 537 green, 13 skipped; the six
  16g-gated tests skip, none is red; `test_vegetation_ladder` is green on
  bundles the chain skipped through 16e (false assurance; the bundles are
  uncommitted, 200 files, 2026-09-12). `palettes.json` `ladder.pending`
  still says the ladder test "stays red": stale text to fix.
  `stripBoulderCandidates` (`ChannelStrips.ts:262–293`) is a pure rule with
  a unit test and one caller that only counts it.

## Read

- README.md §3, §8 (the image budget), §9 (the rows absorbed);
  decision 0066 appendix (`rebake_landcover`, `landcover`, `compile_scatter`);
  [research/phase16/audit-hydrology-data-model.md](../../research/phase16/audit-hydrology-data-model.md) §5;
  [research/phase16/16a-hydrology-graph-ledger.md](../../research/phase16/16a-hydrology-graph-ledger.md) §6.
- decisions 0036 (the Phase 10 run-book at its top: the round-4 rock
  defects and the round-5 fixes), 0048 (the density ladder: read before
  touching any density), 0062 items 7–8, 0064 (falls: the skirt hides the
  foot, not the sides), 0065.
- `world/65` (tiers, the submerged band, corridors, collision tiers),
  `world/60` (wrecks and sunken structures as places; the water-body
  table with "dark absorption, debris, algae"), `world/90` §76 (the
  underwater candidates; vanilla is the rock source),
  `world/sources/lore/topics/roads-and-routes-4e201.md` (the condition
  dossier).
- `research/vegetation/README.md` and the four live design inputs it
  indexes (composition rules C1–C5 above all; micro-siting for the
  waterline rings); `research/rendering/waterfalls-realtime.md` §4 items
  4–5 (the bed-rock recipe); `research/rendering/vegetation-scatter-instancing-threejs.md`
  (the renderer's own performance notes);
  `research/vegetation/openworld-vegetation-placement-architecture.md`.
- `worldgen/scatter.py`, `compile_scatter.py`, `composition.py`,
  `build_palettes.py` (palettes.json is GENERATED from it),
  `vegetation_ladder.py`, `landcover.py`, `rebake_landcover.py`,
  `vegetation_patches.py`, `routes_raster.py`, `water_report.py`,
  `site_fields.py`, `mine_placement.py`, `chain_stages.py`;
  `world/sources/flora/palettes.json` (conventions: the WADING rule M1),
  `groundcover.json`, `world/sources/placement/composition-rules.json`,
  `vanilla-tamriel-placement.json`, `vanilla-groundcover-rules.json`,
  `groundcover-rules.json`, `world/sources/routes/registry.json`;
  `tooling/asset-pipeline/pipeline/config/kits/flora-province-v1.json`,
  `underwater-v1.json`, `groundcover-province-v1.json`, `vet_kit.py`;
  `apps/world-studio/src/vegetation/Groundcover.tsx`, `Vegetation.tsx`,
  `VegetationColliders`; `packages/game-core/src/air/ambientAir.ts`,
  `src/water/waterData.ts`, `src/water/render/ChannelStrips.ts`,
  `src/vegetation/settlementClearance.ts`.

## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

`compile_scatter` and `rebake_landcover` are rows in
`worldgen/record-reads-allowlist.json`; `landcover.py` is the module
behind the second row. The bake paints shore, wet, salt, mangrove-coast and
lake classes from the coarse Phase 3 salinity and wetlands, a TWI wetness
guess, a height-at-zero test (an inland sea-level marsh paints as beach) and
a component-area lake test; the scatter decodes the water-surface image
alone and takes the sea from the region raster's class 0. Those are the 16c
round-1 mistake in vegetation vocabulary, not conventions. Port all three to
the record reader, delete the raster reads and both rows; add
`landcover.py` to the gate's patterns so the port cannot be undone silently.

Concretely, every shore, wet and marsh paint class and every scatter
exclusion comes from a body or reach id and its recorded kind: `ocean` and
`lagoon` shores paint beach and mangrove coast by the recorded salinity
class, not a threshold; `swamp`, `backswamp`, `marsh-deep`, `marsh-fringe`
paint their margins; `lake-lowland`, `tarn-upland`, `pond`, `pool`,
`plunge-pool` paint standing-water rims; channels paint bank by `band`;
`mudflat` paints mudflat. Depth, slope and height are sampled only as
measurements. The apron's call (`build_border_apron.py:311`, four
positionals plus `origin/seed/v_frac`) keeps working with no water record
beyond the border; `test_border_apron` stays green and the apron stage
re-runs. A provenance test joins every water-derived paint class in the
shipped control map and every scatter exclusion to its id and fails on a
missing id or a disagreeing kind, shown failing on today's bake and bundles.

Two stale inputs are removed rather than ported. The scatter's read of
`vegetation_patches.keep_raster` and of the minor-route corridors goes:
settlements and tracks clear vegetation through the patch kind of
deliverable 9, never through the scatter. Ground contact for every rock,
bed-anchored plant and landmark tree is its own mined figure, never a
class default: the six rocks already carry one; every rock this chunk adds
carries `sinkM.p50` from `vanilla-tamriel-placement.json`; the Depths and
Underwater Treasure assets carry theirs, mined from their plugins; the Hist
trees and the Anvil composite carry the trunk part's mined offset. A test
proves that no `rock`, `landmark-giant` or bed-anchored species resolves to
`CLASS_SINK`.

## Deliver

1. **Channel membership as a hard gate** (C8). `ProvinceFields` gains a
   record field, `channel_m`: signed distance to the nearest reach polygon
   of kind `horizontal-channel`, `horizontal-tidal`, `sloped-riffle`,
   `sloped-rapid`, `sloped-chute` or `vertical-fall`, built once from
   `kind_grid` on `water-id.png` (the compiled extent realises the record,
   0065) at the wet-season extent (`season` passed explicitly). Every woody
   layer (canopy, emergent, gallery, understory, gap-thicket, green-wall,
   bank-wall, landmark-giant) is rejected inside the polygon and its
   margin (`widthM`-scaled, the wetted bank); `waterline-tree`,
   `drowned-tree`, `basin-mangrove` and `drowned-thicket` layers keep their
   own gates on `horizontal-backwater` reaches and on `marsh-fringe`,
   `marsh-deep`, `swamp`, `backswamp` bodies, which stay planted. Inside a
   channel the bed is dressed by deliverable 8 (bed plants, bed cover,
   rocks), never bare by rule. A filter that names a kind the vocabulary
   lacks raises at load. Test: zero trunks of any woody layer inside any
   channel-kind polygon on the shipped bundles, shown failing on today's
   bundles first.
2. **Ground cover: measured, researched, then built.** Measure first, at
   the jungle (`x=4.02&z=4.61`), mangrove, floodplain, rootland and
   mountain sites: instances per m², mean height, coverage fraction and
   the largest bare patch inside a 30 m ring, from the ring's placement
   function run against the pre-0048 table
   (`git show 1797edf5:world/sources/flora/groundcover.json`) and HEAD. The
   jungle's pre-0048 numbers are the target *there*; the other regions'
   targets come from the research, not from the old table, which left them
   bare. Research, recorded as `research/vegetation/groundcover-system.md`:
   how Skyrim binds grass to painted ground and fades it (the mined GRAS
   fields, the engine's start-fade and density settings), how the vault
   mods do it (the five plugins mined in `groundcover-rules.json`: species
   mixes per texture, densities, height and colour variance); how
   shipped open worlds do it (density tiers by distance, clump and bare
   patch noise, species mixing per ground type, colour tied to the ground
   texture, wind, no shadow casting, GPU instancing per tile, impostor or
   cross-quad tiers, budget per frame). Then deliver the system that
   research supports: a **coverage floor per region class and land cover**
   (low cover nearly everywhere; `bare.covers` shrinks to what is genuinely
   bare: open water bed, road surface, the wettest mud, salt, cliff face);
   two or three species per cover mixed by a patchiness field so no swathe
   is one identical grass; tall, chunky classes where the ecology targets
   say so (jungle floor ferns and broad herbs, reed beds, floodplain forbs
   and tall grass, mangrove sedge); density and height varied by land cover
   and the recorded wetness; colour variance tied to `ground-tint.png`; the
   outer fade tuned so the floor holds to the ring's edge. New species are
   a `groundcover-province-v1` rebuild from the vault's grass and fern pools
   (BM&V, Tropical, vanilla with its Tropical replacement where one exists),
   credited. Tests: coverage fraction per site at or above its floor; the
   largest bare patch under a stated size; species entropy per cover above
   a floor; all shown failing on today's table. The 0048 tree ladder is
   untouched.
3. **Performance, found and fixed.** Profile the vegetation runtime before
   and after (the groundcover ring's tile rebuild cost and frequency, draw
   calls and instance counts per tier, alpha-test overdraw, the collider
   ring's budget and rebuild cadence, material patch re-application, any
   per-frame allocation or React re-render in `Vegetation.tsx`,
   `Groundcover.tsx` and `VegetationColliders`) with the browser's own
   profiler through the studio and the FPS the owner's machine reports.
   Dig for bugs and poor choices (a rebuild every frame, a tile regenerated
   when the camera moves a metre, instances drawn twice, colliders built
   for grass, textures re-uploaded, culling that never culls) and fix them
   at the root. The bar is the same quality at a higher frame rate; a
   quality knob is the last lever, stated with its number if pulled. The
   ledger carries the before and after per site.
4. **Rocks: the rules derived exactly, then extended.** Before any new rock
   is placed, `research/vegetation/rock-placement-rules.md` states, from
   `vanilla-tamriel-placement.json` and Skyrim.esm (re-run
   `mine_placement` for any figure not already there), per rock species:
   sink (`sinkM` p25/p50/p75), tilt (`tiltDeg`) and whether it follows the
   slope, yaw uniformity, scale range, its slope band, its
   relation to water (`aboveWaterM`, `submergedFraction`,
   `groundWaterDepthM`: which rocks Bethesda stands in rivers and how deep),
   the ground textures it stands on (`groundTop`), nearest-neighbour
   distance and clumping (`meanNearestNeighbourM`, `clarkEvansR`,
   `clumping`), what it co-occurs with (`associations`: rock piles on
   rocks, dead shrubs beside them) and its clearance from buildings. Mesh
   side, `vet_kit.py` measures each rock for a closed underside and an
   open back (an open-backed shell is cliff dressing only, its back into
   the hill, never a freestanding boulder) and its pivot against its
   footprint. The palette layer carries each figure as its rule,
   per species, never a class default, with a test per figure:
   sink from the mined p50, tilt within the mined band, yaw uniformity as
   mined, scale in the mined range, no rock inside another (the mined
   nearest-neighbour floor as clearance), no open side facing outward, no
   rock floating (its footprint's lowest ground sample at or below the
   pivot's sink), water relation as mined. With those rules, the flora kit
   gains the vanilla rock meshes Skyrim itself uses most (`rockpiles01–04`,
   `rockpilem01–02`, `rockpilel01–04`; `rockcliff01–07`; `rockl01/03/05`,
   `rockm01/04`, `rocks01/02`), Tropical Skyrim's retextures where they
   exist, credited in the root README; then the layers:
   - **In and around rivers**: boulders and rock piles on channel banks and
     in the bed of every reach kind, at the depths and shares Bethesda's
     own river placements show; the steep reaches additionally at 1
     boulder per 160 m² of wetted bed, radii 0.6–2.5 m, inside 80 % of the
     half-width, seeded by reach id (`stripBoulderCandidates` ported to
     Python; the TypeScript rule and its count deleted). Each bed boulder
     is written to `water-meta.json` on its reach (`bedRocks[]`: position,
     radius) so the water renderer stamps foam (a pillow ~0.5 r upstream,
     a tail ~3 r downstream) into the strip's foam attribute at load. The
     stamp is water cosmetics: Fable does it.
   - **Falls**: at every `vertical-fall` reach, boulders tight against the
     lip and both sides of the sheet (`nearest_cascade`, the cascade
     record's lip and width) and in the `plunge-pool` body's rim; 0064's
     skirt hides the foot.
   - **Cliff faces and bench lips**: `rockcliff` pieces laid into ≥ 28°
     faces and rock piles along the slope break above them, derived from
     the frozen height, in every region with cliffs.
   - **Rocky surf**: boulders and piles in the `ocean` and `lagoon` shore
     band where the bake's shore class is rock or pebble, none on sand.
   - **Standing bodies**: rocks at tarn and lake rims and in their
     shallows as the mined water relation allows.
   - **A lowland boulder field, the first authored dressing zone.** A typed
     record `world/sources/flora/dressing-zones.json` (schemaVersion; zones
     with a stable id, kind, polygon in metres, a palette overlay of
     layers, a lore `why` with its dossier or UESP source) that the scatter
     applies inside the polygon over the region palette: the mechanism
     Phase 15 packets and Phase 12 exteriors reuse for any authored local
     dressing. Survey the frozen ground for two or three candidate sites
     (moraine or scree below a cliff, a rocky hill flank, a stony coast;
     not marsh), ground the choice in the dossiers, then author one zone:
     a ladder up to hero boulders at a density that leaves nooks and
     passages, climbable in Phase 9c. The other candidates go to the ledger
     for Phase 15.
5. **Roads dress by class and condition.** The corridor rule
   (`routes_raster`, `scatter.route_allows`, the groundcover thinning) reads
   the major roads' class widths and the registry's `condition` and
   `conditionSections`: `maintained` keeps a clear surface and a trimmed
   verge; `worn` lets herb into the ruts and the verge grow; `decayed`
   lets moss, roots and shrub encroach and breaks the surface with cover;
   `broken` sections are overgrown from verge to verge; drowned sections
   carry the water's own dressing. Test: cover fraction on the surface rises
   monotonically from `maintained` to `broken` on the shipped lines.
6. **Ordered rows.** Measure per layer at the five sites: Clark–Evans R and
   a nearest-neighbour bearing histogram (a grid shows as four peaks). Where
   the peaks show, fix the sampler at its root (the shared cell phase or
   the jitter amplitude in `scatter.py` ~504–560), deterministically, never
   by post-hoc noise; `test_output_is_clustered_the_way_hand_placement_is`
   gains the bearing check. Numbers before and after in the ledger.
7. **Hanging vines and moss.** The owner has confirmed what they are. Find
   why `composition.compose` leaves them in the air (the host offset, the
   attach height against the host's trunk capsule, a host chosen from the
   wrong instance list or a composite part) and fix it at the root: every
   attachment touches its host (test: each attachment instance lies within
   its host's trunk radius plus the piece's reach at its attach height,
   shown failing on today's bundles), or the layer goes.
8. **Under the water: rivers, bodies and the sea.** The aquatic layers are
   re-gated on the record: the body's or reach's kind and `season` (a
   seasonal body gets nothing that needs water all year), flow (bed plants
   that Bethesda stands in rivers versus still water, from the mined
   water relation); the signed depth from the high-water surface, from
   the waterline to ~12 m; land region class stops deciding them. Breadth
   from everything the vault holds, surveyed by directory listing: Depths
   of Skyrim and its mesh fixes, Underwater Treasure, Siren's Root, vanilla
   (with the Tropical replacement for any vanilla piece that has one),
   BM&V's kelp and pads. Tiers: bed plants and a bed ground cover in
   `horizontal-channel` and `horizontal-backwater` reaches and in every
   standing body kind; kelp and seaweed forests; coral-like growths on
   rock beds; sunken debris, driftwood and broken boats; shell beds if a
   shell mesh exists anywhere (otherwise dropped with the search recorded);
   Ayleid rubble only where a submerged-ruin place will stand (16g), so not
   scattered. Every bed-anchored asset carries its sink mined from its own
   plugin (`mine_placement` over `DepthsOfSkyrim.esp` and
   `Underwater_Treasure.esp`). Acceptance is numeric: instances per m² by
   depth band per body and reach kind, zero above the waterline, the share
   of the available asset breadth used, shown failing on today's bundles;
   the owner judges the look in the 9a swim slice.
9. **The vegetation clearance patch kind.** A typed patch,
   `vegetation-clearance`, in its own file
   `world/sources/flora/vegetation-patches.json` (schemaVersion; id, owner
   record, `hardClear`, `thinned` with its keep gradient, `kept`; the
   authored grading of `vegetation_patches.py` carried over verbatim),
   applied by a small stage `apply_vegetation_patches` that removes or
   thins instances inside the polygons in the published bundles of the
   chunks it touches and writes a receipt; the runtime ring evaluates the
   same list through `settlementClearance.ts` (renamed to the patch
   vocabulary, parity test kept). The scatter never reads it. 16g emits
   patches for minor tracks and 16h for settlements; neither re-runs the
   scatter. Test: a patch clears instances in its polygon and nothing
   outside; the receipt names every chunk touched.
10. **Trees on bare rock.** Woody layers other than the rock-tolerant ones
    (the mined `groundTop` says which species stand on rock) are gated off
    `BC_ROCK`, `MOUNTAIN_ROCK` and `DIRT_CLIFF`. Under every tree that does
    stand on a rock class the ground reads as litter: `compile_scatter`
    writes an **under-canopy litter mask** (crown radius per T1/T2
    instance, from the kit footprint) into the alpha of
    `refined/ground-tint.png` (1009², RGB today); the ground material blends
    the rock classes toward `LITTER`/`MOSS` by that mask. Nothing the
    scatter reads depends on the mask, so no loop. Test: under a canopy
    instance on rock the mask is set; nowhere else.
11. **Bare uplands.** A mountain dressing palette for region classes 1 and
    2 from what the vault holds (directory listings, never keyword search):
    scree and rubble piles (deliverable 4), dead shrubs and dead trees,
    fallen logs and stumps, mountain forbs, a heather analogue from BM&V or
    Tropical if one exists, the moss-ledge grass swaps in `groundcover.json`
    under deliverable 2's floor. The vanilla mountain mix is the
    calibration (`deadshrub01` 9/ha where found, `rockpilem02` 5.7/ha,
    mountain flowers 5/ha, by slope band); the 0048 ratios for classes 1
    and 2 hold because dressing is not a stem layer. Lore: the border
    mountains are temperate grassland edging to bare stone
    (`thornmarsh-and-east.md`).
12. **Thin classes on the record.** The delta dressing (mudflat and
    salt-marsh layers of region 3) is applied inside the bodies and reaches
    of `river.889-484`'s mouth by entity id; the corridor gallery of region
    5 is applied within a stated distance of every band-3 reach centreline
    (`reach_band_grid`), whatever the region paint says. Region classes 3
    and 5 keep their palettes where the raster paints them; the overlays
    are record-keyed and reported by area. `horizontal-river` is not a
    kind; filter on `band == 3`.
13. **The wreck kit.** `wrecks-v1` from vanilla `shipwrecklarge01–04` and
    `shipwreckboards01–03`, Depths of Skyrim's wrecked ships, half-wrecks,
    broken rowboats and submerged-POI dressing, with footprints,
    connectors only where the pieces were designed to combine (read from
    the plugin data, `kit-assemblies` rules, owner ruling 2026-09-04) and
    designed ground contact mined from the placements in Skyrim.esm and
    `DepthsOfSkyrim.esp`; credited. Nothing placed: 16g confirms each wreck
    record's water depth (16g 3d) and the place ladder stands them up.
14. **Life over the water and under the canopy** (C10). The compile writes
    a **habitat mask** from the record and the scatter output (bits:
    standing body, marsh or wet ground, canopy or forest floor) into a
    channel the water shader already fetches (or a sibling raster at
    `water-id.png`'s resolution if none is spare); `ambientAir.ts` weights
    its patch centres by it: fireflies to marsh, wet ground and forest and
    jungle floor at dusk; midges and dragonflies to standing bodies; pollen
    and leaf fall to canopy; the value noise goes. The clock, weather and
    lighting behaviour stays; the height-above-surface rule is 16c's and
    stays. Phase 13's fauna read the same mask. Test: every firefly patch
    centre samples marsh, wet ground or canopy; every dragonfly and midge
    patch centre samples a standing body; shown failing on the noise
    version. Fable does this step (it is a water data channel).
15. **Water colour from the record, with soft edges.** Only if the mechanism
    below needs no water recompile: a per-texel **colour constituent** channel (algae green; tannin
    dark) written by a small below-gate stage from each body's recorded
    kind and season and the canopy fraction over its rim from the scatter
    output, into a spare channel of `water-class.png` beside turbidity and
    salinity or a sibling raster, smoothed over tens of metres and following
    the water's own shape so no edge is straight or hard; the shader reads
    it as 16c's model reads turbidity. The levels, extents and every other
    water raster are untouched and the freeze is not lifted; if the
    mechanism turns out to need a water recompile, the row goes to the
    polish backlog quoting the owner's condition (2026-09-16). Before any
    body is made black, a short dossier
    `world/sources/lore/topics/water-colour.md` records the sources
    (the Murkmire "dark water" texts in the vault extract, UESP for more)
    and the real-world rule (blackwater is peat- and tannin-stained water
    under canopy in slow swamps: `backswamp`, `swamp`, `marsh-deep` with a
    high canopy fraction; clear where it moves or sits open). Test: the
    channel's gradient never exceeds a stated per-metre bound; every dark
    texel lies in a body of a kind the dossier names. Fable.
16. **The chain contract pass** (the owner's 2026-09-16 request; the
    backlog row struck here). `terrain-chain.sh --check-contracts` runs
    before any stage: for every enabled stage it loads each artefact the
    stage declares it reads (a per-stage `READS` list in a new
    `worldgen/chain_contracts.py`; the fingerprint records *observed*
    reads, so the pass also fails a declared read the stage never opened
    on its last stamped run) and validates shape, required
    fields, `schemaVersion` and the hash bindings against the current
    files, printing every mismatch as one list; a stage with no declared
    reads fails the pass. Every stage this chunk adds or edits declares
    its reads. Then the plain run is expected to pass first time; a new
    stage still needs its one real run.
17. **Rebuild once, on the frozen world.** Kits rebuilt and copied to
    `apps/world-studio/public/kits/` before any scatter (flora with the
    rocks, groundcover with the new species, underwater extended, wrecks
    new); `rebake_landcover` (the ported bake), `build_border_apron`
    (re-runs on the new bake), `compile_scatter`, then the colour-constituent
    and habitat stages, as the chain orders them. Credits for every new
    asset land in the root README in the same change.
18. **Tests shown failing first** (beyond those named above): a paint
    class with no id; a scatter exclusion with no id; a woody trunk in a
    channel; a kelp above the waterline; a rock on a class default sink; a
    rock with an open side outward; a firefly patch over dry open ground;
    a coverage fraction under its floor; a bare patch over its size; a
    bearing histogram with grid peaks; an attachment in the air; a
    clearance drawn by the scatter from any settlement or track; a road
    surface whose cover does not rise with its condition; a hard edge in
    the colour channel; a stage with undeclared reads.

## Seams into later phases (so nobody refactors this)

- **Instance identity.** The bundle is byte-identical for a seed, so an
  instance is `(chunk, species, ordinal)` for ever. State the contract in
  `vegetation-index.json` (`schemaVersion` bumped) so Phase 13's harvestable
  nodes and Phase 10c's alchemy keys can address a plant without a second
  id scheme; a clearance patch (deliverable 9) removes instances by that
  identity and its receipt lists them.
- **Vegetation clearance is a patch** (deliverable 9): 16g emits them for
  minor tracks, 16h for settlements, Phase 15 per packet; none re-runs the
  scatter.
- **Rock colliders** are fitted capsules today (`trunk_solids`). Phase 9c's
  climb contact and 16h's convex-part collider export are the moment rocks
  take real hulls; the kit build keeps the mesh so that is a re-export.
- **Dressing zones** (deliverable 4) are the authored-overlay record for
  Phase 15 packets and Phase 12 exteriors.
- **The habitat mask** (deliverable 14) is Phase 13's spawn input for
  marsh, forest and aquatic fauna.
- **Road condition dressing** (deliverable 5) is what 16h's span author
  and road painter read for their collapsed and worn variants.
- **The litter mask and the groundcover ring** are app-private renderer
  code (0038 debt): touched here, extracted to `packages/world-render` at
  10b. Do not grow them beyond what the deliverables need.
- **The seasonal foliage response** is a polish-backlog row (owner
  2026-09-16), keyed to the clock's season scalar the water already reads.

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `rebake_landcover`
  (on 16b's row, re-run here because the code changed; never duplicated
  into the 16f row), `compile_scatter`, `apply_vegetation_patches` (empty
  list on this ladder), the colour-constituent stage and the habitat
  stage. Fill the `[16f]` row in `terrain-chain.sh`, add `rebake_landcover`
  and `settlement_ground_control` to `ladder.py`'s `OWNER`, bump
  `DELIVERED_THROUGH="16f"` in the delivering commit; the `vegetation` layer
  then shows. `--check-contracts` passes; ONE run, started at this chunk's
  first stage (`--from rebake_landcover`); no second-run proof (owner
  2026-09-16: one run per chunk, nothing above it re-executed).
- Channel gate green and proven failable; both allowlist rows deleted and
  `landcover.py` under the gate; the provenance join green; every dressing
  question has a number and a decision in the ledger; every rock rule
  traced to its mined figure; the rock, groundcover, underwater and wreck
  kits credited; `test_vegetation_ladder` re-run on the new bundles with the
  0048 ratios holding; frame rate at the five sites at or above today's
  with the new cover in place.
- The ledger `docs/research/phase16/16f-ledger.md` (coverage, bare patch
  and species entropy before and after per site; frame rate before and
  after; rows and attachments numbers; rock counts by rule and by mined
  figure; submerged instances by depth band and the breadth used; the
  habitat and colour fields; the dressing-zone candidates; the contract
  pass's first list), a decision record (0070; 0069 is 16e's) for the non-obvious calls,
  16g's Starting state rewritten, the backlog rows absorbed here struck
  and the seasonal-foliage row added, the `palettes.json` stale note fixed.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered):
the ground, the water, the apron, the major roads and fords, plus the
plants, ground cover, rocks and the water's colour. No tracks, no
buildings, no wrecks in place.

- Jungle `?view=character&x=4.02&z=4.61&t=12:00` first: is the floor as
  dense as you remember it? Walk 75 m in one direction: does the cover hold
  to the edge of view; does the frame rate hold?
- Floodplain `x=3.01&z=2.45`, rootland `x=2.84&z=3.02`, mangrove
  `x=5.17&z=4.45`: low cover nearly everywhere, varied, no identical
  swathes, no bare textured stretches?
- Mountains `x=0.93&z=0.92`: is the upland dressed (scree, dead wood,
  forbs, low cover) rather than bare; do trees on rock stand on litter?
- Lowland river `x=1.85&z=4.89&t=12:00`: nothing woody in the channel;
  reeds and waterline trees at the margin; rocks on the banks and in the
  shallows; bed plants under the surface?
- Gorge fall `x=2.53&z=0.32`: rocks at the lip and both sides, boulders in
  the pool rim; walk down a rapid: boulders in the bed with foam behind
  them, none hollow, none inside another, none floating?
- A road: walk `route.road.helstrom-blackrose` from Helstrom
  (`x=3.47&z=2.81`) and a `decayed` or `broken` section the ledger names:
  does the surface read clear where kept and overgrown where not?
- Any plants in rows; any vines or moss in the air, at the five sites?
- The boulder field (the ledger gives its URL): does it read as a place
  you would explore, with passages and nooks?
- Beach `x=6.12&z=1.638`: rocks in the surf where the shore is rock, none
  on the sand?
- Marsh `x=1.50&z=5.28&t=20:00`: fireflies over the wet ground at dusk and
  in the jungle at `x=4.02&z=4.61&t=20:00`; dragonflies over the pond by day
  (`t=13:00`); none over dry open ground at `x=0.93&z=0.92`.
- Water colour: the backswamp the ledger names against the lake at
  `x=1.85&z=4.89`: greener or darker where it should be, with a soft,
  natural edge and no straight seam?
- The delta mouth and one band-3 corridor (URLs in the ledger): mudflat
  and salt-marsh dressing at the one; a gallery of waterline trees along
  the other.

## Owner check, round 2 (2026-09-18; decision 0071, ledger §15)

Everything below is drawn by the kits and bundles published on 2026-09-18.
`?view=character&…` unless said otherwise.

- Rocks: `x=2.54&z=1.20` (the cliff piece you named), `x=0.84&z=5.14`
  (Rockpark): stand on a boulder — feet on the stone, not a foot of air;
  walk round it — no invisible wall; watch it in wind — no sway; back away
  to 40 m — no holes; the cliff pieces sit into the slope.
- Quality bands: at the jungle `x=4.02&z=4.61` walk 150 m in one line and
  watch one tree and one patch of ground cover: they dissolve between
  levels instead of jumping; the ground cover thins into cards and holds
  to ~145 m instead of ending at a line.
- Grass up close: jungle floor, floodplain `x=3.01&z=2.45`, rootland
  `x=2.84&z=3.02`: ferns, nettles and tussocks read as 3D from a stride
  away; the crossed-card grasses are still there but no longer alone.
- Rows: `x=2.21&z=1.11` and `x=3.04&z=6.46`: no straight lines of plants.
- Roads: broken Archon–Gideon `x=3.60&z=3.58` and `x=4.77&z=3.55`; decayed
  Gideon–Stormhold `x=1.97&z=2.08`: a visible dirt or track surface with
  cobbled remnants and potholes, grass creeping over the edges; check it once from the
  air and once at ground level.
- Sea bed: `x=3.05&z=6.65` (the flat squares are gone); swim out from the
  beach `x=6.12&z=1.638` and along the shore: pebbles, shells, stones,
  sponges, starfish and rocks on the floor, kelp and seaweed as before,
  thinning as you go further out; reefs at the sites ledger §15 lists.
- Frame rate at the jungle and at the lowland river `x=1.85&z=4.89`: low,
  medium or high, one word each.

## Owner check, round 3 (2026-09-18; decision 0072, ledger §16)

Everything below is drawn by the kits and bundles published on 2026-09-18
(round 3). `?view=character&…` unless said otherwise. The local studio
must be freshly started for this round (the server fix is in its config).

- Trees and rocks: jungle `x=4.02&z=4.61`, Rockpark `x=0.84&z=5.14`: are they back?
- Rows: `x=2.21&z=1.11`, `x=3.04&z=6.46`, floodplain `x=3.01&z=2.45`: any straight lines of plants left?
- Ground cover while walking, jungle `x=4.02&z=4.61`: walk 150 m in one line; plants ahead should sharpen as you approach and soften as you leave, never vanish as you get close, never reappear all at once; is there still a hitch every few steps?
- Sea bed: beach `x=6.12&z=1.638`, swim out and along the shore; reefs `x=4.72&z=5.77`, `x=5.33&z=4.88`, `x=5.62&z=2.32`: pebbles, shells, algae mats, sponges, starfish and coral heads on the floor?
- Console: any line mentioning texture units, or `GL_INVALID_OPERATION`, at the beach or under water?
- Frame rate at the jungle, the beach and under water: low, medium or high, one word each; the console prints `vegetation rebuild … ms` and `flora colliders rebuild … ms` lines while you walk — paste the largest of each.

## Gotchas

- Do not retune the density ladder (0048); the jungle's stem count is the
  owner's constant. Dressing, rocks and groundcover are not stem layers.
- `palettes.json` is generated: edit `build_palettes.py`. A new groundcover
  species is a kit rebuild. Rebuild and copy every kit before
  `compile_scatter`.
- Every rock rule comes from a mined figure with a test; a rule typed from
  memory is the round-4 mistake again (decision 0036's run-book).
- Leaf-card fitting and collider budgets are per-asset rules from Phase 10;
  every new rock and plant obeys them (`trunk_solids`; the vegetation
  ring's budget is decision 0036's).
- `probe-vegetation.mjs` can hang under SwiftShader on dense jungle; it is
  not a gate. Numbers come from the bundles and the browser profiler.
- The 12 GiB memory cap: a rebake or a scatter that dies at exit 137 leaves
  half-written rasters; restore from HEAD.
- CSM's `setupMaterial` overwrites `onBeforeCompile`: the litter blend needs
  the same re-apply the wind has.
- The scatter never sees settlements or minor tracks; if a clearance
  appears at Lilmoth on this ladder, a stale read came back.
- Water cosmetics (foam stamps, the colour constituent, the habitat
  channel) are Fable's work, never a `deliver` subagent's (owner
  2026-09-11, amended 2026-09-14).

## Delivery plan (2026-09-16; owner go given the same day)

Fable plans, decides and judges; `deliver` subagents (Opus, low effort) do
the mechanical passes under a brief that names files, mechanism, numbers
and checks; `research` subagents measure and list. One session, one owner
check at the end; every step commits by pathspec after `npm run preflight`.
At most six ingested images (plan §8), each listed in the ledger.

0. **Reconcile before building** (Fable). `routing-audit` pre-build over
   this brief; PROGRESS row to `in progress`; decision 0070 drafted (rocks
   extend the flora kit under mined rules; clearance as a patch, never a
   scatter read; dressing zones as a typed overlay; the wreck kit here and
   the place in 16g; the litter mask in the tint raster; the habitat mask
   and the colour constituent as water channels; the contract pass; the
   seasonal response to the backlog).
1. **The contract pass** (`deliver`, first, so every later chain run uses
   it): `READS` per stage in `chain_stages`, `--check-contracts`, shown
   failing on a planted missing field.
2. **Deliverable 0, the ports** (two `deliver` subagents in parallel: one
   on `landcover.py` + `rebake_landcover` + the apron call, one on
   `compile_scatter`'s fields with the settlement and minor-corridor reads
   removed), each with its provenance test red-first; rows deleted;
   `landcover.py` under the gate. Fable reviews the diffs for
   re-derivation that survived.
3. **The record fields and gates** (Fable designs `channel_m`, the
   entity-membership and band-3 distance fields, the flow and season
   gates for the submerged band; `deliver` implements them with the
   channel and depth-band tests red-first). Waits for 2.
4. **Ground cover** (from the start: a `research` subagent measures the
   five sites against the pre-0048 table and HEAD; another writes the
   groundcover research from Skyrim, the mined mods and shipped games;
   Fable designs the floors, the mixing and patchiness fields, the colour
   tie and the fade; `deliver` edits the table, rebuilds the groundcover
   kit with the sourced species, changes the ring and writes the three
   tests).
5. **Performance** (from the start: a `research` subagent profiles the
   vegetation runtime at the five sites and lists every suspect with
   file:line; Fable diagnoses the root causes; `deliver` fixes them under
   Fable's numbers; re-profiled after 4 lands).
6. **Rocks** (from the start: `research` compiles the per-species rule
   table from the mined data and lists the vault's rock directories; Fable
   writes `rock-placement-rules.md`, chooses the set and designs the
   layers; `deliver` extends the flora kit config with the mined sinks,
   rebuilds it, extends `build_palettes` and `vet_kit`, ports
   `stripBoulderCandidates`, writes the per-figure tests; the river, fall,
   surf and body rules wait for 3). Fable surveys the boulder-field
   candidates on the frozen height and the dossiers, authors the first
   dressing zone and its schema; `deliver` wires the overlay with its test.
7. **Roads, rows and the hanging pieces** (`research` measures Clark–Evans
   and the bearing histogram per layer and the attachment offsets against
   their hosts; Fable diagnoses; `deliver` fixes the sampler and the
   attachment composition, then implements the condition-aware corridor
   rule with its monotonic test). Waits for 2.
8. **The clearance patch kind** (Fable designs the schema and the applier's
   contract from `vegetation_patches.py`; `deliver` implements
   `apply_vegetation_patches`, renames the runtime evaluator, keeps the
   parity test, adds the receipt test; 16g's and 16h's briefs already name
   it). Independent.
9. **Bare rock and bare uplands** (Fable designs the rock gate and the
   litter-mask channel; `deliver` implements the mask writer, the material
   blend and the mountain dressing layers from the vault listing). Waits
   for 3 and 6.
10. **Under the water and the wreck kit** (`research` lists the four mods'
    directories and the vanilla pieces with their Tropical replacements;
    Fable chooses the tiers; `deliver` extends `underwater-v1`, builds
    `wrecks-v1` from the designed-to-combine pieces, mines the two plugins
    for sinks, writes the depth-band and breadth tests, credits). Kit work
    independent; the layers wait for 3.
11. **Water-adjacent work** (Fable, low effort): the habitat mask and the
    air layer's where (with the forest bit); the bed-rock foam stamps; the
    water-colour dossier and the colour-constituent channel with its
    gradient test. Waits for 3 (and 6 for the stamps).
12. **The chain** (Fable): kits copied, `--check-contracts`,
    `rebake_landcover`, the apron, `compile_scatter`, the new stages; the
    `[16f]` row filled, `OWNER` rows added, `DELIVERED_THROUGH="16f"`; one
    run from `rebake_landcover` down, nothing above it; `test_vegetation_ladder`
    re-run on the new bundles.
13. **Close** (Fable): the ledger with its numbers, decision 0070
    finalised, 16g's Starting state rewritten, backlog rows struck and the
    seasonal-foliage row added, credits checked, PROGRESS updated, the
    owner check above handed over with the ledger's URLs. Nothing is
    pushed.

Steps 1, 2, 4, 5, 6 (rules and kit), 8 and 10 (kit) start together; 3
waits for 2; 6's layers, 7, 9, 10's layers and 11 wait for 3; 12 waits for
all; 13 last.
