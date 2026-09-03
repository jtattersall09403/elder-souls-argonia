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

## Per-region naming register and signature asset pool

The variety critique's finding was that a reader could not tell one region's
records from another's by name or by kit — every region reached for the same
few families, and "The …" did the work of a register. Each region now has a
**naming register** (the grammar its names obey) and a **signature pool** (the
two or three asset families that are *disproportionately* its own, on top of
the province-common base). Both are descriptive of what the eight files now
contain — check against this table before adding a record, and if a new record
needs a name or a kit outside its region's row, say why in `why.founding`.

**Province-common base**, used everywhere and therefore signifying nothing:
`clutter`, `stockade-scaffold`, `lights-general`, `market-tents`,
`mud-mother-grove`, `fences-wattle`.

| region | naming register | signature pool (beyond the base) | avoid |
|---|---|---|---|
| `hist-heartland` | the settlement-root idiom: the definite-article abstract noun, naming a *condition* rather than a thing — "The Held Breath", "The Staying Stone", "The Lit Fen"; hyphenated verb-names for people-places ("Keeps-the-Egg") | `totems-ritual`, `argonian-lights`, `argonian-props`, `xanmeer-tileset`, `hist-tree` | Imperial anything; stone; reed |
| `naga-kur-deeps` | the same definite-article idiom pulled harsh and physical — "The Unmaking Yard", "Teeth-Pens", "Nine-Stakes Field"; counts and stakes instead of virtues | `xanmeer-tileset`, `submerged-blocks`, `submerged-ruins`, `argonian-props` | anything dressed, painted or bright; Imperial signage |
| `saxhleel-coast` | the hyphenated-verb register at its purest — over half the names are a clause: "Reaches-The-Low-Branch", "Two-Marks-One-Rope", "Speaks-Below-The-Water" | `docks-piers`, `submerged-ruins`, `fishing-props`, `passerelles-walkway` | Dunmer; farmhouse; fort |
| `mercantile-coast` | trade-register: exonyms and compass compounds a foreign clerk could write down — "Alten Meerhleel", "Chasepoint", "Ashfield" — with the hyphenated-verb names surviving in the Argonian quarter | `docks-piers`, `boats-keeled`, `signage-blank`, `vanilla-shackkit` | "The …" (5 uses; keep it that way) |
| `pirate-freeholds` | sailor's shorthand: the shortest thing that can be shouted across water — "Bundle Racks", "No-Tree", "Five-Sixty Field", "The Quay Room" | `bmv-fort`, `signage-blank`, `boats-keeled`, `vanilla-farmhouse` | ceremony; long names; hyphenated verb-clauses |
| `imperial-penal-south` | administrative register — the name a *long-dead* cordon or ledger gave a place (the prison bureaucracy is history, not live; its names survive it): "Holding Fields, Cordon Three", "The Windlass Reckoning", "Open House" | `bmv-fort`, `docks-piers`, `submerged-ruins`, `vanilla-farmhouse` | Argonian verb-names outside the Argonian records (2 of 21, correctly) |
| `imperial-fringe` | two registers side by side, and the seam is the point: Colovian possessives and plain descriptors ("Cartwright's Cross", "Cassian's Holding", "Burnt Field") against Argonian verb-names ("Carries-Them-Home") | `vanilla-farmhouse`, `landmark-civic`, `signage-blank`, `bridges` | mixing the two registers *within* one name |
| `dunmer-north` | Velothi/House names on the Morrowind side ("Andalen Plantation", "Gandranen Ruins", "Greylight"), Argonian verb-names on the marsh side, and English-compound road names on the road itself ("Channel Cross", "Nine Fords") | `dunmer-telvanni`, `vanilla-farmhouse`, `landmark-civic`, `guar-pens` | Imperial civic kit; anything coastal |
