# Bethesda's own numbers: the `Skyrim.esm` cross-check

**Phase 10 round 5, 2026-08-31 (item B6).** `Skyrim.esm` landed in the vault on
2026-08-31 (the owner's Steam copy). This is the cross-check the mined-rules
work has been waiting on: our placement rules were derived from *one modding
team* (Black Marsh & Valenwood) plus one retexture mod (Tropical Skyrim). Now
we can compare them against the shipped game those mods were built on.

**Nothing here has been applied.** B6 recommends; the palette/scatter changes
belong to whoever owns those files next. Deltas are listed in §4 with a
confidence rating each.

- Method + readers: `worldgen/mine_regions.py` (new), `worldgen/mine_groundcover.py`,
  `worldgen/mine_placement.py`, all on `worldgen/esp_index.py`
- Machine-readable output: [`world/sources/placement/`](../../../world/sources/placement/README.md)
  — `vanilla-region-object-tables.json`, `vanilla-groundcover-rules.json`,
  `vanilla-tamriel-placement.json`
- What it cross-checks: [shipped-world-placement-rules.md](shipped-world-placement-rules.md)
  (rules R1–R14) and [vegetation-density-design.md](../vegetation/vegetation-density-design.md)
- Related: the esm also registered into the asset registry's `vanilla` pool
  (§5), which was previously nameless and dimensionless.

## 1. Method and coverage

| Mined | How | Evidence |
|---|---|---|
| `REGN` region records | `mine_regions` — full census of data blocks and every `RDOT` object-table row | 317 regions in `Skyrim.esm`, 0 in `Update.esm` |
| `GRAS` groundcover + `LTEX` bindings | `mine_groundcover` | 27 grass records, 68 landscape textures |
| Every placed reference in worldspace `Tamriel` | `mine_placement`, same tool and same statistics as the BM&V mining | 250,830 refs over 11,187 cells (38.0 km²), 6,372 dressed |

**Caveats that bound every number below.**

1. **Tamriel is not a swamp.** Vanilla is pine forest, tundra, snow and rock.
   Anything about *what grows where relative to water* transfers badly; anything
   about *how a professional dresses ground* transfers well. Rules are marked
   accordingly.
2. **`aboveWaterM` in vanilla is altitude, not wetness.** Tamriel's cells
   inherit a sea-level water plane, so "2 m above water" means 2 m above sea
   level. The vanilla water-depth band table is therefore an *altitude* table
   and says nothing about R2 (the waterline peak). Do not read it as a
   contradiction.
3. **Markers and effects are in the count.** `crittermarker`, `markerx`,
   `fx*` refs are real references and are included in macro densities
   (~3 % of instances but concentrated in a few cells). Per-species and
   vegetation-only figures below filter to plant/tree/shrub/deadfall/root
   categories with ≥30 instances (170 species).
4. **Only 3 % of refs are unresolved** (7,369 of 250,830, mostly DLC masters),
   against 41 % in the BM&V mining — this is the first dataset where nearly
   every measured object also has a known mesh and bounding box.

## 2. Headline: the region object generator ships **empty**

This settles rule **R11**, which was flagged "confirm against `Skyrim.esm`
when it lands".

| | Count |
|---|---|
| `REGN` records in `Skyrim.esm` | 317 |
| …declaring an object-generator block (`RDAT` type 2) | 69 |
| …carrying any object rows | **0** (every `RDOT` payload is zero bytes) |
| …carrying a grass block (`RDAT` type 6) or `RDGS` rows | **0** |
| Other blocks present | weather 55, sound 60, map 7, land 1 |

The 69 region shells with an empty object table are per-designer working
regions (`Brie2npassPineForest01`, `TundraMarshMegan03`, `FallForestNavmesh12`
…) — navmesh and pass-tracking scaffolding, not a scatter system. Bethesda
shipped Skyrim's exteriors as **hand-placed statics plus `LTEX`-bound
procedural `GRAS`**, with Oblivion's region generator inherited in the format
and unused in the data.

> Module 65 §110's two-tier split (compiler-placed clumped statics T1/T2 over a
> procedural groundcover ring T3) is exactly what the shipped game does. R11
> can be restated as settled fact rather than a prediction, and the "confirm
> when the esm lands" caveat retired.

