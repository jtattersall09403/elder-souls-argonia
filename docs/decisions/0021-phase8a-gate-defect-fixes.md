# 0021 — Phase 8a owner-gate defects: root causes and fixes

**Date**: 2026-08-25 · **Status**: accepted (amends 0020)

The first owner walk of the 8a light stack failed hard **in character view
only** (black moon discs, moonless night ground lit like day, washed daytime
terrain, huge white glare where the sun is, dead load performance, character
"jerking" on settle) while every fly-view probe passed. Root causes, worst
first — all are classes of bug, not one-offs:

1. **CSM cascade lights leaked on suspense remounts.** `CSM.dispose()` does
   **not** detach the cascade lights (`remove()` does — read the addon source,
   not the name). Worse, `new CSM(...)` mutates the scene from inside a React
   `useMemo`, and React **discards suspended renders without running any
   cleanup**: in character mode `<Physics>`/collider loads suspended with no
   boundary of their own, so the whole canvas tree (WorldSky included)
   remounted ~8×, leaking **24 shadow-casting intensity-3 white lights**
   (72 lx — night terrain lit like day; cascade slots mis-assigned — washed
   day terrain; 27 shadow passes/frame — the performance collapse and, via
   frame stalls, the capsule's hover-spring "jerking"). Fixes: `remove()` +
   `dispose()` in cleanup; cascade lights tagged `csm-cascade` and orphans
   swept on commit; own `<Suspense>` around the physics subtree; probe-sky
   now asserts a **light census** (3 cascades + moon + hemi) and runs
   **character-view scenarios** — fly-only probes are what let this ship.
2. **Shadows were silently off in walk mode**: r3f's Canvas default
   (`shadows: false`) re-applies over `gl.shadowMap.enabled = true` set in an
   effect. Set `shadows="soft"` on the Canvas, not on the renderer.
3. **Moons drawn off-scale**: disc luminance ~5 in a scene where the day sky
   is ~16 000 → tonemapped to black discs. Moons are now physical
   (~2 600/3 200 nits) and **additive**, so the dark limb melts into daylight
   instead of punching a black hole, and full moons glow at night. (Their 10°/
   4° apparent size is canon-authored, 0020 — not a bug.)
4. **Circumsolar white-out**: humidity-driven `mieCoefficient` ran to 0.032
   (~6× the Sky addon default) — the forward lobe turned half the sky white.
   Now capped ≈0.012 and turbidity ≈7.5; the humid-lowland glow is the aerial
   term's job, not the dome's.
5. **Exposure**: eye adaptation now runs in **world time** (2.5 world-min,
   floored at 0.12 real-s) so fast clock rates don't white out sunrise;
   twilight anchors corrected (sky ≈400 lx at sunrise, not 2 000); hemisphere
   ambient cut 9 000 → 1 400 lx — it is a ground-bounce **supplement**, the
   PMREM IBL is the one sky-ambient authority (double-counting flattened all
   shading).
6. **Below-horizon dome garbage**: the `isnan()` guard is optimised away by
   fast-math drivers (fine in SwiftShader probes, broken on real GPUs). The
   dome's lower hemisphere is now **replaced deterministically** with a
   CPU-computed ground-bounce colour — which also gives the IBL a sane lower
   half. Never gate correctness on `isnan()` in shaders.
7. **Studio ergonomics**: `FollowCamera` takes per-app config overrides — the
   studio widens `minPitch` to look up at the sky; the sandbox's combat clamp
   is untouched. Physics unpauses only after colliders **and** smooth frames
   (`RenderWarmup`), and new CSM programs compile via `compileAsync`.

**Meta-lesson** (for every future visual system): probe the mode the owner
actually plays. The fly-view probes were green throughout because walk mode's
defects lived entirely in its own canvas wiring.
