# Sound-prep lane (Opus lead, decision 0087)

Prepares the audio layer ahead of Phase 12b (the soundscape stays polish tier,
[0023](../../decisions/0023-soundscape-polish-tier-and-credits.md)). The lane
builds the pipeline from vanilla sources to shipped files, the runtime
package the apps inject, and the budget gate. It does not wire any app:
the combat lane and 16h (or later) consume it through the handoffs below.
Design: [module 57](../../world/57-audio-soundscape.md) §105–108 and the
[research](../../research/rendering/ambient-audio-soundscape-threejs.md);
decisions [0094](../../decisions/0094-audio-ships-as-opus-webm-sets-read-from-the-plugin-loops-crossfade-at-runtime.md)
(files and pipeline) and [0095](../../decisions/0095-audio-runtime-is-an-injected-manager-over-an-engine-interface-fed-by-typed-sound-events.md)
(runtime).

## Folders

- **Owns:** `tooling/audio-pipeline/**`; `packages/audio/**`; this doc and
  its row in [README.md](README.md); new decision records; its PROGRESS
  side-lanes row; root README § Credits only when a mod pack is sourced.
- **Never touches:** 16h's folders (`tooling/world-generation`,
  `tooling/asset-pipeline`, `packages/game-core/src/settlement`, `world/`,
  `apps/world-studio`, `docs/phases/16-*`, root `README.md` outside the
  credits section, root `package.json`); the combat-sandbox lane's folders
  (`apps/combat-sandbox`, `packages/game-core/src/{combat,equipment,anim,locomotion,inventory,core,actors,ai,perception,fx}`,
  `packages/character`, `packages/text-catalogue`).

## Rounds

| Round | What | Status |
|---|---|---|
| 1 | Pipeline: BSA inventory, plugin-read sets, Opus/WebM converter with loop-safe beds, manifest + provenance; sample-first (25 + fresh 27 + fresh 27), then the first consumers (combat, movement, marsh/water/wind, rain/thunder) | delivered 2026-09-24 |
| 2 | `packages/audio`: AudioManager behind an engine interface, buses, event vocabulary, footstep and ambience contracts, positional emitters, streaming, tests with a fake backend ([0095](../../decisions/0095-audio-runtime-is-an-injected-manager-over-an-engine-interface-fed-by-typed-sound-events.md)); handoffs to the combat lane and the studio | delivered 2026-09-24 |
| 3 | Phases README § 12b "what exists"; the audio in the site budget (`packages/audio/budget.json`, compose.mjs gates: counted once and reserved before any app ships it, one copy, copy equals manifest; the package test checks the same lines); backlog row for the studio wiring | delivered 2026-09-24 |

## Commands

From `tooling/audio-pipeline`:

- `python3 -m audio_pipeline.inventory`: the BSA folder summary (`inventory.json`).
- `python3 -m audio_pipeline.esm_sounds --prefix AMBr`: browse Skyrim.esm's SNDR records.
- `python3 -m audio_pipeline.build`: `selection.json` → `packages/audio/files` + `provenance.json` (~70 s).
- `python3 -m audio_pipeline.build --check`: every file and every loop join against the manifest.

## Sourcing register

| Gap | State | Evidence and candidates |
|---|---|---|
| Mud footsteps (booted and barefoot), knee-deep wading | OPEN, blocked on a planner call | Skyrim.esm maps `MaterialMud` to the dirt sounds; `footstep.*.mud` plays dirt. No Skyrim mod ships booted mud steps. Barefoot Footstep Extended (Nexus SE 40308, file 555823, epsadin; reuse allowed, source of its sounds unstated) has a barefoot `Mud` folder, but its plugin link to `MaterialMud` is unverified. Booted steps exist only as CC0 or CC-BY field recordings (Freesound 376809 CC0; BigSoundBank s0495 CC0; omnisounddesign pack 18925 CC-BY 4.0). The open call: whether cutting single steps out of a sourced recording is sourcing or making (the no-art rule). |

## Handoffs

What the consumers wire. The sound-prep lane edits none of these folders.

### To the combat-sandbox lane: firing sound events

Package: `@elder-souls/audio` (packages/audio). Decisions: 0094 covers files
and pipeline, 0095 covers the runtime. The README has the API. The combat
lane owns every change below: the edits fall in its folders, and the
sound-prep lane touched none of them.

#### 1. Injecting the manager and the event bus
The fix replaces the no-op singleton `combatAudio` in
`packages/game-core/src/fx/audio.ts` with two injected objects.

