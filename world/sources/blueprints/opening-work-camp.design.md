# Gang Ground: design (16k walk 9, type 9 early-game place, first slice, DRAFT for the owner)

Builder: place-type-9 lane, walk 9, 2026-10-01. The layout file
`opening-work-camp.layout.json` is the source (0105 R59). Round folders:
`tooling/.reports/16k/place.pirate-freeholds.opening-work-camp/round-N/`.
Type 9 is owner-guided (0062 § 9): this is a draft for the owner to steer,
applied with `--owner-guided` naming the owner's walk-9 reply ("build one of
each place type").

## Site

### The choice

The three type-9 candidates are the work barge (The Roll, M1), the gang's
camp (Gang Ground, M2) and the Corimont crosstrees (M1). MQ01 *No Name on the
Work Roll* starts on the barge and ends its first night at the camp; the
crosstrees is an optional vantage inside Alten Corimont (type 8, unbuilt).

Gang Ground is built first:

- **The barge cannot be built from the pool as its record describes.** The
  record asks for "a flat barge with a plank shed amidships and a crane frame
  at the bow". Every boat folder of the vault was listed (vanilla ships and
  wrecks, Ships and Boats of Tamriel, DK Boats, Of Ships and Boats, Cyrodiil
  Ship and Boat Resource, Skyrim Ferries, Rowboats of Skyrim, Sailboats
  Expanded, King of the Murkmire): no flat barge exists. The nearest pieces are
  a full-rigged trade ship (King of the Murkmire `shipeectradeship01`, whose
  plugin links it to the `MurkmireTravelShip*` cells, a ready processing hold)
  and the Bretic `shipbreticgreyteship_hull01` (a hull with no rig). Either
  changes what the barge is. That is an owner call (packet decision 1).
- **The barge's plot is also in question.** It sits 406 m from Alten
  Corimont against its own "inside 250 m" constraint, in a 25 m pond at sea
  level walled by 15 m bluffs.
- **The camp depends on nothing unbuilt** and holds most of MQ01's physical
  provisions: the clutch (`opening-egg-clutch`), the camp states
  (`opening-camp`), the witness and the root route. Its record names the barge
  as `dependsOn`, but only through the gang that sleeps here.

### The record (`world/sources/catalogue/places-pirate-freeholds.json`)

- **why:** a dredging gang owes months on the barge; its families live on the
  bank within walking distance of the roll; the clutch keeps them there.
- **vibe:** low sheds along a bank, one long shed set back from the water and
  banked with earth (the hatching shed), plank walkways over wet ground,
  amber lamps at night.
- **interior:** dwelling S1, two entrances. **sockets:** scene camp-night,
  clutch-dies, choose-a-witness; evidence dead-clutch; post rest; marks
  hatching-shed, root-route. Promise ledger:
  `world/sources/placement/promises/place.pirate-freeholds.opening-work-camp.json`, 33 rows.

### The ground (`world/sources/sites/dossiers/opening-work-camp.{json,md}`, workbench maps and scans)

- The anchor (3991.5, 1395.6) stands 21 m up a slope of 16 degrees, 22 m
  above the marsh to the north (body.2442-1212, level 0). Below it a strip of
  bank 10-15 m deep lies at 0-0.8 m beside 0.1-1.2 m of water; the bank
  rises 15 m in about 10 m behind the strip.
- The western side of the same slope (x 3925-3955, z 1380-1430) falls at
  8-12 degrees, 11-18 m up, between the Border road
  (`route.road.stormhold-thorn`, which loops round it to the south and east)
  and the marsh. Scans pass pads there for every shelter (round-1 scans 1-4).
- The gang's walk (`track.track.pirate-freeholds.gang-walk`) arrives from the
  barge at 3987, 1393, beside the road. The barge is 183 m south-south-east of
  the camp's middle, out of sight behind the ridge.

### Quest rows

MQ01 *No Name on the Work Roll* (the raid, the fire, the clutch that dies
that night, one witness saved) and MQ32 *Names Written in Sap* (the
epilogue reads the camp back), both in `world/sources/quests/quests-main.json`.

### Lore read

- `world/sources/lore/topics/labour-and-bondage.md`:52-118: the Owing; a
  debtor's food added to the account; the washed-out look of those kept from
  their Hist.
