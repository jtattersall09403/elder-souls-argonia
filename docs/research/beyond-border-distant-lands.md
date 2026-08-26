# Beyond-border distant lands (world-edge horizon)

Round-6 research (2026-08-26). Owner rejected the quick procedural ring
(round 5's `DistantLands.tsx`, since REMOVED): it didn't continue from the
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

## Plan for us (deferred; do when 8b/10 asset passes settle the look)

Generate in the WORLD PIPELINE, not at studio runtime:
- A **border-apron raster** (`province/border-apron.png` + mesh or a coarse
  grid JSON): heights = province edge rows/cols extended outward with
  decaying continuation + authored ridge profiles per compass sector
  (lore: Morrowind mountains N/NW→NE, Cyrodiil Blackwood low hills W/SW,
  open ocean S/E — dossier black-marsh-province §regions), plus low-freq
  noise. C0-continuous with the real border (sample the actual edge heights)
  so land flows over the boundary with no sea gap and no cliff.
- Extent: to ≥40 km (horizon from the 651 m summit ≈ 91 km — the last
  stretch is the dome's sub-horizon haze band, which already exists).
- Colouring: same gradient/terrain-colour method as the province at low res
  (vertex colours are enough at that distance), NOT a flat material.
- Rendering: one static mesh per mode, `castShadow/receiveShadow = false`,
  aerial haze on (shared uniforms), no colliders; invisible walls at the
  playable border are a separate later task.

Sources: [GameDev.net — far objects and horizon](https://gamedev.net/forums/topic/711289-far-away-objects-and-horizon-in-an-open-world-game/),
[Polycount — long-distance terrain rings](https://polycount.com/discussion/219151/long-dinstance-terrain-rendering-techniques-unity-desktop-game),
[DynDOLOD docs — Skyrim terrain LOD](https://dyndolod.info/Help/Terrain-LOD-and-Water-LOD).
