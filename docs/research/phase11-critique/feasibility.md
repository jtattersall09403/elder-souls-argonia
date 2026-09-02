# Phase 11 catalogue critique — FEASIBILITY

Adversarial pass over `world/sources/catalogue/` (729 records, 8 region files)
against: decision 0041's complexity-budget rule, `settlement-asset-inventory`
(36 families), `candidate-sites.md` (landform supply), `compile_settlement.py`
and `blueprint.py` (what the compiler can actually do), and
`packages/game-core/src/water/` (what the water system actually does).

**Verdict: PASS WITH FIXES.** Nothing in the catalogue is unbuildable in
principle; the complexity budgets are broadly honest and the three known asset
gaps are respected. The fixes below are mostly *wording* and *typed-field
hygiene*, plus one real over-promise and one real siting-supply squeeze.

Method note: all counts below are mechanical (scripts over the JSON), not
impressions. Where I could not measure (salinity rasters are derived and
gitignored) I say so and give the check to run at plot time.

---

## Findings, ranked

### F1 — `buoyant-causeway` promises a walkable moving surface, at `simple`
`place.imperial-penal-south.buoyant-causeway` — *"A road of lashed buoyant
timber rafts that lifts and falls with the season, numbered along its whole
length, **moving visibly as you walk it**"*, four kilometres long, budget
`simple`.

A player-carrying surface that moves under them is buoyancy + kinematic
platform + character-controller carry across a streamed 4 km run. That is not
Morrowind-level placement, it is the single hardest runtime claim in the
catalogue, and it is the one record where the description would drive a coder
to build a system. The water stack gives us a *level offset*
(`tideOffset`/`seasonOffset` in `packages/game-core/src/water/tide.ts`), not
moving colliders.

**Fix:** reword to two authored heights expressed as bundle variants
(`wet` / `dry`), i.e. *"the deck sits a metre higher in the wet season and the
ramps at each end are re-pegged"*; delete "moving visibly as you walk it" or
demote it to edge planks that are decorative (no collider). Retype to
`standard`. Same one-line treatment for the three lesser cousins:
`place.mercantile-coast.pusbottom-barge`,
`place.saxhleel-coast.boardwalk-high-stage` (counterweighted hoist — make it a
static prop with a ladder, not a working lift), and
`place.mercantile-coast.lighter-flotilla`.

