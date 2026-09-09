# Water quality contract and review guide

Decision [0045](../../decisions/0045-reversible-water-overhaul.md), September 2026. Covers the water items in [the polish backlog](../../polish-backlog.md), plus the owner's broader request. Keep backlog items open until visual acceptance; automated tests do not certify that water looks natural.

## What “first class” means here

Black Marsh needs readable, geographically distinct water at walking height, not just a convincing ocean screenshot. Standing water finds a flat level; channels remain connected and descend along actual beds; neighboring features join without domes, uphill flow, floating edges or shader changes. Physical sampling and rendering agree. Water retains useful contrast at night and under changing weather without erasing the province's regional character.

| Feature | Intended response |
| --- | --- |
| Mountain streams and steep creeks | Narrow bed-following surfaces, stronger downstream motion, localized aeration and cascade spray |
| Lowland streams and major rivers | Continuous downstream advection; breadth, slope and depth govern activity rather than a texture changing direction |
| Ponds, lakes and oxbows | Flat base level; shelter and depth attenuate wind waves, with local contact/rain disturbance |
| Bogs, blackwater and greenwater swamps | Wetland support and season response, tannin/turbidity absorption, sheltered motion; no ocean surf inland |
| Mangroves and estuaries | Sheltered tidal motion and mixed water chemistry; coast-connected surf only where exposure permits |
| Coast, beach and open sea | Depth-limited swell, shore-directed breakers/runup, open-water reflections and horizon |
| Contacts and obstacles | Radius/velocity-scaled ripples, wakes, droplets and foam; current advection, land isolation and bounded emission |
| Underwater | Continuous immersion, depth/chemistry-dependent visibility, retained surface optics and light shafts, sunlit-bed caustics |

These are a review matrix, not a claim of full fluid simulation. Geometry and semantic rasters select responses through one material. No separate hand-authored blackwater shader, global fluid solver or simulated breaking-wave volume is introduced. Local obstacle response uses actual terrain boundaries; above-bed dynamic objects emit contacts. Persistent vortices behind arbitrary future geometry require that geometry's flow/obstacle integration. Waterfall sheets use steep channel geometry with aeration, plume and plunge effects; judge their silhouette as well as their particles.

## Engineering acceptance

- The compiled W field and depth proxy are the single authority for the CPU
  query and the renderer; tide and season offsets are added identically in
  both (`waves.ts` GLSL twins). Data never rides a PNG alpha channel.
- Compiled invariants are tested against the real outputs
  (`worldgen/test_water_invariants.py`): no wet cell below its bed, no
  enclosed dry hole inside a body, monotone station chains, strips only on
  steep reaches and joined to the field at both ends, cascade lip above
  plunge. Rendering discards where the surface is buried or behind the
  scene; strips and falls own their cells through `water-owner.png`.
- Ripple boundaries block land and unrelated bodies. Contact emission depends
  on travel and time, not frame count. Particles and interaction queues have
  fixed budgets. Buoyancy balances displaced volume, density and gravity.
- Terrain caustics respect direct illumination, depth and turbidity; they
  must not glow in shadow or double on immersion.

Routine gates are `npm test` and `npm run typecheck`. The browser probes
(`apps/world-studio/scripts/probe-water.mjs`, `shot-deployed.mjs`) are
targeted shader/scene checks under SwiftShader, not hardware benchmarks.

## Owner playtest

Use the studio's normal fly and character modes. Check a mountain creek
downhill into its pool, a broad lowland river, blackwater and greenwater
wetlands, the mangrove/coast transition and an exposed beach. At each, move
across the shoreline and look along the surface at low angles. Check
daylight, moonlight and underwater looking upward. Try calm/rain/storm and
wet/dry seasons without moving the camera. Drop the crates and move through
shallow water at different speeds. Report the saved studio URL, what you
expected, and what looked wrong; one short clip of a moving defect beats many
stills. The current key sites are listed in [water-handoff.md](water-handoff.md).

## Research and implementation choices

[Three.js water research](water-rendering-threejs.md),
[shore waves/edges/wet sand/ripples](water-edges-and-shore-waves.md),
[waterfalls](waterfalls-realtime.md). GPU Gems explains
[analytic-wave steepness](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)
and [water caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics).
Dan Greenheck's Water Pro is a comparison target only, licence-incompatible and
never inspected; its techniques and our gaps against them are in
[water-pro-greenheck-study.md](water-pro-greenheck-study.md).

## Water compiler runbook

