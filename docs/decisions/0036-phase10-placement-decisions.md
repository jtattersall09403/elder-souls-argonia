# 0036 — Phase 10 placement decisions (proposed — awaiting owner)

**Date:** 2026-08-30 · **Status:** **PROPOSED — six questions for the owner.**
Everything below is measured; the *choices* are the owner's. This record
becomes `accepted` with the answers written in.

Context: the owner asked for the catalogue and the data-file mining first,
then to be involved in "finalising key decisions about actual placement".
The machinery is built and the numbers are in; these are the calls that
machinery is waiting on.

Evidence behind every number: [the mined placement rules](../research/shipped-world-placement-rules.md),
`world/sources/placement/`, `world/sources/assets/`, `world/sources/flora/`.

---

## Q1 — How dense should Argonia feel?

**One knob** (`densityScale` in `world/sources/flora/palettes.json`) multiplies
every species. Measured on five representative chunks (a chunk is 468 m square,
21.9 ha):

| Setting | Instances per chunk (median) | Reads as | Against the references |
|---|---|---|---|
| **×1** (current) | 806 | sparse — you see between the trees everywhere | below Black Marsh & Valenwood's dressed marsh (~2,190) and below module 65's T2 band |
| **×3** | 2,546 | comparable to the art-directed Black Marsh mod | matches BM&V's dressed median; mid-band for module 65 (1,000–5,000) |
| **×6** | 4,206 | thick — a jungle you push through | top of module 65's band; needs the groundcover ring to be doing real work |
| **×10** | 6,756 | BM&V's *densest* cells everywhere | over the band; the browser-performance question becomes the deciding one |

Recommendation: **×3 as the province default**, with the jungle and deep-marsh
classes free to go higher locally. It is the only setting with an external
reference behind it, and it leaves headroom to push up after the first
performance measurement rather than having to climb down.

Note the honest caveat: nothing here has been rendered yet. Density is the
biggest unretired performance risk in the project (module 65 §109), and the
right sequence is *choose a target → build the renderer → measure → adjust*.

## Q2 — How big should the trees be?

The source pools are deliberately oversized: BM&V's cypress mesh is 32 m tall
at scale 1, and BM&V themselves placed it at ×2 — a 64 m tree. Trama roots go
in at ×8, giving 13 m root arches. Supersizing is how that mod manufactures a
giant-jungle read, and under the no-new-art rule scale is one of the few free
levers we have.

| Option | What the player sees |
|---|---|
| **A — near native (current: 0.6–0.95 on the big trees)** | 19–30 m cypress. Big real trees; the canopy is high but readable, and a person feels human-sized |
| **B — BM&V's supersizing (×1.5–2.5)** | 48–80 m cypress. Alien, monumental, more "Black Marsh is not Skyrim"; the player is small |
| **C — mixed: native for most, a few hero giants** | ordinary swamp forest with occasional 60 m landmark trees you navigate by |

Recommendation: **C**. It gets B's identity where it counts, keeps A's
readability everywhere else, and landmark trees are genuinely useful for
navigation in a province with no minimap culture.

## Q3 — The exemplar and its contrast set

Module 95 §85.4 requires each placement phase to propose its exemplar plus 2–3
contrasting instances **for owner sign-off at phase start**. Proposed:

| Role | Where | Why it is the contrast that matters |
|---|---|---|
| **Exemplar** | the Blackrose basin's interior swamp (retained reference watershed, decision 0008) | the province's core case: cypress canopy, standing water, the waterline density peak |
| **Contrast 1** | tropical jungle (region class 13) | the densest class — where the performance budget is actually decided |
| **Contrast 2** | coastal lagoon / salt marsh (class 4) | the mangrove wall canon puts near Lilmoth; salt tolerance and an aquatic tier the swamp does not have |
| **Contrast 3** | upland hills or border mountains (class 1/2) | the sparse, dry end — proves the system does not only know how to make swamp |

## Q4 — What the region map says the province is

The scatter compiler needed region areas and produced this, which is worth a
decision in its own right. Of the province's **non-ocean** area:

| | Share of land |
|---|---|
| firm lowland | 31.6 % |
| border mountains | 26.8 % |
| upland hills | 13.6 % |
| **all marsh/wetland classes together** (tidal delta, salt marsh, deep river, rootland, interior swamp, fringe marsh, floodplain, lake) | **20.3 %** |
| tropical jungle | 7.4 % |

So by the region classing, **Black Marsh is 72 % dry ground and mountain and
20 % marsh**. Canon has the province as an enormous swamp with temperate
grassland only in the north-east.

Three ways to read it, and the owner's call which:

1. **It is fine** — "firm lowland" is the drier ground *between* waterways and
   still plays as swamp-forest once it is dressed. The flora palettes already
   give it bamboo, bracken and jungle trees, so the *look* can be marsh even
   where the class is not. Cheapest option; nothing to redo.
2. **Rebalance the classifier** — retune the Phase 3 region thresholds so more
   of the lowland classes as fringe marsh / interior swamp. Touches an
   owner-approved gate and re-runs downstream compiles, but it is data, not
   geometry: the terrain does not change.
3. **Leave it and decide per region packet** in Phase 15, when each area is
   authored anyway.

Recommendation: **1 now, revisit at the first packet review** — this is a
question about how the world *reads*, and it cannot honestly be settled from
numbers before anything has been rendered.

## Q5 — Groundcover: sparse-and-legible or wall-to-wall?

Bethesda binds grass to painted ground and never allows more than three species
per ground type; 20 of the 47 mined ground textures allow **no grass at all**
(mined rule R10). `world/sources/flora/groundcover.json` follows that: mud,
silt, rock, roads and seabed are bare, and only 13 of our 37 ground materials
carry grass.

The choice is what "dense" means in the ring: our provisional densities give
6,000–9,000 grass instances per hectare in jungle and marsh grass, against
Bethesda's own ladder (marsh grass 2× forest grass, 12× tundra grass).

Recommendation: **keep bare ground bare**. A reed bed only reads as a reed bed
if the mud beside it is mud. This one is cheap to change later — it is a
runtime ring, not baked data.

## Q6 — Vanilla `Skyrim.esm`

Not a design decision, a five-minute unblock. 41 % of the mined references
point into `Skyrim.esm`, which is not in the vault (only the three BSAs are).
Supplying it names those references, gives the 14,974 vanilla registry rows
their dimensions and editor ids, and settles whether Bethesda's region object
tables are used at all. The command is in PROGRESS; it needs the owner's Steam
login and nothing else. **Not blocking** — the phase proceeded without it.

---

## What is already built and not in question

- the plugin readers, the mining, the 27,929-row asset registry, the kit
  builder (NIF → runtime GLB with LODs, collision proxies and alpha modes),
  the scatter compiler and its probes — all tested and committed;
- the canon flora list is fully sourced: cypress, mangrove, bamboo, sleeping
  palms, palm, bog willow, flint vine, somnalius fern, blue moss canopies and
  the rest all have assets in the permitted pools, and all 40 species in the
  provisional palettes convert cleanly with textures;
- the Xanmeer kit's grid is measured (256 units = 3.64 m, 4.32 m corridors).

## What is deliberately not built yet, and why

The **renderer tiers** (T1 batched heroes, T2 instanced mid detail, T3
groundcover ring, T4 impostors) and the **dense-vegetation micro-lab budget
probe**. Both need to be looked at to be judged, and both consume the answers
above — building them first would mean building them twice.
