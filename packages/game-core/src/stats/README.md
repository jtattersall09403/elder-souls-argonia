# stats — the character model (module 76 §116–§129)

Pure, deterministic functions over versioned data: the workstream S design
(decisions 0031–0037) ported from `tooling/stats-sim`, proved equal to it.
No React, no three, no state; the folder imports nothing outside itself
(a test enforces it). Import from `@elder-souls/game-core/stats/index` in an
app, or `../stats` inside game-core. Why this home and what differs from the
sim: [decision 0088](../../../../docs/decisions/0088-the-stats-model-lives-in-game-core-and-reads-injected-data.md).
Lane brief: [stats-lab-lane.md](../../../../docs/phases/lanes/stats-lab-lane.md).

## Data

`data/*.json` is the canonical copy of every number (module 76 §129 moved
here from `tooling/stats-sim/data/`). Each file carries `schemaVersion`
(registered in `tooling/repo-standards/data-registry.json`) and a
`designRef`; no prose and no labels (names come from the text catalogue).
`STATS_DATA` is the frozen canonical set. Every function takes an optional
last argument `data: StatsData`; build one with `statsData(raw)` to test a
retune or to run the sim's own tables.

| File | Holds |
|---|---|
| `curves.json` | k exponent, P range, health/stamina/magicka/carry, burden and roll tiers, mitigation, breath, movement, XP, vastei, level-up costs, difficulty, sneak table, climbing, poise, block cap, check constants |
| `skills.json` | the 27 skills: governing and score attribute, specialization, family, bands `[lo, hi]` over k(score) |
| `attributes.json` | the seven attributes, start range, favoured bonus, purchase cap |

## API (stable; the combat lane consumes the first block)

| Function | Returns |
|---|---|
| `meleeModifiers(skillId, skill, attrs?)` | `{damagePosition, staminaCost, strength, wear, targetStaminaDamage}`; replaces `combat/skillScalars.meleeScalars` |
| `marksmanModifiers(skill, attrs?)` | combat's `RangedModifiers` shape; replaces `marksmanScalars` |
| `blockModifiers(skill, attrs?)`, `capBlockStability(x)` | Block's stability and guard-stamina bands; the 0.95 cap |
| `burdenTier(kg, attrs)`, `burdenStaminaMultiplier(tier)`, `rollModifiers(tier)` | §122 tiers and what they do |
| `k`, `effectiveSkill`, `canonScore`, `band`, `damagePosition`, `strengthDamage`, `strengthApplies`, `skillBand` | the curve (§116, §117.1, §121.1) |
| `conditionFactor`, `softRequirementStaminaMultiplier` | §121.1, §121.6 |
| `maxHealth`, `maxStamina`, `staminaRegen`, `maxMagicka`, `magickaRegen`, `carryCapacity` | §117, §121.2 |
| `mitigation`, `damageAfterArmour`, `incomingDamage`, `unarmouredRating`, `basePoise`, `piecePoise` | §121.3–§121.4 |
| `walkSpeed`, `sprintSpeed`, `swimSpeed`, `jumpApex`, `safeFallMetres`, `breathSeconds`, `climb` | §122 |
| `sneakMultiplier` | §121.5 |
| `lockOpens`, `maxCastableCost`, `enchantPointBudget`, `chargedUseCostMultiplier`, `persuasionScore`, `craftableMaterialTier`, `temperGrade`, `outOfCombatFatigueFactor` | §117.1, §117.3, §118 |
| `pointsToNextRank`, `vasteiPerRank`, `attributeCost` | §120 |
| `REFERENCE_ATTRIBUTES` | the Marsh Hand (§116), the default attributes |

## Proof

`equivalence.test.ts` runs every `__fixtures__/sample-*.inputs.json` case
through the port and compares with answers generated from the sim
(`generate-expected.mjs`, never from the port) to 1e-12 relative. Sample `a`
is hand-written; `b` was drawn fresh (`draw-sample.mjs b 20260924`) after
`a` passed and passed with no change. `stats.test.ts` holds the design's
reference numbers (Marsh Hand: 100 health, 100 stamina, 180 kg, 25.0 %
mitigation), the owner's Marksman mastery numbers, monotonicity, purity,
and a data diff that fails if any sim number moved other than the recorded
differences.