The compile is decision [0047](../../decisions/0047-water-one-physical-model.md):
one physical model on the real 4033² terrain, one channel definition shared
with the carve. Run from `tooling/world-generation`:

1. `./scripts/terrain-chain.sh --from refine_province` after any change to `worldgen/channels.py`,
   `standing_water.py` or `refine_province.py` (the skip check reruns from
   `refine_province`: it carves the trenches, writes
   `province-refined/channels-pass1.npz`, `refined-height-precarve-f32.npy`
   and `placement-at-carve.npz`; `compile_water` runs once straight after so
   the road grader sees this run's water and once more at the end on the
   graded ground that ships). Then `python3 -m worldgen.apply_sitings`.
   Always pass `--from refine_province`: the chain's first stage
   (`sculpt_province`) is NOT reproducible against the August sculpt the
   hydrology was solved on (polish backlog), and the skip check reruns it
   whenever `sculpt_province.py` or `routes.json` moved — which silently
   replaces the base (it happened on 2026-09-08; the August file was put back
   from `/tmp/vault-pristine` and a durable copy now sits beside it as
   `heightfield-sculpted-august-2026.npy` in the vault heightfield dir).
2. `python3 -m worldgen.compile_water` alone when only the compiler changed
   (~70 s unloaded, deterministic; needs `scikit-image`). It prints the
   `stats` census: `hoveringEdges` must be 0 (`cliffEdgeCells` counts the
   exempted cliff lips; `brinkEdgeCells` what the sheet corridor excuses and
   `stripEdgeCells` what the strip ribbon excuses on top of it — 31 and 1 on
   2026-09-09; if either grows, an exemption has started hiding holes),
   `boundHitReaches` and `dryCoarseRiverCells` 0,
   `dryStations` a handful, `lostStations` the coarse routes the water cannot
   follow, `forcedBasins` the hollows a river turned into a lake,
   `pooledLevelMoved/Lost` how far the flood on the shipped ground moved from
   the levels the carve assumed, `roadCellsDeepBy` / `trackCellsDeepBy` the
   road and minor-track cells under > 0.3 m of water split sea / lake / river
   (the sea count is the route solver's open-water crossings,
   `routes.COST_OPEN_WATER` — a routing matter, not a water one),
   `compileSeconds` < 180.
3. `python3 -m pytest -q worldgen/test_water.py worldgen/test_water_invariants.py`
   (< 60 s). The invariants file is the gate; each test is one owner defect:
   no wet cell with a lower dry neighbour; every standing body flat (< 2 cm)
   and under its rim; texel i == refined sample 2i+1 (signed depth matches W −
   ground on ≥ 99.9 %); strip points inside their trench (lateral check not
   at plunge points nor on > 45° segments — the reasons are in the test);
   every cascade a cliff (≥ 3 m at ≥ 45° on the shipped profile) with a ≥ 1 m
   plunge pool; every coarse river cell wet on its centreline; strip-owned
   texels wet, fall-owned texels under a cascade; join points on the field
   surface; season table band around fresh water and not around the sea; and
   the owner's sites as numbers (4570/3870 dry; 1470/4130 a flat lake ≥ 20 m
   deep; 2660/900 wet ≥ 0.8 m; 380/1440 one flat body ≥ 500 m²; 1510/5300 no
   puddle under 40 m²; 2530/320 nothing over 5 m deep outside a basin;
   1590/4250 no hovering edge).

