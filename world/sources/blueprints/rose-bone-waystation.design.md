# The Tag House — design (16k walk 9, type 6 shrine, first slice)

Builder: place-type-6 lane, walk 9, 2026-10-01. The layout file
`rose-bone-waystation.layout.json` is the source (0105 R59). Round folders:
`tooling/.reports/16k/place.imperial-penal-south.rose-bone-waystation/round-N/`.

## Site

### The choice

The first type-6 place (shrine or sacred site). Of the 45 active `sacred`
records, the Tag House (`place.imperial-penal-south.rose-bone-waystation`,
family `the-dead`, bone-repatriation waystation, M1) has the strongest causal
record and the most quest weight: the province's live faction quest BC05
*Bones to the Dirt* (Chainbreakers) names it as its promoted provision
(`docs/quests/25-quest-place-map.md`:95, `quest.provision.whiterose-prison-ruin`).
Three local quests anchor on it (LR03, LR24, LR39). The lore behind it is in UESP:
Argonians who die away from the Hist, "even in stone prisons such as White
Rose", return to the Hist if their bones are brought to the dirt
(`world/sources/lore/topics/prisons.md`:86-91, UESP Lore:Argonian). It is
of the `the-dead` family, a kind neither the Greenspring Hist shrine nor the
Riverwalk Sithis totems represent. Rejected: Teeth of Sithis (NI05; a
hist-sanctum dungeon of size S3 under xanmeer stone, a dungeon slice, not a
shrine); Bundle Racks and Carries-Them-Home (same family, weaker quest load,
no provision).

### The record (`world/sources/catalogue/places-imperial-penal-south.json`)

- **why:** the Chainbreakers built a station on the Blackrose road to receive
  the Rose's dead; the Rose's families release a body for a "carriage
  charge"; the most resented transaction in the south.
- **vibe:** "a handover shed on a causeway with a bone-tag rack on the prison
  side and a wrapping bench on the village side and a painted line on the
  floor between them"; tag-bone white, cloth grey, causeway mud; formal and
  unhappy.
- **interior:** civic-hall S1, one door. **sockets:** evidence
  `evidence.tag-house.carriage-charges`. **rewardProfile:** services,
  faction-access, lore-fragment. **contents.loot:** l1 ledger, l2 grave goods.
- Promise ledger: `world/sources/placement/promises/place.imperial-penal-south.rose-bone-waystation.json`, 17 rows.

### The ground (`world/sources/sites/dossiers/rose-bone-waystation.{json,md}`, workbench scans)

- A low dry rise at 8-11 m, 3.2 m over the water table, slope 3-6 degrees,
  falling north-east; firm lowland, danger band 2. No marsh or water within
  100 m: the nearest water is 113 m off. No causeway exists here.
- The place's own footpath (`track.imperial-penal-south.rose-bone-waystation`,
  `routes-minor.json`) starts at 2577.6, 6564.4 and runs east then north-east
  toward the villages. The Prison road (`route.road.blackrose-lilmoth`) passes
  189 m to the north-west.
- Neighbours within 500 m: the ferry stage (94 m), Murkwood Verge (111 m),
  the bonded stores (180 m), Blackrose (275 m, north-west), Blackrose Prison
  (521 m, west-south-west). None is built.

### Quest rows

BC05 *Bones to the Dirt* (`world/sources/quests/quests-factions.json`; live):
the procession from White Rose Prison. LR03 *The Tag Not Returned*, LR24
*Out on Another Name*, LR39 *Tags for the Living*
(`world/sources/quests/local-imperial-penal-south.json`; skeleton): bone-tags
and the paperwork of the dead.

### Lore read

- `world/sources/lore/topics/prisons.md`:86-91, 125-127: bones in stone
  prisons must come home; the plainest quest premise in the sources.
- `world/sources/lore/topics/material-culture.md`:300-301: bone-and-tin
  chimes at every threshold and eave; :232 the grave-singer.
- `world/sources/lore/extrapolation/argonia-4e201-state.md`:165-167: burial
  runs through the Hist.

### Record defects found (fixed in the step 5b change set)

`rewardProfile.kinds` names `faction-access`, which needs a guild hall,
council or court nobody would build at a roadside shed; `playerPurpose.primary`
is `dungeon-delve` for a place with no dungeon; `deferredWhy` and
`deferredFromStatus` survive on an active record; the vibe's "causeway" and
"painted line" and the founding's "on the Blackrose road" do not match the
ground (dry rise, 189 m off the road) or the kits (no paint decal exists).

