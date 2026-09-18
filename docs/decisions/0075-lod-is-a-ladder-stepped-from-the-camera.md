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

## Consequences

- One mechanism, three exported functions, one attribute layout; the
  ground ring and the scatter share the shader. Phase 14 locks the ring
  distances as a table; nothing else moves.
- Frame time: the collapsed extra copies cost vertex work only (a zero-area
  triangle raises no fragment); the identical-level dedupe removes the
  double-drawn dithered pairs the palms paid before.
- A future kit build ships fewer bytes for free (3); the underwater kit's
  rocks, which carry decimated levels against the 0071 rule, are corrected
  at the same rebuild (backlog row).