- `world/sources/lore/extrapolation/argonia-4e201-state.md`:166: eggs, names
  and burial run through the Hist (why a clutch cut off from it dies).

### Record defects found (for the step 5b change set)

- `plotFacts.dangerBand` 3 against the hard constraint "danger band 2 or
  lower" (the sitingNote holds it at D1).
- `vibe.approach` "the walkway from the water runs straight past the shed
  door" and "low sheds along a bank": the bank is a bluff here; the camp is
  terraced on the slope and entered from the Border road.
- `rewardProfile.kinds` `rest-shelter` needs a lodging parcel (built: the
  west sleeping shed carries `lodging`).
- The barge record: 406 m from Alten Corimont against "inside 250 m".

## Brief (draft, as applied in round 4)

| Thing | Purpose | Kit piece (measured) | Rule or lore |
|---|---|---|---|
| Hatching shed `b-hatch` | the clutch, kept dry on the top terrace | `composite:stilt/bamboohut01-with-door`, pad apron 1.5 m (n 2.5, w 2.0) with batter, worst edge 0.97 m (scan 4) | record signature; claim CIPHTBMHutInterior04 |
| Overseers' hut `b-over` | the brokers' two overseers | `composite:stilt/bamboohut02-with-door`, pad (e 3.0), worst edge 1.18 m | record occupants; claim CIPHTBMHutInterior01 (third and last use, R4) |
| Sleeping sheds `s-shed1`, `s-shed2` | the families sleep under open thatch on the lowest terraces | htbm `orcawninghalf01` (open-fronted and doorless, R18) | record silhouette |
| Family tents `t-tent1`, `t-tent2` | two households | mudmother `argoniantent02` | record materials |
| Cookfire `y-fire`, pot, urn, bench | the camp's fire on its own levelled hearth | `campfire01burning` pad 1.5 m; KotM pot; mudmother urn; `farmbench01` | record senses |
| Stores, cookpot, nets | each shelter's stores and the families' fishing | yard sets `hist-village-stores` x3, `hist-village-cookpot`, `hist-village-nets` | type 2 sets |
| Hatching-shed threshold | amber lamps, totem, candle | two mudmother `argonianlanterns03` hung from the eave beside the door (`mount --hang`, unmined, approved on the round-1 close-up `11-front-h-lamp1.png`), `argoniantotem01`, `argoniancandle01` | record palette; lit entrance |
| Overseers' door | lit entrance | `argoniancandle01` `o-candle` 1.7 m from the threshold, south of the walk line | 0102 decision 7, R89 |
| Ways | road-way (from the Border road paint), yard-way and four spurs; the gang walk, a 2.5 m track way that starts on its terminal and continues the boardwalk's line (27 deg off at first, 15 deg after the bend) | footpaths 1.5-2.0 m, track 2.5 m | R84, 97 C-stitch |
| Sockets | 11 layout markers (2 entrance, 4 scene, evidence, 2 mark, post) with `fills`; sleep sockets hosted on their shelter parcels; the overseer sits on the bench by day and night | layout `socket` ops | 0103 decision 6, R95 |

## Lessons this slice

- The skeleton schema costs a first slice most of its rounds: standard-2 ids, `parcel` against `parcelId` (a quest socket a parcel's `playerPurpose` names carries both), `rosterSlotId` = the record's slot ids. Recommendation: `wb.py skeleton`.
- A camp below a trunk road takes no road terminal (a footpath cannot continue a trunk; the join must also run within 20 degrees of its line). Its way in ends on the road paint. Its one network terminal is the track that serves it.
- Every yard-set member is bound to its parcel by uid, or the compile drops it and every socket hosted on it.
- `argonianlanterns02` draws its flame at the eave (kit row `anchorClass` ground); hang `argonianlanterns03` (lessons, buildings-doors-and-composites).
- A record roster naming one person twice needs two npc sockets: the duplicate `contents.npcs` row (n2) was dropped from the record.
- The provision fill subject and the multi-anchor quest premise were tooling gaps, fixed at source with a test each (`blueprint_promises.fill_subjects`, `record_coherence` anchor rule).

§ Interiors: door 1 hatching shed → CIPHTBMHutInterior04 (tier A, a storage
room: the clutch's room is the owner's call, packet decision 3); door 2
overseers' hut → CIPHTBMHutInterior01 (tier A).
