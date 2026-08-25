# Part VIII-b — Stats, progression and character systems (§100–104)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles.
>
> Companion: [75-combat-compatibility.md](75-combat-compatibility.md) (§51–57) — the
> portability boundary and capability profiles this module feeds. Sequencing:
> workstream **S** (design, parallel) → **Phase 10c** (implementation), Module 95 §86,
> decision [0019](../decisions/0019-stats-system-workstream-and-placement.md).

## 100. What exists today, and why that matters

The combat sandbox ships a working, tuned combat model with **no character
statistics behind it**. Concretely (`packages/game-core`): a fighter has
`maxHealth`, `health`, `maxStamina`, `stamina` and a stamina cooldown, taken
from `COMBAT_TUNING` for the player and from `enemyArchetypes` for everything
else; weapons, armour, materials, guard and arrows have real per-item
properties; races are **bodies** (mesh, slots, appearance), carrying no
attributes. There are no attributes, skills, resistances, carry weight,
birthsigns, levels or experience.

That is a good place to be. The combat *feel* is calibrated and playtested;
what's missing is the layer that makes those numbers vary by character. The
stats work is therefore **additive**: it decides where today's calibrated feel
sits on the curve and varies from there — it does not re-answer "is the combat
fun?", which the sandbox already answered.

## 101. Why this is its own workstream, not a side-effect of another phase

Three properties make stats unlike the rest of the build:

1. **It is design-decision-heavy and owner-owned.** Morrowind, Skyrim and Dark
   Souls answer every axis differently (attributes vs skills vs levels; use-based
   vs point-buy; dice vs deterministic; perks; soft caps; encumbrance;
   birthsigns). These are taste decisions with long consequences, and they are
   the owner's to make — not something an agent should infer mid-phase.
2. **It is broad, not deep.** It touches races, equipment, combat, movement,
   swimming/climbing capability, magic, disease, dialogue gating, loot,
   encounters and the levelling curve. A phase that "adds stats" while also
   doing something else will do it badly.
3. **It needs almost nothing from the world.** The design can be written and
   decided while the world phases run — which is exactly what a parallel
   workstream is for (the lore extrapolation loop, module 45, is the precedent).

Hence: **workstream S** produces the design and the owner decisions; **Phase
10c** implements it.

## 102. The constraints any stat design must satisfy (binding)

These are not open questions — they follow from decisions already taken.

- **Fixed difficulty (decision 0004) is the dominant constraint.** The world
  never receives the player's level. Every enemy, every trap and every loot
  item is authored as an **absolute** number, so the stat system must have a
  **stable, documented power scale** — a Phase 13 author saying "this is a D3
  creature" has to mean something numerically.
- **Becoming absurdly powerful is a feature, not a bug** (owner, 2026-08-25).
  One of the joys of Morrowind is the silliness of ending up almost accidentally
  overpowered *because you put the work in*. We keep that. Note it does not
  conflict with fixed danger — it is fixed danger's **payoff**: because the
  world stays put, your growth is legible (the swamp that killed you at hour
  three is trivial at hour eighty). Skyrim's level scaling is what destroys
  that feeling, not uncapped growth. What the design should protect instead:
  - **power must be earned through system mastery**, discovered and combined by
    the player (alchemy, enchanting, trade, training, rare gear, quest
    rewards) — emergent, not handed out by the levelling curve;
  - **it must not be the intended path.** The critical path and the fixed
    danger bands are tuned for a competent, ordinarily-equipped character; the
    god-build is what a player *can* reach off the beaten track, never what
    the game requires or nudges everyone into;
  - **it should not be the norm in the first hours** — the intended curve is
    gradual. But this is design intent, **not an enforced invariant**: build no
    validation machinery for it, and an *accidental* early gem (a lucky cave,
    a lethal-if-misused scroll) is an easter egg, not a bug — call it the
    **Morrowind jump-scroll rule** (owner, 2026-08-25). Don't place early
    god-loot on purpose; don't panic when emergent combinations produce it;
  - **the world must not break when it happens** — quests, gates and access
    progression should degrade gracefully into "you skip the challenge", not
    into unfinishable states.
- **Player skill stays the primary variable in ordinary play.** We have Dark
  Souls combat: real-time hitboxes, parry windows, i-frames, stamina. So:
  - **no hidden to-hit roll.** Morrowind's dice-based miss chance is
    incompatible with a swing that visibly connects — a swing that lands must
    land. Character skill modifies damage, stagger/poise, stamina cost,
    recovery, reach and reliability — never whether a physically-connecting
    attack registers.
