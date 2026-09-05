# Ranged combat: aiming, drawing, and the arrow in the air

Three pieces, with the seams in the usual places. The physics is in
[research/archery-ballistics.md](../research/archery-ballistics.md); this file is
how a shot happens.

```
combat/bowShot.ts      the cycle      pure reducer: raise, nock, draw, loose
combat/arrowFlight.ts  the air        one force, and where it is applied
components/Arrows.tsx  the projectile Rapier bodies + hit dispatch
```

## The cycle is a reducer

`advanceBowCycle` takes a state, an input and a frame, and returns the next
state plus what the caller owes: stamina to charge, and a shot to fire. It knows
nothing about the camera, the renderer or the input device, so the same function
will drive an archer NPC, a replay and a test.

Phases are `lowered → raising → nocking → ready → drawing → loosed → nocking`.
Two details are load-bearing:

- **`drawArmed`.** One button raises the bow and pulls the string. Without a
  latch, the press that opens the aim runs straight on into a draw the player
  never asked for.
- **Stamina does not block the draw, it collapses it.** Out of stamina the arm
  gives out and the string creeps home; if it falls below the bow's minimum
  release fraction the shot is simply abandoned. A hard "you cannot draw" would
  be cheaper and would read as the input not working.

## The pose *is* the state

`bowPose` returns a clip **and a clip time**, and the draw's clip time is its
draw fraction. The animation is not running alongside the draw; it is the draw.
A pull that stalls for stamina stalls on screen, and one that slips home slips
home on screen, with no synchronisation code anywhere.

## Moving with the bow up

`bowPose` picks the stride, and which *set* it comes from is the whole of it.
A raised bow strides on Skyrim's `bowdrawn_*` clips (`BOW_DRAWN_WALK`,
`_WALK_BACK`, `_STRAFE_LEFT`, `_STRAFE_RIGHT`); a carried one strides on the
`bow_*` carry set. Before round 9 both used the carry set, so every step taken
while aiming crossfaded the bow down to the archer's side and back — the
"flicker and jerk when strafing in bow view" the owner reported was two
different poses fighting over one animation track, not a blend bug.

Vanilla authors no drawn *run*, so a raised bow that runs walks. That is not a
gap being papered over: an archer at full draw does not run, and the same rule
covers a future actor with the same clip set.

The aim's move speed is the drawn clip's own measured ground speed
(`authoredGroundSpeed`, capped by `AIM_MOVE_SPEED`), so the clip plays at rate
1 and the body keeps up with its feet instead of being scrubbed to chase a
hand-set number. Standing still at draw still holds the draw pose, because
there the clip time *is* the draw fraction.

An NPC archer uses the same clips through `bowLocomotionClip`: drawn if it is
repositioning mid-draw, carried otherwise. It used to strafe on the shared
(sword) strafes, which put the bow through its own body.

## The quiver, and the arrow coming out of it

Arrows are worn as well as shot. Skyrim ships the back-mounted quiver as its
own mesh beside the projectile (`<material>arrow.nif` next to
`...arrowflight.nif`), so the arrow set builds both from one config entry and
each arrow definition carries a `quiver` — asset plus the rig node it hangs on
(`Quiver`). `QuiverAttachment` mounts it whenever arrows are equipped, on the
player and on every archer, through the rig's one socket convention. Hidden in
first person, for the reason a cuirass is.

The shaft on the string appears **out of the draw**, not out of the state:
`nockedArrowVisible` shows it only once the pull is past
`NOCK_REVEAL_FRACTION`, which is where the vanilla draw clip brings the hand
back off the shoulder. A bow held ready has an empty string. The idle hand used
to hold an arrow that no clip had drawn from anywhere.

The nock's world position is published every frame the bow is up, drawn or not,
because the shot's origin and the aim solve both need it before the shaft is
visible.

## The shot goes where the crosshair is

The bow is not behind the camera. The string hand is a third of a metre to one
side of the eye and lower, and the over-the-shoulder camera is further out
again. Firing *parallel* to the camera from that origin puts the shot beside
the sight line forever — low and to the left by exactly the offset, which is
what the owner saw both in the bow's attitude and in where the arrow went.

`combat/aimConvergence.ts` fixes both halves at once. The crosshair is a ray
cast out of the camera; whatever it hits (or a far point when it hits nothing)
is the convergence point; the shot, the body's yaw and the spine's lean are all
aimed at that point. So the bow visibly points along the line the arrow leaves
on, and the arrow arrives where the crosshair was — bar gravity, which is the
archery, not a bug. `aimErrorDegrees` in the debug panel is the residual
parallax, and `aimConvergence.test.ts` pins the geometry.

## Death outranks the aim

