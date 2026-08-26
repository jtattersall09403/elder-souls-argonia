# Water rendering in three.js — research for Phase 8b

Research pass 2026-08-26 (module 60 §39's four reference repos verified against
their actual code via GitHub, plus an ecosystem/technique sweep). This doc is
the "why" behind decision 0025 (implementation shape); the living spec stays in
[../world/60-water-traversal.md](../world/60-water-traversal.md).

## 1. The four module-60 reference repos, verified

All four are **single-author demo drops from mid-2026, none maintained** —
treat as vendor-and-own source, never dependencies. All genuinely MIT
(LICENSE files checked 2026-08-26).

| Repo | State | Verdict |
|---|---|---|
| [WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS) (85★, 11 commits Jul 2026) | Pure WebGL2 GLSL `ShaderMaterial`, ~2.5k LOC Vite demo, zero assets (fully procedural) | **Backbone.** Vendor: `shaders/common.js` (multi-band Gerstner `sampleOcean()` + fbm + caustics), `Ocean.js` (SSR w/ sky fallback, depth refraction, Beer–Lambert absorption, layered foam), `Post.js` (underwater: per-channel extinction, HG god rays, projected caustics), CPU `surfaceSample` with **fixed-point inversion of Gerstner XZ displacement** (the correct buoyancy approach, same as Crest's). Not vendored: main.js pipeline (rebuild in r3f), clouds, toy physics. No mobile tiers — tiering is our work. |
| [SeedOcean](https://github.com/reed-soul/SeedOcean) (5★, dead 2026-07-11, never published to npm despite README) | "WebGPU-first with WebGL2 fallback" is really **two separate oceans**: TSL FFT on WebGPU; a basic Gerstner GLSL fallback on WebGL2 with `flowMap: null, wakeField: null` — on WebGL2 there are no rivers/wakes/foam at all | **Design reference only.** The one gem: `src/core/flow-map.js` (~550 lines, renderer-agnostic CPU): RGBA flow-map contract (RG = direction, B = speed, A = shore foam), `bakeRiverFlow` from Catmull-Rom centrelines. We adopt the *format*, generate the data from our own hydrology compile instead. |
| [jeantimex/threejs-water](https://github.com/jeantimex/threejs-water) (186★; MIT with clean Evan Wallace attribution chain) | 256² ping-pong wave-equation sim, WebGL2 + `EXT_color_buffer_float` w/ iOS half-float fallbacks — but caustics/reflection passes **hardcode a pool** (walls, floor, tile JPGs) | **Shelf.** The sim is the earmarked tech for a later local-interaction ripple layer (wading, oars, rain rings) and §39.3 hero pools. Not an open-water renderer. |
| [abyssal-ocean](https://github.com/squall01337/abyssal-ocean) (36★, 3 commits on one day, Aug 2026) | One 83 kB `index.html` monolith: JONSWAP/TMA GPU FFT, 3 cascades, Jacobian persistent foam, radial horizon grid, **Preetham analytic-sky reflection** + optional 40-step SSR (auto 256²+SSR-off on phones); hard-requires `EXT_color_buffer_float` | **Quality ceiling / future high tier.** Not vendored now — extraction is a deliberate later job if the Gerstner sea disappoints at the coast. Its Preetham-reflection code is the worked example for our sky (§4 below). |

## 2. Ecosystem findings

- three/examples `Water` and `Water2`, drei `MeshReflectorMaterial`, and r3f
  wrappers all use **planar reflection = render the scene again per surface**
  — the known non-answer for open-world water ("you can't render the scene
  twice if once costs 90% of the budget",
  [terrain-reflections write-up](https://blog.uhawkvr.com/rendering/approximate-terrain-reflections/)).
  `Water2`'s **dual-phase flow-map advection chunk** (Valve Portal 2 flow maps,
  Vlachos SIGGRAPH 2010) is the piece worth lifting — already in node_modules, MIT.
- Commercial kits ([Three.js Water Pro](https://docs.threejswaterpro.com/),
  [Tidewater](https://ilikekillnerds.com/2026/05/21/i-built-tidewater-threejs-ocean-kit/))
  are licence-incompatible with a public repo but confirm the shipped-quality
  shape: no planar reflections, CPU-mirror buoyancy, Snell's window underwater,
  WebGPU pinned to specific three releases ("TSL still moves around" —
  validates our WebGL2 baseline).
- **Mobile calibration point**: [Nugget8/Three.js-Ocean-Scene](https://github.com/Nugget8/Three.js-Ocean-Scene)
  ships a flat 12-triangle camera-centred plane + two scrolling normal maps at
  **constant 120 fps on a 2021 mid-range phone**, extent capped ~4 km for float
  precision. That is our Tier-0 shape.
- What open-world three.js water converges on in 2025/26: Gerstner-or-FFT
  surface, env/analytic-sky reflection + optional SSR, depth-based refraction
  from **one** opaque scene copy, camera-recentred geometry.

## 3. Technique notes (sources inline)

- **Scene colour+depth without rendering twice**: render opaques once into a
  `WebGLRenderTarget` with a `DepthTexture`, blit to screen, draw water on top
  sampling both (refraction offset scaled by depth; water depth = scene depth −
  fragment depth → Beer–Lambert tint + shoreline fade). Standard pattern
  (three's own transmission pass;
  [Gjoreski stylized-water walkthrough](https://aleksandargjoreski.dev/blog/stylized-water-shader/);
  [depth-texture forum thread](https://discourse.threejs.org/t/reading-from-depth-texture/51344)).
  The same RT pair feeds SSR and the underwater post — one scene render powers
  everything.
- **Gerstner CPU/GPU parity pitfalls** (buoyancy): (a) trig/period convention
  mismatch ([Asgard's Wrath account](https://salivity.github.io/game-development/article/interactive-ocean-physics-vertex-shaders-and-buoyancy));
  (b) time drift — one authoritative time uniform from JS, never shader time;
  (c) Gerstner displaces XZ, so height-at-(x,z) needs fixed-point iteration
  ([Crest collision docs](https://crest.readthedocs.io/en/stable/user/collision-shape-and-buoyancy-physics.html));
  (d) chop ≤ self-intersection limit; (e) filter wavelengths below a min
  spatial length for hulls. Keep wave params in one JS array generating both
  uniforms and the CPU sampler.
- **Underwater** consensus recipe: submersion test → post pass with per-channel
  Beer–Lambert fog, **Snell's window** (`step(sqrt(1−cos²θ)·1.33, 1.0)`,
  [snippet](https://godotshaders.com/shader/snells-window/)), god rays as cheap
  radial screen-space anchored to the refracted sun, projected caustic pattern
  (physical option: [Renou's refracted-ray caustics](https://medium.com/@martinRenou/real-time-rendering-of-water-caustics-59cda1d74aa)).
- **Shore foam**: depth-difference mask → soft alpha fade + fbm foam band;
  baking a shore-distance field at compile time is cheaper than computing it
  per frame (we bake it into the flow map A channel).
- **Mobile WebGL2 reality**: 4–8 vertex-shader Gerstner bands beat FFT below
  the crossover ([BTH thesis](https://bth.diva-portal.org/smash/get/diva2:1778248/FULLTEXT02.pdf));
  256² 3-cascade fragment FFT is plausible on modern phones
  ([ARM sample](https://arm-software.github.io/opengl-es-sdk-for-android/ocean_f_f_t.html))
  but ~50–60 extra passes/frame; SSR/planar are what phone paths turn off;
  `EXT_color_buffer_float`/half-float discipline is the iOS checklist.

## 4. Feeding our Preetham sky into water reflections

Two mechanisms, both halves already exist in `apps/world-studio/src/sky/`:

1. **PMREM IBL**: `WorldSky` already bakes the dome to `scene.environment` on
   a sun-elevation throttle — a `MeshStandardMaterial`-based water gets the
   rough/glossy sky reflection for free at the correct exposure.
2. **Analytic Preetham sample in the water shader** for the sharp mirror term
   and SSR-miss fallback (abyssal-ocean's approach): the dome's exact
   configuration is already CPU-transcribed in `preethamCpu.ts`, so a GLSL
   sample along the reflected ray is pixel-consistent with the dome, with no
   bake latency at sunset (the case 8a fought hardest).
3. Exposure/aerial coherence comes free if water uses the standard-material +
   `csm.setupMaterial()` + `applyAerialPerspective()` pattern (decision 0020)
   — exactly what the interim `SeaPlane` already did.

## 5. Recommendation (adopted as decision 0025)

Vendor WaterThreeJS as backbone; graft SeedOcean's flow-map *contract* for
rivers (data baked by our own hydrology compile); reflections = analytic
Preetham + PMREM env + tiered SSR, **no planar reflections anywhere**; one
water material with compile-time variants (SEA/COAST · RIVER · STILL) driven
per-body by compiled water data; one CPU wave/flow module shared by renderer,
buoyancy and the `WorldWaterQuery`; abyssal-ocean and jeantimex held as future
high-tier / hero-pool upgrades. Tiers: T0 mobile = analytic sky + env only,
reduced-res scene copy; T1 desktop = + SSR + god rays + full foam; T2 future =
FFT coast. Camera-recentred geometry; province water as one height-textured
surface (bodies below ground z-cull away).
