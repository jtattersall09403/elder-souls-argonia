# Docs router

You are probably a fresh agent. Read this file and [PROGRESS.md](PROGRESS.md)
(both small), then use the table below to read **only** what your task needs.
Docs live next to the thing they document; `docs/` holds only cross-cutting
material (status, plan, decisions, credits). Every doc in the repo is reachable
from this page or from a README it links — keep it that way.

## Find context by task

**Rows compose — most tasks need two or three.** In particular: the **lore row
is mandatory for any task that decides what the world is like** (a place, a
route, a danger value, a name, a culture, an encounter…), whatever code it
lives in — a hydrology agent carving a river near Blackrose needs the
Blackrose dossier. Likewise "why is X like this" (decisions) applies whenever
you're about to change something that looks deliberate. When in doubt, skim
one extra row rather than guessing.

| Your task touches… | Read |
|---|---|
| Where we're up to / what's next | [PROGRESS.md](PROGRESS.md) (always) |
| Any world/design decision — goals, method, phases | [world-gen-master-plan.md](world-gen-master-plan.md) — use its part index, read only the sections your phase needs (~2,700 lines total; never read it all) |
| World generation code: terrain, hydrology, regions, climate, danger, cultures, roads/boat lanes | [../tooling/world-generation/README.md](../tooling/world-generation/README.md) (pipeline, modules, rerun rules) + the relevant plan parts (V, IV, XIII) **+ the lore row** for whatever ground/places your change affects |
| Lore/canon for any place, culture, name, history | [../world/sources/lore/README.md](../world/sources/lore/README.md) — dossiers + sourcing rules. The CLAUDE.md lore golden rule is mandatory |
| World source data: anchors, roads graph, demographics, climate states, authored region overrides | [../world/sources/README.md](../world/sources/README.md) |
| The studio map/flyover UI | [../apps/world-studio/README.md](../apps/world-studio/README.md) |
| Combat, character, animation, physics, input, inventory | [../apps/combat-sandbox/CLAUDE.md](../apps/combat-sandbox/CLAUDE.md) then its [docs/README.md](../apps/combat-sandbox/docs/README.md) |
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
