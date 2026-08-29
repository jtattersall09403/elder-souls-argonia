# Part VIII-b — Stats, progression and character systems (§100–104, §116–129)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles.
>
> Companion: [75-combat-compatibility.md](75-combat-compatibility.md) (§51–57) — the
> portability boundary and capability profiles this module feeds. Sequencing:
> workstream **S** (design, parallel) → **Phase 10c** (implementation), Module 95 §86,
> decision [0019](../decisions/0019-stats-system-workstream-and-placement.md).

**Two halves.** §100–104 are the workstream: what exists, what binds the design,
how it was run, and what Phase 10c must build. **§116–129 are the decided
design** — the spec. An agent implementing 10c, authoring an enemy, pricing a
service or gating a quest reads the design half and can skip the rest.

| Looking for… | Section |
|---|---|
| The binding constraints (fixed danger, no dice, protected feel) | §102 |
| What Phase 10c ships | §104 |
| The character at a glance | §116 |
| Attributes · skills · character creation | §117 · §118 · §119 |
| Levelling, *vastei*, health, anti-grind rules | §120 |
| Damage, stamina, poise, armour, blocking, condition | §121 |
| Movement, burden, swimming, climbing, breath | §122 |
| Magic, spellmaking, enchanting | §123 |
| Alchemy, smithing, trade, training, crime | §124 |
| Speech, disposition, faction standing | §125 |
| Healing, rest, saving, death, respawn | §126 |
| Races, birthsigns, and the one effects stack | §127 |
| The D0–D5 absolute ladder and the NPC/enemy schema | §128 |
| Where the numbers live (data files) | §129 |

## 100. What exists today, and why that matters

The combat sandbox ships a working, tuned combat model with **no character
statistics behind it** (`packages/game-core`): health/stamina constants for the
player, one enemy archetype, real per-item weapon/armour/material/arrow
properties, and races that are bodies only. No attributes, skills, resistances,
carry weight, birthsigns, levels or experience — but `AttributeId`, per-weapon
`requirements`/`scaling`, `RangedModifiers` and `CapabilityProfileId` are all
declared and unread: the insertion points. Snapshot of the numbers:
[research/stats-progression-repo-baseline-and-quest-inputs.md](../research/stats-progression-repo-baseline-and-quest-inputs.md).

The combat *feel* is calibrated and playtested; what was missing is the layer
that makes those numbers vary by character. The stats work is therefore
**additive**: it decides where today's calibrated feel sits on the curve and
varies from there — it does not re-answer "is the combat fun?".

## 101. Why this is its own workstream, not a side-effect of another phase

Design-decision-heavy and owner-owned; broad rather than deep (races,
equipment, combat, movement, magic, disease, dialogue, loot, encounters); and
almost independent of the world build, so it can run in parallel. Hence
workstream **S** produces the design and the owner decisions (round 1 closed
2026-08-28, decision [0031](../decisions/0031-workstream-s-round1-shape.md));
**Phase 10c** implements it. Rationale in full: decision 0019.

## 102. The constraints any stat design must satisfy (binding)

These are not open questions — they follow from decisions already taken.

- **Fixed difficulty (decision 0004) is the dominant constraint.** The world
  never receives the player's level. Every enemy, every trap and every loot
  item is authored as an **absolute** number, so the stat system must have a
  **stable, documented power scale** — a Phase 13 author saying "this is a D3
  creature" has to mean something numerically (§128).
- **Fixed difficulty binds the world, never the player** (owner ruling,
  2026-08-28). It fixes the world's enemies, stats and parameters; it never
  caps the player's earned capacity to cope. Earning money and alchemy skill
  to brew your way through a hard area is the intended fun, not a breach —
  this is what killed the estus flask (§126) and it is the tie-breaker for any
  future "should we bound the player here?" argument.
- **Becoming absurdly powerful is a feature, not a bug** (owner, 2026-08-25).
  It is fixed danger's payoff: because the world stays put, growth is legible
  (the swamp that killed you at hour three is trivial at hour eighty). What
  the design protects instead:
  - **power must be earned through system mastery**, discovered and combined by
    the player (alchemy, enchanting, trade, training, rare gear, quest
    rewards) — emergent, not handed out by the levelling curve;
  - **it must not be the intended path.** The critical path and the fixed
    danger bands are tuned for a competent, ordinarily-equipped character;
  - **it should not be the norm in the first hours** — design intent, **not an
    enforced invariant**: build no validation machinery for it. An *accidental*
    early gem is an easter egg, not a bug — the **Morrowind jump-scroll rule**
    (owner, 2026-08-25);
  - **the world must not break when it happens** — quests, gates and access
    progression degrade into "you skip the challenge", never into unfinishable
    states.
- **Player skill stays the primary variable in ordinary play.** Dark Souls
  combat: real-time hitboxes, parry windows, i-frames, stamina. So **no hidden
  to-hit roll** — a swing that visibly connects lands. Character skill modifies
  damage, stagger/poise, stamina cost, recovery, reach and reliability, never
  whether a physically-connecting attack registers. **No dice anywhere in the
  design** (combat, casting, blocking, locks, persuasion, enchanting, repair):
  every check is a threshold or a continuous scale.
- **Stats never touch feel constants.** i-frame windows, parry windows, input
  responsiveness and animation windups are never stat-gated (the Dark Souls 2
  Adaptability disaster). Recovery phases, stamina costs and roll *distance*
  are fair game.
- **Today's combat values are calibration data, not the neutral baseline**
  (§52; owner clarification 2026-08-25). The design chooses where today's feel
  sits on the curve and re-bases magnitudes freely; what is protected is the
  **calibrated feel at the reference loadout** (§116) — timing and weight —
  while stat- and load-linked variation (recovery scaling, equip-load roll
  tiers) is design space, not drift.
- **Capability profiles are the world↔stats contract** (§52, §122). Profiles
  are *generated from the stat system* at 10c and no world data changes; this
  is why the world build is not blocked on stats.
- **Argonian physiology is a world-acceptance rule** (00-core): breath,
  swimming and disease resistance are race modifiers (§127).
