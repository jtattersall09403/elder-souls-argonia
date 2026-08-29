# Workstream S mapping inventory: every decision the chosen shape creates

> **ARCHIVED — provenance only, never a spec.** Workstream S is closed: the
> live design is [module 76 §116–129](../../../world/76-stats-progression.md)
> plus decisions 0019/0031/0033 and `tooling/stats-sim/`. Read
> [the archive README](README.md) before trusting anything below.

> Step 3 of the run-book (module [76](../../../world/76-stats-progression.md) §103.1):
> the skeleton is owner-chosen ("Morrowind chassis, Souls combat layer") — this
> enumerates the seams, mapping tables and completeness-sweep finds that shape
> creates. Each entry: draft position + tag — **[R1]** = owner round 1 question
> (see [stats-progression-owner-round1.md](stats-progression-owner-round1.md)),
> **[default]** = proposed default, vetoable at round 2. Evidence:
> [reference-games](../../stats-progression-reference-games.md) (§refs "RG"),
> [repo/quest inputs](stats-progression-repo-baseline-and-quest-inputs.md) ("RQ").
> Skeleton stress-test verdict: **the prior holds.** No seam forced a breakage;
> every Morrowind pathology maps to a part we were deleting anyway (RG §1.10).

## 1. Chassis↔layer seams

- **S1 Fatigue vs stamina** [R1]. Morrowind fatigue is a slow, travel-scale
  pool whose ratio scales everything ±25 % (RG §1.2); Souls stamina is the
  fast combat loop our sandbox already runs. Draft: **two-layer** — keep
  Souls stamina untouched for actions; add *Fatigue* (from Str+Wil+Agi+End)
  drained by sprint/swim/climb/jump/encumbrance over minutes, whose ratio
  scales the stamina *ceiling and regen* (and swim speed, climb grip) — the
  Morrowind modifier re-expressed one level up so it never touches per-swing
  feel. Serves swimming/climbing directly (breath margins, climb stamina).
- **S2 What a weapon skill does with no to-hit dice** [R1]. Character skill
  may modify damage, stamina cost, poise damage, recovery, reach,
  reliability — never whether a connecting hit lands (§102). Draft: skill
  buys (a) modest damage (~±20 % band), (b) stamina-cost reduction, (c)
  **moveset unlocks at thresholds** (light3 / heavy2 / running & charged
  attacks per class — the Skyrim "mechanics unlock" lesson, RG §3), (d)
  slightly faster *recovery* (never windup/i-frames — DS2 rule, RG §2), (e)
  less condition wear. Gear stays the main damage axis (RG §2 upgrades
  dominate; placed materials = geographic progression).
- **S3 Armour skills vs equip-load roll tiers** [R1 (part of Q5)]. Both,
  different jobs: light/medium/heavy skills scale protection-per-worn-class
  (Morrowind `skill/30`-like, gentler); **burden ratio** (Souls) sets
  fast/mid/fat roll tiers and movement/stamina costs, movable by Strength,
  Feather/Burden effects, potions (0019 amendment). Unarmored kept as a
  skill (Argonian +5 canon): dodge/poise bonus when bare [default].
- **S4 Spell failure vs real-time casting** [R1]. Morrowind's cast-dice are
  the magic twin of misclick-miss. Draft: **no fizzle dice** — skill gates
  castable spell tiers, scales magicka cost and cast wind-up, and scales
  magnitude modestly so magic sits on the same multiplier stack as weapons
  (Skyrim Destruction lesson, RG §3).
- **S5 Magicka regen** [R1 (in Q6)]. Rest-only (chassis) vs slow ambient vs
  flask-split. Draft: slow Willpower-scaled regen + full restore at rest;
  Atronach-style birthsign can still remove it.
- **S6 Athletics/Acrobatics vs Souls movement** [default]. Owner-decided:
  Athletics governs swim speed + non-Argonian breath (world 60 §43).
  Draft: Athletics = run/swim/breath; **Acrobatics = jump/fall/climb** (BotW
  climbing gets its governing skill without inventing a 28th); all outputs
  clamped to capability-profile ranges (75 §52); base speeds stay today's
  values at reference — stats vary around them within bands.
- **S7 Enchant economy vs bounded loops** [R1 (in Q10)]. Keep item magic
  with Morrowind's three real knobs (capacity/slot, constant-effect cost,
  soul-size gate); success dice dropped (enchanting services + guaranteed
  self-enchant below a skill-scaled point budget); **no effect may fortify a
  crafting skill or crafting input stat** — crafting reads base stats only
  (kills both god-loops, RG §1.7/§3).
- **S8 Blocking** [default]. The sandbox guard system (stability/absorption/
  chip/guard-break) already *is* the resolved seam — Morrowind's block dice
  are gone. Block skill scales stability and reduces guard stamina cost.
