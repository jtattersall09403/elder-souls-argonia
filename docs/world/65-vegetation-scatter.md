# Part VI-b — Vegetation, scatter and the placed-asset detail layer (§109–112)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Sections §109–112 are
> newly allocated (decision 0022). Companions: technique + library verdicts —
> [research/vegetation-scatter-instancing-threejs.md](../research/vegetation-scatter-instancing-threejs.md);
> asset sources — [90-asset-strategy.md](90-asset-strategy.md) §76 (incl. the
> BM&V tree meshes and grass/reed billboard families already catalogued);
> land-cover classes — decision 0011 + [20-province-design.md](20-province-design.md) §16.

## 109. Why this is a first-class system, not a Phase-10 bullet

**Terrain identity comes from placed assets** is a binding core rule (§9): the
heightfield is deliberately coarse, and rocks, trees, reeds, roots, deadfall
and clutter carry the perceived detail. For a jungle/marsh province that rule
has teeth — *density is the look*. Whether the browser can render a dense
tropical swamp at 60 fps on mid devices is one of the biggest unretired
performance risks in the whole "can we build this world" question, and until
this module the plan carried it as two bullets ("vegetation kits", "instance
batching"). The techniques are researched and settled (research doc); this
module owns the architecture the phases implement.

## 110. Four render tiers on a two-tier design split

The *design* split is Bethesda's own: *placed statics* that define a place
(Morrowind's every-plant-is-a-reference) + *procedural groundcover* that
carpets it (Skyrim's GRAS system, painted by land-cover class). The *render*
architecture is four tiers:

| Tier | What | How | Budget guide (per chunk) |
|---|---|---|---|
| **T1 Hero placed statics** | authored/compiler-placed identity assets: hero trees, root formations, rock outcrops, wrecks | `BatchedMesh` per atlas group; compiled colliders (trunk capsules only) | 50–300 refs |
| **T2 Instanced mid detail** | seed-stable scattered trees/shrubs/large reeds | binary transforms **in the chunk bundle** (`vegetation-instances.bin`, ~12–16 B/instance); rendered via the instancing library with BVH frustum culling + LOD chain (full mesh → reduced → billboard) | 1–5k; ≤~50k visible total |
| **T3 Groundcover** | grass, small reeds, ferns, litter | **not in bundles** — regenerated at runtime from the land-cover raster (same deterministic hash as the compiler) in a camera ring; atlas cross-quads; no collision, no shadow casting | 10–30k instances in ring; fade radius+density = the quality knob |
| **T4 Distant** | tree lines and silhouettes beyond T2 range | octahedral or cross-billboard impostors + compiler-baked merged far-LOD meshes per LOD-2 chunk (the DynDOLOD/OpenMW object-paging lesson) | one draw per chunk/species group |

Library verdicts (details/citations in the research doc): three.js
`InstancedMesh`/`BatchedMesh` core; **adopt `@three.ez/instanced-mesh`**
(pinned and wrapped — active but pre-1.0); vendor/adapt the octahedral-impostor
technique with Skyrim-style cross-billboards as the zero-risk fallback; no
maintained grass library exists — our own small shader (atlas cross-quads
default).

## 111. Deterministic scatter, wind, and constraints

- **Scatter is a compiler pass**, and it is **clustered, not jittered**
  (corrected 2026-08-30 by the Phase 10 mining — [research](../research/shipped-world-placement-rules.md)
  rule R1). Every species in both mined worldspaces sits at a Clark-Evans R of
  ~0.45: neighbours half as far apart as random. A plain jittered grid scores
  *above* 1.0 — more even than random, the opposite of hand placement. The
  sampler therefore places **clump centres** on a jittered grid and members
  around them (median clump radius ~10 m), with a singleton share between
  them, and `clark_evans` is a standing probe on compiler output.
  Determinism is `hash(seed, layer, cell)` over a **global** grid, not a
  chunk-relative one, so a clump straddling a chunk edge is generated
  identically from both sides instead of thinning every seam.
- Density comes from the land-cover raster and ecology fields as a **field,
  not a constant**: it peaks at the waterline and falls by half per ~12° of
  slope to a floor (rules R2, R3). Constraint filters run cheapest-first
  (density → slope → wetness/salinity → clearance). Hero assets and larger
  layers stamp clearance rasters that smaller layers reject against
  (one-directional, big → small), so a reed never grows through a hull. Water
  vegetation (lilypads, emergent reeds) samples the water surface, not the
  ground.
- **Palettes gate per sample, not per chunk.** Argonia's region classes
  interdigitate well below the 468 m chunk, so there is no such thing as "the
  chunk's palette": layers carry their own region gate and the region raster
  decides at each candidate position.
- **A submerged depth band is a scatter tier of its own** (owner feedback
  2026-09-03): coastal and channel beds from the waterline to ~12 m carry
  their own layers (kelp/eelgrass analogues, coral-like growths from the
  sourced underwater pools, sunken debris, shell beds), gated by water class,
  depth and turbidity rather than the land region raster. Wrecks and sunken
  structures are catalogue *places*, never scatter. Phase 15 deliverable,
  after Phase 13's ecology output; assets from module 90 §76.
- **Every route is a corridor** (Phase 11): `worldgen/routes_raster.py` is the
  one source for both the ground paint and the clearance — major roads,
  tracks, footpaths and boardwalks stamp a trunk-clear mask (14/8/4/3 m) and a
  groundcover-thinning mask, and `scatter.route_allows` drops woody layers and
  keeps 25% of the herb layer inside it. Boardwalks paint no ground (placed
  asset over water) but still clear.
- **Collision is tiered**: T1 hero assets get compiled colliders; T2 trees get
  trunk capsules only; T3 groundcover is visual-only. Scatter placements land
  in the same bundle files the streaming contract already reserves
  (`vegetation-instances.bin`, static batches).
- **Wind is one global uniform block owned by the weather system** (module 55
  §98): strength/direction/gust drive GPU Gems–style main+detail vertex
  bending on T1–T3 (never on impostors), and the same block later feeds water
  chop and drifting particles. Sourced meshes carry no authored stiffness data
  — the compiler approximates per-vertex bend weights (height-based) at
  ingest.
- **The #1 performance killer is alpha-test overdraw on mobile GPUs**:
  mitigations are compiler-side card shrink-wrapping (tight geometry around
  the visible texels), hard fade radii, front-to-back sorting, never
  alpha-blend for foliage. Streamed vegetation materials must pass through the
  CSM `setupMaterial()` path like chunk materials (research doc gotcha).

## 112. Sequencing and acceptance

**Built so far (Phase 10, 2026-08-30):** the scatter compiler
(`worldgen/scatter.py`, `worldgen/compile_scatter.py`) with its clustering,
seam, variation and determinism probes; the kit builder that turns sourced
NIFs into runtime GLBs with LOD chains and collision proxies
(`pipeline/build_kit.py`); the flora palettes and groundcover table
(`world/sources/flora/`, densities settled by decision 0036); and **T1/T2 of
the renderer** on plain `InstancedMesh`
([apps/world-studio/src/vegetation/](../../apps/world-studio/src/vegetation/README.md))
with a probe that reads instance/draw/triangle counters.

First measured numbers, 13 chunks around the jungle contrast area:
**43,536 instances, 96 draw calls, 6.6 M triangles**. Two lessons already
paid for and recorded in that README: never look a kit asset up by its glTF
node name (three.js sanitises the slashes out and the kit renders empty,
silently), and bucket instances by (species, LOD) across chunks rather than
per chunk (449 draws → 96 for the same instances).

**Not built:** T4 impostors, and the decision on whether
`@three.ez/instanced-mesh` and impostors are worth their complexity. T3's
groundcover ring (round 2) and wind (round 5, driven by the weather system's
published wind — 8c is closed) have since landed.

**Budget measurement — how it is done here (owner decision, 2026-08-31).**
The dense-vegetation micro-lab (§85.3) is **CUT**, not deferred. This VM has
no GPU: a SwiftShader probe predicts nothing about a real device, and it
cannot render a ground-level dense frame in useful time at all (~2 min per
640×400 frame at 14 M tris). The owner instead playtests the deployed studio
on an **M2 MacBook Air** — real target-class hardware — and their feel report
IS the measurement. The round-3 finding that the `low` quality preset performs
best there is the first data point, and the quality presets
(`packages/game-core/core/quality.ts`) are the knob it calibrates. **Every
Phase 10+ playtest hand-off must therefore ask for an FPS/smoothness read**,
or the budget silently stops being measured. Agents keep reporting the numeric
side — instances, draws, triangles, collider counts — from
`__STUDIO_VEGETATION_DEBUG__`; the device side comes from the owner.

- **Phase 10** builds the machinery against the reference watershed: scatter
  compiler pass, T1/T2 renderers + LOD chains, T3 groundcover ring, wind
  uniforms, budget probes (visible instances, draw calls, overdraw estimate —
  §69 already reserves them). Budgets are proved by owner playtest on target
  hardware, not by a micro-lab (CUT — see above); species selection uses the
  already-catalogued BM&V tree meshes and grass/reed billboard families
  (§74.1b) plus Tropical Skyrim's flora pool (§74.1a). **Phase 10 also
  authors the flora ecology for the exemplar areas** — per-region
  ecology-driven species palettes and densities (region grammar §16), pulled
  forward from Phase 13 (owner split 2026-08-29, decision 0034), informed by
  mining vanilla/BM&V/Tropical Skyrim placement data (module 95 §86.0b).
- **Phase 13** wires seasonal response to `s(t)` through the ecology data;
  **Phase 15** fills the province palette-by-palette as region packets roll
  out.
- **Phase 14** locks quality tiers (T3 ring radius/density, T2 visible cap,
  impostor distances as one declarative table) and per-device budgets.

**Acceptance (binding):** perceived density in flooded-forest/jungle classes
reads as *dense* on the mid device tier at 60 fps target; scatter is
deterministic (same seed → byte-identical bundles); region identity visibly
changes vegetation density and species mix; groundcover never pops as a
carpet-edge (fade ring); vegetation responds to wind and (Phase 13) season;
budgets are probe-measured, not eyeballed.

---
