# Phase 11 catalogue critique — variety, distinctiveness, sameyness

**Date:** 2026-09-02 · **Scope:** `world/sources/catalogue/places-*.json` (729
records, 8 regions) + `type-recipes.json`, judged against decision
[0041](../../../decisions/0041-phase11-settlement-decisions.md) — the five-rung
distinctiveness ladder, the breadth rule, the anti-sameyness quotas, the
equal-richness ruling and the entrance-decoupling ruling.
**Adversarial brief:** does this read as one province of distinct regions, or
as a list?

**Verdict: PASS WITH FIXES.** The macro structure is genuinely good — 236
types across 10 classes, 234 used, types spread so thinly across regions that
only **138 same-type-same-region pairs exist in the entire province**, and the
eight majors are strongly, individually authored. The failures are all in one
layer: the **`vibe` block**, which is where rungs 2–5 of the ladder actually
live. Three regions ship it as a region-level constant or a stub, and the
worst offenders are the two regions the enrichment pass just "fixed". Nothing
here needs re-derivation; all seven findings are field-level edits.

---

## F1 — CRITICAL. Two regions have a *region-constant* palette, materials and senses: 175 records (24 % of the province) are visually copy-pasted

`palette`, `materials` and `senses` are the three fields that decide what a
place *looks and feels like on screen*. In two regions they are not authored
per place at all:

| Region | n | distinct `palette` | distinct `materials` | distinct `senses` | modal palette share |
|---|---|---|---|---|---|
| dunmer-north | 84 | 84 | 84 | 84 | 1 % |
| imperial-fringe | 108 | 108 | 108 | 108 | 1 % |
| pirate-freeholds | 53 | 53 | 53 | 53 | 2 % |
| saxhleel-coast | 99 | 99 | 99 | 99 | 1 % |
| **hist-heartland** | **110** | **3** | **3** | **3** | **98 % (108×)** |
| **naga-kur-deeps** | **65** | **2** | **2** | **2** | **98 % (64×)** |
| imperial-penal-south | 70 | 70 | 0 (absent) | 0 (absent) | 1 % |
| mercantile-coast | 140 | 140 | 0 (absent) | 0 (absent) | 1 % |

108 of hist-heartland's 110 records carry the byte-identical string:

> `"palette": "wet green-black under a closed canopy, amber sap, red bioluminescent Hist flower, pale root-wood, mud-grey"`
> `"materials": "living root, woven withy, mud-and-wattle, thatch, tended xanmeer stone left unquarried"`
> `"senses": "root-hum felt through the feet, bone and tin chimes, sap-sweet air over standing water, no horizon"`

64 of naga-kur-deeps' 65 do the same with `"black standing water, olive and
bone, blue bioluminescence, bleached grave-stakes, no red"`.

This is the "list, not a province" defect in its purest form, and it is worse
than a variety problem — it **breaks rung 3 for the province's capital**.
Helstrom, an M5 hero-Hist capital, shares its palette, materials and senses
verbatim with 107 lesser places in its own region. A signature that 107 other
records also have is not a signature.

Note the irony: these are exactly the two regions the 2026-09-02 enrichment
pass thickened (`why` 309 → 729 chars). The pass measured prose length and
missed that the *visual* fields were region constants. Richness parity was
declared closed on the wrong metric.

**Fix:** author `palette`/`materials`/`senses` per record in hist-heartland
and naga-kur-deeps, using the current region string as the *envelope* it was
clearly intended to be — each record varies 1–2 terms against it (what this
place adds, subtracts or has gone wrong with). Then add a lint: no
`vibe.palette` string may appear on more than ~3 records province-wide.

---

## F2 — CRITICAL. `mercantile-coast` and `imperial-penal-south` are not "5-key vibes" — they are effectively 3-key stubs, and they include three of the eight majors

0041's leftover note calls this "5 keys where the rest write 8". The real gap
is larger, because two of the five keys are shipped as empty strings:

| Region | vibe keys declared | median **non-empty** | median chars | empty `approach` | empty `condition` |
|---|---|---|---|---|---|
| dunmer-north | 8 | 8 | 612 | 0 | 0 |
| hist-heartland | 8 | 8 | 601 | 0 | 0 |
| naga-kur-deeps | 8 | 8 | 592 | 0 | 0 |
| imperial-fringe | 8 | 8 | 570 | 0 | 0 |
| pirate-freeholds | 8 | 8 | 375 | 0 | 0 |
| saxhleel-coast | 8 | 8 | 351 | 0 | 0 |
| **mercantile-coast** | 5 | **3** | **181** | **124/140** | **140/140** |
| **imperial-penal-south** | 5 | **3** | **185** | **62/70** | **70/70** |

