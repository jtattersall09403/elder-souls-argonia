# Design index (pointers to every source a place design is grounded in)

One row per source: where it is, the rule ids or section, the one line
the designer needs, when it applies (type, culture, skill step), and
whether it binds. **B** = binding (decision, binding module, owner
ruling, the record); **P** = prior (research, evidence, mined data: it
informs, the rule decides). Pointers only: read the source for the rule
itself. Built from `tooling/.reports/16k/orient-grounding-audit.md` §1
(2026-09-25); a new source gets a row in the same change that makes it
matter.

## Rules, rulings and procedure

| Source | Section / ids | The one line | Applies | B/P |
|---|---|---|---|---|
| `docs/world/97-placement-principles.md` | Part A (A1 :43, A6 :118-134, A7 :167, A8 :177, A9 :188, A11 :204, A12 :210) | a place has a site and situation reason, an extent that clears its neighbours, a danger band within ±1 of its ground, and a network role where the role exists | every type; step 0 | B |
| world 97 | Part B (B1 :220, B2 :225, B3 :237, B4 :247, B5 :261, B6 :268) | no design before a dossier; measured candidates; the slope ladder in metres (0.15 / 0.6 / 2.0 m); the flood line decides the section; dock depth per hull; the approach before geometry | every type; steps 0-1 | B |
| world 97 | Part C (C1-C15, C-stitch :541) | one kit set per district; one spine; centroid spacing ≥ 8 m; density and use mix bands; orientation reasons; doors on ways; cultural enclosure; graded clearance; every deck has its stair; the Hist is never moved | every type; steps 1-4 | B |
| world 97 | C12 :498 | superseded for placement by 0100 decision 5: dressing is authored in the layout | - | B (retired) |
| world 97 | Part D (D1-D11 :584-662) | two approaches for M3+, a first-seen object taller than the canopy, a spanned threshold, the door visible from the way, combat spaces for M3+ | every type; step 1 § Approach | B |
| world 97 | Part E (E1 :666, E1b :672, E4 :701, E5 :707, E6 :719, E9 :732) | layers integrate; use the pool's breadth; sourcing gaps are jobs; interiors come from the mod's links; every placed thing has an id and a why; the macro promises are the requirements | every type; steps 1-2 | B |
| world 97 | Part F :751-764 | the culture grammar row: plan unit, centre, spacing, orientation, enclosure, water, materials, never-appears | per culture; step 1 | B |
| world 97 | owner sense-check decisions :805-865 | owner answers in force (e.g. 8: Argonian enclosure none; 11: widths) | per culture; step 1 | B |
| `docs/world/96-placement-playbook.md` | §2 :77-153 | the history of every round's lesson; operative rows now live in `lessons.md` | fix rounds | P |
| world 96 | §3 :155 | the automation-readiness checklist per type | slice close | B |
| decision 0041 | Taste ledger :323-352 | 25 owner steers as rules (no ruled lanes, jittered rings, props not buildings, Hist wins, shrine not temple, gates named for their road, what the eye wants gets a path) | every type; step 1 | B |
| decision 0041 | :173-297 | quest co-design at three points; the five-rung distinctiveness hierarchy (:198-225); the breadth rule (:227-249); slopes (:251-296) | every type; step 1 | B |
| decision 0097 | whole | the layout is authored in the workbench; mined records are evidence; a building is an assembly; the pose record is the output | steps 2-5 | B |
| decision 0098 | § 1 table | per-settlement variety bars by tier; one assembly ≤ 3 province-wide, never twice within 2 km; tropicalise by texture only | settlements; steps 1, 5 | B |
| decision 0099 | whole | the loop; the exit bar; the yard as regression fixture | every slice | B |
| decision 0100 | whole | this skill's architecture: whole-layout authoring, lessons store, acceptance freeze, dependency direction | every slice | B |
| decision 0081 | decisions 3-5 | three patch kinds (pad, clearance, dressing-add); doors are TES transitions (tier A verbatim, else reserved); Sonnet ingestion | steps 2, 5 | B |
| decision 0078 | whole | plot schema (`footprintRadiusM`, `coSitedWith`, `ownerGuided`); a city is a gate plus a centre; canon decides which way a fault is fixed | step 0 | B |
| decision 0062 | § 9 | dungeons are places; interiors are a late phase; cities and opening scenes are owner-guided | types 5, 8 | B |
| decision 0036 | Q1, Q5 | vegetation density and groundcover: background for the clearance edge | step 5 | B |
| `docs/phases/16-foundation-and-places/16k-place-loop.md` | § The loop, § The checklist :91-129, § Owner check-ins, § Gotchas | the steps, the Gate rows and their asset pools, the walk packet shape | every slice | B |
| `docs/research/phase16/16k-handoff-2026-09-25.md` | rulings 1-6 | type 9, the Gate column (sockets, not systems), exemplars dropped, the first place | slice 1 | B |
| `docs/world/00-core.md` | whole | binding goals and acceptance | session start | B |
| `docs/world/10-vvardenfell-lessons.md` | §5-6 | settlement causation; repetition as cultural language | step 1 | P |
| `docs/world/40-causal-authoring.md` | §28-29 | every location needs a backstory that changes geometry; worked derivations (customs post, Hist village, xanmeer); every place states its wet-season state | step 1 | B |
| `docs/world/92-demographics.md` | §83b-84 | how many people live there; size bands | step 1 (building count) | B |
| `docs/world/70-dungeons-interiors.md` | §48-50 | interior promise vocabulary; combat spaces; encounter placement | types 4, 5; step 2 | B |
| `docs/world/90-asset-strategy.md` | §71, §74.3 | sourcing candidates when a piece is missing | any gap | B |
| `docs/quests/20-world-provisions.md` | §11-15 | provision tags, danger tiers, canon places, the quest-ready location packet, the exit gate | step 0 | B |
| `docs/quests/25-quest-place-map.md` | the place's rows | which quests use the place and what they need | step 0 | B |
| `docs/quests/85-condition-vocabulary.md` | whole | the only vocabulary for quest gates and sockets | step 2 | B |
| `docs/standards/engineering.md` | standard 13 | a placement change moves a lesson record (`lessons.md`, world 97 or 0041) | fix rounds | B |

