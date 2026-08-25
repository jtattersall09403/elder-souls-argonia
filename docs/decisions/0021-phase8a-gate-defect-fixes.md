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

## Round 2 (owner, same day)

- **Dome Mie is now PINNED at the addon default (0.005)** — even the capped
  humidity mapping still read as a huge white blur around the sun. Turbidity
  capped ≈4.5; sunrise/sunset warmed instead via a wider sun-colour band,
  deeper horizon red and altitude-varying Rayleigh ("sunrise light too white").
- **Exposure key 3.4** (day read too bright/harsh) and **ceiling 30** with a
  raised night floor + a real zenith→horizon **airglow gradient** in the night
  dome, brighter stars ×3.7 — a moonless night is dim-but-readable, never
  pitch black.
- **Sunset flashes (18:25–18:34)**: the PMREM IBL re-bake threshold tightens
  ~6× while the sun is within ±0.25 of the horizon — coarse ambient steps
  against a continuously-adapting exposure read as bright flashes.
- **Moon "light stacking"**: the additive discs are dimmed ×0.2 against the
  day dome (`uDayDim`) — full disc luminance only as the day dome fades.
- **Sky look-up is a shared behaviour** (owner): `FOLLOW_CAMERA.minPitch`
  −1.15 in game-core AND the sandbox's inline CombatScene copy. Stable form:
  the camera BODY never drops below `minPosPitch` (it dove underground and
  fought the terrain clamp — the "haywire camera"); extra look-up raises the
  LOOK target instead. Blow-up guards: non-finite player positions are
  rejected by the camera and reseat the body; >40 m single-frame jumps hard-
  reset the camera. Character cascades 3→2 (perf), spawn drop 0.5→0.15 m.
- Owner sessions ran against a live-edited dev server (HMR) — future agents:
  ask for a dev-server restart + hard refresh before trusting a defect report
  taken during editing.

## Round 3 (owner, same day)

- **Physics stepping is now manual and bounded.** r3f-rapier's fixed-timestep
  loop runs an *uncapped* catch-up (`while (accumulator >= timeStep)`, dt
  clamped at 0.5 s): on a machine that stalls during load, one 500 ms frame
  bursts 30 steps, stalling the next frame — a spiral that snapped the
  ecctrl hover-spring (the "bobbing") and fed the safety-net teleporter
  garbage (the 5-second skyfall loop). The sandbox at 60 fps never grows the
  accumulator, which is why combat never showed it. Studio: `<Physics
  paused>` always; `CharacterDriver` steps ≤3×1/60 s per frame via
  `rapier.step()`, excess time DROPPED (brief slow-motion under load, never
  instability). Port this pattern to the game shell later.
- **Exposure is an authored log-interpolated curve over sun altitude**
  (research doc §8) — the illuminance-derived form diverged from the dome's
  real output right after sunrise (the "most over-exposed ever" spike, and
  its mirror before sunset). Day ~¾ stop softer again; night =
  `14/(1+11·moonlight)`, so moonless ≈ dim-readable, full moon ~2 stops up.
- **Twilight glow layer** in the dome (fixes the colour-static night dome
  "pinning" the pre-dawn sky): tropical palette (molten orange core at the
  sun's azimuth → coral/magenta spread → violet-indigo wash), luminance
  exposure-anchored CPU-side so it cannot flash. Palette + sources: research
  doc §8. Night gradient darkened ~×0.55 (round-2 night read too light).
- **Moons display-referred** (physical luminance clips to flat white under
  night exposure floors): soft terminator, limb darkening, procedural maria,
  rise/set fade (the horizon pop was part of the pre-dawn flashing). Note:
  moons near-full at midnight is CORRECT phase geometry — crescents are
  daytime companions.
- **Background star field**: ~1 100 seeded faint stars sharing the
  constellation buffer (so the whole sky wheels together).
- **Golden-hour haze**: sun-scatter gain of the aerial term ×~3 at 0–4° sun
  altitude, fading by 16° — the humidity raster localises the golden glow to
  the humid lowlands. (The r/threejs custom-fog approach the owner linked is
  architecturally what `aerial.ts` already does.)
