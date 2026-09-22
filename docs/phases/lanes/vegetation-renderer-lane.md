# Vegetation renderer lane — cells built once, LOD chosen on the GPU

Invoke with **"deliver vegetation renderer round N"**. Runs beside Phase 16
under the lane rules in [README.md](README.md). Owner ruling 2026-09-20: run
it **before 16h starts**, because every chunk from 16h on ends in an owner
walk and the walk must not be judged on a renderer that stutters.

## Goal

The T2 vegetation renderer (`apps/world-studio/src/vegetation/Vegetation.tsx`)
stops rebuilding the whole neighbourhood every 16 m of camera movement.
Instance buffers are built **once per cell when the cell's data arrives**,
detail level is chosen **per pixel on the GPU from the live camera distance**
(decision 0075 unchanged); walking on foot never triggers a
CPU pass over every instance. Draw calls stay at or below today's count.

## Starting state (after round 2, 2026-09-21)

- The cell renderer IS the renderer: `apps/world-studio/src/vegetation/Vegetation.tsx`
  is the round-1 cell path, mounted directly by `Fly3D.tsx` and
  `CharacterMode.tsx`. The old per-rebuild path, the `renderer.ts` selector
  and the `?veg=` flag are gone, as is `lodCopies` (it lives on in
  `packages/game-core/src/vegetation/cellBuild.test.ts` as the parity oracle).
- Reusable parts sit in `packages/game-core/src/vegetation/`
  (`cellBuild.ts`, `cellGating.ts`, `cellRegistry.ts`, `occlusionMask.ts`)
  and `packages/game-core/src/fx/batchData.ts`.
- Measured at the jungle site (the lane's only measuring site, owner
  2026-09-20): draws 161–171 against the old path's 191–227; 3.96 M
  submitted triangles against 2.6–2.7 M; zero cells built or rebuilt while
  walking 200 m. Open: `gatingMaxMs` 5.5 at visibility flips on this VM,
  against the 0.5 ms target — watched at the owner walk.
- Binding records: 0048 (between-region ladder), 0071 (card tier for every
  placed thing; terrain occlusion beyond 120 m per 32 m cell), 0072
  (ground-cover tiers; 16 samplers), 0075 (LOD ladder, hard steps), 0082
  (this lane). The vegetation data, bundle format and scatter are 16g's and
  frozen: this lane reads them, never re-authors them.
