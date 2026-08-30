# 0036 — Phase 10 placement decisions

> ## RUN-BOOK — start here if you are continuing Phase 10
>
> Read this box, then [00-core](../world/00-core.md), then come back. The rest
> of this record is *why*; this is *where things are*.
>
> ### You are here
>
> The vegetation pipeline works end to end and is **deployed**: mining →
> asset registry → kit builder (NIF→GLB) → scatter compiler → instanced
> renderer in the studio. The owner has seen it and is giving feedback on how
> it *looks*. Five areas have plants; the rest of the province is bare on
> purpose (exemplar-first, module 95 §85.4).
>
> ### The loop you will be running
>
> ```bash
> # 1. change palettes/densities/species: edit worldgen/build_palettes.py
> #    (the GENERATOR — palettes.json is its output since round 2; the
> #    archetypes encode the evidence once), then regenerate:
> python3 -m worldgen.build_palettes
> # 1b. T3 groundcover densities are separate: world/sources/flora/groundcover.json
> #     (runtime ring — no recompile needed, just rebuild/deploy the studio)
> # 2. recompile the five areas' bundles      (from tooling/world-generation)
> CH=""; for c in 5,12 7,9 11,7 3,3 4,10; do cx=${c%,*}; cz=${c#*,}
>   for dx in -1 0 1; do for dz in -1 0 1; do
>     CH="$CH --chunk $((cx+dx)),$((cz+dz))"; done; done; done
> python3 -m worldgen.compile_scatter $CH --report \
>   --out ../../apps/world-studio/public/province/vegetation
>
> # 3. only if the SPECIES LIST changed — rebuild + copy the kit GLB
> #    (from tooling/asset-pipeline; ~70 s, needs the vault)
> python3 -m pipeline.build_kit --kit flora-province-v1
> cp output/kits/flora-province-v1.{glb,kit.json} \
>    ../../apps/world-studio/public/kits/
>
> # 4. check it renders            (from apps/combat-sandbox, ~6 min)
> cd apps/world-studio && npm run build && cd ../combat-sandbox
> node ../world-studio/scripts/probe-vegetation.mjs
>
> # 5. gates, commit, PUSH — the owner playtests the DEPLOYED build
> npm test && npm run typecheck && git push origin main
> ```
>
> **Push, every time.** The first round of owner feedback was "I can't see any
> plants" and the cause was nine committed-but-unpushed commits. Committing is
> not delivering here.
>
> ### Where the owner's feedback lands
>
> Look-feedback usually IS system-feedback here (owner, round 2) — route it
> to the archetype or field that produces the look, not to per-spot tweaks.
> All palette edits go in `worldgen/build_palettes.py`, then regenerate.
>
> | If they say… | Change |
> |---|---|
> | too thin / too thick overall | `densityScale` (generator output), or the archetype densities per region table |
> | one region wrong, others fine | that region's table in `build_palettes.py`; check delivered vs authored in `compile_scatter --report` (per-class + per-species lines) |
> | ground/floor too bare or too busy | `groundcover.json` densities (the T3 ring carries most of the "dense" read — mined rule M5) |
> | too samey / too patchy | archetype `patchiness`/`glade_response`; wavelengths `GLADE_WAVELENGTH_M` (90 m) / `STAND_WAVELENGTH_M` (190 m); treefall-gap band in the canopy archetype |
> | water margins wrong (reeds/lilypads/banks) | the water-posture archetypes (M1) + `shore_m` bands; pool theming is the `guild` mechanism (M3, ~220 m tiles) |
> | rivers too bare / too walled | `RIPARIAN_WET`/`RIPARIAN_DRY` gains (M2) and the `gallery()` ribbons |
> | trees too big / small | archetype `scale_range`; giants are the `role: landmark-giant` layers |
> | wrong plants somewhere | swap species ids — query the registry first, then rebuild the kit (step 3) |
> | can't navigate / can't see landmarks | giant density and `clearance_radius_m`; the design case is in [vegetation-density-design.md](../research/vegetation-density-design.md) §(a) |
> | plants pop/vanish at distance | `maxDrawDistance`/`lodDistances` in `floraKit.ts`; billboard tier is the kit's `_lod_flat` levels |
>
> ### Three traps, all already sprung once
>
> 1. **Never look a kit asset up by its glTF node name.** three.js sanitises
>    node names and strips the slashes out of
>    `bmv__landscape/trees/cypress1`; every lookup misses and the kit renders
>    **empty, with no error anywhere**. Ids travel in glTF `extras`
>    (`export_extras=True` in the kit builder).
> 2. **One instanced mesh per chunk is a draw call per chunk** — 449 for 13
>    chunks. Bucket by (species, LOD) across chunks: 96.
> 3. **`vite preview` runs with `command === "serve"`**, so the build-time
>    base is not applied; probes must pass
>    `--base /elder-souls-argonia/studio/` or every asset 404s and the page
>    just looks blank.
>
> ### Round 2 (2026-08-30) — what changed and what's still open
>
> Owner round-1 feedback (sparse jungle, plants missing on foot, no shadows,
> black distance blobs, no haze) was root-caused as SYSTEM defects; the fix
> set: character-mode mount, aerial-haze/CSM patch chain + instancing-aware
> fog, leaf-shaped shadow depth materials, texture RGB dilation + shader
> mip-alpha boost, **T3 groundcover ring** (`Groundcover.tsx` +
> groundcover-province-v1 kit), **T4 `_lod_flat` billboards + per-species
> draw-distance cull**, the **meso scene layer** in the compiler
> (shore-distance field, altitude/shore/glade bands, signed riparian boost,
> per-tile water guilds), a **double-rolled soft response** fixed in the
> sampler (density under-delivered ~2x), trunk-scale (not crown-scale)
> canopy clearance, and **evidence-based palettes v2 generated by
> `build_palettes.py`** from the three research docs.
>
> Calibration note: the mined CoV target (2.3–3.1) was reinterpreted — it
> came from a 100/ha placed-statics world with a bare-by-omission understory;
> at v2 densities the character comes from STRUCTURED variation (treefall
> gaps, green walls, guild patches, riparian bands), not raw noise. Judge
> variation by eye against those features, not by chasing CoV 3.
>
> Still open, in the order I would take it:
>
> 1. **Wind** — one uniform block owned by the weather system (module 55
>    §98); 8c is closed, so this no longer collides. Remember the shadow
>    depth materials must mirror the vertex bend (research doc §c).
> 2. **Budget measurement** — the dense-vegetation micro-lab (§85.3): v2
>    density × a real GPU / mid device has still never been measured.
> 3. **Tree colliders in character mode** — the kit ships collision capsules;
>    the player currently walks through trunks (10b-adjacent).
> 4. **Scree/gravel ground material** deferred from 6b; settlement/interior
>    mining for Phases 11–12 (same readers, `Plugin.interior_cells`).
>
> Also outstanding: the **scree/gravel ground material** deferred from 6b, and
> the settlement/interior mining for Phases 11–12 (same readers,
> `Plugin.interior_cells`).
>
> ### Blocked, not forgotten
>
> - **The region rebalance is written and tested but NOT applied to the
>   deployed rasters** (wetland 20.6 % → 35.9 % of land). Re-running
>   `compile_hydrology` regenerates the climate rasters the 8c playtest is
>   running against. Full run-book in PROGRESS *Waiting on user*;
>   `worldgen.report_regions` previews it without writing. **Once 8c closes,
>   do this first** — it changes which palette applies where, so density
>   calibration must be re-checked (`compile_scatter --report`) after it.
> - **`Skyrim.esm` is still not in the vault.** Would name ~40 % of the mined
>   references and dimension the 14,974 vanilla registry rows. Owner action,
>   not blocking.

