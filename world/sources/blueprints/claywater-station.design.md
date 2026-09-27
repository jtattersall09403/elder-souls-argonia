# Claywater Station — design (16k slice 1c)

`place.imperial-fringe.claywater-station` · record in
`world/sources/catalogue/places-imperial-fringe.json` · type 1 road station
(`.claude/skills/place-build/references/types/01-road-station.md`) · M2,
`simple` · culture `imperial`, secondary `argonian`.

## Site

### The record

- **Why.** Founding: a mixed village at the road's water point, an Imperial
  well on one side of the road and an Argonian landing on the other; the
  landing is older than the station; the boats lie pulled up on the bank.
  Site: a perennial spring beside a boat channel, where the road and the
  water meet on level terms. Motive: two communities share it because
  neither can hold the other's half. Pressure: the Imperial well is failing
  and the Argonian half will not help repair it in stone.
- **Vibe.** A stone well head with a tiled roof on one side; low round mud
  huts on the bank on the other; wet stone grey against thatch gold; the road
  is the boundary; the stone half cracking, the mud half replastered last
  year; the well roof shows first; a windlass, water poured, two languages
  across one street.
- **Services:** `[ferry, lodging, stable, trader]`, derived
  (`worldgen/derive_services.py`): `ferry` by R5 (the place's poler runs the
  ford crossing, a `road-crossing` row with no lane); lodging and trader by
  R10 from the reward kinds rest-shelter and trade-access; stable by R10 from
  the road-station-village recipe's typed `services`. R10 services are never
  stripped by the M1/M2 ceiling. **Reward kinds:** services, rest-shelter,
  trade-access; **player purpose** service-hub, secondary safe-rest.
- **Sockets:** `scene.claywater-station.the-street`,
  `evidence.claywater-station.the-cracked-well`,
  `station.claywater-station.well-keeper`, `station.claywater-station.poler`.
- **Occupants:** D1 mixed villagers (`n1` family, few), D2 road travellers
  (`n2` rank-and-file, few); roster NPCs
  `npc.imperial-fringe.claywater-station.well-keeper` and
  `.landing-s-poler` (`world/sources/registries/npcs.json:8453, :8489`),
  each on its station socket.
- **Travel station:** none (removed in 16k 1b lane D2); no boat lane leaves
  the landing. **Crossing:** the ford ferry
  `ferry.imperial-fringe.drowning-gate` (wet season, native plank ferry,
  15 gold) is Claywater's: its operator is `station.claywater-station.poler`
  (`operator.socketRef`, `world/sources/routes/travel-services.json`), the
  rule tested in `worldgen/test_record_services.py`. Travel edge: the
  Gideon–Blackwood road only (the boat edge was removed in 1c, below).
- **Quest hooks:** no provisions, no tags; opportunity "the well and the
  landing charge travellers separately for the same stop"; LF83 tier 3;
  deed `deed.claywater.well-mended`.
- **Entrance** `door`; **interior** one S1 dwelling, exterior shell.
- **Danger** D3 (approach D3) on ground band 4: inside 97 A7's ±1.

### The ground (`world/sources/sites/dossiers/claywater-station.{json,md}`; 10 m grid in `tooling/.reports/16k/claywater-inputs.md` (d))

- Anchor 301.0 E, 3059.2 S (studio 0.301 / 3.059 km); chunk ground 37.4 m
  (survey 35.9 m); firm lowland, rock/upland soil, culture territory
  imperial-fringe 99 %.
- A narrow bench: the channel below it to the north (33.3 m water), the
  hillside rising south of it (40 m at +10 m S, 46–69 m at +50 m S). Relief
  across the 400 m disc 283 m; slope p50 29.8°; buildable (< 8°, dry)
  3.57 ha, 8 % of the disc.
