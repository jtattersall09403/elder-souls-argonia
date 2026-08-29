# 0032 — Phase 8c weather and atmosphere: implementation shape

Date: 2026-08-28 · Status: accepted · Owner review: pending (visual gate)
Research: [docs/research/weather-clouds-rain-threejs.md](../research/weather-clouds-rain-threejs.md)
· climate model: [black-marsh-climatology.md](../research/black-marsh-climatology.md)
Spec: module [55](../world/55-light-sky-time.md) §97–98; deliverables module 95 §86.

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

## Implementation notes (round 1)

- **Where things live**: engine `packages/world-weather` (hash/states/
  synoptic/express, 18 tests); raster bake in `compile_hydrology`
  (+`test_climate_weather.py`); studio bridge `apps/world-studio/src/weather/`
  (climateSampler, weatherState = override + per-frame cached sample,
  RainSystem); light `sky/lightRig.ts` (`WeatherLightIn` → sunDim^3 direct
  factor, +1-stop storm exposure lift, cloud colours exposure-anchored like
  dawnLum); dome clouds patched into `WorldSky.createSkyDome` (3 FBM layers,
  premultiplied over-composite, IN the dome so the PMREM IBL greys under
  overcast); mist regimes as added densities in `sky/aerial.ts`; rain wetness
  merged into `water/groundWetness.ts` (max with the shore band, per-pixel
  canopy suppression); wind → `setWindWaveScale` in game-core waves
  (CPU query + `uWindWave` uniform, symmetric).
- **Envelope discipline held**: cloud colours are CPU-anchored
  (`cloudScreenRange` in skyScreenModel bounds them; lightRig.test walks all
  7 states × 9 hours). One real fix fell out: the storm exposure lift pushed
  the circumsolar glare past the historical cap — resolved by REDUCING the
  dome's Mie under heavy decks (hiding the sun's glow is physical; the 0021
  pinning lesson only forbids raising Mie).
- **Legacy light presets/probes pin `w=clear`** — their job is reference
  light, and the auto calendar legitimately rolls rain on their dates. The
  auto path has its own probe scenario. Forced clear/haze also forces
  "last night was clear" so the dawn-mist preset previews mist.
- **Celestial occlusion is global, not per-pixel** at this tier: dome clouds
  draw under the star/moon passes, so cover dims them via one uniform factor.
  Honest approximation; volumetrics (high tier, backlog) would fix it.
- **Deliberately NOT owned here**: thunder/rain audio (module 57, Phase
  12b); weather→flood beyond the existing season/tide offsets (the flood
  pulse lags rain by 1–2 months — that is the season scalar's job, §33.1);
  gameplay grip consumption (published via env query, Phase 9 consumes).

## Round log

(Owner gate rounds land here, defect → fix, per the 0021/0025 pattern.)
