# Continue water work — resume point (water round 2, decision 0047)

Read after `CLAUDE.md` and [decision 0047](../../decisions/0047-water-one-physical-model.md)
(root causes, the data contract v2, the vanilla-asset merge addendum). This
file is the resume document: **everything a fresh agent needs to pick the
round up after a cut-off.** Keep it short and current.

**Keep-current rule (owner 2026-09-08).** The lead commits and pushes after every
agent report or landed step and refreshes the state table below in the same
commit; delivery agents append to the "Resume log" sections in
[water-quality.md](water-quality.md) after each fix. A fresh agent must be able to
continue from the repo alone at any moment, with nothing to be explained.

## State at the last update (2026-09-08, mid-afternoon UTC; refreshed with every push)

Committed on `main` (all gates green at each commit unless stated):

| Piece | Where | Status |
| --- | --- | --- |
| Runtime: signed-depth wetness with tide/season lift, terrain-cut shoreline with vertical fade, whitewater strips, along-flow undulation + flecks, one-session numeric probe | `packages/game-core/src/water/**`, `apps/world-studio/scripts/probe-water.mjs` | done |
| Waterfalls: cliff-only falls, piece-stacked bodies on the traced path with the vanilla textures and Bethesda's measured layer speeds, crest wrap, side strips, plunge base quads, lip alignment guard | `render/WaterfallSheets.ts`, `PlungeBase.ts`, `whitewaterStreaks.ts`, `kits/waterfall-fx-textures/` | done; **mist cards + basin ground-mist and the numeric fit checks are NOT done** (see Open) |
| Water Pro transfers: flow-advected foam energy field, depth-range shore froth, JONSWAP spectrum + standing waves (CPU twin), rain rings, sparkle + crest SSS, horizon blend, meniscus, 8192 s time fold, swept-path contacts, one foam texture family | `render/FoamField.ts`, `waves.ts`, `waterMaterial.ts`, study §6 | done |
| Terrain chain 13.7 → 5.5 min, unchanged rerun 11 s, per-stage timings, stage skipping | `scripts/terrain-chain.sh`, `worldgen/chain_stages.py`, `fastfilter.py` | done (idempotency gap queued in the backlog) |
| Vegetation rollout recorded; palettes widened 39 → 65 species | decision 0036 addendum, `build_palettes.py` | done; bundles rebuild with the chain |
| Dev-loop speed (measured 2026-09-08): root `npm test` ≈ 36 s serial, `npm run typecheck` 93 s, studio build 104 s (57 s vite + `tsc -b` + asset verify), browser probe ≈ 9 min (a full studio boot per site) | an Opus agent is making typecheck incremental and trimming the build; **the probe should boot once and teleport between sites via a dev hook instead of reloading** (not started; do it after the fit pass, which uses the probe) | in progress / queued |
| Research: Water Pro study, waterfalls from measured NIFs, vault asset audit | `docs/research/rendering/` | done |
| **Compiler: one physical model on full-res terrain** (`channels.py`, `compile_water.py`, carve in `refine_province.py`, `test_water_invariants.py`) | `tooling/world-generation/worldgen/` | **IN PROGRESS — WIP snapshot committed**; several invariants still fail on the shipped data |

## How to resume the compiler (the critical path)

1. `cd tooling/world-generation && python3 -m pytest -q worldgen/test_water_invariants.py worldgen/test_water.py`
   — the failing tests ARE the to-do list. Each encodes an owner-visible
   defect (dry river at the swim site 2660/900, dry coarse beds, hovering
   edges, bodies above their rim, strips outside their trench, falls that are
   not cliffs). Fix root causes in `channels.py` / `compile_water.py` / the
   carve; never loosen a test without a numeric reason written in the test.
2. Read the "Resume log" at the bottom of [water-quality.md](water-quality.md):
   the previous agent appends one line per invariant fixed (cause, file:line,
   what still fails). Watch `stats` in `water-meta.json`: `hoveringEdges`
   must be 0, `dryCoarseRiverCells` 0, `roadCellsDeepInWater` down to the
   known fords only (roads never stand in open water), `maxDepthM` only where a
   real closed basin exists.
