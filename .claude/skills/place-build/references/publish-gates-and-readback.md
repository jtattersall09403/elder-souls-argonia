# Publish: the per-place gates and the read-back (place-build step 5)

Moved from SKILL.md step 5 (2026-09-29); SKILL.md keeps one line per check.

## What `place_gates` runs

- `place_gates` runs every per-place gate in one process (its module
  docstring lists them): the 0102 `check` rules (`walkRule`,
  `floorEdgeRule`, `pathReachRule`, `propSeatRule`, `beachedRule`,
  `ownerOkRule`, `scanFreshRule`), the compile's reader-checklist gates and
  lit-entrance rule (97 C16), the socket and promise gates (0103, 0104),
  the interior bundle gate, the 0098 variety and breadth bars, and the 0105
  gates (`setting.class`, `interiors.reserved`, `interiors.variety`,
  `lights.density`, `sink.fallback`). All green before the walk.

## Per batch, never per place

- Per BATCH, never per place (a walk packet's places in 16k, a region
  packet in Phase 15): the yard regression gates
  (`worldgen/test_proving_ground.py`,
  `tooling/placement-workbench/tests/test_proving_ground_b.py`, 0099
  decision 7), the integrator's REQUEST rows, the one `text-review` (0106:
  once per batch, here only), `npm run docs:check`, ONE `npm run preflight
  -- --paths <the batch's files>` (0106; its review reads code only), deploy.

## Verify against the published result (R74, R81)

- **Verify against the published result** (R74). Every numeric or
  positional claim bound for a packet or fix-round report ("lowered 1 m",
  "path painted", "lamp inside the lantern") is read back from
  `apps/world-studio/public/province/settlements/<place-id>.json`, never
  from the layout op, the scene or memory of the edit: a pose is
  `placements[].positionM` (y = `[1]`, `yFinal: true`) and `yawDeg`; a
  painted way is `settlement.groundPaint.entries[]` (`polygonM`); a
  socket is `settlement.sockets`; a door is `doors[]`. Compare against
  the previous published value (`git show <walked rev>:<that file>`);
  unchanged where a change was claimed is a defect, found here.
  A height over water is judged against the DRAWN water and the DRAWN
  pose (R81): the water the studio draws is `water-surface.png` W plus
  season (`water-shore.png` G x 1.4 m x (1-s)/2) and tide (coast/estuary
  class only), and the pose is what `resolvePlacement` (game-core
  `settlement/anchoring.ts`) draws for the piece's anchor class, never
  the hydrology record or the layout's y alone.
