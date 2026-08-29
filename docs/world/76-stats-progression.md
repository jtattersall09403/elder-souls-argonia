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
[research/stats-progression-repo-baseline-and-quest-inputs.md](../research/archive/workstream-s/stats-progression-repo-baseline-and-quest-inputs.md).

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
  item resolves to a **fixed absolute** number that never reads player state.
  Authors write *semantically* — "a strong D3 swamp troll", "a D2 weapon cache"
  — and a compiler emits the absolutes (§128), so the stat system must have a
  **stable, documented power scale**: "this is a D3 creature" has to mean
  something numerically.
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
- **There are no followers or companions in this game** (owner, round 2, and
  already the quest plan's position — decision 0028: "no companions anywhere").
  Nothing in this design assumes an ally stat block, shared traversal or party
  scaling; hirelings, guides and escorts are quest actors with their own
  authored numbers, not a player-managed follower system.
- **Respawn-on-rest is a world ruling** (owner 2026-08-28, decision 0031):
  generic enemies respawn when the player rests; named actors never; cleared
  dungeons stop. Binding on Phases 11/12/13 as well as here (§126).

## 103. Workstream S — how the design was settled

Ran as docs + decisions, in parallel with Phases 8–10, over **three owner
rounds** (0031 shape, 0033 design and numbers, 0035 the round-3 corrections).

**One evidence packet is still live**:
[reference games](../research/stats-progression-reference-games.md) — Morrowind's
real formulas, the Souls layer, Skyrim's lessons and the mod-scene sourcing
facts. Everything else the workstream produced is a **closed working paper,
kept for provenance only**, in
[docs/research/archive/workstream-s/](../research/archive/workstream-s/): both
owner rounds (who decided what, in whose words), the mapping inventory, a code
snapshot, and the numbers packet. They contain superseded drafts — two-layer
fatigue, poise, the estus flask, a four-band sneak table, "wildlife" D0 — and
**must never be read as a spec**. The tuning history lives with the tool that
produced it, in [tooling/stats-sim/FINDINGS.md](../../tooling/stats-sim/FINDINGS.md).

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

### 103.1 Workstream state: closed

**Closed 2026-08-29** after three owner rounds — the shape (decision 0031), the
detailed design and its numbers (0033), and the round-3 corrections that
grounded the attribute model in Morrowind's actual formulas, calibrated the
levelling pace against Morrowind's known one, and fixed D0 (0035). The
provenance — who decided what, in whose words, and what was rejected — is in
`docs/research/archive/workstream-s/`; **read it only for provenance, never as
a spec.**

Two rules from this workstream outlive it:

**The simulation is evidence, not law** (owner, round 2). It is arithmetic over
a design document: no animation, no spacing, no player hands. Where it and a
playtest disagree, the playtest wins; where it and an instinct disagree, argue
it out. Its job is to catch what instinct cannot — a curve that diverges at
hour ninety, a build that quietly cannot finish, an exploit that only shows up
over a thousand fights — and to make retuning cheap. **Do not fit the design to
its fourth decimal place.** Its absolute pacing is trustworthy only because it
is anchored to a known answer (§120.5); its *relative* comparisons were always
sound.

**Game code stays out of scope** until Phase 10c. The one exception is the
harness (`tooling/stats-sim/`, data-in/report-out, touching no game package);
at 10c its invariants become standing tests against the implemented system.

**Cross-checks, re-run at close**: the design satisfies §102; it expresses the
existing enemy archetypes and the D1–D5 bands; it expresses the
access-progression model (0007) and the quest plan's skill, faction and
reputation gating; every stat that changes movement, swim/climb speed or burden
maps into capability-profile *ranges* (§52); it reproduces today's feel at the
reference loadout; every stat gate is expressible as a typed quest condition.

## 104. Phase 10c — implementation

Implements §116–129 in `packages/game-core` (stats live with the game layer,
consumed by both apps). Definitions land as **data files consumed like
`races.json`/`enemyArchetypes`** (§129), not code sprawl. Then:

- **reference-loadout equivalence asserted** (§116): the reference character
  reproduces today's timing, weight and per-hit numbers; deliberate stat/load
  driven variation is implemented as designed and is not treated as drift;
- **the progression economy ships whole** (§120): Morrowind's per-use values,
  the worthiness modifier and its damping, the rule that a maxed skill still
  pays, the 1:3 miscellaneous credit, and the **practice discount** at the level
  sitting. These are cheap to implement and expensive to retrofit — the pace
  invariants depend on all of them;
- capability profiles regenerate from the stat system and the world's
  traversal/validation probes still pass (§52, §122);
- **the NPC/enemy stat model ships alongside the player's**, and with it the
  **loot and trap schemas** (§128.2) so that placed items and hazards derive
  from the same ladder: every NPC, enemy and merchant carries the same schema
  plus a level, authored
  **semantically and compiled to absolutes**. Derivation reads world data only,
  never player state, so 0004 is untouched — the numbers are as fixed as ever,
  merely *derived*, so a curve retune + recompile + sim re-run rebalances all
  content coherently;
- the estus flask is removed and replaced by the potion economy (§126);
- character-sheet, level-up and rest UI in the studio and the sandbox;
- enemy archetypes restated on the new scale;
- **the simulation invariants become standing tests** (§103.1 step 7) so later
  tuning and content authoring cannot silently break the balance envelope;
- the power ladder documented for Phase 13 authors (§128), **as five combat
  bands D1–D5** — D0 is a safe-ground location property authored at Phase 11,
  never an enemy tier.

Sequenced after 10b (parity) and **before Phase 11**: settlements, dungeons and
especially Phase 13 author absolute numbers, and re-authoring that content
against a scale invented afterwards is the expensive mistake this ordering
avoids.

---

# The decided design (§116–129)

Everything below is decided (owner rounds 1–3, decisions 0031/0033/0035).
Numbers are the *shapes and constants*; the machine-readable tables live in
`tooling/stats-sim/data/` (§129) and are what 10c ports.

## 116. The character in one screen

A character is: **7 attributes**, **27 skills**, a **level**, a **race**, a
**birthsign**, a **class** (5 major / 5 minor / a specialization / 2 favoured
attributes), **health / stamina / magicka**, an **inventory with weight**, an
**effect stack** (§127) and a **vastei** balance (§120).

Everything mechanical is derived from those by the formulas below. Two
conventions make the whole system one system:

1. **One skill curve, over Morrowind's own score.** Morrowind computes a
   *score* — `skill + attribute/5` — and rolls against it. We compute the same
   score and **compare it deterministically** instead. That one substitution is
   the whole no-dice port (§117.1):

   ```
   score(skill, attr) = (skill + attr/5) / 1.2      # Morrowind's term, normalised to 0–100
   k(s)               = 1 − (1 − s/100)^1.6         # 0 at score 0, 1 at score 100
   band(lo, hi)       = lo + (hi − lo) × k(score)
   ```

   The `/5` weight is Morrowind's own convention, used almost everywhere in the
   game (*Morrowind:Combat*, *:Security*, *:Sneak*, *:Spells*, *:Enchant*); the
   `/1.2` only rescales it so a character at 100/100 reads 100. `k` is
   front-loaded and self-soft-capping: 25 buys 36 % of a range, 50 buys 67 %,
   75 buys 88 %, the last 25 points buy 12 %.

   **Which attribute** is whichever one Morrowind's formula for that check
   named — Agility for anything that was a hit, block, sneak or lock roll;
   Willpower for casting; Intelligence for enchanting; Personality for
   persuasion — **not** the skill's governing attribute (§117.1 explains why
   those differ, in canon as well as here).
2. **One effect stack.** Racials, birthsigns, diseases, potions, spells,
   enchantments and the allegiance rites (decision 0028) are all `StatEffect`
   entries against the same fields (§127). Nothing has a bespoke pathway.

