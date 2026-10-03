# 0112 — GPU volumetrics: one froxel medium for fog, mist, canopy shafts and light halos (WebGPU)

2026-09-30, VOLUMETRICS lane (16k walk 6). Owner, walk 6: "Add a high
performance GPU efficient volumetric froxel fog system … Deliver via the
WebGPU & Three.js Shading Language (TSL) route", plus canopy light shafts,
local light scattering around lights, and interior versions where right.
**Supersedes the 2026-09-13 cut of froxel fog** (docs/world/55-light-sky-time.md
§97) and the Phase 14/P deferral in 0062; extends 0111 (one TSL shader path)
and 0110 (WebGPU-only volumes). Keeps 0032's weather rules: fog is a pure
function of epoch minutes and place, local volumes not a camera veil, and its
colour comes from the light rig.

## Decision

1. **One participating medium, one froxel grid.** A camera-aligned grid
   (exponential depth slices) holds extinction and lit in-scatter. Two TSL
   compute passes per update: *inject + light* (density from the fog field,
   sun, sky ambient, the nearest fixture lights), then *integrate* front to
   back into in-scatter (rgb) and transmittance (a). Mist, valley fog, steam
   fog, marsh fog, canopy haze, shafts and lantern halos are all this one
   medium lit by the same lights; there is no separate shaft or halo mesh.
2. **Applied in every material's fog stage.** The integrated grid is sampled
   in `scene.fogNode` together with the aerial fog (one fog, not two: while the
   band draws, the aerial path's radiation-mist, advection-fog and cap-cloud
   terms scale by 0, `aerial.ts:aerialFogRegimeScale`; band "off" keeps them), looked up by the
   fragment's world position projected through the camera basis the grid was
   injected with (`gridUvw`), never by the render camera's screen uv: a grid
   built before the camera's own update that frame still sits on the
   geometry when the camera turns. So opaque, water, particles and smoke all sit inside the medium; the sky
   takes the far slice. Nothing is composited as a post pass.
3. **Scene-referred radiance, never a display colour.** Sun, sky and fixture
   radiance enter the grid in the same physical units as the lit scene, so
   exposure and ACES treat fog exactly like the ground it covers. This is the
   rule that ends the daytime "charcoal grey" particles: every unlit or
   emissive colour (smoke, motes, cards) is converted with the shared
   scene-radiance helper, never written as a raw 0–1 colour under physical
   exposure (~4e-5 at noon). The light feeds are irradiances in three.js's
   own convention: the sun is the directional light's colour × intensity.
   The sky is the dome's horizon as the WebGL path's anchored fog sees it:
   the light rig's `fogSkyLum` (the sky-lit share of `fogLum`, no direct sun,
   with the authored night floor) divided by `SKY_INSCATTER` = 0.8/π, so thick
   sky-lit fog settles at that radiance (tests `skyInscatter.test.ts`,
   `lightRig.test.ts`). The hemisphere light is a surface ambient (2360 lx at
   Riverwalk 10:00) and far below the horizon radiance, so it is never the
   medium's sky feed; smoke takes the same feed.
