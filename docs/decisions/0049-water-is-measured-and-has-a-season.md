# 0049 — Physical water is measured, and every reading names its season

Date: 2026-09-09. Supersedes nothing; extends [0047](0047-water-one-physical-model.md)
to the world-generation consumers. Owner ruling on the hostility floor recorded
below.

## The problem

About ten Phase 11 compilers each decided for themselves where the water is,
and most of them read a raster that does not answer that question.

`water-class.png` is a **type label**, deliberately dilated past the shoreline so the shore shader has a class and a turbidity to
read at the waterline. On the shipped bake it calls 31.38 km² water, of which
21.44 km² is wet in the dry season, 24.86 km² at the seasonal maximum, and
**6.52 km² is dry in every season**. The region raster's ocean and lake bodies
add another 1.88 km² of "water" at ankle depth or less, 1.08 km² of it fully
dry.

Reading either as a wetness mask over-reports and never under-reports. It had
already shipped: a berth 91 m from usable water satisfied a 10 m wet-join
rule, and a `MARSH_WATER_CREDIT_M` constant manufactured 0.6 m of depth out of
class membership on cells whose median depth is −0.12 m at base and 0.00 m at
full flood.

Underneath that sits a second question nobody was answering out loud. The
province has a wet and a dry season and the bake publishes both, so "is there
water here" has two correct answers, and which one a consumer wants depends on
the consumer.

## The decisions

1. **Physical water is measured, never classified.** Anything deciding a
   physical fact — a berth, a boat lane, a wall, a street, a sightline, a
   per-km² denominator, a distance to the water's edge — reads the published
   signed depth. Classes and region labels remain legitimate for *identity*
   and *appearance* ("which body is this", "which palette"), and
   `ProvinceSurvey.water_intent` keeps that meaning available under a name
   that cannot be mistaken for the other one.

2. **One reader, and a season argument.** `water_report.ShippedWater` is the
   single accessor for the compiled water. `ProvinceSurvey` delegates to it
   rather than decoding the same PNGs a second time. `wet_grid(season)` and
   `signed_depth_m(season)` take the season as a **required** argument, so a
   consumer cannot ask about water without stating which season it means.

3. **Season is assigned per consumer, and stated.**
   - Boat lanes and berths take the **base** season: a published lane must
     carry its hull all year.
   - Walls, fences, floors and thresholds take the **wet** season: a house
     must not stand in water four months a year.
   - The hostility denominator takes the dry season as its headline.
   - A lane that only floats in flood is **typed** (`channel.season`), not
     inferred and not silently dropped. A lane dry in *every* season is a
     defect, and the minor-routes digest lists the worst of them by name.

4. **`MARSH_WATER_CREDIT_M` is deleted.** A berth gets the depth it has been
   measured to have and nothing else.

5. **OWNER RULING — the hostile-density preference is soft.** The
   "≥ 15 hostile places per km², at least Morrowind's frequency" figure is a
   preference held in balance against the rest of the world, not a floor to be
   defended. It may be softened where holding it would make other things
   worse, and a shortfall may be closed later with roaming creatures and
   encounter sockets rather than with placed records. **Nothing fails a build
   on it.**

   With the denominator corrected the province reads 12.7 hostile places/km²
   in D1 against 15. D1 is 0.24 km², where one record moves the figure by
   ±4.2/km², so density is not a usable measure there at all. The call is to
   **fix the measure, not the world**: the report publishes spacing beside
   density, says which of the two binds for each band, and binds on spacing
   below 0.5 km² (the area at which one record swings the density by more than
   2/km²). D1 has the tightest spacing in the province — a fight every 93 m
   against Morrowind's ~350 m. No hostile records were added.

## Consequences

- Anyone adding a consumer of the water asks `ShippedWater` and names a
  season. A consumer that goes back to a class mask fails
  `worldgen/test_water_fact_invariants.py` **on the shipped data**, not on the
  shape of its code.
- `waterways-minor.json` is schema 3: `season` and `dryCells` per channel.
- `ProvinceSurvey.area_report()` now partitions the square on the measured
  mask and reports `namedWaterThatIsNotDeepKm2` separately, instead of
  double-counting the 1.88 km² across a measured half and a classified half.
- Every class-side figure in this record is measured on the bake of
  2026-09-09 and moves as the water compiler tunes the dilation (`CLASS_EXT_PX`
  4 → 5 and the `CLASS_EXT_RISE_M = 2.0` cap, e7bbd279, take the dry ground the
  class raster drops from 7.14 km² to 4.96 km² once the chain re-runs). The
  depth-side figures do not move. The hostility report measures that gap at
  render time rather than quoting it.
- `grade_routes` has since been moved onto the accessor at the wet season
  (540c1e92), so `ShippedWater`'s API is load-bearing for the road grader as
  well as for siting. Still open, queued in the Phase 11 gap plan:
  `compile_scatter` and `settlement_ground_control` open the water PNGs
  themselves rather than going through the accessor.
