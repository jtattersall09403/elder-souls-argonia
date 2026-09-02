# Docs router

You are probably a fresh agent. Read this file and [PROGRESS.md](PROGRESS.md)
(both small), then use the table below to read **only** what your task needs.
Docs live next to the thing they document; `docs/` holds only cross-cutting
material (status, plan, decisions, credits). Every doc in the repo is reachable
from this page or from a README it links — keep it that way.

## Find context by task

**Rows compose — most tasks need two or three.** Before choosing rows, ask
yourself the CLAUDE.md session-start question: *does any part of my task decide
or depend on what the world is like?* If yes — and it usually is yes: a POI
needs a reason to exist here, an encounter needs a habitat or motive, a name
needs a language — the **lore row is mandatory**, including fetching new UESP
material when the dossiers have gaps. A hydrology agent carving a river near
Blackrose needs the Blackrose dossier. Likewise "why is X like this"
(decisions) applies whenever you're about to change something that looks
deliberate. When in doubt, read one extra row rather than guessing.

The table is a **map, not a fence**: it names the known entry points, but you
are expected to *reason*. If your task smells like it touches something no row
names, list the filenames in the nearest-looking folder (`docs/`, its
subfolders, package/app docs) and judge for yourself — folder and file names
are written to be the index. Missing load-bearing context is worse than
reading one extra doc.

