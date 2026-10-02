# 0108 — Performance architecture: fixture light field, material ready before first draw, view-gated streaming, tiers that fade

**Date:** 2026-09-29. **Status:** accepted (planner, 16k walk-5 perf lane,
on the owner's walk-5 readings: night frame drop at Greenspring, a startup
flash, ground cover arriving in waves, "50,000 trees", pop-in then
pop-out). **Evidence:** the lane reports under
`tooling/.reports/16k/walk5/perf/` (`audit.md`, `research.md`,
`lights.md`, `veg.md`, `gc.md`, `water-alloc.md`, `leftovers.md`,
`round13.md`, `baseline.md`, `video/report.md`). **Amends:** 0105 R3
(the 16-light cap) and R11 (stepped lit counts); 0075 and 0082 through
their walk-5 addenda; 0084 stays the frame budget every rule below is
sized against. **Standing rules for agents:**
[engineering.md § Performance checklists](../standards/engineering.md#performance-checklists-decision-0108).

## 1. Fixture lights leave three's light list

three's forward renderer bakes the point-light count into every lit
program and evaluates every light on every fragment; a count change
relinks every lit material. Walk 5 ran 16 PointLights (padding lights at
intensity 0 kept the count fixed) over every MeshStandard in the scene:
about 55 M light evaluations a frame at night (audit.md item 1). That was
the night-only drop.

- **`FixtureLightField`** (`packages/game-core/src/render/fixtureLights/`):
  a 100-slot float texture (row 0 position + radius, row 1 colour ×
  intensity) with a runtime count, one field per scene
  (`fixtureLightFieldOf(scene)`, no module singleton). A texture, not a
  uniform array: 100 lights as uniforms would take ~200 of WebGL2's 224
  guaranteed fragment vectors.
- `install(material)` injects one loop after `lights_fragment_begin`
  using three's own attenuation and `RE_Direct`; `attach(object)` gives
  each object its **nearest 8** lamps that reach its bounding sphere
  (`FIXTURE_LIGHTS_PER_OBJECT`; the terrain raises it to **16**, a near
  sub-tile holds a whole place). Lists are re-chosen only when a slot
  moves or the object moves.
- **One program for any count.** Measured (lights-harness): 3 programs
  and 60 program switches a frame at 0, 5, 40 and 100 lamps, the same as
  with no field; pixel parity with real PointLights 0 over 256 000 px;
  16 field lamps cost 0.41–0.47 of 16 PointLights (VM ratio).
- **`LIGHTS_CAP` = 100** (`settlement/lighting.ts`), `LIGHTS_ACTIVE_M`
  200 m, a 20 m fade at the band edge. `place_gates` reads the cap: up to
  100 fixtures within 200 m of any point in a place. 0105 R3's 16 and
  R11's 0/4/8/16 steps are superseded.
- **The carried torch is the one real PointLight**, held at a constant
  count for the actor's life (`fx/carriedLightRig.ts`: parked at
  intensity 0 when nothing lit is held), so lighting a torch relinks
  nothing.

## 2. A material is ready before its first draw

The startup flash (buildings and trees bright, then dark) was the sky's
CSM/wind/fade patch walk running once a second: a material first drew
unpatched and relinked up to 1 s later. The black shoreline
(`video/report.md` 5.6–6.3 s) was water drawn on layer 0 for its first
frames.

- The patch walk runs in `scene.onBeforeRender`, once per frame, over
  visible objects (0.36 ms per 5 100 meshes, VM ratio), so every new
  material is patched before it draws.
- Streamed builds are patched through the sky's lit preparer
  (`setLitPreparer` / `litPreparerOf`) and warmed with
  `renderer.compileAsync(next, camera, scene)` before they swap in
  (settlement layer; the wait is capped at 4 s).
- **Settlement materials are shared per kit** (one clone per glTF
  material per kit, was one per part); re-applying the same surface state
  relinks nothing; the cache key is stable.
- **Flame gain is a uniform** (`esSettlementFlameGain`), not part of the
  program key (it was one program per distinct gain).
