# 0089 — The combat runtime is a package with an injected host; the sandbox debug store moves into the app

**Date:** 2026-09-24. **Status:** accepted (combat-sandbox lane round 0, under
0087's delegation; owner ruling 2026-09-24: do the sandbox side of the
Phase 10b merge now, once). Implements the sandbox half of world module 75
§53 and the audit's §1(iv).

## Context

`apps/combat-sandbox/src/components/CombatScene.tsx` had grown to 4,485
lines: the player rig wiring, stance, camera, lock-on, bow, enemies, hit
resolution wiring and one frame loop of about 2,000 lines, all app-private.
Every later round of this lane (off-hand items, stealth, swimming) builds into
that code, and Phase 10b has to give the world studio the same encounter.
It read its switches from `game-core/core/store.ts`, a zustand singleton only
the sandbox used.

## Decisions

1. **Home: `packages/character/src/combat/`**, exported from
   `@elder-souls/character` as `CombatRuntime`. The character package already
   holds the rendered actor, the hurtboxes and `PlayerBody`, and depends on
   R3F, Rapier and game-core; a new workspace package would add a lockfile
   entry and nothing else.
2. **The host is injected.** `CombatRuntime` takes `settings`
   (`CombatRuntimeSettings`), `publish` (a `Partial<CombatHudState>` sink),
   an `EncounterLayout` (spawn points in the host's world) and optional probe
   hooks. The frame loop reads settings through a ref, so a slider takes
   effect next frame without a restart. The four values the scene graph
   renders from (lock state, aiming, player action) are latched locally at
   the HUD tick.
3. **The debug store is the app's.** `core/store.ts` moved to
   `apps/combat-sandbox/src/sandboxStore.ts`; `GameSnapshot` became the
   app's type (runtime settings + HUD state + `showHitboxes`). New sandbox
   switches go there, never into game-core.
4. **The frame loop is split by actor.** One enemy's frame is
   `enemyStep.ts` (`stepEnemy(ctx, e)`, the player's state passed as refs so
   a blow from one enemy is seen by the next in the same frame). A new system
   joining the encounter (stealth awareness, swim, carried light) adds a step
   module and a host field rather than growing `CombatRuntime.tsx`.
5. **Callouts are catalogue text.** The 18 combat callouts ("Enemy felled",
   "Target locked") are `text.combat.*` entries; the HUD upper-cases them.
   "Sword parry" became "Parry" (it showed for every weapon).

## Consequences

- `CombatScene.tsx` is 83 lines of composition (arena, lights, wiring).
- Phase 10b adopts `CombatRuntime` in the studio; the README beside it lists
  what the host provides. Injecting the remaining game-core stores
  (inventory, race, arrows, input) is 10b's pass, not new debt.
- Validation telemetry (`window.__COMBAT_VISUAL_SCENARIO__`) is typed in the
  package and written only when a scenario is passed.
