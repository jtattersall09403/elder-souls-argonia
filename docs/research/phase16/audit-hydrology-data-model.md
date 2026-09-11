# Audit — the province water data model against the owner's ask (2026-09-11)

Read-only audit made for the Phase 16 plan ([../../phases/16-foundation-and-places/README.md](../../phases/16-foundation-and-places/README.md)).
It answers: what water entities exist today, where the level comes from, which
stages feed terrain and water back into each other, and why trees stand in
rivers. Evidence is `file:line` on the tree at commit `34bec0ed`.

## 1. What exists

**Coarse hydrology** (`worldgen/hydrology.py`, 1345² grid, 5.48 m/px) produces
rasters, not entities: `ocean, filled, lakes, flow_to, accum_km2, rivers (0-3
band), watersheds, twi, wetlands, tidal, salinity` (`hydrology.py:56-70`).
Thresholds: `RIVER_MAJOR/MEDIUM/MINOR_KM2 = 15/4/1` (`:25-27`),
`WETLAND_MAX_ELEV = 9.5 m`, `TWI_WETLAND_PERCENTILE = 70`, `TIDAL_MAX_ELEV =
1.5 m` (`:37-46`). Ocean is seeded only from the south and east map edges
(`:87-89`). `hydrology-meta.json` carries no water entities.

**Channels** (`worldgen/channels.py`). `build_reaches` (`:161-211`) splits the
D8 river graph into reaches broken at junctions, so a graph topology exists
*in memory* (junction cells shared, tributary ends pinned to the trunk level;
`_downstream_reaches` at `:505`). `ChannelSolution` (`:254-270`) is per-station
arrays: `reach, band, accum, width, depth, floor, bank_min, natural, pool, L,
kind ∈ {field, steep, fall}, lip, plunge, sill, ramp, pooled, speed`. Shipped:
162 reaches, 31,700 stations; kinds field 25,363 / steep 6,313 / fall 24
(`water-meta.json` `.stats`).

**Standing water** (`worldgen/standing_water.py`): bodies by priority flood
of the raw full-res terrain; every body flat at its spill level (`:1-20`);
acceptance constants `:38-56`. Shipped: 2,635 bodies, 1,856 "sheet" bodies,
2,528 accepted depressions out of 77,299 candidates.

**The shipped record** `apps/world-studio/public/province/water/water-meta.json`
(schema v2) is rasters plus two geometry lists:

- `.surface` 2017² (level W + signed depth), `.season` per-cell response,
  `.flow` 1345², `.klass` 1345² with six classes
  `["none","coast","estuary","river","lake","marsh"]` (`compile_water.py:118`),
  documented as a *type label over a superset of the wet area*;
- `.channels` — 250 entries, all `strip-N` (`compile_water.py:673`): the
  steep runs only. Flat river reaches ship as raster only; there is no
  `reach-N` record;
- `.cascades` — 16 `fall-N` (`compile_water.py:686`) with lip/plunge/width/
  drop/profile; `bodyIndex` is hard-coded `0` and names no body.

**River graph source→sea?** Partial, in memory only; nothing exports it.
**Stable ids?** No: ids are positional counters in emit order (`:673`, `:686`);
the water handoff says cascade ids renumber every compile.

| Owner category | State today |
|---|---|
| ocean / coast / estuary | class labels only |
| lakes, ponds, pools, tarns | 2,635 undifferentiated bodies; no kind, altitude, name or id shipped |
| plunge pools | dug as terrain (§4) but not a body kind and not linked to the fall |
| backwaters | `_backwater` (`channels.py:583`) is a level-solve device, not an entity |
| marsh types | one class `marsh`; taxonomy exists only in research prose (§6) |
| rivers / streams / creeks as entities | missing; bands 1-3 per station only |
| rapids (sloped) | 250 `strip-N`, 11.1 km |
| waterfalls (vertical) | 16 `fall-N` |
| perennial vs seasonal | per-cell 0..1 response, not a per-entity fact |

## 2. Where the water level comes from

**No 2D map water or wetland raster is an input anywhere.** The chain's only
terrain source is the vault heightfield (`scripts/terrain-chain.sh`); the
"2D map" water the owner sees in the studio is the Phase 3 hydrology pass
*output*. The level is a mix of two flood solves and one profile:

1. standing water = spill level of a priority flood of the raw terrain;
2. channels: `natural = valley floor + 0.15` capped bankfull, then `L` =
   downstream running minimum of `max(natural, pool)`, stepped at falls
   (`channels.py:16-33`);
3. `compile_water` re-floods bodies on the graded terrain but keeps the
   carve's `L` (`refine_province.py:203-207`).

"Always wet vs seasonal" is decided nowhere as a fact; it is runtime
arithmetic `wet ⇔ signedDepth + 1.4·response·season > 0`. Decision 0049 records
the consequence: 31.38 km² classed as water, 21.44 km² wet in the dry season,
24.86 km² at the seasonal maximum, 6.52 km² dry in every season.

**Rules that conflict with "terrain once, water once, then place":**

- 0047 "levels are found by flooding the real terrain" makes water a strict
  function of a terrain that four later stages move.
- 0049 "measure the shipped depth" forces terrain-moving consumers (dock
  dredge, lane dredge, authored waterways) to read the published raster and
  then invalidate their own input.
- 0045's flood-fill lineage survives as 77,299 → 2,528 anonymous, unstable,
  per-compile depressions; nothing is authored or reviewable.

## 3. Terrain ↔ water circularity

Terrain edited because of water, all inside `refine_province.carve_to_profile`
(`refine_province.py:194-251`): `solve_bodies → channels.solve → pool_channels
→ channels.carve → lower_islands → snapshot → apply_local_carves`
(`carve_authored`, `dredge_docks`, `dredge_lanes`; `:171-188`); before that
`fluvial_continuum` (`:519-530`) and typed `terrain_requests` (`:537`).

Water edited because of terrain: `compile_water` runs twice (after the carve
so the grader sees the water; last on the graded ground that ships).

Feedback edges, each named in the chain script:

- `sculpt_province` reads `routes.json`, rewritten by `reroute_majors` five
  stages later (frozen behind `--allow-sculpt`);
- `reroute_lanes` runs after both water solves, but the lane dredge runs
  earlier in `refine_province` ("one pass repairs the line; a second serves it");
- `dock_dredge` reads blueprint `docks[].hullClass` and published route
  geometry and cuts terrain — a settlement decision reaching into the carve;
- `authored_waterways` carves lines at `bodies.level_with_sea`;
- `grade_routes ×2`, `author_route_structures`, `grade_settlement_pads` all
  move terrain between the two water solves;
- `hydrology_intent.py:1-10` is the one pre-water intent layer, covering only
  authored `pool / spring / cut` requests (`:24`), not the natural network.

## 4. Waterfalls, rapids, plunge pools

Thresholds (`channels.py:123-131`): strip = `|dL/ds| ≥ 0.035` over 10 m, runs
≥ 10 m; fall = drop ≥ 3 m at mean slope ≥ 1.2 with the face contiguous at
≥ 2.75 (~70°). Plunge pools **are** sized from the fall:
`dp = max(depth, 1.5, min(1.5 + 0.06·drop, 8.0))` (`:1145-1146`), digging
only ground within 2.5 m of the basin level (`:1160`).

Supply: 16 cascades province-wide, drops 6.5–131.4 m, all on band-1 or
band-2 rivers — **no major river has a fall**; clustered in the northern and
western border mountains plus two eastern uplands. 250 strips, none on band 3.

**There is no "terrain designed to enable water" step.** The sculpt is frozen
and water-blind apart from keeping the coast band and damping marsh
undulation (`sculpt.py:264-296`, `:345-348`). Every water-shaped edit is
post-hoc in the carve.

## 5. Trees in rivers

`compile_scatter.ProvinceFields` decodes `water-surface.png`, `wet = depth >
0.05`, `depth_m = where(wet, depth, table − height)` (`compile_scatter.py:66-94`).
`scatter.Layer.gate` gates only on `region_classes, water_depth_m, slope,
land cover` (`scatter.py:158-159`, `:260-266`). **Nothing reads the class
raster's `river` label or `water-owner.png`**; no season argument is used.
Tidal-delta layers are gated at e.g. `[-0.6, 1.4]`, `[0.4, 2.2]` m
(`palettes.json` byRegionClass/3), and a band-1 river is 0.5 m deep, band-2
1.2 m (`channels.py:43`), so channel and marsh are indistinguishable to the
gate. `riparian` boosts thicken the margin on purpose (`scatter.py:197-202`).
Fix shape: a **channel-membership** input (owner raster or reach distance),
not a tighter depth band.