- Flat pads (10 m cells, plane slope < 8 %, dry), 9 in the 120 m square:
  a strip on the north bank at 3004 S from 256 to 326 E (34.9–36.1 m, 55 m
  north of the anchor, across the ford); one at 316 E / 3064 S (37.4 m,
  beside the anchor, west of the road); one at 356 E / 3084 S (35.1 m,
  east of the road). 24 cells under 15 %.
- **Water.** The record's water is `reach.169-1660` (horizontal channel,
  33.28 m, perennial), 5.5 m from the anchor; it runs west along 3039–3049 S.
  East of the road a second water at 35.24 m fills x ≥ 341 E. The anchor is
  0.66 m above the local water table (survey). No new wet-season flooding
  under the disc.
- **The road.** `route.road.gideon-blackwood-road` (trunk, "the Blackwood
  Road") passes 19.4 m NE of the anchor, nearest point 315.3 E / 3046.1 S,
  running NNW–SSE (bearing about 148° / 328°), then SE to 354 E / 3090 S. It
  fords the riffle `reach.183-1646` at 312.6 E / 3033.7 S (span 14.1 m,
  0.65 m deep; `world/sources/routes/water-crossings.json`), 28 m N of the
  anchor.
- **A ferry already stands at that ford:** `ferry.imperial-fringe.drowning-gate`
  (wet season, native plank ferry, 15 gold), landings at 311.8 / 3026.1 and
  312.6 / 3041.8, run until 1c by the barrier keeper of the Drowning Gate, now by Claywater's poler
  (`world/sources/routes/travel-services.json` services[18], stations[0–1]).
  Both landings are inside Claywater's 65 m footprint.
- Sight: sees 20 % of its 1.5 km surroundings; concealment 0.85; no landmark
  visible; Gideon 1.12 km E.
- Mined analogues: BM&V #15 (12 buildings, r 89 m, shackkit/riften/farmhouse,
  water 8 m, road 20 m), vanilla #22 (7 buildings, r 64 m, farmhouse).

### Quest provisions

- `docs/quests/20-world-provisions.md` and `25-quest-place-map.md`: no row
  names Claywater.
- `docs/quests/index/local-imperial-fringe.md:91`: LF83 "The Well and the
  Landing", NEGOTIATION, skeleton, anchor Claywater: the two halves charge
  the same travellers twice. The layout needs both counters in sight of one
  street and the cracked well as evidence.

### Lore read

- `world/sources/lore/topics/roads-and-routes-4e201.md:31`: the Gideon–Blackwood
  road is named in Lore:Gideon; worn, Gloommire legs shut in the monsoon.
- `world/sources/lore/regions/blackwood-and-gloommire.md:13-20`: Gideon's
  flooded hillscape; roads to Gloommire close in the monsoon.
- `world/sources/lore/topics/foreign-powers.md:15-28`: Imperial rule by
  governors; every Imperial economic project failed; the Legion built roads
  and forts round Gideon. A failing Imperial well fits.
- `docs/research/lore/minority-enclaves-lore.md:18`: 22 of 24 Imperial
  records sit within 1.7 km of Gideon; Claywater is one of that enclave.
- `world/sources/lore/topics/material-culture.md:18-20`: Shadowfen mud huts,
  wattle-and-daub over a log skeleton, with windows; :23-28 stilts and reed
  are Murkmire's; Imperial houses built on marsh soil sank.
- `material-culture.md:84-100`: small-draft craft and personal rafts are
  the default vehicle: boats pulled up, not a ferry.
- `world/sources/lore/topics/hist-placement.md:95` (R4): a village with no
  Hist says why. Claywater's Argonian half is a landing hamlet, not a
  hatching village; the brief must state its Hist reason.

### Two communities (16k Gotcha; 97 Part F)

- **Imperial half (the well):** `settlement-imperial-v1`, the vanilla
  farmhouse family, the Whiterun farm-fence family for yards; the well at
  the first junction off the road; frontage to the street; 12–15 m spacing.
