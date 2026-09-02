# Phase 11 catalogue — completeness critique (the absence register)

**Date:** 2026-09-02 · **Scope:** the 729-record place catalogue
(`world/sources/catalogue/places-*.json`) at the end of the Part 2
reconciliation + enrichment passes (decision 0041).
**Brief:** name what is ABSENT. Not quality, not density, not lore accuracy —
those are sibling critics. Ranked by how much the province would miss it.

**Verdict: PASS WITH FIXES.** The catalogue's *breadth of kinds* is genuinely
good — 234 of 236 POI types used, ten classes, 57 families, every named major
and almost every canon secondary present. Nothing here argues for re-deriving.
What is absent falls into three repeating shapes, and all three are the same
root cause — **eight agents each saw one slice, so anything that only exists at
province scale, or that only one agent thought to fill in, is missing**:

- **A1–A5 — whole axes blank in six of eight regions.** `season` and
  `eraLayers` were filled by two agents and nobody else. Same for sockets,
  `ownerFaction`, `notableNpcSlots`, `rumourPoolKey`.
- **A6–A11 — layers the derivation never instantiated.** The dressing tier,
  the district tier, the underwater access graph, `LocalStateVariant`, the
  demographic prior. The *vocabulary* exists; the *rows* do not.
- **A12–A18 — specific named things nobody wrote.** Deepmire, the main-quest
  boss's lair, six canon secondaries, eleven factions, ~15 creatures.

Legend: **ADD** = write catalogue rows/fields · **DEFER** = real absence, but
correctly owned by a later part/phase — record the hand-off · **OK** =
consciously absent, and here is why that is fine.

---

## Tier 1 — the province would be visibly poorer without these

### A1. `season` is unset on 540 of 729 records — in a monsoon province · **ADD**

`season` is populated in **dunmer-north (82/84) and imperial-fringe (107/108)
and nowhere else**. Six regions — 540 records — leave it `null`, and every one
of those records has a recipe in `type-recipes.json` that *does* declare a
season. Province-wide only **4 `wet` and 3 `dry`** records exist, and 15
`status: seasonal`.

This is the single biggest absence in the catalogue, because the wet/dry cycle
is the province's defining environmental fact — the drawdown, the flood-high
siting logic, the boat lanes that only exist half the year. As it stands, six
of eight regions describe a province with no seasons.

Both of the two **unused POI types are the seasonal ones** —
`festival-ground` (season `varies`) and `dry-season-herd-ground` (season
`dry`). That is not a coincidence; it is the same hole seen from the other
end. `dry-season-herd-ground`'s own recipe calls it *"the region's ecological
engine; villages time their year on it"* and it has zero instances.

**Fix:** back-fill `season` from each record's type recipe (mechanical, one
pass), then hand-promote the records where the *place* is more seasonal than
its type — drawdown flats, fairs, portages, fords, herd grounds, monsoon
moorings. Place the 4 `festival-ground` and (band) `dry-season-herd-ground`
records; the raised-hammock/seasonal-floodplain landforms they want exist.
Target: ≥40 wet/dry-specific records spread across all eight regions, not 7 in
two.

### A2. `eraLayers` is unset on the same 540 records; three era layers have one record each · **ADD**

Identical footprint to A1 — filled only in dunmer-north and imperial-fringe.
Province-wide the tails are: **duskfall 1, second-empire 1, oblivion-crisis 1**,
morrowind-invasion 3, lost-peoples 3, post-umbriel 6, ayleid 9, knahaten-flu 10.

Five of those eleven eras are effectively single-region: every `post-umbriel`
record but one is in dunmer-north; every `ayleid` record is in dunmer-north or
imperial-fringe; **all three `morrowind-invasion` records are in dunmer-north**.
The Oblivion Crisis, the Second Empire and the Duskfall each left exactly one
mark on Black Marsh, all of it within 20 km of each other.

Umbriel is the worst of these in *narrative* terms: it flew from Lilmoth
(mercantile-coast) north-west across the province and mercantile-coast has
**zero `post-umbriel` records**. The Umbriel Witness Society (A15) has two.

