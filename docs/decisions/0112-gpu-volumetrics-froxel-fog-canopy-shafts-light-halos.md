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
   in `scene.fogNode` together with the aerial fog (screen uv + view depth),
   so opaque, water, particles and smoke all sit inside the medium; the sky
   takes the far slice. Nothing is composited as a post pass.
3. **Scene-referred radiance, never a display colour.** Sun, sky and fixture
   radiance enter the grid in the same physical units as the lit scene, so
   exposure and ACES treat fog exactly like the ground it covers. This is the
   rule that ends the daytime "charcoal grey" particles: every unlit or
   emissive colour (smoke, motes, cards) is converted with the shared
   scene-radiance helper, never written as a raw 0–1 colour under physical
   exposure (~4e-5 at noon).
4. **Where and when (the fog field).** CPU works out, per frame and from
   epoch minutes + weather + climate rasters, the strength of each regime;
   the GPU shapes it from two terrain grids baked around the camera (near
   256 m at 2 m, far 2 km at 16 m: ground height, water surface and mask,
   basin floor = local minimum of the ground). Regimes, from the lane's
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
   is low to mid, and the medium is dense enough. The old cone-ring
   `sunShafts.ts` (gated off at most times and occluded by nothing) is deleted.
6. **Interiors** use the same grid with a per-cell profile: floor-hugging
   mist for caves and damp cells (drifting, mutating noise), a dust haze where
   window beams or lamps should show; fixture lights give the halos.
7. **Quality bands** (0108): off (WebGL backend and lowest tier; aerial fog
   alone) / low 80×45×32, 400 m / medium 128×72×48, 800 m / high 160×90×64,
   1500 m; temporal reprojection on medium and high. The band follows the
   renderer tier and steps down when the frame is over budget.
8. **Verified in the harness, not the studio**: the `volumetrics` harness
   scene renders the named cases headless on the SwiftShader WebGPU adapter
   and Sonnet judges read them against a look-list.

## Code

`packages/game-core/src/air/volumetrics/` (grid, fog field, canopy map,
nodes, scene-radiance helper); wiring in `apps/world-studio/src/sky/WorldSky.tsx`;
harness scene `apps/world-studio/src/harness/scenes/volumetrics*`.
