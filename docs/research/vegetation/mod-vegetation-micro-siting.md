# Micro-siting in the shipped mods: waterline species, riparian belts, pool scenes

**Phase 10, 2026-08-30.** Goes one level below
[shipped-world-placement-rules.md](../placement-settlements/shipped-world-placement-rules.md) (which
measured *how much* and *how clumped*): this measures **where each species
stands relative to the water**, how density behaves as you walk away from a
shore, and how a dressed pool is structured ring by ring. Plus a full autopsy
of **Tropical Skyrim** — what a "turn a biome into jungle" mod actually
changes.

- Machine-readable output: `world/sources/placement/bmv-blackmarsh-micrositing.json`
  and `bmv-valenwood-micrositing.json` (reader: `worldgen/mine_micro_siting.py`)
- Method: every 2nd LAND vertex of each dressed cell (+1-ring) becomes a grid
  node at 3.64 m spacing; flooded = cell water height above terrain; a chamfer
  distance transform seeded at flooded/dry boundaries gives every node and
  every placed reference its distance to the nearest waterline and which
  water body that waterline belongs to.
- All four caveats of the parent doc apply (unfinished mod, 41 % unresolved
  vanilla refs, one art team, flat terrain). Two more of this doc's own:
  distances are quantised at ~1.8–3.6 m, and per-species p95 flooded depths
  repeatedly read "29.1 m" — that is one deep coastal basin under the sea-level
  water table, so **medians are the signal, p95 depth is not**.

## 1. Species × water relation

Share of each species' instances by standing water over its ground
(Black Marsh; `wl` = waterline ±0.3 m, `damp` = ground 0.3–1 m above water,
`dry` = >1 m above; `fldD50` = median standing-water depth when flooded).

**The aquatic guild — placed in the water, and at sorted depths:**

| Species | n | deep >1m | 0.3–1m | wl | damp | dry | fldD50 |
|---|---|---|---|---|---|---|---|
| kelp tall (`kelptallstatic01aaa`) | 609 | **0.77** | 0.18 | 0.02 | 0.01 | 0.01 | 1.63 m |
| lilypad (`gkblillipad2`) | 4,482 | **0.56** | 0.23 | 0.19 | 0.01 | 0.01 | 1.20 m |
| water kelp tall/short | 1,369 | 0.25–0.30 | 0.28–0.30 | 0.40–0.43 | 0.01 | 0.01 | 0.45–0.53 m |
| reeds (`vurt_reeds`) | 8,869 | 0.28 | 0.28 | **0.41** | 0.02 | 0.00 | 0.34 m |

Kelp is a deep-water plant (median 1.6 m), lilypads live over 0.5–2 m of
water, reeds straddle the waterline into the shallows. Lilypad ref origins sit
at/near the water *surface* (median 0.84 m below it when submerged — i.e. they
sample the surface, not the bed).

**Amphibious trees — the flooded-forest look:**

| Species | n | deep | 0.3–1m | wl | damp | dry | fldD50 |
|---|---|---|---|---|---|---|---|
| cypress5 | 267 | 0.23 | **0.39** | 0.34 | 0.02 | 0.02 | 0.57 m |
| mangrove (`mangrovereachtree0gkb3/9`) | 1,166 | ~0.20 | ~0.20 | **~0.50** | 0.05 | 0.06 | 0.34–0.46 m |
| jungle tree (`gkbjungletreenew1`) | 480 | 0.23 | 0.28 | 0.38 | 0.05 | 0.06 | 0.65 m |
| cypress1 | 1,576 | 0.27 | 0.06 | 0.37 | 0.06 | **0.25** | 2.47 m |
| cypress3 | 933 | 0.26 | 0.04 | 0.13 | 0.07 | **0.50** | 2.96 m |

Mangroves and cypress5 are *committed* to the waterline and shallows; cypress1
and cypress3 are **bimodal** — they stand either in genuinely deep water
(median 2.5–3 m when flooded) or on dry ground, avoiding the in-between. That
bimodality is a deliberate look: lone drowned trees in open water.

**The wading terrestrial matrix** — ferns, bracken, big shrubs, tropical
plants (n = 2,000–9,300 each): ~0.10–0.17 deep, 0.03–0.09 shallow,
**0.63–0.78 at the waterline**, ~0.10 dry, with a median flooded depth of
**0.11 m**. These are ordinary land plants placed straight across the
waterline into ankle-deep water — this, more than the aquatics, is what makes
the marsh read as flooded.

**Dry-ground species** — dry pines (`treepineforestbroken01` 0.86 dry,
`edid:TreePineForest01Dead`), firefern (0.82), algae grass tufts, Vvardenfell
trama roots (0.74–0.75), mushrooms (0.76–0.77): all >1 m above the water
table, i.e. the hummock/upland layer, ~2 % ever flooded.