**Fix:** back-fill from recipes as in A1, then deliberately seed the thin tails
outside dunmer-north — an Oblivion-crisis gate-scar on the Imperial road
network, a Second-Empire works on the southern coast, a Duskfall
stone-abandonment site in the heartland (the "stone as a moral error" rule is
province-wide lore and currently has one physical expression). Umbriel's track
needs marks along its actual flight path; the `umbriel-shadow-track` dressing
recipe already exists and is unused (A6).

### A3. The dressing tier has zero rows — 55 recipe types, 0 instances · **DEFER (record the hand-off) + partial ADD**

Every one of the 729 records is `recordScope: "poi"`.
`type-recipes.json` also defines **55 `dressing` types and 58 `district`
types — none instantiated anywhere**.

The district tier is legitimately Part 6/7 work (districts live inside a
settlement blueprint). **The dressing tier is not.** These are wilderness
marks: `hunters-stand`, `fishing-camp`, `lone-grave-stake`, `crocodile-ravine`,
`black-mud-trap`, `gas-vent-field`, `swarm-hollow`, `abandoned-boat`,
`waymark-junction`, `dry-cache`, `boundary-totem`, `chime-frame`,
`meditation-stone`, `sunken-house`, `mineral-node`, `vine-face`,
`umbriel-shadow-track`. They sit between POIs, not inside settlements, and they
are exactly the **fine tempo layer** Part 1 required be derived *separately*
from the destination layer:

> "every successful open world runs a fine tempo layer … over a much coarser
> destination layer … Derive all three separately, and check them separately."

That did not happen. 729 POIs over 33.52 km² = **21.7/km²**, which clears the
18–22 fine-tempo band — but only because the destination layer is being counted
as the tempo layer. Split by `importanceTier`, the destinations (tier 0–1) are
97 records ≈ 2.9/km², which is right; the tempo layer proper is the remaining
632 ≈ 18.9/km², and it is made entirely of *named POIs*, with no sub-POI
dressing beneath it. Morrowind's texture comes from the unnamed stuff between
the named stuff, and the province currently has none of it.

**Fix:** do not inflate the POI count. Instead decide explicitly whether
dressing rows live in this catalogue (as `recordScope: dressing` records,
probably unnamed and rule-placed) or in a separate scatter artefact — and
record the decision in 0041. Either way the province needs a fine layer, and
until it exists the density figure is overstating what the player will feel.
The district tier: record in 0041's freeze checklist that districts are Part 6
deliverables so the next agent does not read 58 unused types as a gap.

### A4. Argonian society has almost no places for learning, law, healing or festivity — outside a city · **ADD**

Interrogating the social-function axis whole-province:

| Function | Records | What exists |
|---|---|---|
| **learning** | **2** | one Ayleid `library` (a Dunmer ruin), one `field-station` |
| **healing** | **5** | `quarantine-shed` ×2, `pest-house` ×2, `withdrawal-house` ×1 — **all disease containment, none healing** |
| **law / judgement** | ~1 | `placation-court` ×1; `magistrate` appears in one record (Gideon) |
| **festivity** | 22 (nominal) | 15 `tradehouse` + 6 `vice-den` + 1 court. **Zero festivals** |
| **waste** | **0** | no midden, no latrine stage, no refuse ground anywhere |
| **childhood** | 7 | 1 `hatchery-village`, 3 `maturity-trial-ground`, 3 `shadowscale-ground` |

The word "healer" appears **zero times in 729 records**. So does "physician",
"herbalist", "scriptorium", "sewer" and "night soil". "festival" appears once.
Five M5 cities and three M4s produce no waste and hold no festivals.

