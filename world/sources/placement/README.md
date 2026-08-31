# Mined placement statistics

Machine-readable output of the **mine-the-shipped-worlds** rule (module 95
§86.0b). These files record *what other teams measurably did* — densities,
water/slope tolerances, clumping, jitter — never their authored places
(00-core rule 6). They are inputs to the scatter compiler's defaults and to
the flora palettes, not content.

**Do not read these files whole** — they are ~450 kB each. Query them
(`python3 -c "import json; ..."`) or read the digest in
[docs/research/shipped-world-placement-rules.md](../../../docs/research/shipped-world-placement-rules.md),
which is the human-facing version and states the caveats.

| File | Source | What it holds |
|---|---|---|
| `bmv-blackmarsh-placement.json` | Black Marsh & Valenwood, worldspaces `BlackMarsh`, `BlackMarsh2`, `BlackMarshNorth` (144,298 refs, 8,344 cells) | per-species placement profiles, per-hectare densities, water-depth and slope bands, species associations |
| `bmv-valenwood-placement.json` | Black Marsh & Valenwood, worldspace `Valenwood` (42,107 refs) | the same, for a dry-forest contrast |
| `groundcover-rules.json` | Tropical Skyrim's overrides of vanilla `GRAS`/`LTEX` records | Bethesda's grass parameter schema with observed values, and which grasses each painted ground texture allows |
| `bmv-blackmarsh-micrositing.json` | same worldspaces, via `worldgen/mine_micro_siting.py` | per-species water-relation classes with conditional depths, density vs distance-to-waterline (riparian bands), pool-scene ring composition — digest in [docs/research/mod-vegetation-micro-siting.md](../../../docs/research/mod-vegetation-micro-siting.md) |
| `bmv-valenwood-micrositing.json` | worldspace `Valenwood` | the same, showing the *inverted* (dry-forest) riparian profile |
| `vanilla-tamriel-placement.json` | **Vanilla Skyrim**, worldspace `Tamriel` (250,830 refs, 11,187 cells) | the same profile for Bethesda's own shipped world — the cross-check on every BM&V-derived rule |
| `vanilla-groundcover-rules.json` | `Skyrim.esm` `GRAS`/`LTEX` | Bethesda's *own* grass parameters (27 records, 68 textures), as opposed to Tropical Skyrim's retune in `groundcover-rules.json` |
| `vanilla-region-object-tables.json` | `Skyrim.esm`/`Update.esm` `REGN` | the region object-generator census: 317 regions, 69 declaring an object block, **all of them empty** (`worldgen/mine_regions.py`) |

## Regenerating

```bash
cd tooling/world-generation
BMV=../asset-pipeline/black-marsh-mod-source/plugins
TS=<vault>/mod-sources/tropical-skyrim-33017/extracted

python3 -m worldgen.mine_placement \
  --plugin "$BMV/Black Marsh.esm" --plugin "$BMV/Black Marsh North.esp" \
  --names "$TS/Tropical Skyrim.esp" --names "$BMV/Valenwood.esp" \
  --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \
  --out ../../world/sources/placement/bmv-blackmarsh-placement.json
```

`--names` plugins are read only for names: a mod that retextures vanilla trees
overrides those records *keeping their form ids*, which is how references into
masters we do not hold get resolved.

## Vanilla `Skyrim.esm` — landed 2026-08-31

The esm (and `Update.esm`) now sit in `<vault>/skyrim-source/Data/` from the
owner's Steam copy, and are declared on the `vanilla` pool in
`worldgen/asset_registry.py`. Regenerate the vanilla files with:

```bash
cd tooling/world-generation
D=<vault>/skyrim-source/Data
python3 -m worldgen.mine_regions --plugin "$D/Skyrim.esm" --plugin "$D/Update.esm" \
  --out ../../world/sources/placement/vanilla-region-object-tables.json
python3 -m worldgen.mine_groundcover --plugin "$D/Skyrim.esm" \
  --out ../../world/sources/placement/vanilla-groundcover-rules.json
python3 -m worldgen.mine_placement --plugin "$D/Skyrim.esm" --world Tamriel \
  --out ../../world/sources/placement/vanilla-tamriel-placement.json
```

Digest and the deltas worth acting on:
[docs/research/vanilla-skyrim-esm-placement-crosscheck.md](../../../docs/research/vanilla-skyrim-esm-placement-crosscheck.md).

**Still open:** the BM&V files were mined before the esm arrived, so 41 % of
Black Marsh's and 63 % of Valenwood's references are still `unresolved`.
Re-running the BM&V commands above with an extra
`--names "$D/Skyrim.esm"` resolves nearly all of them — worth doing as a
standalone step, since it changes what `build_palettes.py` reads.
