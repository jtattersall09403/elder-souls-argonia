# Audit — the delivered settlements against the rules (2026-09-11)

Read-only audit for the Phase 16 plan, measured on the **shipped**
`apps/world-studio/public/province/settlements.json` (schema 1) and the
shipped kit GLBs (LOD0 bounds read from the GLB JSON chunk). The owner
reported hollow buildings, wrong kits and snaps, orientation "all over the
place", misaligned doors, hovering pieces, no paths, invisible walls at every
gate, unreachable stilt stairs, no pads, floating lamps.

## 1. What is placed

4,958 placements = 733 settlement + 4,225 route structure; 5 settlements,
546 compiled objects, 58 doors, 153 navmesh cuts, 60 navmesh links, 24 pad grades.

| Exemplar | buildings | fences | dressing | landmarks | docks |
|---|---|---|---|---|---|
| Lilmoth | 61 | 210 | 183 | 9 | 3 |
| Mazzatun | 29 | 70 | 0 | 2 | 0 |
| Nine-Trunks | 15 | 39 | 12 | 19 | 1 |
| Sap-Tapping Licensed | 7 | 0 | 42 | 2 | 1 |
| Wamasu Pond | 3 | 9 | 0 | 15 | 1 |

- Composites (`assetId` prefix `composite:`): **45 of 733**; buildings 44
  composite / 71 single, and all 44 composites are Lilmoth's. Mazzatun,
  Sap-Tapping and Wamasu Pond place **zero** composites — every building
  there is one kit shell. That is the "hollow volume".
- Lilmoth's 183 dressing pieces are **183 copies of one asset**, a wicker
  chair from the *interior* kit `htbm-hut-int`; 237 dressing placements
  province-wide, all `collision.kind: none`.
- Kit manifests ship **no** `entrance`, `doorway`, `connectors`, `front` or
  `footprint`; that data exists (`<kit>.connectors.json`, `.footprints.json`,
  `piece_front.py`) but is consumed only at blueprint time
  (`blueprint_integration.py:597,628`), never by the runtime.
- The 58 door records name no placement (every string field checked); a door
  is a parcel-derived `thresholdM` + `facingDeg` (`export_settlement_bundle.py:971-972`).
- Compiled kinds with **zero placements**: route 31, door 58, socket 52,
  occupant 54, kept 26, district 17, combat 14, terminal 13, boardwalk 12,
  approach 10, variant 10, blueprint-field 30, canal 3, travel 5,
  terrain-operation 1. Only `parcel` (115), `landmark` (47), `fence` (42)
  and `dock` (6) produce geometry. **Ways, boardwalks, canals, approaches
  and doors are records with nothing placed.**

## 2. Grounding

`positionM[1]` is dead: `SettlementLayer.tsx:399` re-anchors from streamed
terrain via `anchorPlacement` (`anchoring.ts:27`), `y = max(terrain over the
sample set) + originOffsetM[2]·scale − buryM`. Pivot offsets are correct
(0 of 733 mismatches > 0.3 m against measured `−minY`). Replaying the runtime
formula on the shipped LOD1 chunk rasters:

| groundFit | n | floats > 0.3 m | > 1.0 m |
|---|---|---|---|
| direct | 612 | 17 | 8 |
| dug-in | 32 | **26** | **18** |
| pad | 24 | 1 | 0 |
| stilt | 60 | 0 by construction (`gapM` hard-zero, `anchoring.ts:66`) | 0 |
| plinth | 5 | 1 | 0 |

Worst: 7.04 m (`mazzatun.course-e1.building`, terrain range 7.79 m, bury
capped 0.75), 4.19 m, 4.12 m, 3.62 m, 2.90 m (`lilmoth.council-floor`).
Mechanisms: anchoring to the **highest** sample with a capped bury lifts the
low side on any slope; `dug-in` anchors to the max, the opposite of its
meaning. Route structures (85 % of placements) are excluded from the ground
audit (`SettlementLayer.tsx:398`).

**Pads are not in the shipped terrain.** `refined/height-rg.png` is
byte-identical to `height-natural-rg.png`; the pad receipt's input hash is
the shipped final height and its output hash is not. The bundle's
`shippedWithKnownErrors` carries both pad errors, waived 2026-09-09 (commit
`4b5beab0` "roads on natural ground"). 24 pad parcels sit on ungraded ground.

## 3. Colliders — the invisible walls

`apps/world-studio/src/character/SettlementColliders.tsx:33` uses only
`ColliderDesc.cuboid`. `SettlementLayer.tsx:139-173` (`solidFrom`): with
`collision.parts` it uses those boxes; otherwise **one axis-aligned box per
LOD0 primitive** from `geometry.boundingBox`. Shipped: `collision.kind`
`mesh` 3,078 / `none` 1,860 / capsule 12 / convex 8, but only **8 of 3,098**
placements carry `collision.parts`. The declared `mesh` collision is never
honoured. Lilmoth's gate (`mwimparchwallgate01`, 6 primitives) becomes six
boxes each 7.28 m wide and 9–11 m tall; the archway is inside all six. The
same mechanism closes every window, door reveal, open frame and staircase.

## 4. Navigation and stairs

`settlementNavigationHandoff.tsx:82` returns a literal
`blocked-no-navigation-runtime`; `:125` prints the owner's message. Nothing
outside that widget reads `navmeshCuts` / `navmeshLinks`. A building cut is
the parcel footprint polygon; a deck link is `{kind: "deck-to-ground"}`
metadata emitted for every stilt parcel (`export_settlement_bundle.py:964-969`)
with **no stair geometry**. The only stair-like assets among the 733 are 8
pieces, each a solid block by §3. No autostep or slope limit is configured
in the character path.

