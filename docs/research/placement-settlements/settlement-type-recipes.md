# Place-type recipes — the digest

**Phase 11 Part 1 (decision [0041](../../decisions/0041-phase11-settlement-decisions.md)).**
Skimmable companion to the two data artefacts. Read this to understand the
shape; read the data to build against it.

| Artefact | What it is |
|---|---|
| [`world/sources/catalogue/type-recipes.json`](../../../world/sources/catalogue/type-recipes.json) | **Source of truth.** One row per type: five-slot recipe, siting grammar, magnitude, culture, danger, era, asset plan, complexity, count band. |
| [`world/sources/catalogue/taxonomy.json`](../../../world/sources/catalogue/taxonomy.json) | **Derived.** class → family → type → variants; what the catalogue validator resolves against. |
| `worldgen/test_type_recipes.py` | Keeps them in sync and holds the invariants below. Runs in `npm test`. |

**Never hand-edit `taxonomy.json`.** It is generated from the recipes; the test
fails if they drift.

## Size

**10 classes · 63 families · 349 types · 636 variants.**

| Class | Families | Types | What it covers |
|---|--:|--:|---|
| `works` | 9 | 56 | aquaculture, cultivation, extraction, craft, provision, illicit, labour, market, storage-and-freight |
| `settlement` | 9 | 56 | major cities, free port, tribal / water / dry villages, mixed, imperial, outcast, homestead |
| `civic` | 10 | 46 | law, governance, learning, healing, childhood, festivity, waste, refuge, quarter, **magic** |
| `sacred` | 6 | 35 | Hist, Sithis, the dead, foreign faith, rite, wonder |
| `ruin` | 6 | 33 | xanmeer, Ayleid, lost peoples, imperial, depopulated, daedric works |
| `lair` | 5 | 33 | beast lairs, hazard ground, harvest nodes, root system, open water |
| `transit` | 6 | 26 | crossing, landing, road, root transit, elevated, submerged way |
| `lone` | 4 | 23 | lone dwellings, remnants, monuments, curiosities |
| `martial` | 4 | 21 | watch, strength, imperial military, carceral |
| `camp` | 4 | 20 | hostile, civil, displaced, expedition |

## `recordScope` — the field that makes the count arithmetic honest

Not every type is a map dot. Three scopes:

- **`poi` (236 types)** — its own catalogue record. **Only these count toward
  the province total.** Band sum: **637–733**, inside the scour's 600–740 for
  33.52 km² of authored land.
- **`district` (58)** — authored *inside* a parent settlement's blueprint (a
  weaving house, an uxith, a slum quarter). No separate record.
- **`dressing` (55)** — placed in quantity by the compiler from a density rule
  (caches, boundary totems, grave-stakes, hazard pools, waymarks). No
  individual record.

Getting this wrong is how a taxonomy "proves" it needs 2,800 places. The first
draft did exactly that.

## The five-slot recipe

Every type carries all five slots from
[openworld-place-distribution-and-siting.md](openworld-place-distribution-and-siting.md)
§3.1, stated as *deltas* from the baseline: ① long-range cue ② small population
with one elevated/ranged member ③ domestic props that narrate ④ free reward +
gated reward ⑤ optional satellite node 200–400 m.

**The cue slot is the one the province changes.** The scour found *no long
sightlines below the mountain rim* — median site sees 18 % of its 1.2 km
surroundings, nothing 12 m tall reads at 1.4 km. So Skyrim's "silhouette on the
horizon" does not work here, and cues are written to be one of:

- **tall** — canopy-breaking Hist crowns and xanmeer terraces (the two premier
  landmark strategies);
- **close** — short-range reveals, and the type where the reveal *is* the beat
  (`broken-xanmeer` subsumed variant has no cue at all until you are inside it);
- **lit** — beacon platforms, bioluminescent water, a hearth-house door;
- **audible** — chime frames, frog-pond farms, whitewater, a bird colony at
  dusk. Sound is a first-class wayfinding channel in this province, not flavour.

