# Semantic asset registry

Every mesh in the permitted asset pools, tagged (module 90 §72). Built by
`tooling/world-generation/worldgen/asset_registry.py`; **catalogue wide,
kit-compile deep on demand** — a row says *what an asset is and whether a
shipped world used it*, not how it collides or snaps. Collision profiles, snap
points, sockets and LOD chains are added per asset by the kit that places it.

## Coverage report: `vault-inventory.md`

[vault-inventory.md](vault-inventory.md) is the companion to the registry and
answers the opposite question: not *what is this asset*, but **what have we
never used?** It groups every mesh in the vault by the author's own folder (the
folder *is* the authored set) and shows, per set, how much is catalogued in a
registry versus actually referenced by a kit or placement file. Regenerate with
`cd tooling/asset-pipeline && python3 -m pipeline.vault_inventory` (~3s). Read
it before any sourcing search (world/90 §71).

## Do not read these files — query them

They are ~28k rows / 5 MB. Reading one whole is exactly the context bloat the
repo rules forbid.

```bash
cd tooling/world-generation
python3 -m worldgen.asset_registry query --category tree --biome swamp --used
python3 -m worldgen.asset_registry query --pool xanmeer
python3 -m worldgen.asset_registry query --category creature --contains crocodile
python3 -m worldgen.asset_registry build      # regenerate after a new pool lands
```

`--used` restricts to assets a mined shipped world actually placed, sorted by
placement count: the fastest way to separate "exists in the archive" from
"a professional art team chose it for a swamp".

## Pools

| Pool | Rows | Notes |
|---|---|---|
| `bmv` | 12,001 | Black Marsh & Valenwood — the house style; 634 assets ship a flat LOD billboard (ready-made T4 impostors), 860 carry dimensions from the mod's own plugins |
| `vanilla` | 14,974 | Skyrim meshes BSA, named and dimensioned from `Skyrim.esm`/`Update.esm` since 2026-08-31: 8,620 rows carry editor ids and dimensions, 677 are marked observed-placed with a count from the mined `Tamriel` worldspace |
| `tropical` | 869 | Tropical Skyrim — 718 tree/palm meshes, plus raptor/therium/imga creature meshes |
| `xanmeer` | 85 | Argonian Xanmeer Tileset — the whole kit, dimensioned from its own plugin |

## Row shape

```json
{"id":"bmv:landscape/trees/beachpalm1","pool":"bmv",
 "path":"meshes/landscape/trees/beachpalm1.nif","category":"tree",
 "confidence":0.85,"biomes":["coastal","jungle"],
 "lodVariant":"meshes/landscape/trees/beachpalm1_lod_flat.nif",
 "editorIds":["0palm2","01palm","01beachpalm"],"recordTypes":["TREE","STAT"],
 "sizeM":[14.679,12.361,32.516],"originOffsetUnits":[-700,-304,-3]}
```

`sizeM` is the source bounding box at scale 1, converted at Bethesda's nominal
unit (1 unit = 1.4224 cm). It is a **source-scale** figure, not a decision:
these pools contain deliberately oversized jungle trees (30 m+), and how big
they end up in our world is a placement call, recorded per palette.

`confidence` is how much to trust `category`: 0.95 = settled by a plugin
record type, 0.85 = directory plus filename, 0.8 = directory only, 0.55 =
rescued from a wrong directory by a filename token, ≤0.3 = unclassified.
Compilers that need certainty should filter on it.

`id` is the stable semantic id everything else references — pool prefix plus
the mesh path relative to the data root, without the extension.

## Packaging decisions 2026-09-04

Worked the vault-inventory's "unpackaged authored sets" list set by set. Kits
are judged by **geometry, not label**: where pieces were not authored to fit
each other, the kit notes say so instead of guessing.

