# Rivers on slopes & cascades — research for Phase 8b round 7

Research pass 2026-08-28. Problem (owner playtest, round 6): sloped
stream/river beds render as (a) empty beds, (b) staircases of disconnected
pond-blobs, (c) solid white foam crusts on steep reaches, (d) flow speed that
doesn't visibly vary. Goal: fully connected waterways from mountains to the
wetland/lake system, on our ONE-heightfield architecture (`W(x,z)` raster +
clipmap, decision 0025). Companion docs: [water-rendering-threejs.md](water-rendering-threejs.md),
[tropical-fluvial-geomorphology.md](tropical-fluvial-geomorphology.md).

## Q1. How shipped games build a sloped river SURFACE

**Unreal Engine 5 Water plugin** — the closest architectural cousin. A river
is a spline whose points carry Z, width, depth and velocity; the water surface
is the spline interpolated in Z (i.e. an artist-authored **monotone ramp**,
smooth by construction because it's a Bézier/spline), and the LANDSCAPE is
carved beneath it via edit-layer brushes so the bed sits slightly deeper than
the water mesh. Runtime data is a **top-down GPU "water info texture"** over
the Water Zone: per-pixel surface height, depth and flow velocity rasterised
from all bodies, then a finalize pass applies a **velocity blur**. That is
exactly our `W` + flow raster, which validates the representation — UE just
guarantees the surface is smooth/monotone at AUTHOR time instead of deriving
it from terrain. ([Water System](https://dev.epicgames.com/documentation/en-us/unreal-engine/water-system-in-unreal-engine),
[Water Body Actors](https://dev.epicgames.com/documentation/en-us/unreal-engine/water-body-actors-in-unreal-engine),
[Water meshing](https://dev.epicgames.com/documentation/en-us/unreal-engine/water-meshing-system-and-surface-rendering-in-unreal-engine),
[WaterZone API — waterInfoTexture, VelocityBlurRadius](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/WaterZone?application_version=5.1))

**Skyrim** — flat water planes + flow maps for big rivers; every visibly
*sloped* stream/rapid is a hand-placed **MoveableStatic mesh** (an animated
model of water+banks with baked scrolling UVs), and level changes are bridged
by explicit waterfall pieces. I.e. Bethesda shipped "stepped pools +
authored connectors", and the connectors are always either a sloped rapid
mesh or a waterfall — never a bare gap. ([Nexus forums: river down a slope](https://forums.nexusmods.com/topic/9104428-how-to-make-a-small-river-that-flows-down-a-slope/),
[CK wiki WaterType](https://ck.uesp.net/wiki/WaterType))

**Uncharted 4, "Rendering Rapids" (SIGGRAPH 2016, Gonzalez-Ochoa)** — offline
fluid sims baked to textures: flow direction+intensity in RG, **wave/surface
height in B** (16-bit packed into 2×8-bit); the rendered surface is that
smooth baked height field plus stacked procedural components (wave particles
advected by the flow) — again a smoothed sim-derived surface, not local
terrain + fill. ([course page + slides](https://advances.realtimerendering.com/s2016/),
[80.lv breakdown of the derived River Editor](https://80.lv/articles/river-editor-water-simulation-in-real-time),
[re-implementation notes](https://github.com/ACskyline/Wave-Particles-with-Interactive-Vortices))

**Zelda BotW** — a global under-terrain water plane raised/lowered to fill
basins (rain puddles), with a foam material layer keyed on the surface's
distance to the ground beneath — i.e. our exact "one surface, hide under
terrain" trick, foam-from-shallowness included. ([ResetEra technical analysis](https://www.resetera.com/threads/zelda-breath-of-the-wild-the-technical-analysis.8197/))

**Consensus**: nobody renders the raw output of a fill algorithm on a slope.
The surface along a channel is always a **smooth monotone downstream profile**
(spline Z, offline-sim height, or authored mesh), decoupled from local ground
noise; discrete drops exist only as deliberate waterfalls/rapids with their
own treatment. "Staircase of ponds" is avoided by construction, not patched.

## Q2. Making flow SPEED legible

- **Valve/Vlachos (SIGGRAPH 2010, Portal 2 / L4D2)**: per-pixel flow vector
  distorts normal-map UVs; two phases offset by half a cycle are cross-faded
  as each distorts too far; per-pixel noise offsets the phase to hide pulsing.
  Speed reads through **UV scroll distance per cycle** and bump strength —
  and it demonstrably reads: playtesters took 17 % fewer wrong turns when flow
  showed the path. ([slides PDF](https://cdn.akamai.steamstatic.com/apps/valve/2010/siggraph2010_vlachos_waterflow.pdf),
  [Valve wiki $flowmap params incl. `$flow_uvscrolldistance`](https://developer.valvesoftware.com/wiki/Water_(shader)),
  [Catlike Coding implementation](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/),
  [mtnphil write-up](https://mtnphil.wordpress.com/2012/08/25/water-flow-shader/))
  three.js `Water2` is this exact dual-phase chunk (already in our tree, MIT).
- What actually makes fast-vs-slow READ (synthesis across the above + UE/U4):
  1. **Contrast between adjacent reaches** — a riffle only looks fast next to
     a glassy pool. Piecewise-banded speeds (UE authors per spline point)
     beat a smooth gradient that the eye can't compare.
  2. **Feature anisotropy** — fast water has flow-elongated streaks and
     stretched foam; slow water has isotropic ripples. Stretch detail UVs
     along the flow direction proportional to speed.
  3. **Advection distance** — the same texture features must visibly travel;
     scroll distance per cycle ∝ speed (Valve's one true speed knob).
  4. **Roughness/bump strength rising with speed** (aeration proxy).

## Q3. Rapids/whitewater that isn't a solid white sheet

- **Uncharted 4**: foam/aeration is *data advected by the flow field* — foam
  amount plus two UV sets cross-faded to hide stretching (Valve's trick
  applied to foam colour), sourced from the offline sim; so foam is always
  moving, textured and spatially sparse, never a static crust.
- Standard recipe (multiple shipped/stylised sources agree): foam **coverage
  is thresholded from a mask** (steepness/obstacle distance/depth-difference)
  but its **texture is 2–3 scales of advected noise multiplied together**,
  remapped with smoothstep so coverage saturates well below 100 %; masks are
  confined to lip and base of a fall (gradient masks), not the whole reach.
  ([Cyanilux waterfall breakdown](https://www.cyanilux.com/tutorials/waterfall-shader-breakdown/),
  [Trifox rapids — world-space noise clip](https://www.trifox-game.com/splash/),
  [Swordcery waterfall devlog](https://swordcerygame.com/2019/09/07/devlog-2-the-waterfall-shader/))
- **Godot Waterways** (open source, closest to our bake): foam map baked from
  *steepness* + obstacle **distance field** (raycasts → dilate → blur) +
  noise, with a cutoff — i.e. even the mask itself is distance-field-soft
  before the shader touches it. ([repo](https://github.com/Arnklit/Waterways))
- Material notes: foam is **albedo (off-white ~0.75–0.85) + high roughness**,
  never emissive and never pure 1.0 white — full-white kills all lighting
  shape, which is precisely the "crust" look. Vorticity/turbulence-keyed
  whiteness (Houdini practice) is the offline analogue of our
  surface-drop mask. ([SideFX foam threads](https://www.sidefx.com/forum/topic/29954/))

## Q4. Baking W(x,z) along a steep channel (our actual fix)

- Real-world flood mapping does exactly "water surface as raster": **HAND /
  REM** — sample elevation *along the stream line*, interpolate a **smooth
  water-surface profile along the channel**, extend it laterally (nearest
  drainage cell), and compare to ground. The water surface over a reach is
  a smoothed along-stream profile, never local ground + constant.
  ([QGIS REM plugin — IDW along the river line](https://plugins.qgis.org/plugins/rem_plugin/),
  [Garousi-Nejad & Tarboton 2019, WRR](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2019wr024837),
  [Aristizabal 2023 — level-path extension](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2022WR032039))
  GIS pre-processing likewise **hydrologically conditions the DEM** (breach/
  burn depressions along streams) so the bed's long profile is monotone before
  any fill runs — micro-pools on the profile are treated as DEM noise, not
  water bodies.
- **Procedural Riverscapes (Peytavie et al., CGF/PG 2019)** — the academic
  version of our pipeline: river network from drainage analysis, beds carved
  by Rosgen-classified cross-section modifiers, and **water-surface elevation
  and flow derived per-reach from the carved profile** — surface follows the
  channel long profile, not the raw terrain. ([PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf))
- **Cities: Skylines** runs a live depth-averaged shallow-water sim on the
  terrain grid — a real option in general but the wrong tool for us (baked
  world, and its rivers still equilibrate to smooth monotone profiles; the
  sim is just an expensive way to compute what we can bake).
  ([CS2 map-editor water docs](https://cs2.paradoxwikis.com/Map_Creation:_Water))
- Monotone enforcement itself is a solved 1-D problem: walking downstream
  along the flow graph, `W'ᵢ = min(W'ᵢ₋₁, Wᵢ)` (downstream running minimum),
  or [isotonic regression / pool-adjacent-violators](https://en.wikipedia.org/wiki/Isotonic_regression)
  when you want least-squares-closest rather than clamp-down.

## Q5. webgl-water / WaterThreeJS on slopes — confirmed nothing

[Evan Wallace's webgl-water](https://github.com/evanw/webgl-water) (and our
jeantimex port) is a flat rectangular pool with a ping-pong wave-equation
heightfield — no flow, no slope; useful only as the local ripple layer we
already vendored. WaterThreeJS is a deep-ocean Gerstner/fbm surface with no
flow-map or slope concept (verified in [water-rendering-threejs.md](water-rendering-threejs.md) §1).
No help here beyond what's already adopted; SeedOcean's flow-map contract
(already ours) remains the right container for the new speed data.

## Recommendation for our stack

Root cause first: the staircase/gaps/crust are all **bake defects** — the
shader is being asked to decorate a surface no shipped game would emit.

**A. Bake (compile_water / fluvial) — the main work.**
1. **Condition the bed profile** (fluvial.py, at carve time): walk each
   channel centreline downstream (we have the flow graph); enforce bed
   elevation non-increasing via downstream running-min **on the carved bed**,
   re-imprinting the (feathered) channel into the terrain. This is GIS
   "breaching"; it deletes the accidental micro-ponds at the source instead
   of patching W. Preserve intentional drops: where the raw bed falls > ~2 m
   over ≤ 2 px, keep a sharp step (waterfall); otherwise ramp it.
2. **Bake W along channels from the long profile, not local ground**
   (compile_water): per centreline station, surface = bed + depth, then
   (i) clamp to pool spill levels where the channel crosses priority-flood
   pools (round-6 rule stands), (ii) enforce monotone downstream with
   running-min or PAVA over the profile, (iii) smooth with a small
   monotonicity-preserving filter (moving-min then mean, ~5–9 stations) so
   pool→reach joins are ramps. **Quantise steps**: after smoothing, any
   remaining drop between adjacent stations should be either < ~0.08 m
   (ramp — invisible) or > ~0.5 m (flagged cascade lip in the flow raster);
   mid-range steplets are what reads as "blobs". Spread each station's level
   across the channel width (REM-style nearest-station lateral extension,
   inside the feathered ribbon mask) so banks never show dry slivers.
3. **Flow-speed raster from the smoothed W profile slope**, not local terrain
   slope: v = clamp(0.4 + 9·√(surface slope along profile), …, 3) as now, but
   computed per-reach on the conditioned profile and then **quantised to ~4
   bands** (pool / glide / riffle / rapid) with hard-ish transitions at
   profile knickpoints — banded contrast is what makes speed legible (Q2.1).
   Write cascade-lip flags (from A2) into spare flow-raster bits/levels.

**B. Shader — smaller, mostly retune of existing pieces.**
4. **Speed legibility**: detail-normal UV scroll distance per Water2 cycle ∝
   speed (one knob, Valve's `$flow_uvscrolldistance`); stretch detail UVs
   along flow by `1 + k·speed` (extends round-6 streaks from foam to
   normals); roughness + bump strength rise with speed band.
5. **De-crust the cascade foam**: keep the round-4 surface-drop aeration mask
   but (i) multiply 2–3 advected noise scales and smoothstep so max coverage
   ≈ 0.65, (ii) foam albedo ≤ 0.85 with roughness ≥ 0.9, (iii) confine full
   intensity to a thin lip band + base churn ring (gradient off the
   cascade-lip flag / depth-difference at the base), letting mid-fall show
   streaked water between foam threads, (iv) advect the foam UVs dual-phase
   like the normals so the crust visibly slides.
6. **Cascade reaches** (thin-film cells): sample detail textures in
   flow-aligned UVs stretched by slope (Cyanilux recipe: two noise scales,
   different speeds, smoothstep) — reads as falling water without geometry.

Order of attack: A1+A2 fix (a)/(b) outright; A3+B4 fix (d); B5+B6 fix (c).
All bake changes live in the existing rebuild chain (decision 0025 run-book);
no new rasters needed — speed bands and lip flags fit the existing flow PNG.