## Brief

### The calls the ground and the kits force

1. **The shed is an open half pavilion.** HTBM `orcawninghalf01` (a thatched
   canopy on log posts, open at its straight front, 8.2 x 5.0 x 5.8 m) is the
   one open-sided Argonian roof in the pools that shelters two parties at once.
   Its sink had no measured row (mesh-sill fallback, R36): it takes a reviewed
   `assetPlacement` row (-0.10 m, from its siblings bamboohut01/02 on the same
   stake legs, n 16); settlement-stilt-v1 was refreshed.
2. **No painted floor line exists**; a row of three Argonian candle stands
   runs from the threshold across the floor between the two halves instead.
3. **The keeper's hut is HTBM bamboohut02** (plugin-linked); every one of its
   nine linked cells is a storage room and only CIPHTBMHutInterior01 is fully
   sourced, so the ledger is kept outside at the keeper's table and the hut is
   the carriers' store.

### Rows (as built)

| Thing | Purpose | Kit piece (measured) | Rule or lore |
|---|---|---|---|
| Handover shelter `s-shelter` | where the dead change hands; front north onto both ways | `htbm:.../orcawninghalf01` (settlement-stilt-v1), pad apron 1.5 m with batter, worst edge 0.70 m | prisons.md:86-91; R36 policy row |
| Arrival half (yard set `handover-arrival-side`) | the Rose side: closed baskets that carry the remains, an urn | `basketclosed01` x3, `paintedurn01` | record vibe |
| Tag chimes `s-chime1`, `s-chime2` | the tags: chimes hung under the arrival eave, one tag on each | Sleeping Tree `windchimehavok` (exterior licensed), `mount --hang` on the canopy (unmined, reader-approved r2) | material-culture.md:300 |
| Released bones `s-bones-skull1..3`, `s-bones-spine`, `s-bones-rib1`, `s-bones-rib2`, `s-bones-arm` | the dead as the Rose hands them over: skulls and a spine at the arrival front; two ribcages, a skull and an arm bone laid on the arrival-half floor among the tag baskets, waiting for their tags (audit10 c5, P5) | kotm `issgard_boneargonianskullfull`, vanilla `humanspine`, `humanribcage`, `humanarmleft` (settlement-root-v1), settled on the ground | why.founding (`thing-bones`) |
| Candle row `s-line1..3` | the line between the two halves, lit | mudmother `argoniancandle01` | record vibe (line) |
| Departure half (yard set `handover-departure-side`) | the villages' side: wicker bench, wrapped bundles, urns, cloth basket | HTBM `wickertable01`, `miscsacklargeflat01` x2, `paintedurn01` x2, `basketfull` | record vibe (wrapping bench) |
| Waiting bench and brazier `p-bench`, `p-brazier` | the Rose's families wait outside the west corner | `farmbench01`, `impbrazier01` | record pressures |
| Keeper's hut `b-keeper` | the Chainbreakers' keeper; the carriers' stores | `composite:stilt/bamboohut02-with-door`, pad apron 2 m (s 6, w 3) with batter | R83 linked cell |
| Keeper's yard (yard set `keepers-yard`) | the fee counted and written down at the door | `wickertable01`, `wickerchair01` x2, `basketsmall01`, `miscsacklarge`, `wickerbasket01`, `paintedurn01`, `firewoodpilemedium01` | record occupantsMotive |
| Door light, totem, eave chimes `k-candle`, `k-totem`, `k-chimes` | the hut's threshold; the chimes hang from its eave (LR39's "Tag House wall") | `argoniancandle01`, `argoniantotem01`, `windchimehavok` hung (`mount --hang`, unmined, reader-approved r2) | material-culture.md:300 |
| The villages' way | the end of the track, past the hut to the shelter's east corner | footpath 2.0 m | seams |
| The keeper's path | spur to the door | footpath 1.5 m | R84 |
| The Rose's way | from the shelter's west corner down toward the Prison road | footpath 2.0 m, leaves the place | seams |

Bars (`breadth-bars.json` type 6 falls back to the M1 hamlet column; the place
counts one building and one structure, so it is built below every column and
the breadth gates report it, R33 does not bind): lights 2 kinds (candle,
brazier); dressing kinds 14.

