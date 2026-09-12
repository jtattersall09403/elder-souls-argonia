# 0059 — The terrain is built once: a frozen base, a graph solved on the shaped ground, typed patches after (Phase 16b, 2026-09-11)

**Decision.** The base terrain is derived by three stages that never run on
their own initiative and are content-addressed in
`world/sources/terrain/freeze.json`: `sculpt_province` → (coarse hydrology,
society) → `shape_province` → `hydrology_graph derive` → `carve_province`.
The carve's output, `refined-height-frozen-f32.npy`, is never written again.
Everything a place may still do to the ground is a typed patch in
`world/sources/terrain/terrain-patches.json`, applied from the frozen array
by `apply_terrain_patches` under six invariants that refuse (never clamp);
`patch_water` checks them again. The freeze gate is
`test_terrain_preconditions.py`: it reads the frozen array and the graph and
fails on any promise the ground does not keep. It was shown failing on
each kind of broken promise before the province passed it. The chain order
lives in `scripts/terrain-chain.sh`; decision 0025's order is superseded.

**Non-obvious choices.**

1. **The graph is solved on the SHAPED ground, not the raw sculpt** (a
   correction to 0058's "frozen base"). The fluvial pass lowers a valley by
   up to 3 m; a long profile solved on the sculpt sits above that floor and
   the carve would have built the river a dyke. So the shape stage (terrace,
   detail noise, the Blackrose lake, portages, shoreline smoothing, the
   fluvial continuum — nothing place-derived) runs first, the graph is
   solved on its output (`sourceHeightSha256` = the shaped sha) and the
   carve realises exactly that solution (`derive` saves the solvers' outputs
   beside the graph; the carve loads them rather than re-solving).
2. **No feedback edge above the gate.** The sculpt's road corridors come from
   `carve-inputs/sculpt-corridors.json`, seeded once and never re-promoted;
   the portage carve reads the frozen `carve-inputs/waterways.json`; promoting
   the road networks (`carve_routes --promote`) is a deliberate act after a
   society re-solve. The old `--allow-sculpt` hard-skip is gone: the sculpt
   re-runs when its code changes and REFUSES to replace the recorded array
   with different bytes unless `--refreeze`.
3. **The routing sink is every sea-connected cell.** The coarse pass used the
   salinity model's `ocean` (within 2.5 km of deep water) as the D8 sink, so a
   river was routed through a sea-level lagoon and out over its spill into a
   lake 0.6 m higher. The sink is now any coarse cell holding a full-res
   sample at or below sea level connected to the east/south edge; `ocean`
   stays the salinity mask. Two solver defects found the same day are fixed
   with it: a lake-outlet sill took a pool level read before the junction
   pins moved the profile (a river rising 0.76 → 0.93); the profile after a
   run lowered to its lake was not capped to the lake.
4. **Pits (ruling 2).** On the sculpt every closed depression above 30 m
   smaller than 1 ha is filled to its spill (8,441 of them; 15 tarn-sized
   kept). A below-sea data hole in 97 m terrain by Zuuk was being called
   "sea" and left as a 99 m pond: only sea-CONNECTED water is sea. The shape
   stage fills any closed depression it creates above 12 m off wet ground.
5. **Coastal shelves (owner: only real relief makes a fall).** A bank under
   15 m that steps more than 2 m straight into sea-level water is ramped to
   the shore at a 0.35 grade within 60 m; taller banks stay sea cliffs. The
   re-derived graph has zero suspect falls.
6. **The carve re-measures the bodies.** Levees and trenches move a hollow's
   rim, so the graph's body levels are re-measured on the frozen array
   (`preCarve` keeps the solve-time level; `stats.bodiesMovedByCarve`). A
   body the channel profile depends on may not move more than 0.30 m or
   the carve fails. The freeze gate's bowl checks are therefore a check on
   every LATER stage; the trench, weir, fall, plunge-bowl and authored-
   lake checks are checks on the carve itself.
7. **The Blackrose lake stands at sea level.** Its southern feeder is the
   outlet to Oliis Bay and is cut below 0, so the lake is a tidal arm; the
   1.63 m in the first authored record was the old shipped water, whose
   outlet had not reached the sea. Declared in `authored-bodies.json`; an
   owner check item.
8. **Dredging is retired; poling channels and terrain requests are patches**
   (ruling 6). `dock_dredge` stays as a measurement (does a berth's water
   carry its hull) for 16g/16h siting. A patch that would raise a channel
   bed, dry a frozen wet cell, leak a body beyond its region or dig a hollow
   it did not declare is refused and listed in
   `terrain-patches-applied.json` for 16g ("places adapt"); the terrain-
   request plan and fulfilments the postcondition stage verifies cover the
   APPLIED requests only.
9. **Settlement pads still grade the ground below the gate** (16h converts
   them to patches); `patch_water` runs before them on purpose so the
   frozen-plus-patches state is proved before the one remaining un-patched
   edit.
10. **Rasters leave git.** The generated province rasters are a release
    artefact with a committed manifest; `npm test` refuses a tree whose
    rasters and manifest disagree; Pages fetches before it builds.
11. **Cliffs.** Benching starts at 45 m (was 110) with band spacing varying
    ±40 % over ~250 m; a heightfield cannot overhang, so a face is at most
    ~83° at the 1.83 m pitch. Two library slots (`cliff_rock`,
    `cliff_dirt`, Tropical Skyrim mountainslab02 / dirtcliffs01 with normal
    maps) are sampled only on the triplanar side projections; the top
    projection keeps the land-cover paint.
12. **Land-cover noise is position-seeded** (ruling 10): every field is a
    hash of (sample, salt, seed), so a window bakes to the same bytes as the
    province; the paint moved once.

**Gates added, with the defect each was shown to fail on.** See the ledger,
`docs/research/phase16/16b-terrain-once-ledger.md` §7.
