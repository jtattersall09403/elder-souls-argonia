# 0090 — Arrow damage is calibrated to a master's warbow headshot; bows take no Strength

**Date:** 2026-09-24. **Status:** accepted (planner ruling for the owner's
round-2 feedback, combat-sandbox lane; supersedes the lane's first cut, which
put Strength on bows).

## Context

The owner asked that a master archer kill the default opponent with one
daedric warbow headshot. The lane first did it with Strength's `(Str+50)/100`
on bow damage. Module 76 §117 divergence 1 keeps Strength off Marksman, and
the stats model encodes that (`strengthApplies("marksman") === false`), so the
ruling moved the one-hit kill into the arrow's own damage calibration.

## Decisions

1. **Bows take no Strength term.** The sandbox reads `marksmanModifiers` and
   `meleeModifiers` from `game-core/src/stats` (the lane's linear
   `combat/skillScalars.ts` is deleted). Melee blows carry the model's
   `strength` into `resolveHit` beside `damagePosition` (×1.0 at the reference
   Strength 50); the weapon class picks the melee skill
   (`equipment/weaponSkill.ts`, Morrowind's mapping: staves Blunt, halberds
   Spear, claws Short Blade).
2. **One knob: `DAMAGE_PER_JOULE` 0.5 → 0.57** (`combat/ballistics.ts`).
   The head-zone multiplier stays ×2 for every weapon; the constant is the
   physics-to-health conversion, so all arrows (the enemy archers' too) rise by
   the same ~14 % before armour.
3. **The check** (`combat/arrowCalibration.test.ts`): full draw, daedric war
   arrow, the hollow warden (150 health, rating 39), marksman at the reference
   attributes.

| Bow | Skill | Head, point-blank | Head, 20 m | Body |
|---|---|---|---|---|
| daedric warbow | 100 | 165.1 | 161.0 | 82.5 |
| daedric warbow | 10 | 92.1 | 89.9 | 46.1 |
| steel longbow | 100 | 86.5 | 84.4 | 43.3 |
| steel longbow | 10 | 48.3 | 47.1 | 24.1 |
| wood shortbow | 100 | 53.8 | 52.5 | 26.9 |
| wood shortbow | 10 | 30.0 | 29.3 | 15.0 |

## Consequences

- A headshot one-hit kill on the warden needs the warbow, the best arrow and
  mastery; the longbow and shortbow need two to five.
- 10c's per-weapon bands and real attributes will move these numbers; the
  test is the record to re-run.
