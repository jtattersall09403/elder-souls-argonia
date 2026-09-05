# Mined placement statistics

Machine-readable output of the **mine-the-shipped-worlds** rule (module 95
§86.0b). These files record *what other teams measurably did* — densities,
water/slope tolerances, clumping, jitter — never their authored places
(00-core rule 6). They are inputs to the scatter compiler's defaults and to
the flora palettes, not content.

**Do not read these files whole** — they are ~450 kB each. Query them
(`python3 -c "import json; ..."`) or read the digest in
[docs/research/placement-settlements/shipped-world-placement-rules.md](../../../docs/research/placement-settlements/shipped-world-placement-rules.md),
which is the human-facing version and states the caveats.

| File | Source | What it holds |
|---|---|---|
| `bmv-blackmarsh-placement.json` | Black Marsh & Valenwood, worldspaces `BlackMarsh`, `BlackMarsh2`, `BlackMarshNorth` (144,298 refs, 8,344 cells) | per-species placement profiles, per-hectare densities, water-depth and slope bands, species associations |
| `bmv-valenwood-placement.json` | Black Marsh & Valenwood, worldspace `Valenwood` (42,107 refs) | the same, for a dry-forest contrast |
| `groundcover-rules.json` | Tropical Skyrim's overrides of vanilla `GRAS`/`LTEX` records | Bethesda's grass parameter schema with observed values, and which grasses each painted ground texture allows |
| `bmv-blackmarsh-micrositing.json` | same worldspaces, via `worldgen/mine_micro_siting.py` | per-species water-relation classes with conditional depths, density vs distance-to-waterline (riparian bands), pool-scene ring composition — digest in [docs/research/vegetation/mod-vegetation-micro-siting.md](../../../docs/research/vegetation/mod-vegetation-micro-siting.md) |
| `bmv-valenwood-micrositing.json` | worldspace `Valenwood` | the same, showing the *inverted* (dry-forest) riparian profile |
| `vanilla-tamriel-placement.json` | **Vanilla Skyrim**, worldspace `Tamriel` (250,830 refs, 11,187 cells) | the same profile for Bethesda's own shipped world — the cross-check on every BM&V-derived rule |
| `vanilla-groundcover-rules.json` | `Skyrim.esm` `GRAS`/`LTEX` | Bethesda's *own* grass parameters (27 records, 68 textures), as opposed to Tropical Skyrim's retune in `groundcover-rules.json` |
| `bmv-interior-assembly.json` | vanilla `Skyrim.esm` + the three BM&V plugins, via `worldgen/mine_interiors.py` (660 interiors, 490 profiled) | **Phase 12 input:** per-kit snap/rotation quantisation, piece-pair adjacency with join offsets, chamber dimensions, clutter density per 100 m² |
| `bmv-settlement-form.json` | BM&V Black Marsh worldspaces, via `worldgen/mine_settlements.py` (1,474 buildings, 47 settlements) | **Phase 11 input:** buildings per settlement, spacing, radius, orientation coherence, distance to water/road |
| `bmv-valenwood-settlement-form.json` | worldspace `Valenwood` | the same — the dry, road-led contrast to Black Marsh's waterline siting |
| `vanilla-tamriel-settlement-form.json` | vanilla `Skyrim.esm`, worldspace `Tamriel` | the same for Bethesda's own world — the cross-check |
| `settlement-asset-inventory.json` | the semantic asset registry + the vault filesystem + module 90 §71–§80 | **Phase 11 Part 0 item 6a:** the settlement-building families we hold or can source, by culture (the two never-blended Argonian cultures, xanmeer, Imperial), with vault paths, piece counts, palettes, condition variants, gaps and the 6b sourcing order. Not mined placement statistics — a survey. Digest: [docs/research/placement-settlements/settlement-asset-inventory.md](../../../docs/research/placement-settlements/settlement-asset-inventory.md) |
| `*-settlement-form-stats.json` (vanilla Tamriel, BM&V Black Marsh, BM&V Valenwood, HTBM Cipactli) | the same worldspaces, via `worldgen/mine_settlement_form_stats.py` | **second-pass settlement form:** spacing by settlement size, density and radius by size, yaw against contour and road axis, entrance side, road-proximity shares, family mix, enclosure, waterfront, kit mixing, tallest-building placement. Digest: [docs/research/placement-settlements/settlement-form-evidence.md](../../../docs/research/placement-settlements/settlement-form-evidence.md) |
| `kit-assemblies-mined.json` | vanilla `Tamriel`, the three BM&V worldspace sets and HTBM Cipactli, via `worldgen/mine_assemblies.py` | **co-placement templates:** pairs and groups of pieces the source authors placed at a repeated relative offset and yaw, the pieces never placed alone, the doorways that fall out of the door-piece templates (`doorwaysFromAssemblies`, for `pipeline/interiors_index.py`), and the enclosed shells with no door from either pass. Input to the kit pipeline's COMPOSITE assets (`compose.parts`). Digest: [docs/research/placement-settlements/kit-assemblies-evidence.md](../../../docs/research/placement-settlements/kit-assemblies-evidence.md) |
| `vault-exterior-placement-survey.json` | every plugin under the vault's `mod-sources` | which mods place buildings in exterior cells at all, and which are resource-only |
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
[docs/research/placement-settlements/vanilla-skyrim-esm-placement-crosscheck.md](../../../docs/research/placement-settlements/vanilla-skyrim-esm-placement-crosscheck.md).

## Interiors and settlement form (Phase 11/12 inputs, mined 2026-08-31)