- **Birthsigns are calendar-shaped**: a birth date yields a birthsign for free
  from the world clock (module 55 §95). The slot ships; the content is deferred.
- **Respawn-on-rest is a world ruling** (owner 2026-08-28, decision 0031):
  generic enemies respawn when the player rests; named actors never; cleared
  dungeons stop. Binding on Phases 11/12/13 as well as here (§126).

## 103. Workstream S — how the design was settled

Ran as docs + decisions, in parallel with Phases 8–10, in **two batched owner
rounds**. Evidence and rejected options live in `docs/research/`:
[reference games](../research/stats-progression-reference-games.md) (Morrowind's
real formulas, the Souls layer, Skyrim's lessons, mod-scene sourcing),
[repo/quest inputs](../research/stats-progression-repo-baseline-and-quest-inputs.md),
[mapping inventory](../research/stats-progression-mapping-inventory.md) (every
seam the chosen shape creates),
[owner round 1](../research/stats-progression-owner-round1.md) (**the single
source of truth for the rulings**),
[numbers packet](../research/stats-progression-numbers-packet.md) (the ladder
derivation, worked characters, simulation findings), and
[owner round 2](../research/stats-progression-owner-round2.md).

### 103.0 The chosen shape

**"Morrowind chassis with a Souls combat layer"** (owner steer, 2026-08-25).
Not re-litigated: the workstream's job was the mapping between the two systems
against our actual asset base, plus surfacing the decisions nobody had asked
about. The stress-test verdict was that the prior holds — every Morrowind
pathology maps onto a part we were deleting anyway (the dice, the level-up
bookkeeping, the unclamped self-referential loops).

**The asset base constrains the design**: sourced items arrive in Skyrim's
taxonomy and the chassis wants Morrowind's categories. The item mapping is
§118/§121; the keep/drop outcome (spears/pikes/halberds/staves, medium armour
and unarmed kept; whips, crossbows and thrown weapons cut) is decision 0031,
with sourcing evidence in module [90 §74.3](90-asset-strategy.md).

### 103.1 Run-book state (an agent can start from this section alone)

Told only "deliver workstream S", read this module, decision 0019, decision
0031 + the round-1 doc, [75 §51–52](75-combat-compatibility.md), and decisions
0004/0007. **Steps 1–7 are complete** (2026-08-29): research packet, mapping
inventory, owner round 1, the design detailed below (§116–129), the numbers
packet and the balance-simulation harness `tooling/stats-sim/`.

**What remains is step 8 — owner round 2**: the assembled design, the numbers,
the simulation findings and the full list of proposed defaults, reviewed in one
sitting ([owner round 2](../research/stats-progression-owner-round2.md)). Fold
answers back into §116–129, record them in a decision record, then:

**Done when**: every axis is decided or default-accepted, the §102 constraints
and the cross-checks below hold, and Phase 10c could be implemented by an agent
reading only this module and the decisions. Flip the PROGRESS row to `done`.

**Cross-checks** (re-run before closing): the design satisfies §102; it can
express the existing enemy archetypes and the D0–D5 bands; it can express the
access-progression model (0007) and the quest plan's skill, faction and
reputation gating; every stat that changes movement, swim/climb speed or burden
maps into capability-profile *ranges* (§52); it reproduces today's feel at the
reference loadout; every stat gate is expressible as a typed quest condition.

**Game code stays out of scope** — implementation is Phase 10c and must not
start early. The one exception is the simulation harness (`tooling/stats-sim/`,
data-in/report-out, touches no game package); at 10c its invariants are ported
as standing tests.

## 104. Phase 10c — implementation

Implements §116–129 in `packages/game-core` (stats live with the game layer,
consumed by both apps). Definitions land as **data files consumed like
`races.json`/`enemyArchetypes`** (§129), not code sprawl. Then:

- **reference-loadout equivalence asserted** (§116): the reference character
  reproduces today's timing, weight and per-hit numbers; deliberate stat/load
  driven variation is implemented as designed and is not treated as drift;
- capability profiles regenerate from the stat system and the world's
  traversal/validation probes still pass (§52, §122);
- **the NPC/enemy stat model ships alongside the player's** (§128): every NPC,
  enemy, follower and merchant carries the same schema plus a level, authored
  **semantically and compiled to absolutes**. Derivation reads world data only,
  never player state, so 0004 is untouched — the numbers are as fixed as ever,
  merely *derived*, so a curve retune + recompile + sim re-run rebalances all
  content coherently;
- the estus flask is removed and replaced by the potion economy (§126);
- character-sheet, level-up and rest UI in the studio and the sandbox;
- enemy archetypes restated on the new scale;
- **the simulation invariants become standing tests** (§103.1 step 7) so later
  tuning and content authoring cannot silently break the balance envelope;
- the power ladder documented for Phase 13 authors (§128).

Sequenced after 10b (parity) and **before Phase 11**: settlements, dungeons and
especially Phase 13 author absolute numbers, and re-authoring that content
against a scale invented afterwards is the expensive mistake this ordering
avoids.

---

# The decided design (§116–129)

Everything below is decided (owner round 1 + proposed defaults pending round 2).
Numbers are the *shapes and constants*; the machine-readable tables live in
`tooling/stats-sim/data/` (§129) and are what 10c ports.

## 116. The character in one screen

A character is: **7 attributes**, **27 skills**, a **level**, a **race**, a
**birthsign**, a **class** (5 major / 5 minor / a specialization / 2 favoured
attributes), **health / stamina / magicka**, an **inventory with weight**, an
**effect stack** (§127) and a **vastei** balance (§120).

Everything mechanical is derived from those by the formulas below. Two
conventions make the whole system one system:

1. **One skill curve.** Every skill's effect is that curve mapped onto that
   skill's own band:

   ```
   k(s)   = 1 − (1 − s/100)^1.6          # 0 at skill 0, 1 at skill 100
   effSkill = skill + clamp((governingAttribute − 50)/5, −10, +10)
   band(lo,hi) = lo + (hi − lo) × k(effSkill)
   ```

   `k` is front-loaded and self-soft-capping: skill 25 buys 36 % of the range,
   50 buys 67 %, 75 buys 88 %, the last 25 points buy 12 %. Attributes matter
   everywhere without buying anything twice — that is the **attribute assist**,
   and it is why the governing attribute of a skill is a real choice.
2. **One effect stack.** Racials, birthsigns, diseases, potions, spells,
   enchantments and the allegiance rites (decision 0028) are all `StatEffect`
   entries against the same fields (§127). Nothing has a bespoke pathway.

**The reference character — "the Marsh Hand"** (the protected calibration
anchor, §102): level 10; Str 50, End 50, Agi 50, Spd 50, Wil 40, Int 40, Per 40;
Long Blade 60, Block 50, Heavy Armor 45, Athletics 40; carrying the reference
loadout (steel straight sword, steel kite shield, steel cuirass/gauntlets/boots,
head bare, iron war arrows) at **mid burden**. This character has 98 health,
100 stamina, 180 kg capacity, 25.0 % mitigation against a 24-damage blow and
today's exact timings — i.e. the sandbox as playtested. Every band below is
written so the Marsh Hand sits where today's feel already sits.

## 117. Attributes

Seven (Morrowind's eight minus Luck — Luck's only mechanical job was modifying
dice, and there are no dice). Range 0–100 by purchase; effects may push a
value above 100 and the design does not cap that (§102, god-build).

| Attribute | Derived quantities |
|---|---|
| **Strength** (Str) | carry capacity `30 + 3×Str` kg · health base (with End) · attribute assist for Str-governed skills · unarmed damage contribution |
| **Endurance** (End) | `maxHealth = 0.5×(Str+End) + level×(1.5 + End/15)` · `maxStamina = 60 + 0.8×End` · poise base · floor on disease/poison resistance |
| **Agility** (Agi) | `staminaRegen = 12 + 0.24×Agi` per second · dodge/roll stamina discount (−0.2 % per point over 50) · knockdown resistance · bow steadiness |
| **Speed** (Spd) | ground, swim and climb speed within the capability bands (§122) · attack and cast **recovery** scaling (never windup) |
| **Willpower** (Wil) | `magickaRegen = 0.5 + 0.05×Wil` per second · concentration (stagger resistance while casting) · resist magic/paralysis floor |
| **Intelligence** (Int) | `maxMagicka = 20 + 3×Int` (×race/birthsign multipliers) · alchemy potency · enchanting point budget |
| **Personality** (Per) | base disposition · price band with Mercantile · speech score (§125) · faction standing gain rate |

Health is **continuous and retroactive by construction** — it is a formula over
current End and level, so raising Endurance late credits every past level. That
one choice kills Morrowind's "max Endurance first" pathology outright.

## 118. Skills

Morrowind's 27, with three substitutions: **Armorer → Smithing** (repair +
bounded tempering + crafting, the Skyrim keeper), **Mysticism kept** despite the
4E Synod dissolution (foreign magical institutions never took root in Black
Marsh; the folk school survives — lore note in
`world/sources/lore/topics/magic-practice.md`), and every dice-based skill
re-expressed as a threshold. No pickpocketing verb, no crossbow or thrown
skill (decision 0031).

