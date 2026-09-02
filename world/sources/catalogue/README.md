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
