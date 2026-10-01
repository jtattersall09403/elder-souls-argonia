# Type 4: camp or hold (sheet written by slice 5, The Broke Column; edited by every later slice of the type)

Hostile camps (27), civil and expedition camps (17) and pirate anchorages:
44 active `camp` records. A camp is a few open shelters, a fire and its
stores on whatever ground the occupants could hold; nothing in it is meant
to last and nothing in it has a door.

- **Cultures and their 97 Part F rows:** the camp is built by whoever pitched
  it. Imperial and Legion-descended camps take the district kit set
  `imperial-camp` (`camp-v1` with enclosure-v1's stakes and barricades;
  `worldgen/blueprint.py` `KIT_SETS`); Argonian camps take the Mud Mother
  hide tents (`argoniantent01/02`, settlement-mud-v1, `openShelter` rows);
  Khajiit and Altmer have no Part F kit and take the common layer
  (`culture-kits.json`). Plan unit: the tent; centre: the fire; spacing: the
  tent line (mined template `vanilla:t0224`: small tents 4.13 m apart at one
  yaw; built at 4.0 to 4.5 m, declared with `worksWith` + `worksWithWhy`,
  since 97 C5's 8 m floor would split the line); orientation: the openings
  to the way; enclosure: stakes or none; never a door, a well or a signpost.
- **Recipe:** `type-recipes.json` `class: camp` rows (19 types). Five slots
  (`cue`, `population`, `props`, `rewardFree`, `rewardGated`, `satellite`);
  `settingClass` camp, magnitude M1, `complexityBudget` simple. Hostile
  camps carry `interior.kind` none, the boss and band in `contents.npcs`,
  loot in `contents.loot`. The `satellite` slot is a neighbour, never part
  of the place. A record's prose that dates a founding to the Legion's
  recall is two centuries old in 4E 201 (era policy 0002).
- **Lore to read:** the record's culture dossier; for Imperial camps
  `world/sources/lore/topics/foreign-powers.md` (no Imperial presence after
  4E 48) and `world/sources/lore/topics/history-timeline.md`:73.
- **Bars:** no `breadth-bars.json` type object yet (default tier M1). Slice
  numbers: 4 tents, 2 shells, 30 placements, 1 fixture.
- **Gate rows and asset pools:** `setting.class` (every piece licensed
  `exterior: camp` by its own plugin; read `kit-setting-class.json` before a
  piece enters a kit: the civil-war cot, campaign map and ground bedroll are
  interior only, `note01` is licensed nowhere), `interiors.closed` (no shell
  with a load door), `lights.density`, `record.coherence`, `compile.spacing`.
- **The tents (geometry, not labels):** `largeimperialtent01` opens on its
  long -x side (interiors index `entrance.sideDeg` 295, 1.5 m wide, a raised
  plank floor 0.7 to 0.8 m over its lowest point; plinth fit, plugin sink
  p50 0.56 m); `smallimperialtent` opens on its -x gable (co-placement front
  266 degrees; floor platform about 0.45 m up; plinth fit, reviewed sink
  0.48 m so the floor meets the ground, `assetPlacement` row, R58). Both at
  yaw 90 face north. Both carry their own floor, so `walkRule` (the hull of
  the lowest 1.5 m) cannot reach a socket or container inside (REQUEST row):
  stores stand between the tents, the boss's socket at the tent's mouth.
- **Hillside sites:** the compile's 5.48 m cells read over 2 degrees off a
  pad, so every prop stands on a building pad's apron. A 2.8 m campfire
  needs a pad legal at 1.0 m apron; where none is, a brazier
  (`impbrazier01`, exterior camp 12) on the principal tent's apron is the
  fire and the lit entrance, with the bench and firewood beside it.
- **Approach:** a camp is seen from the way it watches. A camp beside a
  passing track lays its path along the track's line for 15 m (97 C-stitch:
  within 20 degrees) and then turns up to the tents; the road block stands
  beside the track, never on its line.
- **Building minimum set and yard sets:** per tent: its pad, one store
  beside it. Per camp: one fire with firewood and a seat; one lit entrance;
  hostile camps: the colours at the line (`civilwarbanner01` pole at scale
  0.65 so the hung `civilwarbannerimp01` is at scale 1.0, inside the
  0.2 to 1.5 schema range) and a road block. The fire set waits for
  `group place --pad` (REQUEST row) before it becomes `yard-sets/04-camp.json`.
- **Pieces that worked:** the five `camp-v1` pieces; `stockadepike01` and
  `stockadebarricade01` from enclosure-v1 (`dug-in`); works-v1
  `impbrazier01`, `firewoodpilemedium01`, `miscsacklarge`, `barrel01`;
  settlement-imperial-v1 `farmbench01`. **Failed:** the campfire (no legal
  pad on a 16 to 30 degree bench edge), `spitpotopen01` (hangs), the table
  inside the command tent (crosses the tent's own floor), on licence: cot,
  map, ground bedroll, second banner, note.
- **Known failure modes:** a `doubleSided` kit row without `lodRatios
  [1.0, 1.0]` ships one LOD and the compile drops it; a new kit needs a
  `KIT_SETS` row for its district; see `references/lessons/` rows tagged
  `type 4`.
- **Layout template:** not written (the planner answers the owner on
  templates this round).