Some cues are deliberately an **absence**: no smoke where a village clearly is
(`nightbound-village`), no bodies where a massacre should be
(`umbriel-stripped-village`), a gap in a mangrove wall.

## Siting grammar

`landformClasses` are terrain-scour classes plus three pseudo-classes
(`any-firm-ground`, `any-shallow-marsh`, `any-channel-bank`) for types that need
ordinary ground. **They are ranked preferences, not requirements.**

**Scarcity budget — bind this in Part 3.** The province has **6 enclosed
clearings and 11 sinkholes**. 81 types list `enclosed-clearing` and 44 list
`sinkhole`; most also list a common fallback, but 12 and 23 respectively do
*not*. Those must either be authored into terrain-adjacent form, spent
deliberately, or transformed into a related type — never force-fitted. Same
caution for `natural-harbour` (13) and `river-mouth` (17), which the port types
genuinely need.

## Coverage across the breadth axes

| Axis | Spread |
|---|---|
| **Region class** | interior swamp 204 · fringe marsh 195 · firm lowland 170 · upland hills 137 · tropical jungle 134 · rootland 110 · seasonal floodplain 102 · tidal delta 88 · coastal lagoon 84 · mangrove 65 · lake 50 · raised hammock 48 · deep river corridor 45 · border mountains 42 · ocean 25 |
| **Region-*distinctive*** (types sited in ≤3 region classes — the anti-sameyness metric) | tropical jungle 20 · interior swamp 19 · firm lowland 17 · rootland 14 · upland hills 12 · seasonal floodplain 11 · coastal lagoon 10 · fringe marsh 10 · tidal delta 9 · border mountains 4 · mangrove 4 · ocean 4 · deep river corridor 3 · lake 2 · raised hammock 2 |
| **Danger** | D0 45 · D1 159 · D2 275 · D3 246 · D4 125 · D5 23 |
| **Era** | current 306 · imperial 89 · merethic 20 · post-umbriel 18 · ayleid 13 · lost-peoples 12 · knahaten-flu 7 · morrowind-invasion 2 · oblivion-crisis 1 · second-empire 1 · duskfall 1 |
| **Culture** | argonian 321 · imperial 147 · lost-peoples 6 · dunmer 2 · nord 2 · khajiit 1 · altmer 1 |
| **Traversal gate** | walk 333 · boat 275 · social 103 · climb 96 · swim 77 · combat 41 · stealth 40 · dive 37 · fastTransit 17 |
| **Status** | active 292 · abandoned 115 · ruined 64 · seasonal 37 · contested 17 · drowned 10 · reoccupied 8 · rebuilt 4 · under-construction 1 |
| **Season** | all 313 · varies 32 · wet 2 · dry 2 |
| **Complexity** | trivial 137 · simple 113 · standard 71 · complex 10 |
| **Magnitude** (settlement scale only; `null` means *not a settlement*) | M1 172 · null 110 · M2 33 · M3 19 · M5 8 · M4 7 |

Region and danger counts are *type applicability*, not instance counts —
density is non-uniform by causal gradient and is Part 3's job, not this file's.

## Assets

Asset plans reference the inventory families
([settlement-asset-inventory.md](settlement-asset-inventory.md), schemaVersion 3).

- **The `darkwater` pool is withdrawn** for licence reasons and is mechanically
  forbidden — a test fails if it ever appears in an asset plan.
- **Two permanent no-Nexus-answer gaps** are written around rather than waited on:
  - `grave-stakes` (18 types) — staked-dead fields build from **cairns, totems
    and stockade pikes**. It touches the province's signature diegetic system,
    so it is the gap most worth revisiting if a source ever appears.
  - `working-props` (7 types) — there are no bespoke industrial props, so
    **works sites are distinguished by layout and dressing, never machinery**.
    Several recipes lean into this deliberately: `derelict-works` is a type
    whose whole content is that its layout alone tells you what it was.

## Completeness critic — three passes

Adversarial Opus subagents whose only brief was naming absences. **The rule was
to iterate until a pass returns little.** Round 2 did *not*, so round 3 ran.

