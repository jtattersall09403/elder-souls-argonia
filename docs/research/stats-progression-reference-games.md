# Workstream S research: how the reference games actually work

> **Still live evidence** — this is the only record of Morrowind's formula
> constants and the mod-sourcing permission facts, so it stays in `docs/research/`.
> The design it fed is [module 76 §116–129](../world/76-stats-progression.md);
> the rest of workstream S's working papers are closed and archived in
> [archive/workstream-s/](archive/workstream-s/README.md).

> Research record for workstream S (module [76](../world/76-stats-progression.md)
> §103.1 step 2): Morrowind's real formulas (UESP trawl, 2026-08-26, ~35 pages via
> `en.uesp.net/w/api.php`), the Souls layer's mechanics, Skyrim's lessons, and the
> mod-scene availability evidence for Morrowind-only item categories. Findings and
> implications, not a wiki dump — but the constants are the value, so they are kept.
> Internal inputs (sandbox baseline, quest demands):
> [archive/workstream-s/stats-progression-repo-baseline-and-quest-inputs.md](archive/workstream-s/stats-progression-repo-baseline-and-quest-inputs.md).
> Notation: `Fat%` = current/max fatigue.

## 1. Morrowind — the chassis (all facts cite UESP page names)

**The global fatigue modifier `(0.75 + 0.5 × Fat%)` is the system's real
universal stat**: it scales nearly every check in the game ±25 % (hit, block,
cast, sneak, security, repair, even barter). *(Morrowind:Fatigue)*

### 1.1 Combat *(Morrowind:Combat)*

```
Hit%     = HitRate − Evasion, rolled per swing
HitRate  = (WeaponSkill + Agi/5 + Luck/10) × (0.75 + 0.5×Fat%) + FortifyAttack
Evasion  = (Agi/5 + Luck/10) × (0.75 + 0.5×Fat%) + Sanctuary + Chameleon/5
Damage   = WeaponDmg × (Str+50)/100 × Condition/MaxCondition × Crit
           Crit: ×4 melee sneak, ×1.5 ranged sneak. Thrown = listed dmg ×2.
           WeaponDmg: per-attack-type min–max (chop/slash/thrust), interpolated
           by attack-hold time ("pull back"), not random.
Armor    : PieceAR = BaseAR × ArmorSkill/30; slot-weighted total
           (0.3 cuirass, 0.1 shield/helm/greaves/boots/pauldron, 0.05 gauntlet);
           Unarmored slot AR = Unarmored² × 0.0065
           DamageTaken = Damage / min(1 + AR/Damage, 4)     # floor 25 %
Block    = dice after the hit roll: (Block + Agi/5 + Luck/10) × fatigueMod,
           clamped 10–50 %; shield required; 90° left / 30° right arc
Stagger  : every connecting hit staggers; knockdown chance rises with damage;
           100 Agility = knockdown-immune; fatigue ≤ 0 = knockout
H2H      : governed by Speed; damages FATIGUE (skill/2 per hit); health only
           vs downed targets (skill × 0.075); nothing is immune
```

⇒ **`min(1 + AR/dmg, 4)` is a genuinely good armour curve for a fixed-danger
world**: percentage mitigation *falls* as incoming damage rises, so endgame
armour never trivialises D5 hits and can never exceed 75 % reduction. Compare
our current `r/(r+150)` (flat percentage regardless of hit size) — porting the
Morrowind shape is worth considering at 10c.
⇒ The hit/evasion/block dice are the part our no-to-hit rule deletes. H2H's
fatigue-damage-then-knockout loop is portable and pairs beautifully with a
Souls posture/stamina layer.

### 1.2 Fatigue, movement, encumbrance, breath