- Create both in the APP. For the sandbox that is `apps/combat-sandbox/src/App.tsx`, where `combatAudio.unlock()` runs today:
  ```ts
  const base = `${import.meta.env.BASE_URL}audio/`;
  const manifest = parseManifest(await (await fetch(`${base}audio-manifest.json`)).json());
  const { backend } = createThreeAudio(camera);            // from "@elder-souls/audio/three"
  const audio = new AudioManager({ backend, manifest, baseUrl: base, listenerPosition: () => camera.position });
  const sounds = new SoundEventBus(); audio.attach(sounds);
  // first pointerdown/keydown: audio.unlock();   per frame: audio.update();
  ```
- Hand `sounds` to `CombatRuntime` through its injected host (0089). Every emitter calls `sounds.emit(...)`. Nothing imports a module-level audio object.
- Vite: add `audioFiles()` from `@elder-souls/audio/plugin` to `apps/combat-sandbox/vite.config.ts`. If the studio later ships the files too, one app passes `{ sharedBase }` so the Pages site carries one copy.
- Add `"@elder-souls/audio": "^0.1.0"` to the consuming package.json. The lockfile already knows the workspace.
- Delete `fx/audio.ts` once no call site is left.

#### 2. The events to fire, mapped from today's `combatAudio.play(kind)` calls
Every event takes `at` (the world position of the sound) and `source` (the
entity id). Omit `at` for the player's own sounds, which then play 2D.

| Today | Fire instead | Class mapping |
|---|---|---|
| `play("swing")` (the attack's active frame) | `{type:"combat.swing", weapon: SwingClass}` | dagger/shortSword/straightSword/scimitar/rapier/katana/claw → `blade`; axe → `blade-axe`; mace → `blunt-1h`; greatsword/greataxe/warhammer/spear/pike/halberd/staff → `2h`; unarmed → `unarmed` |
| `play("hit")` (a blow lands) | `{type:"combat.hit", weapon: ImpactWeapon, target: ImpactTarget}` | weapon: bladed one-handers → `blade`; axe → `axe`; greataxe/halberd → `axe-large`; mace → `blunt`; greatsword/spear/pike/katana (two-handed) → `blade-2h`; warhammer/staff → `blunt-2h`; unarmed → `unarmed`; bows → `arrow`. target: the struck body's material: `flesh` unarmoured, `armor` for light or cloth armour, `metal` for heavy plate or metal skin, `wood`/`dirt`/`other` for world geometry (a collider's §54 material). For arrows: `stick` when the arrow embeds (0090 projectile response), `bounce` on a ricochet, `shield-light`/`shield-heavy` on a shield. |
| `play("guard")` (a blocked blow) | `{type:"combat.block", guard: GuardClass}` | shield by weight: light → `shield-light`, heavy → `shield-heavy`; blocking with a weapon: blade-1h, blade-2h, axe, blunt-1h, blunt-2h or bow from the held class |
| `play("parry")` | `{type:"combat.parry", guard}` | same guard classes. It plays the vanilla bash, the closest sound; no parry sound exists. |
| shield bash (if added) | `{type:"combat.bash", guard}` | as block |
| equip, unequip | `{type:"combat.draw" \| "combat.sheathe", weapon: DrawClass}` | dagger/shortSword → `blade-small`; straightSword/scimitar/rapier/katana/claw → `blade-1h`; greatsword → `blade-2h`; axe → `axe-1h`; greataxe/halberd → `axe-2h`; mace → `mace-1h`; warhammer/staff/spear/pike → `blunt-2h`; bows → `bow`; off-hand weapon (0091) → `left-hand` |
| bow cycle (0090; the cycle sits outside the FSM) | `bow.nock` on nock, `bow.pull` when the draw starts, `bow.release` on release | none |
| `play("roll")` | `{type:"movement.land", footwear, surface}` at the roll's ground contact | vanilla has no roll sound; the landing thump is the closest |
| `play("heal")`, `play("death")` | no event yet | potion and death vocal sets are not in the round-1 selection; ask the sound lane |

#### 3. Footsteps (fire one event per foot plant, not per frame)
- `{type:"movement.footstep", footwear, gait, surface, at, source}`:
  - footwear: none → `barefoot`; light or cloth boots → `light`; heavy boots → `heavy`.
  - gait: from the stride thresholds `locomotionNoise` already uses (walk, run, sprint, sneak = crouching).
  - surface: `footstepSurface({ physical, groundMaterialId, waterDepthM })` from `@elder-souls/audio`. In the sandbox arena, pass the floor collider's §54 material (e.g. `"stone"` or `"soil"`) until the world supplies it.
- The plant moment: the stride clip's foot contact. Use the clip's foot-down times when the animation layer exposes them; until then, time it by stride phase. Never time it by distance travelled alone.
- Jumps: `movement.jump` on take-off and `movement.land` on landing, with the same footwear and surface.
- Swimming (0093): `{type:"movement.swim", stroke:"stroke"|"tread"}` per stroke cycle, and `movement.splash` on entering the water.

