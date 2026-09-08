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
depth. Strips are whitewater (blend `w = smoothstep(0.06, 0.30, slope) ·
smoothstep(0.8, 3.0, speed)`, three streak layers scrolled along `aArc` by
one uniform speed per ribbon, drawn at the full compiled width with only the
0.6 m bank margin dissolving, clear/tannin tint toward white, no
shoreline/surf/SSR terms).

## Waterfalls and steep whitewater (research `waterfalls-realtime.md` §4 + the vault audit)

One shared streak field, `render/whitewaterStreaks.ts` (GLSL + TS twins):
three layers at Bethesda's measured rates — 0.313 t/s body on a 4 m tile,
0.857 t/s sheet foam on 2.6 m, 0.075 t/s slow accent on 8 m — plus a 0.030 t/s
U drift and a 1.00→1.05→1.00 U-scale breathe over 8.33 s, always scrolled
along the piece's own arc in metres. `uStreakTex` + `#define ES_STREAK_TEX`
is the slot for the sourced FX texture; procedural value noise is the shipped
fallback. Pieces:

- **Fall body** (`WaterfallSheets.ts`): the ballistic tracer's path cut into
  vanilla-sized PIECES (families 7.5 / 29 / 44 / 58 m by drop, stacked at 2/3
  of a piece height so neighbours overlap by a third, lateral copies half a
  piece apart for wide falls; each copy has its own 0..1 `aPieceUv`
  rectangle, scroll phase and overlap cross-fade), three body layers per
  piece + two mirrored side strips pinched at the lip, crest wrap 2.5 m back
  over the lip with foam boosted 3 m past it, unlit white ×1.0 (free fall) /
  ×0.75 (bed contact), edge-on fade cos 0.26→0.09, soft depth fade 0.57 m
  (sheets) / 1.07 m (side strips) only where there is air behind.
- **Textures**: the vanilla FX kit `apps/world-studio/public/kits/
  waterfall-fx-textures/` (manifest roles) binds by slot — `sheet` =
  `sheet-main`, `ring` = `plunge-ring`, `skirt` = `mist-cloud-strip`, `mist` =
  `mist-cloud` (`WATERFALL_TEXTURE_ROLES`). The app composes the URLs from
  the manifest (`loadWaterAssets({ waterfallTextureUrls })` →
  `assets.waterfallTextures`); the shader samples the coverage from ALPHA
  (the textures are greyscale) and any missing slot keeps the procedural
  field. Textures + stack rules live inside our shader, lit by our rig —
  never mounted as meshes (0047 addendum).
- **Classification guard**: a path is a fall only with ≥ 0.5 m of air over a
  contiguous ≥ 3 m; every other cascade is a *ramp* and comes back as
  `chuteStrips` for the ES_STRIP ribbon mesh (`WaterSurface` merges them into
  the channel strips). Sheets snap to a strip's `lip`/`plunge` end within 3 m
  (`alignCascadeToStrips`), so the v2 data's strips and sheets meet exactly.
- **Plunge base** (`PlungeBase.ts`): 12–19 flat 2.9–5.7 m quads per fall on
  the pool, fanned downstream, scrolled outward at the ring's +0.375 t/s,
  0.6 m soft depth fade, one merged draw as a child of the sheet mesh. The
  field's `esPlungeFoam` disc + an eased 2.67 s expanding ring stay under it.
- **Particles are the accent**: `cascadeEmitterKit` gives a fall 1 (cloud), 2
  (≥ 20 m: + one mid-sheet) or 4 (≥ 60 m: lip + two mid + cloud) emitters.
- **Boulders** are a scatter-compiler job: `stripBoulderCandidates` (1 rock
  per 160 m² of bed, seeded by strip id) is the rule it consumes.
- Not yet built (needs the FX textures): the 4–8 static mist cards within
  12 m of the impact and the ground-mist discs the audit mined from the
  vanilla stacks. Flowing water (> 0.15 m/s) carries a travelling
along-flow undulation (`flowWaveAt` ↔ `esFlowWave`) and sparse drifting flecks
on a 6 s transport cycle.

## CPU model (the `WorldWaterQuery` authority)

| File | What it owns |
| --- | --- |
| `waterData.ts` | Decoded province rasters (W surface, SIGNED depth, flow, class, shore) + bilinear samplers; `depthAt`/`isWet` with lift; `BURIED_DEPTH_M`, `decodeDepthByte`. |
| `waterWorld.ts` | `WorldWaterQuery`: still surface, tide/season offsets, waves, shore surf, depth from real ground, interaction stream, displacement registry. |
| `waves.ts` | The wave model, CPU and GLSL in lockstep: JONSWAP band amplitudes around `WAVES.peakWavelengthM` (100 m) with per-band fetch limits and frequency-dependent spread, the travelling ↔ standing blend (`standingWaveRatio` by class), swash, shore swell, the along-flow undulation (`FLOW_WAVES`); every angular frequency snapped to 2π/`timePeriodS` (`snapOmega`). |
| `tide.ts` | Semidiurnal tide and seasonal level offsets. |
| `WaterClock.ts` | Wave-phase vs real-time transport clocks (the world clock is often paused); the phase clock folds modulo 8192 s, which the snapped frequencies make seamless. |
| `waveWeather.ts`, `spectralOcean.ts` | Wind→wave energy; the FFT open-sea field (compiled, not yet mounted). |
| `waterfallTrajectory.ts` | Ballistic sheet arcs for compiled cascade lips (contact tracing against arbitrary receivers). |