- **Today's combat values are calibration data, not the neutral baseline**
  (§52, and owner clarification 2026-08-25). The sandbox tuning answered "can
  this combat feel fun?" — yes — not "is this what a level-1 character feels
  like". So:
  - the design **chooses where today's feel sits on the curve** (plausibly a
    competent, mid-ish character rather than a beginner) and re-bases the
    magnitude numbers — health, damage, stamina pool, carry weight — freely
    across it;
  - what is protected is the **calibrated feel at a reference loadout**: one
    named default character (standard weapon, middling armour, neutral burden)
    must reproduce today's timing and weight — windups, recoveries, i-frames,
    parry windows, roll distance, stamina rhythm. Around that anchor,
    **stat- and load-linked timing variation is design space, not drift**
    (owner, 2026-08-25): attack speed may scale with stats for some weapon
    classes, and roll behaviour should follow the Souls equip-load pattern —
    fast/mid/fat roll tiers driven by burden ratio, which attributes, spells,
    enchantments, potions and other effects can move. Few hard rules here;
    workstream S reasons through the options and brings recommendations.
- **Capability profiles are the world↔stats contract** (§52). The world
  compiler already validates traversal against named profiles
  (`baselineArgonian`, `trainedSwimmer`, `highBurden`, …) generated from
  gameplay data, and never hard-codes today's speeds. When stats land, profiles
  are *generated from the stat system* instead of hand-set — and no world data
  needs to change. **This is why the world build is not blocked on stats.**
- **Argonian physiology is a world-acceptance rule** (00-core): breath,
  swimming and disease resistance must be expressible as race modifiers.
- **Birthsigns are calendar-shaped.** The thirteen constellations, one per
  month, are canon and now modelled by the world clock (module 55 §95): a
  birth date yields a birthsign for free. Design for that hook even if
  birthsigns ship later.

## 103. Workstream S — the design questions to settle

Runs as docs + decisions (`docs/decisions/`, research in `docs/research/`), in
parallel with Phases 8a–10. Deliverable: a decided design, axis by axis, with
the reasoning and the rejected options recorded.

**Research first** (module 90/CLAUDE.md rule): how the three reference games
actually work and what is known to fail — Morrowind's use-based skills and
attribute multipliers, Skyrim's perk trees and level scaling, the Souls
family's soft-capped scaling, weapon scaling grades, poise and equip load.
Record findings in `docs/research/` before deciding.

**Axes to decide** (each: Morrowind-like / Skyrim-like / Souls-like / ours):

