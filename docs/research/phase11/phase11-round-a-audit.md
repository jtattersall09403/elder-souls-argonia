# Phase 11 Round A — module 97 audit of the five exemplar blueprints

Reviewer pass of 2026-09-05 applying [module 97](../../world/97-placement-principles.md)
to the five exemplars in `world/sources/blueprints/`. Method: `blueprint --check`
and `compile_settlement` per blueprint (the HARD and WARN checks §G lists),
then the reviewer-judged principles of Parts B–F read against each design
record. Every fix was made in the blueprint by design; nothing was weakened.
Each kept deviation is one line in the record's "Deviations from module 97"
section. End state: all five `blueprint --check` OK, all five
`compile_settlement` 0 errors, prose linter 0 hard hits on blueprint ids and
on the five `.md` files. `export_blueprints` / `apply_sitings` were not run.

Verdict key: **met** · **fixed** (changed in this pass) · **recorded** (a
deviation kept, with its reason in the record) · **open** (owner question).

## 1. Mazzatun (`place.dunmer-north.mazzatun`, M3, stone + mud + works)

Start state: `--check` OK (the works district already declared
`routing: "straight"` with its why), compile **12 errors**.

| Principle | Verdict | Note |
|---|---|---|
| C5 spacing (11 pairs under 8 m) | fixed | The staging yard was re-laid: cutting floor against the western rise where the shelf runs out into rock; hoist between the cut face and the half-cut blocks (`abuts` both: mine scaffold against mine rock, the working face); the two-sided and four-sided stockade bases plus their stair as one declared assembly (`abuts`); kiln to the stream lip, downwind and downstream; scaffold-a into the west lobe. Pens: the east shell moved along the lane and its door and socket with it; the east course a metre toward the lip; the pen fence loses its east leg. Course-w1 a metre west. |
| B3 slope ladder (course-n2 Δ 2.27 as `pad`) | fixed | `dug-in`; the kiln (Δ 3.2 on the lip) `dug-in`; the scaffold stair `stilt`. |
| C3 widths | fixed / recorded | Terrace track 2.2 → 2.5 m. Roads stay 3.0 m: the gate piece's opening and the cut on a 47° face set the width; recorded. |
| B6/D2 first-seen (conduit head not visible from the road's first waypoint) | fixed | The haul road now starts on the east side of the Hist court (2075, 1355), from which the compiler's line of sight to the pillar is clear; from the foot of the face the rock hid it. |
| D2 tower vs canopy on the shoulder approach | recorded | Downward sightline onto a hard-cleared shelf; the canopy figure is the palette's tallest species beside the walker, not on the ray. |
| C7 use mix (0 % dwelling, 81 % work) | recorded | Lore: the tribe lives underground; the shells are pens. |
| C8 yaw diversity | met | `routing: "straight"` declared with a grid-culture why; the record's stale yaw table corrected. |
| C1 kit purity; Part F argonian-stone "never new stone" | met / recorded | Three sets in three districts; Mazzatun is the lore's one exception. |
| Part F neutral-works enclosure (the Nordic timber gate) | open | Q8 in the record: keep the works' gate or an Ayleid arch on the middle step. |
| C4 centre, D4 authority high and last, D3 gate spans, D9 combat, C15 Hist below | met | |
| B4 flood section | met | Shelf 4.1 m above the table, band 0. |
| C12 dressing | open (G18) | No pass exists. |

## 2. Lilmoth (`place.mercantile-coast.lilmoth`, M5 city)

Start state: `--check` OK, compile 0 errors. The record's Q5 ("works-v1 not
built, the board cannot be placed") was stale: `works-v1.kit.json` and
`works-v1.footprints.json` both carry `bmv:advertising_board` (1.57 × 1.39 m,
2.47 m) and the committed blueprint already places `parcel.lilmoth.dues-board`
opposite the licence house door in its own works district. Record corrected
(eight districts, 54 parcels), no blueprint change.

| Principle | Verdict | Note |
|---|---|---|
| C5, C8, C9, D1–D3, D7, E1 | met | Gate pieces declare `abuts`; council crown `routing: "straight"`; three approaches with measured lines of sight. |
| C7 civic 20 % | recorded | A capital's offices and civic pieces. |
| C4 market between gate and Hist | recorded / open | Gate → Hist court → market deck; C2 puts the Hist on the crest, which is the ground nearest the gate, so C2 and C4 conflict on this site. |
| Part F stilt enclosure "none" | recorded | The estuary pole wall is Lore:Lilmoth's own detail. |
| B4 dwellings in the flood band | recorded | Pusbottom is the low quarter by name and lore; over-water share unmeasured (G8). |
| C1 district of one piece (the board) | recorded | A works prop needs its own kit set under the current sets. |
| B5 dock depth by hull class | met | Candidate table records the shallow shelf as the feature. |
| D7 honesty of scale | open | 54 parcels for an M5; the register's M5 band (150–400 structures) and the Morrowind ratio (Balmora ≈ 40) disagree; the record argues the ratio. |
| E4 stilt-house interior | recorded | Q3. |

## 3. Nine-Trunks (`place.hist-heartland.nine-trunks`, M3 Hist village)

Start state: `--check` OK, compile 0 errors. No blueprint change.

| Principle | Verdict | Note |
|---|---|---|
| C6 density 3.3/ha | recorded | Boundary carries spur, pool, pier and pitch; the ring is 0.14 ha; spacing (14.4 m chord) meets C5 exactly. |
| C7 mix | recorded | Fourteen parcels; each is 7 %. |
| C10 / Part F mud enclosure "pens only" | open | The closed ring of trunks, huts and panels is the signature feature; owner to say whether it is edge or enclosure. |
| D2 trunk 31 m vs region canopy 36.1 m | recorded | Local canopy on the ray is 10.6 m mangrove (measured). |
| C2 mud grammar (huts face the common), C15, C8, C9, D1, D3, D9, D7 | met | |
| C7 uxith | recorded | The egg-tenders' hut, not a separate structure. |

## 4. The Licensed Stage (`place.hist-heartland.sap-tapping-licensed`, M1 camp)

Start state: `--check` OK, compile 0 errors (the brief's "C5 gap failures"
were already resolved in the committed file: the stair declares `abuts`).

| Principle | Verdict | Note |
|---|---|---|
| E3 kit grammar (top tier on the three-sided base) | fixed | `parcel.sap-tapping-licensed.stage-deck` added with `stacksOn` the footing; the record's "stacksOn does not exist" was stale. The stair moved 0.6 m landward so the ground hulls stop overlapping; the deck declares `abuts` the stair; the track's last waypoint pulled back so it dies at the stair's landward face. |
| C6 34.6/ha | recorded | An M1 camp judged on the M2 band with a stacked deck counted as a building. |
| D3 no gate, B6 canoe approach unmeasured | recorded | |
| C12 no hearth | open (G18) | A camp of three has no fire; belongs to the dressing pass. |
| C1, C2 works grammar, C15 (licensed tapping), D1, D2, D9, E5 (tent shell) | met / recorded | Tent-as-interior stays Q2. |

## 5. The Standing Charge (`place.naga-kur-deeps.wamasu-pond-adult`, D5 lair)

Start state: `--check` OK, compile 0 errors.

| Principle | Verdict | Note |
|---|---|---|
| E3 kit grammar (stand deck) | fixed | `parcel.wamasu-pond-adult.hunters-stand-deck` with `stacksOn`; the stand path ends at footing and deck; `buildingsPlanned` 2 → 3 because the validator counts the stacked parcel (said so in the `why`). |
| C6 0.5/ha | recorded | A lair is not a settlement. |
| D2 pole as first-seen | recorded | Breadcrumb rule under a 0.93 canopy (lair rule 2). |
| D3 no gate, B6 knoll approach unmeasured | recorded | |
| C1 three kit sets on a lair | recorded | Districts as kit-set containers. |
| B2 (water first), B7 (pool depth request), D6, D9, C13 | met | |

## 5b. Concurrent change during this pass (blocking, not mine)

Between my last clean run and the final verification, another agent's
in-flight work left 25 worldgen files dirty. Its uncommitted edits
to `worldgen/blueprint.py` added a REQUIRED `networkTerminals[]` block and a
"97 C-stitch" HARD rule. Every `approaches[].fromRouteId` must name a
terminal's `routeId`. A road-reached place needs at least one terminal. None of the five blueprints
has ever carried the field, so `blueprint --check` and the compile's schema
stage now fail on all five for that reason alone. Everything above was verified
clean immediately before the rule landed; the terminals belong to whoever
owns that schema change (the blueprints and the rule should move together).

## 6. Tool defects found (not fixed here; tools are out of scope)

1. **97 C5 measures authored centres, not hulls.** Off-pivot pieces
   (`arstairs01`, `arstatuewall01`, `arstairscenter01`, `arsteppeddias01`:
   pivots 8–20 m from their hulls) make centre distance meaningless; moving
   the pens stair west by 2.7 m dragged its hull into the statue wall. The
   check should use the derived footprint centroid (or hull-to-hull gap).
2. **`parcel-overlap` tests a `stacksOn` piece's ground hull against every
   neighbour.** A deck at 2.7 m does not touch the ground; it should be exempt
   from ground-hull overlap with anything its base `abuts`, or tested at deck
   height.
3. **97 C6 density uses the blueprint boundary** (which carries approaches and
   water) and applies settlement bands to lairs and camps (M1 judged on the M2
   band). Measure over the built hull and skip non-settlement classes.
4. **97 D2 compares against the region palette's tallest species** rather
   than the canopy on the ray. It also ignores sightline direction (a downward
   view onto a cleared shelf is flagged).
5. **`scaleGrounding` counts stacked parcels as buildings**; the Standing
   Charge had to declare 3 for two structures.
6. **The prose linter's `final-preposition` rule fires on hard-wrapped
   markdown lines and on stripped code spans** ("run from `x`" → "run from");
   14 of 24 md hits were of that kind. Lint on paragraphs, not lines.

## 7. Principles that needed clarifying (for the owner)

1. **Props versus buildings (C5, C6, C7, C12).** Racks, ovens, carts,
   scaffold bases, hoists and notice boards are authored as parcels, so the
   8 m spacing floor, the density band and the use histogram treat a works
   yard as a village. C12 says the props *are* the trade. Either a parcel
   flag (`prop: true`, exempt from C5/C6/C7 and counted by C12), or a rule
   that props live in the dressing layer.
2. **Kit purity versus dressing (C1).** A works-v1 notice board in an
   Argonian quay forces a district of one piece (Lilmoth, the Licensed
   Stage). Should `works-v1` props be admitted to every kit set as the neutral
   dressing kit, with only its *structures* held to `neutral-works`?
3. **C2 versus C4 in an Argonian place.** "Hist on the highest dry spot"
   and "market a deck between gate and Hist" cannot both hold when the high
   ground is nearest the gate (Lilmoth). Which yields?
4. **C10 "Argonian enclosure: none" versus signature rings.** Nine-Trunks'
   closed ring of trunks, huts and panels is the catalogue's signature and
   the tribe's count of nine trees; the mud grammar says pens only.
5. **What "designed to touch" covers (C5 `abuts`).** Kit snap pairs (stair
   on base, base on base) are clear; a hoist against the rock face it works,
   or an oven beside its rack, are trade contacts, not kit snaps. This pass
   used `abuts` for the mine scaffold against the mine rock piece (same
   vanilla set) and not for the oven and rack (moved apart instead).
6. **Scale honesty for the M5 (D7).** The settlement register's M5 band
   (150–400 structures) against the Morrowind ratio (Balmora ≈ 40; Lilmoth
   54). One of the two is the rule.
7. **Enclosure pieces in `neutral-works` (Part F: scaffold rails only).**
   The only road-spanning gate in the built kits is a Nordic timber
   walkway gate; Mazzatun uses it. Either the works set admits a gate, or
   the stone district gets an Ayleid arch and the threshold moves.
8. **Width rule against kit openings (C3).** A 4.3 m spine cannot pass a
   3 m gate opening; the rule should say the gate piece sets the width
   through it.