```
MaxFatigue = Str + Wil + Agi + End (≈max 400); regen 2.5 + 0.02×End /s
Running 5 + 2×%Encumbrance /s · swimming 7 /s · jumping/attacking drain too
Encumbrance max = Str × 5; over-max = cannot move (can still fight/cast)
Athletics → run/swim speed only; Speed attribute → all movement;
race Weight multiplies ground speed (Orc M 1.35 … Bosmer F 0.9)
Acrobatics (gov. Strength) → jump height/dist, fall damage (126 = immune),
  steep-slope walking; fall XP +3.0 vs jump +0.15 (fall-grinding meme)
Breath = 20 s flat; drowning 3 HP/s; Water Breathing bypasses; swimming
  ignores armour? no — but aquatic creatures ignore Speed (engine bug)
```
*(Morrowind:Fatigue, Encumbrance, Athletics, Acrobatics, Speed, Health)*

### 1.3 Attributes *(Morrowind:Attributes + sub-pages)*

8 + Luck; start 30–50 by race/sex (+10 two class favourites); cap 100.
Str → damage (Str+50)/100, carry ×5, fatigue; Int → magicka ×(1+multipliers),
alchemy/enchant; Wil → cast chance, resist paralysis, fatigue; Agi → the /5
term in hit/evade/block/sneak/security, knockdown resist, fatigue; Spd →
movement; End → health start (Str+End)/2, health/level End/10 (never
retroactive), fatigue regen; Per → disposition, persuasion, prices; Luck →
/10 in most dice ("half the weight of the primary"), no governed skills.
⇒ **Luck's entire mechanical existence is dice modifiers.** With no dice, Luck
has nothing to do — cutting it is near-free.

### 1.4 Skills and levelling *(Morrowind:Skills, Leveling, Trainers)*

27 skills; 5 majors (+25, start 30), 5 minors (+10), rest misc (start 5);
specialization +5 & ×0.8 XP; race bonuses to +15.

```
XP to next point = (Skill+1) × [0.75 major | 1.0 minor | 1.25 misc] × [0.8 spec]
Level-up: 10 major/minor points → rest to level; pick 3 attributes;
  multiplier from governed-skill points since last level (incl. misc):
  0→×1, 1–4→×2, 5–7→×3, 8–9→×4, 10+→×5. Health +End/10 per level.
Trainers: cannot train a skill above its governing attribute; cost scales
  with skill level/disposition/Mercantile/fatigue. Skill books: 5/skill, +1.
```
⇒ The linear `(skill+1)` use-based curve is clean and self-balancing; the
**attribute-multiplier step is the single most complained-about system in the
game** (UESP hosts an "efficient levelling" playbook: spreadsheet misc-skill
grinds before every rest, max Endurance first because health isn't
retroactive). Keep use-based growth; do not port the multiplier bookkeeping.
The trainer cap (skill ≤ governing attribute) is a good attribute-relevance
device and a natural Owing-economy money sink.

### 1.5 Classes and birthsigns

21 presets or custom: 5 major + 5 minor + specialization + 2 favoured
attributes. 13 birthsigns (one per month — our world clock already models
this, 55 §95): Warrior +10 attack dice (dead for us), Mage/Apprentice/Atronach
magicka multipliers +0.5/+1.5/+2.0 (Apprentice: Weakness Magicka 50; Atronach:
Spell Absorption 50, no magicka regen), Lady +25 Per/End, Steed +25 Spd, Lord
regen spell + Weakness Fire 100, Ritual/Shadow/Tower/Lover/Serpent = 1/day
powers (Paralyze, Invisibility 60 s, Open 50, poison). *(Morrowind:Birthsigns)*

### 1.6 Magic *(Morrowind:Magicka, Spells, Spell Making, Enchant, Souls)*

