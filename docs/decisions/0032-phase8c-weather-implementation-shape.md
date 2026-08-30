# 0032 — Phase 8c weather and atmosphere: implementation shape

Date: 2026-08-28 · Status: accepted · Owner review: pending (visual gate)
Research: [docs/research/weather-clouds-rain-threejs.md](../research/weather-clouds-rain-threejs.md)
· climate model: [black-marsh-climatology.md](../research/black-marsh-climatology.md)
Spec: module [55](../world/55-light-sky-time.md) §97–98; deliverables module 95 §86.

## CONTINUING THIS PHASE — run-book for the next agent

**State (2026-08-30): round 5 BUILT + PROBED + DEPLOYED — owner playtesting.**
You are here because the owner said "Continue phase 8C delivery" with
feedback points. Protocol: read this file
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

### Round 3 (owner playtest of round 2, 2026-08-29 → fixes same day)

Research for the fixes: research doc §9. Owner's general directive this
round, now a module 55 §97 rule: **fog volumes are LOCAL, fog conditions are
synoptic** — you stand above a misty valley or look at a coastal fog bank;
fog never follows the camera as a province-wide veil.

1. **"Permanent fog band across the whole province sky at ~400 m, even
   force:clear"** → THREE root causes, all fixed:
   (a) the whiteout was a pure ELEVATION bell — any air at ~520 m fogged,
   with no horizontal locality. Now masked by a baked orographic channel
   (`climate-vis.png` R = neighbourhood max elevation ramp 320→450 m):
   cap cloud clings to the massif, free air over the lowlands is clear.
   (b) `whiteoutBase` floored at 0.12 under force:clear with a ×550
   density — distant summits whited out permanently. Now the belt follows
   the synoptic cloud deck (0 on settled clear/haze days — the module-55
   "quasi-permanent" wording was corrected too; cloud forest genuinely
   clears) and thickens under overcast/rain.
   (c) the round-2 camera-in-fog veil applied the whiteout by camera
   ALTITUDE alone — flying at the 400 m default veiled the entire dome
   white anywhere on the map. The veil now gates on the LOCAL regime
   values (raster at the camera), so it engages only genuinely inside a
   bank. Probe scenarios: `clear-fly-400-lowland` (camFog < 0.05),
   `whiteout-inside-fly` (camFog > 0.25 over the massif in rain).
2. **"Some summits should be above the clouds"** → belt profile made
   asymmetric (`WHITEOUT_BELT` centre 470 m, σ 150 m below / 55 m above):
   cloud drapes down the flanks but tops out ~570 m, so the ~600–650 m
   summits stand above the cloud sea (probe: `summit-above-clouds`).
3. **"Sea fog / dawn mist should be local, not province-wide"** → regime
   strengths split into `radiationBase/advectionBase` (province-wide
   condition) × per-pixel raster locality along the view path (3-point
   sampling in `aerial.ts`). Forced `w=fog`/`w=mist` now force the
   CONDITION, not the local value — forcing sea fog inland shows the banks
   on the coast/estuaries, where they belong (probe: `sea-fog-from-inland`
   vs `sea-fog-on-coast`).
4. **"When does the region-recorded visibility (900/600 m) render? Why not
   now?"** → nothing later owned it (§97 requires renderer/env-query
   agreement), so it landed now: `climate-vis.png` G bakes the climate
   profiles' sightlines as Koschmieder extinction, applied as a
   boundary-layer haze floor (weather-modulated ×0.55 settled … ×1.1
   rainy). Air floor 250 m: jungle 90 m etc. are VEGETATION sightlines —
   Phase 10's flora delivers those; the env query already min()s the
   authored figure for AI.
5. **"Rain still not visible"** → round 2's fix was not real (its own
   probe screenshot shows zero streaks at "downpour, rain 85%" — the
   screenshot was recorded as eyeballed-OK; the check is now honest).
   Compound causes, all fixed in `RainSystem.tsx`: 4 cm world-space quads
   went sub-pixel beyond ~4 m (now a screen-space MINIMUM half-width
   ~1.5 px with alpha compensation — the guarantee borrowed from the
   owner-linked Antaeus-AR soft-sprite technique, research §9.3, adapted
   to our velocity-aligned quads which foreshorten correctly); hard
   edges (now a procedural gaussian cross-profile); low-contrast grey at
   α 0.3 (now `fogLum`×1.25 exposure-anchored, α 0.5 — reads against
   ground and storm sky at any hour); 85 % canopy suppression over most
   of the province (capped 55 % — region raster ≠ literal roof); volume
   tightened 44→36 m and budget 3200→4200 so density lives where pixels
   are.
