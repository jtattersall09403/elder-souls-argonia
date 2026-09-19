# 16h — The settlement runtime made correct and the kit QA loop

**Goal.** Fix the runtime boundary where the well-written placement rules
were silently discarded: the yaw sign, the bounding-box colliders, the
anchoring rule, the unshipped pads, the missing mount rule, the compiled
kinds that place nothing and the navigation that nothing consumes - there may be other things as well, investigate. Then run
the off-world kit QA loop with the owner and package it as a skill.

Needs ruling 12 (the loop and its budget, plan §8).

## Starting state (2026-09-19; written by the closing 16g agent)

**What 16g settled, with the home of each artefact.** The macro plot ran on the frozen
world: 567 of 580 records sited, 240 typed remedies applied
(`world/sources/sites/plot-remedies.json`, reasoning in
[research/phase16/16g-remedy-plan.md](../../research/phase16/16g-remedy-plan.md),
rulings in [0078](../../decisions/0078-places-adapt-to-the-frozen-world.md)
items 8-12 and [0080](../../decisions/0080-the-chain-runs-by-dependency-not-position.md)).
Beside the dots: 171 minor tracks (121.9 km) and 134 waterway channels
(55.9 km); one travel-service graph with road edges, transfer edges, berth
walks (`jettyM`) and body-following hops; a harbour station per city (nine,
`world/sources/routes/harbour-stations.json`, Gideon's on the bond-ferry
landing); a five-record rootworm network (`rootworm-stations.json`); design
groups registered (`design-groups.json`, spread measured anchor to member);
interior promises refreshed (sameness pairs 198 down to 27) and the NPC
roster re-applied (474). The known-red register is empty and six withdrawn
requests are classified `withdrawn` until the next refreeze. The chain now
runs by dependency (receipts, `--check-stale`, cascade; 0080).

**What 16g handed you.**
- **Blackrose's centre moves onto its lake** in the city pass: the owner's
  call, made on the plot and not yet realised in a blueprint.
- **Villages with underwater access need their entrances on the bank**, from
  `underwaterAccessDetail`, when the blueprint is drawn.
- **Thirteen records are homeless by owner acceptance**
  (`world/sources/sites/plot-homeless-accepted.json`): the owner may loosen,
  re-type, cut or unfreeze water for any of them before you start. Re-read the
  file rather than the count.
- **The stale Lilmoth quay promise is gone**; the quay socket stands on ocean.
- Open with the owner as they arise: the pirate-freeholds zone water identity;
  the stronghold reserved at the Empty Steading (reversible).
- The water bundle is missing 27 graph bodies (a 16c backlog row); the
  Blackrose lake is realised as `body.1284-3448`.

**What the tree still holds against you.**
- **Tests gated by 16d's purge (`@requires_delivered`), yours to un-gate as
  you port** (decision 0067; the reader is `ProvinceSurvey.water_at / reach /
  body`, and the survey's `flood/tidal/salinity/wetlands/lakes/river_band`
  keys no longer exist): the nine `test_compile_settlement.py` tests listed in
  audit §9, blocked because `compile_settlement.py:597` reads `survey.flood`.
- **The runtime exists and renders**: `packages/game-core/src/settlement/` is
  ~1,650 lines over nine files. Nothing below is new-build; every step is a fix.
- **The settlement bundle is stale.** `apps/world-studio/public/province/settlements.json`
  was built on pre-16b ground and `ladder.json` hides the layer; the 16g chain
  run republished places, routes and paint, not settlements. Rebuild before
  measuring. (Mode 0600 here; fix the mode if a second agent cannot read it.)
- **The yaw defect is a sign, not a missing plus.** `anchoring.ts` ~91 rotates
  by `+yawDeg`; three.js `rotateY(+0)` is the compile convention's R(-0)
  (audit §5). Negate, in `finalPlacementTransform` and in `solidFrom`
  (`SettlementLayer.tsx` ~140). Measured: median heading error 92.7 degrees,
  691 of 733 pieces.
- **No non-box collider path exists**: `SettlementColliders.tsx` ~34-42 only
  calls `ColliderDesc.cuboid()`. Step 2 adds a convex/trimesh path. The
  collider budget is already 1,600 (`export_settlement_bundle.py`, 0052;
  Lilmoth 1,033 worst case): re-measure, never re-fit from the retired 256.
