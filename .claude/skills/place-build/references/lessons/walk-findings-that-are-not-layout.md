# Lessons: Walk findings that are not layout

Part of the lessons store; the row format and the file index are in [README.md](README.md).

| Id | Rule | Defect and cause | Enforced by | Shot | Source | Types |
|---|---|---|---|---|---|---|
| L45 | Route camera, flicker and flash findings to the runtime owner, not to the layout | camera swing when pulled in by a wall (look target not moved by the obstruction, check-in 3 §1); decal overlays z-fighting on 203 materials (§3); buildings flashing out for a frame (check-in 2 ruling 2) | runtime fixes 259b200a, 5d854e98 | walk | owner walk 2, 3 | all |
| new | Before chasing "white shards" or pale triangular facets in shallow water as a placement, list the bundle placements within 5 m of the spot and sample `wb.py <scene> ground --at X Z` on a 1 m grid there: no piece plus terrain (`chunks`) within ±0.4 m of `waterLevelM` over a flat beach is the water renderer's shore band (FoamField surf foam, shallow tint over near-coplanar terrain), routed to the water lane with the coordinates and frames; a place never moves a piece or pads ground for it | claywater-station audit10-r2 boat shot: white polygon shards at ≈(329-331, 3007-3009); no placement there (canoe 331.0/3006.5 is above them), lod1 terrain 34.78-35.41 m against water 35.24 m, and the fine water mask edge cuts the beach (water reported at 330/3007, none at 329.5/3007.5 with terrain below the water); same class as riverwalk's "hard triangular fog facets" | prose only: water lane (shore-band fix) | walk | audit10 c5 P7 | all |
| L46 | Check that each placed piece is visible from the ground at its coordinates | the boardwalk was invisible at 4.273 / 5.739 (check-in 2 ruling 7) | `test_proving_ground` visibility row | walk | owner walk 2 | all |
