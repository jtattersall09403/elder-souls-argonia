# @elder-souls/character

The player/NPC actor: the ecctrl body behind `EcctrlAdapter` (the only file
that touches ecctrl; everything else goes through `PlayerMovementController`),
the Skyrim-rigged model (`SkyrimFighter`), attachments and bows.

## Visual pose rules

- The physics body, its collider and the camera target use the physics pose
  (interpolated between fixed steps by the app, `applyVisualPose`). Gameplay
  numbers (speeds, float height, spring, step height) are never changed to fix
  a look.
- The model root draws the grounding solve (`game-core/anim/grounding.ts`)
  through `StepSmoother` (`src/stepSmoothing.ts`): while grounded in a
  locomotion clip, a change in the correction is spread over ~0.08 s (lag
  bounded to 0.25 m); airborne, floor-contact landings, authored clips and any
  change over 0.6 m snap. Any code in `SkyrimFighter` that recovers an
  "uncorrected" height subtracts `drawnCorrection` (what the root draws), never
  the raw solve. A new per-frame vertical offset on the model goes through the
  same smoother rather than writing `root.position.y` directly: a one-frame
  vertical write is what made stairs stutter (walk 6).

`npm test -w @elder-souls/character` runs the unit tests beside the code.