- Ground cover (`Groundcover.tsx`, `vegetationPatches.ts`) is a separate,
  tile-based renderer, and it is IN this lane (owner 2026-09-21: "ground
  cover is vegetation; the lane resolves the frame-rate issues whatever the
  cause"). Its generation cost is the round 2 addendum to 0082.

## Design (decided; round 0 records it as a decision)

1. **Cell = vegetation chunk (468 m).** A cell's buffers are built once when
   its chunk decodes and its terrain chunk is at the LOD the cell needs
   (near ring: LOD 1). A cell is invalidated and rebuilt alone when its
   terrain LOD changes (re-grounding) or its chunk unloads. No cell is ever
   rebuilt because the camera moved.
2. **Every rung emitted.** Each instance is emitted into every rung of its
   species ladder with both band edges closed (the `lodCopies` margin logic
   goes away; the shader's per-pixel band test is unchanged). The card rung
   is emitted like any other (0071).
3. **Level gating per cell, per frame, on the CPU, cheaply.** A cell at
   distance range [dMin, dMax] from the camera can only need rungs whose band
   intersects that range; the other copies are switched off for that cell.
   This is a loop over cells × species × rungs (hundreds), never instances;
   it bounds the vertex cost of emitting every rung.
4. **One draw per species part via `THREE.BatchedMesh`** (three 0.184;
   `WEBGL_multi_draw`), holding every cell's copies for that species and
   part, with per-instance visibility used for the cell gating in (3). Per-
   instance data the shader needs (wind tune, LOD band, occlusion cell id)
   goes in a `DataTexture` indexed by the batch instance id, since
   `BatchedMesh` has no instanced attributes. Where `WEBGL_multi_draw` is
   unavailable three falls back to one draw per visible range; round 0
   measures how common that is on the target devices and the fallback draw
   count.
5. **Terrain occlusion stays, without a rebuild.** Each instance carries its
   32 m occlusion cell id; a small R8 `DataTexture` (one texel per 32 m cell
   over the neighbourhood) holds hidden/visible per cell, refreshed a few
   cells per frame under the frame budget from the camera's live position;
   the vertex shader reads its cell and collapses the instance when hidden.
   0071's rule (beyond 120 m, per 32 m cell) is preserved, its evaluation
   moves from "per rebuild" to "incrementally per frame".
6. **Shadows**: cast only by the nearest rung within `SHADOW_CAST_RANGE_M`
   of the camera, decided per cell in the gating loop, as today per bucket.
7. **Colliders unchanged.** `VegetationColliders` keeps its solids list; the
   solids for a cell are derived when the cell is built and the published
   list is the concatenation of live cells (the collider ring selects by
   distance from that list as today).
8. **Quarters go away**: frustum culling is per `BatchedMesh` instance
   bounding sphere (three does this) or per cell in the gating loop; pick
   one in round 0 by measurement, never both.

Round 0 settled the three open points in
[0082](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md):
`drawScale` applies at gating time; underwater species share a batch when
they share a material; per-instance frustum culling is off (2.6 ms per
frame at 80 k on this VM against microseconds for cell spheres) and cells
are culled in the gating loop. Two facts for round 1 from the same record:
a batch's capacity is fixed at construction (size for the ring, re-create to
grow); the wind and fade patches are gated on `USE_INSTANCING` and need
a `USE_BATCHING` branch reading a texture indexed by
`getIndirectIndex(gl_DrawID)`.

## Rounds

### Round 0 — measure, confirm, record (one session) — DELIVERED 2026-09-20 (0082)

- Baseline at the jungle site (planned as three sites; the owner cut it to
  the jungle on 2026-09-20, the densest region deciding for all) with the
  studio's DEV hooks (`__STUDIO_VEGETATION_DEBUG__`, `__STUDIO_FRAME_WORK__`)
  and a `longtask` observer: rebuild ms, frames per rebuild, draws,
  instances, triangles. Recorded in
  `docs/research/vegetation/renderer-rewrite-baseline.md`.
- Confirm in three 0.184: `BatchedMesh` API (geometry ids, `setVisibleAt`,
  bounding-sphere culling, the batch id the shader sees), `WEBGL_multi_draw`
  support figures (caniuse / MDN; Safari); whether `onBeforeCompile`
  patches (wind, fade, CSM) apply to a `BatchedMesh` material (memory:
  CSM clobbers `onBeforeCompile`; see decision 0072 and `fx/`).
- Write the decision record (next free number) from the design above,
  filling in the round-0 numbers; add its addendum lines to 0071 (occlusion
  evaluated incrementally) and 0075 (every rung emitted; per-pixel choice
  unchanged).

Owner 2026-09-20: rounds 1 and 2 run in **one session**, invoked as
"deliver vegetation renderer rounds 1 and 2". The session builds the new
path behind the flag, runs the parity gate and the jungle numbers, then
removes the old path. If a round-1 target is missed it stops at round 1,
commits, then hands off with the numbers.

### Round 1 — build it beside the old path — DELIVERED 2026-09-21

Built, measured and fixed: [0082 § Round-1 realisation](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md)
and [the baseline doc § Round 1](../../research/vegetation/renderer-rewrite-baseline.md).


- New renderer in `apps/world-studio/src/vegetation/VegetationCells.tsx`
  with the reusable parts in `packages/game-core/src/vegetation/`
  (`cellBuild.ts`: instances → per-rung emissions + solids for one cell;
  `cellGating.ts`: the per-frame rung gating; `occlusionMask.ts`) and the
  shader-side data path in `packages/game-core/src/fx/` (batch-id texture
  reads for wind tune, band, occlusion cell).
- Selected by `?veg=cells` in the studio URL; the old renderer stays the
  default until round 2.
- Parity gate (vitest, on a fixture chunk): per species, the set of
  instances the new path emits equals the old path's pass-1 set minus
  occlusion; every instance has one copy per ladder rung.
- Numbers at the jungle baseline site (the lane's only measuring site,
  owner 2026-09-20: densest region, most species): draws, ms per frame
  spent in the gating loop, long tasks while walking 200 m, with
  `probe-frame-work.mjs`. Target: zero rebuilds on movement, gating loop
  under 0.5 ms, draws at or below baseline (191–227).

### Round 2 — switch over, gates, walk — DELIVERED 2026-09-21

Old path, selector and flag removed; `lodCopies` retired to the parity
oracle; gates green. See [0082 § Round 2](../../decisions/0082-vegetation-cells-are-built-once-and-the-gpu-picks-the-rung.md).


- Old path removed; `?veg=` flag removed; `Fly3D` and character mode both
  on the new renderer; underwater kit; shadows; quality tiers.
- Gates: the parity test; a test that a camera move never marks a cell
  dirty; the existing 16-sampler check still green; `npm run preflight`.
- Docs: `docs/world/65-vegetation-scatter.md` T2 paragraph rewritten to the
  cell design; the Vegetation.tsx header comment; lane README row closed.

## Folders

Edits: `apps/world-studio/src/vegetation/Vegetation*.tsx`,
`apps/world-studio/src/vegetation/Groundcover.tsx`,
`packages/game-core/src/vegetation/**`,
`packages/game-core/src/fx/{lodFade,windSway}.ts`,
`packages/game-core/src/render/terrainOcclusion.ts`,
`docs/research/vegetation/renderer-rewrite-*.md`, the decision record and
its addenda, `docs/world/65-vegetation-scatter.md` (round 2), this brief,
PROGRESS.md (index-blob protocol).

Never: `world/**`, `tooling/world-generation/**`, the vegetation bundle
format or scatter, `packages/game-core/src/water/**`,
settlements, the character controller, `ChunkTerrain.tsx` (read its store
only), rasters.

## Gates

`npm test`, `npm run typecheck`, `npm run preflight` before each commit; the
parity and no-rebuild-on-move tests starting with round 1; no new
module-level singletons in `packages/`.

## Owner check

One walk at the end of round 2 (and one at the end of round 1 behind the
flag if the planner wants an early steer): the same jungle site as today's
walks, in character mode, walk 300 m in one direction. Checks: no stutter
bursts when crossing into new ground; trees keep their detail steps at the
same distances as before; nothing pops in behind a ridge; the console shows
no vegetation rebuild lines while walking.

## Performance rounds (owner walks, 2026-09-21 onward)

Invoke a fresh agent with **"continue performance lane in line with my
feedback below"**, followed by the owner's HUD lines and remarks.
The lane's job is the character-mode frame rate at the jungle site, whatever
the cause (owner 2026-09-21); ground cover is in the lane. Every round so far
is a local commit on `main`, none pushed.

### How this works

- **The owner reads, the agent fixes.** No SwiftShader probes on the built
  world for frame-rate questions: this VM has no GPU and a probe takes 15 min
  for numbers that are ratios. The owner starts `npm run studio`, opens the
  jungle URL below, hard-reloads, and reports two DEV HUD lines and what they
  saw. Each round is one root-cause fix, committed by pathspec, then one
  owner reading.
- **The jungle URL:** `?view=character&x=4.02&z=4.61&t=12:00`. DEV switches
  (they survive the studio's URL rewrite): `&veg=0` unmounts the tree/bush
  renderer (ground cover stays); `&vegshadow=0` no tree shadows;
  `&vegshader=off|lod|wind|noaerial` draws batches with those shader patches
  removed; `&q=low` the low quality preset; `&gc=0` unmounts the ground-cover
  renderer; `&dpr=<n>` pins the canvas pixel density to n (0.5..2) instead of
  the preset's cap; `&aa=0` creates the canvas without MSAA; `&vegorder=0`
  leaves every batch at `renderOrder = 0` instead of sorting batches front to
  back; `&csm=<cascades>,<maxFar>` sets the shadow cascade count and reach in
  character mode (the default is `1,160`; `&csm=2,300` is what round 7 ran);
  `&water=0` does not mount the water pipeline or surface (no render-to-target,
  blit, water, precipitation or overlay pass); `&pmrem=0` bakes the sky IBL
  once at mount and never re-bakes it; `&gcquad=1|2|4` (default 4) sets
  how many meshes each ground-cover species, bucket and part is split into
  (4 quarters around the focus, 2 halves on the focus x axis, 1 undivided).
- **HUD line 1** `veg: <fps> fps · gpu <avg>/<max> ms · gate <ms>/<max> ·
  flip <ms>/<max> (<copies>) · pending <batches> · queue <ms>/<max> <job> ·
  draws <n>`: fps is the real frame rate; `gpu` is GPU time per frame (rest
  fps low with `gpu` high and everything else 0 = GPU-bound); `gate` is the
  per-frame rung gating loop; `flip` the time and copies switched visible or
  hidden (three re-walks a batch and re-uploads its index texture per flip);
  `pending` batches still queued; `queue` the shared FrameWorkQueue pump
  (cell builds, terrain tiles, colliders) and its most frequent job.
- **HUD line 2** `gc: rebuilds <n>/s · gen <ms>/<max> · fill <ms>/<max>
  (<instances>) · tiles <live>/<pending> · tile <ms>/<max>`: ground cover.
  `gen` is the tile generation step per frame (budget 5 ms, at most 8 tiles);
  `tile` one tile's cost; `fill` the buffer upload after a rebuild.
- **HUD line 3** `tris <total>: veg <main>+<shadow> · terrain <a>+<b> · gc
  <a>+<b> · other <a>+<b>`: where the frame's triangles came from, and which
  of them were drawn into the shadow map. Each draw is attributed from the
  mesh's `userData.perfTag` (`apps/world-studio/src/character/triangleBuckets.ts`),
  so the four pairs sum to the total; `other` is settlements, characters,
  water and the sky. Shown with `&veg=0` as well, which is the A/B.
- **HUD line 4** `gpu by pass: pre · sky · shadow · scene · blit · water ·
  precip · overlay · ripple · foam · post`, and **HUD line 5** `cpu by stage:
  pre · veg · gc · sky · char · ripple · foam · shadow · scene · blit · water ·
  precip · overlay · post`: the frame's GPU milliseconds per render pass and
  its main-thread milliseconds per stage, 60-frame averages in frame order
  (`packages/game-core/src/fx/frameSegments.ts`, decision 0084 round 10). The
  segment with the worst 120-frame spike carries `(max <ms>)`. The GPU
  segments sum to the `gpu` figure on line 1.
- Every number's meaning and every fix's reason is in decision 0082 § Round 2
  and its addenda; read those before touching anything.

### What the walks found and what was fixed (commits on main)

| Owner reading | Cause | Fix (commit) |
|---|---|---|
| Every tree a white silhouette | haze patch had no batching branch: batched vertices hazed from the world origin | `aerial.ts` batching branch; every placement-reading patch audited (d6cf1365) |
| Walking: up to 8 000 copies flipped a frame, 4–7 fps; "hasn't mounted" console warning | per-frame visibility toggles across hundreds of batches; ChunkTerrain bumped state from a render-time generator | 24 m gate margin, flips queued six batches a frame; terrain bump deferred to mount (3ab1c661) |
| Panning flipped 11 800 copies; load took 30 s to settle | frustum culling by visibility; initial fill went through the queue | distance-only gating, first visibility set at fill, drain time-boxed 1.5 ms (27776d1b) |
| Rest 13 fps with vegetation, 60 without, CPU zero | vertex load: 58 m tiles + 24 m margin drew the near rung to ~140 m over 360° | 29 m tiles as flat arrays, 8 m margin, behind-camera cull with hysteresis (3b392676) |
| `?veg=0` walk 60→5 fps; `gen` 110–555 ms a tile | clearance patches (183, 64 840 vertices) tested per candidate against every segment | segment index per patch, one nearby-patch lookup per tile; GPU timer + shadow switch (832abc14) |
| Rest 21 fps, gpu 27.7 ms, CPU idle; vegshadow=0 saved 3 ms; q=low (36% fewer pixels) saved 35% of the GPU time; "slightly jerky" at 45 fps | GPU fill-bound; at 16 ms GPU the frame straddles the 16.7 ms vsync line and alternates 60/30 fps; batches drew in insertion order across materials; out-of-band rungs were already collapsed in the vertex shader (the collapse predicate stopped at fadeOut >= 1 where the Bayer ceiling is 15/16) | nearest-first batch renderOrder from the gating pass; predicate at the Bayer ceiling; switches `&gc=0`, `&dpr=n`, `&aa=0`, `&vegorder=0` (11fd432b) |
| Rest 20 fps, gpu 28 ms; triangle attribution: 10.8 M/frame = veg 2.6 M + 2.4 M shadow, terrain 1.8 M + 0.7 M, ground cover 2.4 M, other 0.9 M (water 0.6 M); ~2.6 ms per million on the owner's card; veg=0 60 fps at 14.4 ms | geometry-bound: the near rung cast into both cascades; nine chunks at LOD 1 (1.8 m) out to 700 m and LOD 4 for the whole province; ground-cover hero plants (2 298 and 1 424 triangles) drawn as full meshes to 30 m at the highest densities | shadows cast by the mid rung from distance zero (39e2f777); terrain LOD by edge distance 150/900/2800 m with hysteresis, stride-2 LOD 8 beyond, LOD 1-2 cast (560481b4); ground-cover mesh reach proportional to mesh cost, >1000 triangles card-only (0a7e1696); HUD line 3 attribution (fe1b5698) |
| Reading of ee8ec5cd: tris 5.5 M (near 2.5 M, mid 0, far 0, card 0.1 M; shadow 0.1 M), gpu 21.8 ms; owner: some ground cover was a grey flat card up close | the shadow rule picked the card for alpha-tested trees (no caster); the ground-cover card-only case; the 24 m mesh floor and 1.25 dpr | caster = highest non-card level <= 1; no card-only species, reach floor 0.25 (d30d1e11); mesh floor 18 m; default dpr native (this commit) |
| Reading of 07cfc504: rest 22 fps, gpu 22.2 ms, tris 8.6 M = veg 2.6 + 2.5 shadow, terrain 0.9 + 0.4, ground cover 1.4, other 0.9; `&veg=0&gc=0` base 11.9 ms at 2.3 M; walking `tile` 31 ms max; ground cover faded between tiers and read low quality close up | the tier and rung dissolves read as smearing; two hero ground-cover meshes carried most of the ring's triangles; the per-candidate footprint and patch tests were O(candidates x shapes) a tile; two cascades re-drew 2.5 M caster triangles | hard steps at every rung and tier edge, dissolve only at the vanish (1457cdca); `floraspikygrass02` and `swordferncluster01` replaced by drjacopo grasses at 360 and 336 triangles (8c85a4bd); per-tile cell mask plus typed-array placements (3f96fd89); one cascade over 160 m with `&csm=<n>,<far>` (c507b467) |

### State at hand-off (2026-09-22, after round 11)

**What the owner's reading showed.** The jungle at rest ran 22 fps with cpu
25.3 ms, `scene` 14.1 ms of it, and 563 draw calls; with `&veg=0&gc=0` the
same spot ran 60 fps, cpu 5.7 ms, 199 calls. The frame is bound by draw-call
SUBMISSION, not by triangles: 364 calls cost 19.6 ms of main thread, about
54 microseconds each. Vegetation submits 111, ground cover about 250. The
`gpu by pass` line was never a measurement here — ANGLE on Metal answers a
timer query with wall time (23 ms reported at 60 fps) — and the HUD now
marks it as such rather than inviting the wrong conclusion.

**Round 11 (this commit).** Ground-cover tiles are built once: the
once-fetched inputs gate generation until they settle instead of wiping the
whole tile cache when they land, and the chunk manifest is no longer an
invalidation trigger at all (the terrain is frozen and a tile is cached only
once its heights resolved). That double build, plus a mesh swap that removed
the old instanced mesh before adding the new, was the "plants vanish after
load" symptom; the swap is now add-then-drop. The MID and FAR card tiers
share one instanced mesh per species, quadrant and part, cutting ground-cover
draw keys by a third with no visual change. `&gcquad` is the measurement
switch for the quartering. Details in decision 0084, round 11 addendum.

**Next agent, in order:**

1. **Owner reading with `&gcquad=4`, then `2`, then `1`** at the jungle at
   rest: calls, cpu, `scene` and fps for each. Fewer quadrants means fewer
   calls and looser frustum culling; the reading decides which the ring keeps.
   Also confirm `wiped` stays put and `built` stops climbing once loaded.
2. **Vegetation's 111 BatchedMesh draws**, which are one per material key:
   measure how many keys share a texture and could merge into one batch
   (`Vegetation.tsx` batch key, `floraKit.ts` materials). This is the same
   mechanism the ground-cover merge just used, applied to the other renderer.
3. **The ~199 baseline calls** with both renderers off: terrain sub-tile LOD
   draws per chunk, the shadow cascades, sky, water. Count them by name
   before proposing anything.
4. **Popping** of small plants at the 30 m card floor if the owner reports
   it (`lodDistances` floor and slope, floraKit.ts).
5. The lane closes when the owner calls the jungle walk smooth at rest and
   while walking, with line 3 under budget; then the memory note, and
   `deliver 16h part 1` may start.

Preflight is red on three pre-existing items outside the lane (the rasters
manifest held for push day, a stale `water-crossings.json`, a `known_red`
blueprint), queued in the polish backlog rows 45-46.

## Closing the lane

- [x] Row in the lanes README marked closed with the decision number (reopened for the performance rounds above).
- [x] PROGRESS.md row.
- [x] The 0071/0075 addenda in place (round 0).
- [ ] The owner calls the walk smooth (§ Performance rounds).
- [ ] Memory note; 16h may then start.
