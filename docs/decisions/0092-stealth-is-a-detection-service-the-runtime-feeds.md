# 0092 — Stealth is a pure detection service the runtime feeds; awareness is unaware, suspicious or engaged; the first unseen blow takes the sneak table

**Date:** 2026-09-24. **Status:** accepted (combat-sandbox lane round 4, under
0087's delegation). Implements module 76 §118 (Sneak row) and §121.5 in a
sandbox slice.

## Decisions

1. **Detection is pure and injected** (`game-core/src/perception/detection.ts`).
   Elusiveness = (Sneak + Agility/5 − boot weight kg) × (0.5 + distance / 7.14 m)
   (Morrowind's 500 units), zero when not sneaking; an observer sees the target
   when line of sight holds, the target is within view range, and spot score ×
   direction (×1.5 inside the view cone, ×0.5 outside) × light (×0.5 dark → ×1
   lit) ≥ Elusiveness. Compared, never rolled. The caller supplies positions,
   its own raycast result, the target's light level and what the observer heard,
   so a lantern, a light spell, footsteps, armour noise or a faction's standing
   feed the rule without changing it.
2. **Awareness is three states** with a versioned, serialisable record
   (standard 17): unaware → suspicious (glimpsed, or a noise at loudness 1 gives
   0.5 suspicion) → engaged (0.8 s of continuous sighting, or being struck);
   engaged falls back to suspicious after 6 s unseen; suspicion drains 0.1/s.
   Numbers are the lane's proving values for 10c to tune.
3. **Noise is loudness × distance falloff** (`perception/noise.ts`, 15 m
   radius): the player's walk, run, sprint, landing, roll, swing and a block hit
   each have a loudness; sneaking steps are nearly silent.
4. **Behaviour by state.** Unaware: idle, no turning, no intent; suspicious:
   turn toward the last known position, no intent; engaged: today's AI. Spot
   score and view cone are per archetype data (`perception` on
   `EnemyArchetype`), placeholders until 10c's D-ladder supplies them.
5. **The sneak table on the first unseen blow.** A player blow on an enemy that
   is not engaged takes the stats model's `sneakMultiplier` for the weapon's
   sneak kind and the player's Sneak skill (§121.5); a backstab animation on an
   unaware enemy resolves as light1 × that multiplier, never the backstab's own
   critical on top (the two tables never stack). The blow engages the enemy.
6. **Sandbox surface.** "Enemies start unaware", a Sneak skill slider and an
   ambient-light slider in the debug panel; a detection meter in the HUD; view
   cones drawn with the weapon-volume debug switch.

## Consequences

- Detection always runs; "Enemies start unaware" only chooses the starting
  state (off: every enemy starts engaged, today's fight). An engaged enemy can
  still lose a player who crouches out of sight for 6 s, as in Skyrim. The
  calibrated scenarios are unchanged: none of them sneaks.
- Measured (`sneak-attack` scene): an iron dagger's backstab on an unaware
  warden at Sneak 50 resolves as light1 11 × 7 = 77 before armour, 61.1 after
  the warden's rating 39; the backstab's own critical is not applied.
- The world studio and the game feed the same service: their raycast, their
  light (time of day, carried light), their noise and their factions.