- **Argonian half (the landing):** `settlement-mud-v1` (`bmv-round-huts`).
  Founding reason (97 C1, two kits need one): the landing is older than the
  station; its polers came up from the mud-hut country and built as they
  do at home, on the dry point by the channel. Imperial-fringe is outside
  the `argonian-stilt` zones (Murkmire and the coasts), so never stilts;
  no fence or wall (L16); huts round an open common, long axis on the
  contour, 12–14 m spacing; boats pulled up on the bank.
- **Siting tension for the brief:** the road separates the two halves, but
  east of the road is mostly water at 35.24 m; the dry flat ground is the
  north bank across the ford and the bench at the anchor. Which half takes
  which bank is the brief's first call.

### Nearby places and what not to repeat

- No place is accepted yet (`world/sources/placement/accepted-places.json`
  is empty) and no other `*.design.md` exists: nothing built to repeat.
- Within 1 km (catalogue positions): the Turned-Out eviction camp 114 m
  (bearing 327°), the Last Post border post 143 m (276°), the Drowning Gate
  monsoon barrier 178 m (109°; ran the ford ferry until 1c), the Buried Spears
  219 m, Highwater hamlet 296 m (258°, flood-high hamlet, M2, promises a
  ferry), the Xi-Tsei massacre ground 296 m, the Drowned Embankment 297 m
  (146°), Two Lamps hermitage 336 m, Cartwright's Cross 431 m (M3 toll-road
  town: ferry, lodging, shrine, stable, trader), Marcian's Terrace 526 m
  (M2 Imperial terrace village), Mile House of the Eagle 799 m (road
  stage), Swampmoth Town 912 m (M4 garrison town).
- Not to repeat: Cartwright's Cross's service set (431 m on the same road:
  97 A6 same purpose within 500 m on one road); Highwater's ferry and
  flood-high form; Marcian's Terrace's Imperial terrace village.

## Brief (Fable, 2026-09-26)

### The three calls the ground forces