**Date:** 2026-08-30 · **Status:** **accepted** — owner answered Q1–Q4 the
same day; Q5 and Q6 stand on the recommendation. Each question below records
the answer and what was built from it.

Context: the owner asked for the catalogue and the data-file mining first,
then to be involved in "finalising key decisions about actual placement".
The machinery was built and the numbers taken; these were the calls it waited
on.

Evidence behind every number: [the mined placement rules](../research/shipped-world-placement-rules.md),
[the density research](../research/vegetation-density-design.md),
`world/sources/placement/`, `world/sources/assets/`, `world/sources/flora/`.

## Answers at a glance

| | Decision | Built |
|---|---|---|
| Q1 density | **Match the reference — but graded by local geography and varied within each area** | density derives from our own climate fields (13× spread); shared openness field + per-species patchiness at the measured wavelengths |
| Q2 tree scale | **Mostly near-native, plus a few landmark giants** | canopy at 0.5–1.25×; one ×1.8–2.6 giant per 8–16 ha with wide clearance |
| Q3 contrast set | **The proposal *plus* deep rootland marsh** — five areas | recorded below; drives the Phase 10/11 exemplar work |
| Q4 region mix | **Rebalance the map — make more of it marsh** | marsh now follows saturation: wetland 20.6 % → 35.9 % of land. *Code only — not yet applied to the deployed rasters* |
| Q5 groundcover | no answer needed; recommendation stands | bare ground stays bare |
| Q6 `Skyrim.esm` | no answer yet | still an open ask in PROGRESS, still not blocking |

