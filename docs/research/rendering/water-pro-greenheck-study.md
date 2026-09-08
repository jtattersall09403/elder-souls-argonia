# Three.js Water Pro (Dan Greenheck) — technique study and gap analysis

Research pass 2026-09-08. The owner points at Dan Greenheck's Water Pro demos as
the visual bar. This doc reconstructs **how it is built** from public material
(docs site, changelog, product page, press), decomposes **why it looks good**,
and turns that into a ranked, implementable list for *our* renderer
(`packages/game-core/src/water/render/waterMaterial.ts`, WebGL2,
`MeshPhysicalMaterial` + `onBeforeCompile`).

Extends, does not repeat: [water-rendering-threejs.md](water-rendering-threejs.md)
(the four reference repos, our chosen shape), [water-edges-and-shore-waves.md](water-edges-and-shore-waves.md)
(shore, wet sand, ripple sim), [waterfalls-realtime.md](waterfalls-realtime.md).
Our current model is decision [0047](../../decisions/0047-water-one-physical-model.md).

## 0. Method, and what could not be verified

**Verified by direct fetch** (2026-09-08): the whole documentation site
`docs.threejswaterpro.com` (changelog, every API page, the guides), the licence,
the live demo shell at `www.threejswaterpro.com` and its asset manifest, plus
press coverage.

**Not accessible from this VM**, and therefore *not* claimed anywhere below:

