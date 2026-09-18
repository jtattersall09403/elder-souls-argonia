# 0075 — LOD is a ladder stepped from the camera; a copy's edge closes only against a copy that exists

**Date:** 2026-09-18 · **Phase:** 16f round 5 · **Status:** accepted (owner
steers in session: "just have one system that works"; instant swaps are
fine; "how does Skyrim do it? copy their approach"; audit every scatter
type's levels; bring the water reflections in a little).

The owner's fifth walk found trees, palms, large plants and rocks fading
OUT as they were approached, vanishing at a certain range and dissolving
back in close up, palms gone for good, crowns drawn before trunks, rocks
half-drawn — after four rounds of fixes to the same mechanism. The evidence
is in the [16f ledger §18](../research/phase16/16f-ledger.md).

1. **The rule is Skyrim's: a hard step between levels by camera distance,
   a fade only where something vanishes.** Skyrim holds full models inside
   the loaded cell grid, swaps to LOD meshes and tree cards beyond it by
   fixed distance bands. Small objects alpha-fade out at the far end by
   size. There is no dissolve between levels. Ours is the same: a species has
   a LADDER of camera-distance intervals tiling [0, draw distance), one kit
   level each (`lodLadder`); the shader keeps the level whose interval holds
   the live camera distance (`step`). The only dither is the vanish at
   the end of a ladder that ends inside the loaded world (a rock at 70 m, a
   fern at 100 m). Land trees never take that edge. The crossfade of rounds
   2–4 is gone from the scatter; the ground ring keeps its tile-band dither
   because every tier copy exists there at once, so its partition is exact by
   construction. The owner reports it right.
2. **A copy's edge closes only against a copy that was emitted.** The
   rebuild emits an instance into every rung the camera could reach before
   the next rebuild (`lodCopies`, rung ± `LOD_MARGIN_M` = 24 m); a copy's
   inner edge is its rung's `lo` only if the rung below was emitted, its
   outer edge `hi` only if the rung above was, else OPEN. So the emitted
   copies always tile the whole distance line and one alone is kept at any
   camera distance, whatever the rebuild timing: outrun it and the level is
   wrong for a few metres, never absent. Rounds 2–4 had three defects in
   this one place, which is why each fix moved the symptom: (a) the copies
   were chosen from the CHARACTER's position and faded from the CAMERA's,
   5.8 m apart, against 10 m bands and a 21 m reach; (b) rungs resolving to
   the same kit level were MERGED into one band that kept the ring edge, so
   every rock (one level, three rungs) dissolved at its inner ring with
   nothing behind it — measured 6–94 % of pixels over 10 m. It dissolved again at
   33–25 m with the camera ahead of the character; (c) correctness depended
   on a rebuild landing within 16 m. The gate now walks real ladders (rock,
   palm, jungle tree, carded shrub, kelp) with the rebuild cadence, the
   camera 5.8 m ahead of the character and behind it, a sprint that overruns
   the throttle and a rebuild that never lands. It requires one copy per pixel every frame and
   holds the round-4 rule red.
3. **An identical level is not a level.** The builder's decimation floors at
   ~300 triangles a part, so every palm (60–256 triangles a part) and about
   half the land kit (86 of 159 assets, all 16 aquatic plants, 20 of 25
   shrubs, 24 of 49 trees) shipped two or three byte-identical mesh levels
   and stepped the same geometry against itself at two rings. `floraKit.ts`
   drops a level that is not smaller than the one before; `build_kit.py`
   no longer exports one. The shipped kit is unchanged this round (the
   runtime rule covers it); the backlog row records the bytes.
4. **Every scatter type's chain is audited from the shipped kit**
   (`pipeline/kit_lod_audit.py`, both kits): rocks are correct by design
   (one level, no card, 41 of 41); every land asset outside rocks carries a
   textured card (118 of 118); no level lacks a part its base has (so the
   "crown before trunk" was the emission, not the kit). The underwater kit
   carries no cards by design (its ladders end at 120 m under water that
   hides anything past a few dozen metres) and is exempt by name.
5. **Screen-space water reflections stop at 260 m** (fade from 160 m; they
   were 260–420 m, before that 1.2 km). The march is per water pixel inside
   the range, so the range is frame time.

6. **An alpha-tested part is never drawn decimated; the ladder for a plant
   is "full model, then card".** The owner's second walk of the round (the
   same day) found leaves, twigs and trunk strips vanishing at the middle
   distance and returning close up. Every plant part in the kit is dozens
   to hundreds of small separate islands of triangles (median 2–16 each:
   leaf cards, twig cards, bark strips); collapse decimation shreds them
   into slivers with scrambled UVs, so the builder's 0.35 and 0.12 levels
   were largely empty. `floraKit.ts` gives an alpha-tested part its base
   geometry at every mesh level (the identical-level rule then folds the
   chain); `build_kit.py` exports no decimated level for an alpha-tested
   asset. Only an opaque part (none in the land kit) still steps down
   through decimation. The cost is triangles inside the card ring (100–260 m
   by height); the owner's frame numbers decide whether the card ring
   moves nearer.