- **S9 Sneak/Security dice → deterministic** [default]. Detection =
  visibility/noise thresholds vs cones (deliverability rule: flags, not AI
  perception — RQ §2); locks: open iff `Security + tool ≥ lock level`
  (+ Open magnitude, + keys always) — typed-condition friendly, no rolls.
  No pickpocketing verb (quest plan never uses it; Morrowind's is broken).
- **S10 Stagger vs poise** [R1 (in Q5)]. No poise stat exists today (RQ §1).
  Draft: ER hybrid at 10c — weapon poise damage + small passive threshold +
  hyperarmor on committed heavies + enemy posture break; defaults chosen so
  the reference loadout reproduces today's reactions exactly.
- **S11 Hand-to-hand** [default — flagged as an unasked find]. Keep the
  skill; port the mechanic Souls-shaped: unarmed hits deal reduced health
  damage but strong stamina/posture damage; a fatigue/posture-broken enemy
  is finishable. Beast-race claw clips are already in the vault (RG §5).
  Speed-governed per canon; Strength contributes (fixing MW pathology 7).
- **S12 Item condition** [R1]. Keep/re-derive/cut. Draft: keep —
  damage/AR scale with condition ratio (gentle floor, no mid-fight breakage
  surprise: unusable only at 0), repaired via smithing skill + hammers +
  services; it feeds the economy, the Armorer/smithing merge and loot
  provenance ("washed-up wreck gear is at 30 %").
- **S13 Death and loss** [R1]. No souls-currency exists in a use-based
  chassis. Draft: respawn at last rest; world state persists; carried gold
  pouch drops at the death site, one retrieval (Souls tension without
  inventing a currency); skills/attributes/items never lost (DS2 lesson).
- **S14 Healing** [R1]. Flask (estus, 3 charges today) primary, count and
  potency upgraded by placed world items; alchemical healing = slow
  regen-over-time consumables that never out-tempo the flask in combat
  (fixed-danger requirement, RG §2).
- **S15 Persuasion/barter dice → thresholds** [default]. Speech checks =
  Speechcraft/Personality + evidence flags + disposition + faction rank
  crossing authored thresholds (never skill alone — quest acceptance);
  no random rolls in dialogue. Mercantile = flat price modifier band
  (no haggling minigame, no Creeper-style bypass NPCs). *Doc fix owed:
  speechcraft is missing from quests 60 §49's inspectable list (RQ §2).*
- **S16 Crime → the Owing** [R1 — unasked find]. The province has no courts,
  treasury or state prisons (quests 10 §5): draft — crime is assessed as an
  **Owing debt** (regional parameters, auditable ledger) with city jails as
  the only custodial fallback; Morrowind's gold-bounty ladder becomes
  nushmeeko assessments. Turns a generic bounty system into the setting's
  signature institution.
- **S17 Racials** [R1]. Draft: Morrowind-weight racials ported (attribute
  mods + skill bonuses + permanent resists/powers; Argonian exact: Resist
  Poison 100, Resist Common Disease 75, water breathing, Athletics+15 …),
  including **beast-race gear restrictions** (no boots, no closed helmets) —
  canon, visually free (mesh slots already exist), and a real trade-off.
- **S18 Birthsigns** [default]. Slot ships at creation via the world
  calendar (pick a birth *date* → sign, 55 §95); the 13 signs' effects are
  content, deferred; dice-based signs (Warrior/Thief) re-expressed when
  authored.

## 2. Item-mapping table (draft — Skyrim taxonomy → chassis)

Weapon classes already in code (RQ §1.3) → chassis weapon skills:

| Chassis skill (gov.) | Our classes today | Additions (sourced, RG §5) | Stat derivation |
|---|---|---|---|
| Short Blade (Spd) | dagger, shortSword | parrying dagger, claws?, katana→Long | keep class scales; graft MW triad profiles as per-attack motion-value shapes (chop=heavy, slash=chain, thrust=poke) onto existing movesets; materials stay our tier table (RQ §1.3), cross-checked against MW ladders (RG §1.8) |
| Long Blade (Str) | straightSword, scimitar, greatsword | katana, rapier | " |
| Blunt (Str) | mace, warhammer, staff | quarterstaff, short staff | " (narrow damage bands = low light/heavy spread — MW identity kept deliberately) |
| Axe (Str) | axe, greataxe | poleaxe/halberd? (halberd → Spear per MW) | " |
| Spear (End) | spear, halberd | shortspear (1H+shield), pike, trident, javelin | fix MW's spear weakness *by moveset*: reach + poke + shield-spear — the Souls layer does what MW's dice couldn't |
| Marksman (Agi) | shortbow, longbow, warbow | crossbow (vault extension), thrown (knives/stars/javelins ×2 rule) | ballistics model already physical; skill acts via RangedModifiers (draw speed/sway/stamina) |
| Hand-to-hand (Spd) | — (70 vanilla clips incl. beast claws) | optional MCO sets | stamina/posture damage model (S11) |

Armour: piece meshes keep Skyrim slots; **class is a per-material data tag**:
light = studded/leather/elven/glass…; **medium = chitin/bonemold/dreugh/
orcish/imperial-scale…** (Morrowind-classified, Argonia-flavoured); heavy =
iron/steel/dwarven/ebony/daedric. Shields follow material. Clothing =
unarmoured slots. [default, table authored at step 5]

## 3. Keep/drop table (recommendations — evidence RG §5)

| Category | Rec | Basis |
|---|---|---|
| Spears/pikes/halberds/staves | **KEEP** [R1] | 3 mods, open permissions, player+NPC movesets |
| Throwing weapons | **KEEP** [R1] | meshes + throw clips sourceable; one permission line to verify |
| Crossbows | **KEEP** [R1] | requires SE/DLC vault extension (also yields bonemold/chitin) — a sourcing job to schedule |
| Medium armour | **KEEP** [R1] | reclassification only, zero new assets |
| Unarmed | **KEEP** [R1] | already in vault, beast-race claws included |
| Katanas/rapiers/claws | optional | free with Animated Armoury; fold into Short/Long Blade if kept |
| Whips | **DROP** [R1] | behavior-injected (not clean clips), lore-weak, MW doesn't have them |

## 4. Completeness sweep — everything else this touches

- **Skills list** [default]: Morrowind's 27 kept minus dice-dependent
  re-expressions, with Armorer→**Smithing** (repair + bounded temper + craft;
  the Skyrim keeper, Q-flagged), Mysticism kept despite 4E dissolution
  (foreign institutions never took root in Black Marsh — the *folk* school
  survives; lore note to record) [R1 (in Q11)], Unarmored kept, no
  pickpocket. Full list authored at step 5.
- **Progression** [R1]: use-based `(skill+1)`-style linear XP with
  effect-proportional gains + anti-grind damping; **attributes derive
  automatically from governed skill-ups** (no ×5 minigame); level = milestone
  from major/minor gains, consolidated by **resting**, granting End-scaled
  health; soft-capped returns (Souls lesson) so the late curve flattens into
  gear/knowledge/mastery.
- **Class/background** [R1]: full Morrowind structure (5 major +25 / 5 minor
  +10 / specialization ×0.8 / 2 favoured attributes; presets + custom).
- **Disease/blight/poison** [default]: fixed environmental hazard fields +
  named ailments as attribute/stat-drain packages, cure/prevention via
  alchemy, salves, services; Resist Disease/Poison as racial + gear stats;
  blight tier for deep-marsh zones (world 30 §26). Detail at step 5.
- **Alchemy** [default]: Morrowind formulas with **base-stat inputs only**
  (loop-killer), skill-gated effect visibility, apparatus quality, regional
  ingredients from lore feeds.
- **Speech/reputation/dialogue** [S15 default + R1 note]: disposition per
  NPC; `FactionStanding` (quests 40 §28) supplies rank/reputation/
  competency inputs; speechcraft added to the quests-60 inspectable list.
- **Training/services/economy** [default]: trainer cap = governing attribute
  (drain-proof: reads base values); training/bribes/tolls/fares as sinks;
  spellmaking fee-scaled; enchanting services expensive; barter band by
  Mercantile + disposition.
- **Rest** [decided 2026-08-28, supersedes the earlier no-respawn default]:
  one mechanic carries the save (F3), level banking + soul spending (F1),
  health/magicka restore and (with safe-rest knowledge, 0007) the access
  progression. **Generic enemies respawn on rest** (owner ruling, decision
  0031): creatures/wildlife/misc dungeon denizens by default; named NPCs,
  minibosses, bosses never; cleared dungeons stop respawning; death-wake
  counts as a rest. The flask refill went with the flask (Q7).
- **Swim/climb/boats** [default]: stat hooks per world 60 §43 —
  Athletics/Acrobatics/burden/race/spells feed TraversalCapabilityProfile;
  breath = Morrowind 20 s base scaled by Athletics & Endurance, ∞ for
  Argonians; boats gate by ownership/knowledge, no piloting skill.
- **Marksman ammo** [default]: arrows as physical items with material tiers
  (already real); recovery rates replace MW's 25 % flat rule (already
  modelled via stick/break probabilities).
- **NPC/enemy stat model** [step 5/6 deliverable]: same schema + level;
  authoring is semantic ladder positions compiled to absolutes (0019 fourth
  amendment); D0–D5 anchored by the numbers packet.
- **Followers** [default]: same schema; no shared player-traversal verbs
  (deliverability rule).
- **Skyrim keepers** [R1]: smithing (recommended KEEP, merged with Armorer,
  convergent bounds); learn-by-disenchanting (recommended KEEP if enchanting
  ships); perk *points* NOT kept — skill-threshold unlocks give the same joy
  without a second economy.

## 5. Proposed defaults register (vetoable at round 2)

S6, S8, S9, S11, S15, S18 above, plus: armour material classification table;
no pickpocketing; no haggling minigame; no enemy respawn on rest; encumbrance
= Strength-derived kg cap with Morrowind hard stop at over-max; hit-zone ×2
head multiplier and crit model kept as-is; attack-speed stat scaling limited
to recovery phase, small bands, per-class opt-in; jump-scroll-class scroll
magic exists (76 §102); Luck cut *if* Q1 lands on 7 attributes; capability
profiles regenerate from stat system at 10c (75 §52); danger-band numbers
(what D0–D5 means) reserved for the numbers packet + simulation before
round 2.
