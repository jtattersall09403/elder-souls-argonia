# Workstream S inputs: the sandbox baseline and what the quest plan demands

> **ARCHIVED — provenance only, never a spec.** Workstream S is closed: the
> live design is [module 76 §116–129](../../../world/76-stats-progression.md)
> plus decisions 0019/0031/0033 and `tooling/stats-sim/`. Read
> [the archive README](README.md) before trusting anything below.

> Research record for workstream S (module [76](../../../world/76-stats-progression.md) §103.1
> step 2). Two internal inputs, snapshotted 2026-08-26: (1) the numbers the combat
> sandbox actually runs on today — the calibration data the stat design re-bases;
> (2) every demand the quest plan places on character systems. External reference-game
> research lives in [stats-progression-reference-games.md](../../combat-and-systems/stats-progression-reference-games.md).
> Code facts cite files as of commit 60f5f9d; verify before implementation (10c).

## 1. The sandbox baseline (calibration data, not the neutral baseline)

### 1.1 Player constants

`packages/game-core/src/combat/weapon.ts` `COMBAT_TUNING` + `combat/tuning.ts`:
health **100**, stamina **100**, estus **3** (heal 45 over 1.55 s), stamina regen
**24/s** after **1.05 s** delay, sprint drain 15/s, roll cost 32 (0.72 s,
i-frames 0.12–0.43), backstep 26, parry 18 (window 0.10–0.29 of 1.1 s), jump 15.
Guard-break stun 2.47 s; riposte window 2.22 s; player guard-break health hit 18.
Walk 4.5 / sprint 6.0 m/s (lock-on walk 3.0, aim-walk 2.1); jump apex 1.378 m.

### 1.2 The protected reference loadout

Steel straight sword + steel kite shield + steel cuirass/gauntlets/boots (head
bare), iron war arrows. Steel sword: light chain 24/29/34 dmg (stamina 22/24/26),
heavies 45/58 (45/48), riposte/backstab 48 (crit ×2, head zone ×2). Steel shield:
stability 0.72, physical absorption 0.95. Armour rating 50 → 25.0 % mitigation
(`armourMitigation`: `r/(r+150)`). This exact loadout must reproduce today's
timing and weight at 10c (decision 0019); everything else may re-base.

### 1.3 Systems that already exist (the stat layer varies them, never re-invents)

- **15 weapon classes** (`equipment/weaponClasses.ts`), dagger→warhammer→spear/
  halberd→3 bows→staff, each a speed/reach/power/stamina/guard scale over one
  shared moveset (only the one-handed moveset is built; others provisional).
- **16 materials, tiers 1–8** (`equipment/materials.ts`), iron 0.85× → daedric
  1.95× damage, with weight/guard/value scales, requirement bonuses and elemental
  bonus damage. Weapon damage = round(24 × damageScale) × motion value.
- **Armour** as rating-per-piece summed → asymptotic mitigation `r/(r+150)`
  (studded set 19.8 % → daedric set 49.0 %). Coverage is biped-slot based.
- **Guard/block**: stamina cost = damage × 1.25 × (1 − stability); chip through
  absorption; break at empty stamina. Armour is skipped on blocked hits.
- **Physical bow model** (`combat/ballistics.ts`): real draw-force/energy/
  ballistics; `DAMAGE_PER_JOULE 0.5`; arrowheads with AP/wound profiles;
  penetration vs armour.
- **Inventory with weight** (`inventory/`): everything has weightKg; capacity
  180 kg (sandbox overrides 420); `encumbrance()`/`isOverEncumbered()` exist but
  **nothing consumes them** — burden has zero gameplay consequence today.
- **Enemy archetypes**: exactly one (`HOLLOW_WARDEN`, 150 hp, iron set, steel
  sword); damage comes from the loadout, not the archetype.

### 1.4 Hooks deliberately left for the stat system (all declared, none consumed)

- `AttributeId` = strength | endurance | agility | intelligence | willpower
  (`equipment/types.ts:34`).
- Every weapon carries `requirements` ({str 10, agi 10} + material bonus, up to
  daedric str+8/will+2) and `scaling` ({str 0.35, agi 0.45}) — never read.
- `RangedModifiers` (`ballistics.ts`): drawSpeed/drawStrength/sway/
  drawStaminaCost/damage, all 1.0 — the documented ranged insertion point.
- `CapabilityProfileId` reserves trainedSwimmer/advancedClimber/highBurden;
  the 3 implemented profiles are byte-identical (swim/breath/climb all 0 —
  Phase 9); `baselineArgonian` exists but equals `baselineHuman`.
- `weightKg` noted in code as "the natural input to future poise/speed".
- **No poise/stagger-resist stat exists**; reaction severity comes from attack
  id / hit zone. No level, XP, skill, attribute, carry-penalty, resistance or
  race stat exists anywhere (races are bodies + appearance only).

## 2. What the quest plan demands of character systems

Full sweep of docs/quests/ + world 30/60/92 (2026-08-26). The plan names
**capabilities and gates, almost never skills** — the stat design supplies the
vocabulary behind `QuestWorldProvision.approaches[].capabilityProfile` (quests
20 §13). Load-bearing demands:

