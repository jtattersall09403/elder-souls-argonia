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

### Four mechanisms in the baked scatter (16g)

- **LOD is crossfaded, not switched.** Within 21 m of a ring an instance is
  drawn into BOTH levels (`lodEmissions`), each with a fade band, and the
  shader (`packages/game-core/src/fx/lodFade.ts`) discards fragments against a
  4x4 Bayer threshold with complementary smoothsteps — so exactly one copy
  survives per pixel and the swap becomes a dissolve. The rebuild trigger is
  16 m, inside the band, because a fade the rebuild never revisits is a pop.
  Measured at the jungle site: 4,846 -> 5,515 instances (+13.8%).
- **Nothing that is not a plant sways.** `KitSpecies.sways` is false for the
  manifest categories `rock`, `deadfall`, `container`, `misc`, `ruin`,
  `architecture` and `clutter` (66 species). Their materials are never
  wind-patched AND their `esWindTune.x` is −1 (stiffness 0), because a rock
  can share a material with a plant.
- **Terrain occlusion.** One ray per 32 m cell from the camera against the
  streamed ground (`packages/game-core/src/render/terrainOcclusion.ts`); the
  cell's target is its canopy top, so a cell is only called hidden when the
  tallest thing that could stand in it is hidden too. Only past 120 m, and
  unknown ground never occludes. Reported as `occluded` in the stats.
- **Pooled meshes.** One `InstancedMesh` per (species, level, block, part)
  for the component's life; a rebuild writes into it, uploads only the
  filled prefix (`addUpdateRange`) and sets the bounding sphere from the
  bucket's extents; a slot not filled draws nothing (`count = 0`). Disposing
  and recreating every mesh each 16 m, and reading every matrix back for
  `computeBoundingSphere`, was half the rebuild (0072 §8). `rebuildMs` on the
  stats hook and a dev-only `__STUDIO_VEGETATION_REBUILD__()` for probes.
- **Rocks collide as their own triangles.** A `convex` species gets ONE Rapier
  trimesh built from its LOD0 geometry, not the manifest box: a box around a
  30 m cliff walls off the ledge it exists to offer. `Vegetation` builds the
  shape map (only it holds the kit) and publishes it to `VegetationColliders`
  through `shapesRef`.

### The ring's numbers

Radii and the instance cap are quality presets, not constants
(`packages/game-core/src/core/quality.ts`): a MID radius of **50 / 65 / 75 m**,
a FAR radius of **110 / 145 / 165 m**, and **30k / 45k / 60k instances** for
low / medium / high. Over budget, every species is thinned by the same factor
and the factor is reported as `densityScale`. Tiles are 16 m and world-aligned,
so placement does not depend on the direction of approach.

### Three quality tiers per species

`r` is the preset's MID radius. Every placed thing steps DOWN through the
tiers; nothing the ring places winks out.

| Tier | Geometry | Density | Range | `esLodBand` (dIn, dOut, wIn, wOut) |
|---|---|---|---|---|
| NEAR | full mesh, kit level 0 | authored | 0 – `0.4 r` | (0, `0.4 r`, 0, 4) |
| MID | baked card, view A | authored | `0.4 r` – `r` | (`0.4 r`, `r`, 4, 6) |
| FAR | baked card, view A | 35 % | `r` – far radius | (`r`, far, 6, 10) |

**Membership is per TILE, with an overlap** (decision 0072 §2): a tile's
plants are copied into every tier whose outer radius plus 14 m (the 8 m
rebuild distance plus the widest fade half-width) its nearest point is
within, so both copies of a crossing plant exist at the crossfade and the
shader fades in both directions from the live camera distance. Assigning
one tier per instance at rebuild time (round 2) made a card copy fade OUT as
the camera walked towards it, with no mesh copy until the next rebuild.

A species under 0.6 m tall ends its FAR tier at `1.6 r` rather than the
preset's far radius (which is `2.2 r`): a 30 cm tuft at 150 m is a pixel that
still costs a vertex. Every boundary is a dissolve, not a switch — the same
dithered crossfade the baked scatter uses
(`packages/game-core/src/fx/lodFade.ts`), fed by an `esLodBand` instanced
attribute per mesh, with `esLodViewPos` written each frame from the camera.
The FAR band fades to nothing at its outer radius.

