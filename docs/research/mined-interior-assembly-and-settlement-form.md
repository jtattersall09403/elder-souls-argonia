# Mined interior assembly and settlement form (measured, not guessed)

Digest of the Phase-10 B5 mining run (2026-08-31) that prepares **Phase 11
(settlement system)** and **Phase 12 (dungeon/interior system)**. Companion to
[kit level design + layout generation](kit-level-design-and-layout-generation.md)
(the *theory* — Bethesda kit craft, GDC talks) and
[marsh settlement morphology](marsh-settlement-morphology.md) (the *real-world*
siting menu). This doc is the *evidence*: what shipped worlds measurably do.

Statistics only — no authored layout is reproduced (00-core rule 6).

Machine tables (query, don't read whole):

| File | Holds |
|---|---|
| [`world/sources/placement/bmv-interior-assembly.json`](../../world/sources/placement/bmv-interior-assembly.json) | per-kit snap/rotation quantisation, piece-pair adjacency + join offsets, chamber dimensions, clutter density |
| [`.../bmv-settlement-form.json`](../../world/sources/placement/bmv-settlement-form.json) | Black Marsh settlement clusters: counts, spacing, radius, orientation, water/road relations |
| [`.../bmv-valenwood-settlement-form.json`](../../world/sources/placement/bmv-valenwood-settlement-form.json) | the same for Valenwood — the dry, road-led contrast |
| [`.../vanilla-tamriel-settlement-form.json`](../../world/sources/placement/vanilla-tamriel-settlement-form.json) | the same for Bethesda's own Skyrim — the cross-check |

Miners: `worldgen/mine_interiors.py`, `worldgen/mine_settlements.py`
(regeneration commands in
[world/sources/placement/README.md](../../world/sources/placement/README.md)).

## Method in one paragraph

**Interiors.** Every interior CELL in `Skyrim.esm` + the three Black Marsh &
Valenwood plugins is walked; each reference is classified by mesh path
(`asset_taxonomy.classify`). Pieces in the *structural* categories
(architecture / dungeon-kit / ruin / bridge / dock) form the shell; each shell
piece is paired with its nearest structural neighbour (≤512 units) and the
per-axis offsets are tested against a ladder of candidate snap modules.
Shell pieces are single-link clustered at 384 units (5.5 m) into **chambers**,
which give room dimensions and the floor area that clutter density divides by.
Dressing categories are counted per chamber floor area.

**Settlements.** Exterior cells are walked for `architecture` references.
These are fused at 8 m into **buildings** (a raw architecture ref is a wall
segment as often as a house), and buildings are fused at 45 m into
**settlements** (≥4 buildings). Water samples come from LAND vertices below the
cell water height (~7 m sample spacing); road samples from road/bridge
references and road-painted ground textures.

## Headline numbers — interiors

660 interiors walked, 490 profiled, 1,825 chambers, ~470k references.

**The snap module is 128 units ≈ 1.82 m, and it is a *statistical* grid, not a
hard one.** Reported as *lift over chance* (`nonZeroAxisOnGridLiftOverChance`):
1.0 means "no better than random", 10+ means "the kit is genuinely built on
this module".

| Kit family | interiors | lift @64u | lift @128u (1.82 m) | lift @256u | yaw on 90° | tilted |
|---|---|---|---|---|---|---|
| `architecture/riften` | 30 | 12.8 | **23.1** | 8.4 | 0.98 | 0.07 |
| `architecture/whiterun` | 29 | 8.1 | **14.0** | 8.0 | 0.94 | 0.03 |
| `architecture/windhelm` | 25 | 3.6 | 4.4 | 2.0 | 0.92 | 0.04 |
| `dungeons/nordic` | 79 | 3.8 | 5.0 | 6.5 | 0.55 | 0.19 |
| `dungeons/dwemer` | 63 | 3.0 | 2.4 | 1.3 | 0.63 | 0.29 |
| `dungeons/imperial` | 59 | 1.9 | 2.1 | 2.0 | 0.56 | 0.20 |
| `dungeons/mines` | 35 | 1.4 | 1.1 | 1.0 | 0.41 | 0.43 |
| `dungeons/caves` | 89 | 1.2 | **0.9** | 0.7 | 0.32 | 0.40 |

This **confirms and quantifies** the theory doc's §1.2 claims (128-unit grid,
45° angle snap) and adds the part that matters for a compiler:

1. **Building interiors are hard-snapped; dungeon kits are half-snapped; cave
   shells are not snapped at all.** Caves sit at lift ≈ 1 with 40 % of pieces
   tilted off-axis — exactly the "shell kit, freely placed" pattern. Do not
   write one assembler for both.
