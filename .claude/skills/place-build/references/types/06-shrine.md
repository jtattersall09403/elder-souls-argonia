# Type 6: Shrine or sacred site (sheet written by slice walk 9, the Tag House; edited by every later slice of the type)

Feel: [type-feel.md](../type-feel.md), row Shrine.

Covers the `sacred` catalogue class (16k § The type list, row 6): 45 active
records in five families: `the-dead` 17 (bone-repatriation waystations,
urn vaults, mass-grave memorials, hammock-crown terraces), `hist` 10
(hero-Hist groves, wild and harmed Hist), `rite` 9 (dream-wallows,
beast-offering shrines, maturity-trial grounds, the shadowscale ground),
`sithis` 8 (nisswo rest houses, art-and-destroy sites, Sithis temples) and
one `wonder` (Murkwood Verge). First place: the Tag House
(`place.imperial-penal-south.rose-bone-waystation`, the-dead, M1), design in
`world/sources/blueprints/rose-bone-waystation.design.md`.

## Cultures (97 Part F)

| Half | Part F row | Plan unit | Centre | Orientation | Enclosure | Water | Never appears |
|---|---|---|---|---|---|---|---|
| Argonian | `argonian-mud` / `argonian-stilt` | one open roofed structure where the rite or the handover happens, one linked hut at most for its keeper | the structure, its front to the ways | the front onto the ways; ways end at the structure, never pass it | none (C10: argonian M1 0) | none needed | stone walls, Imperial shells, signs |

A shrine of the `hist` family takes the type-2 Hist mound (L17); a `sithis`
or `rite` place takes the mudmother `sithisshrine` (never at Murkmire, G2)
and the totems.

## Recipe and lore

- Recipe rows in `world/sources/catalogue/type-recipes.json` per family type
  (`bone-repatriation-waystation`, `urn-vault`, `dream-wallow` ...). Most
  records are M1 or null magnitude, one door at most.
- `breadth-bars.json` type 6 has no overrides and falls back to the M1 hamlet
  column (4-6 buildings): a shrine of one or two buildings is "below every
  column" and the breadth gates report, not fail. Lights still need 1 kind.
- Lore: `world/sources/lore/topics/prisons.md` (bones must reach the dirt),
  `material-culture.md`:232, 300-301 (grave-singer; bone-and-tin chimes at
  every threshold and eave), `hist-placement.md` (Hist sites),
  `sithis-nisswo-shadowscales.md` (Sithis sites), `argonia-4e201-state.md`:
  165-167 (burial runs through the Hist).

## Building minimum set and yard sets

- **The open structure:** HTBM `orcawninghalf01` (half pavilion, 8.2 x 5.0 x
  5.8 m; its pivot is at its straight front, the posts ring the back; the
  centre front post leans in, so nothing stands within 0.5 m of plan
  2559.5-2560.5 x 6563.8-6565.3 relative to a yaw-180 pose at 2560, 6565:
  read the posts first: `wb.py bpy <scene> blender/examples/post_clusters.py
  --out <json> --only <uid> --args <uid>`, 5 s).
  Its sink is the reviewed `assetPlacement` row -0.10 m. On ground over 3
  degrees it takes a pad (apron 1.5, batter).
- **The keeper's hut:** `composite:stilt/bamboohut02-with-door` or
  `bamboohut01-with-door`; every linked HTBM cell is a storage room
  (CIPHTBMHutInterior01 is the one fully sourced), so it is a store, not a
  dwelling, and the place's record says so.
- **Yard sets** (`world/sources/placement/yard-sets/06-shrine.json`):
  `handover-arrival-side` (closed baskets, urn),
  `handover-departure-side` (wicker bench, wrapped bundles, urns, cloth
  basket), `keepers-yard` (table, two chairs, basket, sack, lidded basket,
  urn, woodpile).
- **Lights:** `argoniancandle01` stands (a row across the floor marks a
  boundary); `impbrazier01` for an Imperial party's side.
- **Hung pieces:** Sleeping Tree `windchimehavok` (a hanging chime, exterior
  licensed) hangs from the pavilion's canopy and a hut's eave by `mount --hang`
  (unmined, reader-approved). Never stand it on the ground (`hangingRule`
  misses it, a tooling row); mudmother `argonianbonechime01` and the vanilla
  `wrherbdryingrack01` are licensed interior only (setting.class red).

## Pieces that worked, pieces that failed

- Worked: the half pavilion on a pad; the HTBM wicker furniture; chimes
  hung on the canopy.
- Failed setting.class: `argonianbonechime01` and `wrherbdryingrack01`
  outdoors (their plugins place them indoors only).
- Failed at first apply: a table inside the post ring with no free walk cell
  within 1 m (the yard set's automatic idle socket fails walkRule); a candle
  on the leaning centre post; keepers'-yard members on the pad's batter
  (6-18 degrees).

## Known failure modes

L17 (Hist mound), L75 (dressing on a slope), L76 (pads). New this slice:
dressing a post-ringed open structure needs its post clusters read first;
yard pieces stand on the pad's flat, never its batter (widen the apron on
the yard's side, `apronBySide`).

## Layout template

Written at the type's second place (16k S10).