**Calibration is done against a *set* of characters, not one.** The balance
harness runs every stage of the game × six build styles × every danger band,
plus edge cases (unarmoured mage, over-encumbered hauler, best-in-slot tank,
hour-one novice) and six whole-playthrough runs. No single character defines
the curve.

One of that set is named, because it is the **continuity anchor**: the
**Marsh Hand** — Str/End/Agi/Spd 50, Wil/Int/Per 40; Long Blade 60, Block 50,
Heavy Armor 45, Athletics 40; steel straight sword, steel kite shield, steel
cuirass/gauntlets/boots, head bare, at **mid burden**. She comes out at 100
health, 100 stamina, 180 kg capacity and 25.0 % mitigation against a 24-damage
blow, which is what the combat sandbox runs on today. Note that her health
falls out of Morrowind's own formula with no fitting at all:
`(Str+End)/2 + level × End/10` = 50 + 50 at level 10.

That correspondence is a **convenience, not a law**. The sandbox's constants
were placeholders chosen to make the combat feel good in a vacuum (§102), and
this design is free to re-base any of them. Keeping the anchor means a change
here can always be compared against something that has actually been played;
it does not mean 100 health is sacred. What *is* protected is the **feel** —
timing, weight, the rhythm of a trade — not the integers.

## 117. Attributes

Seven — Morrowind's eight minus Luck, whose entire mechanical existence was a
half-weight term inside dice rolls (*Morrowind:Luck*: it governs no skill and
touches no derived stat). Range 0–100 by purchase; effects may push a value
above 100 and the design does not cap that (§102, god-build).

**Every job below is Morrowind's, with Morrowind's coefficient.** Where the
canon formula was deterministic we port it unchanged; where it fed a die roll
we keep the score and make the comparison deterministic (§117.1). The right
column says which it was.

| Attribute | What it does here | Canon (*Morrowind:*…) |
|---|---|---|
| **Strength** | melee damage `×(Str+50)/100` · carry capacity · half the health base · repair rate. **Not bows** — see below | *Combat*, *Encumbrance*, *Health*, *Armorer* — all deterministic except the repair roll |
| **Endurance** | `maxHealth = (Str+End)/2 + level × End/10` · `maxStamina = 60 + 0.8×End` · stamina regen · disease/poison resistance floor | *Health*, *Fatigue* — deterministic. Canon's health-per-level is **not** retroactive; ours is (§117.2) |
| **Agility** | the score term in every check that was a hit, block, sneak or lock roll (`+Agi/5`) · stagger threshold (a blow staggers you if it deals ≥ Agi/2; at Agi 100 nothing does) · dodge stamina · bow steadiness | *Combat*, *Block*, *Security*, *Sneak* — all were rolls; the knockdown-immunity-at-100 rule is canon exactly |
| **Speed** | ground, swim and climb speed (§122). Nothing else — and in canon it appears in **no dice roll at all** | *Speed* — deterministic, and the one attribute we can port verbatim |
| **Willpower** | the score term in casting (`+Wil/5`, §123) · magicka regen · innate magic resistance | *Spells*, *Willpower* — the cast roll is deleted, the score survives |
| **Intelligence** | `maxMagicka` · alchemy potency (`+Int/10`, canon's odd half-weight) · enchanting point budget (`+Int/5`) | *Magicka*, *Alchemy*, *Enchant* |
| **Personality** | disposition `+0.5×(Per−50)` · persuasion score (`+Per/5`) · price band (`+0.2×Per`, capped 10) | *Disposition*, *Speechcraft*, *Mercantile* — disposition and prices were already deterministic |

Three divergences worth naming, because a future agent will otherwise "fix"
them back:

1. **Strength does not multiply bow damage**, though canon applies it to both.
   Our arrow damage is *physical* — draw force, power stroke, arrow mass — so
   the archer's strength is already in the model twice over: in the draw weight
   of the bow they can handle, and in the soft requirement that charges a weak
   archer extra stamina for a heavy one. Canon's term would be a third count.
2. Our magicka pool is `20 + 3×Int`, not canon's `Int × multiplier` — canon's
   100-magicka ceiling cannot sustain a Souls-length fight (§123).
3. Magic skill scales spell magnitude here, where canon left it flat: canon's
   skill bought *reliability*, and we deleted the roll it was reliable against.

### 117.1 The no-dice port: keep the score, drop the roll

Morrowind's attribute model has three layers. **Direct scalars** (Strength into
damage and carry, Speed into movement, Endurance into health, Intelligence into
magicka) port unchanged. **The level-up multiplier** is replaced by the vastei
sitting (§120.4). The third layer is the interesting one: Morrowind's *dice*.

Almost every check in the game computes a score of the form

```
score = skill + primaryAttribute/5 + Luck/10          (then × a fatigue term)
```

and rolls 0–99 against it. Luck is always exactly half-weight; the primary
attribute is always `/5`. That convention holds across combat, blocking,
sneaking, lockpicking, trap disarming, spellcasting, enchanting and persuasion
(*Morrowind:Combat*, *:Block*, *:Sneak*, *:Security*, *:Spells*, *:Enchant*,
*:Speechcraft*).

**So we do not delete Agility's job — we delete the die.** The same score is
computed and compared against a fixed difficulty:

| Morrowind rolls… | We compare… |
|---|---|
| `HitRate = WeaponSkill + Agi/5` vs the target's Evasion | the same score sets **where in the weapon's damage range** the blow lands (§121.1) — reliability becomes quality |
| `(Security + Agi/5) × ToolQuality − LockLevel` | a lock opens iff `(Security + Agi/5) × ToolQuality ≥ LockLevel` |
| `Elusiveness = (Sneak + Agi/5 − shoeWeight) × distanceTerm` vs an observer's Spot Chance | the same two scores compared directly; canon's direction multiplier (×1.5 seen from the front, ×0.5 from behind) is kept |
| `(Block + Agi/5)` clamped 10–50 % | the same score scales **guard stability** — blocking is a player input here, so the score buys how much a block costs you |
| `SpellSkill×2 + Wil/5 − SpellCost` | a spell is castable iff `2 × SpellSkill + Wil/5 ≥ SpellCost` — canon's own boundary, now a gate instead of a gamble (§123) |
| `Enchant + Int/5 − 3 × points` | solve it for points: your budget **is** `(Enchant + Int/5)/3` (§123) |
| `Speechcraft + Per/5 + Reputation` vs the NPC's rating | the same score against an authored threshold (§125) |
| `Agility × 0.5 ≤ damage` → knocked down (immune at Agi 100) | the same threshold decides whether a blow plays the **heavy** hit reaction the sandbox already has, rather than the light one |

That last row is worth flagging: it gives Agility a real defensive job, using
Morrowind's exact numbers and the sandbox's **existing** reactions — no poise
meter, no new system (poise was cut in round 2 and stays cut). If even that is
unwanted, delete the row and hit reactions stay exactly as they are today.

**What a governing attribute still does.** In canon it does three things: sets
the level-up multiplier, caps training, and — often — is *not* the attribute in
that skill's formula at all. Canon is full of these mismatches: Security is
governed by Intelligence but every lock roll uses Agility; Conjuration and
Illusion are governed by Intelligence and Personality but both cast through
Willpower; Acrobatics is governed by Strength, which appears nowhere in jumping;
Hand-to-hand is governed by Speed and its damage uses neither Speed nor
Strength. We keep that faithfully — the formula attribute and the governing
attribute are different things — and the governing attribute keeps two jobs:

- **the trainer cap**, exactly as canon: *you cannot train a skill above its
  governing attribute* (*Morrowind:Trainers*), reading **base** values, which
  kills canon's drain-and-train exploit;
