# 0019 — The stats system: a parallel design workstream, implemented at Phase 10c

**Date**: 2026-08-25 · **Status**: accepted (owner question 2026-08-25: does
the stats system belong in the world build plan, or after it?)

## Context

The sandbox has calibrated combat with **no character statistics behind it** —
flat `maxHealth`/`maxStamina` from `COMBAT_TUNING` and per-archetype values;
races are bodies with no attributes; no skills, resistances, carry weight,
levels or birthsigns. A full stats system is a large, taste-heavy piece of
design (Morrowind vs Skyrim vs Souls on a dozen axes) with many owner
decisions in it, and it touches nearly every system.

## Decision

Split it in two, and put it in the plan explicitly:

1. **Workstream S — design (parallel, docs and decisions only).** Runs
   alongside Phases 8a–10, on the pattern of the lore-extrapolation workstream
   (module 45) and the quest-plan review (0018). Researches the three reference
   games, then settles the axes one by one with the owner. Charter and the
   question list: **[module 76](../world/76-stats-progression.md) §103**.
2. **Phase 10c — implementation.** After 10b (sandbox parity), **before Phase
   11**. Implements the accepted design in `packages/game-core`, regenerates
   capability profiles from it, restates enemy archetypes on the new scale.

## Why that placement

- **The world build is not blocked on stats.** Module 75 §52 already makes
  *capability profiles* the world↔character contract: the world compiler
  validates traversal against named profiles generated from gameplay data and
  never hard-codes today's speeds. When stats land, profiles are generated from
  the stat system instead of hand-set, and no world data changes.
- **But content authoring is blocked on stats.** Fixed difficulty (0004) means
  every enemy, trap and loot item in Phases 11–13 is an **absolute** number. A
  Phase 13 author writing "this basin holds a D4 predator" needs a scale that
  exists. Authoring that content first and inventing the scale afterwards means
  re-authoring all of it.
- **The design needs nothing from the world**, so it can run in parallel and
  the owner decisions can be taken at leisure rather than blocking a phase.

## Constraints this design must satisfy (recorded so they aren't re-litigated)

- **No hidden to-hit roll.** Morrowind's dice-based miss chance is incompatible
  with the Dark Souls combat already built (real hitboxes, parry windows,
  i-frames): a swing that visibly connects must register. Skill modifies
  damage, poise/stagger, stamina cost, recovery and reach — never whether a
  connecting attack lands.
- **An uncapped power ceiling is wanted** (owner, 2026-08-25): Morrowind's
  "accidentally overpowered because you put the work in" is a feature we keep.
  It is not in tension with fixed danger — it is its payoff, since a world that
  stays put is what makes growth legible. What the design protects instead:
  power is *earned through system mastery* rather than handed out by the
  levelling curve; it is not the intended path (the critical path and danger
  bands assume a competent, ordinarily-equipped character); the early curve is
  gradual **as intent, not as an enforced invariant** — no validation
  machinery, and accidental early gems are easter eggs, not defects (the
  "Morrowind jump-scroll rule", owner amendment 2026-08-25); and the world
  degrades into "you skip the challenge" rather than into unfinishable states
  when someone gets there.
- **A documented absolute power ladder**, so D0–D5 danger bands and the access
  progression (0007) mean something numerically.
- **Today's values are calibration data, not the neutral baseline** (owner
  clarification, 2026-08-25; module 75 §52). The sandbox tuning answered "can
  this combat feel fun?", not "is this a level-1 character". The design chooses
  where today's feel sits on the curve and re-bases magnitudes (health, damage,
  stamina pool) freely. What is anchored is the feel at a **reference
  loadout**: one named default character reproduces today's timing and weight,
  asserted by test at Phase 10c. Around that anchor, stat- and load-linked
  timing variation is **design space, not drift** (owner amendment
  2026-08-25): attack speed may scale with stats for some weapon classes, and
  roll behaviour follows the Souls equip-load pattern (fast/mid/fat tiers from
  burden ratio, movable by attributes, spells, enchantments, effects).
  Workstream S reasons through the options — few hard rules were set early on
  purpose.
- **Argonian physiology** (breath, swimming, disease) must be expressible as
  race modifiers — it is a world acceptance rule.
- **Birthsigns are calendar-shaped**: the thirteen constellations, one per
  month, come free from the world clock (module 55 §95); design the hook now,
  ship the content later.

## Owner steer, 2026-08-25 (second amendment): the skeleton is chosen

**"Morrowind chassis with a Souls combat layer"** is the shape — workstream S
does not choose it, it works out what it *means*: the chassis↔layer seams, the
mapping of our Skyrim-taxonomy items and rig onto Morrowind-style categories,
the keep/drop of Morrowind-only categories by sourceable assets+movesets
(spears are recoverable — verified leads in module 76 §103.0), and an explicit
**completeness duty** to surface the mapping decisions the owner hasn't
thought to ask about. Round 1 presents mapping decisions, not a shape choice.

## How to start it

Workstream S is startable from a single instruction ("kick off workstream S"):
the run-book — what to read, the four packets, how to batch owner questions,
and the definition of done — is **module 76 §103.1**. The PROGRESS row `S`
tracks it.

## Also recorded (owner, same conversation)

The sandbox's systems are **not finished or unchangeable** — later phases may
refactor and extend them. What is protected is the calibrated *feel*, the
controller boundary and the package rule, not the code structure. Written into
module 75 §51.1 and the CLAUDE.md retuning rule.