- **Speech is an ending-grade system.** Every ending family must be resolvable
  by *speech-plus-evidence* or a hard fair duel (quests 00 §4 acceptance 6);
  MQ31 and both principal confrontations name "high speechcraft plus the right
  evidence — never skill alone". Yet the capability-inspection list (quests 60
  §49: water breathing, swim competence, climbing, lock skill, stealth, faction
  standing, spells, boat ownership, disease resistance, fast-travel knowledge)
  **omits speechcraft** — a gap workstream S must reconcile. Disposition
  appears once ("disposition of patrons", 40 §28). Social state is otherwise
  quest variables (trust/cover 0–100), and disguise/reputation must be **flags,
  not AI perception** (00 §4). No voice acting: checks must land in text.
- **Faction advancement = competence + reputation + sponsors** (40 §27–28):
  `FactionStanding {membership, reputation, competencyFlags, sponsors, …}`;
  "faction-specific skills or demonstrated methods" gate promotion (a
  non-combat character cannot become the Charter's combat captain). Rank is a
  topic-unlock input (60 §46). The narrative runtime needs reputation/rank
  before any production quest (90 §67).
- **Swim/breath/climb are stat-driven pillars** (world 60 §43, owner steer
  2026-08-26): athletics-or-equivalent governs swim speed *and* non-Argonian
  breath; Argonians breathe underwater outright, set independently of other
  swim stats. TraversalCapabilityProfile wants: swim speeds, acceleration,
  breath, current resistance, depth tolerance, stamina costs, equipment drag/
  buoyancy, climb stamina/speed/grip, jump, racial and spell effects. Spells
  may modify breathing/speed/grip; underwater routes may be spell- or
  equipment-gated (breathing charm, TG09). **No authored depths/distances/
  durations exist anywhere** — the stat system sets the numbers, world
  compilers validate routes against profile *ranges*.
- **Any WATER/BOAT/CLIMB-only quest must have a degraded fallback approach**
  (20 §11, validator-enforced), and Argonian water-breathing creates
  *advantages, never exclusive mandatory progression* (80 §63). All content
  playable by every race; race-neutral alternate mechanics where a rite would
  auto-pass Argonians (LW05).
- **Disease/poison = fixed environmental hazard + preparation counterplay**
  (world 30 §26–27): named ailments (blood rot, the droops, swamp fever),
  salves/smoke/repellents, Argonian resistance profiles, guide services;
  hazard intensity fixed by place and season. "Disease resistance" is an
  inspectable route-opener. Counters are frequently *items/consumables*
  (eel-slime vs ripper eels), not stats.
- **The Owing** (40 §39): transferable, extendable, heritable labour-debt in
  *nushmeekos*; player verbs are incur (Act II lead), audit (readable
  arithmetically-correct ledgers), buy-out-and-burn (Chainbreakers), pay
  tolls. Regionally parameterised, changeable by world state (BC06 reform).
  Never a player-spendable currency.
- **Economy**: rewards are access/permissions/training/equipment — "gold is
  the least interesting thing we can give" (00 §4); training is an assumed
  purchasable service (60 §50); priced information services (Ahnjazzi's
  danger-tier oracle); bribes and tolls recur; fences chosen by loyalty, not
  price. No barter-formula demand anywhere.
- **Magic is folk literacy, not a profession** (40 §34 — canon: Black Marsh
  day-labourers are accomplished Illusionists; no robed-mage guilds). Assumed
  effects: water-breathing, climb-assist, paralysis (used on the player as a
  gag), jump scrolls (the sanctioned early-power easter egg, 76 §102).
  Hardest fight winnable by **melee, magic, marksman, stealth** builds to
  parity (MQ31).
- **Danger-band capability ladder** (20 §12): D2 "new but prepared character
  survives"; D3 "substantial combat/traversal capability"; D4 "specialist
  equipment, route knowledge, allies or strong capability"; D5 fixed endgame,
  accessible early, never scaled. Four validator rules ban player-level or
  player-stat inspection that rescales the world; capability conditions open
  *alternatives* (80 §63).
- **Deliverability bounds** (00 §4): 55 % of quests solve with placed objects,
  dialogue, locks, journal state and **item-in-inventory checks** — stat
  mechanics that need new NPC perception/pathing AI can't be load-bearing;
  detection is cones/flags (RS02 watcher boats), witnesses are knowledge
  flags; ≤6 simultaneous actors; NPCs never share the player's traversal
  verbs. Quest conditions come from a **finite typed vocabulary** (80 §58) —
  every stat gate must be expressible as a typed condition.

### 2.1 What the plan deliberately does NOT require

Never mentioned or explicitly excluded — candidate cuts unless the chassis
wants them for its own sake: **enchanting** and **spellmaking** (absent from
every quest/world doc), **pickpocketing** (theft is always container/room
based), conventional **state bounty/prison** (no courts, no treasury, no state
prisons — the Owing and city jails are the sanctioned resolutions),
transformations (vampirism/lycanthropy-style stat packages), radiant work as
progression, automatic leadership.

## 3. Binding constraints carried in from decisions (short form)

Fixed danger, absolute authored numbers (0004); no hidden to-hit roll; today's
values are calibration data with one protected reference loadout; uncapped
earned power ceiling, jump-scroll rule; capability profiles are the world
contract (75 §52); Argonian physiology as race modifiers; birthsigns
calendar-shaped (55 §95); semantic authoring compiled to absolutes (0019
fourth amendment); the balance-simulation harness before round 2 (0019 third
amendment). Full statements: module 76 §102, decision 0019.
