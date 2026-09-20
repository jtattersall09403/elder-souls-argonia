# 0082 — Vegetation cells are built once; every rung is emitted; the GPU picks the rung; cells are gated and culled, never instances

**Date:** 2026-09-20. **Status:** accepted (planner, round 0 of the
vegetation renderer lane, on the owner's 2026-09-20 ruling that the lane
runs before 16h). Amends 0071 (occlusion evaluated incrementally) and 0075
(every rung emitted; per-pixel choice unchanged). Numbers from
[renderer-rewrite-baseline.md](../research/vegetation/renderer-rewrite-baseline.md).

## What the owner asked

Walking on foot must not stutter when the character crosses into new ground.
Every owner walk from 16h on must be judged on a renderer that does not
rebuild itself as the camera moves. The lane brief
([vegetation-renderer-lane.md](../phases/lanes/vegetation-renderer-lane.md))
fixed the design; round 0 measures the starting point, confirms the
three.js facts behind the design and settles its three open questions.

## Evidence

- **The rebuild is the work, not the hitch.** Today one rebuild runs per 16 m
  of camera travel or per chunk arrival (0.75 s throttle). Pass one walks
  every instance of every loaded chunk (distance, occlusion horizon per 32 m
  cell, ground sample, rung choice); pass two refills one `InstancedMesh`
  per (species, rung, quarter, part). The 16g follow-up slices it over
  frames through `FrameWorkQueue`, so the long task is gone but the CPU pass
  is not; the baseline measures its size at three sites (§ Round-0 numbers).
- **three 0.184 `BatchedMesh`** (`node_modules/three/src/objects/BatchedMesh.js`):
  `addGeometry` returns a geometry id, `addInstance(geometryId)` an instance
  id; `setMatrixAt`, `setVisibleAt`, `setColorAt`, `deleteInstance`,
  `optimize`; capacity is fixed at construction (`addInstance` throws at
  `maxInstanceCount` with no recycled id), so a batch is sized for the ring
  and re-created to grow. `perObjectFrustumCulled` (default on) transforms
  one sphere per instance per frame on the CPU; `sortObjects` is on by
  default with a `customSort` hook.
- **What the shader sees.** There is no `batchId` attribute. Under
  `USE_BATCHING` the id is `getIndirectIndex(gl_DrawID)`, which is the same
  instance id `setMatrixAt` uses; `gl_DrawID` comes from
  `WEBGL_multi_draw`; without the extension three defines it as a
  uniform set per range. The instance matrix is `batchingMatrix`, read
  from `batchingTexture`. So a `DataTexture` indexed by
  `getIndirectIndex(gl_DrawID)` carries whatever per-instance data the
  shader needs.
- **The repo's patches are instancing-only.** `fx/lodFade.ts` reads
  `esLodBand` (vec4) and `instanceMatrix[3].xyz`; `fx/windSway.ts` reads
  `esWindTune` (vec2) and the `instanceMatrix` basis; both are gated on
  `#ifdef USE_INSTANCING` and fall to a neutral branch otherwise (fade
  always visible, sway unrotated and neutral). On a `BatchedMesh` they do
  nothing until ported. The CSM `setupMaterial` clobber and the
  `reapply*` hooks are unchanged by batching.
- **Shadows** work: `batching_pars_vertex` and `batching_vertex` are in the
  depth and distance shader libs, so the default shadow materials place
  batched instances; a custom depth material must derive from the shader
  lib and carry the wind displacement itself, as `windSway.ts` already notes.
- **Multi-draw support** (from the three source plus browser knowledge,
  medium-high confidence): Chrome and Edge since 2021, Safari and iOS since
  16.4 (March 2023), Firefox not shipped. Without it three issues one draw
  per visible range plus a uniform write, so on Firefox the draw count is
  the number of contiguous visible ranges, not the number of batches.
- **Per-instance culling is not affordable at ring size.** A node
  micro-benchmark of exactly the per-instance work three does in
  `onBeforeRender` (sphere copy, matrix apply, frustum test), median of 50
  runs on this VM:

  | Instances | Per-instance cull | 400 cell spheres only |
  |---|---|---|
  | 20 000 | 0.59 ms | 0.02 ms |
  | 80 000 | 2.60 ms | 0.002 ms |
  | 160 000 | 5.30 ms | 0.002 ms |

  This VM's JavaScript timings are ratios only, but a 1000× gap is a
  decision at any scale.

