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