The mitigating fact — and it is a real one — is that the *type vocabulary is
complete*: `courthouse`, `gallows-yard`, `records-archive`, `teaching-ground`,
`apprentice-house`, `alchemists-court`, `elders-house`, `latrine-stage`,
`midden`, `play-ground`, `ball-court`, `naming-day-ground`, `debate-circle`,
`performance-platform`, `arbitration-ground`, `field-remedy-stall` all exist as
recipes. They are `district`/`dressing` scope, i.e. A3's problem again. So this
is *partly* deferred to Part 6.

But not entirely, and this is the part to act on now: **a province where every
school, court, healer and festival is inside a city wall is a wrong province.**
Argonian learning is oral and Hist-mediated; Argonian law is naming, placation
and the Shadowscale; Argonian healing is Hist sap. Those belong at rural
POI scope. Specifically ADD, at POI scope:

- a **healing** answer outside the cities — sap-draught stations at Hist
  villages, a marsh-remedy gatherer's ground, a bonesetter's landing on a
  freight route. The player must be able to be healed 10 km from Gideon.
- an Argonian **teaching/telling** ground that is not a library — a
  storytelling ground, a sign-readers' ground (both are unused dressing
  recipes), a naheesh's elder-house at a keystone village.
- an Argonian **judgement** ground at village scale: arbitration ground,
  placation court (currently 1 for the whole province).
- the 4 `festival-ground` rows from A1.
- one **hatchery** province-wide is thin for an egg-laying people with eight
  major cities. The Keepers of the Shell hold exactly one record. ADD at least
  a southern/coastal counterpart and a satellite cordon.

### A5. Sockets, `ownerFaction`, `notableNpcSlots` and `rumourPoolKey` were authored in two regions only · **ADD**

The build-out keys the run-book called "cheap now, a migration later":

| Field | Set | Distribution |
|---|---|---|
| `discovery` | 729/729 | uniform ✅ |
| `assetPlan` | 729/729 | uniform ✅ |
| sockets (any) | 401/729 | **328 records have zero sockets**; hist-heartland 99 of 110 empty, naga-kur-deeps 60 of 65, mercantile-coast 86 of 140 — vs dunmer-north 2 and imperial-fringe 1 |
| `rumourPoolKey` | 377/729 | hist-heartland **2/110**, naga-kur-deeps **1/65**, mercantile-coast 17/140 |
| `notableNpcSlots` | 127/729 | **602 records name nobody**; zero in hist-heartland and naga-kur-deeps |
| `ownerFaction` | **29/729** | 700 null; faction ownership lives entirely in prose |
| `deedCounterKeys` | 233/729 | 183 of them in the same two regions |

`marks` is the near-zero socket type at **84/729 (12%)**. **Forty
importanceTier-0/1 places have no sockets at all**, including Hissmir, The Lost
City, the Root Talk Ground, the Teeth of Sithis, the Murkwood Verge, Bramman's
Head, Dead-Water Village, Bright-Throat Village, the Meeruth Station (a
stronghold candidate) and all three heartland Hist trees.

This is the *same defect the enrichment pass already fixed for `relations`*,
in four more fields. It was quantified for `relations` and closed; nobody
re-ran the check on the other columns.

**Fix:** one enrichment pass in the shape of the last one. Priority order:
sockets on the 40 tier-0/1 places first (they are what quests bind to),
`ownerFaction` from the prose that already names the owner (the faction data
is *there*, just untyped — see A15), then `notableNpcSlots` and
`rumourPoolKey` for the two interior regions. Also normalise socket IDs:
they are currently a mix of bare slugs (`the-relic-chamber`), namespaced
(`scene.ss01.the-empty-cradle`) and tag-prefixed (`"STATION
helstrom.convoy_dock"` — the tag stored *inside* the string), which will fail
any standard-2 ID check.

---

## Tier 2 — structural absences: the schema has no field for a required thing

### A6. `LocalStateVariant` — zero, province-wide · **ADD (schema)**

The run-book's own forward-compatibility block:

> "The compiled settlement bundle format carries a variant/overlay mechanism
> from v1 … If the v1 bundle can't express an overlay, every bundle gets
> rebuilt at Phase 14."

