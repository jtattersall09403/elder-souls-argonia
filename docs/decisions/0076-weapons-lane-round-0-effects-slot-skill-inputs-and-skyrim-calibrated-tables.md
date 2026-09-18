# 0076 — Weapons lane round 0: the effects slot, the skill inputs, and class and material tables calibrated against Skyrim's own records

**Date:** 2026-09-18. **Status:** delivered; the speed table and the
default skill wait on the owner's round-0 playtest (lane brief § Owner
check). Implements decision 0074 §2–3 round 0.

## What round 0 found before building

- `combat/resolveHit.ts` was already the single resolve step for every
  weapon contact (player→enemy and enemy→player). The slot was the gap.
- `RangedModifiers` already carried nock, draw and damage multipliers and
  the sandbox already had nock and draw sliders, but the `damage` field
  was applied nowhere: the arrow's impact damage went straight to the
  target. The archer's skill had a name and no effect.
- The inventory's weapon numbers were derived from the class and material
  tables, not placeholders; what was unverified was the tables themselves.

## Decisions

1. **The effects vocabulary is a typed union on the class, resolved in one
   fixed order** (`combat/README.md`): i-frames, guard, incoming damage
   (motion value × hit zone × the attacker's damage position), armour
   pierce, armour mitigation, then status effects from the damage that
   landed. `WeaponClassEffect` has two proving entries: `armourPierce`
   (mace 25 %, warhammer 35 % of the defender's rating ignored) and `bleed`
   (axe 25 %, battleaxe 30 % of landed damage again over four seconds).
   Blocked and dodged blows apply none. A new kind extends the union and
   `classEffects.ts`; `resolveHit`'s order never changes. The numbers are
   proving values for 10c to tune.
2. **Skill enters as two records of multipliers, never as a number a rule
   reads.** `MeleeModifiers { damagePosition, staminaCost }` and the
   existing `RangedModifiers`, produced by `skillScalars.ts` from a 0–100
   skill: nock ×1.0→1.6 and draw ×1.0→2.0 from skill 10 to 100 (owner
   2026-09-18, 0074 §3, held at ×1.0 below 10); damage-range position
   0.40→1.00 across 0–100, stamina ×1.25→0.80, sway ×1.4→0.6, draw stamina
   ×1.25→0.80 (module 76 §118). The marksman damage multiplier is applied
   inside `resolveArrowImpact` on top of the physics, as 76 §121.1 says.
   Damage position is applied once, at resolve time, so no path can scale a
   blow twice.
3. **The sandbox keeps its calibrated feel by default.** The skill curves
   are applied only when the HUD's "Apply skill curves" box is ticked
   (`skillsEnabled`, default off): with it off every rule takes neutral
   multipliers and the visual scenarios tuned before this round still pass;
   when the box is ticked, a starting character at skill 10 lands 0.46× a
   master's damage with the same gear, the design's own consequence. Class
   effects are on by default. The first cut defaulted the curves on and the
   `attacks` visual group failed on exactly that (a third heavy unaffordable
   at stamina ×1.20; an enemy left standing at 28 health).
4. **The class table is calibrated to Skyrim's records where Skyrim has
   one.** `weapon_records.py` mines WEAP and shield ARMO records for all 53
   arsenal items into `equipment/generated/weapon-records.json` (source
   hash recorded; the report is
   [skyrim-weapon-records-fit.md](../research/combat-and-systems/skyrim-weapon-records-fit.md)).
   `speedScale` adopts the report's table: dagger 0.74, scimitar **0.85**
   (owner: felt as faster than the sword, so pulled clear rather than
   Skyrim's equal 1.0), axe 1.11, mace 1.25, greatsword 1.40, battleaxe
   1.43, warhammer 1.62, halberd 1.45, hunting bow 1.00, longbow 1.10;
   others unchanged. The scimitar keeps `powerScale` 0.95: speed is paid
   for with a little damage, the curved-sword trade, though Skyrim's
   unique scimitar hits harder than a sword.
5. **Four material contradictions fixed, two kept on purpose.** Silver is
   now the light blade Skyrim makes it (weight ×0.7, no damage bonus);
   imperial issue is cheap (9 gold/kg, below steel's 16); dwarven hits as
   hard as Bethesda's (×1.25); nord hero (×0.9) and akaviri (×1.0) weights
   un-inverted. Kept: one-handed classes ~25 % lighter than Skyrim's
   (deliberate, the Souls-like feel of a quick one-hander); one weight
   scale per material even though Bethesda's ratios vary by class (the
   two-axis table is the right simplification; recorded so nobody "fixes"
   a per-class mismatch).
6. **The hit-zone multiplier rides in the same argument as the archer's
   skill** at both arrow sites (`resolveArrowImpact(..., skill × zone)`),
   documented at the call. Enemy archers shoot at ×1 until 10c gives them
   skills.

## Consequences

- Fighters carry `status: ActiveStatusEffect[]`; bleeds tick per frame
  through `tickStatusEffects` and kill through the existing death path.
- The sandbox HUD shows a marksman-skill and a weapon-skill slider with the
  derived multipliers inline, plus a class-effects checkbox.
- The buildout register's "combat verb completion" hook now exists in code.
- Round 1 (polearms) authors every new class with an `effects` list and a
  `speedScale` argued from Skyrim's ordering or, where Skyrim has no
  record, from mass.
