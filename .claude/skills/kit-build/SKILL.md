---
name: kit-build
description: Take a kit config to a published, compressed, measured kit under apps/world-studio/public/kits/ — build_kit, the three sidecar measurers, kit_compress, the manifest refresh, the collider gate and the download budget. Use when a kit config, a composite, a collider or a registry row changes, when a miner record lands, or when a published kit is stale or red.
---

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0085, 0086; standard 16 (docs/standards/engineering.md §16);
> docs/research/phase16/16h-ledger.md rows **K6** (found on disk, yard),
> **K7 A hut**, **K9 not done**, **K10 D composites**, **K10 E**, **M13**, **M14**,
> **M15**, **M16**, **K11 A**. If a cited row or record has moved, this skill is stale:
> report it, do not follow it blind. Umbrella: `place-build`
> (it calls this skill from its step 5 when a kit is missing or stale). Miner
> protocol: `kit-mining`. Composite authoring: `composite-author`.

# Kit build

Paths: `P` = `tooling/asset-pipeline` (run `python3 -m pipeline.*` from it),
`W` = `tooling/world-generation` (run `python3 -m worldgen.*` from it).
Raw build = `P/output/kits/<kit>.*` (git-ignored, the measurement product).
Published = `apps/world-studio/public/kits/<kit>.*` (what ships, standard 16).

## 0. Decide what the change needs (pick the lowest row that covers it)

| Changed | Run steps | Why (row) |
|---|---|---|
| kit config: assets, `compose.parts`, part scale, `collision`, `publish` | 1–7 | geometry and manifest come only from Blender (K6, K10 D) |
| registry row / texture pool / vault asset | 1–7 | `build_kit.assemble` reads them |

A vault asset missing on this machine: (the whole vault is local on the EC2 box at `../elder-scrolls-asset-pipeline`; a folder genuinely absent there is a sourcing job, never a pull; `vault-pull.sh` is the fresh-machine bootstrap only, tooling/bootstrap/README.md).
| `mine_assemblies` record (templates, doorways) only | 2, 3, 5–7 | connectors + interiors read it; GLB unchanged (K7 A) |
| sink / mounts / policy record only (miner full run) | 4, 5–7 | policy-only metadata; never rebuild for it (M13–M16) |
| nothing, published kit suspect | `kit_compress --check`, 5 | — |

A new kit, before its first build: add a `KIT_SETS` row in
`worldgen/blueprint.py` for the district that builds with it, and read every
candidate for its licence (`kit-setting-class.json`), its mounted parent
(`wb.py - describe <child>` `evidence.mountsAsChild`; the parent joins the
same config) and duplicates in other kits.

## Per-piece config fields that reach the runtime

- `"variantOf": <base id>` + `"textureVariants": {<NIF texture path>: <recipe>}`:
  a texture variant, the base's mesh under its own id (never overwriting the
  base), its textures derived by `pipeline/texture_variants.py` (recipe keys
  in its docstring; files content-addressed, equal derivations shared).
  Judge a recipe before the build with `python3 -m pipeline.render_variant`
  (before/after stills, seconds per derive). A variant has no mined sink row:
  give it an `assetPlacement` row (placement-policies.json) equal to its
  base's. Example: the sick Hist, settlement-mud-v1 (16k walk 3 L5).
- `"effect": "additive"`: the piece's effect-shader materials (BSEffectShader:
  flame cards, glow overlays) are rebuilt by `blender/effect_materials.py` (shared
  with the weapons lights set): the greyscale-slot image is never the surface,
  a GREYSCALE_COLOR card is baked through its palette, the NIF vertex alpha
  reaches three.js as COLOR_0, and they ship glTF BLEND + material extra
  `additive: true` (listed in `additiveMaterials`), drawn unlit and additive
  by the runtime at a gain of the NIF shape's emissive multiple (manifest
  `additiveGains`, material extra `gain`, `build_kit.apply_additive_gains`;
  material `<shape>.Mat`, a material with no such shape refuses the build). Refraction-only shapes (heat shimmer) are dropped into
  `droppedShapes`. Without the flag they ship opaque or masked: solid cards.
  A piece whose NIF carries flame or glow effect-shader cards MUST set the flag:
  `build_kit.unflagged_fire_card_errors` refuses the build otherwise.