> **Rule M1.** A wetland palette needs *four* water postures, not three:
> **depth-sorted aquatics** (kelp deep ≈1.6 m, lilypads 0.5–2 m, reeds
> 0–0.5 m), **waterline-committed trees** (mangrove/cypress at 0.3–0.6 m),
> **bimodal drowned trees** (deep water *or* dry, never the margin), and a
> **wading terrestrial matrix** whose dry species simply continue ~0.1 m into
> the water. Module 65 §111's `submerged/waterline/dry` classes should grow a
> per-species depth band, and the "wading" behaviour should be the *default*
> for waterline-class species rather than a hard clip at 0.

## 2. The riparian profile — density against distance from the waterline

Instances per hectare by signed distance to the nearest waterline, dressed
cells only (multiplier vs the >40 m hinterland):

| Band | Black Marsh /ha | ×hinterland | Valenwood /ha | ×hinterland |
|---|---|---|---|---|
| water, >20 m from shore | 128 | 0.76 | 12.5 | 0.22 |
| water, 5–20 m | 249 | 1.47 | 16.3 | 0.28 |
| **water, 0–5 m** | **356** | **2.10** | 20.4 | 0.36 |
| shore, 0–5 m | 246 | 1.45 | 32.4 | 0.57 |
| bank, 5–10 m | 242 | 1.43 | 39.4 | 0.69 |
| back, 10–20 m | 233 | 1.37 | 40.1 | 0.70 |
| back, 20–40 m | 228 | 1.34 | 54.1 | 0.95 |
| hinterland, >40 m | 170 | 1.00 | 57.2 | 1.00 |

Two opposite shapes from the same team. The **marsh peaks in the water just
off the shore** (2.1×) and holds an elevated belt (~1.4×) all the way out to
40 m before easing; the **dry forest inverts** — density *falls* toward water
(0.36× in the near-shore water, 0.57× on the shore), because trees stand back
from rivers and the water itself is left open.

> **Rule M2.** The riparian multiplier is a *biome parameter with a sign*:
> wetland ≈ ×2 in the near-shore shallows tapering to ×1 by ~40–60 m inland;
> dry forest ≈ ×0.4–0.7 within ~20 m of water (open banks, visible rivers).
> Our hydrology's distance-to-water field is the input; do not apply one
> global "shores are lush" rule.

## 3. Pool scenes — what stands where around a dressed pool

502 standing-water bodies in the dressed area; 271 are pool-sized
(100–25,000 m²; median 850 m², p95 9,700 m²), 255 of them dressed. Ring
composition aggregated over all pools (share of ring instances):

| Ring | n | aquatic-plant | plant | shrub | tree | root |
|---|---|---|---|---|---|---|
| open water, >5 m in | 5,009 | **0.17** | 0.19 | 0.13 | 0.10 | 0.05 |
| shallows, 0–5 m in | 8,558 | 0.03 | 0.17 | 0.12 | 0.09 | 0.04 |
| margin, 0–3 m out | 4,322 | ~0.01 | 0.18 | 0.12 | 0.11 | 0.04 |
| bank, 3–10 m out | 8,005 | ~0.01 | 0.18 | 0.13 | 0.12 | 0.04 |
| backdrop, 10–25 m out | 14,548 | ~0.01 | 0.19 | 0.13 | 0.13 | 0.04 |

The surprise is what does *not* change: the terrestrial mix (ferns, bracken,
shrubs, jungle trees, roots) is essentially **flat across every ring** —
the same matrix runs unbroken from the backdrop through the margin into the
shallows. Only two things are ring-sorted: the **aquatic guild concentrates in
open water** (lilypads are the #1 species there, 718 of 5,009; kelp #9;
they vanish outside it), and **trees thin slightly toward open water**
(0.13 → 0.10).

