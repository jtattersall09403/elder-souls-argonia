# Weapons lane — every kept weapon class fights with its own motion

Side lane (decision [0074](../../decisions/0074-side-lanes-beside-the-world-build-and-the-weapons-lane.md)),
run in the combat sandbox beside Phase 16. Invoke as **"deliver the weapons
lane, round N"**. Folder ownership: [lanes README](README.md). Read
`apps/combat-sandbox/CLAUDE.md` and decision 0040 §42–55 before touching
bows, arrows, archers or locked locomotion; the animation playbook before any
clip work. Sandbox rules apply: semantic animation states, never Bethesda
filenames; `PlayerMovementController`, never ecctrl directly.

## Goal

The chassis weapon list decision 0031 kept — spears, pikes, halberds,
quarterstaves, unarmed, plus the one-handed and two-handed sets already
built — fights with sourced motion, on the character and on enemies, with real
data in the arsenal, in a shape the buildout's perks and class effects plug
into without a refactor. The owner's side backlog (0074 context) is
delivered in the same rounds.

## Starting state (2026-09-19, rewritten at the round-1b close; the closing round-2 agent rewrites this)

Run the `routing-audit` skill over this brief before building. **Rounds 0
and 1 are delivered** ([0076](../../decisions/0076-weapons-lane-round-0-effects-slot-skill-inputs-and-skyrim-calibrated-tables.md),
[0077](../../decisions/0077-weapons-lane-round-1-animated-armoury-movesets-and-meshes.md)):

- **Classes** (`packages/game-core/src/equipment/weaponClasses.ts`): the
  one-handed set (dagger, shortSword, straightSword, scimitar, axe, mace),
  **katana**, **rapier** and **claw** on
  their own sets, greatsword, greataxe and warhammer, **spear and pike** on
  the `pike` thrust set, **halberd** and **staff** (Quarterstaff) on their
  own haft sets, plus the three bows. Every class carries `effects`,
  `speedScale`, a poise entry and a `criticalStyle`; `weaponClasses.test.ts`
  holds the table complete.
- **Movesets** (`equipment/movesets/`): `oneHanded`, `twoHanded`
  (greatsword, greataxe), `polearms` (pike, halberd, quarterstaff),
  `blades` (rapier, claw), `bow`, `shield`, `criticals`. Contact windows
  are measured (`scripts/measure-contact-windows.mjs`), the claw lunge
  excepted (slot analogue, commented).
- **Packs** (`packages/character-assets/files/rig-skyrim-humanoid.<pack>.glb`,
  manifest in `anim/generated/`): core, criticals, oneHanded, shield, bow,
  greatsword, greataxe, pike, halberd, quarterstaff, rapier, claw, **katana**
  (its clips read through `pipeline/hkx_interleaved.py`, which converts
  interleaved-uncompressed Havok to the spline form the importer reads).
- **Arsenal**: 92 items (53 vanilla + 28 Animated Armoury + 6 Animated
  Heavy Armory tridents/half-pikes on `pike`/`spear` + 5 Black Marsh Import
  OBJ weapons with hand-authored records on `wood`, `bone`, `obsidian`),
  every one with a mined or authored record (`weapon-records.json`).
  `build_weapons.py` takes a `root` (and `plugin`) for mod meshes and an
  `orient` block for OBJ meshes (striking end + hand origin, turned onto the
  NIF hand-node convention in Blender). The builder skips an unmapped
  pipeline class with a warning (`UNMAPPED_ARSENAL_ITEMS`) rather than
  throwing. Weapon GLBs are raw (backlog row).
- **Enemies**: pike, halberd, rapier and claw wardens beside the existing
  five; the sandbox HUD lists every `ENEMY_ARCHETYPES` entry.
- **Hit resolution and skill inputs**: as round 0 left them
  (`combat/README.md`; `skillScalars.ts`; sandbox `skillsEnabled` off by
  default).
- **Landing**: `anim/landing.ts` exposes `selectLandingAnimation` and
  `landingAnimationSpeed`; movement is not locked during the landing clip.
- **Sandbox**: enemy spawning is one archetype set at a time; no per-enemy
  race or weapon-set picker.
- **Sources in the vault** (`mod-sources/extracted/`, records in
  `SOURCES.json`, inventory in
  [polearm-and-blade-mod-inventory.md](../../research/combat-and-systems/polearm-and-blade-mod-inventory.md)):
  Animated Armoury 2.3, Animated Heavy Armory 2.4.2, Skyrim Spear Mechanic
  3.0 and Black Marsh Import 0.1, all cleared by the owner (permissions read
  2026-09-19). Vanilla `h2h`, `beasth2h_*` and `dw` clips for round 2 are in
  the animations BSA; the claw's off-hand `dw*` clips in Animated Armoury
  folder 14 are spline-compressed and readable. Spear Mechanic's one-handed
  thrust set and Heavy Armory's shortspear set are readable and cleared: a
  `shortspear` class is round 2's first item.

## Rounds

Deliver in order; a round is one Opus `deliver` brief per independent
stream (Fable writes them from this section), one owner playtest per round.
Rounds 2 and 3 may be delivered together if the round-1 playtest raised no
steer.

### Round 0 — the shape everything else is authored in — DELIVERED 2026-09-18 (0076)

