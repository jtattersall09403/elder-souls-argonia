# Place water facts vs the shipped water — diagnosis, 2026-09-09

Read-only audit. Verifies the "42 of 103 place records have no water within
~16 m" finding, establishes which water representation is authoritative, and
names the root causes. **Diagnosis only — nothing here was implemented.**

Every measurement below is against the committed catalogue and the shipped
compiled water in `apps/world-studio/public/province/water/`, read through
`worldgen.water_report.ShippedWater`, which requires a season
([0049](../../decisions/0049-water-is-measured-and-has-a-season.md)). Surface
grid 2017², **3.65568 m/pixel**; seasonal amplitude 1.40 m. **Both seasons were
measured**; where only one number is given, it is the **dry/base** season,
which is the harsher of the two and the one a berth or a lane must satisfy.

---

## 1. The 42 figure — PARTIAL

**VERIFIED:** the candidate set is exactly **103**. Selecting every committed
record whose `plotFacts.landform == "open-water"` **or**
`plotFacts.distanceToWaterM == 0.0` yields 103 records across the eight region
files. The set is reproducible and unambiguous.

**VERIFIED with a correction:** the count of 42 is reproducible **only** at a
threshold of **0.8 m**, not "any water". Exactly 42 records have no water
**≥ 0.8 m** anywhere in a 9×9 surface-texel window (±14.6 m, the "~16 m") in
the dry season. 0.8 m is `macro_plot.SUBMERGED_MIN_DEPTH_M`.

**FALSE as worded:** "no water *at all* within ~16 m" is not 42. Measured over
the same window and season:

| criterion (dry season, ±14.6 m window) | count of 103 |
|---|---|
| no water ≥ 0.8 m | **42** |
| no water ≥ 0.3 m | 20 |
| **no standing water at all (signed depth ≤ 0)** | **14** |
| signed depth at the encoded dry floor (−3 m / −6 m) — genuinely dry ground | **8** |

At the wet season the same numbers fall to 15 / 12 / 12 / 8. So the honest
headline is: **8 records sit on unambiguously dry ground; 6 more are in a
puddle; the other 28 have water, just less than a submerged place needs.**
Applying a *submerged-place* threshold to 42 records of which most are marsh
villages, tolls and boardwalks is a category error — 0.24–0.72 m of standing
water is exactly what a marsh village is supposed to have.

### The eight genuinely dry records

Signed depth at the dot, dry season, and the distance to the nearest water
carrying 0.8 m:

| id | landform in `plotFacts` | at the dot | max ≤150 m | nearest ≥0.8 m |
|---|---|---|---|---|
| `place.dunmer-north.stormhold` | anchor | −3.00 | 1.20 | 158.3 m |
| `place.dunmer-north.ten-thousand-nests` | gorge | −3.00 | −3.00 | 240.3 m |
| `place.dunmer-north.the-shut-village` | gorge | −3.00 | 13.44 | 31.2 m |
| `place.hist-heartland.dive-shaft-xanmeer-well` | **open-water** | −3.00 | 1.92 | **69.6 m** |
| `place.hist-heartland.legendary-deep-medusa-wood` | cove | −3.00 | 3.60 | 80.4 m |
| `place.mercantile-coast.lilmoth` | anchor | −3.00 | 0.48 | 206.3 m |
| `place.mercantile-coast.mudfoot` | cove | −3.00 | 3.00 | 88.4 m |
| `place.pirate-freeholds.trunk-road-tradehouse` | **open-water** | −3.00 | 5.16 | 135.7 m |

The full 42, with per-record depth at ±14.6 m in both seasons, max within
150 m, current measured distance-to-water, coast distance and flood band, is
reproducible in about 40 s with `ShippedWater` — the script is in §7.

### The four named cases

- **Lilmoth** — max depth within 150 m of the *dot* is **0.48 m**: VERIFIED.
  But see §5.1: this is a fact about the dot, not about the city.
- **Stormhold** — **1.20 m** within 150 m: VERIFIED.
- **Alten Corimont** — **3.60 m** within 150 m, and the dot itself reads
  −0.24 m: VERIFIED. The published poling channel
  `waterway.pirate-freeholds.alten-corimont` starts 28 m south of the dot at
  1.80 m and runs 165 m at 0.48–1.92 m, typed `season: "dry"`, `dryCells: 1`.
  So the berth is not 0.0 m — it is 1.80 m, adequate for a canoe (0.6 m),
  thin for anything called a free port.
