# 0095 — The audio runtime is an injected manager over an engine interface, fed by typed sound events; footsteps follow the physical material; ambience is a pure selection over the light's own inputs

**Date:** 2026-09-24. **Status:** accepted (sound-prep lane, round 2, under
0087's delegation). Builds on [0094](0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md);
it implements module 57 §106–107's runtime ahead of Phase 12b. It adds no app
wiring.

## Decisions

1. **The engine sits behind `AudioBackend`** (`packages/audio/src/backend.ts`):
   clock, resume, decode, release, bus gain and lowpass, groups, voices
   (start, position, stop, ended). The interface enforces one automation
   rule:
   - a voice's envelope (fade in, hold, fade out before its stop) is fixed
     when it starts and never changed;
   - anything that changes during a voice's life (a bed's level, its
     leaving fade, an emitter's position) acts on the voice's **group**;
   - a group carries one automation stream at a time, and each ramp starts
     from the group's value now.
   The first review found stacked ramps cancelling each other's scheduled
   fades, and this rule is the fix. `ThreeAudioBackend` implements the
   interface:
   - three's `AudioListener` owns the context and rides the camera the app
     passes to `createThreeAudio(camera)`;
   - voices are plain Web Audio nodes with an `equalpower` panner, not
     `PositionalAudio`, which hard-codes HRTF and needs a scene node per
     sound (research §3.1);
   - ramps track their own linear state, because Firefox lacks
     `cancelAndHoldAtTime`;
   - `FakeAudioBackend` is the deterministic test double.
2. **`AudioManager` is constructed and injected by the app.** It holds no
   module state. It owns:
   - buses (`master` → ambience, weather, combat, movement, object, ui,
     music) and the unlock;
   - streaming through `AssetCache`. A clip loads on first use, or
     through `prefetch` for a scene's sets, which stay pinned until
     `unpin`. It is retained while it plays. A failed load is retried at
     most every 30 s of wall-clock time; the audio clock is not used,
     because it stands still until the first gesture. An unpinned clip unloads after
     60 s idle, and the idle clips kept for reuse stay under 16 MB decoded.
     Playing and pinned clips are the scene's working set: 12 median beds
     decode to about 19 MB and every combat clip to about 32 MB, so a scene
     prefetches its own subset;
   - one-shots fired before the first gesture (a suspended context whose
     clock stands still) are dropped, never queued to burst on unlock. The
     app calls `unlock()` on every gesture, which re-resumes after an iOS
     interruption;
   - one-shots with Skyrim's no-repeat variant pick and the SNDR's dB and
     pitch variance;
   - voice budgets against research §4.3's ~24:
     - steady state is 4 ambience beds (the loudest), 4 emitters (the
       nearest) and 12 one-shots, 20 voices in all;
     - a transition adds the beds and emitters still fading out, at most
       one more set of each, and the oldest fade is cut to 0.1 s beyond
       that, so the worst case is 28 voices for one fade;
     - when the one-shots are full, the oldest lowest-priority one is
       stolen with a 30 ms fade (the one change a voice's envelope takes),
       and its clip is released once, when its stop lands;
     - a bed plays a second voice only during its 50 ms cycle crossfade;
   - distance culling (60 m; nothing is loaded for a culled event);
   - the late drop: an action sound whose clip arrives more than 0.15 s late
     is dropped, while ambient ones may arrive up to 5 s late;
   - the bed player, running 0094 §4's crossfade: each cycle starts at
     `loopStart`, the previous one ramps out over `fadeS` inside the pad,
     and a leaving bed keeps cycling until its fade-out ends;
   - positional emitters (`addEmitter`, `moveEmitter`, `removeEmitter`),
     which play the same loop on a positioned group, only within hearing
     range. Hysteresis applies at the range edge (10 %) and at the budget
     edge (an audible emitter ranks 15 % nearer), so nothing flaps. An emitter fades out over 1 s when
     it leaves range, and its clip may unload. A bed or emitter that comes
     back while fading returns on its own group; it never stacks a second
     one;
   - Poisson detail rolls, never covering more than 0.5 s of elapsed time
     in one update (a hidden tab does not fire every detail at once), and
     the acoustic-state bus filters:
     - underwater: the world buses lowpassed to 400 Hz at −6 dB;
     - interior: ambience and weather at 800 Hz and −12 dB;
     - canopy: weather lowpassed to 6 kHz at 0 dB. Under canopy the level
       is the selection's job, since rain and wind scale by canopy;
   - a disposed manager ignores every call, including clip loads still in
     flight.
   Randomness is injected, so a seeded run is reproducible.
3. **Gameplay speaks typed sound events, never file names**
   (`src/events.ts`). The families are Skyrim's own: swing, hit (weapon ×
   target), block, parry, bash, draw, sheathe, bow nock, pull and release,
   footstep (footwear × gait × surface), jump, land, swim and splash.
   Continuous sounds are emitters, not events.
   `candidateSets` resolves an event to set ids with fallbacks; a test checks
   that every combination in the vocabulary reaches a shipped set. Parry has
   no vanilla sound, so it plays the guard's bash (an active strike, the
   closest vanilla sound).
