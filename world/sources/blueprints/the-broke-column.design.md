# The Broke Column (`place.imperial-fringe.the-broke-column`): design

Builder: place-type-4 lane, walk 9 fix round, 2026-10-01. Type 4 (camp or
hold), the type's first slice. The layout file
`the-broke-column.layout.json` is the source (0105 R59). Round folders:
`tooling/.reports/16k/place.imperial-fringe.the-broke-column/round-N/`.

## Why this place (the type-4 pick)

The 16k type table names no camp, so the pick is the camp with the
strongest causal record and the most quest anchors among the 44 active
`camp` records:

- Provisions: two (`fg07-anchor`, `lq15-anchor`), plus three quest rows
  that name it (FG07 The Price of Protection, LQ15 The Bandits Who Count
  Boats, LF21 Levy in Correct Phrasing). Only two camps carry more
  provisions. Each depends on an unbuilt owner-guided place:
  `pirate-freeholds.corimont-hiring-yard` on the type-9 opening barge,
  `hist-heartland.guide-camp-gate-side` on Helstrom, 71 m from its gate.
- Causal chain: the Legion's recall left a column unpaid; Gideon's council
  will not pay to clear it; the toll company would rather use it; Mile
  House of the Eagle names it a rival. No `dependsOn`, so nothing unbuilt
  holds it.
- Contrast: a hostile camp (27 of the 44 camps are hostile), the type's
  core machinery (tents, a fire, a palisade, a road block) on dry upland
  above a tarn, unlike the three lowland places built (Claywater, Greenspring,
  Riverwalk) and the jungle root hollow of type 5.
- Lost to it: `mercantile-coast.quinrawl-anchorage` (2 provisions, an
  untouched region) needs a cove and six keeled hulls the ground does not
  give (its plot is plain fringe marsh) and is water machinery again after
  Riverwalk; `dunmer-north.the-quiet-landing` and `hist-heartland.the-cut-circle`
  are one house and one hall, not camps.

## § Site

### The record (`world/sources/catalogue/places-imperial-fringe.json`)

- **class** camp / hostile-camp / deserter-camp, variant `legion-remnant`, M1,
  `simple`, danger D3, culture `imperial`, owner faction
  `faction.imperial-legion-remnant`. Hostile,
  clearable; the serjeant parleys before he fights.
- **why:** a Legion column never paid off at the recall keeps watches and
  wears the colours; what it takes it calls a levy. Site: a blind bend with
  cover uphill and a ravine behind it for a retreat. Pressures: Gideon's council
  will not pay to clear it; the toll company would rather use it. Would
  disband for a pardon and a wage.
- **vibe:** four Legion tents pitched in a line, dressed, on ground no
  quartermaster would choose; faded Imperial red gone brown, dull steel,
  churned mud; issue canvas, issue tools, a palisade of cut fig poles;
  the duty roster nailed to a tree in a clerk's hand; militarily tidy but
  starving; approach: the road narrows, a man steps out and asks for the
  levy in correct Legion phrasing; senses: woodsmoke, a bell on the hour,
  little talk.
- **sockets:** scene `scene.the-broke-column.the-roster-tree`, evidence
  `evidence.the-broke-column.the-pay-book`. **contents:** loot `l1`
  (Legion issue kept in fighting order, strongroom), `l2` (the pay book,
  ledger); NPCs `n1` the serjeant (boss, named, D3), `n2` what is left of
  the column (band, D2). `assetPlan`: imperial-keep, market-tents,
  stockade-scaffold, signage-blank, clutter. `interior.kind` none.
- Promise ledger: `world/sources/placement/promises/place.imperial-fringe.the-broke-column.json`, 24 rows.

### The ground (`world/sources/sites/dossiers/the-broke-column.{json,md}`; workbench window `broke-column-1231-3073-150`)

- The anchor (1231, 3074) stands at 71.7 m on the spring-head stream that
  runs from a tarn (west, level about 59 m, 2.9 ha in the disc) down to the
  east; upland hills, relief 289 m across the 400 m disc, slope p50 20°.
  Only 10 % of the disc is under 8°.
- Concealment 0.89: seen from 12 % of the route points within 2 km. It sees
  Gideon 0.2 km east.
- A bench on the south bank, 35 to 50 m west-south-west of the anchor:
  x 1185 to 1200, z 3083 to 3094, ground 79.1 to 79.6 m; an 8 m pad there
  cuts and fills at most 0.4 to 0.5 m. A second, smaller bench at
  (1187, 3106), 80.8 m.
