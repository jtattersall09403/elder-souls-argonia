# 0077 — Weapons lane round 1: five polearm and blade movesets and 28 weapons from Animated Armoury; the katana waits on an HKX reader; three mods held on permissions

**Date:** 2026-09-19. **Status:** delivered; owner playtest pending (with
round 0, lane brief § Owner check). Implements decision 0074 §2 round 1.

## What round 1 found before building

- Adding a family is data here (0040): clips into the animation config
  under a new pack, a moveset file, a class row. No loader, actor or FSM
  change was needed; none was made.
- Of the four source mods, only **Animated Armoury** (Nexus SSE 35978,
  NickNak) states its permission on the page ("anyone is ok to do anything
  they want with this mod, just give credit"). The Nexus v1 API does not
  expose the permission box and the mod pages return 403 from this VM, so
  the permissions of Animated Heavy Armory (51100), Skyrim Spear Mechanic
  (25146) and Black Marsh Import (48551) are **unverified**. Animated
  Armoury alone covers every class round 1 needs, so it is the only source
  that ships. The other three are downloaded, hashed and recorded in the
  vault's `SOURCES.json` and in the
  [inventory](../research/combat-and-systems/polearm-and-blade-mod-inventory.md)
  and ship nothing until the owner reads their permission boxes.
- Eighteen of the mod's clips, including the whole drawn-katana set
  (folders 19 and 20), are stored as `hkaInterleavedUncompressedAnimation`;
  the pipeline's importer reads only spline-compressed Havok animation.
  Every other gap had a readable substitute in the mod's own folders.
- Black Marsh Import is not an installable mod: five `.obj` meshes with
  `.tga` textures, no NIF, no plugin, no `.mtl` and no permission
  statement. It ships nothing this round (see §5).

## Decisions

1. **Five packs, mirrored from the base family and borrowing the rest.**
   For each new pack the base pack's clip list (one-handed, greatsword, or
   battleaxe/warhammer) is mirrored where the mod folder holds a file of the
   same vanilla name; everything else (Rim parry and execution, missing guard
   or equip clips, locomotion) is inherited through `requires`. Packs and
   clip counts: `pike` 17 (requires greatsword; run inherits
   GREATSWORD_RUN), `halberd` 13 and `quarterstaff` 13 (require greataxe),
   `rapier` 8 and `claw` 9 (require oneHanded). Substitutes for unreadable
   files came from the same folders: the mod's earlier `_OLD` idles for the
   pike and rapier, `2hm_attackpowerright` for the pike heavy and the
   staff's own power attacks for the quarterstaff heavies.
2. **Classes.** `spear` and the new `pike` fight with the pike moveset (a
   thrusting two-hander; the spear is the same mesh family built to 2.1 m,
   the pike to 2.5 m). `halberd` and `staff` (now labelled Quarterstaff)
   fight with their own haft sets. New `rapier` (thrust, one-handed) and
   `claw` (swing, one-handed, bleeds) are their own classes. **`katana`** is
   a class on its four meshes with `borrowedMoveset: true` on the one-handed
   set until its clips can be read. Speeds and powers are argued from the
   mod's own WEAP records (mined into `weapon-records.json` from
   `NewArmoury.esp`, source hash recorded per item) and from mass where the
   record is silent; effects: halberd bleeds 25 % over 4 s, claw 30 % over
   3 s, the thrusting classes carry none.
3. **Twenty-eight weapons** (iron, steel, elven, ebony × rapier, katana,
   claw, pike, spear, halberd, quarterstaff), every texture resolved from
   the base game, built through `build_weapons.py`'s new `root` field
   (a mod data root, case-insensitive, textures from the root first and the
   vanilla BSA second). Credit line in root README with the archive digest.
4. **The arsenal builder skips, never throws** (owner 2026-09-18: a mesh
   whose class had no game-side mapping yet took the world studio's
   character mode down). Unmapped items are listed once in a console warning
   and `UNMAPPED_ARSENAL_ITEMS`; the record gate still holds the manifest
   and the arsenal to one item set.
5. **Gaps recorded, not parked.** (a) An interleaved-uncompressed HKX reader
   for the importer: a bounded job (the class is a per-frame array of
   transforms, simpler than the spline path) that unlocks the katana set and
   twelve more Animated Armoury clips; queued in the polish backlog with the
   file list. (b) Permissions for the three held mods: an owner read of the
   three pages. (c) Black Marsh Import needs (b) plus an OBJ import path in
   the weapon builder; it stays out until (b) says yes.
6. **Weapon GLBs are raw** (JPEG textures, no meshopt), the 54 old ones and
   the 28 new alike: standard 16 says what ships is compressed. Queued in
   the backlog as one pass through the kit compressor over the weapon set,
   with the measured before/after.

## Consequences

- The Phase 10b polearm item is done bar the port to the studio.
- Round 2 (unarmed and dual wield) starts from packs that already exist for
  the claw's off hand (`dw*` clips in folder 14 are spline-compressed).
- The buildout register's "combat verb completion" hook now has seven
  classes authored in the effects-slot shape.
