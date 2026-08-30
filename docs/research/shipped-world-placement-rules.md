# What the shipped worlds actually do: mined placement rules

**Phase 10, 2026-08-30.** The measurable half of "mine the shipped worlds for
rules" (module 95 §86.0b). We never lift another team's authored places
(00-core rule 6) — this document records *statistics* about how professionals
dressed a swamp and a forest, and turns each into a rule our scatter compiler
and flora palettes can be built from.

- Machine-readable output: [`world/sources/placement/`](../../world/sources/placement/README.md)
- Asset side: [`world/sources/assets/`](../../world/sources/assets/README.md)
- The systems these feed: module [65 §109–112](../world/65-vegetation-scatter.md)
  (vegetation/scatter) and [90 §71–80](../world/90-asset-strategy.md) (assets)
- Readers: `worldgen/esp_index.py`, `worldgen/mine_placement.py`,
  `worldgen/mine_groundcover.py`

## 1. Sources, coverage and what would make a number wrong

| Source | What was measured | Size |
|---|---|---|
| **Black Marsh & Valenwood**, worldspaces `BlackMarsh`, `BlackMarsh2`, `BlackMarshNorth` | every placed object reference, against the terrain, water table and painted ground under it | 144,298 refs over 8,344 cells (28.3 km²), 1,973 of them dressed |
| **BM&V**, worldspace `Valenwood` | the same, as a dry-forest contrast | 42,107 refs over 3,876 cells |
| **Tropical Skyrim**'s overrides of vanilla `GRAS`/`LTEX`/`REGN` | Bethesda's groundcover parameter schema with real values, and which grasses each painted ground allows | 14 grass records, 47 landscape textures |
| **Argonian Xanmeer Tileset** plugin | every kit piece's bounding box and origin | 79 records / 85 meshes |

**Four caveats that bound every number below.**

1. **BM&V's Black Marsh is an unfinished new-land mod.** Only **24 %** of its
   Black Marsh cells carry any placed object at all; its terrain is far ahead
   of its dressing. (Its Valenwood is much further along — **63 %** of cells
   dressed.) Every density here is therefore quoted **per dressed cell**,
   never averaged over the worldspace, and absolute densities should be
   treated as "what one team thought looked right where they finished", not as
   a target.