- **Water is on its layer at creation** (`layers={waterLayers}` on the
  mesh), never set in an effect after paint.

## 3. Streaming is view-gated and builds once

- **A cell builds once, at the settled LOD** (`cellRegistry.ts`,
  `LOD_SETTLE_MS` 400): the startup replay went from 83 builds of 49
  cells to 49. Ground-cover tiles wait for terrain LOD 1 under all four
  corners (134 tiles built on coarse heights before, 0 after).
- **Build order is in view and near first** (`viewPriority`, ground cover;
  vegetation's urgent switch-ons).
- **Startup budget: 24 ms a frame for the first 6 s** (ground cover's
  `generateBudgetMs`, then 12 ms while more than 40 tiles are wanted, then
  4 ms; `FrameWorkQueue`, commit 674a7cb8). The generator stops *before* a
  step the running mean says would overrun.
- **Ground-cover fills are phased** (near band, mid band, drain;
  `groundcoverSchedule.ts` `fillDue`): 16 fills on a cold start became 4,
  and the visible waves 8 became 2.

## 4. Culling works on bounds that can leave the view

- **Vegetation tiles** are tested against the real view frustum, widened,
  with a hysteresis latch (out beyond 25°, back inside 15°); shadow
  casters are kept by a sweep along the sun, not a ring. Jungle, medium:
  35 036 copies submitted before, 22 230 after, 13 163 in view (veg.md).
- **Ground cover:** a 24 m core disc plus 8 wedges, each drawn when a tile
  box meets the frustum (`SectorCuller`): 19 840 instances submitted
  before, 8 270–10 720 after, 5 865–6 300 in view. `?gcsec=1|4|8` is the
  owner's A/B.
- **Settlement buckets are split per 48 m square**
  (`SETTLEMENT_CHUNK_M`), each chunk with its own bounding sphere:
  Greenspring submitted 105–117 of 126 placements before, 56–60 after.
  Near chunks share the kit part's GPU buffers.

## 5. Vegetation tiers fade, never decimate

- **Round 13 part-aware tiers** (`pipeline/tree_tiers.py`, commit
  1a2b3ff4): leaves thinned by keeping whole source cards per cluster,
  bark by keeping whole islands; no decimation (0075). Six heavy trees
  ship tiers (four mid + far, two mid only); the mangroves shipped none.
  Round 13b (d20b2176, `tooling/.reports/16k/walk5/perf/round13b.md`): a
  bark-tube rebuild (ring skeleton swept as an n-sided section) passed the
  silhouette bar on the mangroves but failed the Sonnet image judges (a cone
  over the root flare, trunk breaks, dark bands), so no mangrove tier ships;
  tundrashrub03 ships a far tier (65 %). **So the image judge is a hard gate
  beside the silhouette bar**: `--record` refuses a bark-tube level with no
  judge PASS (round 13c, `round13c.md`). Round 13d (`round13d.md`): source
  bark kept whole and the leaves carded passes the bar only at 97-100 % of
  the source (gkb9 0.97, gkb8 0.99, gkb2 0.99; leaves are 5-19 % of their
  triangles), so no mangrove mid ships and their only lever is the far
  impostor. (The source was rendered with the 0.5 leaf cutoff since found
  wrong; leaves at 5-19 % of the triangles bound any leaf method at
  0.81-0.95 whatever the cutoff.) **Leaf cutoff is the NIF's** (walk 5):
  every foliage material ships glTF MASK at its NiAlphaProperty threshold /
  255 (the mangroves 45-70, 0.18-0.27; 111 of 112 alpha-tested flora species
  changed), the card bake clips at the same cutoff, and the studio keeps
  it on mesh levels (cards stay 0.5). The share cap is a setting (`treeTiers.maxShare`, per asset
  `maxShareByAsset`; an over-cap level needs the judges). tundrashrub03's far
  tier is removed: its draw distance ends inside the small-plant full-mesh
  radius, so it was never drawn.
- **Octahedral impostor for the card rung** (walk-5 impostor lane; bake
  `pipeline/impostor_bake.py`, runtime game-core `vegetation/impostor.ts`):
  a 12x12 (14x14 where the card needs it) hemi-octahedral atlas of the
  tree's own mesh (albedo, normal,
  depth), one quad per instance, three frames blended with a depth walk. It
  replaces the card rather than sitting before it (two triangles against
  four, every direction), and starts no nearer than the tree's impostor
  texel height. **Its bar is its own** (lead, walk 5): a view-sampled far
  stand-in ships when its silhouette IoU beats the card it replaces in
  every view (`impostor_bake.beats_card`, same views and masks) AND 2
  Sonnet judges pass its sheets (`judges_passed`); the 0.90 same-view bar
  below is for mesh tiers only (no view-sampled stand-in of a twiggy tree
  can reach it: the source's own silhouette changes 19-22 % per 3 degrees,
  `impostor.md`). Impostors are not startup payload: the studio reads the
  sidecar at once, withholds those species' cards (the last mesh level runs
  to the draw distance) and loads the GLBs after the 6 s startup window
  (`useFloraKit`, `withholdCards`). Against the corrected
  (NIF-cutoff) source, gkb2 and gkb8 ship (IoU min 0.857 / 0.888, card
  0.48-0.87 / 0.43-0.91, both judges PASS; 3.6 + 4.2 MB, 192 px frames:
  160 px saves 17 %, not half). gkb9 first lost views 3 and 7 (the +-X
  azimuths, its card's face-on views) to its card. Root cause: every grid
  cell split on its anti-diagonal, so the grid's main diagonal (+-X) was
  never a triangle edge and a 5-degree view there blended two frames
  5.7 degrees off-axis with the on-axis frame at weight 0.12. The split now
  follows the axis diagonals per quadrant (`select_frames` / `selectFrames` /
  the GLSL, one rule), which lifts views 3 and 7 on every species (gkb9
  0.887/0.907 -> 0.908/0.922 on the same atlas) and changes no other view;
  pinned extra frames were not needed. gkb9 and gkb2 then bake at grid 14
  (1.36x bytes) to clear the card with margin in every view (gkb9 0.885-0.942
  vs card 0.53-0.925; gkb2 0.836-0.93 vs 0.49-0.873; fresh judges had failed
  gkb2's grid-12 crown in views 3/6/7); gkb3 (placed in palettes, never
  baked before) and gkb8 stay at grid 12 (gkb3 0.89-0.954 vs 0.479-0.898).
  All four ship, 2 Sonnet PASS each: 18,462,948 B, loaded after the startup
  window (+10,649,088 B on the site). `tooling/.reports/16k/walk5/perf/impostor-ship.md`.
- **The bar is silhouette IoU ≥ 0.90 in every one of 8 views on masks
  closed by a disc of 1.5 % of the tree's pixel height, and no view losing
  more than 5 % coverage**, rendered at the hand-over distance. Not raw
  per-pixel IoU: the source rendered against itself moved half a pixel
  scores only 0.84–0.90 raw (willow02a far 0.838), so a raw 0.9 bar would
  fail the source.
- **The ladder reads the kit's level count** (`floraKit.speciesRings`,
  levels surviving the dedupe; `folded` means one mesh level), and hands
  over by **projected screen size** (`HANDOVER_PX`, never nearer than the
  distances round 13 validated).
