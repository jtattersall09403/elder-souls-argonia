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

Movement is disabled while aiming, as it is while guarding.

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

**Known simplification:** the armour an arrow must defeat is the target's
cuirass, standing in for the whole body. Summing every worn piece would let a
pair of boots protect a throat. Doing it properly needs a map from hurtbox bone
to biped slot, which does not exist yet.

## Player stats

`RangedModifiers` is the seam: draw speed, draw strength (which *caps* the
attainable draw rather than slowing it), sway, stamina cost and a final damage
multiplier. The stat system does not exist yet; building it means filling that
object in, not hunting for where a multiplier should have gone.