`localStateVariants`, `stateVariant` and `stateId` appear **0 times across all
729 records**. (`classification.variant` is a type discriminator, not this.)
Quests 20 §13 requires 2–3 per quest location; §14's static consequence budget
has nowhere to land. Records that explicitly declare `STATE` in their
questHooks — `murkwood-verge`, `white-rose-prison` — declare a mechanism that
does not exist.

This is the cheapest fix in the register and the most expensive to retrofit.
**Add the field to the catalogue schema now, even mostly empty**, and populate
it on the ~20 tier-0/1 quest locations.

### A7. The underwater layer has no access metadata, and no graph · **ADD (schema) + ADD (rows)**

221 of 729 records (30%) carry `swim` or `dive`, which is healthy breadth, and
the underwater *families* are good (`root-hollow-gallery` 13, `wreck` 9,
`submerged-xanmeer` 6, `dive-shaft` 5, `air-pocket-station` 4, `reef` 4,
`drowned-village` 4, `legendary-deep` 3 …). Module 60 §44 asks for more than
that:

- **No access-class field exists.** §44 requires five access classes
  (Argonian-immediate / breath-skill / spell-or-equipment-gated /
  high-current-expert / quest-or-Hist-state). `traversalModes` is a flat list,
  so **the acceptance criterion "Argonian physiology materially changes
  underwater play" and "swimming/breath/climbing create access progression"
  are currently unrepresentable.** This is a schema absence, not an
  authoring one, and it is the underwater equivalent of A6.
- **No underwater edges.** No `waterBodyId`, no air-pocket→shaft linkage, so
  §44's "underwater is its own graph" has no data. Note the kickoff hook
  "per-body `WaterBody` records" is also unlanded.
- **Distribution is lopsided:** dive is 26 in saxhleel-coast and 15 in
  naga-kur-deeps, but **2 in imperial-penal-south and 2 in pirate-freeholds**.
  A pirate region with two dive sites is an odd province.

**§44 kinds with no record anywhere** (add a representative each): sunken
Imperial villas/customs posts (`customs-town` ×1 and `estate-village` ×4 are
*all dry* — the whole Imperial layer is absent from the drowned layer);
collapsed prison drains (`prison-ruin` is dry, and it sits in the weakest dive
region); riverbed smuggler hatches (`smugglers-ledge` ×4, all dry); wells and
cisterns opening into larger interiors; ritual pools (a §39.3 renderer case
with no content to render); submerged caches; a multi-hull **wreck field**
(all 9 wrecks are singletons); a system-scale flooded cave.

Note the owner's Round-4 underwater sourcing leads (0041 Q&A item 2) were
gathered for exactly this and have not yet been spent on catalogue rows.

### A8. No demographic prior anywhere; four races with a stated population share have no place at all · **ADD**

