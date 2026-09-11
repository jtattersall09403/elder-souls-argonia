# 0032 — Phase 8c weather and atmosphere: implementation shape

Date: 2026-08-28 · Status: accepted · Owner review: **CLOSED 2026-08-30 after
round 5** (good-enough, not perfect — the owner will record their remaining
polish items in docs/phases/P-polish/backlog.md for Phase P)
Research: [docs/research/rendering/weather-clouds-rain-threejs.md](../research/rendering/weather-clouds-rain-threejs.md)
· climate model: [black-marsh-climatology.md](../research/world-terrain/black-marsh-climatology.md)
Spec: module [55](../world/55-light-sky-time.md) §97–98; deliverables module 95 §86.

## CONTINUING THIS PHASE — run-book for the next agent

**State: PHASE CLOSED by the owner 2026-08-30 after round 5** (good-enough,
not perfect — owner-recorded leftovers land in docs/phases/P-polish/backlog.md,
Phase P). If you are iterating on weather/atmosphere again (Phase P or a
regression), the protocol still applies: read this file in full (Decisions +
Implementation notes below are the design rationale); fix at root cause; log
each iteration as a numbered **Round N** section at the bottom (defect →
root cause → fix, the 0021/0025 pattern); redeploy and hand back a
checklist. Two invariants that must survive any future round: fog colours
are DERIVED from the real light (round 5 — never reintroduce authored
per-state fog colours or a camera-altitude sky veil), and rain physics never
rides the game clock (round 4).

**Where feedback lands** (most tuning is one table or one constant):

