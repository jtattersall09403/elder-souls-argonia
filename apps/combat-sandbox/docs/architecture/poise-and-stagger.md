# Poise: whether a hit interrupts you

The rule that decides if a blow plays a reaction. Design is module 76 §121.3
(owner ruling, decision 0037); DS1's mechanics are researched at
[docs/research/dark-souls-poise-mechanics.md](../../../../docs/research/dark-souls-poise-mechanics.md);
the implementation and its seams are `packages/game-core/src/combat/poise.ts`,
which is commented to be read.

## The shape

Every character — player and NPC alike — has a hidden pool. Each hit subtracts
that attack's **poise damage**, which is a *weapon-class* stat multiplied by an
attack-type factor and has nothing to do with health damage. While the pool
holds, the hit lands and plays no reaction. When it empties, the character
staggers (the existing heavy reaction; no new clip) and the pool resets.

It does not trickle back. It sits where the last hit left it and refills
**instantly, in full**, after a quiet interval that every hit restarts. That is
what makes poise a breakpoint stat — "can I take one more of those" — rather
than a second stamina bar.

`maxPoise = Agility/2 + Σ worn pieces + effects`. Agility/2 is Morrowind's
knockdown threshold re-housed, so a naked character still shrugs something.

## The numbers are provisional, and that is the design

§121.3 says so: poise is feel, and feel is calibrated with a controller in
hand at 10c. Everything tunable is a named constant or a table in `poise.ts`.
`poisePerArmourRating` is the one most likely to move — it has already moved
once, because the first value made the sandbox's *starting* kit strong enough
to ignore four consecutive sword hits.

Two aids exist for judging it: a **poise bar** on the HUD, and a **Poise switch**
in the debug panel that restores flinch-on-every-hit, so the two can be
compared in one sitting with nothing else different.

## Where the stat system plugs in

`PoiseModifiers` — Agility, the armour-class skill score, effect bonuses, a
refill scale. Every field is optional today and none will be to the compiler at
10c. Filling the stat system in means passing a populated object, not hunting
for where a multiplier should have gone. Same seam `RangedModifiers` gives
archery.

## Evidence

`poise-break` is the scenario that proves it: three light attacks land, the
first two are absorbed without a flinch, the third breaks through.

The scenes that review a *reaction clip* (`hit-reactions`, `death`,
`offense-outcomes`, `enemy-light-combo`, `enemy-heavy-attack`) declare
`player.poise: false` and keep their calibrated staging. They are about whether
`HIT` and `HIT_HEAVY` render correctly, not about when they are reached, and
bending them until a reaction falls out would make them worse at the job they
have.