- **YouTube transcripts.** `yt-dlp` (installed), Piped and Invidious mirrors and
  three transcript services all failed from this IP ("Sign in to confirm you're
  not a bot" / Cloudflare 403). The relevant videos are
  [Three.js Water Pro — Realistic WebGPU Water Simulation](https://www.youtube.com/watch?v=L7K_bfI9iZc)
  (37 min, the only long-form technical piece) and
  [Introducing Three.js Water Pro V3](https://www.youtube.com/watch?v=oRx606IbIGo).
  A machine with a normal residential IP (or the owner) could pull these.
- **X/Twitter** post text (`x.com/dangreenheck/status/2060727904254718369`) —
  402 to our fetcher; its feature list is quoted second-hand via search results
  and matches the changelog, so nothing is lost.
- **Source code.** Deliberately not inspected: it is not published, and the
  licence forbids possession without purchase (§2.4, §3.2). The shipped demo
  bundle is minified with mangled identifiers — no uniform or technique names
  survive in it, so "read the shader from the bundle" yielded nothing beyond the
  asset list. **Everything below is from prose documentation.**
- **He has no free water tutorial.** A full listing of his channel (46 videos)
  and of his 43 public GitHub repos shows procedural trees, mesh fracture,
  Minecraft/SimCity clones, planets, a galaxy and a black hole — **no water
  repo, no water tutorial**. Search results that claim "his free water shader
  tutorial" are conflating him with other authors; treat that claim as false.

**Licence, for the record:** Commercial Software License v2.2, DRG Software
Solutions LLC ([licence](https://docs.threejswaterpro.com/license.html)).
Source files may not be published in any public repository or open-source
project (§3.2.1, §3.2.2). Our repo is public and deploys from it, so Water Pro
is **unusable for us at any price** — this is a technique study only.

## 1. What it is, version by version, and how each feature works

Sources: [changelog](https://docs.threejswaterpro.com/changelog.html),
[docs home](https://docs.threejswaterpro.com/), the API pages linked per row,
[product page](https://threejsroadmap.com/assets/threejs-water-pro).

### 1.1 Architecture

A **WebGPU-first ocean system written in TSL** (three r181+), with a WebGL
fallback for most of it. It is a *system*, not a material: it owns the geometry,
the sun, the sky provider, the scene fog node, a post-processing node, the
ocean floor, buoyancy, wakes, spray, rain and the render passes for scene colour
and depth. `WaterSystem.create(renderer, scene, camera, quality, options)` is
the only entry point.

- **Geometry**: a **clipmap with LOD rings** centred on the camera, rebuildable
  (`rebuildGeometry({ levels, baseSize })`), plus an "infinity ring" to the
  horizon; mesh segments per LOD are owned by the quality tier (16 → 128).
- **Scene copy**: one scene colour + depth capture (`SceneCapturePass`,
  `SceneDepthSampler`) at a tier-dependent resolution (**1/4×, 1/2×, 1×**) feeds
  refraction and SSR. Same one-render-of-the-scene discipline we use.
- **Quality tiers** (low/medium/high/ultra/max) gate features rather than only
  scaling them: screen refraction, "domain-warp foam" and SSR are **high+**;
  spray is allocated only at high+; wakes are off at low.
  ([quality levels](https://docs.threejswaterpro.com/guide/quality-levels.html))

### 1.2 Displacement — FFT, not Gerstner (since v3.3)

[waves API](https://docs.threejswaterpro.com/api/waves.html),
[wave tuning](https://docs.threejswaterpro.com/guide/wave-tuning.html)

- **JONSWAP spectrum** (Hasselmann et al. 1973) driving a GPU FFT in **three
  cascades** — *swell*, *waves*, *ripples* — each covering a wavelength band.
- **Physically calibrated in real units.** `windSpeed` in m/s (3–5 calm, 15–25
  storm), `peakWavelength` in metres (default **70 m**, "calm" recipes go to
  95–200 m), heights in metres, waves travelling at their **physical phase
  speed**. `amplitude` and `animationSpeed` are artistic multipliers whose
  physical value is 1. Crucially, **size and energy are independent axes**:
  peak wavelength picks the wave size, wind speed picks the steepness/energy at
  that size.
- **Directional spread** is the frequency-dependent Hasselmann (1980) model:
  energy is narrow near the wind direction at the peak frequency and naturally
  broadens at higher frequencies, "so ripples appear nearly omnidirectional
  while the dominant sea tracks the wind". `spectralSharpness` scales it with
  energy-preserving normalisation.
- **Cascade tiling**: one number, `maxScale` (default **1024 m**), is the swell
  tile; finer cascades derive their tile size from it and the resolutions before
  them so bands abut with no gap or overlap. Finest resolved wavelength ranges
  from ~12 m (low) to ~1.3 cm (max). Tiling repetition is pushed away by raising
  `maxScale`, not by adding noise.
- **`choppiness`** is the horizontal displacement multiplier (0.5 smooth, 1.0
  natural, 1.5+ choppy) — the standard FFT horizontal-displacement term.
- **`standingWaveRatio`** blends travelling (0) → standing (1) waves; 0.3–0.5 is
  the documented recipe for **harbours, lakes and sheltered water** (waves bob
  in place rather than sweep). Wind bias only applies to the travelling part.
- **Determinism** (v3.0): fixed-step accumulator (`stepSize` 1/60), a `seed` for
  the spectrum, `syncToTick(n)` in O(1). Time is folded **modulo 8192 s** and
  component frequencies snapped to multiples of 2π/8192 so the field loops
  seamlessly and float32 phase precision stays sub-millisecond — a neat trick
  worth stealing for any long-running world clock.
- **V2 and earlier** were Gerstner-based (v2.0 "introduced Gerstner waves for
  swell modelling"); v3.3 **removed the Gerstner layer entirely** in favour of
  the calibrated spectrum. The **WebGL fallback** is noise/Gerstner-based
  (press: "when WebGPU is unavailable the system switches to noise-based waves,
  and all material features, Gerstner waves and buoyancy keep working without
  compute shaders" — [80.lv](https://80.lv/articles/major-update-released-for-this-three-js-ocean-rendering-system)).

### 1.3 Foam — three layers, one of them stateful

[foam API](https://docs.threejswaterpro.com/api/foam.html)

| Layer | What it is | How |
|---|---|---|
| `foam.surface` | ambient, non-changing foam over the whole surface | tileable foam texture, `size` in world metres, coverage/opacity |
| `foam.waves` | whitecaps that "gather on the forward edges of waves, collect on the crests, and fall off the back" | **persistent energy field** (below) + foam texture, `windStretch` stretches the texture along wind for streaky whitecaps |
| `foam.shoreline` | shore + water-object contact foam | **depth-based**: `range` is "water depth in metres over which foam fades from shore" (2 m default) |

The v3 headline is **persistent crest foam**: a **camera-anchored history field**
(ping-pong buffers; 256/512/1024/2048 texels per side by tier, *not* runtime
tunable; world-fixed and following the camera since v3.1) storing foam *energy*.
Two injection terms and one decay:

- `crestStrength` (2.5) — "equilibrium energy at a sustained sharp fold"
  (i.e. injection is driven by a fold/steepness measure — the Jacobian of the
  displacement, the standard FFT whitecap criterion);
- `windwardStrength` (1.5) — "equilibrium energy on a fully wind-facing pixel",
  which "drives foam onto the rising face; persistence carries it past the
  crest";
- `decayTime` (0.5 s) — exponential e-folding, so foam lingers and rolls off the
  back of a breaking wave instead of appearing and vanishing with the fold.

The docs are explicit that the energy is then pushed **through a dissolve mask**
("crestStrength should exceed 1.0 to push fresh-crest foam to solid white
through the dissolve mask") — i.e. energy thresholds a foam *texture*, exactly
the shape our `esFThr`/`esFTex` uses, but with history in front of it. Foam
buffers are ping-ponged history and "converge over a second or two" after a
determinism snap.

Four tileable foam JPGs ship with the library (`foam1`…`foam4`), switchable per
layer at runtime; users may substitute their own `THREE.Texture`.

### 1.4 Wakes — a dispersive iWave field

[wake API](https://docs.threejswaterpro.com/api/wake.html),
[wake guide](https://docs.threejswaterpro.com/guide/wake.html)

- One **field-global** simulation: a camera-centred grid, `worldSize` **700 m**
  per side, resolution 256/512/1024 by tier, described in the WaterSystem
  property table as a "**dispersive iWave displacement field**" — i.e. Tessendorf's
  iWave convolution kernel, which reproduces **deep-water dispersion** and hence
  the "characteristic feathered, **Kelvin-shaped** wake", rather than the plain
  wave-equation ping-pong (Evan Wallace / jeantimex) we use, which is
  non-dispersive.
- Generators are registered scene objects; the system derives motion itself
  ("you do not need to supply velocities"). Each stamps a disturbance **along
  the path travelled since the previous frame** (swept footprint, not a point),
  with `radius` (width) and `depth` (amplitude, "the only control of wake
  amplitude, independent of hull speed"). A bow and a stern generator superpose
  into a bow wave plus stern trail. `teleportThreshold` suppresses injection on
  a position jump. Up to 16 injections a frame; `friction` damps velocity.
- **Wake foam** is deposited where the wake field's own steepness `|∇h|` exceeds
  `foamBreakThreshold`, with its own persistence (0.99/frame) — and is then
  shaded through the *same* crest-foam pipeline as wind foam, so a boat trail
  and a whitecap are one look. Ported to WebGL in v2.1.1 via a render-to-texture
  fallback.
- Calm wakes **pause automatically** (v3.5.0) — zero cost when nothing moves.

### 1.5 Spray — probe-triggered billboard plumes

[spray API](https://docs.threejswaterpro.com/api/spray.html),
[spray guide](https://docs.threejswaterpro.com/guide/spray.html)

WebGPU only. **Emitters** (≤16, one per object) own **probes** (≤32, points in
object-local space). Each frame every probe is tracked against the *displaced*
water surface; the moment it crosses from above, the system measures **impact
speed = the rate at which probe and surface converge vertically**, and fires a
plume if it exceeds `velocityThreshold` (3.9 m/s default). The trigger is
symmetric: a bow falling onto still water and a wave rising onto a stationary
piling produce the same impact speed and the same plume — one mechanism covers
boats, falling crates, and **waves breaking on rocks and piers**.

Plumes are stretched billboards (`stretchX` 1.88, base `size` 27.5 m, anchored
`submersionDepth` 0.5 m below the displaced surface) with bottom-fade so the
sprite never shows a cut edge at the waterline, a lifetime with a fade-out tail,
a respawn cooldown and optional spawn jitter, and optional per-particle
scale/height as a function of impact speed. The demo ships **eight splash
sprites** (`splash1…8.jpg`).

### 1.6 Rain — streaks plus *analytic* ripples

[rain API](https://docs.threejswaterpro.com/api/rain.html)

- **Streaks**: world-space instanced billboard quads oriented along the fall
  direction, auto-tilted by wind direction and speed, over a 60 m domain with a
  40 m fade; `intensity` maps to active instance count.
- **Ripples**: "world space is tiled into cells, and each cell spawns a raindrop
  on a time cycle. The effect is computed **analytically in the fragment
  shader** and uses **no buffers or compute dispatches**." Controls are cell
  `size` (0.1–1 m), `density`, `decay` (temporal and spatial), normal-perturbation
  `strength`, and a `fadeEnd` distance (100 m). This is the cheap, correct way
  to get *discrete expanding drop rings* everywhere, instead of a shimmer.

### 1.7 Water colour — physical (spectral) or artist mode

[colour API](https://docs.threejswaterpro.com/api/color.html)

- **Physical mode** (v3.4): colour derived from three relative constituents —
  **algae** (phytoplankton, raises green), **silt** (suspended mineral,
  broad backscatter/turbidity), **stain** (coloured dissolved organic matter,
  absorbs blue, browns the water). Ten **Jerlov** presets seed them (Oceanic
  I → Coastal 9C). A "physical water transmittance LUT" is carried as a uniform
  buffer (v3.5.1). The same model drives surface colour, underwater attenuation
  *and* wave-crest transmission — one constituent set, three appearances.
- **Custom mode**: intrinsic `waterColor`, per-channel Beer–Lambert
  `absorptionColor`, and a `transmissionColor` for crest scatter.
- **Fresnel**: full dielectric Fresnel (PBR book §9.5.1) with a single
  `iorRatio` (1.33). The *same* curve drives above-water reflection/refraction
  mixing and below-water Snell's window + total internal reflection —
  v3 deliberately removed the separate "fresnel power" so both sides of the
  surface cannot disagree. `refractionStrength` (0.1) is the screen-space UV
  offset, used for both the seabed wobble from above and the Snell warp below.

### 1.8 The rest of the look

| Feature | How (per docs) |
|---|---|
| **SSS** ([api](https://docs.threejswaterpro.com/api/sss.html)) | "light passing through wave crests when viewed against the sun", `intensity` + `power` falloff exponent; tint from `transmissionColor` or from the physical constituents. On at **every** quality level. |
| **Sparkle** ([api](https://docs.threejswaterpro.com/api/sparkle.html)) | dedicated sun-glint: view-dependent specular scaled by the surface normal, `power` 512 (spot size), with an explicit **distance window** (`minDistance` 10 m → `fadeDistance` 500 m). A separate term from the material's specular, precisely so distant glints can be controlled. |
| **SSR** ([api](https://docs.threejswaterpro.com/api/ssr.html)) | screen-space march, blended against the **sky reflection** by `strength`; `thickness` is a depth-ratio rejection for false hits; `maxDistance`/`stepCount` owned by the tier; auto-disabled underwater. High+ only. |
| **Sky / IBL** ([custom sky](https://docs.threejswaterpro.com/guide/custom-sky.html)) | v3 **deleted the procedural sky stack** (Rayleigh/gradient/cubemap) and replaced it with one `Sky` class sampling an **equirectangular HDRI** (UltraHDR/RGBE/EXR) plus an optional movable sun-disc overlay. Ambient fill is *only* `scene.environment` from that sky, scaled by `environment.intensity`; the hemisphere light was removed. |
| **Atmospheric fog** ([api](https://docs.threejswaterpro.com/api/fog.html)) | assigned to `scene.fogNode`, evaluated per material after lighting so it composes with every transparency type. Near fog is `color`; over `skyBlendDistance` (1500 m) the fog colour **blends into the sampled sky colour "so that the horizon has no visible seam"**. Additive materials fade instead of tinting. |
| **Underwater** ([api](https://docs.threejswaterpro.com/api/underwater.html)) | post pass: per-channel Beer–Lambert fog **reading the same colour model as the surface** ("so surface transmission and underwater attenuation stay continuous across the waterline"), plus a noise UV distortion (intensity 0.02, scale 3, speed 0.5), a whole-view tint grade, ambient sediment/plankton particles with near/far fade, and screen-space **sun shafts** that fade as the sun nears the horizon and vanish when it is behind the camera. |
| **Caustics** ([ocean floor api](https://docs.threejswaterpro.com/api/ocean-floor.html)) | a pre-generated **seamless Voronoi texture** sampled at several UV offsets/scales/scroll speeds; **two independently scrolling layers combined with `min()`** for interference; **wave-simulation normals distort the UVs** so the pattern swims with the waves; `depthAttenuation`; and (v3) **occluded by the sun's shadow map** — "boats, fish and terrain block the caustics pattern in their shadow". |
| **Waterline / meniscus** ([api](https://docs.threejswaterpro.com/api/waterline.html)) | at the camera near-clip crossing: tilt the surface normal toward the camera (`normalStrength`), add a rim highlight (`strength`, `sharpness`), over a `thickness` half-width in metres with a `smoothness` fade. This is the half-in-half-out shot. |
| **Masking** ([guide](https://docs.threejswaterpro.com/guide/water-masking.html)) | simplified invisible mask meshes rendered with an override material to a screen-space texture; water fragments discard inside them — how you get a dry boat interior/hold. |
| **Buoyancy** ([api](https://docs.threejswaterpro.com/api/buoyancy.html)) | GPU-accelerated height sampling; 5 points (centre, bow, stern, port, starboard) from the bounding box for pitch/roll, with separate height and rotation smoothing times, or single-point bobbing. Kinematic follow, not a force solver. `getHeightAt` is async (GPU readback). Explicitly **not** bit-exact across GPUs — for multiplayer, network object state. |

### 1.9 Version summary

- **v1.0** (2026-01-27) initial; v1.1 adds ESM build, "Choppy"/"Sea of Thieves"
  presets, **procedural** ocean-floor textures replacing assets.
- **v2.0** (2026-03-10) big overhaul: Gerstner swell, SSR, dynamic wakes,
  texture-based foam (surface/wave/shoreline), sky↔water transitions, sun
  shafts, underwater caustics, physical meniscus, WebGL fallback, 3 → 2
  cascades. v2.1: `standingWaveRatio`, wake foam on WebGL via RTT, ~30 % faster
  through early-exit guards and half-res sun shafts.
- **v3.0** (2026-06-05) deterministic fixed-step + tick sync, **persistent crest
  foam**, spray emitters, rain, shadow-occluded caustics, local Fresnel
  transparency, unified physically-derived Fresnel (`iorRatio`), Beer–Lambert
  colour, HDRI-only sky. v3.1 makes foam a world-fixed camera-following field
  and rebuilds transparency on three's built-ins (5–10 % faster). v3.2 sky
  provider interface. **v3.3** (2026-07-30) the physically calibrated JONSWAP
  spectrum, Gerstner layer removed, `maxScale`, "Max" tier. **v3.4** Jerlov
  physical colour. **v3.5** perf: paused calm wakes, cheaper SSR, quality-tier
  wave-detail redistribution.

## 2. Why the demos look the way they do

Decomposed from the docs and the demo's asset manifest (fetched from
`www.threejswaterpro.com/assets/…`). Roughly in order of contribution:

1. **A real HDRI sky doing the lighting.** V3 threw away procedural skies: the
   environment is an equirect HDRI, and it is the *only* ambient. Water is
   almost entirely reflection, so the water inherits a photographic sky's
   luminance range, colour gradient and horizon — this is the single biggest
   "it looks photographed" factor, and it is free. The sun disc is a separate
   overlay so the visible sun and the light agree by construction.
2. **Physical units and a calibrated spectrum.** A 70–200 m peak wavelength
   means the sea has *long swell* under the chop; three cascades take detail
   down to centimetres. The eye reads scale from the ratio of the biggest
   wavelength to the smallest, and from waves moving at their true phase speed.
   Nothing looks more like a pond than a sea whose longest wave is 30 m.
3. **Foam with memory and texture.** Persistent crest foam (inject on fold,
   inject on the windward face, exponential decay) makes foam *trail* off the
   back of a breaking crest; the texture + dissolve threshold and `windStretch`
   give it streak structure. Stateless foam always reads as "shader effect".
4. **Depth colouring done twice-consistently.** One constituent model
   (algae/silt/CDOM) drives surface colour, crest transmission *and* underwater
   fog — so shallows go turquoise, deeps go blue-black, and crossing the
   waterline does not change the water.
5. **Crest subsurface scatter.** Backlit crests glowing green-teal is the
   Sea-of-Thieves/holiday-brochure cue, on at every quality tier.
6. **Controlled sun glitter.** A dedicated sparkle term with power 512 and a
   distance window: the near-field sparkles, the far field does not fizz.
7. **Horizon with no seam.** Fog colour blending into the sampled sky colour
   over 1.5 km. A visible water/sky join is the classic tell.
8. **Interaction that fires on physics, not on a timer.** Spray probes trigger
   on measured impact speed; wakes stamp swept paths and disperse; rain rings
   are discrete drops. Everything the player touches responds *proportionally*.
9. **Scene dressing.** The demo is not bare water: island, rocks, grass, fish, a
   `dutch_ship_medium_2k.glb` (Poly Haven), a buoy, plus sand/rocky 1k PBR sets
   (also Poly Haven naming) on a displaced procedural seabed under the caustics.
   A good chunk of "incredible" is having something for the water to break on,
   float, refract and cast caustics onto. **Worth remembering when the owner
   judges our water on empty coastline.**

## 3. Gap analysis against our renderer

Read against `packages/game-core/src/water/render/waterMaterial.ts` (plus
`waves.ts`, `caustics.ts`, `RippleSim.ts`, `WaterSurface.tsx`,
`fallingSpray.ts`, `WaterCrowns.ts`, `UnderwaterBubbles.ts`). Cost is agent
time; payoff is the owner's eye.

| # | Technique | Us today | Cost | Payoff | Verdict |
|---|---|---|---|---|---|
| 1 | **Persistent foam energy field** (history buffer, crest+windward injection, exponential decay) | **Missing.** `esFoamE` is recomputed per frame from instantaneous terms; nothing persists, so foam cannot trail, and our wake/plunge/contact foam is a stamped shape rather than deposited energy | Medium (one 512² R16F ping-pong, camera-anchored/texel-snapped, one extra sample in the fragment) | **Very high** | **Do first** |
| 2 | **Spectrum calibration** (JONSWAP band amplitudes, Hasselmann spread, physical dispersion, long swell) | Partial. 10 geometric bands, `baseWavelength` **34 m**, `freqMul` 1.31, `ampMul` 0.76, flat `dirSpread` 0.9, wind as a bare multiplier | Low (data + generator in `waves.ts`; CPU/GPU twins already exist) | **Very high** at sea and on big bays | **Do first** |
| 3 | **Foam texture** instead of pure fbm dissolve | Missing (all `esFbm`) | Low (source a tileable foam texture; **not** art creation) | High | Do |
| 4 | **Crest subsurface scattering** | **Missing above water** (we have `esTransmit` through the surface but no backlit crest glow) | Low (~10 lines: crest height × `pow(sat(dot(view, -sunDir)), power)` × transmission tint) | High | Do |
| 5 | **Dedicated sparkle term** with distance window | Partial: GGX sun specular via CSM, tamed by a roughness distance-LOD that also kills legitimate glitter | Low | High at low sun angles | Do |
| 6 | **Analytic rain drop-ring cells** | Partial: `uRainRipple` is a two-phase noise *shimmer*; discrete rings only inside the 32 m sim patch | Low (cell hash + expanding ring, no buffers) | Medium-high (rain is province-wide weather) | Do |
| 7 | **Fog → sky-colour blend at the horizon** | Partial (aerial perspective; no explicit sky-colour convergence term) | Low | Medium-high (kills the sea/sky seam) | Do |
| 8 | **Waterline meniscus** at the near clip | **Missing** | Low | Medium-high **for swimming**, which we have and he does not emphasise | Do |
| 9 | **Dispersive wake field** (iWave, ~500–700 m, swept-path injection, foam from `\|∇h\|` with persistence) | Partial: `RippleSim` is a 256², ~32 m non-dispersive wave-equation patch + `esContactFoam` rings | Medium-high | Medium now, **high once boats ship** | Queue against the sailing phase |
| 10 | **Impact-speed spray probes** (symmetric trigger: object onto water *and* wave onto object) | Partial: `fallingSpray`/`WaterCrowns` cover falls and entries; nothing fires when a *wave* rises onto a rock, pier or mangrove root | Medium | Medium-high on exposed coast | Do after 1–5 |
| 11 | **Caustics**: two Voronoi layers combined with `min()`, wave-normal UV distortion | Partial: analytic lens + fbm; we already gate on direct light, depth, turbidity and shadow (**we are ahead of him on the physics gates**; he only got shadow occlusion in v3) | Low (swap the pattern generator) | Medium | Optional |
| 12 | **Jerlov/constituent colour model** | Partial and arguably better for us: we carry silt/tannin/salinity classes from compiled data, which is more Black Marsh than a Jerlov table | — | — | No change |
| 13 | **Clipmap LOD + scene-copy tiering** | **Have it** (graded grid, 2.6 m centre → 30 km; `rtScale` 0.75/0.9) | — | — | No change |
| 14 | **Underwater stack** (per-channel fog, distortion, particles, shafts, Snell) | **Have it**, plus bubbles he lacks | — | — | No change |
| 15 | **Determinism / tick sync / 8192 s time fold** | Missing, not needed (single-player). The **time fold** is still worth copying if our wave clock ever runs for hours | Trivial | Low | Note only |

### 3.1 Implementation notes for our pattern (WebGL2, `onBeforeCompile`)

All of these fit our existing injection points; none needs a new material class,
new art, or a second scene render.

**(1) Foam energy field.** Add a `FoamField` beside `RippleSim`: one 512² R16F
ping-pong, world size ~512 m, camera-centred and **snapped to whole texels**
(offset-copy on recentre, damp the outer ring — same discipline as
`RippleSim`). Per frame, one fullscreen pass:
`E' = E·exp(-dt/decayTime) + dt·(crestK·fold + windK·windward + wakeK·contact)`.
`fold` can be the crest measure we already compute (`esCrest`, the
world-anchored fbm crest + mesh crest) evaluated in the field pass from the same
`waves.ts` GLSL twin; `windward` is `sat(dot(normalXZ, windDir))`. Then in the
fragment, replace today's instantaneous `esFoamE` with
`max(esFoamE_instant·k, sampleFoamField)` and keep the existing dissolve
(`esFThr`/`esFTex`) unchanged. Contact rings, plunge foam and river flecks all
become *injections* into the field, which is what finally makes a boat trail,
a wading trail and a plunge pool persist and drift instead of being painted.
Beyond the field, fall back to the current stateless path (no visible seam
because the dissolve is the same).

**(2) Spectrum.** In `WAVES`, derive band amplitudes from a JONSWAP shape around
a **`peakWavelengthM`** (open sea 90–120 m; Topal Bay less; sheltered marsh
much less) rather than a geometric `ampMul`, set band angular offsets from a
frequency-dependent spread (narrow at the peak, broad at high frequency), and
keep phase speed at `sqrt(g·k)` (we already use deep-water dispersion). Add
his `standingWaveRatio` idea as the **sheltered-water** control: for lakes,
oxbows, bogs and mangrove basins, blend each band toward a standing wave
(`cos(k·x)·cos(ωt)`) — cheap, and it directly answers the water-quality matrix
row "ponds/lakes: sheltered motion, no marching swell". Both changes must land
in the CPU twin so buoyancy agrees. Also widen the longest band: 34 m is a
lake, not a sea.

**(3) Foam texture.** Two candidate sources, no art made: **vanilla Skyrim's
own foam textures** (`fxfoam`/`fxwaterfall`/water FX set — the prior shore-waves
research documents these exist; they are inside the BSAs and would need
extracting, currently unverified in our vault extract) or **Poly Haven / CC0**
tileables — note Water Pro's own demo dresses its floor with Poly Haven
`sand_*`/`rocky_*` 1k sets and a Poly Haven ship, so this is the same route he
took. Sample it as a *dissolve mask and a shading breakup*, exactly where
`esFTex`/`esFoamShade` are today, with two dual-phase advected UV sets so it
keeps flowing correctly. Credit it in root README § Credits in the same change.

**(4) SSS.** In the `above` branch, before the foam mix:
`sss = pow(sat(dot(-view, sunDirXZnorm)), P) * sat(crestHeight/ampRef) * exp(-absorb·thicknessProxy)`,
added to `outgoingLight` with the clear/tannin transmission tint. Use the crest
height we already have (`esCrest` before the fbm max) and gate on wave exposure
so still marsh water does not glow.

**(5) Sparkle.** Add an explicit glint independent of the roughness LOD:
`spark = pow(sat(dot(reflect(-view, esNW), sunDir)), 512) * window(esDist, 10, 500) * esExpo`,
added after the specular. It must *not* be scaled by the distance roughness LOD
— that LOD exists to stop fireflies from the normal detail, and the sparkle has
its own bounded, filtered fade.

**(6) Rain rings.** Replace the `uRainRipple` shimmer with cell-based drops:
hash the world cell (`size` ~0.5 m) to a per-cell phase; a drop's age is
`fract(t/period + hash)`; ring radius grows with age, amplitude decays; add its
radial gradient into the normal, faded by distance (~100 m) and by
`uRainRipple`. No buffers, works everywhere, and it makes rain read on the
whole province instead of only under the player.

**(7) Horizon.** Blend the aerial-perspective colour toward the sampled sky/env
colour along the view direction over ~1.5–2 km, so distant sea converges to the
sky exactly at the horizon line.

**(8) Meniscus.** When the camera is within ±`thickness` (~0.3–0.5 m) of the
surface, tilt `esNW` toward the camera and add a rim highlight across the band —
one branch in the `below`/`above` transition, our biggest cheap win for
swimming, which the owner's spec cares about far more than Water Pro does.

## 4. Inland water, rivers, waterfalls — what his material actually offers

**Almost nothing directly, and that is the finding.** Water Pro is an *ocean*
system: one infinite clipmap surface at a single level, one FFT field, one wind
direction. There is **no flow map, no river, no waterfall, no per-body water
level, no bed-following surface, no current advection** anywhere in the API, and
the ocean floor is a procedurally displaced plane at a fixed depth below the
surface. Everything our province needs beyond "sea" is our own work, and the
prior research docs remain the reference for it.

Four transferable ideas:

1. **`standingWaveRatio` for sheltered water** — the documented recipe for
   harbours and lakes (0.3–0.5) is precisely our ponds/oxbows/bogs problem, and
   is cheaper than gating wave exposure to zero and leaving a dead plate.
2. **Shoreline foam as a depth *range* in metres** (`range` = "water depth over
   which foam fades from shore") is the same physical control as our vertical
   thickness fade — his default is **2 m**, notably wider than our
   `CONTACT_FOAM_M` 0.12 m. Our line is thin because it must sit on a
   terrain-cut edge, but a *second*, wider, depth-driven band would give shallow
   marsh margins the frothy fringe they currently lack.
3. **Wake foam by `|∇h|` threshold + persistence** is exactly how our rapids,
   chutes and plunge pools should deposit foam: aeration is a *deposit* with a
   decay time, carried downstream by the current, not a value recomputed each
   frame from slope. Feeding `esCascade`, `esPlungeFoam` and the strip aeration
   into the field of recommendation (1) is what will make a plunge pool look
   like it is being fed.
4. **Spray probes fire on relative impact speed, symmetrically** — for us, that
   is the mechanism that puts spray on a waterfall's plunge lip, on rocks in a
   rapid, on mangrove roots in surf, and on the player wading, from one rule.

## 5. Bottom line

Our water already matches or beats Water Pro on several axes he does not care
about (compiled province-wide levels, flow, classes, whitewater strips,
underwater bubbles, physically gated caustics, terrain-cut shoreline). The
distance the owner is seeing is concentrated in four places: **a sea whose
longest wave is 34 m**, **foam with no memory or texture**, **no backlit crest
glow or controlled glitter**, and **an HDRI-grade sky feeding the reflection**.
Items 1–7 in §3 are all small-to-medium, all fit `onBeforeCompile`, and none
requires a line of his code.
