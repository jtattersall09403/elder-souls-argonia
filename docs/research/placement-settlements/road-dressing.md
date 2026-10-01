# Road dressing between places

What Skyrim and the mods put beside a road between settlements, what we hold
to do the same, and the rule set the type-10 slice (16k brief, "road
structure or crossing") proves along one leg. Written 16k walk 8 (lane C).
Nothing is placed on roads yet; this is the input to that slice.

## Evidence and its limit

- No mined record of roadside placement exists. The miners read settlement
  and interior cells (`kit-assemblies-mined.json`, the dressing mine, the
  settlement-form miner); `vanilla-tamriel-placement` carries the road
  meshes and one `roadsignivarstead01r`, and `vanilla-region-object-tables`,
  `vault-exterior-placement-survey` and `composition-rules` hold no
  road-relative rows. The only road numbers we have are the spacing bars in
  `world/sources/placement/breadth-bars.json` (`sameTypeOnOneRoadMinM`,
  `samePurposeOnOneRoadMinM`) and signRule (R68).
- So the vanilla practice below is the shipped game as walked and
  documented, not a measured mine. The type-10 slice starts with a
  roadside mine (below) and replaces the numbers here with measured ones
  before it authors.

## How vanilla Skyrim dresses a road

Each item is read off the Whiterun, Falkreath and Riften hold roads, which
are the closest to our marsh-edge roads.

1. **Edge.** Loose stones and small rocks sit along the verge in clumps,
   more where the road cuts a slope, fewer on flat ground. Larger boulders
   stand where the road bends around them, because the road was laid
   around the rock.
2. **Low walls.** Dry-stone walls run beside a road near farms and towns
   (the Whiterun plains, the Rift). They are kept near a settlement and
   tumble with distance: whole runs, then runs with gaps, then end caps and
   rubble alone. A wall never runs the whole road; it marks fields and
   holdings.
3. **Signposts.** These stand at junctions only, one arm per destination,
   each arm turned onto the road it names (R68). There are none along a
   plain stretch.
4. **Shrines and cairns.** A wayside shrine (one of the Nine) stands at a
   pull-off or a junction, often with an offering. Stone cairns mark passes,
   graves and trail heads where the way is unclear.
5. **Pull-offs.** A campfire ring with a bedroll or a log seat sits a few
   metres off the road on flat ground. Some carry a broken or abandoned
   cart with its wheels off (an encounter seed in vanilla).
6. **Bridges and crossings.** These are the road's structures (16e/16k type
   10). Dressing thickens near them: wall ends, rocks at the abutments, a
   sign where the road splits after the crossing.
7. **Variation.** Nothing repeats at a fixed interval. The dressing comes
   in clusters at features (a bend, a crossing, a junction, a holding),
   with stretches of plain verge between them. Each hold's roads use one
   material set: Whiterun is grass-edged with field walls, the Rift has
   leaf litter and mossy stone.

## What the mods add

- **BM&V** (in our pool; credits in the root README) supplies
  `roadsign{small,medium,large}01{l,r}` boards for the vanilla
  `roadsignpost`, and the `aldredanyia` lamp post, which lights junctions
  near settlements.
- **KotM and HTBM** are settlement sets. They add no roadside dressing; their
  Murkmire tracks are boardwalk and mud with only fences and lanterns.
- **Hlaalu** supplies the broken wall pieces `trgmlcwallbroken{a,b,c}`, which
  serve a ruined or decayed road.

## What we hold (published kits)

| Family | Kit : pieces | Use |
| --- | --- | --- |
| Kept field wall | settlement-imperial-v1 `stonewall01/02`, `stonewallendl/endr`, composites `stonewall-run-3/5` | a holding's edge near a place (maintained) |
| Tumbled wall | hlaalu `trgmlcwallbroken{a,b,c}`, imperial-keep `mwimparchstonewallstraight01rubble`, route-structures-v1 `stonewallterrace*` | worn, decayed, broken |
| Rocks | flora-province-v1 `rockl/m/s`, `rockpile*` | the verge everywhere |
| Cairns | settlement-mud-v1 / settlement-stilt-v1 histtree `rockcairn01-04` | Argonian trail marks |
| Signpost | works-v1 `vanilla:clutter/signage/roadsigns/roadsignpost` + `bmv:roadsign*01{l,r}` | junctions |
| Campfire | works-v1 `vanilla:clutter/woodfires/campfire01burning` | pull-off with people only |
| Cart parts | works-v1 `handcart01/02`, `handcart01wheel`, `wagonwheel01` | an abandoned load at a pull-off |

