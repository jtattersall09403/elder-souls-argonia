# Palette and breadth

Read at step 1a, with [design-intent.md](design-intent.md); the answers go in
`<place>.design.md` § Intent, under § Palette. The game uses the large
majority of the whole asset pool across the province, so each place draws on
what exists, not on the few kits that happened to be published first.
Places of one type in one region and culture are consistent with each other
yet distinct; the same type in two regions differs more than two of that type
in one region. A place is consistent inside itself with a measured amount of
variety.

## Choose from the whole pool

What exists for this region, culture and type? Look before choosing; never
start from the published kits.

- The registry ([world/sources/assets/README.md](../../../../world/sources/assets/README.md)):
  `cd tooling/world-generation && python3 -m worldgen.asset_registry query --category <c> --biome <b> [--culture <x>] [--pool <p>] [--contains <s>]`.
  Biome tags on buildings are sparse; query by `--culture` and `--pool` too,
  and read the pool's folder names in the vault.
- The sets we own and have not packaged:
  [vault-inventory.md](../../../../world/sources/assets/vault-inventory.md) §
  Unpackaged authored sets (regenerate with
  `cd tooling/asset-pipeline && python3 -m pipeline.vault_inventory`, 3 s).
- What the source plugin put together:
  `world/sources/placement/kit-assemblies-mined.json`; links to interiors:
  `exterior-interior-links.json`. What goes with what is read from there,
  never guessed from names.
- Setting class: `kit-setting-class.json` (0105 R1). A piece is placed only
  in the class its own plugin places it in; the pool is wide, this still binds.
- Families by culture: `culture-kits.json` (`cultures.<c>.{familyCultures,slugs}`)
  and `settlement-asset-inventory.json` (`families[]`); the research notes
  [settlement-asset-inventory.md](../../../../docs/research/placement-settlements/settlement-asset-inventory.md),
  [building-asset-breadth.md](../../../../docs/research/placement-settlements/building-asset-breadth.md),
  [settlement-type-recipes.md](../../../../docs/research/placement-settlements/settlement-type-recipes.md);
  candidates per pool: [90-asset-strategy.md](../../../../docs/world/90-asset-strategy.md) §71, §74.

## Siblings

Which published places share this type, and what did each draw on? Run from
the repo root (`<type>` is `classification.type`, e.g. `hist-village`):

```bash
python3 - <type> <<'PY'
import json,glob,sys
t=sys.argv[1]; c={}
for f in glob.glob('world/sources/catalogue/places-*.json'):
    for p in json.load(open(f))['places']: c[p['id']]=p
for b in json.load(open('apps/world-studio/public/province/blueprints.json'))['blueprints']:
    p=c.get(b['id'])
    if p and p['classification']['type']==t:
        print(b['id'],'|',p.get('culture'),'|',','.join(p['sitingPrefs']['regionClasses']),'|',sorted({str(q['assetRef']) for q in b['parcels']}),'|',sorted({q['buildingFamily'] for q in b['parcels'] if q.get('buildingFamily')}))
PY
```

Each line: place, culture, region classes, the assets and building families
its parcels use. Sort the output into two lists: same type in the same region
and culture (the shared grammar), and same type in other regions (what must
differ more). A type with no published sibling yet says so in § Palette.

## § Palette (design.md, part of § Intent)

1. Which families and sets make this place consistent with its
   region-and-culture siblings (the shared grammar)?
2. Which make it distinct from each of them? Name at least one landmark
   family or set no sibling uses.
3. How is it further from the same type in other regions than from its own
   siblings (materials, plan form, landmark, filler)?
4. Which sets enter the game for the first time here?
5. Is the palette a subset of any sibling's? It must not be; if it is, add
   what makes it its own.

## Internal variety

Answer as questions; the numbers live in the existing bars.

- Landmark: the one thing unique in the place. What is it, and what is it
  for?
- Fabric: the repeated buildings, drawn from one family with variants. Which
  family, which variants, and why these?
