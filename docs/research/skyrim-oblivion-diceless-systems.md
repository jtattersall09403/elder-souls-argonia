# How Skyrim and Oblivion run Morrowind-ish systems without dice

Owner-requested comparison research (workstream S round 4, 2026-08-30) —
**report-only**: no design changes derive from this file; module 76 stays the
spec. All from the UESP MediaWiki API; page names cited inline. Useful when a
future agent wonders "how did Bethesda's own diceless ports do X, and where
did they go wrong?"

## Skill increases from use

**Skyrim** (*Skyrim:Leveling*): XP-per-use. Skill XP = `useMult × baseXP`;
cost to next skill level `mult × (level−1)^1.95 + offset`. Base XP: weapon
hits pay **base weapon damage** (not actual damage — smithing/perks don't
speed levelling); Block pays raw damage blocked (5 for a bash); Heavy/Light
Armor pay **raw damage received** per hit; Sneak pays per hidden-tick and
30 XP per melee sneak attack; Lockpicking 0.25/broken pick + 2–13 per
first-time success (re-picking pays nothing — can permanently starve the
skill); Speech 1 XP per gold of base value traded. Character XP per skill-up
= the new skill level; level-up needs `(level+3) × 25`.

**Oblivion** (*Oblivion:Increasing Skills*): flat XP per action, no damage
scaling — Blade 0.5/hit, Marksman 0.8, Block 1.25/blocked hit, Heavy 1.25 /
Light 1.5 per hit taken, Security 1.5 per tumbler, Sneak 0.75/s undetected.
Cost per level `0.35 × level^1.5 / 1.35…`, ×0.75 specialization ×0.6 major.

**Lesson both games teach** (and module 76 §120.2 now fixes): armour and
block level *only by getting hit* — UESP documents "stand in front of an
essential NPC and let them beat on you" as the standard method. Use-based
armour XP conflicts with skilled avoidance; our kill-award model is the
answer.

## Weapon skill → damage

**Skyrim** (*Skyrim:Weapons*): `damage = (base + smithing) × (1 + skill/200)
× perks × effects` — skill is only ×1.075→×1.5; the real multipliers are
perks (Armsman +100 %) and smithing. **Oblivion** (*Oblivion:The Complete
Damage Formula*): `WeaponRating = base × (0.75 + Attr/200) × (0.2 +
skill × 0.015) × condition term`, × a fatigue term `(fat/max + 1)/2` ×
`(100 − targetAR)/100`. Skill swing is ×8.5 — far steeper than Skyrim.
Neither game has any chance-to-miss; a connecting swing always lands (our
§102 rule is exactly their precedent).

## Lockpicking

**Skyrim** (*Skyrim:Lockpicking*): rotational sweet-spot minigame; sweet-spot
arc `60 × 2^(−difficulty) × (0.82 + 0.6 × skill/100)` degrees; picks drain
durability only while torqued outside the spot (Novice 2.0 s to break …
Master 0.25 s, × `(1 + 0.5 × skill/100)`). Skill = bigger target + tougher
picks; any lock openable at any skill with enough picks. **Oblivion**
(*Oblivion:Security*): 5-tumbler timing game; miss breaks the pick; mastery
perks control how many set tumblers drop. Both = deterministic + player
dexterity + consumable picks. Our pick-wear rule (§118) gets the same
economics without a minigame.

## Speech

**Skyrim** (*Skyrim:Speech*): persuade = flat threshold tiers 10/25/50/75/100;
intimidate = deterministic level/speech comparison vs NPC confidence; bribe =
computed gold cost; barter `3.3 − 1.3 × skill/100`. No rolls anywhere.
**Oblivion**: the persuasion-wheel minigame — UESP's own verdict: "almost
never a good choice as a major skill" because the minigame lets anyone max
disposition. Lesson: a grindable minigame deletes the skill; thresholds
(our §125) don't.

## Armour rating

**Skyrim** (*Skyrim:Armor*): per piece `AR = base × (1 + 0.4 × skill/100) ×
perk terms`; reduction = `AR × 0.12 % + 3 %/piece worn` with a **hidden
+25 AR per worn piece** and a **hard cap of 80 %** at 667 total. The
displayed number is not the real number — a decade of player confusion; if
you show a number, make it the true one. **Oblivion** (*Oblivion:Armor*):
displayed AR is a straight absorb-% — `base × (0.35 + 0.0065 × skill) ×
condition`, capped 85 %; random body-part selection per hit is a hidden die
Skyrim later deleted by pooling AR.

## Other notes

- **Oblivion's fatigue-as-damage-throttle**: melee damage × `(fat/max + 1)/2`,
  collapse at 0 — Morrowind's fatigue-hit-chance converted to a damage
  economy; the closest ancestor of a Souls stamina system. (We declined the
  combat fatigue multiplier deliberately, §117.3.)
- **Where the dice went**: perk breakpoints (Oblivion's Novice→Master skill
  perks: disarm/knockdown/paralyze power attacks at 50/75/100; Skyrim's perk
  trees), thresholds, and player execution. A few overt small percentages
  remain (crit-proc perks 10–20 %).
- **Skyrim crits are deterministic**: flat `floor(base × 0.5)` add-on.
- **Skyrim block oddity** (*Skyrim:Block*): weapon-block % scales with the
  *attacker's* weapon base damage (likely a bug) and does nothing vs
  creatures — a cautionary tale about formula plumbing.
- **Level scaling**: Oblivion kept Morrowind's ×1–×5 attribute multipliers
  (spawning "efficient levelling") *and* scaled enemies to the player;
  Skyrim went flat +10/level + perk and mostly-fixed per-name enemy levels
  with dungeon floors — the nearest precedent for our fixed-danger ruling
  (decision 0004), and it worked.
