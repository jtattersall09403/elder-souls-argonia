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
  bands assume a competent, ordinarily-equipped character); it is not reachable
  in the first hours; and the world degrades into "you skip the challenge"
  rather than into unfinishable states when someone gets there.
- **A documented absolute power ladder**, so D0–D5 danger bands and the access
  progression (0007) mean something numerically.
- **Today's values are calibration data, not the neutral baseline** (owner
  clarification, 2026-08-25; module 75 §52). The sandbox tuning answered "can
  this combat feel fun?", not "is this a level-1 character". The design chooses
  where today's feel sits on the curve and re-bases magnitudes (health, damage,
  stamina pool) freely. What must not drift is the **timing and weight** —
  windups, recoveries, i-frames, parry windows, roll distance, stamina rhythm —
  asserted by test at Phase 10c. Changing those is a separate, owner-gated act
  (CLAUDE.md).
- **Argonian physiology** (breath, swimming, disease) must be expressible as
  race modifiers — it is a world acceptance rule.
- **Birthsigns are calendar-shaped**: the thirteen constellations, one per
  month, come free from the world clock (module 55 §95); design the hook now,
  ship the content later.

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