```
MaxMagicka = Int × (1 + race + birthsign)   # regen: REST ONLY, 0.15×Int/hr
Cast% = (Skill×2 + Wil/5 + Luck/10 − SpellCost − Sound) × fatigueMod
        # magicka spent even on failure; spell damage ignores AR, can't crit,
        # skill never scales magnitude — only the cast roll
Spellmaking fee = 7 × magicka cost; 8 effects max
Enchant capacity per item (0–225): Daedric Tower Shield 225, exquisite
  ring/amulet 120, Ebony Staff 90, Daedric Cuirass 60, exquisite clothes 60,
  iron dagger 2. Constant Effect needs soul ≥ 400 (Golden Saint).
Soul gems: petty 30 … grand 600, Azura's Star 15000 reusable; souls 10–1000.
Self-enchant success ≈ (Enchant + Int/5 + Luck/10 − 3×points) × fatigueMod
  (halved for constant); NPC enchanters 100 % success, very expensive.
Charged-item use cost = BaseCost × (1.1 − Enchant/100); recharge 1 pt/20 s
```
⇒ Enchanted items are Morrowind's "skill-free casting" pressure valve — free,
instant, 100 % reliable — which is why endgame characters "might never cast a
spell again" (UESP's words). If we keep item magic, the balance knobs are
capacity per slot, the ×100 constant-effect cost and the 400-soul gate — not
success dice.

### 1.7 Alchemy *(Morrowind:Alchemy)*

```
Strength = (Alchemy + Int/10 + Luck/10) × MortarQuality / (3 × EffectBaseCost)
Duration = same / EffectBaseCost; apparatus 0.5–1.5 (2.0 console-only)
Skill-gated ingredient-effect visibility (0/1/2/3/4 effects at 15/30/45/60)
```
**The god-loop**: Fortify Int potions raise Int → stronger potions →
exponential; UESP: "may seriously unbalance the game and even crash it."
Root cause: an output stat is also the crafting input, unclamped. Fix is one
line of design: crafting reads **base** stats only (or diminishing stacking).

### 1.8 Items *(Morrowind:Base Weapons/Armor templates, Armorer)*

