# 0014 — Browser encoding of terrain chunks

**Date:** 2026-08-24 · **Status:** accepted

The Phase 6 chunk compiler writes float32 `.npy` grids into the local asset
vault, which CI and GitHub Pages can never see. Phase 7 ships them to the
browser as **16-bit-quantised RG PNGs** (R = high byte, G = low byte),
quantised per chunk per LOD against `minM`/`maxM` recorded in
`chunks-web-manifest.json` — error ≤ (range/65535), millimetres.

Why this encoding:
- Browsers flatten true 16-bit greyscale PNGs to 8 bits via canvas; RG packing
  is the studio's established workaround (`height-rg.png` precedent).
- PNG gives free compression (27.7 MB for 256 chunks × 3 LODs vs 85 MB raw)
  and native decode; no JS parser, no wasm.
- Committed into `apps/world-studio/public/province/chunks/` because the
  deploy builds from a clean checkout (repo already tracks larger rasters).

Exporter: `worldgen.export_web_chunks` (deterministic; pytest round-trips the
PNGs against the vault float32 grids). Decoder: the studio's
`character/chunkStore.ts`. Heights stay true metres; ×5 vertical (0006
addendum) is applied only where data becomes geometry — mesh vertices and the
Rapier heightfield collider's y-scale. Phase 14's production bundle format
supersedes this if it chooses differently.
