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

## Starting state (2026-09-20)

- One rebuild per 16 m (`LOD_REBUILD_MOVE_M`) or per chunk arrival, throttled
  to 0.75 s: pass 1 walks every instance of every loaded chunk (about 80 k at
  chunk ring 2) doing distance, a terrain-occlusion horizon test per 32 m
  cell, a ground-height sample and the LOD-copy choice; pass 2 refills one
  `InstancedMesh` per (species, level, quarter, part) from a pool. The
  merge-across-chunks design exists because per-chunk meshes measured 449
  draws for 13 chunks (comment at Vegetation.tsx ~515).
- The 16g follow-up round (2026-09-20) slices that rebuild over frames with
  the shared `FrameWorkQueue` (`packages/game-core/src/scheduling/`), which
  removes the hitch but not the work. The queue stays: ground tiles,
  colliders and buildings use it.
- The shader side already does the right thing: `packages/game-core/src/fx/lodFade.ts`
  keeps a single copy per pixel by a Bayer test against each copy's
  distance band (hard steps, 0075; dithered vanish only at the ladder's end).
  The CPU emits an instance only into the rungs within reach of the next
  rebuild (`lodCopies`), which is the sole reason the buffers depend on where
  the camera is.
- Wind tuning and the LOD band ride per-instance attributes on a per-block
  geometry view (`WIND_TUNE_ATTRIBUTE`, `LOD_BAND_ATTRIBUTE`).
- Binding records: 0048 (between-region ladder), 0071 (card tier for every
  placed thing; terrain occlusion beyond 120 m per 32 m cell), 0072
  (ground-cover tiers; 16 samplers), 0075 (LOD ladder, hard steps). The
  vegetation data, bundle format and scatter are 16g's and frozen: this lane
  reads them, never re-authors them.
- Ground cover (`Groundcover.tsx`) is a separate, tile-based, already
  budgeted renderer. Out of scope.

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
path behind the flag, runs the parity gate and the jungle numbers, and only
then removes the old path; if a round-1 target is missed, it stops at round
1, commits, and hands off with the numbers.

### Round 1 — build it beside the old path

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

### Round 2 — switch over, gates, walk

- Old path removed; `?veg=` flag removed; `Fly3D` and character mode both
  on the new renderer; underwater kit; shadows; quality tiers.
- Gates: the parity test; a test that a camera move never marks a cell
  dirty; the existing 16-sampler check still green; `npm run preflight`.
- Docs: `docs/world/65-vegetation-scatter.md` T2 paragraph rewritten to the
  cell design; the Vegetation.tsx header comment; lane README row closed.

## Folders

Edits: `apps/world-studio/src/vegetation/Vegetation*.tsx` (not
`Groundcover.tsx`), `packages/game-core/src/vegetation/**`,
`packages/game-core/src/fx/{lodFade,windSway}.ts`,
`packages/game-core/src/render/terrainOcclusion.ts`,
`docs/research/vegetation/renderer-rewrite-*.md`, the decision record and
its addenda, `docs/world/65-vegetation-scatter.md` (round 2), this brief,
PROGRESS.md (index-blob protocol).

Never: `world/**`, `tooling/world-generation/**`, the vegetation bundle
format or scatter, `Groundcover.tsx`, `packages/game-core/src/water/**`,
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

## Closing the lane

Row in the lanes README marked closed with the decision number; PROGRESS.md
row closed; memory note; the 0071/0075 addenda in place; 16h may then start.
