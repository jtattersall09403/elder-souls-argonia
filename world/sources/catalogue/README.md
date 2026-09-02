# The place catalogue (Phase 11, decision 0041 Part 2)

The province's **permanent place registry**. Every place — city to grave —
gets one record here before anything is sited or built. Stable IDs in this
catalogue are what quests, the map, saves, courier letters and deed counters
will reference for the life of the game.

**Binding rules** (decision 0041, forward-compatibility block):

- **IDs are permanent.** `place.<region>.<slug>` (engineering standard 2).
  Never delete or rename a committed ID — a cut place sets
  `status: "cut"` and stays. Validators enforce uniqueness province-wide.
- **Per-region files**: `places-<region>.json`, each
  `{ "schemaVersion": 1, "region": "<region>", "seed": "...", "places": [...] }`.
  Deterministically ordered by ID; regeneration must reproduce byte-identical
  files (standard 6).
- **Taxonomy** lives in `taxonomy.json` (class → family → type → variant);
  every record's classification must resolve against it. The taxonomy grows —
  adding is cheap, renaming is a migration.
- **Build-out keys are present from v1** even where empty: `discovery`,
  `rumourPoolKey`, `deedCounterKeys`, `sockets` — the build-out systems key on
  them (game-buildout-register.md).

**Field reference** is the docstring of
`tooling/world-generation/worldgen/catalogue.py` — the validator is the
schema's source of truth (`python -m worldgen.catalogue --check` from
`tooling/world-generation/`; also runs in `npm test` via pytest).

**Registration**: the directory is in `tooling/repo-standards/data-registry.json`
(standard 7). Each new `places-<region>.json` must ALSO be added as a source in
`tooling/repo-standards/id-registry.json` (standard 2) in the same commit, so
`npm test` enforces ID shape/uniqueness/retirement mechanically.

Workflow status ladder: `derived → plotted → authored → frozen` — each rung
adds required fields (see the validator). A dot without a plotted `why` is a
validation failure, per 0041 Part 3.

## `rewardProfile.valueTier` — the one scale (0041 enrichment, 2026-09-02)

Neither [quests 85](../../../docs/quests/85-condition-vocabulary.md) nor
[world 76](../../../docs/world/76-stats-progression.md) defines a reward/value
scale (76's D0–D5 is *danger*), so the catalogue defines its own. **Five bands,
written `tier-1` … `tier-5`**, approximately proportionate to effort per
[module 20 §12.3b](../../../docs/world/20-province-design.md):

| tier | what it pays |
|---|---|
| `tier-1` | incidental — shelter, a little salvage, rumour, a service you could get anywhere |
| `tier-2` | a normal reason to make the trip: trade, supplies, reagents, a small cache, faction contact |
| `tier-3` | worth a detour and a risk: a dungeon's worth of loot, a real quest hook, a unique service |
| `tier-4` | a landmark payoff — a boss and its hoard, an artefact, a faction unlocked |
| `tier-5` | province-unique: one-of-a-kind artefact, main-quest object, a place that changes the map |

Four incompatible vocabularies were converted in one pass (`tier-N`,
bare integers, `TN`, and the interior's three-band `low/medium/high/unique`).
The word scale maps `low→tier-1, medium→tier-2, high→tier-3, unique→tier-5`:
rank-preserving, but a 3-band file cannot express `tier-4`, so the interior
currently has none — promoting specific interior sites to `tier-4` is a
reward-pass call, not a rename. `"tier-2 hub"` collapsed to `tier-2`.

## `relations` — conventions

- `dependsOn` / `supplies` / `rivals` / `patrols` / `visibleFrom` — **place IDs
  only**, and directional: `A.supplies = [B]` means goods/labour/authority flow
  A → B.
- `tolls` — the place ID that levies on this place (or that this place levies).
- `reachedVia` — place IDs of the node a traveller sets out from or arrives
  through. Every record carries at least one.
- `travelServiceEdges` — service strings, **not** IDs:
  `"<mode>:<a>-<b>"`, mode ∈ boat / ferry / road / cart / porter / lighter /
  guide / portage / rootworm / pilot.
- `visibleFrom` stays near-empty until Part 3: the scour found the province has
  almost no long sightlines, so a claimed sightline needs a canopy-breaking
  landmark and, ideally, plotted positions.
- Cross-region links are the point — the derivation agents could not see each
  other. Only reference IDs that exist; the validator and `npm test` check.
