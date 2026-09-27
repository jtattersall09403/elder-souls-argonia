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

## Gate rows and their asset pools (16k § The checklist)

| Gate row | Pool |
|---|---|
| Seated, joined; doors as transitions; windows at night; paths to every door; ground-to-wall blend; pads, retaining walls, steps | the kits in the brief; ground texture `Ground050` |
| Enclosure (Imperial half) | `arch.neutral.fence-and-enclosure`; vanilla farm fence (16) |
| Yard dressing vocabulary | the vanilla farm dressing set; `prop.neutral.works-and-industry` |
| Lights by time of day | `light.neutral.fixtures` |
| Fire and smoke | vanilla woodfires (15); `fxsmokechimney01/02` over the yard fire only, at the mined `fire` socket (`kit-mounts-mined.json` `effectSockets.sockets.fire`: campfire01burning n 23, 1.0 m up; impbrazier01 n 7, 0.45 m up). The farmhouses take no chimney smoke: farmhouse01/02 have no chimney and vanilla smokes neither (chimney socket n 1 / 0; 16k fix 2 round 6 ruling E1) |
| Water edge (the landing) | `boat.argonian.native-craft`, `boat.mixed.watercraft`; docks (13); `prop.neutral.fishing-and-water-trade` |
| Interiors (tier A, 0103) | the Imperial half's linked shells (below); the interior kit built from the claimed cells (`interior-farmhouse-v1` for the farmhouses) |
| Idle occupants, items, containers, ambience | the 16g NPC roster for the place (`npc` and `idle` sockets); the vanilla farm dressing set's barrels, sacks and chests (`container` sockets from the yard sets); vanilla idles |
| Seen from a distance | `fxambwindowglow01`, `wrlodwindowglow01`, `fxsmokechimney01/02` |

## Interiors (0103 decisions 1–2; `references/doors-interiors-sockets.md` §2)

Every lived-in building of this type (the station house, the inn or
stable where the record promises one, the homes on both halves) takes a
shell a plugin links to a furnished cell; the fit rule picks the cell.
Linked-cell counts in `exterior-interior-links.json` for the shells this
type draws on (orientation 2026-09-26, `tooling/.reports/16k/orient-interiors.md`):

| Shell | Linked furnished cells | Half |
|---|---|---|
| `vanilla:architecture/farmhouse/farmhouse01` (and its `-with-door` composite, which inherits the links) | 11 | Imperial |
| `vanilla:architecture/farmhouse/farmhouse02` (and its composite) | 9 | Imperial |
| `vanilla:architecture/riften/rtfarmhouse01` / `rtfarmhouse02` | 3 / 2 | Imperial |
| `vanilla:architecture/solitude/farms/sfarmhouse01` / `02` | 1 / 1 | Imperial |
| `bmv:architecture/riften/rtfarmhouse02` | 1 | Imperial |
| `kotm:argonia/mudhuts/*` | 0 in the tracked links (the KotM pool predates the link mine; only `smpodext02` links, to five Keeba house cells) | Argonian |

| Interior row | Rule | Gate |
|---|---|---|
| Imperial homes and the station house | a linked farmhouse shell, tier A by the fit rule (use class from the parcel's `services`) | 16k Interiors gate: shipped and enterable |
| Argonian huts | tier A only where a linked shell exists in the mud or KotM pool; otherwise `reserved` naming the pool (`settlement-mud-v1`, KotM mud huts) until the KotM door links are re-mined (16k § Carried backlog, "KotM mud huts' interiors") | reserved door closed with its pool named |
| Open sheds, pens, the landing's racks | no door (`none`) | L21 |
| D0 safe interior | one tier A cell marked on the record (quests 20 §12); which one is the design brief's call | the record field |

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

The tracked sets are `world/sources/placement/yard-sets/01-road-station.json`
(0101). Two rows every set of this type answers:

| Yard-set row | What the set holds | Bar and gate |
|---|---|---|
| Lit entrance | a `light`-layer member (lantern, sconce, candle, brazier) within 2 m of the building's threshold, unless the shell's window glow faces the approach (within 90 degrees of the door's bearing). At Claywater walk 1 no door met it: nearest light 4.5 m (station house), 5.6 m (poler's hut), 9.0 m (family hut) | 97 C16; `compile_settlement.unlit_entrance_errors` HARD; reader Front row 24 |
| Beached craft | the landing's canoe and its cleats placed `beached` on the bank above the landing, reported with their three numbers in the packet | `wb.py check` `beachedRule` (R5, 0101): base float ≤ 0.3 m, bank slope ≤ 20 degrees, a wet cell within 1.5 m of the outline |

## Pieces that worked, pieces that failed

Written from Claywater in slice 1c. Cut from the yard sets (16k fix 2, one line each):

- `sty-cart` (handcart01, pad fit under 2 degrees): no free pose within 16 m of the stable yard on the padded ground (`wb.py site --free`, 2026-09-26); the station yard keeps its cart (`isy-cart`).
- The chicken nest (`vanilla:plants/chickennest01`): at its plugin seat (designed sink -0.026 m) its lowest point stands 0.12 m over flat ground, so it fails the 0.03 m ground seat; the plugins seat it on floors (anchor class `deck`, 63 of 68 references) and no mined pair hangs it on a hay mound or deck piece. Cut from B1's yard (16k fix 2 layout r2).
- The two bone chimes (`argonianbonechime01/02`, 2.18 m wide): no plugin mounts them (`mountsAsChild` empty) and they are over the 0.6 m small-mount bar, so no legal hanging exists.

## Known failure modes

Lessons that bit this type: written from Claywater in slice 1c. Expect
L03 (the record's asset plan), L16 (enclosure per half), L31 (the
landing's stage reaching dry ground, if the landing gets a stage).
