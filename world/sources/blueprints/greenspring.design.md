# Greenspring — design (16k slice 2, type 2 Hist village)

Builder: slice-2 lane, 2026-09-27. The layout file `greenspring.layout.json`
is the source (0105 R59: the generator that first wrote it is retired);
`chain.sh` in the place's report folder runs full apply, export, derive,
claim, apply. Round folders: `tooling/.reports/16k/place.hist-heartland.greenspring/round-N/`.

## Site

### The choice (contrast rule, SKILL step 8.6)

Type 2 candidates: active `tribal-village` and `dry-village` records (flood-high
hamlets are type 1), not in `imperial-fringe`, not `ownerGuided`, with no
`relations.dependsOn`, more than 300 m from Claywater (the only built place).

| Place | Zone | Magnitude | Distance to Claywater | Promise rows | Why not / why |
|---|---|---|---|---|---|
| **Greenspring** (`place.hist-heartland.greenspring`) | hist-heartland | M3 | 4.63 km | 12 | chosen: Argonian core against Claywater's Imperial fringe; dependsOn empty; live quest MR01 anchored here; dwelling interior; 9 neighbours within 500 m, none built |
| Greylight (`place.dunmer-north.greylight-village`) | dunmer-north | M3 | 6.90 km | not generated | runner-up: four landing stages (type 3 water machinery) and a root-mouth dungeon entrance (type 5) in one record |
| Ashroot (`place.mercantile-coast.ashroot-village`) | mercantile-coast | M3 | 4.40 km | not generated | runner-up: `guild-hall` service in a hist village, no lore dossier routed (site packet lore 0), 11 neighbours within 500 m |

Nine Bends (`pirate-freeholds.upriver-hist-village`) was set aside: it carries
MQ01's opening-hist-withdrawal provision next to the owner-guided opening camp.

### The record (`world/sources/catalogue/places-hist-heartland.json`)

- **why:** founded at the Panther fork on springs that can be drunk unboiled;
  the interior's last friendly stop; charges nothing for water and a great deal
  for beds and rope; Helstrom traffic brings cult couriers, tappers and the
  Veiled Reed's factors; would move within a season if the springs soured.
- **vibe:** a crown leaning out over a river fork, the spring head walled in
  pale stone; cookfire smoke reaches the fork first; stone tasting basins;
  hitching posts at the landing; mood hospitable, tired, patient.
- **services:** lodging, shrine, trader. **npcs:** n1 merchant (single), n2
  family (band). **notable slots:** tree-minder, root-herald, spring-keeper.
- **sockets:** `scene.greenspring.greenspring-fork-market`,
  `post.greenspring.greenspring-river-landing`. **provision:**
  `quest.provision.mr01-anchor`. **interior:** building, dwelling, S2.
- **playerPurpose:** safe-rest, service-hub. **hostility:** wary, not clearable.
- Promise ledger: `world/sources/placement/promises/place.hist-heartland.greenspring.json`, 12 rows.

### The ground (`world/sources/sites/dossiers/greenspring.{json,md}`)

- Anchor 4779, 1900 m at 10.3 m, slope 5.6°; relief 109 m across the 400 m disc;
  19.5 ha buildable under 8°; 2.71 m above the water table.
- Water: marsh-deep body `body.2442-1212` 93 m west; the channel bank runs
  north–south at x ≈ 4700–4705 between z 1840 and 1880.
- The ground falls 5–8° westward from the track's end to the bank: no cell
  under 2° near the village. Every building stands on a mud pad with a graded
  batter (97 Part F `argonian-mud`, lesson L64); dressing stands on the pads.
- Routes: `track.hist-heartland.greenspring` (from the Border road down x ≈ 4806,
  then south-west to the anchor) and the footpath
  `track.hist-heartland.hist-less-refuge-wild` along the bank at x ≈ 4713.

### Quest provisions (`docs/quests/25-quest-place-map.md`, `world/sources/quests/`)

- **MR01 The Sick Root** (live, Many-Root line): a Hist is dying and the
  village blames upstream salt; the diagnosis is made underwater at
  `place.hist-heartland.root-gallery-drowned-stair` (536 m). Needs: the Hist,
  the tree-minder, the salt (evidence).
