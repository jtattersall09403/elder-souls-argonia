# Route spans: why they are long, and where the fix belongs

Read this before changing any routing cost to shorten bridges. Measured
2026-09-09 against the shipped data (read-only audit; nothing re-run).

**Headline: the router is not the cause.** 192 of the 204 span structures
cross no water at all, and the deepest gap under any of the 204 is 5.8 m.
There is no gorge under a single one of them. The long spans are made in
`author_route_structures`, not by the line the router chose.

## The routers and their costs

| Network | File | Cost terms |
| --- | --- | --- |
| Major roads (Phase 4 `compile_society`) | `tooling/world-generation/worldgen/routes.py:32-48` | `1 + slope*30*TUNE + 30*(slope/0.5)^2`, then multipliers: wetland 3, frequent flood 2, z>40 m 3, river band >=2 **8**, lake/sea **25**, plus an edge-margin ramp |
| Major-road repair | `worldgen/reroute_majors.py:121-163` | same surface + `routes.grade_factor` on each STEP (`routes.py:162-177`: quadratic below the class cap, 600x wall above) |
| Minor tracks | `worldgen/compile_minor_routes.py:171-187` | same shape; river **9**, open water **60**, jungle 1.8 |

Crossings are therefore already priced, and priced hard. Tobler
(`worldgen/travel_cost.py`) is **not** shared with the routers — it serves the
siting isolation gates only (`author_type_siting.py:340`).

## The routers are already choosing narrow crossings

`world/sources/routes/water-crossings.json` (115 crossings, measured over the
live water bake):

| | n | median span | p90 | max | over 70 m |
| --- | --- | --- | --- | --- | --- |
| major | 52 | 6.6 m | 48.5 m | 161.5 m | 5 (all already banded `ferry`) |
| minor | 63 | 7.2 m | 23.2 m | 59.7 m | 0 |

Only 2 % of the water in the bake (0.3 km² of 20.1 km² deeper than 0.3 m) is
invisible to the routers' classified rasters, so the multipliers are firing
where they should. A per-metre crossing penalty has nothing left to buy.

## What the 204 "spans" actually are

Measured along each window's own chainage on the natural heights
(`refined/height-natural-rg.png`) and the water bake:

* window length: median 70.5 m, p90 141.1 m, **max 389.6 m**
* max clearance of the chord over the ground: median **0.6 m**, p90 2.2 m,
  **max 5.8 m** — 196 of 204 are under 3 m
* 192 of 204 have no water deeper than 0.3 m anywhere under them
* longest continuous wet run under any span: **89.6 m**
* 45 windows are dry, longer than 100 m and hug the ground within 5 m,
  totalling 6.95 km of deck

The worst offender, `structure.road-gideon-blackwood-road.34`, is a 389.6 m
"bridge" of **126 chained deck pieces** over a continuous dry hillside falling
65 m → 46 m at 4.4 %. Its authored `why` claims it "crosses the border ridge
where the ridge is thinnest": the measurement contradicts the prose (standard
12 defect — queue it with the fix). Overall the 51 windows longer than 100 m
carry 2,031 of the 4,531 span pieces.

## Root cause

1. `grade_routes` leaves short over-cap wrinkles along a rough slope.
2. `author_route_structures.merged_stretches` merges any two over-cap
   stretches less than `AUTHOR_MERGE_GAP_M = 60.0` apart
   (`author_route_structures.py:53,556`). On a long rough hillside a chain of
   wrinkles becomes one 390 m window.
3. `_kind` (`author_route_structures.py:507-543`) then judges the window on
   its **end-to-end** grade. A long window on a uniform slope has a gentle
   end-to-end grade (4.4 % = 2.5°) below `DECK_MAX_GRADE_DEG = 9.0`, so it is
   classified `bridge`/`deck`.
4. `compile_route_structures` must then build it. The vanilla monoliths stop
   at 52.188 m (`compile_route_structures.py:219`), so anything longer is
   chained Nordic-viaduct deck at 5.462 m a piece.

Nothing in that chain asks whether there is a gap.

## The fix, with its derivation