- Filler: dressing, the widest variety. What does each corner of the place
  hold that the next does not?
- How does each building differ: variant within the family, size, age, wear
  and repair, what its owner does?
- Where does repetition read as a culture's grammar (the same roof, spaced
  by the same custom) and where as a copy-paste (the same building twice in
  one view)?
- How does wear vary across the place: new, mended, failing, abandoned?

Bars that still apply: `breadth-bars.json` (tiers, `enclosureKindsMin`,
`sameTypeInSight`, `assemblyMaxPerProvince`, `assemblyRepeatMinM`,
`fieldNotes.dressingAssetShareMax`); rulings R4, R6, R33, R37, R43 in
[rulings.md](rulings.md); decision 0098 (variety measured per settlement,
gates `0098.place`, `0098.province`); decision 0105 R4 (variety planned and
gated); decision 0099 (breadth is set now, hit later). Measure with
`python -m worldgen.asset_breadth [--json]` (per-culture shell usage,
interiors only).

## Two worked examples

Commands run: `asset_registry query --culture argonian --category architecture`
(by pool: htbm, kotm, xanmeer, mudmother, bmv);
`--biome swamp --category architecture`; `--biome jungle --category
architecture` (all bmv `22mjymeshes`); the sibling look-up above for
`boardwalk-village` and `hist-village`; vault-inventory set names.

- A village in mangrove forest and tidal delta (Riverwalk, `boardwalk-village`,
  regions: mangrove forest, interior swamp, rootland deep marsh, tidal delta).
  Landmark: a shrine and the ferry raft, over water. Fabric: bamboo huts on
  stilts (`composite:stilt/bamboohut01-with-door`, `bamboohut02-with-door`)
  with the swamp house with landing. Filler: native craft, docks, mudmother
  nest tent and totem. Water carries the plan; the stilts and boards are the
  grammar.
- A village on firm lowland and fringe marsh (Greenspring, `hist-village`,
  regions: interior swamp, rootland deep marsh, firm lowland, fringe marsh,
  seasonal floodplain). Landmark: the rune circle (`histtree:skyfall`).
  Fabric: mud house pods (`composite:mud/kotm-house-pod`) beside bamboo huts.
  Filler: mud-hut family, mudmother nests. Ground carries the plan.
  The two share the Argonian bamboo and mudmother set, so they read as one
  culture; they differ in landmark, in stilt against pad, and in how much
  water the plan needs, which is more than two firm-lowland villages would
  differ. Record silent: neither record names a landmark set; both landmarks
  are the builder's reading of `why` and `vibe`. Not yet used for these
  regions: the jungle `22mjymeshes` architecture set (bmv, jungle tag) and
  the `jets/farmhouse` set (0% packaged, see vault-inventory).

## The kit lane

When a chosen asset is not in a published kit, launch a kit lane in this
slice; never narrow the palette to the kits that exist. Lane skills:
`kit-mining` (what goes with what), `composite-author` (composites),
`kit-build` (compress, publish, manifest); a mesh that exists nowhere is a
sourcing job under the rules in CLAUDE.md and 90 §71. The hand-off to the
lane carries:

- the place id;
- the registry ids (`pool:path`) and authored set paths chosen;
- the setting class (`kit-setting-class.json`);
- the plugin that places them and its mined assembly ids
  (`kit-assemblies-mined.json`);
- the composites wanted;
- the role of each: landmark, fabric or filler.

A lane that rewrites the kit manifest never runs beside a publishing lane;
it commits in the step that writes it. Clear that with the planner first.

## The ledger

At slice close append the place's row to
[asset-breadth-ledger.md](asset-breadth-ledger.md). For its (region class,
type) pair record assets used against assets available: available is the
registry count (`asset_registry query` with the region's culture, pool or
biome filters, no `--used`); used is the distinct `assetRef` values across
the published blueprints of that pair (the sibling look-up). `--used` counts
placements in the source mods' own worlds, so it measures what the mod
authors chose, not what this game used. Write the commands in the row, so the
"large majority" is measurable over time.