The cycle is not part of the melee action machine, so a caller that merely
stops asking for the aim leaves it raised: a killing blow landing mid-draw set
the action to `dead` and the still-running aim overwrote it on the next frame.
The archer stayed up, kept moving and kept shooting, and could not die.
`BowInput.interrupted` lowers the bow inside the reducer and refuses to re-open
it, and the scene never finishes an action it no longer owns.

## First person

Aiming raises the bow into a first-person view, blended over `AIM_RAISE_SECONDS`
by moving the ordinary camera and look targets — there is no second camera path
to keep in sync. Once the blend completes the camera stops smoothing: the lag
that gives a follow camera weight makes a crosshair feel broken.

The eye rides the **head bone**, so the view leans in with the draw. The head
itself is collapsed by scaling that bone to near zero, which takes eyes, mouth,
hair and any helmet with it — nothing has to know which mesh is a face on which
race. Near zero, not zero: a zero-scaled bone is a singular matrix and turns
every vertex it skins into NaN.

Movement while aiming is a drawn stride at the clip's own speed (above), not a
stop.

**The exit binding is the guard button** on every platform — mouse 2, gamepad L,
and the on-screen guard button, which relabels itself to LOWER. A bow cannot
block, so the input is free, and "put the thing between you and the world down"
already means the right thing everywhere without a fourth binding to learn.

## The arrow is a rigid body

Rapier owns the flight. Every arrow is an ordinary dynamic body under gravity,
and the only thing added per tick is the force a solver has no idea about: air.
Reinventing collision, CCD and interpolation to hand-integrate a projectile gets
each of them slightly wrong.

Two things about that body are not cosmetic:

- **Two colliders, not one.** A light shaft the arrow's full length plus a heavy
  head at the front. Together they give both the forward centre of mass that
  makes it fly point-first and the spread-out inertia that stops it tumbling.
  Modelling the arrow as one short collider gives a moment of inertia an order
  of magnitude too small, and the gentle aerodynamic torque that should
  weathercock a real shaft spins the model end over end within a few metres.
- **Drag is applied behind the centre of mass**, not through it. That offset is
  the stabilisation: any yaw produces a restoring torque, exactly as fletching
  does. It is why `forwardOfCentre` is a physical property and not decoration.

CCD is on. An arrow crosses several metres per physics step, and without it a
full-draw shot tunnels through a body — which reads as the shot not working.

**The flight is measured, not argued about.** `scripts/probe-arrow-flight.mjs`
fires one shot into a running build and logs the live body's height, velocity
and mass every physics step. Round 8: fall 9.83 m/s², drag deceleration within
5% of `integrateTrajectory`, mass 0.0971 kg, no damping, shaft rendered at its
built 0.75 m. `arrowBody.test.ts` pins that agreement so a body driven the way
this component drives it cannot drift from the offline arc. What the numbers do
*not* excuse is hang time: real ballistics at bow speeds keeps a lofted shot in
the air for seconds, and whether that reads as floaty is a tuning question for
`gravityScale`, not a bug in the model.

## Hits

Impact resolves through `resolveArrowImpact`: speed at contact, the angle it
arrived at, and what the target is wearing. No range falloff exists, because
none is needed.

**Approach angle, not surface normal.** Rapier reports a sensor overlap without
a contact manifold and reports it a step late, by which time a 45 m/s shaft's
origin is past the surface. A normal taken from the reported position points the
wrong way and reads every square hit as a 180° glance — which silently absorbs
every arrow in the game. `impactObliquity` measures how far off-axis the shot
was instead, which is stable whether the report lands short of the target or
past it.

**The shaft is planted on the body, not where the report arrived.** The same
step of lateness that rules out surface normals also puts the arrow's own
position clear of the target — beside it, or already through it — and a shaft
left there stands in the air next to the actor. `resolveArrowPlant` takes the
flight line instead, walks it back two metres and finds where it first crosses
a fitted hurtbox capsule's true surface, and the shaft is planted there. It is
pure geometry, so the player and every enemy go through one call. What it
deliberately does *not* decide is what the hit **counts** as — the damage zone
stays with `nearestHurtboxBone`, because moving where a shaft sticks should not
quietly re-rule which shots are headshots. When the line misses every capsule — the body
having moved on before the report was handled — the nearest capsule's surface
point is used, which can be slightly off but is never in mid-air.

**Known simplification:** the armour an arrow must defeat is the target's
cuirass, standing in for the whole body. Summing every worn piece would let a
pair of boots protect a throat. Doing it properly needs a map from hurtbox bone
to biped slot, which does not exist yet.

## Player stats

`RangedModifiers` is the seam: draw speed, draw strength (which *caps* the
attainable draw rather than slowing it), sway, stamina cost and a final damage
multiplier. The stat system does not exist yet; building it means filling that
object in, not hunting for where a multiplier should have gone.
