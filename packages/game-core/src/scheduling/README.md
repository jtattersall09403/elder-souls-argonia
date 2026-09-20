# Frame scheduling

`frameWork.ts` holds `FrameWorkQueue`, the shared slicer for work that used to
run to completion inside one frame. Crossing 16–40 m of new ground fires the
vegetation rebuild, the flora collider ring, the settlement build and the chunk
terrain geometry; each was a synchronous main-thread burst, and together they
were the walking stutter (owner 2026-09-20, "option 1": spread the work over
frames).

A job is a generator whose every `next()` is one indivisible step. `pump()`
runs steps in ascending priority until `FRAME_WORK_BUDGET_MS` (6 ms of a
16.7 ms frame) is spent, always running at least one step so nothing stalls.
`frameWorkBudgetMs(frameDeltaMs)` is the rule the scene pumps with: 6 ms at
60 fps, 40 % of a slower frame so the queue drains faster when frames are
already long, capped at 24 ms.

Cancelling closes the generator; a throwing job is dropped and reported through
`onError` without disturbing the rest of the queue.

Priorities in use: 10 colliders (flora, settlement), 20 chunk terrain geometry,
30 vegetation instances, 40 settlement meshes — solidity first, then the ground
underfoot, then what you look at.

The queue has no module-level state: the scene root builds one
(`apps/world-studio/src/character/FrameWorkProvider.tsx`) and hands it down
through context, and a component with no provider falls back to a private
queue so fly mode is unchanged.