Weapon identity = per-class damage-triad profiles + speed + reach:
short blade speed 2.0–2.5, balanced triads, low ceilings (iron dagger 4–5 →
daedric wakizashi 10–30); long blade versatile (iron 2–13/1–18/4–16 → daedric
claymore 1–60); blunt narrow bands (iron mace 1–12, charge time wasted — a
known oddity); axe chop-spikes highest ceilings (daedric battle axe 1–80);
spear thrust-only, reach 1.8, modest damage (daedric 6–40) — canonically
underpowered (§1.10); staff = Blunt, reach 1.8, huge enchant capacity;
marksman bows 1–10 … 2–50 + arrow damage (iron 1–3, daedric 10–15); thrown ×2.
Armour AR ladders: light netch 5 → glass 50 (at ⅕ daedric's weight); medium
bonemold 16 → dreugh 40; heavy iron 10 → ebony 60 → daedric 80.
**Condition**: damage and AR scale linearly with condition ratio; 0 =
unusable; repair chance (Armorer + Str/10 + Luck/10) — clothing indestructible.
⇒ The damage-triad profiles translate 1:1 to Souls attack types (overhead
heavy = chop, chain = slash, running/poke = thrust): port the *profiles*
(axes spike on heavies, spears poke at range, daggers spam), not the
hold-to-charge interpolation the Souls layer already expresses.

### 1.9 Economy, social, crime, disease

Barter: disposition + both Mercantile + fatigue, per-transaction haggling
(exact equation is engine-GMST, not on UESP). Speechcraft: admire/intimidate/
taunt/bribe dice vs disposition (bribe uses Mercantile — bug). Sneak: opposed
dice with distance/direction/shoe-weight terms; pickpocket double-rolled vs a
75 % cap → 56 % ceiling at skill 100 (broken). Security: `(Security + Agi/5 +
Luck/10) × ToolQuality × fatigueMod − LockLevel`, no dice needed to *fail*
gracefully — keys always work, Open magnitude ≥ lock level works. Crime:
bounty = item value (theft), 40 assault, 1000 murder; ≥5000 kill-on-sight;
jail decrements skills 1/day. Disease: contracted from hits/looting; common
(cure cheap) / blight / corprus tiers as attribute-drain packages; **Resist
Common Disease 75 racial: Argonian, Altmer, Redguard, Bosmer.**

**Argonian, exact** *(Morrowind:Argonian)*: M Str40 Int40 Wil30 Agi50 Spd50
End30 Per30 Luck40 (F: Int50 Wil40 Agi40 Spd40); skills Athletics+15,
Alchemy/Illusion/Medium Armor/Mysticism/Spear/Unarmored +5; **Resist Poison
100 (immune), Resist Common Disease 75, racial Water Breathing spell**; no
boots, no closed helmets. Other racials condensed: Breton magicka ×+0.5 +
Resist Magicka 50; Dunmer Resist Fire 75; Altmer magicka ×+1.5 + big
elemental weaknesses; Nord Resist Frost 100/Shock 50; Orc Resist Magicka 25 +
Berserk; Redguard Resist Poison/Disease 75 + Adrenaline; Bosmer/Khajiit
agility/stealth packages. Morrowind racials are build-defining permanents —
unlike Skyrim's erasable +10 starting skills.

### 1.10 Morrowind's documented failure modes

(1) level-up multiplier minigame (§1.4); (2) misclick-miss at low skill — the
most cited onboarding failure, lives entirely in the deleted dice; (3)
Speed/Athletics/Acrobatics dominance (jump-beats-run at 100/100, fall-damage
grinding, Boots of Blinding Speed whose Blind 100 *helps* via a bug); (4) the
alchemy god-loop (§1.7); (5) the enchant-suit bootstrap (§1.6); (6) spears
underpowered (thrust-only, no shield, few models); (7) H2H stunlock +
Strength-independence; (8) economy bypasses (Creeper/Mudcrab flat-value
merchants; Fortify Mercantile 400 = any offer accepted); (9) pickpocket's 56 %
ceiling; (10) drain-and-train (trainer cap reads *current*, drainable,
values); (11) the 16-bit spellmaking overflow; (12) blunt's narrow bands.
⇒ **Nearly all of these live in the three places we are not porting anyway:
the dice (2,3,7), the level-up bookkeeping (1,10), and unclamped
self-referential loops (4,5,8,11).** What UESP shows to be sound — the fatigue
modifier as a performance scaler, (Str+50)/100, the armour curve, linear
use-based XP, condition-as-ratio, Str×5 carry, 20 s/3 HP-s breath, the weapon
class identities — is exactly what transfers.

## 2. The Souls layer (DS1/DS3/Elden Ring)

- **Soft caps everywhere**: Vigor 40/60 (per-point HP collapses ~7:1 after),
  Endurance stamina hard-stops at 40 in DS1/DS3, ER 15/30/60; damage stats
  ~40 then 60/80. Two-handing counts Str ×1.5. Curves accelerate *into* the
  cap then cliff — reaching a breakpoint feels like completing something,
  over-investing is legibly wasteful. **Soft caps are the Souls answer to
  "uncapped ceiling without runaway levelling."**
- **Weapon scaling**: `AR = Base + Σ Base × coef(weapon,stat,upgrade) ×
  saturation(stat)`; letter grades are display buckets. **Upgrades dominate
  stats** (~60–80 % of final AR; ER PvP matchmakes on max upgrade level) — in
  a fixed world with hand-placed upgrade materials this is *good*: weapon
  power becomes geographic progression (MorrowLoot logic). Corollary: stats
  must buy something other than raw damage or they're dead weight.
- **Equip load**: DS1 <25/50/100 % fast/mid/fat (i-frames 13/11/9); DS3/ER
  <30/70/100 with near-constant i-frames — tiers change roll *distance and
  recovery*, not invulnerability. DS3's Vitality (a whole level-up stat that
  only buys carry) reads as a pure gear tax.