- **the practice discount** at a level sitting (§120.4), which is canon's
  attribute multiplier expressed as a price instead of a minigame.

### 117.2 How level, Endurance and health fit together

Three separate things:

- **Skill ranks** come from use; ten major/minor ranks make a level ready.
- **Levels** are banked at a rest, and each one adds health.
- **Endurance** is bought with vastei at the sitting.

The formula is canon's, with one deliberate change:

```
maxHealth = (Strength + Endurance)/2  +  level × Endurance/10
```

Canon computes the same two terms but *adds them as they happen*, so the health
you got at level 3 is frozen at your level-3 Endurance — which is why
Morrowind players are told to max Endurance before anything else or "ruin" the
character. Ours is a **formula over your current values**, so it is retroactive:
at level 10 with Str 50/End 50 you have 100 health; raise Endurance to 70 and
it becomes 130 immediately, with nothing replayed. Same numbers, no homework.

### 117.3 The one canon rule we deliberately do not port into combat

Morrowind multiplies nearly every check by `0.75 + 0.5 × (fatigue/maxFatigue)`
— a ±25 % swing on everything, driven by a pool fed by four attributes. It is
the most universal rule in the game. We do **not** apply it to combat: our
stamina bar already punishes exhaustion by preventing action, and taxing damage
on top would double-punish and muddy a Souls exchange. We do apply a gentler
version out of combat, where "worn out" is flavour rather than a second
penalty: non-combat scores (sneak, security, persuasion, brewing, repair) are
multiplied by `0.85 + 0.15 × (stamina/maxStamina)`. If that reads as fiddly in
play, deleting it costs nothing else.

## 118. Skills

Morrowind's 27, with three substitutions: **Armorer → Smithing** (repair +
bounded tempering + crafting, the Skyrim keeper), **Mysticism kept** despite the
4E Synod dissolution (foreign magical institutions never took root in Black
Marsh; the folk school survives — lore note in
`world/sources/lore/topics/magic-practice.md`), and every dice-based skill
re-expressed as a threshold. No pickpocketing verb, no crossbow or thrown
skill (decision 0031).

Bands are written `lo→hi` across `k(score)` (§116). **Gov.** is the governing
attribute — canon's, and it sets the trainer cap and the practice discount
(§117.1), *not* the formula. **Score** is the attribute that actually enters
this skill's maths, which in canon is frequently a different one. "Wear" is
condition loss per use (§121).

