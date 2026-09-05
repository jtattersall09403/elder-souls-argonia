# Phase 11 Part 5 — exemplar proposal (for the owner to pick, 2026-09-04)

> **DECIDED 2026-09-04 (owner ruling + agent pick): superseded.** The owner
> ruled that exemplars must sit inside the areas Phase 10 already vegetated,
> so one area carries every system before rollout. Alten Corimont is not in
> a vegetated chunk. The set chosen is **Lilmoth** (city), **Nine-Trunks**,
> **Mazzatun**, **The Standing Charge** and **The Licensed Stage** — record
> and reasons in [decision 0041 § Part 5 decision](../../decisions/0041-phase11-settlement-decisions.md).
> The tables below are kept as the reasoning trail only.

Decision 0041 Part 5: propose **one city plus a few contrasting places**
spanning scale, culture, region class, danger and kit, including at least one
small type, because most of the province is small. The owner approves the set;
Part 6 (meso: exact ground, high-level layout, specific assets) starts on the
approved exemplars only. Nothing below is built yet, so any swap is free.

Selection rules used: every kit the exemplar needs is already packaged
(`tooling/asset-pipeline/pipeline/config/kits/`); each exemplar exercises a
system the others do not; together they touch six of the eight regions, four
region classes, D1–D5, wet and dry, root/stilt/stone/timber.

## The city — two viable choices, one recommended

| | **Alten Corimont** (recommended) | Helstrom |
|---|---|---|
| id | `place.pirate-freeholds.alten-corimont` | `place.hist-heartland.helstrom` |
| why | The opening city: the player's first two hours happen here, so its ground, docks, market and the ring of places around it (`docs/research/quests-and-cast/opening-hours-and-start-area.md`) are what a first playtest judges. Firm lowland, D1, timber + docks + keeled boats — the most mature kits we own. Cheap to iterate. | The most distinctive city in the plan (grown root city, no wall, canopy fortification) and the main-quest hub. But `settlement-root-v1` is new and untested at city scale, and the "root as floor and stair" composition is exactly the kind of geometry question Part 6 must answer before a whole city depends on it. |
| risk | Least distinctive; proves the pipeline, not the identity. | Highest reward, highest chance of a long Part 7 loop before anything is walkable. |

Recommendation: Alten Corimont first; Helstrom as the second city once the
root kit has proved itself on the small root exemplar below.

## The contrasting places (five; drop to four if you want a shorter Part 6)

| # | place | type · scale | region class · danger | what it proves |
|---|---|---|---|---|
| 1 | **Nine Bends** `place.pirate-freeholds.upriver-hist-village` | Hist village, M3 | firm lowland · D2 | A Hist tree with a village round it (the MQ01 stakes), bamboo-hut + walkway kit, wary stance, one enterable building. The commonest settlement family in the province (27 tribal villages). Close to the city, so the two are one playtest. |
| 2 | **Keel-Sakka Landing** `place.mercantile-coast.keel-sakka-stilts` | stilt village on water, M3 | mangrove forest · D1 | Stilts, platforms and boat access over real water: the waterway network as identity, the BM&V stilt house, docks. Contrast with Nine Bends (same scale, wet vs dry, coast vs river). |
| 3 | **The Charged Pond** `place.hist-heartland.wamasu-pond-nest` | beast lair, delve | rootland deep marsh · D5 | A creature-owned place with an electrified pond: the deep interior's fixed high danger, a rigged creature (wamasu, sourced), an interior delve, and the first root-kit dressing at small scale. The province's largest family is beast lairs (38). |
| 4 | **The Standing Corner** `place.saxhleel-coast.lagoon-submerged-xanmeer` | submerged xanmeer, complex | tropical jungle · D4 | Stone tileset, a tower top above still water and terraces below it: the underwater exemplar Phase 9's swim slice needs (submerged scatter band, wreck/ruin statics), and MQ16's dive. |
| 5 | **Fort Swampmoth** `place.imperial-fringe.fort-swampmoth` | occupied fort, M2 | upland hills · D2 | The Imperial keep kit in use by Argonians (a canon fact), a guarded stance with typed flips, hill ground: the slope problem (0041 "Slopes and uneven ground") on a stone kit. |

Also considered and held back: The Chimney (`freehold-smithy`, works-v1
props — better folded into Alten Corimont's meso than run alone); The Broke
Column (a road ambush — Phase 13's encounter work, not settlement grain);
Hutan-Tzel (a second Hist village, duplicates #1); Thorn's Dunmer quarter
(owner ruling 2026-09-04: keep the Hlaalu kit; a later packet).

## What Part 6 does with the approved set

Per exemplar, in order: site dossier over the plotted neighbourhood; 2–3 exact
candidate sitings on real terrain; the high-level design (districts, layout
intent, signature feature, specific asset picks from the kit, judged on
geometry not labels); a rendered blueprint for the owner before anything is
compiled. The catalogue records stay the source of truth; Part 6 writes
`world/sources/blueprints/<id>.json`.
