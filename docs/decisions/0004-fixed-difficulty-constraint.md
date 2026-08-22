# 0004 — Fixed difficulty is an architectural constraint

**Date:** 2026-08-22 · **Status:** accepted

The world never receives the player's level or progression state as a generation
or population input. Encounter population, creature/faction variant selection,
loot tables, chest contents, hazard strength and boss statistics are fixed by
place, era and explicit world state (master plan §12, acceptance rule §90).

Enforcement, phased in from Milestone 1b onward:

- no `playerLevel`-shaped parameter may appear in any `world-*`, `ecology`,
  `dungeons`, `settlements` or loot-related package API (lint dependency rule +
  a contract test that greps public types);
- danger/loot data files carry no references to player stats;
- world-state changes that alter danger (floods, migrations, quest outcomes)
  must be explicit named events, reproducible from a save.