- **One waiver is live**: `shippedWithKnownErrors.count = 2`, both the stale
  Mazzatun pad receipt (D9).
- **The tests are green and prove nothing**: `npm run test:placement` gave
  517 passed, 13 skipped through every defect above. Audit §7 names five gates
  that cannot fail; make each fail first.
- **The nav handoff is hard-coded and its test asserts the hard-coding**
  (`settlementNavigationHandoff.test.ts` expects `blocked-no-navigation-runtime`).
- **Composites are used only at Lilmoth**: 45 `composite:` asset refs there,
  none elsewhere; the expansion is not in `compile_settlement.py`.
- **The data this chunk needs is built and unshipped**: `<kit>.connectors.json`,
  `<kit>.footprints.json`, `<kit>.interiors.json` in
  `tooling/asset-pipeline/output/kits/`, while `apps/world-studio/public/kits/`
  holds only the 43 `.glb` + `.kit.json` pairs. Step 7 is copy-and-consume.
- `placement_metadata.py` sits in `tooling/asset-pipeline/pipeline/`, not in
  worldgen; the anchor class threads from there through the kit manifest.
  `.claude/skills/kit-qa/` does not exist and the assembly renderer is new.
- **The chain ladder** declares all nine chunks (`worldgen/ladder.py`); the
  `[16h]` row in `terrain-chain.sh` is empty and waits for your stage names.
- Keep: `settlement-warning-known-red.json`, the `COMPATIBLE_ASSET_GROUND_FITS`
  shelf, the three non-waivable 0052 gates, collision residency by authored
  boundary.
## Read

- [research/phase16/audit-settlements-delivered.md](../../research/phase16/audit-settlements-delivered.md)
  in full — §9 is the ordered fix list with the proving test for each.
- `packages/game-core/src/settlement/README.md`, `anchoring.ts`,
  `SettlementLayer.tsx`; `apps/world-studio/src/character/SettlementColliders.tsx`,
  `navigation/settlementNavigationHandoff.tsx`; `worldgen/export_settlement_bundle.py`,
  `compile_settlement.py`, `blueprint_integration.py`,
  `tooling/asset-pipeline/pipeline/placement_metadata.py`;
  `world/97` Part C and §G; `research/rendering/building-placement-rendering-treatments.md` §3;
  `research/placement-settlements/kit-assemblies-evidence.md`, `piece-front-derivation.md`;
  decision 0052; `.claude/skills/settlement-build/SKILL.md`.

## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

