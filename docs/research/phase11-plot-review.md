# Phase 11 Part 4 — cold review of the plotted province

Fresh-eyes review of the Part 3 macro plot (527 plotted records, seed 1103),
read as a player would read it. No catalogue or code was changed. Every finding
names the records involved and a mechanical fix: a `sitingPrefs` change, a
scoring weight or gate in `tooling/world-generation/worldgen/macro_plot.py`, or
a status change. Nothing here is "move the dot".

Method: measurements over `world/sources/catalogue/places-*.json` positions plus
`worldgen.site_fields.ProvinceSurvey` (routes, line of sight, anchors); one look
at `output/macro-plot/plot.png`. **Caveat:** the Part 3b minor-route network
(`routes-minor.json`) landed while this review was being written; every
"distance to a route" figure below is against the nine major roads and seven
boat lanes only. Findings 4 and 7 should be re-measured against the minor
network before acting on them — it may already soften the dead stretches.

**Verdict.** The plot is honest, complete and mostly well behaved: danger rises
with distance from the road as it should, water-bound places really are at
water, no template dominates a zone, and no class repeats more than three times
in a row on any route. Two things stop it reading like Morrowind: **named
relationships between places are not enforced**, so several of the most
memorable pairings in the catalogue are kilometres apart; and **density is
almost flat**, so the province reads as one evenly seeded blanket rather than
hinterlands and wilds. Those two are findings 1 and 4 and are worth more than
everything else combined.

---

## 1. Named place-to-place constraints are ignored (severity: highest)

`HINT_PATTERNS` in `macro_plot.py` turns "within sight of X", "visible from its
square", "above Glenbridge" into the generic `commanding` hint, which only
rewards a candidate's raw visibility score. It never looks at where X actually
is. The `parent` term is a soft bonus over a 150-1600 m band, and it only fires
if the parent happens to be plotted already, which tier-then-score ordering does
not guarantee. Result (straight-line distance, and `ProvinceSurvey.line_of_sight`):

| record | its own hard constraint | actual |
|---|---|---|
| `place.dunmer-north.wolk-market` | "within sight of `place.dunmer-north.ten-maur-wolk`" | **4,322 m apart, no line of sight** |
| `place.dunmer-north.mazzatun-hist` ("an enslaved Hist", the thing Mazzatun is about) | belongs to `place.dunmer-north.mazzatun` | **3,495 m apart, no LOS** |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | "above Glenbridge, visible from its square"; Glenbridge in turn says "within sight of the sermon xanmeer" | **1,586 m apart, no LOS** |
| `place.imperial-fringe.castle-giovesse` | "within sight of Gideon's north gate" | **1,384 m from Gideon, no LOS** |
| `place.hist-heartland.rootworm-station-helstrom` | Helstrom's rootworm station | **1,546 m from Helstrom** (Gideon's is 233 m, Archon's 242 m) |
| `place.saxhleel-coast.archon-harbour-hist` | "inside the settlement clearance mask" | 499 m from Archon, outside any plausible mask |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | "within 2 km of Archon", "no sightline from any route" | 620 m, fine, but 418 m from a route with no LOS test run |

**Fix.** Three changes to `macro_plot.py`: (a) a `sightline_to` hint that
captures the *referenced id* out of the constraint prose and out of
`relations.visibleFrom`, enforced as a **hard gate** (`S.line_of_sight` must be
true) rather than a visibility bonus; (b) a `bound_to` hint for
"inside / above / part of / off the city's bank", a hard gate at <=250 m of the
named parent; (c) plot **order** by dependency topological sort within each
tier, so a record that names another is always plotted after it. Today
`wolk-market` and `ten-maur-wolk` are both tier 1 and the score decides which
goes first; when the market wins, the parent term is simply absent.

