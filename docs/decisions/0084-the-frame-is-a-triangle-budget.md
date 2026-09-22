# 0084 — The frame is a triangle budget: 4 M triangles per frame, all passes, on the reference card; every band is sized to it

**Date:** 2026-09-22. **Status:** accepted (planner, performance round 9 of
the vegetation renderer lane, on the owner's readings of 2026-09-22).
Amends 0075 §6 (the card ring of a folded ladder moves nearer, as that
record left to the frame numbers) and 0082 (the HUD gains the budget line).

## What the owner asked

"Take a step back: is there something more fundamental going on? We are only
aiming for Skyrim-era graphics; this should be almost trivial on an M2."

## What the readings say

The owner's reference card is an Apple M2 (MacBook, Chrome, ANGLE over
Metal). Across every round since 16f the GPU time has tracked triangles and
nothing else: one quarter of the pixels (`&q=low`, `&dpr=1`) moved the base
frame by under a millisecond, while every change that cut triangles cut time
in proportion, at about 2.6 ms per million for terrain and ground cover and
about 3 ms per million for double-sided alpha-tested foliage. The card draws
roughly 400 million triangles a second in the browser. At 60 fps that is
**about 4 million triangles a frame, counting every pass** (main, the shadow
map, the water and overlay layers).

Skyrim draws one to two million a frame. The jungle at rest drew 6.4 million
(vegetation 2.4 M main + 1.2 M shadow, terrain 0.9 M + 0.3 M, ground cover
0.7 M, other 0.9 M of which the border apron is ~0.5 M and the water grid
0.2 M). No round could reach 60 fps because there was no target to design to:
the ladders, bands and rings were each set on their own visual merits and the
sum was never checked.

## Decision

1. **The frame triangle budget is 4.0 M per frame on the reference card, all
   passes included.** `FRAME_TRIANGLE_BUDGET` in `packages/game-core` is the
   number; HUD line 3 prints the frame total against it. A round that adds
   geometry to the frame states where the triangles come from.
2. **Bands are sized to the budget, in the shipped world, at rest in the
   densest site (the jungle), not per system in isolation.** Working split:
   vegetation ≤ 1.5 M including shadow, terrain ≤ 0.6 M including shadow,
   ground cover ≤ 0.8 M, everything else ≤ 0.6 M. The split is a guide; the
   total is the rule.
3. **A folded ladder hands over to the card at the Skyrim distance.** A plant
   whose mesh chain is one level (every alpha-tested asset, 0075 §6) keeps its
   full mesh to `clamp(height × 5, 30, 140)` m, scaled by the quality tier
   and never below the 18 m floor, and is a card beyond. Skyrim keeps full
   tree meshes only inside its ~140 m loaded grid and treats plants under
   two metres as grass. Before this a 0.9 m chickweed carried 3,832 triangles
   to 100 m and the canopy tree 5,252 to 228 m, because the fold kept the
   third rung's end as the card ring.
4. **Terrain detail is chosen per sub-tile inside the fine bands.** LOD 1
   (1.8 m) to 150 m, LOD 2 to 400 m, LOD 4 to 1,400 m, LOD 8 beyond; a chunk
   within 400 m is sixteen sub-tiles that pick LOD 1 or 2 on their own edge
   distance, with the same skirts that hide cracks between chunks. Choosing
   per 468 m chunk put up to four chunks at full detail where Skyrim has a
   285 m square.
5. **The border apron is frustum-culled** by tile or sector; nothing draws
   behind the camera for free.
6. **The foliage shadow cascade reaches 120 m** (Skyrim's exterior shadow
   distance is ~114 m); casters are the full meshes inside it.
7. **Far terrain hidden behind terrain is not drawn** (owner ask 2026-09-22:
   the apron is visible from few places, and those places carry little
   vegetation, so the budget balances itself). Whole chunks at LOD 4 or 8
   and apron sectors are tested every 0.5 s, or after a 10 m move or 10°
   turn, by marching rays from the camera (raised 5 m) to the five top
   points of the piece's box over the resident LOD 8 heights; a piece hides
   only when every point is behind terrain, and no data never blocks.
   `&occl=0` disables it; HUD line 3 shows `hidden <chunks>c/<sectors>s`.
   `packages/game-core/src/terrain/terrainOcclusion.ts`. No baked
   visibility map: the runtime test cannot go stale against the frozen
   terrain and works for the flyover too.