6. **"Clouds should colour at sunrise/sunset"** → `cloudSunsetCol/Amt` in
   the rig (exposure-anchored reddened transmitted sunlight; deck bell
   peaks ~+1° sun altitude, cirrus offset +4° so it stays lit into dusk —
   real afterglow), mixed in the dome with sunward `pow(az01, 2–3)`
   weighting + fixed anti-solar rose, damped on thick bases and storm
   decks. Envelope extended: `cloudScreenRange` includes the sunset
   colour; test asserts bounded + warm (probe: `sunset-clouds`).
7. **"Storm seas barely bigger; need a much wider spectrum (~6×), faster
   waves, harder shore breaking"** → wind→wave map now quadratic in wind
   speed (calm ~0.8 → squall coast saturating the new 6.0 cap; was capped
   2.4); `windWaveSpeed` (≈ scale^0.45, ~2.2× in a squall) multiplies the
   SHARED water-clock advance so waves arrive faster and all shore
   rhythm quickens with zero phase pops and CPU=GPU by construction;
   `surfWindScale` (≈ scale^0.8, cap 3.2) scales swash/shore-swell
   amplitudes and surf-foam energy on both CPU and GPU; the terrain wet
   band lifts with storm swash (`uWetWind`). Fair-weather default stays
   ≈ the 8b calibrated feel (factors ≈ 1 at scale 1 — the don't-retune
   rule).

### Round 4 (owner playtest of round 3, 2026-08-30 → fixes same day)

1. **"Rain seems to disappear *behind* water — ocean, rivers, pools, near and
   far, like the water has been set to 'bring to front'"** → exactly that.
   The water pipeline (0025) is a THREE-PASS architecture: opaques → RT, blit
   to screen, then the water surface renders on top. Rain is transparent with
   `depthWrite:false`, so it wrote no depth in pass 1 and the water surface in
   pass 3 had nothing to test against — it simply painted over the streaks.
   Rain now draws on its own `PRECIP_LAYER` (waterMaterial.ts) in pass 3
   **after** the water surface, still depth-testing against the scene depth
   the blit wrote, so terrain occludes it and water in front of it occludes
   it, but water behind it does not. *This class of bug applies to anything
   transparent added to the scene from now on — put it on the precip/overlay
   layer or it will vanish behind water.*
2. **"Rain doesn't fall fast enough — what speed will the real game run at?"**
   → two separate defects. (a) Rain rode the shared *water* clock, which is
   scaled by the world-time rate (up to 8×) and by wind, so the same downpour
   fell at different speeds depending on the studio's time-lapse setting.
   Rain now has its own real-time accumulator: **fall speed is physics and
   must never touch the game clock**. (b) The speed itself is now real
   terminal velocity by drop size (drizzle ~4 m/s → heavy rain ~10 m/s) and
   streak LENGTH is derived from it through an eye-persistence shutter
   (`SHUTTER_S`), so faster rain draws longer streaks — which is what
   actually reads as speed on screen.
   **The shipping clock rate is now written down**: `GAME_TIME_SCALE = 30` in
   `@elder-souls/world-time` — Morrowind's and Oblivion's `timescale` (Skyrim
   ships 20), i.e. 1 game hour per 2 real minutes, 48 real minutes per game
   day. Selectable as "▶ game speed (×30)" in the studio time dropdown. It
   scales the CALENDAR only — sun, moons, tides, weather timeline — never
   physical motion.
3. **"Make the rain a bit less white"** → streak colour target dropped from
   1.05 to 0.78 screen and given water's blue-grey cast. Rain reads by
   contrast and motion, not brightness.
4. **"Can local region visibility be weather-affected? Should these concepts
   be integrated?"** → yes, and they now are one system. The authored
   per-region sightlines were a static sketch (`climate-vis` G) driving a
   renderer uniform, while the published `visibilityM` came from the weather
   state alone — two systems that could disagree. Now: the raster is the
   per-place **baseline** air thickness, `regionHazeFactor()` (express.ts) is
   the **live** multiplier, and one call feeds BOTH `uRegionHaze` and
   `wx.visibilityM`. The multiplier is grounded in the province climatology:
   humidity carries it, it peaks not during rain but in the hot afternoon
   *after* (marsh steam off wet ground), pre-dawn damp thickens it, wind
   mixing thins it, wet season adds a little. So each region keeps its
   characteristic murk and still has its own daily variation.
