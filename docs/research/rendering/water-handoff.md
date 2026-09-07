# Continue water work

Read after `CLAUDE.md` and [decision 0046](../../decisions/0046-water-overhaul-retired.md).
Keep this file short and current; the retired overhaul's notes are archived
under [../archive/water-overhaul-2026-09/](../archive/water-overhaul-2026-09/)
and are not required reading.

## What is live (2026-09-07)

- **Runtime**: the field water model (decision 0025) in
  `packages/game-core/src/water/` (map in its README), mounted by the studio
  through one `WaterRuntime` object (`apps/world-studio/src/water/StudioWater.tsx`).
  There is no legacy switch and no dataset switch.
- **Data**: `apps/world-studio/public/province/water/` root files, compiled by
  `python3 -m worldgen.compile_water` (deterministic, ~16 s; see the
  [quality doc](water-quality.md) runbook). `water-meta.json` carries the
  steep `channels` strips, `cascades` (waterfall lips with a terrain profile)
  and `surface.ownerFile` (`water-owner.png`: 0 field, 128 strip, 255 fall).
- **Kept from the overhaul**: interaction/particle stack (contacts, spray,
  foam, crowns, body-isolating ripples, underwater bubbles, buoyancy, rigid
  bodies), ground wetness + caustic receivers, spectral ocean module
  (compiled, unmounted).

## Verification

- `npm test`, `npm run typecheck`; `pytest worldgen/test_water.py worldgen/test_water_invariants.py`
  (compiled-data invariants: no wet cell below its bed, no enclosed dry hole,
  monotone strips joined to the field, lips above plunges).
- Browser: `apps/world-studio/scripts/probe-water.mjs` (built studio, one
  scenario via `WATER_SCENARIO=`), `shot-deployed.mjs` (deployed or local
  `SHOT_BASE`, `SHOT_VARIANTS` JSON). SwiftShader runs the studio at ~2 fps;
  budget 2–4 min per capture and never run captures in parallel with tests.

## Key sites (studio URL fragments, `ex=1&d=8-17`)

| What | URL fragment |
| --- | --- |
| Owner's "hovering water" repro (must be dry mud) | `view=character&x=4.57&z=3.87&t=10:00` |
| Lowland river, walk | `view=character&x=1.85&z=4.89&t=12:00` |
| Bay, noon, orbit (whitecaps/surf; add `&w=storm` for a squall) | `view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00` |
| Mountain tarn | `view=fly3d&cam=orbit&x=0.38&z=1.44&t=12:00` |
| Marsh, morning walk | `view=character&x=1.50&z=5.28&t=09:00` |
| Steep strip `strip-76` (243 m descent, band 1) | `view=fly3d&cam=orbit&x=1.75&z=1.74&t=12:00` |
| Cascade `fall-63` (22 m drop) | `view=fly3d&cam=orbit&x=1.68&z=1.86&t=12:00` |
| Cascade `fall-89` (32 m drop) | `view=fly3d&cam=orbit&x=0.90&z=2.74&t=12:00` |
| Cascade `fall-34` (11 m, free flight) | `view=fly3d&cam=orbit&x=6.26&z=0.90&t=12:00` |

## Open

See [polish-backlog.md](../../polish-backlog.md) water rows; this file lists
only what a continuing agent must know.
