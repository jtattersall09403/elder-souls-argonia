# Stats lab lane (decision 0087; Opus lead)

Ports the workstream S design (module 76 §116–§129, decisions 0031–0037)
from `tooling/stats-sim` into the game as pure functions over versioned
data, proves it equal to the sim, and gives the owner a lab app to play
with the model. It is the first slice of Phase 10c (module 76 §104): the
model and the harness, not the actor, UI or save wiring.

## Folders

- **Owns:** `packages/game-core/src/stats/**`, `apps/stats-lab/**`,
  `tooling/stats-sim` (retired in round 4; a README pointer remains), this brief and its row in [README.md](README.md),
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
| 1 | delivered 2026-09-24 | bc26431e | [0088](../../decisions/0088-the-stats-model-lives-in-game-core-and-reads-injected-data.md) | 285 sim answers (85 written, 200 fresh) equal to 1e-12; 20 tests |
| 2 | delivered 2026-09-24 | af96af0f | [0089](../../decisions/0089-one-race-record-keyed-by-the-roster-with-morrowinds-packages.md) | whole sim output (`run.mjs --json --matrix`, 12,924 numbers) bit-exact on the sim's tables; 19/19 invariants on the canonical data |
| 3 | delivered 2026-09-24 | 061b83d4 | — | `apps/stats-lab` builds; lab tests: every race × sex × class computes, every shown string is in the catalogue |
| 4 | delivered 2026-09-24 | 2f7759c8 | — | Marksman ×1.0 at skill 10; `tooling/stats-sim` retired; lab bundle 596 → 251 KB; training and brewing are stats functions; invariant names catalogued |

## Round 4 rulings and choices

- **Marksman nock and draw are ×1.0 at skill 10** (Fable, 2026-09-24).
  The sandbox at skill 10 is the calibrated baseline the owner has felt
  (0074 §3, 0076 §3), so each band's `lo` is set so the reference
  character's score at skill 10 (16.67 with Agility 50) reads 1.0: nock
  0.796768 → 1.6, draw 0.661279 → 2.0. Higher Agility raises the value at
  skill 10 a little, because the score folds Agility in; mastery is
  unchanged. Module 76 §118 carries a one-line note.
- **Shield weight is the base shield × its material's weight scale**, like
  every other item (module 76 §116's "steel kite shield"; the module
  states no separate rule). One definition, `sim/model.ts` `shieldWeight`.
  The retired sim's campaign carried an unscaled shield. The switch changes
  none of the sim's own outputs, because the equivalence stays bit-exact.
- **`tooling/stats-sim` is retired.** The port was proved against commit
  `7e93d7de`. Its findings moved to
  `docs/research/archive/workstream-s/stats-sim-findings.md`, and its tables
  stay verbatim in `stats/__fixtures__/sim-data/`.
| 5 | delivered 2026-09-24 | see git log `stats lab round 5` | — | every sweep that plays a character from race baselines (campaign, main quest, progression, deferral) run again as women: 19/19 invariants hold (standing test; the Morrowind known-answer run stays male by design); bows take no Strength (design kept, 0074/§117) |

**Lane closed 2026-09-24** after round 5. What is left for Phase 10c:
actors, combat and equipment reading this API (the combat lane consumes
the modifiers first), the effect stack, saves, and the character UI.