- Tracks (`routes-minor.json`): the Mile House track comes in from the west
  along z 3072 and meets the Swampmoth Town track at (1225, 3066), at the
  stream; the Swampmoth track runs on south-east and the Giovesse Lines
  track leaves it at (1263, 3104). The province road (Gideon to Stormhold)
  is 165 m east. The camp holds the track junction a bend off the road,
  out of the road's sight.

### Neighbours (site packet, within 500 m)

Giovesse Lines (siege earthworks, 90 m SE), Mile House of the Eagle (road
stage, 139 m WNW; names this camp a rival), Fort Swampmoth (occupied fort
held by toll-takers, 151 m SW), Onkobra Field Station (189 m S), Swampmoth
Town (garrison town, 242 m N), Silver Cairns (265 m S), Gideon (city,
anchor 320 m E, radius 230 m). Nothing built within 900 m; Claywater
Station is 930 m west on the same Blackwood Road, a different type.

### Quest rows

- FG07 The Price of Protection (`quests-factions.json`, live, tier 2): local
  officers encourage bandits to keep villages dependent on charter
  contracts. The column is the bandits.
- LQ15 The Bandits Who Count Boats (`quests-standalone.json`, live, tier 3,
  settlement Cartwright's Cross): bandits work the Gideon leg because a toll
  office publishes its schedules. The camp needs a place the schedule lives
  (the command tent's table).
- LF21 Levy in Correct Phrasing (`local-imperial-fringe.json`, skeleton,
  settlement Gideon): whether a pardon can be offered to men who still keep a
  Legion duty roster. The roster tree is the scene.

### Lore read

- `world/sources/lore/topics/history-timeline.md`:73 (3E 433): Fort
  Swampmoth's legions are rumoured recalled at the Oblivion Crisis.
- `world/sources/lore/topics/foreign-powers.md`:26-37: Fort Swampmoth a
  Legion fortress rumoured emptied; no source records an Imperial
  presence after 4E 48.
- `world/sources/lore/extrapolation/argonia-4e201-state.md`:484: no official
  Imperial presence in 4E 201, Imperial people everywhere.
- `world/sources/lore/gideon.md`: Gideon, the Blackwood Road's first city,
  the Legion built roads and forts round it.
- Consequence: the recall is about 200 years before 4E 201 (era policy,
  decision 0002). The men in the camp cannot be the men left unpaid; they
  are the column's sons and grandsons, keeping the roster and the colours
  as an inheritance, as Mile House's keeper keeps an inherited road-warrant
  and Fort Swampmoth's outfit its written claim. The record's founding line
  is corrected to say so (§ Record corrections).

### Built nearby and what not to repeat

Claywater Station (type 1, 930 m W): Imperial farmhouses, well, hay, stable,
road signs. This camp uses no farmhouse, no well and no signpost; its
Imperial look is canvas, banners and poles, not timber and plaster.

## § Brief

### The calls the ground, the record and the kits force

1. **The camp stands on the bench, not on the anchor.** The plotted anchor
   is on the stream at the track junction; the one level ground is the
   bench 35 to 50 m west-south-west (79.2 to 79.8 m over x 1183 to 1207,
   z 3086 to 3094). The tents line up along it on pads; a footpath drops
   5 m over 16 m (17 degrees) to the Mile House track.
2. **The Legion camp set is Skyrim's own** (new kit `camp-v1`, every piece
   licensed `exterior: camp` by Skyrim.esm in `kit-setting-class.json`):
   `largeimperialtent01` (27 plugin sinks, p50 0.56 m), `smallimperialtent`
   (94 sinks), `civilwarbanner01` with `civilwarbannerimp01` hung on it
   (mined band pair, 8 placements); the stakes and the barricade come from
   enclosure-v1. Left out on their licence (R1): the cot, the campaign map
   and the ground bedroll (interior only), the second banner (no camp), the
   paper note (no plugin places it as a static).
3. **No building has a door.** Every tent is open canvas walked into (R18,
   decision 0114 rule 3); the record's `interior.kind` is `none`, so no
   interior cell is claimed. The command tent's opening is its long north
   side (interiors index: open front at 295 degrees in its own frame, 1.5 m
   wide, ray-confirmed); a small tent's is its north gable (co-placement
   front at 266 degrees). Both stand at yaw 90 so the openings face the
   track.
4. **The hillside takes no prop off a pad.** Every survey cell on the bench
   edge is over 2 degrees, so the fire set stands on the command tent's
   pad: a brazier (`impbrazier01`, exterior camp 12) by the tent's mouth is
   the camp's fire and its lit entrance, with the bench and the firewood
   beside it. The 2.8 m campfire fits no pad here (every scanned pose had a
   pad edge over the 1.2 m batter limit).