2. **A quarter of all adjacent-piece axis offsets are exactly zero**
   (`zeroAxisFraction` 0.26 globally; 0.62–0.74 in town interiors). *Sharing a
   coordinate line* is a stronger, more reliable signal than landing on a grid
   multiple — an assembler should align pieces to each other, not to an
   absolute lattice.
3. **Absolute-grid fit is weak (33 % of non-zero offsets on an 8-unit grid)
   because of Creation Kit "Snap to Reference"**: a rotated piece becomes a new
   grid origin, so the lattice is local, not global. Our assembler should model
   the same thing — a chain of local frames — rather than a world-space grid.
4. **Yaw is quantised to 90°, not 45°.** 56 % of shell pieces globally and
   92–98 % in town kits sit on a multiple of 90; allowing 45 adds only ~3
   points. Tilt (any pitch/roll) is 3–7 % in built kits and 40–43 % in
   cave/mine kits. Uniform rescaling of shell pieces: 19 % globally.
5. **Grids ≥512 units cannot be observed** with a 512-unit neighbour search
   radius — those rows in the JSON are structurally near zero, not evidence of
   absence.

**Rooms.** Chamber plan dimensions (long × short, metres):
p25 12.3 × 7.3, **p50 20.5 × 13.8**, p75 37.7 × 25.7, p95 80.6 × 53.3.
Median chamber long axis by kit: nordic 22.9 m, caves 21.8 m, mines 29.2 m,
dwemer 16.8 m, whiterun house interiors 18.2 m. Combat-space sizing (module 70
§49) can start from "a typical room is ~20 × 14 m".

**Clutter density per 100 m² of chamber floor** (median) — the single most
actionable number for the dressing pass, and it splits by *purpose*, not kit
technology:

| Kit | clutter/100 m² | furniture+lights/100 m² |
|---|---|---|
| `architecture/whiterun` (houses) | **70.6** | 4.0 |
| `architecture/solitude` | 55.9 | 6.9 |
| `architecture/riften` | 53.5 | 4.5 |
| `dungeons/ship` | 53.1 | 1.7 |
| `architecture/windhelm` | 36.1 | 1.8 |
| `dungeons/imperial` | 13.1 | 0.8 |
| `dungeons/nordic` | 5.0 | 0.2 |
| `dungeons/mines` | 4.9 | 0.5 |
| `dungeons/caves` | 3.9 | 0.1 |
| `dungeons/ayleidruins` | 0.6 | 0.0 |

**Lived interiors carry 10–20× the clutter of dungeon interiors.** That single
ratio is what makes a house read as inhabited and a ruin as abandoned; it is
also the interior half of the density budget (0027).

**Piece adjacency.** `kits[*].adjacency` holds the top piece pairs that share a
chamber, ranked by lift, each with its top-3 modal join offsets as
`{planarM, riseM, n}` (binned at 32 units). Median cross-piece join distance is
1.2–1.5 m in dungeon kits and 0.0–0.5 m in town kits (town pieces are stacked
concentrically). This is the adjacency table a Phase-12 assembler samples from.

## Headline numbers — settlements

| | Black Marsh (BM&V) | Valenwood (BM&V) | Skyrim (vanilla) |
|---|---|---|---|
| buildings / settlements | 1,474 / 47 | 1,040 / 30 | 911 / 65 |
| buildings per settlement (p25/p50/p75/p95) | 5 / **9** / 13 / 94 | 5 / 7 / 49 / 161 | 4 / **5** / 10 / 34 |
| building spacing, m (p25/p50/p75) | 12.2 / **14.9** / 20.8 | 11.3 / 13.8 / 17.6 | 11.0 / **14.6** / 19.9 |
| settlement radius, m (p50) | 53 | 45 | 29 |
| buildings per hectare (p50) | 9.4 | 11.0 | 18.7 |
| orientation coherence (p50) | **0.75** | 0.56 | 0.50 |
| distance to water, m (p50) | **3.9** | 68.7 | 52.3 |
| distance to road, m (p50) | 79.2 | 41.1 | **28.9** |
| kit pieces per building (p50) | 1 | 2 | 2 |

What Phase 11 should take from this:

1. **Building spacing is a constant across all three worlds: ~15 m centre to
   centre** (p25–p75 ≈ 11–21 m). It is not culture-dependent; it is a
   navigation/legibility constant. Use it as the settlement compiler's default
   separation, and vary *density* by varying the settlement radius instead.
