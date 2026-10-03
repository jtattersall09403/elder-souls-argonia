# 0120 — Kits stream per piece, spawn ring first; shader pipelines precompile from a baked signature list

Status: accepted (owner bar 2026-10-03, 16k walk 10). Builds on the tier and
band ladder of decisions 0075 and 0082 and the download budget of standard 16.

## Context

The owner's bar: the studio reaches a complete scene in under 10 s on both
backends (WebGPU and WebGL). Today it does not. The 29 top-level settlement
kit GLBs are fetched whole, 343 MB on disk (344.2 MB over 505 requests), and
a kit is requested as one file as soon as any placement that uses it is
inside the draw cap (`packages/game-core/src/settlement/SettlementLayer.tsx`
lines 676-716). One boat pulls the whole 31.7 MB watercraft kit. On the pod
the fetch ends at 25-31 s. About 327 to 386 shader pipelines then build one
at a time at 520-650 ms each, and the last one lands at 47.7 s (day) or
56.5 s (night). Transcoding is not the cost (781 KTX2 transcodes total
228-230 ms).

Evidence: `tooling/.reports/16k/walk10/webgpu-c8-load-plan.md`. Its floor
estimate for this content is 8-12 s: 4.1 s to first present, a first-view
fetch of 3-6 s (unmeasured, assumes under 60 MB), and 3-5 s of parallel
pipeline builds. Under 10 s is not reachable while whole kits are fetched,
because 344 MB at about 13 MB/s is 25 s alone.

## Decisions

1. **Kit meshes and textures are fetched per piece, or per kit section, on
   demand.** The unit is one piece (or a named section of a kit), not the
   kit file. `InteriorDoors.tsx` already loads `${kit.id}#${assetId}` per
   part; exterior kits use the same addressing.
2. **Requests are ordered by distance from the spawn.** The spawn ring (the
   pieces inside the near band of the player's start) and the pieces in view
   load before `ready`. Everything else streams after `ready`, nearest
   first.
3. **The existing tier and band ladder (0075, 0082) decides what is
   requested.** No new quality tier, and no default is lowered (0108 section
   6). A piece is requested when its band says it is drawn, and not before.
4. **Shader pipelines precompile at boot from a build-time baked list of
   material signatures**, not from meshes as they arrive. The list is
   produced when kits publish, one entry per distinct signature. Boot builds
   the pipelines in parallel (more than one in flight), so build time no
   longer waits on the fetch and no longer runs serially.
5. **The warm gate opens when the spawn ring is complete and the build queue
   is empty.** Pieces beyond the ring never hold the gate.

## Ownership

- dev (performance lane): `SettlementLayer.tsx` and the kit loader implement
  the per-piece fetch and the spawn-distance ordering, plus the per-piece or
  per-section publish format and its manifest rows.
- webgpu branch: `render/shaderBuildQueue.ts` and `precompileScene`
  implement the baked signature list, parallel builds and the gate rule.
- `merge_forward` carries dev's change to the branch.

## Download budget (standard 16)

Nothing new ships. The same compressed bytes (UASTC/KTX2 and meshopt via
`pipeline/kit_compress.py`) arrive later, per piece. The splitting step
runs inside the kit publish and is measured by the existing
`kit_compress --check` and the site-size budget; either failing blocks the
change. The baked signature list is a small JSON file and counts against the
same budget.

## Measure before building

Per-URL resource timing and per-layer stream tags must land first
(`pod-capture-lib.mjs` line 1169 keeps only count, bytes and last today), so
the spawn ring's real byte count is known before the split is built. The
8-12 s floor is an estimate until then.