1. **Which half takes which bank.** East of the road is water at 35.24 m;
   the only dry ground is the bench at the anchor (west of the road, south
   of the ford) and the north-bank strip across the ford. So the two halves
   face each other **across the ford, along the road**, not across the
   road: the Imperial well-station on the south bench, the Argonian landing
   hamlet on the north strip. The road between them, from the well junction
   to the north landing, is "the street" (0078: places adapt to the frozen
   world; the record's `why` still holds: one road, one water point, two
   communities, neither can hold the other's half).
2. **The ferry is Claywater's.** `ferry.imperial-fringe.drowning-gate`'s two
   landings (311.8/3026.1, 312.6/3041.8) both lie inside Claywater's
   footprint at the ford; Claywater's roster NPC is a **poler**. The
   crossing is the landing hamlet's living: in the wet season the poler
   runs the plank ferry over the flooded ford; in the dry season travellers
   walk the ford and the raft lies pulled up. Rule (new test, failing first
   on this row): a travel-services row whose every landing lies within one
   place's footprint is owned by that place and its operator is one of that
   place's station sockets. The Drowning Gate keeps its barrier; its
   operator moves to `station.claywater-station.poler` (the row's `operator.socketRef`). This is not the
   boat *lane* lane D2 removed (no lane leaves this landing); it is a
   crossing.
3. **Six buildings, the hamlet column.** The 400 m disc is 8 % buildable
   and the dry ground is two strips of ~24×17 m and ~70×15 m. Six buildings
   at the type's spacing fill them; a seventh would stand on the hillside
   or in the flood margin. The hamlet column of `breadth-bars.json` (4–6
   buildings) applies, reason recorded here.

### Services (record fix, with the test lane 1c step 0 left open)

Delivered in step 0 (2026-09-26): the record's `services` are derived as
`[ferry, lodging, stable, trader]` (§ Site; `derive_services` R5 and R10,
tests in `worldgen/test_record_services.py`). The paragraph below is the
brief as written.

`services: [lodging, trader, stable]` (use the ids the catalogue schema
already defines; if `stable` has no id, use the nearest existing works id
and report which): lodging backs rest-shelter, trader backs trade-access (the
well-keeper's provisions counter, LF83 counter 1; the poler's crossing fee
is LF83 counter 2), stable is the type recipe's. Test: every
`rewardProfile.kinds` entry is backed by a matching service, count-pinned
over the catalogue (374 records today), failing first on Claywater.

### Rows

| Thing | Purpose (who, what trade, which promise) | Kit piece (measured, inputs § c) | Rule or lore pointer |
|---|---|---|---|
| **B1 Station house** | the well-keeper's house: lodging upstairs, the provisions counter at the door (rest-shelter, trade-access, `station.well-keeper`); door tier A onto DawnstarBrinasHouse | `composite:farmhouse/farmhouse01-with-door` at yaw 212, door facing 59° | 97 F imperial frontage to the street; L07 door ≤ 4 m from its way; 0103 |
| **W The well** | the water point and the reason for the place; the cracked head is `evidence.the-cracked-well`; the well-keeper's station stands here | `vanilla:dungeons/mines/clutter/genericwell01` 4.6×4.6 | 97 F imperial: the well at the first junction off the road; record `why` |
| **B2 Stable barn** | the stable the type recipe names; horses and the handcart; door `reserved`, pool `stable` (no plugin furnishes an open stable) | `vanilla:architecture/farmhouse/farmhouse02` 15.53×12.80 on a pad | type sheet; L19–L21; 0103 |
| **S1 Travellers' lean-to** | dropped: `farmhouse01walkway` is a walkway along a farmhouse wall, not a free-standing shelter. Its mined door (8 placements) opens into the house that it abuts. Its open side faces away from its path. No published kit carries an Imperial shelter piece. Road travellers sit on the bench by the brazier and pay for a bed in the station house | — | brief row: drop it if it reads as a walkway |
| **F1 Road fire** | the station fire, always lit, by the well and the travellers' bench | one of the vanilla woodfires (15 in the gate-row pool) | type recipe; R3 |
| **E1 Yard walls** | the Imperial yard: a stone wall along the road frontage with a gap at the well path, woven fence round the stable paddock (two enclosure kinds) | `composite:farmhouse/stonewall-run-5` / `-run-3`, `stonewallendl01/endr01`, `fencewoven01/02` | L16 Imperial fences yards; enclosure bar ≥ 1 |
| **P1 Signpost** | "a lettered signpost" at the well junction, Gideon one way, Blackwood the other | the vanilla road-sign piece if any published kit carries it (check every kit manifest); if none, a **sourcing gap row** in the packet, no substitute | type recipe; CLAUDE.md no fakes |
| **L1 Imperial lights** | a candle lantern on a barrel at each Imperial door (B1, B2), the brazier by the well on the `light` layer; B1's side-gable glow also faces its door (63° off) | `candlelanternwithcandle01` on `barrel02` (unmined small mount, shot in the render round), `impbrazier01` | 97 C16; 0102 decision 5; light kinds bar |
| **B4 Poler's hut** | the poler's home and the landing fee counter (LF83 counter 2); `station.poler` at the landing below it; door toward the common path; tier A onto KeebaHouseFisher | `composite:mud/kotm-house-pod` (the King of the Murkmire pod with its porch as the plugin places it), ground ring 12.1 × 11.4 m, door facing 188° | 97 C1 founding reason (§ Site); L16 no fence; 0103 |
| **B5 Family hut** | the D1 family (n1 few); door onto the family path; `reserved`, pool `kotm` | `kotm:argonia/mudhuts/mudhut01` at yaw 70, door facing 180° | L21; 0103 |
| **B6 Store hut** | fish store and smokehouse for the landing; nobody lives there, so no door record (interior `none`, L21) | `kotm:argonia/mudhuts/mudhut01` at yaw 40 | dressing vocabulary; L21 |
| **PAD** | the three huts stand on `settlement-pad` patches at the local high-water line (`floorMinM` 35.3, 16c): B4's pad takes a 1 m apron round the pod's ground ring, B5's a 3 m apron that holds the family yard, B6's 1 m; every mud pad edge stays under 0.6 m (R1, no retaining-wall family in the mud kit) | patch kind `settlement-pad` | L36 ground only through typed patches; 0101 |
| **LD The landing** | the ford's north bank: the ferry raft moored at the north landing where the hull has ≥ 1 m of water in its halo (off the riffle, measured), a canoe and the plank ferry pulled up on the bank, two cleats, no stage unless `dockracked02` seats with both ends on dry ground | `ferryraft:snt/ferry/ferryraft01`, `canoe:actors/sfss/canoe/canoe1`, `ferries:yamadori/ferries/plank_ferry_swamp_01`, `bmv:sheogorad/dagon fel/cleat` ×2 | R5 boats pulled up and moorings; L31, L32; material-culture.md:84–100 |
| **FR Fish racks** | the landing's catch, drying on the flat ground east of B4 on the way to the raft | `vanilla:clutter/deadanimals/fishrack01`, `mudmother:.../fishracksmall` (yard set `argonian-landing`) | `prop.neutral.fishing-and-water-trade` |
| **F2 Cook fire** | the family's cook fire on B5's pad beside the family yard | `vanilla:clutter/woodfires/cookingstand01` | R3 |
| **L2 Argonian lights** | a candle stand within 2 m of each hut door (B4, B5, B6) and one in each hut yard. Two more stand at the landing: one by the plank boat, one by the poler's fish rack | `argoniancandle01` ×7 | 97 C16; light kinds bar (3 kinds with L1: candle lantern, candle stand, brazier) |
| **PATHS** | worn ground: road → B1 door; road → well (the junction); well → B2; ford north bank → landing → B4 door → the common → B5 entrance → B6 | path paint (G1) | L14, L15; widths 97:341, :852 |
| **SOCKETS** | `scene.the-street` on the road between the well junction and the ford's south bank (~316/3042); `evidence.the-cracked-well` at W; `station.well-keeper` at W; `station.poler` at LD | `questSockets[]` | L02 typed fields only |
| **DOORS** | B1 tier A (DawnstarBrinasHouse), B4 tier A (KeebaHouseFisher), B5 `reserved` pool `kotm` (its fitting cells need Creation Club or HearthFires assets the vault does not hold: the owner's archive question, sourcing-log row 208), B2 `reserved` pool `stable`; B6 and S1 have no door record | blueprint door records, `blueprint_interiors --claim` | 0103; L21 |
| **SMOKE** | the brazier smokes at its mined fire socket; the farmhouses carry no chimney smoke (type sheet E1) | `fx:smoke-column` at `impbrazier01` | R3; R7 seen from a distance |
| **GLOW** | window glow on B1 at night; B4 and B5 if their shells have windows | `fxambwindowglow01`, `wrlodwindowglow01` | item 28 (done); R7 |

Cut after an honest search (type sheet): the chicken nest (at its plugin seat its lowest point stands 0.12 m over
flat ground; the plugins seat it on a floor, anchor class `deck`; no mined
pair seats it on a ground piece), the two bone chimes (2.18 m
wide, no mined mount), the stable handcart (no free pose under 2° within 16 m of the stable yard; the station yard keeps its cart).

The landing takes candle stands, not a hanging lantern. `argonianlanterns02`
hangs by a ring (policy `hanging-only`). The one mined pair that hangs
`argonianlanterns04` from `archwaysticks` (n 1) puts the lantern 4.35 m from
the arch mesh at the plugin's scale, so it does not hang from that arch.

Yard sets (the type sheet's, written by this slice):
`imperial-station-yard` (well, lantern post, road fire, handcart01, barrels,
crates, a bench from the vanilla farm dressing set, a water trough),
`imperial-stable-yard` (hay, trough, cart, woven fence),
`argonian-landing` (racks, boats pulled up, cleats, baskets, nets, lantern
posts), `argonian-hut-yard` (candle stand, cook fire, baskets, pots, a
drying frame). Personal clutter ≥ 5 per dwelling; no dressing asset above
25 % of the total; ≥ 10 dressing asset kinds across the place.

### Interiors (0103 decisions 1–2)

| Door | Building | Shell | Tier | Cell or pool | Why |
|---|---|---|---|---|---|
| 1 | B1 station house | `composite:farmhouse/farmhouse01-with-door` | A | DawnstarBrinasHouse | the fit rule's pick of the 11 cells that Skyrim links to this shell |
| 2 | B4 poler's hut | `composite:mud/kotm-house-pod` | A | KeebaHouseFisher | the fisher's house holds the rods and the fish rack that the poler's work needs |
| 3 | B5 family hut | `kotm:argonia/mudhuts/mudhut01` | reserved | kotm | the cells that fit need Creation Club or HearthFires assets not in the vault |
| 4 | B2 stable barn | `vanilla:architecture/farmhouse/farmhouse02` | reserved | stable | no plugin furnishes an open stable |

### Sockets (0103 decisions 5–6; the layout's `socket` ops)

| Kind | Host | Data | Why |
|---|---|---|---|
| npc | the well, station house door, stable | well-keeper: work at the well, home in the station house, the counter by day, the stable at dusk | the station's keeper |
| npc | the ferry raft | landing's poler: work poling the ford, home in the pod house, nets at the racks | the crossing is the hamlet's living |
| npc | the family path | n1 family: cook at F2, home in B5 | the landing family |
| npc | the well | n2 travellers: rest on the bench by the brazier, a paid bed in the station house | the road's few travellers |
| container | the two hut-yard urns | authored fill: fish and food (poler), food and household goods (family), low value | the households' stores |
| item | stable woodpile, landing rack, station house | tool, fish, household lantern, ledger (book, content pending) | the work done at each spot |
| marker | station house door, the well, the street, the raft | entrance, evidence, scene and station markers the quest rows name | quest provisions |

### Bars planned

| Bar | Planned |
|---|---|
| buildings | 6 (hamlet column, reason above) |
| distinct shells | 5 (fh01 composite, fh02, kotm mudhut01, hut-with-entrance, mudmother mudhut01) |
| top shell share | 1/6 |
| dwelling signatures ÷ dwellings | 3/3 = 1.0 (B1, B4, B5) |
| pieces within 12 m per dwelling, p50 | ≥ 15 (hamlet) aiming 20 |
| personal clutter per dwelling | ≥ 5 |
| dressing asset kinds / one share | ≥ 10 / ≤ 0.25 |
| ground kinds | 3: worn path paint, yard mud, wet `Ground050` at the landing |
| light kinds | 3: sconce, candle lantern, Argonian lantern (fires besides) |
| enclosure kinds | Imperial 2 (stone wall, woven fence); Argonian 0 |
| distances | Highwater 296 m is a different purpose (flood-high hamlet) and not in sight (sight 20 %); Cartwright's Cross 431 m repeats no service set here beyond lodging (its set is ferry, lodging, shrine, stable, trader; ours has no shrine and its ferry is a ford crossing) — record this in the packet as the A6 reading |

### Hist reason (hist-placement.md R4)

The landing hamlet keeps no Hist: its people are polers from the mud-hut
country whose tree stands at their home village (the nearest tribal village
in the catalogue, named in the blueprint `why`); they came for the crossing
and the station's custom; they go home for the hatching.

### Approach (the 16 questions, openworld-approach-and-wayfinding.md §5)

Expectations the layout must meet, each answered yes or no with its field
in the blueprint: seen from both road approaches (the well roof and B1's
smoke from the south leg, the landing lanterns and hut domes from the
north); a first landmark (the well at the junction); a second (the raft at
the ford); the street reads as the place's spine; every door reached by
path; the approach path enters at the junction; a resting point (the
fire and the bench beside it); a view back over the channel from the landing; nothing
hidden behind a blank wall; night lights on both halves; a threshold
(the ford); no dead ends.