Bands are written `lo→hi` across `k(effSkill)` (§116). "Wear" is condition loss
per use (§121).

| Skill | Gov. | Spec. | What the curve moves |
|---|---|---|---|
| Long Blade | Str | Combat | damage position 0.40→1.00 · stamina ×1.25→0.80 · recovery ×1.15→0.85 · wear ×1.4→0.6 |
| Blunt | Str | Combat | as Long Blade (class identity is the weapon table, not the skill) |
| Axe | Str | Combat | as Long Blade |
| Spear | End | Combat | as Long Blade |
| Short Blade | Spd | Stealth | as Long Blade + backstab damage ×1.0→1.25 |
| Marksman | Agi | Stealth | delivered-damage position 0.40→1.00 · draw speed ×0.85→1.20 · sway ×1.4→0.6 · draw stamina ×1.25→0.80 |
| Hand-to-Hand | Spd | Stealth | damage position 0.40→1.00 · stamina-damage ×1.0→1.8 · posture damage ×1.0→1.6 (§121) |
| Block | Agi | Combat | stability ×0.85→1.15 (absolute cap 0.95) · guard stamina ×1.30→0.78 |
| Heavy Armor | End | Combat | worn heavy rating ×0.55→1.20 · its effective weight ×1.10→0.90 · wear ×1.4→0.6 |
| Medium Armor | End | Combat | as Heavy, for medium pieces |
| Light Armor | Agi | Stealth | as Heavy, for light pieces |
| Unarmored | Spd | Magic | rating `0.006×skill²` pro-rata over armour slots left bare (60 at skill 100) |
| Athletics | Spd | Combat | run ×0.94→1.10 · swim ×0.85→1.30 · `breath = 25 + 0.35×Athletics + 0.25×End` seconds · sprint drain ×1.20→0.85 |
| Acrobatics | Str | Stealth | jump ×0.90→1.25 · safe-fall height 2.0→6.0 m · climb speed ×0.85→1.25 · climb stamina ×1.25→0.75 |
| Sneak | Agi | Stealth | noise radius ×1.25→0.55 · visibility ×1.20→0.60 (thresholds vs detection cones, never a roll) |
| Security | Int | Stealth | `openableLock = 15 + 0.85×effSkill + toolBonus(0/15/30/45)`; keys and Open magnitude always work |
| Smithing | Str | Combat | repair per stroke 6→22 condition · temper grades 0/1/2/3 at effSkill 25/55/80 · craftable material tier ≤ 1+floor(effSkill/14) |
| Mercantile | Per | Stealth | buy price ×1.35→0.80 · sell price ×0.55→0.95 (with disposition, §125) |
| Speechcraft | Per | Stealth | persuasion score (§125) · topic access thresholds |
| Alchemy | Int | Magic | potency/duration (§124) · ingredient effects visible at effSkill 15/30/45/60 |
| Enchant | Int | Magic | point budget ×0.6→1.6 · constant effect at effSkill ≥ 60 · charged-item use cost ×(1.1 − skill/100) |
| Alteration | Wil | Magic | spell tier gate · cost ×1.40→0.80 · cast time ×1.20→0.85 · magnitude ×0.75→1.25 |
| Conjuration | Int | Magic | as Alteration (+ summon duration ×0.8→1.4) |
| Destruction | Wil | Magic | as Alteration |
| Illusion | Per | Magic | as Alteration |
| Mysticism | Wil | Magic | as Alteration |
| Restoration | Wil | Magic | as Alteration |