1. **One resolve step, one effects slot.** Each weapon class carries
   `effects: WeaponClassEffect[]` (empty today) and every hit resolves
   through one function that applies base damage, motion value, armour
   mitigation, the class effects and the actor's effect stack in a fixed
   order. The effect vocabulary is a typed enum with two proving entries the
   owner named (blunt ignores a share of armour; axes bleed), *data-driven
   and off by default* — this lane proves the slot, 10c tunes the numbers.
   Record the order in `equipment/README.md`; the buildout register's
   "combat verb completion" row points at it.
2. **Skill inputs.** `bowShot`/`ballistics` take `{ nockSpeed, drawSpeed,
   damageMultiplier }` defaulting to ×1.0, with the owner's curve
   (`marksmanScalars(skill)`: nock 1.0→1.6, draw 1.0→2.0, continuous and
   monotone from skill 10 to 100) as a pure function beside them. A sandbox
   slider drives the skill for the playtest. Melee gets the same input shape
   (`attackSpeed`, `damagePosition`) so 10c wires both alike.
3. **Per-class attack speed.** One table, one commit, signed by the owner in
   the round-0 playtest: each class's `speedScale` set against its damage
   and reach so the classes feel different (scimitar faster than the
   straight sword was the owner's example). This is a calibration the owner
   requested deliberately, not a casual retune; the table is the record.
4. **Real weapon data.** Every arsenal blueprint carries weight, value,
   damage by type, reach and speed from Skyrim's own records for the vanilla
   meshes (`Skyrim.esm`, mined the way `npc_records.py` mines NPCs — reuse
   its reader); mod meshes are authored by hand with the source cited. The
   inventory shows what the data says; the screen itself is 10b's.

### Round 1 — polearms and Black Marsh skins — DELIVERED 2026-09-19 (0077)

Download, convert and audition the Animated Armoury, Animated Heavy Armory
and Spear Mechanic clips through `tooling/asset-pipeline`; choose per class
on quality; wire spear (thrust), pike, halberd and quarterstaff as built
movesets, player and NPC; retire the borrows. Rapier and katana join the
one-handed family, claw joins as its own class (Short Blade skill). Black
Marsh Import's five weapons enter as skins on existing classes. Credits in
root `README.md` § Credits, source and hash on every asset, in the same
commit. Enemies in the sandbox fight with the NPC sets.

### Round 1b — the katana read, the cleared mods' meshes — DELIVERED 2026-09-19 (0077 §5)

`pipeline/hkx_interleaved.py` reads the interleaved-uncompressed katana
clips (round trip on all 59: max 0.0003 units, 0.10°); the `katana` pack and
moveset are wired to the class; the owner cleared the three held mods and
eleven of their weapons are built (three tridents, three half-pikes, the
five Black Marsh OBJ weapons), the OBJs turned onto the hand-node convention
by the entry's `orient` block. Contact windows (blade 1.05): KATANA_LIGHT_1
0.356..0.425, LIGHT_2 0.375..0.500, HEAVY 0.745..0.783, HEAVY_2
0.375..0.429; LIGHT_3 is a lunge with no tip sweep (one-handed LIGHT_3
fractions, commented, as the claw does).

### Round 2 — shortspear, unarmed, claws and dual wield

First a `shortspear` one-handed thrust class and pack from Skyrim Spear
Mechanic's set (Heavy Armory's shortspear meshes on it). Then vanilla `h2h` and `beasth2h_*` wired as the unarmed moveset with the clawed
set selected by race; the stamina-damage rule and the finisher opening from
76 §121 as data on the effects slot. Vanilla `dw` wired as dual wield for
the one-handed classes that allow it.

### Round 3 — the sandbox and the landing

1. **Per-enemy race and weapon set.** The sandbox spawns N enemies, each
   with its own race and weapon set chosen in the debug UI (dev-only export,
   no new singleton), so every new moveset is seen on every body.
2. **The landing.** Check the clip manifest for a vanilla running landing
   first (`jumpland`/`jumplandrun` families); source it if it exists. Then
   the landing clip runs at ×2 through `landingAnimationSpeed` and movement
   input is ignored until the clip's recovery point, so nothing slides.
   Visual check: `npm run visual:check -w @elder-souls/combat-sandbox -- <locomotion group>`.

## Gates

`npm test`, `npm run typecheck`, the sandbox visual check for anything that
touched animation, movement, physics or camera; `npm run preflight` before
every commit. The effects slot has a unit test that fails when the resolve
order changes. Every new class has a moveset test in the pattern of
`attackTiming.test.ts` and `weaponReach.test.ts`.

## Owner check (per round, plain English, written by the delivering agent)

Round 0: the sandbox with the skill slider; the speed table as a list of
"this class now swings faster/slower than that one". Round 1: each polearm on
the character and on an enemy, thrust not swing. Round 2: fists and claws on an
Argonian and a human; two swords. Round 3: three enemies of different races
and weapons at once; jump, land, no slide.

## Closing the lane

The last round's agent: moves the lane row in PROGRESS.md to done, rewrites
Phase 10b's starting state in the phases README to say the movesets exist
and only the port to the studio remains, updates 90 §74.3's polearm row to
"sourced and wired (lane, date)" and records in the buildout register which
hooks now exist.