| Feedback sounds like… | Edit |
|---|---|
| "state X too dark / too foggy / rains too hard / winds too strong"; transition speeds | `packages/world-weather/src/states.ts` (PROFILES + TRANSITION_MIN — the per-state parameter blocks) |
| "too much/little rain overall", "changes too often/rarely", "storms at wrong time of day", spell rhythm | `synoptic.ts` (spellWeights, stateWeights, VOLATILITY, SLOT_MINUTES, convectionFactor) |
| region VISIBILITY (per-place baseline, or how it breathes with hour/season/weather) | `climate-vis` G channel (baseline) + `express.ts` `regionHazeFactor` (live multiplier). ONE call feeds both the renderer's `uRegionHaze` and the published `visibilityM` — round 4; do not re-split them |
| cloud-COVERAGE days (clear / fair / partly / broken / overcast), how often each occurs | `states.ts` PROFILES fair-weather ladder + `synoptic.ts` `stateWeights` |
| how fast the game clock runs | `GAME_TIME_SCALE` in `@elder-souls/world-time` (30, Morrowind's). Calendar only — **never** scale physical motion by it |
| rain fall speed / streak length / volume size | `RainSystem.tsx` (`SHUTTER_S`, `uFall` floor 8 m/s round 5, `VOLUME` 72 m + radial edge fade) — on its OWN real-time clock, deliberately not the world or water clock |
| anything transparent vanishing behind water | it needs `PRECIP_LAYER` (or the overlay layer) and a pass-3 render — see waterMaterial.ts and round 4 §1 |
| fog/mist COLOUR or brightness | `lightRig.ts` fog block — **DERIVED from the real light since round 5** (sun term physical via sunIntensity/sunColor; sky term anchored to `skyScreenTarget`; knobs: `FOG_SCATTER`, `fogSkyScreen` factor 0.42, `FOG_FORWARD`); blended by view/sun angle in `aerial.ts` `esFogColFor` |
| fog banks against OPEN SKY, camera-inside-fog sky veil | `aerial.ts` `DOME_FOG_GLSL` (`esSkyFog` — 12-step march of the same regime densities along the sky ray, round 5; replaced the round-2 `uCamFog` veil) |
| cap-cloud shape/lumpiness/drift | `aerial.ts` `esCloudLump` + the belt block; mask dilation `pow(mask, 0.6)`; mask sampled at the path's BELT-CROSSING point (round 5) |
| regional character (rain shadow, coastal squalls), mist regime strength/timing, belt elevation/shape, visibility numbers, wetness rise/decay rates | `express.ts` (`WHITEOUT_BELT` 470 m, σ 150 below/55 above — asymmetric so summits clear it; wetness trail in `synoptic.ts` `rainWetness`) |
| fog LOCALITY (where banks sit, camera veil gating, belt mask), region ambient-visibility render | `aerial.ts` (3-point path raster sampling) + `climate-vis.png` (R belt mask, G region extinction — baked in `compile_hydrology`) + the round-3 rules in module 55 §97 |
| sunset/sunrise cloud colours | `lightRig.ts` `cloudSunsetCol/Amt` + the dome mix in `WorldSky.createSkyDome` (envelope: `skyScreenModel.cloudScreenRange`) |
| wave size/speed spectrum, shore-breaking energy | wind→scale map in WorldSky (quadratic, 0.35…6) + `waves.ts` (`windWaveSpeed`, `surfWindScale`); water clock speeds up in wind (`waterClock.ts`) |
| cloud LOOK (shapes, scale, scroll speed, layer character, storm wall, silver lining, star/moon occlusion, sun-crossing dimming) | **`sky/cloudField.ts`** (the ONE shared GPU/CPU field — constants table at top; round 2) + the composite block in `WorldSky.tsx` `createSkyDome` |
| per-STATE cloud character (puffy vs sheet, scroll, front, green cast), day-to-day coverage variety | `states.ts` (cloudPuff/cloudScroll/stormFront/greenTint/covJitter) + `coverWander` in `synoptic.ts` |
| dense-fog/mist COLOUR (black-cap/purple-layer class), camera-in-fog sky veil | `lightRig.ts` fogLum + `aerial.ts` fogFrac mix + uCamFog in WorldSky |
| water season (wet/dry level on the calendar) | `App.tsx` water-season select → `waterAssets.ts` `effectiveSeasonScalar` (null = calendar); amplitudes in game-core `tide.ts` |
| cloud BRIGHTNESS/colour day vs night, storm darkness, shadows on/off threshold, storm exposure lift, sun glare under decks | `sky/lightRig.ts` (cloud colours are exposure-anchored; sunDim^3 direct factor; shadows off at sunDim > 0.6; Mie ×(1−0.6·sunDim)) |
| fog/mist RENDER densities (regime strengths as drawn) | `sky/aerial.ts` (density factors: radiation ×14, advection ×125, whiteout ×550, weather fog ×8) |
| rain streak look/count/drift; splash ripples | `weather/RainSystem.tsx` (budget in `rainDropBudget`); ripple stamping in `water/WaterSurfaceMesh.tsx` |
| ground wet look (darken/gloss amounts, canopy dryness) | `water/groundWetness.ts` |
| the baked fields themselves (rain-shadow shape, storm coasts, fog corridors) | `compile_hydrology` climate-weather block — **rerun with the RAW vault heightfield `heightfield-f32.npy`, NOT `province-refined/`** (wrong input silently changes every raster); only province PNGs + meta rewrite, no chunk rebuild needed; then `python3 -m pytest -q` (59) |

**Validation loop**: `npm test` (406) + `npm run typecheck` from root. THE
ENVELOPE LOCKSTEP RULE: any change to the dome shader, cloud colours or
exposure must keep `WorldSky.createSkyDome` ↔ `sky/skyScreenModel.ts` ↔
`sky/lightRig.test.ts` in agreement — the envelope test is what keeps
whiteouts/black-gaps numerically impossible; extend all three together.
Browser probe (~8 min, build first — it serves `dist/`):
`npm run build -w @elder-souls/world-studio`, then from `apps/combat-sandbox`:
`node ../world-studio/scripts/probe-sky.mjs` (one scenario:
`SKY_SCENARIO=<id>`). Deploy: push to main; if no Actions run in ~2 min,
`gh workflow run deploy-pages.yml --ref main`; verify with a curl of a
changed asset. **Shared worktree**: other agents run concurrently —
pathspec-only commits, never touch files you didn't change (workstream S is
active in module 76 / `tooling/stats-sim/`).

**Hard-won rules (this phase + inherited)**: every authored sky/cloud/rain
luminance is a SCREEN value divided by `exposureTarget` (exposure-anchored —
never a raw HDR constant); never RAISE the dome's Mie coefficient (0021's
white-glare lesson — lowering it under decks is fine); real-world climate
scale lengths must be compressed ~10× for the 7.4 km province or fields come
out flat; no `Math.random`/`Date.now` in world systems — hash structural
indices (same instant ⇒ same weather is the load-bearing property); forced
`w=` states are studio preview only, the game ships the auto calendar; the
legacy light presets/probes pin `w=clear` deliberately (they are reference
light, and the calendar legitimately rolls rain on their dates).

**Owner playtest checklist** (also in PROGRESS *Waiting on user*): studio →
weather selector in the time panel, or presets (storm noon / monsoon
downpour / whiteout / squall front): ① clouds move and read at
dawn/noon/night ② rain falls, ground darkens+glosses, water ripples
③ storm skies dark and shadowless but playable ④ sea rougher in wind
⑤ "auto" changes believably over a monsoon day at 1 h/s ⑥ Blackrose dawn
preset still shows mist.

## Decisions