- **The Sunk Well** (`dive-shaft-xanmeer-well`) — **−3.00 m across the whole
  7×7 window**, nearest water ≥ 0.8 m at **69.6 m**, record says
  `landform: open-water`, `distanceToWaterM: 0.0`, `underwaterAccess:
  deep-dive`, `entrance: well-shaft`: VERIFIED, and the worst record in the
  set. Its hydrology raster reading at the same cell is `wetland: true`,
  `floodBand: 3`, `wetSeasonInundated: true`: the divergence claim is
  VERIFIED.

---

## 2. Which source is authoritative — the compiled signed depth

Decision [0049](../../decisions/0049-water-is-measured-and-has-a-season.md) §1
already settles this: *physical water is measured, never classified.* Anything
deciding a physical fact reads the published signed depth through
`ShippedWater`; the Phase 3 hydrology stack and `water-class.png` are
**identity and appearance** labels only. Nothing found here disturbs that.

Measured divergence, province-wide, on the 1345² hydrology grid:

| | km² |
|---|---|
| Phase 3 hydrology "water-ish" (`wetlands ∪ tidal ∪ lakes ∪ river bands ∪ flood bands`) | 10.24 |
| compiled wet, dry season | 21.33 |
| compiled wet, wet season | 25.26 |
| hydrology says water, compiled dry **in both seasons** | **5.30** |
| compiled wet, hydrology says nothing | **20.31** |

The two rasters are not offsets of each other, and the compiler is **not
draining the province**: it delivers roughly twice as much standing water as
the Phase 3 labels ever marked. The 5.30 km² of hydrology-only water is the
Phase 3 label pass being coarse and generous (its median signed depth on the
current rasters is the −3.00 m encoding floor). The Sunk Well sits in that
5.30 km².

---

## 3. Is it a coastline problem? — NO

The divergence is **uniform**, not concentrated at the sea edge. Divergent
area as a share of hydrology-labelled water, binned by distance to the
compiled sea/estuary class:

| distance to sea | hydrology water km² | divergent km² | share |
|---|---|---|---|
| 0–50 m | 2.230 | 1.323 | 59.3 % |
| 50–100 m | 0.725 | 0.304 | 41.9 % |
| 100–200 m | 1.004 | 0.480 | 47.8 % |
| 200–400 m | 1.092 | 0.518 | 47.5 % |
| 400–800 m | 1.464 | 0.687 | 46.9 % |
| 800–1600 m | 1.796 | 0.879 | 48.9 % |
| 1600–3200 m | 1.576 | 0.948 | 60.2 % |
| > 3200 m | 0.357 | 0.159 | 44.5 % |

Every band sits between 42 % and 60 %. There is no shoreline signal, and the
**`water-class.png` over-correction hypothesis is FALSE**: the class-extension
work of 2026-09-09 (`CLASS_EXT_PX` 4→5 plus `CLASS_EXT_RISE_M = 2.0`, water
handoff §5) *widened* the label band and capped it vertically; it does not
touch the signed depth at all, and the signed depth is what every measurement
here reads. Likewise the 42 spread evenly over coast distance (8/17 within
100 m, 13/29 at 1–3 km) and the eight dry records sit 203 m to 2 790 m from
the coast.

Nor is it a small registration offset: the nearest 0.8 m water for the eight
dry records is 31–240 m away, one to two orders of magnitude beyond the ~22 m
class dilation, and the bearings to it disagree (83°, 153°, 173°, 177°).

---

## 4. Lore — what these places are supposed to be

Dossiers in `world/sources/lore/` are adequate; no gap, no new dossier needed.
Era 4E 201 (decision 0002) respected — the ESO-era Alten Corimont material is
flagged as such in its own dossier.