**Trim each span window to the obstacle.** A span window is the contiguous run
where either water is deeper than 0.3 m (the water-crossings `deepM`
threshold) or the ground falls more than one deck thickness (1.479 m, the
Nordic viaduct's own measured `thicknessM`) below the window's chord.
Everything outside that run is not a span and goes back to the flight /
stepped-ascent / regrade branch.

Applied to the shipped 204 windows:

* 157 of 204 windows trim to **zero** — there is no obstacle in them at all
* the 47 that survive: median **17.7 m**, p90 75.8 m, **max 131.6 m**
* total deck metres 17,041 → **1,355 m, a 92 % reduction**
* only **6** exceed the 52.188 m monolith reach and need a chained viaduct

Every number above is a measurement of the shipped data, not a target.

### DELIVERED 2026-09-09, and what the numbers actually came out at

Implemented as `author_route_structures.obstacle_span` / `_resolve`, with
`DECK_THICKNESS_M` read from the span kit's own measured deck rather than typed
in. Measured on the same shipped windows, the trim gives **117 of 198 to zero**
and 81 survivors at median 28.1 m / p90 73.8 m / max 106.5 m, deck 13,585 m →
2,711 m. That is more survivors than the 157/47/1,355 above, and the difference
is **one deliberate choice**: this audit measured water at the DRY season, and
the delivered rule measures it at the WET one. A span is permanent geometry and
has to carry the way at the seasonal maximum — a deck built for the dry season
is a road under water for the months of the monsoon. Re-measured at `dry` the
delivered code reproduces this audit (137 to zero, 67 survivors, 1,278 m, 6 over
the monolith reach); the 27 in the difference are crossings that are dry ground
for part of the year and standing water for the rest.

Re-running the authoring pass end to end also reconciled **177 stored
structures whose ways no longer exist or have been re-solved shorter** — the
shipped `route-structures.json` was stale against the shipped
`routes-minor.json`, which is a separate defect and is now fixed by the same
re-run. Final published state: **205 spans → 97, deck 16,712 m → 3,069 m,
longest 389.6 m → 108.2 m, 625 structures → 272, 4,225 compiled pieces.**

Two bugs were found and fixed in the delivery, both of which made the pass
non-idempotent (it crept by a structure a run):

* trimming lowers the window's own chord, so re-measuring a trimmed window
  finds a smaller drop and can retire a crossing the previous run authored. The
  record now carries `windowFromM`/`windowToM`, the untrimmed source window, and
  re-measurement always starts from that.
* the "is this window already carried?" test compared the merged window to a
  structure's trimmed extent, which never contains it, so the same crossing was
  authored again under a new id every run. It now tests the source window.

`AUTHOR_MERGE_GAP_M` was left at 60 m for both kinds, with the reasoning
recorded beside the constant: trimming derives the span's length from the
ground, which is strictly better than any merge distance, and a small
span-specific gap would wrongly split a braided crossing into two decks with a
mid-river bank between them.

A hard length cap is then unnecessary: the longest thing the province actually
asks a span to cross is 131.6 m, and the longest genuine wet run is 89.6 m —
both below the 161.5 m the water-crossings file already reports as its widest,
which is a ferry.

Secondary, same file: `AUTHOR_MERGE_GAP_M = 60.0` is the mechanism that grows
these windows. It is correct for a flight (a stair does not restart across
10 m of level ground) and wrong for a span. Splitting it into a flight merge
gap and a much smaller span merge gap is the alternative to trimming; trimming
subsumes it and is measured, so prefer trimming.

## Blast radius

**Fixing the authoring stage is cheap.** `author_route_structures` +
`compile_route_structures` rewrite `world/sources/routes/route-structures.json`
and `province/route-structures.json` only. Routes do not move, the heightfield
is not regraded, no chunk, water, landcover or scatter stage re-runs, no place
is re-plotted. Minutes.

**Changing a routing cost is the opposite.** It moves `routes.json`, which
invalidates the `routes-natural.json` snapshot that siting scores against
(`site_fields` / `macro_plot` `dist_to_route_m`), which re-plots committed
places — the exact feedback loop `reroute_majors.snapshot_natural_routes`
exists to prevent. It then re-runs the whole published chain named at
`reroute_majors.py:44-46`: minor routes → grading (heightfield) → chunks →
web chunks → water → landcover → scatter. That would move owner-approved place
spacing and the exemplars, and is an owner decision, not ours.

## Sanity check on the premise

"Go the long way round to shorten the bridge" is sound road engineering, but
the province has no bridge worth detouring for: median crossing 6.6 m, only
five over 70 m and all five already ferries. Adding a superlinear span penalty
to the cost surface would buy nothing measurable and would risk exactly the
failure mode the owner named — roads meandering to avoid crossings that are
already 7 m wide. Leave the routers alone.