**Round 1 → 44 types, 7 families.** The root layer had no *interior* type, only
doors — `root-hollow-gallery` is now the province's cave answer in a landscape
with almost no rock. There was no market, no storage, no freight and no currency
exchange. Outside cities there was almost no D0 ground (`hearth-house` makes the
canon "a comer cannot be refused" obligation the pacing floor). Ocean and diving
were ruin-only, so sailing had nowhere to sail. Old age, disability, memory,
teaching, sport, vice and the plain domestic register were all absent. Fully
dossiered peoples and institutions had zero sites — the Shadowscales in their
final year, the Naga as a people rather than a spawn table, the Thalmor, the
urban underclass.

**Round 2 → 18 types, 1 family, five vocabulary fixes.** Two findings were
serious enough to justify a third round rather than a note:

- **Magic had no place in the world at all.** Zero types, in a province whose
  dossier makes magic a *folk literacy* and names **vastei** as the game's
  progression currency. A new `civic/magic` family now carries
  `sign-readers-ground` (the folk practice, and the world-side anchor for the
  stats workstream), `enchanters-bench` (which terminates the crystal and
  charged-bone supply chain that already existed with nowhere to go), and the
  `synod-outstation` / `whispers-house` pair for the two bodies that inherited
  the Mages Guild.
- **Five region classes had no types that were distinctively theirs**, so they
  would have derived as generic swamp. Measured as *types sited in ≤3 region
  classes*: raised hammock had **0**, deep river corridor 1, lake 1, border
  mountains 2, ocean 3. Now 2 / 3 / 2 / 4 / 4, via anchors only those regions
  can host — `hammock-crown-terrace` (the dead go *up* where the ground floods),
  `dry-season-herd-ground`, `gorge-wall-dwelling`, `head-of-navigation`,
  `drawdown-flat`, `snowline-hermitage`, `smugglers-ledge`, `sea-stack`.
- **The M4 rung was 3 types** against 19 M3 and 8 M5, so the province would read
  as villages-then-capitals with no middle — exactly where Morrowind's texture
  lives. Added `shrine-town`, `works-town`, `garrison-town`,
  `inland-market-town` (M4 now 7).
- **`tradehouse`** — free and communal shelter was thoroughly covered; *paid*
  lodging, the standard rest/rumour/contract hub, was not.
- **Vocabulary**: `oblivion-crisis` added as an era value (`oblivion-gate-scar`
  had been mis-tagged `imperial`, making the 4E 5–7 stratum unqueryable);
  `reoccupied` and `rebuilt` added as statuses, since "someone else moved in" is
  the province's single most characteristic condition and had been trapped in
  unqueryable variant names; `altmer`, `nord` and `lost-peoples` added as
  cultures (the five vanished peoples' ruins had been inheriting `imperial`,
  which is wrong for all of them); a **`season`** field added, because 37 types
  said `seasonal` without saying *which* season; and `magnitude` documented as
  **settlement-scale only** — `null` means "not a settlement", not "unset".

**What the final pass still flags** (recorded, not fixed — Part 3 and Phase
12/13 concerns, not taxonomy gaps):

1. **Thin era tails are now vocabulary-complete but content-thin**:
   `oblivion-crisis`, `second-empire` and `duskfall` have one type each,
   `morrowind-invasion` two. They can be *queried* now, but if the
   region-derivation agents do not use them, those strata vanish from the built
   world. Watch them explicitly in the Part 4 review.
2. **`ocean` (25) and `border mountains` (42) remain the thinnest region
   classes** even after their anchors. Partly honest — few people live there —
   but Part 3 should check they do not read as empty backdrop.
3. **D5 is 23 types** and several are `dressing` scope, so genuine endgame
   *destinations* number roughly a dozen. Adequate for a fixed-danger province;
   the band with least slack.
4. **`under-construction` has one user.** In a province whose villages are
   "built to be replaced", Part 3 should apply that status to ordinary villages
   rather than leaving it to `domestic-compound` alone.
