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

## Known gap — vanilla `Skyrim.esm`

34 % of Black Marsh's references (and 50 % of Valenwood's) point at base
objects defined in `Skyrim.esm`, which **is not in the vault** (only the three
BSAs are). Those references are still counted and profiled — under stable
`skyrim.esm#0B73BC`-style ids — so every density, band and clumping number
covers them; only their *names* are missing. Dropping the ESM into
`<vault>/skyrim-source/Data/` and re-running the commands above names them,
and additionally unlocks Bethesda's own `REGN`/`GRAS` tables. The owner ask is
recorded in [docs/PROGRESS.md](../../../docs/PROGRESS.md).
