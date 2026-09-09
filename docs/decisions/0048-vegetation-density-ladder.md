# 0048 — The between-region vegetation ladder, and the gates that hold it

Date 2026-09-09. Extends decision 0036 (Phase 10 placement) with the
between-region comparison that 0036 did not record.

## The report, and what it turned out to be

The owner's report was that macro tree density looks uniform across regions
below an altitude threshold. It was correct. Two measurements of the shipped
bundles, taken before this change, say so in different ways.

By the 2026-09-08 audit's chunk view, tropical jungle sat at the **37th
percentile of the province's own lowland chunks**, and firm lowland — the
largest lowland class — read at 1.02× the jungle. That view attributes a
chunk's whole instance count to its dominant class, so it overstates a sparse
class sitting next to a dense one. The per-region-pixel measure adopted below
is stricter and still finds the same problem: firm lowland delivered 26.97
stems/ha against the jungle's 39.00, a ratio of **0.69** where the ecology
wants 0.55, with the fringe marsh at 0.49 and the upland hills at 0.84. The
lowlands were bunched where they should have been graded.

The cause is at `build_palettes.py`, region 13's note: a round-7 change traded
jungle stem count for wide crowns ("stem counts FALL while closure rises") and
the rest of the ladder was not re-based. Each region table was authored on its
own ecological terms, not against its neighbours, so the comparison had nowhere
to live and drifted for four rounds unchecked.

## The measure

**Stems per hectare = T1-tier instances whose role is not rock or cliff
dressing.** That is the hero stratum a player reads as forest: giants,
emergents, canopy, gallery, waterline and drowned trees, basin mangrove and the
rootland's tree-scale fungi. It excludes the T2 understory, lianas, epiphytes,
aquatics and the boulder ladder — counting boulders is why the mountains and
uplands used to read denser than they are.

It is measured **per region pixel**, not per dominant chunk: every instance is
attributed to the region class of the raster cell it stands in and divided by
that class's own area. This matters. The 2026-09-08 audit's dominant-chunk
figures put the lake at 54.4 stems/ha; measured per pixel the lake carries
**0.87/ha**, which is what open water should carry. The 54.4 was the lake's
NEIGHBOURS' forest, counted inside lake-dominated chunks — an attribution
artefact of a 468 m chunk over regions that interdigitate well below it. The
same artefact was flattering the fringe marsh and the firm lowland.

## The ladder (tropical jungle = 1.00)

**The jungle does not move.** Owner constraint, binding: its current density
feels right. It re-bases everything else *around* it. The re-basing is
downward: the province delivers **51% fewer trees** at the new ratios, which is the
browser budget as much as the ecology.

| class | region | ratio | grounding |
|---|---|---|---|
| 13 | tropical jungle | **1.00** | ecology §7.1 type 1 terra firme; "rainforest leading inland" (`lore/regions/murkmire.md:13`). The ladder is expressed relative to this row. |
| 14 | mangrove forest | 1.40 | §7.1 type 3: higher stem count, lower roof — a thicket. "Nigh-impenetrable" wall near Lilmoth (`murkmire.md:23`) |
| 6 | rootland deep marsh | 0.76 | §7.1 type 4: fewer, far bigger buttressed trunks. "The marsh is very dense" (`middle-argonia.md:11,19`) |
| 7 | interior swamp | 0.67 | §7.1 type 2 flooded forest; flood depth sets the gradient (`middle-argonia.md:85`) |
| 5 | deep river corridor | 0.60 | §7.2 riparian gallery, abrupt outer edge, zero midchannel (`waters.md:27,31`) |
| 2 | upland hills | 0.60 | "more temperate grasslands compared to the swampier south" (`thornmarsh-and-east.md:11`) |
| 11 | firm lowland | 0.55 | our largest lowland class (43/199 chunks): it must sit clearly below the jungle or the province reads uniform (`blackwood-and-gloommire.md:10-16`) |
| 10 | raised hammock | 0.45 | dry palm islands; §7.2 hummock–hollow (`fauna-hazards.md:93`) |
| 3 | tidal delta | 0.45 | §7.1 type 3 landward band over mudflat and salt pan (`waters.md:27,31`) |
| 8 | fringe marsh | 0.40 | the ecotone; the swampy-south→grassland-north gradient needs a legible middle step |
| 4 | coastal lagoon & salt marsh | 0.35 | §7.1 type 3 landward + salt-marsh grass; trees patchy on saline flats (`waters.md:24`) |
| 1 | border mountains | 0.15 | altitude gates stay (a treeline is physical), level drops |
| 9 | seasonal floodplain | 0.12 | §7.1 5c savanna 5–30/ha + §7.2 gallery ribbons; "fields of ferns and flowered grasses" (`fauna-hazards.md:99`). The clearest open counterpoint to the jungle. |
| 12 | lake & standing water | 0.02 | open water; drowned snags only |