5. **"Do we ever get 'mostly clear with fluffy white clouds' days?"** → there
   was no such state: the ladder went `clear` (which was really "a few
   clouds") straight to `overcast`. Added a **fair-weather ladder** —
   `clear` (now genuinely cloudless) → `fair` (~1/8) → `partly` (~3/8) →
   `broken` (~6/8) → `overcast` (8/8) — with sun dimming and ambient lift
   climbing across it, all forceable from the dropdown. The synoptic weights
   were rewritten so these are the *common* days (cloudless skies belong to
   dry-season `parched` spells), with a diurnal build: fair mornings grow to
   partly/broken through the afternoon on the same convection curve that
   drives thunderstorms.
6. **"Thunderstorm should have the same wave energy as squall; it looks
   calmer"** → it was: thunderstorm `windMS` was 9 vs squall's 14, and the
   coastal gust-front boost in express.ts applied to squalls only. A mature
   storm's cold-pool outflow is the same phenomenon, so thunderstorm wind is
   now 14 m/s and gets the same boost — identical seas and shore surf. The
   two states differ where they should: the shelf wall, the green cast, the
   lightning rate and how long they last.
7. **"Sunset light works on the clouds but not on the mist/fog/mountain
   cloud — those are always a whitish haze whatever colour the light is"**
   (and a white band in front of already-dark mountains at 18:00) → fog
   colour was a fixed neutral with **no sun-altitude and no sun-colour term**,
   while cloud faces had both. A fog bank is a cloud seen from beside it. Now
   `fogLum` dims with the low sun and takes the sunset tint, and a second
   endpoint `fogSunLum` carries the bright, strongly-tinted **forward-scatter**
   colour; the aerial term and the dome veil blend between them by the
   view/sun angle. That gradient is what makes the owner's hardest case read
   correctly — a distant bank, mountains behind it, the sun behind those: the
   bank glows warm where it is backlit and stays cool grey where it is not.
   Envelope proof extended to both endpoints (`skyScreenModel`, `lightRig.test`).
8. **"Cloud areas extrapolate in straight lines off the edge of the map to the
   horizon"** → the climate rasters are `ClampToEdge`, so every path sample
   taken beyond the province repeated the border pixel. All raster-driven
   densities now fade out at the border (`esInBounds`); the region extinction
   keeps a floor rather than vanishing, so the beyond-border apron still has
   air in it.
9. **"The mountain cloud looks painted onto the mountain, not cloud the
   summits stick up into"** → the belt mask hugged the terrain footprint
   exactly and had no internal structure. The mask is now dilated
   (`pow(mask, 0.6)`) so cloud spills off the massif, and each path sample is
   multiplied by a drifting two-octave noise lump (`esCloudLump`, drifting
   downwind on the sky's own cloud clock) so the band is a broken, moving
   body. ~~Known remaining limitation: banks invisible against open sky~~ —
   closed in round 5 §4 (dome fog march).

### Round 5 (owner playtest of round 4, 2026-08-30 → fixes same day)

The owner's core directive this round — **fog is not hand-painted; it is lit
by the real light** — is now the implementation's shape, not just its goal.

1. **"Mist/fog/haze now looks DARK GREY — distant mountains weirdly dark
   (image.png, force:clear afternoon); low mist dark grey from above; being
   in it just darkens the light. It was better when it was white — make it
   take the light's colour properly"** → two round-4 defects, one root class
   (authored fog constants instead of lit fog):
   (a) round 4 gave `fogLum` a hand sun-altitude dimming ramp
   (`0.18 + 0.82·smoothstep(0,15°)`) that dragged every bank grey; and
   (b) — the dark mountains — the round-4 visibility integration made the
   region murk STRONG (vis ~680 m renders real extinction), but that murk's
   inscatter asymptote was still the thin-haze `uHazeAmbient`, whose daylight
   value is ~0.05 screen: far terrain extinguished fully and collapsed to
   near-black. Fix: the fog colour block in `lightRig` is now **derived**:
   direct-sun irradiance × the sun's actual colour (so it dims and reddens
   through sunset with the real light, and dies under a storm deck because
   `sunDim` is already inside `sunIntensity`) + a sky term anchored to the
   dome's own screen curve (`skyScreenTarget` — raw skyE × the authored
   exposure curve INVERTS the arc, drawing overcast fog brighter at 07:00
   than noon) × a deck-absorption factor; multi-scattering desaturates the
   diffuse side, the forward lobe (`FOG_FORWARD`) throws the sun's full
   colour at the viewer looking into the light. And the boundary-layer/region
   murk (`dM`) now counts as fog-class in the aerial `fogFrac`, so daylit
   murk fades terrain into BRIGHT lit haze (white by day, warm at sunset),
   never the dim blue ambient. Night keeps the authored moonlit floor
   (the night scene is stylized ~10× above physics; a physical bank would
   glow) blended in screen space across twilight.