7. **A rock is seated by its own underside, posed as it will ship, and cut
   if it still hangs.** The round-4 burial rule sampled a flat base plane on
   the footprint ellipse and its census passed 18,517 of 18,530 rocks;
   measured by their real vertices (`rock_mesh_census.py`) 3,282 (18 %)
   stood off the ground by more than 0.3 m somewhere — the owner's pile at
   1.59 km E / 2.30 km S by 1.28 m with the plane 1.35 m "buried".
   `rock_bottom_profiles.py` mines each rock's underside (the lowest 70 % of
   its height, one vertex per 0.25 m voxel, both kits) into
   `world/sources/placement/rock-bottom-profiles.json`; `scatter.burial`
   poses that set exactly as the renderer poses the mesh (yaw and tilts
   already rounded to the byte the bundle carries, `shipped_pose`) and finds
   the lowest vertex over each 0.4 m ground cell; every one must be at or
   under the ground. The composed sink is the larger of the mined base sink
   and that demand (no longer their sum); the cap is 0.8 of the scaled
   height or the mined deep-quartile sink; a seated top must keep a tenth
   of the height above the lowest ground under it; the encoder rounds sinks
   upward; and `compile_scatter.cut_hanging_rocks` measures each rock once
   more at its encoded pose and drops what still gaps (the encoder's scale
   rounding, 20 rocks). The census measures the same profile the compiler
   uses for seating, so the two agree by construction: **0 of 13,871 gap**. Four
   wrong turns are recorded so nobody repeats them: bearing bins from the
   pivot (a leaning slab "demands" 10 m on flat ground), down-facing normals
   (miss the pile), a base band at 30 % (misses it too) and a profile taken
   before posing (a tilted slab's face hangs 2.9 m over falling ground).
   **The cost is density:** 18,530 → 13,871 rocks, mostly cliff shells that
   cannot be seated on the slopes they were offered (`rockcliff02` 1,248 →
   260, `rockcliff07` 1,072 → 61, `rockcliff03` 1,046 → 381; `rockcliff01`
   and the mossy shell keep ~1,050 and ~1,250). The owner's rule stands: a
   rock that cannot sit is not placed. If the mountainsides read bare, the
   next lever is the cliff palette's slope band, not the seating rule.

## Consequences

- The census that gates rocks reads the mesh (`rock_mesh_census.py`). The
  plane census stays for the tilt, scale and open-back checks.
- One mechanism, three exported functions, one attribute layout; the
  ground ring and the scatter share the shader. Phase 14 locks the ring
  distances as a table; nothing else moves.
- Frame time: the collapsed extra copies cost vertex work only (a zero-area
  triangle raises no fragment); the identical-level dedupe removes the
  double-drawn dithered pairs the palms paid before.
- A future kit build ships fewer bytes for free (3); the underwater kit's
  rocks, which carry decimated levels against the 0071 rule, are corrected
  at the same rebuild (backlog row).