4. **Where and when (the fog field).** CPU works out, per frame and from
   epoch minutes + weather + climate rasters, the strength of each regime;
   the GPU shapes it from two terrain grids baked around the camera (near
   256 m at 2 m, far 2 km at 16 m: ground height, water surface and mask,
   ground wetness, basin floor = local minimum of the ground, and on the far
   grid the ground moisture = max(the water record's marsh class, its water
   mask), read from the frozen record, never re-derived). Radiation mist is
   weighted by moisture squared over a floor of 0.25 (`moistureWeight`), so
   it gathers over wet basins and thins on dry slopes. The sun term is the
   sun light that reaches the froxel through the medium itself
   (`sunInscatterGain`): the medium's optical depth up the sun ray (density
   at 12, 35, 90 and 200 m, midpoint rule over 255 m) splits the sun into the
   direct beam, which keeps the HG phase lobe, and the share the medium took
   out, which arrives as isotropic diffuse light (1/4π); a 150 m haze so
   reads at the horizon sky, not 3× it with the full sun in a forward lobe.
   It is also shadowed by the terrain: five probes 12–420 m up the sun ray against the
   grids' ground height (`terrainSun.ts`), and a froxel the terrain hides
   from the sun keeps 0.6 of the sky ambient while the sun is up. Regimes, from the lane's
   research (tooling/.reports/16k/walk6/vol-research-climate.md):
   radiation mist pooling in basins with a flat top (clear calm night, peak at
   sunrise, gone 1–3 h after; 10–60 m deep); steam fog wisps 0–8 m over water
   (cool dawns); marsh ground fog 0.5–3 m (dawn and dusk, wet ground); sea fog
   up estuaries (onshore wind); canopy haze under trees (humid mornings,
   30–90 min after rain) and a faint air baseline so shafts have a medium.
   The sun burns these off: mist, steam, marsh and canopy haze keep
   `1 − sunBurn × (1 − 0.15 humid)` as the sun climbs (sea fog does not); the
   mist top sinks to `1 − 0.8 sunBurn` of its depth and the burn threshold
   rises by 0.5 × sunBurn × height above the basin floor / depth, so rims and
   edges clear first. Densities: radiation mist peak 0.015 /m; marsh top
   2.5 ± 1.5 m with a 0.3× skirt over water to 6 m (2 m scale height), 0.16
   /m; sea fog 0.03 /m at a 25 m scale height (vol10 diag7).
   **Fog shape** is the fog's own noise (`fogNoise.ts`), never the shared
   volume-detail texture:

   | Part | Value | Config home |
   |---|---|---|
   | Octaves | tiles 997 / 263 / 47 / 19 m (vertical 211 / 67 / 23 / 7 m), weights .30 / .30 / .25 / .15, golden-angle rotation; fine octave fades 100–170 m (the high grid's lateral Nyquist for 2.4 m features) | `fogNoise.ts:FOG_NOISE.octaves` |
   | Domain warp | 1777 m × 50 m and 433 m × 12 m, moving at 0.7 × wind | `FOG_NOISE` warp rows |
   | Morph | two phases crossfaded (rateA 0.005, rateB × √2, fade 389 s), day-phased modulator 431 / 797 / 1531 s | `FOG_NOISE.morph` |
   | Coverage | density = max(0, n − (1 − C)) / max(C, 0.05), C eased with tau 180 s | `FOG_NOISE` coverage |
   | Drift | `FogDrift` integrates wind × rate per octave, so a wind change never jumps the pattern; offsets wrap in [0, 1) | `fogNoise.ts:FogDrift` |
   | Clock | the water transport clock (`waterTransportTimeS`), so fog and water drift together | `WorldSky.tsx` fog update |
   | Bake | shape 128³ (64³ mobile), two channel-slices per frame (~1.9 ms each, ~4 s at 60 fps) through `FogShapeBake`; the texture holds the mean until the bake finishes | `fogNoise.ts:FogShapeBake` |
5. **Canopy shafts from a canopy occlusion map.** The sun term is shadowed
   by a top-down canopy map rasterised on the CPU from the vegetation
   instances near the camera (crowns as discs with leaf-gap noise), sampled
   along the sun direction. Shafts appear where the canopy has gaps, the sun
   is low to mid, and the medium is dense enough. Over the first 40 m a
   per-pixel march in the apply stage keeps the crowns' sharpness; it reads
   the medium's extinction back from the integrated grid (`gridDensity`),
   never the fog field itself: whatever the apply stage samples is bound by
   every fogged material, and the field's terrain grids and noise volume
   pushed water and ground past WebGPU's 16 textures per stage (0111 §2).
   The apply stage's textures are the integrated grid, the canopy map and
   the climate rasters, nothing else. The old cone-ring `sunShafts.ts`
   (gated off at most times and occluded by nothing) is deleted.
6. **Interiors: one data-driven window light system** (owner walk 7: "a
   flexible reusable system … right first time"). Every published cell gets
   its light from ONE generated record, `interiorLight.json` (keyed by cell
   id), written by `tooling/volumetrics/interior_light.py` over
   `public/province/interiors/`; nothing is hand-written per cell.
   - **Apertures from the cell's own geometry** (0114): the plugin's placed
     window pieces (`window<NN>` leaves, light-ray FX statics) and the
     window-textured panes inside placed models, each with centre, outward
     normal and size. A cell with no window gets `apertures: []` and a reason,
     so it gets no shafts.
   - **Compass from the door it is entered by.** A Skyrim cell has no north.
     The cell is turned so its entrance faces the way the exterior door
     faces: offset = the door's outward `facingDeg` − (the plugin's arrival
     marker yaw + 180), the marker facing into the room
     (`cellCompassOffsetDeg`). The offset is derived at entry from the two
     fields that already hold it (the settlement door record and the cell
     bundle), never stored as a third copy (standard 18); one cell entered
     from two doors that face different ways is lit for the door used.
   - **Sun and moon from the world clock**: the ephemeris direction turned
     into the cell frame (`worldToCellDirection`), so an east window slants
     morning light and a west one evening light. The province sits at
     latitude −10° (world-time), so the noon sun stands in the north for
     most of the year: SOUTH-facing windows are the ones that never take
     direct noon sun. A pane the sun is not behind gets a dim sky fill; at
     night the highest moon at 2 % of the sun, else nothing.
   - **Dust decides how visible the shafts are.** The cell's kind is derived:
     `damp` from a cave/mine/barrow/ruin lighting template (floor mist too),
     else the use class the door claim gives the cell (`cell_use_class` over
     the cell's mined furniture mix in `exterior-interior-links.json`, the
     claim's own input; the published bundle drops markers, so it is never
     re-read for this: shrine, inn, shop, smithy, barracks, dwelling, storage). Kind → band: dwelling and
     shop low; inn, barracks, shrine (incense) and damp medium; storage,
     smithy, workshop high. A humid Argonian mud hut (a room built of the
     modder's mud-hut pieces, five or more) is one band lower. Bands are froxel dust densities
     (`DUST_DENSITY`: 0.005 / 0.01 / 0.02 per m). `DUST_OVERRIDES` in the
     generator takes a cell whose derived band is wrong, with a reason.
   - **Record schema 2** per cell: `kind` + `kindWhy`, `volumeClass` and
     `boundsM` (the AABB of the placed parts), `humid` (the mined link's
     Argonian hut family), and `floorMist` `{topM, density}` or null from
     `FLOOR_MIST` by damp/humid × size. Floor mist is ×1.6 at sunrise and
     ×0.8–1.2 from dry to wet season (`interiorEnvironment.ts:floorMistGain`);
     the mobile band draws none (`INTERIOR_VOLUME_TIERS`).
   - **Window beams are cones** (`froxelGrid.ts:beamMask`, radius = aperture
     + distance × tan(`BEAM_SPREAD_RAD` 0.052)), lit in the beam's colour over
     the room's own dust; the beam adds no extinction. Beam colour is the
     outside sun or moon colour, scaled by how direct the outside light is
     (`InteriorDoors.tsx`, sky fill `SKY_FILL_SCALE`). Dust motes are additive
     inside the same cone.
   - **When a cell is published**, the publisher runs
     `python3 tooling/volumetrics/interior_light.py`; `windowApertures.test.ts`
     fails while a published cell has no row or a row names a cell no longer
     published. Fixture lights give the halos in the same medium.
   - **Ambient axis rule.** Skyrim XCLL/DALC directional-ambient colours name
     the direction the light travels, so up-facing floors take Z-, ceilings
     Z+, and X and Y follow by symmetry (`export_interior_bundle.py:ambient_cube`:
     px from xn, nx from xp, py from zn, ny from zp, pz from yp, nz from yn).
     Measured in Skyrim.esm: 71 daytime weathers have Z+/Z- median 0.51 (Z+
     above Z- in none); 573 interior cells with a full XCLL have median 0.30.
   - **Ambient share and lift.** A windowless cell keeps its full record
     ambient and directional at every hour (`interiorAmbientShare`); a
     windowed cell keeps the 0.15 night floor. An ambient-cube cell whose
     walked floor nodes fail the 30 % dark-floor bar is lifted to the least
     `ambient.intensity` (cube shape kept) that meets it (rule
     `ambient-cube-lifted`, `interior_light.py:lift_to_bar`). Shipped lifts:
     MugsumpHollowInt01 1.921, CIPHTBMHutInterior01/04 4.922,
     CIPHTBMHutInteriorGreatHouse 6.342, the other cells 1. Damp-cell floor
     mist is 0.045 / 0.05 / 0.055 per m (`FLOOR_MIST`), so a 10 m low ray at
     the wettest gain keeps at least half its light.
   - **Light rig.** When a plugin aperture faces the sun, the cell's record
     directional is aimed along the cell-frame sun (`InteriorDaylight.setSun`,
     called each frame from `InteriorDoors.tsx`) with the sky's sun colour and
     intensity `sunIntensity × exposureTarget × share × CELL_SUN_GAIN` (6:
     the floor patch at ≥ 5× the ambient-lit floor beside it; the gain's
     derivation is at the constant). The cell sun's elevation is clamped to
     45° (`clampCellSunElevation`, bearing kept); the light, the occluder and
     the apertures' sun-facing test all use the clamped ray. One 1024 shadow
     map covers the cell bounds; casters are chosen by measured size (a part
     under 2.5 m casts, panes never), `normalBias` 0.02. The cell's sun
     occluder (`cellSunOccluder.ts`) cuts its holes where the sun ray crosses
     each aperture and rebuilds them when the sun turns more than 1°.
   - **Deep link.** A studio `?interior=` link fetches the cell on mount and
     opens it as soon as its bundle is resident, at the cell's own arrival
     record; no exterior layers mount until the exit press
     (`InteriorDoors` `onExteriorNeededChange`), and the exit holds at black
     until the ground at the return point is loaded.
   - **Captures.** Every GPU-lane view is captured with `w=clear` unless it
     tests weather, at `rate=0.5`. The light count and `castShadow` are fixed per cell,
     so a light change recompiles no material. Pane lights sit 0.3 m inside
     the wall (`PANE_LIGHT_INSET_M`). Record lights within 1.5 m of a fire
     flicker with it (`interiorFires.ts:CellLightFlicker`, driven by
     `InteriorDaylight.updateFlicker`).
   - **Interior air.** The fog's sky irradiance is the cell's ambient cube
     (`cellAmbientIrradiance`, mean of the six faces × ambient intensity ×
     interior ambient share), so the medium in-scatters ambient light and
     does not only absorb. The beam unit comes from the record lamps over the
     floor they light (`interiorCellLights`, `lampsOverFloors`). Beam dust
     floor `BEAM_DUST_PER_M` 0.04 per m. The cone edge is a smoothstep over
     max(one froxel cell, 0.04 m per m along the beam) with an `exp(-0.04 d)`
     length fade (`BEAM_PENUMBRA_PER_M`). The sky feed eases over 1 s
     (`SKY_EASE_S`). Interior halo density is 0.012 per m
     (`INTERIOR_HALO_DAMP` 0.6 × the 0.02 clear-air clamp), because interiors
     pass no fog regimes.
7. **Quality bands** (0108). WebGPU only: the WebGL backend is off (aerial
   fog alone). The renderer tier (`?q=` / `?quality=`, mobile on a touch
   device; `volumetricTier`) sets the starting band and its ceiling (mobile
   and low start at low); `?vol=off|low|medium|high` overrides. The governor
   steps down when the 2 s median frame is over 20 ms, up (never past the
   ceiling) after 8 s under 12 ms, and holds 8 s between changes. Mote and
   shaft steps are uniforms, so a band change recompiles no material.
   Home: `bandGovernor.ts:VOLUMETRIC_BANDS`.

   | Row | Grid, reach | Temporal | Fog octaves / warps / shape | Noise fetches per froxel | Motes / shafts steps | Fire tier |
   |---|---|---|---|---|---|---|
   | mobile | 64×36×24, 300 m | no | 2 / 1 / 64³ | 3 | 0 / 4 | mobile |
   | low | 80×45×32, 400 m | no | 2 / 1 / 128³ | 3 | 12 / 6 | low |
   | medium | 128×72×48, 800 m | yes | 3 / 1 / 128³ | 4 | 20 / 10 | medium |
   | high | 160×90×64, 1500 m | yes | 4 / 2 / 128³ | 6 | 28 / 12 | high |

   Noise fetches = octaves + warps (estimate from the kernel shape; terrain
   and canopy lookups come on top). Texture memory: the four froxel grids are
   always allocated at the high size, rgba16f, 4 × 160×90×64 × 8 B = 28 MiB
   on every row; the fog shape + 32³ warp add 8.1 MiB at 128³, 1.1 MiB at
   64³ (`FOG_NOISE.textureBytes`).
8. **Fire volumes** (0110): one stable-fluids solver per preset
   (`volumeFire.ts:VolumeFireField`), fixed step 1/simHz, catch-up cap 3,
   60 prewarm steps; passes per step advect velocity (buoyancy, age-keyed
   curl, wind), divergence, Jacobi, project, advect dye (smoke life 2 s).
   Fires of a preset share one field; the nearest fires within 8 m
   (`FIRE_VOLUME_PRIVATE_M`) get a private one. Config home
   `fireTypes.ts:FIRE_VOLUME_TIER_CONFIG` and the presets' volume rows
   (schema 4).

   | Tier | Sim Hz | Jacobi | Private fields | Curl | Notes |
   |---|---|---|---|---|---|
   | high | 60 | 4 | 2 | 64³ (2 MiB) | |
   | medium | 60 | 4 | 1 | 64³ | |
   | low | 60 | 4 | 0 | 64³ | volumes only within 6 m |
   | mobile | 30 | 2 | 0 | 32³ (0.25 MiB) | torches are cards |

   Field memory (7 rgba16f grids, 56 B/cell): torches 16×32×16 0.44 MiB,
   brazier 20×40×20 0.85 MiB, hearth and campfire 24×48×24 1.48 MiB.
   GPU time, estimate (not yet measured on a GPU): 4 + Jacobi compute passes
   per field per step, so at high with five presets near and two private
   fields, ~7 fields × 8 passes over ≤27.6 k cells each; the march costs
   steps × 2 samples per pixel. The round-2 GPU measurement replaces these
   estimates.

   Fire volume meshes draw on layer 8 (`FIRE_VOLUME_LAYER`) only and march in
   `FireVolumePass` (`render/post/FireVolumePass.ts`) into a half-resolution
   target (mobile 0.25, `FIRE_VOLUME_SCALE`) with its own depth. The
   composite is a 4-tap bilinear upsample weighted by view-Z depth
   (1/(1+rel/0.04)), premultiplied over the canvas with the renderer's tone
   mapping; the pass is skipped on WebGL. The colour ramp cools to red tips
   (`VOLUME_RAMP_EDGES`, `VOLUME_TIP_COOLING` 0.6), the smoke plume rises
   above the flame envelope (`flameShare`), and the hearth box is 2.4 flame
   heights for a ~2.8:1 flame on its bed (`fireTypes.ts`, `volumeFire.ts`).
9. **Sea fog, region haze, cap cloud and lamp halos** (walk 10, G2). Each
   system reads a raster or the light rig, never a per-scene flag.

   | System | Rule | Config home |
   |---|---|---|
   | Onshore sea fog | `OnshoreProbe` reads the gradient of climate-weather B over 3 px; onshore = wind travel direction dot −gradient; cached per cell, 64 m (128 m mobile) | `climateSampler.ts:OnshoreProbe`, `ONSHORE`; fed as `fog.onshore` in `WorldSky.tsx` |
   | Region haze | the fog field's air term is scaled by `clamp(regionHaze / 0.65, 0.4, 2.5)`; rain keeps 35 % of ground mists (`RAIN_MIST_KEEP`); in rain-state wind mist and marsh fog take max(calm, 0.5 × rain), and rain adds wet haze 4 × rain × 0.7e-4 /m at a 40 m scale height above the ground (`WET_HAZE_SCALE_M`) | `fogField.ts` input `regionHaze`, `RAIN_MIST_KEEP` |
   | Cap cloud | band on: the froxel medium owns it: fogField `capCloud` = synoptic cloud × humidity; density = smoothstep(centre − 2σ↓, centre, ground) × belt bell on height (`WHITEOUT_BELT` × vertical scale, passed as `capBelt`) × burn(shape, capCloud) × 0.02 /m, no extra noise taps; the aerial whiteout weight is 0. Band off: whiteout = bell × `mist.whiteoutBase` × belt mask (`esBeltMask`, 4 rotated taps + smoothstep 0.05–0.85; the dome march 1 tap) | `froxelGrid.ts` density `cap`, `fogField.ts:capCloud`; `aerial.ts:esBeltMask`, `express.ts` whiteout |
   | Region fog profile | the region class under the camera (`hydro-regions.png`, nearest texel, row 0 = world z 0) picks its row of the climate home table; its `fog` multipliers scale the air baseline and ground fogs (`densityScale`), the radiation-mist scale height (`heightScale`, which reaches the TSL mist height profile through the `mistHeightScale` uniform), the clear-night mist (`radiationMist`), the onshore sea fog (`seaFog`), the sun's burn-off (`burnOffScale`) and add to humidity (`humidityBias`); neutral until the map decodes. The integrity gate (`packages/world-schema/integrity.py:climate_region_errors`) holds one row per painted class; the runtime path is `RegionFogProbe` → `WorldSky` → fogField `profile` | `world/sources/climate/climate-regions.json` (schemaVersion 1, one row per painted class; read by `worldgen/regions.py`, published as hydrology-meta `climateProfiles[name].fog` by `regions.publish_climate_profiles`); `climateSampler.ts:RegionFogProbe`; `fogField.ts` input `profile` |
   | Lamp halos | fog output `halo` = max(smoothstep(.55, .95, humid), mists, sea fog, rain, 0.4 on a night with humidity > 0.5 (`NIGHT_HALO_FLOOR`)) (`FogRegimes.halo`, dampness); σ = max(grid, floor × halo); radius R = max(3 light radii, minReach); full halo out to max(2 radii, viewM) | `volumetricNodes.ts:LAMP_HALO` |

   `LAMP_HALO`: high floor 0.05 /m, minReach 6 m, viewM 60; mobile 0.02 /m,
   4 m, 20 m.
10. **Verified in the harness, not the studio**: the `volumetrics` harness
   scene renders the named cases headless on the SwiftShader WebGPU adapter
   and Sonnet judges read them against a look-list; the `interior-light`
   scene lights a published cell's record apertures for a door facing and a
   clock (`?sys=interior-light&cell=<id>&facing=<deg>&t=HH:MM`).

## Code

`packages/game-core/src/air/volumetrics/` (grid, fog field, fog noise,
band governor, canopy map, nodes, scene-radiance helper); fire volumes in
`packages/game-core/src/fx/fire/` (`volumeFire.ts`, `FlameSystem.ts`, `interiorFires.ts`); the fire march in `packages/game-core/src/render/post/FireVolumePass.ts`; interior lights in `packages/game-core/src/interior/interiorLoader.ts`; wiring in `apps/world-studio/src/sky/WorldSky.tsx`;
harness scenes `apps/world-studio/src/harness/scenes/volumetrics*` and
`interior-light.ts`; the window record `volumetrics/interiorLight.json` from
`tooling/volumetrics/interior_light.py`, read by `windowApertures.ts` and
`interior/interiorEnvironment.ts`.
