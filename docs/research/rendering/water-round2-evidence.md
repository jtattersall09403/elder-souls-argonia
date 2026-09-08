# Water round 2 — evidence ledger

One row per item in the owner's round-2 review, with the measurement that
proves it and where to look. Decision [0047](../../decisions/0047-water-one-physical-model.md)
holds the model and the reasoning; this file holds the numbers.

Regenerate the measurements with `python3 -m worldgen.water_report` from
`tooling/world-generation` (site readings, and every cascade's angle and pool
depth), and the browser side with `node apps/world-studio/scripts/probe-water.mjs`.

Studio URLs are relative to the deployed studio (`…/elder-souls-argonia/studio/`).
`x`/`z` are in kilometres. Measured 2026-09-08 on the shipped data.

## The fourteen items

| # | What the owner asked for | Measured | Where to look |
|---|---|---|---|
| 1 | The old hovering-water site is dry mud; no micro-jagged shore edges | Site reads **dry**, signed depth −3.00 m (buried), ground 3.27 m, waterline 38 m away. Province-wide hovering edges **32 → 1**, and that one is pinned by site in the invariant | `?view=character&x=4.57&z=3.87&t=10:00` |
| 2 | Lowland river continuous, flat to both banks, visible flow, foam drifting downstream | Wet, **2.52 m** deep, surface flat at 0.00 m, **flow 0.71 m/s** — above the 0.15 m/s gate, so the along-flow undulation and the drifting flecks both run. Note this reach is sea-level and classed `lake`: it is the tidal lower river, so it has no wet-season response | `?view=character&x=1.85&z=4.89&t=12:00` |
| 3 | Marsh level rises and falls with the season, no floating plates or domed blobs | Dry in the dry season at −0.60 m, inside the table band, with a **season response of 1.00** — the maximum, so the 1.4 m wet-season lift floods it and drains it physically. Probe: `marsh-wet` and `marsh-dry` both pass, and no puddle under 40 m² anywhere in the site | `?view=character&x=1.50&z=5.28&t=09:00`, then `&wet=1` and `&wet=-1` |
| 4 | The former dry bed is a swimmable river with no holes | River class, **1.20 m** deep, flow 0.60 m/s. Every coarse river cell in the province is wet on its centreline | `?view=character&x=2.66&z=0.90&t=12:00` |
| 5 | River above the waterfall full, no uphill belts, no zigzag trenches | Wet at 0.36 m, flow 0.75 m/s. Strip points sit inside their trench province-wide, and the profile is monotone on every reach | `?view=character&x=2.47&z=0.30&t=12:00` |
| 6 | The waterfall lands in a deep pool, one coherent fall aligned with the bed | The gorge fall drops **131.4 m at 87.6°** into a pool now **7.92 m** deep — it was 1.44 m before this round, because every bowl was dug 1.5 m whatever fell into it. Pools are scoured by the fall above them now | `?view=character&x=2.53&z=0.32&t=12:00` |
| 7 | Deep basin lake still passes; the hovering patch south of it is gone | Basin wet and flat at **24.6 m** (the depth channel's ceiling). The patch at 1.59/4.25 reads **dry**, −6.00 m | `?view=character&x=1.47&z=4.13&t=12:00` |
| 8 | Sites that are slopes render as steep streams, not falls | Checked province-wide, not per site: **every one of the 16 cascades measures 74–88° from lip to plunge**. The two the owner named are gone, along with the 226 m one that was really a 180 m-long 51° mountainside. Neither of the owner's coordinates has a cascade within 500 m | `?view=fly3d&cam=fly&x=1.827&z=2.093&alt=54&yaw=270&pitch=4` |
| 9 | The mountain stream is white water following the slope | 249 strip chains, 11.1 km, drawn in their own trenches; the site reads flow 1.48 m/s with the waterline 7.5 m from the orbit centre | `?view=fly3d&cam=orbit&x=1.75&z=1.74&t=12:00` |
| 10 | Sea calm and storm, underwater, caustics still pass | Bay wet at 21.4 m, probe passes calm and submerged. **The caustics and underwater code paths are untouched this round; the wave model is not** — it was replaced with a JONSWAP spectrum, so the sea is worth a fresh look | `?view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00`, and `&w=storm` |
| 11 | The beach spawns you on sand, not in water | The owner's coordinate is genuinely **0.40 m under water**: the nearest dry ground is 20 m east at 6.12/1.638. Separately, the studio no longer clamps a spawn to sea level, so you now stand on the ground rather than float at the waterline | `?view=character&x=6.12&z=1.638&t=12:00` |
| 12 | The mountain lake is a lake: flat, clean edges, no belts | One flat body, surface 287.67 m, 24.6 m deep, flow 0.07 m/s. Every standing body in the province is flat to within 2 cm and sits under its own rim | `?view=fly3d&cam=orbit&x=0.38&z=1.44&t=12:00` |
| 13 | Interaction and speed still pass | Buoyancy and the water query read the same signed-depth v2 data the renderer does, with a CPU twin of the flow waves so a floating body agrees with the surface it sits on. The probe measures frame rate with and without the falls layer at every fall site | any character site: wade in, swim, drop a crate |
| 14 | Tests and probes fail on real defects and are cheap | See below | — |

## Item 14: the gates, and what they cost

| Gate | Time | What it now catches that it did not |
|---|---|---|
| `pytest worldgen/test_water_invariants.py worldgen/test_water.py` | 13 s | A cascade that is a ramp rather than a cliff (measured lip to plunge); a plunge pool shallower than its own fall scours; water standing at a lip level at a cliff foot |
| root `npm test` | ~15 s (was 36 s) | Route structures shipping without their authored reason; prose inside a blockquote, and the 75 route-structure sentences, which were never linted |
| root `npm run typecheck` | ~10 s (was 93 s) | — |
| `npm run test:placement` | 87 s | — |
| `node apps/world-studio/scripts/probe-water.mjs` | **31 min for 17 sites** (was ~23 min for 6) | Boots once and teleports between sites instead of paying 4–5 minutes of software-GL shader compilation per site |

Two gates were rewritten this round because they could not fail on the defect
they existed for: the cascade test asked for 3 m at 45° scanned off a
resampled profile, which a uniform 51° mountainside passed, and it asked for a
1 m plunge pool, which a 131 m fall landing in 1.44 m of water passed.

## What the round changed in the model

- **A river that drains to the sea reaches it.** The channel chain stopped at
  the last cell that was itself a river cell, so the one outlet whose coast is
  a 35 m cliff left its clifftop level hanging over the shore. It is a
  waterfall into the ocean now (34.5 m at 83.9°, at 163 E / 4614 S).
- **A waterfall may land in a lake or the sea.** A fall run was refused if any
  station in it was pooled, which refused six measured cliffs; the plunge
  station alone may be pooled, because that is what a plunge pool is.
- **A waterfall must be a cliff.** Runs grew from 27° segments and were
  accepted on a 50° mean. Now the run is built from the face angle itself, and
  all 16 cascades measure 74–88°.
- **A plunge pool is scoured by the fall above it**, 1.5 m plus 0.06 m per
  metre of drop, capped at 8 m.
- **A brink is not a hole.** The check that finds water ending in mid-air now
  knows the corridor each sheet is drawn over, including the bowl it digs and
  the head above its lip; the 31 cells it excuses are counted in the census as
  `brinkEdgeCells` rather than hidden.
- **The route-structures stage no longer stops a rebuild.** It emits geometry
  for survivors it cannot author and a CI test holds the debt; 38 authored
  sentences and one piece family closed it.

## Known and recorded, not fixed

- One hovering cell at 113 E / 1201 S: a 0.16 m step beside an 81° chute, 7 m
  above a lip. Pinned by site in the invariant, with the diagnosis, so any new
  one still fails.
- `place.hist-heartland.air-pocket-station-basin` was the only place the new
  water invalidated (a submerged record left in 0.0 m of water); the re-plot
  moved it and kept the other 570.
- The authored local hydrology contract (Phase 11's `hydrology_intent.py` and
  `authored-minor-waterways.json`) is a separate piece of work: see the
  handoff.
