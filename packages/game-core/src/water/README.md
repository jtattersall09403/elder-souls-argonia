# Water runtime

The field water model (decision 0025) is the one runtime; the
terrain-constrained overhaul was retired by
[decision 0046](../../../../docs/decisions/0046-water-overhaul-retired.md) and
the model was made physical on the real terrain by
[decision 0047](../../../../docs/decisions/0047-water-one-physical-model.md).

## Phase 16c (decision 0063): schema 3, the line, the sea

- **The compiled level is the high-water line.** `tide.ts` offsets are never
  positive: `seasonOffset(s) = −amp·(1 − s)/2` (s = 1 the wet season = the
  line, s = −1 the dry trough) and `tideOffset` falls from 0 to −2·amplitude
  at springs. `water-shore.png` G is the per-texel DRAW-DOWN response.
- **The sea's energy is the wind's and the fetch's** (`waves.ts` `SEA`,
  `seaRmsHeightM`): the band table is unit-rms, scaled per vertex by the
  JONSWAP fetch-limited height (PM-capped) for the weather wind (never under
  `SEA.swellFloorWindMS`, the owner's calm-sea knob) and the compiled
  directional fetch (`water-flow.png` B). Whitecap density, still-water
  ripple drift and the whitecap pattern's drift follow the wind too.
- **The field's three guards are coverage terms** (`waterMaterial.ts`
  `esGuard`): buried, cliff (the raster's own gradient) and owner dissolve;
  one discard where all are gone. The raster clamps to its edge beyond the
  province (no hard sea plane). Horizon blend 4–12 km, 60 % max; walk-mode
  grid 12 km.
- **Entities.** `water-id.png` labels every wet texel with its graph body or
  reach (`meta.entities[]`); `WaterSample.waterBodyId` is that id.
- **Strips** sit at the notch level (`compile_water.strip_levels`): the
  ribbon touches the parabolic bed at its wetted edges.
- **Bundles of another schema are refused** at load (`assertWaterSchema`).
- **Round 2 (2026-09-14).** Sea classes travel: `STANDING_BY_CLASS` estuary
  0.3 → 0 (a standing share pulses the whole sea's whitecap fraction in
  unison; lake/marsh keep theirs). Shore surf: ONE energy knob
  `surfEnergyScale(wind, fetch)` / `esSurfEnergy` (the sea's rms over
  0.22 m, clamped 0.6–3.5) replaces `surfWindScale`; an along-shore phase
  `alongShorePhase` / `esAlongPhase` (75 m, 0.9 rad, drifting) makes crests
  arrive obliquely; the shore swell's profile is Stokes-like
  (`shoreSwellProfile`) and the swash skew grows with the energy
  (`swashSkew`). `vEsSurf` is vec4 (fetch, shoreDir, energy);
  `esSurfFoam` keeps a 4-arg overload for the foam field. Ground band
  (`groundWetness.ts`): not-buried level weighting in `esWetSampleSurface`
  (`uWetBuried`), the compiled band fades 350–1200 m from the camera, its
  lift reads `uWetWindMS` (wire it from the wind speed). Underwater absorb
  floor (0.045, 0.028, 0.022): turbidity 0 sees ~20 m, 0.5 ~3 m.

## 16f round 3 (decision 0072): samplers, the underwater target, SSR

- **The water material is at the GPU's 16-sampler limit.** Nine explicit
  samplers (`uSurfTex`, `uSurfShore`, `uFlowTex`, `uKlassTex`, `uFoamTex`,
  `uSceneColor`, `uSceneDepth`, `uRipple`, `uOwnerTex`) plus the environment
  map and the shadow cascades. **A new per-texel field goes in a spare
  channel, never a new sampler**: the apron tile rides the surface texture's
  spare rows (16d) and the 16f colour constituents ride alpha — algae in
  `shoreTex.a`, dark in `klassTex.a`, written at load by
  `loadWaterAssets.packChannel` into the DataTexture bytes (the PNGs stay
  RGB; a PNG's own alpha is never data because the canvas decode
  premultiplies it).
- **Under water the scene target ping-pongs** (`WaterPipeline.tsx`): the
  underside samples the previous frame's target while pass 1 draws into the
  other, so the surface never reads the framebuffer it is being drawn into.
  The second target is made on first submersion.
- **SSR fades 160–260 m** (`SSR_FADE_START_M/END_M`, owner 16f round 5); beyond that the sky
  reflection from the environment map is the same pixel.

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

## Waterfalls (decision 0064: the vanilla kit, stacked Bethesda's way, shaded by us)

A fall is the vanilla Skyrim FX kit's own meshes — `apps/world-studio/public/
kits/waterfall-fx-v1.glb` (26 pieces, geometry + UVs) with its textures as
PNGs in `kits/waterfall-fx-textures/` — placed the way Skyrim.esm places them
and drawn by our shader. Never a procedural ribbon.

- **Spine** (`render/WaterfallSheets.ts`): the ballistic tracer from the lip
  at `lipSpeedMS`, bed-hugging where the arc meets rock, ramp-vs-fall
  classification (≥ 0.5 m of air over a contiguous ≥ 3 m), strip alignment
  at the lip/plunge ends, the brink measured across the lip. Ramps come back
  as `chuteStrips` for the ES_STRIP ribbon. It draws nothing.
- **Kit** (`render/WaterfallKit.ts`): parses the GLB by `assetId` /
  `pynNodeName` extras into pieces and shapes, and holds the ROLE table —
  per shape: texture id, the UV-scroll rates the export dropped (audit §4),
  second layer, breathe, emissive, alpha, soft depth, upness. Editor helpers
  (`EditorMarker`, `boundPush`, `CurrentPlane*`) are never drawn.
- **Stack** (`render/WaterfallKitStack.ts`, pure, tested): body family by
  width (`bodytall` / `bodytall02`; thin sheets under 4 m) uniformly scaled so
  the piece's top width is the water's width at the lip (`cascade.widthM`,
  bankfull), inside Bethesda's 0.35–2.28; pieces stacked at ⅔ height down the
  path, the last lifted to the plunge, each tilted in the fall's plane so its
  authored foot bulge lands on the chord of its span (the lean with the arc);
  lateral copies half a piece apart; the crest line with its scrolling end
  1 m past the lip; the skirt 2.5 m upstream of the impact; the ring on the
  pool; 4–8 mist cards within 12 m; 10–40 ground-mist discs over the bowl.
- **Material** (`render/WaterfallKitMaterial.ts`): one ShaderMaterial per
  shape role, one InstancedMesh each (≈ 15 draws for all 18 falls), shared
  frame uniforms. Alpha blend, no depth write, double-sided, edge-on fade
  cos 0.26 → 0.09, per-layer soft depth, pool-level fade, nothing under
  water, lit by the shared falls irradiance under the CSM shadow; the bodies'
  inner shell is the one lit surface (albedo + scrolling normal highlight).
- **Mist** (`render/WaterfallMistVolume.ts` + research
  `waterfall-mist-and-spray.md`): a ray-marched local volume per fall — a cone
  fanning down the fall plus a dome over the pool, 20 jittered steps clamped
  to the scene depth, noise drifting up and downstream, HG forward scatter,
  within 150 m. A per-fall local volume, not the weather fog the owner cut:
  a bounded box per cascade.
- **Spray and splash** (`render/WaterCascadeSources.ts`): an emitter every
  ~6 m of drop (rates rising with the distance fallen), the lip on tall
  falls, the plunge cloud, and `cascadeImpactBursts` for discrete impact
  splashes (crowns) — on the nearest two falls.
- **Gate**: `WaterfallSheets.test.ts` "the lip seam" — body top at the
  strip's last station within 0.25 m, body ≥ 0.8 × `widthM` at the lip, a
  crest over every lip, on the shipped data.
- **Boulders** stay a scatter-compiler job (`stripBoulderCandidates`).

Steep streams are the strips (`ChannelStrips.ts`), whitewater-shaded by the
shared streak field (`whitewaterStreaks.ts`: 0.313 / 0.857 / 0.075 t/s, U
drift, breathe), always scrolled along the ribbon's own arc.

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
unit-rms and scaled by `seaRmsHeightM(wind, fetch)` (16c, ruling 7), with
each band fetch-limited at 2 × its wavelength on the compiled directional
fetch (a 200 m lake carries chop, never swell) and blended toward a standing
wave by class (lake 0.45, marsh 0.5, estuary 0.3). All
frequencies sit on the 2π/8192 s grid so `WaterClock.phaseS` folds without
a pop. Technique sources: [water-pro-greenheck-study.md](../../../../docs/research/rendering/water-pro-greenheck-study.md).

## Rendering (`render/`)

| File | What it owns |
| --- | --- |
| `loadWaterAssets.ts` | Fetches + decodes `province/water/` into `WaterData`, `WaterWorld` and textures (`decodeWaterRasters` is the pure, tested decode). |
| `waterMaterial.ts` | The water shader patch (terrain-cut shoreline with vertical fade, surf, whitecaps, foam, flecks, SSR, refraction, ripples) + tiers/layers, the buried/cliff/owner guards, and the `ES_STRIP` whitewater variant. Composes the study terms: the foam field sample ahead of the dissolve, the depth-range froth, rain rings, sparkle + crest scatter after the specular, the horizon blend before the aerial term, the meniscus in both variants; `ES_FOAM_TEX` swaps the fbm foam mask for the vanilla `foamtile01` (kit slot `foam`, remapped onto the fbm moments — `FOAM_TEX`). Twins: `stripAeration`, `stripAlbedo`, `stripStreakPhase`, `FLECK`. |
| `ChannelStrips.ts` | Ribbon meshes along the compiled `channels[]` (and the ramps `WaterfallSheets` hands back) — per-vertex hydraulics plus the ribbon UV (`aSideM`, `aArc`, `aScroll`, `aEdge`); `stripBoulderCandidates` for the scatter compiler. |
| `whitewaterStreaks.ts` | The shared three-layer streak field (measured rates, U drift, breathe) — GLSL + TS twins, `uStreakTex` slot. |
| `waterProbe.ts` | `createWaterProbe`: the numeric dev hook the studio exposes as `window.__STUDIO_WATER_PROBE__` for `apps/world-studio/scripts/probe-water.mjs`. |
| `WaterfallSheets.ts` | Ballistic tracer + fall/ramp classification, strip alignment, the brink; mounts the kit stack and the mist volume; diagnostics + probe marks. |
| `WaterfallKit.ts`, `WaterfallKitStack.ts`, `WaterfallKitMaterial.ts`, `WaterfallMistVolume.ts` | The vanilla FX kit: parser + role table, Bethesda's placement rules on the traced path, the one piece material, the ray-marched per-fall mist. |
| `WaterSurface.tsx` | The camera-following province grid, contact bodies (swept-path stamps into ripple sim + foam field every 0.12 s), splash/plunge deposits into the field, the field's construction by tier, particle stack. |
| `WaterPipeline.tsx` | The frame's seven `render` calls: ripple sim ×2 and foam field first, then opaques→HDR RT, the tone-mapped blit (underwater fog/god rays/bubbles), and the water, precipitation and overlay layer passes (three of the seven traverse the whole scene; the shadow map updates on even frames only). Cost per pass is in decision 0084. |
| `RippleSim.ts` (+ `rippleAdvection`, `rippleIsolation`) | Body-isolating interactive ripple patch; `addPath` stamps a swept footprint. |
| `FoamField.ts` | Persistent foam ENERGY field (512²/256² by tier, 512 m, camera-snapped): advected by the compiled flow, fed by crest fold, windward faces, the surf band and swept injections, decaying 0.5 s at sea → 3 s sheltered; `FOAM_FIELD_GLSL` samples it in the fragment ahead of the unchanged dissolve. |
| `shoreFroth.ts`, `rainRings.ts`, `sparkleSss.ts`, `horizonBlend.ts`, `meniscus.ts` | Small GLSL + TS-twin terms from the Greenheck study: the 1.8 m depth-range froth band, analytic cell-hashed rain rings, the sun-glint window and backlit crest scatter, the far-sea → sky convergence, the waterline meniscus. |
| `WaterEffects.ts`, `WaterCrowns.ts`, `particleFoam.ts`, `waterParticle*.ts`, `fallingSpray.ts`, `WaterCascadeSources.ts` | Spray, foam, crowns, cascade emission. |
| `UnderwaterBubbles.ts` + `UnderwaterBubblePass.ts` | Entrained bubbles and their isolated HDR pass. |
| `groundWetness.ts`, `caustics.ts`, `causticReceiver.ts`, `localWaterCaustics.ts` | Terrain-side wet band and bed caustics (same signed-depth decode via `uWetDepthMin/Span`). |
| `types.ts` | `WaterAssets`, `WaterRuntime` (the app injects clocks, sky, weather, debug) and `WaterDebugState`. |

Apps mount `WaterSurfaceMesh` + `WaterPipeline` through one `WaterRuntime`
object; nothing here imports app code.