3. Rebuild: `./scripts/terrain-chain.sh` (skips unchanged stages; `--force`,
   `--from <stage>`; `compile_water` runs twice by design — before grading so
   the road grader sees the channels, and last on the graded ground that
   ships), then `python3 -m worldgen.apply_sitings`, then
   `python3 -m pytest -q -n auto`. Note `author_route_structures` may stop on
   an authoring gate owned by the Phase 11 agent; continue `--from grade_routes`.
4. Data contract v2 is frozen (0047 § Decision): the runtime is coded to it.

## Then: the waterfall fit pass (not started when this was written)

Brief lives in the 0047 addendum: mist cards (4–8 per fall, scale 0.2–0.5,
pitched −10°…135°, within ~12 m of impact, bottom-faded) and 10–40 basin
ground-mist discs from the vanilla stack (`waterfall-assets-vault-audit.md`
§ plugin evidence), skirt column with only the bottom ~3.5 m visible; then
numeric checks in the probe: fall body luminance within ×0.6–1.6 of adjacent
foam in one frame, no >25 % luminance step across the lip or plunge joins
(layer toggles), correct from underwater, frame count at fall sites within
10 % of the river site. Files: `WaterfallSheets.ts`, `PlungeBase.ts`,
`WaterCascadeSources.ts`, `WaterEffects.ts`, `probe-water.mjs`.

## Then: close-out (in this order)

1. One full chain on the finished compiler; `npm test`, `npm run typecheck`,
   `pytest -n auto`; one probe run (`npm run build -w @elder-souls/world-studio`
   then `node apps/world-studio/scripts/probe-water.mjs`, ~9 min on this VM).
2. Write the owner's evidence ledger: one row per item in the owner's round-2
   message (the items are listed below because that file is temporary) with
   the measurement that proves it and the studio URL to look at.
3. PROGRESS.md Phase P row + *Waiting on user* checklist (URLs, plain English);
   tick B2 and unblock B5/B6/G8/G11 in `research/phase11/phase11-gap-plan.md`;
   review the water-driven place moves (gap plan B5) against the final rasters.
4. Deploy (push; check the Pages action) and hand off.

### The owner's round-2 items (verbatim intent, for the ledger)

1. Old hovering-water site dry mud — `view=character&x=4.57&z=3.87&t=10:00`; plus micro-jagged shore edges everywhere (root cause fix, not per site).
2. Lowland river continuous, flat to both banks, visible flow, foam drifting downstream — `x=1.85&z=4.89` (edge failure seen at 1.87/4.92).
3. Marsh: level rises/falls with `&wet=1` / `&wet=-1` without floating plates or domed blobs — `x=1.50&z=5.28&t=09:00` (failures at 1.51/5.30).
4. Former dry bed now a swimmable river, no holes, surface alive — `x=2.66&z=0.90`.
5. River above the waterfall full, no uphill belts, no holes — `x=2.47&z=0.30`; zigzag trenches under upland streams gone.
6. Waterfall lands in a deep pool, one coherent fall aligned with the bed, no flat sheet on the cliff face — `x=2.53&z=0.32` (fly: 2.60 E 0.41 S alt 238 NW 331°).
7. Deep basin lake keeps passing; the hovering patch south of it at 1.59/4.25 gone.
8. "Big waterfall" sites at fly `x=1.827&z=2.093` and `x=1.816&z=1.810` are slopes: must render as steep streams, not falls, no belts.
9. Mountain stream `orbit x=1.75&z=1.74`: white water following the slope, no floating patches.
10. Sea calm and storm keep passing (`orbit x=6.16&z=5.07`, `&w=storm`); underwater keeps passing; caustics keep passing.
11. Beach `x=6.10&z=1.64`: spawn on sand not in water; foam on the water's edge like a real beach.
12. Mountain lake `orbit x=0.38&z=1.44`: a lake, flat, clean edges, no belts or "lego" rivers.
13. Interaction and speed keep passing.
14. Tests/probes must fail on real defects and be cheap; vegetation rollout recorded and regional variety widened; the two place/bridge decisions reviewed.

## Verification quick reference

`npm test`, `npm run typecheck`; `pytest worldgen/test_water.py worldgen/test_water_invariants.py`;
browser: `probe-water.mjs` (14 sites, screenshots in `apps/world-studio/artifacts/`, never ingest them — hand them to the owner), `shot-deployed.mjs`.