2. **Most settlements are small.** The median hamlet is 5–9 buildings; the
   long tail (p95 = 34 in vanilla, 94 in Black Marsh) is the handful of named
   towns. A settlement generator should be tuned for hamlets and treat cities
   as authored exceptions — matching the exemplar-first rule (00-core §85.4).
3. **Black Marsh settlements sit ON the water and AWAY from the road; Skyrim
   settlements sit ON the road and away from water.** Median distance to
   standing water is 3.9 m in Black Marsh versus 52 m in Skyrim — i.e. Black
   Marsh buildings are on the waterline, within one land-sample of it. This is
   the strongest single number in the settlement set and directly supports the
   province rule "waterways are the primary structure" (00-core acceptance).
   Our siting compiler should place Argonian settlements from the hydrology
   field first and connect roads afterwards, never the reverse.
4. **Black Marsh settlements are more orientation-coherent (0.75) than
   Skyrim's (0.50)** — stilt villages line up along a bank; Skyrim farms
   scatter. Coherence here = share of buildings whose yaw is within 10° of the
   settlement's modal yaw, modulo 90°.
5. **Building footprints:** plan long axis p50 10.1 m (Black Marsh) and 11.5 m
   (Skyrim); heights p50 17.3 m / 4.8 m — the Black Marsh figure is inflated by
   the tall `architecture/phitt` stilt/tower meshes, which is itself the
   region's silhouette signature.

## What could NOT be mined, and why

* **Facade facing.** `facingVsWaterBearingDeg` and `facingVsRoadAxisDeg` both
  come out at a median of ~22°, which is exactly the uniform-random expectation
  for an angle folded into 0–45°. **No facing preference is detectable.** The
  cause is real and not fixable by better statistics: a reference's yaw is
  relative to each *mesh's own* authored front, which differs per mesh, so
  "does the door face the water" cannot be answered from the plugin alone. It
  would need per-mesh front-vector annotation in the asset registry. Phase 11
  must decide facing from its own rules (or annotate the ~20 meshes it actually
  uses).
* **Ceiling heights.** `chamberHeightSpreadM` is the spread of *piece origins*,
  not floor-to-ceiling clearance; NIF bounds are not read here. Real clearance
  (which module 70 §49 needs for weapon sweep and camera) needs a mesh-side
  measurement pass — a job for the asset pipeline, not the plugin reader.
* **Room *function*.** Chambers are geometric clusters; nothing in the plugin
  labels a room "kitchen" or "shrine". Function could be inferred from the
  furniture mix per chamber (bed/cookpot/alchemy bench) — a straightforward
  follow-up on the same data, deliberately not attempted here.
* **A shipped Argonian interior.** There isn't one. BM&V's 71 interiors yield
  only 37 profiled shells and **every one of them is built from a vanilla
  Skyrim kit** (caves, riften, dwemer, imperial, ayleid, ship). The Xanmeer
  tileset mod (`XanmeerResources.esp`) ships 79 base objects and **zero placed
  examples**, and `Argonia.esp` / `Tropical Skyrim.esp` contain no interiors at
  all. **Phase 12 therefore has no worked example of Argonian interior
  assembly** and must derive the Xanmeer kit's grammar from the meshes'
  own connect geometry plus the vanilla grammar above.
* **Roads in Black Marsh** are barely present as data: 755 road samples over
  8,344 cells, only 154 of them from painted ground. The 79 m median
  building-to-road distance is therefore a weak measurement, and the honest
  reading is "BM&V's Black Marsh has few roads", not "its towns avoid roads".
  The Skyrim figure (28.9 m, dense road refs) is the trustworthy one.
* **Doors/entrance counts** are recorded per interior (`interiors[].doors`) but
  not linked to their exterior side — the plugin's teleport links (XTEL) are
  not decoded by `esp_index` yet. Worth adding when Phase 12 needs
  interior↔exterior portal statistics.

## One discrepancy to resolve before these numbers are used as absolutes

`esp_index.UNITS_PER_METRE` is `1/0.0142240` = 70.303 units/m, but its own
docstring derives 64 units = 1 yard, which gives **70.0028** units/m (and the
theory doc §1.2 uses 1.42875 cm/unit). The two differ by **0.45 %**. Every
mined length in this repo — these files and the older `mine_placement` ones —
carries that 0.45 % bias, which is immaterial for densities and ratios but
means "128 units = 1.821 m" here where the true figure is 1.8288 m (6 ft).
Flagged rather than changed, because the constant is shared with the live
scatter compilers; a future agent should fix it in one place and re-run all the
miners together.