- The fire layer (walk 4) is mined from the NIF, for every piece of every
  kit (`build_kit.mine_fire_layer`, `pipeline/nif_blocks.py`): Skyrim draws
  flames as particle systems, which never convert to meshes, so each
  flame-named NiParticleSystem and each `AddOnNodeN` (Skyrim.esm ADDN N -> its
  MPS NIF's flame system) becomes a manifest `flames` entry (emitter offset,
  texture id, measured atlas, fps, edge) that game-core `settlement/lighting.ts`
  draws as a flipbook sprite. NiBillboardNode glow discs are dropped from the
  mesh and become `glows` sprites; real flame cards are listed in
  `flameCardMaterials`. Every sprite texture is a works-v1 `effectTextures`
  row (`role` flame or glow, `palette` baked at publish); a new fire texture
  refuses the build until its row is added. Sprites draw on every piece that
  carries them: a light fixture (light layer or `light` record) also holds a
  fixture light (a `FixtureLightField` slot, decision 0108; never a PointLight); any other piece (the forge's glow, the ferry raft's candles)
  is a sprite holder, `lighting.ts isSpriteHolderPlacement`, with no light
  and no fallback flame, and is not counted in place_gates' fixture density.
- `"light": {formId, editorId, radiusUnits, colourRgb, flicker, flags,
  offsetM, evidence, burnSeconds}`: the Skyrim LIGH record the plugin places
  with the piece, copied onto
  the manifest record by `build_kit.apply_light_records`; the shape of
  `game-core/fx/carriedLight` `LightRecord`, `offsetM` in glTF Y-up metres
  from the pivot. Example: works-v1 `campfire01burning` (LightCampFire01).
  Written only by `pipeline/mine_kit_lights.py`, never by hand: the LIGH refs
  placed beside the piece in its plugin cells (>= 2 hits, nearest within 200
  units; `--assets … --merge`).
  The settlement runtime reads both (game-core `settlement/lighting.ts`,
  walk 2 D7): `light` sets a fixture's point-light radius (every fixture
  shares one warm colour, `FIXTURE_LIGHT_RGB`), and a fixture with no mined
  flame and no flame cards gets one fallback candle-flame sprite.
  `light.fixtureKind` (brazier, cook-fire, forge, campfire, lantern, candle,
  sconce, torch) names what burns: the first four are always lit (half light
  by day), the rest follow the clock; absent, the manifest `category` is read.
  `placement_metadata --refresh-built-manifests` copies `light` blocks too
  (`apply_light_records`), so a mined light needs no Blender rebuild.
- `"doubleSided": true`: cloth, banners, flags and awnings draw from both
  sides. It needs `"lodRatios": [1.0, 1.0]` beside it, or the build ships
  one LOD level and the compile drops the piece ("is in no built kit").
- Hidden shapes: the build drops every shape the NIF hides (HIDDEN flag on
  it or a node above it, `build_kit.is_hidden_in_nif`) and lists it in
  `droppedShapes` reason `hidden` (vanilla `furniture/smeltermarker` once
  shipped a 4.5 m preview skeleton). After adding a furniture-marker NIF,
  look at it (`npm run look`) before placing it.
- Collision default: the category table (`_COLLISION_BY_CATEGORY`), then the
  size rule (`apply_size_collision`, planner 2026-09-27): a non-foliage piece
  left at "none" that is >= 0.3 m in both plan axes and >= 0.3 m tall gets
  `convex`. An authored `collision` in the config always wins.

## Tree tiers (flora kit mid/far levels, vegetation round 13)

`pipeline/tree_tiers.py` writes the levels at build; `pipeline/tree_tiers_check.py`
calibrates (`--calibrate`, `--bark-ladder`) and records the chosen settings
into the kit config (`--record`), then step 1 rebuilds.

