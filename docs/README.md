# Docs router

You are probably a fresh agent. Read this file and [PROGRESS.md](PROGRESS.md)
(both small), then use the task table to read **only** what your task needs.
Every folder has a README that indexes its files: the table names the entry
point, the folder README names the rest.

## How `docs/` is laid out

Five kinds of thing, one folder each. Nothing else lives at the root.

| Folder | Kind | Holds |
|---|---|---|
| [world/](world/README.md) | plan | the world-generation master plan, one module per topic; [00-core](world/00-core.md) is read in full every session |
| [quests/](quests/README.md) | plan | the quest and narrative master plan; `index/` is generated from the quest data |
| [phases/](phases/README.md) | schedule | the build sequence (§85–87, one section per phase) and, per planned phase, a folder with the plan and one brief per chunk ("deliver 16a"); [P-polish/backlog.md](phases/P-polish/backlog.md) is Phase P; [buildout/](phases/buildout/README.md) is what comes after the world build |
| [standards/](standards/engineering.md) | rules | [engineering.md](standards/engineering.md) (the standing rules, checked by `npm test`) and [text/](standards/text/README.md) (style guide, culture registers, review process) |
| [decisions/](decisions/README.md) | rules | short numbered records of why things are the way they are |
| [research/](research/README.md) | knowledge | reusable findings in themed folders, each indexed; `archive/` is provenance only |
| [evidence/](evidence/) | evidence | images written by tooling for owner review, linked from PROGRESS |
| [PROGRESS.md](PROGRESS.md) | status | the only place status lives |

## Find context by task

**Rows compose — most tasks need two or three.** First ask the CLAUDE.md
question: *does any part of my task decide or depend on what the world is
like?* If yes (it usually is), the lore row is mandatory. If your task
touches something no row names, open the nearest folder README and judge.