## Interaction and particles (contract-only, kept across the retirement)

`buoyancy.ts`, `rigidBody.ts`, `contactEmitter.ts`, `flowContacts.ts`,
`interactionStream.ts`, `displacementRegistry.ts`, `sheetContact.ts`,
`LocalWaterPatch.ts` + `localPatchPresentation.ts`. They read only
`WorldWaterQuery`, never the renderer.

Wave energy is JONSWAP-shaped: a 160 → 3 m band ladder around a 100 m peak,
normalised to the reviewed 0.185 m rms, with each band fetch-limited at
2 × its wavelength (a 200 m lake carries chop, never swell) and blended
toward a standing wave by class (lake 0.45, marsh 0.5, estuary 0.3). All
frequencies sit on the 2π/8192 s grid so `WaterClock.phaseS` folds without
a pop. Technique sources: [water-pro-greenheck-study.md](../../../../docs/research/rendering/water-pro-greenheck-study.md).

## Rendering (`render/`)

| File | What it owns |
| --- | --- |
| `loadWaterAssets.ts` | Fetches + decodes `province/water/` into `WaterData`, `WaterWorld` and textures (`decodeWaterRasters` is the pure, tested decode). |
| `waterMaterial.ts` | The water shader patch (terrain-cut shoreline with vertical fade, surf, whitecaps, foam, flecks, SSR, refraction, ripples) + tiers/layers, the buried/cliff/owner guards, and the `ES_STRIP` whitewater variant. Composes the study terms: the foam field sample ahead of the dissolve, the depth-range froth, rain rings, sparkle + crest scatter after the specular, the horizon blend before the aerial term, the meniscus in both variants; `ES_FOAM_TEX` swaps the fbm foam mask for the vanilla `foamtile01` (kit slot `foam`, remapped onto the fbm moments — `FOAM_TEX`). Twins: `stripAeration`, `stripAlbedo`, `stripStreakPhase`, `FLECK`. |
| `ChannelStrips.ts` | Ribbon meshes along the compiled `channels[]` (and the ramps `WaterfallSheets` hands back) — per-vertex hydraulics plus the ribbon UV (`aSideM`, `aArc`, `aScroll`, `aEdge`); `stripBoulderCandidates` for the scatter compiler. |
| `whitewaterStreaks.ts` | The shared three-layer streak field (measured rates, U drift, breathe) — GLSL + TS twins, `uStreakTex` slot. |
| `PlungeBase.ts` | 12–19 flat foam quads per fall on the receiving pool (Bethesda's `CurrentPlane` set), one merged draw. |
| `waterProbe.ts` | `createWaterProbe`: the numeric dev hook the studio exposes as `window.__STUDIO_WATER_PROBE__` for `apps/world-studio/scripts/probe-water.mjs`. |
| `WaterfallSheets.ts` | Ballistic sheet tracer + fall/ramp classification, strip alignment, the sheet mesh (body layers, side strips, crest wrap) and its unlit whitewater material; owns the `PlungeBase`. |
| `WaterSurface.tsx` | The camera-following province grid, contact bodies (swept-path stamps into ripple sim + foam field every 0.12 s), splash/plunge deposits into the field, the field's construction by tier, particle stack. |
| `WaterPipeline.tsx` | The three-pass frame (opaques→HDR RT, tone-mapped blit with underwater fog/god rays/bubbles, water+precip+overlay); steps the ripple sim and the foam field first. |
| `RippleSim.ts` (+ `rippleAdvection`, `rippleIsolation`) | Body-isolating interactive ripple patch; `addPath` stamps a swept footprint. |
| `FoamField.ts` | Persistent foam ENERGY field (512²/256² by tier, 512 m, camera-snapped): advected by the compiled flow, fed by crest fold, windward faces, the surf band and swept injections, decaying 0.5 s at sea → 3 s sheltered; `FOAM_FIELD_GLSL` samples it in the fragment ahead of the unchanged dissolve. |
| `shoreFroth.ts`, `rainRings.ts`, `sparkleSss.ts`, `horizonBlend.ts`, `meniscus.ts` | Small GLSL + TS-twin terms from the Greenheck study: the 1.8 m depth-range froth band, analytic cell-hashed rain rings, the sun-glint window and backlit crest scatter, the far-sea → sky convergence, the waterline meniscus. |
| `WaterEffects.ts`, `WaterCrowns.ts`, `particleFoam.ts`, `waterParticle*.ts`, `fallingSpray.ts`, `WaterCascadeSources.ts` | Spray, foam, crowns, cascade emission. |
| `UnderwaterBubbles.ts` + `UnderwaterBubblePass.ts` | Entrained bubbles and their isolated HDR pass. |
| `groundWetness.ts`, `caustics.ts`, `causticReceiver.ts`, `localWaterCaustics.ts` | Terrain-side wet band and bed caustics (same signed-depth decode via `uWetDepthMin/Span`). |
| `types.ts` | `WaterAssets`, `WaterRuntime` (the app injects clocks, sky, weather, debug) and `WaterDebugState`. |

Apps mount `WaterSurfaceMesh` + `WaterPipeline` through one `WaterRuntime`
object; nothing here imports app code.
