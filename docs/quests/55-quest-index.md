# Quest index — moved

> Module of the quest/narrative master plan (see [README](README.md)).
> **This file is a pointer.** The quest index is no longer a hand-maintained
> table: it is data plus a generated view, so eight region agents can write
> quests at once without clobbering one file.

- **The rules** (§47a why the index exists, §47b the 16-shape taxonomy,
  §47c the novelty rule and the shape budget): [index/README.md](index/README.md).
- **The index itself**, generated: [index/](index/) — `main.md`, `factions.md`,
  `standalone.md`, `proposed.md`, `local-<region>.md`, and
  [index/coverage.md](index/coverage.md), which is the commissioning brief
  (shape gaps, per-region budget, the Morrowind demand ladder).
- **The data** you edit: [world/sources/quests/](../../world/sources/quests/README.md)
  — a region agent writes `local-<region>.json` and nothing else.
- **The validator**: `python3 -m worldgen.quests --check` / `--sync` from
  `tooling/world-generation`, run in `npm test` by `worldgen/test_quests.py`.

The §47e proposal set from the 2026-09-04 co-design pass is now
[index/proposed.md](index/proposed.md) (PP01–PP18, still unauthored).