So 210 records — **29 % of the province** — carry roughly **one-third** the
visual authoring of the other 519, with `silhouette`, `materials` and `senses`
absent entirely and `condition` empty in every single one. Example, in full:

> **The Alessian Hull** (mercantile-coast) — `signatureFeature`: "A ram-bowed
> hull standing upright on the bottom with its ribs open like a lantern…";
> `palette`: "Green water, black timber, white sand."; `mood`: "Still,
> cathedral-quiet."; `approach`: `""`; `condition`: `""`.

The damage lands on the majors. **Lilmoth, Soulrest and Blackrose — three of
the eight — have no `silhouette` field at all**, while a D2 caretaker ruin
(Bogmother, dunmer-north) has a fully authored one. Rung 3 defines a signature
as "architecture family + palette + **silhouette motif** + landmark + ritual";
the province's second city cannot state its silhouette.

**Fix:** back-fill the three missing keys across both files (Lilmoth,
Soulrest, Blackrose and the other M3+ records first), and drop `condition: ""`
rather than shipping an empty key — an empty string is worse than an absent
one because it defeats a presence check.

---

## F3 — HIGH. Same-type instances share four vibe fields *and* their whole assetPlan: 109 of 138 same-type pairs (79 %) have an identical asset set

The type roster is well spread, so there are only 138 same-type-same-region
pairs province-wide. But those pairs are near-twins. Worst cluster —
`naga-highway-camp`, four instances, **verbatim-identical `silhouette`,
`palette`, `materials`, `senses` and `assetPlan`**:

> All four: `silhouette` "a smoke plume and a palisade line commanding a road
> bend or a river bend" · `assetPlan` `["market-tents","stockade-scaffold","totems-ritual","clutter","fences-wattle"]`
> The Left Camp — mood "a business model outlived by its own infrastructure"
> The North Cut Camp — mood "businesslike banditry"
> The Reed Gate Camp — mood "imitative and dangerous"
> The Deck Camp — mood "parasitic and complicit"

The *stories* are excellent and genuinely distinct (a dead camp, an honest
toll, a forger of the toll, a camp built under the road). The *screenshot* is
four identical camps. That directly fails the quota "any two instances of the
same template within 2 km must differ on ≥3 axes" — they differ on zero
visual axes.

Similar: `hist-village` Nine-Trunks vs Sleeps-In-The-Ring (vibe similarity
0.66, asset Jaccard 1.00); `stilt-village` Reed-Stand vs Black-Piles (0.66,
1.00); `hermit-hut` The Set-Aside Hut vs The Talker (0.65, 1.00). 49 of 138
pairs exceed 0.45 text similarity.

**Fix:** the anti-sameyness quota needs to be a *validator on the catalogue*,
not a Part 3 aspiration — flag any same-type pair whose assetPlan Jaccard is
1.0 and whose vibe similarity is >0.45, and require the author to vary at
least one of silhouette/palette/assetPlan. Cheapest lever: give each instance
a different 6th/7th asset pool and one altered palette term.

---

## F4 — HIGH. Dungeon entrances are monotone; the module 70 §47 vocabulary is essentially unused

The 2026-09-02 entrance-decoupling ruling exists specifically so entrances
can be "trapdoor, hollow trunk, underwater entry, sinkhole, burrow, xanmeer
stair-throat, well, grave-cut…". Word frequency across all 729 records'
`vibe` + `why` text:

| term | hits | | term | hits |
|---|---|---|---|---|
| trapdoor | **0** | | stair-throat | **0** |
| hollow trunk | **0** | | grave-cut | **0** |
| underwater entry | **0** | | burrow | 2 |
| sinkhole | 8 | | root hollow | 2 |

Across the 159 `lair` + `ruin` records, entrance-word hits are: mouth 15,
door 8, crack 6, arch 3, gate 3, stair 2, dive 2, swim 2, tunnel 2, grave 1,
hatch 1, well 1, trunk 1 — i.e. **most dungeon-bearing records describe no
entrance at all**, and "mouth" is the dominant answer where one exists. Nine
records share the identical silhouette `"a root mouth at the base of a rise,
breathing warm air, with a worn approach"`. All six hist-heartland
`root-hollow-gallery` records are entered through "a mouth":

> The Fallen Nine — "A slumped **mouth** with old rope still tied off at the lip."
> The Severed Branch — "A **mouth** with the approach marks scrubbed off…"
> The Long Throat — "A **mouth** in a ravine wall with the first verse…"
> The Drowned Stair — "A **mouth** at water level that you enter swimming."
> The Underway — "A worn root **mouth** at the Helstrom gate…"
> Lantern Hollow — "A tended path to a **mouth** with a fungus-drying rack…"

