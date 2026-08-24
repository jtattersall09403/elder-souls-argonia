# Character actor

`src/components/SkyrimFighter.tsx` renders a Skyrim-derived character from a
single pipeline-built GLB. It replaced the old Rigify mannequin actor and carries
**none** of its coupling (no `DEF-*` bone lookups, procedural posing, or runtime
root-motion stripping — that is resolved in the asset pipeline).

## What it does

- Loads the versioned deployment asset `packages/character-assets/files/rig-skyrim-humanoid.glb` + per-race body GLBs (see
  [../assets/rebuilding-the-character.md](../assets/rebuilding-the-character.md)).
- Its GLB actions are already named with **semantic** game states, so playback is
  `actions[state]` with no name mapping.
- Plays clips from an `AnimationCommand` with cross-fades; combat states are
  driven by the gameplay action clock (`animationTimeRef`) so the visual never
  runs ahead of the combat state machine. Locomotion is mixer-driven and
  self-timed (see `LOCOMOTION_STATES` in `animationManifest.ts`).
- Reads per-clip `looping` / `playbackRate` from the animation manifest, plus an
  optional `speedMultiplierRef` the caller can nudge every frame on top of that
  (used for lock-on strafe/walk speed matching).
- Clones materials per fighter as well as cloning the skeleton. `SkeletonUtils`
  shares materials by default; independent instances prevent the enemy tint
  from recolouring the player.
- Exposes the animated upper-spine object through `targetAnchorRef`; the lock-on
  reticle follows this render pose rather than the upright physics origin and
  therefore moves with knockdowns/get-up.

## Scale + ground contact

The GLB carries the rig's internal 0.1 scale; the actor scales the whole clone by
`CHARACTER_SCALE` (≈0.15, from the manifest) to reach ~1.85 m.

`CHARACTER_MODEL_OFFSET` (from the capsule dimensions) is the authored base
offset. The asset pipeline samples every final skinned body mesh at 30 Hz and
bakes a visible-surface envelope plus four identity-preserving foot/toe support
points in their bone-local 3D frames. Gameplay interpolates that metadata in
constant work; it never computes full skinned-mesh bounds per frame.

Support behavior is semantic. Ordinary `penetration` clips may move upward to
prevent a visible surface crossing the arena, but authored lifted feet never
pull the actor down. `airborne` phases release correction, apart from a bounded
upward-only impact guard once the physics base is within 2 cm of support.
`floor-contact` phases may move in either direction to hold a collapse, prone
body, or landing exactly on its declared plane. During a material ground-bound
crossfade, the actor transforms the incoming and outgoing clips' distinct
heel/toe candidates through the actual blended bones and uses the lower point;
interpolating the candidates themselves is invalid because the lowest shoe
vertex can change identity between clips.

The Ecctrl rigid body keeps pitch and roll locked (`enabledRotations` allows yaw
only) and disables auto-balance. A Souls humanoid's renderer/controller boundary
is upright; allowing the capsule to tilt rotated an otherwise correct late-jump
surface several centimetres through the floor. Production validation gates the
world-up direction for both actors at 1° and separately samples exact final
deformed-mesh bounds against the real support plane.

## Navigation body versus combat hurtbox

Ecctrl's capsule is a navigation and suspension shape, not the actor's combat
silhouette. Its compact rounded top is deliberately good at stairs, but ends
below the rendered shoulders; using it for damage made a sword visibly cross an
upper torso while Rapier reported a miss. Each actor therefore owns a separate
sensor-only, full-height `CombatHurtbox`, derived from the manifest's
`targetHeightMeters` and centred on the controller. Weapon sensors test this
uniquely named volume, while movement, grounding, blocking, and parrying keep
their existing dedicated bodies. Do not enlarge the Ecctrl capsule to tune
weapon reach: that silently changes navigation and jump behavior.

## Weapon

The extracted Skyrim steel sword is a separate static GLB mounted on a rig
socket and counter-scaled for the rig's baked scale. Its asset path and both
socket-local transforms live once in `WeaponDefinition.visual`, not in the
actor or individual actions. Its own local +Z is the blade axis with the grip
at the origin — but **the socket does not attach at identity**. The rig's socket bones
(`Weapon` on the hand, `WeaponSword` on the hip) are Havok-derived leaf bones
whose Blender bone-roll convention does not match the standalone mesh's axes
(confirmed headlessly: across five different animated poses the required
correction was consistently close to the documented PyNifly 90° convention,
with additional roll from this pipeline's Blender-friendly transform. Each
socket therefore carries its own fixed corrective quaternion, measured against pose-independent anatomy
references (finger-root spread for the hand, gravity for the hip) rather than
assumed. If a future weapon or socket needs the same treatment, re-derive its
correction the same way — don't assume identity.

Animated Blender validation covered `SWORD_IDLE`, `WALK`, `SPRINT`, `GUARD`,
`PARRY`, `LIGHT_1`, `HEAVY`, and `ROLL`; production-path browser validation is
the required final gate. The sword also switches which socket it rides:

- Equipped combat states → the hand socket, blade forward.
- Unequipped idle → the hip sheath socket, stowed instead of hidden.
- `HEAL` → temporarily the hip socket because the Skyrim potion motion uses the
  sword hand; leaving the blade held visibly drives it through the actor's head.
- `EQUIP`/`UNEQUIP` switch socket **partway through the clip** (`EQUIP_GRAB_PROGRESS`
  / `UNEQUIP_STOW_PROGRESS`), roughly matching when the animated hand reaches the
  hip, instead of snapping the sword to its final socket at the state boundary.

The combat hitbox reads the sword's world transform (`weaponRef`), so it is
independent of the visual mesh and unaffected by which socket the sword is
currently riding (only equipped combat states ever arm the hitbox).

Rapier steps before the animated kinematic sword sensor is repositioned for
the rendered frame, so a newly visible overlap is observable by combat on the
following simulation step. Attack data must keep its active phase through that
callback frame. The production `hit-reactions` scenario guards this boundary;
`HEAVY` previously disarmed at 0.90 s just before its visible 0.90–0.93 s
contact could be consumed.
