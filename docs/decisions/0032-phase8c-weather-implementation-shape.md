# 0032 — Phase 8c weather and atmosphere: implementation shape

Date: 2026-08-28 · Status: accepted · Owner review: pending (visual gate)
Research: [docs/research/weather-clouds-rain-threejs.md](../research/weather-clouds-rain-threejs.md)
· climate model: [black-marsh-climatology.md](../research/black-marsh-climatology.md)
Spec: module [55](../world/55-light-sky-time.md) §97–98; deliverables module 95 §86.

## CONTINUING THIS PHASE — run-book for the next agent

**State (2026-08-29): round 1 BUILT, PROBED (10/10 browser scenarios),
DEPLOYED to Pages — owner playtesting.** You are here because the owner said
"Continue phase 8C delivery" with feedback points. Protocol: read this file
in full (Decisions + Implementation notes below are the design rationale);
fix the feedback at root cause; log each iteration as a numbered **Round N**
section at the bottom (defect → root cause → fix, the 0021/0025 pattern);
redeploy and hand back the checklist. On owner PASS: flip the PROGRESS 8c
row to done, sweep cosmetic leftovers to docs/polish-backlog.md.

**Where feedback lands** (most tuning is one table or one constant):

| Feedback sounds like… | Edit |
|---|---|
| "state X too dark / too foggy / rains too hard / winds too strong"; transition speeds | `packages/world-weather/src/states.ts` (PROFILES + TRANSITION_MIN — the per-state parameter blocks) |
| "too much/little rain overall", "changes too often/rarely", "storms at wrong time of day", spell rhythm | `synoptic.ts` (spellWeights, stateWeights, VOLATILITY, SLOT_MINUTES, convectionFactor) |
| regional character (rain shadow, coastal squalls), mist regime strength/timing, whiteout band elevation, visibility numbers, wetness rise/decay rates | `express.ts` (+ `whiteoutBell` 520±130 m; wetness trail in `synoptic.ts` `rainWetness`) |
| cloud LOOK (shapes, scale, scroll speed, layer character, storm wall, silver lining, star/moon occlusion, sun-crossing dimming) | **`sky/cloudField.ts`** (the ONE shared GPU/CPU field — constants table at top; round 2) + the composite block in `WorldSky.tsx` `createSkyDome` |
| per-STATE cloud character (puffy vs sheet, scroll, front, green cast), day-to-day coverage variety | `states.ts` (cloudPuff/cloudScroll/stormFront/greenTint/covJitter) + `coverWander` in `synoptic.ts` |
| dense-fog/mist COLOUR (black-cap/purple-layer class), camera-in-fog sky veil | `lightRig.ts` fogLum + `aerial.ts` fogFrac mix + uCamFog in WorldSky |
| water season (wet/dry level on the calendar) | `App.tsx` water-season select → `waterAssets.ts` `effectiveSeasonScalar` (null = calendar); amplitudes in game-core `tide.ts` |
| cloud BRIGHTNESS/colour day vs night, storm darkness, shadows on/off threshold, storm exposure lift, sun glare under decks | `sky/lightRig.ts` (cloud colours are exposure-anchored; sunDim^3 direct factor; shadows off at sunDim > 0.6; Mie ×(1−0.6·sunDim)) |
| fog/mist RENDER densities (regime strengths as drawn) | `sky/aerial.ts` (density factors: radiation ×14, advection ×125, whiteout ×550, weather fog ×8) |
| rain streak look/count/drift; splash ripples | `weather/RainSystem.tsx` (budget in `rainDropBudget`); ripple stamping in `water/WaterSurfaceMesh.tsx` |
| ground wet look (darken/gloss amounts, canopy dryness) | `water/groundWetness.ts` |
| sea state vs wind | wind→scale map in WorldSky (`setWindWaveScale(0.8 + 0.05·wind)`), clamped in game-core `waves.ts` |
| the baked fields themselves (rain-shadow shape, storm coasts, fog corridors) | `compile_hydrology` climate-weather block — **rerun with the RAW vault heightfield `heightfield-f32.npy`, NOT `province-refined/`** (wrong input silently changes every raster); only province PNGs + meta rewrite, no chunk rebuild needed; then `python3 -m pytest -q` (59) |

**Validation loop**: `npm test` (390) + `npm run typecheck` from root. THE
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

### Round 1 (owner playtest 2026-08-29 → fixes same day)

