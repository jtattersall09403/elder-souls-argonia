# Multi-scale vegetation placement: what AAA open worlds do, and our mapping

**Phase 10, 2026-08-30.** How shipped open-world games layer vegetation
placement decisions across scales, how they dress water features, and what the
dense/distant rendering end needs in three.js — including the black-foliage
and shadow fixes. Companions (not repeated here):
[vegetation-scatter-instancing-threejs.md](vegetation-scatter-instancing-threejs.md)
(rendering survey, library verdicts, wind, bundle format),
[shipped-world-placement-rules.md](shipped-world-placement-rules.md) (mined
numbers R1–R14), [vegetation-density-design.md](vegetation-density-design.md)
(density philosophy), and module
[65-vegetation-scatter.md](../world/65-vegetation-scatter.md) (the architecture
the phases implement). This doc adds the *placement-architecture* layer those
docs don't cover: the macro→meso→micro pattern, and the specific rendering
fixes for foliage going dark at distance and shadows on alpha-tested
instanced meshes.

## 1. The common pattern: three scales, negotiated downward

Every shipped system surveyed converges on the same three-level shape, whatever
it calls the levels:

1. **Macro — biome/ecotope fields.** Continuous maps over the whole world
   answering "what kind of place is this?": climate, humidity, altitude,
   biome/ecotope id, canopy closure. Authored coarsely (painted or simulated),
   consumed everywhere. *One decision per ~100 m–1 km.*
2. **Meso — scene/feature rules.** Rules attached to *features*, not to
   ground: water margins, roadsides, clearings, cliff bases, forest edges,
   under-canopy. Almost always expressed as **distance fields to features**
   ("within 6 m of the river", "at least 10 m from the road") plus
   **feature-local frames** (along the bank, facing the water). This is the
   level that makes "reeds ring the pond" and "the road has a verge"
   expressible at all. *One decision per ~5–50 m.*
3. **Micro — per-asset constraints and negotiation.** Per-species gates
   (slope, altitude, water depth, land cover), soft response curves
   (viability/weight), and **footprint/priority negotiation** so a fern never
   grows inside a trunk and big things push small things aside — always
   resolved **big/high-priority → small**, never the reverse. *One decision
   per instance.*

The macro level chooses *recipes*, the meso level chooses *scenes*, the micro
level chooses *stems*. Games differ in where the computation runs (offline
Houdini vs runtime GPU) but not in this decomposition.

### 1.1 Horizon Zero Dawn — GPU run-time placement (GDC 2017, Jaap van Muijden)

