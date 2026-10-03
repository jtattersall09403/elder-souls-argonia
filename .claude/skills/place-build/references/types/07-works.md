# Type 7: works and landing (sheet written by the type's first slice, Bog Iron Workings, 16k walk 9; edited by every later slice of the type)

49 active `works` records (craft, extraction, illicit, storage-and-freight,
cultivation, aquaculture, labour, market) and the ferry stages and landings
(`transit` records). A works is a process laid out on the ground: what comes
in, the machine that changes it, what goes out, and the crew that runs it.

- **Cultures:** the record's `culture` builds the crew's shelter (97 Part F:
  `argonian-mud` pods and huts, `imperial` farmhouse shells); the machinery
  comes from the neutral works pool (`works-v1`, `works-props`), which every
  culture may use (`culture-kits.json`). A works parcel whose piece is
  machinery is a prop by `parcel_kinds` (smelter, forge, rack, cart): do not
  pin `kind: building` on it, or 97 C1 reads a vanilla smelter as an Argonian
  building.
- **Recipe:** the record carries no `services` as a rule; `rewardProfile`
  `materials` is met by the works itself, `trade-access` only by a `trader`
  or `market` parcel (a works record that names it with no trader is a
  record defect; Bog Iron removed it at 5b). `contents.npcs` is the crew;
  a creature mis-filed as an npc slot (Bog Iron's "something in the deeper
  pools") moves to `contents.creatures` at 5b, or `sockets.roster` refuses
  it.
- **Lore to read:** `world/sources/lore/topics/material-culture.md`
  (§ Craft and materials: bog iron, clay, the Onkobra red clay, jadeflint);
  `fauna-hazards.md` § Minerals.
- **Bars:** `breadth-bars.json` type 7 has no override; the record's tier
  column binds (M1 hamlet: 4-6 buildings). A one-building works reads
  "below every column" on the 0098 bars and passes with that warning: the
  M1 works records hold one shelter.
- **The machine pieces (exterior-licensed, sinks measured):** Skyrim
  places its crafting stations as FURN marker NIFs, so the static
  `clutter/smelter/smelter01`, `smelter01coal01` and `common/tanningrack01`
  are unplaced (no R1 licence, mesh-sill sinks: `setting.class` and
  `sink.fallback` red). Use the marker meshes: `vanilla:furniture/smeltermarker`
  (Skyrim.esm `CraftingSmelterMarker1`; King of the Murkmire places the same
  mesh as `SmelterSTATIC`), `vanilla:furniture/tanningrackmarker`; King of
  the Murkmire's forge set `kotm:oaristys/forge/*` (coal pile, iron ore
  stack and bucket, iron ingots). `wrherbdryingrack01` is licensed interior
  only (Whiterun houses): not a yard rack.
- **The floor is a pad:** a works yard on a 4-8 degree slope gives its
  machine parcel piece a pad (`apronM` 5, `batter`), and every prop of the
  yard stands inside that pad's reach (`footing_slope_deg` reads the padded
  surface there; outside it a direct-fit prop fails 97 B3 at 2 degrees).
  A pad grows round the piece's minimum rotated rectangle, so a piece whose
  mesh sits diagonal in its frame makes a diamond pad: read the pad corners
  from the `check` row (`pad.edges[].fromM`) before placing the yard.
- **The way in:** an off-road works joins the minor route that passes it,
  never the major road it stands beside: the network stitch refuses a way
  of lower class than the route it continues and a join off its line by
  more than 20 degrees over the first 15 m. When no minor route ends at the
  place, the way runs 15 m along the passing route's line, then turns.
  Terminal kind `footpath` (a track terminal needs a spanning gate).
- **Approach:** the source of the material is seen first (the seep, the
  quarry face, the water), then the machine, then the crew's shelter.
- **Yard sets** (`world/sources/placement/yard-sets/07-works.json`):
  `works-bloomery-yard` (bellows, woodpile, chopping block round the
  furnace), `works-ore-carry` (hand cart, full baskets, pail at the head of
  the carry), `works-diggers-cookfire` (fire, pot, jar), `works-crew-stores`
  (jars, sacks, crate, pail, small woodpile by the crew's door). Every member needs its own `bind ...
  assembly` op: `group place --parcel` does not bind, and a socket hosted on
  an unbound member fails the compile ("no compiled placement").
- **Sockets:** an npc slot for the crew (work at the machine parcel, host
  `parcel.<slug>.<machine parcel>`, never the machine's uid: a parcel's own
  piece is no compiled placement id; evening at the cookfire; night in the
  shelter's cell bed); the record's scene socket on the machine parcel; a
  fauna or encounter socket where the record's creature lives.
- **Pieces that worked:** `composite:mud/kotm-house-pod` as the crew's hut
  (linked cells Crafter, Fisher, SnailMinder; Crafter is at its province cap
  of 3 since walk 9); `campfire01burning` as the cookfire light;
  `vanilla:furniture/smeltermarker` as the furnace parcel's piece holding
  the yard pad (sink measured, n 25; 6.7 m plan with its charcoal bed, so
  the parcel pins `kind: prop` with the reason in `why.what`, or the
  compile reads a structure outside the district's kit set);
  `kotm:oaristys/forge/orestack_iron`, `orebucket_iron`, `ingotsiron01`.
  A doorless furniture, clutter or container parcel piece has no floor
  edge (`rules.FLOORLESS_CATEGORIES`); never author a contradicting
  `groundFit` instead: the publish refuses it.
  The material's source reads by the work at it, not by a rock: a dig on
  the seep's edge is `shovel01` stood in the mud (its sink row buries the
  blade 0.54 m, as vanilla stands shovels in dirt), two `orestack_iron`,
  an `orebucket_iron` and a `basketfull`, each bound to the machine parcel
  (an unbound `place` op is never compiled, so its `fills` fail
  `promises.built`). A clutter cluster on ground over 2 degrees takes one
  pad on one member (scan it first, R31) and the others stand on the pad's
  apron; the pad's owner settles on the datum, about 3 cm above the padded
  surface, so give it `y` at the surface its neighbours settle to, or
  `propSeatRule` fails it.
- **Pieces that failed:** `smelter01`, `smelter01coal01` (unplaced),
  `mineoreiron01` as the seep (dug in, 0.3-0.6 m shows: readers saw a dark
  boulder, no ore; the iron tint lives in an env cubemap the runtime does
  not draw), `kotm:argonia/clutter/basket02` beside ore (reads as an empty
  hoop),
  `wrherbdryingrack01` outdoors (interior licence), `argonianplatform` as
  boot-boards on a slope (pad fit, under 2 degrees only; a pad per board
  makes each a building with floor-edge failures).
- **Known failure modes:** the pod's door approach must arrive along the
  door's facing (the last leg within a few degrees of the inward facing):
  arriving 40 degrees off, the capsule meets the porch side at a 0.47 m
  rise (step 0.45).
- **Layout template:** not written (the brief for this slice says so; the
  second works place writes it from this sheet and two layouts).