## 3. What the numbers agree on

Independent confirmation, from a different team on the same engine:

| Rule | Ours (BM&V) | Vanilla Tamriel | Verdict |
|---|---|---|---|
| **R1** clustering | median Clark-Evans R **0.51**, R<1 for 70/70 species | **0.448**, R<1 for **164/164** species | Confirmed, and stronger. Target R ≈ 0.5 stands. |
| **R1** clump radius | 9.5 m (BM), 17.6 m (VW) | **9.9 m** | Confirmed. The ~10 m default is now a two-team number. |
| gap size | open-space p50 10.2 m / p95 31.5 m | p50 6.9 m / **p95 29.9 m** | Confirmed. "Median gap ~10 m, biggest ~30 m" holds across three worlds; vanilla runs slightly tighter. |
| **R6** variance | coefficient of variation 3.09 (BM), 2.33 (VW) | **4.78** | Confirmed and then some — see delta D4. |
| **R10** grass schema | ≤3 grasses per painted texture; many textures bare | max 3 confirmed; **48 of 68 textures (71 %) allow no grass** | Confirmed; the "bare ground is a first-class outcome" rule is stronger in vanilla than in the mod (71 % vs 43 %). |
| **R14** budget | tree density p50 17.7/ha (BM) | tree density p50 **26.5/ha**, plant 20.6, shrub 17.7 | Consistent order of magnitude; vanilla's pine forest carries *more* trees per hectare than the mod's swamp. |

## 4. Deltas worth acting on

Ranked by how much they should change what we build.

### D1 — R8's "bad habits" are the mod's, not Bethesda's, and we should follow Bethesda (confidence: **high**)

| Habit | BM&V | Vanilla | 
|---|---|---|
| yaw uniformity (1.0 = fully random) | median **0.35**, 108/226 species below 0.3 | median **0.94**, **0 of 170** species below 0.3 |
| tilt | median 0.0° for every species — nothing ever leans | **123 of 170** species have a non-zero median tilt; median p50 **5.8°**, median p95 **28.7°** |
| fixed scale | 43 % of species (33/77) | **13 %** (22/170) |

Bethesda randomises yaw fully, tilts plants toward the ground normal by a
handful of degrees typically and up to ~30° on slopes, and gives most species a
scale range. R8 already recommends all three on first principles; it is now
*evidenced practice* rather than our opinion.

> **Recommendation.** Keep R8's rule, and raise its status from "free wins the
> source did not take" to "what the shipped game does". Concretely, the scatter
> compiler's tilt weight should produce a per-species tilt distribution with a
> median near 5° and a p95 near 25–30° on sloped ground — a checkable probe
> number, which we did not have before.

### D2 — the T3 grass density ladder was measured off a mod's retune (confidence: **high**)

R10's table came from Tropical Skyrim's *overrides*. Bethesda's own values
differ substantially, and its ladder is far flatter:

| Grass | Bethesda | Tropical Skyrim (R10) |
|---|---|---|
| BeachGrass01 | **79** | — |
| BeachGrass02 | 50 | — |
| FrozenMarshGrass01 | **38** | 60 |
| FernGrass01 | 37 | 37 |
| SnowGrass01 | 36 | — |
| FieldGrass01 | 32 | — |
| WaterKelpGrass01 | 27 | — |
| FallForestGrass01 | 21 | — |
| TundraGrass04 / 03 / 01 | **19 / 12 / 14** | 3–5 |
| ForestGrass01 | **15** | 25 |
| RockGrass01 | 10 | 10 |

