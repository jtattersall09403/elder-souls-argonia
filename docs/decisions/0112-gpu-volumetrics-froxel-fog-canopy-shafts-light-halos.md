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
   in `scene.fogNode` together with the aerial fog, looked up by the
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
   own convention: the sun is the directional light's colour × intensity and
   the sky is the hemisphere light's colour × intensity (three treats that
   product as irradiance and its Lambert BRDF divides by π, so it is never
   multiplied by π again). The sky term is `SKY_INSCATTER` = 0.8/π per unit
   irradiance, so thick sky-lit fog settles at ~0.76 of a white floor under
   the same sky (test `skyInscatter.test.ts`).
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
   Wind-advected baked 3D noise gives the drift, soft edges and fading.
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
   - **When a cell is published**, the publisher runs
     `python3 tooling/volumetrics/interior_light.py`; `windowApertures.test.ts`
     fails while a published cell has no row or a row names a cell no longer
     published. Fixture lights give the halos in the same medium.
7. **Quality bands** (0108): off (WebGL backend and lowest tier; aerial fog
   alone) / low 80×45×32, 400 m / medium 128×72×48, 800 m / high 160×90×64,
   1500 m; temporal reprojection on medium and high. The band follows the
   renderer tier and steps down when the frame is over budget.
8. **Verified in the harness, not the studio**: the `volumetrics` harness
   scene renders the named cases headless on the SwiftShader WebGPU adapter
   and Sonnet judges read them against a look-list; the `interior-light`
   scene lights a published cell's record apertures for a door facing and a
   clock (`?sys=interior-light&cell=<id>&facing=<deg>&t=HH:MM`).

## Code

`packages/game-core/src/air/volumetrics/` (grid, fog field, canopy map,
nodes, scene-radiance helper); wiring in `apps/world-studio/src/sky/WorldSky.tsx`;
harness scenes `apps/world-studio/src/harness/scenes/volumetrics*` and
`interior-light.ts`; the window record `volumetrics/interiorLight.json` from
`tooling/volumetrics/interior_light.py`, read by `windowApertures.ts` and
`interior/interiorEnvironment.ts`.
