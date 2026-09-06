# Ranged combat

The sandbox composes shared runtime systems. Production defaults and shoulder
framing live in `game-core/camera/bowCamera`; the default is over the shoulder.
The historical energy, launch speed and drag calibration remains in
[archery-ballistics.md](../research/archery-ballistics.md). The round-10 repair
record is [decision 0040](../../../../docs/decisions/0040-animation-packs-and-combat-parallel-pass.md).

## Cycle and animation

`game-core/combat/bowShot` owns raise, fetch/nock, ready, draw, loose and lower.
The first aim press raises the bow; releasing it arms the next draw. Stamina
limits the draw and can collapse it. Death or losing the weapon interrupts it.

`bowPose` gives the renderer a semantic clip and optional absolute source time.
Fetching uses the opening of the vanilla draw clip; pulling uses its remaining
span. `SkyrimFighter.animationPoseTimeRef` drives that source time directly,
without rebasing it as a newly started combat action. Re-entering a partial
draw from locomotion must preserve the requested draw fraction.

Drawn locomotion clips are self-timed loops. Their measured ground tracks,
clock and playback rate drive movement together. The player walks while aiming;
ordinary bow carry uses its own locomotion profile. Locked backward running
uses sourced backward runs, with the same foot-track drive as locked strafing.

## Bow, string and arrow

`character/riggedBow` scrubs the bow's own sourced animation and tracks a
skinned vertex at the string's nock. `SkyrimFighter` applies aim to the sourced
upper-body pose and constrains the drawing arm to that nock. Constraints are
restored before the next animation evaluation; they never accumulate onto
last frame's pose. Their transitions are eased, including release.

`NockedArrow` follows the drawing hand during the fetch and the actual string
after nocking. The 75 cm shaft keeps a consistent scale in the actor and in
flight. `QuiverAttachment` mounts the equipped arrow set's sourced quiver on
the skeleton's quiver socket.

## Crosshair and ballistics

The free-aim ray comes from the rendered camera. It tests world geometry and
visible actor skin; the player's own body is excluded. Lock-on sights the
selected actor's chest from the offset shoulder camera.

`game-core/combat/solveBowAim` solves a low arc to the sighted surface using
`ai/enemyBow.aimElevation`. The integration includes drag, gravity, downhill
targets and the initial offset from nock to projectile tip. Enemies use the
same solve. A target beyond a weak shot's reach remains unreachable; arrows
are never steered after launch. A sky shot follows the sight direction.

## Flight and impact

`character/Arrows` owns the Rapier/rendering integration. Its props inject the
live arrows, retirement, actor tracing and impact handler. The app wrapper
contains only store binding and the local flight probe.

Each projectile is a centred sensor-only mass. Gravity and drag act once per
physics step. The body cannot bounce off an actor's navigation capsule, other
arrows or weapon sensors. Imposed orientation follows velocity without moving
an offset centre of mass.

The tip sweeps from the previous physics sample to the current sample. The
nearest world or skin crossing wins. `game-core/combat/arrowSurface` uses
capsules only as a broad phase, then intersects the visible posed skin and
worn armour. It refreshes the skinned bounds for that pose. A line that misses
the skin continues flying; there is no snapping to an invisible capsule.

A skin hit supplies a surface point, bone and obliquity. Damage still derives
from retained speed, arrowhead properties, impact angle, hit zone and armour. `stickArrow` accounts for the centred
projectile mesh when embedding the tip, then parents the shaft to the struck
bone. World hits freeze the projectile as intangible scenery until retirement.

Known simplification: armour resistance still uses the equipped body-armour
aggregate rather than a per-triangle armour-slot lookup. This is separate from
the surface used to position a visible embedded arrow.