Gaps, each with a backlog row (P-polish backlog, "Road dressing sourcing"):
- A milestone mesh is in neither the vault manifest nor any kit.
- A broken cart has no vanilla mesh; a whole cart with a loose wheel stands
  in for it.
- An unlit campfire ring is in the vault (`clutter/woodfires`) but not
  kitted.
- Wayside shrines to the Nine are in the vault (`clutter/shrines/shrine*.nif`);
  only `shrinearkay` and `shrinebase` are kitted, and only in
  interior-farmhouse-v1.
- Burial cairns are in the vault (`clutter/burialcairn01-03`) but not
  kitted.

## The rule set

Inputs come from records only: the route's `condition` in
`world/sources/routes/registry.json` (maintained | worn | decayed | broken;
none set means maintained), its geometry in
`apps/world-studio/public/province/routes.json`, the junctions in
`world/sources/routes/junctions.json` (`roads`, `approach`), and the region
grammar the leg crosses.

1. **Vocabulary per leg** is chosen by region grammar and condition:
   - Imperial fringe, maintained: kept field walls within 300 m of a place,
     the vanilla signpost with bmv boards at junctions, and a wayside shrine.
   - Imperial fringe, worn: walls with gaps and fewer stones.
   - Imperial fringe, decayed or broken: tumbled pieces and rubble only, no
     whole walls, and the signpost carries one blank or broken board.
   - Argonian heartland and marsh: no walls, histtree cairns at forks and
     trail heads, and rocks only where the ground is dry. A leg that crosses
     marsh is a boardwalk (0068) and takes no verge dressing.
   - Dunmer north: tumbled Hlaalu walls and rocks.
2. **Clusters at features, plain verge between them.** Features are bends
   over 30 degrees, crossings, junctions, holdings within 300 m and
   pull-offs.
   - A cluster holds 3 to 8 pieces within 15 m of its feature.
   - A plain stretch takes verge rocks only, clumped as rule R1-R14 of
     `shipped-world-placement-rules.md` clumps clutter.
   - Same-type clusters on one road are at least `sameTypeOnOneRoadMinM`
     apart (breadth-bars).
   - Pieces never stand on the road surface (roadSurfaceRule) and stand
     2 to 6 m off its edge.
3. **Variation along a route.** Condition drives the vocabulary, but a
   leg's condition changes with distance from places: within 300 m of a
   settlement, one step better than the route's record (worn becomes
   maintained), and at the far midpoint, the record's own condition. The
   seed is the route id, so the result is deterministic (standard 4).
4. **Junction signposts.**
   - Every junction in `junctions.json` with three or more roads takes one
     post.
   - Each arm names the destination of one road leaving it (from the
     registry's `from`/`to`), turned onto that road's bearing within 15
     degrees.
   - Arms on one post differ in height by at least 0.25 m (signRule).
   - The post carries a `sign` socket with `pointsTo[]` (0103).
5. **Pull-offs** go only on flat ground (slope under 8 degrees) at least
   400 m apart. They are lit only where an encounter or camp socket puts
   people there.

## Proving it (type-10 slice)

1. **Roadside mine first.** For every vanilla Skyrim.esm exterior
   reference within 12 m of a `landscape/roads/*` mesh or the road texture
   footprint, count the reference families per km of road, cluster size,
   distance to the nearest junction, settlement and bend, and the
   wall-piece kept-to-tumbled ratio by distance from the nearest town.
   - The vault has the ESM.
   - The mine follows the kit-mining protocol: expectations written first,
     a 25-item sample, then a fresh batch, then one full run.
2. Replace the provisional numbers above with the mined ones.
3. Dress one leg beside the slice's crossing (a worn imperial-fringe leg
   is the default), check it, render it and walk it.

## Sources

- The research notes for this file are at
  `tooling/.reports/16k/walk8/laneC-research-dressing.md`. They cover the
  kit inventory and the registry and junction fields.
- Decisions 0068 and 0069 (route records), ruling R68 (signRule), and
  `breadth-bars.json`.
- UESP [Skyrim:Shrines](https://en.uesp.net/wiki/Skyrim:Shrines) gives
  the wayside shrine roster.
