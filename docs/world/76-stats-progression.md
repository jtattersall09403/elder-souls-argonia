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
stats work is therefore **additive**: a system that produces today's numbers at
baseline and varies them from there.

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
  item is authored as an **absolute** number. Two consequences:
  - the stat system must have a **stable, documented power scale** so a Phase 13
    author can say "this is a D3 creature" and mean something numerically;
  - **runaway multiplicative progression is forbidden** — the Skyrim
    smithing/enchanting/alchemy loop and Morrowind's fortify chains break a
    fixed world by construction. Growth must be bounded (soft caps, diminishing
    returns, gear as the main power axis).
- **Player skill stays the primary variable.** We have Dark Souls combat:
  real-time hitboxes, parry windows, i-frames, stamina. So:
  - **no hidden to-hit roll.** Morrowind's dice-based miss chance is
    incompatible with a swing that visibly connects — a swing that lands must
    land. Character skill modifies damage, stagger/poise, stamina cost,
    recovery, reach and reliability — never whether a physically-connecting
    attack registers.
- **Don't casually retune gameplay** (CLAUDE.md). The first implementation
  must reproduce today's feel at baseline: current `COMBAT_TUNING` values are
  the **stat-neutral reference point**, and there should be a test that says so.
  Retuning is a separate, deliberate, owner-gated act.
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
| Progression | Use-based vs point-buy vs souls-spend; what levelling means with no world scaling |
| Damage model | How skill/attributes/weapon scaling combine; no to-hit dice (§102) |
| Defence | Armour rating, resistances, poise/stagger, equip load and roll speed |
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
to write loot and populations against; it does not require retuning current
combat feel to ship v1.

## 104. Phase 10c — implementation

Implements the accepted design in `packages/game-core` (stats live with the
game layer, consumed by both apps), then:

- baseline-equivalence tests: at neutral stats, combat numbers match today's;
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