#### 4. The stealth feed (0092) hears the same bus
Subscribe the perception step to `sounds`. Map each event to a
`NoiseEvent` there, in the combat lane's code, so audio stays free of
game-core:

| Sound event | NoiseEvent |
|---|---|
| footstep, gait walk | `walk` |
| footstep, gait sneak | `walkSneaking` |
| footstep, gait run | `run` |
| footstep, gait sprint | `sprint` |
| `movement.land` | `jumpLanding` |
| roll | `roll` |
| `combat.swing` | `attackSwing` |
| `combat.block` / `combat.parry` | `blockHit` |

Heavy footwear could add loudness; that is a 10c tuning call. The event's
`source` attributes the noise to its maker, and `at` is its position. The
noise is heard even when the player has muted audio, because the bus is
independent of the manager.

#### 5. Carried light (0091)
A carried torch is an emitter, not an event:
- `audio.addEmitter("<entity>-torch", "object.torch.burn", pos)` when it is lit;
- `moveEmitter` every frame;
- `removeEmitter` when it is doused, stowed or submerged (the submerged hook).

#### 6. Test hook
In unit tests, use `FakeAudioBackend` with a seeded `random` (see
`packages/audio/src/manager.test.ts`). `backend.voices` records exactly
what played.

### To the world studio (16h part 2 or later): ambient beds

Package: `@elder-souls/audio`. Decisions: 0094 (files) and 0095 (runtime).
Polish-backlog row: "Studio ambience wiring". Nothing below was done by the
sound-prep lane; `apps/world-studio` and `world/` belong to 16h.

#### Wiring (in the studio app, not in a package)
1. `vite.config.ts`: `audioFiles({ sharedBase? })` from `@elder-souls/audio/plugin`. On Pages, whichever app deploys second passes `sharedBase` so the site carries one audio copy (standard 16).
2. Create the objects where the renderer and camera are created:
   - `createThreeAudio(camera)`;
   - `new AudioManager({ backend, manifest, baseUrl: \`${BASE_URL}audio/\`, listenerPosition })`;
   - `audio.unlock()` on the first gesture;
   - `audio.update()` every frame, through the existing frame scheduler.
3. Ambience inputs, all of which the studio already computes:
   - `regionClass`: the region-class raster at the camera;
   - `dayPhase`: `dayPhaseAt(epochMinutes)`;
   - `season`: `seasonState(...).name`;
   - `weather`, `rainIntensity`, `windSpeedMS`: `weatherSampleAt(epochMinutes, localClimate)`;
   - `canopy`: `LocalClimate.canopy`;
   - `acoustic`: `underwater` when the camera is below the water surface, `interior` inside a cell, `canopy` when canopy > 0.6, otherwise `exterior`.
   Recompute `selectAmbience(table, inputs)` only when an input changes band (region, day phase, weather state, rain in 0.1 steps, acoustic state). Call `audio.setAmbience(sel)` and `audio.setAcousticState(inputs.acoustic)` then, not every frame.
4. Rivers, rapids, shores and waterfalls (§106 "compiler-placed emitters"):
   - one `addEmitter` per feature;
   - `moveEmitter` to the nearest point of the feature's polyline as the camera moves (one virtual emitter per river, research §4.2);
   - the manager plays and loads a feature only within 60 m.
   Sets in round 1: `ambient.water.river`, `.stream`, `.stream-falls`, `.rapids-small`, `.rapids-medium`, `.coast-waves`, `.coast-waves-distant`, `.boat-lap`, `ambient.waterfall.small|medium|large|large-distant|splatter-small`.
5. The URL layer: `&audio=0` mutes, following the other layer switches.

#### The ambience table
It is world data. Phase 12b authors it in `world/sources/audio/` per module
57 (§106) with `schemaVersion: 1`, in the `AmbienceTable` shape. A fixture
showing the shape is in `packages/audio/src/ambience.test.ts`. The vanilla
Morthal marsh table ships as sets `ambient.marsh.*`, each carrying its
vanilla chance and weather flags in `source.region`, so a first table can
be drafted from them:
- crickets beds for day, morning and night;
- the frogs-night bed;
- the wind bed plus gusts;
- bird and insect one-shots as details;
- `weather.rain.*` beds scaled by rain;
- thunder details in a thunderstorm;
- `ambient.underwater.bed` for the underwater layer.
Module 57 §106 says a tropical marsh is loudest at night. The density is an
owner taste gate (§108).

#### Budget
- The marsh exterior sets with rain, thunder, river and underwater cost 1.5 MB when all of them are fetched.
- Only what a scene selects is fetched.
- The site budget counts the whole `files/` tree once (round 3).
