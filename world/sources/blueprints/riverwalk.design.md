# Riverwalk — design (16k slice 3, type 3 water village)

Builder: place-new lane, walk 5, 2026-09-29. The layout file
`riverwalk.layout.json` is the source (0105 R59). Round folders:
`tooling/.reports/16k/place.dunmer-north.riverwalk/round-N/`.

## Site

### The choice

Slice 3 by the contrast rule: type 3 (water village), region dunmer-north,
against Claywater (type 1, imperial-fringe) and Greenspring (type 2,
hist-heartland). Riverwalk is the smallest water-village record with sockets.
The record's `culture` is `argonian`: its `sitingNote` places it on the
Argonian marsh side of the north.

### The record (`world/sources/catalogue/places-dunmer-north.json`)

- **why:** the northern trunk's mid-point, strung along a channel because the
  channel is the street; lives on the ferry, the toll and feeding boat crews;
  Alten Corimont's captain and Thorn's field-owners both claim the toll.
- **vibe:** one boardwalk with houses down both sides and "no land under any
  of them"; silver plank, black water, reed roofs; constantly re-planked.
- **services:** ferry, lodging, shrine, trader. **occupants:** D1 households,
  D2 crews overnighting, D2 toll hands. **notable slots:** toll-holder,
  stage-mistress. **sockets:** scene `the-long-walk`, evidence
  `the-plank-ages`, posts `toll-holder` and `stage-mistress`.
  **travelStation:** boat, canoe, ferry to seven dunmer-north places.
- Promise ledger: `world/sources/placement/promises/place.dunmer-north.riverwalk.json`, 15 rows.

### The ground (`world/sources/sites/dossiers/riverwalk.{json,md}`, workbench grids)

- A cove of `body.ocean` (level 0.0 m): water 0.4–0.9 m deep over flat mud
  (x 7170–7215, z 532–615); a dry spit to the north (x 7185–7220,
  z 496–530, 0 to +2 m); a dry islet to the south (x 7205–7245,
  z 618–640, 0 to +1 m); a cliff to the west; water deeper than 1 m north of
  the islet (x 7230–7245, z 595–610), then a terraced drop to 3.8 m.
- The tracks from Riverwalk, Hissmir and Murkwater all end at (7186.1, 573.0),
  in the middle of the cove.

### Quest rows (`world/sources/quests/local-dunmer-north.json`)

LV38 Two Cities Claim the Halt, LV39 Argued Nightly, LV40 The Channel Silted
Overnight (all skeleton). No `20-world-provisions.md` provision names Riverwalk.

### Lore read

- `world/sources/lore/alten-corimont.md`:54,70: Riverwalk lies east of Alten
  Corimont on the Stormhold, Tenmar Wall, Alten Corimont, Riverwalk, Thorn line.
- `world/sources/lore/topics/roads-and-routes-4e201.md`:33–34: the
  Stormhold–Thorn trunk is extrapolated with Riverwalk on it.
- UESP has no Lore article for Riverwalk (an Arena and novel name only).

## Brief

### The calls the ground and the kits force

1. **No Argonian dwelling we hold may stand in the water.** The stilt shells
   (`composite:stilt/stilthouse-with-door`, HTBM `stilthouseplatform`) are
   ground-class with no plugin evidence of standing in water (mounts miner:
   `anchorClassEvidence` policy for one, unplaced for the other; BMV places
   `stilthouseext` twice, both on ground). `submergedRule` fails them in the
   cove; on dry ground the stilt house fails `slopeRule` (9–11°) even on a pad.
2. **The HTBM bamboo huts fit the spit but have no usable cell.** Their
   plugin cells (CIPHTBMHutInterior01 and 04) fail the fit rule (0 of 8–9
   cells pass; the room footprint is far under 0.6 of the shell), so their
   doors would be `reserved`, which R2, R41 and R52 forbid for a dwelling.
3. **The spit takes one large house, the islet a tent.** A KotM pod passes on
   the spit with a pad; the pod and the BMV hut both cut the islet's hump by
   more than 2 m.