Where each aquatic actually sits, from the distance table (share of the
species' own instances): lilypads put **59 %** at 5–20 m from shore and 23 %
at 0–5 m — a floating belt just off the bank, not wall-to-wall cover; reeds
put **38 %** at 5–20 m and 28 % beyond 20 m — reed beds stand *offshore* in
the shallows more than they fringe the beach; kelp ~30 % at 5–20 m.

Individual pools are **themed, not uniform**: one 9,100 m² pool is a lilypad
pond (313 lilypads + 70 kelp in open water, margin nearly bare); a 15,600 m²
pool is a drowned thicket (poison bloom/bracken/tropical plants standing in
the water, only 20 lilypads); the busiest (5,500 m²) is dressed almost
entirely with four unresolved vanilla marsh plants at 500–2,600 per ring.

> **Rule M3.** Dress a pool as **matrix + guild**, not as concentric bands:
> run the terrestrial matrix at full density right into the shallows (M1's
> wading rule), then add *one* water guild per pool — lilypad pond, reed bed,
> drowned thicket — placed 5–20 m off the bank in the 0.5–2 m depth range.
> Per-pool theming (choose the guild per water body, not per instance) is
> what the source actually does and is cheap for the compiler to reproduce
> with a per-water-body random pick.

## 4. BM&V groundcover: there isn't any of their own

The BM&V plugins define **zero `GRAS` records**. Of their 25 landscape
textures, only 8 bind grass, all pointing into vanilla `Skyrim.esm` records:
fern/forest grasses on the pine-forest paints, tundra/rock grass on the
open paints; the marsh paints bind **no grass at all**. The mod's entire
understory is *placed statics* (the 100/ha of the parent doc) over mostly
bare painted ground.

> **Rule M4.** BM&V is **not** a model for groundcover — it proves you can
> read as jungle with placed statics alone, but at hand-placement densities
> we already know are 10× below nature. Our T3 ring should follow Tropical
> Skyrim/vanilla (§5) instead, and treat BM&V's grassless marsh paint as a
> gap in their build, not a design.

## 5. Tropical Skyrim: anatomy of a jungle conversion

Nexus 33017 ("Tropical Skyrim -- A Climate Overhaul", Soolie): *"a complete
overhaul of skyrims climate... The pine forest has been changed into a dense
jungle... The marsh area is still a marsh, only now it has brown muddy water,
cattails, and jungle foliage."* What that means mechanically, from the
plugin (1.9 MB, one master: `Skyrim.esm`) and the loose files:

| Mechanism | Size | What it does |
|---|---|---|
| **Mesh/texture replacement** | 876 NIFs (780 of them trees), 947 textures | vanilla tree/plant/grass models replaced on disk under their vanilla paths — every vanilla placement everywhere becomes jungle with **zero** placement edits |
| **TREE record overrides** | 68 of 70 | vanilla species re-pointed at jungle models keeping form ids: `TreePineForest01`→mangrove, `TreeAspen03`→bamboo, `TreeReachShrub01`→palm |
| **GRAS overrides + new** | 10 overrides + 4 new | grass re-speciated and re-densified (below) |
| **CELL overrides** | 2,389 (2,364 in Tamriel) | climate rebinding only: region lists (`XCLR`, for new weather), water height/type (`XCLW`/`XCWT` — the "brown muddy water"), occlusion; **no lighting-template or placement content** |
| **REFR overrides** | 2,247 vanilla + 361 new | nudged (`DATA`) and rescaled (`XSCL`, 1,225 refs) vanilla tree refs; **zero deleted, zero disabled** |
| **LAND edits** | 13 | spot terrain fixes |
| new base objects | 6 | 2 trees, 1 movable static, 3 armours |

The headline: a total biome conversion that ships **~2.6 k placement edits
against a game with ~hundreds of thousands of placed refs** — under 1 %. The
jungle read comes almost entirely from **model substitution over unchanged
vanilla placements plus groundcover**, which is strong evidence for our split:
species palette and groundcover carry biome identity; placement geometry
carries structure.

**The grass ladder it sets** (density is Bethesda's per-quad points value,
comparable across rows, not across games): marsh `FrozenMarshGrass01` **60**,
fern `FernGrass01` **37**, jungle `ReachGrass01/02` **30**, `CattailGrass01`
**30** with the water rule *below-at-least* (grows only on flooded ground —
Bethesda's native emergent-vegetation switch), `ForestGrass01` **25**, rock
**10**, accent plants (`TropicalGrassPlant01/02`, new records) **3–5**,
desert-conversion tundra **3–5**. Marsh : forest : sparse ≈ **12 : 5–7 : 1**,
and the dense jungle floor is *two* stacked species (fern 37 + reach 30) on
the same paints. Whether 60 is itself a raise over vanilla is blocked on
`Skyrim.esm` (§6) — but the *shape* of the ladder is usable now.

> **Rule M5.** Jungle-look budget: biome identity ≈ leafier models + 2-species
> stacked groundcover at ~10× the sparse-biome density; placed-ref changes
> ≈ 1 % (rescales, not moves). For us: T3 groundcover and the T1/T2 palette
> carry the "dense jungle" read; scatter density changes are for *structure*
> (M2, M3), not for making it look tropical. Adopt `below-at-least` water
> mode as a first-class T3 parameter — it is how cattail/emergent grass
> works without placing a single ref.

## 6. Blocked on `Skyrim.esm` (unchanged ask, PROGRESS)

- Vanilla `GRAS` densities (is Tropical Skyrim's 60 a raise?), vanilla
  LTEX→grass bindings, vanilla `REGN` object tables (R11's confirmation).
- Names/meshes for the four unresolved vanilla marsh plants that dominate
  BM&V pool margins (`skyrim.esm#0B8A66/#0B73BC/#0B8A59/#0B73B8`,
  ~18.5 k instances) — their water-relation stats are measured above, only
  their identity is missing.
- A vanilla-Skyrim riparian profile as a third art direction's data point.

## Regenerating

```bash
cd tooling/world-generation
BMV=../asset-pipeline/black-marsh-mod-source/plugins
TS=<vault>/skyrim-source/mod-sources/tropical-skyrim-33017/extracted

python3 -m worldgen.mine_micro_siting \
  --plugin "$BMV/Black Marsh.esm" --plugin "$BMV/Black Marsh North.esp" \
  --names "$TS/Tropical Skyrim.esp" --names "$BMV/Valenwood.esp" \
  --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \
  --out ../../world/sources/placement/bmv-blackmarsh-micrositing.json
# Valenwood: --plugin "$BMV/Valenwood.esp" --world Valenwood
```
