---
name: composite-author
description: Author or audit a kit COMPOSITE (`compose.parts`) as the source plugin places it — templates, anchorScale and partScaleInAnchor, the entrance it derives, the door agreement tests on compiled output, and which kits and places to rebuild after. Use when adding a composite, when a composite's door stands off its doorway, when `kit-assemblies-mined.json` is re-mined, or when auditing every composite against the templates.
---

> **Written against** (0086: cite, never restate): 16h ledger
> (`docs/research/phase16/16h-ledger.md`) rows K6 blocked (B), K7 A scale,
> K7 A hut, K7 C/D/E, K9 not done, K10 D composites, K10 E, K10 F, K11 A, K11 D; brief
> `docs/phases/16-foundation-and-places/16h-settlement-runtime-and-kit-qa.md`
> § Part 1 state, "Open, in order" b2(1); decisions 0036 (composites),
> 0085 (kit truth is mined), 0086 (this skill). Siblings: `kit-build` (the
> rebuild), `kit-mining` (any miner re-run), `modular-runs` (chains of
> abutting pieces: not composites), `settlement-build` (umbrella).
> A rule below that disagrees with a cited row: the row wins; report it.

Paths: `W=tooling/world-generation` (run `python3 -m worldgen.*` from it),
`P=tooling/asset-pipeline` (run `python3 -m pipeline.*` from it),
record `R=world/sources/placement/kit-assemblies-mined.json`, kit configs
`$P/pipeline/config/kits/<kit>.json`.

## 1. Read the plugin's placement, never the piece names

1. List the templates whose `anchor` is the shell (part 0):
   `python3 -c "import json;d=json.load(open('$R'));[print(t['id'],t['part'],t['anchorScale'],t['partScaleInAnchor'],t['offsetM'],t['yawDeg'],t['count']) for s in d['sets'].values() for t in s['templates'] if t['anchor']=='<shell id>']"`
   (from the repo root). Also read `d['doorwaysFromAssemblies']['<shell id>']`.
