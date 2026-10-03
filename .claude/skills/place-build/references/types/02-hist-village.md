# Type 2: Hist village (sheet written by slice 2, Greenspring; edited by every later slice of the type)

Feel: [type-feel.md](../type-feel.md), row Village.

Covers the `hist-village` catalogue type (16k § The type list, row 2): a
tribal or dry village grown round its own Hist. First place: Greenspring
(`place.hist-heartland.greenspring`, M3, hist-heartland), design in
`world/sources/blueprints/greenspring.design.md`.

## Cultures (97 Part F)

| Half | Part F row | Plan unit | Centre | Orientation | Enclosure | Water | Never appears |
|---|---|---|---|---|---|---|---|
| Argonian (mud) | `argonian-mud` (97 :758) | compact cluster on the dry slope, huts to the common and the tree | the Hist on its own mound (97 C4: where C2 and C4 want the same ground the Hist wins, L17) | door to a footpath, long axis on the contour | none: totems mark the edge (97 owner call 8) | on the bank; craft beached (R5), a spring house where the record has a spring | stone walls, fences, stilt platforms over open water |

## Recipe and lore

- Recipe row `hist-village` in `world/sources/catalogue/type-recipes.json`;
  its `footprintRadiusM` is derived from the built ground
  (`author_type_siting --apply`; Greenspring measured 55 m).
- Lore: `world/sources/lore/topics/hist-placement.md` (the Hist's kind and
  state, §2 R1-R6; every village has its register row in §3 before the
  design brief), the zone dossier, the quest provisions (MR01 at
  Greenspring).

## Bars (breadth-bars.json, 0098 § 1)

The column is the built count (`breadth_bars.built_column`): 7 buildings
read as a village. Greenspring planned and met: distinct shells ≥ 4 (4),
top dwelling-shell share ≤ 0.35 (0.33), signature ratio 1.0 (1.0).
Enclosure kinds: none by culture.

## Building minimum set and yard sets

- Shell pool (Argonian, tier A interiors where the plugin links a cell):
  `composite:mud/kotm-house-pod` (KeebaHouseCrafter, KeebaHouseFisher,
  KeebaHouseSnailMinder; the pool's only tier A cells, all on smpodext02),
  `composite:mud/hut-with-entrance` (BMV hut, reserved `bmv`),
  `kotm:argonia/mudhuts/mudhut01` (reserved `kotm`),
  `kotm:argonia/mudhuts/shed` (open-fronted: a spring house or store).
  Rotate the pool across places (0098 caps a signature at 3).
- Rejected on their interiors: `mudhut02` (KeebaHouseElder: its door is an
  upper storey 4.7 m up and needs a stair composite, 16k S26),
  `mudmother mudhut01` (HearthFires and Dragonborn pieces).
- Every building stands on a mud pad with a batter (the mud kits have no
  retaining wall). Pads must not overlap (L76).
- The Hist: `histtree:skyfall/sleeping tree overhaul/ancient sleeping tree`
  on a padded mound bound as a landmark with a pad (export ships it,
  f30acd06); the shrine at its foot: rune circle, two `argoniantotem01`,
  `windchimehavok`, Hist flowers, two `argoniancandle01`.
- Lights: `argoniancandle01` within 2 m of every door (the mud kit's one
  ground light). `argonianlanterns02-04` hang only from a mined host
  (Hist branch, archwaysticks) at the mined offset.

## Pieces that worked, pieces that failed

- Worked: the KotM pod, mudhut01, the shed as a spring house, beached
  `canoe1` and `plank_ferry_swamp_01`.
- Failed: the BMV hut floated 0.35 m until the sink miner grouped references
  by placement scale (62466305); the tent and the stilt lizard house (floor
  edges off their mesh records).

## Known failure modes

L17, L24, L33, L64, L75 (dressing on a slope: seat by search on the pad's
flat), L76 (overlapping pads). Dressing on a 5-8° slope failed 31 of 43
pieces on the first apply; `seat_dressing.py`
(`tooling/.reports/16k/place.hist-heartland.greenspring/`) seated all but
3 in 3 s until `wb scan` gets a dressing mode (16k S20).

## Layout template

Written at the type's second place (16k S10).