The ruling landed after the derivation and nothing was revisited. This is the
single cheapest high-yield fix in the critique.

**Fix:** add an explicit typed `entrance` field to the record schema (it does
not exist today — the union of 40 top-level keys has no entrance slot) with
the §47 vocabulary as an enum, and assign one per dungeon-bearing record with
a distribution quota (≤25 % any one entrance type per region). Prose alone
will not hold this.

---

## F5 — HIGH. Zero region-exclusive asset pools: 37 pools serve all eight regions, and the Dunmer region is 93 % non-Dunmer at the asset level

Rung 2 requires two regions to be distinguishable from a single screenshot.
The `assetPlan` field is what becomes actual geometry, and it carries **no
regional signal whatsoever**:

- 37 distinct pools province-wide; **every region uses a subset of the same
  set, and no region has a single exclusive pool.**
- `clutter` appears on 87–100 % of records in every region (682/729).
  `stockade-scaffold` 31–54 % everywhere. `totems-ritual` 20–60 % everywhere,
  including 25 % of imperial-penal-south and 28 % of imperial-fringe.
- **dunmer-north uses `dunmer-telvanni` on 6 of 84 records (7 %)** — ranked
  21st of its 37 pools — while `mud-mother-grove` (the Argonian mud culture)
  is its **third** most-used pool at 30/84 (36 %) and `vanilla-farmhouse` is
  used 22×. The region defined by Dunmer settlement is, at the asset level,
  an Argonian-mud region with an Imperial farmhouse habit.
- `mud-mother-grove` also runs at 25 % in imperial-fringe and 26 % in
  mercantile-coast, which brushes the two-never-blend building-culture rule in
  `material-culture.md`.

The prose distinctiveness is real (F8 below shows the cultural word-signals
separate cleanly). It just isn't backed by anything that will be *built*.

**Fix:** (a) declare a per-region **dominant/forbidden pool list** in the
catalogue README and re-weight assetPlans against it — `dunmer-telvanni`
should be dunmer-north's signature pool, not its 21st; (b) split `clutter`
into culture-scoped variants (`clutter-argonian`, `clutter-imperial`,
`clutter-dockside`) so the most-used pool in the province stops being a
neutral constant; (c) enforce the never-blend rule as a validator pairing
`culture` against permitted pools.

---

## F6 — MEDIUM. Naming has no regional register: 71 % of all named places begin "The ", uniformly, and the Argonian register is inverted

455 of 637 named places start with `The `. Per region: mercantile-coast 64 %,
hist-heartland 67 %, imperial-fringe 67 %, dunmer-north 72 %,
imperial-penal-south 77 %, naga-kur-deeps 80 %, pirate-freeholds 80 %,
saxhleel-coast 87 %. There is no register difference between an Imperial
records town and a Naga highway camp.

Worse, the Argonian hyphenated register (`Sleeps-In-The-Ring`,
`Nine-Trunks`) is distributed backwards: hist-heartland 29, mercantile-coast
19, naga-kur-deeps 16, dunmer-north 5, imperial-fringe 5, imperial-penal-south
4, **pirate-freeholds 1, saxhleel-coast 1** — the *Saxhleel* coast has one
Saxhleel-register name in 39.

Commonest final words: Camp ×27, House ×24, Ground ×16, Village ×12,
Stage ×11, Yard ×10. And **14 outright duplicate names** collide across
regions — "The Rat Gallery", "The Pull", "The Drag", "The Swallow", "The Shut
Door", "The Bled Tree", "The Turning House", "The Carrying House", "The
Poling Relay", "The Charged Pond", "The Divers' Yard", "The Broken Bond",
"The Pulled Field", "The Tempering Ground". Names are journal/map-facing
strings; duplicates are a defect regardless of variety.

