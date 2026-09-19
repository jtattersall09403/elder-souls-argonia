# 16g plot review — pirate-freeholds (measured)

Read-only measurement of the re-solved macro plot against the frozen world.
Measured 2026-09-19 from `world/sources/catalogue/places-pirate-freeholds.json`
(31 live records, 29 deferred), `world/sources/sites/macro-plot.json`,
`world/sources/hydrology/hydrology-graph.json` + `names.json`, one
`worldgen.site_fields.shared_survey()` per process. Distances in metres,
`positionM` [east, south].

## Summary (10 lines)

1. **The zone's water identity is wrong at the record level, zone-wide.** 21 of 31 live
   records key `plotFacts.water` to `body.2442-1212` = **Swallows-The-Border**, a
   143 ha *sheet* of `marsh-deep` at level 0.0, named and cultured **dunmer-north**.
   Every one of their prose lines says river / channel / reach / basin / bend.
2. Alten Corimont is a **river free port whose record is a border marsh**: all 12
   `footprintPolygon` vertices are dry (depth 0.0, shore 10–62 m) and the
   `cityLayout.gate` — the lane landing — is dry ground 23.1 m from the shore.
3. B5 is met only by accident: the boat lanes pass 29–37 m off the centre in 1.92 m
   of water (small-draft ≥1.2 m OK); **no berth in the zone reaches 3 m**, so
   `careening-hard`'s "foreign keeled hulls come this far up the river" cannot happen.
4. `rockpoint` (stronghold candidate) fails three ways: **no line of sight to the trunk
   road** (302.5 m, `line_of_sight` false — quests 25 §20e), its `plotFacts` water is
   `body.2039-884`, an **unnamed 0.36 m puddle** at 40 m. The real water (The Open
   Water, 5–9 m) sits 100–140 m off and belongs to hist-heartland.
5. The opening ring's **corridor holds** (work-camp→gate is band 2–3 the whole way) and a
   trivial interior + vantage sit at 93 m and 153 m; but **D4 ground reaches within 25 m**
   of the camp in 4 of 24 sectors; 22 of 24 sectors hold band-4 ground inside 250 m.
6. No A6 footprint breach survives: the four sub-sum pairs against Alten Corimont are all
   `boundTo` it, so A6 clears the smaller radius. All 8 `boundTo` pairs are inside their
   `maxM`; both `sightlineTo` pairs have clear line of sight.
7. A7 holds everywhere: no record's `dangerTier` is outside its class tolerance of
   `survey.danger` at its dot.
8. A8: `trunk-toll-bridge`, `reoccupied-fort` and `freehold-naga-camp` name
   `route.road.alten-corimont-stormhold`, which **has no geometry yet**; measured against
   `route.road.stormhold-thorn` they are 9.3 / 53.4 / 245.6 m. The naga camp breaches 220 m.
9. `reach-wreck` promises "-6.5 m in the confluence hole" and `deep-dive`; measured depth
   at the dot is **1.2 m** (max 2.16 m within 50 m) — dive floor met, hull floor not.
10. Brief corrections: `corimont-hiring-yard` is **active**, not deferred;
   `bundle-racks`, `no-tree`, `the-trunk-span` are **not places** (a rumour pool, an NPC
   role, a `station.toll.` socket on `trunk-toll-bridge`); only **one** known-red terrain
   request is this zone's (`chasecreek`), not six.

## Reconciliation

| live doc | what it says | this review |
|---|---|---|
| `docs/research/phase16/16g-ledger.md` §2 density table, row `pirate-freeholds` | 31 named, land 0.8 km², 38.9/km², D0–D3 28 / 35.1, D4–D5 3 / 3.8, gate **out** | CONFIRMED land area (0.797 km² measured). The gate fails on a **mask artefact**, not on crowding — see §7 |
| `docs/research/phase16/16g-ledger.md` §2 moves table | pirate-freeholds 30 moved, median 240.4, max 976.2 | CONFIRMED (30 of 31 moved; `veterans-holding` 0.0 m) |
| `world/sources/terrain/terrain-request-known-red.json` | `chasecreek` cut dry, `maxDepthM 0` | CONFIRMED still dry: depth 0.0 at the dot, shore 74.6 m, 8 wet samples within 150 m, best 2.4 m |
| `world/sources/sites/macro-plot.json` `relaxedRecords` / `danglingRelations` / `namedConstraintChecks` | listed province-wide | no pirate-freeholds row in any of the three |