- **Temporal dithered cross-fade:** rung edges fade over 0.4 s from an
  8-sample camera history; every pixel is kept by exactly one copy every
  frame (`lodFadeTemporal.test.ts`, `ladderCoverage.test.ts`).
- **Bushes hold full mesh to 35 / 50 / 65 m** (low / medium / high).
- Ground-cover pop-out (`tooling/.reports/16k/walk5/perf/gc-popout.md`):
  the cause was the ring-wide budget thin factor recomputed at every fill,
  which re-chose which plants survived (57,596 pop-outs in a 1.5 km walk
  replay). A plant's survival is now a per-plant roll against a per-tile,
  distance-ramped threshold (near band never thinned), so walking closer
  never removes a plant shown further out: 0 pop-outs in the replay
  (a19bbc56, `groundcoverThin.test.ts`).

## 6. Quality defaults are never lowered to win frames

A frame is won by doing less invisible work (lights nobody sees, copies
off screen, rebuilds, relinks, allocations), never by lowering a visible
default. **Canvas MSAA stays on by default** (owner ruling, walk 5; commit
6e4d0cbe reverted the lane's `aa` off switch; `?aa=0` is the A/B).

## 7. Owned by the WebGPU lead, not built on WebGL

Tiled or clustered lighting, GPU culling with indirect draws, and honest
GPU timing need compute and timestamp queries: three's `TiledLighting` is
WebGPU-only, and WebGPURenderer is slower than WebGLRenderer on
many-mesh scenes today and drops `onBeforeCompile` (research.md §1–2).
They are not built on WebGL; the WebGPU lead owns them, starting from this
baseline.

### Baseline for WebGPU

| measure | value | source |
|---|---|---|
| light evaluations, night, 16 PointLights | ~55 M per frame (3.4 M lit fragments × 16) | audit.md 1 |
| vegetation copies submitted vs on screen (jungle, medium) | 35 036 vs 13 163 before; 22 230 vs 13 163 after | veg.md 1 |
| ground-cover instances submitted vs in view | 19 840 before; 8 270–10 720 vs 5 865–6 300 after | gc.md |
| draw calls (renderer.info, SwiftShader) | 71 Claywater night; 289 / 392 Greenspring night / noon; 426 jungle | baseline.md |
| programs (renderer.info.programs) | 72 Claywater night; 96 / 106 Greenspring night / noon; 99 jungle | baseline.md |
| HUD `gpu` line | wall time on Metal (ANGLE): includes back-pressure, not shader work | audit.md 8 |

## 7a. Walk-8 rows (owner: Greenspring night rain, 35–42 fps on the M2)

- **On-screen passes reuse pass 1's world matrices**: WaterPipeline sets
  `scene.matrixWorldAutoUpdate = false` for the water, precipitation and
  overlay renders, so three's whole-scene `updateMatrixWorld` walk runs once
  a frame, not four times. Node bench over three r184: one walk is 0.39 ms
  at 4k objects and 1.45 ms at 12k on the VM, so the three walks removed
  were 1.2–4.3 ms of VM CPU (a ratio; the M2 runs JS ~2–3x faster).
- **Settlement draws are static** (audit row 16): every InstancedMesh and
  far merge sits at identity with `matrixAutoUpdate = false`. Settlement
  pieces were already one InstancedMesh per kit part per chunk bucket, so
  no instancing work was left.
- **`shadowMapSize` is a quality field**: low/medium 2048 (unchanged),
  high 4096 (+48 MB GPU, ~4x shadow fill on update frames); `?quality=high`
  or `?q=high` or the HUD picks it, high also raises DPR to 1.25.
- Audit row 15 (cascade update periods) does not apply in character view:
  it draws one cascade, already refreshed every other frame.
- Rain is one shader-animated draw built once; the ripple and light-field
  code holds no per-frame allocations.

## 7b. Post-process row (owner 2026-10-01: glow round bright lights at 60 fps on the Honor Magic V5 and the M2)

- **Bloom only**: `packages/game-core/src/render/post/BloomPass.ts`, one
  injected instance, drawn by WaterPipeline above water after the overlay
  pass: prefilter of the linear HDR scene target × exposure at half the
  canvas (soft knee, threshold 4 ± 2 in exposed units), the flame layer
  added depth-tested (flames carry `BLOOM_SOURCE_LAYER` 7 beside the
  precipitation layer; rain does not), dual-filter mip chain (≤ 5 levels,
  8 px floor), composited additively (strength 0.35, tuned on Claywater and KeebaHouseFisher at 22:00). Research estimate
  0.6–1.2 ms Adreno, 0.3 ms M2 (cheap-sky-and-post-effects doc §2); the
  owner's HUD line `post on · bloom gpu … ms` is the measurement, `?post=0`
  the A/B. No extra MSAA resolve: it reads the scene target the blit
  already resolved.
- **No colour grade**: ACES runs inside the blit; a grade would change the
  default look or add a pass, so none is drawn.
- **No `alphaToCoverage`**: foliage draws into the water pipeline's scene
  target, `samples: 0` on both tiers; canvas MSAA does not reach it.
- Not drawn: under water, with `?water=0` (no pipeline), in Fly3D.

## 7c. Walk-9 rows (owner: Riverwalk night rain with lamps, 32–42 fps on the M2)

| item | outcome | evidence |
|---|---|---|
| Terrain splat samples | taken (`groundMaterial.ts` `esTexelCol`, map_fragment): a uniform 2×2 control patch shades once, the second id is sampled only when its blend is above 0, the near samples only where fade < 1; pixel-identical | province control raster: 41.9 % of 2×2 patches uniform, 48 % of texels blend 0; near-field array samples per fragment ~8 to ~4.2 (−48 %) |
| "Terrain noise bake" (walk-8 list) | does not exist: the ground shader has no procedural noise (macro brightness is in the tint raster); its cost was the splat sampling above | `groundMaterial.ts` |
| Rain passes | kept: 2 draws in the one precip pass, ~0.20 M fragments a frame (0.14× a 1470×956 screen; outer shell 0.03 M) of a 3-line shader | Monte Carlo over the RainSystem vertex law |
| Ripple, foam, bloom targets | kept: ripple 128², foam 512²/256² by tier (world sims, not screen-sized); bloom already half resolution; the water surface draws on screen at full resolution by definition | `RippleSim.ts`, `FoamField.ts`, `BloomPass.ts` |
| Foliage depth prepass | not built: it re-issues every foliage triangle, and the M2 pays ~2.6 ms per million (`FRAME_TRIANGLE_BUDGET`), against a 2–4 ms fill estimate; worth it only if the HUD shows the frame fill-bound | owner HUD reading in the performance lane |

## 7d. Walk-10 rows (pod RTX 3070, WebGL, 1280x720, DPR 1; M2 fps = pod fps / 1.38)

Calibration, bar and tooling: [performance lane](../phases/lanes/performance-lane.md#calibration-pod-to-m2).
Reports under `tooling/.reports/16k/walk10/` (`perf-lead.md`, `perf-f5a.md`,
`perf-f5b.md`, `perf-f6.md`, `perf-f7.md`). Every change below is invisible: the
image-reader found no difference at any spot (before/after, day and night with
brightened night pairs, aimed village shots with lamps; `perf-img-r3.md`,
`perf-img-shots.md`, `perf-water.md`), and the measured differences were noise.

| change | cause | fix (file, commit) |
|---|---|---|
| Lights seen by every layer render | the precip, overlay and bloom layer renders saw zero lights, so `lights.state.version` bumped twice a frame and every lit material relinked: 508 program re-derivations a frame, 25-30 % of the main thread | `lightEveryLayer`, `water/render/lightLayers.ts`, `WaterPipeline.tsx:258`; 2b160b5a. 508 -> 42.5 a frame |
| Physics step without body snapshots | Rapier `interpolate` default snapshots about 1400 fixed bodies every step: 1-2 ms and 206 KB of garbage a step; the occlusion march was dear too | `interpolate={false}`, `CharacterMode.tsx:615`; position-only occlusion cadence, coarser step; 0e59debb |
| Fixture sprites relinking | a tone-map flip between canvas and bloom target, then three's two-pass DoubleSide transparent path bumping `version` | own bloom materials plus `forceSinglePass`, `settlement/lighting.ts`; 798f8850, 1a1dcb0d. 42.5 -> 5.7 a frame (first links only) |
| Per-frame patch walk, light rig, ripple, foam | `traverseVisible` patch walk every frame; allocating light rig and CityMarkers; ripple sim ran when dry; foam field ran with no water | draw-time patch `sky/drawPatcher.ts` plus 1 Hz sweep; allocation-free rig (`lightRig.golden.json`); ripple skipped dry; foam gated on `WaterData.anyWaterIn`; 798f8850, 1a1dcb0d |
| Camera-pivot overlap test | the test ran against the 257² terrain heightfield: 4 ms a frame, 26-34 % of the main thread | pivot collision-group bit that excludes heightfields; 0d44a501. 7.6 -> 0.006 ms a call (node bench) |
| 3 s hitch | `App.setSpawnKm` stored an equal new object every 3 s, the tree re-rendered, and BorderApron passed a fresh extent array so every apron tile rebuilt its geometry | `samePositionKm`, stable apron deps; 0d44a501 |
| 2 s hitch | `SettlementLayer` retried incomplete builds forever on a 2 s timer (8 route structures on unloaded ground 1-2 km out) | retries on ground arrival; 0d44a501 |
| Empty instanced draws | 660 of 1508 `renderBufferDirect` calls at c drew nothing | `vegetation/drawCount.ts` `setDrawCount`; `mesh.visible = count > 0` in `Vegetation.tsx` and `Groundcover.tsx`; 99d6cff1 |
| Static matrices | vegetation, groundcover, terrain chunk, fixture, smoke, paint, CityMarkers (313) and BorderApron (103) meshes updated matrices they never change | `matrixAutoUpdate={false}`; 99d6cff1, 6f54d9b1, 5577b1ce. 626 -> 210 auto-updating objects, 527 -> 111 static |
| Occlusion sweep height lookups | per-step `store.loaded` key string in the march; a whole-chunk cadence frame cost 4.5-7 ms | `FrameGroundSampler` (`terrainHeight.ts`); `createOcclusionSweep(perFrame = 4)` (`terrainOcclusion.ts`); 99d6cff1, 83b33d7b |
| Hitches from fills and bakes | groundcover generation ran inside a React effect; the settlement pump baked every collider in one step; a rebuild re-joined every run collider into number arrays (7.1 ms) | groundcover fill on the frameWork queue (99d6cff1); `solidSteps` one bake a step with a `solidCache` (83b33d7b); `RunColliderCache` plus typed-array join (252499fc) |
| HUD wrapper and transparents | the per-draw `renderBufferDirect` wrapper (about 0.3 ms a frame) ran with the HUD closed; five transparent materials relinked | wrapper installed only while the perf section is open; `forceSinglePass` on ember, smoke, water effects and crowns, sun shafts, rain; 6f54d9b1 |
| Walk links on first draw | at spot e the short camera arm first faded the player, and `transparent` is in the program key, so every player material linked in one frame; the waterfall kit, mist volume, chute strips and pools linked when they first came into view (41-57 ms trace frames, mostly GPU process) | `warmPlayerFadePrograms` (`character/playerFade.ts`) compiles each new player material in both states; `DrawTargetLinker.linkWhenObserved` links the water's late-drawn meshes at mount (`WaterSurface.tsx`); da35aee2. 16 named walk links -> 0; three unnamed links and one 51-56 ms trace frame remain at the walk's end. Walk p1Low 70-78 -> 66-69 (51-57 -> 48-50 converted), rAF max 34 -> 29-34 ms |
| Found already done | O2 settlement material clones and O3 groundcover card materials: kit.ts clones once per kit and the GLB shares one material per atlas page; the "109 materials" came from a probe that counted per owner name | none; the probe was fixed (rows below) |

Pod uncapped fps / uncapped 1 % low (converted = / 1.38 in brackets). base3 is the pre-fix build; r2-clean is 1a1dcb0d (clean tabs); r3 adds 99d6cff1 and 6f54d9b1; final is the 252499fc build with fd7e4044.

| spot | base3 | r2-clean | r3 | final | final converted |
|---|---|---|---|---|---|
| a Riverwalk night rain | 51.1 (37) | 149 / 110 (108 / 80) | 260 / 200 (188 / 145) | 265 / 204 | 192 / 148 |
| b Greenspring night rain | 36.9 (27) | 114 / 77 (83 / 56) | 225 / 159 (163 / 115) | 218 / 159 | 158 / 115 |
| c Greenspring noon | not loaded | 83.4 / 51 (60 / 37) | 168 / 127 (122 / 92) | 166 / 99 | 120 / 72 |
| d ESE marsh night rain | 52.2 (38) | 161 / 105 (117 / 76) | 278 / 175 (201 / 127) | 284 / 182 | 206 / 132 |
| f Claywater day | not loaded | 160 / 119 (116 / 86) | 245 / 192 (178 / 139) | 245 / 189 | 177 / 137 |
| g open river day | not loaded | 149 / 115 (108 / 83) | 297 / 204 (215 / 148) | 304 / 204 | 220 / 148 |
| e 20 s walk | 45.9 (33) | 133 / 60 (96 / 43) | 241 / 114 (175 / 83) | 228-240 / 104-110 (3 walks) | 165-174 / 75-80 |

The settle windows at final have 0 frames over 20 ms at a-g. The walk keeps one frame of about 34 ms per walk, and its capped 1 % low is 70-78 (converted 51-57).

Agent-caused defects and the tool that changed (decision 0106 d11):

| defect | what changed |
|---|---|
| A baseline taken before the page was ready | `measure.mjs` ready gate; `tooling/gpu-lane/README.md` Gotchas |
| Children ended their turn on a background job | README wait rule; the brief template says to wait in the foreground; 04f0f22f |
| Orphan studio tabs contaminated 1 % lows | `measure.mjs` `closeOrphanPages` with a keeper page; `--smoke` fails on a foreign tab |
| The pod sync script's `pkill -f` matched its own remote shell, so the site server died after every sync | pattern anchored with `^node`; 5577b1ce |
| The q1 probe counted materials per owner name and caused two wrong diagnoses (O2, O3) | `measure.mjs --census` counts by material uuid; README rule: census, profile and walk hitches before the first fix batch |
| Profiler start frames counted as hitches | census window opens 2 s after `Profiler.start`; a856f2f4 |
| Hand-patched `/tmp` probes | probes live in `tooling/gpu-lane/probes/`, run with `--diag`; d7f95f70 |

## 8. How performance is measured

- **No full-studio headless probes.** The VM has no GPU; SwiftShader runs
  shaders on the CPU, so the studio settles in minutes and its ms are not
  frame times (owner ruling mid-lane; `baseline.md` § Stopped early).
- **Node harnesses over the real code** give counts and ratios: copies,
  triangles, draws, programs, rebuilds, fills, samples, allocations
  (`__measure__/vegGate.measure.test.ts`, `groundcoverSchedule.test.ts`,
  `cellRegistry.test.ts`, `fixtureLights/harness`, the ripple bench).
- **The owner's device gives the fps verdict** (Apple M2, deployed
  studio, HUD with `useMarkedFrame` CPU rows; A/B switches `?aa=`,
  `?gcsec=`, `?dpr=`, `?water=`).

## Where each lives

- `packages/game-core/src/render/fixtureLights/`,
  `settlement/lighting.ts`, `settlement/SettlementLayer.tsx`,
  `settlement/materials.ts`, `settlement/kit.ts`, `fx/carriedLightRig.ts`,
  `fx/lodFade.ts`, `vegetation/cellRegistry.ts`, `vegetation/cellGating.ts`.
- `apps/world-studio/src/sky/WorldSky.tsx` (patch walk, install point),
  `groundMaterial.ts` (16 lamps), `vegetation/Groundcover.tsx`,
  `vegetation/groundcoverSchedule.ts`, `vegetation/floraKit.ts`,
  `water/`.
- `tooling/asset-pipeline/pipeline/tree_tiers.py`, `tree_tiers_check.py`.
- The place gate: `place_gates.py` reads `LIGHTS_CAP`; the ruling row in
  `.claude/skills/place-build/references/rulings.md`.
