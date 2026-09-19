# 16g plot review — `naga-kur-deeps` (measured, read-only)

Measured 2026-09-19 against `world/sources/catalogue/places-naga-kur-deeps.json`
vs `git show HEAD:`, `world/sources/sites/macro-plot.json`, the frozen survey
(`worldgen.site_fields.shared_survey`), `world/sources/hydrology/hydrology-graph.json`,
`apps/world-studio/public/province/{routes,waterways}.json` and
`world/sources/blueprints/place.naga-kur-deeps.wamasu-pond-adult.json`.
40 live records (67 authored: 26 `deferred`, 1 `cut`). No decisions taken here.

## Reconciliation

| live doc | what it already says | this review |
|---|---|---|
| `docs/research/phase16/16g-ledger.md` §2 (density, line `naga-kur-deeps \| 40 \| … \| 15.4 \| 16 / 6.2 \| 24 / 9.2 \| out`) | zone density `out` of gate | **confirmed**; §9 adds the ground split the ledger does not carry (87.9 % of the zone's land is D4–D5 against a 60 % D4–D5 record share) |
| `docs/research/phase16/16g-ledger.md` §3 (Clark–Evans `1.152`) | evener than random | confirmed; §1 gives the spacing percentiles |
| `docs/research/phase16/16g-review/hist-heartland.md` §1 (rootworm network does not meet its own lore) | stations far from hero Hist | **extended**: `root-node.naga-deeps` is not even inside this culture zone (§8) |
| `world/sources/routes/registry.json` `route.boat.deeps-inner-poling-line` `"solved": false` | geometry awaits `compile_minor_routes` | **supersedes the symptom**: this is the whole cause of the three `danglingRelations` (§1) and the reason A8 cannot be measured against the lane (§6) |

Writer edits **this file** for the region and `16g-ledger.md` §2 for the
D0–D3/D4–D5 ground split. The height-raster defect belongs in
`docs/phases/P-polish/backlog.md`, not a new file.

## What needs a decision (10 lines)

1. **`shared_survey` reads a stale height raster.** `site_fields` prefers
   `refined/height-natural-rg.png` (12 Sep) and takes water from the graded bake
   (`water/natural` does not exist). At Dead-Water the natural raster reads
   **−16.57 m** where graded `height-rg.png` reads **+1.59 m**; the blueprint's own
   measurement of the wamasu pan (10.15 m) agrees with graded, not natural.
   Every `heightAboveWaterTableM`, promise clearance and `effort_to_reach` in this
   zone is ~15–18 m too low. The two reported promise failures (`dead-water-village`
   dry-rise **−18.4**, `sinkhole-mouth-deeps` rim-drowned **−19.2**) are this
   artefact: on graded ground they are **+0.24 m** and **−0.26 m**.
2. **Deepmire's plateau does not exist in this zone.** The prose claims "upland
   ground above the flood by 40 m+", "a climb", "no approach that can be poled".
   The zone's **maximum** clearance above its own water table, anywhere on its
   86 441 land cells, is **8.72 m**; 1.02 % of the land clears 5 m and **0 %**
   clears 10 m. The record itself sits **+1.04 m** up.
3. **Deepmire is 211 m from the tribe it is meant to be unreachable from.** The
   `refuge-station` recipe's `proximity.minFromClassM {settlement: 450}` is
   breached by 239 m (`dead-water-village` 211.0 m). `portage-slipway` is 236 m
   away, `oliis-air-station` 247 m. The record's claim to be all but
   inaccessible, avoided even by the tribes, is false at 211 m. This is the
   zone's one A6b breach.
4. **The two homeless records still carry HEAD's coordinates.** `dead-water-village`
   and `sinkhole-mouth-deeps` moved **0.0 m** and their `positionM`, `plotFacts`
   and `whySiteWon` are byte-identical to HEAD (only `schemaVersion`/`contents`
   differ). Their `whySiteWon` still says "124 m from the nearest route" and
   "danger band 4"; the survey measures **470.0 m** and **band 5**. A downstream
   compile reading the catalogue cannot tell these two from sited records.
5. **The zone's hero Hist is homeless for want of a rise, not for want of room.**
   §7 below: three of six Thomas parents hold free ground for a 105 m footprint
   (78 / 46 / 10 free 25 m cells), but **no kernel holds a single flood-free dry
   cell**. The one kernel with a real rise (parent 4, +45 m on the natural
   raster) has **0** cells clear of existing footprints.
6. **`route.boat.deeps-inner-poling-line` has no geometry.** `registry.json`
   `"solved": false`. Three `patrols` relations dangle on it and five
   `travelServiceEdges` name it. The zone's two network records
   (`ferry-stage-guide-hire`, `portage-slipway-narrows-deeps`) are 521 m and 309 m
   from the nearest *road*, with no lane to measure against (A8).
7. **Six `underwater-entry` / dive records are on water too shallow to enter**
   (§4): `drifting-village-wet-mooring` and `wreck-submerged-barge` are on dry
   ground; `dive-shaft-natural-deeps`, `drowning-narrows-tidal-gate`,
   `sinkhole-mouth-deeps`, `raft-village-lashed` are under the 1.0 m dive floor.
8. **`root-whisper-village` has left the culture and its own lore.** It sits
   153–180 m from five `imperial-penal-south` records and 376 m from Blackrose;
   its "between the twin xanmeers Xul-Thuxis and Vakka-Bok" is unbuildable —
   **`Xul-Thuxis` has no record in any region catalogue** and Vakka-Bok is 756 m off.
9. **`harmed-hist-enslaved`'s sixty metres of black water is not there.** The
   nearest settlement is 226.6 m (`imperial-fringe.lowmere-raft-town`), not its
   own tribe across a channel.
10. **B5 at the two landings.** `ferry-stage-guide-hire` 0.44 m and
    `portage-slipway-narrows-deeps` 0.27 m recorded depth at the dot — below the
    0.6 m canoe class. No hull of any class can reach either landing.

## 1. Report lists for this region

| list | count | content |
|---|---|---|
| `homeless[]` | **2** | `dead-water-village` (tier 1), `sinkhole-mouth-deeps` (tier 2) — §7 |
| `typedSitingViolations` | 0 in this zone | — |
| `relaxedRecords` | 12 | 11 `neighbour-zone`, 1 `spacing-1/2-region-relaxed` (`naga-village-settled`) |
| `danglingRelations` | 3 | `dead-water-village`, `naga-highway-camp-active-north`, `naga-highway-camp-active-south` → `route.boat.deeps-inner-poling-line` (unbuilt geometry) |
| `namedConstraintChecks` | 1 | `drifting-village-wet-mooring` bound `leviathan-bone-field` 184 m vs `maxM` 400 — **passes** |
| `feedbackChecks.restCadenceGaps` | 1 | `drifting-village-wet-mooring` D3, nearest rest 708 m |
| Clark–Evans (ledger §3) | R **1.152** | n 38, 2.6 km², mean NN 204.8 m vs 177.9 expected — evener than random |
| A6 footprint clearance | **0 breaches** | no live pair in the province is inside the sum of its two `footprintRadiusM` |

## 2. Records that moved > 150 m from HEAD

| record | type | moved m | record | type | moved m |
|---|---|---|---|---|---|
| `ferry-stage-guide-hire` | ferry-stage | 2666.1 | `refugee-camp-raid` | refugee-camp | 995.7 |
| `beast-keeper-crocodile` | crocodile-ravine | 2386.6 | `legendary-deep-feather-serpent` | legendary-deep | 872.5 |
| `portage-slipway-narrows-deeps` | portage-slipway | 2373.4 | `drowning-narrows-tidal-gate` | drowning-narrows | 825.9 |
| `deepmire-refuge` | refuge-station | 2226.4 | `necropolis-nightbound` | necropolis-village | 811.1 |
| `poacher-camp-egg` | poacher-camp | 1851.4 | `naga-highway-camp-active-north` | naga-highway-camp | 774.4 |
| `art-and-destroy-site-deeps` | art-and-destroy-site | 1693.0 | `leviathan-bone-field` | leviathan-bone-field | 680.6 |
| `guide-camp-poling` | guide-camp | 1506.9 | `sealed-xanmeer-vakka-deeps` | sealed-xanmeer | 648.3 |
| `naga-highway-camp-active-south` | naga-highway-camp | 1451.0 | `wild-hist-rogue-deeps` | wild-hist | 598.4 |
| `naga-village-settled` | naga-village | 1393.0 | `horwalli-waterworks-deeps` | horwalli-waterworks | 591.0 |
| `serpent-ground-moon-adder` | serpent-ground | 1336.2 | `root-whisper-village` | hist-village | 566.8 |
| `harmed-hist-enslaved` | harmed-hist | 1125.1 | `maturity-trial-kaju-kill` | maturity-trial-ground | 549.4 |
| `sithis-temple-mass-sacrifice` | sithis-temple | 523.8 | `drifting-village-wet-mooring` | leviathan-bone-field | 499.0 |
| `root-gallery-blight-warren` | root-hollow-gallery | 334.5 | `bog-blight-ground-old-cordon` | bog-blight-ground | 318.8 |
| `flooded-passage-tunnel-deeps` | flooded-passage | 317.0 | `air-pocket-station-deeps` | air-pocket-station | 283.0 |
| `bog-blight-ground-nine-stakes` | bog-blight-ground | 221.1 | `dive-shaft-natural-deeps` | dive-shaft | 206.4 |
| `wreck-submerged-barge` | wreck | 183.0 | | | |

Unmoved (0.0 m): `dead-water-village`, `sinkhole-mouth-deeps` (stale — §"decision" 4),
`wamasu-pond-adult` (pinned to its blueprint), `miregaunt-ward-open`,
`naga-village-raiding`, `bereaved-hist-less-since`, `drowned-village-lake-deeps`. Small:
`umbriel-stripped-undead` 97.8, `raft-village-lashed` 27.9.

## 3. Named-list records — measured rows

Prefix `place.naga-kur-deeps.` dropped. "band/tier" = survey danger band at the
dot / record `dangerTier`. "clear" = graded height − `plotFacts.water.levelM`.

| id | type | moved m | band/tier | pf.water (kind, dist) | clear m | dot depth | road m | finding |
|---|---|---|---|---|---|---|---|---|
| `dead-water-village` | hist-village | 0.0 (stale) | 5 / D3 | swamp 29.5 m | +0.24 | 0.00 | 470.0 | homeless; stale `plotFacts` claim band 4 and 124 m; dry-rise promise needs a patch, not a site (§7) |
| `sinkhole-mouth-deeps` | sinkhole-mouth | 0.0 (stale) | 5 / D5 | marsh-deep 7.8 m | −0.26 | 0.65 | 551.9 | homeless; stale `plotFacts` claim 609 m; "flooded to within a metre of the rim" reads −0.26 m, deep-dive on 0.65 m |
| `deepmire-refuge` | refuge-station | 2226.4 | 4 / D4 | swamp 56.5 m | **+1.04** | 0.00 | 274.2 | **A6b breach** (settlement 211.0 m vs 450 floor); "40 m+ plateau" impossible (zone max 8.72 m); bone-field tie 1681 m |
| `wild-hist-rogue-deeps` | wild-hist | 598.4 | 5 / D4 | swamp 11.0 m | +2.13 | 0.00 | 785.6 | A6b **passes** (nearest settlement 720.0 m vs 600 floor); "isolated water" is 11 m of swamp, not an island |
| `harmed-hist-enslaved` | harmed-hist | 1125.1 | 4 / D4 | swamp 24.5 m | +0.24 | 0.00 | 65.8 | lore tie **broken**: nearest settlement 226.6 m (`imperial-fringe.lowmere-raft-town`), no 60 m channel-facing village; `maxFromM` 800 passes |
| `root-whisper-village` | hist-village | 566.8 | 4 / D4 | swamp 66.7 m | +3.11 | 0.00 | 223.2 | "between the twin xanmeers": Vakka-Bok 756.1 m, **Xul-Thuxis does not exist**; "within a day of the Refuge" 1332.9 m; inside the penal cluster (A11) |
| `wamasu-pond-adult` | wamasu-pond | 0.0 | 5 / D5 | marsh-deep 5.5 m | −0.36 | 0.86 | 493.3 | **landed exactly on its blueprint candidate** `[2466.0, 4403.0]`; 175 m footprint clear of everything (nearest 243.6 m) |
| `wamasu-pond-nest` | — | — | — | — | — | — | — | not in this region (`place.hist-heartland.wamasu-pond-nest`, 2996.8 m away) |
| `drifting-village-wet-mooring` | leviathan-bone-field | 499.0 | 5 / D5→D3 | marsh-deep 43.9 m | +1.52 | 0.00 | 177.2 | `boundTo` 183.9 m ✓ (LOS true); **`underwater-entry`/`deep-dive` on dry ground 43.9 m from water**; `relaxedRecords` neighbour-zone; rest-cadence gap 708 m |
| `raft-village-lashed` | drowned-village | 27.9 | 5 / D3 | swamp 7.8 m | −0.12 | 1.03 | 604.8 | `deep-dive` on 1.03 m; `maxFromM {settlement: 500}` passes at 214.2 m |
| `wreck-submerged-barge` | wreck | 183.0 | 4 / D3 | swamp 5.5 m | +0.17 | **0.00** | 478.8 | `nearPoint` 175.9 m of 400 ✓; hard constraint "navigable water at least 4 m deep, outside of a bend" **fails on dry ground** |
| `air-pocket-station-deeps` | air-pocket-station | 283.0 | 5 / D4 | swamp 0.0 m | −1.58 | **7.75** | 631.3 | the reported "pool 1.6 < 6.0" is the *graded-bake* depth; `survey.recorded_depth_m` reads **7.75 m** at the same dot — two live numbers for one fact |
| `naga-village-settled` | naga-village | 1393.0 | 4 / D3 | swamp 42.8 m | +20.18 | 0.00 | 261.4 | placed at `spacing-1/2-region-relaxed`; `maxFromM {route: 400}` passes at 261.4 m; the zone's only settlement on real high ground |

## 4. Every `underwater-entry` / dive record — depth against the floor

Floor: **≥ 1.0 m** for a dive entry, **≥ 1.5 m** for a hull. `recorded_depth_m`
at the dot; `water_m` = distance to the nearest water cell.

| id | entrance / access | recorded depth m | water m | verdict |
|---|---|---|---|---|
| `air-pocket-station-deeps` | underwater-entry / argonian-only-depth | 7.75 | 0.0 | pass |
| `drowned-village-lake-deeps` | underwater-entry / shallow-dive | 7.75 | 0.0 | pass |
| `flooded-passage-tunnel-deeps` | underwater-entry / deep-dive | 4.70 | 0.0 | pass |
| `legendary-deep-feather-serpent` | cave-mouth / deep-dive | 7.75 | 0.0 | pass |
| `umbriel-stripped-undead` | (dry entrance) / — | 1.64 | 0.0 | pass |
| `raft-village-lashed` | underwater-entry / deep-dive | **1.03** | 7.8 | marginal — a deep-dive wreck on a metre of water |
| `sinkhole-mouth-deeps` | sinkhole-lip / deep-dive | **0.65** | 7.8 | **fail** |
| `serpent-ground-moon-adder` | — / — | 1.11 | 17.3 | pass |
| `dive-shaft-natural-deeps` | sinkhole-lip / argonian-only-depth | **0.00** | 15.5 | **fail** — a dive shaft on dry ground |
| `drowning-narrows-tidal-gate` | underwater-entry / shallow-dive | **0.00** | 5.5 | **fail** |
| `drifting-village-wet-mooring` | underwater-entry / deep-dive | **0.00** | 43.9 | **fail** |
| `wreck-submerged-barge` | underwater-entry / shallow-dive | **0.00** | 5.5 | **fail** |
| `horwalli-waterworks-deeps` | well-shaft / shallow-dive | 0.00 | 95.8 | dry entrance — the shaft is the interior's job |
| 5 × surface-swim (`dead-water-village`, `leviathan-bone-field`, `maturity-trial-kaju-kill`, `portage-slipway-narrows-deeps`, `wamasu-pond-adult`) | surface-swim | 0.00–0.86 | 5.5–33.4 | no floor applies |

## 5. A6 / A6b / A7 / A8 / B5

**A6 (extent).** No breach: every live pair clears the sum of its two
`footprintRadiusM`. Tightest: `flooded-passage-tunnel-deeps` ↔
`harmed-hist-enslaved` 66.7 m (30+35, clears 1.7), `beast-keeper-crocodile` ↔
`ferry-stage-guide-hire` 79.9 m (clears 9.9), `horwalli-waterworks-deeps` ↔
`hist-heartland.sap-tapping-licensed` 81.9 m (clears 6.9),
`leviathan-bone-field` ↔ `serpent-ground-moon-adder` 88.4 m.

**A6b (typed proximity).** One breach, `deepmire-refuge` (above). Passing:
`wild-hist-rogue-deeps` 720.0 ≥ 600; `harmed-hist-enslaved` 226.6 ≤ 800;
`drowned-village-lake-deeps` 223.2 and `raft-village-lashed` 214.2 ≤ 500;
`naga-village-settled` 261.4 ≤ 400 (route).

**A7 (danger).** `LIVED_IN_CLASSES = {settlement, civic, works, transit}` ±1, others
±2. All 40 records are inside their allowance; the widest are
`naga-highway-camp-active-south` (camp, D3 on band 5, gap 2 — at the limit),
`drifting-village-wet-mooring` (lair, D3 on band 5), `raft-village-lashed`
(ruin, D3 on band 5), `wreck-submerged-barge` (D3 on band 4).
**D5 within 200 m of a road: none.** The six D5 records measure 493.3
(`wamasu-pond-adult`), 551.9 (`sinkhole-mouth-deeps`), 771.1
(`sealed-xanmeer-vakka-deeps`), 845.9 (`legendary-deep-feather-serpent`), 903.5
(`miregaunt-ward-open`), 1110.3 (`root-gallery-blight-warren`).

**A8 (network roles).** Unmeasurable against the lane —
`route.boat.deeps-inner-poling-line` is `"solved": false` with no geometry in
`waterways.json` (the file holds six lanes, none of them this one). Distance to
the nearest *road*: `ferry-stage-guide-hire` 521.4 m,
`portage-slipway-narrows-deeps` 308.8 m, `guide-camp-poling` 744.2 m. Fourteen
of the zone's records sit > 400 m from any road.

**B5 (dock depth).** No `travelStation`-family record here; the two landings are
`transit`. Recorded depth at the dot: `ferry-stage-guide-hire` **0.44 m**,
`portage-slipway-narrows-deeps` **0.27 m** — both under the 0.6 m canoe class.

**Sightlines (`eye_a=1.7, eye_b=8.0`).** All three tested pairs are clear:
`drifting-village-wet-mooring` → `leviathan-bone-field` 183.9 m;
`root-whisper-village` → `sealed-xanmeer-vakka-deeps` 756.1 m (so "marks it from
a distance" holds, "between two" does not); `harmed-hist-enslaved` →
`dead-water-village` 2051.8 m.

## 6. Approach cues and 300 m neighbourhoods (report only)

| id | approach cue | what is actually within 300 m |
|---|---|---|
| `deepmire-refuge` | "A day through leviathan bone country and then a climb." | `dead-water-village` 211.0, `portage-slipway-narrows-deeps` 236.0, `oliis-air-station` 247.7 — no climb; the tribe's seat in view |
| `dead-water-village` | "Blue light on black water, an hour out from the landing." | `deepmire-refuge` 211.0, `drowned-village-lake-deeps` 223.2, `portage-slipway` 251.1, `beast-keeper-crocodile` 294.8 |
| `root-whisper-village` | `vibe.approach`: between the two xanmeers, on a kept-clear line | `imperial-penal-south.akaviri-works` 153.7, `rebellion-earthworks` 155.9, `lilmothiit-quarry` 164.9, `kothringi-ruin-basin` 166.8, `scandal-holding-pit` 180.4 |
| `wamasu-pond-adult` | "The pole line marks what is out there long before it is visible." | `hist-heartland.wild-hist-mad-one` 243.6, `bog-blight-ground-old-cordon` 244.5, `wild-hist-rogue-deeps` 290.3 — nothing inside the 175 m footprint |
| `harmed-hist-enslaved` | "Two settlements facing each other across sixty metres of water." | `flooded-passage-tunnel-deeps` 66.7, `bog-blight-ground-nine-stakes` 138.5, `imperial-fringe.the-old-quarters` 182.6 — no facing pair |

## 7. The two homeless records — kernel arithmetic

`clusteringPrior.byZone['naga-kur-deeps']`: Thomas process, `parentFloorM` 700,
`sigmaM` 180, `childRadiusM` 300, `targetParents` 6, `actualParents` 6.
Parents (`positionM` [east, south]):
`P0 [1998.7, 6040.1]` · `P1 [2316.8, 4844.7]` · `P2 [1390.1, 5626.6]` ·
`P3 [2706.1, 5568.5]` · `P4 [1315.5, 4907.2]` · `P5 [3693.2, 5744.0]`.

Scan on a 25 m lattice inside each 300 m kernel, on the culture∧land mask;
"free" = clear of every live footprint sum at the record's own radius.

| parent | zone cells | dry | + water within the recipe's reach | free for `dead-water-village` (105 m) | free for `sinkhole-mouth-deeps` (25 m) | flood-free dry cells | max clearance above its water table |
|---|---|---|---|---|---|---|---|
| P0 | 154 | 146 | 146 | **0** | 17 | **0** | −12.3 m |
| P1 | 386 | 357 | 357 | **78** | 255 | **0** | −12.7 m |
| P2 | 312 | 295 | 291 | **46** | 145 | **0** | −11.4 m |
| P3 | 298 | 268 | 268 | **10** | 116 | **0** | −10.9 m |
| P4 | 90 | 88 | 88 | **0** | 29 | **0** | **+45.2 m** |
| P5 | 105 | 91 | 91 | **0** | 40 | **0** | −12.5 m |

Max clearance is measured on the stale natural raster (§"decision" 1), so the
*ranking* is the finding: P4 alone has a rise; P4 alone has no room.

Reading it straight:

* **`dead-water-village` is not blocked for want of room.** 134 free 105 m-clear
  kernel cells exist (P1 78 · P2 46 · P3 10). The plot's `soleBlocker`
  "culture clump ×566" says 566 candidates failed *only* the clump gate — i.e.
  the ground that satisfies its other constraints lies outside every kernel. Its
  own hard constraint "black standing water on three sides, one poling approach"
  plus its `dry-rise` terrain promise is what excludes the kernels: **zero**
  flood-free dry cells in any of the six; the zone's absolute ceiling is
  8.72 m of clearance over 1.02 % of its land. The promise is a terrain-patch
  job, not a siting job.
* **`sinkhole-mouth-deeps` has room in every kernel** (17–255 free cells at its
  25 m footprint) and `soleBlocker` "culture clump ×1579". Its exclusion is the
  clump gate alone: its `nearPoint {x: 2350, z: 5000, maxM: 350}` sits 1246 m
  from P1, the nearest parent, so every candidate inside its authored near-point
  is outside every kernel. It is a `rare — every instance individually
  meaningful` type with no `proximity` block; the clump prior should not be
  binding it at all.

## 8. `root-node.naga-deeps` (rootworm placeholder)

`world/sources/routes/travel-services.json`, `positionM [3465.5, 4866.5]`,
`status: placeholder`, note "Inner southern swamps, Naga-Kur country."

| measured | value |
|---|---|
| culture territory at the node | **`mercantile-coast`** — the node is not in Naga-Kur country |
| region class / danger band | tropical jungle / band 4 |
| nearest live record (any zone) | `mercantile-coast.naga-village-oliis` **56.5 m**, then `insular-jungle-village` 96.2, `hist-village-keel-sakka` 148.4 |
| nearest hero Hist (`dead-water-village`, blue-flowered, hero 10/10) | **854.3 m** |
| `wild-hist-rogue-deeps` | **811.7 m** |
| nearest Naga-Kur records | `horwalli-waterworks-deeps` 307.1 m (`ruined`, 0 `notableNpcSlots`), `root-gallery-blight-warren` 439.4 m (D5 lair, 0 slots) |
| `ferry-stage-guide-hire` / `portage-slipway-narrows-deeps` | 906.6 m / 1054.9 m (2 and 1 `notableNpcSlots`) |
| ground clearance at the four candidates (graded) | `dead-water-village` +0.24 · `wild-hist-rogue-deeps` +2.13 · `horwalli-waterworks-deeps` +1.52 · `ferry-stage-guide-hire` −0.07 |

**Can a live record be the station?** `dead-water-village` alone is dry, has an
operator (3 `notableNpcSlots`) and is the hero Hist the lore makes the rootway
terminus (`topics/hist-placement.md` §3b) — but it is 854 m off and homeless.
`wild-hist-rogue-deeps` is dry (+2.13 m) and nearer, but has **0
`notableNpcSlots`** and is defined as having "cut itself off from the
collective" — the opposite of a terminus. No other Naga-Kur record within 500 m
of the node has an operator slot.

## 9. Pairs, binds and the zone's ground

**Pairs within 150 m that name each other**: one —
`beast-keeper-crocodile` ↔ `ferry-stage-guide-hire`, **79.9 m** (`reachedVia`).
Co-site as a relation; no merge (a ruined beast lair and a working ferry stage
are different classes). No live record here carries `proseRefs` to another
*place* (only faction/route refs), so no prose-shared pair to reconcile.

**`boundTo` pairs**: one — `drifting-village-wet-mooring` →
`leviathan-bone-field`, `maxM` 400, measured **183.9 m**, sightline clear;
nothing to do. Both carry the type `leviathan-bone-field`, so A6's "same type
never twice within 300 m" would bite were the pair not `boundTo`.

**Zone density and ground** — ledger §2 row `naga-kur-deeps | 40 | 8 | 12 | 20 |
2.6 | 15.4 | 16 / 6.2 | 24 / 9.2 | out`. Measured land under the culture mask:
86 441 cells × 5.48 m = **2.60 km²** (matches).

| survey danger band under the mask | cells | share |
|---|---|---|
| D2 | 1 760 | 2.0 % |
| D3 | 8 670 | 10.0 % |
| D4 | 27 234 | 31.5 % |
| D5 | 48 777 | **56.4 %** |

**D0–D3 ground 12.1 % · D4–D5 ground 87.9 %**, against a record split of
16 D0–D3 (40 %) / 24 D4–D5 (60 %). The zone is placing tame records on danger-5
ground at more than three times the rate its ground supports; 12 of the 16
D0–D3 records sit on band 4 or 5.

## 10. Candidate remedies (vocabulary only — no decision taken)

| record | failure | candidates |
|---|---|---|
| `deepmire-refuge` | A6b 211.0 m vs 450 floor; "40 m+ plateau" against a zone ceiling of 8.72 m | `pin-by-siting` to the zone's high point `[2360, 4323]` (8.7 m clearance) — but that is 118 m from `wamasu-pond-adult`, inside its 175 m footprint, so it needs `meso-move` of the pond or the second-best rise `[2525, 4476]` (8.4 m, 165 m from the pond); **or** `prose-rewrite` `why.founding` / `siteAdvantages` / `vibe.approach` from "plateau above the flood by 40 m+" to the 8 m ridge the zone has; **or** `re-type` off `refuge-station` (whose recipe carries the 450 m floor) |
| `dead-water-village` | homeless; dry-rise promise unsatisfiable in any kernel | `pin-by-siting` into P1's free ground (78 free cells, e.g. within 300 m of `[2316.8, 4844.7]`) and let its `terrainRequests[dry-rise, radiusM 90]` build the rise — the promise is a patch, not a site; **or** `prose-rewrite` "black standing water on three sides" to a one-sided landing |
| `sinkhole-mouth-deeps` | homeless on the clump gate alone | `pin-by-siting` to its own `nearPoint [2350, 5000] maxM 350` (its stale dot is 80.6 m from it and has 221.3 m of clearance to its only neighbour) — the clump prior should exempt a `rare` type with no `proximity` block |
| `root-whisper-village` | "between the twin xanmeers" unbuildable (`Xul-Thuxis` has no record); 153–180 m from five penal records | `pin-by-siting` toward `sealed-xanmeer-vakka-deeps` (756.1 m off) and out of the penal cluster; **or** `prose-rewrite` `why.founding` / `siteAdvantages` to one named xanmeer; **or** promote a `deferred` xanmeer record as Xul-Thuxis (`broken-xanmeer-collapsed-deeps`, `tended-xanmeer-pilgrim-deeps`, `submerged-xanmeer-fully` are all authored and `deferred`) |
| `harmed-hist-enslaved` | no facing village at 60 m | `meso-move` (< 150 m) will not create one — `pin-by-siting` beside `bereaved-hist-less-since` (the "bereaved or sap-touched village" its recipe names), **or** `prose-rewrite` the sixty metres to the flooded passage 66.7 m away |
| `drifting-village-wet-mooring` | `underwater-entry`/`deep-dive` 43.9 m from water; D3 on band 5; rest gap 708 m | `meso-move` 44 m onto `body.1145-2664`; **or** `prose-rewrite` the entrance field to a surface mooring |
| `wreck-submerged-barge` | `underwater-entry` on dry ground; "navigable water ≥ 4 m, outside of a bend" | `meso-move` < 150 m onto the channel it names (water 5.5 m away) — needs a 4 m reach the graph does not yet record; **or** `re-type` to a beached wreck |
| `dive-shaft-natural-deeps`, `drowning-narrows-tidal-gate` | dive entries on 0.00 m | `meso-move` onto the adjacent water (15.5 m / 5.5 m); `raft-village-lashed` (`deep-dive` on 1.03 m) takes a `prose-rewrite` of `underwaterAccess` to `shallow-dive` |
| `ferry-stage-guide-hire`, `portage-slipway-narrows-deeps` | B5: 0.44 m / 0.27 m, under the 0.6 m canoe class | `meso-move` to the nearest cell holding 0.6 m; the lane they serve has no geometry, so this cannot be resolved before `compile_minor_routes` runs |
| `air-pocket-station-deeps` | two live depth numbers (1.6 vs 7.75) at one dot | no siting remedy — a measurement reconciliation (§"decision" 1) |
| `route.boat.deeps-inner-poling-line` | 3 dangling relations, 5 `travelServiceEdges`, A8 unmeasurable | not a place remedy: the lane is `"solved": false` in `world/sources/routes/registry.json` |
| `root-node.naga-deeps` | placeholder outside the Naga-Kur culture mask, 56.5 m from a `mercantile-coast` village | `pin-by-siting` the node to `dead-water-village` (the lore's rootway terminus, 854.3 m) once that record is sited |
