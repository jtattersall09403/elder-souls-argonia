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
| (Everything — read at session start) | [world/00-core.md](world/00-core.md) **in full, every session** (~4k tokens — the world plan's universal core), then route to modules via [world/README.md](world/README.md) |
| World generation code: terrain, hydrology, regions, climate, danger, cultures, roads/boat lanes | [../tooling/world-generation/README.md](../tooling/world-generation/README.md) (pipeline, modules, rerun rules) + the relevant world modules (world/50, 40, 95 via [world/README.md](world/README.md)) **+ the lore row** for whatever ground/places your change affects **+ [quests/20-world-provisions.md](quests/20-world-provisions.md)** when placing locations/settlements/dungeons/routes |
| Quest/narrative design: story, factions, side quests, dialogue, what quests need from the world | [quests/README.md](quests/README.md) — modular quest master plan with its own who-reads-what table |
| Lore/canon for any place, culture, name, history | [../world/sources/lore/README.md](../world/sources/lore/README.md) — dossiers + sourcing rules. The CLAUDE.md lore golden rule is mandatory. For 4E 201 gaps, check the extrapolation workstream ([world/45](world/45-lore-extrapolation.md)) before inventing |
| World source data: anchors, roads graph, demographics, climate states, authored region overrides | [../world/sources/README.md](../world/sources/README.md) |
| The studio map/flyover UI | [../apps/world-studio/README.md](../apps/world-studio/README.md) |
| Time of day, calendar, sun/moons/stars, natural light, sky, haze, weather | [world/55-light-sky-time.md](world/55-light-sky-time.md) + decision [0016](decisions/0016-natural-light-and-world-time.md) + research [three.js light/sky/atmosphere](research/natural-light-sky-atmosphere-threejs.md) + canon [sky-moons-calendar](../world/sources/lore/topics/sky-moons-calendar.md) |
| Ambient sound/soundscape, footsteps, reverb, underwater audio · vegetation/scatter density · navmesh/AI movement | world modules [57](world/57-audio-soundscape.md) / [65](world/65-vegetation-scatter.md) / [72](world/72-navigation-ai.md) + decision [0022](decisions/0022-world-build-gap-audit.md) + their `docs/research/` companions (linked from each module) |
| Terrain ground texturing: splat/materials, granularity, texture sources | decision [0011](decisions/0011-ground-material-system.md) + `docs/research/` (Bethesda [granularity](research/skyrim-morrowind-landscape-texture-granularity.md), [WebGL rendering](research/webgl-terrain-many-material-splatting.md), [texture sources](research/black-marsh-ground-texture-sources.md)) |
| Character stats, attributes, skills, progression, levelling, birthsigns | [world/76-stats-progression.md](world/76-stats-progression.md) + decision [0019](decisions/0019-stats-system-workstream-and-placement.md) — **read before adding any per-character number**. Told to "kick off workstream S"? The run-book is §103.1 |
| Filling an art/animation/asset gap (a model, texture, creature, clip) | [world/90-asset-strategy.md](world/90-asset-strategy.md) §71 (the no-new-art rule and the sourcing procedure) + §74.3 (animation gaps and researched candidates) + [../tooling/asset-pipeline/README.md](../tooling/asset-pipeline/README.md). **We never author art — we source it.** |
| Combat, character, animation, physics, input, inventory | [../apps/combat-sandbox/CLAUDE.md](../apps/combat-sandbox/CLAUDE.md) then its [docs/README.md](../apps/combat-sandbox/docs/README.md). The portable core lives in `packages/game-core` + `packages/character` + `packages/character-assets` (decision [0013](decisions/0013-phase7-package-extraction-shape.md)) — package changes affect both the sandbox and the studio's character mode |
| Asset pipeline: GLB/skeleton/Blender/Skyrim data | [../tooling/asset-pipeline/README.md](../tooling/asset-pipeline/README.md) |
| "Why is X the way it is?" | [decisions/README.md](decisions/README.md) — short numbered records |
| Credits/licensing of any external source | [CREDITS.md](CREDITS.md) |
| CI, deploy, site layout | root [README.md](../README.md) + `.github/workflows/` |

## Where to record what you learn

- **A decision that isn't obvious from code** → `decisions/NNNN-topic.md` (next
  number, few paragraphs max) + one line in its index.
- **Reusable research findings** (e.g. "how X engine problem is usually
  solved") → `docs/research/<topic>.md`; create the directory on first use;
  name files so a future agent can judge relevance from the filename alone.
- **Canon/lore for a place, tribe, faction** → `world/sources/lore/` dossier,
  following its README's sourcing rules.
- **How to run/change a specific app or tool** → the README **next to that
  code**, not here.
- **Status** → PROGRESS.md only, per its protocol. Never duplicate status
  into other docs.
- When you add a doc, link it (here or in the README that owns its area). When
  a doc goes stale, **edit or delete it** — pruning is part of the job.
