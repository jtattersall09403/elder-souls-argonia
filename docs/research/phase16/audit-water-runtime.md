# Audit — the deployed water runtime against the owner's report (2026-09-11)

Read-only audit for the Phase 16 plan. The owner reported a static ocean,
missing swell / whitecaps / shore break, hard and jagged edges, hovering 2D
sheets, doming water, gaps, and harsh seams between water types. Evidence is
`file:line` on the tree at `34bec0ed`.

## 1. Ocean motion: animated every frame, muted below visibility

- The clock runs: `runtime.advanceClock(delta)` and `uWaveTime` update in
  `useFrame` (`packages/game-core/src/water/render/WaterSurface.tsx:303-304`);
  the 8192 s fold is `WaterClock.ts:35`. No revision gate. Nothing in
  `.github/workflows/deploy-pages.yml` disables water; tier is chosen at
  runtime by device (`apps/world-studio/src/water/StudioWater.tsx:46-52`).
- **Root mechanism: the spectrum's slope.** `WAVES` (`waves.ts:47-56`) moved
  the peak to ~100 m while keeping `rmsHeightM: 0.185`, the RMS of the retired
  34 m table. The dominant band is 0.20 m amplitude on 103 m — a surface slope
  of about 1.4°, roughly a third of the old table. The two longest bands are
  then halved again by the per-band fetch clamp `clamp01(shoreDistM /
  b.fetchM)` (`waves.ts:353`; GLSL twin `:590-601`) because the shipped shore
  raster saturates at `surface.shoreMaxM: 160` m: open ocean never gets more
  than 160 m of fetch.
- **Detail normals do not move on still water.** `esDrift = vec2(sin(t*0.13),
  cos(t*0.11)) * 0.03` (`waterMaterial.ts:897-899`) is 3 cm/s; the whitecap
  fbm advects at 1.5 mm/s (`:1067`). Wind direction is never used.
- **The horizon blend erases the far sea.** `startM 1500, endM 3500, maxBlend
  0.92` (`render/horizonBlend.ts:12-18`, applied `waterMaterial.ts:1213-1223`),
  plus far roughness `+0.24` (`:1150-1153`) and detail strength falling to 0.2
  (`:892-893`).
- **Whitecaps need a +2.3 σ noise excursion at normal wind** (`:1064-1072`
  threshold 0.16–0.34 against fbm mean 0.436 sd 0.130, `uWindWave ≈ 0.9` from
  `WorldSky.tsx:1194`) — about 1 % of pixels; they exist only in storms.
- **The walk-mode sea ends at 3 km** (`CharacterMode.tsx:365` `farExtentM=3000`
  → grid `halfExtent`, `WaterSurface.tsx:169`), mid-blend: a circular cut-off.
- `spectralOcean.ts` is unmounted (only `SpectralOceanTextures.ts:2` imports it,
  which nothing imports).

## 2. Water Pro transfer ledger (study §6)

| Transfer | Implemented | Mounted | Verdict |
|---|---|---|---|
| JONSWAP swell | `waves.ts:288-330` | `waterMaterial.ts:757-767` | implemented, effectively muted (§1) |
| Standing waves | `waves.ts:96-113` | `:762` | done |
| Whitecaps | `waterMaterial.ts:1064-1072` | field frag | gated near-off at calm wind |
| Shore break / surf | `waves.ts:190-241` | `:739-740`, foam `:1055-1058` | done, scales with `uWindWave` |
| Shore foam (depth froth) | `render/shoreFroth.ts` | `:1082` | done |
| Wet sand | `render/groundWetness.ts` | `StudioWater.tsx:87-95` | done |
| Foam drift field | `render/FoamField.ts` | `WaterSurface.tsx:236-243` | done; drifts at 3 cm/s on the sea |
| Sparkle / crest SSS | `render/sparkleSss.ts` | `:1200`, `:1203-1205` | done; SSS tiny (mesh crests) |
| Meniscus | `render/meniscus.ts` | `:962-963`, `:1207` | done |
| Rain rings | `render/rainRings.ts` | `:954` | done |
| Horizon blend | `render/horizonBlend.ts` | `:1213-1223` | done, and a defect source |
| Interaction / splash | `contactEmitter.ts`, `RippleSim.ts` | yes | done |
| Rock dressing in surf | — | — | not done (polish backlog) |
| FFT ocean tier | `spectralOcean.ts` | no | not mounted |
| Algae constituent | — | — | not done |

## 3. Edge and intersection mechanisms

1. **Three hard `discard`s** on an unsampled render target (`samples: 0`,
   `waterMaterial.ts:61-64`): buried guard `:856`, cliff guard `:864`, owner
   mask `:869` → binary, jagged shore and strip edges. Detect: count 1-px
   water/non-water flips with no intermediate alpha along a shore tile.
2. **Cliff guard makes holes; sub-threshold makes domes.** `FIELD_MAX_SLOPE =
   1.0` (`:439`) discards where `|∇W| > 1` on an exponential grid whose far
   cells are tens of metres wide (`WaterSurface.tsx:44-45, 60-70`); a step
   below 1.0 is drawn as a ramp — the "water above the land doming down to the
   edge". Detect: far-grid cells whose raster `W` step yields slope in
   `[0.2, 1.0]` (dome) or `> 1.0` (hole).
