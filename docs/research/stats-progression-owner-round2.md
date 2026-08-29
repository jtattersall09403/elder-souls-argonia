# Workstream S — owner round 2: confirm the design (one sitting)

> Step 8 of the run-book (module [76](../world/76-stats-progression.md) §103.1)
> and the **last** owner round for this workstream. Round 1 settled the shape;
> this round confirms the detail, the numbers and a list of small calls made on
> your behalf.
>
> **How to reply:** "accept all" is a valid answer. Otherwise: veto any numbered
> default you dislike (just the number), and answer the five questions at the
> end (e.g. "1A, 2A, 3B…"). Everything you accept gets folded into module 76 and
> a decision record; Phase 10c then builds it.
>
> The full detail is module 76 §116–129; the numbers and the simulation report
> are the [numbers packet](stats-progression-numbers-packet.md). Round 1's
> rulings are unchanged and not reopened here.

---

## 1. What the character is now, in plain English

You make a character the way you make one in Morrowind: pick a race, pick a
birth date (which gives you a birthsign), and pick or build a class — five
skills you're good at, five you're alright at, a speciality, and two favoured
attributes. You have seven attributes and twenty-seven skills.

You get better at things **by doing them in earnest**. Every skill has one
number behind it, and that number moves the things you'd expect: a sword skill
decides where in a weapon's damage range your blows land, how much stamina a
swing costs, how fast you recover afterwards, and how quickly the blade wears
out. Armour skill decides how much your armour is really worth. Athletics
decides how fast you swim and how long you can hold your breath. And so on.

Attributes never buy the same thing twice: each skill has one governing
attribute that nudges the skill up or down a little (up to ten points either
way). So Strength genuinely matters to a swordsman without being a second
damage multiplier.

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

The character the whole design is calibrated on is a competent level-10
adventurer in steel with a shield — she has today's sandbox numbers exactly
(100 health, 100 stamina, 25 % damage reduction, the same swing damage). Every
other number is placed around her.

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

Small calls made on your behalf. All are in module 76 already; a veto changes
the module and the numbers.

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
