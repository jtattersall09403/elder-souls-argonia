# 0074 — Side lanes run beside the world build on files it never touches; the weapons lane is the first; saved state is a standard

**Date:** 2026-09-18. **Status:** accepted (owner, same session: "I want
everything you've mentioned", "let's get this planned and recorded in now",
"the save format as a standard now — yes"). Amends 0062 decision 6; moves
the polearm item out of Phase 10b (0042 §4); supersedes the Marksman draw
numbers in world module 76 §118.

## Context

With 16g landing, the owner asked what later work could run in parallel with
the rest of Phase 16 without creating a mess. The analysis: 0062's "one
queue, no parallel lines" was fixed for rollout reasons (Phase 15 needs
every system to exist) and to spare the owner's review load, not because
the later phases collide with Phase 16 on disk. The remaining chunks 16h–16j
touch the catalogue and plot records, the terrain chain, the settlement
package and kits, the studio's settlement and collider code and the promise
vocabulary in `packages/contracts`. Work that stays off those files is
mechanically safe. What is *not* safe: 10b's renderer and orchestration
extraction (it moves the studio files Phase 16 still edits), navmesh (needs
16h's fixed kit collision), 9a swimming in the studio, 10c (shares the actor
code 10b's shared-internals pass may re-architect).

The owner also carries a side backlog of character, combat and animation
items; each is placed below.

## Decisions

1. **Side lanes.** A side lane is a workstream that runs beside the world
   build in the same checkout, owning a named set of folders that no active
   Phase 16 chunk touches. Rules in
   [docs/phases/lanes/README.md](../phases/lanes/README.md): pathspec-only
   commits, the index-blob protocol for shared files, small commits so the
   other lane's preflight rarely sees half-done work, its own PROGRESS row,
   one owner playtest per round. No git worktree: the checkout's tracked
   files are 476 MB and a second copy buys nothing the folder rule does not.
   0062 decision 6 now reads "one queue for the world build; side lanes on
   disjoint files". At most two lanes beside the world build at once.
2. **The weapons lane** ([brief](../phases/lanes/weapons-lane.md)) takes the
   polearm sourcing-and-wiring item out of 10b, keeping 0042 §4's property
   that the clips are auditioned once by the agent who wires them; it adds
   everything the kept chassis list (0031) still lacks: unarmed with the
   clawed beast set, dual wield, pike and quarterstaff as classes, the
   Black Marsh Import weapon meshes as skins; extending 0031's kept list
   by owner say-so, rapier, claw and katana from Animated Armoury.
   The owner's side backlog joins the lane: per-class attack-speed variation,
   per-enemy race and weapon set in the sandbox, real weapon data, the
   landing fix and the extensibility hooks (an effects slot per weapon
   class and one damage-resolve step) done *first* so every new class is
   authored in the extensible shape.
3. **Marksman by skill, owner numbers.** Nock speed ×1.0 at skill 10 rising
   to ×1.6 at 100; draw speed ×1.0 rising to ×2.0; both continuous and
   monotone (bands were the owner's first thought; a curve is trivially
   re-banded later). **A marksman-skill damage multiplier applies on top of
   the ballistics** — module 76 §121.1 already said `P(effMarksman)`
   multiplies delivered damage; the owner confirmed it 2026-09-18; the
   arrow's impact speed is the physics, the skill is the archer. The lane
   ships these as inputs to `bowShot`/`ballistics` defaulting to ×1.0; 10c
   feeds the numbers from the skill.
4. **Saved state is engineering standard 17** ([standards](../standards/engineering.md)
   §17): every runtime system that holds state a player expects to
   survive a reload exposes it as versioned, serialisable data through one
   contract, from the moment it is written. 10c still ships the `SaveGame`
   contract itself; the standard stops the refactor that hurts most.
5. **The buildout register is marked "to be reviewed"** at its head rather
   than reviewed now: it has stale rows (eleven standards, compression in
   Phase 14) but the real re-plan belongs at 16j close, when 10b's
   extraction and the built world have shown what each system needs.
6. **The pipeline caches stay.** The 18 GB under `tooling/asset-pipeline`
   is 9 GB of mod source archives the kit builder reads member-by-member on
   demand (the only copy on this machine), 3.2 GB of Blender intermediates
   for shipped kits (a full rebuild otherwise) and 0.7 GB of raw kit builds
   that standard 16 keeps for measurement. The 1.2 GB of probe-kit
   intermediates and outputs were deleted (every test skips `probe-`).
   Disk is not the constraint: 29 TB free on the network filesystem.

## Consequences

- PROGRESS.md carries a *Side lanes* block; the weapons lane is its first row.
- Phase 10b's polearm bullet points at the lane; 10b keeps the moveset
  *porting* into the studio, which needs the lane's output.
- Module 90 §74.3's polearm row and the buildout register's "combat verb
  completion" row point at the lane.
- Text a player reads (class labels, weapon names, effect names) goes
  through `packages/text-catalogue` and the `text-review` skill as ever.