Research for the fixes: research doc §8 (night clouds, coverage variety,
storm looks, god rays — added this round).

1. **"HUD says downpour but no visible rain"** → streaks were 1.4 cm wide at
   0.16 alpha — sub-pixel faint (the round-1 probe asserted the rain
   *number*, not pixels). Widened 0.022, opacity 0.3, longer; probe now has
   a scenario at the owner's exact spot and screenshots are eyeballed.
2. **Lightning with no clouds / under overcast** → flashes fired at the full
   slot rate from minute 0 of a storm slot while the deck was still
   blending in. Fix: `lightningCloudGate` on the blended cloud mass, applied
   in the sample AND the per-frame `lightningNow` path.
3. **Rain with no clouds** → same class: precipitation now gated on blended
   cloud mass (Bethesda begin-fade-in), covering transitions both ways.
4. **Night clouds unreadable (moons not occluded, no gaps, no edge glow)** →
   root: dome clouds draw under the celestial passes with only a global dim.
   Fix: the ONE cloud field (`cloudField.ts`, seeded lattice texture +
   layer maths, GPU = CPU by construction): per-star occlusion in the star
   vertex stage, per-moon CPU occlusion (glow through thin, gone behind
   thick), moonlit faces brightened + desaturated, silver-lining band-pass
   toward the sun/moon.
5. **All cloudy states = same coverage, different darkness** → states now
   emit layer character (puff/scroll/front/green + per-layer coverage), and
   `coverWander` drifts coverage inside a state (a clear day wanders
   between empty sky and scattered cumulus). A cumulus crossing the sun
   dims the direct light via the CPU field (−85 %, shadows off ≥ 0.8).
6. **Storm ladder too flat** → sunDim retuned (rain .80 < downpour .94 ≤
   t-storm .93 / squall .95), storm exposure lift cut 1.2 → 0.6, cloudDark
   spread wider, squall gets the shelf-wall azimuth asymmetry + 2.8×
   scroll, thunderstorm the green cast + racing scud.
7. **Black bands on clear-day summits + opaque purple layer in fly mode +
   mist/haze invisible** → ONE root cause: the mist regimes fed the aerial
   term whose ambient asymptote is near-black in daylight, and whiteoutBase
   floored at 0.55 even under clear sky. Fix: `fogLum` (exposure-anchored
   bright fog colour) mixed by fog fraction in `aerial.ts`; whiteout now
   follows the synoptic cloud (0.15 clear → 0.9 rain); camera-in-fog veil
   fogs the DOME too (the belt was invisible from below because only
   surface fragments were fogged). Envelope test asserts fogLum in-range.
8. **Rain ripples only near the player** → sim patch 36 → 64 m + 3× drop
   stamping, plus a procedural rain-agitation normal term across ALL
   visible water (`uRainRipple`), distance-faded.
9. **Storm seas not rougher** → wind→wave map 0.75 + 0.07·wind, game-core
   clamp 1.6 → 2.4 (squall coast ≈ 2.2× energy); whitecaps follow
   steepness; CPU buoyancy reads the same scale.
10. **No mist force option** → force dropdown gains "dawn mist" / "sea fog"
    (`weatherSampleForRegime`; `w=mist` / `w=fog`).
11. **Fly default altitude above the clouds** → 700 → 400 m (below the
    520±130 m belt).
12. **Wet season not on the calendar** → the 8b studio checkbox permanently
    pinned the water season to 0/1; the calendar path was dead code. Now
    auto (calendar) is the default and the shipped behaviour — +1.4 m at
    flood peak, ~−0.28 m deep-dry drawdown (asymmetric, tide.ts), smooth
    transitions; auto/wet/dry preview select; `wet=` in character URLs;
    map view gains the `flood-wet` inundation overlay (shipped since Phase
    6 but never displayed).
13. **God rays** → deferred to the polish backlog with a concrete recipe
    (research doc §8.4) — needs a quarter-res occlusion pre-pass + composer
    pass in both canvases; owner allowed deferral if not easy.
14. **HUD "vis ~900 m" vs panel "vis 24.3 km"** → not a defect: the top bar
    is the env-query practical visibility = min(region baseline, weather) —
    the region's authored ambient visibility (Phase 4 danger model) caps it
    in dense-air regions; the panel shows weather-only sight distance.
    Flagged to the owner in the round-2 handoff for a naming decision.