The canonical reference: [GDC Vault talk](https://gdcvault.com/play/1024700/GPU-Based-Run-Time-Procedural)
([slides at Guerrilla](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn),
[80.lv summary](https://80.lv/articles/real-time-procedural-placement-in-horizon-zero-dawn)).

- **Macro:** artists paint **ecotope maps** (named biome recipes) plus **world
  data maps** the whole engine can query — "each shader, placement system, or
  sound could query the current humidity, temperature, distance to nearest
  river, etc." ([80.lv team interview](https://80.lv/articles/horizon-zero-dawn-interview-with-the-team)).
  Note *distance to nearest river* is a first-class world field — the meso
  level is baked into queryable data, not hand-painted per pond.
- **Meso/micro:** per-asset **density maps** are computed on the GPU by
  **placement graphs** — node graphs artists author that combine world data
  maps (rivers and roads kept as **signed distance fields**, so "10 m away
  from roads" is one node — [GameDev.net architecture breakdown](https://gamedev.net/forums/topic/699541-placement-and-rendering-techniques-for-vegetationdetails/)),
  then sampled with a dither pattern into candidate points.
- **Negotiation:** each asset has a **footprint** (radius) and a priority;
  overlapping candidates are resolved so high-priority/large-footprint assets
  win and kill lower ones nearby — "the concept of a 'footprint' combined with
  'ecotypes' is central to this system" ([Kacper Szwajka's Unity
  reimplementation](https://medium.com/@kacper.szwajka842/gpu-run-time-procedural-placement-on-terrain-cc874e39bbfb)).
  Placement is fully deterministic, regenerated in a grid of tiles around the
  camera; only tiles crossing from behind to in front are recomputed.
- Big gameplay-relevant rocks are *not* in this system — hand-placed or
  terrain, i.e. the hero tier stays authored
  ([research notes](https://www.neiliakini.com/post/horizon-zero-dawn-open-world-environment-generation-research-and-notes)).
  The same notes observe HZD's forests read as **emergent hero trees →
  canopy → patchy undergrowth in canopy gaps**, with river banks getting a
  distinct riparian set and *no* standard undergrowth.
- The [ezEngine ProcGen system](https://ezengine.net/pages/docs/terrain/procedural/procedural-object-placement.html)
  is an open reimplementation of this design worth reading for shape: graph
  assets define rules, volume components scope them, extra components locally
  clear or boost density, everything deterministic.

### 1.2 Far Cry 5 — chained offline tools (GDC 2018, Étienne Carrier)

[GDC Vault](https://www.gdcvault.com/play/1025557/Procedural-World-Generation-of-Far),
[detailed notes (christianjmills)](https://christianjmills.com/posts/procedural-tools-far-cry-5-notes/),
[PlayStation Blog writeup](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/).
Houdini tools run offline over 64×64 m sectors, nightly, so terrain could keep
changing for 2.5 years without invalidating dressing. The instructive parts:

- **Tools chain sequentially and feed each other**: freshwater → cliffs →
  biomes; "tools export data to influence subsequent tools (e.g., freshwater
  generates a water mask used by the biome tool)". The cliff tool exports a
  cliff mask the biome tool uses as an **exclusion mask**, plus a **point
  cloud for rocks and ledge vegetation** — cliff dressing is the cliff tool's
  own output, not the ground scatter's tail (exactly our mined rule R3's
  cliff-species caveat).
- **Micro = viability competition**: each species scores terrain inputs
  ("occlusion, flow map, slope, curvature, illumination, altitude…");
  "species with the highest accumulated viability at a location wins";
  **asset size is linked to viability**, so forests taper naturally at their
  edges (graduated 50 m/40 m/30 m size bands by viability).
- **Priority radius**: "trees (priority 10) prevent other trees but allow
  bushes (priority 0) nearby via graduated priority radius settings" — HZD's
  footprint negotiation, offline.
- **Species-to-species dependency via masks**: Ponderosa outputs a viability
  mask; forest-rock scatter *consumes* it — our R7 guilds, implemented as
  field dependencies rather than joint sampling.
- **Feedback onto terrain**: scattered assets stamp back deformation, ground
  textures (roots under trees), masks and colour tint ("humidity and
  lushness") — placement and ground texturing are one conversation.

### 1.3 Unreal Engine 5 PCG Biome Core — the current authoring grammar

[Electric Dreams sample docs](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-in-electric-dreams),
[Biome Core overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine).
The hierarchy is explicit: **biome actors** (macro volumes, each with a
priority) run **local graphs** producing points; a **global "brain" graph**
collects all biomes, sorts by priority and takes the **priority-based
difference** between point sets before spawning — negotiation as a set
operation. Points recurse ("children per root point", capped depth) so a tree
spawns its own root-flare plants — a guild as a parent→child rule. Two ideas
worth stealing conceptually:

- **Assemblies**: a hand-arranged cluster of meshes (a stump + ferns + rocks,
  arranged by an artist in a level) is exported to a *point cloud with
  transforms* and stamped by the procedural system as one unit. This is the
  industrial answer to "hand-placed feel at procedural scale" — author
  *arrangements*, scatter *arrangements*. It composes with our no-new-art
  rule: an assembly is placement data, not art.
- **Hierarchical generation grids**: different parts of the graph execute at
  different grid sizes (big grid for trees, fine grid for detail), each
  streamed separately — the same reason our T2 lives in 468 m chunk bundles
  and T3 in a fine camera ring.
- How "reeds around ponds" is expressed in practice: get the water body's
  **spline**, sample **on-boundary with offsets** for the reed belt, sample
  **on-interior filtered by depth** for lilypads (UE 5.4 added a Water Spline
  Interop node to read depth/width along water splines —
  [Digital Production worldbuilding writeup](https://digitalproduction.com/2024/05/28/procedural-worldbuilding-mit-unreal/)).
  Meso rules are *feature-frame* rules: along-spline, signed-offset-from-edge,
  depth-banded.

### 1.4 Witcher 3 / REDengine 3 (GDC 2014, Marcin Gollent)

[GDC Vault](https://www.gdcvault.com/play/1020197/Landscape-Creation-and-Rendering-in).
Vegetation coverage is procedurally generated from **terrain material layers**
(moving away from linear material blends), both offline and on the fly; the
striking extra is an **ecological light simulation**: the engine traces the
sun's trajectory, computes the fraction of time a cell sits in shadow, and
spawns vegetation types whose authored light requirement matches — undergrowth
follows canopy gaps *causally*, not by a painted mask. (Community REDkit docs:
[Vegetation Edit Tool](https://cdprojektred.atlassian.net/wiki/spaces/W3REDkit/pages/6328788/TOOL:+Vegetation+Edit+Tool).)
Ground-material-drives-grass is the same LTEX→GRAS binding Bethesda uses (our
research doc §1 and mined rule R10).

### 1.5 Bethesda, Ghost of Tsushima, Breath of the Wild — already covered, one line each

- **Bethesda**: two-tier split (placed statics + GRAS groundcover keyed to
  painted ground, region generator unused in practice) — mined and adopted in
  [shipped-world-placement-rules.md](shipped-world-placement-rules.md) R10/R11.
- **Ghost of Tsushima**: grass is 100 % procedural, generated per-blade on the
  GPU from heightmap tiles around the camera, no stored instances
  ([GDC 2021, Eric Wohllaib](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass));
  wind is a global system every consumer samples
  ([GDC 2021, Bill Rockenbeck](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating)) —
  both already reflected in module 65 (T3 ring, single wind block).
- **Breath of the Wild**: deliberate negative space as a navigation tool —
  the design argument and citations live in
  [vegetation-density-design.md](vegetation-density-design.md) §(a).

### 1.6 The distilled pattern, one table

| Scale | HZD | Far Cry 5 | UE5 PCG | Witcher 3 | Us today |
|---|---|---|---|---|---|
| Macro | ecotope + world data maps | biome painting + abiotic inputs | biome actors w/ priority | terrain material layers | ✅ region classes, climate, hydrology, land-cover rasters |
| Meso | SDFs to rivers/roads in placement graphs; riparian sets | freshwater/cliff tools export masks & point clouds to the biome tool | spline boundary/interior sampling, assemblies, parent→child recursion | sun-shadow simulation → light-requirement matching | ❌ **missing** — no distance-to-feature fields, no scene rules, no guild placement |
| Micro | footprint + priority negotiation, dither sampling | viability competition, priority radius, size↔viability | priority-based point difference, self-pruning | per-type density/light rules | ◐ partial — gates + weights + clearance stamps exist; no size↔viability link, guilds only implicit |

## 2. Mapping onto our compiler

Where `worldgen/scatter.py` + `compile_scatter.py` stand against the pattern:

**Macro — exists.** `ProvinceFields` already serves region class, land cover,
height, slope and (the one derived field) height-above-water-table, per
sample; palettes gate per sample, not per chunk. This *is* the
ecotope/world-data-map layer, and its data flow matches HZD's ("query the
current humidity… distance to nearest river") minus the distance fields.

**Meso — the missing layer.** Today a `Layer` can say "0–0.5 m water depth"
(a *band* test) but cannot say "within 8 m of a pond edge", "along the bank,
facing open water", "in a canopy gap", "at a cliff base", "10 m off the
route". Every surveyed engine expresses meso rules as **distance fields +
feature frames**. The natural fit for us, all compiler-side and deterministic:

1. **Derived feature fields** in `ProvinceFields`, computed once per compile
   the way `depth_m` already is (that `distance_transform_edt` call is the
   template): signed **distance-to-water-edge** (negative inside water — this
   is strictly stronger than depth: it distinguishes "0.3 m deep, 2 m from
   shore" from "0.3 m deep, 40 m out on a flooded flat"), distance-to-route
   and distance-to-POI-socket when Phase 11 lands them, cliff-base distance
   (from the slope raster), and a **canopy field** written *by the scatter
   pass itself* (T1/T2 tree layers accumulate a coarse canopy-closure raster
   as they place — Far Cry's Ponderosa→forest-rock mask; Witcher 3's light
   sim approximated as "under canopy vs in a gap"). Layers then gain
   `water_edge_m: (min, max)`-style gates and soft responses, same shape as
   the existing depth/slope machinery.
2. **Scene/guild placement** for the tight water guild (mined R7, lift 8–11:
   reeds↔lilypads↔mangrove are "effectively one placement decision"). Instead
   of three independent layers coincidentally overlapping, one **guild layer**
   places an anchor (a waterline point) and spawns its members in
   feature-frame offsets (reeds at −0.2…+0.3 m depth, lilypads 2–6 m
   waterward, a leaning tree on the bank) — UE5's parent→child recursion /
   assemblies, in ~30 lines of the same hash-driven sampler. The existing
   clump machinery is already 80 % of this; a guild is a clump whose members
   differ by species and offset rule.
3. **Sequential stamping stays one-directional** (already true: clearance
   sorts big→small in `merge_palettes`). New meso stamps slot into the same
   ordering: routes/POIs stamp clearance before flora (module 65 §111 and
   the Phase 11 sightline job in
   [vegetation-density-design.md](vegetation-density-design.md) §6).

**Micro — partial.** Gates + weight curves + clearance stamps ≈ viability +
footprint. Two cheap upgrades from the survey: (a) **size↔viability** — scale
an instance toward the low end of `scale_range` as its `weight()` drops, so
stands taper at their edges instead of stopping (Far Cry's graduated size
bands; one multiplication in `scatter_chunk`); (b) clearance today is
all-or-nothing (`respects_clearance`) where Far Cry grades it by priority
pairs ("trees block trees but allow bushes") — worth adopting only if the
one-directional big→small ordering proves too blunt; it hasn't yet.

**What we should *not* copy:** runtime GPU placement (HZD) — our T1/T2 are
compiler-baked into bundles for byte-stable determinism, streaming economy and
GitHub-Pages hosting, and only T3 regenerates around the camera (module 65
§110). The *rule grammar* transfers; the execution venue does not.

## 3. Dressing water features

What the sources agree on, merged with our own mined numbers:

- **The margin is the scene.** BM&V's densest band is ±0.5 m around the water
  table (R2: 117/ha vs 50–75/ha in open water and 53–73/ha on dry ground);
  HZD gives river banks a dedicated riparian set and *removes* standard
  undergrowth there; Far Cry's freshwater tool "creates the water surface,
  waterside assets, and terrain texturing" from the spline itself, then hands
  the water mask and SDF downstream ("water signed distance field drives grass
  color variation near water bodies", and grass *rotates toward shorelines*).
  Skyrim's own GRAS schema has a distance-from-water mode enum (CattailGrass:
  "below, at least" — R10).
- **The concrete banding recipe** (each number authored per-species, these are
  the mined/observed shapes):
  - **Emergent reed belt**: waterline anchor, roughly −0.5…+0.3 m depth,
    placed as a *belt along the edge* (dense clumps, R1's reed clump size 11),
    not a disc — i.e. gate on distance-to-edge, not just depth.
  - **Floating-leaf band (lilypads)**: 0.3–2 m of *calm* water (BM&V shallows:
    one in five objects is a lilypad, 92 % on flooded ground — R4); instances
    sample the **water surface**, not the ground (module 65 §111), yaw-random,
    scale-varied, never on flowing river reaches (flow gate when the
    hydrology field is exposed to scatter).
  - **Submerged tier (kelp/grasses)**: 0.5 m+ depth, sparse, ground-anchored.
  - **Bank trees lean in**: overhanging margin trees are a distinct layer
    with tilt *toward the water frame* (feature-frame yaw/tilt, like Far
    Cry's shoreline-facing grass) — our `tilt_x/tilt_z` already carry it;
    the missing input is the edge normal, which the water-edge distance
    field's gradient provides for free.
  - **Banks get rocks and openness, not undergrowth**: HZD's rocky erosion
    banks + our sightline rule — water margins are primary navigation edges
    (Lynch "edges", density doc §6), so the reed belt should be *punctuated*
    (gaps at landings, mudflat stretches) rather than a hermetic ring. Bare
    margin is a first-class outcome exactly as bare ground is (R10).
- **Ponds vs rivers vs flooded forest are different scenes** sharing the same
  bands: a pond is a closed edge (belt ring), a river adds flow (no lilypads,
  reeds in slack margins only), flooded forest is "waterline everywhere" and
  gets the depth-band mix without the belt geometry. Expressing this needs
  nothing beyond the §2 fields: water-edge distance + depth + flow class.

## 4. Rendering the dense and distant end in three.js (our stack: r0.184, WebGL2, CSM, masked-alpha NIF-converted foliage)

Tier structure, libraries, impostors, wind and overdraw are settled in
[vegetation-scatter-instancing-threejs.md](vegetation-scatter-instancing-threejs.md)
§2/§5 — unchanged. This section adds the two problem clusters the renderer
will hit next: foliage going dark/thin at distance, and shadows for
alpha-tested instanced meshes.

### 4.1 Why alpha-tested foliage goes dark and thin at distance, and the fixes

Two independent causes, both in the mip chain; both need fixing, in the
**kit-builder** (asset ingest), not the shader:

1. **Alpha-coverage decay → foliage *thins*.** Box-filtered mips average
   smooth alpha edges downward, so ever fewer texels pass `alphaTest` in
   lower mips and canopies dissolve to sticks at distance
   ([Castaño, "Computing Alpha Mipmaps"](http://www.ludicon.com/castano/blog/articles/computing-alpha-mipmaps/),
   [the-witness.net mirror](http://the-witness.net/news/2010/09/computing-alpha-mipmaps/);
   [lisyarus's survey of methods](https://lisyarus.github.io/blog/posts/exploring-ways-to-mipmap-alpha-tested-textures.html);
   [asawicki.info on cutout quality](https://asawicki.info/articles/alpha_test.php5)).
   **Fix: per-mip alpha scaling** — after generating each mip, find the scale
   factor that restores that mip's pass-`alphaTest` coverage to the base
   level's (NVTT's `scaleAlphaToCoverage`; Unity's "Mip Maps Preserve
   Coverage"; DynDOLOD does the same to Skyrim billboards). Practical
   consequence for us: **generate mips offline in the kit builder and ship
   them** (KTX2 with explicit mips), or apply the scaling in a small ingest
   step before GPU upload — never rely on three.js's automatic
   `generateMipmaps` for foliage atlases. Cheap approximation if full
   coverage-scan is annoying: remap alpha so the minimum is ~⅓ of the 0.5
   threshold, or simply multiply alpha ~2× in lower mips.
2. **Dark-edge bleed → foliage goes *black*.** The RGB of fully transparent
   texels (usually black in NIF-converted DDS foliage) is averaged into mips
   regardless of alpha, so every distant leaf inherits a black halo and the
   whole canopy darkens as mips take over
   ([polycount thread on exactly this symptom](https://polycount.com/discussion/208722/issues-with-foliage);
   asawicki above). **Fix: dilate/solidify the RGB** before mipping — flood
   the edge colour outward into transparent texels (8–16 px is plenty), OR
   premultiply alpha before filtering (then un-premultiply or adjust the
   shader). Dilation is the right choice for us: it's a pure texture-prep
   step with no material changes, and Skyrim/mod source textures are
   frequently *not* dilated (black or grey in the transparent region), so the
   kit builder must do it — check with an `alpha<0.1 → what colour?` probe at
   ingest rather than assuming.

Three further shading-side measures, ranked:

3. **Bent normals.** True geometric normals on foliage cards make half the
   card face away from the sun and go black; the standard fix is to bend
   vertex normals toward a sphere/dome around the plant's centre (crowns) or
   straight up (groundcover), so lighting reads as a volume
   ([Polycount foliage wiki](http://wiki.polycount.com/wiki/Foliage),
   ["transfer normals from a sphere or half sphere"](https://polycount.com/discussion/125920/correct-vertex-normals-for-foliage);
   SpeedTree pushes normals out from the parent branch). This is a mesh-prep
   step in the kit builder (compute `normalize(vertex − crownCentre)` blended
   ~50–100 % over the geometric normal for leaf/card sub-meshes; grass cards
   → straight up). Caveat from the same threads: it fights specular/fresnel
   on PBR materials — pair with roughness ≈ 1 on foliage, which our sourced
   textures want anyway.
4. **Lighting floor.** With one directional sun + shadows, unlit faces need a
   directional-ish ambient: our hemisphere light already provides it; tint
   groundcover toward the terrain albedo at the root (research doc §2.3) and
   keep foliage `roughness=1, metalness=0`. A cheap wrap-lighting term
   (`NdotL*0.5+0.5` weighted) via `onBeforeCompile` is the classic
   translucency stand-in if leaves still read too crunchy — cheaper and more
   robust than real transmission.
5. **Cutout mode.** Keep `alphaTest≈0.5, transparent:false, depthWrite:true`
   (what `floraKit.ts` already sets). Two alternatives now in core:
   `material.alphaToCoverage` (needs the context created with
   `antialias:true`; MSAA dithers the cutout edge — [docs](https://threejs.org/docs/#api/en/materials/Material.alphaToCoverage),
   [feature issue #12438](https://github.com/mrdoob/three.js/issues/12438))
   gives softer edges at identical cost *when MSAA is on*; and
   `material.alphaHash` (r154+, [docs](https://threejs.org/docs/#api/en/materials/Material.alphaHash),
   [example](https://threejs.org/examples/webgl_materials_alphahash.html)) is
   order-independent stochastic transparency — but it is *noisy without
   TAA/SSAA* (maintainer guidance: MSAA does not clean it —
   [forum](https://discourse.threejs.org/t/how-to-make-alphahash-material-transparency-visually-same-as-transparent-property-has/53350/2)),
   and we have no TAA, so alphaHash is out for now. Also set
   `forceSinglePass=true` on any double-sided foliage material — three.js
   otherwise renders double-sided transparent-ish materials in two passes
   ([docs](https://threejs.org/docs/pages/Material.html)). Verdict: **stay
   alphaTest; flip on `alphaToCoverage` only on quality tiers that run
   MSAA**; fix distance quality in the mips (points 1–2), not the test.

### 4.2 Shadows for alpha-tested instanced foliage (with CSM)

Shadow maps render with a depth material that knows nothing of the surface
material's texture, so an alpha-tested tree casts the shadow of its *full
cards* — blobby rectangles — unless the depth pass also alpha-tests:

- **The canonical pattern** ([WestLangley's PR #8629](https://github.com/mrdoob/three.js/pull/8629)):

  ```js
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: foliageMap,          // or alphaMap
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  ```

  `InstancedMesh` instancing is handled automatically in the depth pass
  (`USE_INSTANCING` is a renderer-level define), so this works per
  instanced mesh with no extra plumbing.
- **Since r147 the built-in shadow path handles the simple case itself**:
  [PR #25000](https://github.com/mrdoob/three.js/pull/25000) made the shadow
  depth material honour `material.map` + `material.alphaTest` directly, so
  for plain alpha-tested materials (our current `floraKit.ts` setup) leafy
  shadows should already be correct with **no** customDepthMaterial. The
  custom material becomes mandatory again the moment the vertex shader is
  customised — i.e. **when wind lands**: the same bend must be injected into
  the depth material's `#include <begin_vertex>` via `onBeforeCompile`, or
  swaying trees cast rigid shadows offset from themselves. Two recorded traps:
  a custom depth material being ignored/overridden after the r147 change
  ([forum: R147 instancing with shadows](https://discourse.threejs.org/t/r147-instancing-with-shadows/45423),
  [issue #25217](https://github.com/mrdoob/three.js/issues/25217)) — verify
  on our r0.184 with a one-off probe rather than assuming either way; and
  `alphaTest` living in a define in some paths, so per-value materials —
  share one foliage alphaTest value (0.5) across the kit.
- **CSM interplay**: three-csm only patches the *surface* materials
  (`setupMaterial()` — the gotcha already recorded in module 65 §111); the
  shadow *casting* side above is independent of CSM and composes with it.
  Keep the existing policy: `castShadow` only on LOD 0 (`Vegetation.tsx`
  already does this), `castShadow=false` for T3 groundcover always, and when
  the instancing library lands, use its shadow-LOD so casters swap to cheap
  LODs in the shadow pass.
- **Cost note**: alpha-tested depth rendering disables early-Z in the shadow
  pass too; shadow-casting foliage is paid for twice. The mined lever is the
  same as the main view: shrink-wrapped cards (less transparent area) and
  fewer caster instances (LOD-0 ring only).

### 4.3 Budgets, briefly

Our own first measurement (module 65 §112: 13 chunks → 43,536 instances, 96
draws, 6.6 M triangles on plain `InstancedMesh`) is consistent with what the
three.js community achieves: agargaro's
[200k-tree forest with impostors + BVH-culled instancing](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
runs mobile-friendly, and the practical WebGL2 ceilings are draw-call count
(keep vegetation ≤ ~100–150 draws via (species×LOD) bucketing — already done)
and alpha overdraw (the mobile killer — research doc §2.4), not raw instance
count. The upgrade path stays evidence-gated per module 65: measure before
adopting `@three.ez/instanced-mesh`/impostors.

## 5. Recommendations (what module 65 / Phase 10–11 should absorb)

| # | Recommendation | Where |
|---|---|---|
| 1 | Add **derived feature fields** to `ProvinceFields`: signed distance-to-water-edge (+ its gradient as the bank frame), later distance-to-route/POI, cliff-base, and a canopy raster accumulated by the tree layers during scatter | compiler (meso layer) |
| 2 | Add per-layer **water-edge gates/responses** and a **guild layer** type (anchor + feature-frame members) for the R7 water guild; belts along edges, not discs | compiler (meso layer) |
| 3 | **Size↔viability**: scale toward `scale_range` low end as `weight()` falls, so stands taper at edges | compiler (micro, one line) |
| 4 | Kit builder: **dilate foliage RGB** into transparent texels, **generate offline mips with alpha-coverage scaling**, and **bend leaf/card normals** (sphere-transfer for crowns, up for groundcover); probe for undilated source textures at ingest | asset pipeline |
| 5 | Renderer: keep alphaTest 0.5 + `forceSinglePass`; `alphaToCoverage` only on MSAA tiers; no alphaHash (needs TAA). Verify r0.184 leafy shadows (r147+ built-in path); when wind lands, mirror the bend into a `customDepthMaterial` (`MeshDepthMaterial` + `RGBADepthPacking` + map + alphaTest) via the same `onBeforeCompile` | renderer |
| 6 | Water-margin dressing follows §3's banding recipe, with deliberate belt gaps at landings/sightlines | palettes + Phase 11 |

Runtime GPU placement, per-species SDF authoring tools and UE-style graph
editors are explicitly **not** recommended — our deterministic Python compiler
already occupies the right point for a baked, statically-hosted world; what it
lacks is the meso vocabulary, not a new execution model.
