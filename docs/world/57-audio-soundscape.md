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
2. **But sound is fully polish-tier, not a gate** (owner, decision 0023;
   hardened by 0034, 2026-08-29): unlike light, nothing is blocked on it, and
   place approvals before Phase 12b may run silent. 12b runs in the Phase P
   window **after Phase 13** — creature calls and settlement/ecology ambience
   are authored *by this system, from the ecology data* (species, territories,
   schedules), not by Phase 13 into pre-built tables. The only hard edges:
   it needs 8a's clock and 13's ecology data, and must land before Phase 14
   locks voice/memory budgets; *final* regional acceptance (Phase 15 packets)
   reviews places with their sound.

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
  or synthesize source sounds; we source them.** The pool (owner, 0023 —
  sound mods are in it, credited like any other mod source, per the standard
  §71/§73 rule): (1) vanilla Skyrim's sound library — the Morthal
  tundra-marsh region set (frogs, insect beds, owls), full
  rain/thunder/water/wind and the complete footstep-material sets; **the
  Skyrim Sounds BSA is not yet in the asset vault — extracting it is Phase
  12b's first sourcing job**; (2) **Skyrim sound mods** (e.g. Sounds of
  Skyrim, AOS, ISC families) — take their *sound assets* with a credits
  entry, exactly as we take meshes and clips; prefer packs that are the
  author's own recordings/edits over ones that visibly repackage commercial
  libraries, and prefer vanilla where it's good enough; (3) genuinely
  tropical gaps (jungle insect choruses, tropical frogs) fill from
  **royalty-free/CC0 libraries** (Sonniss GDC bundles, CC0-filtered
  Freesound) — high-quality and licence-clean. Credits and hashes per §73,
  recorded in the root README's Credits section.
- **Pipeline**: sounds convert once (fuz/xwm → web codecs); seamless-loop
  integrity after Opus encoding (codec padding clicks) is solved in the
  pipeline, not per-asset. Budgets: mid-tier devices, ~24 simultaneous voices,
  audio memory measured by the standard probes.

## 108. Tiers, sequencing, acceptance

**Tier 1 — Phase 12b, machinery** (was 8d; polish-tier per 0023/0034 — runs
in the Phase P window after Phase 13; needs only 8a's clock; may be pulled
earlier if the queue allows):
AudioManager + buses + unlock; region ambience beds and detail tables for the
existing region classes, driven by clock and climate fields; hydrology-derived
water emitters; acoustic-state stack including underwater; footstep/impact
material wiring; the 8c weather states gain their audio layer;
studio tooling — an audio layer in the reproducible URL, sound-table
hot-reload for tuning by ear, and a voice-count/audio-memory probe.

**Tier 2 — Phase 12b, content authored from the world data** (moved from
Phase 13 by 0034): settlement ambience profiles (lantern-island night, dock
work, market crowds as beds not actors) authored onto the Phase 11
settlements, creature calls authored *from* Phase 13's ecology data (night
hunting calls as danger telegraphs, §27), Hist sites' low-frequency signature
(§20.4), interior profiles per cell (Phase 12's dungeons).

**Owner gates:** soundscape density is a taste decision (Morrowind-sparse vs
jungle wall-of-sound) — tuned by ear in the studio at the 12b gate; final
regional acceptance (Phase 15 packets) reviews places with their sound.

**Acceptance (binding):** region/time/weather ambience derives from the same
fields as light — same instant, same region → same soundscape; night is
audibly different from day and the deep marsh from the fringe; submerging
audibly transforms the world; contact sounds follow physical materials; the
audio layer lands before Phase 14 locks budgets; runs inside the
voice/memory budget on mid devices.

---