8. **Ground cover fades between its tiers again** (owner 2026-09-22: "restore
   the fade for ground cover, I preferred it"); rung edges in the vegetation
   renderer stay hard steps (0075 addendum).

## What was not the cause

- Water: one opaque field mesh, drawn once in its own layer, no planar
  reflection re-render; ~0.2 M triangles. The browser's "15 of 16 texture
  units" message is that one material at its designed sampler budget (0072).
- Resolution and shaders: see the readings above.
- The owner's calls: "no decimated foliage" (0075 §6) was right, the shredded
  rungs were empty; the cost came from keeping the old card ring after the
  fold, which that record explicitly left to the frame numbers. "Jump
  between rungs, no fade" and the density calls did not add triangles.
- Local versus deployed: the GPU work is identical; the deployed build
  (c0b4faf7, 2026-09-17) still had the decimated middle rungs, which is why
  it is smoother.

## Addendum 2026-09-22 (same day): the budget is necessary, not sufficient

The owner's readings after round 9 (jungle at rest: 3.0 M triangles from
6.4 M, yet GPU 18.6 ms, CPU 18.7 ms, 25 fps; mountains: 1.9 M, GPU 12.3,
CPU 19.3, 52 fps; `&veg=0&gc=0` GPU 11-12 ms) show two costs that are fixed
per frame and independent of triangles, resolution and site: ~19 ms of
main-thread work and ~12 ms of GPU work. The inference above that "GPU time
tracks triangles" held for the vegetation share only. The budget stays (it
is what keeps the scene share in bounds); the base is attributed by the
round-10 instrument (HUD lines 4 and 5: GPU by pass, CPU by stage;
`&water=0`, `&pmrem=0`) before anything else is changed. Cleared as
suspects by reading the code: BatchedMesh per-instance culling (off since
0082), the PMREM re-bake (the clock does not run at `t=`), clouds (in the
dome shader).

## Round 11 addendum (2026-09-22): the frame is draw-call bound

The owner's reading at the jungle site (`x=4.02 z=4.61`) was 22 fps with cpu
25.3 ms, of which the `scene` stage was 14.1 ms, and 563 draw calls. The same
place with `&veg=0&gc=0` was 60 fps, cpu 5.7 ms and 199 calls. The delta is
364 calls and 19.6 ms of main thread, about 54 microseconds a call: the cost
is submission — three.js state setting plus the browser's GPU process — not
the triangles those calls carry. Vegetation submits 111 of them and ground
cover about 250.

The three readings as the owner gave them (`?view=character&x=4.02&z=4.61&t=12:00&w=clear`, at rest):