**Single live doc to edit:** `docs/research/phase16/16g-ledger.md` (§2 zone row + a
reasoning line). The remedies below are edits to
`world/sources/catalogue/places-pirate-freeholds.json`, not a new doc.

## 1. Moves over 150 m (live records)

| id | type | moved m | measured flag |
|---|---|---|---|
| `reach-wreck` | wreck | 976.2 | depth 1.2 m vs prose −6.5 m (§4) |
| `trunk-road-tradehouse` | tradehouse | 900.8 | clean: band 3, 90.0 m to `stormhold-thorn` |
| `flu-cairn-field` | cairn-field | 696.8 | clean: band 3, 112.9 m to road |
| `bone-repatriation-waystation` | — | 650.8 | slope 50.5° at the dot; 130.0 m to road, 46.5 m to lane (§5) |
| `dres-holding-pens` | slaver-apparatus | 635.9 | prose "a river landing", "trunk road within thirty paces": water 159.4 m, road **358.1 m** |
| `kothringi-river-ruin` | kothringi-ruin | 573.3 | prose "village on the bend" plus "with a landing": water 28.0 m OK; road 236.8 m |
| `corimont-low-store` | flooded-passage | 517.6 | "a dry-ish cellar under a wet bank, on the water": depth 0.0, shore 3.7 m — borderline OK |
| `rim-keystone-chamber` | keystone-chamber | 508.4 | "cut into the rim rock above the river": nearest water is `pond` at 161 m, 245 m up |
| `rim-smugglers-ledge-north` | smugglers-ledge | 431.8 | "a cliff bench two-thirds up the border wall": elev **−17.6 m**, slope 5.9°, region firm lowland |
| `rim-pass-station` | mountain-pass-station | 411.0 | "the saddle at 226 m": elev **152.9 m**, slope 1.6° |
| `corimont-hiring-yard` | owing-eviction-camp | 386.9 | **status active** (brief said deferred); 7.7 m to road, OK |
| `dunmer-frontier-holding` | — | 352.0 | clean: `reach.2573-545` `sloped-rapid` at the dot, "its own water" holds |
| `upriver-hist-village` | hist-village | 342.3 | "nine bends upriver" plus "fresh above the salt wedge": water is the same level-0.0 sheet, 11.0 m |
| `opening-work-camp` | muster-yard | 320.8 | opening ring — §3 |
| `rockpoint` | claimable-steading | 245.2 | three failures — §4 |
| `corimont-hist-less-camp` | hist-less-refuge | 235.6 | "the town's landward fringe": 313.7 m from the camp, 397 m from any route |
| `freehold-smithy` | anomalous-smithy | 225.3 | "beside the careening hard": **352 m** (sightline clear) |
| `freehold-market` | market-fair-ground | 224.2 | "one street up from the basin": 69.6 m from the city dot, OK |
| `careening-hard` | boatwright-yard | 223.7 | keeled hulls: max depth 1.92 m within 150 m (§5) |
| `corimont-tradehouse` | tradehouse | 218.7 | "on the basin front, one door from the hull hall": **225 m** from the nearest port record, 68.7 m from water |
| `opening-work-barge` | work-gang-camp | 201.1 | "moored in the channel", "reached by boat only": dot is **dry**, shore 60.3 m |
| `reoccupied-fort` | abandoned-fort | 184.2 | "the bluff over the reach where road and lane run in one gorge": elev 4.7 m, road 53.4 m, lane 86.9 m, water 81.5 m |

`freehold-naga-camp` 143.4, `channel-pirate-anchorage` 132.6, `chasecreek` 100.2,
`rim-snowline-hermitage` 94.3, `alten-corimont` 70.8, `trunk-toll-bridge` 68.7,
`corimont-crosstrees` 46.7, `half-chartered-anchorage` 16.4, `veterans-holding` 0.0
moved under 150 m.

## 2. Water record vs prose (check 2) — the zone-wide break

