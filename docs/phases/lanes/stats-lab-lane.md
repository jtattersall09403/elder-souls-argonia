# Stats lab lane (decision 0087; Opus lead)

Ports the workstream S design (module 76 §116–§129, decisions 0031–0037)
from `tooling/stats-sim` into the game as pure functions over versioned
data, proves it equal to the sim, and gives the owner a lab app to play
with the model. It is the first slice of Phase 10c (module 76 §104): the
model and the harness, not the actor, UI or save wiring.

## Folders

- **Owns:** `packages/game-core/src/stats/**`, `apps/stats-lab/**`,
  `tooling/stats-sim` (read; retired into the package at the end with a
  pointer left behind), this brief and its row in [README.md](README.md),
  new decision records, short pointers in
  [phases README § Phase 10c](../README.md#phase-10c--stats-progression-and-character-systems-module-76),
  the Stats lab row in `docs/PROGRESS.md` (one line, index-blob).
- **Never touches:** anything 16h owns (`tooling/world-generation`,
  `tooling/asset-pipeline`, `packages/game-core/src/settlement`, `world/`,
  `apps/world-studio`, `tooling/pages-site`, root `package.json`/`README.md`,
  `docs/phases/16-*`); anything the combat-sandbox lane owns
  (`apps/combat-sandbox`, `packages/game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}`).
  What the combat lane must consume goes through `/tmp/lanes/stats/handoff.md`.

## Rounds

1. **Model and curve port** (the combat lane waits on it): curves, skills,
   attributes; every §116–§122 formula; equivalence on a written then a
   fresh sample; handoff naming what replaces `combat/skillScalars.ts`.
2. **The whole sim**: gear, ladder, enemies (the semantic compiler of
   0019's fourth amendment), builds, classes, magic, economy, rules and
   content, the fight and campaign simulators, sweeps and invariants, with
   equivalence on the sim's whole `--json` output; the two race tables
   (`tooling/stats-sim/data/races.json`, `actors/generated/races.json`)
   reconciled into one record.
3. **`apps/stats-lab`**: sliders for the inputs, tables and curves for the
   outputs, the design's scenario presets; kept out of the Pages site until
   16h commits `tooling/pages-site/compose.mjs` (backlog row).

| Round | State | Commit | Record | Proof |
|---|---|---|---|---|
| 1 | delivered 2026-09-24 | see git log `stats lab round 1` | [0088](../../decisions/0088-the-stats-model-lives-in-game-core-and-reads-injected-data.md) | 285 sim answers (85 written, 200 fresh) equal to 1e-12; 20 tests |