| Your task touches… | Read |
|---|---|
| Where we're up to / what's next | [PROGRESS.md](PROGRESS.md) (always) |
| Phase deliverables / build order ("what does Phase N ship?") | [world/95](world/95-build-sequence.md) §86 + [PROGRESS.md](PROGRESS.md) + decision [0034](decisions/0034-build-sequence-rework.md) |
| (Everything — read at session start) | [world/00-core.md](world/00-core.md) **in full, every session** (~4k tokens — the world plan's universal core), then route to modules via [world/README.md](world/README.md) |
| World generation code: terrain, hydrology, regions, climate, danger, cultures, roads/boat lanes | [../tooling/world-generation/README.md](../tooling/world-generation/README.md) (pipeline, modules, rerun rules) + the relevant world modules (world/50, 40, 95 via [world/README.md](world/README.md)) **+ the lore row** for whatever ground/places your change affects **+ [quests/20-world-provisions.md](quests/20-world-provisions.md)** when placing locations/settlements/dungeons/routes; for settlement siting/layout inspiration see research [marsh settlement morphology](research/marsh-settlement-morphology.md) |
| Quest/narrative design: story, factions, side quests, dialogue, what quests need from the world | [quests/README.md](quests/README.md) — modular quest master plan with its own who-reads-what table |
| Lore/canon for any place, culture, name, history | [../world/sources/lore/README.md](../world/sources/lore/README.md) — dossiers + sourcing rules. The CLAUDE.md lore golden rule is mandatory. For 4E 201 gaps, check the extrapolation workstream ([world/45](world/45-lore-extrapolation.md)) before inventing |
| World source data: anchors, roads graph, demographics, climate states, authored region overrides | [../world/sources/README.md](../world/sources/README.md) |
| The studio map/flyover UI | [../apps/world-studio/README.md](../apps/world-studio/README.md) |
| Probes, studio diagnostic layers, visual evidence | [world/85](world/85-world-studio.md) §66–70 |
| Time of day, calendar, sun/moons/stars, natural light, sky, haze, weather | [world/55-light-sky-time.md](world/55-light-sky-time.md) + decisions [0016](decisions/0016-natural-light-and-world-time.md) + [0032](decisions/0032-phase8c-weather-implementation-shape.md) (the 8c weather run-book) + research [three.js light/sky/atmosphere](research/natural-light-sky-atmosphere-threejs.md) + [weather/clouds/rain](research/weather-clouds-rain-threejs.md) + canon [sky-moons-calendar](../world/sources/lore/topics/sky-moons-calendar.md) |
| Water: rendering, the water query, tide/season levels, buoyancy, underwater | [world/60-water-traversal.md](world/60-water-traversal.md) + decision [0025](decisions/0025-phase8b-water-implementation-shape.md) + research [three.js water](research/water-rendering-threejs.md) + [shore waves/edges/wet sand/ripples](research/water-edges-and-shore-waves.md) + [tropical fluvial geomorphology](research/tropical-fluvial-geomorphology.md) (carving rules: river continuum, water types, wetlands, mouths/coast, cheat-sheet) + [waterfalls](research/waterfalls-realtime.md) (falling-water shading, mist/base kit, Skyrim FX assets) + [rivers on slopes/cascades](research/rivers-on-slopes-and-cascades.md) (monotone long-profile bake, flow legibility, de-crusted foam); for swimming/climbing/boat *mechanics* (Phase 9) see research [swim-climb-boat implementation](research/swim-climb-boat-implementation.md) and, for boat classes/docks/canon craft, [marsh watercraft](research/marsh-watercraft-and-argonian-boats.md) + the boats section of [material-culture](../world/sources/lore/topics/material-culture.md) + [world/75](world/75-combat-compatibility.md) §51/§57 + [world/90 §74.3](world/90-asset-strategy.md) (animation gap table) + [world/76](world/76-stats-progression.md) §122 (movement/burden stat contract) + the [polish-backlog](polish-backlog.md) physics mass-unit-scale item; code in `packages/game-core/src/water/`, `apps/world-studio/src/water/`, compile `worldgen/compile_water.py` |
| Ambient sound, soundscape, footsteps, reverb, underwater audio | [world/57](world/57-audio-soundscape.md) + decision [0023](decisions/0023-soundscape-polish-tier-and-credits.md) + research [ambient audio/soundscape](research/ambient-audio-soundscape-threejs.md) + [world/75](world/75-combat-compatibility.md) §54 (physical materials → footsteps) |
| Vegetation/scatter/groundcover · navmesh/AI movement | [world/65](world/65-vegetation-scatter.md) + research [vegetation scatter/instancing](research/vegetation-scatter-instancing-threejs.md) + **[mined placement rules](research/shipped-world-placement-rules.md) (how dense, how clumped, what grows at what water depth — measured, not guessed)** + [micro-siting](research/mod-vegetation-micro-siting.md) (per-species waterline depths, riparian multipliers, pool ring structure, the Tropical Skyrim anatomy) + [multi-scale placement architecture](research/openworld-vegetation-placement-architecture.md) (HZD/Far Cry/UE5 PCG macro→meso→micro pattern, water-margin dressing, black-foliage + shadow fixes); the compiler is `worldgen/scatter.py` + `worldgen/compile_scatter.py`, its data is [world/sources/flora/](../world/sources/flora/palettes.json); [world/72](world/72-navigation-ai.md) + research [navmesh/ambient AI](research/navmesh-ambient-ai-threejs.md); decisions [0022](decisions/0022-world-build-gap-audit.md), [0036](decisions/0036-phase10-placement-decisions.md) |
| Finding an asset, or turning one into a runtime GLB | **query, don't browse**: [world/sources/assets/](../world/sources/assets/README.md) (`python3 -m worldgen.asset_registry query --category tree --biome swamp --used`) + [world/90 §72](world/90-asset-strategy.md); to convert, add a kit config under `tooling/asset-pipeline/pipeline/config/kits/` and run `python3 -m pipeline.build_kit --kit <id>` |
| Mining a shipped game's data for rules (placement, composition, grammars) | [world/95 §86.0b](world/95-build-sequence.md) + the readers `worldgen/esp_index.py` / `mine_placement.py` / `mine_groundcover.py` / `mine_micro_siting.py` / `mine_regions.py` / `mine_interiors.py` / `mine_settlements.py` + [what came out for vegetation](research/shipped-world-placement-rules.md) + [the `Skyrim.esm` cross-check](research/vanilla-skyrim-esm-placement-crosscheck.md) (Bethesda's own REGN/GRAS/placement numbers vs ours, with deltas to act on) + [micro-siting](research/mod-vegetation-micro-siting.md) and [the raw stats](../world/sources/placement/README.md) + [interiors + settlement form](research/mined-interior-assembly-and-settlement-form.md) |
| Terrain ground texturing: splat/materials, granularity, texture sources | decision [0011](decisions/0011-ground-material-system.md) + `docs/research/` (Bethesda [granularity](research/skyrim-morrowind-landscape-texture-granularity.md), [WebGL rendering](research/webgl-terrain-many-material-splatting.md), [texture sources](research/black-marsh-ground-texture-sources.md), [shoreline/bed materials + assignment spec](research/tropical-shoreline-materials.md)) |
| Character stats, attributes, skills, progression, levelling, birthsigns | [world/76-stats-progression.md](world/76-stats-progression.md) — **§116–129 is the decided design; read before adding any per-character number.** Decisions [0019](decisions/0019-stats-system-workstream-and-placement.md) (placement), [0031](decisions/0031-workstream-s-round1-shape.md) (round-1 shape), [0033](decisions/0033-workstream-s-design-and-numbers.md) (design + numbers). Canonical numbers and the balance harness: [`tooling/stats-sim/`](../tooling/stats-sim/README.md) (+ its [FINDINGS.md](../tooling/stats-sim/FINDINGS.md), the tuning history). The workstream's closed working papers are provenance only: [research/archive/workstream-s/](research/archive/workstream-s/README.md) |
| Designing/laying out settlements, POIs, dungeons or kits (Phases 10–12) | **[the site survey tools](../world/sources/sites/README.md) — run `worldgen.site_dossier` on any ground before proposing anything on it, and read the province `terrain_scour` output for what land is actually available (and what the province does *not* have)** + **[mined interior assembly + settlement form](research/mined-interior-assembly-and-settlement-form.md) (measured snap modules, chamber sizes, clutter density, building spacing, water/road siting — read before choosing any number)** + research [kit level design + layout generation](research/kit-level-design-and-layout-generation.md) (Bethesda kit craft, Skyrim snap facts, dungeon/village generation methods) + [marsh settlement morphology](research/marsh-settlement-morphology.md) (real-world siting/forms/archetype menu) + [xanmeer/Mesoamerican reference](research/xanmeer-mesoamerican-reference.md) (ruin sites, taphonomy, water engineering) + decisions [0029](decisions/0029-phase-plan-research-review.md) (the exemplar-first rollout pattern) + [0034](decisions/0034-build-sequence-rework.md) (the build order) + [morrowind content density](research/morrowind-content-density.md) (the density budget is a completion gate, 0027) + **[place distribution + siting](research/openworld-place-distribution-and-siting.md) (POI tiers/densities/spacing, BotW triangle+gravity pull rules, regional distinctiveness, the five-part POI recipe, **building on slopes: grade/plinth/stilt procedure**, province-scale placement gotchas, anti-sameyness checks)** + **[settlement asset inventory](research/settlement-asset-inventory.md) (what building families, walkway/dock kits, props, lights and landmarks we actually own, by culture — write asset plans against it, not against assets we lack)** + **[the place catalogue](../world/sources/catalogue/README.md) — the province's permanent place registry (800 records, `worldgen.catalogue`); read its per-region naming register + signature asset pool table before naming or kitting anything, and `type-recipes.json` for the per-type recipe and count band** + **[the Phase 11 adversarial critique](research/phase11-critique/) (coverage-density, variety-distinctiveness, lore-fidelity, feasibility, completeness — the five critics' findings, the per-zone record budgets, and what the repair round did or did not fix; outcome table in decision 0041)** + the world modules the task touches (40, 70; 10 §5/§8, 20 §14–16, 30, 92) |
| Ecology, encounters, creatures, fauna, fixed loot (Phase 13) | [world/30](world/30-lore-systems.md) §26–27 + [world/70](world/70-dungeons-interiors.md) §50 + [world/72](world/72-navigation-ai.md) §113–115 + [world/65](world/65-vegetation-scatter.md) §112 + [world/92](world/92-demographics.md) + lore dossiers [ecology-encounters-loot](../world/sources/lore/topics/ecology-encounters-loot.md) and [fauna-hazards](../world/sources/lore/topics/fauna-hazards.md) |
| Filling an art/animation/asset gap (a model, texture, creature, clip) | [world/90-asset-strategy.md](world/90-asset-strategy.md) §71 (the no-new-art rule and the sourcing procedure) + §74.3 (animation gaps and researched candidates) + [../tooling/asset-pipeline/README.md](../tooling/asset-pipeline/README.md). **We never author art — we source it.** |
| Combat, character, animation, physics, input, inventory | [../apps/combat-sandbox/CLAUDE.md](../apps/combat-sandbox/CLAUDE.md) then its [docs/README.md](../apps/combat-sandbox/docs/README.md). The portable core lives in `packages/game-core` + `packages/character` + `packages/character-assets` (decision [0013](decisions/0013-phase7-package-extraction-shape.md)) — package changes affect both the sandbox and the studio's character mode |
| Asset pipeline: GLB/skeleton/Blender/Skyrim data | [../tooling/asset-pipeline/README.md](../tooling/asset-pipeline/README.md) |
| "Why is X the way it is?" | [decisions/README.md](decisions/README.md) — short numbered records |
| Deferring cosmetic/feel work; picking up Phase P | [polish-backlog.md](polish-backlog.md) |
| **Writing any code at all** — the eleven standing rules (stable IDs, one text catalogue, `schemaVersion`, determinism, no new singletons, provenance…) and their checks | [engineering-standards.md](engineering-standards.md) + decision [0042](decisions/0042-buildout-steers-and-engineering-standards.md). Four are mechanical: `npm test -w @elder-souls/repo-standards` |
| Writing **any player-visible text** (dialogue, books, journal, system messages, UI labels) | [quests/60 §45e](quests/60-writing-and-lore.md) (TES voice + the banned-constructions list) + `packages/text-catalogue` — every string is registered there, never a literal |
| Gating a quest, dialogue line or reward on world state | [quests/85-condition-vocabulary.md](quests/85-condition-vocabulary.md) — the only language conditions and actions may be written in; add a predicate there rather than inventing prose |
| Deferring a whole *game system* past the world build; "who owns system X?"; hooks a phase must leave for future systems | [game-buildout-register.md](game-buildout-register.md) (decision 0038) + the full [build-out systems audit](research/game-buildout-systems-audit.md) |
| Credits/licensing of any external source | root [README.md](../README.md) § Credits and third-party sources |
| Repo layout, package rules, world bundles, deploy targets | [world/80](world/80-repo-architecture.md) §58–65 |
| CI, deploy, site layout | root [README.md](../README.md) + `.github/workflows/` |

## Where to record what you learn

- **A decision that isn't obvious from code** → `decisions/NNNN-topic.md` (next
  number, few paragraphs max) + one line in its index.
- **Reusable research findings** (e.g. "how X engine problem is usually
  solved") → `docs/research/<topic>.md`; scan the existing filenames first —
  the research directory is a second index; name files so a future agent can
  judge relevance from the filename alone.
- **When a workstream closes**, its working papers (question packs, owner
  rounds, inventories, derivation packets) move to
  `docs/research/archive/<workstream>/` with a README saying "provenance only,
  the live design is X" — first merging any content that exists nowhere else
  into the live doc. Only papers that are still *evidence* stay in the live
  research folder. A fresh agent must find one live design, not five drafts;
  see [research/archive/workstream-s/](research/archive/workstream-s/README.md)
  for the pattern.
- **Canon/lore for a place, tribe, faction** → `world/sources/lore/` dossier,
  following its README's sourcing rules.
- **How to run/change a specific app or tool** → the README **next to that
  code**, not here.
- **Status** → PROGRESS.md only, per its protocol. Never duplicate status
  into other docs.
- When you add a doc, link it (here or in the README that owns its area). When
  a doc goes stale, **edit or delete it** — pruning is part of the job.