### § Interiors

| Door | Shell | Linked cells | Claim | Why |
|---|---|---|---|---|
| `door.imperial-penal-south.rose-bone-waystation.1` | bamboohut02 | CIPHTBMHutInterior01, 03, 07, 08, 11, 13, 15, 16, 17 (all storage) | CIPHTBMHutInterior01, tier A | the only fully sourced cell (the other eight miss five Dragonborn clutter forms and one furniture form); third use in the province, first in the region (R4) |

The shelter has no door: an open structure, walked into (R18).

### § Containers and items

- Container: `s-hv-urn1` (urn, authored loot, grave goods: record l2).
- The ledger (record l1) is the evidence socket at the keeper's table.

### § Creative register (calls unlike Claywater, Greenspring, Riverwalk)

1. A place split in two by its use: an arrival half and a departure half
   under one roof, each dressed for its side.
2. Light as a boundary: the candle row is the line the dead cross.
3. The Rose's side is Imperial (a farm bench and an iron brazier), the
   villages' side Argonian (wicker and mud-ware).

### § Sockets

| Socket | Kind | Host | Why |
|---|---|---|---|
| `idle-keeper-tags` | idle tend | `s-hp-basket1` | the tag-keeper opens each basket and hangs its tag on the chimes |
| `idle-keeper-home` | idle sleep | under the shelter's thatch | the tag-keeper sleeps beside the dead who wait to travel (the hut's cell has no bed) |
| `npc-tag-keeper` | npc, roster slot `tag-keeper` | the shelter front | morning at the tags, afternoon at the keeper's table, night under the thatch |
| `evidence-carriage-charges`, `scene-procession`, `marker-keeper-door` | marker | keeper's table; shelter front; keeper's door | the record's evidence socket, BC05's stop, the door |
| `idle-wrapper` | idle tend | `s-hv-flat1` | the carrier ties off the wrapped bundles |
| `idle-family-waits` | idle sit | `p-bench` | a family waits for the fee |
| `idle-keeper-counts` | idle work-at | `k-ty-table` | the keeper counts and writes |
| `container-grave-goods` | container urn | `s-hv-urn1` | the grave goods |
| `q-evidence-carriage-charges` | quest evidence | the keeper's table | the record's evidence socket |
| `whiterose-prison-ruin-procession` | quest scene | the shelter front | BC05's procession stops here |

The record gains one notable slot, the tag-keeper (step 5b change set): the fee is paid and written down by somebody; the `services` reward needs an npc socket.

### § Seams

Off the road. The villages' way continues the place's own minor track from
its terminal (`terminal.rose-bone-waystation.villages-track`); the Rose's way
leaves the place toward the Prison road, unpainted beyond. No ferry, berth or
sign.

### § Approach (openworld-approach §5)

1 yes (two: the track from the east, the grass from the Prison road);
2 yes; 3 yes (the hut and the thatch stand on the rise over grass);
4 yes (the hut drops behind the slope); 5 no: the villages' way is straight
for 20 m, a short end of a 300 m track that bends twice before it; 6 yes;
7 n/a (no gate); 8 yes (the villages' way is the spine); 9 yes (the shelter
is the beacon); 10 yes; 11 yes (both ways end at the shelter); 12 n/a;
13 yes (the batter edges of the two pads); 14 yes (1-3 people, two
buildings); 15 yes; 16 n/a.

## Lessons this slice

Filed as REQUEST rows in
`tooling/.reports/16k/place.imperial-penal-south.rose-bone-waystation/requests.jsonl`
(the integrator applies them):

1. Yard sets laid by `group place --parcel` are not bound; every member
   needs its own `bind` op (tooling row: the tool binds them).
2. Read an open structure's post clusters (`blender/examples/post_clusters.py`)
   before dressing it; leave a free walk cell by every yard-set table.
3. Yard sets beside a padded building stand on the pad's flat, not its
   batter (`apronBySide`).
4. HTBM bamboohut cells are storage rooms with no bed: the keeper sleeps
   under a roof elsewhere.
5. Read every outdoor piece's setting licence before the layout:
   `argonianbonechime01` and `wrherbdryingrack01` are interior-only and
   turned `setting.class` red after the first publish; and a hanging chime
   (`windchimehavok`) stood on the ground passes `check` (tooling row).
