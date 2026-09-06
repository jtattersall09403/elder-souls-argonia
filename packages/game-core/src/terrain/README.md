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

The schema-1 manifest hashes the native chunk manifest, bed overlay, topology,
protection mask and each generated file. Each deterministic gzip file contains
`ESATLOD1`, six little-endian uint32 fields (schema, vertex count, index count,
index width, cell width, cell height), interleaved native uint16 X/Z coordinates,
Float32 heights, and uint16/uint32 triangle indices. Decompression is bounded by
the declared decoded byte count. Manifest statistics report downloaded bytes,
decoded bytes, render-buffer bytes, triangles and the original LOD triangle count.

Publish terrain only together with its matching water overlay and topology.
The legacy comparison must bypass both the overlays and adaptive bundle.