| Axis | The question |
|---|---|
| Attributes | Do we have them? How many? What do they *do* mechanically? |
| Skills | Breadth (Morrowind's 27) vs focus; what each gates |
| Class / background | Does character creation include a class or background (Morrowind major/minor skills, Souls starting classes, classless Skyrim)? What it seeds and what it locks |
| Progression | Use-based vs point-buy vs souls-spend; what levelling means with no world scaling; trainers, skill books and services as levers (ties into the Owing economy — quests lore) |
| Movement | Do stats change run/swim/climb speed, jump, burden (Morrowind athletics/acrobatics vs fixed Souls movement)? Every answer must stay inside capability-profile ranges (§52) |
| Power ceiling | Which systems combine to make a god-build, how much work it takes, and how the world holds together when someone gets there |
| Damage model | How skill/attributes/weapon scaling combine; no to-hit dice (§102) |
| Defence | Armour rating, resistances — including disease and poison, a Black Marsh pillar (module 30) — poise/stagger, equip load and fast/mid/fat roll tiers |
| Stamina | Costs, regen, and whether stats change them |
| Encumbrance | Carry weight and its movement/swim/climb consequences |
| Magic | Whether schools mirror skills; cost model; enchanting bounds |
| Health/recovery | Estus-like fixed charges vs potions vs regeneration |
| Races | What each race actually changes (and Argonian water/disease canon) |
| Birthsigns | Deferred content, but the hook and slot shape decided now |
| Enemy scale | The absolute power ladder D0–D5 maps onto (fixed danger) |
| Death/loss | What is lost on death; how that interacts with fixed danger |

**Cross-checks before the design is accepted**: it satisfies §102; it can express
the existing enemy archetypes; it can express the access-progression model
(decision 0007) and the D0–D5 danger bands; it gives Phase 13 authors a scale
to write loot and populations against; it can express the quest plan's skill,
faction and reputation gating (docs/quests/); any stat that changes movement,
swim/climb speed or burden maps into capability-profile *ranges* so the
world's traversal validation still brackets what real characters can be
(§52); it reproduces today's feel at the reference loadout.

### 103.1 How to run workstream S (an agent can start from this section alone)

Told only "kick off workstream S" or "deliver workstream S", start here.
Read: this module, decision
[0019](../decisions/0019-stats-system-workstream-and-placement.md),
[75 §51–52](75-combat-compatibility.md), decisions 0004 (fixed difficulty) and
0007 (access progression); skim `packages/game-core/src/combat/` +
`equipment/` + `actors/` to see what the numbers actually are today; and skim
what the quest plan already assumes of character systems (speech, sneak,
lockpicking, disease, reputation gates — route via
[quests/README](../quests/README.md)). You do not need the world modules.

**The owner-interaction contract: exactly two decision rounds by default.**
The owner has asked to be consulted at key points with decisions batched, not
drip-fed. Every question is self-contained — options A/B/C in plain
non-technical language, one recommendation the owner can simply accept, what
it costs elsewhere in one line. Minor calls are **never questions**: decide
them yourself and record them as *proposed defaults* the owner can veto at
round 2. Record accepted answers as decision records (format precedent:
`world/sources/lore/extrapolation/owner-questions.md`).

1. **Set the PROGRESS row `S` to `in progress`** with your current packet, and
   commit that before the work (PROGRESS protocol).
2. **Research packet.** The three reference games, axis by axis, plus known
   failure modes. Record in `docs/research/` (suggested:
   `stats-progression-reference-games.md`) — findings and *implications for
   us*, not a wiki dump.
3. **Skeleton first — do not detail axes yet.** The axes compose: attributes
   shape the damage model, progression shapes both, class shapes chargen.
   Write one page giving 2–3 coherent overall *shapes* for the whole system
   (e.g. "Morrowind chassis with a Souls combat layer" vs "classless
   use-based" vs …), each with its knock-on consequences.
4. **Owner round 1 — direction.** One batch, one sitting: the skeleton choice
   plus the handful of axis calls that shape everything downstream
   (attributes yes/no and how many; progression model; class/background
   yes/no; death/loss; magic's overall shape). Everything else waits.
5. **Detail every axis under the chosen shape.** The **decided design**
   extends this module (the plan is the deliverable); option analysis and
   rejected alternatives go in the research doc — keep this module lean
   enough that every stats-adjacent agent can afford to read it. Minor calls
   become proposed defaults, not questions.
6. **Numbers packet.** The absolute power ladder (what D0–D5 means), the
   progression curve, worked examples: a starting character, a competent
   mid-game one, a god-build, and three enemy archetypes restated.
7. **Owner round 2 — confirmation.** The assembled design, the numbers, the
   worked examples and the full list of proposed defaults, reviewed in one
   sitting; fold any genuinely remaining questions into this round.
8. **Done when**: every axis is decided or default-accepted, the §103
   cross-checks pass, and Phase 10c could be implemented by an agent reading
   only this module and the decisions. Flip the PROGRESS row to `done`.

**Code is out of scope.** Workstream S is docs and decisions; implementation is
Phase 10c and must not start early — it would land in the same files as Phase
10b's extraction work.

## 104. Phase 10c — implementation

Implements the accepted design in `packages/game-core` (stats live with the
game layer, consumed by both apps). Stat, skill and progression definitions
land as **data files consumed like `races.json`/`enemyArchetypes`**, not code
sprawl — the scaling golden rule; Phase 13 authors and validators read the
same data. Then:

- **reference-loadout equivalence asserted**: one named default character
  reproduces today's timing and weight; deliberate stat/load-driven timing
  variation (attack-speed scaling, equip-load roll tiers) is implemented as
  designed and is not treated as drift;
- capability profiles regenerate from the stat system, and the world's
  traversal/validation probes still pass (§52);
- character-sheet UI in the studio and the sandbox;
- enemy archetypes restated on the new scale;
- the power ladder documented for Phase 13 authors.

Sequenced after 10b (parity) and **before Phase 11**: settlements, dungeons and
especially Phase 13 (fixed populations, encounter sockets, fixed loot, arrows)
author absolute numbers, and re-authoring that content against a stat scale
invented afterwards is the expensive mistake this ordering avoids.

---