2. **41 % of Black Marsh references (63 % of Valenwood's) point into
   `Skyrim.esm` or a DLC master, none of which are in the vault.** They are
   still counted, measured and banded — only their mesh is unknown. 16 % of
   those (23 % in Valenwood) now carry a real name (`edid:TreeSwordFern06`)
   borrowed from Tropical Skyrim's overrides, which keep vanilla form ids and
   editor ids while replacing the model. Dropping `Skyrim.esm` into the vault
   and re-running names the rest and unlocks Bethesda's own `REGN`/`GRAS`
   tables; the ask is in PROGRESS.
3. **One team, one art direction.** BM&V and Valenwood share authors, so
   agreement between them is weaker evidence than it looks. Where the two
   agree, this document says so; where a rule rests on a single worldspace, it
   says that too.
4. **Slope is a weak signal in this source.** BM&V's swamp is close to
   perfectly flat — over half of all terrain vertices have an exactly vertical
   normal — so slope bands separate less than they would in real terrain.

## 2. The rules

### R1 — Hand placement is strongly clustered; a jittered grid is not a substitute

Clark-Evans R (mean nearest-neighbour distance over the random expectation;
1.0 = random, <1 = clumped) across every species with ≥30 instances:

| | median R | R<1 |
|---|---|---|
| Black Marsh | **0.49** | 212 / 215 species |
| Valenwood | **0.43** | 191 / 197 species |

Neighbours sit about **half as far apart as a random scatter would put them**,
in both worldspaces, for essentially every species. A jittered grid — module
65 §111's current default — produces R slightly *above* 1: more even than
random, the opposite of what dressing a marsh looks like.

Companion numbers, for parameterising clustered scatter directly: the median
species puts **41 %** of its instances in clumps of three or more, the typical
clump the median species belongs to has 2 members (the heavy species are far
higher — reeds 11, vanilla ferns 31), and the median clump radius is
**9.6 m** (Valenwood 9.8 m).

> **Rule.** Scatter samples clump centres first, then members around them.
> Per layer the compiler needs: clumps per hectare, members per clump
> (heavy-tailed), clump radius (~10 m default), and a fraction placed as
> singletons between clumps (~60 %). Target R ≈ 0.5, and *measure* R on
> compiler output as a probe — it is a one-number check that scatter looks
> hand-placed rather than sprayed.

### R2 — In a marsh, the waterline is the densest place

Density by depth of standing water over the ground, Black Marsh, per hectare
of the cells where that band occurs:

| Band | Instances | Per hectare |
|---|---|---|
| ground >2 m under water | 15,219 | 75 |
| 0.5–2 m under | 10,202 | 50 |
| **waterline, 0–0.5 m under** | **46,948** | **117** |
| **damp, 0–0.5 m above** | **26,173** | **105** |
| dry, 0.5–2 m above | 28,545 | 73 |
| >2 m above | 10,488 | 53 |

A clean single peak in the ±0.5 m band around the water table, falling to
about half that in open water and on dry ground. Nothing else in the dataset
sorts vegetation as sharply.

> **Rule.** Density is a function of height above the water table with a
> maximum at the waterline, not a constant per region. Our hydrology already
> produces the input (module 50); the shape is a peak at 0 with a ~2 m
> half-width either side.

### R3 — Density falls steeply with slope, then flattens

| Slope | Black Marsh /ha | Valenwood /ha |
|---|---|---|
| 0–5° | 151 | 43 |
| 5–15° | 65 | 23 |
| 15–30° | 26 | 11 |
| 30–45° | 22 | 8 |
| 45–90° | 33 | 11 |

Both worldspaces roughly halve per band to ~30°, then stop falling (the 45–90°
uptick is cliff-face dressing — hanging roots and ledge plants — not ground
scatter). Ratios agree across the two despite a 3.5× difference in absolute
density, which makes this the best-supported rule here.

> **Rule.** Slope multiplier ≈ halve per 10–15° to 30°, then hold at ~0.2 of
> the flat-ground value; cliff species are a separate layer with their own
> rule, not the tail of the ground layer.

### R4 — Water depth sorts the species, and the aquatic tier is real

Category mix by band (Black Marsh, share of instances):

| Band | aquatic | tree | shrub | plant |
|---|---|---|---|---|
| >2 m under water | 0.22 | 0.14 | 0.13 | 0.14 |
| 0.5–2 m under | **0.40** | 0.10 | 0.04 | 0.04 |
| waterline | 0.14 | 0.14 | 0.16 | 0.17 |
| damp | **0.02** | 0.13 | 0.18 | 0.18 |
| dry | 0.00 | 0.10 | 0.04 | 0.04 |

Per-species, the split is sharper than the category averages: reeds sit on
flooded ground 86 % of the time, lilypads 92 %, kelp 87 %; ferns 30 %, dry
pines 4 %. The 0.5–2 m shallows are where the aquatic layer dominates — one
in five objects there is a lilypad.

> **Rule.** Three flooding classes per palette — *submerged* (samples the
> water surface, module 65 §111), *waterline* (tolerates 0–0.5 m), *dry* —
> with a species' flooded-ground fraction as the authored parameter.

### R5 — A place reads from a handful of species, with a long tail behind them

Black Marsh, 1,284 distinct meshes placed: the top 1 is 6 % of all instances,
top 5 = 25 %, **top 20 = 60 %**, top 50 = 79 %, top 100 = 90 %. A dressed cell
(0.34 ha) carries a median of **11 distinct species** (p25 5, p75 19, p95 33).

Valenwood is much more concentrated: 3 species per cell (p50), top 20 = 39 %,
because vanilla trees carry the look and the understory is thin.

Category mix among instances with a known mesh (Black Marsh): trees, plants
and shrubs each ~22 %, aquatics ~18 %, roots ~5 %.

> **Rule.** A region palette needs ~20 species to own 60 % of what the player
> sees and ~50 for 80 %; per-instance variety comes from ~11 species being
> present in any 0.34 ha, not from a huge palette everywhere.

### R6 — Region grammar, in numbers

The same team, the same engine, two biomes:

| | Black Marsh (wetland) | Valenwood (forest) |
|---|---|---|
| median dressed density | 100 /ha | 15 /ha |
| species per dressed cell | 11 | 3 |
| dominant categories | plant / tree / shrub / aquatic in near-equal quarters | tree-dominated (0.26 + most of the unresolved) |
| objects on flooded ground | **53 %** of instances | **2.9 %** |
| top-20 share | 60 % | 39 % |
| cells dressed | 24 % | 63 % |

The last row matters: the forest is the *more finished* worldspace and is
still 6–7× sparser, so the density gap is a design choice rather than an
artefact of how far the mod got.

> **Rule.** Region identity is a **density and mix** change of the same order
> as the species change — a wetland is 5–7× denser and 3–4× more species-rich
> per cell than a forest. Module 65's acceptance criterion ("region identity
> visibly changes vegetation density and species mix") has numbers now.

### R7 — Species travel in two kinds of company

Co-occurrence lift (observed shared cells over the independent expectation,
support ≥15 cells):

- **A tight water guild, lift ≈ 8–11**: reeds ↔ lilypads (10.2) ↔ kelp (7.9)
  ↔ mangroves (10.3). These are effectively one placement decision.
- **A loose terrestrial matrix, lift ≈ 2.3–2.9**: cypress ↔ trama roots (2.9)
  ↔ cedar (2.8); bracken ↔ dry trees (2.3) ↔ gorse (2.3) ↔ fallen branches.

> **Rule.** Palettes are authored as **guilds**, not as flat species lists: a
> water guild placed as one unit at the waterline, and a terrestrial matrix
> whose members co-occur loosely. Lift is the metric to reproduce.

### R8 — Where the source is *worse* than we should be

Three habits are visible and none of them is good practice; they are recorded
so we deliberately diverge rather than accidentally imitate:

- **Yaw is under-randomised.** Median rotation-uniformity 0.32 (1.0 = fully
  random); 108 of 226 species sit below 0.3, meaning most copies face the same
  way. Copy-paste, not design.
- **Nothing is ever tilted.** Tilt median is exactly 0° for all 117
  known-mesh species. Every plant stands plumb regardless of the ground.
- **Roughly half the species use a single fixed scale** (54 of 117 have
  identical 5th and 95th percentiles).

> **Rule.** Always randomise yaw fully; tilt toward the terrain normal with a
> partial weight (upright plants lean less than fallen logs); give every layer
> a scale range. These are free wins the source did not take.

### R9 — Scale is a legitimate art tool, and the source leans on it hard

Placed scales run from 1.0 to 10.0, with species medians of 1.8–8.0. BM&V's
jungle read is manufactured by **supersizing existing meshes**: a 32 m cypress
mesh placed at ×2, trama roots at ×8 giving 13 m root arches, 15 m ferns.

> **Rule.** Under the no-new-art constraint, scale is one of the few free
> levers for making a sourced asset feel like *our* species. It is also a
> silhouette risk: a ×5 tree that reads as a giant when the player stands next
> to it is an owner call, which is why palette scale ranges go into the
> decision pack rather than being chosen here.

### R10 — Bethesda's groundcover schema, adopted as a checklist

`GRAS` records carry exactly the parameters our T3 ring needs: density,
min/max slope, distance-from-water with a mode enum (above/below, at
least/most), position jitter, height variance, colour variance and a wind wave
period. Observed values (Tropical Skyrim's overrides of the vanilla records):

| Grass | Density | Slope max | Position jitter | Height var | Wave |
|---|---|---|---|---|---|
| FrozenMarshGrass01 | 60 | 42° | 40 u (0.57 m) | 0.30 | 120 |
| FernGrass01 | 37 | 50° | 30 u | 0.33 | 240 |
| ReachGrass01/02 | 30 | 35° | 35 u | 0.35 | 228–252 |
| CattailGrass01 | 30 | 40° | 40 u | 0.30 | 120 (water mode: *below at least*) |
| ForestGrass01 | 25 | 33° | 41 u | 0.30 | 120 |
| RockGrass01 | 10 | 40° | 32 u | 0.25 | 60 |
| TundraGrass01/03/04 | 3–5 | 14–19° | 30–40 u | 0.20 | 240–270 |

Two structural facts beyond the values: grass is bound to **painted ground
texture** (`LTEX.GNAM`), and **no texture allows more than three grasses** —
20 of 47 allow none at all.

> **Rule.** T3 groundcover takes this parameter list verbatim as its schema
> (values computed from our own fields, never copied), keys off our land-cover
> classes rather than painted textures, allows **at most three species per
> class**, and treats bare ground as a first-class outcome — 43 % of ground
> types here carry no grass at all. Marsh grass at 2× forest grass and 12×
> tundra grass is the density ladder's shape.

### R11 — The two-tier design split is Bethesda's own, not our invention

Skyrim inherited Oblivion's `REGN` object generator — a per-region table with
density, clustering, slope limits and sink variance — and our reader parses it
(`decode_rdot`). **None of the 16 vanilla `REGN` records Tropical Skyrim
overrides carries an object table, and neither do BM&V's six.** In evidence so
far, Skyrim's exteriors are hand-placed statics plus procedural `GRAS`, with
the region generator unused.

> **Rule.** Module 65 §110's split — compiler-placed clumped statics (T1/T2)
> over a procedural groundcover ring (T3) — matches what the shipped games
> actually do. Confirm against `Skyrim.esm` when it lands; if vanilla regions
> *do* carry object tables, their fields are already a parsed structure here.

### R12 — The Xanmeer kit is a 256-unit grid

Every structural piece measures 255–257 units on its horizontal axes
(3.63–3.66 m) with half-pieces at 127–128; walls are 256–258 units tall,
hallways 304 (4.32 m interior height), roofs 259–264. Pieces anchor at the
module's **left edge, centred across** (`x 0..255, y -127..127`); ramps and
stairs span 768 × 266 units and rise 560.

> **Rule.** Xanmeer kit grid = **256 units = 3.6415 m**, storey 256 u,
> half-module 128 u, rotations on 90°. A 3.6 m × 4.3 m corridor clears the
> combat-space requirement comfortably (module 75), which is worth
> re-measuring in the 10b probes rather than assuming.

### R13 — 634 BM&V assets already ship flat LOD billboards

The registry links each mesh to its `_lod_flat` sibling where one exists: 634
in BM&V, 52 in vanilla, 1 in Tropical Skyrim. Module 65's T4 tier can start
from real source billboards for the BM&V flora rather than generating
impostors.

### R14 — Budget cross-check against module 65's tiers

Our chunk is 467.9 m square = 21.9 ha. At the mined **median dressed** density
(100 /ha) that is ~2,190 instances per chunk. Splitting by placed size (source
bounds × placed scale), among instances whose size we know:

| Tier | Share | Per chunk at median density | Module 65 guide |
|---|---|---|---|
| T1 hero, ≥8 m | 22 % | ~475 | 50–300 |
| T2 mid, 1.5–8 m | 48 % | ~1,060 | 1,000–5,000 |
| T3 ground, <1.5 m | 30 % | ~660 | 10–30 k in the ring |

T2 lands mid-band. **T1 is 1.6× over its guide** — because BM&V's "hero"
count includes ordinary supersized trees, not just identity assets, so either
the T1 band widens or the 8 m threshold is the wrong cut for hero status.
At the p95 dressed density (680 /ha ≈ 14,900 per chunk) every tier is over
budget by 3×, which is the case the dense-vegetation micro-lab must measure.

## 3. What we deliberately do not take

- **No authored places.** Nothing about BM&V's Lilmoth, its layout or its
  composed locations enters our world; only distributions do.
- **No copied numbers into compilers.** Bethesda's `GRAS` density of 60 is
  meaningless in our units; we adopt the *field list* and compute values from
  our own climate, wetness and land-cover rasters (§86.0b).
- **Not their absolute densities as targets.** See caveat 1 — these are one
  team's unfinished dressing, and our own density target is an owner call
  informed by the Morrowind content-density work, not by this.
- **Not their jitter habits.** R8 is an explicit list of things to do better.

## 4. Open items

- **`Skyrim.esm` is not in the vault** (ask recorded in PROGRESS). It would
  name ~40 k of the measured references, give vanilla assets their dimensions
  and editor ids in the registry, and settle R11. Re-running is two commands.
- **Interior/dungeon composition is unmined.** The reader now walks interior
  cells (`Plugin.interior_cells`), and BM&V's interior `CELL` group alone is
  1.17 MB — that is Phase 12's mining job, not Phase 10's.
- **Settlement composition is unmined** — Phase 11's job, same reader
  (BM&V's Lilmoth-area cells; module 95 Phase 11 already calls for it).
