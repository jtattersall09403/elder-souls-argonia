# 16e — Routes, grading, spans and ferries on the frozen world

**Goal.** Solve the road and lane networks once on the frozen terrain and
water, grade them as a **patch stack** that cannot cross a channel or move a
water level, author the spans that remain honestly and place the ferries
that were decided but never built. Roads must read as roads.

Ruling 9 (2026-09-11): **minimal** grading as patches; prefer re-routing over grading even at the cost of length, with gradient costs that make roads zigzag up long steep slopes; a graded patch only where it causes no other issue and no circular dependency. Ruling 6: no dredging.

## Read

- README.md §3, §9 (the route rows absorbed);
  [research/phase16/audit-chain-and-terrain.md](../../research/phase16/audit-chain-and-terrain.md) §2–3.
- decision 0051 (span systems), `research/world-terrain/route-spans-and-crossing-costs.md`,
  `world/sources/sites/water-crossings.md`, `world/sources/routes/ferry-crossings.json`.
- `worldgen/routes.py`, `reroute_majors.py`, `reroute_lanes.py`,
  `compile_minor_routes.py`, `grade_routes.py`, `author_route_structures.py`,
  `compile_route_structures.py`, `routes_raster.py`, `rebake_landcover.py`.

## Deliver

1. **Routes on the frozen world**: `compile_society` / `reroute_majors` read
   the frozen base and the graph (a river is a known crossing, not a cost
   surprise); the router prefers the long way round over a long span (owner
   2026-09-09; cost the span from the graph's width and the bank fall).
   Lanes are re-lined against the graph's navigable depth, never dredged.
2. **Grading as patches**: `grade_routes` emits typed `terrain-patches`
   (bench, fill, cut) with the 16b invariants — no patch inside a channel or
   its shoulder, no level moves — and `patch_water` follows. The frozen array
   is untouched. `grade_settlement_pads` takes the same exclusion windows.
3. **Spans**: the resolution-mismatch pip (backlog) fixed in
   `author_route_structures` with a minimum sustained rise; the `MAX_FILL_M`
   lever unchanged, since the measurement showed it is the wrong lever; a `pitchDeg` on the placement record
   and honoured in the renderer so ~46 crossings become one authored arch;
   the trestle-foot ground fit confirmed; the one crossing with no pier
   sourced or re-authored as a stepped ascent; nav data emitted for decks.
4. **Ferries**: the 6 active crossings placed through the settlement chain
   (a `placeable-NPC` record type or a typed operator socket, `watercraft-v1`
   copied to the site, a hull at each berth of its declared class); the
   navigable check samples along the serving route, not a radial max.
5. **Paint on the published line**: `routes_raster` and `rebake_landcover`
   read the published line that the character walks; `warn_on_drift` reports the
   geometric deviation.
6. Tests shown failing first: a graded way crossing a channel; a patch
   moving a level; a span under 1 m sustained rise; a ferry with no hull;
   paint more than 5 m off the published line.


### Added by 16a (2026-09-11)

- **Routes are re-solved on the frozen water, and the map's `routes`,
  `waterways` and `rootways` overlays are regenerated in the same commit.**
  Until then the 2D map's route layers describe the old water; that is
  stated in the layer's hover text until this chunk replaces them.
- Crossings read the graph: a ford is on a reach whose `depthM` allows it, a
  bridge or ferry per decision 0051, and no route may cross a
  `horizontal-backwater` reach except by ferry or span.
## Acceptance

- One route solve; grading fully expressed as patches; `route-structures.md`
  reconciled; all eight cities joined; span distribution reported before and
  after.

## Owner check

- Walk `route.road.helstrom-blackrose` from Helstrom for ten minutes: does it
  read as a road (bench, surface, no 30° scramble)?
- The Nine-Trunks viaduct `?view=character&x=4.517&z=3.608&t=12:00` and the
  Xul-Vaat walkway `x=1.203&z=5.730`: still standing, deck at road height?
- One ford (from `water-crossings.md`) and one ferry (the Drowning Gate):
  can you wade the ford; is there a boat and someone to talk to at the ferry?
- A track junction that used to step (the-white-pans, glenbridge): smooth?

## Gotchas

- Grading is the one terrain edit with no bbox discipline today (chain
  audit risk 5) — the invariants are the point of this chunk.
- The road-suppresses-water mechanisms are deleted; do not reintroduce them.
