# 0069 — The road network is six city legs and two attested exits; the rest of the province is reached by water, root and foot

**Date:** 2026-09-16 · **Status:** accepted (owner, 16e round 3) · **Supersedes:**
the "eight cities joined by road" reading of the 00-core acceptance rule and
the crossroads junction in [0068](0068-routes-below-the-gate-records-here-realised-in-16h.md).

## Decision

1. **The major roads are exactly eight:** Gideon–Stormhold, Stormhold–Thorn,
   Gideon–Archon (the interior trunk), Gideon–Soulrest, Soulrest–Blackrose,
   Blackrose–Lilmoth, plus the two exit roads the source books name: the
   Blackwood Road out of Gideon and the Tear road out of Thorn. The
   Helstrom–Blackrose road and the Alten Corimont–Stormhold road are **cut**,
   not re-authored: the sources reach both places by water and root
   (dossier `world/sources/lore/topics/roads-and-routes-4e201.md`). The
   Soulrest–Lilmoth coast road is re-classed `track`: a stage-counted coast
   track between two ports the sources reach by sea, laid with the minor
   network in 16g (its stage places and quests keep their route reference).
2. **The crossroads junction is gone** with the Helstrom road; the registry
   keeps Gideon–Archon `broken` in the middle: a doomed Imperial project
   across the interior that has fallen into disrepair. The Underway basin
   ferry, whose premise was the Helstrom trunk, is removed with it; the
   Underway itself stays a root-gallery story for 16g.
3. **The interior is connected in 16g by the minor network** (tracks to
   follow on foot), by the waterway network (fast travel) and by open
   exploration (creeks and landmarks to follow). Helstrom and Alten Corimont
   are reached by boat lanes and by root; a track may reach them, a road
   never does.
4. **The road cost model prices what the road builder pays.** A step over
   the gradient cap on a road that grading will patch is earthworks
   (`routes.GRADE_OVER`, added to the ground cost), not a wall
   (`GRADE_WALL`, which stays for tracks). A rise no patch can take in
   one analysis step (`GRADABLE_STEP_M`) is the one remaining wall. Deep marsh costs six
   times dry ground, not sixteen: a short detour still wins, a long one is
   a boardwalk. The reason is measured: 40 % of the province's analysis
   cells have a step over the 8° cap to a neighbour, so with the cap a
   wall the roads wandered kilometres round 1–2 m terraces and were left
   with the bumps they could not avoid.
5. **An approach pin** (`junctions.json`, `approach: true`) fixes the side from
   which a road enters a city: the leg between the pin and its city is solved
   inside a 30 m straight corridor. A plain pin only guarantees the road
   passes the point; twice the road passed it and looped round to enter
   from the flat side.
6. **Spans come from the crossing record, bank to bank.** Every span-band
   crossing on a major road is a bridge (river, lake) or a boardwalk deck
   (marsh) whether or not the grader flagged the window; a dry over-cap
   window is a flight of steps, never a bridge; crossings are derived for
   the major roads only, on every flowing reach or standing body the road
   meets; a river running through a marsh body is the marsh's own crossing,
   so the boardwalk over the fen carries the road over the river in it.
7. **Grading also flattens roughness:** a sample more than 0.5 m off the
   road's 40 m running median is a choke point like an over-cap run. Patches
   are authored one after another on a single scratch array, so overlapping
   patches declare their order instead of the later one being dropped.

## Why

The owner walked the round-2 map (2026-09-16): roads looped inland and back,
approaches were honoured as points but not as sides, bridges stood over dry
hollows and rivers were crossed with no record, the Thorn road ran through
the deep marsh; the smaller bumps were still there on foot. Each of
those had one cause in the cost model or in a rule that read the wrong
record, listed above; the roads themselves were then re-steered on the
ground data per the owner's asks.

## Consequences

- 16g: the catalogue places that referenced the two cut roads
  (`places-pirate-freeholds.json` ×4 and `places-dunmer-north.json` ×2 name
  `route.road.alten-corimont-stormhold`; `place.mercantile-coast.white-rose-prison`
  and `the-northern-rest` name the Helstrom road as "the Bogmother causeway")
  are re-sited or re-referenced against tracks and lanes in the plot
  re-solve; the naming pass no longer has a Helstrom road to rename.
- 16f: the vegetation brief's road walk should name a road that exists
  (Gideon–Stormhold or Stormhold–Thorn), not the Helstrom road.
- 16g owns the travel-service graph as much as the places (owner
  2026-09-16): the stations, ferries and boat services in
  `travel-services.json` join places from the earlier catalogue that 16g
  re-plots, so the plot re-solve re-authors the services with the places.
  A boat service never lands at a city unless the city itself sits on water
  joined to the boat's own water: 16g chooses a nearby place on
  acceptable water as each major city's harbour station and the service
  lands there.
- 16h draws the bridges, decks and flights the record now carries; the
  ledger lists them.
- A flight of steps is built only over the steep runs inside a refused
  grading window (`author_route_structures.steep_runs`, 15° or steeper);
  a gentle window with a wrinkle gets a short flight at the wrinkle, or
  nothing (owner 2026-09-16: a 518 m "stepped ascent" was a gentle slope).
- `hydrology_graph derive` refuses to run while the shaped base is frozen
  without an explicit `--refreeze`, because it overwrites the vault's
  solution files.