1. **One synoptic timeline, regional *expression*.** The province is ~7.4 km
   across — one real weather cell — so a single seeded synoptic state machine
   drives the whole map (`packages/world-weather`): multi-day monsoon
   active/break **spells** → 90-minute **slots** rolled from weights(spell,
   season, time-of-day). The "region-weighted frequencies" the plan asks for
   enter through **local expression**: the same synoptic state reads
   differently per place via the climate fields (rain amplitude, storm
   exposure, sea fog, mist propensity, canopy, elevation). This keeps weather
   spatially coherent (no state pops at region borders) while regions keep
   distinct weather character — a squall is violence on the open Padomaic
   coast and gusty overcast inland; a downpour is a wall of water in the
   interior and drizzle in the NW rain shadow.
2. **Everything is a pure function of epoch minutes.** No accumulated state
   anywhere: spells/slots are hash-seeded, wetness is a closed-form trailing
   integral of rain (decays over tens of minutes), radiation mist *derives*
   from "was last night clear and calm" by querying the same machine, and
   lightning flash times are hashed per slot. Fully scrubbable; a studio URL
   reproduces the exact frame; saves need no weather record.
3. **Ground mist is not a rolled state.** The three mist regimes (module 55
   §97) are computed conditions: radiation (basin dawn, dry season, clear calm
   night required — the causal cross-dependency from the research §5.2),
   advection sea fog (coast/estuary field, mornings), cloud-forest whiteout
   (elevation bell ~520 m, quasi-permanent). Weather states supply only the
   fourth fog source (rain veil / dry haze). All four feed the ONE
   aerial-perspective authority — no second fog.
4. **Tropical rhythms are structural, not cosmetic**: afternoon-peaked
   convection factor multiplies thunderstorm weights (inland storms build
   through midday); squall lines live in monsoon *break* spells and get the
   one legitimately fast transition (6 min in, vs 22–45 for everything else);
   dry-season haze is a real state.
5. **Clouds: procedural layers in the existing dome shader, base tier.**
   2–3 FBM layers patched into the envelope-pinned Preetham dome (inside the
   §8d screen-luminance envelope, so weather cannot re-break the whiteout
   gates). Volumetric clouds (takram three-clouds) stay a **high-tier polish
   item** (its own README recommends a skybox below its low preset) —
   polish backlog, not this phase.
6. **Rain**: GPU-instanced streaks in a camera-following volume, spawn density
   × local rain intensity × (1 − canopy raster) — the top-down occlusion
   depth map (Lagarde) is deferred until there is canopy *geometry* to occlude
   under (Phase 10+); splashes stamp impulses into the existing `RippleSim`;
   a screen "rain veil" carries monsoon walls of water at distance.
7. **Wet surfaces**: one global wetness scalar (engine, decays after rain)
   into the existing ground-wetness shader path (same darken+polish treatment
   as the 8b shore band, scaled by 1 − canopy). Porosity-aware variation
   deferred to the material-kit phase.
8. **Weather owns the wind block**: direction (wanders ±25°/slot around the
   prevailing direction already tuned into game-core `waves.ts`), speed,
   gusts. Water chop reads a wind scale factor — renderer and CPU water query
   get the same number (8b rule: what you see is what you float on).
9. **God rays through canopy: deferred with rationale** — there is no canopy
   geometry until Phase 10 places trees; nothing exists for light shafts to
   pass through. Moved to the polish backlog, alongside volumetrics,
   lens droplets and the rain-occlusion depth map. Weather *audio* is module
   57 (Phase 12b) as planned.
10. **Env-query publishing**: `EnvironmentContact` gains a weather block
    (state, rain, wind, visibility, wetness, grip) and `TimeLightSample.visibilityM`
    becomes real — AI perception, encounters and Phase 9 traction read the
    same authority the renderer draws.

## Consequences

- `packages/world-weather` (pure, tested) sits beside `world-time`; apps
  consume both. The studio bridge samples `climate-air.png` +
  **`climate-weather.png`** (new compile_hydrology output: R rain amplitude,
  G storm exposure, B advection sea fog — formulas from climatology §3).
- The light rig takes a weather modifier (sun dim, ambient lift, sky grey,
  turbidity add) so overcast kills shadows and greys the dome *inside* the
  envelope model; the envelope test extends to weathered skies.
- Studio: weather readout + force-state override (Skyrim `fw`-style) in the
  time panel, `w=` URL param; auto (calendar) is the default and the only
  mode the game ships.

## Round log

Implementation notes (round 1) and the round log are in [docs/research/archive/weather-8c-rounds/0032-round-log.md](../research/archive/weather-8c-rounds/0032-round-log.md).
