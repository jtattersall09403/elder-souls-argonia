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

## Round-1 realisation (2026-09-20)

Built behind `?veg=cells` as `apps/world-studio/src/vegetation/VegetationCells.tsx`,
with the reusable parts in `packages/game-core/src/vegetation/`
(`cellBuild.ts`, `cellGating.ts`, `cellRegistry.ts`, `occlusionMask.ts`) and
`packages/game-core/src/fx/batchData.ts`. The old renderer stays the default.

- **Batch key** is `material.uuid | depthMaterial.uuid | attribute signature |
  near/far | card/mesh`. Near and far are separate batches because the near
  one casts shadows and the far one does not; card and mesh are separate
  because a card never sways and never receives shadow.
- **Per-instance data** is two RGBA32F texels per instance on a
  `DataTexture` per batch, indexed by `getIndirectIndex(gl_DrawID)`: texel 2i
  is the LOD band, texel 2i+1 is (stiffness − 1, sink). `lodFade.ts` and
  `windSway.ts` both emit the same `#ifndef ES_BATCH_DATA` head, so either
  may be applied first and the preprocessor drops the duplicate.
- **Gating is hierarchical: cell, then 58 m tile.** A cell is 468 m across and
  a plant's draw distance is 24–100 m, so switching a whole cell on because
  one corner of it is in range submitted an order of magnitude more vertices
  than could be seen (16–27 M triangles against the old path's 2.7 M). Each
  species' instances are therefore SORTED at build into an 8 × 8 grid of gate
  tiles (`tileOffsets`, CSR, with per-tile extents), so a tile's copies are
  one contiguous run of batch instances. The gate resolves the cheapest level
  that answers: a cell wholly outside a band, or wholly inside it, answers for
  all 64 tiles at once and costs one distance test; only a cell the band's
  edge CROSSES pays a test per tile. `gateSpecies` reports
  `visibleCopies`, `visibleTriangles`, `checksCell` and `checksTile`. Those
  counters are the published stats; nothing re-walks the ranges.
- **Occlusion is a shader mask**: a 128² R8 texture over 32 m cells, 64
  occupied cells re-rayed per frame from the live camera, with the vertex
  shader collapsing an instance whose cell is hidden beyond
  `OCCLUSION_MIN_DISTANCE_M`. 0071's rule is unchanged; only where it is
  evaluated moved. The window is anchored on the FOCUS CHUNK, not on the
  camera's 32 m cell: re-anchoring every 32 m wiped the mask faster than a
  frame's cells could refill it, so occlusion was effectively off while
  walking, which is the one case it exists to serve. An anchor move reports
  itself so the wipe is uploaded (the uniform must never point at a window the texture does
  not hold). The sweep iterates the OCCUPIED cell list, never the 16 k texels.
  `occluded` is published as INSTANCES in hidden cells, like-for-like with the
  old path, not as a count of hidden texels. **Only an anchor move wipes the
  mask.** A cell built or dropped changes the occupied set while every answer
  the sweep has already paid for stays good. A dropped cell clears its OWN
  texels (`clearCells`), since nothing sweeps them once it goes. A built cell
  only appends; its new texels already read 0 = visible. Wiping on every load
  and eviction left occlusion off for most of a walk.
- **Materials are owned per BATCH KEY and patched once.** `Material.copy`
  JSON-clones `userData` and drops `onBeforeCompile`, so cloning an
  already-patched material yields a husk that every `apply*` guard treats as
  patched: a batch that grew past capacity drew with no LOD fade, no wind and
  no occlusion. A capacity growth now re-creates only the `BatchedMesh` and
  the data texture, re-pointing `uniforms.esBatchData`. `reapplyBatchData`
  joins `reapplyWindSway`/`reapplyLodFade` in WorldSky's CSM restore list, for
  the same reason they are there.
- **Wind is patched onto EVERY batch material, unconditionally.** A batch key
  is a material. One glTF material is shared across primitives, so a rock and
  a plant can land on the same key; patching only when the species that
  created the batch swayed left that plant still for the session. Stillness is
  per INSTANCE instead: a non-swaying species and every card copy carry
  stiffness −1 in the data texture.
- **Near-rung batches cast shadows and are never frustum-culled** — they cast
  into the cascades from off-screen, so culling the cell would cull the
  shadow with it. Far batches are culled per cell in the gating loop against
  the cell's bounding sphere.
- **A `drawScale` (quality tier) change rebuilds every cell; a kit arrival
  rebuilds only the cells that SKIPPED one of the arriving species.** A cell
  records the species it met but the kit did not hold, as `skippedSpecies`. A
  cell never re-dirties for a species it has already built, so the underwater
  kit arriving no longer rebuilds the whole ring.
  Both are rare and user-driven. Movement never does: `CellRegistry`'s
  `cameraMoved` is a no-op the unit test asserts.
- **Eviction at ring + 1**: a cell further than that from the focus chunk
  gives its batch instances back through `deleteInstance`.
- **The Firefox fallback figure** is reported as `drawsFallback` — the number
  of visible copies, which is what three issues without `WEBGL_multi_draw`.
- **Why gating flips are the only per-frame cost**: with
  `perObjectFrustumCulled = false` and `sortObjects = false`, three's
  `onBeforeRender` loop runs only on frames where visibility changed, so a
  frame with no rung transitions costs nothing beyond the uniforms.

## Round 2 (2026-09-21)

The cell renderer is now THE renderer. `VegetationCells.tsx` replaced
`Vegetation.tsx`; the old per-rebuild path, the `renderer.ts` selector and the
`?veg=` flag are gone. `Fly3D.tsx` and `CharacterMode.tsx` mount
`<Vegetation>` directly. `lodCopies`, `LOD_MARGIN_M` and `LOD_REBUILD_MOVE_M`
left `fx/lodFade.ts`: the rule survives verbatim in
`vegetation/cellBuild.test.ts` as the PARITY ORACLE, which asserts the emitted
rungs keep one copy per pixel and pick the same kit level the old rule picked
at every distance. `probe-frame-work.mjs` lost its `VEG` switch and its
old-path rebuild counter.

The round-1 numbers at the jungle site (x 4.02, z 4.61, SwiftShader on this
VM; ms are ratios, counts exact), before and after the tile-gating fix:

| Window | Draws | Triangles | gatingMs / max | Cells built / rebuilt in the window |
|---|---|---|---|---|
| site, before | 92 | 16 230 252 | 0.6 / 3.5 | 0 / 0 |
| site+200 m, before | 95 | 26 736 089 | 0.7 / 3.5 | 2 / 2 |
| site, after | 161 | 3 958 534 | 0.8 / 201.3 | 1 / 1 |
| site+200 m, after | 171 | 3 960 257 | 1.0 / 5.5 | 0 / 0 |

The batch shader is checked by the probe's console gate: a float→int mix in
the `getIndirectIndex` lookup escaped three sessions of SwiftShader probes,
because a program that fails to compile is silent in every CPU counter while
the gating loop keeps publishing healthy draws, instances and triangles.
`probe-frame-work.mjs` now collects every `THREE.WebGLProgram` / shader
compile message into `shaderErrors` per window and exits 2 if any window has
one. `WINDOWS=1` runs the first site only; each window writes a PNG.

Round-0 old path, for comparison: 191–227 draws, 2.59–2.71 M triangles, a
full per-instance rebuild every 16 m. Walking 200 m now builds and rebuilds
nothing; the 201.3 ms at the site is the first gating pass after the initial
fill, inside a window the probe itself reports as `steady: false`.

- **Open item.** `gatingMaxMs` is 5.5 in the steady window, against the
  0.5 ms target. It is spent at visibility flips (a cell or tile crossing
  a band edge), not on every frame — per-frame `gatingMs` is 0.8–1.0. The
  owner's machine measured the same jungle work 5× faster than this VM
  (16f ledger §16), so the expected worst frame there is around 1 ms. It is
  watched at the owner walk rather than optimised blind.
- **Firefox fallback.** Without `WEBGL_multi_draw` three issues one draw per
  visible copy: about 50 000 at the jungle (`drawsFallback`), against 161–171
  with the extension. Reported, never hidden (§ Decisions 10).
- **Kit arrival.** The underwater kit arriving rebuilds only the cells that
  SKIPPED one of its species — 13 of 25 cells at the jungle, once, when the
  kit lands. No other event rebuilds a cell except a quality-tier change.
- **White silhouettes: the haze patch needed a batching branch.** The owner
  saw every batched tree and bush as a white cut-out.
  `apps/world-studio/src/sky/aerial.ts` built `vEsWorldPos` from
  `modelMatrix * (instanceMatrix *) transformed` with no `USE_BATCHING`
  branch, so every copy in a `BatchedMesh` hazed as if it stood at the world
  origin — kilometres of inscatter at province scale, which saturates.
  The rule this sets: **every material patch that reads an instance's
  placement carries both branches.** The patches audited, with their
  verdicts: `fx/lodFade.ts` and `fx/windSway.ts` both branches already;
  `fx/batchData.ts` batching-only by construction; `water/render/causticReceiver.ts`
  both already; `fx/billboardQuad.ts` instancing-only but unreachable — the
  card rung's material is never passed to `applyCylindricalBillboard`
  (no caller outside its own test), so no `BatchedMesh` reaches it;
  `settlement/materials.ts` and `vegetation/Groundcover.tsx` instancing-only
  and correct — both draw `InstancedMesh` only. `aerial.ts` also replaced
  the shared `customProgramCacheKey` instead of appending to it, so two
  differently-patched materials could share one compiled program; it now
  appends `|es-aerial` and guards itself with `userData.esAerialApplied`
  against WorldSky's once-a-second traversal.

- **Movement cost: the gate is widened, run on a step cadence, and applied a
  few batches at a time.** Walking cost the owner's machine thousands of
  `setVisibleAt` calls a frame across hundreds of batches (`flips 1105/8003`,
  stutter and heat), while standing still and turning were smooth. The call
  itself is cheap; the batch it touches is not, because three re-walks that
  whole `BatchedMesh` in `onBeforeRender` and re-uploads its indirect texture,
  so the cost is per BATCH TOUCHED per frame. `gateSpecies` now widens every
  band by `GATE_MARGIN_M = 24` at both edges, so a rung switches on before the
  shader needs it and off long after; the pass runs only when the eye has
  moved 4 m, turned 15deg (the frustum test is all a rotation can change), a
  cell was built or dropped, or 120 frames have passed; and it ENQUEUES into a
  batch-keyed map that applies at most `FLIP_BATCH_BUDGET = 6` batches a
  frame, batches with an ON flip first and then the nearest. ON before OFF
  plus the 24 m margin keeps the resident set a superset of what the shader is
  about to read (a runner at 7 m/s takes 3.4 s to cross the margin; a
  300-batch backlog drains in 50 frames). Standing still now costs nothing at
  all. `pendingBatches` and a rolling `fps` joined the HUD line.

- **Addendum (owner walk 2026-09-21), amending §4 and §8.** Cells are no
  longer frustum-culled in the gate loop: toggling visibility is the expensive
  operation, and panning the camera in place flipped 11 800 copies. Visibility
  is distance-only, initial visibility is set at fill, and the drain is
  time-boxed at 1.5 ms.

- **Addendum (GPU load, 2026-09-21).** At rest the owner's GPU held 13 fps
  with vegetation and 60 with `?veg=0`, at a renderer CPU cost of about zero:
  the load is vertices. 58 m tiles plus a 24 m margin drew the near rung for
  tiles out to ~140 m instead of the ~84 m it is worth, and with the frustum
  test gone the full 360deg was vertex-shaded. `CELL_TILES` is now 16 (tiles of
  ~29 m), `GATE_MARGIN_M` 8 and `GATE_STEP_M` 2, and a tile whose centre is
  over `BEHIND_MIN_M = 40` m behind the eye is off whatever its band says —
  near rungs included, because a shadow cast from behind the camera at over
  40 m is not worth the vertices. The behind test latches with hysteresis
  (off below dot −0.5, back on above −0.2) and the gate pass also runs on a
  20deg turn, since the answer depends on the forward vector; the time-boxed
  drain keeps a turn smooth. Tiles are flat data: a rung shares the build's
  `tileOffsets` and `tileBounds` by reference and carries one state byte per
  tile, so quadrupling the tile count costs a rung less memory than the 64
  tile objects it replaced.

### Round 2 addendum: ground-cover generation cost (2026-09-21)

- Every clearance polygon carries a segment index built at `indexPatches`
  time: an 8 m cell grid for the distance query and 4 m z-bands for the
  crossing test, so a query touches the few hundred segments that can answer
  it instead of all 64 840 in `vegetation-patches.json`. Exactness is the
  gate, not the speed: `vegetationPatches.test.ts` runs 2 500 queries over
  five shapes (one a 3 002-vertex road corridor) against the brute-force
  implementation it replaced.
- A ground-cover tile narrows the patch and footprint lists ONCE, for its
  half-diagonal plus the widest species radius, and skips both tests
  entirely when nothing is near; `survivesPatchesIn` re-applies the exact
  per-candidate bounds test, so the plants are unchanged. One generate call
  takes at most `GENERATE_MAX_TILES_PER_CALL` tiles, since the 5 ms budget
  can only be checked between them, and the HUD's `gc:` line reports the
  per-tile cost.

### Round 2 addendum: shadows are cast from the mid rung (2026-09-21)

At the jungle site at rest the vegetation batches drew 2.6 M triangles in the
main pass and 2.4 M more across the two shadow cascades, because the rung that
cast was rung 0 — the full mesh — and it was redrawn in every cascade. The rule
now: the sun shadow is cast by the MID rung (kit level 1) where a species has
one, by kit level 0 only where it has none (full mesh straight to card), and by
no other rung; cards never cast. The casting rung's depth material takes
`shadowBandFromZero` (`packages/game-core/src/fx/lodFade.ts`), which forces its
inner edge fully in so it casts from distance 0 while its outer edge is
untouched — nothing nearer than the mid band loses its shadow. Whether a batch
casts is part of the batch key, so a flagged depth material is never shared with
a colour-only batch. `&vegshadow=0` still disables all casting.

**Corrected (2026-09-21).** The caster is the highest NON-CARD kit level at or
below 1 — level 1 where the species has a mesh there, level 0 otherwise. Stated
as "level 1 where a rung resolves to it", the rule cast nothing at all for every
alpha-tested species, whose ladder folds to [full mesh, card], so level 1 IS the
card: the trees lost their shadows. `shadowBandFromZero` is set only for a
level-1 caster (a level-0 caster's band already starts at zero) and is part of
the batch key. The rule and its test live in
`apps/world-studio/src/vegetation/shadowRule.ts`. Two other frame-cost calls in
the same change: the full-mesh floor `MIN_MESH_LOD_REACH_M` is 18 m, not 24 m
(at rest the near rung is 2.5 M of the 2.6 M vegetation triangles and the
jungle's small plants sit on that floor), and the default pixel density is
native — `dprMax` 1 at medium and 1.25 at high, down from 1.25 and 1.5, because
rendering above native is supersampling and cost 3.4 ms of a 28 ms frame on the
owner's card.

### Round 2 addendum: the ground-cover full-mesh reach is proportional to the mesh's cost (2026-09-21)

At the jungle site at rest the ground-cover ring drew 2.4 M triangles for
61 376 instances — 39 a plant — because the NEAR tier gave every species the
same `NEAR_FRACTION` 0.4 x radius of full mesh (30 m at high), whether the mesh
was a 250-triangle grass clump or the 2 298-triangle spiky grass sown at 12 144
a hectare. The reach is now per species
(`apps/world-studio/src/vegetation/Groundcover.tsx`):

    nearReachM = NEAR_FRACTION x radiusM
               x clamp(NEAR_TRI_REF / meshTris, NEAR_REACH_MIN, 1)

with `NEAR_TRI_REF` 250 (a typical grass clump: full reach), `NEAR_REACH_MIN`
0.25 and `NEAR_TRI_MAX` 1 000. `meshTris` is the level the NEAR tier actually
draws: the coarsest non-billboard level at or under the cap where the kit ships
one, otherwise level 0. **No species is card-only.** The first cut let a
species over the cap with no decimated level fall back to its card from 0 m;
the owner walked it and read the two such species —
`vanilla:plants/floraspikygrass02` (2 298 triangles) and
`vanilla:landscape/plants/swordferncluster01` (1 424) — as faded grey flat
cards standing beside the player. That case is gone: those two now draw their
own mesh out to the floored reach, 0.25 x 0.4 r — 7.5 m at the high preset,
6.5 m at medium — and hand over to the card there. The same per-species reach
feeds the tile assignment, the NEAR band's outer edge and the MID band's inner
edge, so the card takes over exactly where the mesh stops; nothing else about
the tiers changes. Of the 73 species the ring places, 63 are at or under 250
triangles and keep the full reach and the rest scale down to the floor. The
HUD's `gc:`
line carries `mesh <n>M`, the triangles of the live NEAR-tier instances at the
last rebuild, so the cut is visible from the running studio.