- **A sample never lives in `pipeline/config/kits/`** (walk 5: a scratch
  `leafcut-sample.json` left there failed every lane's build at the
  placement-policy inventory). Sample a tier change with `tree_tiers_check`
  (it renders from the source, no kit build); if a sample kit build is
  unavoidable, give it a `kitPolicies` row and delete both the config and the
  row before the lane hands back.
- A calibrated level records only the keys its ladder varied plus the run's
  `--set` keys; never copy defaults into `treeTiers.perAsset` (it outranks the kit).
- **Bark-tube levels (`barkTube` 1 or 2) need an image-judge PASS before
  `--record`** (owner 2026-09-29, round 13c): the silhouette IoU passed cones
  over root flares, trunk breaks and flat canopy plates the judges caught.
  Run 2 Sonnet judges in parallel on each chosen tier's contact sheet (trunk
  and roots continuous, no cones or plates, no dark bands, canopy density,
  colour) and write their verdicts beside the sheet as
  `<cal dir>/<asset safe id>-<tier>.judge.json`,
  `{"label": <level label>, "judges": [{"verdict": "PASS"|"FAIL", "note": ...}]}`.
  `--record` refuses (exits, writes nothing) when the file is missing, names
  another label, or has fewer than 2 verdicts or any FAIL
  (`tree_tiers_check.judge_passed`). Leaf-only levels keep the IoU bar alone,
  unless they land over the kit's share cap (next bullet).
- The share cap is a setting, not a constant (round 13d): `treeTiers.maxShare`
  (kit, default 0.70) and `treeTiers.maxShareByAsset.<id>` (written by
  `--record` from a `--calibrate --max-share <x>` run). A level over the kit cap
  needs the same 2-judge PASS file. `--tiers mid` renders one tier only (the
  other keeps its kit row on `--record`); `--keeps mid=0.2,0.4` replaces the
  leaf-keep ladder.
- **Far stand-ins have their own bar** (lead, walk 5, decision 0108 §5): a
  view-sampled FAR stand-in (the octahedral impostor, `pipeline/impostor_bake.py`)
  ships when its silhouette IoU beats the card it replaces in EVERY view AND
  2 Sonnet judges pass its sheet; the 0.90 same-view bar is for mesh tiers
  only. `--publish` writes the GLB and `<kit>.impostors.json`; the runtime
  loads them after the startup window, never in the startup payload.
- **Leaf cutoff is the NIF's** (walk 5): a foliage material ships glTF MASK at
  its NiAlphaProperty threshold / 255 (`blender/build_kit.py ni_alpha`), never
  a fixed 0.5; the tier and impostor renders read the GLB's `alphaCutoff`
  (`mat.alpha_threshold`), and the studio keeps it on mesh levels (cards 0.5).

## 1. Build (geometry + manifest + sidecars + publish)

    cd $P && ../../tooling/repo-standards/memwatch.sh \
      python3 -m pipeline.build_kit --kit <kit>
    # several: --kits a,b,c --jobs 3   (flora-province-v1: --jobs 1)

- One heavy job per lane; K10: three settlement kits, jobs 3, peak 4.81 GiB.
- `build` runs, in order: Blender, `trunk_solids`, `vet_kit`,
  `measure_sidecars` (K10 D), then `kit_compress.publish` when the kit is
  already published or its config sets `publish` (`build_kit.py:972`, `:981`).
- Check: the `[kit] … sidecar <kit>.{footprints,interiors,connectors}.json`
  lines print (none for `measure_footprints.SKIP_PREFIXES` kits) and the
  `compressed X MB -> Y MB` line prints. Record both sizes in the ledger row.
- First publish of a new kit: step 1 does not publish; run step 3.
- Stale if skipped: the GLB, `.kit.json`, every sidecar, the published copy.

## 2. Measure the sidecars (only when step 1 did not run)

    cd $P && python3 -m pipeline.measure_footprints --kit <kit> \
      && python3 -m pipeline.interiors_index --kit <kit> \
      && python3 -m pipeline.measure_connectors --kit <kit>

