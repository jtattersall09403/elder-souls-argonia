# GPU texture and mesh compression for kits: the choice and the numbers

**Status:** live design input. Read by `tooling/asset-pipeline/pipeline/kit_compress.py`
(the publish step) and `packages/game-core/src/assets/kitLoader.ts` (the runtime).
Owner decision 2026-09-18: this work was pulled forward out of Phase 14 and done
in 16f, with the duplicated character assets fixed in the same pass.

## Why now

Measured on 2026-09-18 (16f ledger §17, decision 0073): the composed GitHub
Pages site was 1,041 MB against Pages' 1 GB limit; the studio downloaded ~217
MB before anything appeared, ~120 MB of it three vegetation kits; 70–91 % of
every kit's bytes were PNG (flora 56 of 80.5 MB); 112 MB of identical character
assets shipped twice (`/` and `/studio/`). Kits totalled 556 MB.

PNG is the wrong container for a runtime texture on two counts: it is decoded
to raw RGBA8 on the GPU (a 1024² texture with mips is 5.3 MB of VRAM); it is
also decoded on the main thread at load. GPU block formats (BC7, ASTC, ETC2)
stay compressed in VRAM and upload as-is; KTX2 with Basis Universal is the
one container that transcodes to whichever of those the device has.

## What the field does (checked before writing anything)

- **three.js** ships `KTX2Loader` (Basis transcoder, worker pool,
  `detectSupport(renderer)` picks BC7 / ASTC / ETC2 / a raw fallback),
  `MeshoptDecoder` (inline wasm, `EXT_meshopt_compression`) and `DRACOLoader`.
  `GLTFLoader` supports `KHR_texture_basisu`, `KHR_mesh_quantization` and
  `EXT_meshopt_compression` natively.
