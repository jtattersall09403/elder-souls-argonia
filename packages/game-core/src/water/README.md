# Water runtime

The field water model (decision 0025) is the one runtime; the
terrain-constrained overhaul was retired by
[decision 0046](../../../../docs/decisions/0046-water-overhaul-retired.md) and
the model was made physical on the real terrain by
[decision 0047](../../../../docs/decisions/0047-water-one-physical-model.md).

## The 0047 contract in one paragraph

`water-surface.png` B is **signed depth** `W − ground` (`depth = B/255 ·
depthSpanM + depthMinM`; v1 data has no `depthMinM/SpanM` and decodes as
before, 0 … 25.5 m). **Wet ⇔ signedDepth + lift > 0**, where lift = tide ·
tideResponse + season · seasonResponse — identical on the CPU
(`WaterData.depthAt`, `WaterWorld.sample`) and in the vertex stage
(`esVDepth`). Texels ≤ `BURIED_DEPTH_M` (−2.5) are buried and never weight the
level-surface interpolation; "table" texels (−2 … 0, dry now but floodable)
do, so a season lift floods them physically. The shader no longer cuts the
shoreline from the raster: the field discards only as a buried guard (signed
depth + lift under −0.35 m, relaxed with distance), where the still surface is
steeper than 1:1 (a cliff is a sheet, never a field), and under the owner mask;
the visible edge is the plane meeting the terrain under the hardware depth
test, softened by a **vertical** thickness fade from the *unrefracted* scene
depth. Strips are whitewater (aeration from slope × speed, streaks scrolled
along `aArc` by one uniform speed per ribbon, clear/tannin tint toward white,
no shoreline/surf/SSR terms). Flowing water (> 0.15 m/s) carries a travelling
along-flow undulation (`flowWaveAt` ↔ `esFlowWave`) and sparse drifting flecks
on a 6 s transport cycle.

## CPU model (the `WorldWaterQuery` authority)

| File | What it owns |
| --- | --- |
| `waterData.ts` | Decoded province rasters (W surface, SIGNED depth, flow, class, shore) + bilinear samplers; `depthAt`/`isWet` with lift; `BURIED_DEPTH_M`, `decodeDepthByte`. |
| `waterWorld.ts` | `WorldWaterQuery`: still surface, tide/season offsets, waves, shore surf, depth from real ground, interaction stream, displacement registry. |
| `waves.ts` | Gerstner bands, swash, shore swell and the along-flow undulation (`FLOW_WAVES`) — CPU and the GLSL the shader compiles, in lockstep. |
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
| `loadWaterAssets.ts` | Fetches + decodes `province/water/` into `WaterData`, `WaterWorld` and textures (`decodeWaterRasters` is the pure, tested decode). |
| `waterMaterial.ts` | The water shader patch (terrain-cut shoreline with vertical fade, surf, whitecaps, foam, flecks, SSR, refraction, ripples) + tiers/layers, the buried/cliff/owner guards, and the `ES_STRIP` whitewater variant. Twins: `stripAeration`, `stripAlbedo`, `stripStreakPhase`, `FLECK`. |
| `ChannelStrips.ts` | Ribbon meshes along the compiled `channels[]` — per-vertex hydraulics plus the ribbon UV (`aSideM`, `aArc`, `aScroll`). |
| `waterProbe.ts` | `createWaterProbe`: the numeric dev hook the studio exposes as `window.__STUDIO_WATER_PROBE__` for `apps/world-studio/scripts/probe-water.mjs`. |
| `WaterfallSheets.ts` | Ballistic/terrain-following sheet meshes at the compiled `cascades[]` lips + their scrolled-streak material. |
| `WaterSurface.tsx` | The camera-following province grid, contact bodies, ripple stamping, particle stack. |
| `WaterPipeline.tsx` | The three-pass frame (opaques→HDR RT, tone-mapped blit with underwater fog/god rays/bubbles, water+precip+overlay). |
| `RippleSim.ts` (+ `rippleAdvection`, `rippleIsolation`) | Body-isolating interactive ripple patch. |
| `WaterEffects.ts`, `WaterCrowns.ts`, `particleFoam.ts`, `waterParticle*.ts`, `fallingSpray.ts`, `WaterCascadeSources.ts` | Spray, foam, crowns, cascade emission. |
| `UnderwaterBubbles.ts` + `UnderwaterBubblePass.ts` | Entrained bubbles and their isolated HDR pass. |
| `groundWetness.ts`, `caustics.ts`, `causticReceiver.ts`, `localWaterCaustics.ts` | Terrain-side wet band and bed caustics (same signed-depth decode via `uWetDepthMin/Span`). |
| `types.ts` | `WaterAssets`, `WaterRuntime` (the app injects clocks, sky, weather, debug) and `WaterDebugState`. |

Apps mount `WaterSurfaceMesh` + `WaterPipeline` through one `WaterRuntime`
object; nothing here imports app code.