R10 read this as "marsh at 2× forest and **12× tundra**". Bethesda's real
ladder is marsh 38 : forest 15 : tundra 12–19 : rock 10 — marsh is ~2.5× forest
but only ~2× tundra, and the *top* of the ladder is coastal beach grass at 79,
which we do not have a rung for at all.

> **Recommendation.** Restate R10's ladder from
> `vanilla-groundcover-rules.json` rather than the Tropical Skyrim file: dense
> coastal/beach margin at the top (~2× wetland), wetland next, forest floor at
> ~0.4 of wetland, and a floor around 0.25 for rocky ground. Do **not** build a
> 12× spread between our wettest and driest groundcover classes — that ratio is
> an artefact of one mod's tundra retune.

### D3 — Bethesda ships an underwater groundcover tier; we have none (confidence: **high**, importance high for *our* game)

Three of 27 vanilla grasses are placed *below* the water surface via the
`unitsFromWater` + water-mode fields:

| Grass | Rule | Depth |
|---|---|---|
| WaterKelpGrass01 | below-at-least | 390 units = **5.5 m** |
| WaterCoralGrass01 | below-at-least | 155 units = **2.2 m** |
| RockGrassWater01 | below-at-least | 105 units = **1.5 m** |

Our T3 groundcover spec keys off land-cover classes and has no submerged case.
For a province built around swimming and underwater exploration (00-core
acceptance: "underwater POIs throughout appropriate regions"), an empty
lake/sea floor is a bigger miss for us than it was for Skyrim.

> **Recommendation.** Add a **submerged groundcover class** to the T3 spec with
> depth-banded species (shallow ≥1.5 m, mid ≥2.2 m, deep ≥5.5 m as the shape of
> the bands, values computed from our own hydrology). Asset-side this is a
> sourcing question, not a modelling one — vanilla kelp/coral grasses are in
> the pool and now carry editor ids and dimensions (§5). Route to module 65 and
> the Phase 9 swim work.

### D4 — a region palette needs ~2–3× more species than R5 concluded (confidence: **medium-high**)

| | BM&V Black Marsh | Vanilla Tamriel |
|---|---|---|
| distinct meshes placed | 1,284 | **3,578** |
| top-20 share | 60 % | **28 %** |
| top-50 share | 79 % | 46 % |
| top-100 share | 90 % | **61 %** |
| distinct species per dressed cell (0.34 ha) | 11 | **15** |

R5's "~20 species own 60 % of what the player sees, ~50 for 80 %" is a
property of a small mod palette, not of a finished commercial world. Bethesda
needs ~100 meshes to reach 61 %. Some of the gap is that Tamriel spans every
biome in the game while BM&V's Black Marsh is one, so the honest comparison is
somewhere between — but the per-*cell* figure (15 vs 11) is biome-independent
and points the same way.

> **Recommendation.** Size region palettes at **~40–60 species** rather than
> ~20, and target **~15 distinct species visible per 0.34 ha** rather than 11.
> This is a real cost (atlas slots, kit build time, streaming), so it is a
> budget question for module 65 before it is a palette question — flag it,
> don't silently widen the palettes.

### D5 — the slope falloff is gentler than R3, and perfectly flat ground is *not* the peak (confidence: **medium**)

| Slope | BM&V /ha | Vanilla /ha (cells) |
|---|---|---|
| 0–5° | 150.6 | **11.1** (864 cells) |
| 5–15° | 65.1 | **65.9** (4,952) |
| 15–30° | 25.7 | 42.7 (5,316) |
| 30–45° | 22.0 | 20.3 (4,372) |
| 45–90° | 33.1 | 14.8 (3,008) |

Two differences. (a) Vanilla's peak is the **5–15°** band, not 0–5° — near-flat
ground in Skyrim is road, water margin, tundra plain and settlement ground,
i.e. deliberately kept open. (b) From the peak, vanilla falls ×0.65 then ×0.47
then ×0.73 — noticeably **gentler than R3's "halve per band"**, holding ~0.22
of peak on genuine cliffs.

