# Type 9: early-game location (sheet written by the first slice, Gang Ground; edited by every later slice of the type)

The opening scenes of 0062 § 9 and quest MQ01: the work barge (The Roll,
M1 works), the gang's camp (Gang Ground, M2 muster yard) and the Corimont
crosstrees (M1 transit, inside Alten Corimont, type 8). Every type-9 place is
owner-guided: it is applied with `--owner-guided "<the owner's words>"`, built
as a DRAFT for the owner to steer, and exits the loop only on the owner's
acceptance.

- **Cultures and their 97 Part F rows:** Argonian (the Owing gangs and their
  families). Plan unit: the household shelter; centre: the cookfire; spacing:
  one shelter per levelled terrace on sloped ground; orientation: openings to
  the yard way; enclosure: none; water relation: the bank, never the water.
  Never a well, a signpost or a fence.
- **Recipe:** the three records in `places-pirate-freeholds.json`
  (`opening-work-barge`, `opening-work-camp`, `corimont-crosstrees`). Each
  carries `ownerGuided`, a `boundTo` to the barge and MQ01's provisions
  (`opening-egg-clutch`, `opening-camp` STATE, `opening-work-camp`). Read
  `sitingPrefs.hardConstraints` against the ground before designing: the
  plotter put Gang Ground on a 16 degree bluff 21 m above the marsh and the
  barge 406 m from its port against "inside 250 m".
- **Lore to read:** `world/sources/lore/topics/labour-and-bondage.md`:52-118
  (the Owing, the roll, the brokers' overseers);
  `world/sources/lore/extrapolation/argonia-4e201-state.md`:166 (eggs, names
  and burial run through the Hist).
- **Bars:** no `breadth-bars.json` type object. Gang Ground: 6 shelters
  (2 doored stilt huts, 2 open sheds, 2 tents), 40 placements, 6 lights,
  2 tier A interiors, 4 roster slots, 11 markers.
- **Gate rows and asset pools:** `interiors.closed` (only plugin-linked
  shells: the bamboo stilt huts with their CIPHTBMHutInterior cells),
  `lights.density`, lit entrances (a light within 2 m of each threshold),
  `record.coherence`, `promises` (every MQ01 socket a `marker` with `fills`).
- **Approach:** the camp is reached on the gang's walk from the barge
  (`track.track.pirate-freeholds.gang-walk`, the only network terminal) and
  from the Border road's paint. A way from a trunk cannot be a footpath and
  a terminal on the trunk must continue its line within 20 degrees, so a
  camp below a road takes no road terminal: its way-in ends on the road
  paint (R84) and its approach is the track's.
- **Building minimum set and yard sets:** per sloped site, each shelter on
  its own `pad` with `apronBySide` toward its yard and `batter`; the fire on
  its own 1.5 m pad. Yard sets from `yard-sets/02-hist-village.json`
  (`hist-village-stores` per household, `hist-village-cookpot`,
  `hist-village-nets`); every member is `bind`-ed to its parcel by uid
  (`kind assembly`, `layer clutter|light`), or the compile drops it and
  every socket hosted on it.
- **Sockets:** quest promises are layout `socket` ops of kind `marker`
  (zone scene / evidence / mark / post / entrance) with `fills` naming the
  0104 rows; the blueprint's `questSockets` keep the catalogue `socketRef`
  only (one with a parcel `playerPurpose` pointing at it carries both
  `parcel` and `parcelId`). Sleep sockets in open shelters are hosted on the
  parcel id; an interior sleep socket needs a furniture socket in the cell
  (the CIPHTBMHutInterior cells have none: storage rooms).
- **Pieces that worked:** `composite:stilt/bamboohut01-with-door`,
  `bamboohut02-with-door`, htbm `orcawninghalf01`, mudmother
  `argoniantent02`, `campfire01burning`, `argonianlanterns03` hung from the
  hut eave, `argoniancandle01` beside a door (1.4 to 1.7 m from the
  threshold, clear of the stilts). **Failed:** `argonianlanterns02`
  (`anchorClass` ground/unplaced although `placeUse` hanging-only: its flame
  draws at the hang point on the eave, not in the cage); a candle 0.3 m off
  the overseers' hut (penetrates the stilt frame).
- **Known failure modes:** a plotted record that breaks its own hard
  constraints (re-check before the slice); the skeleton schema errors every
  first slice meets (standard-2 ids, `parcel` against `parcelId`,
  `contents.npcs` slot ids as `rosterSlotId`); a record roster that names the
  same person twice (a `notableNpcSlots` row and a `contents.npcs` row) needs
  two npc sockets, so drop the duplicate in the record.
- **Layout template:** not written; type 9 is three owner-guided one-offs.
