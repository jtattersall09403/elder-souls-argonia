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
