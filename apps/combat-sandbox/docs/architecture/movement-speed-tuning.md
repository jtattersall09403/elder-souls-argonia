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
| Locked-on **forward** movement | Nothing of its own — it is ordinary free-roam movement | Owner round 8: pushing towards the target plays the normal forward stride (`RUN`/`WALK`) at the normal speed. `lockedStrideClip` returns `null` for forward so the ordinary selection answers |
| Locked-on strafe / back-walk speed | Not a speed at all: the clip's own measured feet. `LOCKED_STRIDE_RATE` in [`packages/game-core/src/locomotion/lockedStride.ts`](../../../../packages/game-core/src/locomotion/lockedStride.ts) scales clip, clock and ground track together | Default `1.35 × 1.5 ≈ 2.03` (round 7's 1.35, plus round 8's "further 50%"). Scaled by stick magnitude (`strideRateForMagnitude`, floor 0.35, dead zone 0.08), so it is analogue on a pad and 1 on the keyboard. Adjustable live via the debug panel's "Locked stride rate" slider (`lockedStrideRate` in the store) |
| Locked-on walk/strafe top speed, *switch off* | `PLAYER_LOCK_ON_WALK_SPEED` in [`packages/game-core/src/io/input.ts`](../../../../packages/game-core/src/io/input.ts) | Only used when "Locked-on speed follows the strafe clips" is off; derives the `lockOnMoveScale` applied to joystick input in `CombatScene.tsx` |
| Enemy walk/run speed | `ENEMY_LOCOMOTION.walkVel` / `.runVel` in [`src/game/combat/tuning.ts`](../../src/game/combat/tuning.ts) | Also drives the enemy `<Ecctrl>` speed props directly |
| Roll launch + decay speed | `DODGE_SPEED.playerRoll` in `tuning.ts`, consumed in `CombatScene.tsx`'s `dodgeReleased` handler (launch) and the `playerAction.current === "roll"` decay block | Same constant used in both places; duration is `COMBAT_TUNING.rollDuration` (`weapon.ts`) — leave that alone to keep clip timing unchanged |
| Backstep launch + decay speed | `DODGE_SPEED.playerBackstep` in `tuning.ts`, consumed the same way in `CombatScene.tsx` | Duration is `ACTION_DURATIONS.backstep` (`tuning.ts`) |
| Enemy roll/backstep speed | `DODGE_SPEED.enemyRoll` / `.enemyBackstep` in `tuning.ts` | Consumed in `CombatScene.tsx`'s enemy `dodge`/`backstep` state handling |

## Animation playback speed (leg-cycle rate)

| Clip(s) | Where | Notes |
| --- | --- | --- |
| `WALK`, `WALK_BACK`, `STRAFE_LEFT`, `STRAFE_RIGHT`, `RUN`, `SPRINT` (base rate) | `playbackRate` field per state in [`rig-skyrim-humanoid.animations.json`](../../../../packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json) | Plain data, safe to hand-edit; pipeline-generated but not geometry, won't be touched unless the pipeline reruns |
| Locked-on `WALK_BACK`/`STRAFE_LEFT`/`STRAFE_RIGHT` extra multiplier | `strideRateForMagnitude(moveMagnitude, lockedStrideRate)` in the `drivenByFeet` block of `CombatScene.tsx` | Applies on top of each clip's own `playbackRate`, **and** advances the clock and the measured ground track by the same factor — that is what keeps the planted foot anchored, so this is a speed knob as much as a look knob. One shared value for all three directions (not per-clip) |
| Crouched locomotion multiplier | Same call with a maximum of `1` | Analogue like the locked strides, but never faster than the authored sneak pace |
| Any other one-shot clip (attacks, roll, backstep, guard, etc.) | That state's own `playbackRate` in the manifest JSON | Duration in `tuning.ts`/`weapon.ts` is derived from `sourceDuration / playbackRate` (`clipPlaybackDuration`), so changing `playbackRate` also changes the action's gameplay duration unless something else clamps it |

Final mixer speed = `clipConfig(state).playbackRate * speedMultiplierRef.current`
(see `action.timeScale = ...` in [`SkyrimFighter.tsx`](../../src/components/SkyrimFighter.tsx)).
`speedMultiplierRef` is `playerAnimationSpeed` in `CombatScene.tsx` — for
ordinary free-roam locomotion it is `locomotionSpeedMultiplier` against the
actor's real speed (itself analogue, via `analogueMoveSpeed`), for a locked
strafe or the crouch it is the analogue stride rate above, and while playing
`JUMP_START`/landing clips it is a computed ratio matching their fixed
gameplay timers.

## Analogue input

The stick magnitude survives intact from `InputController` (`io/input.ts`): its
dead zone *rescales* the axes rather than snapping them to 1, so
`moveMagnitude` in `CombatScene.tsx` is a genuine 0..1. Both the free-roam
speed cap (`analogueMoveSpeed`) and the locked/crouched stride rate
(`strideRateForMagnitude`) read it, so every movement mode is analogue on a pad
and full-rate on the keyboard, which reports 1. The on-screen touch stick feeds
the same field; a GameSir-style pad in HID mode arrives through the Gamepad API
axes like any other controller.
