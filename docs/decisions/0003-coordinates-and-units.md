# 0003 — Coordinates and units

**Date:** 2026-08-22 · **Status:** accepted

- **1 world unit = 1 metre.** All gameplay, physics and world data use metres,
  seconds, kilograms. (Matches Rapier defaults and the existing sandbox.)
- **Y-up, right-handed** (Three.js convention). Sea level is `y = 0` at mean
  tide; terrain heights and water surfaces are absolute Y values.
- **Province ground plane:** X east, Z south (so map north is −Z, matching
  screen-up north on an overhead map with the usual Three.js camera).
- **World origin:** a fixed province-local origin will be pinned during Phase 2
  georeferencing of the heightmap (roughly the province's northwest corner so
  in-play X and southward Z stay positive). Until then no code may hard-code
  absolute province coordinates.
- Double-precision or origin-rebasing decisions for a ~100 km-class world are
  deferred to Phase 6 streaming work, but all APIs treat positions as
  `Vec3` metres from the province origin so a rebasing layer can be inserted.
- Source-map pixel spaces and Skyrim game units are conversion inputs only and
  never appear in gameplay code.