Module 92 §81 specifies a `DemographicPrior` structure
(`populationShares`, confidence, source). The catalogue carries a single
`culture` enum and free-text `occupants`. There is **no population range, no
`populationShares`, no `PopulationGroupId`, and no tribe field** — so §84's
"current tribes require distinct demographic and social rules" has no
attachment point for 619 `culture: argonian` records, and §82's zone shares
cannot be resolved to a place at all (the eight catalogue region names do not
map 1:1 onto §82's seven chart zones).

Against §82's stated shares, the province is missing entire peoples:

- **Bosmer: 0 records.** §82 gives them **10% of the Blackrose–Lilmoth zone**
  and 5% of Soulrest. No household, quarter, camp or hunting party exists.
- **Redguard: 0 records**, against 3% at Gideon and 3% at Soulrest.
- **Khajiit: 4 records**, against **19% of the Soulrest zone** — by the
  module's own words "by far the strongest Khajiit concentration". The
  mercantile-coast's Khajiit presence is essentially Moonmarch, which was
  placed for its *name*, not its demography. No caravanserai, no moon-sugar
  route stage.
- **Nord: 3 mentions, `culture: nord` used zero times**, against 7% of the
  Stormhold zone (the highest non-Dunmer minority there).

**Fix:** add a `demographics` block (population range + shares + prior id) to
the schema and a `tribe` field; then place the missing peoples where §82 says
they are — a Bosmer hunting camp and a timber contract in the
Blackrose–Lilmoth zone, a Khajiit caravan quarter and a sugar-route stage on
the mercantile coast, a Redguard factor's house at Gideon or Soulrest, Nord
ship-hand berths in the north. §84's "small outsider expeditions need visible
logistical support and motives" is honoured for Collections and the Synod and
for nobody else.

### A9. `assetPlan` has no controlled vocabulary — and owned breadth goes unused while unowned assets are referenced · **ADD (lint) + ADD (rows)**

37 distinct free-text tokens across 3,698 references, joined to nothing.
Consequences, all mechanical to catch:

**Owned families referenced by ZERO records:**
1. **`arch.xanmeer.ayleid-exterior-monumental`** (85 exterior pieces) — the
   asset the inventory calls "the monumental massing round 2 wanted", the one
   that *closed* `gap.xanmeer-exterior` after the owner's porting ruling. Not
   one of the 99 `xanmeer-tileset` or 38 `pyramid-statics` records uses it.
   **The province was authored against a gap that had already been closed.**
2. **`landmark.argonian.hist-tree-skyfall`** — a second hero Hist mesh plus
   four rock cairns, which the inventory names as the **grave-stake
   substitute** for the unclosable `gap.argonian-props`. The 9 bog-blight
   records, which are *about* loosened grave-stakes, reference none of it.
   All 44 Hist references use the one `hist-tree` token, so **every Hist in
   the province is currently the same mesh** — including the ten hero Hist.
3. `ground.tropical.setting` — zero (arguably out of settlement scope).

**References that resolve to nothing:** `azura-tree` (22) / `azure-tree` (15)
— a systematic typo split, and neither is an inventory family;
`hist-variants` (24) — no such family; `submerged-blocks` (48) vs
`submerged-ruins` (57) — two tokens, one family, no defined distinction.
**`boats-keeled` (51) vs `boats-raft-canoe` (11)** is the one with design
consequences: the inventory's own round-2 correction says both boat mods are
"keeled, planked, oar-rowed **Nord** hulls" and the keel-less pool is the
native craft — so the province references the foreign hulls 5× more often than
the Argonian ones, in Black Marsh.

~880 of 3,698 references (24%) point at `have-unextracted` BM&V pools
(`totems-ritual` 252, `landmark-civic` 162, `signage-blank` 120 …). That is
acceptable if extraction is planned; it should be a tracked list, not a
surprise at Part 6.

**Fix:** an `assetPlan` vocabulary in `type-recipes.json` keyed on inventory
`family.id`, plus a test asserting every token resolves. Catches all of the
above and prevents recurrence. Then spend the Ayleid monumental kit and the
Skyfall Hist variants on rows that want them.

---

## Tier 3 — specific named things nobody wrote

### A10. Deepmire does not exist · **ADD** — highest-value single row in the register

Quests 20 §12b names Deepmire ("the Refuge") **twice** — as a canon place and
again as "a D4 destination with an approach route" for UW04. There is no
Deepmire record, no plateau, no approach route. The traces are scattered
wrong: `place.hist-heartland.refuge-station-interior` ("The Kept Refuge") is an
unnamed generic in the wrong region; `place.naga-kur-deeps.leviathan-bone-field`
carries Deepmire's bones with a `why` that says so outright; and the province's
Umbriel memorial sits on the saxhleel coast (tier 3, D2) when §12b puts it at
Deepmire — so **UW04's "only traversal spike" is not in the world**.

### A11. The main-quest final boss has no lair · **ADD**

Decision 0030 makes an ancient **Xal-Krona / Argonian Behemoth** (the Last
Warden) the main-quest final boss. **Zero records** anywhere imply its origin,
its making-place or its lair. This is a Milestone-1 world provision with no
ground under it.

### A12. Six canon secondary settlements, and three place-shaped holes · **ADD**

Absent with no mention anywhere: **Root-Whisper Village** (the tribe Cyrodilic
Collections resurrected — and Collections has 16 records), **Norg-Tzel**,
**Seekhat-Yol** (Keshu the Black Fin's birthplace), **Noota Nara**,
**Seaspring** (the village that keeps the tally of where Murkwood has been —
a lovely hook), **Branchgrove** (Rockpark's abandoned twin; Rockpark is
present).

Referenced in other records' prose but never instantiated:
**Lakemire Xanmeer** — the register's own "flagship underwater ruin",
cited as a *source* by six records and represented by the generic
`submerged-xanmeer-topmost`; and **Hutan-Tzel / Rockguard**, whose xanmeer
exists (`tended-xanmeer-clan-north`) but whose village does not.

Also: **Murkwood has an approach and no interior.** `murkwood-verge` is the
forest wall; there is no hidden-site record behind it for the Sunken Archive
and artifact quests to enter.

### A13. Eleven factions in the cast plan have no physical seat · **ADD**

Zero presence anywhere — not in `ownerFaction`, `occupants` or prose:
**Night-Reed Chapter** (the Thieves Guild line, *deep at Milestone 1* — no
den, no fence-den), **The Many-Root Conclave** (*deep at Milestone 1*; MR08's
council grove and MR10's finale venue have no rows — and **no "council grove"
record exists in the catalogue at all**), **The Sunken Archive**,
**Thorn Ash-Reed Accord**, **Salt-Teeth** (a pirate branch, in a region called
pirate-freeholds), **Root Stewards** (Hissmir's, referenced directly by LW01),
**Cult of Seth** (which guilds-and-orders calls "the province's best unclaimed
religious hook"), **Conclave of the One / of Riana / of Charity**,
**Ruction Ring / Circle of Champions**. **Marsh Charter** and **League of
Open Water** have substrate but no hall, board or registry.

Present but wrongly narrow: **Rootworm Waykeepers** hold a province-wide
transit order from three regions only; **An-Xileel** — the successor *state* —
has nine records, none in imperial-fringe, imperial-penal-south, saxhleel-coast
or pirate-freeholds; **Veiled Reed** (a main-quest alignment) has three;
**Unbound Root** three, all in one region; **Tribeless Naga** two, for "the
majority of the native brigands"; **Alten Corimont's canon Mages and Fighters
halls** are not on the Alten Corimont record. Only the **Nisswo** are
genuinely province-wide (21 records, all six populated zones) — that is the
model to copy.

Note this is largely the same defect as A5's `ownerFaction`: the faction
material is in the prose and untyped, so "which faction has no seat" cannot be
answered by a query today. Fix A5 and this becomes checkable.

### A14. ~15 named creatures with no place in the world · **ADD (cheap)**

The ecology feed (`world/sources/lore/topics/fauna-hazards.md`) names them;
the catalogue has no lair, nest, habitat or occupant line for:
**fleshflies** (the doc's own defining attritional hazard), **death hoppers**
(canon: a notably large population *around Gideon*), **shines** (canon: "loom
around the Imperial ruins of Lilmoth" — a sited creature with no site),
**geels-ha butcher eels**, **kotu gava**, **giant wasps**, **giant leeches**,
**hoarvor**, **Corimont mouth-plovers**, **Jassa Red slugs** (the
`slug-shaping-house` craft has no source site). Thin: **haj mota** (only a
shell-yard — no living population), **medusa** (named in passing at
murkwood-verge despite canon placing them in Murkwood), **lizard-steeds**
(two market records, no breeding ground for any of the seven named variants).

The pattern: **the ambient, attritional half of the danger model has no
spatial expression at all**, which contradicts the feed's own build
implication ("a high baseline attrition field with sparse but lethal
encounters"). Most of these want a `swarm-hollow` / `hazard-ground` dressing
row, not a dungeon — so this is largely A3 again, and cheap once A3 is
settled.

### A15. Nothing in the province is being built · **ADD (cheap, high flavour return)**

`type-recipes.json` defines statuses `under-construction`, `rebuilt` and
`reoccupied`; **all three have zero records**. The 729 places are active (565),
ruined (79), abandoned (43), drowned (19), seasonal (15) or contested (8).
A province recovering from the Flu, Umbriel and the Empire's withdrawal, with
no scaffold anywhere. Half a dozen rows fixes it, and it is one of the
cheapest ways to make the world read as *alive* rather than *preserved*.

---

## Consciously absent — checked, and fine

- **Districts (58 unused recipes).** Correctly Part 6/7 work. Record it in the
  freeze checklist so the next agent doesn't read it as a gap. (See A3.)
- **`visibleFrom` near-empty.** Deliberate, per the scour's no-long-sightlines
  finding; a Part 3 decision. Correct call.
- **Synod / College of Whispers light footprint.** Lore says they operate
  through intermediaries. 10 and 3 records is right. (Though the Synod's named
  building, "The Reckoning House", sits oddly against "no chapter, no hall".)
- **Four Winds concentrated at Stonewastes.** Lore-correct (hereditary).
- **`culture: nord` unused as a primary culture.** Nords are a minority
  population, not a settlement culture here — they need `occupants` and
  demographic shares (A8), not their own villages.
- **Supply chains terminate.** Checked: every major city has 10–27 inbound
  suppliers of mixed class. Helstrom has no *food-tagged* supplier but ten
  settlement suppliers — a reward-vocabulary artefact, not a broken chain.
- **Region reachability.** No region is isolated; naga-kur-deeps links to only
  two neighbours, which is the correct shape for the deep interior.
- **`magnitude` null on 180 records.** Correct — POIs below settlement scale
  have no magnitude.

## Lints worth a test each (found in passing, not absences)

- **5 malformed `travelServiceEdges`** use `.` where the README's convention
  requires `:` — `boat.alten-corimont-helstrom`,
  `boat.alten-corimont-stormhold`, `boat.chasecreek-corimont`,
  `ferry.archon-portdun-mont`, `watertaxi.archon-lower-town`. The last also
  uses an undeclared mode (`watertaxi`).
- **Socket ID formats are inconsistent** (bare slug / namespaced / tag-prefixed
  inside the string) — see A5.
- **The stronghold conflict is live**: §12b says one site;
  `xal-meeruth-station` claims it via `questHooks.provisions` and
  `the-empty-steading` via `sockets.marks: ["stronghold-site"]`. Note 0041's
  A/B question offers *Meeruth vs Rockpoint* — a third name. Reconcile before
  the owner is asked.
- **`rewardProfile.kinds` is uncontrolled** — 120+ distinct strings with
  obvious synonym pairs (`faction`/`faction access`, `loot`/`loot-cache`,
  `quest hook`/`quest-hooks`/`quest access`). `valueTier` was normalised by
  the enrichment pass; `kinds` was not.
- **Citation-path lint** (already noted in 0041) is still open.

---

## Recommended order of work

1. **A1 + A2 + A5** — one mechanical back-fill pass plus one authoring pass,
   in the shape of the enrichment pass that closed `relations`. This is the
   bulk of the register and it closes the "two regions did it, six didn't"
   failure mode for good.
2. **A6 + A7 + A8 schema fields** — `localStateVariants`, underwater access
   class + water-body refs, `demographics` + `tribe`. Cheap now; each is a
   full migration after Part 6.
3. **A9's `assetPlan` vocabulary + test**, then spend the Ayleid monumental
   kit and the Skyfall Hist variants.
4. **A10–A15 rows** — Deepmire, the Xal-Krona lair, the six secondaries, the
   eleven faction seats, the creature grounds, the construction sites.
5. **A3 + A4** — decide where the dressing tier lives, then place the rural
   social functions. This is the largest and the most deferrable.

Re-run this critic after (1) and (2); the brief says repeat until it returns
little, and it currently returns a lot.