- **Lilmoth** (`world/sources/lore/lilmoth.md`, UESP *Lore:Lilmoth*).
  "Built over **shallow water** — large ships cannot dock. They anchor out in
  the Southern Sea and lighter goods in." Ninety per cent Argonian
  architecture: wooden **stilts** and platforms "ascending from the ground to
  hover above water and marsh"; Imperial houses on the same soil **sank**. It
  sits on the southern point of Murkmire in "the **river estuary** that leads
  into Oliis Bay", with Argonian walls facing the Oliis Estuary and a **sunken
  shrine** and drowned Imperial villas.
  → **Correct is: shallow tidal water at and under the city, deep anchorage
  offshore.** Canon explicitly denies deep water at the city itself. A 3.0 m
  hull promise at the lighter quay is, if anything, generous against canon —
  the canon craft is a lighter.
- **Stormhold** (`world/sources/lore/stormhold.md`, UESP *Lore:Stormhold*).
  On the banks of "a mighty river that forms the provincial border", the river
  "practically outside the walls"; sunken marshes and "crocodile-infested
  ravines with shallow waters"; Silyanorn built on a mountainside "around a
  **waterfall** that flows down into the rest of the settlement"; the local
  **Hist tree stands in the town square, in the middle of a pond**.
  → **Correct is: a terraced city with real vertical relief above a river,
  with water inside the walls (the Hist pond) and the river close outside.**
  Not a flat marsh city, and not a dry one.
- **Alten Corimont** (`world/sources/lore/alten-corimont.md`, UESP
  *Lore:Alten Corimont*, *Online:Alten Corimont*). "A small **port town** …
  It lies **on the bank of a waterway, which provides access to the sea**."
  1E 2260 freebooters sailed with the All Flags Navy; 2E 582 it is "little
  more than a glorified tavern" with docks, Dunmeri outbuildings and a beached
  ship.
  → **Correct is: a river-bank port with a navigable channel to the sea** —
  not a sea frontage. Its dossier already records "dock implies a navigable
  channel — a Phase 3 refinement constraint (river route to its door)".
- **The Sunk Well** is authored, not canon: a xanmeer ceremonial well shaft
  "flooded through to the lower halls", `underwaterAccess: deep-dive`, whose
  own `why.pressures` says "the water is rising and the entrance ledge is
  nearly submerged". Its correct state is unambiguous: **water over the
  entrance ledge**, i.e. deep water at the dot.

---

## 5. Root cause

Four distinct causes, only one of which is the water compiler.

### 5.1 `distanceToWaterM: 0.0` on the nine capitals is a hard-coded placeholder, never a measurement

`macro_plot.assign()` builds the owner-approved anchors like this
(`tooling/world-generation/worldgen/macro_plot.py:1600`):

```python
c = Candidate(id=f"anchor.{slug}", kind="anchor", landform="anchor", x=ax, z=az,
              region=..., danger=...,
              route_m=0.0, water_m=0.0, depth_m=0.0, slope=0.0, prominence=0.0,
              visibility=0.0, concealment=0.0, water_relation=1.0, anchor_m=0.0)
measure_candidate_water(s, c)
```

`region` and `danger` are read off the rasters; `route_m`, `water_m`, `slope`
and `prominence` are literal zeros. `measure_candidate_water`
(`macro_plot.py:860`) then sets **only** `depth_m` and `navigable_depth_m` —
it never assigns `water_m`. `macro_plot.py:2167` writes
`"distanceToWaterM": round(c.water_m, 1)` straight out. So all nine anchors
ship `distanceToRouteM: 0.0, distanceToWaterM: 0.0`. Measured today:

| anchor | committed `distanceToWaterM` | **measured** | signed depth at dot | max ≤150 m | ground m |
|---|---|---|---|---|---|
| helstrom | 0.0 | **0.0** ✓ | 0.84 | 3.84 | −0.48 |
| gideon | 0.0 | 5.5 | −1.68 | 4.56 | 54.33 |
| blackrose | 0.0 | 12.3 | −1.32 | 5.64 | 1.30 |
| thorn | 0.0 | 16.5 | −1.44 | 1.44 | 37.14 |
| archon | 0.0 | 21.9 | −1.20 | 18.00 | 1.18 |
| alten-corimont | 0.0 | 27.4 | −6.00 | 3.60 | 8.24 |
| soulrest | 0.0 | 50.6 | −3.00 | 2.52 | 5.75 |
| **lilmoth** | 0.0 | **107.7** | −3.00 | 0.48 | 15.57 |
| **stormhold** | 0.0 | **109.7** | −3.00 | 1.20 | 32.31 |

