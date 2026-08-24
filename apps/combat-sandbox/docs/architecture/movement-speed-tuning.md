# Movement & animation speed tuning

Quick reference for hand-tuning "how far things move" vs "how fast the
animation looks like it's cycling" — these are independent knobs. All
locomotion/dodge clips have root motion stripped at build time (see
[animation-contract.md](animation-contract.md)), so nothing here moves the
character by editing a clip; travel distance always comes from
physics-side velocity, and clip speed is a purely visual multiplier.

## Physical travel speed (distance)

| Action | Where | Notes |
| --- | --- | --- |
| Free-roam walk/run top speed | `PLAYER_WALK_SPEED` in [`src/game/io/input.ts`](../../src/game/io/input.ts) | Also drives `<Ecctrl maxWalkVel>` in `CombatScene.tsx` — same constant, single source of truth |
| Free-roam sprint top speed | `PLAYER_SPRINT_SPEED` in [`src/game/io/input.ts`](../../src/game/io/input.ts) | Also drives `<Ecctrl maxRunVel>` in `CombatScene.tsx`. Sprint is disabled while locked on (`lockOnSprintAllowed`) |
| Locked-on walk/strafe top speed | `PLAYER_LOCK_ON_WALK_SPEED` in [`src/game/io/input.ts`](../../src/game/io/input.ts) | Independent of free-roam walk speed; derives the `lockOnMoveScale` applied to joystick input in `CombatScene.tsx` |
| Enemy walk/run speed | `ENEMY_LOCOMOTION.walkVel` / `.runVel` in [`src/game/combat/tuning.ts`](../../src/game/combat/tuning.ts) | Also drives the enemy `<Ecctrl>` speed props directly |
| Roll launch + decay speed | `DODGE_SPEED.playerRoll` in `tuning.ts`, consumed in `CombatScene.tsx`'s `dodgeReleased` handler (launch) and the `playerAction.current === "roll"` decay block | Same constant used in both places; duration is `COMBAT_TUNING.rollDuration` (`weapon.ts`) — leave that alone to keep clip timing unchanged |
| Backstep launch + decay speed | `DODGE_SPEED.playerBackstep` in `tuning.ts`, consumed the same way in `CombatScene.tsx` | Duration is `ACTION_DURATIONS.backstep` (`tuning.ts`) |
| Enemy roll/backstep speed | `DODGE_SPEED.enemyRoll` / `.enemyBackstep` in `tuning.ts` | Consumed in `CombatScene.tsx`'s enemy `dodge`/`backstep` state handling |

## Animation playback speed (leg-cycle rate)

| Clip(s) | Where | Notes |
| --- | --- | --- |
| `WALK`, `WALK_BACK`, `STRAFE_LEFT`, `STRAFE_RIGHT`, `RUN`, `SPRINT` (base rate) | `playbackRate` field per state in [`rig-skyrim-humanoid.animations.json`](../../../../packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json) | Plain data, safe to hand-edit; pipeline-generated but not geometry, won't be touched unless the pipeline reruns |
| Locked-on `WALK`/`WALK_BACK`/`STRAFE_LEFT`/`STRAFE_RIGHT` extra multiplier | Flat `1.4` in the `playerAnimationSpeed.current = ... lockedLocomotion ? 1.4 : 1` assignment in `CombatScene.tsx` | Applies on top of each clip's own `playbackRate`; currently one shared value for all four directions (not per-clip) |
| Any other one-shot clip (attacks, roll, backstep, guard, etc.) | That state's own `playbackRate` in the manifest JSON | Duration in `tuning.ts`/`weapon.ts` is derived from `sourceDuration / playbackRate` (`clipPlaybackDuration`), so changing `playbackRate` also changes the action's gameplay duration unless something else clamps it |

Final mixer speed = `clipConfig(state).playbackRate * speedMultiplierRef.current`
(see `action.timeScale = ...` in [`SkyrimFighter.tsx`](../../src/components/SkyrimFighter.tsx)).
`speedMultiplierRef` is `playerAnimationSpeed` in `CombatScene.tsx` — `1` for
ordinary free-roam locomotion, `1.4` while locked-on-strafing, and a computed
ratio while playing `JUMP_START`/landing clips to match their fixed gameplay
timers.