- LH07 (the spring runs sour on a cycle), LH37 (two tribes want the spring's
  use written down), LH38 (a body in the water), LH51 (convocation pitch rent):
  skeletons; they need the spring, the spring-keeper and the lodge.

### Lore read

- `world/sources/lore/helstrom.md:46` — the Panther River's final fork is next to Greenspring and Helstrom.
- `world/sources/lore/extrapolation/settlement-register.md:115` — M3, freshwater village at the fork, the last friendly stop before Helstrom.
- `world/sources/lore/regions/middle-argonia.md:74` — Greenspring is Helstrom's south-west neighbour.
- `world/sources/lore/topics/hist-placement.md` R1 (Middle Argonia: a Hist forest), R2 (tribal Hist, tree-minder), R3 (state is the story): Greenspring's tree is a tribal Hist in the **sick** state (MR01). The register (§3) has no Greenspring row: REQUEST row filed.
- `world/sources/lore/topics/material-culture.md` § Building; 97 Part F `argonian-mud` (compact cluster, huts face the common, open common with the Hist, no enclosure, owner call 8).

### Nearby places

Nothing built within 2 km. Claywater (4.6 km) is the only built place; its
signatures do not bind within 2 km. The 0098 claims register holds six
Claywater signatures; none repeats here (§ Bars).

## Brief

### The calls the ground forces

1. **The village sits on the slope between the track's end and the bank**, not
   at the plotted anchor (6–10°, 90 m from water, no room for a landing):
   siting candidate `fork-bank`.
2. **Every building on a mud pad with a batter**; no retaining walls (the mud
   kits have none).