4. The long walk carries the tracks: it starts on the spit and passes through
   the tracks' end.

### Rows (as built)

| Thing | Purpose | Kit piece (measured) | Rule or pointer |
|---|---|---|---|
| The long walk, 12 spans | the street; scene socket; the toll is called at its head | `vanilla:architecture/docks/dockstrent02` (docks-v1, 176 plugin placements, evidence snaps `pick 3`; deck 0.35 m over the water) | R67; docks-v1 is slope-exempt |
| The islet walk, 5 spans | joins the foot of the long walk to the islet | `dockstrsol01` (evidence snaps with `allow_terminal`); the first span is snapped square to span 11 by geometry | R67 |
| Ferry landing, 3 spans | islet shore to deep water | `dockstrent02`, deck lowered 0.16 m to 0.19 m over the water | R67, berthReachRule |
| Ferry raft | the ferry to seven stations | `ferryraft:snt/ferry/ferryraft01` in 1.3 m of water on a 1.6° bed | hullWater, slopeRule |
| Long house | lodging and trader; the safe interior; home of all five roster slots | `composite:mud/kotm-house-pod` on a mud pad (scan-f pose), cell KeebaHouseCrafter (tier A) | R52 fit rule |
| Stage shelter | the stage-mistress's post by the landing | `mudmother:gv_meshes/argoniannest/argoniantent02`, open front, no door | R18, R58 |
| Shrine | shrine service | two `argoniantotem01` and a `windchimehavok` beside the long house yard | — |
| Canoe | the canoe poler's craft | `canoe:actors/sfss/canoe/canoe1`, beached on the islet | R5 |
| Dressing | 21 single pieces sited with `wb.py site --free --clear 0.7` on flat padded ground | Argonian urns, baskets, chairs, pots, nets, an oar | slopeRule, propSeatRule |
| Walk-9 dressing | the crews-house's trade at a market stall on the crews path, on its own small pad; the islet's catch drying on a fish rack north of the islet path, where the long walk lands, on its own small pad. The shrine parcel keeps its totems: the Sithis shrine is licensed indoors only (R1) | `rtmarketstall01`, `fishrack01` | `references/dressing.md` § 4 (water village row set); pads scanned, `tooling/.reports/16k/place.dunmer-north.riverwalk/walk9-dressing/` |

Lights: `argoniancandle01` at the long house door (1.9 m from the
threshold) and at the stage shelter; the raft carries two mined flames of its own. The
fire module (`.claude/skills/place-build/references/fire.md`) draws every
flame from the kit's mined `flames[]` (the candle preset for the candles); no
flame is placed by hand. The long house interior is lit by the cell's own
four plugin lights (hearth 4.6 m, 3.5 m, 3.6 m and 0.7 m radius).

Built under no breadth column (2 counted buildings), so the 0098 and
breadth gates report "below every column".

## Record corrections (REQUEST rows in `tooling/.reports/16k/place.dunmer-north.riverwalk/requests.jsonl`)

- `vibe.silhouette` claims a kilometre of boardwalk with houses on both sides
  and no land under them. The built boards are about 125 m long. The one house
  stands on the spit. Rewrite it to what is built.

## Lessons this slice (candidate rows, REQUEST)

- Water village: read the shell's manifest `anchorClass` and
  `anchorClassEvidence` before choosing it. A `ground` shell in water fails
  `submergedRule`; a policy or unplaced class is a mining job filed before
  design.
- A dwelling shell needs a cell that passes the fit rule
  (`blueprint_interiors --claim`) before it is sited: run the claim on a
  one-parcel skeleton first. The HTBM bamboo huts have none.
- Yard sets on sloped ground: members at pad edges fail `slopeRule`. A
  `remove` of a member leaves its yard socket behind (walkRule then fails on
  a missing host). Site single pieces with `wb.py site --free --clear 0.7`.
- A route that carries a track in over water must be a `track` with at most
  20 m of it wet; the rest of the way over water is the walkable run parcels,
  with footpaths only on dry ground.
