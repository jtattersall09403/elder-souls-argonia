# Shared terrain

`ChunkStore` decodes immutable native terrain PNGs, applies the optional sparse
bed-height overlay, and loads native diagonal topology before exposing grids.
`terrainGridIndices` is the renderer/collider index oracle; only explicitly
audited native cells change diagonal. Heights do not change with topology.

`AdaptiveTerrainLoader` optionally loads `water/v2/terrain/manifest.json` beneath
an injected province URL. A missing manifest keeps the original terrain path;
invalid manifests, mismatched dependencies or corrupt chunks reject. The loader
limits chunk work to four concurrent requests and its decoded LRU to 96 MiB by
default. Rendered meshes own their current buffers independently of the LRU.
`buildAdaptiveTerrainGeometry` applies the display scale and province UVs; its
input heights remain true metres. Callers dispose replaced geometries and the
loader. The studio admits at most two adaptive chunk replacements per frame.

`TerrainViewResidency` retains actual camera-frustum chunk bounds with a 64 m
prefetch / 128 m retention buffer, plus the focus's 5×5 chunk neighbourhood.
Its inner 3×3 remains native LOD1 regardless of camera direction. Bounds include
vertical exaggeration, permitted bed lowering and skirts. Call `retainWanted`
on the adaptive loader when the plan changes: obsolete queued requests settle
without decoding, and off-view cache entries are released. Mounted geometry and
arrival references must also be released; a loader LRU alone cannot limit them.

The shared native `ChunkStore` intentionally retains decoded grids: synchronous
ground queries require them even when their collider or vegetation consumer
holds a separate reference. The current 256-chunk province bounds native LOD1
heights at 62.51 MiB (82.26 MiB including every LOD). A larger-world cache needs
explicit consumer leases before eviction; an unpinned LRU can make visible,
collidable ground temporarily disappear from queries. These figures exclude
render buffers and the separate adaptive cache.

Generate a matched bundle offline:

```sh
python3 -m worldgen.water_terrain_lod --province <province-root> \
  --protected <matching-terrain-protect.npy> --out <staging-terrain-directory>
```

The exporter uses actual runtime LOD1 PNG decoding plus the matching bed overlay,
not Gaussian LOD2/4 rasters. Protected native cells and audited diagonal flips
are retained; coarse dry cells form stitched fans. Every chunk border remains
native. Existing per-chunk PNG quantization differences are measured in the
manifest rather than silently rewritten.

Optional `--bank-errors .1 .25 .5 1` exports `4-e010`, `4-e025`, `4-e050`
and `4-e100` variants. Their declared error bounds apply to the protected bank
domain, not unrelated dry-land detail. `projectedTerrainBankView` bounds the
actual homogeneous camera projection, including off-axis perspective, display
scale and Float32 height rounding. `TerrainViewResidency` selects a variant only
below half a drawing-buffer pixel; DPR changes invalidate the selection. The
native and middle rings remain unchanged. Without variants, exact protected
LOD4 remains the fallback. `selectTerrainDisplay` keeps an admitted adaptive
mesh until its replacement arrives instead of reverting to a cached regular grid.

The schema-1 manifest hashes the native chunk manifest, bed overlay, topology,
protection mask and each generated file. Each deterministic gzip file contains
`ESATLOD1`, six little-endian uint32 fields (schema, vertex count, index count,
index width, cell width, cell height), interleaved native uint16 X/Z coordinates,
Float32 heights, and uint16/uint32 triangle indices. Decompression is bounded by
the declared decoded byte count. Manifest statistics report downloaded bytes,
decoded bytes, render-buffer bytes, triangles and the original LOD triangle count.

Publish terrain only together with its matching water overlay and topology.
The legacy comparison must bypass both the overlays and adaptive bundle.

Corrected beds/diagonals also need matching slope data for ground lighting and
triplanar weights. After the terrain export, run:

```sh
python3 -m worldgen.water_terrain_gradient --province <province-root> \
  --water-dir <matching-water-directory> --terrain-dir <staging-terrain-directory>
```

This adds an optional schema-1 `gradientPatch` descriptor: original-gradient,
native-manifest, overlay and topology hashes bind a sparse RG8 replacement
sidecar to exactly one terrain build. `ESGRAD01` has a 24-byte header followed by
sorted unique six-byte records (uint32 native index, two replacement bytes).
The exporter adds the native area-weighted face-gradient change to the original
smoothed field; it does not replace the original terrain's styling or claim
per-face normals. Unaffected pixels remain byte-identical.

`loadTerrainGradient` verifies and patches one owned texture before upload,
preserving its UV orientation, filters and colour-space settings. It uses the
existing ground sampler. The caller disposes the texture and keeps its loading
terrain visible until verification finishes; invalid data must not silently mix
corrected geometry with stale slopes. Legacy mode loads the untouched original.
