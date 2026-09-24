---
name: modular-runs
description: Chains of abutting kit pieces (walls, fences, docks, boardwalks, bridges) from the mined abuts record to a laid, flag-free run in a settlement compile. Use when authoring or changing a `pieces` parcel, when a compile reports `openModularEnds` or `singleUsePieces`, when a run step fails "no pair", when re-mining the abuts section, or when a structural set has no plugin placing it.
---

> Written 2026-09-24 against ledger `docs/research/phase16/16h-ledger.md` rows
> "Yard round K8", "K9", "K10" (and K7 B for the first abuts miner), decisions
> 0085 (kit truth is mined) and 0086 (four kit skills), module
> `docs/world/97-placement-principles.md` B3 (slope ladder). Rules live there
> and in the docstrings of `worldgen/mine_abuts.py` (method 1–9),
> `blueprint.py` (parcel `pieces`) and `compile_settlement.open_modular_ends`;
> this file is the procedure only. Umbrella: `settlement-build`. Miner
> protocol in general: `kit-mining`. Rebuild and sidecars: `kit-build`.

All paths below are from the repo root; `WG=tooling/world-generation`,
`R=world/sources/placement/kit-assemblies-mined.json`.

## A. Read the abuts record before authoring

1. Find the pieces' family and its run joints:
   `python3 -c "import json;a=json.load(open('$R'))['abuts'];print(a['stats'])"`,
   then filter `a['familyPairs']` and `a['pairs']` on `parent`/`child` (or
   `family_of(asset)` from `worldgen.mine_abuts`). Read per row: `joint`
   (`run` steps a run; `double` is back-to-back, never a step), `parentFace`/
   `childFace`, `offsetM` (child in the parent's UNIT frame), `yawDeg`,
   `relScale`, `count`, `offsetSpreadM`.
2. Check the piece's ends: `endFaces[asset]` (run faces only), `terminates[asset]`
   / `familyTerminates[family]` (faces a plugin run ends on bare), `singleUse`
   (stands alone in every plugin: never a run member), `placedAssets` (absent =
   no plugin places it: go to D).
3. A run needs a run pair (piece or family, `relScale` 1.0) for every adjacent
   step, and first/last pieces with `terminates` evidence on the outward face;
   K8/K9 show a run may end on a variant (`…destroyed01`) rather than an end cap.
   Overlap-chained sets (BM&V `troncons`) are templates, not abuts
   (`mine_abuts` "Out of scope"): author those as kit composites (`composite-author`).

## B. Author a `pieces` parcel

4. In the blueprint under `world/sources/blueprints/`, replace `assetRef` with
   `pieces: [{asset, yaw?}, …]` (at least two; never both). `centreUV` is the
   FIRST piece's pivot; `yawDeg` turns the whole run; a piece's `yaw` only picks
   among pairs. Precedent: `parcel.proving-ground.imperial-wall-run` in
   `place.fixture.proving-ground.json`.
5. Site the strip on ground that clears B3 over its whole length; scan lengths
   (K9: 7 and 5 pieces failed at 2.26°, 4 passed at 1.96°) before choosing
   the piece count. Write `orientationWhy` against the gate/face that matters.
6. Re-derive what the run changes, in order (each skipped step leaves the
   named field stale and the compile red or wrong):
   `cd $WG && python3 -m worldgen.blueprint_footprints --apply <bp>` (footprint =
   union of laid outlines), `--areas <bp>` (district boundary), `--doors <bp>`
   if a door binds to a run piece (not `--orient`: it re-solves the run's yaw), then
   `python3 -m worldgen.street_router --apply <bp>` (ways re-routed through a gate).
7. New prose (`orientationWhy`, approach lines) goes through `npm run
   docs:check` and a separate `text-review` agent (CLAUDE.md player-facing text).

## C. Compile and read the flags

8. `cd $WG && python3 -m worldgen.compile_settlement --blueprint <bp>` (a fixture:
   add `--skip-catalogue`; the chain: `--all`). A step with no run pair fails
   naming both pieces: re-read step 1, do not hand-place.
9. Read the result's `openModularEnds` rows (`placementId`, `face`, `reason`):
   - `faces-nothing`: a run face no neighbour meets within `ABUTS_MATCH_M` 0.5 m
     / `ABUTS_MATCH_DEG` 10° at the pair's `relScale`, and not a run terminal
     with `terminates` evidence. Fix the run (missing piece, wrong `yaw`, wrong end piece).
   - `no-abuts-evidence`: a structural piece no mined plugin places. Go to D; if
     none exists anywhere, it is a planner call (K10: stilt stair, cave mouth).
   - `placed-no-pairs`: placed, in no run pair, not `singleUse`. Planner call
     or a miner question (`kit-mining`), never a blueprint workaround.
   `singleUsePieces` is information, never a defect. Both are counted, never
   fatal (the caller decides; K7 B).
10. Tests: `cd $WG && python3 -m pytest worldgen/test_blueprint.py
    worldgen/test_compile_settlement.py worldgen/test_mine_abuts.py -q`, plus
    `worldgen/test_proving_ground.py` for yard work (four read the exported
    bundle and stay red until the yard is exported: K7–K10).
11. Materials budget: a run adds each piece's materials (K9: yard 98 → 106);
    raise the declared budget with the reason, per `settlement-build`.

## D. A set no plugin places (King of the Murkmire precedent, K8)

12. Confirm: the pool's `plugins=[]` in `$WG/worldgen/asset_registry.py` and the
    set's assets absent from `abuts.placedAssets`.
13. Find a mod whose plugin PLACES the set under the same model paths: the
    set's Nexus page "mods requiring this file", then the mod scene; open the
    candidate archive's file list first (133090's .rar held no plugin).
    Download with the owner's key (CLAUDE.md sourcing rule), sha256 it.
14. Register, all in one change: the pool's `plugins` in `asset_registry.py`
    (statistics only, comment why); `PLUGIN_POOLS` row in `mine_assemblies.py`
    (plugin file name lower case → pool; the join key); a row in
    `docs/research/placement-settlements/settlement-kit-sourcing-log.md`
    (source, version, sha256, what is taken); root `README.md` § Credits.
    Tests: `test_asset_registry.py test_mine_assemblies.py test_mine_designed_sink.py`.
15. Mine that set as a sample (E) with `--set <id> --plugin <esp> --world
    <worldspace> --names <Skyrim.esm>`, then add it to the full run.

## E. Re-mining abuts (sample first, fresh batch, scale once)

16. Write expectations first to a file (pairs, faces, `joint`, offset, count,
    ends, terminates) for a named sample directory; K10's shape:
    `/tmp/k10/expected_sample.txt`.
17. Sample (seconds): `cd $WG && python3 -m worldgen.mine_abuts <set args>
    --only <pool>:<dir>/ --cache /tmp/<round>cache --out /tmp/<round>/s.json`
    (`--min-count 1` to see single joints). Compare to the file; a wrong
    expectation is recorded as such in the ledger row, not silently changed.
18. Fresh batch: a directory never used before. Used: vanilla `wrfarmfence`,
    `stonewall`, `stockade`; BM&V Valenwood `newcastle`, `troncons`; KotM
    `walls`, `stonewalls`. A failing batch means fix, then another unseen batch.
19. One full run, all five sets (`vanilla`, `bmv-blackmarsh`, `bmv-valenwood`,
    `htbm`, `kotm`; plugin and worldspace arguments as `sets.*.plugins` /
    `worldspaces` in `$R`, kotm as step 15) under
    `tooling/repo-standards/memwatch.sh python3 -m worldgen.mine_abuts … --write`.
    K9/K10: 251–278 s, cgroup peak 4.50–5.34 GiB; nothing else heavy alongside.
20. After `--write`: `test_mine_abuts.py` (the spread check fails on purpose if
    a family pair spreads > 0.3 m), recompile every blueprint with a `pieces`
    parcel (`compile_settlement --all`), and compare `openModularEnds` counts
    with the last ledger row. Record stats (pairs run/double, family pairs,
    `endFaces`, `singleUse`) in a new ledger row.
