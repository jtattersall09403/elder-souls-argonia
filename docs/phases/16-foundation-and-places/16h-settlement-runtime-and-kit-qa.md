# 16h — The settlement runtime made correct and the kit QA loop

**Goal.** Fix the runtime boundary where the well-written placement rules
were silently discarded: the yaw sign, the bounding-box colliders, the
anchoring rule, the unshipped pads, the missing mount rule, the compiled
kinds that place nothing and the navigation that nothing consumes. Then run
the off-world kit QA loop with the owner and package it as a skill.

Needs ruling 12 (the loop and its budget, plan §8).

## Read

- [research/phase16/audit-settlements-delivered.md](../../research/phase16/audit-settlements-delivered.md)
  in full — §9 is the ordered fix list with the proving test for each.
- `packages/game-core/src/settlement/README.md`, `anchoring.ts`,
  `SettlementLayer.tsx`; `apps/world-studio/src/character/SettlementColliders.tsx`,
  `navigation/settlementNavigationHandoff.tsx`; `worldgen/export_settlement_bundle.py`,
  `compile_settlement.py`, `blueprint_integration.py`, `placement_metadata.py`;
  `world/97` Part C and §G; `research/rendering/building-placement-rendering-treatments.md` §3;
  `research/placement-settlements/kit-assemblies-evidence.md`, `piece-front-derivation.md`;
  decision 0052; `.claude/skills/settlement-build/SKILL.md`.

## Deliver (in this order — each with the audit's proving test, shown failing first)

1. **The yaw sign**: `finalPlacementTransform` and `solidFrom` rotate by +yaw
   in the compile convention; plan pivot offsets `originOffsetM[0..1]`
   applied. Test: LOD0 corners via `Matrix4` equal the export's footprint
   within 0.05 m on every shipped placement.
2. **Real collision**: `mesh` pieces export convex parts or a trimesh index
   from the kit build; `solidFrom` refuses a `mesh` placement without parts;
   `SettlementColliders` builds what the parts say. Test: a ray through the
   Lilmoth gate's archway passes; no `mesh` placement without parts.
3. **Anchoring per ground fit**: dug-in and pad to min/mean, direct to a
   bounded compromise, stilt measured (exemption removed), route structures
   included in the ground audit. Test: shipped-bundle replay, floats > 0.3 m == 0.
4. **Pads as patches** (D9): `grade_settlement_pads` emits
   `terrain-patches` (16b's stage) instead of writing the heightfield; the
   patches are applied and shipped; the waiver removed. Test: the pad receipt
   test reads the shipped raster.
5. **Mount rule** (D10): anchor class `ground / wall / ceiling / deck` and a
   `parentPlacementId` carried from `placement_metadata.py` to the manifest and
   the bundle; the layer positions a child from its parent. Test: no asset
   whose geometry hangs below its pivot is grounded by the ground rule.
6. **Renderable kinds place geometry** (D6): a declared renderable-kind list
   (ways, boardwalks, canals, approaches, docks, doors as threshold pieces
   where the kit ships one); a hard export error for a renderable kind with
   no placements; ways painted and, where the culture builds them, laid as
   boardwalk pieces. Test: each renderable kind owns ≥ 1 placement.
7. **Connectors, fronts and doorways in the bundle** and `check_abuts_snap`
   re-run on runtime transforms. Test: fails today on every rotated pair.
8. **Navigation** (D6, D8): a real stair or ramp piece placed per deck link
   and referenced by it; the character path given a step height and slope
   limit; the handoff widget reports what is consumed, not a hard-coded
   "blocked"; the province navmesh remains Phase 10b's and the record says so.
   Test: collider top within step height of the deck, base within step
   height of the ground.
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

- Every test above green and proven failable; `export_settlement_bundle`
  runs with **no** `shippedWithKnownErrors`; probe-blueprints reports zero
  grounding findings on the real formula; `npm test`, typecheck green.

## Owner check

- Lilmoth gate `?view=character&x=3.61&z=6.38&t=12:00`: walk through the
  arch. Then through any open frame or doorway you find.
- Nine-Trunks `x=4.97&z=3.76`: climb the stair onto a stilt deck.
- Mazzatun `x=1.99&z=1.34`: are the terraces on the ground, faced the way
  the blueprint view (`?bp=1`) shows, with no piece floating?
- The two contact sheets from the kit loop: right or wrong, one line each.

## Gotchas

- Fix the sign in **one** place; do not "correct" the compile convention to
  match the runtime — every measurement, snap check and pad tilt was made in
  the compile convention.
- Real collision raises the part count: re-measure the budget (0052) rather
  than raising it by hand.
- A stair is a sourced piece from a kit (stockade, Ayleid, dock steps
  exist); never an invented ramp.
