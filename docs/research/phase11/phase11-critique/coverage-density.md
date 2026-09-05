# Phase 11 catalogue critique — coverage, density and distribution

**Date:** 2026-09-02 · **Critic:** adversarial, dimension = coverage/density/distribution ·
**Scope:** the 729 records in `world/sources/catalogue/places-*.json` against the
module 95 Phase 11 density budget, decision 0041 and
[morrowind-content-density.md](../../placement-settlements/morrowind-content-density.md).
**Read-only pass** — nothing outside this file was touched.

**Verdict: PASS WITH FIXES.** The catalogue is the right *shape* (magnitude
ladder, three discovery layers, D4–D5 landmark-heavy/quest-light) and the
≤300 m route rule is structurally satisfiable. But the province total is
**above the real budget ceiling**, and the *distribution between regions* is
inverted relative to land area: four small coastal zones are 2.5–4.2× over
their budget while the two largest, safest, most-travelled zones are 9–39 %
under. That is a re-allocation job at Part 3, and it is cheap now.

## Method — how the numbers were derived

Areas come from the published province rasters (1345², `cellKm2` =
3.0069e-5 km², `apps/world-studio/public/province/`):

- **Land mask** = `hydro-regions.png` minus ocean (alpha 0), lake
  (`70,140,215`) and deep river corridor (`70,130,200`). Raw = 34.52 km²;
  normalised by ×0.971 to the scour's authored-land figure of **33.52 km²**
  (`world/sources/sites/candidate-sites.json#authoredLand`).
- **Danger bands** from `soc-danger.png`, **culture zones** from
  `soc-cultures.png`, both against `society-meta.json`'s legends.