## Research: settlement design, Skyrim and game design

| Source (`docs/research/placement-settlements/` unless given) | Section | The one line | Applies | B/P |
|---|---|---|---|---|
| building-depth-and-variety.md | §2 :86-128, §4, §5 | a building is an 11-layer assembly with a minimum set; windows per family; reachable variety per culture (§6 and its 25 % cap text are stale) | every building; steps 1-2 | P |
| building-asset-breadth.md | §2, §3 | every exterior shell held, tropicalisation verdicts, the variety metric (its 25 % cap proposals are superseded by 0098) | step 1 | P |
| king-of-the-murkmire-adoption-plan.md | §2, §3.2-3.3 | how KotM's own world uses its pieces; grammar and exemplar picks | Argonian cultures; step 1 | P |
| settlement-type-recipes.md + `world/sources/catalogue/type-recipes.json` | the type's row | five-slot recipe, siting grammar, asset plan (asset plans predate the pool: check them, L03) | step 0 | P (data B) |
| openworld-approach-and-wayfinding.md | §5 :328 | the 16 approach questions, each with its field | step 1 § Approach | P (answered: B) |
| openworld-place-distribution-and-siting.md | §3 | siting and slopes; wilderness-type recipes | types 4-7 | P |
| marsh-settlement-morphology.md | §5 | real wetland settlement models, archetype menu | types 2, 3 | P |
| settlement-design-principles-sources.md | §7 | Conzen, Pattern Language, Bethesda city intent, wayfinding | step 1 | P |
| kit-level-design-and-layout-generation.md | §1, §3, §5 | Bethesda kit method; layout families; exemplar-first | step 1 | P |
| settlement-form-evidence.md | whole | measured spacing, counts, family mix in shipped plugins | step 1 | P |
| shipped-world-placement-rules.md | R1-R14 | clutter and vegetation density evidence | dressing; step 1 | P |
| vanilla-skyrim-esm-placement-crosscheck.md | whole | mod vs vanilla deltas | step 1 | P |
| mined-interior-assembly-and-settlement-form.md | whole | the first mining pass | reference | P |
| kit-assemblies-evidence.md | § Composites | which pieces authors snap and at what offset | steps 1-2 | P |
| piece-front-derivation.md | whole | which way a piece faces | step 2 | P |
| player-purpose-spectrum.md | whole | what an enterable building must give the player | doors; step 2 | P (code reads it) |
| place-purpose-hostility-and-dungeon-balance.md | whole | purpose and hostility vocabularies | types 4, 5 | P |
| morrowind-content-density.md | whole | POIs per km², per city | step 0 | P |
| settlement-asset-inventory.md + `world/sources/placement/settlement-asset-inventory.json` | families, pools | what the vault can build with, by pool name | step 1 | P |
| place-asset-deliverability-audit.md | whole | whether each place description is deliverable | step 0 | P |
| settlement-kit-sourcing-log.md | OPEN rows | the sourcing register; an OPEN row needs a written reason | any gap | B |
| exterior-interior-linking-in-skyrim-mods.md | whole | door-to-cell mechanics | doors | P |
| xanmeer-mesoamerican-reference.md | whole | xanmeer terraces | type 6 | P |
| `docs/research/rendering/building-placement-rendering-treatments.md` | §3 :412 | the 30-item building checklist (base, LOD, night windows, wetness) | step 5 | P |
| `docs/research/lore/marsh-watercraft-and-argonian-boats.md` | whole | native craft for boats pulled up | water edge | P |
| `docs/research/lore/minority-enclaves-lore.md` | whole | Imperial and Dunmer enclaves (97 A11) | type 1, mixed places | P |
| `docs/research/quests-and-cast/opening-hours-and-start-area.md` | whole | opening-scene places | owner-guided places | P |
| `docs/research/phase16/16g-review/*.md` | the place's region | per-region review of places and remedies | step 0 | P |