**Fix:** set a per-region naming register (Argonian hyphenated-verb for
saxhleel-coast and the interior; Nibenese Latinate for imperial-fringe;
sailor's-shorthand for pirate-freeholds), cap `The ` at ~35 % per region, and
add a uniqueness lint on `name` alongside the existing ID lint.

---

## F7 — MEDIUM. `saxhleel-coast` and `pirate-freeholds` leave 92 records unnamed; `imperial-penal-south` has the weakest cultural signal in the province

92 of 729 records carry a `namingRule` instead of a `name`, and they are not
spread — **60/99 in saxhleel-coast and 32/53 in pirate-freeholds**; the other
six regions are at 0. Two regions therefore also skip F6's register question
entirely. Combined with F2 and F6, saxhleel-coast is the province's
lowest-identity region despite being its cultural namesake.

Cultural word-signal per region (share of records mentioning each register's
vocabulary):

| region | dunmer | nibenese/imperial | argonian | pirate |
|---|---|---|---|---|
| dunmer-north | **32 %** | 7 % | 23 % | 8 % |
| imperial-fringe | 5 % | **44 %** | 17 % | 2 % |
| hist-heartland | 7 % | 7 % | **99 %** | 3 % |
| naga-kur-deeps | 6 % | 3 % | 38 % | 4 % |
| saxhleel-coast | 6 % | 18 % | 28 % | 8 % |
| mercantile-coast | 10 % | 27 % | 20 % | 2 % |
| pirate-freeholds | 18 % | 16 % | 15 % | **16 %** |
| **imperial-penal-south** | 2 % | **15 %** | **4 %** | 2 % |

**Cross-region flavour passes where it matters most**: dunmer-north really is
Dunmer-inflected (32 % vs 5–10 % elsewhere) and imperial-fringe really is
Nibenese (44 %). But **imperial-penal-south reads as nothing** — the lowest
signal on every axis, in a region whose entire premise is an Imperial penal
colony sitting on Argonian ground. And pirate-freeholds' pirate signal (16 %)
is barely above dunmer-north's (8 %).

**Fix:** name the 92 unnamed records under the F6 registers; raise
imperial-penal-south's Imperial-vs-Argonian friction explicitly in `why` and
`vibe` (it is the province's clearest colonial-tension region and currently
its blandest).

---

## F8 — LOW, but free. `azure-tree` is a typo for `azura-tree`, splitting one asset pool in two

`azura_tree02.nif` (BM&V's monumental sacred tree, per
`settlement-asset-inventory.json`) is referenced as `azura-tree` 22× and
`azure-tree` 15×, across six place files *and* `type-recipes.json` (7 vs 3).
A downstream asset resolver will silently drop 15 records' hero-tree
silhouette mass.

**Fix:** global rename `azure-tree` → `azura-tree` in the seven affected
files; add the 37 pool names to a registry so unknown pool IDs fail `npm test`.

---

## What is genuinely strong (do not "fix" these)

- **The eight majors are individually excellent and pairwise distinct.**
  Gideon ("The Records Court: a stone archive whose ground floor floods every
  monsoon, so the province's history is stored on the first floor and up a
  ladder"), Helstrom ("the grove canopy IS the fortification"), Stormhold
  ("three worked openings in the ravine walls, lit blue, with hoists running
  into them"), Thorn ("the Hist outside the walls — a tree the city depends on
  and deliberately did not enclose"), Alten Corimont ("the town is built out
  of other people's cargo") could not be confused in a screenshot. No two
  majors blur. Gideon does **not** read like Helstrom.
- **`signatureFeature` is 729-for-729 unique**, and `approach` is 543-for-543
  unique. Where the authors wrote per-place, they wrote genuinely per-place.
  `mood` has only 4 records sharing a string. The problem is confined to the
  three fields recipes were pasted into.
- **Type spread is very good**: 234/236 types used, and only 138 same-type
  pairs exist within a region at all — the ≤25 %-per-template quota is
  comfortably met at the *type* level. The sameyness risk is asset-level and
  vibe-level, not taxonomy-level.
- **Class balance is broad**: settlement 140, works 82, ruin 80, lair 79,
  transit 73, sacred 68, lone 68, civic 58, camp 50, martial 31 — no class
  dominates, and `works`/`transit` being second and fifth is exactly the
  breadth rule working.

## Fix list, in cost order

1. `azure-tree` → `azura-tree` (7 files, minutes). **F8**
2. Name-uniqueness lint + palette-uniqueness lint in `npm test`. **F1/F6**
3. Add typed `entrance` field + §47 enum; assign across 159 lair/ruin
   records with a per-region quota. **F4**
4. Back-fill `silhouette`/`materials`/`senses` on mercantile-coast and
   imperial-penal-south (210 records), majors first. **F2**
5. Per-record `palette`/`materials`/`senses` in hist-heartland and
   naga-kur-deeps (175 records). **F1**
6. Per-region dominant/forbidden asset-pool lists + culture-scoped `clutter`;
   re-weight dunmer-north toward `dunmer-telvanni`. **F5**
7. Naming registers per region; name the 92 unnamed. **F6/F7**
8. Same-type twin validator (assetPlan Jaccard 1.0 + vibe sim >0.45). **F3**