Two constraints have no landform to satisfy them: `bogmother` asks for "at the
end of a stone causeway" and got a **summit**; `blackrose-prison` asks for
"isolated and defensible" and got `flood-high` 1,024 m from Blackrose. Either
add the missing landform class to `sitingPrefs` as an authored Part 6
requirement, or drop the constraint.

## 2. Relations point at nothing, or at things far away

963 `reachedVia`/`dependsOn` edges between plotted records: **median 1,170 m,
57 % over 1 km, 225 over 2 km** on a province only ~7 km across. Worst:
`chainbreaker-shelter` -> `the-freed-rows` **8,148 m**;
`rose-supply-town` -> `thorn` 6,570 m; `prison-born-refuge` -> `hissmir` 6,335 m;
`crystalgate` -> `silyanorn-diggings` 5,725 m. A supply town six kilometres from
the thing it supplies is not a supply town.

Separately, **194 edges dangle**: 134 point at records that are `deferred` or
`cut` (so they are not in the world at all), 50 at route ids
(`route.blackwood-road`, `road:archon-gideon`) that are not catalogue records,
and 10 at free prose ("coast road", "Oliis Bay", "the three rivers").

**Fix.** Make `dependsOn`/`supplies` a soft distance penalty in `site_score` for
every already-plotted relation, not just the `parents` set (subtract
`0.5 * _band(dmin, 0, 800, 2500)`; today only `d.parents` counts). Add a report
validator listing every plotted record whose `dependsOn` target is
`deferred`/`cut`, so each is either promoted or deleted. And split `reachedVia`
into `reachedVia` (place ids) and `reachedViaRoute` (route ids matched against
`ProvinceSurvey.routes`), failing the build on an unmatched id; the ten prose
entries become route ids or move to `why`.

## 3. Density is almost flat — the province reads as one blanket

The report claims density follows the civilisation gradient. It barely does.
Median nearest-neighbour distance:

| by distance from the nearest city | median nn | | by danger tier | median nn |
|---|---|---|---|---|
| 0-400 m | 138 m | | D0 | 131 m |
| 400-800 m | 157 m | | D2 | 159 m |
| 800-1200 m | 171 m | | D3 | 167 m |
| 1200-2000 m | 184 m | | D5 | 191 m |

That is a **1.33x spread from a city gate to the deep wild**, i.e. under 1.8x in
area density. Per-zone medians are 154-196 m for all eight zones. The picture
confirms it: dots are laid at almost the same pitch over the rim mountains, the
western uplands and Gideon's hinterland alike. Morrowind's contrast between the
Ascadian Isles and the Molag Amur is nearer 10x. The emptiness the plan asked
for ("a D5 interior that suddenly has no camps is telling you something") does
not exist anywhere on this map.

**Fix.** In `macro_plot.py`:
- The `hinterland` term is `0.25 * _band(c.anchor_m, 0, 1800, 2500)` and only
  applies to `tier >= 3, danger <= 3`. Raise the weight to ~0.8 and apply it to
  all tier >= 2 fill.
- Make `Demand.separation` a **function of the candidate's danger band and
  anchor distance**, not of magnitude alone: multiply the required separation by
  roughly `1.0` inside 600 m of an anchor rising to `2.5` beyond 1.5 km and in
  danger band >= 4. Today separation is fixed per magnitude (M5 800 / M4 450 /
  M3 300 / M2 220 / M1 150 m) and so is uniform across the map.
- Consider cutting the fill quota rather than spreading it: 527 live records on
  roughly 50 km² of authored land is ~10 per km² everywhere. Deliberately
  leaving 3-4 genuinely empty pockets of >800 m radius would buy more than any
  amount of extra variety.

## 4. Boat lanes are dead, and two of them are redundant

Stops within 300 m of the line, per route:

