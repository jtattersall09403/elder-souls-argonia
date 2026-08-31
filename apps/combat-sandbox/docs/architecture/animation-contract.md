# Animation contract

The game speaks in **semantic** animation states (`packages/game-core/src/core/types.ts`
`AnimationState`): `IDLE`, `WALK`, `WALK_BACK`, `STRAFE_LEFT/RIGHT`, `RUN`,
`SPRINT`, jump trio, `LIGHT_1/2/3`, `HEAVY`, `HEAVY_2`, `ROLL`, `BACKSTEP`,
`GUARD`, `PARRY`, `RIPOSTE`, `CRITICAL_KNOCKDOWN`, `CRITICAL_DEATH`, `BACKSTAB`,
`BACKSTABBED`, reactions, `HEAL`, `EQUIP`/`UNEQUIP`, `DEATH`.

## The rig is several files: animation packs

The rig ships as one GLB per **animation pack** — `core` (everything a body can
do without knowing what it holds: locomotion, crouch, jump, dodge, reactions,
death), `criticals` (the paired riposte/backstab every melee weapon reuses),
and one per weapon family. Every pack repeats the same skeleton and carries
only its own clips, so joining them is concatenating clip lists and nothing
knows which file a clip arrived in.

An actor is handed `loadoutAnimationPacks(loadout)` and loads exactly those;
`SkyrimFighter` is keyed on the resolved set as well as the race, because the
mixer binds each clip's bones once and changing the clip list under a live
mixer leaves its bindings pointing at the old data. Packs declare what they
borrow (`greataxe` needs `greatsword`'s carriage, which needs `criticals`) and
`resolveAnimationPacks` takes the closure.

**A missing pack does not error.** A mixer asked for an action it does not have
leaves the previous one playing, so the symptom is a riposte that renders the
idle pose. `equipment/animationPacks.test.ts` is the guard: it proves every
weapon and shield in the arsenal can play every clip its profile names, from
the packs its own loadout resolves. Adding a weapon family means adding to that
arsenal and letting the test check it — not remembering this paragraph.

Adding a family: clips into the pipeline's animation config with a `pack`, a
pack entry saying what it borrows, a `MovesetDefinition` in
`equipment/movesets/`, and the class table pointing at it. Nothing in loading,
binding, the actor or the combat FSM changes. See decision 0040.

## Manifest-driven

`packages/game-core/src/anim/animationManifest.ts` loads
`generated/rig-skyrim-humanoid.animations.json` (emitted by the asset pipeline). Per
state it exposes `looping`, `playbackRate`, `crossFadeDuration`, optional
`crossFadeOutDuration`, `rootMotion`
policy, `sourceDuration` and `rootMotionDelta`, plus support policy/envelopes,
rig sockets, and recommended scale. An optional `playbackEndTime` is a
source-time out-point for a deliberately selected prefix of a longer clip; use
`clipPlaybackSourceSpan(...)` when mapping that motion onto a fixed gameplay
window. A transition command may override `crossFadeDuration` for one audited
edge without changing the semantic clip's default.

The mapping from a semantic state to any Bethesda source clip lives **only** in
the pipeline. To reskin an animation (e.g. a nicer `ROLL`), change the pipeline
manifest and rebuild the GLB — no game-code change.

`rootMotion: "strip"` vs `"consume"` in the manifest is currently **informational
only** — `rootMotionDelta` is recorded but never read at runtime. What actually
changes build behaviour is the root-motion policy, whose **default is: the
controller owns planar travel and the authored vertical COM channel survives**
(Skyrim humanoid COM local axis 2, native Z, which exports as GLB world Y). Do
not generalize that axis index to another rig without a transform-aware source
and post-export audit. Three pipeline flags (on the animation config entry, not
the manifest) modify it:

- `preserveRootMotion` skips stripping entirely, for stationary loops (`IDLE`,
  `SWORD_IDLE`, `GUARD`) whose authored root sway keeps the feet planted —
  stripping a net-zero-but-oscillating curve anyway freezes the torso while the
  untouched leg curves still slide the feet.
- `stripVerticalRootMotion` opts *out* of the default, for the clips whose
  height the physics controller owns (`JUMP_START`, `JUMP_IDLE`). Preserving
  the authored launch there would add to the controller's jump arc.
- `preserveRootMotionAxes` is the explicit per-axis escape hatch for an
  exceptional rig.

Vertical COM used to be stripped by default, which is what made almost every
action hover: the torso stayed pinned at its rest height while the legs kept
their authored crouch, lunge or stagger, so the feet came up to meet the body
instead of the body settling onto the feet. Measured on the built GLB, the
guard entry sat 0.26 m off the floor for its whole 0.83 s, the parry 0.23 m,
guard-hit 0.19 m, and every walk/strafe cycle 0.03–0.08 m. Only the clips that
happened to carry an explicit preserve flag were correct — which is exactly why
the symptom looked like "idle is fine, everything else floats". The manifest's 30 Hz deformed-surface curves and
  identity-preserving bone-local heel/toe points keep ground-bound clips above
  the support plane without pinning declared airborne motion or skinning every
  mesh at gameplay runtime. During a material ground-bound crossfade, runtime
  transforms both clips' endpoint support candidates through the *actual
  blended* foot bones and uses the lower visible candidate. It deliberately
  does not interpolate two unrelated changing lowest vertices.

`LOCOMOTION_STATES` (mixer-driven, self-timed) includes the jump family
(`JUMP_START`/`JUMP_IDLE`/`JUMP_LAND*`) even though takeoff and landings are
one-shot, not looping. Jumping isn't a `CombatAction`, so the shared
`playerActionTime`/`actionTime` clock keeps free-running while airborne instead
of resetting at takeoff; driving a clip from that stale clock clamps it to its
last frame from the very first rendered frame. Self-timing sidesteps that
entirely — don't move a state out of `LOCOMOTION_STATES` unless its combat
action clock is actually reset at entry.

## Guarding is decided by the off hand

`activeGuardProfile` picks a shield's numbers over the weapon's, and
`activeGuardAnimations` picks its *motion* the same way — a shield is a braced
face carried on the off arm, not an angled edge, and Skyrim authors the two as
separate clip sets. Every guard, block-hit and parry read in combat goes
through that resolver rather than through `weapon.animations.guard`, so a
future off-hand item (a torch, a second blade) brings its own block by
supplying a `GuardAnimationProfile` and the combat FSM is unchanged.

## Weapon sockets

A weapon GLB keeps its native NIF attach-node axes, while the imported armature
stores bones in Blender's convention. The fixed rotation between those two
frames belongs to the **rig**, not to any item, so the pipeline emits it once as
`rig.socketRotation` and `SkyrimFighter` applies it to every socket mount. A
weapon definition's `localRotation` is therefore identity unless that item
genuinely wants an offset of its own. Do not hand-tune a per-weapon quaternion:
the previous one was 90° out, which put the blade along the forearm instead of
through the fist, and any contact timing audited against it is stale.

## Weapon-type scalability

Every weapon-specific animation is data on `WeaponDefinition.animations`
(`packages/game-core/src/equipment/`): combat idle/sprint override, guard enter/loop/hit
variants, two-stage parry, light/heavy actions, guard break, equip, and paired
critical actions. A critical profile also owns victim action, alignment,
separation, facing, damage point, release point, and root-motion policy. Combat
logic reads that profile rather than equating `GUARD` or `BACKSTAB` with one-
handed swords forever. Actors now resolve their weapon from a `Loadout` (the
player from `PLAYER_LOADOUT`, an enemy from its archetype), so a second weapon
is data; an inventory that swaps loadouts at runtime remains the next step.

The sword profile stores the audited physical separation, relative facing,
victim anchor, contact/release progress, victim start phase, explicit recovery
entry time, and horizontal-root-motion policy. The #74453 backstab is genuinely
paired, so its unprefixed attacker and `2_` victim tracks share time zero.
Rim's packaged 4.1 s attacker action is a three-hit execution, but the game has
one damage/reaction event. Runtime therefore uses only its source 0–1.3 s
opening CQC02 lunge. The victim holds a stable guard-broken pose until the
production-rendered blade contact at source 0.5667 s. At that instant a
nonlethal victim enters `RIPOSTED_HIT1` at source 0.1333 s and remains in that
one continuous authored hit-and-recovery action; a lethal victim instead goes
directly into `CRITICAL_DEATH` at source 0.5667 s through a 0.10 s blend.
Combat damage and the visible reaction share the contact timestamp; actors
remain controller-anchored until the blade has visibly withdrawn at source
0.70 s. The rendered geometry
overrules the source's generic 3.0 s `HitFrame`: that later phase begins with
the blade already inside the victim and cannot be a self-contained strike.

Riposte transfers nonlethal outcome ownership at contact without issuing a new
animation command, so the victim cannot stand up, guard, pause, or rewind
between impact and recovery. The reaction has advanced to source 0.2666 s by
the 0.5333 s attacker-action withdrawal; the corresponding wall time is about
0.6667 s because production hit-stop deliberately slows both paired clocks.
Backstab is different: both genuinely paired roles begin at source zero through
a 0.24 s action-entry blend and continue together after physical alignment
releases at 2.20 s. At the 2.90 s outcome point, a wounded victim keeps the same
`BACKSTABBED` command and finishes its authored recovery; only a lethal victim
changes to `CRITICAL_DEATH` at source zero through a 0.35 s blend.
`CRITICAL_KNOCKDOWN` remains in the generated asset as rejected legacy audition
material and is explicitly excluded from runtime semantic coverage. The
trimmed riposte attacker separately uses production-audited 0.18 s entry and
0.24 s exit blends. `victimOutcomeProgress` remains distinct from
`releaseProgress`, because ownership transfer and physical release need not
share a clock. The backstab attacker still plays its complete 3.1667 s authored
clip.

An outcome's optional `crossFadeDuration` travels with the mutable animation
command and overrides the semantic manifest default for that transition only.
This is choreography data, not a source-filename or controller branch; it lets
different critical profiles enter the same semantic recovery at appropriate
weight without duplicating the animation state.
For asset-defined transitions, `crossFadeDuration` is the clip's entry blend
and optional `crossFadeOutDuration` governs the transition away from it. A
command override remains highest priority, then the outgoing clip override,
then the incoming clip default. This keeps an unusually distant authored
out-pose (such as trimmed `RIPOSTE`) from forcing a global idle blend retune.
Lethal criticals use `CRITICAL_DEATH`, the same authored motion with a 1.9 s
prone out-point, so a dead victim cannot run the get-up tail. These timings are
weapon-profile data, not controller branches or source filenames in scene code.
Ordinary `DEATH` uses that same complete source from time zero through the 1.9 s
prone out-point; the previous vanilla selection only read as a stagger and
never reached a credible grounded death pose.

The external action clock is rebased whenever a command changes mid-action.
This permits sequences such as `PARRY` → `PARRY_FOLLOW_THROUGH` and
`GUARD_ENTER` → looping `GUARD` without resetting the gameplay parry/guard
clock or clamping the second clip to its last frame.

## Crouch

Crouching is a **stance**, not a slowed walk (`locomotion/stance.ts`). Skyrim
authors sneaking as a complete locomotion set — its own idle, stride, reverse
and strafes — and the crouched top speed is read off `CROUCH_WALK`'s measured
`authoredGroundSpeed` rather than guessed as a fraction of a walk, so
re-sourcing the sneak clip retunes the speed with it. A weapon may override the
crouched *hold* (`crouchIdle`) without owning the movement; a drawn blade does.

Today it changes pace and pose only. Stealth reads `Stance`.

## Locomotion cadence

Every stride is authored for one ground speed. The pipeline measures it — the
planar velocity of a planted sole, median over every stance sample — and bakes
it per clip as `authoredGroundSpeed` (WALK 0.89 m/s, RUN 4.98, SPRINT 5.17,
STRAFE ~0.80, WALK_BACK 0.69). `locomotionSpeedMultiplier` divides the actor's
real speed by it and clamps the result to 0.6–1.8×, so a clip played at any
other speed keeps its contact cadence instead of scrubbing. Both the player and
each enemy use it. This is what stops an enemy dropping out of a run mid-
approach from reading as a stutter: its gait speed halves, and without cadence
matching the clip does not.

## Moving landings

Touchdown records controller planar velocity and peak downward velocity.
`selectLandingAnimation` classifies stationary/moving/sprint/hard landings and
chooses a visual duration: 0.58 s stationary, 0.24 s moving, 0.18 s at sprint
speed, or 0.46 s for a hard impact. A moving landing is deliberately short: the
touchdown pose is planted while the controller keeps its horizontal speed, so
holding it is exactly what reads as skating. Playback is capped at 2× by
`landingAnimationSpeed` and the clip is cross-faded out mid-recovery rather than
compressed whole. A 0.18 s entry blend and floor-contact
support policy preserve the touchdown through both entry and locomotion exit;
the controller keeps full horizontal authority throughout. Vanilla
`mt_jumplandleft/right` are present in the GLB for comparison but are not
runtime-selected: animated audition showed authored quarter-turns that fight
controller facing.

## Combos

`LIGHT_1/2/3` are three distinct clips forming the light chain (and `HEAVY`,
`HEAVY_2`). The combo/queue timing is combat logic in
`packages/game-core/src/combat/weapon.ts`; the actor just plays whichever state it is told,
timed by the gameplay action clock.

## Timing rule

When a clip's natural length differs from the gameplay action window, adjust
**animation playback** (rate / clip-time normalisation) — do not stretch combat
damage, stamina, i-frames, or hit windows merely to make the whole clip fit.
This is distinct from correcting a stale hit window that ends before the
production weapon collider can report the rendered contact: those boundaries
must be calibrated from the actual game path and preserve the action's overall
lock unless gameplay itself is intentionally being retuned.

Most actions should play their complete `sourceDuration`. When only an authored
prefix is semantically useful, record its audited source-time out-point as
`playbackEndTime` in the pipeline config instead of disguising it as a shorter
source duration or hard-coding it in scene code. `JUMP_START` uses this to hand
off from `mt_jump` at 0.5667 s into `mt_jumpfast` source 0.5667–0.8333 s. Its
0.03 s outgoing blend was selected by production-rig seam comparison (maximum
1.01° pose difference); the continuation plays at 1.3333× for the observed
0.20 s airborne interval and clamps on its final airborne pose during longer
falls. This replaces the arm-jittering `mt_jumpfall` handoff while preserving
both complete source durations for provenance and diagnostics.

`BACKSTEP` deliberately reuses vanilla `1hm_walkbackward` as a non-looping
guarded retreat: the complete 1.7667 s two-step cycle plays at 3.3975× so its
endpoint coincides with the unchanged 0.52 s gameplay lock. The controller owns
horizontal travel, native COM Z is preserved, and 0.08 s entry/exit blends join
the cycle to sword idle. Do not restore the rejected Dynamic Dodge Backward1/
TK StepDodgeBack hop or the Backward2/TK DodgeBack somersault merely because
their filenames say dodge; source selection is based on weapon-mounted motion.

This applies to short reactions as well as dodges. `HEAL`, `HIT`, `HIT_HEAVY`,
and `RECOIL` keep their established gameplay windows but play their complete
source motion at a manifest-defined rate; leaving them at rate 1 visibly cut
the clips at 27–40% completion.

The reverse mistake also happens: a *fixed* gameplay duration (`ACTION_DURATIONS`
in `packages/game-core/src/combat/tuning.ts`) shorter than the clip's actual `sourceDuration`
cuts the animation off mid-motion (this happened to `EQUIP`/`UNEQUIP`, both
fixed at ~0.6s against 2-2.9s clips). Prefer deriving the duration from
`clipConfig(...).sourceDuration` over a hand-picked constant for any action
whose whole point is to play a specific animation to completion.
