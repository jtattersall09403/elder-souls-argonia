# fable5-world-demo (LAAS) audit: what to take for our renderer

What this answers: which rendering techniques in the external project
[Braffolk/fable5-world-demo](https://github.com/Braffolk/fable5-world-demo)
("LAAS", a procedural 4 x 4 km WebGPU world built by Fable 5) we take now,
later, or never, and how each compares with ours. Read it before porting
anything from that repo, and before the froxel-fog, sky, post-processing or
rendering-performance work it routes.

- Audited commit: `fd75fdb718996908aad3d22b59dfa297dc94298d` (2026-06-12).
  Local clone: `/workspaces/ext/fable5-world-demo` (outside this repo; re-clone
  with `git clone https://github.com/Braffolk/fable5-world-demo` and check out
  that commit if absent). File:line references below are at that commit.
- Same engine version as our `webgpu` branch: three.js 0.184
  `WebGPURenderer` + TSL, so code moves across with little adaptation.
- Area notes with full evidence: `tooling/.reports/research/laas/`
  (`atmosphere-volumetrics.md`, `lighting-shadows-perf.md`,
  `terrain-veg-water-weather.md`, `tooling-and-routing.md`).

## Licence verdict

**MIT** (`LICENSE`, "Copyright (c) 2026 Remi Sebastian Kits"). We may copy
code verbatim, modify it and ship it. The one condition: the copyright and
permission notice travels with any substantial portion. So a file that ports
their code carries a header comment
`Adapted from fable5-world-demo <path> @ fd75fdb7, Copyright (c) 2026 Remi Sebastian Kits, MIT licence`,
and the same change adds a credit line to root `README.md` § Credits
(engineering standard 10: source, commit and credit in the same change).
The project generates every asset in code and ships none, so there is no
art to take, and we take none (we never make art; procedural generation of
meshes and textures is out for us anyway).

## How the two compare, in one paragraph

Our froxel volume (decision 0112) is ahead of theirs on nearly every axis:
three distance bands against their one grid, a two-lobe phase function, local
lamp airlight and window apertures they lack, temporal jitter with history
reprojection where theirs has none, and a near-field shaft march. Theirs is
ahead in four places: the sun light inside the fog is shadowed by terrain,
fog density follows ground moisture and drops at noon, the sky and aerial
perspective use Hillaire lookup tables, and clouds cast shadows. Beyond fog,
they run a full desktop post chain (TAA, bloom, GTAO, contact shadows,
screen-space bounce, filmic grade) and a probe GI field we do not have, all
sized for an RTX 3060-class desktop with no mobile path. Several of their
CPU-side performance fixes on three 0.184 apply to us directly.

## Every visual approach, categorised

Verdict on ours: **already** (we do it as well or better), **worse**, **lacks**.

| # | Their approach (file:line) | Ours | Category | Reason |
|---|---|---|---|---|
| 1 | Froxel grid, one 160x90x64 grid to 480 m, exponential slices (`src/gpu/passes/Froxels.ts:62-99`) | already: 3 bands to 1500 m (`air/volumetrics/froxelGrid.ts:30-35`) | don't want | ours is better |
| 2 | Terrain-horizon sun visibility in the fog: 5 log-spaced height probes along the sun ray (`Froxels.ts:159-163`) | lacks (`froxelGrid.ts:391` sun term has canopy only) | want, **now** | low sun shines fog shafts through ridges today |
| 3 | Fog density times ground moisture squared, and a time-of-day factor near 0.12 at noon (`Froxels.ts:130-155`) | worse: regional humidity and season, not local wetness (`fogField.ts:92-95`) | want, **now** | fog sits in wet basins, not on dry slopes; noon washout is their logged failure |
| 4 | Fog ambient tied to sun visibility (`Froxels.ts:182-184`) | worse: sky term scaled by `skyOpen` only | want, **now** (with 2) | shadowed fog stops glowing |
| 5 | Same-frame camera matrices for the inject pass (`STATUS.md:493-494`, their bug) | unverified | want, **now** (check) | a one-frame lag slides fog against geometry while turning |
| 6 | Canopy crown-slab pierce for shafts (`Froxels.ts:164-172`) | already: grid term plus 12-step near march (`froxelGrid.ts:262-280`) | don't want | ours is better |
| 7 | Single Henyey-Greenstein g 0.5 (`Froxels.ts:176-180`) | already: two-lobe mix (`froxelGrid.ts:43-47`) | don't want | ours is better |
| 8 | No temporal accumulation; static depth hash (`Froxels.ts:121-123`) | already: jitter, reprojection, blend 0.9 (`froxelGrid.ts:412-426`) | don't want | ours is better |
| 9 | Fog applied as one 3D-texture tap in post (`src/render/PostStack.ts:253-258`) | `scene.fogNode` | don't want | no measured reason to switch |
| 10 | Hillaire LUT atmosphere: transmittance, multi-scatter, sky-view, aerial perspective (`src/sky/Atmosphere.ts:2-9,377-402`) | worse: analytic haze (`materialNodes.ts`, `WorldSky.tsx`) | consider (owner A) | changes the whole sky look; needs a WebGL path while main ships WebGL |
| 11 | Raymarched volumetric clouds with temporal reprojection; cloud shadows on ground and in fog (`src/sky/Clouds.ts:263`) | worse: FBM dome (`cloudField.ts`), no cloud shadows | consider (owner A) | heavy; desktop-class |
| 12 | Shadow-material hash memo against alphaTest version thrash (`src/render/ThreePatches.ts:53`, `STATUS.md:455-470`) | unverified; same three 0.184 CSM node, 15 alphaTest uses | want, **now** (profile first) | CPU submit was their binding limit; ours is CPU-heavy too (0084) |
| 13 | Per-pass GPU timings (`src/core/GpuProfiler.ts:52-63`) | worse: one timestamp (`createRenderer.ts:31`) | want, **now** | the WebGPU lane needs per-pass numbers to tune |
| 14 | Terrain shadow proxy, 512² caster (`src/world/ShadowProxy.ts:22`; ~54 ms saved, `STATUS.md:186-187`) | full-res LOD 1-2 chunks cast (`ChunkTerrain.tsx:54-62`) into one 120 m cascade | want, **now** (measure first) | win scales with cascade count; ours has one cascade in character mode |
| 15 | CSM caching, cascade update periods [1,2,3,6] (`src/render/CsmCached.ts:29`; -3.9 ms) | lacks: refit every frame (`WorldSky.tsx:333-348`) | want, the performance lane | small in character mode (1 cascade), real in fly mode |
| 16 | Static meshes `matrixAutoUpdate=false`, uniform groups (`STATUS.md:548-561`; 0.67 ms CPU) | unchecked | want, the performance lane | cheap CPU win on every device |
| 17 | Vertex-stage hoists in foliage materials (`src/render/VegMaterials.ts:53-63`; -1.4 ms) | unchecked in `floraKit.ts` | want, the performance lane | per-fragment work moved per-vertex, no visual change |
| 18 | Depth prepass for alpha-tested foliage with `@invariant` (`src/render/VegPrepass.ts:38,79`; 49.6 to 39.4 ms) | lacks | want, the performance lane (gate on an M2 measurement) | doubles vertex work; wins only where overdraw dominates |
| 19 | CDLOD vertex morph between terrain LODs (`src/world/TerrainTiles.ts:117-133`) | worse: skirts only (`terrain/gridGeometry.ts:55`) | want, the performance lane | removes terrain LOD pops on both renderers |
| 20 | Canopy shell for far forests, one draw (`src/world/CanopyShell.ts:1-11`) | lacks | want, the performance lane | far forest reads as canopy, not bare ground, past the impostor ring |
| 21 | Measurement rules: ABAB pairs, exposure locked, ablation deltas over timestamp spans (`STATUS.md:585-600`) | partial | want, the performance lane | device-class budgets need trustworthy deltas |
| 22 | Octahedral impostors, 4-tile blend, relit normals (`src/render/ImpostorRuntime.ts`) | already: 3-view (`vegetation/impostor.ts`) | polish | compare relighting quality only |
| 23 | World-anchored dither crossfade (`STATUS.md:910`) | already (`cellGating.ts:128`), anchor unchecked | polish | screen-anchored dither swims |
| 24 | Edge-on card fade (`VegMaterials.ts:314-329`) | lacks | polish | cards seen edge-on show as lines |
| 25 | Hierarchical wind: gust fronts, sway frequency by size, shelter (`src/render/Wind.ts:1-15`) | matched except shelter: trunk bend by height², frequency by plant size, branch sway, leaf flutter, downwind gust band (`fx/windSway.ts`, walk-8 lane E) | done (owner E, 2026-10-01) | shelter not done; owner walks the feel |
| 26 | GPU auto-exposure from frame luminance (`PostStack.ts:517-530`) | worse: CPU ease toward a target (`lightAdaptation.ts:10`) | polish | ours never measures the frame |
| 27 | Far-terrain ridged normal synthesis (`src/render/TerrainMaterial.ts:8-14`) | partial: macro channel (`groundMaterial.ts:265,308`) | polish | distant hills keep detail |
| 28 | Baked noise instead of live noise in terrain shading (live noise was 52 of 73.5 ms, `STATUS.md`) | check our `groundMaterial.ts` live-noise count | polish | possible large win; unmeasured |
| 29 | Caustics computed into albedo (`src/render/Caustics.ts`, ~0.05 ms) | have `caustics.ts`, method not compared | polish | compare only |
| 30 | GPU particles: pollen, motes, leaves in shafts (`src/gpu/passes/Particles.ts`) | partial: window motes only | polish | motes in canopy shafts sell the light |
| 31 | Per-time-of-day colour script and AgX grade (`src/render/ColorScript.ts:51`, `PostStack.ts:78`) | lacks: ACES, twilight clamp (`skyScreenModel.ts:36`) | consider (owner D) | art direction |
| 32 | TAA with analytic camera reprojection (`PostStack.ts:463-509`, 4.4 ms) | MSAA (`canvasRenderer.ts:6`) | consider (owner B) | fixes foliage shimmer; blur and cost |
| 33 | Bloom, GTAO half-res (2.4 ms), contact shadows (1.5 ms), screen-space bounce, PCSS (`PostStack.ts:185,390-447,515`; `Gtao.ts:78`; `ShadowSetup.ts:47`) | lacks (PCF 2048 only) | consider (owner B) | desktop high tier only |
| 34 | Irradiance probe GI, SH-L1, 3072 probes per frame (`src/gpu/passes/ProbeGI.ts:55-61`, +3 ms) | lacks: hemisphere light plus the 0108 field | consider (owner C) | no black shadows; needs a baked mobile variant |
| 35 | GPU frustum and terrain-occlusion culling into indirect draws (`Scatter.ts:251`, `Forests.ts:5-6`) | already on webgpu (`GpuCullSystem.ts:299`), CPU on WebGL | don't want (ours better) | ours keeps LOD-fade parity |
| 36 | Headless WebGPU checks: Playwright on a real Metal adapter, frame-aligned determinism, pixel sampling, diff (`tools/launch.ts`, `shoot.ts`, `diff.ts`) | no GPU on our VM; `npm run look`, probes | consider (owner F) | their method needs a GPU we do not have |
| 37 | Reference-delta loop: render beside a reference frame, rank ten differences, fix three (`PROJECT_LAAS_v2.md` § The bar) | partial (owner walks) | consider (owner F) | a written gap list before each walk |
| 38 | Procedural generation: heightfield and erosion, rivers, trees, rocks, bark, ground cover, scatter (`src/gpu/passes/*`, `src/vegetation/*`) | n/a | don't want | we never make art; terrain is frozen (0102) |
| 39 | Triangle floors ("under-rendering is failure", `PROJECT_LAAS_v2.md` §2) | 0084 triangle budget | don't want | opposite of our mobile budget |
| 40 | No WebGL fallback, desktop Chrome only (`src/core/BrowserGate.ts`) | WebGL on main, webgpu branch | don't want | we target mobiles |
| 41 | Biome snow, alpine particles (`src/gpu/passes/BiomeSnow.ts`) | n/a | don't want | Black Marsh has no snow |
| 42 | Water: clipmap surface, SSR with terrain fallback, obstacle foam, wet margins (`src/world/WaterSurface.ts`, `src/render/WaterMaterial.ts`) | already (0047 field water, SSR, refraction, foam) | don't want | no gap found |

Counts: implement now 7 rows in 6 jobs (rows 2-5, 12, 13, 14); later phase
7 (rows 15-21, the performance lane); polish backlog 8 (rows 22-24, 26-30); consider 9
rows in 6 owner items; don't want 11.

## Implement now

Each is a lane job on the `webgpu` branch worktree
(`/workspaces/elder-souls-argonia-webgpu`), started after the WebGPU lane
finishes. Ported code keeps the MIT header and adds the README credit line.

1. **Terrain shadow on the sun inside the fog** (rows 2, 4). Our file:
   `packages/game-core/src/air/volumetrics/froxelGrid.ts:391` (the sun
   radiance term). Start from: `Froxels.ts:157-163` (the five probes) and
   `:182-184` (ambient by visibility). Adapts: sample our `TerrainGrids`
   height samplers (`terrainGrids.ts`, near 256 m and far 2048 m grids, 128
   texels) already bound to the inject pass, choosing the near grid for
   probes inside 128 m and the far grid beyond; multiply into the
   `canopyT(p)` product; scale the sky ambient by a softened visibility.
   Measure: a harness frame at sun elevation under 10° behind a ridge in the
   froxel test harness shows sun in-scatter on the shaded side down by more
   than 80 %, the sunlit side unchanged within 2 %; inject pass cost up less
   than 0.2 ms on the high band (per-pass timer from item 4). About 30 agent
   minutes.
   **Done (webgpu):** `terrainSun.ts` + `froxelGrid.ts` `terrainSunT`; unit test: shaded valley vis < 0.2, sunlit > 0.98; harness valley-dawn 256x144 mean luma 98.5 -> 83.2 (with item 2); GPU ms not measurable on SwiftShader.
2. **Fog that follows wet ground and lifts at noon** (row 3). Our file:
   `packages/game-core/src/air/volumetrics/fogField.ts` (density regimes) and
   the density call in `froxelGrid.ts:245-248`. Start from:
   `Froxels.ts:130-155`. Adapts: their moisture field becomes our frozen
   hydrology wetness or water-distance raster (whichever `TerrainGrids`
   already carries; add a channel if neither), squared as theirs; their noon
   factor folds into our existing dawn/dusk marsh-fog term so the regimes in
   `fogField.ts` keep their meaning. Measure: in `fogField.test.ts`, density
   ratio wet basin over dry slope at dawn at least 3, and noon density at
   most 0.25 of dawn for the marsh regime. About 30 agent minutes.
   **Done (webgpu):** moisture = far grid a (max of the record's marsh class and water mask), `moistureWeight` floor 0.25; wet/dry 4x, noon marsh and mist 0 (the dawn/dusk envelopes already lifted at noon; no new noon term).
3. **Camera-matrix freshness check** (row 5). Our file:
   `froxelGrid.ts` (where `camPos`, `camFwd`, `tanHalf` are written).
   Start from: `STATUS.md:493-494`. Adapts: write the uniforms in the same
   frame callback that renders, after the camera update. Measure: a unit
   test or a harness frame with the camera yawing 90°/s shows no fog shift
   against a fixed occluder edge. About 15 agent minutes.
   **Done (webgpu):** cause confirmed (WorldSky updates the grid at priority -2, the camera moves at 0); the fog stage now looks the grid up by world position in the grid's own basis (`gridUvw`), test: 1.5 deg stale yaw shifted the old lookup > 0.4 m at 20 m, new lookup exact.
4. **Per-pass GPU timings** (row 13). Our file:
   `packages/game-core/src/render/createRenderer.ts:31` and the studio perf
   overlay. Start from: `src/core/GpuProfiler.ts:52-63`. Adapts: label our
   passes (shadow, froxel inject, integrate, apply, opaque, transparent,
   water); keep it dev-only behind the existing debug export. Measure: the
   overlay prints one timing per pass and the sum is within 10 % of the frame
   timestamp. About 30 agent minutes.
   **Done (webgpu):** `frameSegments.ts` files compute passes by node name (volumetricsInject/Blur/Integrate, gpuCull) resolved with the render pool; unit test sum = frame; harness `?timing=N`. SwiftShader resolves 0 ms per pass, so real numbers need the owner's GPU.
5. **Shadow-material thrash check and memo** (row 12). Our files: wherever
   alpha-tested materials enter the CSM shadow pass (15 `alphaTest` uses on
   webgpu). Start from: `src/render/ThreePatches.ts:53` and
   `STATUS.md:455-470`. Adapts: profile character mode on the CPU first;
   port the memo only if shadow-node material builds recur per frame.
   Measure: CPU frame time in character mode before and after, ABAB pairs;
   no visual change in `npm run look`. About 30 agent minutes.
   **Skipped:** the item-4 timer cannot read GPU cost on this VM (SwiftShader); needs the per-pass HUD on the M2 first.
6. **Terrain shadow caster cost** (row 14). Our file:
   `apps/world-studio/src/character/ChunkTerrain.tsx:54-62`. Start from:
   `src/world/ShadowProxy.ts:22`. Adapts: measure the shadow-pass time with
   item 4 first; if terrain casting is over 0.5 ms, swap the caster for a
   coarse proxy mesh of the same chunk heights (`castShadow` off on the real
   chunks). Measure: shadow pass time before and after; a low-sun frame
   shows ridge shadows still reaching the valley floor. About 40 agent
   minutes.
   **Skipped:** as item 5; gate it on the shadow row of the per-pass HUD on the owner's GPU.

Total about 175 agent minutes; items 1-3 are the volumetric-lighting set,
4 is the timer the others measure with.

### Gotchas to brief with (their logged bugs on three 0.184)

- Do not use `BundleGroup`: it records before async compiles finish
  (`STATUS.md:562-564`).
- Set `shadow.camera.far` to at least lightMargin + 2.2 x the cascade
  maxFar, or cascades render empty with no error (`ShadowSetup.ts:122-128`).
- Global fog washes the frame out at noon; their fix is rows 3 and 4.
- `@builtin(position)` needs `@invariant` for a depth prepass to match
  (`docs/THREE-NOTES.md`).

## Routed elsewhere

- The standing performance lane: rows 15-21, the open wins list in
  [docs/phases/lanes/performance-lane.md](../../phases/lanes/performance-lane.md); row 21 also measures the Phase 14 budgets.
- Polish backlog: rows 22-24 and 26-30, § "Rendering ideas from the
  fable5-world-demo audit" in
  [P-polish/backlog.md](../../phases/P-polish/backlog.md).

## For the owner

The other project does many things on a powerful desktop graphics card that
we would have to cut down for phones. These are the choices that are yours,
grouped into six.

1. **A more realistic sky** (rows 10, 11).
   - 1a. A physically modelled sky and distance haze, the method most modern
     games use. Pros: sunsets, haze and distant hills look truer. Cons: it
     changes the look of every scene you have already approved, and the
     current (WebGL) build would need its own cheaper version. Risk if we do
     it: a few days of retuning colours you have signed off. Risk if not: the
     sky stays good but simpler than it could be.
   - 1b. Real 3D clouds that cast moving shadows on the ground. Pros: the
     most striking thing in their world. Cons: expensive; would only run on
     a strong computer, phones keep today's clouds. Risk if not: none for
     now.
2. **A "high quality" setting for strong computers** (rows 32, 33): soft
   glow around bright lights, darker creases where objects meet, smoother
   edges on leaves, small shadows under pebbles and grass. Pros: a visible
   step up on desktops. Cons: phones and older laptops cannot run it, so it
   has to be a setting; leaf edges can look slightly blurred while moving.
   Risk if we do it: more settings to test. Risk if not: desktops look the
   same as phones.
3. **Bounced light in shadows** (row 34): shadows that pick up colour from
   nearby ground and leaves instead of going grey. Pros: their strongest
   lighting rule, and it suits a jungle. Cons: costly; phones would need a
   pre-computed version, which is a design job in its own right. Risk if
   not: shaded jungle stays a little flat.
4. **A colour plan per time of day** (row 31): warm light against cool
   shade at golden hour, different moods at dawn and dusk, like a film
   grade. Pros: cheap to run, strong mood. Cons: it is an art-direction
   choice, and you would need to approve the look. Risk if not: none beyond
   a less deliberate look.
5. **Livelier wind** (row 25): gusts that roll across the canopy, small
   plants shaking faster than big trees, sheltered plants moving less. Pros:
   the world feels alive. Cons: it changes how the jungle moves, so you
   would need to walk it. Risk if not: today's sway stays.
6. **How we check our work** (rows 36, 37).
   - 6a. Their agent checks every change with real graphics on a machine
     that has a graphics card. Ours has none, which is why you walk the
     studio. Renting a graphics machine for automatic checks would catch
     more before you look, at a cost per hour.
   - 6b. Before each walk, compare a shot against a reference picture you
     choose and list the ten biggest differences. Pros: cheap, and your
     walks start from a written gap list. Cons: you would need to pick the
     reference pictures. Risk if not: none beyond the current process.