5. **The levy post is a barricade beside the track, never on it**
   (`roadSurfaceRule`): `stockadebarricade01` narrows the Mile House track
   west of the junction; the column's man steps out from it.
6. **The roster tree is a kept aspen.** The bench carries a stand of
   `gkbtreeaspen03jungle`; one in the gap of the palisade below the tents
   (1198.4, 3080.5) survives the clearance and holds the roster scene. The roster is paper the item catalogue places (no static
   note is licensed), so it is an `item` socket at the tree.

### Rows

| Thing | Purpose (who, what, which promise) | Kit piece (measured) | Rule or pointer |
|---|---|---|---|
| Command tent | the serjeant's tent, with the pay book and the schedules in it; boss home and work (`occupant-n1`, `evidence-the-pay-book`, `provision-fg07-anchor`, `provision-lq15-anchor`) | `largeimperialtent01` (camp-v1; 8.30 x 5.84 x 4.53 m at yaw 90; plinth fit, sink p50 0.56 m from 27 plugin refs) on a 2.0 m pad | R18, 0114 rule 3 |
| Three tents of the line | where the column beds down (`occupant-n2`) | `smallimperialtent` (3.13 x 4.68 x 2.68 m at yaw 90; plinth fit; reviewed sink 0.48 m so the canvas meets the pad, R58) on 0.8 m pads; centres 4.0 to 4.5 m apart, one yaw, one line | `vanilla:t0224` line template |
| Brazier | the camp's fire, the cook spot and the lit entrance of the command tent | `impbrazier01` (works-v1; exterior camp 12) on the command tent's pad | 97 C16, R3 |
| Bench and firewood | where the column sits by the fire | `farmbench01`, `firewoodpilemedium01` on the same pad | R94 |
| Two banners | the colours at both ends of the line | `civilwarbanner01` pole with `civilwarbannerimp01` hung by the mined band pair | mounts record |
| Palisade | sharpened stakes along the bench foot, open at the camp path | `stockadepike01` x 16 (enclosure-v1; camp 43; dug-in, sink p50 1.03 m) | R1 |
| Levy post | narrows the Mile House track below the camp | `stockadebarricade01` (enclosure-v1; 9.16 x 1.99 x 2.16 m; dug-in, sink p50 0.27 m from 100 refs) beside the track | `roadSurfaceRule` |
| Tent stores | half-empty stores between the tents of the line | `miscsacklarge`, `barrel01` (works-v1, both exterior camp) | § Containers |
| Camp path and line walk | the track to the tents and the command tent's mouth | footpaths 1.2 and 1.0 m; the camp path joins the Mile House track at a network terminal | `pathReachRule` |
| Roster tree | the roster scene (`scene-the-roster-tree`, LF21) | a kept frozen `gkbtreeaspen03jungle` in the palisade gap below the tents | § Sockets |

Lights: the brazier, the camp's one fixture (`lights.density`).

### § Interiors

| Building | Shell | Tier | Why |
|---|---|---|---|
| Command tent | `largeimperialtent01` | none: open front, entered on foot | R18: open canvas its plugin places outdoors with no door; record `interior.kind` none |
| Tents 1 to 3 | `smallimperialtent` | none: open front | as above |

### § Containers and items

- `container` sockets: the sack beside tent 1 (food, near empty) and the
  barrel beside tent 2 (water), each in the gap between two tents where
  `walkRule` reaches it; the inside of a tent is not walkable to the rule
  yet (its footprint is the hull of its lowest 1.5 m; REQUEST row).
- `item` sockets: the pay book (`contents.loot.l2`, book, moderate) and the
  toll office's schedules (note) inside the command tent (the pay book fills `evidence-the-pay-book`); the duty roster (note)
  at the roster tree. The strongroom's Legion issue (`l1`) has no item class
  yet (no weapon or armour class in the socket vocabulary; REQUEST row).

### § Creative register (three calls unlike Claywater, Greenspring, Riverwalk)

1. A dressed line: four tents on one yaw at even centres, the one ordered
   thing on a ragged hillside.
2. The colours at both ends of the line, Imperial red on poles over a
   starving camp.
3. A levy barricade that takes half the track, so the approach is a
   conversation before it is a fight.

### § Sockets