- Order is fixed: connectors read footprints (`build_kit.measure_sidecars`).
- Stale if skipped: `kit_compress` copies whatever sidecar sits beside the raw
  GLB (K10 D), so an older interiors index ships with the new kit: doorways,
  entrance radius, footprints and the export's collider budget all read the
  old build (K6 yard: budget 1601 published vs 194 rebuilt).
- A composite's entrance is read at its anchor's pose (K11 A); a GLB-free
  change to the doorway rule needs only this step and step 3 `--sidecars-only`.

## 3. Publish the sidecars / compress (only when step 1 did not publish)

    cd $P && python3 -m pipeline.kit_compress --kit <kit>                 # GLB changed
    cd $P && python3 -m pipeline.kit_compress --kit <kit> --sidecars-only # sidecars only

- `publish_sidecars` raises if a raw sidecar is missing; a kit with none
  belongs in `kit_compress.SIDECAR_EXEMPT` with its reason, never silence.
- Stale if skipped: the studio and the settlement export read the published
  sidecars, not the raw ones.
- Parts are published with the kit, for **scoped kits only**: a kit publishes
  parts when a published interior cell (`public/province/interiors/<cell>.json`
  `kits`) names it, because only the interior loader reads parts and every part
  is a second copy that ships, and then only for the assets those cells DRAW
  (placements, stand-ins, swing doors: `kit_parts.mjs drawnAssets`,
  `kit_compress.parts_drawn`; walk 4: every asset of the 10 scoped kits was
  131.7 MB and a 709.0 MB site, drawn assets only are 19.3 MB and 597.3 MB).
  A cell that starts drawing a new asset needs `kit_parts.mjs --all` rerun;
  `kit_compress` check names the missing asset.
  `kit_compress` ends by running `node pipeline/kit_parts.mjs --kit <kit>` for a
  scoped kit and deletes an unscoped kit's parts folder; the writer cuts the
  published GLB into `public/kits/<kit>/parts/` (one GLB per asset, LOD0 only,
  textures once per kit as `parts/tex/<sha16>.ktx2`, `index.json`) and records
  the totals in `compression.parts`. After a cell bundle names a new kit, or a
  GLB changed any other way, run `node pipeline/kit_parts.mjs --all` (scoped
  kits written, unscoped folders deleted); `--all --check` and `kit_compress
  --check` exit 1 on stale, missing or out-of-scope parts. The parts count in
  the site budget (step 7).
- After publish, look at every new or changed piece: `npm run look -- piece <kit> <assetId>` and its Sonnet judge ([visual-look](../visual-look/SKILL.md)); a FAIL is fixed at source before the kit is used.
- A doorway is recorded only where rays pass (`interiors_index.doorway_rays`):
  every geometric doorway (`opening`, `open-front`, `leaf`) must let horizontal
  rays through the wall from 0.3 to 1.8 m above its sill across the middle 70%
  of its width, or it is dropped with a `WARN … closed wall` naming the shell
  and kept under `doorwaysClosedDropped`; a kept one carries `sillYM` (pivot
  frame), `clearM`, `widthM`. An opening above the measured floor is found by
  the sill sweep (`sill_doorways`). Placement evidence (`esp-door`, `assembly`,
  `composite-leaf`, `door-piece`) is not ray-gated. Re-measure named shells with
  `interiors_index --kit <kit> --assets <id>…` (merged per asset), then step 3
  `--sidecars-only`.

## 4. Refresh the manifests (after a miner record, never before its full run)

    cd $P && python3 -m pipeline.placement_metadata --refresh-built-manifests

- Rewrites placement policy (sink `originOffsetM`, mounts class, anchors) in
  raw AND published `*.kit.json` without Blender (`placement_metadata.py:274`).
- Precondition: the miner's golden set, a fresh seed batch and the ONE full
  run are done and the sink record re-derived `--complete-only` (the
  `kit-mining` skill; M13 is the failure: full runs made before batch 2 was
  scored, no refresh). Never refresh from an INTERIM record.
- Check: the printed count (M16: 46 rewritten, 44 changed) and step 5's
  manifest-vs-record tests turn green.