- The published `dangerBandFractions` / `cultureFractions` in
  `society-meta.json` are **fractions of the whole 54.40 km² bounding square,
  including 16.5 km² of open sea** — using them directly as land shares (as
  0041's sizing implicitly does) is the source of finding 1. All figures below
  are recomputed land-only.
- 1.65 km² of land falls in no culture zone ("hinterland"); it was assigned to
  the nearest zone by Euclidean distance transform. This changes every
  regional budget by <8 % and no conclusion.

**Land by danger band** (of 33.52 km²): D1 0.22 · D2 3.60 · D3 16.77 ·
D4 6.79 · D5 5.14 · unclassified 1.00.
**D0–D3 = 20.59 km² · D4–D5 = 11.93 km².**

**Positions do not exist yet.** Every spatial rule (≤300 m from route,
Poisson spacing, "no two same-template in sight of each other", the causal
density *shape* within a region) can only be checked **structurally** here —
does the catalogue carry enough records with route-adjacent intent, enough
landmark-grade entries, etc. Where that is what I did, I say so. I have not
faked a spatial check.

---

## Findings, ranked by severity

### S1 — The province is 22 % over the real density ceiling; 0041's "600–740" sizing dropped the D4–D5 discount. **(critical)**

Module 95 binds **18–22/km² in D0–D3** and **8–12/km² in D4–D5**. Applied to
the measured land split:

| | land km² | rate | budget |
|---|---|---|---|
| D0–D3 | 20.59 | 18–22 | 371–453 |
| D4–D5 | 11.93 | 8–12 | 95–143 |
| **Province** | **32.52** (+1.0 unclassified) | | **466–596** |

The catalogue holds **729 records — 122 % of the ceiling, 156 % of the floor.**

0041 Part 2 sized the phase at "~600–740 records" from `33.52 × 18–22`, then
noted the D4–D5 rate would pull it "lower" without ever computing it. It is
not a small pull: **36 % of authored land is band 4–5**, so the honest
envelope is 466–596, and 729 sits outside it. Checked the other way, using
each record's *self-declared* `dangerTier` against the measured land:

- D0–D3: **581 records / 20.59 km² = 28.2 per km²** (budget 18–22, **+28 %**)
- D4–D5: 148 records / 11.93 km² = 12.4 per km² (budget 8–12, marginal)

The whole over-run is in the settled band. (Caveat: declared tier need not
match the raster band at the position a record eventually gets; the
comparison is the best available before Part 3.)

**Fix:** correct the sizing arithmetic in 0041 Part 2 and
`candidate-sites.md` §authoredLand to **466–596**, then absorb ~135–260
records at Part 3 by demoting the surplus to `recordScope: dressing`
sub-records of a nearby parent rather than cutting IDs (0041 forbids
deletion — flip `status`/scope, don't vanish).

### S2 — Regional distribution is inverted: the four small coastal zones hold 50 % of the catalogue on 18 % of the land. **(critical)**

Per-zone land, budget and actual (nearest-zone allocation, D0–D3 and D4–D5
rates applied per zone):

| region | land km² | D0–D3 | D4–D5 | budget | records | ×ceiling | density |
|---|---|---|---|---|---|---|---|
| pirate-freeholds | 0.78 | 0.76 | 0.02 | 14–17 | 53 | **3.1×** | 68.4/km² |
| imperial-penal-south | 1.06 | 0.94 | 0.03 | 17–21 | 70 | **3.3×** | 66.3/km² |
| saxhleel-coast | 1.81 | 0.63 | 0.81 | 18–24 | 99 | **4.2×** | 54.6/km² |
| mercantile-coast | 3.15 | 2.17 | 0.72 | 45–56 | 140 | **2.5×** | 44.4/km² |
| naga-kur-deeps | 2.51 | 0.22 | 2.29 | 22–32 | 65 | 2.0× | 25.9/km² |
| hist-heartland | 9.25 | 2.12 | 6.97 | 94–130 | 110 | 0.85× | 11.9/km² |
| imperial-fringe | 7.11 | 6.19 | 0.93 | 119–147 | 108 | **0.73×** | 15.2/km² |
| dunmer-north | 7.85 | 7.57 | 0.18 | 138–169 | 84 | **0.50×** | 10.7/km² |

Only **hist-heartland** lands inside its budget. The two largest zones —
`dunmer-north` and `imperial-fringe`, 14.96 km² (**45 % of authored land**),
almost entirely D0–D3 and therefore the zones the 18–22 rate applies most
strongly to — are short **~54 and ~11 records**. `dunmer-north` at 10.7/km²
is running at *half* the fine-tempo floor across 7.57 km² of band-1–3 ground:
that is a player walking the north trunk road with nothing to stop at.

The counter-argument is 0041's non-uniform causal gradient — density should be
thick on coasts, thin in the deep wild. It does not survive here: the gradient
is meant to shape density *within* a region around its civilisation, while
"18–22/km²" is explicitly the **region average**. A coastal zone at 68/km² is
not a gradient, it is three times the fine-tempo rate everywhere in it; and
`dunmer-north` is not deep wild — it is 96 % D1–D3 settled/travelled ground.

The mechanism is visible in the reconciliation table: the eight derivation
agents produced 53–140 records each, i.e. **counts converged on "about a
hundred per agent" rather than on their zone's area.** `pirate-freeholds`
(0.78 km²) got 53 records; `dunmer-north` (7.85 km², ten times the land) got
84.

**Fix:** rebalance at Part 3 against the table above — move ~120 of the
coastal surplus into `dunmer-north`/`imperial-fringe` by retyping (most
coastal surplus types have inland analogues in `type-recipes.json`), and
demote the rest to dressing; re-run this table as a Part 4 validator so the
budget is checked per zone, not per province.

### S3 — Band discipline distorts *variety*, not just counts: the surplus is generic furniture, the shortfall is the distinctive types. **(major)**

Recomputed against `type-recipes.json` `countBand` over the 236 `poi`-scope
recipes: **68 types over band, 49 under, 119 in band. Total surplus +103,
total shortfall −64, net +39.** Band sum 637–739; catalogue total 729.

The reconciliation record treats this as an accounting problem. It is worse
than that — the two lists are not random samples of the taxonomy:

- **Over-band (surplus) = cheap, repeatable narrative furniture**:
  `mass-grave-memorial` 8/4, `hist-less-refuge` 6/2,
  `bone-repatriation-waystation` 6/2, `sealed-xanmeer` 7/4,
  `submerged-xanmeer` 6/3, `wreck` 9/6, `hermit-hut` 9/6, `ferry-stage` 9/6,
  `harmed-hist` 5/2, `owing-eviction-camp` 5/2, `salvage-divers-yard` 7/5.
- **Under-band (shortfall) = the varied, vertical and traversal-interesting
  types**: `gorge-wall-dwelling` 1/3, `hammock-village` 2/4,
  `upland-terrace-village` 2/4, `platform-ladder-tower` 2/4,
  `climbable-ruin-roof` 2/4, `air-pocket-grotto` 2/4, `bird-colony` 2/4,
  `keepers-lodge` 2/4, `prospectors-camp` 1/3, `failed-roadworks` 2/4.

Those under-produced types are precisely the ones the game's climbing,
swimming and vertical-traversal systems exist for, and the ones that would
have made the interior interesting. Meanwhile **36–60 % of every region's
records are instances of an over-band type** (naga-kur-deeps 60 %,
mercantile-coast 53 %, imperial-penal-south 49 %, hist-heartland 48 %) — the
anti-sameyness quota in 0041 Part 3 ("no template >25 % of instances in a
region") is measured per template, but the aggregate signal is that half the
catalogue is drawn from the over-claimed third of the taxonomy.

**Fix:** pay the S1/S2 over-run *out of the over-band types first* (retype
the 103 surplus into the 64-record shortfall — it very nearly balances), which
fixes counts and variety in one move.

### S4 — Quest-carrying capacity is asserted, not evidenced: 93 % of M3 and 58 % of M4 settlements carry zero quest hooks. **(major)**

Against the module 95 ladder (M5 35–60 quests, M4 10–20, M3 3–8, M2 1–3,
M1 0–2):

| mag | settlements | provisions total | mean | zero-hook | zero-socket |
|---|---|---|---|---|---|
| M5 | 8 | 36 | 4.50 | 0 % | 0 |
| M4 | 12 | 14 | 1.17 | **58 %** | 1 |
| M3 | 74 | 11 | 0.15 | **93 %** | **46/74** |
| M2 | 78 | 42 | 0.54 | 77 % | 34/78 |
| M1 | 377 | 71 | 0.19 | 91 % | 142/377 |

The ladder *shape* is healthy — 8 M5, 12 M4, 74 M3, 78 M2 matches the
research doc's cross-check (8×M5, ~6 M4, ~40 M3) with room to spare, and
`questHooks.provisions` is by design "provisions the quest plan has requested"
rather than "quests here", so low counts are not automatically a defect.

The defect is that nothing in the catalogue yet *demonstrates* the capacity.
The eight M5s carry **5.1 sockets each** (scene/evidence/station/marks) against
a 35–60-quest budget, and the M4 tier — the towns that must carry 10–20 each,
120–240 quests province-wide — averages 3.4 sockets and 1.2 provisions, with
**seven of twelve M4s (Crystalgate, Tenmar Wall, Field Gate, Fig Market,
Swampmoth Town, Vaunting, Threewater) carrying no provision and no tier
ownership at all.** Forty-six of the 74 M3 villages carry no socket of any
kind, so a later quest agent has no anchor to attach to.

**Fix:** before Part 3 review, require every M4+ to declare a socket count
proportional to its magnitude budget (rough rule: ≥1 socket per 4 budgeted
quests) and give the seven empty M4s a tier-ownership and at least one
provision each; make it a validator, not a review note.

### S5 — 198 records claim `discovery: sightline` in a province the scour says has almost no sightlines. **(major)**

27 % of all records (5.9/km²) are discoverable by being *seen*. Per region:

| region | sightline | per km² |
|---|---|---|
| imperial-penal-south | 23 | **21.8** |
| saxhleel-coast | 38 | **20.9** |
| mercantile-coast | 45 | **14.3** |
| pirate-freeholds | 10 | 12.9 |
| naga-kur-deeps | 14 | 5.6 |
| hist-heartland | 27 | 2.9 |
| imperial-fringe | 20 | 2.8 |
| dunmer-north | 21 | 2.7 |

The Part 0 scour finding (0041, "Scour findings that bind Parts 1/3") is that
the **median site sees 18 % of its 1.2 km surroundings and nothing 12 m tall
reads at 1.4 km below the mountain rim**, and the enrichment pass respected
that by leaving `visibleFrom` empty for all but one pair. A sightline-
discoverable place every ~215 m of ground in the southern coastal zones
contradicts the same finding the catalogue elsewhere honours. The interior
zones' 2.7–2.9/km² is the credible number; the coasts are three zones where
"I could not think how else you'd find it" has been written as `sightline`.

**Fix:** cap `discovery: sightline` at ~3/km² per region and re-point the
excess at `rumour`/`road`/`none`, or justify each coastal sightline claim
against a tall-or-close silhouette in `vibe.approach` — a Part 3 visibility-
raster check, not a hand wave.

### S6 — Two POI types have zero records; both are the same missing thing (seasonal, communal, non-fixed places). **(moderate)**

`festival-ground` (band 4, 0 records) and `dry-season-herd-ground` (band 3,
0 records) — 7 of the 64-record shortfall. They are the only two of 236 `poi`
recipes with no instance, and they are not arbitrary: both are **seasonal,
communal, unbuilt** places — ground that matters at one time of year and is
empty otherwise. The catalogue has only 15 `status: seasonal` records of 729
(2 %), so this is a family-shaped hole, not two orphan rows. Argonia's whole
climate premise is a wet/dry cycle; a province with no dry-season herd ground
and no festival ground has no calendar.

**Fix:** author the 7 records (4 festival-ground, 3 dry-season-herd-ground) in
the four zones with the most `seasonal floodplain` land, and while doing so
audit whether `status: seasonal` should be higher than 2 % province-wide.

### S7 — The three-layer split holds province-wide but not per region. **(moderate)**

Using `importanceTier` as the layer proxy (no explicit layer field exists —
see S9):

| layer | proxy | records | per km² | reference |
|---|---|---|---|---|
| landmark/destination | tier 0–1 | 97 | **2.9** | BotW shrines ~2/km² |
| destination-grade | tier 0–2 | 307 | 9.2 | — |
| fine tempo | all | 729 | 21.7 | Skyrim ~14, Vvardenfell ~18 |

The destination layer at 2.9/km² is a genuinely good number and the split is
real — this is **not** an all-fine-tempo catalogue, which was the failure mode
the brief expected. Two caveats:

- Per region it is as skewed as S2: destination-grade (tier 0–1) runs
  **13.3/km² in imperial-penal-south** and **1.55/km² in imperial-fringe** —
  a factor of 8.6. A destination every 275 m in the south is not a
  destination layer.
- **D4–D5 is correctly landmark-heavy and quest-light**: 25 % of band-4/5
  records are tier 0–1 against 10 % in D0–D3, and only 17 of 148 carry quest
  provisions. That part of the budget passes cleanly.

**Fix:** fold a per-region destination-layer floor/ceiling (say 1.5–4/km²)
into the same Part 4 validator as S2; it falls out of the S2 rebalance.

### S8 — `importanceTier` distribution is sane province-wide but one region is a clear outlier. **(minor)**

Province: T0 11 · T1 86 · T2 210 · T3 285 · T4 137 — a clean pyramid, no
region inverts it. The outlier is **imperial-fringe**, which puts 51 of 108
records (47 %) at T4 against a province mean of 19 %, and only 11 at T0–T1;
`hist-heartland` and `naga-kur-deeps` conversely put just 2 records each at
T4. Both look like per-agent scale drift rather than design (the same
signature as S2), and `importanceTier` drives Part 3's plotting order — so
drift here means the wrong things reserve ground first.

**Fix:** normalise tier by rank within region to the province pyramid before
Part 3 plots, or state per-region tier quotas in the catalogue README.

### S9 — Structural checks that PASS, recorded so they are not re-litigated. **(informational)**

- **≤300 m-from-route rule: satisfiable.** Compiled routes total 36.4 km road
  + 19.7 km boat lane = 56.2 km; one named place per 600 m of corridor needs
  **~94 route-adjacent records**. The catalogue carries **367 records (50 %)
  whose `sitingPrefs` name a road/route/lane/ferry/landing/dock/ford/crossing**
  and 243 with `discovery: road`; every one of the 729 has a `reachedVia`.
  Per region the route-intent share is 34–68 %, lowest in hist-heartland
  (34 %) and naga-kur-deeps (35 %) — which is also where the routes are, so
  Part 3 should verify those two specifically once positions exist. **This is
  a structural check only; the actual 300 m rule is unverifiable until Part 3
  plots positions.**
- **Type coverage: 234 of 236 `poi` recipes used** (S6 covers the two). The
  113 unused recipes are all `district` (58) or `dressing` (55) scope, which
  are sub-record vocabularies consumed at Phase 12 — correctly absent from a
  place catalogue, not a coverage gap.
- **No explicit density-layer field exists** on the record schema; S7's split
  had to be inferred from `importanceTier`. Adding `densityLayer:
  fine-tempo | destination | landmark` as a typed field would make the budget
  mechanically checkable forever, at the cost of one enum. Recommended before
  the schema is frozen — this is the last cheap moment.

---

## Summary table

| # | Severity | Finding | Proving number |
|---|---|---|---|
| S1 | critical | Province over the real ceiling; 0041 dropped the D4–D5 discount | 729 vs **466–596** (D0–D3 28.2/km² vs 18–22) |
| S2 | critical | Regional allocation inverted vs land area | 4 coastal zones 2.5–4.2× over on 6.8 km²; dunmer-north 84 vs 138–169 |
| S3 | major | Band surplus is furniture, shortfall is the distinctive types | +103 surplus / −64 shortfall; 36–60 % of records per region are over-band types |
| S4 | major | Quest capacity unevidenced below M5 | 93 % of M3 and 58 % of M4 zero-hook; M5 5.1 sockets vs 35–60 quests |
| S5 | major | Sightline discovery contradicts the no-long-sightlines scour finding | 21.8 and 20.9 sightline/km² in the two southern coastal zones vs 2.7 inland |
| S6 | moderate | Two zero types; a seasonal-places hole behind them | 0/4 festival-ground, 0/3 dry-season-herd-ground; 15/729 `status: seasonal` |
| S7 | moderate | Three-layer split good province-wide, 8.6× skew per region | destination layer 2.9/km² province, 13.3 vs 1.55 across regions |
| S8 | minor | `importanceTier` drift in imperial-fringe | 47 % T4 vs 19 % province mean |
| S9 | info | ≤300 m rule structurally satisfiable; type coverage fine | 367 route-intent records vs ~94 needed over 56.2 km of corridor |
