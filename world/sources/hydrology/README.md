# The hydrology graph — `hydrology-graph.json` (schema v1)

The province's water as **typed entities with stable ids**, derived once from
the frozen base terrain and read by every later stage (carve, water compile,
scatter, routes, places). Nothing downstream re-solves it; a stage that needs
a level, a channel, a lake or a season reads it here. Decision
[0058](../../../docs/decisions/0058-the-hydrology-graph-is-the-water-record.md);
Phase 16a brief in `docs/phases/16-foundation-and-places/`.

```
python3 -m worldgen.hydrology_graph derive   # from the vault's sculpt + hydrology pass (~50 s)
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
| `sourceHeightSha256` | sha256 of `heightfield-sculpted-f32.npy`, the frozen base the graph was solved on |
| `contentSha256` | sha256 of everything else in the file; `check` recomputes it |
| `grid` | full-res 4033 samples at 1.828 m; coarse step 3 (the Phase 3 hydrology grid). `x` = column (east), `y` = row (south); metres = cell x metresPerSample |
| `thresholds` | every number the classification used, so a reader never guesses |
| `stats` | counts by kind, seasons, mouths, the coarse-grid measurements, the standing-water census, `drainageLoops` (must be 0) |

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
| `horizontal-river` / `-stream` / `-creek` | profile slope < 0.035; band 3 / 2 / 1 (catchment >= 15 / 4 / 1 km2 x scale) |
| `horizontal-tidal` | as above, majority of stations in the tidal mask |
| `horizontal-backwater` | inside a standing body (`bodyId`); the river passing through a lake |
| `sloped-riffle` | 0.035 <= slope < 0.065 |
| `sloped-rapid` | 0.065 <= slope < 0.5 |
| `sloped-chute` | slope >= 0.5, a slide short of a fall |
| `vertical-fall` | the carve's fall rule: >= 3 m at a face >= 70 deg; `fall: {dropM, lipLevelM, plungeLevelM, plungeBodyId, origin}` |

Runs shorter than 6 stations (about 11 m) are merged into their neighbour so
a reach is never a one-station flicker; falls are never merged. Other fields:
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
| `lagoon` | sea-connected water below 0 the coarse pass does not call ocean (inland arms) |
| `lake-lowland` / `tarn-upland` | >= 1 ha; by `altitudeBand` (tarn: upland or montane) |
| `pond` / `pool` | >= 500 m2 / smaller |
| `plunge-pool` | the body a fall lands in; `causedBy: {fall}`; `origin: promised` when the base has no bowl yet (the terrain stage digs it to `terrainPrecondition`) |
| `marsh-fringe`, `marsh-deep`, `swamp`, `backswamp`, `mudflat` | flat sheets, typed by the region class at the body (fringe marsh / rootland deep marsh / interior swamp / seasonal floodplain / tidal delta) |

Fields: `levelM`, `altitudeBand` (`tidal` <= 1.5 m and saline, `lowland`
< 30 m, `upland` < 110 m, `montane`), `areaM2`, `maxDepthM`, `sheet`,
`season`, `seasonResponse`, `wetSeasonLevelM` (= level + 1.4 x response),
`drySeasonLevelM` (= level - 0.2 x 1.4 x response, the runtime's dry-season
draw-down), `inflow[]`, `outflow`, `sink` (inflow and no outflow), `region`,
`deepestCell`, `bboxCells`, `origin: measured | promised`.

**Season.** `perennial` unless the dry-season draw-down empties the body
(`maxDepthM` <= dry drop), then `seasonal`. Reaches: bands 2–3 perennial;
band 1 perennial only inside the marsh/wetland heartland (groundwater-fed),
else `seasonal`. This is the stored fact the runtime's arithmetic used to
imply; the runtime keeps animating the level between the two stored extremes.

**`fallProposals`** (a *knickpoint* is the sudden step in a river bed where a fall or rapid forms) — on sloped reaches, the steepest 20 m window with a
fall-sized drop (>= 3 m) that the base terrain does not present as a 70 deg
face: where a knickpoint could be cut in 16b. Not entities; the owner picks.

## Terrain preconditions (what 16b builds to; the freeze gate checks)

Every reach and body carries `terrainPrecondition`:

| kind | fields | meaning |
|---|---|---|
| `trench` | `bedLevelFromM`, `bedLevelToM`, `widthM`, `shoulderCrestM` | the bed is at or below these along the centreline, inside the width; the shoulder seals at the crest |
| `weir` | as trench | a lake outlet held at the lake level |
| `fall-face` | `lipLevelM`, `plungeLevelM`, `dropM`, `faceMinSlope`, `widthM`, `lipNotch` | a face at >= 70 deg between the two levels |
| `in-body` | `bodyId`, `levelM` | the reach is inside the body |
| `bowl` | `levelM`, `floorMaxM`, `spillM` | the body's floor is at or below `floorMaxM`; its spill is at `spillM` |
| `plunge-bowl` | `levelM`, `depthM`, `radiusM`, `law` | dig this bowl at the plunge station |
| `sea` | `levelM` | sea and lagoon: nothing to build |

## Extension rule

Bodies the terrain stage itself creates (oxbows, levee backswamp pools, wetland
pools from the fluvial pass) are appended by that stage with `origin:
"terrain-stage"`, keyed by their deepest cell like every other body, and the
graph's `contentSha256` is re-recorded. The rivers, reaches and measured bodies
above are never rewritten by a later stage; a stage that disagrees with them
fails.

## What the owner reviews (Phase 16a check)

The 2D map at `?layer=hydrograph`; the rulings it feeds are 16b's (plan §7,
rulings 1–6). The measurement ledger is
[docs/research/phase16/16a-hydrology-graph-ledger.md](../../../docs/research/phase16/16a-hydrology-graph-ledger.md).