**Weapon classes map to skills** by the chassis taxonomy, not Skyrim's 1H/2H
split, so a sourced item lands in the right skill automatically:

| Skill | Classes today (`equipment/weaponClasses.ts`) | Sourced additions (decision 0031) |
|---|---|---|
| Short Blade | dagger, shortSword | parrying dagger |
| Long Blade | straightSword, scimitar, greatsword | katana, rapier |
| Blunt | mace, warhammer, staff | quarterstaff, short staff |
| Axe | axe, greataxe | poleaxe |
| Spear | spear, halberd | shortspear (1H + shield), pike, trident |
| Marksman | shortbow, longbow, warbow | — |
| Hand-to-Hand | — (70 vanilla clips incl. beast claws) | — |

Class identity (speed, reach, power, stamina, guard) stays entirely in the
existing class table: the skill positions you on a weapon's range, it never
changes what kind of weapon it is.

## 119. Character creation

1. **Race** — attribute baselines, skill bonuses and a permanent effect package
   (§127).
2. **Birth date → birthsign** — the world clock's thirteen constellations
   (module 55 §95); the slot ships at 10c, the sign effects are content and may
   land later. A sign is an effect-stack entry like any other.
3. **Class** — Morrowind's structure in full: **5 major skills** (start +25),
   **5 minor** (+10), everything else miscellaneous (start 5), a
   **specialization** (Combat / Stealth / Magic: +5 to its skills and ×0.8 XP
   cost), and **2 favoured attributes** (+10). Preset classes plus a custom
   builder. Race bonuses stack on top; nothing here gates anything later — it
   shapes *growth rates* and the starting shape only.

Starting skill floor after all bonuses is 5; nothing starts at 0, so no skill
is unusable at creation. There are **no wield or use requirements** anywhere
(owner ruling): finding a way to a powerful weapon early is a legitimate joy.
Attribute requirements printed on items are **soft** (§121).

## 120. Progression: use, vastei, levels

Skills grow by doing; a currency called **vastei** accrues from the same
qualifying uses and is spent at the level screen to buy attribute points
(decision 0031, F1 variant ii).

### 120.1 Skill experience

```
useValue        = worthiness (0…1, §120.2), summed per qualifying use
pointsToNextRank = (skill + 1) × classFactor × specFactor
classFactor      = 0.75 major | 1.0 minor | 1.25 miscellaneous
specFactor       = 0.8 if the skill is in your specialization, else 1.0
```

Morrowind's linear `(skill+1)` curve, kept because it is clean and
self-balancing. Trainers and skill books grant ranks directly (§124) —
**and grant no vastei**, which closes gold → training → vastei → attributes.

### 120.2 Worthiness — the anti-grind rules ("in anger")

A use counts only if it could plausibly have mattered. This is one shared
worthiness function because vastei inherits every skill-grind exploit
(decision 0031); the simulation hunts the survivors.

| Family | A use counts when… | Damping |
|---|---|---|
| Melee / marksman / unarmed | the blow connects with a hostile, living actor that can fight back | value scales with `damageDealt / targetMaxHealth`, capped at 1 per blow; the same individual target yields diminishing value after the 6th connect |
| Block | a real incoming attack is absorbed | none needed |
| Armour skills | you take a hit while wearing that class | value scales with damage taken |
| Destruction / Restoration / Alteration / Illusion / Conjuration / Mysticism | the spell has a legal target and a real effect (damage dealt, wound closed, lock opened, creature summoned, a mind actually changed) | per-spell-per-rest diminishing returns; casting into empty air is worth nothing |
| Athletics | distance covered while running/swimming **outside settlement bounds** | per-rest cap ≈ 20 minutes of travel |
| Acrobatics | a jump that clears a real gap, or a survived fall that dealt damage | once per location per rest for falls (kills fall-grinding) |
| Sneak | you are inside a detection cone that could have seen you, and are not seen | only near actors that would react |
| Security | the lock's rating is within 10 of your current ceiling or above it | none |
| Alchemy | a brew you have not made since your last rest | per-recipe diminishing |
| Smithing | repairing real damage, tempering, or forging | value scales with condition restored / item tier |
| Mercantile | a transaction, value-capped by the vendor's purse | per-vendor-per-rest cap |
| Speechcraft | a check that had a real outcome (topic opened, price moved, quest branch) | never repeatable on the same NPC state |

Nothing accrues while an enemy is helpless-by-bug states (broken pathing,
stuck), against summoned-by-you creatures, or against actors flagged
`trainingDummy`.

### 120.3 Vastei — the currency

```
vastei per qualifying use = 4 × worthiness × (1 + effSkill/50)
```

Named for the Argonian word for **change** (`vastei`; one who brings necessary
change is *ku-vastei*) — the Clutch of Nisswo's doctrine that change is the only
god, and the reason the currency is *earned by acting* and *lost by clinging*.
Deliberately **not** soul gems, which keep their canon meaning: an Argonian's
soul is Hist sap and returns to the tree (dossiers
`topics/sithis-nisswo-shadowscales.md`, `topics/hist-and-sap.md`;
`topics/magic-practice.md` records the naming). The in-game UI label is
"vastei"; the tutorial line is "the change you have earned".

