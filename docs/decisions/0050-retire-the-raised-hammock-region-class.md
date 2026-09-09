# 0050 — the raised hammock region class is retired; the landform is not

**Status:** accepted (owner ruling 2026-09-09: *"on 'raised hammocks' — that's
fine, let's just not have these."*)
**Supersedes:** the region-10 rows of [0048](0048-vegetation-density-ladder.md).
**Touches:** 00-core rule 7 (region grammar), engineering standard 1 (stable ids).

## What was wrong

Region class 10, "raised hammock", covered **18 pixels of the shipped region
raster — 0.05 ha of a ~37 km² province**. Every other class covers between
3.8 ha (tidal delta) and 872 ha (firm lowland). Not one of the 580 catalogue
records sat in it (`plotFacts.regionClass` counts ran firm lowland 189 down to
deep river corridor 1; raised hammock 0).

A region class is not a colour. Rule 7 makes it drive movement, visibility,
settlement forms, routes, encounters, materials, sound and danger. A class the
player can never stand in carried a full palette, a groundcover table, a
climate profile, a landcover palette, a danger multiplier and a vegetation
ladder row — all of it dead weight, and all of it unmeasurable: on 0.05 ha the
class delivered 1.90 against a 0.45 vegetation target, four times over, on a
sample far too thin to mean anything. It was the one class under
`vegetation_ladder.MIN_MEASURABLE_AREA_HA`, which is exactly why that floor
had to exist.

## The decision

**Retire the class.** Not "shrink the rule's thresholds until it claims more
ground" — that would re-solve the hydrology and invalidate the plot and the
terrain for a landform the world already carries another way (below).

**Class id 10 is burnt.** Ids are stable (standard 1); nothing may reuse it.
`regions.REGION_CLASSES` now runs 0–9, 11–14, and every consumer derives its
count from that map rather than from the literal 14.

## Where the ground went, and why

The classifier assigns hammock *after* the marsh/floodplain/corridor rules and
*before* the tidal, mangrove, upland and lake rules, so deleting
`regions[hammock] = 10` leaves each of those pixels holding whatever the
earlier rules already gave it — the classifier's own answer to "what is this
ground if hammock does not exist". Measured:

| went to | pixels |
|---|---|
| 11 firm lowland | 8 |
| 6 rootland deep marsh | 5 |
| 9 seasonal floodplain | 4 |
| 7 interior swamp | 1 |

**No other pixel in the province changed**, and no pixel was left unmatched —
which mattered, because `region_area_ha` and `region_adjacency` decode an
unmatched colour to 255 and skip it, so an orphaned colour would have vanished
from every region measure rather than failed.

## What the world loses (lore check)

Nothing the player can see. Searched `world/sources/lore/`: **no dossier
mentions hammocks or tree islands at all**, so no canon required the class.
What is grounded is the *landform* — the fen-island economy, the dry point in
a marsh that a village sits on (module 97 §A2, and the source finding that
Black Marsh buildings sit a median 3.9 m from standing water). That landform
survives untouched: it is carried by the **`landformClasses`** vocabulary
(`island`, `flood-high`, `enclosed-clearing`), which is what `macro_plot`
actually scores siting on. The two hammock place types keep working:

- `hammock-village` (3 places) now sites on interior swamp / seasonal
  floodplain / fringe marsh — where its places already stood.
- `hammock-crown-terrace` (5 places) had raised hammock as its *only* region
  class while all five of its places stood on other ground, so the recipe was
  already contradicted by the record; it is re-sited on the same three classes
  plus firm lowland, and its summary no longer claims "only this region can
  host" it.

Place prose that calls a tree island a hammock stays true and is not touched.

## The surgical route (and why not a hydrology re-run)

`compile_hydrology` re-solves flow, rivers, lakes, wetlands and salinity from
the heightfield; the plot, the routes and the terrain were built on that solve.
Re-running it for 18 pixels is not proportionate.

But the region classifier is a **pure function of the cached hydrology arrays**
that `compile_hydrology` already wrote next to the heightfield
(`hydrology-pass1.npz`). New tool `worldgen/reclassify_regions.py` replays only
`regions.compute_regions` over that cache — **~4 s** — and rewrites
`hydro-regions.png`, the npz's `regions` field and the region blocks of
`hydrology-meta.json`. Replaying it *before* the code change reproduced the
shipped raster with **zero** differing pixels, so every difference it wrote is
attributable to the change. It refuses to write unless every changed pixel
held a class named with `--expect-retired`, and refuses if any pixel ends
unmatched.

## Proof

- `vegetation_ladder.region_area_ha()` returns no class 10; unmatched-pixel
  count is unchanged at 547,501 (the ocean, which is drawn transparent).
- `test_no_region_class_leaves_the_delivered_gate_silently` now asserts **zero**
  classes are excused by the area floor, not "at most one". The hole is closed,
  not tolerated.
- `test_type_recipes.py::test_enumerations` — the gate that caught the stale
  `raised hammock` siting strings — passes.
- `worldgen/test_vegetation_ladder.py`: 14 passed, 1 failed
  (`test_delivered_ladder`, expected red until the scatter rollout).

## Needs recompiling (chain owner)

`compile_scatter`, `rebake_landcover`, `compile_chunks`/`export_web_chunks`,
and the climate rasters (`hydro-mist.png`, `climate-*.png`, which read
`CLIMATE` per class over the 18 changed pixels). Nothing upstream of the region
raster moved, so the hydrology, the terrain and the plot do **not** need
re-solving.