---

## Q1 — How dense should Argonia feel?

The menu as it was put, measured on five representative chunks (a chunk is
468 m square, 21.9 ha). `densityScale` in
`world/sources/flora/palettes.json` is still the single global knob, but the
answer moved the question past it:

| Setting | Instances per chunk (median) | Reads as | Against the references |
|---|---|---|---|
| **×1** (as built at the time) | 806 | sparse — you see between the trees everywhere | below Black Marsh & Valenwood's dressed marsh (~2,190) and below module 65's T2 band |
| **×3** | 2,546 | comparable to the art-directed Black Marsh mod | matches BM&V's dressed median; mid-band for module 65 (1,000–5,000) |
| **×6** | 4,206 | thick — a jungle you push through | top of module 65's band; needs the groundcover ring to be doing real work |
| **×10** | 6,756 | BM&V's *densest* cells everywhere | over the band; the browser-performance question becomes the deciding one |

**ANSWER: match the reference — but it must be local-geography dependent.**
Owner: "Dense jungle areas should of course be much denser than open grass.
Mountain forest should be more dense than a non-forested area. etc. and even
within an area (e.g. within a jungle) there should be sensible variation so
it's not all just samey."

That reframed the question from one multiplier to two properties, and both
are now grounded in the three things the owner named — open-world design
practice, what the reference mod does, and what is realistic for our climate
and hydrology. The full working is
[vegetation-density-design.md](../research/vegetation-density-design.md);
the short version:

- **Graded by geography, from our own fields.** A region's density is
  `850 × humidity² × (0.25 + 0.75 × canopy)` out of `regions.CLIMATE`, so the
  ladder falls out of climate rather than being asserted: rootland deep marsh
  818/ha, jungle 767, interior swamp 627, fringe marsh 327, firm lowland 214,
  upland hills 134, bare mountain 61. A 13× spread, in the owner's order.
- **Varied within a region.** The reference's density varies with a standard
  deviation 2.3–3.1× its mean between neighbouring cells, decorrelating by
  ~60 m and gone by ~200 m. A shared openness field (90 m glades) plus
  per-species patchiness (190 m stands) reproduces that.
- **Calibrated against the source**, on the statistics measured identically
  on both sides: open-space radius p75 21.3 m (mined 21.1), p95 32.3 (31.5).

Honest caveat, unchanged: nothing has been rendered yet. Density is the
biggest unretired performance risk in the project (module 65 §109), and the
sequence is *choose a target → build the renderer → measure → adjust*. Per
chunk we now sit at p95 3,946 and max 5,623 instances, inside module 65's
1,000–5,000 T2 band, which is the first evidence that the target is
affordable.