One of nine is right, and it is right by coincidence. (The route placeholder
is nearly harmless — eight of nine really do sit on the road network.)

**This is a stale/placeholder *record*, not drained water.** Lilmoth's own
blueprint proves it: `world/sources/blueprints/place.mercantile-coast.lilmoth.json`
chooses `candidate.lilmoth.east-face` at [3660, 6372], 55 m east of the
anchor, and its `why` reads the ground correctly — "a 22.5° bluff, a 7.4 m
bench …, a tidal flat at 1.3–1.5 m …, then 1.0 m of water at 3880, 3.8 m at
3920 and a 6.6 m roadstead plateau" — citing *Lore:Lilmoth* for the lighter
economy. Measured on the shipped rasters **today**, Lilmoth's three docks
stand in:

| dock | position m | signed depth at berth |
|---|---|---|
| `dock.lilmoth.lighter-quay` | 3902, 6368 | **3.84 m** |
| `dock.lilmoth.diving-stair` | 3853, 6404 | 3.24 m |
| `dock.lilmoth.roadstead-tender` | 3990, 6368 | 9.60 m |

**So "a seaport with half a metre of water" is FALSE.** Lilmoth's lighter quay
meets its 3.0 m hull promise on the shipped water, and the roadstead has
9.6 m. What is true is that the catalogue *dot* — the owner-approved Phase 2
anchor — is 292 m west of the quay on the promontory crest at 15.57 m
elevation, and its `plotFacts` claim it is in the water. The
[water handoff](../rendering/water-handoff.md) row that reads "Lilmoth's
lighter quay falls to 1.20 m / 0.84 m" is about the **lane approach** to the
quay, not the berth, and predates `dock_dredge`.

### 5.2 A stale fact is copied forward on every re-plot

`macro_plot.committed_candidate()` (`macro_plot.py:1409`) seeds the solve from
the committed record and takes `water_m` **from the record's own
`plotFacts`**, falling back to the raster only when the key is absent:

```python
wm = float(facts.get("distanceToWaterM", s.dist_to_water_m[row, col]))
```

So once a placeholder or a pre-carve number is committed, no amount of
re-plotting re-measures it. `apply_sitings.pin()` has the same shape but is
correct — it calls `pinned_candidate()`, which *does* read
`s.dist_to_water_m` at the pinned cell.

### 5.3 The semantic audit checks the record against itself