```bash
cd tooling/world-generation
BMV=../asset-pipeline/black-marsh-mod-source/plugins
D=<vault>/skyrim-source/Data
OUT=../../world/sources/placement

python3 -m worldgen.mine_interiors \
  --plugin "$D/Skyrim.esm" --plugin "$BMV/Black Marsh.esm" \
  --plugin "$BMV/Black Marsh North.esp" --plugin "$BMV/Valenwood.esp" \
  --out $OUT/bmv-interior-assembly.json

python3 -m worldgen.mine_settlements \
  --plugin "$BMV/Black Marsh.esm" --plugin "$BMV/Black Marsh North.esp" \
  --names "$D/Skyrim.esm" \
  --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \
  --out $OUT/bmv-settlement-form.json
python3 -m worldgen.mine_settlements --plugin "$BMV/Valenwood.esp" \
  --names "$D/Skyrim.esm" --names "$BMV/Black Marsh.esm" --world Valenwood \
  --out $OUT/bmv-valenwood-settlement-form.json
python3 -m worldgen.mine_settlements --plugin "$D/Skyrim.esm" --world Tamriel \
  --out $OUT/vanilla-tamriel-settlement-form.json
```

Digest, headline numbers and the honest gaps (no facade-facing signal, no
shipped Argonian interior, ceiling heights not measurable from plugins):
[docs/research/placement-settlements/mined-interior-assembly-and-settlement-form.md](../../../docs/research/placement-settlements/mined-interior-assembly-and-settlement-form.md).

**Still open:** the BM&V files were mined before the esm arrived, so 41 % of
Black Marsh's and 63 % of Valenwood's references are still `unresolved`.
Re-running the BM&V commands above with an extra
`--names "$D/Skyrim.esm"` resolves nearly all of them — worth doing as a
standalone step, since it changes what `build_palettes.py` reads.

## Second-pass settlement form (2026-09-05)

`mine_settlement_form_stats.py` answers the placement questions the first pass
does not carry, and `--report` writes
[docs/research/placement-settlements/settlement-form-evidence.md](../../../docs/research/placement-settlements/settlement-form-evidence.md)
whole — that doc is generated, not hand-edited.

```bash
cd tooling/world-generation
D=<vault>/skyrim-source/Data
BMV=../asset-pipeline/black-marsh-mod-source/plugins
M=<vault>/skyrim-source/mod-sources
OUT=../../world/sources/placement

python3 -m worldgen.mine_settlement_form_stats --plugin "$D/Skyrim.esm" \
  --world Tamriel --label "Skyrim (vanilla)" \
  --out $OUT/vanilla-tamriel-settlement-form-stats.json
python3 -m worldgen.mine_settlement_form_stats \
  --plugin "$BMV/Black Marsh.esm" --plugin "$BMV/Black Marsh North.esp" \
  --names "$D/Skyrim.esm" --world BlackMarsh --world BlackMarsh2 \
  --world BlackMarshNorth --label "BM&V Black Marsh" \
  --out $OUT/bmv-settlement-form-stats.json
python3 -m worldgen.mine_settlement_form_stats --plugin "$BMV/Valenwood.esp" \
  --names "$D/Skyrim.esm" --names "$BMV/Black Marsh.esm" --world Valenwood \
  --label "BM&V Valenwood" --out $OUT/bmv-valenwood-settlement-form-stats.json
python3 -m worldgen.mine_settlement_form_stats \
  --plugin "$M/here-there-be-monsters-cipactli-35933/extracted/Here There Be Monsters - Curse of Cipactli.esp" \
  --names "$D/Skyrim.esm" --label "Here There Be Monsters: Cipactli" \
  --out $OUT/htbm-cipactli-settlement-form-stats.json

# which vault mods place buildings outdoors at all
python3 -m worldgen.mine_settlement_form_stats --survey-root "$M" \
  --names "$D/Skyrim.esm" --survey-out $OUT/vault-exterior-placement-survey.json

# the doc
python3 -m worldgen.mine_settlement_form_stats \
  --report ../../docs/research/placement-settlements/settlement-form-evidence.md \
  --input $OUT/vanilla-tamriel-settlement-form-stats.json \
  --input $OUT/bmv-settlement-form-stats.json \
  --input $OUT/bmv-valenwood-settlement-form-stats.json \
  --input $OUT/htbm-cipactli-settlement-form-stats.json \
  --survey $OUT/vault-exterior-placement-survey.json

# co-placement templates (all four sets in one deterministic run, ~40 s)
python3 -m worldgen.mine_assemblies   --set vanilla --label "Vanilla Skyrim, worldspace Tamriel"     --plugin "$D/Skyrim.esm" --plugin "$D/Update.esm" --world Tamriel   --set bmv-blackmarsh --label "BM&V Black Marsh"     --plugin "$BMV/Black Marsh.esm" --plugin "$BMV/Black Marsh North.esp"     --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth     --names "$D/Skyrim.esm"   --set bmv-valenwood --label "BM&V Valenwood"     --plugin "$BMV/Valenwood.esp" --world Valenwood --names "$D/Skyrim.esm"   --set htbm --label "Here There Be Monsters: Cipactli"     --plugin "$M/here-there-be-monsters-cipactli-35933/extracted/Here There Be Monsters - Curse of Cipactli.esp"     --names "$D/Skyrim.esm"   --out $OUT/kit-assemblies-mined.json   --report ../../docs/research/placement-settlements/kit-assemblies-evidence.md
```
