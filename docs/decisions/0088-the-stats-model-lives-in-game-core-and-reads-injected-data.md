# 0088 — The stats model lives in `game-core/src/stats`, reads injected data, and is proved equal to the sim; the port's differences from the sim's tables

**Date:** 2026-09-24. **Status:** accepted (stats-lab lane lead, under the
lane brief's delegation, decision 0087 §1). Extends 0019 and module 76
§104/§129; the stats-lab lane brief is
[docs/phases/lanes/stats-lab-lane.md](../phases/lanes/stats-lab-lane.md).

## Decided

1. **Home: `packages/game-core/src/stats/`**, not a new package. Module 76
   §104 and §129 already name it; its consumers (combat, equipment, actors,
   the future NPC compiler) are all in game-core and import it relatively,
   so the combat lane needs no package or lockfile change; apps reach it
   through game-core's existing `./*` export
   (`@elder-souls/game-core/stats/index`). Purity is enforced by a test
   (the folder imports only `./`), so moving it into its own package later
   is a file move.
2. **Data in, numbers out.** Every function is pure and takes an optional
   last argument `data: StatsData` defaulting to the frozen canonical
   `STATS_DATA` (`vasteiPerRank`/`attributeCost` also take a rule set's own
   block after it, for the Morrowind known-answer run). No module-level
   mutable state (standard 8). Equivalence
   tests, the lab app and any retune pass their own set built with
   `statsData(raw)`, which rejects an unknown `schemaVersion`, skill or
   attribute ids that are not exactly the canonical lists, and a skill that
   names an unknown attribute.
3. **The canonical tables move** to `game-core/src/stats/data/` (curves,
   skills, attributes in round 1; the rest in round 2), each with
   `schemaVersion: 1` and a `designRef`, registered in
   `data-registry.json`. They carry no prose and no labels: the sim's `_`
   notes stay in `tooling/stats-sim` (history) and names go to the text
   catalogue when the lab first shows them (standard 4).
4. **Proof is sample first** (owner rule 2026-09-23): answers generated
   from the sim before the port existed, on a hand-written sample (85
   cases), then on a fresh seeded sample (200 cases, seed 20260924) that
   passed with no code change; relative tolerance 1e-12.
5. **Skill bands are over k(score) from score 0**, exactly as module 76
   §116/§118 write them. This replaces combat's linear ramps, which were
   held flat below skill 10.

## What differs from `tooling/stats-sim/data` (each asserted by `stats.test.ts`)

| Field | Sim | Port | Why |
|---|---|---|---|
| `skills.marksman.bands.drawSpeed` | 0.85→1.20 | 1.0→2.0 | owner 2026-09-18, decision 0074 §3; module 76 §118 row already says it; the sim was never updated |
| `skills.marksman.bands.nockSpeed` | absent | 1.0→1.6 | same ruling |
| `skills.athletics.bands.run`, `.swim` | 0.94→1.10, 0.85→1.30 | removed | read by no formula; the sim and §122 use `walk × (1 + Athletics/250)` and `1.6 × (0.5 + Athletics/100)` |
| `skills.acrobatics.bands.jump`, `.safeFallMeters` | 0.9→1.25, 2→6 | removed | §122 gives the formulas `1.378 × (0.80 + Acrobatics/125)` and `2 + Acrobatics/25`, now data under `curves.movement` |
| `curves.movement.speedAttributeBase/Divisor` | 0.92, 625 | removed | read by no formula; the walk formula's 0.75 and /200 were literals in `model.mjs` and are now data |
| `curves.movement` literals | in code | `speedFactorBase` 0.75, `speedFactorDivisor` 200, `loadSpeedPenalty` 0.3, `sprintAthleticsDivisor` 250, `swimAthleticsBase` 0.5, `swimAthleticsDivisor` 100, jump and safe-fall constants, `overloadedWalkFraction` 0.4 | "a number goes in data" (the sim's own rule); values unchanged |
| `curves.poise`, `.block`, `.checks` | in prose | Agi/2, stability cap 0.95, cast ×2, enchant ÷3, constant effect ×2, charged use 1.1, out-of-combat fatigue 0.85 + 0.15, craft tier ÷14 | §117.1, §117.3, §118, §121.3 formulas given data homes |
| `skills.sneak.bands.openerMultiplier` | `null` | removed | a placeholder; the opener table is `curves.sneakAttack` |
| `curves.score.scale`, `.missingAttribute`; `attributes.reference` | literals 100 and 50 in code; the Marsh Hand in prose | data | the skill scale, the attribute read when a score attribute is missing, and the §116 reference character |
| `strengthDamage.excludes` | hard-coded `handToHand` in code, list in data | list read from data | the data list also excludes Marksman, which the sim enforced by a separate code path |

The Security lock rule ports as §117.1/§118 write it, `(Security + Agi/5)
× toolQuality ≥ lockLevel`; the sim's `skills.json` note
(`15 + 0.85 × effSkill + toolBonus`) contradicts it and is not ported.