The card is one quad, so it must face the viewer or it is edge-on half the
time. That rotation is in the vertex shader
(`packages/game-core/src/fx/billboardQuad.ts`,
`applyCylindricalBillboard`): cylindrical — about the instance's own Y axis
only, so grass stays rooted and foreshortens from above — and it ignores the
instance's scatter yaw entirely. Rotating on the CPU would mean rewriting every
instance matrix every frame, which is the whole cost the card tier exists to
avoid. Cards do not sway: at that distance the motion is sub-pixel and it would
fight the billboard.

**Until the kit ships cards, every tier draws level 0.** The card is looked up
once per species from the GLB (`buildCardIndex`: a billboard-level mesh whose
`userData.cardView` is `"a"`); a species with none falls back to its full mesh
at every tier — correct, just not yet cheap. `__STUDIO_GROUNDCOVER_DEBUG__`
reports `cards: false` while that is the case, with `byTier` and
`tilesGenerated` beside it.

### Seven mechanisms in the ring (16f)

- **Per-tile cache.** Generation is pure per tile and cannot see the focus,
  so crossing a tile boundary generates the row that entered and evicts the
  row that left; the rest is refilled from the cache. Any input to the
  generation (a raster arriving late, a new patch list) clears the cache.
- **Three quality tiers per species** (the table above) rather than one radius
  and a cliff. The FAR tier's 35 % thin is a stable roll (`farKeep`), so a
  species thins out of the *same* plants each frame instead of shimmering —
  and it is the *same subset* a far-band tile generates when it is thinned up
  front, so an instance neither appears nor vanishes as its tile changes band.
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
- **Persistent meshes, block-copied.** One `InstancedMesh` per (species,
  tier, quadrant, part) for the component's life. A tile's matrices and
  colours are composed ONCE when it is generated and stored as typed arrays
  (the far subset first, each block sorted by `keep`), so a rebuild is a
  few `array.set` copies per mesh and a budget thin is a prefix; the
  bounding sphere comes from the tile extents, never from reading matrices
  back. A mesh only grows (by 1.5x) when a rebuild needs more room, and one
  this rebuild did not fill draws nothing rather than being destroyed.
- **Budgeted generation.** Tiles are generated in `useFrame`, nearest first,
  within 5 ms a frame (14 ms while the ring is cold), and a fill is requested
  when the queue drains or every 0.25 s while it is long; the overlap margin
  hides the tiles still queued at the edge. Generating a whole row of tiles
  inside the rebuild was the half-second hitch every 16 m. Per tile the
  ground, slope and water are sampled once on a 2 m grid, and a species bound
  on none of the tile's (region, cover) slots costs nothing.
- **Independent hashes.** `packages/game-core/src/vegetation/ringHash.ts`:
  both hashes end in MurmurHash3's finaliser, mirrored bit for bit in the
  Python twin. Without it consecutive salts were correlated and every plant
  stood on one of two diagonals in its cell (the rows of 16f round 3). Twelve slots share one kit geometry through a
  per-slot view (`slotGeometry`, the same trick `Vegetation.tsx` uses for its
  blocks), so each gets its own `esLodBand` without duplicating a vertex
  buffer. Tiles beyond the mid radius are GENERATED thinned (`far: true`) and
  regenerated in full when they enter the MID band, and the settlement
  foundation treatments are filtered by a bbox test *before* their 0.65 m
  rubble lattice is walked — re-deriving every settlement in the province per
  rebuild, to throw all but one away, was the worst cost of a tile crossing.

A bed-cover species (`below-at-least` to 4 m or deeper) runs every tier
radius at 0.6 of the land figure: under water nobody sees to the land
radius, so the carpet is not drawn into the fog (16f round 2).

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

Against the running dev server (`npm run studio`): `node scripts/probe-local-16f.mjs "view=character&x=4.02&z=4.61&t=12:00"`
reads both debug hooks at a site, and `node scripts/probe-local-walk.mjs "<query>" 90 20`
loads, forces three rebuilds, sprints for 20 s and prints every
`vegetation rebuild … ms` and `flora colliders rebuild … ms` line
(`rebuildMs` is on both hooks; the ring's line is `[groundcover] rebuild …`).

The built-studio probe below boots over the five areas decision 0036 Q3 signed off,
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