### F2 — four landform classes are at **100 % occupancy** with zero slack
I ran a capacity matching (each record assigned one landform from its declared
alternatives, against the scour's per-class supply). Result: **0 records
unplaceable** — the alternatives do their job. But the solution saturates four
classes exactly, and all four are *uncapped* in the scour (i.e. real scarcity,
not a sweep artefact):

| landform | supply | records naming it | occupancy in the solution |
|---|---|---|---|
| `enclosed-clearing` | **6** | 142 | **6 / 6** |
| `flood-high` | **41** | 241 | **41 / 41** |
| `oxbow` | **18** | 60 | **18 / 18** |
| `sinkhole` | **11** | 77 | **11 / 11** |

Zero slack is not feasibility, it is a coincidence. Part 3 must also satisfy
`regionClasses`, `waterRelation`, danger band and neighbour relations
*simultaneously* — any one of those filters turns a 100 %-occupied class into a
shortfall. `flood-high` is the acute one: 241 records want dry rises in the
flood plain and the province has 41.

**Fix (three lines, all cheap):** (a) re-run `terrain_scour` with the
`enclosed-clearing`, `flood-high`, `oxbow` and `sinkhole` detectors relaxed —
candidate-sites.md's own guidance is "raise the cap rather than assume
scarcity", and these four were never capped, so we do not know whether 6 is the
province's real clearing count or the detector's; (b) for the ~200 `flood-high`
records where the rise is *dressing* rather than the reason the place exists,
add `any-firm-ground` as an alternative; (c) hard-requires are only four
records — `place.imperial-fringe.the-sunk-lane` (sinkhole only) and the three
Archon port records (`archon-bonded-row`, `archon-quarantine-shed`,
`archon-shipyard`, natural-harbour/river-mouth only) — those are correct and
should stay hard.

### F3 — 389 records hide their landform demand in free-text `preferences`
Only **340** records populate the typed `sitingPrefs.landformClasses`. Another
**179** encode it as a prose string inside `preferences`
(`"landforms: any-firm-ground, flood-high, spring-head"`), and **210** declare
no landform at all. The Part 3 matcher reads the typed array; on today's data it
would see 47 % of the demand and silently free-place the rest. My F2 numbers
above are only correct because I parsed the prose back out.

Three tokens used 318 times — `any-firm-ground` (207), `any-shallow-marsh`
(69), `any-channel-bank` (42) — are not landform classes in the scour at all.
They are wildcards, which is fine and useful, but undeclared.

**Fix:** one deterministic migration pass lifting `"landforms: …"` prefs into
`landformClasses`; add the three `any-*` tokens to the scour vocabulary as
explicit wildcards (documented in `candidate-sites.md`) so the matcher can
distinguish "anywhere firm" from "unspecified"; make the validator reject
`landforms:` appearing in a `preferences` string.

### F4 — `azure-tree` is a typo family that resolves to nothing
15 records carry `assetPlan: ["azure-tree", …]`. There is no such family. The
asset is BM&V's `azura_tree02` (the Hist stand-in), correctly slugged
`azura-tree` in 22 other records. The split originates upstream in
`type-recipes.json`, in exactly three recipes — `murkwood-verge`,
`root-hollow-gallery`, `wild-rootworm-burrow` — so every record derived from
them inherited it (all the `root-gallery-*` records,
`place.imperial-penal-south.murkwood-verge`,
`place.hist-heartland.rootworm-burrow-live/-dead`,
`place.imperial-fringe.the-hollow-under-the-figs`,
`place.dunmer-north.the-north-root-gallery`).

**Fix:** `azure-tree` → `azura-tree` in the three recipes and the 15 records.

### F5 — `assetPlan` slugs have no machine link to the asset inventory
The catalogue and `type-recipes.json` share a vocabulary of 37 short slugs
(`clutter`, `mud-mother-grove`, `xanmeer-tileset`…). The inventory
(`world/sources/placement/settlement-asset-inventory.json`) keys on 36 dotted
family ids (`prop.neutral.clutter-general`, `arch.xanmeer.tileset`…). Nothing
maps one to the other, so `type-recipes.json`'s own instruction —
*"assetPlan: inventory family ids"* — is literally false of the data, and F4
survived undetected because no validator could catch it.

**Fix:** add an `assetPlanAliases` map (slug → inventory family id) to the
inventory JSON and make `worldgen.catalogue --check` resolve every `assetPlan`
entry through it. Cheap now; this is the mechanism that keeps the next 700
records honest.

### F6 — the deeps' shared palette line names an asset that does not exist
**64 records** in `places-naga-kur-deeps.json` carry the same
`vibe.palette` boilerplate: *"black standing water, olive and bone, blue
bioluminescence, **bleached grave-stakes**, no red"*. Grave-stakes are gap 3 in
the inventory — *no staked-dead mesh exists anywhere on either Nexus domain*,
and the recorded guidance is to build stake-fields from Skyfall's rock cairns,
the rune circle, HTBM totems and stockade pikes.

The good news: of the records that make grave-stakes a *visible feature*
(rather than palette wallpaper), all but one carry `totems-ritual`,
`landmark-civic`, `hist-variants` or `xanmeer-ornament` — the recorded
substitutes. So the design honours the gap; the palette string does not.
The one true miss is `place.hist-heartland.hist-less-refuge-wild`, whose
"stake-field" has no marker family in its `assetPlan` at all.

**Fix:** reword the shared deeps palette to "bleached stake and cairn markers";
add `totems-ritual` to `hist-less-refuge-wild`.

### F7 — freshwater "tidal" records in the deep interior
`tideResponse` is *derived from salinity* (`waterData.ts`:
`tideResponseOf(salinity)`, smoothstep 0.02 → 0.15) and is deliberately kept in
lockstep with the GPU. **Fresh water does not move with the tide, by
construction.** Meanwhile `seasonResponse` is 1 on fresh lowland — the wet/dry
cycle is exactly the mechanism the interior *does* have.

Six deep-interior records make tide load-bearing:
`place.naga-kur-deeps.drowning-narrows-tidal-gate` ("the whole zone's outflow
squeezes through in four hours"), `stilt-tidal-black-piles` ("the tidal reach
of the inner swamp's outflow"), `portage-slipway-narrows-deeps`,
`dive-shaft-natural-deeps`, `drowned-village-lake-deeps`,
`treasure-hunters-living-deeps`. Two more inland:
`place.imperial-fringe.gideon-rootworm-terminus`, `onkobra-clay-pits`.

Whether these work depends on where the brackish corridor reaches, which I
could not measure (the hydrology `.npz` is derived and gitignored;
`hydrology.py` sets `SALT_SEARCH_MAX_M = 9000` with land travel penalised 4×,
so on a ~7.4 km province side it is *plausible* the corridor reaches some of
them). Coastal tide records — the whole `saxhleel-coast` and
`mercantile-coast` tide cluster, ~40 records — are fine.

**Fix:** at plot time, sample `salinity ≥ 0.05` at each of these eight sites;
where it fails, swap "tide" for "seasonal drawdown/refill" — no other change,
since the fiction (a timed window, a drowned lane, a walkable flat) is
identical and the season mechanism delivers it.

### F8 — `oliis-tide-run` needs a number nobody has written down
`place.mercantile-coast.oliis-tide-run` (`simple`): two miles of flat walkable
at low water, sailable at high, difference ninety minutes. This is a genuinely
excellent POI *and* it is the only record whose whole identity is a quantity —
tidal amplitude against the mudflat's gradient. `FloodBasin.tidalAmplitude`
(module 50 §36) has no committed value for Oliis Bay.

**Fix:** make the run's plotted footprint a compile-time consequence of the
basin's amplitude rather than a prose claim ("the flat that the tide uncovers"
rather than "two miles"), and set Oliis Bay's amplitude in the hydrology
compile in the same change. Same note applies to
`place.saxhleel-coast.tide-run-channel` and `tide-run-delta`.

### F9 — `hull-hall` needs an interior no hull mesh has
`place.mercantile-coast.hull-hall` (`simple`): *"An upturned hull as a
longhouse, with the sternpost carved into a door frame and the gunports as
windows."* Our 15 hulls (inventory §6) are exterior statics; none is upturned,
hollow, or interiorised.

**Fix:** this is buildable *because of* 0041's entrance-decoupling ruling —
the hull is exterior dressing with a door threshold, and the hall is a shack-kit
/ farmhouse-basement interior cell behind it. Say so in the record's
`assetPlan` (add `vanilla-shackkit`) so the builder does not go hunting for a
hollow-hull mesh. Reword "gunports as windows" (a mesh property we cannot
supply) to "light coming in where the gunports were" (a light placement).

### F10 — 14 records build entirely out of unextracted BM&V pools
Fourteen records — mostly cairn/memorial/vista dressing
(`place.imperial-fringe.silverhand-cairns`, `the-buried-spears`,
`the-ring-of-nine-wells`, `place.pirate-freeholds.flu-cairn-field`,
`place.saxhleel-coast.all-flags-memorial`, the four `*-vista-ledge`/`*-vista`
records, `place.mercantile-coast.hestra-stone`, …) draw only on families the
inventory marks `have-unextracted` (`landmark-civic`, `totems-ritual`,
`signage-blank`, `bmv-*`).

Not a design fault — a scheduling one. **Fix:** flag these families in the
Part 0 extraction queue so the first authoring pass is not blocked on a
pipeline job.

---

## What I checked and found clean (the adversarial brief's own questions)

- **Withdrawn `darkwater` pool: 0 references.** No occurrence of the string in
  any of the eight `places-*.json`. The permissions withdrawal (0041 §983) was
  carried through cleanly.
- **Twin-hulled craft gap: 0 dependent records.** The only two hits
  (`place.saxhleel-coast.contested-bank`, `deep-bank`) are `Lore:Tide-Born`
  *citations*; both build from `boats-raft-canoe` + `boats-keeled`, which round 3
  closed (`canoe1.nif`, `ferryraft01`). The owner steer on kitbashing twin hulls
  is **not blocking** the catalogue.
- **Industrial/works props gap: 0 dependent records.** All 25 saltern / kiln /
  calcinator / reed-cutting / forge records carry `stockade-scaffold`,
  `fences-wattle`, `market-tents` or `clutter` — i.e. they are distinguished by
  *layout, fire and stock*, exactly as the inventory's recorded guidance
  instructs. `place.imperial-fringe.moonrack-calcinator` is the model of this:
  its signature feature is a post-hole arc, not a bespoke machine.
- **All 11 `complex` budgets are justified and real** — nine major cities plus
  `place.hist-heartland.sap-collection-facility-daedric` and
  `place.imperial-penal-south.blackrose-prison`. Every justification explicitly
  says "district count / geometry, still Morrowind-level placement". No
  scripting is claimed anywhere in them.
- **Scripting red flags in the 718 non-complex records: essentially none.** I
  scanned all of them for 30+ mechanism verbs and read the 20 worst hits. The
  language is consistently *lore about motion*, not *runtime motion*:
  `standing-curiosity-mechanism-deeps` "has moved a quarter-turn in a lifetime"
  (a static, plus a written record); `collapsing-pinnacle-rim` is four rope
  anchors; `the-lamp-at-the-ford`'s counterweight is a pole silhouette;
  `xanmeer-fort-defences-working`'s "working traps" are the tileset's animated
  `chompy`. This is disciplined writing and the catalogue deserves credit for
  it. F1 is the sole exception.
- **State variants fit the ≤3 mechanism.** 43 records carry a season/state
  claim (`season` wet/dry/varies, or `status` seasonal/drowned); the 11
  `varies` records each resolve to two authored states plus an empty
  footprint — `place.naga-kur-deeps.drifting-village-wet-mooring` says so in
  its own justification and lands exactly on `MAX_VARIANTS = 3`. No record
  needs a fourth.
  - *One follow-on:* that record's *"old moorings scattered across the region
    as a trail of ghost villages"* implies sibling places that do not exist in
    the catalogue. Either author two `ghost-mooring` records (cheap — they are
    `trivial`) or cut the trail claim.
- **Waterfall demand is comfortable** — 24 records want the landform, supply is
  60 (and capped). The "dry room behind the fall" records
  (`place.mercantile-coast.keel-sakka-falls`,
  `place.hist-heartland.waterfall-chamber-root-fall`) are buildable under the
  entrance-decoupling ruling: the chamber is an interior cell, not a cavity cut
  in the terrain.
- **Underwater/diving demand is served.** 110 records touch dive/depth; the
  drowned layer (SIRENROOT walkable submerged rubble + caustics, Depths of
  Skyrim reef flora, BM&V's 8 submerged shells) is `have`, and
  `submerged-ruins`/`submerged-blocks` are used 57/48 times against it.
- **Site reuse is sane.** 192 records carry `scourSiteIds` across 136 distinct
  sites, max reuse 4 — clusters, not collisions.

---

## Fix list (one line each)

| # | Records | Fix |
|---|---|---|
| F1 | `buoyant-causeway` (+3) | reword to two authored heights as variants; retype `standard` |
| F2 | 4 landform classes | re-run the scour with those four detectors relaxed; broaden ~200 `flood-high` prefs |
| F3 | 389 records | migrate `"landforms: …"` prose into `landformClasses`; declare the three `any-*` wildcards |
| F4 | 15 records + 3 recipes | `azure-tree` → `azura-tree` |
| F5 | tooling | add `assetPlanAliases` to the inventory; make the validator resolve `assetPlan` |
| F6 | 64 deeps records | reword the shared palette line; add `totems-ritual` to `hist-less-refuge-wild` |
| F7 | 8 records | sample salinity at plot time; where fresh, "tide" → "seasonal drawdown" |
| F8 | 3 tide-run records | derive the footprint from `FloodBasin.tidalAmplitude`; set Oliis Bay's value |
| F9 | `hull-hall` | add `vanilla-shackkit`; the hall is an interior cell behind the hull |
| F10 | 14 records | queue the BM&V extraction before the first authoring pass |
| — | `drifting-village-wet-mooring` | author the two ghost moorings, or cut the trail claim |