2. **"Rain still too slow — the actual descent speed on screen needs to be
   about double; keep speed ∝ intensity but raise the floor"** → `uFall`
   floor 4 → 8 m/s, top ~14 (+gust term). Deliberately above textbook
   terminal velocity at the drizzle end: the READ is what must be right.
   Streak length still derives from speed via the shutter, so length and
   speed cannot disagree.
3. **"Rain sits in small patches around the player with hard edges"** → that
   patch WAS the camera-following spawn volume: a 36 m box whose wall was a
   hard line of no-rain. Volume 72 m across, radial alpha fade over the
   outer quarter, budget 4200 → 12 000 (low tier 1600 → 4200) so near-field
   density holds. Larger weather-scale rain variation (the part the owner
   liked) still comes from the rain-amplitude raster.
4. **"Mountain cloud should be visible against open sky — a scatter effect
   lit by the real light would be"** → correct, and it now is: the dome
   shader runs `esSkyFog` (aerial.ts `DOME_FOG_GLSL`), a 12-step march of
   the SAME regime densities (belt, dawn mist, sea fog, region murk, weather
   fog) along each sky ray, veiling the dome by the accumulated optical
   depth with the same directional fog colour surfaces use. One bank, one
   colour, terrain or sky behind it. Being inside a bank falls out of the
   march's first samples, so this **replaces** the round-2 `uCamFog` camera
   veil (the number survives for probes/IBL-rebake). The march starts from
   an explicit `uEsFogCam` uniform because the PMREM bake renders from a
   cube camera at the origin. Plain humidity Mie is deliberately NOT in the
   march — the Preetham dome already carries it as turbidity. The
   polish-backlog "banks invisible against open sky" item is closed.
5. **"Cap-cloud stripes off the map edge are still there, different shape
   (image copy.png)"** → round 4 faded the raster samples at the border but
   kept the MIDPOINT sampling: a camera at 900 m looking down at the sea
   puts the path midpoint at belt altitude kilometres offshore, and border-
   ring mask bleed at that midpoint whited out whole sea fragments — the
   giant straight-edged slab. The mask/lump are now sampled where the path
   **crosses the belt altitude** (the only place belt cloud can actually
   be), so over-the-border crossing points fade to nothing and the slab is
   gone; probe `edge-sea-no-slab` covers the owner's exact viewpoint.
6. **"Clear and fair look identical; partly very sparse; broken nice; and
   the in-between days darken everything too much — the light already dims
   naturally when a cloud crosses the sun"** → (a) the state `cloud*` values
   are NOISE THRESHOLDS against a bell-shaped FBM, not sky fractions —
   cov 0.09 drew ~1 % of sky. fair/partly re-tuned to draw ~1/8 and ~3/8 of
   sky as seen (broken untouched — it read right). (b) exactly so: the
   fair-weather ladder's state-level `sunDim` double-counted the cloud-field
   `sunOcclusion` dimming; fair/partly/broken sunDim cut to 0.01/0.03/0.14
   (residual thin-spot diffuse loss only) — passing shade now comes from
   actual clouds crossing the actual sun, and gaps restore full light.
7. Probe harness: SwiftShader's renderer process accumulates memory across
   sequential scenarios and crashed mid-suite; the page is now recycled
   every 4 scenarios with one retry-on-crash. New scenarios:
   `edge-sea-no-slab`, `cap-cloud-open-sky`.