| Skill | Gov. | Score | Spec. | What the curve moves |
|---|---|---|---|---|
| Long Blade | Str | Agi | Combat | damage-range position 0.40→1.00 · stamina cost ×1.25→0.80 · wear ×1.4→0.6. Damage is then multiplied by `(Str+50)/100` (§121.1) |
| Blunt | Str | Agi | Combat | as Long Blade (class identity is the weapon table, not the skill) |
| Axe | Str | Agi | Combat | as Long Blade |
| Spear | End | Agi | Combat | as Long Blade |
| Short Blade | Spd | Agi | Stealth | as Long Blade; its sneak-opener table is the best after the dagger's (§121.5) |
| Marksman | Agi | Agi | Stealth | delivered-damage position 0.40→1.00 · draw speed ×0.85→1.20 · sway ×1.4→0.6 · draw stamina ×1.25→0.80. Canon applies the Strength multiplier to bows too, and so do we |
| Hand-to-Hand | Spd | Agi | Stealth | damage position 0.40→1.00 · stamina damage to the target ×1.0→2.0; empty an opponent's stamina and they can be finished. **No Strength multiplier** — canon's H2H damage uses neither Speed nor Strength |
| Block | Agi | Agi | Combat | stability ×0.85→1.15 (absolute cap 0.95) · guard stamina ×1.30→0.78 |
| Heavy Armor | End | — | Combat | worn heavy rating ×0.55→1.20 · its effective weight ×1.10→0.90 · wear ×1.4→0.6. (Canon is `rating × skill/30`, i.e. naked at skill 0 and ×3.3 at 100; ours is compressed because the rating band is calibrated against the hits-to-die targets, §128) |
| Medium Armor | End | — | Combat | as Heavy, for medium pieces |
| Light Armor | Agi | — | Stealth | as Heavy, for light pieces |
| Unarmored | Spd | — | Magic | rating `0.0065×skill²` per bare slot — canon's own formula (60 at skill 100 over four slots) |
| Athletics | Spd | Spd | Combat | run ×0.94→1.10 · **swim ×0.5→1.5** (canon leans on Athletics hard for swimming, and swimming is a pillar) · `breath = 25 + 0.35×Athletics + 0.25×End` seconds · sprint drain ×1.20→0.85 |
| Acrobatics | Str | — | Stealth | jump ×0.80→1.60 · safe-fall height `2 + Acrobatics/25` m (canon: fall damage is reduced by 1.5 per point) · **climbing**: speed ×0.85→1.25, stamina drain ×1.25→0.75 (§122.1) |
| Sneak | Agi | Agi | Stealth | `Elusiveness = (Sneak + Agi/5 − boot weight) × (0.5 + distance/500)` against an observer's spot score × canon's direction multiplier (×1.5 front, ×0.5 behind) — compared, never rolled · **the sneak-opener band** (§121.5) |
| Security | Int | **Agi** | Stealth | a lock opens iff `(Security + Agi/5) × toolQuality ≥ lockLevel`; keys and Open magnitude always work. Canon's mismatch kept: Security is governed by Intelligence and uses Agility |
| Smithing | Str | Str | Combat | repair per stroke 6→22 condition · temper grades 0/1/2/3 at score 25/55/80 · craftable material tier ≤ 1+floor(score/14) |
| Mercantile | Per | Per | Stealth | price band from `Mercantile + 0.2×Per + (disposition−50)` against the merchant's own (§124) |
| Speechcraft | Per | Per | Stealth | persuasion score `Speechcraft + Per/5 + standing` (§125) · topic access thresholds |
| Alchemy | Int | **Int/10** | Magic | potency/duration (§124, canon formula) · ingredient effects visible at skill 15/30/45/60 (canon's `fWortChanceValue`) |
| Enchant | Int | Int | Magic | point budget `(Enchant + Int/5)/3` — canon's success formula solved for points · constant effect costs double · charged-item use cost `×(1.1 − skill/100)` (canon exactly) |
| Alteration | Wil | **Wil** | Magic | castability `2×skill + Wil/5 ≥ spellCost` (§123) · cost ×1.40→0.80 · cast time ×1.20→0.85 · magnitude ×0.75→1.25 |
| Conjuration | Int | **Wil** | Magic | as Alteration (+ summon duration ×0.8→1.4). Canon: every school casts through Willpower, whatever governs it |
| Destruction | Wil | **Wil** | Magic | as Alteration |
| Illusion | Per | **Wil** | Magic | as Alteration |
| Mysticism | Wil | **Wil** | Magic | as Alteration |
| Restoration | Wil | **Wil** | Magic | as Alteration |

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

**There is no boat or piloting skill.** Boats gate on ownership and route
knowledge (module 60), not on a stat — a skill nobody can fail at is not a
skill. Likewise **arrow recovery** is the existing stick/break probability model
in `combat/ballistics.ts`, not Morrowind's flat 25 % rule.

## 119. Character creation

1. **Race** — attribute baselines, skill bonuses and a permanent effect package
   (§127).
2. **Birthsign — chosen directly** (owner, round 2), from the thirteen
   constellations the world clock already models (module 55 §95). The birth
   *date* stays as flavour on the character sheet and in dialogue ("born under
   the Shadow" is a canon social fact, not a mechanic); it does not decide your
   sign. A sign is an effect-stack entry like any other, so the slot ships at
   10c and the sign contents can land later.
3. **Class** — Morrowind's structure in full: **5 major skills** (start +25),
   **5 minor** (+10), everything else miscellaneous (start 5), a
   **specialization** (Combat / Stealth / Magic: +5 to its skills and ×0.8 XP
   cost), and **2 favoured attributes** (+10). Race bonuses stack on top;
   nothing here gates anything later — it shapes *growth rates* and the
   starting shape only.

   **Eighteen presets** ship (`classes.json`), plus the custom builder. Eleven
   are the canonical Elder Scrolls classes — Warrior, Knight, Barbarian, Scout,
   Thief, Assassin, Mage, Spellsword, Nightblade, Healer, Monk — so the roster
   reads as pan-Tamrielic and every playable race has an obvious home. Seven are
   province-specific and named from canon offices in the lore dossiers: **Kaal**
   (war-captain), **Root-herald** (the tribe's outward face), **Tree-minder**,
   **Grave-singer**, **Shadowscale-trained**, **Marsh guide** and **Reed-sail
   hand**. Any race may take any class; the presets carry a "typical" line for
   the creation screen and nothing more.

Starting skill floor after all bonuses is 5; nothing starts at 0, so no skill
is unusable at creation. There are **no wield or use requirements** anywhere
(owner ruling): finding a way to a powerful weapon early is a legitimate joy.
Attribute requirements printed on items are **soft** (§121).

## 120. Progression: use, vastei, levels

Skills grow by doing; a currency called **vastei** accrues from the same
qualifying uses and is spent at the level screen to buy attribute points
(decision 0031, F1 variant ii).

### 120.1 Skill experience

The rank cost is Morrowind's, unchanged (*Morrowind:Skills*):

```
pointsToNextRank = (skill + 1) × classFactor × specFactor
classFactor       = 0.75 major | 1.0 minor | 1.25 miscellaneous
specFactor        = 0.8 if the skill is in your specialization, else 1.0
```

So a major, specialised skill costs 10 uses per rank at 15, 19 at 30, 31 at 50
and 58 at 95 — the first level is roughly twenty-five times cheaper than the
last, which is why a Morrowind-shaped curve feels generous early and slows
without ever stopping.

**The value of a use is Morrowind's too.** These are canon (each skill's UESP
page), and adopting them wholesale is what makes the pace Morrowind-shaped
rather than something we invented:

| Use | Points | Use | Points |
|---|---|---|---|
| Weapon connects | **1.0** (axe 1.2, short blade 0.75) | Block a blow | **2.5** |
| Take a damaging hit (armour skill of the struck slot, or Unarmored) | **1.0** | Cast a spell that does something | **1.0** |
| Brew a potion | **2.0** | Pick a lock | **2.0** · disarm a trap **3.0** |
| Persuade someone, successfully | **1.0** | Trade | **0.3 × the percent your skill moved the price** |
| Enchant or recharge an item | **5.0** | Repair | **0.4** · temper **2.0** · forge **5.0** |
| Running | **0.02 / second** · swimming **0.03 / s** | Climbing | **0.2 / metre ascended** · a jump that clears something **0.15** · a survived damaging fall **3.0** |

Two of those deserve notice because they are what actually levels a character:
**Block at 2.5 a blow** is the richest tick in the game, and **Athletics is a
clock, not an action** — half an hour of ordinary travel is 36 points, free.
Morrowind levels fast early because four or five skills tick constantly during
play that is not "training" at all. Ours must too, which is why the anti-grind
rules below target *degenerate repetition* and never ordinary play.

Trainers and skill books grant ranks directly (§124) — **and grant no vastei**,
which closes gold → training → vastei → attributes.

### 120.2 Worthiness — the anti-grind rules ("in anger")

A use counts only if it could plausibly have mattered. This is one shared
worthiness function because vastei inherits every skill-grind exploit
(decision 0031); the simulation hunts the survivors.

| Family | A use counts when… | Damping |
|---|---|---|
| Melee / marksman / unarmed | the blow connects with a hostile, living actor that can fight back | value scales with `damageDealt / targetMaxHealth`, capped at 1 per blow; the same individual target yields diminishing value after the 6th connect |
| Block | a real incoming attack is absorbed | none needed |
| Armour skills | you take a hit while wearing that class | value scales with damage taken |
| Destruction / Restoration / Alteration / Illusion / Conjuration / Mysticism | the spell **has a real effect** — damage dealt, a wound closed, a lock opened, a creature summoned, a mind changed, **or a self/utility effect that mattered** (water-breathing while actually underwater, a light in the dark, feather while over-loaded, invisibility while someone could see you). Untargeted magic is not second-class: it counts when the situation it answers is real | per-spell-per-rest diminishing returns; casting a spell whose effect changes nothing — light at noon, water-breathing on dry land — is worth nothing |
| Athletics | distance covered while running/swimming **outside settlement bounds** | per-rest cap ≈ 20 minutes of travel |
| Acrobatics | **climbing** (per metre actually ascended), a jump that clears a real gap, or a survived fall that dealt damage | falls count once per location per rest (kills Morrowind's fall-grinding); climbing counts on the way *up* only |
| Sneak | you are inside a detection cone that could have seen you, and are not seen | only near actors that would react |
| Security | the lock's rating is within 10 of your current ceiling or above it | none |
| Alchemy | a brew you have not made since your last rest | per-recipe diminishing |
| Smithing | repairing real damage, tempering, or forging | value scales with condition restored / item tier |
| Mercantile | a transaction, worth what it was worth — the value that counts is capped by **how much money the merchant actually has**, so you cannot farm one village grocer by selling and rebuying the same crate | per-vendor-per-rest cap |
| Speechcraft | a check that had a real outcome (topic opened, price moved, quest branch) | never repeatable on the same NPC state |

**Worthiness scales the canon value; it does not replace it.** A blow worth
≥15 % of the target's health is a full point; below that it scales down (chip
damage on a giant is nearly worthless — the anti-grind rule), floored at 0.05.
Armour skills use the mirror of the same rule on damage *taken*. After the
**eighth connect on the same actor** the rest of that fight is worth 55 %, so a
long fight is not a skill mill but a boss is still worth fighting. Blocks,
casts, brews, locks, persuasions, repairs and travel are **not** worthiness-
scaled — there is no "chip damage" equivalent for them. Nothing accrues at all
against actors that are helpless through a bug (broken pathing, stuck
geometry), against creatures you summoned yourself, or against anything flagged
`trainingDummy`.

**A maxed skill is never a dead end.** Once a skill reaches 100, its qualifying
uses keep earning **vastei**, and they keep feeding the level counter at the
miscellaneous rate (§120.4). Without that rule a warrior whose Long Blade,
Heavy Armor and Block are all at 100 stops progressing from fighting at all —
which is exactly what the whole-game simulation caught: **38 % of every
use-point a character generated was being discarded** into skills that could no
longer absorb them.

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

**It must be taught, in fiction, in the opening hours** (owner requirement,
round 2). No player arrives knowing what *vastei* is, and a currency that is
earned by acting, spent on becoming, and dropped where you die needs one clear
diegetic explanation: a **Nisswo** — a travelling preacher of change, which is
exactly what the Clutch are — puts it in their own words in the tutorial
stretch, and the level screen repeats it in one line. Phase 10c ships the
mechanic; the quest packet that owns the opening owes the scene.

Rules:

- **One job**: vastei buys attribute points at a level sitting. Nothing else.
  Gold buys everything else.
- **Death**: the carried balance drops at the death spot as a recoverable pile;
  dying again replaces it (the old pile is gone). Skills, levels, items and gold
  are never lost (§126).
- **Never granted by**: trainers, skill books, quest rewards or looting.

### 120.4 Levels and the level sitting

- **10 major/minor skill ranks → one pending level** (canon's `iLevelupTotal`).
  A rank in a **miscellaneous** skill — or in *any* skill already at 100 —
  counts **1 : 3**. That is a deliberate divergence: in canon misc ranks never
  level you at all, which is why Morrowind's ceiling is exactly 78. Ours is a
  slope rather than a wall, and it means no hour of play is ever worth nothing.
  The rule is **per skill**, not "once everything is maxed".
- **Resting consolidates one pending level per sitting** (§126). Health
  recomputes from the formula in §117.
- At the sitting you spend vastei on attribute points:

```
cost(attr, n) = base(level) × (1 + attrValue/50)² × (1 + 0.5×(n−1)) / practice(attr)
base(level)   = 40 × (1 + level/10)^1.3
n             = the n-th point bought in this attribute this sitting (cap 5)
practice(attr)= 1 + 0.4 × min(10, ranks gained since your last level in skills
                              this attribute governs)
```

  Three brakes in one line: attributes get dearer as they rise (a soft cap that
  needs no cap), each extra point in one sitting costs more (spread or commit —
  a real choice), and the level index means a hoarder gains nothing by waiting.
  **Unspent vastei carries over**; no level is ever wasted.

  **The practice term is Morrowind's attribute multiplier, expressed as a
  price.** In canon, raising skills governed by an attribute earned you a ×1 to
  ×5 multiplier on that attribute at the level screen (`iLevelUp01Mult`…`10Mult`
  = 2,2,2,2,3,3,3,4,4,5). Ours reaches the same ×5 at the same ten ranks — but
  as a discount rather than a multiplier, which removes the pathology without
  removing the link. Nothing is ever *lost* by not optimising: you pay list
  price, your vastei carries over, and there is no wasted level to spreadsheet
  against. Practise what you fight with and your fighting attributes are cheap;
  practise nothing and everything costs full.
- **Deferral is strictly bad, by construction**: purchases happen only at a
  sitting, each pending level is its own sitting priced at its own level, and
  delaying levels delays health. The simulation asserts this as the
  *no-deferral-advantage* invariant.

### 120.5 The pace we are aiming at

Morrowind is the reference, and it is a documented one. Its ceiling is exactly
78 (775 major/minor ranks ÷ 10); its own main quest gates on level 21 as
"famous enough to skip the trials"; community completions of the main line
cluster at level 20–30 in roughly 40 hours. Our targets, which the balance
harness checks as a standing invariant:

| Hour | Target | What the harness produces |
|---|---|---|
| 1.5–2.5 | 2 | 1.4–3.6 (a bow build is slowest: fewer connects a fight) |
| 20 | 10–14 | 10–16 |
| 40 (main line's length) | 20–25 | 19–27 · main line alone, 18–28 |
| 150 (a broad run) | 45–55 | 49–64 |
| ceiling | — | ~75 by ordinary use, with the misc tail continuing slowly |

Two things make that pace real rather than aspirational: the canon use-values
in §120.1 (especially Block and Athletics, which tick during play that is not
training), and the rule that a maxed skill still pays (§120.2). The harness
validates the first by running the *same* campaign model under Morrowind's own
rules and checking it reproduces Morrowind's known pace — a known-answer test
rather than another guess (`tooling/stats-sim`, `morrowind-known-answer`).

### 120.6 Where late power comes from

Not the level counter. The curve `k` flattens, attribute costs escalate, and
the biggest damage lever stays **found gear** — which in a fixed world means
power is geography you conquered. On top of that sit the mastery systems
(alchemy, enchanting, spellmaking, smithing, trade, training) that the owner
explicitly wants to be able to run away with (§102).

## 121. Combat

### 121.1 Damage

```
listedDamage = motionValue(class, attack) × material.damageScale × 24   # today's code
score        = (weaponSkill + Agility/5) / 1.2                          # Morrowind's HitRate, no dice
P(score)     = 0.40 + 0.60 × k(score)                                   # where in the range you strike
strength     = (Strength + 50) / 100                                    # Morrowind's own damage term
damage       = listedDamage × P × strength × conditionFactor × critical × hitZone
conditionFactor = 0.5 + 0.5 × (condition / maxCondition)                # canon scales linearly with condition
```

Two terms, both canon, doing two different jobs. **Skill and Agility decide how
well you connect** — Morrowind rolled that same score for hit-or-miss, and we
spend it on the quality of the blow instead, which is the no-dice port of the
single most important formula in the game. **Strength decides how hard you
are** — `(Str+50)/100` is canon verbatim, neutral at Strength 50, ×0.5 at 0 and
×1.5 at 100, and canon applies it to bows as well as blades. Critical (×2) and
head-zone (×2) multipliers are today's; condition scales damage linearly, as in
canon.

Hand-to-hand is the documented exception: canon's unarmed damage uses neither
Speed nor Strength, only the skill, and drains stamina rather than health. We
keep that (§118).

**Stagger is Agility's job.** Morrowind knocks you down when a blow's damage
reaches `Agility × 0.5`, and makes you outright immune at Agility 100. We use
the same threshold to choose between the sandbox's **existing** light and heavy
hit reactions: a blow of `≥ Agility/2` plays the heavy one. No poise meter, no
new animation, no new system — poise was cut in round 2 and stays cut. If even
this is unwanted, hit reactions revert to today's fixed behaviour and Agility
loses one job.

**Soft requirements.** Items keep their `requirements`, but they never block:
for a shortfall `d` (points below a requirement), stamina cost ×`(1 + 0.07d)`,
capped at `d = 20`. A heavy blade found early is usable, exhausting, and
glorious — at the worst possible shortfall a swing costs about 85 of a starting
character's 92 stamina, so they get one swing and a long breath.

**Marksman** keeps the physical ballistics model; skill and Agility drive the
existing `RangedModifiers`, and `P(effMarksman)` multiplies delivered damage
(a clean loose, not a stronger arrow). **Arrow material is its own damage axis**
(Morrowind: iron 1–3 against daedric 10–15) — good arrows are placed loot, so a
marksman's endgame damage is geography like everybody else's. Arrowheads pierce:
armour is only ~60 % as effective against an arrow as against a blade.

**Hand-to-Hand** deals low health damage but heavy **stamina** damage (§118);
an opponent whose stamina you empty is open to a knockout finisher —
Morrowind's fatigue-knockout, Souls-shaped, and it needs no new systems.
Argonian and Khajiit claw clips are already in the vault.

### 121.5 Sneak attacks

A blow landed on an actor that has not detected you is multiplied. Skyrim's
shape (*Skyrim:Sneak*: dagger ×6/×15, one-handed ×3/×6, bow ×2/×3, unarmed and
two-handed ×2), rebuilt as **Sneak-skill bands** so it needs no perk economy:

| Sneak | Dagger | Short blade | One-handed | Two-handed | Bow | Unarmed | Spell |
|---|---|---|---|---|---|---|---|
| 0–19 | ×3 | ×2.5 | ×2 | ×2 | ×2 | ×2 | ×1.5 |
| 20–39 | ×5 | ×3.5 | ×2.5 | ×2.5 | ×3 | ×2.5 | ×2 |
| 40–59 | ×7 | ×4.5 | ×3 | ×3 | ×4 | ×3 | ×2.5 |
| 60–79 | ×10 | ×6 | ×4 | ×3.5 | ×5 | ×3.5 | ×3 |
| 80–99 | ×13 | ×7 | ×5 | ×4 | ×6.5 | ×4 | ×3.5 |
| 100 | ×15 | ×8 | ×6 | ×5 | **×8** | ×4.5 | ×4 |

Skyrim's ceilings are dagger ×15 and bow ×3; ours keeps the dagger and takes
the **bow to ×8** (owner, round 3 — stealth-archery should be a build worth
committing to, not a footnote). Melee still leads ranged, because closing to
knife distance unseen is the hard part. It applies to the **first blow only**;
a botched opener is just an ordinary attack, and it is the whole reason a
stealth build can punch above its armour class. In the whole-game runs it is
what carries a light-armour build through the lethal middle game.

### 121.2 Stamina

`maxStamina = 60 + 0.8×End`; regen `12 + 0.24×Agi` per second after the
unchanged 1.05 s delay, suppressed while guarding. Action costs are today's
class-scaled values × the skill band × a burden multiplier (×1.00 fast, ×1.08
mid, ×1.20 fat). **One bar** — the second "fatigue" layer was rejected (owner
round 1, Q4); long-loop exertion (sprinting, swimming, climbing, heavy loads)
hooks this pool instead.

### 121.3 Hit reactions and stagger

**No poise or posture system.** Reactions stay exactly what the sandbox already
does: severity comes from the attack and the hit zone, and the existing guard
system produces guard-break openings. An Elden-Ring-style poise layer was
drafted and **cut** (owner, round 2) — it is a new mechanic the sandbox has
never had, and adding one from a design document is how feel gets broken. If
stagger ever needs to vary by character, the hook is Endurance and worn weight,
and it is a Phase 10c-or-later conversation with a controller in hand.

### 121.4 Defence

```
mitigation = AR / (AR + 126 + incomingDamage)          # 0…1, never reaches 1
AR = Σ worn pieces (× that class's armour-skill band) + unarmoured contribution + effects
```

with `constant = 135.6` and `damageCoefficient = 0.6`. Today's asymptotic curve
with one addition: **big hits punch through**. At the reference (AR 50, a
24-damage blow) it returns exactly today's 25.0 %; best-in-slot plate (AR ~406)
turns 73 % of a light blow but only 56 % of a D5 one, and even then the hardest
hit in the game still takes a fifth of that character's health. Armour that
helps everywhere and trivialises nothing — Morrowind's `min(1 + AR/dmg, 4)`
behaviour, expressed in our curve so the reference is preserved.

**Armour has its own material ladder**, separate from the weapon damage ladder
and far steeper (Morrowind's runs 8× from iron to daedric; the weapon ladder
runs 2.3×). Steel is 1.0, so the reference set still rates 50:

| | studded | iron | steel | imperial | dwarven | elven | orcish | akaviri | glass | ebony | daedric |
|---|---|---|---|---|---|---|---|---|---|---|---|
| armour scale | 0.55 | 0.75 | **1.00** | 1.10 | 1.60 | 1.50 | 1.90 | 2.20 | 2.60 | 3.40 | 4.40 |

This is what makes "typical endgame armour = three unavoided blows,
best-in-slot = five or six" possible at all; with the weapon ladder reused for
armour the entire endgame sat inside a factor of 1.4. **Armour class then
scales the rating**: light ×0.75, medium ×0.9, heavy ×1.0 — light armour
protects meaningfully less and weighs far less, which is the trade the class
choice is supposed to be.

**Armour classes are a per-material data tag** — no new assets, the Morrowind
category reintroduced by reclassification:

| Class | Materials |
|---|---|
| Light | studded, elven, glass, forsworn |
| Medium | imperial, falmer (chitin), draugr (ancient mail), orcish, akaviri |
| Heavy | iron, steel, silver, dwarven, nordhero, ebony, daedric |

**One global lethality knob.** `difficulty.enemyDamageMultiplier` multiplies
incoming enemy damage and nothing else — not populations, not loot, not gates,
so decision 0004 is untouched. It exists so the whole game can be made harsher
or gentler in one number, and it is the natural back-end for a **play-time
difficulty setting** (0.7 forgiving / 1.0 normal / 1.35 harsh). Phase 10c ships
the knob even if the setting screen comes later.

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

| r | Tier | Roll distance | Roll recovery | i-frames | Stamina |
|---|---|---|---|---|---|
| < 0.20 | fast | ×1.10 | ×0.90 | ×1.15 | ×1.00 |
| < 0.35 | **mid** (the reference) | today's roll exactly | ×1.00 | ×1.00 | ×1.08 |
| < 1.00 | fat | ×0.80 | ×1.25 | ×0.80 | ×1.20 |
| ≥ 1.00 | overloaded | no roll at all | — | — | cannot run, jump or swim upward; walk at 40 % speed; may still fight and cast (Morrowind's hard stop, softened so it is never a soft-lock) |

**Invulnerability frames do vary by tier** — Dark Souls 1's behaviour
(13 / 11 / 9 frames at light / medium / fat), and the reason the rule in §102
is worded the way it is: *stats* never touch i-frames, because a hidden stat
gating a feel verb is the Dark Souls 2 Adaptability mistake. Equip load is not
a hidden stat; it is a visible choice you make every time you pick up a
breastplate, and the game tells you which tier you are in. (DS3 and Elden Ring
flattened i-frames across tiers instead, varying distance and recovery only —
if playtesting says our roll reads better that way, it is one constant.)

The thresholds are calibrated so the reference kit is *mid*, a full endgame
plate kit is *fat* until Strength grows into it, and a looted-up hoarder is
*overloaded*: carrying capacity is a real progression axis rather than a
formality.

### 122.1 Climbing (the Acrobatics verb)

BotW-style climbing is a **stamina problem governed by Acrobatics**, and it is
the reason the skill exists alongside Athletics:

```
climb speed      = 1.1 m/s × band(0.85 → 1.25)
stamina drain    = 7.5 /s × band(1.25 → 0.75) × burden (fast 0.85 / mid 1.0 / fat 1.35)
mantle at the top= 18 stamina × the same band       ledge grab = 8
hanging still    recovers 12 % of normal stamina regen
```

What that produces, which is the point of stating it in numbers:

| Climber | Speed | Drain | Reach (with rests) |
|---|---|---|---|
| Hour one (Acrobatics 15, mid load) | 1.0 m/s | 8.6 /s | ~12 m |
| Competent (45, mid load) | 1.2 m/s | 7.1 /s | ~24 m |
| Scout (70, light load) | 1.3 m/s | 5.2 /s | ~63 m |
| Master (100, light load) | 1.4 m/s | 4.8 /s | 160 m+ |

**The underwater contract, for authors** (the sibling of the climbing one
below): **a 30-second submerged stretch is open to everyone, 45 s wants a
competent swimmer, 60 s a specialist, and beyond 75 s is Argonian, spell or
equipment ground.** No route is ever mandatory-Argonian — water breathing
creates advantages, never exclusive progression (quests 80 §63), so every such
route needs a degraded alternative (quests 20 §11).

So a cliff is a **gate you can see** — a beginner reads 12 m of wall as "not
yet", and the same wall is nothing to a scout. Falling costs the §122 fall
rules; being overloaded means you cannot start. Authors get a simple contract:
**a wall under 10 m is open to everyone, 25 m wants a real climber, and beyond
40 m is specialist ground** — and, like every other capability, a climb-only
route needs a fallback (quests 20 §11).

Everything the world's traversal validation consumes is a
`TraversalCapabilityProfile` field, generated at 10c from the stat system
(§52) instead of hand-set:

Movement is the one place canon ports almost verbatim, because Speed appears
in no dice roll anywhere in Morrowind — it simply *is* how fast you go:

| Field | Formula | Canon it comes from | Reference |
|---|---|---|---|
| walkSpeed | `4.5 m/s × (0.75 + Speed/200) × (1 − 0.3 × loadRatio)` | `WalkSpeed = 100 + Speed`, `× (1 − 0.3 × encumbrance)` — compressed from canon's 2× spread to 1.7× so combat spacing survives | 4.5 m/s |
| sprintSpeed | `walk × (1 + Athletics/250)` | `Run = Walk × (Athletics/100 + 1.75)` — same shape, compressed | 6.0 m/s |
| swimSpeed | `1.6 m/s × (0.5 + Athletics/100) × burden penalty` | canon's `0.5 + 0.02×Athletics` walking / `0.5 + 0.1×Athletics` running; kept near-full strength because swimming is a pillar | ~1.5 m/s |
| jumpApex | `1.378 m × (0.80 + Acrobatics/125)` | canon's two-part Acrobatics jump curve, smoothed | 1.378 m |
| safe fall | `2 + Acrobatics/25` metres | canon reduces fall damage by 1.5 per Acrobatics point | ~3.6 m |
| breathSeconds | `25 + 0.35×Athletics + 0.25×End`, **unlimited for Argonians** | canon is a flat 20 s for everyone; ours is skill-driven because underwater play is a pillar | 49 s |
| climbSpeed / gripStamina | `1.1 m/s × Acrobatics climb band` / drain × its stamina band (§122.1) | ours — Morrowind has no climbing | — |
| currentResistance / depthTolerance | End + effects (spells and gear can move both) | ours | — |

Encumbrance's speed penalty is canon's coefficient exactly (`×(1 − 0.3 ×
loadRatio)`), and it stacks with the roll tiers above rather than replacing
them: load costs you speed continuously and roll quality in steps.

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
- **What you can cast is canon's own boundary, turned into a gate.** Morrowind
  computes `chance = 2 × schoolSkill + Willpower/5 − spellCost` and rolls
  against it; below zero the spell simply never works. We keep the expression
  and drop the roll:

  > **A spell is castable when `2 × schoolSkill + Willpower/5 ≥ spellCost`.**

  A novice (skill 10, Willpower 30) can manage a 26-point spell; a master
  (skill 100, Willpower 100) reaches 220. Nothing fizzles, nothing is wasted,
  and the thing skill buys is the *size of spell you can hold* — which is what
  it bought in canon, minus the frustration. The familiar tier names are
  descriptive labels over cost ranges, not separate machinery:

  Two refinements the harness forced. Canon's boundary is where the chance
  reaches *zero*, which is not a spell you would actually carry, so the
  reliable line sits **50 points inside it**: `castable ≤ 2 × skill +
  Willpower/5 − 50`. And a caster does not lead with the largest spell they can
  hold — the working spell is about **60 %** of it. That puts a starting mage on
  a ~19-damage spell and a master on ~100 before magnitude and gear, which is
  where Morrowind's own starting and master spellbooks sit.

  | Tier | Typical cost | Reachable at |
  |---|---|---|
  | novice | ≤ 15 | skill ~5 |
  | apprentice | ~30 | skill 12–15 |
  | journeyman | ~60 | skill 25–30 |
  | expert | ~110 | skill 50–55 |
  | master | ~180 | skill 85–90 |

  Spell damage is elemental: it **bypasses physical armour** and meets magic
  resistance instead (which is why a mage keeps pace against heavily-armoured
  endgame enemies), and it is the highest burst in the game — bounded by
  magicka, not by damage. Canon leaves spell magnitude *flat* — skill bought
  only reliability — so scaling magnitude with skill (×0.75→1.25) is our
  divergence, and a deliberate one: with the reliability roll deleted, skill
  needs something to buy, and Skyrim's flat-magnitude late game is the
  cautionary tale.

  **Willpower also resists.** Canon's magic resistance is `Willpower × 1.0` —
  the single largest attribute coefficient in the game — rolled against the
  incoming effect. Ours is deterministic and gentler: **innate magic resistance
  = Willpower/4 percent** (25 % at Willpower 100), stacking additively with
  racial and worn resistances and clamped at 100.
- Cost, cast time and magnitude scale on the same bands as weapons (§118), so
  **every damage source sits on one multiplier stack** — the fix for Skyrim's
  late-game Destruction collapse. The quest plan requires the hardest fight to
  be winnable by a magic build; this is what makes that true.
- **Spellmaking**: Morrowind's model — up to 8 effects, fee = 7 × magicka cost,
  magnitude/duration bounded by school skill and Int. Spells you cannot afford
  to cast are makeable and useless, which is self-limiting.
- **Spell-cost reduction** from enchanted gear is the classic mage endgame and
  we keep it, **capped at 75 %** across all sources (owner, round 2: rare,
  hard-won gear should hit hard). Every spell still costs something, so no
  infinite-cast loop exists — Skyrim's 100 %-reduction exploit is closed by the
  cap rather than by removing the fun. Reaching the cap should take genuinely
  rare, placed items, not shop stock.
- **Enchanting**: your point budget is canon's success formula solved for
  points — Morrowind rolls `Enchant + Int/5 − 3 × points`, so the largest
  enchantment you can reliably make is **`points = (Enchant + Int/5) / 3`**
  (40 points at Enchant 100 / Intelligence 100). Item capacity by
  slot/material/weight bounds where it can go; charged-item use cost is canon
  verbatim, `×(1.1 − Enchant/100)`. **Constant effects are tiered by soul size, not one
  flat gate** (owner, round 2 — they are one of the most enjoyable things in
  Morrowind and small ones should be attainable): a petty soul (30) buys a
  small permanent effect, a grand one (600) buys a large one, with lesser,
  common and greater in between; the magnitude a soul can sustain scales with
  it, and skill still sets the point budget.
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
strength = (Alchemy + Int/10) × apparatusQuality / (3 × effectBaseCost)
duration = (Alchemy + Int/10) × apparatusQuality / effectBaseCost
```

Canon verbatim (*Morrowind:Alchemy*), including the oddity that Intelligence
enters at half weight here (`/10`) where it is `/5` almost everywhere else.
Canon's creation roll is deleted: a brew always succeeds, and the skill decides
how *good* it is. Ingredient effects become visible at skill 15/30/45/60 —
canon's `fWortChanceValue` of 15, unchanged. Regional ingredients
come from the lore ecology feed. Potions are the healing economy (§126).

**Smithing** merges Morrowind's Armorer with Skyrim's forge: repair (rate and
achievable ceiling by skill), **tempering** to at most three grades (gated at
effSkill 25/55/80, each grade ≈ +8 % damage or AR — bounded so it cannot
trivialise a danger band), and crafting up to material tier `1 + floor(effSkill/14)`.
Convergent by rule: nothing fortifies smithing, and smithing reads base stats.

**Trade and what replaces haggling.** Morrowind's price is already
deterministic — only the *haggle* was a roll. Canon builds two terms,
`pcTerm = (Disposition − 50) + min(Mercantile,100) + min(0.2×Personality, 10)`
and the merchant's mirror image, and prices the trade on their difference. We
keep exactly that and delete the haggle:

```
advantage  = pcTerm − npcTerm                       # canon's two terms, no Luck, no roll
buy price  = base × clamp(1.35 − advantage/200, 0.80, 1.35)
sell price = base × clamp(0.55 + advantage/200, 0.55, 0.95)
```

So an unskilled, disliked stranger pays about 1.5× what a skilled, welcome one
pays, and sells for about half as much — a 3× swing across the whole system,
which is worth investing in without ever opening a minigame. No repeated
haggling attempts, no "offer" button, no Creeper-style flat-value merchants.
**Vendor purses are finite and refresh on a schedule**, which is also why
Mercantile use cannot be farmed on one village grocer (§120.2). Disposition
moves with race and faction priors, deeds, gifts, bribes and quest state
(§125). Reward design still holds that
"gold is the least interesting thing we can give" (quests 00 §4) — gold's real
job is to feed training, services, potions and enchanting.

**Training and services**: a trainer raises a skill by one rank per session at
canon's price — **10 × the current skill level** in gold (*Morrowind*'s
`iTrainingMod`), then through the barter formula above, so disposition and
Mercantile move it. That is ≈8,000 gold to take a skill 30→50 and ≈45,000 from
30→100: a major sink, and the reason gold matters in a province where quest
rewards are access rather than coin; **a skill can never be trained above its
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
persuasionScore = Speechcraft + Personality/5 + standing      # canon's own rating
                + evidenceBonus (authored flags)               # ours: the quest layer
threshold       = authored, scaled by 1 − 0.02 × |disposition − 50|
```

The first line is Morrowind's persuasion rating verbatim minus Luck
(*Morrowind:Speechcraft*: `Speechcraft + Personality/5 + Luck/10 +
Reputation`), and the disposition factor is canon's `d` term. What we add is
the evidence bonus and the authored threshold in place of the roll.

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

Speechcraft and standing are on the quest plan's inspectable-capability list
(quests [60 §49](../quests/60-writing-and-lore.md), added 2026-08-29), so a
quest author can gate a route on a persuasion threshold the same way they gate
one on water breathing.

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

Fixed danger means every actor, item and trap resolves to fixed absolute
numbers that never read player state — authored **semantically** and compiled
(§128.2). The bands are what a Phase 13 author means by "a D3 creature" —
anchored so the reference character (§116) finds D2 a fair fight and D4 a bad
idea.

**D0 is not a combat rung.** The province's danger vocabulary is set by the
quest plan (quests 20 §12) and decision 0009: **D0 means safe ground** — city
streets, civic buildings, faction halls, settlement interiors — where ordinary
crime happens but no ambient lethal ecology does. It is an authored *location
property*, not a band of the compiled danger field (which runs 1–5 and has no
band 0). A dungeon entrance inside a city carries its own band, authored
separately. Where a settlement is written "D0–D2", read it as *safe interior,
band 1–2 surrounds*.

So the combat ladder has **five rungs, D1–D5**, and vermin live at the bottom
of D1 rather than in a tier of their own:

| Band | Meaning (quests 20 §12) | Health | Light hit | AR | Magic resist | Blows that kill you |
|---|---|---|---|---|---|---|
| D0 | **safe** — no ambient hostiles at all | — | — | — | — | — |
| D1 | low — vermin at the bottom, an unprepared traveller may survive at the top | 20–90 | 4–14 | 0–18 | 0–10 % | 6 |
| D2 | standard — a new but prepared character survives | 100–170 | 24–40 | 18–45 | 10–20 % | 4 |
| D3 | substantial combat/traversal capability required | 200–350 | 52–92 | 45–80 | 15–30 % | 3.5 |
| D4 | specialist equipment, route knowledge, allies | 400–700 | 120–210 | 80–130 | 20–35 % | 3 |
| D5 | fixed endgame, reachable early, never scaled | 650–1250 | 185–320 | 100–170 | 25–45 % | 3 |

**The last column is the design input, and the damage column is derived from
it** (owner ruling, round 2: *getting hit must matter*). "Blows that kill you"
means completely unavoided, unblocked hits landing on the character the band is
meant for, in typical armour for their stage. Heavy armour of the day buys a
blow or two more; genuinely best-in-slot, tempered, enchanted plate buys five or
six — and nothing buys more than that. Change the target, re-run the
calibration, and every band's numbers move together.

`damage` is a **typical light hit**; heavy attacks land at ~2.4× it. Attack
period runs 3.0 s (a mudcrab) down to 1.8 s (D5). Loot value runs 2 → 2200
gold. There is **no poise column**: hit reactions are the sandbox's existing
ones, chosen by Agility's stagger threshold (§121.3).

D1 is deliberately the widest band, because "not really dangerous" covers
everything from a mudcrab to an armed smuggler; the *position* within the band
carries that range (a mudcrab is D1 @ 0.05, a smuggler D1 @ 0.85). Bands D2–D5
map one-to-one onto the compiled danger field's bands 2–5.

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
[the harness findings](../../tooling/stats-sim/FINDINGS.md)): the
reference character kills a D2 Hollow Warden in 7 s and dies to it in 6 blows;
a D3 wamasu takes 31 s and three blows kill her; D4 kills her. An endgame build
kills the final boss in 31–52 s depending on archetype (melee, greatsword,
spear, marksman, stealth and magic all inside a ×1.7 spread) and spends 3–10
potions doing it.

**Every NPC, enemy and merchant carries the player's schema plus a level** — attributes, skills, equipment, effects, respawn class, plus the AI
profile fields the archetype already has. **Authoring is semantic, compiled to
absolutes** (decision 0019's fourth amendment):

```jsonc
{ "id": "swamp-troll-fen",
  "band": "D3", "position": 0.6,           // where in the band
  "variants": ["strong", "diseased"],       // named modifier packages
  "loadout": "…", "respawn": "onRest" }
```

### 128.2 The same trick for loot and traps

The actor schema above is only a third of what Phase 12/13 authors place. Loot
and traps get the same treatment — semantic in, absolutes out — so a curve
retune rebalances the whole world rather than the monsters only (gap found by
decision 0034; the schemas ship with the actor one at 10c):

```jsonc
// loot: a placed item, not a levelled list — nothing reads the player
{ "id": "wreck-hold-cutlass", "band": "D3", "kind": "weapon",
  "class": "scimitar", "quality": 0.55,        // where in the band's material window
  "condition": 0.3,                             // provenance is visible on the item
  "enchant": { "budget": 0.4, "theme": "sea" }, // optional, compiled to a real effect
  "provenance": "went down with the Sallow Reed, 4E 194" }

// traps: damage derives from the band's damage row, not from a hand-typed number
{ "id": "xanmeer-dart-line", "band": "D3", "position": 0.4,
  "type": "dart", "multiplier": 0.6,   // of a band-typical light hit
  "avoidable": "sight+security", "resets": true }
```

Rules that keep this honest: a band's **material window** is what "quality"
interpolates (a D3 weapon is dwarven-to-orcish, never daedric); **placed
treasure never respawns** (§126) so compiling it is a one-time derivation;
uniques may override any field literally; and a trap's damage is expressed as a
fraction of its band's light hit, so the lethality knob (§121.4) moves traps
with everything else.

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
| `skills.json` | the 27 skills: governing attribute, **score attribute**, specialization, effect bands |
| `curves.json` | `k`, `P`, mitigation, health/stamina/magicka, vastei and level-cost constants |
| `races.json` | racial baselines, skill bonuses, effect packages |
| `classes.json` | preset classes (majors/minors/specialization/favoured) |
| `gear.json` | materials, weapon classes, the moveset, armour slots and sets — mirrored from `packages/game-core` + the armour-class tag |
| `magic.json` | spell tiers, healing tiers, enchanting bounds, the alchemy formula |
| `builds.json` | the progression checkpoints and archetype attribute priorities the sweeps run on |
| `ladder.json` | the **D1–D5** combat bands, the hits-to-die targets they were solved *from*, and the variant packages |
| `rules-argonia.json` / `rules-morrowind.json` | the progression rules as the campaign engine consumes them — ours, and Morrowind's for the known-answer test. Numbers marked `$from` are read out of `curves.json` rather than copied |
| `content-argonia.json` / `content-vvardenfell.json` | what an hour of play contains — encounters, travel, locks, casts, brews, on a quest track and a free-play track. **This is the file to change if the pace is wrong**, and the Vvardenfell one is the only thing tuned to make the known-answer test pass |
| `enemies.json` | worked archetypes on the ladder, including the restated Hollow Warden |
| `economy.json` | potion/training/service/repair prices, vendor purses |

The tuning history — every anomaly the harness found and what was done about
it — is [tooling/stats-sim/FINDINGS.md](../../tooling/stats-sim/FINDINGS.md),
next to the tool that produced it.

At 10c these are ported to `packages/game-core/src/stats/data/` in the same
shapes, consumed like `races.json`/`enemyArchetypes` today, and the harness is
re-pointed at the game's copies so the invariants keep running against the real
system. Nothing in this design should ever be a hard-coded constant in gameplay
code.

---
