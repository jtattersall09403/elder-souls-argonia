# Beyond-border distant lands (world-edge horizon)

Round-6 research (2026-08-26). Owner rejected the quick procedural ring
(round 5's `DistantLands.tsx` (removed in commit 6bcf4172; nothing of it remains), since REMOVED): it didn't continue from the
real border terrain, left a sea gap, read as flat grey, and stopped short of
the horizon. This doc records how it's actually done and the plan.

## How shipped games do it

The standard layered pattern (see sources):

1. **Playable terrain** (full detail, streamed LODs) — we have this.
2. **Fake out-of-bounds terrain that CONTINUES the real heightmap** at low
   resolution. Skyrim literally builds low-detail landmass past the border
   walls (down to a low-res White-Gold Tower on the horizon) so high
   vantage points never see the world end. Indie/Unity equivalents: 1–2
   extra terrain rings (~10 km) at reduced heightmap/splat resolution.
3. **Impostor/billboard silhouettes** for very distant landmarks (optional).
4. **Panorama backdrop + haze**: an inverted cylinder/dome image beyond the
   far ring; aerial perspective blends every transition. A plane under the
   seams in the terrain's average colour hides LOD cracks at distance.
5. Distant terrain must NOT cast/receive real-time shadows (outside cascade
   range) — flat or baked lighting only.

## What we built (16d, 2026-09-15; decision 0067)

The province turned out to be a 1:1 cut of the all-Tamriel heightmap, so the
apron is that map continued to its own edge (16 km N, 6 km S, 21.5 km W,
8.5 km E), joined by blending our edge's difference out over 6 km; the
innermost 470 m is ordinary terrain chunks (the border seam is a chunk seam);
two coarser rings follow; the sea is drawn at y = 0 over any apron ground
below sea level; the paint is the province's own rules with the border
texels copied. The earlier plan here (decaying continuation, authored ridge
profiles per sector, vertex colours, ≥ 40 km) is superseded. Brief:
`docs/phases/16-foundation-and-places/16d-border-apron-and-boundary.md`.

Sources: [GameDev.net — far objects and horizon](https://gamedev.net/forums/topic/711289-far-away-objects-and-horizon-in-an-open-world-game/),
[Polycount — long-distance terrain rings](https://polycount.com/discussion/219151/long-dinstance-terrain-rendering-techniques-unity-desktop-game),
[DynDOLOD docs — Skyrim terrain LOD](https://dyndolod.info/Help/Terrain-LOD-and-Water-LOD).
