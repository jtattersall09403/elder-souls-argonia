# Part V-b — World time, natural light, sky and weather (§93–98)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Climate *fields* live in
> [50-hydrology-climate.md](50-hydrology-climate.md) §33.1; this module owns the
> **clock, the celestial bodies, the light and the weather** that consume them.
>
> Required companions: canon —
> [world/sources/lore/topics/sky-moons-calendar.md](../../world/sources/lore/topics/sky-moons-calendar.md);
> climate model — [research/black-marsh-climatology.md](../research/black-marsh-climatology.md);
> technique + library verdicts — [research/natural-light-sky-atmosphere-threejs.md](../research/natural-light-sky-atmosphere-threejs.md).

## 93. Why light is a first-class world system

Black Marsh's identity "is as much air as water" (§33.1). Everything the player
reads about *where they are* — humid glow in the lowlands, crisp blue distance
in the border ranges, permanent dusk under the deep canopy, dawn mist pooling in
the basins, a black-water night lit only by torchbugs — is carried by light and
atmosphere, not by geometry. Two rules follow:

1. **Light is data, not decoration.** Sun, moon, sky, haze and weather are
   computed from the same province climate fields that drive palettes, foliage,
   flood and encounters. One source, many consumers (00-core rule 3).
2. **Nothing is judged under placeholder light.** Ground materials, asset kits,
   settlements and dungeons are approved under the light of *their own region
   and hour*. A material that reads right under a flat white hemisphere light
   and wrong under humid noon haze has not been approved. This is why the light
   stack lands **before** the asset catalogue (Phase 10) and settlement
   authoring (Phase 11), not after.

Everything here obeys the fixed-difficulty rule (0004): weather, darkness and
tides are **world state on a calendar**, never scaled to the player.

## 94. The world clock and calendar

A small, pure-data package (`packages/world-time`) with **no rendering
dependency**. It is the province's clock and every other system reads it.

