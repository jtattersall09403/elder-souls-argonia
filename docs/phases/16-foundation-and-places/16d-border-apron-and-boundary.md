# 16d — The land beyond the border and the wall you cannot cross

**Goal.** Beyond the province's four edges the ground continues as the real
Tamriel of the all-Tamriel heightmap, at the map's own scale, joined to our
terrain so that no edge, step or colour change shows; the sea continues over it
wherever that ground lies below sea level; the character is stopped at the edge
of the built ground by an invisible wall with a catalogue message. Alongside
that, this chunk ships the graph-keyed water reader every later chunk ports to
(decision 0066) and deletes the pre-graph water fields it replaces.

Ruling 8 (2026-09-11): stitched, **on condition that the join is smooth**. The
owner restated it 2026-09-14: the border is a square; the land beyond must
continue from our built terrain with no gap. Owner decisions of 2026-09-14 that
still bind: purge all six pre-graph survey fields; the wall stands on the edge
of the built ground on all four sides, unclimbable by construction; the join is
by construction, not by fit; the ground paint continues onto the apron under the
same rules; the apron never triggers an expensive rebuild; one source of truth
for the chunk ladder. Two of that day's decisions are superseded by measurement
(below): "reach ~60 km" (the map ends 6–22 km out and the haze is saturated long
before) and "Opus on water" (the water part is small and Fable does it).

## Starting state (2026-09-15, measured by the planning session; replaces the 2026-09-14 text)

- **16c round 2 is delivered**; `DELIVERED_THROUGH="16c"`; a plain chain run
  starts at the freeze gate (0066) and the water stages are `compile_water` and
  `terrain_request_postconditions`. The 16c owner walk is pending: if the owner
  rejects levee patches, `DEFAULT_HEIGHTS` moves and the apron stage re-runs
  (a minute; that is the point of B2).
- **Our province is a 1:1 cut of the all-Tamriel heightmap, not a scaled
  neighbour.** `TamrielBeta_10_2016_01_prepped.png` (20480 × 16384, 16-bit,
  stored **south-up** like the ESP heightfield; `extract_province.py:48-58`)
  matches the raw ESP heightfield at **r = 0.9966** with the province's
  south-west sample at PNG **(row 3393, col 11788)** and **1 px = 1 sample =
  1.82784 m**. Units: `metres = 0.017093 · u − 91.745` (rmse 3.0 m against the
  raw; sea level u ≈ 5367). The audit's "8 px per cell, r = 0.83 at
  (11960, 17752)" was a spurious macro-shape match on an island off Morrowind
  (the same search finds r = 0.84 on a second island); **do not use it**.
  Measured with a whole-map cross-correlation at scale factors 1–5; only
  factor 4 (32 px per cell) is near 1.