- Stale if skipped: published sink and class disagree with the record
  (M13: 277 assets); the manifest-vs-record tests stay red (M14: 344 rows).
- An `assetPlacement` row change (placement-policies.json: `anchorClass`,
  `designedSinkM`, `designedWaterlineM`, `deckClearanceM`) is not a miner
  record: refresh only the kits it touches, `--refresh-built-manifests --kit
  <kit>` (repeatable), whatever the miner lane's state (owner 2026-09-24).
- `piledDecks` (placement-policies.json, walk 2 round 4): the listed pier/dock/walkway
  decks get `piled: true`, `deckRiseM`, `deckRiseEvidence` on refresh
  (`placement_metadata.piled_deck_rise`); same `--kit` refresh as a row change.
- A rebuild after the refresh keeps it: `build_kit` calls
  `apply_placement_metadata` from the current record (`build_kit.py:955`).

## 5. Gates (all must pass; report counts, not "green")

    cd $W && python3 -m worldgen.check_requirements
    cd $W && python3 -m pytest -q worldgen/test_kit_colliders.py
    cd $P && python3 -m pytest -q pipeline/test_build_kit.py \
      pipeline/test_kit_compress.py pipeline/test_placement_metadata.py
    cd $P && python3 -m pipeline.kit_compress --kit <kit> --check

- Fire pieces that never burn (walk 6: the hut's `argonianlanterns04` and
  kotm `townlantern04` shipped with neither): list the kit's rows whose id
  names a lantern, candle, torch, brazier or fire and that carry no `flames`
  and no `light.fixtureKind`; each one gets its fire (mined `light` via
  `mine_kit_lights --assets … --merge`, or the sibling's record with its
  evidence as settlement-mud-v1 `argonianlanterns04` does) or a written
  reason. Then `npm run look -- fixtures <kit> <assetId>` and read
  `anchorFailures` (a flame above the geometry is seated on its top by
  `build_kit.seat_flames_on_geometry`).
    cd $W && python3 -m pytest -q worldgen/test_mine_mounts.py \
      worldgen/test_mine_designed_sink.py      # after step 4 only

- `check_requirements`: every requirements-test.txt module imports (M15: `rtree` was
  missing from the user site; M16 made it preflight gate `python-deps`).
- Collider gate (K6): every structure, hull or sign post in a published kit
  carries a collider unless `EXEMPT` names it with a reason. A new solid
  piece fails it until its config sets `collision` and the kit is rebuilt
  (step 1); an `EXEMPT` row needs its reason, never a blanket entry.
- `test_kit_compress`: every published kit has a `compression` record whose
  `bytesAfter` equals the file, and startup kits total ≤ `STARTUP_BUDGET_BYTES`
  (standard 16). Raising the budget is a decision with a measurement.
- `test_placement_metadata` shipped-kit contract and coverage: read the red
  items against M14–M16 before calling them new (coverage needs compiled
  output; water-class assets with no mined waterline are a `kit-mining` item).

## 6. Downstream consumers (the kit is not done until they read it)

- Places using the kit: `place-build` §5 (export, compile, publish per place). The
  export reads published sidecars; the game-core collider budget test
  (`packages/game-core/src/settlement/settlementCollision.test.ts:139`,
  `round(worst × 1.55)`) is stale until the export runs (K6 yard):

      npm test -w @elder-souls/game-core -- src/settlement

- A composite whose geometry moved: re-derive footprint, threshold and path
  (`place-build` §2 `apply`, then §5 export; K7 A hut, K10 E), and rerun the door agreement
  tests (`composite-author`).

## 7. Download budget (standard 16)

    npm run site:compose           # fails > 900 MB, warns > 750 MB

- State the kit's raw and compressed bytes and the site total, before and
  after, in the ledger row. For startup bytes the player downloads, measure
  with `apps/world-studio/scripts/probe-deployed-requests.mjs`.

## Report

Ledger row: kits built, assets, MB raw → compressed, sidecars written,
refresh counts, each gate's pass/fail counts, cgroup peak, site total.
