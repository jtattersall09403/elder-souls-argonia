# Part V-c — The province soundscape: ambient audio, emitters, contact sound (§105–108)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Sections §105–108 are
> newly allocated (decision 0022). Companions: technique + library verdicts —
> [research/ambient-audio-soundscape-threejs.md](../research/ambient-audio-soundscape-threejs.md);
> the clock/weather that drive it — [55-light-sky-time.md](55-light-sky-time.md);
> region classes — [20-province-design.md](20-province-design.md) §16; fauna
> voices — `world/sources/lore/topics/fauna-hazards.md`; Hist audio language —
> [30-lore-systems.md](30-lore-systems.md) §20.4. **Music (the score) is
> explicitly out of scope for the world build** — it is a game-phase system;
> this module owns only the sound *of the world*.

## 105. Why sound is a first-class world system

Half of Morrowind's regional identity is audible: the Bitter Coast is frogs
and insect drone before it is any texture. Our own binding region-grammar rule
(§16) already promises that a region class changes *sound* alongside movement,
visibility and materials — but until this module, nothing owned that promise.
For a tropical swamp the stakes are higher than Vvardenfell's: a jungle night
chorus, rain on canopy, and water everywhere are the province's voice, and a
silent marsh fails the "does this world feel right" question the world build
exists to answer. Two rules, exactly parallel to light (§93):

1. **Sound is data, not decoration.** Ambience derives from the same region
   classes, climate fields, world clock and weather states that drive light and
   palettes — one source, many consumers (00-core rule 3). No hand-placed
   one-off ambience except as an authored override layer.
2. **From Phase 8d onward, no settlement, dungeon or region identity is
   approved silent.** Owner gates from Phase 11 on review places under the
   light of their hour *and* the sound of their region, time and weather.

Sound obeys fixed difficulty (0004): night choruses, storm noise and creature
calls are world state on the calendar, never scaled to the player. Audibility
is also gameplay: what the player hears (and what hears the player) routes
through the environment query like visibility (§97).

## 106. Data model — Morrowind's shape, Skyrim's vocabulary

The research doc details the Bethesda systems; the adopted schema is
Morrowind's region-sound chance-roll model upgraded with Skyrim's weather/time
gating and variant sets:

- **Region sound tables** (per region class, in `world/sources/audio/`):
  entries of `{soundSetId, chance, timeBand, weatherMask, region}` — looping
  **ambience beds** (2–3 crossfaded layers: base drone, biome chorus, canopy/
  water layer) plus **stochastic detail one-shots** (a heron, a splash, a
  distant roar) scheduled by Poisson chance-rolls. Day/night bands come from
  the clock's `dayPhase()`; a tropical marsh inverts Skyrim's defaults —
  **night is the loud time** (frog/insect chorus), noon is sparse and heavy.
- **Sound sets, not files**: every table entry names a set of 3–8 variants
  with pitch/gain variance (Skyrim SNDR-style) so repetition doesn't read.
- **Compiler-placed positional emitters**: rivers, rapids, shorelines and
  waterfalls get emitters *derived from hydrology data* (a river is one
  virtual emitter tracking the nearest point of its polyline); Hist trees,
  settlements arrive in their phases. Never hand-placed as a workflow.
- **Contact sound is the physical-material system** (§54): `footstepSet` /
  `impactSet` stop being dead fields — the compiler bakes an explicit surface
  material enum per collider/texel (never inferred from the rendered texture),
  and the existing no-op `combatAudio` stub (`packages/game-core/src/fx/audio.ts`)
  is replaced by the real bus.
- **Acoustic states** as a small stack — exterior / under-canopy / interior /
  **underwater** — implemented as bus-level filters plus one synthesized
  reverb impulse per state (reverbGen port; no IR assets shipped). Underwater
  is the flagship: the lowpass+reverb flip on submerging sells the whole
  swimming layer.
- **Weather owns its audio layer** (rain beds, thunder with distance delay,
  wind gusts) as part of the 8c weather state, published like every other
  weather parameter.

## 107. Runtime and sourcing

- **Runtime**: three.js `Audio`/`PositionalAudio` as the node layer with
  `panningModel='equalpower'` forced (three hard-codes HRTF — too expensive
  per-voice on mid devices), under a small project `AudioManager` (~500 lines:
  buses, autoplay unlock, region/time crossfader, one-shot scheduler, ~24-voice
  cap with virtualization). No suitable maintained soundscape library exists
  (howler.js inactive and duplicates the graph; Resonance dormant) — verdicts
  and citations in the research doc.
- **Sourcing follows the no-new-art rule, extended to audio: we never record
  or synthesize source sounds; we source them.** Priority order: (1) vanilla
  Skyrim's sound library — the Morthal tundra-marsh region set (frogs, insect
  beds, owls), full rain/thunder/water/wind and the complete footstep-material
  sets; **the Skyrim Sounds BSA is not yet in the asset vault — extracting it
  is the first sourcing job of Phase 8d**; (2) genuinely tropical gaps (jungle
  insect choruses, tropical frogs) fill from **royalty-free/CC0 libraries**
  (Sonniss GDC bundles, CC0-filtered Freesound) — unlike meshes, the
  high-quality free-sound world is licence-clean, so this is the approved
  gap-filler; (3) Skyrim *sound mods* (AOS/ISC/Sounds of Skyrim) are design
  references only — their permissions are reserved and their sources often
  unsublicensable. Credits and hashes per §73, as for any asset.
- **Pipeline**: sounds convert once (fuz/xwm → web codecs); seamless-loop
  integrity after Opus encoding (codec padding clicks) is solved in the
  pipeline, not per-asset. Budgets: mid-tier devices, ~24 simultaneous voices,
  audio memory measured by the standard probes.

## 108. Tiers, sequencing, acceptance

**Tier 1 — Phase 8d (after 8a; the weather-audio slice lands with/after 8c):**
AudioManager + buses + unlock; region ambience beds and detail tables for the
existing region classes, driven by clock and climate fields; hydrology-derived
water emitters; acoustic-state stack including underwater; footstep/impact
material wiring; weather audio if 8c has landed (else it lands with 8c);
studio tooling — an audio layer in the reproducible URL, sound-table
hot-reload for tuning by ear, and a voice-count/audio-memory probe.

**Tier 2 — Phases 11/13:** settlement ambience profiles (lantern-island
night, dock work, market crowds as beds not actors), creature calls authored
with ecology (night hunting calls as danger telegraphs, §27), Hist sites'
low-frequency signature (§20.4), interior profiles per cell (Phase 12).

**Owner gates:** soundscape density is a taste decision (Morrowind-sparse vs
jungle wall-of-sound) — tuned by ear in the studio at the 8d gate; and from
Phase 11 onward place-approval includes the place's sound.

**Acceptance (binding):** region/time/weather ambience derives from the same
fields as light — same instant, same region → same soundscape; night is
audibly different from day and the deep marsh from the fringe; submerging
audibly transforms the world; contact sounds follow physical materials; no
place approved silent from Phase 8d on; runs inside the voice/memory budget on
mid devices.

---