- **What lies beyond, in fitted metres** (north-up): north — Morrowind's
  coast: 78–88 % land in the first 3 km (hills to 177 m), 49 % at 3–10 km, sea
  beyond; west — Cyrodiil's lowlands around Topal Bay: 56 % land at 0–1 km,
  39–60 % to 10 km, then mostly sea; south and east — open sea (0 % land).
  **The map ends 16.4 km north, 6.2 km south, 21.5 km west and 8.5 km
  east** of the border (rows 0 and 16383, cols 0 and 20479 of the PNG). The
  province's own sculpt raised the north edge ~180 m above the map
  (`DEFAULT_HEIGHTS` north row mean 214 m; the raw's 31 m); the join blends
  that difference out over 6 km.
- **The PNG is extracted** to the vault at
  `mod-sources/all-tamriel-heightmap-573/extracted/TamrielBeta_10_2016_01_prepped.png`
  (671,225,605 B; its SHA-256 is the root README credit line and
  `apron-manifest.json` `sourceSha256`; `py7zr` with `targets=[…]`, 18 s). PIL needs
  `Image.MAX_IMAGE_PIXELS = None`; decode is 23 s and 670 MB. Nothing else of
  the apron exists: no `worldgen/build_border_apron.py`, no `province/apron/`,
  no `[16d]` stage, no boundary wall, no message.
- **The haze saturates well inside the map**: `climate-vis` G decodes to a
  visibility of p50 0.96 km, p95 2.0 km (`site_fields.py` Koschmieder line);
  transmittance at 10 km is zero at every texel. Nothing past the map's edge
  can be seen; nothing needs to fade.
- **The province's wet edge texels**, from the shipped water (`water-id.png`):
  south 100 % and east 99.7 % `body.ocean` at 0 m (plus a 3-texel pond at the
  NE corner); west 39.8 %: the bay `body.ocean` from z = 4,522 m south, three
  short ocean runs at 4,471–4,500 m, plus **five upland waters at 170–222 m**
  (`reach.10-79`, `reach.34-422`, `body.6-629`, `body.34-1253`) plus a 23.5 m
  backwater (`reach.50-1684`); north 0.25 %: three `sloped-rapid` texels at
  79–85 m. The water renderer carries an edge texel outward unchanged
  (`waterMaterial.ts:298-312`, `waterData.ts:284-296`), so today those upland
  waters would draw as ribbons hovering over Cyrodiil's plain — Part D.
- **The chunk runtime is reusable as is**: `ChunkStore` (package) decodes RG16
  PNGs keyed by `(cx, cy, lod)` and fetches `province/chunks/${file}`;
  `ChunkTerrain.tsx` (app) chooses LOD 1/2/4 by Chebyshev chunk distance from
  the focus cell and gives every chunk mesh a 2.5 m skirt
  (`buildTerrainGridGeometry`, no normals — lighting comes from `gradTex`);
  `ChunkColliders.tsx` builds Rapier heightfields for the 3×3 chunks around
  the character through `store.chunkAt`. Chunk LODs are **low-passed then
  subsampled** (`compile_chunks.chunk_grid`: gaussian σ = f/2), not pure
  subsamples. `Fly3D.test.ts:37` asserts on `ChunkTerrain`'s source text
  (`const meshes = manifest.chunks.map`).
- **The ground material** (`apps/world-studio/src/groundMaterial.ts`, app-private
  until 10b) takes one control texture (RGBA: id0, id1, blend, macro — the
  `landcover.compile_ground_control` output), one tint, one gradient and one
  `uvExtent`; it builds a 512²×N `DataArrayTexture` (~40 MB) per call.
  `ground-control.png` is 4033², `ground-tint.png` 1009², `normal-grad.png`
  4033². UVs are `wx / uvExtentM` with origin 0 (`gridGeometry.ts:29`).
- **`compile_ground_control` runs at any pitch** with `origin` negative
  (verified at 7.31 m and 116.98 m; `position_noise` hashes int64). `rivers`
  must be a zero **array**, not `None`.
- **The chunk ladder is declared twice and disagrees**: `terrain-chain.sh:198`
  `LADDER_ORDER=(16b 16c 16d 16e 16f 16h)` (no 16g; `--through 16g` exits 2)
  and `ladder.py:55` (no 16i/16j); `ladder.py:68-69` returns `True` on an
  unknown chunk, a gate that cannot fail. Part E.
- **The record reader does not exist.** `water_report.ShippedWater` loads
  `water-id.png` and `entities[]` (2,868; the graph has 2,895 records — 615
  reaches, 2,280 bodies) and has `entity_at`; `ProvinceSurvey` composes it.
  `ProvinceSurvey.flood/tidal/salinity/wetlands/lakes/river_band`
  (`site_fields.py:147-162`) are read by eight production modules
  (`compile_settlement:597`, `compile_minor_routes:177,179,350`,
  `compile_minor_waterways:295-311,391`, `macro_plot:707-787`,
  `site_dossier:148-187`, `terrain_scour:142-352`,
  `audit_place_semantics:209-210`, `anchor_nudge:19,23,51` via `sample()`
  keys) and by `area_report()` and `sample()["hydrology"]` (six of its 17 keys
  are pre-graph: `riverBand onLake wetland tidal floodBand salinity`;
  `waterSalinity` and `turbidity` are the compiled class raster and stay).
  `test_site_survey.py` is not in any npm script.
- Red today for 16d: nothing. `apps/game` depends only on `packages/contracts`.

## Read

This file; decision [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md);
`packages/game-core/src/terrain/README.md`; the files each part names. Not the
chain audit §4 (superseded above) and not
`research/world-terrain/beyond-border-distant-lands.md` (its plan — procedural
ridges, fades, vertex colours — is superseded by this brief; Part E rewrites it).

## Shape of the delivery

| Part | What | Who |
|---|---|---|
| E1 | one chunk ladder (lands first) | orchestrator (Fable) |
| A | the record reader; the six-field purge | deliver agent A — `tooling/world-generation/worldgen/` only |
| B | the apron data: extractor, chain stage, publish set | deliver agent B — `worldgen/`, `scripts/terrain-chain.sh`, `tooling/province-artefact/set.json`, `.gitignore` |
| C | the runtime: ring-0 chunks, coarse rings, apron materials, wall, message, contract, mounts | deliver agent C — `packages/game-core`, `packages/contracts`, `packages/text-catalogue`, `apps/world-studio/src/` |
| D | the water beyond the border | orchestrator (Fable; water in the 3D world) |
| E2 | records, docs, credits, decision 0067, text review, preflight, chain run, publish | orchestrator |

A, B and C run in parallel after E1. B and C share nothing but the manifest
schema fixed in B2. Every agent: pathspec commits, never push, never run the
full chain, `npm run typecheck` (C) and the named pytest files (A, B) before
handoff; `preflight`, `province:check` and the chain are the orchestrator's.

---

## Part A — the record reader and the purge

**A1. `ShippedWater` gains the graph** (`water_report.py`; additive, no
behaviour change to existing methods — the output-sha check in E2 proves the
water compile unchanged). Load `hydrology-graph.json` lazily and index
`reaches[]` and `bodies[]` by id.

- `reach(id) -> dict | None`, `body(id) -> dict | None`: the graph record.
- `water_at(east_m, south_m) -> dict | None`: `entity_at` merged with its graph
  record (graph fields win on conflict; the compiled `levelM` is kept as
  `compiledLevelM` when it differs), plus `depthM` from `signed_depth_m("wet")`
  at the texel. Two arguments only: 16c's level *is* the wet-season line and
  no season parameter has a meaning below the gate; the record's own `season`
  field is returned.
- An id present in one set and not the other is returned with the fields it
  has; tested both ways (27 graph records have no compiled entity).
- `ProvinceSurvey.water_at / reach / body` delegate to `self.water`.

**A2. Delete the six fields** `flood, tidal, salinity, wetlands, lakes,
river_band` from `ProvinceSurvey.__init__` and the `hydro-flood.png`,
`hydro-wetlands.png`, `hydro-salinity.png` reads and the lakes/river-band
decode of `hydro-rivers.png` behind them. No tombstones, no shims, no drop-in
grids. In `sample()["hydrology"]` replace the six pre-graph keys with one
block `"record": {"id", "kind", "levelM", "season", "depthM"}` (null id on dry
ground); leave the other eleven keys. `area_report()`'s `marsh_shallow` reads
the graph's marsh-kind bodies through `water_at`'s id raster (2,087 texels
today; the partition assertion in `test_site_survey.py` stays green).

**A3. `anchor_nudge.py`** reads `riverBand` / `onLake` from `sample()`; it is
a live owner-facing tool with no test and no allowlist row, so port it here
(the two reads become `record.kind` checks), do not allowlist it.

**A4. `terrain_request_postconditions`**: add it to `EXEMPT` in
`test_record_reads.py` with the reason in the set's comment (it samples
`compile_water`'s own `water-pass1.npz` for a measurement, which 0066 permits)
and delete its allowlist row.

**A5. The gate**: add `\.(wetlands|lakes|river_band)\b(?!\s*=\s*)` to
`PATTERNS` (copy the existing look-ahead) and `riverBand|onLake|wetland` to
the dict-key pattern; drop `water_salinity` and `waterSalinity` from both
(compiled class raster, `site_fields.py:200-201`, comment says so). Plant a
`.wetlands` read in a clean module, show the gate red, remove it.

**A6. Land the reds honestly.** Run `python3 -m pytest -q worldgen`. Every
test that goes red *because a consumer of a deleted field is executed* is
gated with `ladder.requires_delivered("<chunk>")` naming the allowlist's
`portedBy` for that module (`test_macro_plot.py:88` is the precedent). Nothing
else may be gated: a facts, invariant, provenance or survey test that goes
red is ported in this part (if a registered count moves, `facts.mjs` moves in
the same commit). `test_site_survey.py:45-50` are rewritten against the
reader. Report the gated tests by name; E2 puts that list in 16g's and 16h's
Starting state and adds `worldgen/test_site_survey.py` to `test:placement`.

**A7. Tests**: `water_at` returns the graph's kind at a body texel, a reach
texel and `None` on dry ground; every id it returns resolves in the graph;
membership tested both ways; `test_record_reads` green with 12 rows.

---

## Part B — the apron data

### B1. `worldgen/extract_apron_source.py` — one-off, run by hand, never a chain stage

Reads the vault PNG (`MAX_IMAGE_PIXELS = None`), converts to metres with the
fit above, flips to north-up (`np.flipud`) and writes two float32 arrays to
`$VAULT/province-refined/`:

- `apron-source-near.npy`: the ring-1 box at 1.82784 m — PNG rows
  `3393−640 … 3393+4032+640` and cols `11788−640 … 11788+4032+640`
  inclusive (5313² samples; the province is the central 4033²);
- `apron-source-far.npy`: the whole PNG as 64×64 block means (320 × 256,
  116.98 m per sample; sample (0,0) is the block whose north-west corner is
  PNG row 16383 / col 0), with a `nodata` mask of blocks that were entirely
  zero (a `.npz` with `height` and `valid`).

Asserts: the central 4033² of the near crop matches the raw ESP heightfield
(`$VAULT/heightfield-f32.npy`, flipped) with rmse < 4 m and r > 0.99; prints both. Records the PNG's SHA-256, the match coordinates, the fit and
the two output SHA-256s into `$VAULT/province-refined/apron-source.json`.
Idempotent; about a minute; the PNG never enters the repo.

### B2. `worldgen/build_border_apron.py` — the chain stage (argparse; runs in seconds to a minute)

**Inputs**: `DEFAULT_HEIGHTS` (frozen + patches, the ground the character walks),
the two crops, the province's exported border chunks
(`province/chunks/chunk_{0|15}_*` and `chunk_*_{0|15}`, decoded with
`export_web_chunks.decode_rg16` at every LOD), `province/refined/ground-control.png`,
`ground-tint.png`, `province/chunks/normal-grad.png`, the region raster
(`site_fields.ProvinceFields(...).region`, 1,345² at 5.48 m). Fails with a
message naming B1 if a crop is missing.

**The apron height function** (`h_apron`), defined over the ring-1 box at
1.82784 m and over the far box at 116.98 m, identically:

```
h_apron(x, z) = canon(x, z) + Δ(edge nearest to (x, z)) · w(d)
Δ(edge cell) = DEFAULT_HEIGHTS(edge cell) − canon(edge cell)
w(d)         = 1 − smoothstep(0, 6000 m, d),   d = distance to the province square
```

`canon` is the crop; `Δ` is taken from the nearest border cell (the north row
for points north of the square, the west column for points west, the same on the other sides; corners use the corner cell). Inside the square `h_apron` is unused. No fit,
no scale search, no per-side rules: the wet edge columns, the ocean edges and
the mountain edge all go through the same line. Where the far crop is
`nodata`, `h_apron` = −40 m (seabed; it is only ever beyond the sea).

**Ring 0 — 68 chunk tiles**, the same format as the province's, so
`ChunkTerrain` draws them with the same LOD rule and the border seam is an
ordinary chunk seam:

- cells `cx ∈ {−1, 16}` × `cy ∈ {−1 … 16}` and `cy ∈ {−1, 16}` × `cx ∈ {0 … 15}`;
  a north/west ring chunk spans 256 samples ending on the province edge
  (origin −467.9 m); an east/south one starts **on** the edge sample 4032
  (origin `E` = 7369.85088 m, not 16 × 467.9) and spans 256 samples outward.
  All are 257² at LOD 1, 129² at LOD 2, 65² at LOD 4.
- Heights: `h_apron` on the near crop; the LOD low-pass and subsample are
  `compile_chunks.chunk_grid`'s (call it on the 4545² extended array —
  `DEFAULT_HEIGHTS` in the centre, `h_apron` around it — with `wanted` = the
  ring cells and the cx/cy offset applied afterwards).
