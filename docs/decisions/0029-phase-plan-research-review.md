# 0029 — Forward research pack for Phases 8c–13; exemplar-first rollout for placement systems

**Date:** 2026-08-28 · **Status:** accepted (owner-directed review)

## Context

The owner asked for a systematic review of the remaining phases (after 8b):
where would planning/research *now* save future agents iterations — especially
UESP canon, academic geography/settlement studies, marsh-village reality,
boats, and known-good three.js/Rapier implementation methods — and whether
some phases should switch from whole-province delivery to iterating a
*system* on one local exemplar first. Explicit steer: the output is
**inspiration for capable expert agents, not prescription**, and not process/
probe checklists.

## What landed (six research docs, all in `docs/research/`)

| Doc | Serves | One-line verdict |
|---|---|---|
| [weather-clouds-rain-threejs.md](../research/weather-clouds-rain-threejs.md) | 8c | Takram three-geospatial clouds: MIT, version-compatible, works without 3D-Tiles — but assumes its own atmosphere/postprocessing pipeline, so an integration spike vs our envelope-pinned sky is the phase's first question; cheap dome tiers + rain/wetness/tropical-rhythm material included |
| [swim-climb-boat-implementation.md](../research/swim-climb-boat-implementation.md) | 9 | No off-the-shelf swim/climb/boat exists for ecctrl/Rapier — all three are ours behind `PlayerMovementController`; canonical sources per mode (Kerner buoyancy, Catlike swimming, Cantão BotW-climb → Rapier shape-casts); Rapier force-persistence footgun recorded |
| [marsh-watercraft-and-argonian-boats.md](../research/marsh-watercraft-and-argonian-boats.md) | 9, 11, 13 | Canon boat/port material mined (small craft canonically the fastest transport in Argonia; Kothringi Tidal Canoe; tail-propelled rafts; gar-fishing); real craft families mapped to our water classes with draft/speed; docks ladder for settlements. Canon went into the [material-culture dossier](../../world/sources/lore/topics/material-culture.md), not the research doc |
| [marsh-settlement-morphology.md](../research/marsh-settlement-morphology.md) | 11 (and 13) | Real marsh settlements (Ma'dan, Ganvié, Tonlé Sap, Kampong Ayer, terps, crannogs, Fenland, chinampas, Llanos de Mojos) + era-parallel town morphology + wetland-zonation siting logic → a non-binding menu of ~12 settlement archetypes keyed to our hydrology fields |
| [kit-level-design-and-layout-generation.md](../research/kit-level-design-and-layout-generation.md) | 10, 11, 12 | Bethesda kit craft with verified Skyrim snap numbers (our compilers snap the same sourced pieces); dungeon craft (loops, gating, Souls interconnection); the known village/dungeon generation families with their real limits ("grammar proposes, author disposes") |
| [xanmeer-mesoamerican-reference.md](../research/xanmeer-mesoamerican-reference.md) | 12 (and 11, 13) | ~25 named canon xanmeers; Maya/Angkor site-and-water grammar as "why here" answers; nested-pyramid biography for layered interiors; "intact = red stucco, grey stone = ruin state"; a taphonomy ladder for D2→D5 ruin looks |

Coverage judged **already adequate** (no new docs): 10b/10c (navmesh research +
workstream S), 12b (audio research), 13's lore feed (ecology dossiers; the
morphology and xanmeer docs add its physical-world side). **Phase 14
deliberately not researched now**: streaming/compression is standard,
fast-moving tech best researched against *measured* budgets when the phase
starts.

## The phasing decision: exemplar-first for placement systems

Owner instinct confirmed, with evidence both ways recorded in the kit doc §5.
For the *placement-type* phases (10 vegetation/kits, 11 settlements, 12
dungeons, 13 encounters/ambient life), the pattern is:

1. **prove risky mechanics in disposable micro-labs** (§85.3 — already planned);
2. **build each placement system by authoring ONE retained exemplar *through*
   the data format** (blueprint/config → compiler → world), never by hand
   placement — so the exemplar doubles as the compiler's first regression
   fixture. This dissolves the classic vertical-slice objection ("slices
   starve tooling" — Gilbert/Ellenor): here the slice *is* the tooling's first
   input;
3. **validate on 2–3 contrasting instances** (different region class, culture,
   danger band) before mass rollout — a system tuned on one reed village will
   over-fit; the contrast set is where configurability is proven;
4. **then roll out as data** (generate the remaining instances, spot-tweak),
   with owner gates at the exemplar and the contrast set, not per instance.

Whole-province-at-once remains right for **global fields and systems** (8c
weather, light, water, streaming) — exactly as Phases 2–8 were run. Exemplars
should live in retained content (the Blackrose reference watershed where
possible, per 0008) so iteration work ships.

## Notes

- Per-phase research pointers are carried by the [docs router](../README.md)
  rows; they were **not** folded into world module 95 in this change because
  concurrent quest-workstream edits were sitting uncommitted in that file — a
  later agent editing module 95 may fold them in.
- The research docs end in open questions, not directives, on owner
  instruction: phase agents reason for themselves.
