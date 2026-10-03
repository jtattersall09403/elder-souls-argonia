# Type 5: dungeon entrance (sheet written by slice 4, Takes-The-Tools; edited by every later slice of the type)

Feel: [type-feel.md](../type-feel.md), row Dungeon mouth, ruin.

Beast lairs, root systems, sinkholes and grottoes: 101 lair and lone
records with an `interior.kind` of delve, dungeon or warren. The place
outside is small (one mouth, its bank, its threshold); the place is the
cell below.

- **Cultures:** none build a lair; the mouth is a landform. Argonian
  root galleries use the Hist root pieces of King of the Murkmire; a
  ruin's mouth is its ruin kit's (type 6 sheet). No fence, no path, no
  sign, no light unless an occupant with hands lives in it (`occupants`
  or `contents.npcs` non-empty).
- **Recipe:** `type-recipes.json` rows `lair/*` (five slots: entrance,
  threshold, bank, approach, cell). What the records carry: `entrance`
  (cave-mouth, root-mouth, hollow-trunk, sinkhole-lip, burrow,
  underwater-entry, grave-cut, stair-throat, gate), `interior.family`
  (root-cavern, flooded-cave, burrow-warren, sinkhole-ruin),
  `contents.creatures[].whereInInterior` (threshold slots are exterior
  sockets), `interior.anchorSockets`.
- **The pick: the entrance is a linked shell, chosen for its cell**
  (0114, R83). Read `exterior-interior-links.json` for shells whose
  linked cell is a cave (`interiorFamily` under `dungeons/caves`,
  `dungeons/mines` or a mod's cave family) and whose cell is what the
  record says lives inside. Since the walk-9 re-mine a rock whose box
  holds an AutoLoadDoor01 is a shell, so the vanilla cave mouths carry
  their cells: `vanilla:landscape/rocks/rockcaveentrance02` links 29 cells
  (King of the Murkmire's MugsumpHollowInt01, MugsumpColdrootBurrow,
  FerenTarnInt01 and WajeemKronaInterior; HTBM's CIPHTBMSwampyGrotto and
  CIPHTBMCoatepecMine; Darkwater Den; ArgonianHome; and vanilla caves),
  with `rockcaveentrance01`, `rockcliffmineentrance`,
  `rockcliffmineentrance02` and `rockcliff06` beside it
  (`exterior-interior-links.json`). Name the story's cell with the door's
  `preferCell`; a cell whose architecture no kit holds yet is added to
  its plugin's interior kit first (next bullet). A cell that needs
  Creation Club, Dawnguard, Dragonborn, HearthFires or the resource pack
  for an ARCHITECTURE piece does not fit; clutter (a kit folder's
  `clutter/`), rock and vegetation from those archives stay listed drops.
- **Build the mouth the plugin built:** `python3 -m worldgen.link_neighbourhood
  --plugin <p> --cell <c>` lists every ref the plugin set round that door
  in the door's frame; take the pieces that frame the mouth at those
  offsets where the ground lets them stand (Takes-The-Tools: the rock and
  `hist_vines01`; the plugin also banks `rockcliff08` and `rockcliff02`
  behind it, which a hillside needs and level ground does not: the
  19.5 m `rockcaveentrance02` mound is its own bank). Seat a cave-mouth
  rock so its lip meets the ground: its tunnel floor rises from the door to
  the lip and an apron falls away outside it (measure with vertical rays
  through the raw GLB; `rockcaveentrance02`: lip 0.02 m above the pivot,
  3.79 m above the mesh base, so its `assetPlacement` row's designed sink
  is -0.02 m). A dug-in piece is seated on the lowest ground under its
  outline; its burial is measured from that line (`seat_rules`).
- **The cell's kit:** the cell's `no-kit-asset` gaps
  (`export_interior_bundle --plugin <p> --cell <c>`) join the plugin's
  interior kit (King of the Murkmire: `interior-kotm-v1`) in one build; an
  absent diffuse takes a same-plugin LOD copy only with pixel std above
  10 (kit `textureNote`).
- **The invisible load door:** a cave mouth's plugin door is
  `autoloadmarker01` (no mesh). The exterior door record sits at the
  link's `doorOffsetInShell`; the interior's is a marker drop that is
  still the cell's load door (`export_interior_bundle.is_invisible_load_door`).
- **Bars:** no `breadth-bars.json` type object yet (one shell); the
  threshold carries at least two dressing kinds that tell the record's
  occupant (bones, tools, nest litter, offerings).
- **Gate rows:** `interiors.closed` (the mouth must claim its cell),
  `interiors.variety` (a cave cell is held like any cell), `record.coherence`
  (the record's `entrance` names the built mouth), `lights.density`
  trivially (no fixtures), `promises`.
- **Approach:** no way and no terminal for a hidden lair (`discovery:
  none`, effort 4+): `approaches[].fromDirection`, the mouth faces the
  side the record's story comes from.
- **Building minimum set and yard sets** (`world/sources/placement/yard-sets/05-dungeon-entrance.json`):
  the mouth (linked shell), the pieces its plugin sets round the door
  (`link_neighbourhood`), a bank of rock behind it from the same list
  (flora-province-v1 `rockcliff*`), `lair-bone-scatter` at the threshold,
  `lair-tool-scatter` when the record's victims carried tools. A root-cave
  place's shell, collar, bones and tools are all in settlement-root-v1, so
  it loads one culture kit beside the flora kit.
- **Sockets:** threshold creatures are `fauna` sockets outside; deep
  creatures, loot and caches are cell sockets (`interiorCell`); taken
  belongings are `item` sockets (class `tool`).
- **Pieces that worked, pieces that failed:** see `references/lessons/`
  rows tagged type 5 and this slice's design.md § Lessons.
- **Layout template:** not written (owner call pending on templates,
  walk 9).