5. **`fastTransit` (17) is still the thinnest traversal gate** — defensible,
   since the province is deliberately slow, but it is the mode a province-scale
   world leans on hardest.
6. **Traversal is a mode list, not a gate model.** It says *how* you move, never
   *what closes the way* (season, tide, toll, permit, carried equipment). The
   gate semantics live in `rewardGated` prose only. This is the one structural
   critique left unaddressed: it is a schema change that should be made
   **with** the route compiler and the quest condition vocabulary, not
   unilaterally here.

## Notes for the region-derivation agents

1. **Only `recordScope: "poi"` types get catalogue records.** Districts belong
   to a parent settlement's blueprint; dressing is a compiler density rule. If
   you write a record for a boundary totem you have misread the schema.
2. **Count bands are province-wide totals, not per-region quotas.** Distribute
   them on the causal gradient (thick around settlement, road, river and
   resource; thin in the deep wilds, meaningfully so). Do not divide by region
   count.
3. **76 poi types have a band topping out at 2, and 8 are exactly 1.** Those
   are the province's singular places — the eight majors, the Refuge, the
   unbuilt museum, the drifting village, Murkwood. They are not fill; plot them
   in the first tier.
4. **Three types are authored as "two locations plus an absent state"** —
   `drifting-village`, `murkwood-verge`, and to a lesser extent
   `rebuilt-elsewhere-footprint`. No moving geometry; the empty mooring is as
   much a POI as the full one.
5. **Respect the scarcity budget above** before allocating any type that wants
   an enclosed clearing, a sinkhole or a natural harbour.
6. **Every type already carries its `lore` citation.** When you write a place's
   `why`, extend that citation — don't invent a new justification alongside it.
7. **`approachDanger` is separate from `dangerTiers`** for a reason: a D0 city
   reached across D5 ground is a deliberate shape, and several majors are
   written that way.

## Reconciliation log (Phase 11 Part 2, 2026-09-02)

The eight region derivations were reconciled against these recipes after the
fact. Bands widened (each row carries its own `countBandNote` in
`type-recipes.json`): `stone-calendar` 1→2, `quarantine-village` 1→3,
`tunnel-rat-gallery` 1→2, `heretic-stone-village` 1→2, `drifting-village` 1→2.
One retype: **Alten Meerhleel**, `neutral-free-port` → `port-town`
(Alten Corimont is canon's named freehold and keeps the singular type).

The province's POI band sum is now **637–739** against the scour's 600–740
envelope. **There is one place left at the top.** Any further widening must be
paid for by narrowing another band — say so in the same commit.

### Singular types filled

| Type | Record | Region |
|---|---|---|
| `port-town` | Alten Meerhleel (retype) | mercantile-coast |
| `pilgrim-trial-village` | Hissmir | dunmer-north |
| `lamia-cavern` | The Singing Under-Water (Loriasel caverns) | dunmer-north |
| `leviathan-bone-field` | The Nine Ribs (Deepmire) | naga-kur-deeps |
| `waiting-vigil-settlement` | Still-Waiting | hist-heartland |
| `orma-tactile-ruin` | The Hand-Read Halls | imperial-fringe |
| `collapsing-pinnacle` ×2 | The Ripple Spire; The Bad Stack | hist-heartland; pirate-freeholds |

### Consciously under-filled (not cut — no record forced)

- **`port-town` sits at 1 of its band's 2.** The second was not authored: every
  honest candidate on the coast is already a record of another type (Portdun
  Mont is a cliff-shelf pilot village; the estuary and quay rows are districts),
  and inventing a second two-culture port to satisfy a band is exactly the
  force-fit the "collect the homeless" rule forbids. Leave the slot for Part 3
  to fill *if* the plot turns up a harbour with no owner.
- **`festival-ground` (band 4) and `dry-season-herd-ground` (band 3–4) have no
  records at all** — both are unclaimed by every region agent. They are cheap,
  seasonal and genuinely wanted (the calendar *is* a festival schedule; the
  flood cycle *is* the ecological engine), so they are flagged for the critique
  pass as a real coverage gap, not cut.