Confidence is medium because the 0–5° band rests on only 864 cells and both
datasets have terrain-specific reasons for their shape (R3's own caveat 4 notes
BM&V's swamp is almost perfectly flat).

> **Recommendation.** Soften the slope multiplier from "halve per 10–15°" to
> **~×0.65 per band down to 30°, then hold at ~0.2**, and stop treating
> perfectly flat ground as the density maximum — flat ground near routes and
> water margins is where the legibility argument
> ([vegetation-density-design.md](../vegetation/vegetation-density-design.md) §a) wants
> negative space anyway. Low risk, cheap to try, visible in a walk-through.

### D6 — our variance target is if anything too low (confidence: **medium-high**)

Vanilla's per-cell coefficient of variation is **4.78**, above BM&V's 3.09 and
well above the "target ~2–3" in the density-design synthesis. Vanilla's density
autocorrelation between neighbouring cells is also essentially **zero**
(0.018 at 58 m, versus BM&V's 0.31), i.e. hand-placed thickets vary at a
*sub-cell* scale with no smooth field underneath at all.

> **Recommendation.** Raise the CoV target from "~2–3" to **"≥3, and don't be
> alarmed by 4"**, and treat our 90 m / 190 m variation wavelengths as a
> single-source (BM&V) choice that vanilla does not corroborate. Keep the
> wavelengths — the correlation figure is noisy across a multi-biome
> worldspace — but record that the evidence for them is one mod.

### D7 — supersizing is a mod habit, not Bethesda's (confidence: **high**, decision is the owner's)

Vanilla placed scale: median **1.0**, p5–p95 spread median 0.345, and the
largest 95th percentile across 170 vegetation species is **1.89**. BM&V places
at a median of 1.4 with individual species at ×8–×10 (R9's "13 m root arches,
15 m ferns"). Bethesda gets variety from *more distinct meshes*, not from
scaling a few.

> **Recommendation.** Note this against R9 and in the palette scale-range
> decision: our jungle read currently borrows BM&V's supersizing habit, which
> the shipped game deliberately avoids and which R9 already flags as a
> silhouette risk. Not something to change unilaterally — it is an owner call
> and one direct comparison in the studio would settle it.

### D8 — re-run the BM&V mining with the esm as a name source (confidence: **high**, cheap)

41 % of Black Marsh's and 63 % of Valenwood's measured references were
unresolved because their base objects live in `Skyrim.esm`. With the esm in the
vault, `mine_placement --names "<vault>/skyrim-source/Data/Skyrim.esm"` resolves
almost all of them — turning `unresolved` (the single largest "category" in
both files, 40.7 % and 63.4 %) into real species with real meshes and bounds.

> **Recommendation.** Do this — but **not concurrently with palette work**,
> because it changes the inputs `build_palettes.py` reads. Schedule it as a
> standalone step, then re-read R4/R5/R6's category mixes, which are currently
> computed with a third to two-thirds of instances uncategorised.

## 5. Registration side-effect: the `vanilla` asset pool now has names and sizes

The esm is declared on the `vanilla` pool in `worldgen/asset_registry.py`
(alongside `Update.esm`) and the registry rebuilt. Before: 0 vanilla rows had
an editor id or dimensions. After: **8,620 of 14,974** carry both, and 677 are
marked as observed-placed with a placement count, so
`asset_registry query --pool vanilla --used` now ranks vanilla assets by how
often Bethesda actually placed them. Nothing is redistributed — the registry
stores paths, names and bounding boxes, and the vault stays gitignored.

## 6. What this does not change

- **No authored places.** Same rule as the BM&V mining (00-core rule 6):
  distributions only, never Bethesda's locations.
- **No copied constants.** Grass density 38 has no meaning in our units; we
  take the *field list and the ratios*, computed from our own climate,
  hydrology and land-cover rasters (§86.0b).
- **R2 (the waterline density peak) is untouched** by this cross-check — see
  caveat 2. It remains a wetland rule resting on BM&V alone, which is
  appropriate: Skyrim has no marsh worth mining.
