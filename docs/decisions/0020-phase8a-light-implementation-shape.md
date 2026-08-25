# 0020 — Phase 8a implementation shape: engine-lit terrain, lux scale, authored sky constants

**Date**: 2026-08-25 · **Status**: accepted (implements decision 0016 / module 55 Tier 1)

## Decisions

1. **The terrain splat material rides on `MeshStandardMaterial` via
   `onBeforeCompile`**, replacing the bespoke `ShaderMaterial` with hand-rolled
   lambert lighting. The splat/triplanar/gradient-normal logic is unchanged
   (injected into `map_fragment` / `normal_fragment_begin`); lighting, CSM
   shadow reception, sky IBL and tone mapping now come from three.js's own
   pipeline. Rationale: reuse the engine's known-good lit path rather than
   re-implement shadows/IBL/exposure inside a custom shader; every future
   asset is a standard lit material, so terrain must speak the same light.
   Patch order is CSM hook → splat patch → aerial patch, chained (CSM's
   `setupMaterial` otherwise overwrites `onBeforeCompile` — every *other* lit
   material in the scene is auto-patched by a traversal in `WorldSky`, since
   unpatched materials would be lit once per cascade light).
2. **One lux scale end-to-end.** Lights use physical illuminances (research
   doc §4); the Preetham dome outputs relative HDR, so the sky shader is
   patched with a single luminance-scale uniform (`uSkyLum ≈ 16 000`) that
   lifts it onto the same scale — and the PMREM environment bake inherits it,
   keeping sun:sky ambient ratios physical. Exposure is a deterministic
   function of sun altitude/moon state (no GPU readback), eased at ~2.5 s for
   eye adaptation, snapped when the clock is paused/scrubbed so fixed-instant
   probes reproduce exactly; night exposure is floored (max 8) so moonless
   nights stay readable instead of physically black.
3. **Authored sky constants** (all retunable at the owner gate): latitude
   −10°, axial tilt 23.5° (→ day 12 h ± ~35 min, short twilights, Southron
   pole 10° up); Masser 10° / Secunda 4° apparent diameter, travelling
   together (canon: the moons cross the sky as a pair) with Secunda trailing
   7°; 4E 201 Morning Star 1 = new moon; weekday anchor: 17 Last Seed 4E 201
   = Sundas (Skyrim's opening date). One latitude override exists as a studio
   debug URL param (`lat`), the constant lives in `packages/world-time`.
4. **Tier-1 simplifications** (upgraded in 8c/13): ground mist is extra Mie
   density in a shallow (16 m) layer weighted by the mist raster and a
   dawn/dusk × dry-season curve — not yet the three distinct regimes; canopy
   darkening multiplies terrain albedo by the canopy raster (a *place*
   property) rather than occluding light; moonlight casts no shadows; the sky
   dome's built-in cloud layer is disabled (clouds are 8c weather).

## Hard-won pitfall (do not rediscover)

The Preetham `Sky` addon emits **negative/NaN/Infinite** values below the
horizon, and even sanitized finite values can exceed the **half-float ceiling
(65504)** once lifted onto the lux scale — the PMREM environment bake renders
into a HalfFloat target, so one overflowing texel becomes Infinity there, the
convolution spreads it across every mip, and **every lit material in the scene
renders black** (NaN swallows even emissive; unlit materials are unaffected,
which is the diagnostic signature). The sky patch therefore clamps twice:
`clamp(raw, 0, 50)` before the luminance scale and `min(scaled, 60000)` after.
Diagnosed empirically via scene-material bisection (`scene.environment = null`
restored all lighting).

## Consequences

- The old fixed hemisphere+directional rigs and both hand-tuned `<fog>` tags
  are gone from the studio; scene fog stays off everywhere (the aerial term is
  the one inscatter authority, module 55 §97).
- Ground materials will read differently than under Phase 6's flat light —
  expected and intended; 6b terrain feel is re-reviewed after 8b water lands
  (owner note in PROGRESS), and all future material approvals happen under
  named region/time presets.
- `climate-air.png` (humidity/mist/canopy, compiled by `worldgen.compile_hydrology`)
  is the data bridge from module 50's climate fields into the light stack.
