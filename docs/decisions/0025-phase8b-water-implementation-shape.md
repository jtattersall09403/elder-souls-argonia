# 0025 — Phase 8b water: implementation shape

Date: 2026-08-26 · Status: **CLOSED** (owner closed the phase 2026-08-28
after round 7 — accepted as good-enough, explicitly *not perfect*; a full
water-systems re-review + polish is queued in
[docs/polish-backlog.md](../polish-backlog.md) for Phase P)
Research: [docs/research/rendering/water-rendering-threejs.md](../research/rendering/water-rendering-threejs.md)
Spec: module [60](../world/60-water-traversal.md) §38–42.

## PHASE CLOSED — this file is the institutional memory

The numbered "Round N" sections below record every defect→fix of the
7-round gate; read them before changing any water code. The rebuild chain
and hard-won rules below remain current for anyone touching worldgen or
water shaders (Phase P polish, Phase 9 boats/swimming).

**Owner playtest checklist for round 7** (historical — the owner closed
the phase on this round without itemised feedback; use these spots as the
starting checklist for the Phase P water re-review) (deployed studio:
`https://jtattersall09403.github.io/elder-souls-argonia/studio/`; URLs take
`?view=character|fly3d&x=<km>&z=<km>&t=HH:MM&d=M-D`):
1. Mountain streams CONNECTED — the gorge (fly x=2.43 z=1.13) and any
   mountain valley: one continuous waterway down the slope into the
   lowland system; no empty beds, no disconnected blobs, no solid white
   crust (foam is streaky and slides).
2. Flow speed READS — glassy pools vs sliding glides vs churning rapids
   should look clearly different along one river's course.
3. Waterfalls — near-vertical drops now carry fast down-rushing streaked
   water (not a static sheet). Mist/base particles are polish-tier.
4. Sea LAPS — stand on an open beach (e.g. Topal Bay coast, character
   x=6.16 z=5.07 area): waves visibly arrive, run a tongue up the sand
   (metres, not cm), retreat with backwash foam; successive waves differ
   (wave sets); wet sand tracks the reach.
5. Barcode foam — gone everywhere? (Root cause fixed; if any survives,
   photo it → polish backlog.)
6. Round-6 leftovers if not yet checked: wetter heartlands (marsh belts +
   Archon jungle), wade/jump/crate interactions, performance.
7. Terrain-feel re-review (6b note) — combine with this closing pass.

**Rebuild chain** (after ANY worldgen change; ~10 min, from
`tooling/world-generation/`, vault path in `compile_chunks.DEFAULT_HEIGHTS`):
`refine_province <vault>/heightfield-f32.npy <vault>/hydrology-pass1.npz`
→ `reroute_majors` → `compile_minor_routes` → **`grade_routes`** →
`compile_chunks` → `export_web_chunks` → `compile_water` → `rebake_landcover`
→ `compile_scatter` for the affected chunks (decision 0036) →
`apply_sitings` (re-measures plot facts; re-runs the minor networks,
`export_places` and `export_routes` itself) → `python3 -m pytest -q`.
The two routing steps come first because gradient is a ROUTING property, not
a grading one (owner requirement 2026-09-05: every way walkable end to end).
Both solvers now cost each step by its own longitudinal gradient and wall off
anything over the class cap (`routes.grade_factor`), so a line switchbacks or
contours instead of climbing a spur head-on; grading then only has the last
few metres to swallow. `reroute_majors` repairs the published major-road
polylines in place rather than re-running `compile_society` (which would
re-derive danger and cultures too).
`grade_routes` (added 2026-09-05, owner report: roads running off the edge of
a terrace contour) cuts and fills the heightfield along every road, track and
footpath so each has a walkable longitudinal gradient — road 8 deg, track
12 deg, footpath 17 deg, boardwalks untouched — flat across its width with a
benched shoulder no steeper than 30 deg. It reads its input from the
`refined-height-ungraded-f32.npy` snapshot beside the refined heights, so
running it twice is the same as running it once, and it must run BEFORE
anything derived from heights. Report:
`world/sources/sites/route-grading.md`. It reads the *published* water
surface, so on a first-ever bake run `compile_water` once before it.