`body.2442-1212` "Swallows-The-Border": `marsh-deep`, `sheet: true`, level 0.0,
1 428 675 m², meanDepth 1.3 m, `culture: dunmer-north`, grounded in `names.json` as
"the province's largest single water" and "deep marsh **on the border**".

Records keyed to it (21): `alten-corimont`, `careening-hard`, `channel-pirate-anchorage`,
`chasecreek`, `corimont-crosstrees`, `corimont-hiring-yard`, `corimont-low-store`,
`corimont-tradehouse`, `dres-holding-pens`, `flu-cairn-field`, `freehold-naga-camp`,
`freehold-smithy`, `kothringi-river-ruin`, `opening-work-barge`, `opening-work-camp`,
`reoccupied-fort`, `rim-smugglers-ledge-north`, `trunk-road-tradehouse`,
`trunk-toll-bridge`, `upriver-hist-village`, `bone-repatriation-waystation`.

Their prose claims, in their own words: "the last reach of navigable river", "an oxbow
that makes a natural basin", "moored in the channel", "the span at this reach", "nine
bends upriver", "the confluence", "a blind reach with a cut bank", "the bank from which
the barges loaded". Every one of those descriptions is wrong for a level-0.0 border marsh sheet. The `chasecreek`
known-red row (`cut: depthM, waterRelation`) is the same defect surfacing in the terrain
gate: the graph runs no channel here for the cut.

Exceptions: `dunmer-frontier-holding` → `reach.2573-545` `sloped-rapid` (consistent);
`half-chartered-anchorage` → `body.1787-344` Galonen Lake, `lake-lowland`, prose "a long
straight reach with deep water on one bank" (a lake, not a reach — but 7.56 m of water is
there); `reach-wreck` → `body.1912-542` No-Bottom, `marsh-deep`, graph maxDepth 3.22 m;
`freehold-market`/`corimont-hist-less-camp`/`rim-*` → small ponds and marsh pockets.

**Proposals (one of these, zone-level, not per record):**
- `prose-rewrite` across the 21: say marsh sheet, drowned basin, poled water, "the
  border water" — drop river / reach / channel / bend / confluence / bar / salt wedge.
  Cheapest; it keeps every dot.
