# Workstream S — owner round 2: confirm the design (one sitting)

> Step 8 of the run-book (module [76](../world/76-stats-progression.md) §103.1)
> and the **last** owner round for this workstream. Round 1 settled the shape;
> this round confirmed the detail, the numbers and a list of small calls made on
> the owner's behalf.
>
> **Status: ANSWERED 2026-08-29.** All five questions answered, vetoes taken on
> defaults 4, 5, 7, 8, 12, 14, 16 and 18, plus general steers. The record and
> everything that changed is in **§7 Answers** at the foot of this file; the
> design (module 76 §116–129), the data files and the harness are already
> updated. What remains is a short confirmation of the round-2 changes
> themselves, not another round.
>
> **Sections 1–6 are the pack as it was put to the owner** and are left as
> written, so the record shows what was asked. Where an answer changed
> something, §7 says so — read §7 for the current position, module 76 §116–129
> for the design, and the [numbers packet](stats-progression-numbers-packet.md)
> for the numbers as they stand now.

---

## 1. What the character is now, in plain English

You make a character the way you make one in Morrowind: pick a race, pick a
birthsign *(as asked — the sign directly, not a birth date)*, and pick or build a class — five
skills you're good at, five you're alright at, a speciality, and two favoured
attributes. You have seven attributes and twenty-seven skills.

You get better at things **by doing them in earnest**. Every skill has one
number behind it, and that number moves the things you'd expect: a sword skill
decides where in a weapon's damage range your blows land, how much stamina a
swing costs, and how quickly the blade wears out *(the recovery-speed part was
dropped — §7)*. Armour skill decides how much your armour is really worth. Athletics
decides how fast you swim and how long you can hold your breath. And so on.

Attributes never buy the same thing twice: each skill has one governing
attribute that nudges the skill up or down a little (up to ten points either
way). So Strength genuinely matters to a swordsman without being a second
damage multiplier. *(This is our rule, not Morrowind's — see §7 and module 76
§117.1.)*

You get stronger in three ways at once, and they feel different:

- **skills**, from use — steady, always ticking over;
- **levels**, every ten skill improvements, banked when you rest — these give
  health, and health is a formula, so raising Endurance later credits every
  level you've already had (no "max Endurance first" homework);
- **attributes**, bought at the level screen with **vastei**, the currency you
  earn by acting and drop where you die.

Beyond that, power comes from **gear you found in dangerous places** and from
**systems you mastered** — alchemy, enchanting, spellmaking, smithing, trade,
training. The level counter is never the interesting part, which is exactly
what you asked for.

## 2. The numbers, in plain English

*(Superseded in part by §7: the ladder was made considerably more lethal after
this pack was written, and the calibration set is described properly in module
76 §116.)* The design's continuity anchor is a competent level-10 adventurer in
steel with a shield — she has today's sandbox numbers exactly (100 health, 100
stamina, 25 % damage reduction, the same swing damage), and the rest of the
system is placed around a *set* of builds that includes her.

The world runs on six danger bands. Against that competent character:

- a **D2** enemy (the sandbox's Hollow Warden) takes about 7 seconds to kill,
  and six of its blows kill her;
- a **D3** wamasu takes 30 seconds, and three blows kill her;
- **D4** kills her;
- a **D5** blow would take a level-1 character from full health to dead in one
  hit, and that level-1 character's swing removes 0.7 % of its health.

By the endgame, a character has roughly **fourteen times the health, eight
times the damage and seven times the armour** of hour one — and the swamp that
killed you at hour three hasn't moved an inch.

The final boss, fought by a good player with endgame gear, takes 31–52 seconds
depending on build, costs 3–10 potions and half your health bar. **All six
build styles can finish it** (greatsword, magic, sword-and-board, spear,
stealth, bow), inside a 1.7× spread.

## 3. What the balance simulation is, and what it found

Before asking you to confirm any of this, the numbers were run in bulk by a
small simulator (`tooling/stats-sim/`) — every build at every stage against
every danger band, plus levelling, encumbrance, breath, the economy and a hunt
for the classic Elder Scrolls exploits. It ends in **13 pass/fail checks** and
all 13 hold today. At Phase 10c they become permanent tests, so future tuning
can't quietly break the balance.

It found eleven real problems (full list, with fixes, in the numbers packet).
The four worth your attention:

1. **Endgame enemies out-armoured the player.** The first ladder made boss
   fights take over two minutes and beat every build. Enemy armour is now
   about 40 % lower and endgame health is trimmed.
2. **A mage couldn't finish a boss fight** with Morrowind-sized magicka, even
   with a full belt of potions. Magicka pools and regeneration are now
   substantially bigger, and mages can wear cost-reduction gear — **capped at
   50 %**, so nothing ever reaches Skyrim's free-casting exploit.
3. **Training was priced absurdly** — one skill to 100 cost more gold than the
   whole early game produces. Now ~36,000 gold from 30 to 100: a serious sink,
   not a joke.
4. **The deferral trick you spotted is genuinely dead.** A character who hoards
   vastei instead of spending it ends 54 attribute points *behind* and spends
   the entire game with less health.

And the exploit hunt: the famous Morrowind alchemy loop is **flat** (crafting
reads your base stats, so a potion can never brew a better potion); tempering
tops out at +24 %; armour tops out at stopping 59 % of a light blow and 45 % of
a heavy one, so nothing approaches invulnerability.

## 4. Proposed defaults — veto any by number

Small calls made on the owner's behalf. **Answered: 4, 5, 7, 8, 12, 14, 16 and
18 were vetoed or amended; the rest accepted.** The list below is as it was put;
§7 records every change.

**Naming and progression**

1. The levelling currency is called **vastei** — Argonian for *change*, the
   Nisswo's central idea. Earned by acting, spent on changing yourself, dropped
   where you die (going back for it is *shunatei*, holding on too tightly — the
   joke is the setting's own). Deliberately not "souls", which would collide
   with soul gems. Lore record: `world/sources/lore/topics/magic-practice.md`.
2. **Ten skill improvements = one level**, banked at a rest, and you may buy at
   most **five points in one attribute** per sitting, at rising prices.
3. **Once every major and minor skill is maxed**, miscellaneous skill
   improvements keep the levels coming at **three-for-one** — a slow tail
   rather than Morrowind's hard stop around level 78.
4. **Anti-grind rules** ("in anger"): a swing only counts if it connects with
   something living that can fight back and scales with how much of its health
   you took; a spell must actually do something to a legal target; Athletics
   accrues from travel outside settlements, capped per rest; Acrobatics from
   jumps that clear real gaps and falls you survive, once per place per rest
   (Morrowind's fall-grinding is dead); trading counts per vendor purse; a
   persuasion counts only if it changed something. Trainers and skill books
   give ranks but **never vastei**.

**Combat**

5. Weapon **requirements never block you** — a too-heavy find is usable at
   level one, it just costs much more stamina and leaves you slower to recover.
6. **Armour: big hits punch through.** Armour stops a quarter of an ordinary
   blow at the reference and much less of a monstrous one, so endgame plate
   never trivialises a D5 enemy. (This is Morrowind's armour behaviour, fitted
   to our numbers.)
7. **Poise and posture** as Elden Ring does it: a small passive threshold,
   hyperarmor while you're committed to a heavy swing, and enemies with a
   breakable posture that opens them to a finisher. Tuned so the reference
   character's hit reactions are exactly today's.
8. **Roll weight**: under 20 % of capacity rolls light, under 35 % is the
   normal roll (today's), under 100 % is the fat roll, over 100 % you can't
   run, roll, jump or swim upward. Invulnerability frames are **identical in
   every tier** — never stat-gated.
9. **Unarmed** drains stamina and posture toward a knockout rather than doing
   much damage; **arrow material is its own damage axis** and arrowheads pierce
   (armour is only ~60 % as effective against them).

**Magic, crafting, economy**

10. **Six schools** (including Mysticism, which survives here as a folk school
    — canon says only Skyrim's College stopped recognising it). Spell tiers
    unlock at skill 0/25/50/75/90; spell damage bypasses armour and meets magic
    resistance instead, which is what keeps mages relevant late.
11. **Crafting always reads your base stats**, and no effect may boost a
    crafting skill. This is the single rule that kills every Elder Scrolls
    crafting god-loop, and it costs nothing you'd miss.
12. **Tempering** adds at most three grades (~+24 % total); the enchanting
    budget tops out at 1.6× base; constant-effect enchantments need a big soul
    and a high skill.
13. **Potions**: instant and stackable as you asked, but drinking costs about a
    second and a third of real time in a fight and half a kilo in the pack.
    Brewed potions beat bought ones for a skilled alchemist (198 healing vs
    140), on ~12 gold of ingredients.
14. **Trading** has no haggling minigame and no flat-value bypass merchants;
    vendor purses are finite and refresh on a schedule.

**World-facing**

15. **The danger ladder D0–D5** with the exact numbers in module 76 §128, and
    a rule that a variant ("strong", "armoured") may never push an enemy more
    than 25 % past its band — so nothing sneaks into a tier of its own.
16. **Every NPC, enemy, follower and merchant** uses the player's stat schema
    plus a level, authored as *"strong D3, diseased"* and compiled to fixed
    numbers. Retuning a curve then rebalances all content without re-authoring
    it. Fixed danger is untouched: nothing ever reads the player.
17. **Underwater route guidance**: 30 seconds is open to everyone, 45 wants a
    competent swimmer, 60 a specialist, beyond 75 is Argonian/spell/equipment
    territory — and no route is ever mandatory-Argonian.
18. **Six preset classes** to start (Marsh Hand, Reed Scout, Sap-Speaker, Spear
    Warden, Ledger Hand, Nisswo Wanderer), plus the custom builder; more
    presets at implementation.

## 5. Five questions

**Q1. Potion discipline.** Drinking mid-fight costs ~1.3 seconds of commitment
(you can be hit during it).
- **A (recommended): keep the commitment.** It's the only thing that makes
  potion use a decision rather than a menu habit, and it doesn't cap anything.
- B: instant, Morrowind-style, no animation cost.

**Q2. How hard should the final boss be?** As simulated: a good endgame player
wins in 31–52 s, spends 3–10 potions, and dies to 5–6 unavoided blows.
- **A (recommended): as it stands** — punishing but fair, and every build can
  do it.
- B: harder (fewer blows to kill you).
- C: softer.

**Q3. The endgame tail.** When every major and minor skill hits 100:
- **A (recommended): miscellaneous skills keep levelling you at three-for-one**
  — growth slows to a crawl but never stops.
- B: levels simply stop (Morrowind's behaviour), and leftover vastei is dead.

**Q4. Does the name land?** "Vastei" is used in the interface: *"You have earned
430 vastei."*
- **A (recommended): keep vastei** — a real Argonian word doing real work,
  taught by a Nisswo in the tutorial.
- B: keep the mechanic, use a plain English label ("Change") with vastei as
  flavour text.

**Q5. Skill training pricing.** ~36,000 gold to take one skill from 30 to 100,
capped at the governing attribute, on top of quest and loot income.
- **A (recommended): as priced** — training is a major gold sink and a reason
  to care about money.
- B: cheaper (more of a convenience than a project).

## 6. Two things left undone, on purpose

- **A quest-plan doc fix is owed**: speechcraft is missing from the
  capability-inspection list in `docs/quests/60-*.md` §49, and this design makes
  speech an ending-grade system. It wasn't applied because another workstream
  owns the quest docs today; it's recorded in module 76 §125.
- **Sourcing evidence for the kept weapon categories** (spears, pikes,
  halberds, quarterstaves, medium armour, unarmed) is recorded in module 90
  §74.3; the actual downloads happen at Phase 10 with the rest of the asset
  work, not now.


---

## 7. Answers (owner, 2026-08-29), and what changed

### The five questions

1. **Potion discipline — A.** Drinking keeps its ~1.3 s commitment.
2. **Boss difficulty — B, and everywhere, not just the boss.** *"I want a sense
   of it being very important to avoid being hit."* Five or six unavoided blows
   from the final boss is too easy: **three at most unless your armour is
   incredible, and only absolute best-in-slot should buy five or six** — scaled
   the same way across every band, easily tunable later, and ideally wired to a
   play-time difficulty setting.
3. **Endgame tail — A.** Miscellaneous skills keep levelling you at three-for-one.
4. **The name — A.** *Vastei* stays, in the interface.
5. **Training prices — A.** As priced.

### Vetoes and steers, with the resolution

| Item | Ruling | What changed |
|---|---|---|
| **Birthsign** | Pick the *sign*, not the birth date | §119: the sign is chosen directly; the birth date stays as flavour and canon social fact |
| **"Attributes nudge skills — is that Morrowind?"** | Check UESP | **It is not.** UESP (*Morrowind:Attributes*, *Morrowind:Trainers*) says a governing attribute does three things: the level-up multiplier, the training cap, and whatever named formulas use it. We delete the first two of those, so the **attribute assist is ours** — new §117.1 says so plainly, keeps the canon training cap, and records the Morrowind-literal alternative as a live option |
| **Level / health / Endurance** | Not clear | New §117.2 walks it through with a worked example: ranks → levels → health, and why health being a formula makes Endurance retroactive |
| **Vastei needs teaching** | Yes, in lore terms | §120.3: a **Nisswo teaches it diegetically in the opening hours**; the quest packet that owns the opening now owes that scene |
| **"Calibrated on one character?"** | No — needs many | Fair hit on the write-up, not the work: the harness always swept many builds, but the doc led with one. §116 now leads with the calibration *set* (7 stages × 6 styles × 6 bands × 3 positions + edge cases + 6 playthroughs); the Marsh Hand is described as a continuity anchor, and the sandbox's constants are explicitly **placeholders we may re-base**, not law |
| **Magicka cost reduction** | 75 %, if the gear is rare | §123: cap raised to 75 %, framed as rare placed loot |
| **Sneak-attack multipliers** | Wanted, Skyrim-style, melee > ranged | New §121.5: dagger ×3→×15, short blade ×2.5→×8, one-handed ×2→×6, two-handed and bow ×2→×4, spells ×1.5→×3, banded by Sneak skill (no perks). Modelled in the campaign runs, where it is what keeps a stealth build alive in the lethal middle game |
| **Default 4 — untargeted spells** | Must still count | §120.2 rewritten: a self/utility spell counts when the situation it answers is real (water-breathing *underwater*, light *in the dark*, feather while over-loaded). Only effects that change nothing are worthless |
| **Default 4 — Acrobatics ↔ climbing** | Link it | Acrobatics now governs climbing outright, accrues per metre ascended, and has real numbers (§122.1) |
| **Default 4 — "per vendor purse"?** | Unclear | Reworded: the value that counts is capped by **how much money the merchant actually has**, so you cannot farm one grocer by selling and rebuying a crate |
| **Default 5 — "recovery"?** | Unsure; happy to drop | **Dropped.** Weapon skill no longer touches recovery timing at all — it buys the damage-range position, stamina cost, wear and bow handling. Recovery is animation timing, and stats stay off the feel constants |
| **Default 7 — poise/posture** | Not in the sandbox; leave it out | **Cut entirely** (§121.3). Hit reactions stay exactly what the sandbox does today; the poise column is gone from the enemy ladder too |
| **Default 8 — roll i-frames** | Doesn't Dark Souls vary them by roll weight? | **You're right, DS1 does** (13/11/9 frames at light/medium/fat; DS3 and Elden Ring flattened them instead). Tiers now vary i-frames *and* animation speed. The §102 rule is unchanged and now reads correctly: *stats* never gate a feel verb (the DS2 mistake); equip load is a visible choice, not a hidden stat |
| **Default 12 — constant effects** | Like them; weaker ones should be cheaper | §123: constant effects are **tiered by soul size** (petty 30 → grand 600) instead of one flat 400-soul gate |
| **Default 14 — how does haggling work?** | Asked | §124 spells it out: no minigame, a visible price band — an unskilled disliked stranger pays ~1.5× what a skilled welcome one pays and sells for about half, a 3× swing across the system; vendor purses finite and refreshing |
| **Default 16 — followers** | **There are none in this game** | Followers removed from the design; §102 now states it as a constraint (consistent with decision 0028's "no companions anywhere") |
| **Default 18 — classes** | Too Argonian; want more, race-diverse, lore-derived | Eighteen presets: eleven canonical Elder Scrolls classes (Warrior, Knight, Barbarian, Scout, Thief, Assassin, Mage, Spellsword, Nightblade, Healer, Monk) plus seven from canon province offices — **Kaal**, **Root-herald**, **Tree-minder**, **Grave-singer**, **Shadowscale-trained**, **Marsh guide**, **Reed-sail hand**. Any race may take any class |
| **"Don't over-fit to the simulation"** | Standing instruction | Recorded in §103.1: *the simulation is evidence, not law; where it and a playtest disagree, the playtest wins* |

### What the lethality ruling actually did

"Blows that kill you" is now the **design input** of the danger ladder, and
enemy damage is solved from it: 10 blows at D0, 5 at D1, 4 at D2, 3.5 at D3, 3
at D4 and D5, measured on the character each band is meant for in typical
armour. Enemy damage roughly doubled as a result.

That immediately collapsed the difference between armour classes, so **armour
was given its own material ladder** — Morrowind's is 8× from iron to daedric,
where the weapon ladder is only 2.3× — plus a light/medium/heavy multiplier.
The result is the shape asked for: light armour dies in 2–3 blows, heavy in
4–5, genuinely best-in-slot tempered plate in 5–6, and nothing in the game
buys more than that. **The final boss can no longer be out-tanked by anyone**;
it has to be fought.

A single **difficulty multiplier** (`difficulty.enemyDamageMultiplier`, 0.7 /
1.0 / 1.35) scales all of it in one number and is the back end for a play-time
difficulty setting. It touches incoming damage only — never populations, loot
or gates — so fixed danger (0004) is untouched.

### The whole-game simulation (asked for in the same message)

Six plausible characters were played through a Milestone-1-shaped campaign
(~150 hours, ~190 quests, act-by-act encounter mixes, deaths and retrieval
runs). Results and the eight new findings are in the
[numbers packet](stats-progression-numbers-packet.md) §4 and §8. The headline
answers to "when do they level, how often do they die, how fast do skills
climb":

- level 2–4 by hour 19, 7–16 by hour 60, 16–27 by the end;
- 7–10 deaths in the first nineteen hours, 11–36 across the long second act,
  and **almost none after Act III**;
- the primary weapon skill hits ~55 by hour 19, ~85 by hour 60, 100 in Act III;
- the bow build has by far the hardest middle game (36 deaths against a Nord's
  11) and one of the easiest late games;
- gold outgrows its sinks by the endgame, and non-social builds finish with
  Speechcraft under 20 — both flagged for Phase 13 rather than fixed here.
