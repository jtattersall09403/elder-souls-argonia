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

## Starting state (2026-09-18, rewritten at round-0 close; the closing round-1 agent rewrites this)

Run the `routing-audit` skill over this brief before building. **Round 0
is delivered** ([0076](../../decisions/0076-weapons-lane-round-0-effects-slot-skill-inputs-and-skyrim-calibrated-tables.md)):

- **Classes** (`packages/game-core/src/equipment/weaponClasses.ts`): dagger,
  shortSword, straightSword, scimitar, axe, mace (moveset `oneHanded`);
  greatsword; greataxe, warhammer (`greataxe`); shortbow, longbow, warbow
  (`bow`); **spear and staff borrow `greatsword`, halberd borrows
  `greataxe`** — a spear swings rather than thrusts. No pike, quarterstaff,
  unarmed, dual-wield, rapier, claw or katana class. Every class carries an
  `effects` list (mace and warhammer pierce armour, axe and battleaxe
  bleed, the rest empty) and a `speedScale` calibrated to Skyrim's records
  (0076 §4); a new class must set both.
- **Movesets** (`equipment/movesets/`): `bow`, `oneHanded`, `twoHanded`,
  `shield`, `criticals`; `resolveMoveset` falls back to `oneHanded` for a
  moveset not in `BUILT_MOVESETS` (`borrowedMoveset` on the item says so).
- **Hit resolution**: `combat/resolveHit.ts` is the single step for every
  contact, in the fixed order `combat/README.md` records; `HitContext`
  takes `effects` and `attacker: MeleeModifiers`; results carry `status`
  applications that `combat/statusEffects.ts` ticks on `Fighter.status`.
- **Skill inputs**: `combat/skillScalars.ts` turns a 0–100 skill into
  `RangedModifiers` (nock, draw, sway, draw stamina, damage) and
  `MeleeModifiers` (damage position, stamina cost). `resolveArrowImpact`
  takes the damage multiplier as its fourth argument. The sandbox store has
  `marksmanSkill`, `meleeSkill` (default 10) and `classEffectsEnabled`
  (default true), driven from the HUD.
- **Records**: `equipment/generated/weapon-records.json` holds Skyrim's own
  damage, weight, value, speed, reach and crit for all 53 arsenal items,
  mined by `tooling/asset-pipeline/pipeline/weapon_records.py` (reuses the
  ESM readers in `npc_records.py`). Materials were refitted to it (0076 §5).
- **Landing**: `anim/landing.ts` exposes `selectLandingAnimation` and
  `landingAnimationSpeed`; `locomotion/explorerLocomotion.ts` uses both.
  Movement is not locked during the landing clip (the "sliding on landing").
- **Sandbox** (`apps/combat-sandbox/src/components/`): enemy spawning is
  one archetype set at a time; no per-enemy race or weapon-set picker.
- **Sources, verified 2026-08-26 (90 §74.3), none downloaded:** Animated
  Armoury (SSE 35978: rapier, pike, halberd, quarterstaff, claw, katana
  meshes + loose-`.hkx` player *and* NPC movesets; "just credit NickaNak",
  conversions allowed); Animated Heavy Armory (51100: shortspear, half-pike,
  poleaxe, trident); Skyrim Spear Mechanic (25146). Vanilla: 70 hand-to-hand
  clips including the `beasth2h_*` clawed set for Argonians and Khajiit
  plus the `dw` dual-wield set. Black Marsh Import (48551): five bespoke Black
  Marsh weapon meshes (skins for existing classes, no movesets). The vault
  and `../elder-scrolls-asset-pipeline/skyrim-source` are checked first;
  downloads use the owner's Nexus key on this VM, never echoed.

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

### Round 1 — polearms and Black Marsh skins

Download, convert and audition the Animated Armoury, Animated Heavy Armory
and Spear Mechanic clips through `tooling/asset-pipeline`; choose per class
on quality; wire spear (thrust), pike, halberd and quarterstaff as built
movesets, player and NPC; retire the borrows. Rapier and katana join the
one-handed family, claw joins as its own class (Short Blade skill). Black
Marsh Import's five weapons enter as skins on existing classes. Credits in
root `README.md` § Credits, source and hash on every asset, in the same
commit. Enemies in the sandbox fight with the NPC sets.

### Round 2 — unarmed, claws and dual wield

Vanilla `h2h` and `beasth2h_*` wired as the unarmed moveset with the clawed
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
