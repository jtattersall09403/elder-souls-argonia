---
name: kit-build
description: Take a kit config to a published, compressed, measured kit under apps/world-studio/public/kits/ — build_kit, the three sidecar measurers, kit_compress, the manifest refresh, the collider gate and the download budget. Use when a kit config, a composite, a collider or a registry row changes, when a miner record lands, or when a published kit is stale or red.
---

> **Written against** (decision 0086 rule 4; `routing-audit` checks these):
> decisions 0085, 0086; standard 16 (docs/standards/engineering.md §16);
> docs/research/phase16/16h-ledger.md rows **K6** (found on disk, yard),
> **K7 A hut**, **K9 not done**, **K10 D composites**, **K10 E**, **M13**, **M14**,
> **M15**, **M16**, **K11 A**. If a cited row or record has moved, this skill is stale:
> report it, do not follow it blind. Umbrella: `settlement-build`. Miner
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

A vault asset missing on this machine: `bash tooling/bootstrap/vault-pull.sh mod-sources/<folder>` (see tooling/bootstrap/README.md).
| `mine_assemblies` record (templates, doorways) only | 2, 3, 5–7 | connectors + interiors read it; GLB unchanged (K7 A) |
| sink / mounts / policy record only (miner full run) | 4, 5–7 | policy-only metadata; never rebuild for it (M13–M16) |
| nothing, published kit suspect | `kit_compress --check`, 5 | — |

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
- A rebuild after the refresh keeps it: `build_kit` calls
  `apply_placement_metadata` from the current record (`build_kit.py:955`).

## 5. Gates (all must pass; report counts, not "green")

    cd $W && python3 -m worldgen.check_requirements
    cd $W && python3 -m pytest -q worldgen/test_kit_colliders.py
    cd $P && python3 -m pytest -q pipeline/test_build_kit.py \
      pipeline/test_kit_compress.py pipeline/test_placement_metadata.py
    cd $P && python3 -m pipeline.kit_compress --kit <kit> --check
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

- Settlements using the kit: `settlement-build` §4 compile, §5 export. The
  export reads published sidecars; the game-core collider budget test
  (`packages/game-core/src/settlement/settlementCollision.test.ts:139`,
  `round(worst × 1.55)`) is stale until the export runs (K6 yard):

      npm test -w @elder-souls/game-core -- src/settlement

- A composite whose geometry moved: re-derive footprint, threshold and path
  (`settlement-build` §2; K7 A hut, K10 E), and rerun the door agreement
  tests (`composite-author`).

## 7. Download budget (standard 16)

    npm run site:compose           # fails > 900 MB, warns > 750 MB

- State the kit's raw and compressed bytes and the site total, before and
  after, in the ledger row. For startup bytes the player downloads, measure
  with `apps/world-studio/scripts/probe-deployed-requests.mjs`.

## Report

Ledger row: kits built, assets, MB raw → compressed, sidecars written,
refresh counts, each gate's pass/fail counts, cgroup peak, site total.