## 5. Orientation — the yaw sign is inverted

Compile, export, footprints and connectors rotate with
`wx = cx + x·cosθ − z·sinθ; wz = cz + x·sinθ + z·cosθ`
(`blueprint_footprints.py:18`, `blueprint_integration.py:634-641`,
`export_settlement_bundle.py:491-495`). The runtime builds
`Quaternion.setFromAxisAngle((0,1,0), +yaw)` (`anchoring.ts:96-99`), and
three.js `rotateY(θ)` is `x' = x·cosθ + z·sinθ; z' = −x·sinθ + z·cosθ`, i.e.
**R(−θ)**. Heading error `2·yaw` folded to 0–180°: **median 92.7°, p90
174.8°**, affecting 691 of 733 settlement and 3,477 of 4,225 route pieces.
Lilmoth's gate arch (yaw 243.5°): exported footprint bearing 333.5°, runtime
bearing 206.5° — 127° apart. Because terrain is sampled at the exported
footprint while the mesh is drawn mirrored, pieces are grounded against
ground they do not stand on. `originOffsetM[0..1]` (plan pivot offsets) are
used at export and never applied in `finalPlacementTransform`. Doors'
`facingDeg` / `thresholdM` are consumed by nobody; `piece_front.py`'s
`frontDeg` never reaches the bundle.

## 6. Lamps and dressing

No mount, parent or attach concept exists; everything is "bottom of bounding
box to terrain max". `mudmother:…/argonianlanterns02` (3 landmarks,
`direct`) measures `minY −2.627, maxY +0.087`: the pivot is the hanging
hook, so the hook is placed 2.6 m in the air with nothing above it. The 237
dressing pieces use `anchor.mode: streamed-origin` with an empty footprint
(one terrain sample), so a wide rack on a slope has a leg in the air; 36
pieces over 8 m diagonal carry no footprint.

## 7. Gates, and gates that cannot fail

| Symptom | Would a gate fail? |
|---|---|
| invisible walls | no test that an opening stays open or that `mesh` yields more than boxes |
| yaw mirrored | `check_abuts_snap` validates in the compile convention only |
| doors misaligned | no gate relates a door record to a mesh doorway |
| hovering | measured by `settlementGroundAudits`, gated on nothing shipped; stilt exempt |
| pads not graded | yes — and waived into `shippedWithKnownErrors` |
| ways not placed | export needs compiled objects to exist, not to place |
| stilt decks unreachable | a deck link is emitted unconditionally |

Cannot fail as written: `test_export_settlement_bundle.py:469` (hand-built
dict with `collisionBox`, the branch 38/1181 assets take), `:602` (validates
the receipt against the grader's in-memory result, never the shipped
raster), `settlement.test.ts:93` (synthetic placement), the navigation
handoff test (asserts the feature is absent), `_fake_glb` (`:492`, no
`POSITION min/max`, so no LOD/collision test sees geometry).

## 8. Kit visual QA tools

`pipeline/render_sheet.py` (Blender) renders named pieces to a contact sheet
one at a time; `vibe_sheet.py`, `audition.py` adjacent; `render_blueprint.py`
is 2-D and plots the compile convention, so it cannot show the mirroring.
**Nothing renders an assembly at placed transforms.** Extending
`render_sheet` to take `(assetId, positionM, yawDeg)` triples is a small job
and the cheapest way to see the yaw sign, connector gaps and arch collider
off-world.

## 9. Ranked root causes → smallest fix → proving test

1. **Runtime rotates by −yaw** (`anchoring.ts:96-99`) → negate the angle in
   `finalPlacementTransform` and `solidFrom` → a shipped-data test comparing
   LOD0 corners via `Matrix4` against the export's `_bounds_footprint` within
   0.05 m (fails today by 127° on the gate).
2. **`mesh` collision never honoured** (`SettlementLayer.tsx:159-172`,
   `SettlementColliders.tsx:33`) → export real convex parts / trimesh for
   `mesh` pieces; `solidFrom` refuses a `mesh` placement with no parts → a
   ray through the archway centre passes; no `mesh` placement without parts.
3. **Anchor to terrain max with a capped bury** (`anchoring.ts:60-70`) →
   per-fit reference (dug-in/pad → min or mean; direct → bounded compromise);
   delete the stilt exemption → shipped-bundle replay gates `float > 0.3 m == 0`.
4. **Pad-graded heightfield never shipped** → re-run the grader into the
   published raster, remove the waiver → the receipt test re-pointed at the
   shipped raster.
5. **No mount rule** → carry an anchor class (`ground / wall / ceiling /
   deck`) and a parent placement id through `placement_metadata.py` → no
   asset with `maxY < 0.2` grounded by the ground rule.
6. **Connectors, fronts, doorways stop at the blueprint** → export them and
   run `check_abuts_snap` on runtime transforms → fails today for every pair.
7. **15 of 19 compiled kinds place nothing** → a declared renderable-kind
   list and a hard error → `boardwalk / route / approach / canal / door`
   each own ≥ 1 placement (fails on all 114 today).
8. **No pathfinding runtime; deck links are metadata** → place a real stair
   or ramp per link and reference it → collider top within step height of
   the deck, base within step height of the ground.
9. **Dressing is one asset repeated** → per-rule vocabulary with a seeded
   draw and a distinct-asset floor → ≥ 4 distinct assets, ≤ 40 % share.