- `pin-by-siting` on `alten-corimont` alone (`sitingPrefs.hardConstraints`: "on a graph
  `reach`, not a `body`") and re-solve the zone onto the Onkobra's Shadowfen reach that
  carries `route.boat.alten-corimont-helstrom`; the dependants follow by `boundTo`.
  Most faithful to `world/sources/lore/alten-corimont.md`, largest blast radius.

## 3. The opening ring

| id | status | dist to `opening-work-camp` | dot band | dangerTier | note |
|---|---|---|---|---|---|
| `opening-work-camp` | active | — | 3 | D1 | shore 61.3 m, depth 0.0 |
| `corimont-low-store` | abandoned | 93.0 | 3 | D2 | the trivial first interior (`flooded-passage`), inside 100–250 m |
| `corimont-crosstrees` | active | 153.5 | 2 | D1 | the vantage (`platform-ladder-tower`) |
| `careening-hard` | active | 179.1 | 3 | D2 | |
| `trunk-toll-bridge` | active | 190.1 | 3 | D2 | |
| `opening-work-barge` | active | 193.4 | 3 | D1 | `boundTo` camp maxM 200, measured 193 — 7 m of margin |
| `alten-corimont` | active | 205.1 | 2 | D1 | |
| `freehold-market` | active | 267.2 | 3 | D2 | |
| `flu-cairn-field` | abandoned | 309.5 | 3 | D2 | |
| `corimont-hist-less-camp` | active | 313.7 | 3 | D2 | |
| `upriver-hist-village` | active | 323.6 | 3 | D2 | |
| `chasecreek` | active | 352.0 | 3 | D2 | |
| `reach-wreck` | ruined | 380.6 | 3 | D3 | |
| `freehold-smithy` | active | 382.0 | 2 | D2 | |
| `rockpoint` | abandoned | 391.5 | 4 | D3 | |
| `platform-ladder-tower-watch` (hist-heartland) | — | 434.5 | — | D3 | same type 434 m from `corimont-crosstrees` at 304 m — A6 landmark-repeat 700 m is breached by the pair, cross-zone |
| `reoccupied-fort` | active | 438.8 | 3 | D3 | |
| `rootworm-burrow-live` (hist-heartland) | — | 508.8 | — | **D4** | nearest D4 *place*; outside 250 m |
| `alten-markmont` (hist-heartland) | — | 644.6 | — | **D4** | |

Ring principles (`docs/research/quests-and-cast/opening-hours-and-start-area.md` §3–§6):

- **D1–D2 corridor out — HOLDS.** 41 samples along the straight line
  `opening-work-camp` → Alten Corimont's gate: bands `33333333333333322222222222222222222222222`,
  max 3, min 2.
- **Trivial first interior at 100–250 m — HOLDS**, marginally: `corimont-low-store` at
  93.0 m (7 m under the floor), `corimont-crosstrees` at 153.5 m.
- **A vantage — HOLDS.** `corimont-crosstrees`, 153.5 m, `visibleFrom` both openers.
- **No D4/D5 within 250 m in every direction — SPLIT.** No D4/D5 *place* within 250 m
  (nearest 508.8 m). But `survey.danger` *ground*: 22 of 24 bearings hold band-4 cells
  inside 250 m; 4 bearings (120°, 225°, 240°, 255°, 270° — i.e. the southern and
  western arcs) are band 4 at the first sample, 25 m out. No band 5 anywhere in the ring.

Other lines to the gate: `opening-work-barge` max 4; `upriver-hist-village` max 4 over a
long band-4 run; `rockpoint` max **5** (bands `44555…` for the first ~150 m).

**Proposal:** `pin-by-siting` on `opening-work-camp` — add a hard constraint "no
`dangerBand` ≥ 4 within 250 m"; the nearest satisfying ground on the measured ring is
north-east (bearings 285°–345° read bands 2–3 out to 250 m), a `meso-move` of roughly
80–120 m toward [3800, 1200]. Alternative: leave the dot and record in the ledger that
the ring principle is read as *places*, not as ground bands — an owner call, not mine.

## 4. `rockpoint` (stronghold candidate, quests 25 §20e / 30 §24b.5)

| measurement | value | verdict |
|---|---|---|
| distance to Alten Corimont centre / gate | 546.5 / 524.2 | OK for "downriver" |
| distance to `route.road.stormhold-thorn` | 302.5 (nearest px [3912.5, 1439.4]) | A8 relaxed 380 m OK; §20e "within sight of the trunk road but off it" |
| `line_of_sight(eye_a=1.7, eye_b=8.0)` to that px | **false** | **FAIL — §20e broken** |
| `plotFacts.water` | `body.2039-884`, `marsh-deep`, level 23.89, 39.5 m | entity **absent from `names.json`** |
| measured depth at that water | **0.36 m** at 40 m | B5 fail: canoe 0.6 m, small-draft 1.2 m, keeled 3 m all missed |
| nearest usable water | `body.1999-999` "The Open Water", `lake-lowland`, 9.89 m max | 100–140 m away, `culture: hist-heartland` |
| dot band vs `dangerTier` | band 4 vs D3 | A7 OK (settlement, ±1) |
| land approaches | slope 1.64°, elev 5.59 m, band 4; 302 m of band 3–4 ground to the road | one walkable approach, as the recipe asks |
| nearest neighbours | `trunk-toll-bridge` 306.0, `corimont-low-store` 312.8, `upriver-hist-village` 314.4 | A6 clear |
| `station.boat.rockpoint-landing` | sits on 0.36 m | **FAIL** |
| `whySiteWon` | "no free 'cliff-bench' site was left in the zone, so plain ground" | the recipe's landform was not delivered |

**Proposals:** (a) `pin-by-siting` — `sitingPrefs.nearPoint` to [3760, 1690] with
`maxM: 120` plus hard constraints "≥1.2 m of water within 60 m" and "line of sight to
`route.road.stormhold-thorn`", putting the landing on The Open Water's northern shore
(measured 5.04 m at 100 m, bearing 120°); (b) `meso-move` ≤150 m toward [3780, 1700]
buys the water but not the sightline (the intervening ground is band 3–4 and higher);
(c) `prose-rewrite` the §20e tie to "hears the road" and drop the sightline; (d) `cut`
and let `place.hist-heartland.xal-meeruth-station` be the sole stronghold candidate —
the A/B call is already an open owner question in the record's `reconciliationNote`.

## 5. The named network records

| id | check | measured | verdict |
|---|---|---|---|
| `trunk-toll-bridge` | A8 on `route.road.alten-corimont-stormhold` (its `patrols`) | that track has **no geometry**; 9.3 m to `route.road.stormhold-thorn` | on *a* road, not on the one it names — re-check after the minor-route run |
| `trunk-toll-bridge` | crosses a channel? | dot dry, water 45.2 m, the sheet `body.2442-1212` | B7/prose: there is no channel to span |
| `reoccupied-fort` | "road and river lane in one gorge" | road 53.4 m, lane 86.9 m, water 81.5 m, elev 4.66 m, slope 9.1° | road+lane converge as promised; **no gorge** (9° slope, 4.7 m elevation) — `prose-rewrite` |
| `freehold-naga-camp` | A8 ≤220 m, "within a spear's throw of the track" | 245.6 m to `stormhold-thorn`, 221.0 m to the lane; band 3 vs `dangerTier` D4 | **A8 FAIL** (25 m over). `meso-move` 30–60 m south-west onto the road corridor |
| `bone-repatriation-waystation` | "on the trunk route where road and river both leave the freeholds" | road 130.0 m, lane 46.5 m, water 5.5 m, **slope 50.5°** at the dot | A8 OK; the 50° slope will not hold a resin yard — `meso-move` ≤150 m onto the flat |
| `corimont-hiring-yard` | "beside the porter yard, on the road out" | road 7.7 m; nearest porter record `rim-pass-station` **2 600 m** away (`porter-relay-yard` is deferred) | `prose-rewrite` or promote the porter yard |
| `dres-holding-pens` | "the trunk road passes within thirty paces of the ramp" | **358.1 m** to `stormhold-thorn`; water 159.4 m | **lore tie broken** — `pin-by-siting` to a roadside cell, or `prose-rewrite` |
| `rim-pass-station` | "the saddle at 226 m" | elev **152.9 m**, slope 1.6° | `prose-rewrite` to 153 m, or `pin-by-siting` onto the 226 m saddle |
| `rim-smugglers-ledge-north` | "a cliff bench two-thirds up the border wall" | elev **−17.6 m**, slope 5.9°, region firm lowland, 65.9 m from the road | **lore tie broken** — `pin-by-siting` onto a `cliff-bench` scour site in border mountains |
| `rim-keystone-chamber` | "cut into the rim rock above the river" | elev 256.4 m, slope 51.6° — the rim is right; the "river" is a pond 161 m below | `prose-rewrite` the river clause only |

## 6. Stations, depths and wrecks

Depth is the max wet sample within 150 m of the dot (10° × {25, 50, 75, 100, 150} m ring).

| id | role | dot depth | best within 150 m | B5 floor | verdict |
|---|---|---|---|---|---|
| `alten-corimont` | `travelStation` boat, 4 destinations | 0.0 (shore 21.9) | 1.92 m on the lane at 29–37 m; 1.56 m at 25–50 m off the **gate**; 1.32 m at 100 m off the gate | 1.2 m small-draft | **PASS marginally**; ≥3 m keeled berth **FAIL** |
| `alten-corimont` | `footprintPolygon` quay side | all 12 vertices dry, shore 10.3–62.3 m | — | — | the polygon never touches water |
| `alten-corimont` | `cityLayout.gate` = lane landing | dry, shore 23.1 m, `record.id` null | — | — | the lane terminal is on land |
| `half-chartered-anchorage` | `travelStation` boat+pilot | 0.0 (shore 39.5) | 7.56 m (Galonen Lake) | 1.2 m | PASS |
| `careening-hard` | keeled hulls laid over | 0.0 (shore 19.7) | 1.92 m | 3 m implied | **FAIL** |
| `channel-pirate-anchorage` | anchorage, `shallow-dive` | 0.0 (shore 21.9) | 5.88 m | 1.2 m | PASS |
| `opening-work-barge` | "moored in the channel", boat-only | 0.0 (shore 60.3) | 1.92 m at 75 m | 1.2 m | dot is on land — `pin-by-siting` onto a wet cell |
| `corimont-low-store` | `shallow-dive` flooded passage | 0.0 (shore 3.7) | 1.92 m at 100 m | ≥1.0 dive | borderline PASS |
| `rockpoint` | `station.boat.rockpoint-landing` | 0.0 (shore 36.2) | 0.36 m at 40 m / 9.24 m at 140 m | 1.2 m | **FAIL** (§4) |
| `reach-wreck` | wreck, `deep-dive`, prose "−6.5 m" | **1.2 m** | 2.16 m at 50 m | 1.0 dive / 1.5 hull | dive PASS, **hull FAIL**, prose FAIL |
| `upriver-hist-village` | `surface-swim` | 0.0 (shore 5.2) | 6.6 m at 75 m | — | OK |
| `chasecreek` | known-red cut | 0.0 (shore 74.6) | 2.4 m at 150 m, 8 wet samples | — | **known-red confirmed** |
| `rim-pass-station` | `travelStation` porter | dry | — | n/a | B5 not applicable |

`reach-wreck` remedies: `prose-rewrite` "−6.5 m" → "under two metres of stained water"
and drop `deep-dive` to `shallow-dive`; or `meso-move` ≤150 m into `body.1912-542`'s
deeper part (graph maxDepth 3.22 m). No other live record is an `underwater-entry`.

## 7. Pairs, bindings and the zone density line

**`boundTo` (all pass):** `careening-hard`→`alten-corimont` 164/250 · `corimont-crosstrees`
→AC 72/250 · `freehold-market`→AC 70/150 · `freehold-smithy`→AC 195/250 ·
`kothringi-river-ruin`→AC 492/700 · `opening-work-barge`→AC 48/250 ·
`opening-work-camp`→`opening-work-barge` 193/200 · `rim-keystone-chamber`→
`rim-pass-station` 149/800. **Nothing** to change; all share ground under A6.

**`sightlineTo` (both clear):** `freehold-smithy`→`careening-hard` 352 m, LOS true (but
the prose says "beside the careening hard" — a 352 m "beside", flagged under §1).
`veterans-holding`→`trunk-toll-bridge` 743 m, LOS true.

**Pairs under 150 m that name each other:** `alten-corimont`↔`opening-work-barge` 47.7 m
(`dependsOn`/`supplies` both ways) — **co-site (relation)**, not merge: the barge is the
opening's first interior and must read as a separate object on the water.
`alten-corimont`↔`corimont-crosstrees` 72.2 m and `alten-corimont`↔`freehold-market`
69.6 m — both inside the city's 140 m footprint and both `boundTo` it, so **nothing**:
they are wards of the city, which is what `cityLayout` expects. No other naming pair is
under 150 m.

**Zone density (ledger §2 line, 38.9/km² on 0.8 km²) — measured.**
`plot_stats.zone_land_masks(survey)['pirate-freeholds']`, 5.5 m cells:

| measure | value |
|---|---|
| masked land | 0.797 km² (26 517 cells) — CONFIRMS the ledger's 0.8 |
| band 2 / 3 / 4 / 5 | 1 938 / 23 683 / 854 / 42 cells |
| D0–D3 land | 0.770 km² = **96.6 %** |
| D4–D5 land | 0.027 km² = 3.4 % |
| bounding box of the 31 live dots | 1 261 × 1 179 m = **1.49 km²** |

The ledger's "gate: out" is a **mask artefact**, not crowding: the culture mask is a
0.8 km² sliver while the records it counts occupy at least 1.49 km² of bounding box, with
`veterans-holding`, `rim-*` and `freehold-naga-camp` sitting on border-mountain ground the
mask does not own. On the ground the zone actually uses, density is ≈ 21/km², inside the
18–22 band. Almost none of its land is dangerous (3.4 % at D4–D5), which is why the
D4–D5 record count (3 / 3.8 per km²) sits under the 8–12 band — a genuine shortfall of
hostile places. That is consistent with A10 and worth a line in the ledger rather than a
re-plot.
