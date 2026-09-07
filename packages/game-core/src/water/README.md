# Water runtime

The field water model (decision 0025) is the one runtime; the
terrain-constrained overhaul was retired by
[decision 0046](../../../../docs/decisions/0046-water-overhaul-retired.md).

## CPU model (the `WorldWaterQuery` authority)

| File | What it owns |
| --- | --- |
| `waterData.ts` | Decoded province rasters (W surface, depth proxy, flow, class, shore) + bilinear samplers. |
| `waterWorld.ts` | `WorldWaterQuery`: still surface, tide/season offsets, waves, shore surf, depth from real ground, interaction stream, displacement registry. |
| `waves.ts` | Gerstner bands, swash and shore swell — CPU and the GLSL the shader compiles, in lockstep. |
| `tide.ts` | Semidiurnal tide and seasonal level offsets. |
| `WaterClock.ts` | Wave-phase vs real-time transport clocks (the world clock is often paused). |
| `waveWeather.ts`, `spectralOcean.ts` | Wind→wave energy; the FFT open-sea field (compiled, not yet mounted). |
| `waterfallTrajectory.ts` | Ballistic sheet arcs for compiled cascade lips (contact tracing against arbitrary receivers). |

## Interaction and particles (contract-only, kept across the retirement)

`buoyancy.ts`, `rigidBody.ts`, `contactEmitter.ts`, `flowContacts.ts`,
`interactionStream.ts`, `displacementRegistry.ts`, `sheetContact.ts`,
`LocalWaterPatch.ts` + `localPatchPresentation.ts`. They read only
`WorldWaterQuery`, never the renderer.

## Rendering (`render/`)

| File | What it owns |
| --- | --- |
| `loadWaterAssets.ts` | Fetches + decodes `province/water/` into `WaterData`, `WaterWorld` and textures. |
| `waterMaterial.ts` | The water shader patch (depth fade, surf, whitecaps, foam, SSR, refraction, ripples) + tiers/layers, the compiled-owner discard, and the `ES_STRIP` attribute-driven variant. |
| `ChannelStrips.ts` | Ribbon meshes along the compiled steep-reach `channels[]` — same shader, per-vertex hydraulics instead of a raster fetch. |
| `WaterfallSheets.ts` | Ballistic/terrain-following sheet meshes at the compiled `cascades[]` lips + their scrolled-streak material. |
| `WaterSurface.tsx` | The camera-following province grid, contact bodies, ripple stamping, particle stack. |
| `WaterPipeline.tsx` | The three-pass frame (opaques→HDR RT, tone-mapped blit with underwater fog/god rays/bubbles, water+precip+overlay). |
| `RippleSim.ts` (+ `rippleAdvection`, `rippleIsolation`) | Body-isolating interactive ripple patch. |
| `WaterEffects.ts`, `WaterCrowns.ts`, `particleFoam.ts`, `waterParticle*.ts`, `fallingSpray.ts`, `WaterCascadeSources.ts` | Spray, foam, crowns, cascade emission. |
| `UnderwaterBubbles.ts` + `UnderwaterBubblePass.ts` | Entrained bubbles and their isolated HDR pass. |
| `groundWetness.ts`, `caustics.ts`, `causticReceiver.ts`, `localWaterCaustics.ts` | Terrain-side wet band and bed caustics. |
| `types.ts` | `WaterAssets`, `WaterRuntime` (the app injects clocks, sky, weather, debug) and `WaterDebugState`. |

Apps mount `WaterSurfaceMesh` + `WaterPipeline` through one `WaterRuntime`
object; nothing here imports app code.
