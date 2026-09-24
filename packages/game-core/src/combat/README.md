# combat — how one blow resolves

Every contact in play, player→enemy and enemy→player, melee and arrow,
goes through **`resolveHit`**. There is one order, it lives in that file's
header; it does not change:

1. **i-frames** — a defender inside dodge invulnerability takes `iframe` and
   nothing else happens (an execution ignores i-frames).
2. **guard** — a raised guard is resolved by `resolveGuardImpact`
   (`blockReaction.ts`) into `blocked` or `guardBroken`. Class effects take no
   part: a guard or a miss bleeds nobody, so those results carry no `status`.
3. **incoming** = attack damage × hit-zone multiplier × the attacker's
   `damagePosition` × the attacker's `strength` × the class's critical multiplier
   (`classEffects.criticalMultiplier`: `critChance` when the caller's
   `critRoll` falls under the chance; never on a riposte or backstab) × the
   **sneak multiplier** (`HitContext.sneakMultiplier`, default 1): the stats
   model's §121.5 table for a blow on a defender that had not engaged
   (decision 0092). An unseen backstab reaches here as the main weapon's
   `light1` with that multiplier, never the backstab's own critical damage:
   the two tables never stack.
4. **rating** = the defender's armour rating reduced by the weapon class's
   `armourPierce` shares (`classEffects.effectiveArmourRating`).
5. **landed** = `damageAfterArmour(incoming, rating)` (`armourMitigation.ts`).
6. **status** = the class's after-effects scaled by what landed
   (`classEffects.bleedFromLandedDamage`), returned on `hit` and `execution`.

Poise (`poise.ts`) and backstab entry (`backstab.ts`) decide *reactions* and
*openings*, not damage; they sit outside this order on purpose.

**Which blade.** An attack's `hand` (`AttackSpec.hand`: `main` by default,
`off` or `both` for dual wield, decision 0091) says which held item cuts. The
runtime arms one sensor per hand and each hand resolves its own contact once
per attack, through `resolveHit` with that hand's weapon: its damage, class
effects, skill and poise. Dual wield's attacks (`offLight`, `offPower`,
`dualPower`, `equipment/movesets/dualWield.ts`) run as combat actions of the
same names and never chain; the enemy AI reads them as the light and heavy
they cost. Off-hand attack presses are the input controller's `offLight` /
`offHeavy` actions (`io/input.ts`): desktop taps and holds the guard button, a
pad or touch screen presses guard (light) and parry (power).

## The effects vocabulary

`WeaponClassEffect` (`equipment/types.ts`) is a closed union of data carried by
every entry in `WEAPON_CLASSES` as `effects`:

- `{ kind: "armourPierce", share }` — ignores that fraction of the defender's
  armour *rating* (not of the damage), so a crushing weapon gains most against
  heavy armour and nearly nothing against bare skin. Mace 0.25, warhammer 0.35.
- `{ kind: "bleed", fraction, seconds }` — extra damage equal to `fraction` ×
  the health damage that landed, paid evenly over `seconds`. Axe 0.25/4 s,
  greataxe 0.3/4 s.
- `{ kind: "critChance", chance, multiplier }` — a blow lands as a critical for
  `multiplier` × its incoming damage when the hit's roll falls under `chance`.
  The roll is the caller's (`HitContext.critRoll`), so the rule stays
  deterministic; a validation scene passes 1. Straight sword, rapier and katana
  0.10 / ×1.5 (Skyrim's Bladesman first rank is the prior; lane round 2).

Every other class is `[]` today. These are proving numbers; round 10c tunes
them.

**Rule: a new effect kind extends `WeaponClassEffect` and `classEffects.ts`.
`resolveHit`'s order never changes.** That is what the slot is for — a stagger,
a poison or a shield-splitter is two small edits, not a rewrite of the step
that resolves every blow.

Live effects on an actor are held in `Fighter.status` and ticked by
`tickStatusEffects` (`statusEffects.ts`), which is pure: it returns a new array
and the damage owed this frame. Entries stack; each runs its own clock.

## Where skill enters

Skill is never read by a rule file. It is turned into plain multipliers first;
every rule takes the record and defaults to neutral:

- **Melee** — `MeleeModifiers` (`modifiers.ts`). `staminaCost` is baked into a
  moveset once by `applyMeleeModifiers`; `damagePosition` is applied *only* at
  step 3 above, so a blow can never be scaled twice by the same skill.
- **Ranged** — `RangedModifiers` (`ballistics.ts`), consumed by `bowShot.ts`.
- The curves from a skill number to either record live in `skillScalars.ts`.