- **gltfpack** (meshoptimizer, zeux) does the whole job in one deterministic
  pass: KTX2 encode per texture class (`color`, `normal`, `attrib`; ETC1S or
  UASTC each), meshopt geometry and quantisation, keeping names/extras on
  request. The **npm build has no Basis encoder** ("node.js builds do not
  support BasisU"); the native release binary does. `gltf-transform` does the
  same via `toktx`/`ktx` from KTX-Software, a second toolchain to install for
  nothing gltfpack lacks.
- **Draco vs meshopt**: Draco's decoder is ~300 KB of wasm and decodes on a
  worker into JS arrays; meshopt's decoder is ~30 KB inline, decodes straight
  into GPU-uploadable buffers and pairs with quantisation. Every modern
  three.js pipeline picks meshopt; so do we.

## Format per texture role: UASTC everywhere, measured

Metric tool: `pipeline/texture_quality.py` (decodes the shipped KTX2 with the
runtime's own transcoder and compares against the source PNG per material
slot: RGB PSNR over visible texels, the share of texels whose side of the
alpha-test cutoff flipped, normal angular error). Judge: a Sonnet subagent on
four source|packed crop pairs (128² window, 4×, the busiest window of the
texture), verdicts from 5 (indistinguishable) to 1 (damaged).

| Kit / role | ETC1S (PSNR median / min; alpha flips median / max) | UASTC (same) | bytes ETC1S / UASTC |
| --- | --- | --- | --- |
| flora, masked foliage (462 slots) | 32.3 / 22.3 dB; 0.26 % / 1.90 % | 39.4 / 28.4 dB; 0.10 % / 1.85 % | 13.4 / 26.4 MB (from 80.5) |
| groundcover, masked (80) | 32.4 / 22.5 dB; 0.38 % / 1.44 % | 34.3 / 29.2 dB; 0.19 % / 0.70 % | 2.5 / 5.1 MB (from 11.4) |
| underwater, mixed (106) | 32.7 / 23.3 dB; 0.014 % / 0.90 % | 45.4 / 36.8 dB; 0.003 % / 0.36 % | 4.5 / 13.5 MB (from 27.0) |
| settlement-root, opaque architecture (440) | 31.9 / 26.1 dB | 44.9 / 36.4 dB | 9.9 / 14.4 MB (from 47.2) |

Visual verdicts: foliage card atlas UASTC **5/5**, ETC1S **2/5** (blocky
canopy interior, softened cut-out edges, colour bleeding into transparent
cells); architecture wood/debris UASTC **5/5**, ETC1S **4/5** (mild
softening). Images ingested (four of the phase's six): the
`es|card_es|cardatlas_256_0` window source-vs-UASTC and source-vs-ETC1S, the
`PasserelleL128.024 0.Mat` window source-vs-UASTC and source-vs-ETC1S.

Decision, by role:

- **Alpha-tested colour (foliage, cards, grass): UASTC.** ETC1S loses 7–10 dB
  and flips 2–3× the cutoff texels; the judge saw it at 2/5. Not negotiable.
- **Opaque colour (architecture): UASTC.** ETC1S is 4/5 and would save ~30 %
  more on those kits, but the owner's rule is no visible loss; the site
  budget is met without it (561 MB including every kit). It stays available per
  kit (`"compression": {"color": "etc1s"}`) with these numbers as the price.
- **Normal maps: UASTC** (ETC1S's shared-codebook colour is known to shred
  normals). No kit carries a normal or metal/rough texture today (census
  2026-09-18: 21 kits, 0 `normalTexture`, 0 `metallicRoughnessTexture`), so
  the rule is set in the policy defaults and waits.
- **UI: not kits**; UI images stay where the UI phase puts them (PNG/WebP).

The groundcover's 34 dB median is the content, not the setting (`-tq 10` gave
33.9): noise-like grass at 256 px has no smooth structure to keep.

VRAM: UASTC transcodes to BC7 (desktop) or ASTC 4×4 (mobile), 8 bpp; RGBA8 is
32 bpp. The flora kit's textures drop from ~150 MB resident to ~40 MB.

## Geometry: meshopt with float positions

`-cc` (EXT_meshopt_compression) with `-kn -km -ke` (named nodes, named
materials, extras — the runtime finds assets by node name and reads
`assetId`, `lod`, `billboard`, `cardSource` from extras) and:

- `-vpf`, float positions. Default 14-bit quantised positions hang every mesh
  under an extra unnamed node carrying the dequantisation transform (312 →
  546 nodes on groundcover), which moves the mesh away from the node whose
  extras the runtime reads on the Mesh itself: every LOD level would have
  collapsed to 0. Float positions keep the mesh on its named node at no cost
  (5.132 vs 5.136 MB).
- `-vtf`, float texture coordinates: gltfpack warned that 12-bit UVs lose 10 %
  on the flora kit's tiled coordinates.
- Normals, tangents and colours stay 8-bit quantised (KHR_mesh_quantization,
  native in GLTFLoader).

Deterministic: two runs of the same input give the same SHA-256. gltfpack
demotes a MASK material to OPAQUE when it has no texture to mask with (two
untextured mushroom-stem materials in flora); invisible, checked.

## Results (2026-09-18, 21 kits)

| Kit | before | after | | Kit | before | after |
| --- | --- | --- | --- | --- | --- | --- |
| flora-province-v1 | 80.5 | 26.9 | | settlement-stilt-v1 | 38.6 | 15.4 |
| settlement-root-v1 | 49.2 | 16.8 | | works-v1 | 37.2 | 17.2 |
| dungeon-root-v1 | 41.6 | 18.9 | | enclosure-v1 | 34.6 | 13.9 |
| settlement-mud-v1 | 32.9 | 14.8 | | wrecks-v1 | 30.2 | 8.2 |
| underwater-v1 | 27.0 | 13.6 | | mudmother-hut-int | 23.7 | 11.6 |
| imperial-keep | 20.6 | 7.3 | | xanmeer-interior-v1 | 19.8 | 7.7 |
| route-structures-v1 | 18.9 | 9.2 | | settlement-imperial-v1 | 18.6 | 7.7 |
| ruin-monumental-v1 | 17.5 | 7.6 | | htbm-hut-int | 13.4 | 6.2 |
| route-spans-v1 | 13.4 | 5.8 | | groundcover-province-v1 | 11.4 | 5.1 |
| docks-v1 | 10.7 | 3.7 | | bmv-treehouse-int | 7.8 | 3.3 |
| waterfall-fx-v1 | 0.86 | 0.86 (not compressed: 16 px stub textures, loaded without a renderer) | | | | |

MB. Kits: **556 → 222 MB**. Studio dist 426 MB (was ~569 + the 112 MB
character copy). Composed site including every kit: **999 → 561 MB**; after the
ladder exclusions (Lane F): 569 → 380 MB. The three startup kits: 118.9 →
45.6 MB. Character assets: one copy on the site (the studio's production build
resolves `races/`, `armour/`, `rig/`, `bow-rigs/` against the sandbox's copy
via `characterAssets({ sharedBase })`; dev servers are unchanged).

Encode cost: whole set 2 min 40 s on this VM, peak 2.3 GiB anon; flora alone
65 s. Under `memwatch.sh` as always.

## Where the pieces live

- Encoder: native `gltfpack` 1.2 at `~/tools/gltfpack-1.2/gltfpack`
  (`toolchain.json`), from https://github.com/zeux/meshoptimizer/releases
  (`gltfpack-ubuntu.zip`, SHA-256
  `ebc236f5f6c08c7e5c5750476a187d24805d44d8c680449c4b7369c333f817b1`). MIT.
  A build-time tool, not an asset.
- Publish step: `pipeline/kit_compress.py` (called at the end of
  `build_kit.build()` for a published kit; `--kit` for a first publish;
  `--check` verifies). The raw build stays at `output/kits/<id>.glb` for the
  measuring tools; the manifest carries a `compression` record.
- Gate: `pipeline/test_kit_compress.py` — every published kit compressed and
  recorded (first failed on all 21 uncompressed kits), startup kits ≤ 52 MB
  (first failed at 118.9 MB).
- Runtime: `game-core/src/assets/kitLoader.ts` (+ `useKitDecoders`), the
  transcoder served at `<base>/basis/` by `@elder-souls/basis-transcoder/plugin`
  in both apps. Verified on the production build with
  `probe-deployed-requests.mjs` (zero non-2xx).
- Quality tool: `pipeline/texture_quality.py` + `kit_textures_dump.mjs`.
