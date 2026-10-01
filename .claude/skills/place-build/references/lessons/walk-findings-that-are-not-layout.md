# Lessons: Walk findings that are not layout

Part of the lessons store; the row format and the file index are in [README.md](README.md).

| Id | Rule | Defect and cause | Enforced by | Shot | Source | Types |
|---|---|---|---|---|---|---|
| L45 | Route camera, flicker and flash findings to the runtime owner, not to the layout | camera swing when pulled in by a wall (look target not moved by the obstruction, check-in 3 §1); decal overlays z-fighting on 203 materials (§3); buildings flashing out for a frame (check-in 2 ruling 2) | runtime fixes 259b200a, 5d854e98 | walk | owner walk 2, 3 | all |
| L46 | Check that each placed piece is visible from the ground at its coordinates | the boardwalk was invisible at 4.273 / 5.739 (check-in 2 ruling 7) | `test_proving_ground` visibility row | walk | owner walk 2 | all |
| L80 | Never `deleteAttribute` a name a material reads before `geometry.dispose()`; swap shared attributes for the empty stand-in (`detachSharedAttribute`), because three.webgpu builds a render object's attribute list lazily on dispose and reads `.id` of every missing name | walk 7 boot check: unmounting a place threw "Cannot read properties of undefined (reading 'id')" from `getAttributes` and stopped the scene ("3D tree failed"); `disposePartView`, `disposeSlotGeometry`, `removeDraw` and the groundcover band all deleted shared names | `partView.test.ts`, `slotGeometry.test.ts`; `webgpu-boot-check.mjs` page-error fail | walk | walk 7 boot check | all |