`audit_place_semantics.check_water()` (line 556) reads
`water_m = float(facts.get("distanceToWaterM", 0.0))` from the record's own
`plotFacts` and compares the record's *prose* to it. Lilmoth's prose matches
`BANK_CLAIM` on "quay", "harbour", "anchorage", "stilt" — and passes, because
the record says it is 0 m from water. The shipped `semantic-audit.json` names
19 water findings and **none of them is Lilmoth, Stormhold, Alten Corimont or
the Sunk Well**. A check that reads the field it is supposed to be checking
cannot fail on its own defect (cf. decision 0047's two rewritten gates).

### 5.4 The typed dive-depth check has never fired

Same function, line 587:

```python
needs_depth = ua in {"dive-entry", "flooded-interior", "submerged", "dive"} \
    or entrance in {"underwater-entry", "flooded"}
```

The catalogue's actual `underwaterAccess` vocabulary is
`{none, surface-swim, shallow-dive, deep-dive, argonian-only-depth}`. **Not
one of the four names in that set exists in the data.** 180 records carry a
typed dive claim and the `underwaterAccess` half of the check has never
matched any of them; only the `entrance in {"underwater-entry", "flooded"}`
half and the prose regex ever fire. Measured now, **20 of the 180** have less
than `UNDERWATER_MIN_DEPTH_M` (1.5 m) within 150 m, worst
`ten-thousand-nests` (−3.00), `the-stormhold-falls-chamber` (−3.00, typed
`shallow-dive`), `root-gallery-kept-light` (−1.68).

The Sunk Well would still slip through even with the vocabulary fixed: it has
1.92 m within 150 m and so passes a *150 m* depth test. A dive entrance needs
the depth **at its own entrance**, not somewhere in its neighbourhood.

### 5.5 What the water compiler is and is not guilty of

Not guilty of draining the province (§2: it ships twice the hydrology labels'
water). It **is** guilty for the Sunk Well and the other `landform:
open-water` dry records: the Phase 3 pass marked those cells wetland /
flood band 3 / wet-season inundated, the plot chose them on that basis, and
the physical compiler has not delivered water there in either season. That is
the *authored local hydrology* gap the water handoff already names as "the
physical-water half remains the next water job" — a promise recorded in the
plot that no carve has answered.

---

## 6. Fix shape, blast radius, chain cost

Recommended, in order. **None of it moves an owner-approved place.**

1. **Stop writing placeholders.** In `macro_plot.assign()`, measure the anchor
   candidate's `water_m` / `route_m` / `slope` off the survey exactly as
   `pinned_candidate()` does — or better, delete the duplication and have the
   anchor branch call `pinned_candidate()` with `landform="anchor"`. One
   function, `macro_plot.py`. Blast radius: `plotFacts` on 9 records; no dot
   moves; `water_relation` on the anchor candidate should stay 1.0 (an anchor
   is not scored).
2. **Stop copying stale facts forward.** In `committed_candidate()`, re-measure
   `water_m` from `s.dist_to_water_m` and keep the committed value only for
   fields a terrain edit cannot move. Same file. This is the root fix; (1)
   alone would be re-broken by the next re-plot.
3. **Re-measure the committed `plotFacts` for all 580 records** in one pass and
   commit the diff. `worldgen.apply_sitings` already has the write-back
   machinery. **No positions change** — this rewrites `plotFacts` only. Expect
   ~35 records whose committed `distanceToWaterM` is 0.0/open-water but which
   now measure > 1 m from water.
4. **Make the audit measure.** `check_water()` reads `ShippedWater` at the dot
   instead of `plotFacts`, states its season (wet season for a bank/quay claim
   — a quay that is dry four months a year is a defect; base season for a
   navigability claim), fixes the `needs_depth` vocabulary to the five names
   that exist, and adds an at-the-entrance depth test for
   `entrance == "underwater-entry"` / `underwaterAccess in {deep-dive,
   argonian-only-depth}`. Expect ~20 new findings on the typed-dive branch and
   a handful on the bank branch. Add the gate that is missing entirely: **no
   committed `plotFacts` water fact may disagree with the shipped signed depth
   by more than the surface texel (3.66 m)**. `test_water_fact_invariants.py`
   (currently untracked, in flight) checks the raster consumers but not the
   committed records, so this is a new test, not a change to that one.
5. **The eight dry records are a *water* job, not a plot job**, and only for
   the ones whose type demands water: the Sunk Well and
   `trunk-road-tradehouse` (both `landform: open-water`),
   `legendary-deep-medusa-wood` and `mudfoot` (coves). Route them through
   `worldgen/hydrology_intent.py` +
   `world/sources/routes/authored-minor-waterways.json` exactly as
   Sap-Tapping's landing was, so the carve delivers named, measured water
   rather than the plot inferring it from a coarse label.
   `ten-thousand-nests` (a cliff bird-colony in a gorge, `surface-swim`) and
   `the-shut-village` (a quarantine village, water 31 m away) are prose
   problems, not water ones.

**Chain cost.** Items 1–4 need **no terrain chain at all**: they are
world-generation code plus a `plotFacts` rewrite and a test. Item 3 costs one
`apply_sitings` run (seconds). Item 5 is the only one that needs the chain —
`./scripts/terrain-chain.sh --from refine_province`, ~**5.5 min** end to end
per the water handoff (11 s if nothing changed), then `apply_sitings`,
`pytest -n auto`, `npm run test:placement`, plus `compile_settlement` /
`export_settlement_bundle` for anything that reaches a settlement. Do **not**
let `sculpt_province` re-run.

**What must not happen.** Do not move Lilmoth, Stormhold, Alten Corimont,
Archon, Thorn, Soulrest, Gideon, Blackrose or Helstrom to make a number pass —
they are the Phase 2 owner-approved anchors (PROGRESS.md milestone 2, gate
2026-08-22) and the Phase 11 blueprints, routes, quests and ferry graph are
built on them. Lilmoth's anchor on a bluff 292 m from its own quay is
**canon-correct** (Lore:Lilmoth: stilt platforms "ascending from the ground",
large ships cannot dock). The defect is the record's claim about that dot, not
the dot.

---

## 7. Reproducing this

```python
import json, glob, numpy as np, sys
sys.path.insert(0, "tooling/world-generation")
from worldgen.water_report import ShippedWater

sw = ShippedWater()
mpp = sw.mpp2                       # 3.65568
d = sw.signed_depth_m("dry")        # or "wet"; the argument is required (0049)
n = d.shape[0]

def window_max(x, z, radius_m):
    k = max(0, int(round(radius_m / mpp)))
    c, r = int(x / mpp), int(z / mpp)
    return float(d[max(0, r-k):r+k+1, max(0, c-k):c+k+1].max())

rows = []
for f in glob.glob("world/sources/catalogue/places-*.json"):
    for rec in json.load(open(f))["places"]:
        pf = rec.get("plotFacts") or {}
        if not rec.get("positionM"):
            continue
        if pf.get("landform") == "open-water" or pf.get("distanceToWaterM") == 0.0:
            rows.append((rec["id"], window_max(*rec["positionM"], 12.0)))
print(len(rows), sum(1 for _, v in rows if v < 0.8))   # -> 103 42
```

`ProvinceSurvey.sample(x, z)["hydrology"]` gives the Phase 3 side of the same
cell (`wetland`, `floodBand`, `wetSeasonInundated`, `shoreDistanceM`) for the
divergence comparison.

---

## 8. Severity for the world the owner will walk

Ranked by whether a player would notice, not by the size of the number.

**Tier 1 — a player stands there and it is wrong.**
1. `place.hist-heartland.dive-shaft-xanmeer-well` — a **dive shaft with no
   water**, 3 m of dry floor across its whole neighbourhood, nearest usable
   water 70 m away. Typed `deep-dive` / `well-shaft` / `traversalModes:
   [dive, swim, boat]`. The one unambiguous, un-defendable defect in the set.
2. `place.imperial-penal-south.saltrice-village` (0.24 m),
   `place.naga-kur-deeps.raft-village-lashed` (0.60 m),
   `place.imperial-fringe.the-cold-lights` (0.72 m) — all
   `entrance: underwater-entry` in water you could wade.
3. `place.dunmer-north.the-stormhold-falls-chamber` (−3.00 m, typed
   `shallow-dive`) and `place.dunmer-north.ten-thousand-nests` (−3.00 m,
   `surface-swim`) — outside the 103 set but found by the same measurement;
   dry ground behind a swim claim.

**Tier 2 — the record lies in the studio inspector, the world is fine.**
4. **Lilmoth** and the other eight anchors. `plotFacts` says 0 m from water;
   Lilmoth is 108 m and Stormhold 110 m. `plotFacts` is exported to
   `places.json` and rendered in the studio's place inspector
   (`apps/world-studio/src/places/PlacesLayer.tsx:426`), so the owner reads the
   wrong number. Fix the fact (§6.1–6.3); do not touch the dot.

**Tier 3 — prose to re-check, no geometry to move.**
5. `mudfoot`, `legendary-deep-medusa-wood`, `trunk-road-tradehouse`,
   `the-shut-village`, `sink-field`, `the-lightning-yard` — cove/open-water
   labels on dry or near-dry ground, all off the road network or minor.
6. The remaining ~28 of the 42 are marsh villages, tolls, boardwalks and
   lairs standing in 0.24–0.72 m. **Nothing to fix**: that is a marsh. They
   are in the list only because a submerged-place threshold was applied to
   them.

**Tier 4 — an open owner call, not a defect.**
7. **Alten Corimont**, the opening city. It is canon a **river-bank port with
   a channel to the sea**, and it has one: 165 m at 0.48–1.92 m. Whether that
   is enough water for the opening hours' first impression of a "free port" is
   a design judgement, not a measurement failure. Its `plotFacts` still need
   §6.1.

## 9. Related records

- Decisions [0047](../../decisions/0047-water-one-physical-model.md),
  [0049](../../decisions/0049-water-is-measured-and-has-a-season.md).
- [Water handoff](../rendering/water-handoff.md) — the authored local
  hydrology gap (§ "Closed 2026-09-08 late evening" item 1) is the same root
  cause as §5.5 here.
- This doc is not linked from `docs/research/README.md` or the docs router;
  the audit was read-only. **Add both links when the fix lands.**
