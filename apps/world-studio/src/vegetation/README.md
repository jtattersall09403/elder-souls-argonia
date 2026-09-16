# Vegetation renderer (Phase 10)

Draws the scatter compiler's output, plus the runtime groundcover ring. One
job per file:

| File | Job |
|---|---|
| `vegetationBundle.ts` | decodes `chunk_<cx>_<cz>_vegetation.bin` — 16 bytes per instance, written by `worldgen/scatter.py` |
| `floraKit.ts` | indexes a compiled kit GLB by semantic asset id, with its LOD chain (used by both kits) |
| `Vegetation.tsx` | T1/T2: streams chunk bundles around the focus and draws them as instanced meshes |
| | loads **two** kits — `flora-province-v1` (trees, shrubs, rocks) and `underwater-v1` (the 16f band: kelp, corals, shell beds, wrecks) — and merges them with `mergeFloraKits` |
| | **first wins** on a duplicate id (e.g. `tbp_seaweed06`, `waterkelptall02/03` ship in both): the land kit's copy is the one the palettes were authored against |
| `Groundcover.tsx` | T3: regenerates grass/fern/reed deterministically inside the ring from the land-cover raster and `world/sources/flora/groundcover.json`; kit `public/kits/groundcover-province-v1.glb`, hook `window.__STUDIO_GROUNDCOVER_DEBUG__` |

## What is here and what is not

Module 65 §110 specifies four tiers. **T1/T2** (baked scatter) and **T3**
(the groundcover ring, which is province-wide since it needs no compiled
bundles) are built, on plain `THREE.InstancedMesh`. **T4** (impostors beyond
the instanced range) is not. Wind **is** shipped. `applyWindSway`
(`packages/game-core/src/fx/windSway.ts`) patches the kit materials off the
weather sample. It chains `onBeforeCompile` rather than replacing it, so CSM
can still install its own hook afterwards.

### The ring's numbers

Radius and instance cap are quality presets, not constants
(`packages/game-core/src/core/quality.ts`): **50 / 65 / 75 m** and **30k / 45k
/ 60k instances** for low / medium / high. Over budget, every species is
thinned by the same factor and the factor is reported as `densityScale`. Tiles
are 16 m and world-aligned, so placement does not depend on the direction of
approach.

### Six mechanisms in the ring (16f)

- **Per-tile cache.** Generation is pure per tile and cannot see the focus,
  so crossing a tile boundary generates the row that entered and evicts the
  row that left; the rest is refilled from the cache. Any input to the
  generation (a raster arriving late, a new patch list) clears the cache.
- **Fade is a band per species.** Each rule carries `fadeM`: under 0.6 m tall
  means full density to 30 m, with nothing left by 50 m; taller species hold to
  55 m and run to the ring radius. Instances are dropped on a stable roll, so
  a species thins out of the *same* plants each frame instead of shimmering.
  Over the last 15 % of each species' own band the scale runs to zero.
- **A clump field.** A value-noise field per species, on the table's 12 m
  `clumpWavelengthM`, scales acceptance by `0.35 + 1.3 × clump`. Its mean is
  1, so the authored density survives while the two or three species sharing
  a cover trade dominance in patches instead of mixing evenly everywhere.
- **Colour off the ground.** Every instance samples `ground-tint.png` and
  sets its own `instanceColor` (± the table's `colourVariance`), so roots
  match the ground rather than floating as a separate green. This is the
  Witcher 3 pigment map at CPU cost; `instanceColor` needs no `vertexColors`.
- **One mesh per species part per quadrant.** A mesh spanning the whole ring
  stays inside the frustum at all times, so `frustumCulled` saved no draws.
  Quartering at the focus gives each mesh a tight bounding sphere that can
  leave the frustum, for at most four times the draws.
- **No shadow receipt.** `castShadow` was already off; `receiveShadow` is off
  now too. Tens of thousands of alpha-tested double-sided cards sampling two
  cascades is the most expensive work in this layer. The shadow it returns on a
  blade of grass covers a pixel or two.

Water is three regimes, not two. A rule with `waterRule: "below-at-least"`
stands in the water down to its own `maxDepthM`: 1.5 m for the marsh species
that wade, 4 m for the kelp and coral on the river bed, the seabed and the
ocean floor, which are painted ground like any other. A rule with
`waterRule: "above"` takes only ground the water has left, at or under 2 cm of
depth. A rule with neither is ordinary land cover and tolerates the half metre
of standing water a marsh keeps. The two bed covers carry a wet list and a dry
list, because dry silt is the seasonal bed and dry seabed sand is the tidal
flat.

The same rules, in Python, are `worldgen/groundcover_ring.py`; the floors they
have to hit are `worldgen/test_groundcover_floors.py`.

Plain `InstancedMesh` is deliberate, not a shortcut. Every instancing wrapper
is built on it and it adds no dependency to pin. It is the honest baseline the
budget probe should measure before `@three.ez/instanced-mesh` or impostors are
justified by evidence rather than in advance.

## Two traps, both already sprung

- **Never look a kit asset up by its glTF node name.** three.js sanitises node
  names for animation property paths and strips the slashes out of
  `bmv__landscape/trees/cypress1`. The whole kit rendered empty and silently:
  every lookup missed, no error anywhere. The id travels in glTF `extras`
  instead (`export_extras=True` in the kit builder), carrying the LOD level
  with it.
- **One instanced mesh per chunk is a draw call per chunk; one mesh per
  neighbourhood cannot be culled.** Buckets were keyed by (species, LOD level)
  across every loaded chunk — 449 draws became 96 for the same 43,536
  instances — but a mesh spanning the whole 5x5 neighbourhood (~2.3 km) is
  never outside the frustum, so `frustumCulled` bought nothing and every
  bucket was submitted every frame and every cascade. The key now carries a
  QUARTER of the neighbourhood too: (species, LOD level, BLOCK), where the
  block is the quarter cut at the focus chunk's centre lines. A (species,
  level) holding under 120 instances across the neighbourhood stays unsplit —
  quartering a bucket of a handful costs draws and culls nothing. Measured on
  the densest jungle neighbourhood: 50 buckets before, 62 after. Blocks share
  a kit geometry through a per-block view (`blockGeometry`) so each gets its
  own `esWindTune` attribute without duplicating a vertex buffer.

## Measuring it

```bash
cd apps/world-studio && npm run build
cd ../combat-sandbox && node ../world-studio/scripts/probe-vegetation.mjs
```

Boots the built studio over the five areas decision 0036 Q3 signed off,
screenshots each and reads `window.__STUDIO_VEGETATION_DEBUG__`
(`{chunks, instances, draws, triangles}`). Artifacts land in
`apps/world-studio/artifacts/`. Note the probe passes `--base` to
`vite preview`: preview runs with `command === "serve"`, so the build-time
base is not applied and the built `index.html`'s absolute asset paths 404
without it.

## Coverage

Only the exemplar and contrast areas are compiled
(`public/province/vegetation/`, 42 chunks) — the rest of the province has no
bundles and renders bare, which is the exemplar-first rollout working as
intended (module 95 §85.4). Province-wide fill is Phase 15.