- **Poise, three attempts**: DS1 passive threshold (legible, but PvP
  poise-tank meta); DS3 hyperarmor-only (opaque, "no telling where it
  starts"); **ER hybrid — small passive threshold + hyperarmor on committed
  heavies + enemy stance/posture break → critical opening — is the
  community-validated shape.**
- **Stamina**: one pool for attack/roll/sprint/block; costs per action scaled
  by weapon class; regen ~45/s, suppressed while blocking (why turtling isn't
  free); blocking = absorption % + Stability-scaled stamina drain; empty bar
  on block = guard break. (Our sandbox already implements exactly this.)
- **Estus**: fixed charges, refilled at rest (which respawns enemies);
  **count and potency upgrades are placed world loot** (shards/seeds/tears).
  Consumable-healing economies (DS2 lifegems, Skyrim potions) let players
  grind past walls, diluting fixed difficulty — with fixed world danger,
  bounded refillable healing is close to mandatory.
- **Levelling**: cubic cost `0.02x³ + 3.06x² + 105.6x − 895`; practical
  plateau ~SL100–125 with no hard cap. **Death**: drop souls, one retrieval;
  verdict — stings early/mid, noise for veterans; the *runback* is the real
  penalty. DS2's max-HP-loss-on-death was hated.
- **Failure modes**: **DS2 Adaptability is the canonical disaster** — roll
  i-frames stat-gated (AGL 85→5 i-frames … 105→13): taxing a *feel verb*
  behind an invisible stat. Never repeated. **Hard rule: stats never touch
  i-frames, parry windows or input responsiveness.** Also: DS1 poise-tank
  meta; ER number inflation (thousands-scale HP bought tuning room at the
  price of legibility, and late levels feel fake).

## 3. Skyrim's lessons

- **Use-based skills + perk points**: XP proportional to effect (root of
  iron-dagger/expensive-potion grinding); character XP = skill-ups. Perks:
  the **mechanics unlocks** (Silent Roll, material gates, dual-cast stagger)
  are what players remember; the flat +20 %…+100 % rows are filler that
  quietly inflates numbers. Legendary-skill resets = grind treadmill.
- **Encounter zones / level scaling — the anti-pattern**: zone level =
  clamp(player level, min, max) frozen on first visit; leveled lists pick
  enemy variants *and* loot. ~75 % of vanilla zones have min < 20 (highest:
  24) — the whole world tracks the player. Documented failures: glass-armour
  bandits, uniform danger, frozen dungeons punishing early exploration. **The
  modding fix is dezoning (Requiem, MorrowLoot, Skyrim Unleveled) and players
  praise exactly what our 0004 mandates**: danger as learnable geography,
  loot with provenance, growth made legible. Their one caveat: fixed worlds
  need escape verbs (flee, sneak past, return later) and telegraphed danger,
  or "hard zone" reads as "bug".
- **Crafting**: loved — smithing's material ladder, tempering,
  learn-by-disenchanting, alchemy experimentation. Broken — the three skills
  feeding each other multiplicatively (fortify alchemy → enchanting →
  smithing), the Restoration-potion divergence (unpatched 13 years), and an
  armour hard cap (80 % at 567 display AR) that mid-tier tempered gear
  saturates, making Daedric cosmetic. ⇒ keep crafting synergy **convergent**
  (nothing fortifies the skill that produces it) and keep defence math
  **asymptotic**, never capped-then-wasted.
- **Magic failure**: flat spell magnitudes + no temper/scaling path while
  weapons get skill×perks×smithing×enchants → 100-Destruction loses to a
  self-forged dagger. ⇒ **every damage source sits on the same multiplier
  stack** or one archetype dies exactly where the fixed world expects
  strength.
- **Minigame skills**: lockpicking-as-dexterity makes the skill vestigial;
  Speech gating only prices/binary checks is underbaked. ⇒ a skill must buy
  *options* (routes, tiers, topics), never accuracy — which our no-dice rule
  forbids anyway.

## 4. Cross-cutting: how fixed worlds hold a curve without scaling

Geographic danger gradients (telegraphed, soft-gated by lethality) +
gear-gated depth (best equipment hand-placed inside danger) +
knowledge-as-power (the biggest and intrinsically uncapped axis — Outward's
whole thesis, every Souls boss) + bounded world-sourced recovery upgrades +
escape verbs. Use-based progression is diegetic but invites grind unless XP
is effect-proportional and damped; point-buy is legible and grind-proof but
decouples growth from practice. Composite ruleset the evidence supports:
use-based skills with soft-capped returns; damage progression mainly on
placed gear; healing bounded and world-upgraded; one multiplier stack for all
damage; convergent crafting; racials as permanent passives; stats never touch
feel constants; the god-ceiling = knowledge + gear + system mastery, not the
level curve.

## 5. Mod-scene availability for Morrowind-only categories (verified 2026-08-26)

Vault finding first: `skyrim-source/` is **Oldrim base-game depot 72851 only**
(Skyrim.esm + Update.esm — no Dawnguard/Dragonborn). The animation inventory
confirms: **0 crossbow clips**; **70 unarmed clips including the `beasth2h_*`
clawed set** (Argonian/Khajiit); full 1H/2H/bow/dual sets.

| Category | Verdict | Evidence (Nexus SE ids) | Permissions |
|---|---|---|---|
| Spears/pikes/halberds/quarterstaves | **SOURCEABLE** | Animated Armoury 35978 (rapier/pike/halberd/qstaff/claw/katana/whip meshes + DAR loose-`.hkx` movesets, player+NPC); Animated Heavy Armory 51100 (shortspear/half-pike/poleaxe/trident/javelin); Skyrim Spear Mechanic 25146 (spear+javelin throw, v3 dropped FNIS/Nemesis) | 35978 "just credit NickaNak", conversions allowed; 51100 no credit even required; 25146 "permissions optional" |
| Throwing weapons | **SOURCEABLE** (1 check) | Meshes: Throwing Weapons Lite 4668 (JZBai's own, credit + non-commercial); throw anims: Spear Mechanic javelin throw; DAR throw packs 54736 etc. | TWL's *bundled anims* are h1zchan's (separate permission) — use Spear Mechanic's instead; verify at download |
| Crossbows | **PARTIAL — vault gap** | Zero clips in vault (Oldrim base only). Fix = sourcing job: pull the SE depot (all DLC merged into base BSAs) → crossbow meshes + full clip set, plus bonemold/chitin armour (Dragonborn) in the same job | vanilla — n/a |
| Unarmed | **SOURCEABLE (already in vault)** | 70 vanilla clips incl. beast-race claws | Optional upgrades: Eskyrim MCO 77763 / OAR fork 126707 (moderate); **avoid Verolevi 110676 (closed permissions)** |
| Katanas/rapiers/claws | SOURCEABLE (optional) | Animated Armoury 35978 | as above |
| Whips | **DROP recommended** | AA's whips are the one weapon *not* DAR-driven (script/behavior-injected; community ships "No Whips" editions); lore-weak besides | — |
| Medium armour | **SOURCEABLE — no assets needed** | Stats reclassification of existing meshes; Morrowind-flavour sources: Dragonborn bonemold/chitin (with the SE vault extension), Bonemold Expanded 47640, Bonemold & Chitin Weapons 10044 | 47640/10044 unverified (pages 403) — check via the Nexus API at download |

DAR/OAR mods by construction ship plain loose `.hkx` + meshes — exactly what
our pipeline ingests (we never run mod code). Record per-category evidence in
module 90 §74.3 form when the keep/drop decisions land.

*(Method: UESP via api.php with project User-Agent; Nexus pages 403 direct —
verified via search summaries; re-confirm permission tabs from the Nexus API
metadata at download time. Not on UESP (engine GMSTs, OpenMW source if ever
needed): exact walk-speed equation, attack/jump fatigue costs, numeric barter
and training-fee equations.)*
