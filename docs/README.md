# Docs index

Modular notes for agents working on elder-souls-argonia. **Read this file and
[PROGRESS.md](PROGRESS.md) first**, then open only the specific file you need —
filenames are the map. Keep docs short; treat them like code (DRY, one concern
per file; edit and delete, don't only append).

## Map

- [PROGRESS.md](PROGRESS.md) — where we are in the build sequence + the
  update/crash-recovery protocol. Always current; always read.
- [world-gen-master-plan.md](world-gen-master-plan.md) — the reference plan for
  the whole world build (~2,700 lines). Never read end to end; use its part
  index at the top to jump to the sections your phase needs.
- [decisions/](decisions/README.md) — short numbered decision records (era,
  coordinates, migration sources, fixed difficulty, …).
- [CREDITS.md](CREDITS.md) — third-party sources and credits, one line each.
- `apps/combat-sandbox/docs/` — the combat/animation/physics sandbox's own docs
  (architecture, animation playbook, validation). Read there when working on
  combat, character, animation or input.
- `../world/sources/` — registered world-generation inputs (anchors, source
  hashes, provenance).
- `../tooling/world-generation/` — offline extractors/compilers (heightfield
  ingest lives here).
- `../apps/world-studio/` — browser province preview/inspection app
  (deployed at `/studio/` on the Pages site).