## How it is applied

Once, as a **scalar per region on the stem layers only**
(`build_palettes.rebase_stems`), derived from the measured delivery:
`multiplier = target_ratio × delivered(13) / delivered(region)`. Not by
re-typing sixty numbers, deliberately:

* the understory, aquatics, groundcover, boulders and epiphytes keep their
  authored values, so this moves the tree ladder alone;
* every spatial parameter is untouched — `patchiness`, `glade_response`, the
  ~90 m glade and ~190 m stand wavelengths, clump size and radius — so each
  region's variance stays a *fraction* of its new mean. A region that halves
  gets half as many clumps of the same size, not the same clumps thinned out
  into a smooth field;
* re-basing again is one number per row.

Attenuation (authored → delivered, after the altitude band, slope and depth
gates, clearance rejection and `composition.py`'s cluster division) is measured
for **all fourteen classes**, including 3, 4, 5, 9 and 10 that the earlier
dominant-chunk audit could not see: the per-pixel measure needs no chunk to be
dominated by a class to count its instances.

**Assumption, stated because it is a soft edge:** delivery is treated as
linear in the authored count. It is not quite — clearance rejection eases as
density falls, so classes cut hard (7, 14, 4, 6) will land a little *above*
target. The gate's ±0.15 ratio tolerance absorbs that; if the rollout lands
outside it, re-fit `MEASURED_ATTENUATION` from the new bundles and re-run the
generator. Classes 3, 4, 5 and 10 hold 0.4–17 ha of province each, so their
measurement is real but thin; they carry a ±0.35 tolerance.

## asset/ha is not stem/ha

`tropical-vegetation-ecology-targets.md` §7.1 asks for 180–240 canopy assets/ha
in jungle interior; we deliver 39. That is not a shortfall of 5×. The doc now
says so explicitly. Our shipped canopy is **wide-crown composites, each
standing for several real stems** — the round-7 Anvil composite is a 42 m tree
carrying a 33.8 m crown, closing what fifteen of round 5's trees closed. The
conversion is roughly **1 shipped asset ≈ 5 botanical stems** at the jungle
roof. Beyond that the browser, not botany, is the limit, which
`vegetation-density-design.md` already said.

Canopy **closure** is not gated. That is a recorded gap rather than an
oversight: crown diameter is not a field that `palettes.json` carries, so
closure cannot be computed from the shipped record. Asserting it from stem
counts would be a standard-12 claim that the typed fields cannot deliver.
Backlog row: "vegetation crown diameters".

## Groundcover gets a region axis

`groundcover.json` was keyed by land cover alone, so the tidal delta, the
interior swamp and the mangrove coast got literally identical grass wherever
they shared a cover id. `vurt_reeds` carried MARSH_GRASS, SWAMP_GRASS and SCUM,
so every reed bed in Black Marsh was the same plant. Schema v2 adds
`byRegionClass[region].swaps[cover]`, which **replaces** the base list for one
cover in one region. LTEX.GNAM's cap of three grasses is per painted *texture*,
so it limits how many species share a cover and does not constrain the same
cover carrying different species in different regions: the swap layer fits
inside the shipped-game rule rather than bending it.

`regionCovers` records which covers each region class actually paints, measured
from the shipped `ground-control.png` against `hydro-regions.png`. A swap for a
cover that a region does not paint is dead data, so the gate rejects it.

The runtime (`Groundcover.tsx`) now loads `hydro-regions.png` and decodes it by
the legend `hydrology-meta.json` ships — read, never duplicated, so a legend
change cannot split the compiler's world from the runtime's. Until it resolves
the ring places from the unswapped base table, so a cold load shows grass that
changes species rather than ground that starts bare.

## Understory breadth: what was done and what is blocked

Every region class now carries at least six distinct understory species, up
from a low of **one** in the border mountains, using meshes already in the
built flora kit. What could NOT be done here is region-*exclusive* understory:
the flora kit ships 81 assets and the palettes already use 78 of them; the
three spare are trees. Nine classes therefore still have no understory species
of their own.

That is a **sourcing job with a named blocker, not a holding position**: the
held stock the registries carry (four unused reed sizes, twelve bracken
variants, three shrub colour variants, a second lilypad, seaweeds, kelps, swamp
fungi) needs `flora-province-v1.glb` rebuilt through Wine + Blender with a
reviewed `placement` policy per asset, which is a pipeline run that must be
sequenced with the scatter rollout. Species list, evidence and the exact steps
are in the sourcing log.

## The gates (this is the part that stops the drift)

Nothing checked the ladder, which is why it drifted. `worldgen/test_scatter.py`
checks variance *within* a landscape and not the ordering *between* regions;
no test under `worldgen/` read `palettes.json` at all. Three gates now do, in
`worldgen/test_vegetation_ladder.py`, wired into `npm run test:placement`:

1. **Authored ladder** — the ratio table and the ordering, on the authored
   palettes put through the measured attenuation. It runs without the bundles.
2. **Delivered ladder** — decodes the shipped `chunk_*_vegetation.bin`. **Red
   until the scatter rollout runs**, deliberately: the ladder was allowed to
   drift because nothing measured what actually ships.
3. **Breadth** — minimum understory species per region, no species owning more
   than 60% of a region's understory, the groundcover region axis (cap of
   three per cover, at most two covers per mesh per region, no dead swaps),
   plus every palette and groundcover species present in the kit that has to
   render it.