| Your task touches… | Start here | Then |
|---|---|---|
| Where we're up to / what's next | [PROGRESS.md](PROGRESS.md) | the phase folder it names |
| Everything (session start) | [world/00-core.md](world/00-core.md) in full | [world/README.md](world/README.md) to route to modules |
| **"deliver 16x"** — terrain, water, borders, routes, vegetation, plot, settlements, exemplars, rollout | [phases/16-foundation-and-places/README.md](phases/16-foundation-and-places/README.md) | the chunk brief it names; the audits in [research/phase16/](research/phase16/README.md) |
| Phase deliverables, build order, what depends on what | [phases/README.md](phases/README.md) §86 | [0034](decisions/0034-build-sequence-rework.md), [0057](decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md) |
| World-generation code: terrain, hydrology, regions, climate, danger, cultures, routes, the rebuild chain, the frozen base and terrain patches | [../tooling/world-generation/README.md](../tooling/world-generation/README.md) (incl. § *Generated rasters live in a release, not in git* — `npm run province:fetch` / `province:publish`), [decisions/0059](decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md) (the ladder, the freeze gate, `world/sources/terrain/`) | [world/50](world/50-hydrology-climate.md), [research/world-terrain/](research/world-terrain/README.md), the lore row, [quests/20](quests/20-world-provisions.md) when placing anything |
| The hydrology graph: rivers, reaches, bodies, seasons, terrain preconditions (the frozen water record) | [../world/sources/hydrology/README.md](../world/sources/hydrology/README.md) + [0058](decisions/0058-the-hydrology-graph-is-the-water-record.md) | [research/phase16/16a-hydrology-graph-ledger.md](research/phase16/16a-hydrology-graph-ledger.md); `python3 -m worldgen.hydrology_graph report` |
| Water: rendering, the water query, seasons, buoyancy, underwater, waterfalls | [world/60](world/60-water-traversal.md) + [0047](decisions/0047-water-one-physical-model.md) + [0049](decisions/0049-water-is-measured-and-has-a-season.md) | [research/rendering/](research/rendering/README.md), [../packages/game-core/src/water/README.md](../packages/game-core/src/water/README.md); history in [research/archive/](research/README.md) |
| Time of day, sky, natural light, weather | [world/55](world/55-light-sky-time.md) | [0016](decisions/0016-natural-light-and-world-time.md), [0032](decisions/0032-phase8c-weather-implementation-shape.md), [research/rendering/](research/rendering/README.md) |
| Vegetation, scatter, groundcover, the density ladder | [world/65](world/65-vegetation-scatter.md) + [0048](decisions/0048-vegetation-density-ladder.md) | [research/vegetation/](research/vegetation/README.md), [../world/sources/flora/](../world/sources/flora/palettes.json) |
| Ground texturing: splat, materials, granularity | [0011](decisions/0011-ground-material-system.md) | [research/rendering/](research/rendering/README.md), [research/world-terrain/tropical-shoreline-materials.md](research/world-terrain/tropical-shoreline-materials.md) |
| Siting, laying out or building a **place** (settlements, POIs, kits) | [world/97](world/97-placement-principles.md) (binding) + [world/96](world/96-placement-playbook.md) (the loop) | [0041](decisions/0041-phase11-settlement-decisions.md), [../world/sources/sites/README.md](../world/sources/sites/README.md), [research/placement-settlements/](research/placement-settlements/README.md), [../world/sources/catalogue/README.md](../world/sources/catalogue/README.md), the [settlement-build](../.claude/skills/settlement-build/SKILL.md) skill |
| Rendering a placed building: grounding, colliders, navigation | [../packages/game-core/src/settlement/README.md](../packages/game-core/src/settlement/README.md) | [research/rendering/building-placement-rendering-treatments.md](research/rendering/building-placement-rendering-treatments.md), [research/phase16/audit-settlements-delivered.md](research/phase16/audit-settlements-delivered.md), [0052](decisions/0052-a-published-bundle-obeys-the-runtime-contract.md) |
| Adding, moving, merging or cutting a place; a quest that needs one | [quests/25](quests/25-quest-place-map.md) | [../world/sources/catalogue/README.md](../world/sources/catalogue/README.md), chunk [16g](phases/16-foundation-and-places/16g-macro-plot-places-adapt.md) |
| Dungeons, interiors, combat spaces | [world/70](world/70-dungeons-interiors.md) | [research/placement-settlements/](research/placement-settlements/README.md) (interior rows) |
| Ferries, fords, travel services, crossings | [../world/sources/routes/ferry-crossings.json](../world/sources/routes/ferry-crossings.json) | [../world/sources/sites/water-crossings.md](../world/sources/sites/water-crossings.md), [0051](decisions/0051-route-span-systems.md), [research/lore/](research/lore/README.md) |
| Quest and narrative design; authoring a quest | [quests/README.md](quests/README.md) | [quests/index/README.md](quests/index/README.md), [quests/85](quests/85-condition-vocabulary.md) for gates |
| The opening hours and the start area | [research/quests-and-cast/opening-hours-and-start-area.md](research/quests-and-cast/opening-hours-and-start-area.md) | [quests/30](quests/30-main-quest.md) |
| Lore and canon for any place, culture, name, history | [../world/sources/lore/README.md](../world/sources/lore/README.md) | [world/45](world/45-lore-extrapolation.md), [research/lore/](research/lore/README.md) |
| World source data: anchors, roads, demographics, climate, registries | [../world/sources/README.md](../world/sources/README.md) | [../world/sources/registries/README.md](../world/sources/registries/README.md) + [0044](decisions/0044-world-registries.md) for any id vocabulary |
| Finding or converting an asset; filling an art or animation gap | [../world/sources/assets/README.md](../world/sources/assets/README.md) (query, don't browse) | [world/90](world/90-asset-strategy.md) §71–74, [vault inventory](../world/sources/assets/vault-inventory.md), [../tooling/asset-pipeline/README.md](../tooling/asset-pipeline/README.md) |
| Can we show this creature or build this place with assets we own? | [research/lore/creature-asset-availability.md](research/lore/creature-asset-availability.md) | [research/placement-settlements/place-asset-deliverability-audit.md](research/placement-settlements/place-asset-deliverability-audit.md) |
| Mining a shipped game's data for rules | [phases/README.md](phases/README.md) §86.0b | [research/placement-settlements/](research/placement-settlements/README.md) (mined-evidence rows) |
| Ecology, encounters, creatures, loot (Phase 13) | [world/30](world/30-lore-systems.md) §26–27 | [world/70](world/70-dungeons-interiors.md) §50, [world/72](world/72-navigation-ai.md), [world/92](world/92-demographics.md), the lore dossiers |
| Ambient sound and the soundscape | [world/57](world/57-audio-soundscape.md) | [0023](decisions/0023-soundscape-polish-tier-and-credits.md), [research/rendering/ambient-audio-soundscape-threejs.md](research/rendering/ambient-audio-soundscape-threejs.md) |
| Combat, character, animation, physics, input, inventory | [../apps/combat-sandbox/CLAUDE.md](../apps/combat-sandbox/CLAUDE.md) | [../apps/combat-sandbox/docs/README.md](../apps/combat-sandbox/docs/README.md), [research/combat-and-systems/](research/combat-and-systems/README.md), [0013](decisions/0013-phase7-package-extraction-shape.md) |
| Stats, skills, progression, levelling | [world/76](world/76-stats-progression.md) §116–129 (the decided design) | [../tooling/stats-sim/README.md](../tooling/stats-sim/README.md); history in [research/archive/workstream-s/](research/archive/workstream-s/README.md) |
| Writing or reviewing any player-visible text; how an NPC sounds | [standards/text/README.md](standards/text/README.md) | the [text-review](../.claude/skills/text-review/SKILL.md) skill, [research/text-and-voice/](research/text-and-voice/README.md) |
| Writing any code or prose: the standing rules | [standards/engineering.md](standards/engineering.md) | [0042](decisions/0042-buildout-steers-and-engineering-standards.md) |
| Which subagent or skill to use | [../.claude/agents/deliver.md](../.claude/agents/deliver.md) · [../.claude/agents/research.md](../.claude/agents/research.md) | the skills in `.claude/skills/` |
| "Why is X the way it is?" | [decisions/README.md](decisions/README.md) | — |
| Deferring cosmetic work; picking up Phase P | [phases/P-polish/backlog.md](phases/P-polish/backlog.md) | — |
| Deferring a whole game system; who owns system X | [phases/buildout/README.md](phases/buildout/README.md) | [research/combat-and-systems/game-buildout-systems-audit.md](research/combat-and-systems/game-buildout-systems-audit.md) |
| Probes, studio layers, visual evidence | [world/85](world/85-world-studio.md) §66–70 | [../apps/world-studio/README.md](../apps/world-studio/README.md) |
| Repo layout, packages, bundles, CI, deploy, credits | [world/80](world/80-repo-architecture.md) | root [README.md](../README.md) § Credits, `.github/workflows/` |

## Where to record what you learn

- **A decision that isn't obvious from code** → `decisions/NNNN-topic.md`
  (next number, under ~150 lines) + one line in its index. Round-by-round
  history goes to `research/archive/<topic>-rounds/`, never into the record.
- **Reusable research** → `research/<folder>/<topic>.md` in a themed folder,
  plus a row in that folder's README. Name files so relevance is judged from
  the filename alone.
- **A phase plan** → `phases/<NN-slug>/README.md` + one brief per chunk;
  deliverables and gates in `phases/README.md` §86.
- **When a workstream or phase closes**, its working papers move to
  `research/archive/<name>/` with a README saying "provenance only, the live
  design is X" — merge anything that exists nowhere else into the live doc
  first.
- **Canon/lore** → `world/sources/lore/` dossier. **How to run a tool** → the
  README next to the code. **Status** → PROGRESS.md only.
- When you add a doc, add it to its folder README. When a doc goes stale,
  edit or delete it — pruning is part of the job.