## Q2 — How big should the trees be?

The source pools are deliberately oversized: BM&V's cypress mesh is 32 m tall
at scale 1, and BM&V themselves placed it at ×2 — a 64 m tree. Trama roots go
in at ×8, giving 13 m root arches. Supersizing is how that mod manufactures a
giant-jungle read, and under the no-new-art rule scale is one of the few free
levers we have.

| Option | What the player sees |
|---|---|
| **A — near native (0.6–0.95 on the big trees)** | 19–30 m cypress. Big real trees; the canopy is high but readable, and a person feels human-sized |
| **B — BM&V's supersizing (×1.5–2.5)** | 48–80 m cypress. Alien, monumental, more "Black Marsh is not Skyrim"; the player is small |
| **C — mixed: native for most, a few hero giants** | ordinary swamp forest with occasional 60 m landmark trees you navigate by |

**ANSWER: C — mostly normal, a few landmark giants.**

Built: the ordinary canopy sits at 0.5–1.25× native (19–30 m cypress), and
each forested region carries a `role: landmark-giant` layer at ×1.8–2.6
(58–83 m on a 32 m cypress), roughly one per 8–16 ha, with a 14 m clearance
stamp so nothing crowds the silhouette and no clearance test of its own so
nothing stops it appearing. The design research is emphatic that a world
without quest markers navigates on distant distinctive silhouettes — Lynch's
landmarks — which is exactly what these are for.

## Q3 — The exemplar and its contrast set

Module 95 §85.4 requires each placement phase to propose its exemplar plus 2–3
contrasting instances **for owner sign-off at phase start**. Proposed:

| Role | Where | Why it is the contrast that matters |
|---|---|---|
| **Exemplar** | the Blackrose basin's interior swamp (retained reference watershed, decision 0008) | the province's core case: cypress canopy, standing water, the waterline density peak |
| **Contrast 1** | tropical jungle (region class 13) | the densest class — where the performance budget is actually decided |
| **Contrast 2** | coastal lagoon / salt marsh (class 4) | the mangrove wall canon puts near Lilmoth; salt tolerance and an aquatic tier the swamp does not have |
| **Contrast 3** | upland hills or border mountains (class 1/2) | the sparse, dry end — proves the system does not only know how to make swamp |
| **Contrast 4** (owner addition) | rootland deep marsh (class 6) | the darkest, most Argonian place in the province — permanent dusk under a root canopy, and now the densest class in the ladder at 818/ha |

**ANSWER: the proposal plus deep rootland marsh — five areas.** The owner
took the contrast rather than the trade: uplands stay in as the dry proof,
and rootland joins as the identity case.

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

**ANSWER: 2 — rebalance the map.**

Built, in `regions.py`: a marsh is low, flat, slow-draining ground that
saturates, not only ground the solve put standing water on. Below 30 m, under
6°, and either within 6 m of the water table or above the topographic wetness
index's pooling threshold. Uplands additionally need drainage (a flat terrace
over a marsh is not a hill) and mountains start at 150 m rather than 40 m.

Result: **wetland classes 20.6 % → 35.9 % of land, dry 72.0 % → 56.0 %**, and
the classes are physically coherent — marsh at 2–4 m elevation and 1.2°, firm
lowland at 20 m and 7.8°, hills at 121 m, mountains at 303 m. The authored
central-jungle polygon had to gain the marsh classes in its
`appliesToClasses`, or the rebalance would have halved the owner's jungle.

What it deliberately does **not** do is flatten the province on paper: 43 %
of the land really is above 30 m and 24 % above 150 m, so a third of it is
genuinely hill and mountain and stays that way. Tests pin both directions.

**Not yet applied to the deployed rasters.** Re-running `compile_hydrology`
also regenerates the climate rasters the 8c playtest is running against, so
the re-run waits until 8c closes — `worldgen.report_regions` measures the
change without writing anything. Once applied, the scatter compile should be
re-run and re-calibrated (`compile_scatter --report`).

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
