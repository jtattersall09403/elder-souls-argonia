# Takes-The-Tools (`place.saxhleel-coast.jungle-root-hollow`): design

Type 5, dungeon entrance (sheet `references/types/05-dungeon-entrance.md`, written by this slice).
16k walk 9, slice 4 of the loop, the first type-5 place.

## Why this place (the type-5 pick)

The 16k brief (§ From 16i item 1) asks for a dungeon-kind record whose
entrance piece exists in a kit, with complete promises, in a contrasting
region, preferring a root cavern. The lane brief adds: prefer a tier A
interior, so the entrance links to a real cell (0109, 0114).

Measured over the 61 active lair records (`classification.class` lair):

| Record | Region | Interior family | Entrance | Quest refs | Linked shell with a cell we can build |
|---|---|---|---|---|---|
| **Takes-The-Tools** (`saxhleel-coast.jungle-root-hollow`) | saxhleel-coast (unbuilt) | root-cavern S2, 1 entrance | sinkhole-lip | SX08 | `rockcaveentrance02` -> `MugsumpHollowInt01` (King of the Murkmire's 32 x 57 m root cave, bones, a behemoth's den): the record's "bone scatter", "something breathing" and "root-walled rock" are what the cell holds |
| Under-Root (`mercantile-coast.root-gallery-murkmire`) | mercantile-coast | root-cavern S2, 4 entrances | hollow-trunk | LM30, 3 sockets | none fits: "200 m of passage, three entrances, hearth-scars at three heights" is no linked cell we hold |
| The Hollow Under the Figs (`imperial-fringe...`) | imperial-fringe (Claywater's region) | root-cavern S2 | hollow-trunk | LF34, LF41 | fails the contrast rule (same region as slice 1) |

Takes-The-Tools wins: the only one of the three whose record the linked
cell can keep true, in a region no slice has built. Its record has the
fewest sockets, which this build fills from the cell and the mouth.

## § Site

**Record** (`world/sources/catalogue/places-saxhleel-coast.json`): lair,
root-system, root-hollow-gallery, M1, inhabited, danger D4, hostile,
clearable, respawn slow, `discovery: none`, `effortToReach` 4.
- why: a dry void under the root layer, root-walled and rock-floored, one
  defensible mouth, taken over by an occupant who drags its kills there.
  The record said a nearby village keeps its hunters clear of the valley.
  The change set names the hiring camp instead: there is no village nearby.
- vibe: a cave mouth in a bank, collared with Hist root, bones outside it;
  black, bone white, root brown; the bone scatter outside holds three
  generations of other people's tools; unwelcoming; the smell carries
  before the mouth shows; something breathing in a hollow space.
- contents: c1 `creature.wamasu` (D4, apex ambusher, deep); c2
  `creature.hoarvor` (D2, scavengers, threshold: ticks in the bone
  scatter); l1 unique item (deep); l2 hidden cache.
- interior: delve, root-cavern, S2, one entrance, dry, dark (0.8), lock
  hard, rooms collapse / gallery / cache, anchor socket `cache` (hidden).
- sockets: none named. occupants: none (a beast's lair).
- quest: SX08 Takes The Tools (skeleton, PREDATOR): the hiring camp
  (Sells-Their-Hours, `saxhleel-coast.owing-hiring-camp`) cannot forage
  because something in a root hollow has been taking foragers.

**Ground** (`world/sources/sites/dossiers/jungle-root-hollow.md`): centre
3682, 4554 m at 38.3 m, slope 0.7 deg; tropical jungle, firm upland soil,
danger band 4; canopy closure 0.98, 375 plants/ha (bracken, esloe bush,
tropical plant, fern); 3.0 m above the local water table, swamp body
`body.2047-2456` 70 m off (level 39.71 m); headwater channel 262 m W.
Hummocky floor: +-1.5 m over 50 m (workbench samples), no rock.
Concealment 0.85; 888 m from the archon-gideon road; Archon 1.48 km.

**Seams**: off the road. No route, track or terminal reaches the site
(`routeSeams` empty). The way in is through the jungle from the east,
from the hiring camp 895 m away at bearing 79 deg. No internal way is
built. A lair has no path; a path would also need a terminal. None
exists here.

**Neighbours within 500 m** (site packet): The Interrupted Flight 209 m NE
(fallen flier), The Horwalli Cut 225 m W (ruin), The Licensed Stage 257 m
WNW (sap-tapping camp), The Bled Tree 309 m NNE, The Warren 338 m SE
(another root gallery), Root-Sakka 340 m SSW (abandoned root gallery),
The Quiet Camp 429 m N. None is built. Nothing here may repeat The
Warren's signature (it is unbuilt; this place sets the root-mouth
signature first).

**Lore** (one line each):
- `world/sources/lore/topics/fauna-hazards.md:14`: the wamasu, a
  lightning-powered swamp beast; its bones are black and hold a charge.
- `world/sources/lore/topics/fauna-hazards.md:28`: the Argonian behemoth
  (Xal-Krona), made by the Hist; the plugin's own occupant of this cell.
- `world/sources/lore/topics/hist-and-sap.md`: Hist roots run under the
  ground of the whole province; a root gallery is a void under them.
- `world/sources/lore/topics/fauna-hazards.md:46`: hoarvor, the ticks that
  live on what a predator leaves.

**Places built nearby**: none within 2 km (Claywater, Greenspring and
Riverwalk are in other regions).

**Record defects found at step 0** (fixed in the step 5b change set):
- SX08's premise says the camp "cannot forage east". The camp lies 895 m
  east of the lair (bearing 79 deg), so the lair is WEST of the camp:
  the premise reads "west" after the change set.
- The record's `entrance` is `sinkhole-lip`; the built mouth is a cave
  mouth in a rock bank at ground level (`cave-mouth`). Changed in the 5b
  change set. The same set adds the tool scatter to `sockets.evidence`,
  names the quest's hiring camp in `why.pressures` and `wouldChangeIf`
  and drops "D4" from `why.founding`.

## § Brief

| Thing | Purpose | Kit piece (measured) | Rule or lore |
|---|---|---|---|
| The mouth and its bank (`b-mouth`, parcel `parcel.jungle-root-hollow.the-cave-mouth`) | the lair's single entrance: a 30 x 32 x 19.5 m mossy rock mound with the tunnel in its east face; the mound is the record's bank | `vanilla:landscape/rocks/rockcaveentrance02` (settlement-root-v1), seated so its lip meets the ground (reviewed `assetPlacement` row, designed sink -0.02 m: pivot 0.02 m under the lip); its AutoLoadDoor01 on the tunnel axis | 0114 (linked shell), R83; L25, L26; mined with `worldgen.link_neighbourhood` |
| The collar (`r-vines`) | the Hist root the record says collars the mouth | `kotm:argonia/trees/hist trees/hist_vines01` (settlement-root-v1), assembly member at the mouth's right-hand side, outside the rock (the plugin's own offset buries it in this rock on level ground) | vibe.silhouette; KotM refs round the door |
| Bone scatter (`s1-lb-*`, yard set `lair-bone-scatter`) | what the occupant dragged out and left | the bones `MugsumpHollowInt01` itself scatters (humanribcage, humanarmleft, humanlegleft, humanspine, bloodyribs, bloodybone) and its Argonian skull (`kotm:issgard/clutter/bones/issgard_boneargonianskullfull`), all settlement-root-v1 | vibe.signatureFeature |
| Tools in the scatter (`s1-lt-*`, yard set `lair-tool-scatter`) | other people's tools | `vanilla:clutter/common/shovel01`, `vanilla:clutter/basket01`, `shores:shoresofskyrim/fishnet01` (settlement-root-v1) | vibe.signatureFeature; item classes `tool`, `fishing-gear` |
| Lights | none: a beast's lair, nobody lights it | — | record `interior.light: dark`; R80 density trivially met |
| Ways | none (off the road, no terminal) | — | step 0.3b |

