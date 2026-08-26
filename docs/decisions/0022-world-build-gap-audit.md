# 0022 — World-build plan gap audit: soundscape, vegetation density, navigation data

**Date**: 2026-08-26 · **Status**: accepted (owner goal 2026-08-26: after the
lighting/weather gap (0016), audit the plan for other world-build gaps and fill
them the same way — research how comparable games and Morrowind/Skyrim/Oblivion
do it, find known-good three.js implementations, integrate into the plan)

## Scope

The audit question was **world-build only**: what's missing to prove we can
build a high-quality, high-performance province in the browser — not
whole-game systems. Deliberately **excluded as game-phase** (intentionally
unplanned until the world build answers its question): save/load and
persistence, player map/journal/discovery UI, the music score, dialogue
runtime, economy/services detail, magic (workstream S owns its stat shape).

## Findings — three gaps, same shape as the lighting one

Each was promised in passing (region grammar's "sound", `footstepSet`,
`nav-*.bin` in the bundle spec, "vegetation kits"), owned by no module, and
delivered by no phase:

1. **The province soundscape** → new module
   [57-audio-soundscape.md](../world/57-audio-soundscape.md) (§105–108), new
   **Phase 8d** (after 8a; weather-audio slice with/after 8c; before place
   approvals in 11+). Morrowind-shaped region sound tables (chance-roll beds +
   one-shots) with Skyrim-style time/weather gating and variant sets;
   compiler-derived water emitters; material-driven contact sound; acoustic
   states incl. underwater; three.js Audio/PositionalAudio (`equalpower`)
   under a small project AudioManager — no viable third-party manager exists
   (howler.js/Resonance rejected). Sourcing: Skyrim Sounds BSA first (not yet
   in the vault), Sonniss/CC0 for tropical gaps, sound mods as reference only.
   The no-new-art rule now explicitly covers audio. Research:
   [ambient-audio-soundscape-threejs.md](../research/ambient-audio-soundscape-threejs.md).
2. **Vegetation/scatter density at scale** → new module
   [65-vegetation-scatter.md](../world/65-vegetation-scatter.md) (§109–112),
   implemented inside existing Phases 10/13/14 (no new phase). Four render
   tiers (batched hero statics / bundle-instanced mid detail / runtime
   groundcover ring / impostor+merged far LOD) on Bethesda's two-tier design
   split; deterministic jittered-grid scatter in the compiler; weather-owned
   wind uniforms; adopt `@three.ez/instanced-mesh` (pinned+wrapped), vendor
   octahedral impostors with cross-billboards as fallback; alpha-test overdraw
   on mobile named the #1 risk. Research:
   [vegetation-scatter-instancing-threejs.md](../research/vegetation-scatter-instancing-threejs.md).
3. **Navigation data + ambient movement** → new module
   [72-navigation-ai.md](../world/72-navigation-ai.md) (§113–115), implemented
   inside Phases 10b/12/13. Bake offline in the compiler, adopt
   **recast-navigation-js** (tiled navmesh ↔ chunk streaming, off-mesh links,
   export = `nav-ground.bin`) behind a thin `NavService`; compiler/client
   version pin recorded in the bundle manifest; two ground agent classes;
   swim-surface meshes + depth volumes, no 3D voxel nav. Ambient ceiling is
   deliberately Morrowind-leaning (marks, wander radii, patrol splines, daily
   band rotation) — matching the quest plan's no-chase/no-escort cap. Research:
   [navmesh-ambient-ai-threejs.md](../research/navmesh-ambient-ai-threejs.md).

## Consequences

- Phase glance, acceptance criteria (soundscape, vegetation budgets, baked
  nav), dependency table (§86.0), Phase 8d/10/10b/12/13/14 deliverables,
  module router + section map, studio mode table, module 90 §74.4 (sound
  sourcing) and 55 §98 (wind/audio ownership) all updated in this change.
- **8c, 8d, 9, 10 are mutually independent** — 8d can slot wherever it best
  fits the queue; only place-approval from Phase 11 hard-requires it.
- Systems judged adequately covered and left alone: streaming/perf budgets
  (Phase 14 + probes), interior light (55 §96), tides (8b), flood states,
  fast-travel services (Phase 4 graphs + 11), ambient-critter VFX (13).
