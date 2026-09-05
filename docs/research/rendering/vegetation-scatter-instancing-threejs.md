# Dense vegetation & scatter at province scale in the browser (three.js) — research, 2026-08-26

How to place and render swamp vegetation (trees, reeds, groundcover, clutter)
across a ~7.4 km streamed world at 60 fps on mid-tier browsers. Companion to
[webgl-terrain-many-material-splatting.md](webgl-terrain-many-material-splatting.md)
(ground *textures* — not repeated here); this doc is about placed assets ABOVE
the ground. The binding rule it serves: **terrain identity comes from placed
assets** — the heightfield is coarse, vegetation carries the perceived detail.
Asset sources: [90-asset-strategy.md](../../world/90-asset-strategy.md) (§71/§74.3,
~700 sourced swamp/tropical meshes). The compiler is deterministic Python
emitting per-chunk bundles; the runtime is three.js r0.184 / R3F 9.

## 1. The framing: a two-tier system (the Bethesda lesson, up front)

Every engine that has done this at province scale converges on the same split:

1. **Authored/placed statics** (trees, big rocks, hero flora, clutter): each is
   a *reference* with an exact transform, placed for a reason, persisted, part
   of the world's identity. Morrowind is the purest case: **every plant is a
   placed static reference; the engine has no grass system at all**
   ([UESP MGE](https://en.uesp.net/wiki/Morrowind_Mod:MGE),
   [modding-openmw groundcover](https://modding-openmw.com/mods/category/groundcover/)).
2. **Procedural groundcover** (grass, small reeds, litter): *derived* from the
   ground-material map, never individually authored, regenerated near the
   camera, distance-faded, no collision, no persistence. Oblivion/Skyrim added
   exactly this: [GRAS records](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/GRAS)
   attach grass *types* to landscape texture sets (LTEX) with per-record
   density, slope limits, position/height ranges and colour jitter; the engine
   spawns instances on any terrain painted with that texture, within
   `fGrassStartFadeDistance`, thinned by `iMinGrassSize`
   ([STEP grass INI guide](https://stepmodifications.org/wiki/Guide:Skyrim_INI/Grass)).

We hold both: tier 1 matches our "terrain identity from placed assets" rule and
Morrowind's authored feel; tier 2 is the only affordable way to get dense
groundcover. **Our land-cover raster plays the role of LTEX→GRAS**: each
land-cover class (reed bed, leaf litter, hummock…) maps to a groundcover
recipe (species mix, density, size range) in compiler data.

### 1.1 What Bethesda's LOD stack teaches

- **Skyrim tree LOD = billboards in an atlas**: one baked front-view texture
  per tree species, drawn as 2 crossed planes (or single camera-facing quads in
  the older path), packed into a per-worldspace atlas (max 256 billboards),
  unlit/simple-lit ([DynDOLOD Tree-LOD](https://dyndolod.info/Help/Tree-LOD),
  [Tree/Grass LOD billboards](https://dyndolod.info/Help/Tree-Grass-LOD-Billboards)).
  "Ultra" tree LOD upgrades this to low-poly 3D or **hybrid** models (2D trunk
  billboard + 3D crown) merged into static object LOD
  ([Ultra Tree LOD](https://dyndolod.info/Help/Ultra-Tree-LOD)).
- **Static object LOD = offline-merged, atlased meshes per LOD quad** (BTO
  files): the tool scans all references, bakes a texture atlas, merges distant
  statics into big combined meshes ([DynDOLOD reference](https://dyndolod.info/DynDOLOD-Reference)).
  This is precisely what **OpenMW object paging** re-derived at runtime: merge
  nearby statics into one object when merge cost (verts, memory) is beaten by
  draw calls saved ([OpenMW: Turning the Pages](https://openmw.org/2020/openmw-spotlight-turning-the-pages/)).
- **Grass is a different animal from paging**: OpenMW tried both paging (#3010)
  and hardware instancing (#3023) for groundcover; paging won slightly on GPU
  time but loses 3–4× to frustum culling granularity (a whole page renders if
  any corner is visible); they shipped a dedicated instanced groundcover system
  — no collision, no interaction, wind-swayed, stomp-deformed
  ([PR #3023](https://github.com/OpenMW/openmw/pull/3023),
  [groundcover settings](https://openmw.readthedocs.io/en/latest/reference/modding/settings/groundcover.html)).
  Morrowind grass mods (Vurt's etc.) are literally plugins of placed statics
  that must stay *disabled* in the engine (their statics have collision — an
  impassable wall if loaded!) and are consumed only by MGE XE / OpenMW's grass
  renderer ([Vurt's Groundcover](https://www.nexusmods.com/morrowind/mods/31051)).
  **Lesson: groundcover must be collision-free and rendered by a dedicated
  instanced path, not the generic static pipeline.**
- **Mipmap alpha**: DynDOLOD regenerates billboard mips with alpha-to-coverage
  scaling so foliage doesn't dissolve at distance — we need the same
  (alpha-scaled mips or `alphaToCoverage`) on every foliage atlas.
- SpeedTree was Oblivion-only; Skyrim rolled its own tree system with baked
  trunk+branch sway ([STEP tree settings](https://stepmodifications.org/wiki/Guide:Skyrim_Tree_Settings)).
  Nothing to adopt there beyond "wind is a vertex shader, not bones".

## 2. three.js rendering survey

### 2.1 Core primitives

| Primitive | What it is | Verdict |
|---|---|---|
| **`THREE.InstancedMesh`** | One geometry × N transforms, 1 draw call. No per-instance culling (whole mesh culled by union bounds). | **ADOPT** as the base mechanism, per species-geometry, per chunk (or per chunk-group). Rock solid, works everywhere. |
| **`THREE.BatchedMesh`** (r156+) | Many *different* geometries sharing one material in 1 multi-draw call; per-object frustum culling + depth sorting built in; matrices in a data texture ([docs](https://threejs.org/docs/pages/BatchedMesh.html), [Codrops guide](https://tympanus.net/codrops/2024/10/30/interactive-3d-with-three-js-batchedmesh-and-webgpurenderer/)) | **ADOPT for the placed-static tier.** Uses `WEBGL_multi_draw` where present with a working looped fallback (Firefox lacks the extension; three.js falls back — [issue #31935](https://github.com/mrdoob/three.js/issues/31935), [caniuse](https://caniuse.com/mdn-api_webgl_multi_draw)). Caveats: instancing within a batch is *emulated* (repeat entries) since the instanced-multidraw path was removed ([PR #29655](https://github.com/mrdoob/three.js/pull/29655)) — so for 1 geometry × thousands of copies, InstancedMesh is faster; one shared material means one texture atlas / texture-array per batch; reported problems on GPUs with low `MAX_VERTEX_UNIFORM_VECTORS` ([forum](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221)). Rule of thumb from the community: few geometries × many copies → InstancedMesh; many geometries × few copies each (our ~700 tree meshes) → BatchedMesh. |
| **`@three.ez/instanced-mesh`** (InstancedMesh2, agargaro) | Drop-in enhanced InstancedMesh: per-instance frustum culling (linear or **static BVH**), distance **LOD + shadow LOD**, sorting, per-instance visibility/opacity/uniforms, fast BVH raycasting, dynamic capacity ([repo](https://github.com/agargaro/instanced-mesh), [docs](https://agargaro.github.io/instanced-mesh/)) | **ADOPT** for the instanced mid-detail tier. MIT; npm `@three.ez/instanced-mesh`; latest 0.3.16 published **2026-07-26** (checked on npm registry), active repo (341 commits), responsive author on the three.js forum. Exactly our feature list: BVH culling for static vegetation, built-in LOD chains, `onFrustumEnter`. Risks: pre-1.0 API, single maintainer — pin the version and wrap it behind one module so it's swappable. Author's own 200k-tree demo combines it with meshopt LODs + impostors ([forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)). |
| **`@three.ez/batched-mesh-extensions`** | Adds per-batch BVH culling/LOD to BatchedMesh ([npm](https://www.npmjs.com/package/@three.ez/batched-mesh-extensions)) | **TRIAL** (0.0.12, 2026-06-23 — younger/rougher than instanced-mesh). Use only if plain BatchedMesh culling proves insufficient. |

### 2.2 Impostors and distant trees

- **`agargaro/octahedral-impostor`** ([repo](https://github.com/agargaro/octahedral-impostor),
  [demo: 200k trees, mobile-friendly](https://octahedral-impostor.vercel.app/),
  [forum thread](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)):
  bakes a hemi-octahedral view atlas per species at startup, renders distant
  trees as single quads that re-project by view direction. MIT, but explicitly
  **WIP and not published to npm** (verified: no registry entry). **ADAPT —
  vendor the source** (it's small), same author/stack as InstancedMesh2 so they
  compose. The technique is the standard one from Ryan Brucks' UE impostor work;
  a Godot reference implementation documents good defaults (grid 16, hemisphere
  mapping for foliage — better resolution at side views)
  ([Godot-Octahedral-Impostors](https://github.com/wojtekpil/Godot-Octahedral-Impostors)).
- **Fallback if impostors slip**: Skyrim-style **cross-billboards** (2 crossed
  quads, baked front view) as the far LOD in the InstancedMesh2 LOD chain.
  Visually cruder (no top-down view, lighting flat) but one bake, zero risk.
  Given our canopy-height camera (no flying), hemi-impostors or even
  cross-billboards both read fine; start with cross-billboards, upgrade to the
  vendored impostor library where silhouettes matter (isolated giant trees).

### 2.3 Grass / groundcover rendering

There is **no maintained general-purpose three.js grass library** — every
serious implementation is a bespoke InstancedMesh/InstancedBufferGeometry +
custom shader, and that's what we should write (small, well-trodden):

- **SimonDev's Ghost-of-Tsushima-style grass** (video + [projects page](https://simondev.io/projects);
  community reimplementation [Jumballaya/Threejs-Grass](https://github.com/Jumballaya/Threejs-Grass)):
  per-blade geometry (a few segments), instanced; bezier-bend blades; view-space
  thickening of camera-perpendicular blades; tip/base colour gradient as fake AO;
  wind = sine + scrolled noise. The AAA look, ~100k+ blades.
- **[Codrops "fluffiest grass" (2025)](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)**
  and **[al-ro's 100k-quad demo](https://al-ro.github.io/projects/grass/)**:
  simpler textured-quad instancing, same wind pattern. Warns that full lighting
  /shadows on grass instances is the main cost — keep groundcover on a cheap
  lit model (hemisphere tint + terrain-matched albedo), `castShadow=false`.
- For swamp groundcover (reeds, sedges, fern clumps) textured **cross-quad
  clusters** (2–3 quads, one atlas) beat per-blade geometry: far fewer
  instances for the same coverage, and our sourced Skyrim/mod flora textures
  are already card-style. Per-blade grass is a stylistic option for open marsh
  meadows later, not the default.
- **Terrain-colour blending**: sample the terrain albedo/colormap at the
  instance root and tint the groundcover towards it (standard trick; Skyrim
  does per-instance colour jitter in GRAS). This hides the fade boundary.
- **Shader plumbing**: patch `MeshStandardMaterial`/`MeshLambertMaterial` via
  `onBeforeCompile` (as our `aerial.ts` already does) or
  [three-custom-shader-material](https://github.com/farazzshaikh/THREE-CustomShaderMaterial)
  (MIT, active, v5+; wraps the same mechanism ergonomically). **ADOPT the
  pattern we already use (onBeforeCompile), CSM optional** — one fewer
  dependency and we have working precedent in-repo.

### 2.4 Alpha-tested foliage overdraw (the mobile trap)

Alpha-test (`discard`) breaks early-Z/hidden-surface removal on tile-based
mobile GPUs: depth is only known after the fragment shader, so overlapping
foliage layers shade fully instead of being rejected
([Arm UE guidance](https://developer.arm.com/documentation/102676/latest/Transparency-considerations),
[Apple HSR](https://developer.apple.com/videos/play/wwdc2020/10632/),
[gamedev.net vegetation overdraw](https://gamedev.net/forums/topic/668085-performance-of-drawing-vegetation-overdraw-alpha-testing-alpha-cutout-model-generation/5226890/)).
Mitigations, in order of value: (1) **tight card geometry** — fit quads to the
visible texels, don't ship huge mostly-transparent quads (this is an asset-prep
step in the compiler: shrink-wrap sourced foliage cards where wasteful);
(2) **hard density-by-distance fade** so layered foliage only exists near the
camera; (3) draw groundcover after opaque terrain, roughly front-to-back
(InstancedMesh2 sorting supports this); (4) `alphaToCoverage` where MSAA is on,
plain alphaTest otherwise; (5) never alpha-*blend* foliage. Overdraw — not
instance count — is what kills low-tier devices; the quality-tier knob should
be groundcover *radius and density*, not tree count.

## 3. Scatter & placement (compiler-side, deterministic)

- **Sampling**: jittered grid is the right default — regular grid per class,
  each point offset by a hash of its integer cell coordinates. Near-blue-noise
  quality, O(1) per point, trivially deterministic and seekable (any chunk can
  generate its own points without neighbours)
  ([Red Blob on placement distributions](https://www.redblobgames.com/maps/terrain-from-noise/),
  [GPU run-time placement writeup — grid+jitter+hash pattern](https://medium.com/@kacper.szwajka842/gpu-run-time-procedural-placement-on-terrain-cc874e39bbfb)).
  True Poisson-disk only where minimum spacing is a *visible* property (big
  trees), and even that is cheap offline in Python. One **hash(worldSeed,
  layerId, cellX, cellY)** stream per decision (existence, species pick within
  the class mix, rotation, scale, tint) → bundles are reproducible byte-for-byte
  and stable under recompiles that don't touch the inputs.
- **Constraint filtering, cheapest-first** (pattern from
  [voxel-terrain instancing writeup](https://medium.com/@willdavis84/gpu-instanced-vegetation-over-voxel-terrain-1754281c5ceb)):
  density field from the land-cover class (optionally modulated by a broad
  noise so class interiors aren't uniform) → slope reject (normal from
  heightfield; per-species max slope, cf. GRAS slope limits) → wetness/water
  band (reeds *want* the waterline; litter rejects submerged) → clearance
  reject (below).
- **Hero/filler coexistence = clearance masks, one direction only**: placed
  hero assets (and roads, buildings, dungeon sockets — the quest world-
  provisions layer) stamp exclusion radii into a per-chunk clearance raster;
  the scatter pass rejects points inside it. Scatter never moves heroes.
  Between scattered layers, run big→small (trees stamp clearance for shrubs,
  shrubs for groundcover) — this also *creates* natural under-canopy gaps.
  This is how every DCC scatter pipeline works
  ([Houdini heightfield masking](https://www.sidefx.com/docs/houdini/nodes/sop/heightfield_maskbyfeature.html)).
- **Groundcover is NOT stored in bundles**: like Skyrim, generate it at runtime
  from the land-cover raster (already shipped per chunk for splatting) + the
  same hash scheme, in a small camera-centred ring of grid tiles. Zero
  bandwidth, infinite density headroom, one code path shared with the compiler
  definition (recipe table is compiler-emitted JSON).
- **Collision strategy**: colliders only for things the player can meaningfully
  hit — hero statics and tier-2 trees/large rocks get compiled colliders
  (capsule/cylinder proxies for trunks, never trimesh canopies); *all*
  groundcover and small clutter is visual-only (the Morrowind grass-wall
  failure is the cautionary tale, §1.1). Rapier fixed bodies are cheap but not
  free at province counts — create colliders only for the physics-active chunk
  ring, from the same bundle transforms.

### 3.1 Chunk bundle format for placed instances

Store per chunk, per species-geometry: a binary transform array. The proven
schema is glTF's [EXT_mesh_gpu_instancing](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing)
(TRANSLATION / ROTATION / SCALE accessors per instance; GLTFLoader already
loads it into InstancedMesh) — adopt the *shape* even in a custom binary:
per record ≈ position 3×f32 (or u16 quantized against chunk bounds), yaw u8
(vegetation only yaws + optional slope-tilt), uniform scale u8, species/variant
u16, tint u8 ⇒ **~12–16 bytes/instance**, so even 5k placed instances/chunk is
~60–80 KB raw, less after gzip (GitHub Pages serves compressed). Upload
straight into `InstancedBufferAttribute`s; matrices composed in the vertex
shader or at load. Keep species tables global (in the manifest), per-chunk data
purely numeric.

## 4. Wind

One **global wind state** (direction θ, strength, gustiness), owned by the
weather system (same block that drives our sky/haze), passed as 1–2 uniforms to
every vegetation material — and later to water chop and particles, so the world
gusts *together*. The canonical shader is Crysis's
([GPU Gems 3 ch. 16, Sousa](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis)):

- **Main bending**: displace xy along wind direction, weighted by normalized
  vertex height, with a length-preserving correction so tall plants don't
  stretch. Strength = wind × per-species stiffness.
- **Detail bending**: leaf/edge flutter driven by vertex colours (R = edge
  flutter weight, G = per-leaf phase, B = stiffness — note Crytek stores B
  inverted; [implementation notes](https://mtnphil.wordpress.com/2011/10/18/wind-animations-for-vegetation/),
  [O3DE port of the same functions](https://docs.o3de.org/docs/learning-guide/tutorials/rendering/vegetation-bending-tutorial/)).
  Our sourced meshes mostly *lack* authored vertex colours → compiler
  approximates them (height → B, distance-from-mesh-centre → R, hash(leaf
  island) → G) at asset-ingest time. Where that fails, main bending alone is
  fine for tier 2+3.
- **Per-instance desync**: phase from hash of instance position (read
  `instanceMatrix[3].xz` in-shader — the standard trick), so a field never
  sways in unison. Gusts: sum of 2 sines + a scrolled noise texture shared by
  all vegetation materials (also usable by water later).
- **Cost**: a handful of vertex ALU ops — effectively free next to fragment
  work; the only real rule is **wind never runs on the impostor tier** (bake
  stillness far away; nobody can see 600 m sway) and swaying casters need
  either static shadow poses or shadow-LOD (InstancedMesh2 has shadow LOD).

## 5. Technique & library verdicts (the plan module consumes this)

| Candidate | Status (checked 2026-08-26) | Verdict |
|---|---|---|
| `THREE.InstancedMesh` | core three.js | **ADOPT** — groundcover + mid-tier base |
| `THREE.BatchedMesh` | core, r156+; multi_draw w/ Firefox fallback | **ADOPT** — placed-statics tier (many geometries, few copies) |
| `@three.ez/instanced-mesh` 0.3.16 | MIT, 2026-07-26, active | **ADOPT (pinned, wrapped)** — BVH culling, LOD chains, shadow LOD |
| `@three.ez/batched-mesh-extensions` 0.0.12 | MIT, 2026-06-23, early | **TRIAL** only if BatchedMesh culling insufficient |
| `agargaro/octahedral-impostor` | MIT, WIP, **not on npm** | **ADAPT — vendor** for far trees; cross-billboards are the fallback |
| SimonDev/GoT-style per-blade grass | technique, not a library | **ADAPT later** for open meadows; default groundcover = atlas cross-quads |
| three-custom-shader-material v5 | MIT, active | **OPTIONAL** — we already do onBeforeCompile in-repo |
| Skyrim GRAS schema (class→recipe, density, slope, fade) | design reference | **ADOPT the schema** onto our land-cover classes |
| DynDOLOD/OpenMW merged-static LOD (offline BTO-style merge) | design reference | **ADOPT offline**: compiler bakes per-chunk far-LOD merged meshes for LOD2 chunks (atlased, no per-instance cost at distance) |
| GPU Gems 3 ch.16 wind (main+detail bending) | technique | **ADOPT**; compiler-approximated vertex colours |

### Recommended tier structure & rough budgets (chunk ≈ 460 m; budgets are per *visible set*, mid-tier target)

| Tier | Content | Mechanism | Range | Budget (mid-tier) |
|---|---|---|---|---|
| **T1 Hero placed** | landmark trees, ruins-adjacent flora, authored clutter | BatchedMesh per material-atlas group; compiled colliders | full chunk streaming range; far-merged into LOD meshes | 50–300 refs/chunk; only ~active ring at full detail |
| **T2 Instanced mid** | common trees, shrubs, big reeds, rocks (scattered, seed-stable, in bundles) | InstancedMesh2 per species-group, BVH culling, LOD chain: full mesh → meshopt-reduced (~15–100 m band in agargaro's demo) → billboard/impostor | 0–~400 m as meshes | 1–5k instances/chunk in bundle; ≤ ~50k mesh-LOD instances visible, ~20–40 draw calls |
| **T3 Groundcover** | grass, sedge, litter, small ferns — runtime-generated from land-cover raster, no bundle data, no collision, no persistence | InstancedMesh (cross-quad clusters) per camera-ring grid tile; wind + stomp shader; hard fade | 0–60/90/120 m by quality tier | ~10–30k cluster instances total; castShadow off; density+radius is THE quality knob |
| **T4 Distant** | everything beyond mesh range | vendored octahedral/cross-billboard impostors via InstancedMesh2 far-LOD + compiler-baked merged far-LOD meshes per LOD2 chunk | 400 m–horizon | impostors ~1 quad/tree, 1–2 draw calls/species; merged meshes amortize to ~1 draw/chunk |

**Biggest risks**: (1) overdraw from lush alpha-tested foliage on mobile —
mitigate with card shrink-wrapping, fade radii, sorted draw; (2) pre-1.0
dependency (`@three.ez/*`) — pin + wrap; (3) impostor bake time/VRAM for many
species — bake per-species on demand, cap species count in the far tier;
(4) CSM shadows × vegetation (see the sky research: `setupMaterial()` on every
streamed material, `castShadow=false` beyond cascade 2).
