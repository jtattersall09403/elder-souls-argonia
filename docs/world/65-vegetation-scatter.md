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

- **Scatter is a compiler pass**: jittered-grid sampling with
  `hash(seed, layer, cell)` per decision — deterministic, chunk-local,
  byte-stable across recompiles. Density comes from the land-cover raster and
  ecology fields; constraint filters run cheapest-first (density → slope →
  wetness/salinity → clearance). Hero assets and larger layers stamp clearance
  rasters that smaller layers reject against (one-directional, big → small),
  so a reed never grows through a hull. Water vegetation (lilypads, emergent
  reeds) samples the water surface, not the ground.
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

- **Phase 10** builds the machinery against the reference watershed: scatter
  compiler pass, T1/T2 renderers + LOD chains, T3 groundcover ring, wind
  uniforms, budget probes (visible instances, draw calls, overdraw estimate —
  §69 already reserves them). The **dense-vegetation micro-lab** (§85.3)
  proves the budgets before the province sees them; species selection uses the
  already-catalogued BM&V tree meshes and grass/reed billboard families (§74.1b).
- **Phase 13** authors province-wide density: per-region ecology-driven
  palettes and densities (region grammar §16), seasonal response to `s(t)`.
- **Phase 14** locks quality tiers (T3 ring radius/density, T2 visible cap,
  impostor distances as one declarative table) and per-device budgets.

**Acceptance (binding):** perceived density in flooded-forest/jungle classes
reads as *dense* on the mid device tier at 60 fps target; scatter is
deterministic (same seed → byte-identical bundles); region identity visibly
changes vegetation density and species mix; groundcover never pops as a
carpet-edge (fade ring); vegetation responds to wind and (Phase 13) season;
budgets are probe-measured, not eyeballed.

---