## Decisions

1. **A cell is a vegetation chunk (468 m), built once.** Its buffers are
   built when its chunk decodes and its terrain chunk is at the LOD the cell
   needs; it is rebuilt alone when that terrain LOD changes or the chunk
   unloads. A camera move never marks a cell dirty (a gate from round 1).
2. **Every rung is emitted for every instance**, both band edges closed; the
   shader's per-pixel Bayer choice (0075) is unchanged and the `lodCopies`
   margin logic goes away. The card rung is emitted like any other (0071).
3. **Rung gating is per cell, per frame, on the CPU**: a cell whose
   distance range cannot intersect a rung's band has that rung's copies
   switched off through `setVisibleAt`. Cells × species × rungs, never
   instances. Quality tiers apply their `drawScale` here, at gating time.
4. **One `BatchedMesh` per species part**, holding every cell's copies for
   that part. Capacity is the ring's instance budget for that part, sized
   from the loaded chunks' counts with headroom; the batch is re-created
   when a load would exceed it. `perObjectFrustumCulled = false` and
   `sortObjects = false`: frustum culling is per cell in the gating loop
   (the benchmark above); depth sorting is not needed for opaque
   alpha-tested foliage.
5. **Per-instance data rides a `DataTexture` indexed by
   `getIndirectIndex(gl_DrawID)`**: one RGBA float texel (or two) per
   instance for the LOD band and wind tune, plus the 32 m occlusion cell id.
   `lodFade.ts` and `windSway.ts` gain a `USE_BATCHING` branch that reads
   the texture and uses `batchingMatrix`; the `USE_INSTANCING` branch stays
   for ground cover and any remaining instanced user.
6. **Terrain occlusion stays and is evaluated incrementally** (0071
   addendum): a small R8 `DataTexture`, one texel per 32 m cell over the
   neighbourhood, refreshed a few cells per frame under the frame budget
   from the live camera; the vertex shader collapses hidden instances.
7. **Shadows** are cast only by the nearest rung within
   `SHADOW_CAST_RANGE_M`, decided per cell in the gating loop.
8. **Colliders unchanged**: solids for a cell are derived at cell build and
   the published list is the concatenation of live cells.
9. **The underwater kit's species share the per-part `BatchedMesh` when they
   share the material**, since one batch is one material; a species with its
   own material is its own batch. Round 1 counts the resulting batches
   against the baseline draw count and the Firefox fallback figure.
10. **Draw budget rule**: draws must stay at or below the jungle baseline
    under multi-draw; the Firefox fallback count is reported alongside,
    never hidden. The jungle site is the lane's only measuring site (owner
    2026-09-20): it is the densest region with the most species, so what
    meets its numbers meets every other site's.

## Consequences

- Round 1 builds `VegetationCells.tsx` behind `?veg=cells` with the reusable
  parts in `packages/game-core/src/vegetation/` (`cellBuild.ts`,
  `cellGating.ts`, `occlusionMask.ts`) and the `USE_BATCHING` branches in
  `fx/`; round 2 switches over and removes the old path.
- Parity gate (round 1): per species, the new path's emitted set equals the
  old pass-1 set minus occlusion; every instance has one copy per rung.
- The lane never touches the vegetation bundle format, scatter, ground
  cover or rasters (brief § Folders).
- `probe-frame-work.mjs` is the lane's measuring stick; it now reports
  draws, instances, triangles and the rebuild count so rounds 1 and 2 are
  compared on the same lines.

## Round-0 numbers

Jungle site (x 4.02, z 4.61), chunk ring 2, SwiftShader on this VM (ms are
ratios, counts exact); the last rebuild after walking 200 m:

| Rebuild total / pass one / pass two ms | Frames | Instances emitted | Draws | Triangles | Culled | Occluded |
|---|---|---|---|---|---|---|
| 1 373 / 1 139 / 234 | 647 | 31 986 | 227 | 2 707 168 | 97 375 | 12 817 |

Pass one, the per-instance CPU walk this record removes, is 83–99 % of a
rebuild. Draws to beat: 191–227.
