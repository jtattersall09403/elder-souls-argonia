# 0071 — Every placed thing steps down through quality bands, and collides as itself

**Status:** accepted (owner feedback 2026-09-17, delivered as 16f round 2 on
2026-09-18). **Extends:** 0070 (vegetation reads the record). **Supersedes:**
the Phase 10 rule that rocks collide as their bounding box; the Phase 14
row that deferred the flora billboard audit.

## Decisions

1. **Every placed thing has a card tier, rendered from its own mesh.** The
   source mods author a far card (`_lod_flat`) for 44 of 159 flora species
   and for nothing else. The kit builder now bakes one per asset
   (`bakeCards`: two orthographic views under flat white light, packed into
   per-kit atlases; `cardSource: "baked"`). A card rendered from the asset
   is a derived LOD in the DynDOLOD sense, not new art, so the "we never
   make art" rule is untouched. Rocks get no card and no decimated levels
   (`lodRatiosByCategory {"rock": []}`): decimation opened the open-shell
   cliff pieces (boundary edges ×5–10), which was the "holes at distance".
2. **Levels crossfade by dither, and the transition is exact per frame.**
   `packages/game-core/src/fx/lodFade.ts` gives every vegetation material a
   screen-door fade between adjacent levels and a fade-out at the draw
   distance; the CPU rebuild (every 16 m) emits an instance into both levels
   inside a 21 m overlap and the shader picks the pixel by camera distance.
   No level pops; no rebuild cadence can be seen.
3. **The ground ring has bands.** Full mesh to 0.4 of the ring radius, a
   camera-facing card to the radius, a sparser card to a far radius per
   preset (110/145/165 m). Ground cover no longer ends at a hard line.
4. **Ground cover close up is 3D where the vault has 3D.** 34 of the 61 ring
   species were crossed cards from the source mods; the lush covers now
   carry at least one true 3D clump at ≥ 40 % of their density, sourced
   (DrJacopo's 3D Grass Library, Hoddminir, 3D Grass for Vanilla, vanilla
   `plants/` clusters), credited in the root README.
5. **Rocks collide as their own triangles.** A rock's collider is a Rapier
   trimesh of its LOD0 geometry, scaled per instance
   (`floraSolids.trimeshFromGeometry`), never a bounding box. The same
   path is what 16h's convex/trimesh building colliders reuse.
6. **Rocks do not sway.** Wind is applied by species category; rocks,
   deadfall, containers, ruins, architecture and clutter carry stiffness 0.
7. **A rock is buried by its footprint, not by one number.** After the
   slope tilt, the base plane is sampled against the ground on the
   footprint ellipse and the sink is raised by any exposure (+0.25 m,
   capped at 0.6 of the piece's height); an open-backed piece's yaw is
   `downhill + 180° − openBackYawDeg` so the open side faces uphill for any
   authored back angle (the old rule only held for 90° and 270°).
8. **Terrain occludes.** At each rebuild a horizon test per 32 m cell culls
   instances beyond 120 m that the ground hides from the camera.
9. **The sea is the record's `ocean` body and nothing else.** The graph
   was already right (one ocean body; 20 lagoons up to 2.5 km inland keep
   their kind); the last two raster-derived salt reads and the map's
   whole-piece painting rule are gone. The compiled `ocean` label's 56 ha
   over-reach into tidal creeks is a 16c defect above the gate; the owner
   ruled on 2026-09-18 that no refreeze will ever run and accepted it as
   it is (the backlog row records what it costs: sea class and sea-bed
   dressing on shallow tidal creek within 700 m of the open sea).
10. **The sea bed is dressed from the shoreline out, under `ocean` only.**
    Pebbles, stones, shells, real coral, starfish, sponges, debris, medium
    and large wet rocks, gated by the record kind and a coastline density
    ramp; the flat coral card fans are removed; the depth floor measures
    the top of a piece above the bed.
11. **Roads keep their surface in every state of repair.** Condition
    changes the material mix (cobbles → dirt → track), the width, fine
    potholes and the grass on it; it never erases the line. The track
    texture is Tropical Skyrim's road, chosen by measured contrast.
12. **The province rasters publish per group.** Five release assets, only
    the changed groups upload.

## Why

The owner's round-2 walk found the same defect in six places: something
derived from a proxy (a bounding box, a source mod's card list, a scalar
sink, a region class, a connected water piece, a hard ring) standing in
for the thing itself. Reading the real geometry and the real record once
costs a build step; every proxy cost a round.

## Consequences

- 16h reuses the trimesh collider path and the card bake for kit pieces.
- Phase 14 locks the band distances as one table; the mechanism is here.
- A new vegetation asset gets a card, a collider and a burial rule for free
  from the kit build and the scatter; nothing is hand-typed per species.

## Addendum 2026-09-20 (decision 0082)

The terrain-occlusion rule (beyond 120 m, per 32 m cell) is unchanged, but
its evaluation moves from "once per vegetation rebuild" to "incrementally
per frame": a one-texel-per-cell mask over the neighbourhood is refreshed a
few cells per frame from the live camera and the vertex shader collapses
hidden instances. No instance is revisited on the CPU for occlusion.
