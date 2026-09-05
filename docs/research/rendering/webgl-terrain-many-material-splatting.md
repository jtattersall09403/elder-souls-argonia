# Many-material terrain texturing in WebGL2/three.js (researched 2026-08-23)

How to render 20–60+ distinct ground materials on a 22 km province terrain in
the browser without exploding shader cost or memory. Grounds decision 0011.
Companions: [skyrim-morrowind-landscape-texture-granularity.md](skyrim-morrowind-landscape-texture-granularity.md),
[black-marsh-ground-texture-sources.md](black-marsh-ground-texture-sources.md).

## Recommended architecture (A): baked ID+blend control map → KTX2 texture arrays

The proven "many materials, constant shader cost" pattern (BotW, MegaSplat,
Godot Terrain3D). Chosen over per-material weight channels, which stop scaling
past ~8 materials.

- **Representation**: per-texel control map storing `(materialID0: 8b,
  materialID1: 8b, blend: 8b, spare: 8b)` in RGBA8 tiles at ~0.5–1 texel/m,
  compiled offline (our Python worldgen) from semantic land-cover × per-region
  palette. 8-bit IDs = 256-material headroom. Precedents:
  - Zelda BotW ships exactly this at province scale: 256² `MATE` tiles of
    2×8-bit material IDs + blend indexing a terrain texture array, quadtree
    LODs; material IDs also drive footsteps/sounds
    ([ZeldaMods MATE](https://zeldamods.org/wiki/MATE), [TSCB](https://zeldamods.org/w_botw/index.php?title=TSCB)).
  - Godot **Terrain3D** — best-documented open reference implementation; its
    GLSL ports directly to a three.js ShaderMaterial
    ([shader design doc](https://terrain3d.readthedocs.io/en/latest/docs/shader_design.html)).
  - MegaSplat (Unity) proves 256 textures single-pass at constant cost
    ([forum thread](https://forum.unity.com/threads/released-megasplat-a-256-texture-splat-mapping-system.441329/)).
- **Texture storage**: WebGL2 `TEXTURE_2D_ARRAY` via three.js
  `CompressedArrayTexture` + `KTX2Loader` (layered KTX2 built with
  `ktx create --layers N` in CI — official example
  [webgl_texture2darray_compressed](https://threejs.org/examples/#webgl_texture2darray_compressed)).
  `sampler2DArray` is dynamically indexable in GLSL ES 3.0, sidestepping the
  16-texture-unit limit. All layers in one array must share resolution/format.
- **The one fiddly shader detail**: integer IDs must not be hardware-filtered.
  Sample the control map's 4 surrounding texels with `texelFetch`, decode, and
  manually bilinear-interpolate the *colours* (worst case 4×2 = 8 array
  fetches per map type). Terrain3D documents the standard optimisations: skip
  bilinear when sub-pixel at distance, branch out ~0 weights, height-based
  blend resolve. Stochastic sampling breaks mip selection — use `textureGrad`
  with derivatives from the un-jittered UV.

## Anti-tiling & variation (cheap on WebGL2, ordered by value)

1. **Distance-dependent detail fade** (Frostbite pattern): beyond ~200–500 m
   show only baked colormap + macro normal; blend two UV scales near/far. At
   22 km this matters more than any other single trick
   ([Andersson, Terrain Rendering in Frostbite, SIGGRAPH 2007](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/chapter5-andersson-terrain-rendering-in-frostbite.pdf)).
2. **World colormap + macro variation**: a low-res per-province tint texture
   multiplied on albedo (regional gradients, wetness darkening — standard
   CryEngine/Unity/Terrain3D "global colormap"), plus one grayscale noise
   sampled at 3 world scales multiplied together (UE landscape macro-variation
   pattern, [tutorial](https://www.versluis.com/2023/05/how-to-use-macro-variations-for-unreal-engine-landscape-materials/)).
   Nearly free; we half-do this already.
3. **Hex-tiling** (Mikkelsen, *Practical Real-Time Hex-Tiling*): per-hex random
   offset/rotation, 3-sample blend, works on unmodified textures — ideal for
   organic ground. Reference HLSL [mmikk/hextile-demo](https://github.com/mmikk/hextile-demo)
   (use the world-space-UV variant for precision at 22 km);
   [GLSL port](https://godotshaders.com/shader/stochastic-hex-tiling-mikkelsens-adaptation/).
   Alternative same-cost option: Heitz/Deliot stochastic triangle-grid
   ([practical writeup](https://medium.com/@jasonbooth_86226/stochastic-texturing-3c2e58d76a14)).
   Cheapest fallback: iq's per-tile offset trick
   ([article](https://iquilezles.org/articles/texturerepetition/)).
4. **Detail normal blending**: reoriented normal mapping
   ([Stephen Hill, Blending in Detail](https://blog.selfshadow.com/publications/blending-in-detail/)).

## Macro regional variation — the AAA pattern

Ghost of Tsushima, Horizon Zero Dawn ("ecotopes"), BotW and Far Cry 5 all
resolve **semantic surface class → concrete material per biome offline/in
tools**; the runtime only sees flat material IDs
([HZD GPU-based procedural placement, GDC 2017](https://gdcvault.com/play/1024700/GPU-Based-Run-Time-Procedural);
[GoT Samurai Landscapes](https://gdcvault.com/play/1027352/Samurai-Landscapes-Building-and-Rendering);
[FC5 procedural worldgen](https://www.gdcvault.com/play/1025557)). HZD bakes
rivers/roads as **SDF rasters** so placement rules can query "within N m of
water" — steal this for waterline-mud/riverbank bands. Additionally: give each
concrete material a small per-region tint/UV-scale/hex-seed table (uniform or
data texture) so "hummock grass north vs south" is often the same layer with
different tint — zero extra texture memory.

## Texture budget maths

KTX2/Basis is the whole ballgame — stays block-compressed in VRAM (4–8× cut vs
PNG→RGBA8) and transcodes per-platform (BC7/ASTC/ETC2)
([Don McCurdy, web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)).
Per 1024² + mips: RGBA8 5.33 MB, UASTC 1.33 MB, ETC1S 0.67 MB.

- **Sweet spot: 512² albedo + 512² normal per material, UASTC → ~21 MB for 32
  layers, ~43 MB for 64.** 512 + hex-tiling + detail normals + colormap reads
  better than 1K with visible tiling (BotW shipped ≤1K albedo).
- Control maps must stay **uncompressed integer** (RGBA8UI / texelFetch) —
  never block-compress or mip-filter IDs; keep them modest (2048² per chunk or
  0.5 texel/m).
- 32×2 uncompressed PNGs at 1K would be ~341 MB — not viable; KTX2 is required
  at this material count.

## Rejected alternatives

- **Per-material RGBA weight maps** (current system): 32 materials = 8 weight
  maps + 32 blend terms/fragment. Keep only as a per-chunk hybrid (4–8 local
  materials indexing a global array) if the ID map proves too fiddly — but
  boundary chunks (waterline/riverbank/reed transitions) are exactly where the
  per-chunk budget breaks.
- **Virtual texturing / megatexture**: wrong tool at 22 km on static hosting —
  punishing storage-vs-density tradeoff, needs tile streaming + feedback pass;
  browser demos are proofs-of-concept only.

## Useful three.js prior art

- [three-landscape](https://github.com/nwpointer/three-landscape) (npm) —
  splat material with stochastic sampling, triplanar, atlasing >16 textures;
  author's writeup: [Rendering semi-realistic landscapes in the browser](https://nathanpointer.com/blog/landscapes).
  Mine techniques; still weight-based so don't adopt wholesale.
- [nickfallon/textureSplat](https://github.com/nickfallon/textureSplat) —
  `onBeforeCompile` splatting on MeshStandardMaterial (pattern for keeping
  three.js lighting).
- No published three.js ID-map terrain material exists — port Terrain3D's
  (~200-line fragment core).

## Implementation order (adopted)

1. Texture arrays + KTX2 (immediate memory/scale win)
2. Control-map (ID+blend) shader
3. Per-region palette resolve in Python worldgen
4. Hex-tiling + world colormap polish
