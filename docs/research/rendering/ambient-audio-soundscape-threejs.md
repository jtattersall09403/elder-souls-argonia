# Environmental audio: the province soundscape in a browser (three.js) — research, 2026-08-26

How to give a province-scale Black Marsh region-distinct, time-of-day-aware,
weather-aware ambient sound, positional emitters and material-driven contact
sounds, on Web Audio / three.js, shipped to GitHub Pages. Companion to
[natural-light-sky-atmosphere-threejs.md](natural-light-sky-atmosphere-threejs.md)
(same world clock, same climate fields, same weather machine drive this
system). The plan that consumes this should live beside world module
[55-light-sky-time.md](../../world/55-light-sky-time.md); region classes come from
[20-province-design.md](../../world/20-province-design.md); the climate fields
from [black-marsh-climatology.md](../world-terrain/black-marsh-climatology.md).

## 1. The vocabulary: anatomy of an open-world soundscape

Every serious open-world audio stack decomposes into the same six layers
(GDC canon: [Bringing Ambience to the Foreground, Orland 2009](https://www.gdcvault.com/play/1388/Bringing-Ambience-To-The-Foreground);
[Open World Audio in Dying Light 2](https://gdcvault.com/play/1029272/Open-World-Audio-in-Dying);
[The Sound of GTA V](https://gdcvault.com/play/1020587/The-Sound-of-Grand-Theft);
[Game Audio Learning: How To Make Ambiences](https://www.gameaudiolearning.com/knowledgebase/how-to-make-ambiences-for-games)):

| Layer | What it is | Our driver |
|---|---|---|
| **Ambience bed** | 1–4 looping 2D (non-positional) loops per place: air tone, insect wash, canopy rustle, distant water | region class + biome fields |
| **Detail one-shots** | randomly timed, randomly panned single sounds: bird call, frog croak, branch crack, distant splash | region sound table (Morrowind-style, §2.1) |
| **Positional emitters** | looping 3D sources bound to world features: river reach, waterfall, insect swarm, geyser, village | world compiler places them from hydrology/settlement data |
| **Weather layer** | rain loop (+ surface variants), thunder one-shots, wind intensity | weather machine state + intensity |
| **Contact layer** | footsteps, landings, impacts, foliage brushes, keyed to surface material | terrain material + collider material (§2.3) |
| **Acoustic state** | interior / exterior / underwater / canopy: filters, reverb, occlusion | volume triggers + water plane + dungeon cells |

Cross-cutting behaviours the layers share: **day/night crossfade** (crickets
and frogs are a *night bed*, birds a *day bed*, blended through dawn/dusk
bands — exactly the twilight bands the sky system already computes),
**weather ducking** (rain/wind lowers and low-passes wildlife — animals go
quiet in storms), **interior/exterior transition** (exterior bed ducked and
low-passed when inside, not stopped — you still hear muffled rain), and
**voice management** (only the N nearest/loudest emitters get real voices;
the rest are "virtual" — tracked but silent, promoted when in range). The
Wwise idiom for all of this — a time-of-day parameter crossfading blend
tracks, rain/wind intensity parameters driving volume + lowpass on every
other layer, discrete states for interior/combat — is documented end-to-end
in [KRUG-BASSE's Wwise ambience system](https://kbsounddesign.wordpress.com/2017/01/25/wwise-ambience-system/)
and [CRYENGINE's time-of-day audio tutorial](https://docs.cryengine.com/pages/viewpage.action?pageId=44964992);
we reproduce the *pattern* (continuous params for time/intensity, discrete
states for place) with plain gain ramps.

Dying Light 2's headline lesson for province scale: emitters are **not
hand-placed** — automatic systems distribute ambience generators and reverb
zones across the map from world data ([GDC](https://gdcvault.com/play/1029272/Open-World-Audio-in-Dying)).
That matches our world-compiler architecture exactly: rivers, falls, swarm
volumes and reverb hints should be emitted by the compiler alongside meshes.

## 2. How Bethesda did it (we lean Morrowind)

### 2.1 Morrowind: region-weighted random sounds — the model to copy

Morrowind's REGN record is tiny and brilliant: per region, an ordered list of
`SNAM` subrecords, each **a sound ID + a chance byte**; the engine rolls
periodically and plays winners as randomly-panned one-shots. The same record
holds the weather chance table (clear/cloudy/foggy/overcast/rain/thunder/ash/
blight), so a *region* fully answers "what does this place sound like and what
weather does it get" ([UESP TES3 format](https://en.uesp.net/wiki/Morrowind_Mod:TES3_File_Format),
[Dave Humphrey's ESM spec](https://gist.github.com/timurgen/c9ed3f8aff29ae01cd5ab10e413f64f8)).
Rain/thunder/ashstorm loops come from the weather state, not the region list.
That sparse, stochastic texture — long quiet, then a cliff racer cry — is a
big part of Morrowind's exploratory feel and is *cheap*: no authored
multi-loop beds, just a table and a dice roll. **Verdict: adopt as the core
schema**, with two upgrades Morrowind lacked: per-entry time-of-day band and
weather flags (both of which Skyrim added, next section).

### 2.2 Skyrim: the fuller schema (SNDR / REGN / acoustic space / REVB)

- **Sound Descriptor (SNDR)** — the atom: a *set* of .wav variants randomly
  picked per play, + category (mix bus / ducking group), + output model
  (mono/stereo, attenuation curve, "takes reverb?"), + static attenuation and
  random dB variance, + **conditions** (e.g. time of day, in combat)
  ([CK wiki: Sound Descriptor](https://ck.uesp.net/wiki/Sound_Descriptor)).
  Variant-set + dB variance is the standard anti-repetition trick — adopt.
- **Region sounds (REGN → RDSA)** — each region's Sound tab is a list of
  `{SNDR formid, weather flags (Pleasant/Cloudy/Rainy/Snowy), chance float}`
  ([UESP REGN format](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/REGN)).
  Modder practice: "bed" loops at chance 1.0, detail one-shots at 0.04–0.12
  per roll — see vanilla `WeatherForestPine` etc. So Skyrim's exterior
  ambience = Morrowind's model + weather gating + always-on bed entries.
  Time gating rides on SNDR conditions, not the region entry.
- **Acoustic Space (ASPC)** — per interior cell: a looping ambient SNDR, a
  **reverb preset (REVB)**, and optionally "use sounds from region X" so a
  cave can share the swamp's frog table
  ([CK wiki: Acoustic Space](https://ck.uesp.net/wiki/Acoustic_Space)).
  REVB is a small parametric-reverb parameter block (a dozen presets game-wide
  — room/cave/cathedral scale). Community fix mods exist purely because
  Bethesda misassigned spaces ([Acoustic Space Improvement Fixes](https://www.nexusmods.com/skyrimspecialedition/mods/78992))
  — i.e. assignment should be derived from geometry class, not hand-set per cell.
- **Weather (WTHR)** records carry their own looping sounds (rain, wind,
  thunder rolls); region weather tables (RDWT) pick weathers, weathers bring
  their audio. Our weather machine should do the same: audio is a *property of
  the weather state*, not of the region.

### 2.3 Footsteps: the FSTP → FSTS → IPDS chain

Animation events (`FootLeft`…) fire **Footstep (FSTP)** records grouped into
**Footstep Sets (FSTS)**; the material actually stood on selects the sound via
**Impact Data Sets (IPDS)** — a table keyed by material type with per-gait
variants (walk/run/sneak, L/R) ([UESP FSTS](https://en.uesp.net/wiki/Tes5Mod:Mod_File_Format/FSTS),
[CK wiki Footstep](https://wiki.bethesda.net/wiki/creationkit/Skyrim/Footstep/)).
Material comes from **two sources**: landscape textures (LTEX carry a material
type) and mesh Havok collision materials — and desyncs between visual texture
and material tag are Skyrim's most common audio bug
([modder discussion](https://forums.nexusmods.com/topic/13517478-how-to-add-or-change-footstep-sound-via-material-or-mesh/)).
**Implication for us:** our terrain splat layers and static colliders must
carry an explicit `surfaceMaterial` enum (mud, shallow-water, root, stone,
sand, wood, foliage) in the world-compiler output, sampled at the foot
position; never infer material from the rendered texture at runtime. Hook it
to the animation layer's existing foot-plant events (the sandbox already emits
these for the combat controller).

### 2.4 The asset library and formats

Vanilla sounds ship in `Skyrim - Sounds.bsa` (+ Voices BSAs), unpacking to
`sound/fx/...` — ambience under `sound/fx/amb/`, footsteps under
`sound/fx/fst/`, weather under `sound/fx/amb/` and `wthr`, UI under
`sound/fx/ui/`. Formats: **.wav** (most fx, 44.1 kHz 16-bit), **.xwm**
(xWMA — music and long ambience loops; ffmpeg decodes it), **.fuz** (voice:
xwm + lipsync container — irrelevant to ambience)
([format overview](https://steamcommunity.com/app/72850/discussions/0/1694920442947516233)).
**Our vault currently has only Meshes/Textures/Animations BSAs — the Sounds
BSA is a sourcing job** (same depot pull as the others; then batch-convert
wav/xwm → Opus for the web build).

### 2.5 Music (one paragraph, out of scope otherwise)

Morrowind simply shuffles `Music/Explore/` and switches to `Music/Battle/` on
combat ([UESP](https://en.uesp.net/wiki/Morrowind:Music)). Skyrim structures
it as **Music Types (MUSC)** — prioritized playlists (explore, combat, town,
dungeon) — of **Music Tracks (MUST)** with per-track conditions (region, time,
enemy class) and "palette" tracks that layer stems at random
([CK wiki: Music Type](https://ck.uesp.net/wiki/Music_Type),
[Music Track](https://ck.uesp.net/wiki/Music_Track)). When we get to score,
the right shape is Skyrim's (typed playlists + conditions, region-scoped per
[Beyond Skyrim's guidance](https://wiki.beyondskyrim.org/wiki/Arcane_University:Compatible_Implementation_of_Hard_Coded_Music_Types)),
ducked under the ambience mix hierarchy — but Morrowind's restraint (long
silences between tracks) is the feel target. Nothing more needed this phase.

## 3. Browser tech: what exists, what to adopt

### 3.1 Web Audio API facts that shape the design

- **Autoplay**: an AudioContext created before a user gesture starts
  `suspended`; call `resume()` in the first click/keydown (Chrome auto-resumes
  on source `start()` after a gesture, matching iOS Safari)
  ([Chrome: Web Audio autoplay](https://developer.chrome.com/blog/web-audio-autoplay)).
  We already require a click to start the game — resume the context there,
  and fade the ambience bed in over ~2 s so the world doesn't "pop on".
- **PannerNode** has two models: `equalpower` (cheap, azimuth-only) and
  `HRTF` (convolution per source — good externalization, but *expensive in
  CPU and memory*, one fixed IRCAM dataset, known front/back confusion)
  ([MDN panningModel](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel),
  [padenot's Web Audio perf notes](https://padenot.github.io/web-audio-perf/),
  [spec issue on HRTF cost](https://github.com/WebAudio/web-audio-api/issues/368)).
  **three.js `PositionalAudio` hard-codes `panningModel = 'HRTF'`** (verified
  in our installed r184 source, `node_modules/three/src/audio/PositionalAudio.js:59`)
  — with 10–20 emitters on a mid phone that is a real cost. Set
  `sound.panner.panningModel = 'equalpower'` for ambience emitters; reserve
  HRTF (if ever) for a handful of gameplay-critical sources.
- **Distance**: PannerNode gives gain-only rolloff (linear/inverse/
  exponential + `refDistance`/`maxDistance`) and a directional cone; no
  air-absorption filtering — the standard upgrade is a per-source lowpass
  whose cutoff tracks distance ([community sandbox doing exactly this on
  THREE.PositionalAudio](https://github.com/munshkr/threejs-3d-sound-sandbox)).
- **Filters and reverb**: `BiquadFilterNode` lowpass for underwater/occlusion
  /interior muffling (underwater reads right around 300–1000 Hz cutoff;
  guidance in [web.dev audio effects](https://web.dev/patterns/media/audio-effects)):
  `ConvolverNode` for reverb — and convolution is explicitly the recommended
  way to do "underwater" and "muffled" colour too
  ([MDN ConvolverNode](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode)).
  Impulse responses need not be shipped: [reverbGen](https://github.com/adelespinasse/reverbGen)
  (Apache-2.0, tiny) synthesizes decent IRs from exponentially-decaying
  filtered noise at runtime — a REVB-style parameter block (decay, fade-in,
  lowpass sweep) → generated IR, no asset downloads. Smooth all transitions
  with `AudioParam.setTargetAtTime`, never instant switches.
- **Occlusion**: industry pattern is raycast source→listener through physics,
  map hits/material to lowpass cutoff + gain, throttled and smoothed
  ([overview](https://salivity.github.io/game-development/article/simulating-sound-occlusion-and-propagation-in-games);
  Steam Audio's docs are the reference design). We have Rapier raycasts
  already. Worth it *only* for dungeon/interior sources; open swamp doesn't
  occlude.
- **Streaming vs buffers**: decoded AudioBuffers cost ~10 MB/min stereo —
  fine for one-shots and short loops, wrong for long beds. Long loops either
  stream via `HTMLMediaElement` + `MediaElementSourceNode` (works with
  PositionalAudio; MediaStream sources do *not* spatialize —
  [three forum](https://discourse.threejs.org/t/positionalaudio-does-not-work-with-setmediaelementsource/37085))
  or, better, are authored as **short seamless loops (5–20 s) in Opus/ogg**
  (~20 KB/s) and decoded — small enough to keep resident. Ship Opus with mp3
  fallback for Safari<17; never wav.

### 3.2 Library survey

| Option | What it gives | Verdict |
|---|---|---|
| **three.js `Audio` / `PositionalAudio` / `AudioListener`** (in-tree) | Thin typed wrappers over GainNode/PannerNode, listener follows camera, `setRefDistance/RolloffFactor/DirectionalCone`, custom `setFilters([])` chain per source | **ADOPT** as the node-graph layer. Two fixes: force `equalpower` panning (§3.1), and don't use its per-source `play()` scheduling as the *manager* — it has no pooling, priority, or virtualization. |
| **howler.js** ([repo](https://github.com/goldfire/howler.js), MIT) | Sprites, autoplay handling, HTML5-audio fallback, spatial plugin | **REJECT.** Last release 2.2.4 (~2023); Snyk rates maintenance *Inactive*; maintainer acknowledges dormancy ([discussion #1594](https://github.com/goldfire/howler.js/discussions/1594)). Also runs its own AudioContext/graph parallel to three's — two listeners to keep in sync. Its *ideas* (sprite atlas for one-shots, `html5:true` streaming for long files, pooled Howls) are worth stealing. |
| **@react-three/drei `<PositionalAudio>`** | Declarative wrapper, loads + suspense | **ADAPT ideas.** Fine for a one-off; our emitters come from compiler data and need pooling/virtualization, so they'll be managed imperatively by an `AudioManager` behind a small R3F provider — same pattern as our light rig. |
| **Resonance Audio web SDK / Omnitone / Songbird** (Google, Apache-2.0) | Ambisonic beds, binaural rendering, room reflections | **REJECT.** Effectively unmaintained since ~2018–2019 ([resonance repo](https://github.com/resonance-audio/resonance-audio-web-sdk), [omnitone](https://github.com/GoogleChrome/omnitone)); ambisonic beds are overkill for our stochastic-one-shot design and heavy on mobile. |
| **Tone.js** | Music/DSP scheduling framework | **REJECT** — music-production oriented; its transport/scheduler solves problems we don't have. |
| **reverbGen** ([repo](https://github.com/adelespinasse/reverbGen), Apache-2.0) | Procedural impulse responses for ConvolverNode | **ADAPT/PORT** (~100 lines): generate our REVB-preset IRs at startup per acoustic-space class. Old but algorithmically complete. |
| Steam Audio / Wwise / FMOD | Real engines | Not runnable on GitHub Pages (WASM ports of FMOD exist but are commercial). Reference designs only. |
| Maintained three.js "soundscape manager" | — | **None exists** (searched 2026-08: only demos/visualizers). The manager is ours to write; it is small (~500 lines) because the Web Audio graph does the heavy lifting. |

## 4. Recommended architecture (what the plan module should specify)

1. **Data model — a Morrowind-shaped `SoundscapeTable` per region class**,
   compiled with the world: entries `{soundId, chance, timeBand(day/night/
   dawn/dusk/any), weatherMask, positional?: spawnRadius}` plus 1–4 `bed`
   loop refs with target gains per time band. Sound IDs resolve through a
   **descriptor table** (SNDR-shaped: variant list, base gain, dB variance,
   rolloff class, bus) — one JSON, hand-editable, diff-able.
2. **Compiler-placed emitters**: hydrology already knows river reaches,
   rapids, falls, shorelines; vegetation knows canopy density; settlements
   know themselves. Emit `{position, soundId, refDistance, maxDistance}`
   records into chunk data (Dying Light 2's automatic-distribution lesson).
   Linear features (rivers) use the standard trick: **one virtual emitter per
   feature, repositioned each frame to the nearest point on the feature's
   polyline** — not a chain of sources.
3. **Runtime `AudioManager`** (controller-independent, like the light rig):
   owns the context, unlock, bus graph
   (`master → {ambience, weather, contact, effects, music} → duckers`), the
   region/time/weather crossfader (equal-power gain ramps, 5–15 s for beds),
   the one-shot scheduler (Poisson roll per active table entry, random
   azimuth pan at fixed small radius for non-positional details), and **voice
   management**: hard cap (~24 simultaneous voices; budget 8 beds+weather, 8
   emitters, 8 one-shots/contacts), nearest-K promotion for emitters, LRU
   steal for one-shots. Mid-device Web Audio comfortably runs dozens of
   equalpower panners; HRTF would not ([perf notes](https://padenot.github.io/web-audio-perf/)).
4. **Acoustic states** as a small stack: `exterior` (region table active) →
   `interior` (exterior bus ducked −12 dB + lowpass ~800 Hz, interior ASPC
   loop + reverbGen IR) → `underwater` (global lowpass sweep to ~400 Hz,
   dedicated underwater bed, contact sounds swapped to submerged set) →
   `canopy` (optional mild variant). One `ConvolverNode` per state on the
   bus, not per source; crossfade wet gains.
5. **Contact layer**: `surfaceMaterial` enum in compiler output (terrain
   splat dominant layer + collider tag), foot-plant events from the existing
   animation layer → IPDS-shaped lookup `{material × gait → variant set}`,
   round-robin-no-repeat variant pick, ±2 dB and ±5% playbackRate jitter.
   Depth-aware water: ankle vs knee vs swim sets (Black Marsh is mostly wet —
   this is *the* signature footstep axis for us).
6. **Formats/loading**: all audio Opus (~48–96 kbps) with mp3 fallback;
   one-shot variants packed as **audio sprites** per family (one fetch/decode,
   offset table); beds as 5–20 s seamless loops; per-region lazy loading with
   the chunk streamer, ~10–20 MB decoded-audio ceiling.

## 5. Sourcing under "we never make art"

- **Vanilla Skyrim covers most of the palette**: rain (+tent/interior
  variants), thunder, wind grades, rivers/waterfalls/lakeshore, generic
  insect washes, crickets, **frogs** (the Hjaalmarch "tundra marsh" region
  around Morthal is literally a marsh soundscape: frog one-shots, insect
  beds, will-o-wisp-ish details — [Regional Sounds Expansion notes them
  directly](https://www.nexusmods.com/skyrimspecialedition/mods/77829)),
  birds (day songbirds, birds of prey, night owls), plus the full footstep
  material sets (incl. water/mud) and underwater loop. First job: **pull
  `Skyrim - Sounds.bsa` into the vault** (it is not there yet) and inventory
  `sound/fx/amb/` + `sound/fx/fst/` properly.
- **Mod sound packs are a poor fit, unlike mesh/texture mods**: the big three
  ([AOS](https://www.nexusmods.com/skyrimspecialedition/mods/12466),
  Immersive Sounds Compendium, Sounds of Skyrim) are largely *redesigned
  audio* whose Nexus permissions are author-reserved ("get permission before
  using assets"), and — the deeper problem — sound mods are routinely built
  from commercial SFX libraries the author licensed personally and cannot
  sublicense. Treat them as **design references** (what to cover, chance
  tuning, region assignment fixes), not asset sources, unless we obtain
  explicit permission per pack.
  - **Owner ruling (2026-08-26, decision 0023) softens this**: for this
    personal fan project, mod sound packs join the normal sourcing pool with
    a credits entry, the same rule as mesh/texture mods (§71/§73). The
    finding above survives as a *preference*: favour packs that are the
    author's own recordings/edits over visible repackages of commercial
    libraries, and vanilla where it's good enough.
- **CC0/royalty-free libraries are the right gap-filler for genuinely
  tropical content** Skyrim lacks (dense jungle insect choruses, tropical
  frog species, cicada walls, monkeys/exotic birds if wanted):
  **Sonniss GDC bundles** (multiple years, tens of GB, explicitly
  royalty-free for commercial games, no attribution —
  [license](https://sonniss.com/gdc-bundle-license/),
  [archive](https://sonniss.com/gameaudiogdc/)) and **Freesound filtered to
  CC0 only** ([FAQ](https://freesound.org/help/faq/)) are both compatible
  with our vault rules (record source URL + hash per file, per the asset
  strategy). **Avoid the BBC archive**: its RemArc licence is
  personal/education only ([terms coverage](https://www.diyphotography.net/the-bbc-sound-effects-archive-is-now-free-to-download-with-over-33000-files/)).
  Avoid CC-BY-NC anything. This is consistent with the no-new-art rule: we
  are sourcing recordings, not commissioning or synthesizing art.

## 6. Risks / open questions for the build

- **iOS/Safari quirks**: context sample-rate mismatches, `interrupted` state
  on focus loss, stricter unlock — needs a device pass at the first audio
  studio gate; keep the unlock path single and boring.
- **Seamless loops after Opus encode**: lossy codecs pad frames and break
  loop points; either encode loops with `--no-edge-preservation`-style tools,
  trim post-decode by known pad, or crossfade loop tails in the scheduler.
  Decide once in the pipeline, test with a click-sensitive bed (insects).
- **How much HRTF matters**: ship equalpower first; A/B a small HRTF budget
  (≤4 voices) later only if positional readability of threats needs it.
- **Occlusion scope**: none at Tier 1 (open swamp); raycast lowpass only for
  interiors/dungeons if muffling-by-state proves insufficient.
- **Chance/density tuning is a feel gate**: Morrowind's sparseness vs jungle
  density is an owner-taste decision — build the table hot-reloadable in the
  world studio and tune by ear, like the light rig's authored curves.
