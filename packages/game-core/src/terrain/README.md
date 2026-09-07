# Shared terrain

`ChunkStore` fetches `province/chunks/chunks-web-manifest.json` and decodes the
16-bit chunk PNGs into true-metre height grids, one cache per app. Decoded grids
are the raw exported terrain — decision 0046 retired the bed overlay, the native
diagonal topology and the adaptive/bank terrain loader, so what the compiler
exported is what renders, collides and answers height queries.

`buildTerrainGridGeometry` (gridGeometry.ts) builds one chunk mesh with a 2.5 m
dropped skirt at its border, UVs in province space, and no vertex normals: the
ground shader lights from the province-wide gradient texture.

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