- **The shared edge is the province's, at every LOD**: after the low-pass,
  overwrite each ring chunk's inner edge row/column at LOD 1, 2 and 4 with the
  decoded edge of the adjacent province chunk at that LOD. (The province's
  LODs were low-passed with reflection at the array edge; the copy makes the
  two meshes agree to within one RG16 step whatever the filter did.)
- **The outer edge is linear between ring 1's knots, at every LOD**: overwrite
  each ring chunk's outer row/column (and the corner chunks' two outer edges)
  with the piecewise-linear interpolation of its values at every 16th sample
  (29.25 m). LOD 2 and 4 subsamples of a piecewise-linear row lie on the same
  lines, so ring 1 meets ring 0 exactly at every LOD.
- Encode with `export_web_chunks.encode_rg16` per LOD (`optimize=True` as the
  exporter does), one PNG each: `province/apron/ring0/chunk_{cx}_{cy}_lod{L}.png`.

**Ring 1 — one square tile at 29.25 m**: origin (−1169.82, −1169.82) m,
333 × 333 samples (every 16th sample of the ring-1 box; the inner 285²
covering ring 0 and the province is present in the PNG but masked). Its inner
edge (the ring-0 outer square) is the knots of ring 0's linearisation;
its outer row/column is linearised between every 4th sample (116.98 m). One
RG16 PNG `ring1-height.png`.

