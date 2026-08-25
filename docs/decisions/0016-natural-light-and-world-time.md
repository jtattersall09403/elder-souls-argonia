# 0016 — Natural light, sky and world time are a first-class system, sequenced before water

**Date**: 2026-08-25 · **Status**: accepted (owner request 2026-08-25: "do we
have a first-class natural light system in the plan?"; plan gap confirmed and
filled)

## Context

The plan had only two bullets on this (§33.1: "full day/night cycle" and a
weather sentence), with rendering vaguely deferred to "the Phase 8
water/atmosphere stack". There was **no world clock or calendar** anywhere in
the plan or the code, so the season scalar `s(t)` that the climate model
already depends on had no producer, and no moon, star, twilight, haze or
exposure model existed. Meanwhile the studio lights everything with a fixed
hemisphere + directional pair, which is what every ground material so far has
been judged under.

## Decision

1. **A new plan module, [world/55-light-sky-time.md](../world/55-light-sky-time.md)
   (§93–98)**, owns the world clock and calendar, the sun/moon/star model, the
   light rig, aerial perspective and mist, and the weather state machine.
   Module 50 keeps the climate *fields*; module 55 owns everything that
   consumes them over time. Sections §93–98 are newly allocated (the old plan
   ended at §92).
2. **The world clock is a separate, pure-data package** (`packages/world-time`)
   with no rendering dependency, because its consumers are mostly not visual:
   flood/tide states, ecology and spawn schedules, NPC schedules, festivals,
   quest timers, alchemy gates. It produces the season scalar `s(t)`.
   Determinism is binding — same `WorldInstant` → same frame, no `Date.now()`
   in world systems.
3. **Phase 8 splits into 8a (world time + natural light + sky), 8b (water),
   8c (weather + atmosphere)**, in that order. Light before water because
   water rendering consumes sun, sky and IBL — reflections, specular,
   refraction, underwater scattering — and would otherwise be tuned twice; and
   before Phases 10/11 so no asset kit or settlement is ever approved under
   placeholder light. Tier-3 polish (bioluminescent night ecology, volumetric
   fog, seasonal foliage, eclipse world states) folds into Phases 13/14.
4. **Light and air are computed from the climate fields, not hand-authored per
   region.** Bethesda's `CLMT`/`WTHR` records are adopted as the *checklist* of
   what a weather state must express, and rejected as an authoring model — we
   compute those quantities and keep hand-authored values only as an override
   layer. The mountain-crisp / swamp-golden contrast falls out of one
   aerial-perspective formula with two aerosol densities (boundary-layer Mie
   from the humidity field).
5. **Canon binds the celestial model**: 365-day calendar with Jel month names,
   thirteen constellations rotating with the calendar, Masser/Secunda with a
   **28-night** cycle (from the canonical Argonian calcinator rotating one
   twenty-eighth per night — *not* Skyrim's engine-side 24-day cycle), the
   Southron pole star, moon-driven tides, calendared eclipse "Vampire Days".
   Dossier: [world/sources/lore/topics/sky-moons-calendar.md](../../world/sources/lore/topics/sky-moons-calendar.md).
6. **Near-equatorial sky geometry** (EXTRAPOLATED from the canonical Southron
   pole star + tropical climate): near-zenith noon sun, **short twilights**,
   near-constant day length, high moon paths. One latitude constant, retunable
   at the gate.

## Consequences

- Studio gains a time-of-day scrubber, date/season field, weather selector and
  named region light presets in the reproducible URL (module 85); from 8a
  onward every visual gate is lit by a named region/time preset, and screenshot
  probes pin a fixed instant so A/B material comparisons are lit identically.
- 00-core acceptance gains: darkness/weather/tides are calendared world state,
  and nothing visual is approved under placeholder light.
- Library verdicts (recorded in
  [research/natural-light-sky-atmosphere-threejs.md](../research/natural-light-sky-atmosphere-threejs.md)):
  adopt three.js `Sky` (Preetham) and bundled CSM; port SunCalc's *math* rather
  than depend on it (our calendar is fictional); reject
  `@takram/three-atmosphere` for now (Lambertian-only, incompatible with our
  PBR terrain and characters); volumetric froxel fog is a high-quality tier
  only.
- Tone mapping and exposure/eye-adaptation become part of the light system
  rather than renderer trivia — the sun-to-starlight range is eight orders of
  magnitude.