A property worth knowing (it falls out of the algebra, and the simulation
confirms it): because a rank costs proportionally more use-points than a
low-worth action supplies, **worthiness cancels** — the vastei earned while
taking one rank is `4 × (skill+1) × classFactor × specFactor × (1 + effSkill/50)`
regardless of *how* you earned it. The currency therefore cannot be farmed
faster than skill ranks themselves; the only exploit surface is §120.2, which
is exactly why those rules guard both.

Rules:

- **One job**: vastei buys attribute points at a level sitting. Nothing else.
  Gold buys everything else.
- **Death**: the carried balance drops at the death spot as a recoverable pile;
  dying again replaces it (the old pile is gone). Skills, levels, items and gold
  are never lost (§126).
- **Never granted by**: trainers, skill books, quest rewards or looting.

### 120.4 Levels and the level sitting

- **10 major/minor skill ranks → one pending level.** Once every major and
  minor is at 100, miscellaneous ranks count at **3:1** so the tail is graceful
  rather than a hard stop (Morrowind ended near level 78; we prefer a slope).
- **Resting consolidates one pending level per sitting** (§126). Health
  recomputes from the formula in §117.
- At the sitting you spend vastei on attribute points:

```
cost(attr, n) = base(level) × (1 + attrCurrentValue/50)² × (1 + 0.5×(n−1))
base(level)   = 40 × (1 + level/10)^1.3
n             = the n-th point bought in this attribute this sitting (cap 5)
```

  Three brakes in one line: attributes get dearer as they rise (a soft cap that
  needs no cap), each extra point in one sitting costs more (spread or commit —
  a real choice), and the level index means a hoarder gains nothing by waiting.
  **Unspent vastei carries over**; no level is ever wasted.
- **Deferral is strictly bad, by construction**: purchases happen only at a
  sitting, each pending level is its own sitting priced at its own level, and
  delaying levels delays health. The simulation asserts this as the
  *no-deferral-advantage* invariant.

### 120.5 Where late power comes from

Not the level counter. The curve `k` flattens, attribute costs escalate, and
the biggest damage lever stays **found gear** — which in a fixed world means
power is geography you conquered. On top of that sit the mastery systems
(alchemy, enchanting, spellmaking, smithing, trade, training) that the owner
explicitly wants to be able to run away with (§102).

## 121. Combat

### 121.1 Damage

```
listedDamage = motionValue(class, attack) × material.damageScale × 24   # today's code
P(effSkill)  = 0.40 + 0.60 × k(effSkill)                               # range position
damage       = listedDamage × P × conditionFactor × criticalMultiplier × hitZoneMultiplier
conditionFactor = 0.5 + 0.5 × (condition / maxCondition)
```

The listed number is the **top of the weapon's range** and a master reaches it;
a beginner strikes at 40 % of it. Nothing else multiplies raw melee damage —
Strength acts through the attribute assist inside `effSkill`, so it is felt but
never double-counted. Critical (×2) and head-zone (×2) multipliers are today's.

**Soft requirements.** Items keep their `requirements`, but they never block:
for a shortfall `d` (points below a requirement), stamina cost ×`(1 + 0.06d)`
and recovery ×`(1 + 0.05d)`, capped at `d = 20`. A heavy blade found early is
usable, exhausting, and glorious.

**Marksman** keeps the physical ballistics model; skill and Agility drive the
existing `RangedModifiers`, and `P(effMarksman)` multiplies delivered damage
(a clean loose, not a stronger arrow). **Arrow material is its own damage axis**
(Morrowind: iron 1–3 against daedric 10–15) — good arrows are placed loot, so a
marksman's endgame damage is geography like everybody else's. Arrowheads pierce:
armour is only ~60 % as effective against an arrow as against a blade.

**Hand-to-Hand** deals low health damage but heavy **stamina and posture**
damage (bands in §118); an opponent whose stamina is emptied by fists is open
to a knockout finisher — Morrowind's fatigue-knockout, Souls-shaped. Argonian
and Khajiit claw clips are already in the vault.

### 121.2 Stamina

`maxStamina = 60 + 0.8×End`; regen `12 + 0.24×Agi` per second after the
unchanged 1.05 s delay, suppressed while guarding. Action costs are today's
class-scaled values × the skill band × a burden multiplier (×1.00 fast, ×1.08
mid, ×1.20 fat). **One bar** — the second "fatigue" layer was rejected (owner
round 1, Q4); long-loop exertion (sprinting, swimming, climbing, heavy loads)
hooks this pool instead.

### 121.3 Poise and posture

```
poise = 0.2×End + 0.35×totalArmourRating
attack poise damage = motionValue × 0.55
```

Elden-Ring hybrid: a small passive threshold (an attack whose poise damage is
below half your poise causes a flinch, not a stagger), hyperarmor on committed
heavy attacks while the poise budget holds, and enemy **posture** — the existing
guard system generalised, so a broken posture is a critical opening. Thresholds
are calibrated at 10c so the reference character's reactions are exactly
today's; everything above the reference is gain.

### 121.4 Defence

```
mitigation = AR / (AR + 126 + incomingDamage)          # 0…1, never reaches 1
AR = Σ worn pieces (× that class's armour-skill band) + unarmoured contribution + effects
```

Today's asymptotic curve with one addition: **big hits punch through**. At the
reference (AR 50, a 24-damage blow) it returns exactly today's 25.0 %; the same
armour turns only 17 % of a 120-damage D5 blow, and a 150-AR endgame set turns
50 % of a light hit but 38 % of that D5 blow. That is the property a fixed-danger
world needs — armour that helps everywhere and trivialises nothing (Morrowind's
`min(1 + AR/dmg, 4)` shape, expressed in our curve so the reference is preserved).

**Armour classes are a per-material data tag** — no new assets, the Morrowind
category reintroduced by reclassification:

| Class | Materials |
|---|---|
| Light | studded, elven, glass, forsworn |
| Medium | imperial, falmer (chitin), draugr (ancient mail), orcish, akaviri |
| Heavy | iron, steel, silver, dwarven, nordhero, ebony, daedric |

Beast races wear **every** piece they can wear in Skyrim (owner veto of the
canon boot/closed-helm ban).

