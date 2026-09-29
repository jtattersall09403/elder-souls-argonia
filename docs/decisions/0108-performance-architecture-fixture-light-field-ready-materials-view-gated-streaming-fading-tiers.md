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