4. **Events travel on an injected `SoundEventBus`**, so the stealth
   detection service (0092) hears the same events as the speakers, whether
   or not audio is on. The mapping from event to noise loudness lives with
   the perception code (the combat lane), not here. The event carries `at`
   (position) and `source` (entity id) for it. A listener that throws is
   isolated: the others still hear the event, the emitter never sees the
   error, and the error goes to the bus's `onError`.
5. **Footsteps follow the physical material** (module 75 §54, 0011).
   `footstepSurface` resolves in this order:
   - water depth at the foot: a film is `puddle`, and 0.08 m or more is
     `water` (Skyrim's wading set). Walking or swimming is the movement
     mode's call: 0093 switches at 1.05 m, and a swimming actor fires
     `movement.swim`, not footsteps;
   - a collider's `PhysicalMaterialId` (the §54 list; the type moves to
     `contracts` when the registry exists);
   - the terrain's ground-material id (0011's 40 ids, held by a test to the
     shipped `materials.json`).
   The ground-to-surface map is by material name. Mud-family ground plays
   `mud`, which is vanilla dirt until the mud set is sourced (0094).
6. **Ambience is a pure selection** (`src/ambience.ts`). Its inputs are the
   fields that already drive light and weather:
   - the region class id (worldgen `REGION_CLASSES`);
   - world-time `DayPhase` and `SeasonName`;
   - world-weather `WeatherSample.state`, `rainIntensity` and `windSpeedMS`;
   - `LocalClimate.canopy`;
   - the acoustic state.
   `parseAmbienceTable(json, manifest)` checks the table's `schemaVersion`,
   its region keys (worldgen's class ids, held by a test to `regions.py`),
   its layers and every row. It accepts only known condition keys and
   valid values (bands, day phases, seasons, weather states, acoustic
   states, numeric thresholds), numeric gains, rates and radii, and beds
   and details that name looping and one-shot sets in the manifest. A
   detail set listed by two layers rolls once, as the row with the higher
   rate (its gain and placement with it). A detail radius beyond hearing
   range is rejected, since it would never sound. `selectAmbience` refuses any other version. The table has per-region
   layers, a weather layer that plays everywhere
   (§106) and an underwater layer that replaces both. Beds carry
   conditions (time band, day phase, season, weather, rain, wind, acoustic
   state) and an optional scale by rain, wind or open sky; details carry a
   Poisson rate per minute and a placement radius. The same inputs always
   give the same selection. Tables are world data, authored in Phase 12b
   under `world/sources/audio/`; this package holds the shape and a test
   fixture.

## Consequences

- The combat lane replaces `game-core/src/fx/audio.ts`'s no-op
  `combatAudio` singleton with an injected `SoundEventBus`. The events to
  fire are in the lane's handoff; the singleton and its call sites are the
  combat lane's to remove.
- The studio's ambience wiring (clock, weather, region and acoustic inputs
  → `selectAmbience` → `setAmbience`) is a polish-backlog row until 16h
  part 2 or later.
- Tuning by ear (bed gains, detail rates, the acoustic filters) is the 12b
  owner gate (module 57 §108); every number here is a starting value.