3. **Owner-mask dilation wider than the strip.** `OWNER_DILATE_M = 1.2`
   (`:466`) discards the field around the trench while the ribbon is drawn on
   `wettedHalfWidthM` (`waterData.ts:34-37`; `wettedFracStrips.median 0.402`)
   → a gap ring round every strip and fall. Detect: drawn half-width ≥
   discarded half-width per channel point.
4. **Buried guard relaxes to −2.0 m past 825 m** (`BURIED_GUARD`, `:433`),
   looser than terrain LOD height error, so at LOD boundaries a flat sheet
   hovers over land and the cut line jumps. Detect: per-chunk max
   `|height(lod1) − height(lod4)|` vs the floor.
5. **Sea outside the raster is a hard plane** (`esSurfaceAt` returns
   `(0, OPEN_SEA_DEPTH_M)`, `:283-285`; class/flow fallbacks differ `:701-702`)
   → a straight seam at the province edge. Detect: `|W(last texel) − 0|`.
6. **Mesh termination at 3 km in walk mode** (§1).
7. **Three surfaces, three lighting paths** (field/strip variants `:48`,
   `WaterfallSheets.ts`, `PlungeBase.ts`); the probe measures a 9–16 % chroma
   step at the joins and sets its band at 20 % — the seam is measured and
   accepted (`probe-water.mjs:132-158`).
8. **16 waterfalls province-wide** (`stats.cascadeCount`): "not there" is
   compiler yield, not a renderer fault.

## 4. Test and probe coverage

| Suite | Covers | Catches the above? |
|---|---|---|
| `worldgen/test_water_invariants.py` (23) | compiled-raster invariants | raster half of 3.2/3.4 only; nothing in the renderer, nothing on motion |
| `worldgen/test_water.py` | synthetic carves | no |
| `packages/game-core/src/water/water.test.ts` | wave tables, surf, tide, buoyancy | no — see tautologies |
| `render/waterMaterial.test.ts` | GLSL string contents (`toContain`) | no — cannot fail on a visual defect |
| `apps/world-studio/scripts/probe-water.mjs` | 17 sites, falls, joins, fps | no beach or open-ocean site (`:52-77`), no frame difference, no edge metric, and it **forces `tier === "low"`** (`:450`) |

Checks that cannot fail as intended: `water.test.ts:44-48` locks the sea RMS
to the retired table (it enforces the flatness); `:24-31` asserts a Gerstner
sum is below its own amplitude sum; `:205-207` gates whitecap coverage on the
retired table's own value; `probe-water.mjs:652-659, 705-716` report instead
of asserting.

## 5. What is deployed

Water and chunks are in step (both `2026-09-09 18:32`, commit `4b5beab0`);
`water-meta.json` is schema 2 with `klass.extPx 5 / extM 27.42 /
extShaderBandM 22.0 / extRiseM 2.0` present — the handoff's and
`deploy-pages.yml:33-36`'s claim that the block is missing is **false** against
the shipped file. The water runtime never validates `schemaVersion`
(`waterData.ts:12` optional, v1 fallbacks `:53-56`); `extShaderBandM` has no
runtime consumer; `waves.ts:130-136` is a module-level mutable singleton in
`packages/`.

## 6. Ranked root causes (mechanism → smallest fix → proving test)

1. Spectrum re-pitched at the old RMS (`waves.ts:47-56`) → `rmsHeightM` from
   wind/fetch (JONSWAP α) → mean `|∇h|` over a 400 m patch at wind 1 above a
   stated floor (fails today).
2. Still-water drift 3 cm/s (`:897-899`, `:1067`) → drive from the weather
   wind vector at phase speed → CPU-ported drift speed ≥ 0.5 m/s.
3. Horizon blend from 1.5 km at 92 % (`horizonBlend.ts:12-18`) → push out,
   cap well below 1 → `horizonBlendWeight(2000) < 0.2`.
4. `shoreMaxM 160` saturates fetch (`waves.ts:353`) → unbounded coarse fetch
   channel or per-class clamp → long-band amplitude mid-bay ≥ 0.9 nominal.
5. Whitecap threshold fixed (`:1064-1072`) → derive from the spectrum's crest
   statistic → 2–6 % coverage at `uWindWave = 1`.
6. Three unfiltered discards (`:856, :864, :869`) → fold slope and owner
   terms into `esCover` (`:1196`) → shore-tile flip count.
7. Owner mask on the trench vs ribbon on the wetted width (`:466`) → bake the
   mask from the wetted width → per-point drawn ≥ discarded.
8. Cliff guard on screen-space `dFdx` (`:439`) → evaluate against the raster's
   own gradient → far-grid dome/hole census.
9. Buried floor vs LOD error (`:433`) → derive from the LOD error in flight →
   per-chunk LOD delta vs floor.
10. No motion / edge / high-tier measurement (§4) → an open-coast probe site
    with two frames 1 s apart (mean |ΔRGB| floor over the sea window), an
    edge-transition-width metric, and the low-tier hard fail replaced by a
    recorded field — each shown failing on today's build before it is trusted.