Bars: type 5 has no breadth-bars object yet (the type sheet records it);
the place is one shell, so the 0098 within-place variety bar does not
apply. Dressing kinds planned: rock 3, bones 7, tools 5.

### § Interiors

| Door | Building | Shell | Tier | Cell (expected) | Why |
|---|---|---|---|---|---|
| `door.saxhleel-coast.jungle-root-hollow.1` | the mouth | `vanilla:landscape/rocks/rockcaveentrance02` | A | `MugsumpHollowInt01` (King of the Murkmire) | the cell King of the Murkmire's AutoLoadDoor01 inside this rock loads (re-mined this slice: the miner gave the door to the Hist vines 5.85 m off because rocks were never shells; a rock whose box holds an invisible load door now is); a root cave with a beast in it. Shell-choice checklist: (a) doored; (b) linked; (c) the cell is a lair (bones, a behemoth, one chest): it serves the parcel; (d) not held anywhere in the province |

The cell's 162 references: its cave walls, pillars, vine floors,
stalactites, Hist roots, plants and bones were added to interior-kotm-v1
(the bones the place also lays live once, in settlement-root-v1). 21 ship
as listed gaps (R51, `kit-interiors/substitutions/MugsumpHollowInt01.json`,
each with its search): four Creation Club hanging root clusters, four
resource-pack cliff boulders and thirteen undergrowth clumps whose only
leaf texture is in the resource pack. None is architecture (the root
clusters sit in their kit's clutter folder).

### § Containers and items

- The cell's own rustic chest (container socket from the cell) is the
  record's hidden cache l2.
- The three tools at the mouth carry `item` sockets (classes `tool` and `fishing-gear`, value
  low): the foragers' things, for SX08's evidence.
- l1 (the unique item, deep) is an `item` socket in the cell.

### § Creative register (three calls unlike Claywater, Greenspring, Riverwalk)

1. No light at all: the only built place that is dark at night.
2. The signature is the threshold scatter: bones and tools in one fan
   in front of the mouth, thickest at the door, thinning outwards.
3. The bank is rock, the province's rarest material, set against living
   root, so the mouth reads from 30 m as a dark gap between rock and root.

### § Sockets

| Socket | Kind | Host | Data | Why |
|---|---|---|---|---|
| `socket.jungle-root-hollow.ticks` | fauna | ground at the scatter | D2, zone threshold, `creature.hoarvor` | contents c2 |
| `socket.jungle-root-hollow.occupant` | encounter | cell `MugsumpHollowInt01`, the den (host: its rib cage, ref 08570749, 44 m in) | D4, zone deep, `creature.wamasu` | contents c1 |
| `socket.jungle-root-hollow.unique-item` | item | cell, deep (host: hist_root04, ref 08570742, the far end) | class misc-household, value high | contents l1 |
| `socket.jungle-root-hollow.tool-*` (3) | item | the spade, the basket, the net | class tool or fishing-gear, value low | vibe; SX08 evidence |

### § Quests

SX08 Takes The Tools (PREDATOR, tier 3, skeleton). Foragers from the
hiring camp do not come back. Their trail ends at the hollow, with
their tools at the mouth. Inside is the thing that took them, to
kill or drive off.
Provisions: the mouth (door to the cell), the tool scatter (evidence, item
sockets), the occupant (encounter socket). All three are built here.

### § Seams

Off the road; no internal way; approach on foot through the jungle from
the east (the hiring camp). No sign: nobody marks a beast's lair.

### § Approach (openworld-approach §5, the answers that matter)

Seen first from 30-40 m through the trees (concealment 0.85): the rock
bank and the root mass; the mouth is the dark gap between them, facing
east toward the hiring camp. No light, no path, no sign.

## § Lessons this slice

Rows filed in `.claude/skills/place-build/references/lessons/`
(buildings-doors-and-composites.md, build-and-publish.md; L26 edited):

- The links record gave the cave's door to the vines beside it: rocks were
  never shells. Now a rock whose box holds an invisible load door is the
  shell; `link_neighbourhood` lists what the plugin set round a door.
- A cave cell's AutoLoadDoor01 is its load door, never a missing piece.
- A cave mouth's door stands on the axis its plugins' door yaws give; its
  sill is judged where the way in meets the ground; its lip is seated on
  the ground (designed sink = the measured sill).
- Lit density applies where people live; a cave mouth is not a building
  and needs no entrance light; an off-network lair is walked from its
  approach.
- Two lanes' miner merges lost a row: merges now hold the record's lock.
- A piece in two kits resolves to the first kit by name: keep one home.