```
at rest
veg: 22 fps · gpu 20.6/96.4 ms · cpu 25.3/59.5 ms · calls 563 · gate 0/0.1 ms · flip 0/0 ms (0) · pending 0 · queue 0/0.1 ms - · draws 111
gc: rebuilds 0/s · gen 0/0 ms · tile 0.3/0 ms · phases grid 0.2 · mask 0.2 · cand 29.9 (686 exact) · compose 0.7 · fill 5.1/0 ms (61216) · tiles 350/0 · mesh 0.79M
tris 3.1M / budget 4.0M: veg 0.9M+0.4M (near 0.7M · mid 0.0M · far 0.0M · card 0.1M) · terrain 0.4M+0.0M · gc 0.9M+0.0M · other 0.5M+0.0M · hidden 48c/368s
gpu by pass: pre 0.0 · sky 0.0 · shadow 0.6 · scene 20.0 (max 86.8) · blit 0.0 · water 0.0 · precip 0.0 · overlay 0.0 · ripple 0.0 · foam 0.0 · post 0.0
cpu by stage: pre 0.1 · veg 0.5 · gc 0.7 · sky 0.5 · char 1.4 · ripple 2.8 · foam 0.0 · shadow 3.8 · scene 14.1 (max 20.9) · blit 0.0 · water 0.6 · precip 0.4 · overlay 0.3 · post 0.0

&water=0
veg: 24 fps · gpu 26.7/47.2 ms · cpu 17.4/40 ms · calls 522 · gate 0/1.7 ms · flip 0/0 ms (0) · pending 0 · queue 0/0.1 ms - · draws 102
gc: rebuilds 0/s · gen 0/0 ms · tile 0.5/0 ms · phases grid 0.0 · mask 0.0 · cand 0.0 (0 exact) · compose 0.0 · fill 21/0 ms (60843) · tiles 348/0 · mesh 0.75M
tris 2.6M / budget 4.0M: veg 0.8M+0.3M (near 0.7M · mid 0.0M · far 0.0M · card 0.1M) · terrain 0.4M+0.0M · gc 0.9M+0.0M · other 0.1M+0.0M · hidden 48c/879s
gpu by pass: pre 0.0 · sky 0.0 · shadow 7.2 · scene 19.5 (max 31.4)
cpu by stage: pre 0.1 · veg 0.5 · gc 0.5 · sky 0.2 · char 1.1 · shadow 3.1 · scene 10.5 (max 13.1)

&veg=0&gc=0
veg: off · 60 fps · gpu 23.4/156.5 ms · cpu 5.7/25.2 ms · calls 199
tris 0.9M / budget 4.0M: veg 0.0M+0.0M · terrain 0.3M+0.0M · gc 0.0M+0.0M · other 0.5M+0.0M · hidden 48c/300s
gpu by pass: pre 0.0 · sky 0.0 · shadow 0.4 · scene 22.0 (max 144.5) · blit 0.0 · water 0.0 · precip 0.0 · overlay 0.0 · ripple 0.0 · foam 0.0 · post 0.0
cpu by stage: pre 0.1 · sky 0.1 · char 0.8 (max 22.3) · ripple 2.0 · foam 0.0 · shadow 0.4 · scene 1.9 · blit 0.0 · water 0.2 · precip 0.1 · overlay 0.1 · post 0.0
```

Water is not this machine's problem: `&water=0` gained 2 fps and 8 ms of
CPU, most of it the ripple solver's per-frame bookkeeping (`ripple 2.8`) and
the water surface's 0.4 M triangles in `other`. The shadow pass reading
jumping from 0.6 to 7.2 ms when water is off is the same wall-time artefact:
the first query of the frame absorbs the wait.

The `gpu by pass` figures are not a measurement on this machine. ANGLE on
Metal answers a timer query with wall time, so the line reported 23 ms per
frame while the frame rate was 60. The HUD now says so rather than implying
otherwise: on an Apple or Metal renderer string the line reads
`gpu(wall, not work on Metal)` and the summary figure carries a `~`.

