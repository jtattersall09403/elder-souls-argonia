# Movement boundary

ecctrl is the **current** physical controller, but it sits behind a small
controller-independent interface so gameplay code never depends on ecctrl APIs.

```
combat / input / lock-on / animation
            │  (depends on)
            ▼
   PlayerMovementController      src/game/physics/PlayerMovementController.ts
            ▲  (implements)
            │
      EcctrlAdapter              src/game/physics/EcctrlAdapter.ts
            │  (wraps)
            ▼
      ecctrl EcctrlHandle
```

- `EcctrlAdapter` is the **only** place allowed to touch `EcctrlHandle` and
  ecctrl-specific spring/float/damping/rigid-body details.
- A future `RapierKCCAdapter implements PlayerMovementController` can replace it
  without touching combat, animation, input, lock-on or i-frame logic. Do **not**
  build that adapter now.

## Root motion

Ordinary world locomotion stays owned by the controller. Authored animation
movement is represented separately as a `RootMotionDelta` + a manifest policy;
the animation layer never calls the controller. In the built GLB, root
translation is already stripped (visual position == physical position, no drift),
and the net delta per clip is recorded in the manifest for future use.

## Status / follow-up

The interface + adapter exist and the new actor path is controller-agnostic.
`CombatScene.tsx` still holds the raw `EcctrlHandle` for its large existing
useFrame; migrating those internal calls to `EcctrlAdapter` is a mechanical
follow-up pass (no behaviour change intended).
