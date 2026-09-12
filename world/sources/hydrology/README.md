# The hydrology graph — `hydrology-graph.json` (schema v1)

The province's water as **typed entities with stable ids**, derived once from
the frozen SHAPED terrain (`heightfield-shaped-f32.npy`: the sculpt with its
valleys, lake, portages and fluvial pass — the ground the trenches are cut
into; decision 0059) and read by every later stage (carve, water compile,
scatter, routes, places). Nothing downstream re-solves it; a stage that needs
a level, a channel, a lake or a season reads it here. Decision
[0058](../../../docs/decisions/0058-the-hydrology-graph-is-the-water-record.md);
Phase 16a brief in `docs/phases/16-foundation-and-places/`.

```
python3 -m worldgen.hydrology_graph derive   # from the vault's shaped ground + hydrology pass (~70 s); also saves the solvers' outputs beside it
python3 -m worldgen.hydrology_graph check    # invariants over this file; an `npm test` gate
python3 -m worldgen.hydrology_graph report   # the tables the ledger and the owner check use
```

Studio: `?layer=hydrograph` on the 2D map draws it (rivers by kind, bodies by
kind, falls and proposals; `hydrograph-season` and `hydrograph-wetline` are
extra toggles). The PNGs and `hydrograph-meta.json` in
`apps/world-studio/public/province/` are written by `derive` and carry this
file's `contentSha256`.

## Inputs and provenance

| Field | Meaning |
|---|---|
| `sourceHeightSha256` | sha256 of `heightfield-shaped-f32.npy`, the frozen shaped ground the graph was solved on (recorded in `world/sources/terrain/freeze.json`) |
| `contentSha256` | sha256 of everything else in the file; `check` recomputes it |
| `grid` | full-res 4033 samples at 1.828 m; coarse step 3 (the Phase 3 hydrology grid). `x` = column (east), `y` = row (south); metres = cell x metresPerSample |
| `thresholds` | every number the classification used, so a reader never guesses |
| `stats` | counts by kind, seasons, mouths, the coarse-grid measurements, the standing-water census, `drainageLoops` (must be 0) |

**Wet-season line** (`hydrograph-wetline`): the Phase 3 wetlands in
8-connected pieces of at least 10 coarse cells, every river cell and every
graph body; the raw coarse `lakes` mask is excluded (3,781 pieces, mostly
one-cell pits along contours). `stats.wetSeasonLineKm2` records it.

The graph is a projection of the carve's own solvers — `standing_water.solve_bodies`
(no placement cap: places adapt to water) and `channels.solve` +
`standing_water.pool_channels` — so the trench the terrain stage cuts and the
entity the graph names are the same curve by construction (decision 0047's one
definition, kept).

## Entities

**River** — one main stem from headwater to mouth; every other inflow at a
junction is its own river with `tributaryOf`. The stem is the inflow with the
largest catchment at each junction.

| Field | |
|---|---|
| `id` | `river.<cx>-<cy>` — the mouth's coarse cell; a second river sharing a mouth cell gets `-b`, `-c` in catchment order |
| `name` | `null` until lore work names it; then a text-catalogue key, never a literal |
| `reaches` | reach ids headwater -> mouth; each reach's `downstream` is the next |
| `tributaryOf` | `{river, junction}` or `null` |
| `strahler` | stream order over the tributary tree |
| `mouth` | `{kind: sea | lake | border | confluence, bodyId?, form?: delta | estuary}`; `sink` is a violation |
| `water` | `whitewater` (>= 20 % of the catchment in the mountain regions), else `blackwater` (>= 50 % marsh region or peat soil), else `clearwater` — rulebook §2 |
| `accumKm2`, `lengthM`, `source*M`, `mouth*M` | measured |

**Reach** — a stretch of one river with one kind. Kinds:

| Kind | Rule (from the reach's own water-level profile) |
|---|---|
| `horizontal-channel` | profile slope < 0.035; the size is `band` 1 / 2 / 3 (creek / stream / river: catchment >= 1 / 4 / 15 km2 x scale) |
| `horizontal-tidal` | as above, majority of stations in the tidal mask |
| `horizontal-backwater` | inside a standing body (`bodyId`); the river passing through a lake |
| `sloped-riffle` | 0.035 <= slope < 0.065 |
| `sloped-rapid` | 0.065 <= slope < 0.5 |
| `sloped-chute` | slope >= 0.5, a slide short of a fall |
| `vertical-fall` | the carve's fall rule: >= 3 m at a face >= 70 deg; `fall: {dropM, lipLevelM, plungeLevelM, plungeBodyId, origin}` |

Runs shorter than 6 stations (about 11 m) are merged into their neighbour so
a reach is never a one-station flicker, and a channel or strip surface
shorter than 30 m is absorbed by its longer neighbour; falls and bodies are
never merged. Each reach carries `surface` ∈ channel | strip | fall | body:
the four things the renderer builds, so a seam only exists where the surface
changes, never between a creek and a stream or a riffle and a rapid (owner,
2026-09-11: keep transitions few and semantic). `stats.surfaceTransitions`
counts them province-wide and `shortChannelOrStripRuns` must be 0. Other fields:
`band`, `accumKm2`, `slope` (profile), `slopeMax` (station), `widthM`
(hydraulic), `depthM` (centre), `lengthM`, `levelFromM`/`levelToM` (may rise
by at most 0.25 m, the carve's junction pin), `speedMS`, `season`, `tidal`,
`water`, `upstream[]`, `downstream`, `fromJunction`/`toJunction`, and a
`centreline` of `[eastM, southM]` every ~5.5 m.

**Junction** — `junction.<x>-<y>` (full-res cell) with `kind: source |
confluence | mouth`, `inflow[]`, `outflow`, `levelM`, position.

**Body** — standing water. `id` is `body.<x>-<y>` at the deepest full-res
cell (the extent is the connected flood below `levelM` around that cell on the
frozen terrain, so no polygon is stored). Kinds:

| Kind | Rule |
|---|---|
| `ocean` | sea-connected water below 0 in the coarse ocean mask (one body) |
| `lagoon` | sea-level water outside the ocean mask that is brackish (salinity >= 0.15 at its deepest cell); fresh sea-level water is an ordinary body at level 0 |
| marsh family (below) | a flat sheet, or a body shallower than 2 m on average with at least half of its shore country in the marsh region classes (tidal delta, coastal marsh, rootland deep marsh, interior swamp, fringe marsh, seasonal floodplain, jungle, mangrove); the region class "lake & standing water" counts neither way |
| `lake-lowland` / `tarn-upland` | not marsh, >= 1 ha; by `altitudeBand` (tarn: upland or montane) |
| `pond` / `pool` | not marsh; >= 500 m2 / smaller |
| `plunge-pool` | the body a fall lands in; `causedBy: {fall}`; `origin: promised` when the base has no bowl yet (the terrain stage digs it to `terrainPrecondition`) |
| `marsh-fringe`, `marsh-deep`, `swamp`, `backswamp`, `mudflat` | the marsh family, named by the dominant marsh region around the body (fringe or coastal marsh / rootland deep marsh / interior swamp, jungle, mangrove / seasonal floodplain / tidal delta when brackish) |

Fields: `levelM`, `altitudeBand` (`tidal` <= 1.5 m and saline, `lowland`
< 30 m, `upland` < 110 m, `montane`), `areaM2`, `maxDepthM`, `sheet`,
`season`, `seasonResponse`, `wetSeasonLevelM` (= level + 1.4 x response),
`drySeasonLevelM` (= level - 0.2 x 1.4 x response, the runtime's dry-season
draw-down), `inflow[]`, `outflow`, `sink` (inflow and no outflow), `region`,
`deepestCell`, `bboxCells`, `origin: measured | promised | authored`.

**Season.** `perennial` unless the dry-season draw-down empties the body
(`maxDepthM` <= dry drop), then `seasonal`. Reaches: bands 2–3 perennial;
band 1 perennial only inside the marsh/wetland heartland (groundwater-fed),
else `seasonal` — and **perennial flows downstream**: once a river is
perennial every reach below it is, and a body fed by a perennial reach is,
so a river never dries in the middle and restarts. This is the stored fact the runtime's arithmetic used to
imply; the runtime keeps animating the level between the two stored extremes.

**Authored bodies** — `authored-bodies.json` declares lore-required standing
water (the Blackrose lake); the shape stage digs it, the derive measures it
like any other body and cross-references the two (`realisedBy` on the
authored record, `declaredBy` on the measured one); the `authored-bowl`
precondition is what the freeze gate checks. Its level is 0: the southern
feeder is its outlet to Oliis Bay and is cut below sea level, so the lake is
a tidal arm of the bay. Only real relief makes a waterfall: nothing is cut to add one (owner,
2026-09-11); a fall off a low bank into sea-level water is flagged
`fall.suspect = "coastal-terrace-step"` for 16b to smooth away.

## Terrain preconditions (what 16b builds to; the freeze gate checks)

Every reach and body carries `terrainPrecondition`:

| kind | fields | meaning |
|---|---|---|
| `trench` | `bedLevelFromM`, `bedLevelToM`, `bedMaxM`, `widthM`, `shoulderCrestM`, `sealCapM` | the bed the carve cuts (L − depth × ramp) at the first and last station; the bed is at or below `bedMaxM` everywhere inside the width and at or below `bedLevelToM` at the end; the shoulder ring seals to the crest wherever the shaped ground lay within `sealCapM` of it (never inside standing water) |
| `weir` | as trench | a lake outlet: the bed AT the lake level (`bedLevelFromM`) for the sill, never above it |
| `captured` | `levelM`, `channelLevelM`, `floorMaxM` | a body a channel runs through below its own level: the carve drains it to the trench and the compile refills it at the river's level; its floor is under `channelLevelM` |
| `fall-face` | `lipLevelM`, `plungeLevelM`, `dropM`, `faceMinSlope`, `widthM`, `lipNotch` | the face delivers at least 80 % of `dropM` at a mean slope of at least `faceMinSlope` (the fall rule's mean, `channels.FALL_SLOPE`; the carve notches the lip and digs the bowl but leaves the face) |
| `in-body` | `bodyId`, `levelM` | the reach is inside the body |
| `bowl` | `levelM`, `floorMaxM`, `spillM` | the body's floor is at or below `floorMaxM`; its spill is at `spillM` |
| `plunge-bowl` | `levelM`, `depthM`, `radiusM`, `law` | dig this bowl at the plunge station |
| `sea` | `levelM` | sea and lagoon: nothing to build |

## Extension rule and the carve's reconciliation

`carve_province` re-solves the bodies on the frozen array after the cut and:

* **re-measures** every measured body the frozen ground still holds (level,
  area, depth, spill) — the carve's levees and trenches move a hollow's rim,
  and the graph names the water the frozen world holds; a body whose level
  moved by more than 0.05 m keeps its solve-time level in `preCarve`, and
  `stats.bodiesMovedByCarve` counts them. A body a reach depends on (pooled
  through, weired out of, fed by, a plunge body) may not move more than
  0.10 m: the stage fails;
* **appends** the bodies the carve itself made (a shoulder's backswamp, a
  trench pool) with `origin: "terrain-stage"`, keyed by deepest cell;
* **fails** on a graph body left dry (unless the sea, a captured body, one the
  trench runs through, or a promised / authored body the freeze gate checks).

The three Blackrose feeder channels the shape stage carves are appended by the
derive as reaches with `origin: "terrain-stage"` and `river: null`. Rivers,
reaches and junctions are never rewritten by a later stage.

## What the owner reviews (Phase 16a check)

The 2D map at `?layer=hydrograph`; the rulings it feeds are 16b's (plan §7,
rulings 1–6). The measurement ledger is
[docs/research/phase16/16a-hydrology-graph-ledger.md](../../../docs/research/phase16/16a-hydrology-graph-ledger.md).