## 6. Research already written

`docs/research/world-terrain/tropical-fluvial-geomorphology.md` already holds
the hierarchy the owner asks for, unimplemented: §1.2 channel types by slope
and area (gully, cascade/fall, step-pool, plane-bed creek, pool–riffle,
meandering lowland, anastomosing blackwater, tidal), plunge pools 2–3× reach
depth; §3 wetland taxonomy; §5 lake taxonomy incl. mountain tarn; §6 cheat
sheet. `50-hydrology-climate.md:30-47` step 14 ("validate every channel
connection headwater to basin") was never implemented as a graph.
`60-water-traversal.md:112-131` defines a typed `WaterBody { id, kind, … }`
contract the shipped data does not implement.

Missing everywhere: river-as-entity with source→sea continuity and named
tributaries; the horizontal / sloped / vertical trichotomy; tarn vs lowland
standing water; plunge pool as a body linked to its fall; perennial vs
seasonal as a stored per-entity fact; altitude banding.

## 7. Proposed hydrology-graph contract (input to Phase 16a)

Derived once, before the carve, from the coarse flow graph and the wet-season
high-water raster; consumed by carve, `compile_water`, scatter, routes and
places. Ids keyed to geography, not emit order.

```ts
interface HydrologyGraph { schemaVersion: 1; sourceHeightSha256: string;
  rivers: River[]; reaches: Reach[]; junctions: Junction[]; bodies: WaterBody[]; }
interface River { id: RiverId /* river.<mouth-cell> */; name?: TextKey;
  reaches: ReachId[] /* headwater → mouth */;
  tributaryOf?: { river: RiverId; junction: JunctionId };
  strahler: number; mouth: { kind: "sea"|"lake"|"sink"; bodyId?: BodyId };
  water: "whitewater"|"blackwater"|"clearwater"; }
interface Reach { id: ReachId /* reach.<river>.<n> */; river: RiverId;
  from: JunctionId; to: JunctionId;
  kind: "horizontal-river"|"horizontal-stream"|"horizontal-creek"
      |"horizontal-backwater"|"horizontal-tidal"
      |"sloped-riffle"|"sloped-rapid"|"sloped-chute"|"vertical-fall";
  band: 1|2|3; accumKm2: number; slope: number; widthM: number; depthM: number;
  lengthM: number; levelFromM: number; levelToM: number;
  season: "perennial"|"seasonal"|"ephemeral";
  fall?: { dropM: number; lipSpeedMS: number; plungeBodyId: BodyId };
  centreline: [number, number][]; }
interface Junction { id: JunctionId; x: number; z: number; levelM: number;
  inflow: ReachId[]; outflow: ReachId|null; }
interface WaterBody { id: BodyId /* body.<x>-<z> at the deepest cell */;
  kind: "ocean"|"estuary"|"lagoon"|"lake-lowland"|"tarn-upland"|"pond"|"pool"
      |"plunge-pool"|"oxbow"|"marsh-fringe"|"marsh-deep"|"swamp"|"backswamp"|"mudflat";
  levelM: number; altitudeBand: "tidal"|"lowland"|"upland"|"montane";
  areaM2: number; maxDepthM: number; season: "perennial"|"seasonal";
  wetSeasonLevelM: number; drySeasonLevelM: number;
  inflow: ReachId[]; outflow: ReachId|null; causedBy?: { fall: ReachId }; }
```

## 8. Owner decisions that need re-ruling for "terrain once, water once"

1. **0047** "levels are found by flooding the real terrain" → the level is
   solved once on the pre-carve terrain into the graph; the carve realises it;
   `compile_water` reads the graph and never re-floods.
2. **0049** "physical water is measured, never classified" → keep for
   appearance consumers; terrain-moving consumers read the graph's promised
   level, not the published raster.
3. **0045** flood-fill / multiple-elevation lineage → standing water is an
   entity set with stable ids, capped and reviewable.
4. **Dock-dredge and lane-repair edges** → navigable promises are declared in
   the graph before the carve (extend `hydrology_intent` to navigable channels).
5. **The frozen sculpt** (6b walk gate) → must be re-opened once to cut
   knickpoints where the graph says falls belong, if the owner wants falls on
   major rivers; the only edge that cannot be worked around downstream.
6. **The WADING rule (M1)** in `palettes.json:14` → the depth band stays;
   channel membership becomes a separate hard gate off the graph.
