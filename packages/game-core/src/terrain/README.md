# Shared terrain

`ChunkStore` fetches `province/chunks/chunks-web-manifest.json` and decodes the
16-bit chunk PNGs into true-metre height grids, one cache per app. Decoded grids
are the raw exported terrain — decision 0046 retired the bed overlay, the native
diagonal topology and the adaptive/bank terrain loader, so what the compiler
exported is what renders, collides and answers height queries.

`buildTerrainGridGeometry` (gridGeometry.ts) builds one chunk mesh with a 2.5 m
dropped skirt at its border, UVs in province space, and no vertex normals: the
ground shader lights from the province-wide gradient texture. `subGrid` cuts
the same grid into a 4x4 set of sub-tiles sharing their edge rows, so the
renderer can choose LOD per 117 m sub-tile instead of per 468 m chunk; each
sub-tile gets its own skirt, which hides the seam at a LOD step exactly as the
chunk skirts do.

The character-mode ladder (`apps/world-studio/src/character/chunkStore.ts`,
`LOD_BANDS`) is LOD 1 to 150 m, LOD 2 to 400 m, LOD 4 to 1 400 m, LOD 8 beyond,
measured to the nearest edge of the rectangle being drawn -- the chunk beyond
400 m, the sub-tile inside it. The fine bands are short for the same reason
Skyrim's are: it draws full 1.8 m ground only inside its 285 m loaded square
and 7 m beyond, and the frame here is a triangle budget (decision 0084).

`BorderApron` (BorderApron.tsx, types and mask helpers in apronManifest.ts)
draws the land beyond the province border (16d): ring 0 is ordinary chunk
tiles registered on the store with `ChunkStore.register(chunks, dir)` and drawn
by the chunk renderer, so the border is an ordinary chunk seam; rings 1 and 2
are two coarse meshes whose interior quads are dropped by `terrainGridIndices`'
`skipQuad`. The apron is scenery: no colliders, no shadows, no frustum culling.
`decodeHeightPng` is the RG16 decode both paths share.

`../boundary/` closes the built square: `boundaryWallBoxes` (walls.ts) places
four fixed cuboids entirely outside `[0, extentM]²` with their inner faces on
the extent, `BoundaryWalls.tsx` creates them in Rapier, and
`boundaryMessage.ts` / `useBoundaryMessage.ts` show `text.system.province-edge`
once per approach. The extent is `PROVINCE_BOUNDARY.extentM` in
`@elder-souls/contracts` — the chunk manifest's `terrainSupportExtentM`, and
the only name for that number.

`terrainColliderData` (colliderData.ts) turns the same grid into Rapier
heightfield arguments — column-major, centred, y scaled by the display scale.
Render and collider must be given the same vertical scale.

`sampleChunkHeight` / `triangleHeight` (heightfield.ts) sample a grid on the
exact anti-diagonal triangulation Rapier uses, so queried ground and the
collider under the player's feet agree; bilinear interpolation would not.

The store intentionally retains decoded grids: synchronous ground queries need
them even when a collider or vegetation consumer holds its own reference. The
256-chunk province bounds LOD-1 heights at 62.5 MiB (82.3 MiB with every LOD).
A larger world needs explicit consumer leases before any eviction — an unpinned
LRU can make visible, collidable ground vanish from queries.