| Set (mod) | Packaged as / skipped because |
|---|---|
| sailboats-expanded-40057, cyrodiil-ship-boat-resource-59426, boats-operational-animated-110882 | Had no `Pool` row at all. All three registered (`sailboats`, `impships`, `boatsanim`), credited in the root README with archive sha256s; the first two are in `watercraft-v1`. `boatsanim` is registered but **not kitted** — every hull carries a baked-in editor marker that vets as an untextured slab, and stripping it would mean editing the author's mesh. |
| vanilla `architecture/docks` + BM&V Dagon Fel docks + BM&V `jets` dock pieces + HTBM `tamu_` planks | **`docks-v1`** (47 pieces) → `arch.neutral.dock` / `docks-piers`. FOUR separate authored systems in one kit; the notes forbid mixing them mid-run (different post spacing, different grids). Only the `tamu_` family reads Argonian. |
| canoe / ferryraft / ferries / rowboats / sbot / sailboats / impships / BM&V hulls | **`watercraft-v1`** (45 pieces) → `boats-keeled`, `boats-raft-canoe`, `plank-ferry-swamp`, `rowboats`. Free-standing props, so combining sources breaks no author's system; the notes band them native / foreign-keeled / wrecks so culture stays separate at placement. |
| cc-ayleid-ruin-resources-83999 interior (59 + puzzle/traps) | **`xanmeer-interior-v1`** (68 pieces) → `arch.xanmeer.ayleid-interior-extension` / `cc-ayleid-interior`. Kept apart from the IGS Ayleid set already in `ruin-monumental-v1`: same culture, different author, different module — IGS outside, SarthesArai inside, change set at a door. |
| **`hull-on-stocks` (deliverability audit gap)** | **CLOSED.** The Cyrodiil resource ships the galleon as a bare hull and a separate mast assembly, so a mastless hull on `works-v1` scaffold is authored geometry, not a piece nobody made. In `watercraft-v1` (BM&V's copy, which carries plugin dimensions; original credited as `impships`). kiln / saltern / sluice / winding gear / carved grave-stakes remain unsourced. |
| HTBM `swamp house.nif` (vibe-sheet lead) | **Skipped.** Its nine textures are hash-named (`050239f8.dds` …) — the signature of an untraceable rip. We cannot record a source or a credit for it, so it fails the asset rule regardless of how good it looks. |
| BM&V `architecture/jets/farmhouse` (235) | Skipped: a modular medieval/Nordic farmhouse set. The vibe-sheet audit §4 deliberately moved the civic and domestic tiers to Morrowind-Imperial masonry (`imperial-keep`, `hlaalu-domestic`); packaging it would re-import the read we removed. |
| BM&V Dagon Fel shack/housetall shells, Stroti tree house | Skipped: Nord/Solstheim read (the inventory's own `gapFlag`); the reusable parts (rope ladders, awnings) are already in `settlement-stilt-v1`. |
| vanilla `caves/blackreach`, `caves/green/epic`, `mines/caveepic`, `caves/ice` | Skipped **for now**: no `assetPlan` slug resolves to a cave family — dungeon interiors currently resolve to `dungeon-root-v1` (BM&V `philscaves`). Package these the day a cave slug is added, not before. |
| vanilla Solitude/Windhelm/Markarth/Whiterun interiors, armour/weapons sets | Skipped by brief: no catalogue type needs them; Phase C owns equipment. |
| HTBM `actors` (91 meshes, 30+ skeletons) | No kit (creatures are Phase 13), but the **vault-inventory rigged-actor detector was fixed**: it only recognised a skeleton in a creature *sub*-folder, so the richest rigged set we own read as clutter. Four `creatures.json` entries upgraded to authored HTBM rigs (death-hopper frog/toad, wamasu, haynekhtnamet, sea-drake). |
| House **Dres** architecture | Does not exist anywhere in the vault — BM&V's `trdata` tree is landscape only (cliffs, flora, mausoleum, mushrooms, wayshrine) and the only Dunmer sets are Telvanni, Redoran, Velothi and stronghold. No `dres-domestic` kit; Thorn keeps `hlaalu-domestic`. |