### 121.5 Blocking, condition, and what skill never touches

Blocking is the sandbox's existing stability/absorption/chip/guard-break system;
Block skill scales stability and cuts guard stamina cost. **Condition**: every
item has 0–100 condition, worn by use and by blocking, scaling damage and AR
through `conditionFactor`; an item at 0 is unusable but **never breaks
mid-swing** — no surprise. Repair is Smithing plus a hammer, or a service (§124).

Never stat-scaled, ever: i-frames, parry windows, attack windups, contact
windows, input buffering (§102).

## 122. Movement, burden, swimming, climbing

**Burden ratio** `r = carriedKg / (30 + 3×Str)`:

| r | Tier | Effect |
|---|---|---|
| < 0.20 | fast | roll distance ×1.10, roll recovery ×0.90, stamina ×1.00 |
| < 0.35 | **mid** (the reference) | today's roll exactly, stamina ×1.08 |
| < 1.00 | fat | roll distance ×0.80, recovery ×1.25, stamina ×1.20 |
| ≥ 1.00 | overloaded | cannot run, roll, jump or swim upward; walk at 40 % speed; may still fight and cast (Morrowind's hard stop, softened so it is never a soft-lock) |

**i-frames are identical in every tier** — tiers change distance and recovery
only (§102). The thresholds are calibrated (by the sim) so the reference kit is
*mid*, a full endgame plate kit is *fat* until Strength grows into it, and a
looted-up hoarder is *overloaded*: carrying capacity is a real progression axis
rather than a formality.

Everything the world's traversal validation consumes is a
`TraversalCapabilityProfile` field, generated at 10c from the stat system
(§52) instead of hand-set:

| Field | Formula / band | Reference value |
|---|---|---|
| walkSpeed / sprintSpeed | today's 4.5 / 6.0 × `Athletics run band` × `(0.92 + Spd/625)` × burden | 4.5 / 6.0 m/s |
| jumpApex | today's 1.378 m × Acrobatics jump band | 1.378 m |
| swimSpeed | `1.6 m/s × Athletics swim band × burden penalty (fat ×0.75)` | ~1.5 m/s |
| breathSeconds | `25 + 0.35×Athletics + 0.25×End`, **unlimited for Argonians** | 49 s |
| climbSpeed / gripStamina | `1.1 m/s × Acrobatics climb band` / drain × its stamina band | — |
| currentResistance / depthTolerance | End + effects (spells and gear can move both) | — |

Authored underwater routes are validated against profile **ranges**, so world
data never encodes a speed (module 60 §43). Spells, potions and enchantments
modify these like anything else (§127) — a water-breathing charm is a route
opener, never a mandatory gate (quest rule).

## 123. Magic

**Casting never fails.** Morrowind's cast dice are the magic twin of the
misclick-miss, and they are gone.

- `maxMagicka = 20 + 3×Int` × race/birthsign multipliers; regen
  `0.5 + 0.05×Wil` per second, full restore at rest. Both were raised by the
  balance sim: at the first (Morrowind-sized) values a mage could not sustain a
  boss fight even with a full potion belt. An Atronach-style sign may
  remove regen and add absorption — the hook exists.
- **Six schools** (Alteration, Conjuration, Destruction, Illusion, Mysticism,
  Restoration) as skills, plus Alchemy and Enchant. Mysticism survives here as a
  folk school (§118).
- **Spell tiers** gate what you can learn and cast, and are the "reaching a
  threshold feels like something" device the weapon skills gave up:

  | Tier | Skill gate | Damage | Magicka | Cast |
  |---|---|---|---|---|
  | novice | 0 | 9 | 8 | 0.8 s |
  | apprentice | 25 | 18 | 22 | 1.0 s |
  | journeyman | 50 | 40 | 48 | 1.2 s |
  | expert | 75 | 80 | 85 | 1.5 s |
  | master | 90 | 140 | 140 | 1.9 s |

  Spell damage is elemental: it **bypasses physical armour** and meets magic
  resistance instead (which is why a mage keeps pace against heavily-armoured
  endgame enemies), and it is the highest burst in the game — bounded by
  magicka, not by damage.
- Cost, cast time and magnitude scale on the same bands as weapons (§118), so
  **every damage source sits on one multiplier stack** — the fix for Skyrim's
  late-game Destruction collapse. The quest plan requires the hardest fight to
  be winnable by a magic build; this is what makes that true.
- **Spellmaking**: Morrowind's model — up to 8 effects, fee = 7 × magicka cost,
  magnitude/duration bounded by school skill and Int. Spells you cannot afford
  to cast are makeable and useless, which is self-limiting.
- **Spell-cost reduction** from enchanted gear is the classic mage endgame and
  we keep it, **capped at 50 %** across all sources — no stack ever reaches
  free casting (Skyrim's 100 %-reduction exploit, closed by a cap rather than
  by removing the fun).
- **Enchanting**: item capacity by slot/material/weight; constant effect needs a
  soul of 400+ and effSkill ≥ 60; charged-item use cost `×(1.1 − Enchant/100)`.
  **Learn-by-disenchanting** (the Skyrim keeper): destroying a magic item
  teaches its effect. Enchanting services exist and are expensive.
- **Two hard bounds** (the god-loop killers, from the documented Morrowind and
  Skyrim exploits): **no effect may fortify a crafting skill or an attribute
  that crafting reads**, and **all crafting reads base values** — never a
  fortified or drained one.
- **Scrolls** are single-use, unbounded by school skill, and deliberately
  spicy — the sanctioned early-power easter egg (jump-scroll rule, §102).
- Folk magic is the province's register (dossier `topics/magic-practice.md`):
  day-labourers casting Illusion, Hist spore-clouds, dream-wallow visions. No
  robed-mage guild is implied by any of this.

## 124. Crafting, economy, services and crime

**Alchemy** (Morrowind's shape, base stats only):

```
strength = (effAlchemy + Int/10) × apparatusQuality / (3 × effectBaseCost)
duration = (effAlchemy + Int/10) × apparatusQuality / effectBaseCost
```

Ingredient effects become visible at effSkill 15/30/45/60. Regional ingredients
come from the lore ecology feed. Potions are the healing economy (§126).

**Smithing** merges Morrowind's Armorer with Skyrim's forge: repair (rate and
achievable ceiling by skill), **tempering** to at most three grades (gated at
effSkill 25/55/80, each grade ≈ +8 % damage or AR — bounded so it cannot
trivialise a danger band), and crafting up to material tier `1 + floor(effSkill/14)`.
Convergent by rule: nothing fortifies smithing, and smithing reads base stats.

**Trade**: price = base × Mercantile band × disposition adjustment (±15 %). No
haggling minigame, no flat-value bypass merchants (Morrowind's Creeper), vendor
purses are finite and refresh on a schedule. Reward design still holds that
"gold is the least interesting thing we can give" (quests 00 §4) — gold's real
job is to feed training, services, potions and enchanting.

**Training and services**: a trainer raises a skill by one rank per session at
**8 × the target rank** in gold (≈6,300 for 30→50, ≈36,000 for 30→100 — a
major sink, and the reason gold matters in a province where quest rewards are
access rather than coin); **a skill can never be trained above its
governing attribute** (reads *base* values, so drain-and-train is dead). Skill
books grant one rank each, five per skill. Neither grants vastei (§120.3).
Services: repair, enchanting, spellmaking, recharging, cure disease, guides,
ferries, tolls, information (Ahnjazzi's danger oracle) — the sinks that make
gold matter.

**Crime is assessed as an Owing debt**, not a gold bounty (owner round 1, 13a):
the province has no courts, treasury or state prisons (quests 10 §5). A witnessed
crime produces an assessment in *nushmeekos* against the ledger, with regional
parameters (who assesses, at what rate, how transferable), city jails as the only
custodial fallback, and the existing Owing verbs — audit, buy out, burn, pay —
as the resolutions. Debt is never a player-spendable currency.

## 125. Speech, disposition and standing

Speech is a **first-class, ending-grade system** (owner round 1, 13b): every
ending family must be resolvable by speech-plus-evidence or a hard fair duel.

```
persuasionScore = 0.6 × effSpeechcraft + 0.4 × Personality
                + evidenceBonus (authored flags)
                + standingBonus (faction rank, reputation, disposition/2)
```

Checks are **authored thresholds** — never dice, never skill alone. A check
publishes what it wants, so a quest author can require "evidence X plus a
moderate tongue" or "no evidence, but a formidable one". Disposition is per-NPC,
moved by race/faction priors, deeds, gifts, bribes and quest state.
`FactionStanding {membership, rank, reputation, competencyFlags, sponsors}`
(quests 40 §27–28) supplies advancement and topic gates.

**Every stat gate must be expressible in the quest plan's finite typed condition
vocabulary** (quests 80 §58): `attributeAtLeast`, `skillAtLeast`,
`persuasionAtLeast`, `capabilityProfile`, `effectActive`, `itemInInventory`,
`factionStanding`, `evidenceFlag`. Nothing in this design requires new NPC
perception or pathing AI (the deliverability bound).

> **Owed doc fix (not applied — quest docs are owned by a concurrent workstream
> as of 2026-08-29):** speechcraft is missing from the capability-inspection
> list in `docs/quests/60-*.md` §49. Add it there when quest docs are free.

## 126. Health, rest, death and respawn

**Healing is potions** (owner round 1, Q7 = Morrowind-style). The estus flask is
**cut** and 10c removes it. Potions heal instantly and are stackable; their
bounds are weight, gold, alchemy skill, ingredient scarcity and the drink
animation (~0.9 s with recovery — a real commitment in a fight, never a
cooldown). Restoration spells heal too, on the same effect stack. This follows
directly from the owner's ruling that fixed difficulty binds the world and not
the player's capacity to cope (§102).

**Rest** is the one mechanic that carries: it saves, consolidates one pending
level and opens the attribute sitting (§120.4), restores health/magicka/stamina,
and (with safe-rest knowledge, decision 0007) feeds access progression. You may
camp **anywhere calm** — never in a dungeon, never in combat, never while
hunted. A hidden suspend-save covers browser interruption.

**Death**: you wake at your last rest. The world and your character persist; no
skills, levels, items or gold are lost; your carried **vastei** stays where you
died as a single recoverable pile, and dying again replaces it.

**Respawn-on-rest** (owner ruling, decision 0031, binding on Phases 11/12/13):
generic enemies — creatures, wildlife, miscellaneous dungeon denizens — respawn
when the player rests; **named NPCs, minibosses, bosses and quest actors never
do**; a cleared dungeon flips its generic population to non-respawning
(completion authored per dungeon); **waking from death counts as a rest**, so a
retrieval run crosses repopulated ground. Respawned creatures carry only their
template drops — **placed treasure never respawns**, so decision 0004 is intact.
The data model is a per-actor/per-socket respawn class
`onRest | never | untilCleared`, emitted by the Phase 12/13 compilers.

## 127. Races, birthsigns and the one effects stack

Racials are **Morrowind-weight**: permanent, build-defining packages, not
Skyrim's erasable +10s. Each race is `{attributeBaselines, skillBonuses,
effects[], powers[]}`. Argonian, exact (canon, *Morrowind:Argonian*):

- attributes M Str 40 / Int 40 / Wil 30 / Agi 50 / Spd 50 / End 30 / Per 30
  (F: Int 50 / Wil 40 / Agi 40 / Spd 40) — Luck's 40 is dropped with Luck;
- Athletics +15; Alchemy, Illusion, Medium Armor, Mysticism, Spear,
  Unarmored +5;
- **Resist Poison 100 %**, **Resist Common Disease 75 %**, **water breathing**
  (unlimited breath, §122);
- **no gear restrictions** (owner veto).

Other playable races port their Morrowind packages the same way (Breton magicka
and magic resistance, Dunmer fire resistance, Nord frost, Orc berserk, Redguard
adrenaline and poison/disease resistance, Bosmer/Khajiit stealth packages,
Altmer magicka with elemental weaknesses, Imperial personality/mercantile).

**One effect stack.** A `StatEffect` is
`{field, op: fortify|drain|damage|restore|resist|absorb|ability, magnitude,
duration|permanent, source}`, applied over base values. Every one of these is
the same kind of object:

| Source | Example |
|---|---|
| Race | Argonian Resist Poison 100 |
| Birthsign | Steed +25 Speed; Atronach absorption, no regen |
| Disease / blight | swamp fever: −10 End, −15 Athletics until cured (module 30 §26) |
| Potion / poison | Restore Health 60; Fortify Long Blade 10 for 60 s |
| Spell / enchantment | Water Breathing; Feather 80; Fortify Strength 20 |
| **Allegiance rites** (decision 0028) | corprus-style permanent packages: +Str/+End, −Wil/−Per, deepening per tier |
| Hist / quest state | permanent boons and marks |

Bounds carried from §123: no effect fortifies a crafting skill or a crafting
input attribute; crafting reads base values. Resistances are additive
percentages, clamped to 100 % for "immune" and allowed negative for weaknesses.

## 128. The absolute ladder (D0–D5) and the NPC/enemy model

Fixed danger means every actor is authored as an absolute. The bands are what a
Phase 13 author means by "a D3 creature" — anchored so the reference character
(§116) finds D2 a fair fight and D4 a bad idea.

| Band | Meaning (quests 20 §12) | Health | Light hit | AR | Magic resist | Poise |
|---|---|---|---|---|---|---|
| D0 | wildlife, nuisance | 20–45 | 4–8 | 0–6 | 0–5 % | 5–12 |
| D1 | low — an unprepared traveller may survive | 50–90 | 9–16 | 6–18 | 5–10 % | 10–20 |
| D2 | standard — a new but prepared character survives | 100–170 | 17–28 | 18–45 | 10–20 % | 18–35 |
| D3 | substantial combat/traversal capability required | 200–350 | 30–48 | 45–80 | 15–30 % | 30–60 |
| D4 | specialist equipment, route knowledge, allies | 400–700 | 55–85 | 80–130 | 20–35 % | 55–100 |
| D5 | fixed endgame, reachable early, never scaled | 650–1250 | 90–150 | 100–170 | 25–45 % | 90–180 |

`damage` is a **typical light hit**; heavy attacks land at ~2.4× it. Attack
period runs 3.0 s (D0) down to 1.8 s (D5). Loot value runs 2 → 2200 gold.
Ranges were retuned by the balance simulation on 2026-08-29 — the first pass
made endgame armour and health outrun the player's damage growth and pushed
boss fights past two minutes.

**Variants may not invent a tier**: a compiled field is clamped to ±25 % of its
band's edges, so "strong armoured" stays a hard D5 rather than a secret D6.

Today's `HOLLOW_WARDEN` (150 hp, iron set, steel sword) restates as a **mid D2**
with no change of character. Boss uniques may exceed D5 on named fields.

**The invariant that makes the ladder meaningful** (owner's own test): a D5 NPC
in D5 gear near-one-shots a starting character and takes negligible damage from
one — verified in the simulation: a mid-D5 blow lands 107 on a level-1
character with 44 health, and that character's reply is 6.7 against 950 health
(0.7 % a swing).

**What the simulation says the ladder feels like** (full report:
[numbers packet](../research/stats-progression-numbers-packet.md)): the
reference character kills a D2 Hollow Warden in 7 s and dies to it in 6 blows;
a D3 wamasu takes 31 s and three blows kill her; D4 kills her. An endgame build
kills the final boss in 31–52 s depending on archetype (melee, greatsword,
spear, marksman, stealth and magic all inside a ×1.7 spread) and spends 3–10
potions doing it.

**Every NPC, enemy, follower and merchant carries the player's schema plus a
level** — attributes, skills, equipment, effects, respawn class, plus the AI
profile fields the archetype already has. **Authoring is semantic, compiled to
absolutes** (decision 0019's fourth amendment):

```jsonc
{ "id": "swamp-troll-fen",
  "band": "D3", "position": 0.6,           // where in the band
  "variants": ["strong", "diseased"],       // named modifier packages
  "loadout": "…", "respawn": "onRest" }
```

The compiler interpolates the band, applies variants and emits fixed numbers.
Derivation reads **world data only, never player state** — the world's numbers
are as fixed as ever, they are merely derived, so retuning a curve and
recompiling rebalances every authored actor coherently instead of requiring a
re-authoring pass. Literal overrides stay available for uniques.

## 129. Where the numbers live

The canonical machine-readable tables are the simulation harness's data
directory — one source of truth that both the balance sim and (at 10c) the game
read:

| File (`tooling/stats-sim/data/`) | Contents |
|---|---|
| `attributes.json` | the seven attributes and their derived-quantity formulas' constants |
| `skills.json` | the 27 skills: governing attribute, specialization, effect bands |
| `curves.json` | `k`, `P`, mitigation, health/stamina/magicka, vastei and level-cost constants |
| `races.json` | racial baselines, skill bonuses, effect packages |
| `classes.json` | preset classes (majors/minors/specialization/favoured) |
| `gear.json` | materials, weapon classes, the moveset, armour slots and sets — mirrored from `packages/game-core` + the armour-class tag |
| `magic.json` | spell tiers, healing tiers, enchanting bounds, the alchemy formula |
| `builds.json` | the progression checkpoints and archetype attribute priorities the sweeps run on |
| `ladder.json` | the D0–D5 bands and the variant modifier packages |
| `enemies.json` | worked archetypes on the ladder, including the restated Hollow Warden |
| `economy.json` | potion/training/service/repair prices, vendor purses |

At 10c these are ported to `packages/game-core/src/stats/data/` in the same
shapes, consumed like `races.json`/`enemyArchetypes` today, and the harness is
re-pointed at the game's copies so the invariants keep running against the real
system. Nothing in this design should ever be a hard-coded constant in gameplay
code.

---