## Lore (`world/sources/lore/`; dossiers first, UESP for gaps)

| Source | Section | The one line | Applies | B/P |
|---|---|---|---|---|
| topics/material-culture.md | § Building, § Boats, § Society, § The three building kits | what Argonians build, craft and moor; the three kits never blend | Argonian cultures | B (canon) |
| topics/hist-placement.md | §2 R1-R6, §3 register | which Hist stands where; absence is justified; required before any Argonian settlement | Argonian settlements | B |
| extrapolation/settlement-register.md | the place's row | magnitude ladder; the 4E 201 status | step 0 | B |
| extrapolation/argonia-4e201-state.md | §9 | the 4E 201 synthesis; the binding trauma directive | step 1 | B |
| topics/labour-and-bondage.md | whole | the Owing: works and camps | types 4, 7 | B |
| topics/roads-and-routes-4e201.md | the route's row | road state and who keeps it | type 1 | B |
| topics/foreign-powers.md, topics/guilds-and-orders.md | whole | Imperial presence; who runs a station or a works | types 1, 7 | B |
| topics/sithis-nisswo-shadowscales.md, topics/hist-and-sap.md | whole | shrines and sacred sites | type 6 | B |
| topics/lost-peoples.md, topics/history-timeline.md | whole | ruins and the era | types 5, 6 | B |
| topics/ecology-encounters-loot.md, topics/fauna-hazards.md | whole | lairs and camps | types 4, 5 | B |
| topics/prisons.md, umbriel.md, magic-practice.md, sky-moons-calendar.md, water-colour.md | whole | situational | when the record names them | B |
| regions/*.md | the place's region | per-region character | step 0 | B |
| the city dossiers (`<city>.md`) | whole | per-city canon | type 8; places near a city | B |
| tribes.md, black-marsh-province.md, an-xileel.md, duskfall.md, eye-of-argonia.md | whole | factions and tribes | Argonian places | B |
| extrapolation/gap-register.md, owner-questions.md, quest-plan-deltas.md | whole | canon tiers; owner decisions in force | step 0 | B |

## Records and data (evidence, never rules: 0097 decision 2)

| Source | The one line | Applies | B/P |
|---|---|---|---|
| `world/sources/catalogue/places-<zone>.json` + README | the place record: services, sockets, quest hooks, occupants, asset plan, vibe, interior promises, siting prefs, footprint radius | step 0 | B |
| `world/sources/sites/macro-plot.json`, `candidate-sites.json` | the plotted anchor and the places nearby | step 0 | B |
| `world/sources/sites/dossiers/` (via `worldgen.site_dossier`) | the measured ground dossier 97 B1 requires | step 0 | B |
| `worldgen.blueprint_promises --id` | the promise ledger: the layout's requirement list | step 0 | B |
| `world/sources/placement/breadth-bars.json` | the bars per tier and type (16k § 1b) | steps 1, 5 | B |
| `world/sources/placement/accepted-places.json` | the register of accepted places; frozen | steps 0, 8 | B |
| `world/sources/placement/kit-mounts-mined.json`, `kit-designed-sink.json`, `kit-assemblies-mined.json` | mount pairs, sinks, abuts and co-placement templates (read through `wb.py describe` / `evidence`) | step 2 | P |
| `world/sources/placement/exterior-interior-links.json`, `kit-interiors/*.interiors.json` | which shells have an interior; doorways per piece | doors; step 2 | P |
| `world/sources/placement/*-settlement-form(-stats).json` | measured per-settlement form (vanilla, BM&V, HTBM) | step 1 | P |
| `world/sources/assets/registry-*.jsonl` | the semantic asset registry | sourcing | P |
| `tooling/asset-pipeline/pipeline/config/kits/*.json`; `output/kits/*.kit.json` (via `describe`) | kit configs, composites, piece sizes and fits | step 1 | P |
| `world/sources/blueprints/place.fixture.proving-ground{,-b}.json` | the yard: the regression fixture | step 5 | B |