2. A template's `offsetM` is in the anchor's UNIT frame (divided by the
   anchor's scale, `mine_assemblies.unit_offset`; K7 A scale). A cluster may
   merge parts that stand at different placed offsets (K7: t0089/t0090 hold
   the four `doorframe01` rings two by two at the 0.3 m tolerance). When
   the parts of one anchor instance do not collapse to one offset, read the
   per-instance offsets from the plugin refs (K10 D: every one of the 11
   huts carries the same five pieces to 0.01 m) and compose those.
3. No template for the pair: the composite is hand-composed (Anvil trees)
   or shares an origin (`stilthouse-with-door`, kiosk-with-access). Say so
   in `compose.note`; the door tests in step 6 then hold it.
4. A chain of the same piece abutting end to end is a run, not a
   composite: stop and use `modular-runs` (K9 B, K10 A/B).

## 2. Write `compose.parts` at the scale the plugin places it

5. In the kit config entry (`"asset": "composite:<family>/<name>"`):
   - part 0 = the shell, `"scale": <anchorScale>` (mud hut 1.3);
   - every other part: `"scale": anchorScale × partScaleInAnchor`
     (1.3 × 0.769 = 1.0: the door stays player-sized),
     `"offsetM": template offsetM × anchorScale` (the PLACED offset; the
     Blender importer applies offset, then yaw, then the part's own scale,
     `blender/build_kit.py` `import_composite`), `"yawDeg"`: the template's;
   - `compose.note` cites the template ids, the ref count and the placed
     offsets, written against the record (standard 12); it is world-record
     text: `text-review` in a separate agent before commit.
   Reference entry: `composite:mud/hut-with-entrance` in
   `settlement-mud-v1.json` (K10 D). A composite whose part 0 is unscaled
   at 1.0 while the plugin places it at 1.3 is the K6 (B) defect.

## 3. Audit every composite (after any assemblies re-mine)

6. For each kit config under `$P/pipeline/config/kits/` and each entry with
   `compose`: match every part > 0 to a template on part 0; compare part 0
   scale to `anchorScale`, each part's scale to anchorScale ×
   partScaleInAnchor, each offset to template × anchorScale (0.3 m, 5°).
   Write the table before/after to `/tmp/<round>/audit_{before,after}.txt`
   (K10 D format). Verdict per composite: agree / re-authored / no template
   (why) / disagrees with abuts (a planner call: record it, change nothing;
   K10 D `wr-fence-run-3`).
7. Fix `compose.note` prose that claims what the geometry does not carry
   (K10 D: route-spans bridge01, works scaffold deck).

## 4. Re-mining the templates (miner: sample first)

8. Use `kit-mining` for the protocol. Specific to this miner: expectations
   written first for one set (e.g. `--set bmv-blackmarsh`), run to a /tmp
   copy of `$R` (`--out /tmp/<round>/assemblies.json`, pre-seeded with a copy
   of `$R` so `assign_ids` keeps ids), a fresh set second, then the ONE full
   run with the `Usage:` line in `worldgen/mine_assemblies.py` (K7: ~6 min,
   peak 3.47 GiB). After it, every template id cited in a kit config,
   `compile_route_structures` and `test_render_assembly` must still exist
   (K7: all but merged t0037); re-point any merged id, then step 6.

## 5. The entrance the composite derives

9. `interiors_index.composite_doorways` gives a composite its anchor's mined
   doorways whose door piece is one of its parts. Check the entrance
   against the parts: the doorway radius in `<kit>.interiors.json` must fall
   within the frame/leaf radii of the composed door pieces.
   The mine measures the doorway in the anchor's UNSCALED frame;
   `composite_anchor_poses` carries it (and the anchor's plugin door link
   and sibling door-piece boxes) through part 0's `scale`/`offsetM`/`yawDeg`
   (K11 A: mud hut 5.01 → 6.50 m).
10a. Yaw sign: a mined relative `yawDeg` (templates, abuts) is CLOCKWISE;
   `import_composite` turns counter-clockwise. Check a turned part on the
   meshes (contact points against its parent) before trusting a copied yaw
   (K11 D: the fence cap at mined 90 needs `yawDeg` 270).

## 6. Rebuild, then the door agreement tests on compiled output

10. Rebuild every kit whose config you changed: hand to `kit-build`
    (`python3 -m pipeline.build_kit --kits <a>,<b> --jobs 3`; it runs the
    three sidecar measurers itself, `build_kit.measure_sidecars`, K10 D;
    then compression and publish per that skill). Skipped: the published
    GLB, `.footprints/.interiors/.connectors` sidecars and the entrance are
    stale, and every door test below reads the old kit.
11. Designed sink: `python3 -m worldgen.mine_designed_sink --complete-only`
    (a composite's sink row is its base's, `base:` evidence, M14 (3); a
    rebuild moves the raw tell, M16). Skipped: manifests disagree with the
    record (the manifest-vs-record tests go red).
12. Every blueprint placing the composite (`grep -l '<composite id>'
    world/sources/blueprints/*.json $W/worldgen/testdata/*.json`), in this
    order, re-run until `--check` is clean (K10 E):
    `blueprint_footprints --orient --apply`, `blueprint_footprints --apply`,
    `blueprint_footprints --areas --doors`, `street_router --apply`. Then
    raise `interiorClaim.sizeClass` if the footprint grew and the declared
    `maxUniqueMaterials` if the composite gained materials (K10 E (6)).
    Skipped: thresholds and paths end at the old doorway.
13. `python3 -m worldgen.compile_settlement --all` (zero errors).
14. Tests (from `$W`), all green before the job is done:
    `python3 -m pytest -q worldgen/test_proving_ground.py -k door`
    (leaf-in-doorway on the kit, threshold-on-doorway on the published
    bundle, each with a test that must fail on purpose);
    `python3 -m pytest -q worldgen/test_compile_settlement.py -k corrected`
    (the mire-landing fixture); from `$P`:
    `python3 -m pytest -q pipeline/test_interiors_index.py pipeline/test_build_kit.py pipeline/test_render_assembly.py`.
    The published-bundle door tests need the export: `settlement-build` §5.
15. Assembly sheets: `render_assembly`'s stamp carries `pose_hash` (K10 F);
    a changed composite makes its sheet stale: re-render it before any
    visual judgement.

## 7. Record

16. A ledger row in the round's table (Delivered | Numbers / gaps): the
    composites changed with template ids and scales, kits rebuilt with
    MB before → after, door gaps in metres per composite, tests passed/red.