| route | km | stops/km | longest gap |
|---|---|---|---|
| `road:thorn-tear-road` | 1.13 | **21.2** | 144 m |
| `boat:stormhold-alten-corimont` | 2.33 | 19.7 | 204 m |
| `road:stormhold-thorn` | 5.72 | 16.9 | 265 m |
| `road:helstrom-blackrose` | 5.08 | 7.1 | **1,178 m** |
| `boat:lilmoth-archon` | 2.59 | 5.8 | 566 m |
| `boat:soulrest-lilmoth` | 4.05 | **4.2** | **1,317 m** |

A five-times spread in how often anything happens, and the plot's own
`routeVisibility.deadSamples` are dominated by `boat:soulrest-lilmoth` (9 of the
22 dead samples) and `boat:lilmoth-archon`. A 1.3 km stretch of open water with
nothing in sight is the single most boring thing on this map.

Worse, **`road:alten-corimont-stormhold` and `boat:stormhold-alten-corimont`
share 45 of their 49 stops**, and `road:blackrose-lilmoth`/`boat:blackrose-lilmoth`
share 12 of 15. Taking the boat between those pairs shows the player exactly
what the road showed them, so the boat is a reskin rather than an alternative.

**Fix.**
- The `fine-tempo` route term (`1.0 * _band(c.route_m, 0, 260, 260)`) treats all
  routes alike. Weight it by the **route's current stop deficit**: compute stops
  per km per route before the fill tiers and boost candidates near
  under-served routes, cap candidates near over-served ones. Target roughly
  8-12 stops/km on roads and 5-8 on boat lanes (boat travel is faster).
- Add a **corridor-exclusivity term**: penalise a candidate whose nearest route
  is within 300 m of *two* routes at once. That naturally pushes places off the
  duplicated Stormhold-Alten Corimont and Blackrose-Lilmoth corridors and onto
  the starved ones.
- Distinct water-only beats (wrecks, reefs, tide-runs, drifting villages) should
  get `landformClasses` that only exist on the boat lanes, so they cannot be
  satisfied by roadside strand points.

## 5. Same type twice in a short stretch of the same route

The anti-sameyness quota checks per-zone share and a 300 m same-type minimum,
both of which pass. Neither catches a repeat along the *route*, which is what
the player experiences. 22 cases; the worst:

- `road:helstrom-blackrose`: **three `root-hollow-gallery` in 1.3 km**.
- `road:stormhold-thorn`: `root-hollow-gallery` twice (294 m apart), again later;
  `walkway-junction` twice in 355 m; `hist-village` twice in 214 m
  (`hutan-tzel`/`murkwater`).
- `boat:archon-thorn`: `hist-village` twice, **68 m of lane apart**
  (`sleeping-in-the-ring`, `greylight-village`).
- `road:thorn-tear-road`: `causeway` twice in 179 m.

**Fix.** Add a `route_repeat_ok` gate alongside `separation_ok`: reject a
candidate if a record of the same `classification.type` already sits within
900 m of *route distance* along the same route, measured on the projected
arc-length rather than straight-line. This is the plan's "never a straight line
of identical beats" rule, currently unimplemented.

## 6. Marsh and floodplain types landed on the rim

42 records sit in `border mountains`; about fourteen are marsh types that fell
through to the rim and never asked for mountains at all:
`keeps-the-second-island` (hammock-village), `one-house-high`,
`sits-above-the-flood`, `the-gravel-six` (flood-high-hamlet),
`dreams-by-the-ash`, `the-diggings-ladder` and `ladder-to-the-light`
(platform-ladder-tower), `the-shut-village`, `bog-iron-workings`,
`lower-onkobra-paddies` (paddy-works), `reedcutters-toll` (toll-bridge),
`slough-point-quarantine-shed`, `the-old-quarters`, `the-road-nisswo-house`.
A hammock village on a mountain and rice paddies on the rim are the clearest
"this was generated" tells on the map. Related: `channel-cross-village` and
`reedmoor-stilts` are stilt villages in `upland hills`, 111 m and 106 m from
water; `ties-four-ways`, a walkway junction, is 139 m from water.