3. **The spring is a pool with a spring house beside it**: a round pool 2.5 m
   across the water at 4718, 1868 (the layout's `pool` op). The open tent stands
   east of it across the spring-house path, its open side facing the water
   (§ The spring).
4. **The landing is canoes drawn up on the bank** (beached), not a stage: the
   bank is 10° and no mud-kit stage piece reaches water from it.

### Rows

| Thing | Purpose | Kit piece (measured) | Rule or lore |
|---|---|---|---|
| Lodge `b-lodge` | the bed-keeper (n1) rents beds and sells rope and stores; D0 safe interior | `composite:mud/kotm-house-pod` 13.6 × 13.9 m, pad fit | record services lodging + trader; 0103 |
| Root-herald's house `b-herald` | the root-herald trades with Helstrom; keeps the upriver salt | `composite:mud/kotm-house-pod` | notable slot; MR01 evidence |
| Tree-minder's house `b-minder` | the tree-minder lives beside the Hist | `composite:mud/hut-with-entrance` 15.1 m | hist-placement R2 |
| Spring-keeper's house `b-fam1` | the spring-keeper and her family | `composite:mud/kotm-house-pod` 13.6 × 13.9 m, door facing 17° onto the spring-house path; was `mudhut01`, then `composite:mud/hut-with-entrance` (§ Doors) | notable slot |
| Family hut `b-fam2` | a family of the village (n2), the cook-fire | `composite:mud/hut-with-entrance`; was `mudhut01` (§ Doors) | record n2 band |
| East family hut `b-fam3` | a second family by the track | `composite:mud/hut-with-entrance` | record n2 band |
| Spring house `b-shed` | shelter for the spring's jars | `mudmother:gv_meshes/argoniannest/argoniantent02` at 0.85 (5.2 × 4.5 m), open side facing the pool | record why/vibe; LH37, LH38 |
| The Hist `hist` | the village's tribal Hist, sick | `histtree:skyfall/sleeping tree overhaul/ancient sleeping tree` 24.9 × 27.1 × 24.4 m, on a pad (mound) | 97 C4 the Hist wins; L17 |
| Hist shrine | the shrine service at the Hist's foot | `rune circle` (anchor), two `argoniantotem01`, `windchimehavok`, two Hist flowers, two candles | L17: a shrine, not a temple |
| Graves (walk 9) | the village's dead under two low cairns, one north-west of the Hist and one north of the spring-keeper's house: burial runs through the Hist | `burialcairn02` (works-v1) ×2 | `argonia-4e201-state.md:165-167`; `references/dressing.md` § 4 |
| Household yards (walk 9) | the east family's two hives on their bench and two hens' nests behind the hut; fish drying at the family hut by the nets. No herb rack, washing line or Sithis shrine outdoors: no piece is licensed for it (R1; `references/dressing.md` § 4) | `kotm:argonia/clutter/beehive`, `chickennest01`, `fishrack01` | `references/dressing.md` § 4 (Hist village row set) |
| The way | spine from the track's end through the common to the bank footpath | track 2.5 m | 97 C3; owner call 11 |
| Door paths | one footpath per door, last leg on the door's facing | footpath 1.2 m | pathReachRule |
| Landing | canoe and plank boat beached | `canoe1`, `plank_ferry_swamp_01` | R5 beached craft |
| Lights | a candle stand within 2 m of every door; three lanterns hung in the Hist on the shrine side | `argoniancandle01` (the mud kit's one ground light); `argonianlanterns03` hung (§ Lights) | 97 C16 |

### Bars planned (breadth-bars.json, 0098 § 1)

The column is chosen by the built count (`place_gates`, `breadth_bars.built_column`):
7 buildings → **village**. A Hist village repeats its hut by culture, so the type 2 bar applies (planner ruling 2026-09-28): distinct shells ≥ 3, built 3 (`composite:mud/kotm-house-pod`, `composite:mud/hut-with-entrance`, `argoniantent02`); top dwelling-shell share ≤ 0.50, built 0.50 (3 pods and 3 huts among 6 dwellings). Signature ratio 1.0: six dwellings, six dressing sets. Dressing per
dwelling within 12 m ≥ 20: not measured by any gate (`place_gates` notMeasured);
planned 4–7 authored pieces per dwelling plus the neighbours' within 12 m.
Enclosure kinds: none (97 owner call 8).

### Approach (openworld-approach §5)

| # | Yes/no | Field |
|---|---|---|
| 1 | yes: two walking approaches, the track and the bank footpath | `approaches[]` |
| 2 | yes: the Hist from the track, the spring house from the footpath | `firstSeen` |
| 3 | yes: the Hist is 24.4 m tall on a mound; canopy closure 0.36 (dossier) | `sequence` |
| 4 | no: the sequences name three beats but no occlusion; the grove hides the village until the last bend on the track (to state in round 2) | `sequence` |
| 5 | yes: the way bends at the track's end and again at the minder's house | `ways[].via` |
| 6 | yes: the Hist is seen from both arrival points | `wayfinding` |
| 7 | no: nothing spans the track entrance (Argonian places mark edges with totems; the terminal is declared a footpath) | parcel `spans` |
| 8 | yes: one spine (2.5 m), door paths 1.2 m | `ways[].kind` |
| 9 | yes: the Hist is the beacon; the spring house the one mid-place marker | `landmarks[]` |
| 10 | yes: every door presents to a path (pathReachRule) | doors |
| 11 | yes: every way ends at a door, the shrine, the spring house or the landing | `endsAt` |
| 12 | yes: no raised level | — |
| 13 | yes: the bank and the channel on the west; the grove on the east | clearance |
| 14 | yes: 7 buildings for 5 households (14–22 people) | `scaleGrounding` |
| 15 | yes: "follow the way down to the tree"; "the spring house on the bank" | `wayfinding` |
| 16 | yes: the slope detour pays with the view over the fork from the Hist mound | `why.playerPurpose` |

### The spring

The village is named for the spring (record `why`). The layout's `pool` op
`sp-pool` cuts a basin at 4718, 1868: water 2.5 m in radius, 0.5 m deep,
with a 0.3 m rim that grades back to natural ground. The export writes it as
a `pool` ground overlay and a still water surface in the place's `pools[]`,
which the studio shows at load. The still water lies about 0.08 m under the
ground at the centre.

The record's "stone lip" is two rings of boulders just outside the basin cut,
each standing on natural ground. The inner ring is thirteen
`vanilla:landscape/rocks/rocks02`: `sp-ring1`-`sp-ring4` and
`sp-ring6`-`sp-ring14` (`sp-ring5` is retired, Std 2), chained round the
centre at 2.92 m (`sp-ring3` at 2.97 m). Each touches the next, with `wb check`
gaps of 0.002-0.045 m. The rock policy seats each on its lowest three
contacts, 0.42-0.51 m into the ground (`rockSeat` embed, bar 0.576 m), so
about 0.3 m shows. The rocks02 touch only below the ground. Above it, gaps of 0.14-0.33 m stay
open between them (`placement-workbench/blender/examples/ring_lip.py`). The outer ring is
thirteen `rocks03` boulders, `sp-fill1`-`sp-fill13`, set over those gaps at
3.2 m from the centre. They sit 0.95-1.05 m deep (bar 1.133 m) and show about
0.5 m. The plugins place rocks03 touching rocks02 (21 references in the
`kit-mounts-mined` abuts), so the crossing is designed. With both rings the lip
is closed at 0.05 m above the ground. Its slits are 0.09 m or less at 0.15 m. No plugin in the pool places a ring, well or pool-edge set that an
Argonian village may use. The ones found and turned down are Whiterun's pond
walls (Nord), the Imperial `mwimparchpool01`, the 2.49 m Argonian
`stonewallcurve01/02` and the volcanic `mineralpoolsm01` (in no kit). Black
Marsh pools in the micrositing data are edged by plants, not stone. Loose
boulders on measured contacts are the lip. No cairn stands at the spring.

The spring house tent moved east of the pool to 4729.0, 1867.5, turned to
yaw 270 so its open side faces the water across the spring-house path. It
could not stay by the water: a building pad outranks the pool and grades the
ground for 3 m past its edge, so any pad closer than 5.5 m to the centre
would lift the basin. The jars, the basket, the candle and the urn `sp-urn`
stand on the tent's pad. The Hist flower that stood on the ground at the spring now
hangs in the Hist (§ Lights).

### Lights

The owner asked for lanterns in the Hist's branches. Three
`argonianlanterns03` hang there. Mud Mother hangs the same lantern in its own
Hist tree; it is the kit's mined hanging lantern and carries a light record
(`SLightStreetStreet01`). `townlantern04` stands in an interior kit with no
light record, so it was not used. Each is hung with `mount --hang` on the
shrine side of the trunk, at the lowest branches the rays accept. For each
lantern the list gives the bearing, the metres out from the trunk and the
lantern's bottom over the ground: 0°/3 m, 4.06 m; 40°/3 m, 2.60 m; 20°/7 m,
4.56 m. The third hang is capped at 7 m over the ground (`max_h`), so it
keeps its branch. Uncapped, it took a limb 9.7 m up once the tree was
lowered. The tree now stands 0.27 m lower (§ The Hist's height); every
hung piece came down with it. The four Hist flowers (`sp-flower`,
`sh-flower1`, `sh-flower2`, `b-minder-flower`) hang the same way. Their
bottoms stand 2.4-4.5 m over the ground.

### The Hist's height

On walk 4 the owner asked for the tree a little lower. Its sink is now an
`assetPlacement` row: -0.4023 m for the healthy and the sick tree, with
evidence 'owner walk 4'. The Skyfall sink was -0.6723 m, so the pivot stands
0.27 m lower, at 5.625 m over a 5.223 m pad. The root flare's base band had
stood 0.30 m (p50) over the ground; it now stands 0.03 m over it (p10
-0.14 m, a 0.25 m ray grid). One
root spike reaches 1.02 m into the pad, inside the row's designed burial.
The rune circle stays at 5.03 m.

### Doors

The spring-keeper's house and the family hut were King of the Murkmire
`mudhut01`. Its one opening, found by rays, is 1.7 m wide and 2.1 m clear.
Its sill stands 1.14 m over the ground outside. King of the Murkmire
gives the hut no load door. The family door piece `door01` measures
2.68 × 3.20 m at the hut's scale. Set in the opening, it crosses the
shell's mesh at 261 triangle pairs (`wb.py bpy`, walk-4 report). So door01
cannot close the opening. No one can step 1.14 m up into it either. The
family hut now uses `composite:mud/hut-with-entrance`, the east family hut's
shell, turned so its door faces the path it already met (157°). The
spring-keeper's house is `composite:mud/kotm-house-pod` (planner ruling,
walk 5), turned to 188.8° so its door faces 17° from the threshold the hut
had used. The nets set on its west side moved 0.8 m east, off the pad's
batter.

The planner ruled the family hut onto King of the Murkmire `mudhut02`, with
the plugin's `door01`. That cannot be built. `mudhut02` is a closed dome:
rays find no opening in it at any bearing from 0.2 m to 9 m up. The six
King of the Murkmire `mudhut02` placements put the nearest `door01`
7.0-12.9 m from the hut's centre (unscaled) and -3.6 to +8.5 m up. Their turn
against the hut varies from 46° to 308°. Every `door01` stands 3.2 m from a
`smpodextdoor`, the pod's own entrance frame. So the door belongs to the pod;
the link record paired it with the nearest building. The family hut stays
`composite:mud/hut-with-entrance`.

`0098.place` reads the type 2 bar (§ Bars planned) and passes: 3
distinct shells, top dwelling-shell share 0.50. The bundle exports: 296 resident parts at
the 1.55 headroom make 459, under the 500 ceiling for a place of five or
more dwellings (0052).

### Interiors (0103; asset-aware)

| Door | Shell | Tier | Why |
|---|---|---|---|
| 1 lodge | `composite:mud/kotm-house-pod` | A, `KeebaHouseCrafter` (expected SnailMinder; the fit rule's use class took Crafter) | the pod's designed cells; only Crafter, Fisher and SnailMinder resolve with our assets (Treeminder needs Creation Club pieces) |
| 2 herald | `composite:mud/kotm-house-pod` | A, claimed `KeebaHouseFisher` | the fit rule's pick |
| 3 minder | `composite:mud/hut-with-entrance` | A, claimed `KeebaHouseElder` | no plugin links `composite:mud/hut-with-entrance` to a cell, so the claim step takes the culture pool's next fitting cell (§ Variety) |
| 4 spring-keeper | `composite:mud/kotm-house-pod` | A, claimed `LilmothGlassworksOverseerHouse` | a cell the plugin links to the pod's base shell `smpodext02`; the three Keeba cells are held by doors 1–3 |
| 5 family | `composite:mud/hut-with-entrance` | A, claimed `LilmothIronworksOverseerHouse` | as 4 |
| 6 east family | `composite:mud/hut-with-entrance` | A, claimed `LilmothPlantationStorehouse` | as 3 |
| spring house | tent | none | open-fronted, entered without a door |

Shells rejected on their interiors: `mudhut02` (KeebaHouseElder needs
HearthFires, Dawnguard and Curios pieces), `mudmother mudhut01` (00MudHut01 needs
HearthFires and Dragonborn), the Seekhat thatch houses and Root-Whisper round
huts (missing architecture). Survey: `/tmp/p2/cells.out` summarised in the
round-1 notes.

### Variety (0105 R4, R37, R41)

Claims read from `interiorCellClaims` in `signature-claims.json` and the fit
rule (`blueprint_interiors.claim_for_parcel`) on 2026-09-28.

| Building | Shell | Cell | Pool members rejected, with the reason |
|---|---|---|---|
| Lodge (door 1) | `composite:mud/kotm-house-pod` | `KeebaHouseCrafter` | `KeebaHouseFisher`: taken by the herald's house; `KeebaHouseSnailMinder`: a workshop cell (use class smithy) for a `work` parcel; `KeebaHouseTreeminder`: two architecture pieces in no archive we hold |
| Root-herald's house (door 2) | `composite:mud/kotm-house-pod` | `KeebaHouseFisher` | as the lodge; `KeebaHouseCrafter` is the lodge's |
| Tree-minder's house (door 3) | `composite:mud/hut-with-entrance` | `KeebaHouseElder` (walk-4 claim) | no plugin links `composite:mud/hut-with-entrance` to a cell; the mud pool's only dwelling cells are Crafter and Fisher (both here); `KeebaHouseElder` (`mudhut02`) fails on one Creation Club flower bed; `00MudHut01` (Mud Mother hut) on a Dragonborn door |
| Spring-keeper's house (door 4) | `composite:mud/kotm-house-pod` (walk 5, § Doors) | `LilmothGlassworksOverseerHouse` (walk-5 claim) | `KeebaHouseCrafter`, `KeebaHouseFisher` and `KeebaHouseElder` are held by doors 1–3; this cell is linked to `smpodext02` |
| Family hut (door 5) | `composite:mud/hut-with-entrance` (walk 4) | `LilmothIronworksOverseerHouse` (walk-4 claim) | as door 4 |
| East family hut (door 6) | `composite:mud/hut-with-entrance` | `LilmothPlantationStorehouse` (walk-4 claim) | as door 4 |
| Spring house | `mudmother:gv_meshes/argoniannest/argoniantent02` | none (open-fronted) | no door |

The pod and hut pools are spent in this place: each of the six doors
holds a different cell.

### Containers and items

Lodge urn (food), lodge basket (rope, sold dear), herald urn (salt and
household goods), the herald's sack of upriver salt, spring jar (water, free);
item: smoked fish in the spring-keeper's jar.

### Creative register (calls no Claywater row makes)

1. The spring house: a stone lip of rock cairns with water jars and Hist flowers.
2. A sack of upriver salt and a herb-drying rack at the root-herald's door: the evidence the village argues over.
3. The Hist shrine: rune circle, two totems, a wind chime, Hist flowers and two candles at the tree's foot.
4. Three woven chairs outside the lodge, where guests sit.

### Sockets

Roster: n1 bed-keeper (lodge/lodge), root-herald (house/house), tree-minder
(shrine/house), spring-keeper (spring house/house), n2 family (hut/hut); each an
`npc` socket with a morning–night schedule and `idle` work and home sockets.
Markers: the sick root (fills the MR01 provision), the lodge door, the fork
market (fills the scene promise), the river landing (fills the post promise).
Containers and items as above.

### Quests

- **MR01 The Sick Root:** premise as the record; cast the tree-minder and the
  root-herald; choice: blame the salt or find the cause underwater; provisions:
  the Hist, the sick-root marker, the salt sack.
- **LH38 The Drinker at the Spring:** a body in the water that two households
  would rather keep hidden; cast the spring-keeper; provision: the spring house.
- **LH37 / LH51:** the spring's use written down; the convocation pitch rent;
  cast the bed-keeper and the root-herald; provision: the lodge and the common.
- D0 safe interior: the lodge door (fills `promise.greenspring.safe-interior`).

### Seams

Off-road. Terminals: `track.hist-heartland.greenspring` at 4800.8, 1878.1
(the way continues its south-west line) and the refuge footpath at 4707.6, 1878.1
(the way leaves along the footpath). The spine is `route.greenspring.the-way`.
No berth; no sign (no crossroads inside the place).

### Record corrections

None to the catalogue. REQUEST: a Greenspring row in
`world/sources/lore/topics/hist-placement.md` §3 (tribal Hist, sick, MR01).

## Hand decisions

- The BMV hut's designed sink (`kit-designed-sink.json` reads the mesh sill
  because every plugin reference is placed at scale 1.30): the kit-mining rule
  for scaled references is a planner ruling (tooling-sink.md).

## Rounds

Round log in `tooling/.reports/16k/place.hist-heartland.greenspring/round-N/`
(`rounds.jsonl`, `summary.json`, `shots/`, round 3 `waiting-on.json`).

- Before round 1: the village moved off the plotted anchor to the bank slope;
  the trader service joined the lodge (the herald's pod fits the Fisher cell only
  as a dwelling); the tent and the stilt lizard house were dropped (floor edges
  off their mesh records); dressing seated by search on the pads.
- Round 1 (77 s): readers asked for closer shots; no building defect beyond
  the BMV huts' 0.35 m float.
- Round 2 (66 s): the spring house counted as a building (use `civic`); the
  shrine service named on its parcel; candles moved into the huts' door shots.
- Round 3 (21 s): the tree-minder's hut moved 2 m east of the Hist; its totem
  moved off the door.
- Round 4 (28 s): the herald's salt heap (0.2 m, unreadable) became a sack; the
  seat search keeps a 3.5 m apron clear in front of every door.
- Round 5 (23 s, planner-authorised, three shots): the herald's urns, the
  shrine candle's foot and the night glow. Not clean: framing and one reader
  miss (round-5/readers.txt). The Black Marsh hut sink ruling closed both floor
  edges: check 0 failures, place_gates 14 of 14.

## Lessons this slice

Written at the slice close.