Ground cover was building every tile twice. The tile cache was cleared
whole whenever any of its inputs changed, and that dependency list
(`Groundcover.tsx`, the effect at the file's end) held the chunk manifest and
the four once-fetched inputs — the clearance patches, the region raster, the
tint raster and the settlement exclusions — all of which arrive after the
first tiles are already built. Each arrival wiped the lot. The chunk manifest
never belonged there at all: a tile is cached only once its 9x9 heights
resolved, and the terrain is frozen, so a chunk arriving cannot change a
cached tile. The fix inverts the relationship. The small once-fetched inputs
(the clearance patches, the region and tint rasters, and the water depth
proxy, which was not even listed) now gate GENERATION until each has settled,
resolved or failed, with a 10 s ceiling past which generation starts from
their defaults. The settlement exclusions do NOT gate it: `settlements.json`
is ~10 MB and optional, so the whole layer would wait on the slowest fetch on
the page. When exclusions or patches arrive or change after tiles exist, only
the cached tiles the changed shapes can reach are dropped — the tile
half-diagonal plus the widest radius over SPECIES_PLANS, which bounds every
instance the generator places (it reads radii by plan id) — the same bound
the tile prefilter uses — testing every shape in
the old and new lists (their union) against the tiles within reach — the
lists change once or twice a session, so the union is correct and cheap —
counted on the HUD as
`retiled` beside `built` and `staled`, so neither the double build nor a
stealth full wipe can come back unseen. An input that lands after the 10 s
ceiling is handled by the same two paths as any change: the clearance index
and settlement footprints invalidate only the tiles within reach, the region
raster, tint and water proxy mark every tile stale, and a stale tile draws
until it is rebuilt. The targeted invalidation first drops the changed shapes
that fall outside the ring's bounding box, grown by the pad, so a
province-wide footprint list is not tested tile by tile.
Content invalidation (control, region, tint, water, footprints, clearance)
never deletes a cached tile: it marks it stale and the tile draws until
rebuilt, so no content change blanks the ring. The two geometry sliders
(vertical scale, ring radius) clear the cache and the ring rebuilds from
empty, by choice: grass hanging at the old height is worse than a brief
absence.

The whole-cache wipe was also the "ground cover blinks out after load"
symptom, and the mesh swap was not. The fill runs in one effect pass, so the
remove and the add land in the same commit and no frame renders between
them, so removing the outgrown mesh before adding its replacement never
left a frame drawing nothing; the reorder (add, then drop) is kept because it
is harmless, but it fixed nothing. What emptied the ring was the wipe: the
fill ran against a freshly cleared cache and set every mesh's count to 0,
and the tiles came back only over the 0.25 s generation ticks. The plants at
the player's own feet that never came back are a different thing again and
are correct: they are the road-margin clearance, which the rebuild applied
and the first build had not — it is now applied on the first build, so the
margin is clear from the start rather than clearing itself late.

The MID and FAR ground-cover tiers use the same card geometry and the same
material, so they no longer get a mesh each. The slot is now
`bucket * quadrants + quadrant` over two buckets, the near full mesh and the
card, and the crossfade band is written per tile record rather than per mesh
because one merged mesh holds records from both bands. The FAR thinning is
unchanged: density is decided at candidate time, not by the mesh. Draw keys
per species and part fall from `3 x 4` to `2 x 4`, a third fewer.

`&gcquad=1|2|4` (default 4) sets how many meshes each species, bucket and
part splits into: 4 is the quartering around the focus, 2 splits on the focus
x axis, 1 draws one mesh. Fewer quadrants trade frustum culling for calls,
and the owner's next reading decides it. Expected effect at the default:
ground-cover draws down about a third, roughly 80 calls off the frame.

## Round 12 addendum (2026-09-22): the frame was multi-draw bound

The owner's A/B settled it. With vegetation unmounted the jungle ran 59 fps,
cpu 6.6 ms, 326 calls; with it mounted, 22–24 fps, cpu 21–25 ms, 480–563
calls. Ground cover's ~127 instanced draws cost under a millisecond between
them, so vegetation's 111 draws were carrying ~20 ms — about 170 microseconds
each, two orders above what a draw call costs.

A `THREE.BatchedMesh` in three 0.184 has no instanced draw path. It emits one
multi-draw RANGE per VISIBLE INSTANCE (`_multiDrawStarts/_multiDrawCounts`),
about 50 000 of them at the jungle at rest, and again for the shadow pass.
Chrome on Apple hardware runs ANGLE over Metal, which has no native
multi-draw: it loops in the GPU process, one Metal draw plus a `gl_DrawID`
uniform write per range. That is ~10^5 hidden draws a frame, invisible to the
JS timers (`onBeforeRender` early-outs, because culling and sorting are off
since 0082) and invisible to the GPU line, which is wall time on this
hardware. The draw-call figure the HUD reported — 111 — was the count of
`multiDrawElementsWEBGL` calls, not of draws.

The fix is one `THREE.InstancedMesh` per (batch key, kit geometry): a real
instanced draw with `count` = visible copies. A copy keeps a permanent SLOT
in its batch; the GPU buffers hold a COMPACT PREFIX of the visible copies, so
switching a copy on appends it and switching one off swaps the last copy into
its row, and one merged upload range covers the frame's touched rows. The
per-instance band, wind tune and occlusion cell stay in the batch's data
texture, now indexed by an `esSlot` instanced attribute instead of
`getIndirectIndex(gl_DrawID)`; the shader branches move from `USE_BATCHING`
to an `ES_BATCH_SLOTS` define, because the ground-cover renderer is instanced
too and its materials carry neither the attribute nor the texture. The
`WEBGL_multi_draw` requirement in 0082 §4 goes with the BatchedMesh path:
what is required now is instancing, which is WebGL2 core. The cell build is
untouched, so the copies, their matrices and their per-instance data are
identical and the 0082 parity gate is unchanged.

The same reading settled `&gcquad`. Verbatim:

```
at rest (gcquad=4)
veg: 24 fps · gpu ~19.7/88.7 ms · cpu 21.7/39.6 ms · calls 480 · gate 0.1/0.1 ms · flip 0/0.1 ms (0) · pending 0 · queue 0/0 ms - · draws 100
gc: rebuilds 0/s · gen 0/0 ms · tile 0.6/0 ms · phases grid 0.1 · mask 0.0 · cand 19.2 (489 exact) · compose 1.1 · fill 18.2/0 ms (61612) · tiles 352/0 · built 353 staled 0 retiled 0 · mesh 0.75M
cpu by stage: pre 0.1 · veg 0.5 · gc 0.5 · sky 0.3 · char 1.1 · ripple 2.5 · foam 0.0 · shadow 3.4 · scene 12.2 (max 16.1) · blit 0.0 · water 0.5 · precip 0.3 · overlay 0.2 · post 0.0
gcquad=2
veg: 24 fps · gpu ~21.7/102.2 ms · cpu 21.1/39 ms · calls 436 · draws 111
gc: tiles 350/0 · built 350 staled 0 retiled 0 · mesh 0.79M
gcquad=1
veg: 23 fps · gpu ~17.1/75.7 ms · cpu 20.3/32.6 ms · calls 404 · draws 111
gc: tiles 350/0 · built 350 staled 0 retiled 0 · mesh 0.79M
```

Quartering costs 76 calls and culls nothing worth them: the frame rate is
flat at 23–24 across all three. `&gcquad` stays as the measurement switch and
its default becomes 1.

The HUD's vegetation line now prints `draws N (ranges M)`, where the ranges
figure is the sum of the visible counts — exactly what the old path submitted
as multi-draw ranges, kept so the next reading can be compared with this one.

### Owner reading after round 12 (2026-09-22)

At rest in the jungle the owner read 57 fps (was 22), cpu 16.3 ms, 508 calls,
`draws 229 (ranges 68683)`. Walking into lowland water (`body.2311-2468`,
0.4 m deep) dipped to 45 fps, calls 549, draws 258, cpu 20.3 ms, and to about
34 fps at worst. Isolation readings: vegetation off gave 60 fps and cpu
7.1 ms; vegetation on with water and ground cover off gave 61 fps, cpu
6.7 ms, `scene` 4.2 ms; everything off gave 60 fps, cpu 3.7 ms, 160 calls.

```
at rest, everything on
veg: 57 fps · gpu ~26.7/72.1 ms · cpu 16.3/30.1 ms · calls 508 · gate 0/0.1 ms · flip 0/0 ms (0) · pending 0 · queue 0/0.1 ms - · draws 229 (ranges 68683)
gc: rebuilds 0/s · gen 0/0 ms · tile 0.4/0 ms · phases grid 0.2 · mask 0.2 · cand 43.8 (686 exact) · compose 1.4 · fill 7/0 ms (61216) · tiles 350/0 · built 350 staled 0 retiled 0 · mesh 0.79M
tris 3.0M / budget 4.0M: veg 0.9M+0.4M (near 0.7M · mid 0.0M · far 0.0M · card 0.1M) · terrain 0.3M+0.0M · gc 0.9M+0.0M · other 0.5M+0.0M · hidden 48c/403s
cpu by stage: pre 0.1 · veg 0.4 · gc 0.2 · sky 0.2 · char 0.6 · ripple 1.7 · foam 0.0 · shadow 1.1 · scene 11.0 (max 15.6) · blit 0.0 · water 0.4 · precip 0.3 · overlay 0.2 · post 0.0
lowland water, walking: veg: 45 fps · cpu 20.3/34.1 ms · calls 549 · draws 258 (ranges 78099); gc built 1060 (moving, expected)
```

The owner judged the plants and ground cover visually unchanged and "great".
The remaining cost with everything on is ~9 ms of CPU `scene` above the
veg-only figure (11.0 vs 4.2), i.e. water's extra scene-layer passes plus
ground cover interacting with the water pipeline — the next target.

## Consequences

- `FRAME_TRIANGLE_BUDGET` and the HUD budget line ship with this round; the
  water README's pass description is corrected to the seven `render` calls
  it actually issues (three are full scene traversals: opaques to the HDR
  target, the water layer, the overlay layer; plus ripple ×2, foam, blit,
  precipitation).
- The lane closes when the jungle walk holds 60 fps at rest on the reference
  card with HUD line 3 under budget.
- Phase 14 (streaming and budgets) inherits the budget as its per-frame
  geometry gate.
