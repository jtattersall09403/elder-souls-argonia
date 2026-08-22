# Docs index

Modular notes for agents working on this combat sandbox. **Read this file first**,
then open only the specific file you need — filenames are the map. Keep docs
short; treat them like code (DRY, one concern per file).

## What this project is

A **portable combat + character sandbox**. The goal is to prove fun, good-looking
Souls-like melee combat with Skyrim-derived visuals/animations, then lift the
*portable core* into a full game. Some things here are deliberately throwaway
(the stage/arena, intro screen, debug panel). The **core to keep** is the combat,
character, animation and movement architecture.

## Portability boundaries (what to keep vs throw away)

| Keep (portable core) | Throwaway (sandbox scaffolding) |
| --- | --- |
| `src/game/combat/*`, `src/game/anim/*`, `src/game/physics/*` | `Arena.tsx`, intro screen, debug HUD/panel |
| `src/game/equipment/*`, `src/game/inventory/*`, `src/game/actors/*` | enemy spawn layout, arena lighting |
| `SkyrimFighter` actor + animation manifest | the inventory's Morrowind *skin* |
| `PlayerMovementController` boundary | |

The inventory is a deliberate example of the split: its rules and view model are
core, its stylesheet is not. See
[architecture/items-and-inventory.md](architecture/items-and-inventory.md).

## Map

| File | Topic |
| --- | --- |
| [animation-quality-playbook.md](animation-quality-playbook.md) | Start here before implementing or debugging animation quality |
| [architecture/character-actor.md](architecture/character-actor.md) | The Skyrim character actor + GLB |
| [architecture/movement-boundary.md](architecture/movement-boundary.md) | Controller-independent movement boundary |
| [architecture/animation-contract.md](architecture/animation-contract.md) | Manifest-driven semantic animations |
| [architecture/characters-and-races.md](architecture/characters-and-races.md) | The rig/race split, skin tint, beast tails, and biped slots |
| [architecture/items-and-inventory.md](architecture/items-and-inventory.md) | Items from class x material, worn armour, and the inventory's three layers |
| [architecture/ranged-combat.md](architecture/ranged-combat.md) | Aiming, the draw cycle, first person, and the arrow as a rigid body |
| [architecture/movement-speed-tuning.md](architecture/movement-speed-tuning.md) | Where to edit travel speed vs animation playback speed for locomotion/dodges |
| [research/archery-ballistics.md](research/archery-ballistics.md) | How bows are modelled, and the real-world figures that calibrate them |
| [assets/rebuilding-the-character.md](assets/rebuilding-the-character.md) | Rebuild the character GLB from Skyrim source |
| [assets/animation-source-audit.md](assets/animation-source-audit.md) | Selected Skyrim clips, external-source provenance, and audition results |
| [validation/animation-recordings.md](validation/animation-recordings.md) | When to run the animation probes vs. record video for the owner to review |

## Non-negotiables

- The project owner has authorized the built runtime character and weapon GLBs
  in `public/` for this personal GitHub Pages deployment. Original archives,
  NIF/HKX/DDS extraction trees, pipeline outputs, and validation evidence remain
  local and gitignored. This is not blanket permission to add other source assets.
- The game references **semantic** animation names only (`IDLE`, `ROLL`,
  `LIGHT_1`, …) — never Bethesda filenames.
- Animation work starts with
  [animation-quality-playbook.md](animation-quality-playbook.md); do not repeat
  the source-selection/timing/grounding/paired-action trial-and-error it records.
- Combat/animation/input/lock-on code depends on `PlayerMovementController`,
  not on ecctrl directly.