**Ring 2 — one square tile at 116.98 m** to the map's edge: origin
(−21524.64, −16260.46) m, 320 × 256 samples (west 174, east 62, north 129,
south 43 samples beyond ring 1; the inner 84 × 84 covering ring 1 is masked).
Values are `h_apron` on the far crop (sampled bilinearly: the crop's blocks are on the PNG's grid, 12 px west of ring 2's); its inner edge is ring 1's knots. One
RG16 PNG `ring2-height.png`. This same raster is Part D's sea-floor beyond the
border.

**Paint** — call the province's own rules, nothing new:

- **near set** at 7.31 m over the ring-1 box (1329² texels; used by ring 0 and
  ring 1): `landcover.compile_ground_control(h, region, rivers=zeros, slope,
  7.31136, origin=(−160, −160), seed=SEED, v_frac=v)` (`origin` is (row, col) in bake-pitch samples) where `h` is
  `DEFAULT_HEIGHTS` inside the square and `h_apron` outside (subsampled),
  `region` is the province raster resampled nearest and clamped to its edge,
  `slope` from `np.gradient(h)`, `v_frac` the province's latitude ramp
  clamped to 0/1 outside. No salinity, twi, wetlands, roads, water level.
- **far set** at 116.98 m over the ring-2 box (320 × 256): the same call with `origin=(−139, −184)`.
- **Seam blend, so the paint at the border is the province's by construction**
  (owner decision 6): within `d < 1,500 m` replace each apron texel's control
  with the province control's nearest edge texel with probability
  `1 − smoothstep(0, 1500, d)` (position-seeded hash, `position_noise`); the
  tint (`ground-tint.png` resampled nearest) and the gradient (recomputed from
  `h` at the set's pitch, `GRADIENT_CLAMP`, signed-sqrt as
  `export_gradients` does — do **not** call `export_gradients`, it writes the
  province's own file) are blended linearly with the same weight. Categorical
  ids are dithered; continuous channels are mixed.
- Write `near-control.png`, `near-tint.png`, `near-grad.png`, `far-control.png`,
  `far-tint.png`, `far-grad.png` under `province/apron/`.

**The manifest** `province/apron/apron-manifest.json`, committed (PNGs are
not):

```json
{ "schemaVersion": 1,
  "sourceSha256": "<PNG sha>", "sourceCropSha256": {"near": "…", "far": "…"},
  "registration": {"pngRow": 3393, "pngCol": 11788, "metresPerPx": 1.82784, "unitToMetres": [0.017093, -91.745]},
  "blendM": 6000, "paintBlendM": 1500,
  "ring0": { "dir": "province/apron/ring0/", "chunks": [ <ChunkMeta as in chunks-web-manifest.json> ] },
  "tiles": [
    { "id": "ring1", "file": "ring1-height.png", "originM": [-1169.82, -1169.82], "shape": [333, 333],
      "metresPerSample": 29.24544, "minM": …, "maxM": …, "maskInnerSamples": [24, 309], "paint": "near" },
    { "id": "ring2", "file": "ring2-height.png", "originM": [-21524.64, -16260.46], "shape": [256, 320],
      "metresPerSample": 116.98176, "minM": …, "maxM": …, "maskInnerSamples": [129, 213, 174, 258], "paint": "far" } ],
  "paint": { "near": { "originM": [-1169.82, -1169.82], "extentM": 9709.4, "control": "near-control.png", "tint": "near-tint.png", "grad": "near-grad.png" },
             "far":  { "originM": [-21524.64, -16260.46], "extentM": [37318.2, 29830.4], "control": "…", "tint": "…", "grad": "…" } },
  "report": { "seamMaxAbsM": …, "edgeDeltaM": {"north": {"p50": …, "max": …}, …}, "triangles": … } }
```

`maskInnerSamples` is `[z0, z1]` for a square mask or `[z0, z1, x0, x1]`:
quads with all four corners inside are not indexed. The `report` block is for
the ledger, not the runtime.

### B3. Chain, ladder and publish

- `build_border_apron` goes into `STAGES` after `rebake_landcover` (it reads
  the province control map) and before `rederive_blueprints`; `[16d]="build_border_apron"`;
  `DELIVERED_THROUGH="16d"`; `LAYER_OF[build_border_apron]="apron"`.
- `chain_stages` fingerprints observed inputs, so the stage re-runs when
  `DEFAULT_HEIGHTS` or `ground-control.png` move (16e grading, 16f rebake).
  That is wanted and cheap because the 670 MB decode lives in B1, not here.
- `tooling/province-artefact/set.json` `patterns` += `"apron/**/*.png"`;
  `.gitignore` += `apps/world-studio/public/province/apron/**/*.png` (PNGs
  only — the manifest is committed).
- Tests (`worldgen/test_border_apron.py`, in `test:placement`), each shown
  failing first on a deliberately broken build: (1) every ring-0 chunk's inner
  edge decodes equal to the province chunk's edge at the same LOD within the
  sum of the two RG16 half-steps; its pre-encode LOD-1 edge equals
  `DEFAULT_HEIGHTS` exactly; (2) ring 0's outer edge, ring 1's inner edge and
  ring 1's outer edge / ring 2's inner edge coincide at every knot at every
  LOD; (3) `h_apron` at d = 0 equals the edge and at d ≥ 6 km equals the crop;
  (4) the near control's innermost apron texel ring agrees with the province
  control's edge texel ids on ≥ 95 % of texels; (5) every file the manifest
  names exists and `province:check` matches it.

---

## Part C — the runtime

**C1. Ring 0 through the existing chunk path.** `ChunkStore` gains
`register(chunks: ChunkMeta[], dir: string)` (adds to `byCell`; `decode`
fetches `${baseUrl}${dir}${file}` for registered chunks, `province/chunks/`
otherwise). `ChunkTerrain` gains an optional prop
`apron?: { chunks: ChunkMeta[]; material: THREE.Material; uvOriginM: [number, number]; uvExtentM: number }`
and draws those chunks in the same `meshes` loop with the same LOD rule and
skirt but the apron material and UV frame (`buildTerrainGridGeometry` gains an
optional `uvOriginM` argument, default `[0, 0]`; `uv = (wx − ox) / extent`).
Province chunks, `uvExtentM`, colliders, groundcover and `ChunkWorld` keep
reading the province manifest and are untouched. Update `Fly3D.test.ts:37` to
whatever line it must now find; the test's intent (the meshes loop exists)
stands.

**C2. `packages/game-core/src/terrain/BorderApron.tsx`**: for each manifest
tile, fetch and decode its RG16 PNG (extract `decodeHeightPng(blob, lodMeta)`
from `ChunkStore.decode` and use it in both), build the grid with
`buildTerrainGridGeometry` and an index that skips the masked interior (extend
`terrainGridIndices` with an optional `skipQuad(x, z)` predicate), one mesh per
tile, `castShadow = false`, `receiveShadow = false`, `frustumCulled = false`,
the material named by `tile.paint`. No colliders. Props:
`{ manifest, materials: { near, far } }`; it constructs nothing else.

**C3. The apron materials** (app: `apps/world-studio/src/apronMaterials.ts`,
a hook): `createGroundMaterial` twice with the apron's control/tint/grad and
the province's images, cliff normals and manifest. Add an optional
`sharedArrayTexture` parameter to `createGroundMaterial` so the second and
third materials reuse the province material's `DataArrayTexture` instead of
building a fresh 40 MB one (dispose only the owner's). Both mounts
(`Fly3D.tsx` ~298, `CharacterMode.tsx` ~327) load `apron-manifest.json` when
the ladder does not hide the `apron` layer, register ring 0 on the shared
store, pass `apron` to `ChunkTerrain` and mount `<BorderApron>` beside it.

**C4. The wall, the message, the contract.**

- `packages/contracts`: `PROVINCE_BOUNDARY = { extentM: 7369.85088, wallTopY: 1100, wallBottomY: -200 }`
  with a comment that `extentM` is the chunk manifest's `terrainSupportExtentM`
  and the runtime prefers the manifest's value when loaded. Re-export
  `TERRAIN_SUPPORT_EXTENT_M` from `provinceScale.ts` as that constant; do not
  add a second name for the same number.
- `packages/game-core/src/boundary/BoundaryWalls.tsx`: four fixed cuboid
  colliders created imperatively (the `SettlementColliders.tsx:27-45`
  template), placed entirely **outside** `[0, extentM]²` with their inner
  faces on the extent, spanning `wallBottomY … wallTopY` (top 1,100 m clears
  the 655 m summit by a margin; bottom −200 m so a diver cannot pass under).
  A smooth vertical cuboid is unclimbable by construction; no flag, no
  collision-group scheme (nothing inside the square can start a ray inside a
  wall). `docs/phases/README.md` § Phase 9 gets one line: the climb system
  must ignore these four colliders (E2).
- `packages/game-core/src/boundary/useBoundaryMessage.ts`: fires once when the
  character comes within 8 m of a wall, re-arms beyond 40 m; the text is
  `text.system.province-edge` in `packages/text-catalogue/src/entries.ts`
  (`surface: "system"`, with a `note`), written against the style guide and
  reviewed by a separate `text-review` agent before commit (E2). Display it
  in the character HUD line (`CharacterMode.tsx` ~495) for 4 s; `apps/game` routes it through its own system-message surface.
- Spawn clamp: `x`/`z` from the studio URL clamp to `[2, extentM − 2]`; the fall-through safety net (`CharacterMode.tsx:706-723`) teleports to the
  clamped position.
- Add `@elder-souls/text-catalogue` to `apps/world-studio/package.json`.
- Tests (vitest in `packages/game-core`): the four cuboids' inner faces sit at
  `extentM`, span the two heights; a segment from any interior point to any
  exterior point crosses one of them on all four sides; the message key
  resolves; the hook fires once per approach. `BorderApron` builds every tile
  from a fixture manifest with the masked quads absent from the index.

---

## Part D — the water beyond the border (orchestrator; Fable)

Today the water rasters clamp to their edge texel beyond the province. That
was written for the sea and is right for it; for a river or upland lake on
the edge it draws a ribbon at 200 m over Cyrodiil; for the map's inlets
north and west it draws nothing where there should be sea. **Rule: beyond the
province the water is the open sea at level 0 over the apron's ground.**

- `waterMaterial.ts`: a new uniform `uApronTex` (ring 2's height PNG,
  `minM/maxM`, origin, pitch) and `esSurfaceAt` returns `(0, −h_apron)` when
  `wpos` lies outside `[0, extent]²`; in the vertex stage, when outside,
  `esKl` becomes the ocean class with the salinity/turbidity the class table
  gives the coast (`meta.klass`), `esFl` zero flow at the fetch cap, `esSS`
  shore distance = `uSurfShoreMax`, season response 0, tannin 0. Every
  fragment-stage caller of `esSurfaceAt` (the buried guard, the gradients)
  inherits the rule.
- `waterData.ts`: `surfaceBase`/`depthProxy` mirror it (0 and `−h_apron`
  from the same raster when `outsideRaster`), so the CPU twin stays in
  lockstep; the apron raster is an optional asset.
- Nothing else in the renderer changes: no far-extent change (the sea disc is
  12 km on foot, 30 km in fly; the haze is opaque by 10 km), no new surface.
- Tests: `water.test.ts` — outside the raster `surfaceBase` is 0 and
  `depthProxy` is `−h_apron`; a texel-level probe that the three north-edge
  rapids and the five west-edge upland waters are dry 10 m beyond the border
  (shown failing on the clamp).

---

## Part E — orchestrator

**E1 (before any agent starts) — one ladder.** `ladder.py` declares
`LADDER_ORDER = ("16b", …, "16j")` (all nine); `terrain-chain.sh` deletes its
literal at `:198` and reads
`LADDER_ORDER=($(PYTHONPATH="$REPO_ROOT/tooling/world-generation" python3 -c 'from worldgen.ladder import LADDER_ORDER; print(*LADDER_ORDER)'))`
in its place; `[16g]="" [16i]="" [16j]=""` rows added; a two-line cross-check
that every `LADDER` key is in the order and vice versa; `chunk_delivered`
raises on an unknown chunk (a hand-edited `ladder.json` becomes a collection
error, which is right). The per-chunk stage lists stay in bash.

**E2 (after A, B, C, D land):**

- `text-review` on the message in a separate agent.
- `npm run preflight`; then `./scripts/terrain-chain.sh` (no flags): expect
  `verify_freeze` green, the six frozen rungs skipped, `build_border_apron`
  run, 16e+ skipped; **`province/water/*.png` and `water-meta.json` shas
  unchanged** (compare before and after; if they moved, stop). Then
  `npm run province:publish`, commit the manifests. Do not push.
- Root `README.md:90-91`: add the PNG's SHA-256 to the mod-573 credit line;
  correct the 118678 line ("derived from Transbot9's heightmap" is now a
  measured fact: a 1:1 cut at PNG row 3393, col 11788).
- Decision `0067-the-apron-is-the-tamriel-map-at-one-to-one.md`: the
  registration and its evidence; the join-by-blend; ring 0 as chunks; the sea
  beyond the border; the reader contract; the six-field purge; the ladder.
- `docs/PROGRESS.md` row; ledger `docs/research/phase16/16d-ledger.md` with
  the manifest's `report` block and A6's gated-test list.
- `research/phase16/audit-chain-and-terrain.md` §4: strike the registration
  paragraph and point at 0067. `research/world-terrain/beyond-border-distant-lands.md`:
  replace its "Plan for us" with a pointer to 0067 (keep the shipped-games
  survey). `docs/world/55` §98b: two lines, built, see 0067.
- Downstream briefs: 16e Starting state rewritten (dated; the reader exists;
  its Record-reads block claims six allowlist rows, only three exist:
  `compile_minor_routes`, `compile_minor_waterways`, `water_crossings`); 16g
  Acceptance and 16h/16j Starting state no longer say the ladder lacks
  16g/16i/16j; 16g and 16h Starting state carry A6's gated-test list; 16f's
  brief notes that `build_border_apron` calls `landcover.compile_ground_control`
  and that `landcover.py` itself has no allowlist row and matches no gate
  pattern (its re-derivations are reached only through `rebake_landcover`'s
  row — name it as a module to port).
- Defects found in passing: `docs/decisions/0065:95` says four dry-bed fixes,
  the data has five; `docs/phases/16-…/README.md:251` promises "+yaw" where
  16h negates; `ChunkTerrain.tsx:12` says "LOD 1 ≈5.5 m" for a 1.828 m pitch.
- `docs/phases/README.md` § Phase 9: the boundary colliders line (C4).
- `test:placement` gains `worldgen/test_site_survey.py` and
  `worldgen/test_border_apron.py`.

---

## Owner check (after E2; studio on `$ES_TUNNEL_URL`)

**What you will see**: the ground, the water and the land beyond the border.
No plants, roads or buildings anywhere.

- Northern mountains, `?view=character&x=0.93&z=0.92&t=12:00`, looking north
  and west: does the land run on past the border and fade into the haze, with
  no step, wall of ground, or line where ours ends?
- Fly high, `?view=fly3d&cam=orbit&x=0.5&z=0.5`: any hard edge, crack, colour
  change or texture change along the four borders? Water beyond the border
  where the land dips, sea to the south and east?
- Western edge, `?view=character&x=0.05&z=3.0&t=12:00`: walk west until you
  stop. Is the stop clean (no bounce, no climb) and is the message right?
- Beach, `?view=character&x=6.12&z=1.638&t=12:00`: open sea to the horizon, no
  land, no dark floor at the sea's far edge.
- Any upland water on the west edge (`x=0.02&z=0.14`, the 199 m channel):
  does the water end at the border instead of running out as a ribbon?

Part A has nothing to see; it is proved by tests.

## Do not (each with its reason)

- Do not fit, search or "re-verify" the registration: it is 1:1 and exact;
  B1 asserts it.
- Do not extend the apron past the map (no procedural ridges, no extrapolation,
  no fade): nothing past 10 km is visible; ruling 8 chose stitched.
- Do not pin ring 0 to a single pitch with a deep skirt: the border is drawn at
  LOD 1, 2 or 4 depending on where the character stands; only a chunk with the
  same LOD rule matches it in every view.
- Do not drop undersea quads or clip at the waterline: the sea covers them
  (Part D), the haze covers the rest; a clipped shelf is the hole that
  ruling 8 forbids.
- Do not carry a river's edge texel outward (the old clamp) or forbid patches
  on the border rows: four shipped levees already cross them.
- Do not call `export_gradients` (it overwrites the province's file) or
  `rebake_landcover` (it bakes the province); call `compile_ground_control`.
- Do not add drop-in grids for the deleted fields, a `season` argument to
  `water_at`, a `noClimb` flag, a `PLAYABLE_BORDER_M` alias, or a second
  ladder file.
