# Part VII-b — Navigation data and ambient movement (§113–115)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Sections §113–115 are
> newly allocated (decision 0022). Companions: technique + library verdicts —
> [research/navmesh-ambient-ai-threejs.md](../research/navmesh-ambient-ai-threejs.md);
> encounter sockets — [70-dungeons-interiors.md](70-dungeons-interiors.md) §50;
> NPC/creature capability — [75-combat-compatibility.md](75-combat-compatibility.md) §57;
> the quest plan's deliberate AI ceiling — [../quests/20-world-provisions.md](../quests/20-world-provisions.md)
> (no free-roaming escort/chase AI; waypoint-leash or teleport-to-mark only).

## 113. Scope: what the world build owes, and the deliberate ceiling

The bundle format has reserved `nav-ground/swim/climb/boat.bin` since the
architecture was written, and the §69 combat probes require "enemy navigation
access" — but nothing designed or built them. This module closes that: the
world build **bakes navigation data and validates places against it**; rich
game AI is later work, and the quest plan has already capped it.

**The ambition is Morrowind-leaning, and that is a feature**: the credible
minimum of ambient life — NPCs at idle/work marks with sourced animation
loops, small wander radii, patrol splines, a 2–4-band daily mark rotation on
the world clock (teleport-while-unobserved between bands), creature territories
with leashes — not Skyrim's full schedule engine. That ceiling is cheap to
deliver, matches the reference game, and every mark/spline sits on the baked
navmesh so it is validatable at compile time.

## 114. The baked data and the library

- **Bake offline, query at runtime.** Navmesh generation is a world-compiler
  step (Node bake invoked from the pipeline); the client only loads tiles and
  runs queries. No runtime rebaking in v1 — kit placement is static at compile
  time.
- **Adopt `recast-navigation-js`** (maintained WASM Recast/Detour; MIT):
  tiled navmeshes with runtime `addTile`/`removeTile` map 1:1 onto chunk
  streaming (and kill cell-border pathing bugs by construction); off-mesh
  links; DetourCrowd available; `exportNavMesh` → `Uint8Array` is exactly
  `nav-ground.bin`. Wrap it behind a thin **`NavService`** so the pure-TS
  successor (navcat) stays a cheap swap. Rejected: three-pathfinding (no
  generation/tiles), yuka (dormant; mine its steering patterns),
  hand-placed waypoint graphs (Morrowind's own erratic wilderness AI is the
  argument against). Citations and detail in the research doc.
- **Binding version rule**: the Detour export is a versioned binary — compiler
  and client pin the *same package version*, recorded in the bundle manifest
  (`generatorVersions`).
- **Two ground agent classes** (humanoid ~r0.35, large creature ~r1.1), one
  bake each. Detour per-poly area flags carry the semantic vocabulary: water,
  preferred-road, mud; jump-downs and climb points are one-way off-mesh
  links. No cover edges (melee-only combat).
- **Water**: a surface-swim navmesh per water body plus depth volumes derived
  from the existing heightfield-vs-water data; submerged AI steers directly
  inside open volumes (no 3D voxel nav — rejected as unneeded complexity).
  `nav-climb.bin` is off-mesh-link records + the climbable mask, not a mesh;
  `nav-boat.bin` is a coarse water-lane bake used mainly as a route validator.

## 115. Validation, sequencing, acceptance

**Compiler probes (hard gates, joining §69):** every idle/work/patrol mark
snaps to the navmesh (≤0.5 m); patrol splines are connected with sane path
lengths; every encounter arena is reachable by its agent class from every
spawn socket ("enemy navigation access"); wander areas meet minimum sizes;
navmesh island reports; quest-provision routes re-checked as nav queries.
Navmesh leaking through walls is a **kit-collision QA failure** — probes catch
the symptom, the kit fixes the cause.

**Sequencing:** the bake pipeline + `NavService` land in **Phase 10b**
(enemies enter the studio there, and its combat-space probes need the data);
interior navmeshes with **Phase 12**; territories, marks, patrols and the
daily-band rotation with **Phase 13** (populations) and Phase 11 (settlement
marks). Data size is noise next to terrain (tens of KB/chunk compressed) —
measured at first bake.

**Acceptance (binding):** enemies path competently through every validated
encounter space and settlement street without hand-tuning; ambient NPCs live
on marks/patrols that all validate against the bake; creatures respect
territory leashes and water flags; nav tiles stream with chunks; the
compiler/client version pin is asserted in CI.

---