| Kind | Host | Data | Why |
|---|---|---|---|
| npc | the command tent's mouth | slot n1, the serjeant | the boss lives and works at his tent |
| idle (stand) | the command tent's mouth | n1, work and home | the column reports to him there |
| npc | the line walk | slot n2, the column | the man who steps out for the levy |
| idle (stand) | beside the barricade | n2, work | the levy is asked here |
| idle (cook) | brazier | n2, evening | the column eats at the fire |
| idle (sit) | the bench by the brazier | n2, home | the column sits out the night there |
| marker | the roster tree | `scene.the-broke-column.the-roster-tree` | LF21's scene |
| item | command tent | pay book (`l2`), the toll office's schedules | FG07, LQ15 |
| item | roster tree | duty roster, note | the signature feature |
| container | sack, barrel | food, water | the stores |

### § Quests

- FG07 The Price of Protection (tier 2): the column is the protection that
  officers sell. Needs the serjeant (n1) and the pay book (who pays).
- LQ15 The Bandits Who Count Boats (tier 3): the column works the Gideon leg
  from the toll office's published schedules. Needs the schedule in the
  command tent and the levy post on the track.
- LF21 Levy in Correct Phrasing (tier 3, skeleton): the pardon question,
  settled by parley. Needs the serjeant and the roster tree.

### § Seams

Off the road: the Gideon road is 165 m east and out of sight. The camp path
joins `track.imperial-fringe.mile-house-of-the-eagle` at a network terminal
below the bench; the levy barricade stands on that track's verge west of
its junction with the Swampmoth Town track. No board: a hostile camp posts
none (R96 lists no service here).

### § Approach (openworld-approach §5, the answers that matter)

Seen first from the Mile House track: the banners on the skyline, then the
tent line, then the barricade across half the track ahead. No way-sign;
the only way up is the camp path, which leaves the track along its own
line (97 C-stitch: the first 15 m of a way stay within 20 degrees of the
route it continues) just short of the barricade and climbs through the gap
in the stakes. The barricade stands on the one level stretch of the track
below the bench (0.64 m of ground change along its 9.2 m; at its first
site the change was 2.0 m and half of it was buried).

## Record corrections (step 5b, one change set)

Applied to `world/sources/catalogue/places-imperial-fringe.json` through the
parser (`tooling/.reports/16k/place.imperial-fringe.the-broke-column/record_edit.py`):

- `why.founding`: the recall was two centuries ago (era policy 0002), so the
  camp is held by the column's grandsons.
- `why.siteAdvantages`: the bench above the Mile House and Swampmoth track
  junction, out of sight of the Gideon road (the built site), in place of
  "a blind bend on the road".
- `vibe.materials`: "a palisade of sharpened poles" (the stakes are pine;
  no fig grows within 200 m).
- `vibe.approach`: the track narrows at the barricade below the tents.
- `vibe.senses`: "the watch called on the hour" in place of a bell no asset
  shows.
- `playerPurpose.hook`: the grandsons hold a track junction off the Gideon
  road.
- `positionM` moved 37 m to the built camp (1196, 3084).
- `relations.rivals` names Mile House of the Eagle back (it named this camp).

`record_coherence --changed`: 0 failures over the re-checked places; the
receipt went from 291 to 292 green records.

## § Lessons this slice

1. A new kit's candidates are read for their licence, their mounted parent
   and their duplicates before the first build: five of eleven Legion pieces
   failed R1; the banner hangs from a pole outside every kit; the stakes
   and barricade were already in enclosure-v1 (four kit builds instead of one).
2. A tent's front is read from the interiors index (`entrance.sideDeg`,
   `front.deg`), never from a render: both Legion tents open on their -x
   side and stand at yaw 90 to face north.
3. On a hillside every prop needs a pad: the compile's 5.48 m cells read
   over 2 degrees everywhere off a pad, a building pad's apron is the only
   level ground. The 2.8 m campfire fits no pad here. The brazier on the
   command tent's apron is the camp's fire.
4. Open tents hold no reachable socket or container: `walkRule` blocks the
   hull of a tent's lowest 1.5 m (REQUEST row). Stores stand between the
   tents; the serjeant's work socket is the tent's mouth.
5. A double-sided cloth piece (`doubleSided: true`) needs `lodRatios
   [1.0, 1.0]` in its kit row, or it ships one LOD level and the compile
   drops it (`lod_tiers_can_meet`), as the chicken nest did.
6. A way leaving a passing track must run along it for 15 m first
   (C-stitch); a camp beside a through track lays its path along the verge,
   then turns.
7. A long rigid piece stands where the ground along its length changes by
   under 0.6 m, whatever its fit: the dug-in barricade passed `check` with
   half its length buried on a 2.0 m rise, seen only in the close-up render.