**Canonical model** (canon detail and citations in the lore dossier): 365-day
year, 12 named months of 28–31 days with Argonian Jel names, 7-day week,
24-hour day, era 4E 201. A **28-night lunar cycle** (from the Argonian
calcinator's one-twenty-eighth nightly rotation), moon phase derived, not
stored. Solstices/equinoxes exist; day length varies little because the
province sits near the celestial equator.

```ts
interface WorldInstant {
  era: 1 | 2 | 3 | 4;
  year: number;          // 201
  month: MonthIndex;     // 0..11, names + Jel names from the calendar table
  day: number;           // 1..monthLength
  minuteOfDay: number;   // 0..1439, fractional allowed
}

interface WorldClock {
  now(): WorldInstant;
  /** Absolute, monotonic province time — the only thing systems should diff. */
  epochMinutes(): number;
  /** Deterministic: same instant → same sky, always. No wall-clock, no RNG. */
  setInstant(i: WorldInstant): void;
  rate: number;          // real seconds → world minutes; 0 = frozen (studio)
  season(): SeasonState; // scalar s(t) ∈ [-1 dry … +1 wet] + named season
  dayPhase(): DayPhase;  // night | astronomical | nautical | civil | sunrise |
                         // morning | noon | afternoon | sunset | dusk
}
```

Binding requirements:

- **Determinism.** The sky, weather and tide at a given `WorldInstant` are a
  pure function of that instant (plus seeded world state) — a save, a reload
  and a studio URL must reproduce the same frame. No `Date.now()` in world
  systems.
- **The season scalar `s(t)` already promised by the climate model
  (§33.1) is produced here** — the climatology fields (flood phase, mist
  propensity, rain amplitude) become time-varying only once this exists.
- **Time is pausable and scrubbable** — required by the studio and by
  screenshot probes.
- Consumers: light/sky (§95–97), weather (§98), flood/tide states (§36),
  ecology and spawn schedules (Phase 13), NPC schedules, shop hours, festival
  and Vampire-Day events, quest timers, alchemy/ritual gates (Phase 11+). The
  quest plan already assumes a season: seasonal causeway closures, the
  wintertide rootworm migration, breeding-season hazards — those states resolve
  from `season()`, not from ad-hoc flags.
- **Time-of-day is a gameplay contract, not just a look**: night changes
  visibility, AI perception, encounter tables and danger. Publish it through
  the environment-query contract so combat/AI read one authority.

## 95. Celestial model — sun, moons, stars

- **Ephemeris, not animation.** Sun and moon positions come from a small
  ephemeris (declination + hour angle → altitude/azimuth) parameterised by one
  province **latitude constant** and our own calendar — the *shape* of
  [SunCalc](https://github.com/mourner/suncalc)'s API, reimplemented against
  fictional time (see the research doc: do not take the dependency).
- **Twilight bands are defined by sun altitude** (−0.833° rise/set, −6° civil,
  −12° nautical, −18° astronomical), not by clock times, so they behave
  correctly at every season and latitude. Near the equator twilight is **short**
  — dawn and dusk are fast, dramatic colour events, and full dark arrives
  quickly. That sharpens the danger of being caught out in the marsh, and it is
  a deliberate point of difference from Skyrim's long northern gloaming.
- **Two moons, canon-shaped**: Masser (large, red-tinted) and Secunda (small,
  pale), each with independent rise/set and phase on the 28-night cycle;
  Masser is "well over twice" Secunda's size. Render as **lit spheres** so
  phase, terminator and relative size are correct by construction from the sun
  direction. Moonlight is a real, weak directional light (see §96), not an
  ambient tint.
- **Eclipses (Vampire Days)** occur several times a year, are on the calendar,
  and are a world-state event (undead/spirit surge) — authored once, spawned by
  date, never by player level.
- **Stars are authored, not random.** Thirteen canonical constellations rotate
  with the calendar; each month's constellation is up through its month; the
  three Guardians and their charges are placed as a coherent celestial sphere;
  the **Serpent's four "unstars" drift and read as dark anomalies**; the
  **Southron pole star** sits low and due south (it is the Argonian alchemical
  reference — canon). Star data is a small authored table in `world/sources/`,
  consumed by the renderer.
- **Moon-driven tides** (canon) tie the celestial model to the water stack:
  spring/neap amplitude modulates `FloodBasin.tidalAmplitude` (§36), changing
  delta channel depths and boat access windows. Wire it when Phase 8b water
  lands; the data exists from 8a.

## 96. The natural light model

**Light rig** (whole province, one implementation shared by studio and game):

| Element | Source |
|---|---|
| Sun directional light | ephemeris direction; colour + illuminance from an elevation curve (reddened and dimmed through the low-sun optical path) |
| Moon directional light(s) | ephemeris; illuminance scaled by illuminated fraction; cool, low |
| Sky ambient / IBL | PMREM bake of the sky dome, throttled by sun-elevation delta |
| Ground bounce | hemisphere/ground term tinted by the **regional ground palette** (0011) — red-clay Gideon bounces differently from black-water Blackrose |
| Local/artificial | torches, bioluminescence, forge, magic (later phases) |

- **Physical units and exposure.** Three.js lights are physically correct
  (lux); the sun-to-starlight range is eight orders of magnitude, so **tone
  mapping (ACESFilmic/AgX) and a slow eye-adaptation exposure curve are part of
  this system**, with a floor on night exposure so the world stays readable.
  Reference illuminance table in the research doc.
- **Shadows: cascaded shadow maps** are mandatory for a sun over kilometres of
  terrain — bundled three.js CSM, `practical` split, `fade`, `maxFar` capped
  well below draw distance, `castShadow=false` on distant LOD chunks. Integration
  gotchas (per-material setup on streamed chunks) are in the research doc.
- **Canopy is a light property of place.** Jungle and rootland classes darken
  and diffuse daylight to permanent dusk (§33.1). Prefer a compiled per-chunk
  canopy-occlusion/sky-visibility raster (it is a *place* property, cheap and
  stable) over a purely dynamic solution.
- **Night has a palette, not just less light**: bioluminescence (torchbugs,
  fungi, sap) is the deep-marsh night language; moonlit water and mist read
  bright against black canopy; settlements are lantern-islands. Night must
  never become an undifferentiated grey.
- **Interiors and dungeons** (Phase 12) consume the same clock and a per-cell
  lighting profile; window/entrance apertures sample the outdoor sky colour so
  a dungeon mouth reads as the same world.

## 97. Atmosphere: aerial perspective, haze and mist

The province's air is **computed from climate fields**, so mountains and
swamps differ without hand-authoring:

- **One aerial-perspective term**, height-modulated exponential inscatter with
  two components — a tall-scale-height **Rayleigh** term (blue distance) and a
  shallow **boundary-layer Mie** term (warm, strongly forward-scattering, `g`
  ≈ 0.85). The Mie density comes from the climate **humidity** field and the
  boundary-layer height; the result is the "golden glowing air" of the humid
  lowlands at low sun, and clear crisp light above the haze layer in the border
  ranges — from one formula, two densities.
- **Do not double-count**: the sky model's Mie and the scene fog term are the
  same physics. One authority (see the Unreal trap in the research doc).
- **Ground mist is a separate, bounded volume**, driven by the climate **mist**
  field's three distinct regimes (radiation mist pooling in inland basins at
  dawn in the dry/recession season; advection sea fog up the estuaries;
  cloud-forest whiteout in the montane belt). These look different and must be
  authored as different things.
- **Region grammar gains an atmosphere entry** (§16): alongside
  `materialPalette`, each region class carries characteristic turbidity,
  boundary-layer height, mist regime and night palette. Region identity is
  *air* as well as ground.
- **Visibility is gameplay**: haze and mist set draw distance, sight-lines,
  AI perception and encounter design. Publish the current visibility distance
  through the environment query, so combat/AI and the renderer agree.

## 98. Weather

Province-scale weather states (§33.1) with region-weighted frequencies from the
climate fields: monsoonal downpour, sea squall, dry-season haze, ground mist,
thunderstorm, overcast, clear.

- **Parameterised, not colour-authored.** Bethesda's `WTHR` record is the right
  *checklist* of what a weather state must say (sky upper/lower, horizon,
  ambient, sun/moonlight, fog near/far, cloud layers, directional ambient,
  water brightness, volumetric refs) — but we **compute** those from the sky
  model and climate fields and keep hand-authored values only as an override
  layer for specific moments. Rationale and citations: research doc §2.1.
- **Transitions are interpolated over minutes**, seeded per region and date so
  they are reproducible; frequency and volatility per region class.
- **Weather changes the world, not the difficulty**: wetness and grip, flood
  and channel state, visibility and AI perception, climbing surfaces (Phase 9),
  fire, boat handling and sea state (Phase 8b/9), creature activity (Phase 13).
- **Storm exposure is geographic** (open Padomaic coast vs the placid bays —
  climatology §3), so shipwrecks, storm shelters and coastal architecture have
  causal reasons to exist (00-core rule 1).
- Clouds: billboard/impostor layers at the base tier; volumetric clouds are a
  high-quality-tier extra, never a requirement.

## Tiers and sequencing

Three deliberate tiers, so the useful part lands early and the expensive part
lands once (phase numbering: Module 95 §86, statuses in PROGRESS.md):

**Tier 1 — Phase 8a, "natural light and sky" (before water).** The world clock
and calendar package; ephemeris sun/moons; Preetham sky dome driven by climate
turbidity; sun/moon directional lights with physical values, tone mapping and
adaptation; CSM shadows; the aerial-perspective term; night sky with authored
constellations; a first ground-mist pass; **studio tooling** (below). Water
(8b) is built *after* this because water rendering consumes sun, sky and IBL —
reflections, specular, refraction, underwater scattering — and would otherwise
be tuned twice.

**Tier 2 — Phase 8c, weather and atmosphere.** Weather state machine and
transitions, cloud layers, rain/squall/storm, the three mist regimes as
distinct systems, god rays/light shafts through canopy, wet-surface response,
weather↔flood↔tide coupling, quality tiers.

**Tier 3 — polish, folded into Phases 13/14.** Bioluminescent night ecology,
volumetric (froxel) fog on the high tier, seasonal foliage response, lightning
and weather audio, per-device-class quality budgets and performance gates.

Tier-1 code: `packages/world-time` (clock/calendar/ephemeris),
`apps/world-studio/src/sky/` (light rig, sky dome, stars/moons, aerial haze,
CSM, time panel), `world/sources/sky/star-catalogue.json` (authored sky),
`climate-air.png` from `worldgen.compile_hydrology` (humidity/mist/canopy).
Implementation choices: decision 0020.

**Studio tooling ships with Tier 1** (Module 85): a **time-of-day scrubber**, a
date/season field, weather-state selector, latitude/turbidity debug sliders,
one-click **region light presets** ("Blackrose basin, dawn mist", "Padomaic
coast, storm noon", "cloud-forest belt, clear afternoon"), all encoded in the
reproducible studio URL, plus fixed-instant screenshot probes so material A/B
comparisons are lit identically every run.

## Acceptance criteria (binding, per 00-core Part XIV)

- One clock: sky, weather, flood, tide, ecology and quests read a single
  deterministic world time; the same instant reproduces the same frame.
- The calendar is canon-correct (months, lengths, Jel names, week, 28-night
  moon cycle) and the night sky shows the thirteen canonical constellations
  rotating with it.
- Light and atmosphere are **derived from the climate fields**, not
  hand-painted per region; the mountain/lowland air contrast is visible and
  falls out of the humidity/boundary-layer data.
- No ground-material, asset-kit, settlement or dungeon approval happens under
  placeholder lighting; every visual gate from Phase 8a onward is lit by a
  named region/time preset.
- Darkness, weather and tides are world state on a calendar — never scaled to
  the player, never softened.
- Runs inside the browser performance budget on the mid device tier with
  volumetrics off; quality tiers are one declarative table.

---