Each was mutation-tested and each went red on its own defect; gate 2 goes green
when the targets are set to what the bundles carry, so it measures rather than
always failing. `report_flora_variety.py` no longer filters the aquatics out of
its variety view — that filter is why a reed monoculture across eleven of
fourteen palettes did not show up in the report we had.

## Round 12 (2026-09-09): exclusive understory species

Round 11 lifted every region to six understory species, but every species was
shared with another region: the kit was full at 81 assets against 78 placed.
The deferral said several candidates had no measured `sizeM`, so the policies
could not be written until the build that measures them ran. That circularity
resolves as soon as the build is run. The build has now been run.
`flora-province-v1` is **108 assets**: 27 meshes were added and eight
rejected on their measured geometry. Sizes, tri counts and the rejection
reasons are in the sourcing log.

**The standard.** Every region class now carries at least **two** understory
species that no region class it physically borders carries. The assignment
lives in one place, `build_palettes.EXCLUSIVE_UNDERSTORY`, so the next agent
can change it without hunting through fourteen region tables.

**Adjacency is measured, not asserted.** `vegetation_ladder.region_adjacency()`
counts shared 4-neighbour cells on the shipped region raster and calls a pair
adjacent at 250 shared edges or more. A hand-written neighbour table would go
stale the next time the regions are re-rastered. The gate would then stop
testing anything. Two species are shared between classes that do not border
each other: region 5's tall waterweed also stands in region 14. Exclusivity
is measured against neighbours, since that is what a player crossing a
boundary sees, rather than against the whole province.

One class is a special case. The raised hammock (region 10) is small enough
that it shares no boundary with any other class above the 250-edge threshold,
so the gate cannot bind on it. It was given two species of its own anyway.

**New gate.** `test_each_region_has_exclusive_understory`. Mutation-tested:
giving region 8's two reed beds to its neighbour region 11 turns it red with
`{'8': []}`. Taking them back turns it green again.

**The density ladder did not move.** Understory is not a stem layer, so
`rebase_stems` never sees it: `authoredStemsPerHectare` and
`ladderMultiplierApplied` are byte-identical for all fourteen classes before
and after, region 13 included. The three ladder tests still pass; gate 2
(`test_delivered_ladder`) remains red pending the scatter rollout, as designed.