`compile_settlement` and `settlement_ground_control` are rows in
`worldgen/record-reads-allowlist.json` (with `blueprint`'s flood reads):
`waterOk`, the door-on-land test, the stilt over-water share, the flood band
per section (97 B4) and dock depth (B5) all read the coarse flood band or
decode the water image themselves, so every blueprint describes the
pre-16c water. That is a bug, not a convention. Port them to the record
reader, delete the reads and the rows; a parcel's `waterOk` reason names
the body or reach id and its kind. A test joins every blueprint water fact
and over-water placement to its id and fails on a missing id or
disagreeing kind, shown failing on the five shipped blueprints. Ground
contact is the second thing this chunk must read from its source rather
than inherit as a guess: deliverable 3.

**Rule scope, moved here from 16g (planning 2026-09-18) with the rule
decided:** the `argonian-stilt` 15–30 % over-water share is asked only of
a district whose parcels touch a recorded body, reach or flood band (by
id); `works-quays-flood-section` is asked only of a works parcel that does; a
district or works on dry high ground is out of scope (Lilmoth's
`council-crown` and `hist-court`, the licensed camp's stage and deck). The
backlog rows and the known-red rows in
`world/sources/settlements/settlement-warning-known-red.json` retire with
this port; the register must still fail if a row in scope quietly passes.

## Deliver (in this order — each with the audit's proving test, shown failing first)

1. **The yaw sign**: **negate** the runtime rotation — `setFromAxisAngle(+yaw)`
   in three.js is the compile convention's R(−θ) (audit §5), so
   `finalPlacementTransform` (`anchoring.ts`) and `solidFrom`
   (`SettlementLayer.tsx`) rotate by −yawDeg; plan pivot offsets
   `originOffsetM[0..1]` applied; the `pitchDeg` 16e puts on span placements
   honoured in the same transform. Do not read the existing `+yawDeg` as
   "already done". Test: LOD0 corners via `Matrix4` equal the export's footprint
   within 0.05 m on every shipped placement.
2. **Real collision**: `mesh` pieces export convex parts or a trimesh index
   from the kit build; `solidFrom` refuses a `mesh` placement without parts;
   `SettlementColliders` gains a convex/trimesh path and builds what the
   parts say (today it emits cuboids only). Test: a ray through the
   Lilmoth gate's archway passes; no `mesh` placement without parts.
3. **Anchoring by designed ground contact, per asset** (owner 2026-09-14,
   decision 0066): most building exteriors were modelled to sit partly in
   the ground (a door sill half-way up the mesh, a foundation course meant
   to vanish, various other things). Today they are sunk by a per-class table
   (`placement-policies.json`: direct 0.08 m, dug-in 0.35 m, "reviewed"
   guesses), which is class-4 re-derivation. Replace it: for every kit
   asset, measure how its makers placed it — every reference to the base
   object in Skyrim.esm and the source mod's plugin, pivot z minus
   `height_at` (`esp_index`, the method `mine_placement.py` already uses for
   flora) — and record `designedSinkM` (p50, p25, p75, a slope term) on the
   kit manifest with the sample count as evidence. Where an asset has no
   placements (a mod kit with no worldspace), consider whether a different asset that *does* have placements could be swapped in without sacrificing anytyhing (e.g. one type of local lore-consistent hut or fence piece for another, or similar straight swaps). If you can't safely swap in a different asset, measure the mesh: the lowest
   door sill, floor plane, bottom step of a staircase (etc - there may be many different potential 'tells' for different asset types - figure this out) relative to the pivot is the ground line, with
   evidence `mesh-sill`. `anchoring.ts` then sinks by the asset's value; the
   class table survives only as a bound (`buryCapM`) and a fallback that
   the export lists as a gap. Stilt measured (exemption removed); route
   structures in the ground audit. Tests: every kit asset carries
   `designedSinkM` with evidence; a `mesh-sill` value that puts the sill
   above or below the ground line by more than 0.1 m fails; shipped-bundle
   replay, floats > 0.3 m == 0 and sills within 0.15 m of the ground.
4. **Pads as patches** (D9): `grade_settlement_pads` emits
   `terrain-patches` (16b's stage) instead of writing the heightfield; the
   patches are applied and shipped; the waiver removed. Test: the pad receipt
   test reads the shipped raster.
5. **Mount rule** (D10): anchor class `ground / wall / ceiling / deck / water` and a
   `parentPlacementId` carried from `placement_metadata.py` to the manifest and
   the bundle; the layer positions a child from its parent. As one small example, we should have no hanging lanterns that aren't in fact hanging off anything. You must also carefully derive (ideally from esm files) exactly how these mounted assets are intended to be mounted: which parent asset carries each one and which specific part or point of that parent takes the attachment; then ensure ours are mounted in the same way. Test: no asset
   whose geometry hangs below its pivot is grounded by the ground rule. Plus other tests that you design to ensure that what we've described above is made true. `water` is the class for a hull: it sits on the recorded level of the
   reach or body its berth names (16e's ferry record), sunk by a designed
   waterline measured the same way as `designedSinkM` (the source plugin's
   placements over water), never on the ground under the water. Test: every
   hull's waterline is within 0.1 m of its berth's recorded level.
6. **Renderable kinds place geometry** (D6): a declared renderable-kind list
   (ways, boardwalks, canals, approaches, docks, doors as threshold pieces
   where the kit ships one, ferry landings and the hull at each berth from
   16e's service record, the operator socket as a stand-in marker until an
   NPC runtime exists, anything else required - find out); a hard export error for a renderable kind with
   no placements; ways painted and, where the culture builds them, laid as
   boardwalk pieces. Test: each renderable kind owns ≥ 1 placement.
7. **Connectors, fronts and doorways in the bundle** and `check_abuts_snap`
   re-run on runtime transforms. Test: fails today on every rotated pair.
8. **Navigation** (D6, D8): a real stair or ramp piece placed per deck link
   and referenced by it; the character path given a step height and slope
   limit; the handoff widget reports what is consumed, not a hard-coded
   "blocked"; the province navmesh remains Phase 10b's and the record says so. Some decks and stilt type assets come with a partial or complete staircase built-in. Some of these reach the ground by sinking stilts into terrain, some may be designed to have extra stairs or ramps or ways attached to their bottom step - figure all of this out.
   Test: collider top within step height of the deck, base within step
   height of the ground.
8b. **Settlement vegetation clearance as a patch** (owner 2026-09-16): a
   blueprint's `hardClear`, `thinned` and `kept` become a
   `vegetation-clearance` patch in `world/sources/flora/vegetation-patches.json`
   (16f's kind and applier, `apply_vegetation_patches`, the keep gradient
   of `vegetation_patches.py` carried over), applied to the touched
   chunks' published bundles with a receipt; `compile_scatter` is never
   re-run for a settlement and reads no settlement data. The runtime ring
   evaluates the same patch list. Test: a moved settlement's receipt names
   only its chunks.
9. **Dressing vocabulary** (D11): per-rule draws with a distinct-asset floor;
   interior-kit assets never placed outside. Test: ≥ 4 distinct, ≤ 40 % share.
10. **Export gates**: corrupt-GLB parse; `test:placement` selects by
    directory or marker rather than a hand list.
11. **The kit QA loop** (D13, plan §8): the assembly renderer
    (`render_sheet` extended to `(assetId, positionM, yawDeg)` lists, four
    cameras + plan, collider wireframes); two owner rounds on the Lilmoth
    gate assembly and the three worst composites; every "wrong" becomes a
    97 §C rule and a `blueprint_integration` check; the loop packaged as
    `.claude/skills/kit-qa/`.

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `grade_settlement_pads` (as patches), `rederive_blueprints`, `compile_settlement`, `export_settlement_bundle`, `settlement_ground_control`. Add them
  to the ladder in `tooling/world-generation/scripts/terrain-chain.sh` and bump `DELIVERED_THROUGH`
  to this chunk in the delivering commit; until then a plain chain run skips
  them and their published JSON is stale.

- Every test above green **and shown failing first** (the suite is 517-green
  today through every defect: a new gate that passes on the current bundle
  is not a gate); `export_settlement_bundle`
  runs with **no** `shippedWithKnownErrors`; probe-blueprints reports zero
  grounding findings on the real formula; `npm test`, typecheck green.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): everything above plus the settlements, drawn by the corrected runtime.


- Lilmoth gate `?view=character&x=3.61&z=6.38&t=12:00`: walk through the
  arch. Then through any open frame or doorway you find.
- Nine-Trunks `x=4.97&z=3.76`: climb the stair onto a stilt deck.
- Mazzatun `x=1.99&z=1.34`: are the terraces on the ground, faced the way
  the blueprint view (`?bp=1`) shows, with no piece floating?
- The route structures carry their road's 4E 201 `condition` (registry, 16e): a `broken` road's bridge may be authored collapsed or overgrown where the kit has such a piece; say on the record which pieces exist for that.
- The route layer drawn for the first time by the corrected runtime (16e's
  records; the layer was hidden until this chunk): the Nine-Trunks viaduct
  `x=4.517&z=3.608` and the Xul-Vaat walkway `x=1.203&z=5.730` standing with
  the deck at road height; the Drowning Gate ferry `x=0.458&z=3.132` with a
  boat at each landing, sitting on the water.
- The two contact sheets from the kit loop: right or wrong, one line each.

## Gotchas

- Fix the sign in **one** place; do not "correct" the compile convention to
  match the runtime — every measurement, snap check and pad tilt was made in
  the compile convention.
- Real collision raises the part count: re-measure the budget (0052; it is
  1,600 today) rather than raising it by hand.
- A stair is a sourced piece from a kit (stockade, Ayleid, dock steps
  exist); never an invented ramp.