How the carve and the compile stay one model (the rules a future change must
keep, all in `channels.py` unless named): the profile is solved ONCE, on the
pre-carve terrain, and the compile never re-solves it (a depression the carve
itself makes — a levee's backswamp, a trench pool — is a body, never a lake
that lifts the river); natural = floor + 0.15 capped at bank + 0.45 and lowest
crest-ring ground + 1.2 (`solve`; `ndimage.minimum` over an empty label reads
0, mask it — three earlier attempts sank on that); a station whose section
touches a body within 0.3 m of its natural level is pooled at the body's
level, one arriving more than 1 m under it CAPTURES it (`_backwater` clears
`pooled`, the lake drains to the trench, its bed is not protected); a lake
outlet is a weir AT the lake level across the width while the centreline
ground sits within [P − 0.05, P + 0.35) of it (`long_profile`, `carve`);
two channels whose widths touch share the lower level
(`capture_neighbours`); every station except a fall's face is trenched to
the level interpolated along the reach (`level_at_cells`, station cell
pinned) minus the band depth plus 0.6 × slope × cell on chutes, 0.3 m at a
ford; the shoulder never raises a body's bed nor cuts its collar, its crest
follows the highest channel level over the 3×3 neighbourhood (a plunge
bowl's rim included) with raise caps 2.5 m field / 4.5 m chute, weir flank
and lip; falls need ≥ 3 m at mean slope ≥ 1.2 on the floor, land at the next
station's level, get a bowl dug before the shoulder. The compile projects
every valid station (a pooled one at the level its lake now stands at),
takes the lowest overlapping level that stands above the ground, floods
sideways 8-connected up to 200 m at the local level (never from a chute),
claims the bowl cells as the plunge pool, and removes bodies that lie wholly
inside a channel width.

Outputs (`apps/world-studio/public/province/water/`, schema v2): see the
module docstring of `worldgen/compile_water.py` for the encodings. The B
channel of `water-surface.png` is SIGNED depth (`depthMinM` −6, `depthSpanM`
30.6): wet ⇔ depth > 0, table cells in (−2, 0], buried ≤ −2.5. The vault's
`water-pass1.npz` also carries `chan_full` (the channel footprint) for
diagnostics.

## Resume log (water round 2 compiler)

State 2026-09-08 (crash-recovered working tree): the source-only synthetic slice
(`pytest worldgen/test_water.py -k 'not province'`) is 13/13. The full focused
suite is 28 pass / 3 fail against generated files that predate the final graded
terrain: two real hovering cells (4,308/1,380 and 166/4,619), one standing body
0.235 m over its current rim, and only 98.3606% signed-depth registration. Those
are not waived; rebuild from `refine_province` before judging the dirty compiler.
The full chain has NOT been re-run since these fixes.

- every_coarse_river_cell_is_wet + site_2660_900 — root causes, all fixed: (a) the compile re-solved the long profile against bodies found on the *carved* terrain, which the carve's own levee had moved (lake outlets dammed by the shoulder crest, floodplains impounded) — compile now keeps the carve's L (`compile_water.compute` step 1, no `pool_channels`), replays forced hollows at the carve's pool level (`standing_water.force_depressions(at_level=)`); (b) no bankfull rule — `channels.solve` caps natural at bank + 0.45 / lowest ring ground + 1.2 (ring ground read per station from the crest annulus, `ndimage.minimum` empty labels masked — an empty label reads 0, which sank three earlier attempts); (c) shore stations (section touches a lake, centre dry) had no trench — every non-fall station is trenched now (`carve`: `active = live | plunge`); (d) the "sill" held the bed AT L in gorges far from any lake and ended too early at real rims — it is now a weir across the width while the centreline ground is within [P−0.05, P+0.35) (`long_profile` sill loop, `carve` weir); (e) two channels whose widths touch share the lower level (`channels.capture_neighbours`); (f) stations arriving > 1 m under a lake are `captured`, not pooled.
- no_body_stands_above_its_rim — bodies were 4-connected, the priority flood 8-connected: `standing_water.CONN8` everywhere, diagonal saddle pairs in the nested search.
- strip_points_sit_inside_their_trench — nearest-station levels made a staircase bed on chutes: `channels.level_at_cells` interpolates L along the reach (station cell pinned); chute notch `depth_cut` += 0.6·slope·mpp (capped at slope 1, never at a ford); plunge stations trenched; lip brink notch; test skips the lateral check at plunge points and on >45° segments (reasons in the test).
- every_cascade_is_a_cliff_with_a_plunge_pool — FALL_SLOPE 1.2; the plunge cell wins ties in `raster_fields`; bowls dug before the shoulder, upstream half-plane keeps the wall guard; a fall lands at the next station's level; junction pins run downstream-first; hanging tributaries without a terrain cliff ramp at 5 %.
- every_standing_body_is_flat / join_points — bodies wholly inside a channel width are river (`compute` step 2, relabel); join y read at the emitted rounded cell.
- roads: fords at every station whose section touches routes.json (`sol.ford`, bed ≤ 0.3 m); every body a major road crosses is capped at road + 0.3 (`_evaluate`); `placement_cells` reads `tracks` (was `ways`), boardwalks excluded, `major_roads` snapshot key. Remaining deep road cells are the sea crossings the route solver allows (`routes.COST_OPEN_WATER`), reported in `stats.roadCellsDeepBy`.
- still failing: 10 hovering cells (8 clusters), all beside torrents/brinks where the levee cap or a cliff edge binds — see the next entry.
- 2026-09-08 later: hovering edges 265 → 4 before the last round. Root causes fixed in order: plunge bowls dug after the shoulder (now before, their rim is full crest and always in the ring, upstream half-plane keeps the wall guard); the pool projected at the plunge only within the width (now the bowl cells nearest the fall, the lip and the first stations below); a fall's step landing above the next station's level (now `min(v[b], v[b+1])`); levee raise caps 1.5 m everywhere (now 2.5 field / 4.5 chute / 4.5 weir-lip, `channels.carve`); the shoulder crest read only the nearest station (now the highest level of any channel over the 3×3 neighbourhood, `in_level`); lateral flood 4-connected while the flood is 8-connected (`compile_water._neighbour_levels`); captured lakes kept a weir and a protected bed (`_backwater` clears `pooled` for a captured run; `refine_province.carve_to_profile` drops captured bodies from `body_level`); a river along a sea cliff counted as hovering (`hovering_edges` exempts a dry neighbour whose own 3×3 falls > CANYON_MAX_M under the water, counted in `stats.cliffEdgeCells`). Full worldgen suite: only the water invariant plus 6 failures owned by other agents (test_export_web_chunks gradient map, test_compile_settlement, test_macro_plot ×2, test_blueprint live dir, test_render_blueprint) — not touched here.
- Crash-recovery correction: the cliff exemption now examines the immediate
  dry neighbour, not its 3×3 minimum. The latter hid a shallow dry ledge merely
  because a canyon happened to be diagonal to it; a synthetic regression in
  `test_water.py` prevents that invariant from being weakened again.

## Resume log (waterfall fit pass)

Brief: decision 0047 addendum + `water-handoff.md` § "Then: the waterfall fit pass". Nothing here is committed; the compiler agent owns `tooling/` and `public/province`.

- Mist kit built and wired: `packages/game-core/src/water/render/WaterfallMist.ts` (one merged mesh, child of the sheet mesh): 4–8 mist cards by drop (scale 0.2–0.5 × width, pitch −10°…135°, ≤ 12 m of impact, waterline edge faded, soft depth 1.07 m, U +0.030 / V −0.017 tiles/s on a 34 s loop), 10–40 ground-mist discs (0.60 m soft depth, alpha × the foam field under them), one skirt per fall (foam over the bottom 3.5 m, faint counter-scrolling fog above; column capped 11.6 m). Textures by role (`mist-cloud`, `mist-cloud-strip`), particle counts untouched. Per-class budget (mist tris only; the sheet stack dominates): 7.5 m family 4 cards / 10 discs / 68 tris; 29 m family 5–6 / 14–19 / 78 tris; 44 m family 8 / 26 / 108; 58 m family 8 / 37–40 / 130–136. On the v2 data: 20 falls, 108 cards, 347 discs, 20 skirts, 1,710 mist tris; sheet+base+mist per fall mean 1,394 (7.5 m), 708 (29 m), 16,149 max 23,988 (58 m).
- Probe fit checks (`apps/world-studio/scripts/probe-water.mjs`): fit sites name the PLUNGE they look at in metres (`fit: [x, z]`) and resolve the nearest compiled fall — cascade ids are renumbered per compile, which is how the brief's `fall-78`/`fall-60` (v1) and a prior agent's `fall-4` (pointed at a 7 m fall 2 km from the gorge) went stale. Checks: fall body vs adjacent foam luminance ×0.6–1.6 under the layer toggles; lip and plunge joins ≤ 25 % step; submerged: falls change the frame < 3 |dRGB| while the surface still draws; frame rate WITH the falls layer ≥ 0.9 × the same page WITHOUT it (a flyover page vs the character-view river was never a like-for-like rate). One browser context per site (a hung tab used to fail every later site as "interrupted navigation"); 240 s settle for flyover pages on software GL.
- Renderer fixes the first measurements demanded (`WaterfallSheets.ts`): the sheet dissolved over its last 15 % of the fall, so 2 m up a 20 m sheet was a third opaque against dark rock while the pool foam past the foot was solid white (plunge join 42 %); now `SHEET_FOOT_DISSOLVE_M` = 0.8 m of arc. Aerated water is opaque: alpha floor = max(0.55 + 0.45·noise, 0.9·white) (`SHEET_AERATED_OPACITY`) — the body measured ×0.61 of its foam, on the band's floor. TS twin `sheetAlpha` takes `remainM` / `white` to match.
- Known, not ours: `province/settlements.json` is missing from the built studio (a concurrent settlement agent's `SettlementLayer` logs a JSON error at every site — the probe's page-error check fails until that file ships). `fall-20m-under`'s |still − ground − depth| = 0.21 m was diagnosed 2026-09-09 as the probe's own arithmetic, not compiler data — see water-handoff.md item 4 for the numbers and the probe fix to apply.