Province-wide, **65 of 527 records got a region class outside their
`sitingPrefs.regionClasses`** (31 in dunmer-north) and **76 a landform outside
their `landformClasses`**.

**Fix.** The `region` term is currently a soft score component. Make a wished
region class a **hard gate for `classification.class in {settlement, works,
transit}`** and only a soft preference for lairs, ruins and lone sites, whose
prose often justifies odd ground. Records that then cannot be placed go to the
homeless batch honestly, where the existing four-stage relaxation and the
"transform into a related type that fits the ground" step can deal with them.
The mountain rim's 42 slots should be filled by the ~20 records that genuinely
ask for `border mountains` (pass stations, snowline hermitages, smugglers'
ledges, the border post, veterans' holdings, terrace villages) and left thinner
otherwise, which also serves finding 3.

## 7. Danger legibility is good, with one region-shaped exception

The gradient works: median distance to a route rises D0 0 m, D1 82, D2 148,
D3 218, D4 283, D5 358. Only 7 D0/D1 records sit beyond 600 m of a route.

The exception is `hist-heartland`: **22 of the 28 D4/D5 records within 150 m of
a route are in it** (`lost-city` D5 at 88 m, `sealed-xanmeer-living` D5 at 23 m,
`wisp-lure-basin` D5 at 20 m, `root-gallery-deep-throat` D5 at 24 m,
`hist-paatru-lowcrown` D4 at 11 m, `climbable-ruin-roof-terrace` D4 at 11 m).
Walking the Helstrom roads means passing lethal ground every couple of hundred
metres, which flattens the danger signal exactly where the plan wanted the
heartland to feel like a threshold you cross deliberately.

**Fix.** Strengthen the existing `remote` term for `danger >= 4` from
`0.35 * min(1, route_m/500)` to `0.6 * min(1, route_m/700)`, and add a hard
minimum of 200 m from any route for D5 records unless `hints["on_route"]` is
set. Records that fail should be re-tried, not force-fitted.

Two related `sitingPrefs` mismatches to fix in the catalogue rather than the
code: `place.imperial-fringe.cartwrights-cross` is a **toll-road-town** 656 m
from any road and `place.imperial-fringe.ninth-milestone-house` is a
**milestone house** 832 m from any road. Both need `hardConstraints` wording the
`on_route` pattern actually matches (it looks for "on the road", "astride",
"at a crossing"); "a milestone house" does not match anything.

## 8. Culture reads as one culture

Taking each record's eight nearest neighbours, the share sharing its `culture`:
argonian 0.87 (452 records), **imperial 0.17 (43), mixed 0.09 (12), lost-peoples
0.04 (7), dunmer 0.02 (11), khajiit 0.06 (2)**. The `imperial-fringe` *zone* is
95 % internally coherent, but the imperial *places* inside it are single dots in
an Argonian sea; the eleven Dunmer places in `dunmer-north` are scattered so
thoroughly that a Dunmer place has essentially no Dunmer neighbour. A player
walking the Blackwood Road will not experience an imperial frontier, only
occasional imperial buildings.

**Fix.** Add a `culture` term to `site_score`: `0.35 * (share of plotted records
within 500 m sharing d.culture)`, evaluated against the running plot. Because
tier order plots the cities first, this makes the minority cultures cluster
around their own anchors (Gideon, Fort Swampmoth, Thorn, Stormhold) instead of
diffusing. This is the single cheapest change with a large effect on how the
province reads.

## 9. Smaller notes

- **The three "submerged" records are beside water, not under it.**
  `lake-submerged-xanmeer`, `blackrose-drowned-hist` and `ixtaxh-xanmeer` all
  landed on `islet` at 0 m from water. The `submerged` hint accepts
  `depth_m > 0.8 **or** water_m <= 8`; the `or` lets a dry islet satisfy it.
  Make it `depth_m > 0.8` only for records whose constraint says "fully
  submerged", and add `underwaterAccess` to the gate.
- **Tier-1 destinations placed too far to be found:** `ixtaxh-xanmeer` 846 m
  from any route, `orma-tactile-ruin` 967 m, `the-stone-talkers-watch` 1,018 m
  (`rockgrove` at 1,190 m is a concealed camp and correct). Give
  `destination`-layer tier-0/1 records a route term peaking at 300-600 m rather
  than the current 900-1200 m band.
- **`stone-calendar-hist-tsoko`** is 412 m from its own `pilgrim-camp-hist-tsoko`
  and 685 m from a road, with no neighbour inside 400 m. A stone calendar that
  nobody can find is a wasted landmark; the pilgrim camp should be gated to
  <=200 m of it (finding 1's `bound_to`).
- **The homeless batch reporting is too clean.** "0 unresolved" is reported, but
  9 records went in at a lowered score bar and 5 in a neighbouring zone, and
  those 14 are not named in `macro-plot.md`. List them by id.

---

## The 3-6 decisions that would most change the result (for the owner)

Ranked. Each is a design call, not a bug.

1. **Should the province be emptier?** Right now something happens roughly every
   160 m everywhere. Making the wilds genuinely sparse would mean cutting or
   deferring perhaps 60-100 of the 527 places, or clustering them much harder.
   It is the difference between "always something to see" and "the marsh is big
   and the road is a relief". Morrowind chose the latter. (Finding 3.)
2. **Should minority cultures cluster?** Concentrating the Dunmer and Imperial
   places into two or three recognisable enclaves would make the north and the
   Blackwood Road read as frontiers, at the cost of the rest of the province
   being purely Argonian. (Finding 8.)
3. **Are the boat lanes meant to be a second way to see the same places, or a
   different journey?** If different, some places must be moved off the roads and
   onto water-only ground, and a few water-only beats added. (Finding 4.)
4. **Should named sightlines be hard requirements?** Enforcing "within sight of"
   will move a handful of significant places (Wolk Market, Castle Giovesse, the
   sermon xanmeer, Mazzatun's Hist) to worse ground in order to honour the
   relationship. Ground quality versus storytelling. (Finding 1.)
5. **What happens to the 272 deferred records?** 134 live records depend on one.
   Either promote the ones that are depended upon, or prune the edges; leaving
   them is the sort of thing that quietly breaks quests later. (Finding 2.)

## Mechanical fixes (for the plot agent)

In rough order of value per unit of work, all in
`tooling/world-generation/worldgen/macro_plot.py` unless stated:

1. `sightline_to` and `bound_to` hints that resolve the *named id*, enforced as
   hard gates; dependency-ordered plotting within a tier. (1)
2. `culture` proximity term, weight ~0.35. (8)
3. `route_repeat_ok` gate: same type within 900 m of route arc-length. (5)
4. Danger/anchor-scaled `separation`, and `hinterland` weight 0.25 -> 0.8 on all
   tier >= 2 fill. (3)
5. Per-route stop-deficit weighting plus a corridor-exclusivity penalty. (4)
6. Region class a hard gate for settlement/works/transit classes. (6)
7. D5 hard minimum 200 m from a route; `remote` weight 0.35 -> 0.6. (7)
8. `submerged` gate: require depth, not "depth or near water". (9)
9. Split `reachedVia` into place ids and route ids; validate both; report every
   `dependsOn` pointing at a deferred or cut record. Catalogue edits, validated
   by the plot report. (2)
10. Name the 14 relaxed/relocated records in `macro-plot.md` rather than
    reporting only counts. (9)
11. Catalogue `sitingPrefs` edits: `cartwrights-cross`, `ninth-milestone-house`
    (on-route wording), `bogmother` (causeway), `blackrose-prison`
    (defensible), the three `submerged` records. (1, 7, 9)