**Grading and siting are separated on purpose.** Grading reshapes the ground
*because of* where the plot put places and where the route solvers ran, and
the water bake then follows the graded ground — so scoring siting on that
surface is a feedback loop that silently moves committed records. Before it
grades, `grade_routes` snapshots the natural state
(`refined-height-ungraded-f32.npy` in the vault,
`refined/height-natural-rg.png` and `province/water/natural/` in the studio),
and `site_fields.ProvinceSurvey` — the siting layer behind the macro plot,
the route networks and the blueprints — reads the snapshot. The graded
surface is what the chunks, colliders, water bake, land cover and scatter
carry. The snapshot refreshes itself whenever `refine_province` rewrites the
refined heights (tracked by `refined-height-graded-by.json`, not by mtime:
grading's own output is always newer than its input).

**The road geometry has the same seam** (2026-09-05). A place's siting score
depends on how near a road it is, so re-routing a road would re-plot
committed records. `reroute_majors` snapshots the pre-repair corridors as
`province/routes-natural.json` (marker `routes-repaired-by.json`, same
fingerprint trick) and `ProvinceSurvey` reads that; the repaired line is what
the world carries, and `compile_minor_routes` seeds its tracks off the
published `routes.json` so a track meets the road that is really there.

**Watch the two `hydrology-pass1.npz` files.** The one `refine_province` must
be given is the one *beside* `heightfield-f32.npy`; the stale copy in
`province-refined/` produces a visibly different province (mean 1.4 m, up to
409 m in the mountains).
Texture-set changes: `build_ground_materials` first — **and check
`BMV_OVERRIDES`, which silently overrides the base table for the default
set** (Round 6 §1). App: `npm run build` in `apps/world-studio`; browser
probes from `apps/combat-sandbox`:
`WATER_SCENARIO=bay-noon-fly,river-walk,marsh-morning-walk,underwater-bay-fly
node ../world-studio/scripts/probe-water.mjs` (full 9-scenario suite takes
~20 min — the CLAUDE.md 15-minute rule says prefer the subset).
Deploy: push to main; if no Actions run appears in ~2 min,
`gh workflow run deploy-pages.yml --ref main`; verify with a curl of a
changed asset. **Shared worktree**: other agents run concurrently —
pathspec-only commits, PROGRESS.md via the staged-blob technique (see
memory `concurrent-agents-shared-worktree`), never broad `pkill`.

**Hard-won rules** (details in the round logs): no data in PNG alpha
channels, ever (canvas premultiply destroys it); never scale an oscillating
velocity by absolute time in shaders; GPU resources from `useMemo` must not
be disposed by effects with unstable deps; one physics for all water levels
(priority-flood) — no per-feature level heuristics; texture identity is
verified by contact sheet, not by slot name.

**Open items at close** — all tracked in
[docs/polish-backlog.md](../polish-backlog.md) (Phase P) except: per-body
`WaterBody` records → Phase 11; physics mass-unit scale → Phase 9 boats.

## Decisions

1. **One continuous water surface, not per-body meshes.** The compiler bakes a
   province-wide water-surface-height field `W(x,z)` (2017², RG16 PNG like the
   terrain chunks): real surface height over water (sea 0, lakes at their fill
   level, rivers at a monotone-downstream surface), and **`ground − headroom`
   everywhere dry** so the surface is continuous and simply hides under the
   terrain via depth-testing — no seams, no discards, no per-body geometry.
   The renderer draws one camera-centred multi-ring clipmap grid displaced by
   `W` + waves; sea, lakes and rivers all come out of the same draw.
2. **Per-pixel water character, class LUT.** `water-flow.png` (1345² RGBA:
   flow dir, speed, shore SDF) and `water-class.png` (class index
   coast/estuary/river/lake/marsh, turbidity, salinity, season response) drive
   per-class visual profiles (module 60 §40's table) from one material.
   Full per-body `WaterBody` records are deferred to Phase 11 (POIs will need
   them; the class layer is sufficient for rendering and gameplay now).
3. **Material = `MeshStandardMaterial` + `onBeforeCompile`** (decision 0020
   precedent), CSM-patched first, aerial-perspective chained after, cache key
   `es-water`. This buys, for free and exposure-correct: CSM sun/moon GGX
   glints with shadows, **PMREM sky reflections including moons and stars at
   night**, ACES + eye adaptation, aerial haze. Injections: vertex `W` +
   Gerstner displacement; normal override (wave + flow-advected detail
   ripples); foam as diffuse albedo; transmitted-scene term (Beer–Lambert
   through scene colour+depth); tiered SSR.
4. **Reflections: PMREM env + tiered SSR; planar reflections nowhere** (the
   research is unanimous). Sharp analytic-sky sampling deferred — the PMREM
   bake throttle from 8a is tight enough near the horizon.
5. **One scene render per frame.** Opaques (+ sky) render once into a
   half-float RT with a depth texture (tone mapping temporarily off), a
   tone-mapped fullscreen blit puts it on screen, then the water renders on
   top sampling that RT for refraction, thickness, SSR and manual
   depth-occlusion (no hardware depth copy needed). Underwater: the water
   underside (a no-scene-texture variant with Snell's window) renders *into*
   the scene RT and a post pass applies per-channel extinction fog + god rays.
6. **CPU/GPU lockstep** (8a's `skyScreenModel` pattern): one TS module owns
   the wave-parameter table and generates both shader uniforms and the CPU
   Gerstner sampler (fixed-point XZ-displacement inversion, after
   WaterThreeJS/Crest); the same module implements `WorldWaterQuery.sample`
   (contracts §38) from the baked rasters + tide/season offsets, replacing the
   flat-sea stub in `chunkWorld.ts`. Vitest envelope tests guard parity.
7. **Tide/season are world state**: spring/neap tide from the two moons' phase
   (module 55 §95) modulates `W` where class = coast/estuary via
   `flood-states.json.tidalAmplitudeM`; the wet-season `?wet=1` toggle raises
   season-responsive pixels by `seasonalAmplitudeM`. Renderer uniform and CPU
   query share the same functions.
8. **Vendored code**: Gerstner/foam/underwater GLSL and the CPU sampler
   adapted from **WaterThreeJS** (MIT); flow-map advection after three.js
   `Water2`/Valve; flow-map data contract after **SeedOcean** (MIT), data
   generated by our own `compile_water.py`. Credits in root README +
   THIRD_PARTY_NOTICES in the same change. abyssal-ocean (FFT coast) and
   jeantimex/threejs-water (hero-pool sim) held as future upgrades.
9. **Quality tiers** (one declarative table): T0 mobile — env-only
   reflections, no SSR/god rays, reduced-res scene RT, fewer wave bands;
   T1 desktop default — + SSR, god rays, full foam. Auto by device, URL
   override `?wq=`.

## Owner playtest round 1 (2026-08-26) — defects → fixes

1. **All water static** → the studio world clock is *paused by default*
   (URLs pin instants) and everything animated off it. Fix: a dedicated
   always-running **water clock** (`waterClock.ts`, ≥1× real time, capped at
   8× when time is fast-forwarded) shared by `uWaveTime` AND the CPU query
   (`WaterWorldOptions.waveTimeS`) so buoyancy still matches pixels.
2. **No sun glints/shadows on water** (part of "not alive") → three only
   applies lights whose `layers` intersect the camera's; the water-only pass
   used a bare `WATER_LAYER` mask, so the CSM sun/moon never lit it. Fix:
   the pipeline enables the water layer on every light (throttled traverse).
3. **Pale disc around the wading player** → contact foam saturated into a
   solid untextured circle. Fix: annulus rings, energy cap, always
   noise-textured foam.
4. **Vertical water sheets on mountainsides** → far triangles between
   *dry* (buried) vertices interpolated across valleys. Fix: fragment
   discard when the interpolated depth proxy is ~0 — also a fragment-cost
   win.
5. **Perf / fly-view freeze** → TWO causes. The killer: `WaterSurfaceMesh`'s
   ready-effect depended on an inline parent callback, so every HUD tick /
   fly-position update re-ran it and **disposed the live water materials —
   forcing the big water+CSM shaders to recompile continuously** (also the
   `compileAsync` "isReady of undefined" crash the sky probe caught: the
   poll raced the dispose). Fixed with a ref-held callback + disposal only
   on true identity change — the standing rule: **a `useMemo`d GPU resource
   must never be disposed by an effect with unstable deps**. Plus straight
   perf work: dropped the 4× multisampled half-float RT (samples 0; canvas
   MSAA still covers water/overlay edges), the blit now **writes scene
   depth** so buried water is z-culled in hardware, SSR capped to <1.2 km /
   18 steps, high-tier grid 384→320, vertex wave loop and fine ripple
   cascade skipped where negligible. Context-loss telemetry in the debug
   hook; probes assert the render loop keeps advancing (fly-camera scenario
   included).
6. **Markers black/blue** → display-referred (`toneMapped:false`) UI was
   being tone-mapped by the blit. Fix: `OVERLAY_LAYER` rendered in a final
   direct-to-screen pass, depth-tested against the blit-written depth.
7. **Underwater banding** → multiplicative grain before tone mapping.
8. **Water looks the same everywhere** → turbid absorption ×~2 (blackwater
   opaque in ~30 cm), albedo/roughness contrast widened, whitecap crest foam
   added; river motion returns with fix 1.
9. **Wetlands read dry** → `compile_water` adds a **marsh water table**
   (`MARSH_POOL_M` above median-smoothed ground on frequently-flooded
   wetland) — refined micro-relief picks pools vs tussocks; marsh coverage
   5.0→7.2 % of the grid.

## Owner playtest round 2 (2026-08-27) — defects → fixes

Research this round: [tropical shoreline materials](../research/world-terrain/tropical-shoreline-materials.md)
and [water edges & shore waves](../research/rendering/water-edges-and-shore-waves.md).

1. **"TV static" on distant water** → specular aliasing: unfiltered
   procedural ripple normals + low roughness at 1 px/ripple. Fix: distance
   LOD on ALL detail cascades, roughness rises with distance, foam contrast
   fades, whitecaps capped at ~2 km.
2. **White sheets/blobs over shallows ("doming", blocky patchwork)** → the
   round-1 shoreline foam fired anywhere <1.1 m deep at 55 % energy, so all
   marsh sheets rendered as foam crust. Foam is now a SYSTEM: thin contact
   line at the true waterline, swash-synced advancing lapping bands,
   exposure-gated whitecaps, rapids churn, rings — all damped by turbidity.
3. **Water in wrong places / rivers dry / pools half-filled** → placement
   rebuilt on physics: **priority-flood on the refined 2017² terrain** —
   depressions fill to their spill level, rivers get a guaranteed column
   over their carved beds (`RIVER_MIN_DEPTH_M`), low banks continue FLAT
   (flood headroom), and the buried surface is capped below the local
   minimum nearby water level (kills the vertical "sails"; standing probe
   `test_no_buried_surface_above_local_water` + `test_pools_fill_level`).
   The round-1 median-filter marsh-pool hack is gone.
4. **Same water part-marsh/part-"ocean" with whitecaps** → classes now come
   from the RENDERED wetness and wetlands trump salinity (a salt marsh is a
   marsh); wave exposure is turbidity-damped in the shared table; marsh
   albedo shifted green (owner request).
5. **Static sea edge** → analytic swash/runup (shared `SWASH` table: CPU
   query, water vertex shader and the terrain **wet-sand band** all evaluate
   the same closed form — no history buffer needed), lapping foam lines
   advance/retreat in sync, `groundWetness.ts` darkens+polishes the swash
   reach on the terrain splat.
6. **Ripples/splashes not working** → a REAL interactive ripple sim
   (`RippleSim.ts`: Evan Wallace's ping-pong wave equation via
   jeantimex/threejs-water, credited; 256² RG16F patch ~36 m, texel-snapped
   follow, edge-damped) stamped by wading steps, crates and splashes, added
   into the water normals; wade-in splash detection fixed (was falls-only).
7. **Perf round 2** → canvas dpr capped at 1.5 (retina was 4× every
   fullscreen pass), water draw distance per mode (walk 6 km, fly 30 km),
   refraction distortion gated off in shallows. (Round-1 fixes retained.)
8. **Mossy-rock sea/river/marsh beds** → `landcover.compile_ground_control`
   gains `water_level` (height-above-LOCAL-water drives all bed/shore
   grammar; absolute rules like mountain belts unchanged);
   `rebake_landcover.py` re-bakes ground-control without a full
   refine_province run. Full tropical shoreline variety (beach sand/rippled
   seabed/pebbles — CC0 candidates vetted in the research doc) is the next
   texture-ingestion step.
9. ~~Not a defect: tide pinned by the paused clock~~ — **superseded in round
   3**: the owner scrubbed time and tides genuinely didn't move. Root cause
   below.

## Round 3 (2026-08-28) — the tide bug + the integrated geography build

**The tide bug (real, found by probe):** the class/flow rasters carried data
in their PNG **alpha** channels (season, shore distance). Browser canvas
decoding premultiplies alpha, so wherever alpha≈0 the RGB was destroyed —
and season=0 is *exactly the saline cells*, so **salinity (→ tide response)
read as 0 over every tidal surface**; river flow vectors likewise corrupted
near banks. Standing rule, now probed (`test_shipped_flow_and_class_rasters_
decode` asserts mode == RGB and bay salinity survives): **no data ever rides
a PNG alpha channel.** All water rasters are RGB; season+tannin ride
`water-shore.png` G/B. Verified live: bay surface now tracks the tide
(−0.34 m ↔ +0.40 m).

**Integrated geography (owner grant: terrain edits allowed).** Research:
[tropical-fluvial-geomorphology.md](../research/world-terrain/tropical-fluvial-geomorphology.md).
New `worldgen/fluvial.py` stage in refine_province (own rng stream — the
owner-approved 6b noise lattice is bit-identical):
- **continuum channel carving**: Leopold–Maddock hydraulic geometry
  (W=14·A^0.4, D=1.4·A^0.29 at game scale) replaces the 3 fixed bands —
  creeks→streams→rivers now grade continuously; Montgomery–Buffington slope
  classes make steep reaches narrow V-gorges (×0.7 W, ×1.3 D);
- **levees + floodplain smoothing** on lowland majors (backswamps emerge
  behind the levees and flood-fill into pools);
- **~22 oxbow scars** in the meander belts (max-composited, never stacked);
- **wetland pool deepening** (dips amplified ~0.85×, channels excluded) —
  the owner's "make marsh pools deeper";
- **delta distributaries** (Galloway rule: sheltered whitewater mouths) +
  mudflat aprons, aimed at the nearest open water;
- unit-tested (`test_fluvial.py`: geometry ranges, far-field isolation,
  determinism).
**Water character**: per-pixel **tannin** (blackwater) vs **silt**
(whitewater) vs clear, mapped from region classes per the Sioli typology
(REGION_SILT/REGION_TANNIN in compile_water) — marsh/bog water is glassy
dark tea-green, big lowland rivers opaque tan, mountain streams and the bay
clear. Wave exposure damped by max(silt, tannin).
## Round 4 (2026-08-28) — Tropical Skyrim, torrents, wetter heartlands

1. **"Mossy rock" beds everywhere** → the PAINTING was right (99.97 % of
   deep water = `water_silt`); the *texture* (Project Rainforest
   riverbottom) was mossy cobbles. Owner found **Tropical Skyrim** (classic
   33017, Soolie) — downloaded to the vault (SHA256SUMS; deflate64 → use
   Info-ZIP), registered as a preferred source (module 90 §74.1a), and its
   textures replaced: water_silt/river_mud (tropical riverbed), beach_sand
   (`Beach`), river_pebbles (`Tropical/RiverGravel`), mossy_rock/moss/
   mountain_rock (tropicalised), + NEW `ocean_floor` 35
   (`CoastOceanFloor01`, rippled sand). Landcover: deep salty → ocean_floor,
   deep mountain water → pebbles, border-mountain high slot → tropical
   mountain slab (round-4 defect 3).
2. **No whitewater found** → medium+ fresh rivers now guarantee silt ≥0.58
   unless blackwater (dilated along the channel).
3. **Slope water static/blocky** → slope-driven current (v ≈ 0.4+9·√slope,
   ≤3 m/s), **cascade shading** where the surface visibly drops along flow
   (vertex samples the downstream W; aerated foam + boosted ripple normals),
   and surface-terrace smoothing where |∇W| is high — the round-4 "bulge"
   image was a pool overflow sill, now reads as a churning spillway.
4. **Channels not full / dry beds** → rivers carry ≥60 % of their carved
   column (bank−bed based), rather than a fixed 0.35 m.
5. **"Mostly water with land in"** → deep-wetland/jungle heartlands
   (regions 6/7/8/13): pools accepted from 0.14 m depth/8 px, `fluvial`
   carves a **rivulet web** (sub-river drainage lines become 3 m channels
   linking the pools), wetland dips deepen harder (POOL_DEEPEN 1.05).
6. **Interactions** → any water entry splashes (walk/jump/drop) and wading
   emits a TRAIL of expanding wake rings (the static glued ring is gone;
   rings + sim ripples persist after stopping).
7. **Perf round 3** → shadow maps every other frame, 10 wave bands,
   rtScale 0.9, foam noise 3 octaves.

## Round 5 (2026-08-28) — standing-vs-flowing, the barcode, the slope-rock rule

1. **Dark faceted sheets on gorge walls + broken blob-chains in steep
   channels** (owner image): depression-fill was happily standing water on
   steep terrain-noise dips. New physical rule: **pools only stand where
   component mean slope < 5.5 %**; steep channel CENTRELINES instead carry a
   guaranteed thin film (W ≥ ground+0.15 where slope ≥ 2 %) that renders as
   a cascade — flowing, not pooled.
2. **The walked-through "bulge" (owner was right, my round-4 diagnosis was
   wrong)**: the river ribbon's guaranteed water column could RIDGE above
   the level of a pond the river crosses. Rivers inside real depressions are
   now clamped to the pond's spill level.
3. **Square-edged pools/channels**: pools are now kept/dropped as WHOLE
   components (no more cell-wise clipping by the blocky 5.5 m allow mask);
   the river ribbon and rivulet masks are gaussian-feathered before carving.
4. **"Everything flows the same slow speed"**: the flow-field gaussian was
   diluting 1-px channels to ~30 % speed — replaced with normalised
   convolution (magnitude survives on thin lines).
5. **The "barcode" wake** (owner image): foam advection multiplied an
   oscillating drift VELOCITY by total water-clock time — at large t the
   offset swings hundreds of metres/frame. Standing rule: **never scale a
   bounded oscillation by absolute time**; drift is now a bounded wander.
   Wake rings also softened (annulus thinner, 0.6×).
6. **Mossy-rock audit (owner round 5)**: the last sources were (a) the
   STEEP-SLOPE rule painting mossy cobbles on all steep ground including
   sandy delta islands and underwater channel walls — now region-gated
   (tropical mountain slab in mountains/uplands, new Tropical Skyrim
   `dirt_cliff` 36 root-bound cliffs in lowlands, nothing below the
   waterline), (b) the rocky-cove rule firing on delta bars — now requires
   upland regions + height, (c) delta ≠ mangrove mud (mouth bars are sand).
   Deep beds refined: swamp/lake beds mud (not pebbly riverbed — that is
   rivers only), sea floor rippled sand, mountain water gravel.
7. **Wetter still** (owner: push more): wetland peat-compaction stage
   (−0.35 m broad interior lowering → pools knit into sheets), heartland
   pools from 0.10 m/6 px. Chose compaction over raising global sea level —
   the y=0 datum (0003/0005) anchors every shoreline band and the tide
   system; compaction gets the same look without a convention change.
8. **Walk-mode water draw distance 6→3 km** (owner suggestion; haze hides
   the difference), crates lighter + never sleep (player can shove them).
9. **UI truth (owner: "everything says lake & standing water")**: the map
   tooltip now reads the per-pixel WATER class (river/creek/marsh/lake/
   coast/estuary) from the 8b rasters alongside the coarse region name, and
   the walk HUD names the body you stand in. (The region raster's own
   shapes are Phase 3 output — re-classing it is a later-phase task.)

## Round 6 (2026-08-28) — the override trap, unified river physics

1. **Mossy cobbles, the REAL root at last** (owner: "don't assume previous
   agents got this right" — correct): the default `bmv-v1` texture set has a
   per-slot **override table** (`BMV_OVERRIDES`) that silently kept the
   Black Marsh & Valenwood moss-cobble files for `water_silt`, `bank_wet`
   and `mossy_rock` — undoing the round-4 Tropical Skyrim swap in the base
   table for the set actually in use. Data confirmed the painting was
   correct all along; the sightings were those two textures (beds via
   water_silt, every pond/lake waterline via bank_wet). Overrides removed;
   both sets rebuilt on TS riverbottom/riverbededge. **Standing lesson: a
   base-table change means checking every per-set override.** Also slot 36
   `dirt_cliff` → `trop_rocks` (TS rocks01) — dirtcliffsroots01 was a
   decorative cliff STRIP, not a ground tile (the owner's "stripy"
   texture; ditto the earlier peat_slope/salt_flat stripe fixes).
2. **Rivers unified under one physics** (owner: bulges persist, dry gaps,
   nothing consistently flows): the round-4/5 "guaranteed column" and
   coarse-backwater heuristics are DELETED — every inland water level now
   comes from the same priority-flood: rivers are chains of pools standing
   in their carved channels (cannot exceed banks by construction — no
   bulges), joined by an always-wet centreline film sampled against the
   ROUGH ground (no dry gaps). Fullness now comes from carving: fluvial
   depth ×1.3 (D = 1.8·A^0.29). Step-pool chains on steep channels are
   exempted from the standing-slope gate (that IS what mountain streams
   look like), gate relaxed to 7 % elsewhere.
3. **Flow that reads as flow**: foam stretches into flow-aligned streaks
   sliding downstream (anisotropic sampling), ripple advection ×7/cycle.
4. **Wetter still** (owner: push more, incl. jungle near Archon): the
   fluvial wet mask now includes the marsh/jungle heartland regions,
   compaction −0.6 m, rivulets denser (accum > 0.02) and deeper (0.7 m).
5. **Crates finally pushable**: the ecctrl capsule's Rapier mass is ~0.25
   units (default density), so real-mass crates were a 400:1 wall. Crate
   mass AND displaced volume/drag scale together (identical float
   dynamics, pushable inertia); unit-scale to revisit for Phase 9 boats.
   Landing hard in shallow water now also splashes/ripples.

## Round 7 (2026-08-28) — slope rivers, waterfalls, shore surf, barcode

Owner round-6 verdict: textures PASS (moss-cobble saga closed); slope
water still broken (empty beds / blob staircases / solid foam crust /
speed unreadable), waterfalls static, sea still not lapping, "barcode"
foam recurs. Research first (3 new docs:
[rivers-on-slopes-and-cascades](../research/world-terrain/rivers-on-slopes-and-cascades.md),
[waterfalls-realtime](../research/rendering/waterfalls-realtime.md),
[water-edges §5](../research/rendering/water-edges-and-shore-waves.md)), then:

1. **Slope rivers are a BAKE defect, not a shader defect** (research
   consensus: no shipped engine renders raw fill output on a slope — UE5
   spline Z, U4 baked sim heights, HAND/REM flood practice all use a
   smooth monotone long profile). Fixes: (a) `fluvial._condition_bed` —
   GIS "breaching": walk each channel downstream, running-min the carved
   bed, dig a V-notch through every accidental micro-dam (real waterfalls
   survive: the min only ever lowers); (b) `compile_water` bakes W along
   each channel as a **long profile** — bed + band film depth (0.30/0.55/
   0.85 m), clamped up to crossed pool spill levels, downstream
   running-min monotone, chain-smoothed, spread across the Leopold–Maddock
   width and clipped against off-channel ground; (c) the near ring (≤2 px
   of water) buries at `min(g−0.45, nearestW−0.35)` instead of the 120 m
   window minimum — the old cap put bank pixels tens of metres down on
   steep channels, so the bilinear surface plunged sub-pixel (THE "empty
   bed" mechanism); (d) the spillway smoother is now wet-masked — the old
   plain gaussian mixed `ground−3` buried values into steep films and
   punched the dry gaps that broke cascades into blob chains.
2. **Flow speed** now comes from the conditioned profile's slope over a
   ~6-station window, quantised to four reach bands (pool 0.30 / glide
   0.70 / riffle 1.30 / rapid 2.30 m/s) — banded contrast between
   adjacent reaches is what makes speed legible (Vlachos). In-shader,
   detail features stretch along the flow ∝ speed (anisotropy cue).
3. **The barcode, root-caused for good**: round 6 still advected foam by
   `flow × absolute time` in two places. A spatially-VARYING velocity ×
   large t shears neighbouring pixels apart until the noise shreds into
   parallel stripes (the round-5 rule covered oscillating velocities
   only). All foam/streak advection is now bounded dual-phase (Water2
   style), scroll distance per cycle ∝ speed. Standing rule extended:
   **no velocity of any kind is ever multiplied by absolute time in a
   shader** — uniform scroll offsets (constant spatial gradient) are the
   only exception.
4. **De-crusted cascade foam** (research Q3): foam energy capped at 0.85
   so the threshold noise always breaks it up (~65 % max coverage), foam
   is off-white albedo (0.80–0.86) + roughness 0.92 — never near-white
   (full white kills lighting shape = the crust look), cascade
   contribution 0.55 max and always streak-textured.
5. **Waterfalls, shader-only mode** (research option A): near-vertical
   spans detected per-fragment from the metric slope of the still surface
   (screen-space derivatives); those pixels switch to two down-scrolling
   multiplied noise scales (y-stretched, aeration brightening, roughness
   up). Skyrim's full fxwaterfall FX kit (45 NIFs + 14 DDS) is verified
   in the vault for a later mist/base upgrade (polish backlog).
6. **Shore surf rebuilt** (research §5). Root cause of "sea never laps":
   swash AND lapping foam were gated by `waveExposure`, whose depth term
   is ZERO exactly at the waterline — all shore effects were silently
   muted at the shore. New shared closed forms in `waves.ts` (CPU + GLSL
   twins): **fetch exposure** sampled ~30 m seaward via the shore-SDF
   gradient; **asymmetric swash** (fast uprush, slow backwash; 0.22 m ≈
   5–8 m horizontal runup) with a surf-beat **group envelope** (wave sets
   — one wave runs farther; also the anti-barcode ingredient); **shoaling
   shore swell** (fronts parallel to shore via SDF phase, Green's-law
   amplitude, collapses in the break zone); **bore foam** riding each
   arriving crest + backwash remnants, same phase family. Swash/swell are
   added BEFORE the depth proxy so the advancing tongue renders on the
   beach face instead of discarding as buried. CPU query mirrors all of
   it (buoyancy near shore matches pixels).

**Shore materials** (research: tropical-shoreline-materials Part D): three
CC0 Poly Haven textures ingested (`beach_sand` 32, `seabed_sand` 33,
`river_pebbles` 34 — ids appended, sets rebuilt at 35 materials); landcover
coast typing: mangrove mud on sheltered wetland coasts, dry beach sand above
the wet swash on exposed coasts, salt pans only on dead-flat ground, rocky
coves on steep salty, gravel bars on upland reaches. Full terrain →
chunks → water → landcover chain rebuilt; 55 worldgen tests green.
