# Type 1: road station or hamlet (skeleton; the rest is written from Claywater Station in slice 1c)

Covers the road-station village, the road stage and the flood-high hamlet
(16k § The type list, row 1). First place: Claywater Station
(`place.imperial-fringe.claywater-station`), an Imperial well and an
Argonian landing facing each other across the Gideon–Blackwood trunk.

## Cultures: two halves facing each other (97 Part F)

Read the grammar as two halves on one road, not a village of either
culture alone (16k § Gotchas).

| Half | Part F row | Plan unit | Centre | Spacing p50 | Orientation | Enclosure | Water | Never appears |
|---|---|---|---|---|---|---|---|---|
| Imperial (the well) | `imperial` (97 :761) | planted grid, straight surveyed street, plots with frontage | the well at the first junction off the road | 12–15 m | front to the street | `enclosure-v1` Whiterun farm-fence family for yards and fields; the newcastle curtain only where a gate is built | on the bank; visibly subsiding into marsh soil | organic lanes, stilts, reed |
| Argonian (the landing) | `argonian-mud` (97 :758) as briefed; the zone (`imperial-fringe`) fits neither `argonian-mud` (Shadowfen and the north) nor `argonian-stilt` (Murkmire and the coasts) | compact cluster on the dry point, huts to the common | open common; the clay oven | 12–14 m | front to the common, long axis on the contour | pens only; no fence or wall (L16) | on the dry point; causeway access | stilt platforms over open water, reed walls, stone |

The Argonian half's kit is chosen in the design brief with its founding
reason (97 C1: two kits in one place need one), from Claywater in slice 1c.
`neutral-works` (97 :763) serves the landing's works yard if it has one.

## Recipe (`world/sources/catalogue/type-recipes.json`)

| Type | Mag | Cue | Props | Siting | Danger | Asset plan |
|---|---|---|---|---|---|---|
| `road-station-village` | M2, simple | on the road, visible from both approaches | a lettered signpost, a stable, a fire always lit | any firm ground, ford, saddle; on the road, at water | D1–D2 | vanilla-farmhouse, signage-blank, landmark-civic, fences-wattle, clutter, market-tents |
| `road-stage` | M1, trivial | on the road, visible from both approaches, with a fire | a well, a fire, a milestone, cart ruts that stop where the road failed | firm ground, saddle, ford, flood-high; ≤ 300 m from the route | D1–D2 | vanilla-farmhouse, landmark-civic, signage-blank, market-tents, clutter |
| `flood-high-hamlet` | M2, simple | structures on the only high ground in a flat view | flood marks on posts, boats stored for the wet season | flood-high, oxbow, confluence; above the seasonal maximum | D2–D3 | mud-mother-grove (retired hut), vanilla-shackkit, fences-wattle, clutter |

Satellite slot for all three: the next milestone or a flooded former site
200–400 m off. The asset plans predate the kit pool: `fences-wattle` in an
Imperial or Argonian half and the retired `mud-mother-grove` hut are
record defects (L03), fixed as rule gaps in step 0.

## Lore to read

- `world/sources/lore/topics/roads-and-routes-4e201.md`: what state the road is in and who keeps it.
- `world/sources/lore/topics/foreign-powers.md`: Imperial presence on the fringe and who runs a station.
- `docs/research/lore/minority-enclaves-lore.md`: why an Imperial community sits as an enclave (97 A11).
- `world/sources/lore/topics/material-culture.md` § Building, § Boats and waterway travel, § Society: the Argonian half's houses, craft and offices.
- `world/sources/lore/extrapolation/settlement-register.md`: the magnitude ladder and the place's 4E 201 status.
- `world/sources/lore/topics/hist-placement.md` § 2 R4: a village with no Hist says why.

## Bars

Read the type object and the M2 tier object from
`world/sources/placement/breadth-bars.json` (16k § 1b; not yet written
at this sheet's seeding) and 0098 § 1 (hamlet 4–6 or village 7–12
buildings). Copy the numbers here in slice 1c.

## Gate rows and their asset pools (16k § The checklist, :121-129)

| Gate row | Pool |
|---|---|
| Seated, joined; doors as transitions; windows at night; paths to every door; ground-to-wall blend; pads, retaining walls, steps | the kits in the brief; ground texture `Ground050` |
| Enclosure (Imperial half) | `arch.neutral.fence-and-enclosure`; vanilla farm fence (16) |
| Yard dressing vocabulary | the vanilla farm dressing set; `prop.neutral.works-and-industry` |
| Lights by time of day | `light.neutral.fixtures` |
| Fire and smoke | vanilla woodfires (15); `fxsmokechimney01/02` |
| Water edge (the landing) | `boat.argonian.native-craft`, `boat.mixed.watercraft`; docks (13); `prop.neutral.fishing-and-water-trade` |
| Idle occupants | the 16g NPC roster for the place; vanilla idles |
| Seen from a distance | `fxambwindowglow01`, `wrlodwindowglow01`, `fxsmokechimney01/02` |

## Approach (openworld-approach-and-wayfinding §5)

The 16 questions are answered in the place's design brief; the type's
usual answers are written here from Claywater in slice 1c. Known for the
type: the recipe's cue is "visible from both approaches", so questions 1,
2 and 3 are answered for both directions of the road.

## Building minimum set and yard sets

Per dwelling (0098; building-depth §2): door, light, roof detail,
windows unless none by design, at least 5 personal clutter. The yard sets
per building kind (well house, stable, dwelling, landing, works yard) and
their pieces are written from Claywater in slice 1c.

## Pieces that worked, pieces that failed

Written from Claywater in slice 1c.

## Known failure modes

Lessons that bit this type: written from Claywater in slice 1c. Expect
L03 (the record's asset plan), L16 (enclosure per half), L31 (the
landing's stage reaching dry ground, if the landing gets a stage).
