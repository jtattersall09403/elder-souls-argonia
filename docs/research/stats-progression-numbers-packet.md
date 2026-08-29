# Workstream S: the numbers packet and the balance-simulation findings

> Steps 6–7 of the run-book (module [76](../world/76-stats-progression.md)
> §103.1). The **design** is module 76 §116–129; the **canonical numbers** are
> the data files in `tooling/stats-sim/data/`; this document is the derivation,
> the worked characters, and what the simulation found and what was done about
> it. Regenerate everything here with:
>
> ```bash
> node tooling/stats-sim/run.mjs        # 13 invariants, all holding as of 2026-08-29
> ```

## 1. The reference character, checked against the sandbox as playtested

The design is anchored on the **Marsh Hand** (module 76 §116): level 10,
Str/End/Agi/Spd 50, Wil/Int/Per 40, Long Blade 60, Block 50, Heavy Armor 45,
Athletics 40, carrying steel sword + steel kite shield + steel cuirass/gauntlets/
boots and an 18 kg pack.

| Quantity | Design | Sandbox today |
|---|---|---|
| Health | 98.3 | 100 |
| Stamina / regen | 100 / 24 per s | 100 / 24 |
| Carry capacity | 180 kg | 180 kg |
| Burden tier | mid (0.25 of capacity) | — (no tiers existed) |
| Mitigation, AR 50 vs a 24 blow | 25.00 % | 25.00 % |
| Listed light chain | 24 / 29.0 / 34.1 | 24 / 29.04 / 34.08 |
| Poise | 27.5 | — |
| Damage position at Long Blade 60 | 86.2 % of the weapon's range | — |
| Breath | 51.5 s | — |

Everything the sandbox already had is reproduced exactly; everything new sits
around it. This is the `reference-equivalence` invariant, and it is the one that
must never be allowed to fail.

## 2. Three worked characters

| | **Hour one** (level 1) | **The Marsh Hand** (level 10) | **The god-build** (level 50 + mastery) |
|---|---|---|---|
| Attributes | 40/40/40/40/30/30/30 | 50/50/50/50/40/40/40 | 125/125/110/95/90/100/70 (fortified past 100) |
| Primary skill | 30 | 60 | 100 |
| Gear | iron sword, studded set | steel sword + shield, steel set | daedric, 3 temper grades, +40 % enchantments |
| Health / stamina | 44 / 92 | 98 / 100 | 601 / 160 |
| Armour rating | 29 | 50 (unskilled: 62 raw × the skill band) | 214 |
| Light hit lands | 13 | 21 | 100+ |
| Carry | 150 kg | 180 kg | 405 kg |
| Breath | 42 s | 51 s | 85 s (∞ as an Argonian) |

Growth from hour one to the god-build is roughly **×14 health, ×8 damage,
×7 armour** — and the *world stays where it is*, which is the whole point
(module 76 §102).

## 3. The ladder, as the simulation plays it

Twelve worked archetypes compiled from band + position + variants, fought by
four builds (no avoidance — a straight trade, so these are worst cases):

| Band | Archetype | HP | Light hit | AR | Hour one | Marsh Hand | Veteran (L20) | Legend (L50) |
|---|---|---|---|---|---|---|---|---|
| D0 | Mudcrab | 29 | 5 | 2 | 4.1 s | 2.4 s | 1.1 s | 1.1 s |
| D1 | Ripper eel | 74 | 13 | 13 | 6.7 s | 3.6 s | 3.4 s | 2.2 s |
| D1 | Smuggler | 82 | 15 | 16 | 8.1 s | 4.8 s | 3.4 s | 2.2 s |
| D2 | **The Hollow Warden** (today's archetype) | 135 | 23 | 32 | 14.8 s | 7.3 s | 5.7 s | 3.4 s |
| D2 | Bog blight | 149 | 32 | 37 | 17.4 s | 8.5 s | 5.7 s | 3.4 s |
| D3 | Naga raider | 253 | 36 | 57 | **dies** | 17 s | 10.3 s | 4.5 s |
| D3 | Wamasu | 391 | 50 | 71 | **dies** | 30.6 s | 17.3 s | 6.7 s |
| D4 | Dreugh warlord | 550 | 70 | 147 | **dies** | **dies** | 32.6 s | 12.3 s |
| D4 | Deep-marsh leviathan | 670 | 106 | 125 | **dies** | **dies** | 39.9 s | 13.4 s |
| D5 | Endgame warden | 830 | 108 | 121 | **dies** | **dies** | **dies** | 16.8 s |
| D5 | **Xal-Krona** (final boss) | 1450 | 162 | 213 | **dies** | **dies** | **dies** | 48.6 s |

Blows that kill you: the Marsh Hand dies to 6 Hollow Warden hits, 3 wamasu
hits, 2 dreugh hits and 1 Xal-Krona hit. That is the fixed-danger gradient made
numerical — and it is the ladder Phase 13 authors write against.

**Build parity at the final boss** (a good player, 55 % of blows avoided; the
quest plan requires every build to be able to finish):

| Build | Result | Burst dps | Potions | Health left |
|---|---|---|---|---|
| Greatsword | win, 30.9 s | 54 | 3 | 47 % |
| Magic | win, 32.4 s | 75 | 10 | 39 % |
| Sword & board | win, 43.4 s | 40 | 5 | 43 % |
| Spear | win, 45.1 s | 42 | 7 | 51 % |
| Stealth (short blade) | win, 50.5 s | 36 | 7 | 25 % |
| Marksman | win, 51.6 s | 36 | 7 | 25 % |

A ×1.7 spread with genuinely different textures: the mage is the fastest and
ends the fight empty, the greatsword is the most efficient, the bow and the
short blade are the long grind. Poise, backstabs, blocking and spacing are
**not** modelled, so the two stealth-ish rows are pessimistic.

## 4. Progression pacing

A character raising its ten major/minor skills by use, spending vastei at every
rest sitting (all six preset classes, to level 40):

| Level | Skill ranks | Points bought at that sitting | Attribute points so far | Health |
|---|---|---|---|---|
| 5 | 40 | 6 | 22–25 | 58–70 |
| 10 | 90 | 5–6 | 51–55 | 85–100 |
| 20 | 190 | 4 | 96–101 | 148–164 |
| 30 | 290 | 3–4 | 129–137 | 225–229 |
| 40 | 390 | 2–3 | 158–169 | ~290 |

Ten skill ranks per level, ~4 attribute points per level early and ~3 late, and
health roughly triples from level 5 to level 30. The escalating cost curve does
the soft-capping without a cap: by level 30 a sitting buys three points, not
five, and spreading is cheaper than stacking.

**Vastei per rank** = `4 × (skill+1) × classFactor × specFactor × (1 + effSkill/50)`.
A useful property falls out of the algebra: **worthiness cancels**, because a
rank costs proportionally more use-points than a low-worth action supplies. The
currency therefore cannot be farmed faster than skill ranks themselves — the
only exploit surface is the shared skill-XP worthiness rules (module 76 §120.2),
which is exactly why those rules guard both.

## 5. Encumbrance

| Loadout | kg | Str 30 | Str 50 | Str 65 | Str 85 | Str 125 |
|---|---|---|---|---|---|---|
| Unarmoured + dagger | 9 | fast | fast | fast | fast | fast |
| Studded + sword | 30 | mid | fast | fast | fast | fast |
| **Reference steel + shield** | 45 | fat | **mid** | mid | fast | fast |
| Ebony + greatsword | 54 | fat | mid | mid | fast | fast |
| Daedric + warhammer + shield | 71 | fat | fat | mid | mid | fast |
| Daedric + 120 kg of loot | 173 | overloaded | fat | fat | fat | fat |

Strength buys mobility in your own armour — the endgame plate that makes you a
fat-roller at Str 65 is a mid-roller at 85 and a fast-roller at 125.

## 6. Breath and underwater routes

`breath = 25 + 0.35×Athletics + 0.25×Endurance` seconds; Argonians unlimited.

| | End 30 | End 50 | End 100 |
|---|---|---|---|
| Athletics 5 | 34 s | 39 s | 52 s |
| Athletics 40 | 47 s | 52 s | 64 s |
| Athletics 100 | 68 s | 73 s | 85 s |

Authoring guidance for Phase 11/12 underwater routes: **a 30 s segment is open
to everyone; 45 s wants a competent swimmer; 60 s wants a specialist; beyond
75 s is Argonian, spell or equipment territory** — which is precisely the
"advantage, never exclusive mandatory progression" rule the quest plan requires
(quests 80 §63), because every such route needs a degraded fallback anyway.

## 7. Economy

| Band | A sloppy fight costs | Cheapest healing | Income per clear |
|---|---|---|---|
| D1 | 39 health | 2 minor potions, 50 g | 22 g |
| D2 | 72 health | 3 minor, 75 g | 60 g |
| D3 | 127 health | 6 minor, 150 g | 170 g |
| D4 | 236 health | 10 minor, 250 g | 480 g |
| D5 | 424 health | 17 minor, 425 g | 1400 g |

Early on, potions cost more than the fights pay: the early game rewards **not**
getting hit, and rewards brewing over buying. Brewed Restore Health scales
21 (novice) → 77 (competent) → 198 (master alchemist with a master apparatus)
against ~12 g of ingredients, so alchemy becomes the healing economy exactly as
the owner's Q7 ruling intends.

Note the deliberate tension the sim exposes: small potions are the most
**gold**-efficient healing (1 g per point) while big ones are the most
**time**-efficient (each drink costs ~1.3 s of a fight and 0.5 kg). Chugging
seventeen minors through a D5 fight costs 22 seconds of drinking and 8.5 kg of
pack — which is its own answer.

Training: 8 × rank gold per rank, capped at the governing attribute — 6,320 g
to take a skill 30→50, 12,400 g for 50→75, 17,400 g for 75→100. A real sink for
a province where gold is otherwise "the least interesting reward".

## 8. What the simulation found, and what was done

Eleven anomalies. Every one is either fixed in the data or explicitly accepted.

| # | Finding | Resolution |
|---|---|---|
| 1 | The reference kit sat in the *fast* roll tier under Souls-style thresholds (0.30/0.70), so "today's roll" would have been the light-roll. | **Fixed**: thresholds retuned to 0.20/0.35. The reference is mid, endgame plate is fat until Strength grows, a loot-hauler is overloaded. |
| 2 | Enemy armour ratings and D5 health outran the player's damage growth: an endgame boss took over two minutes and beat every build. | **Fixed**: AR bands cut roughly 40 %, D5 health 800–1600 → 650–1250, D5 damage 95–160 → 90–150. |
| 3 | A "strong armoured" D5 compiled to AR 341 — a tier of its own. | **Fixed**: variant clamp of ±25 % past the band edge, now a compiler rule (module 76 §128). |
| 4 | Morrowind-sized magicka (Int × 1.6, Willpower/33 regen) could not sustain a mage through one boss fight even with a full potion belt. | **Fixed**: `20 + 3×Int`, regen `0.5 + 0.05×Wil`, plus capped spell-cost-reduction gear. |
| 5 | With the bigger pool, low-tier spells then out-burst melee 3:1 in the low bands. | **Fixed**: tier damages cut to 9/18/40/80/140. Magic stays the burst archetype, bounded by magicka rather than by damage. |
| 6 | Bows could not finish a heavily-armoured endgame enemy. | **Fixed**, by modelling two things the design already implies: arrowheads pierce (armour ~60 % effective against arrows) and **arrow material is its own damage axis** (placed loot, so bow power is geography too). |
| 7 | Endgame mages needed cost-reduction gear to function, which is Skyrim's most famous exploit. | **Accepted with a bound**: cost reduction is kept because it is the mage endgame fantasy, and **capped at 50 % across all sources** so no stack reaches free casting. |
| 8 | Training one skill to 100 cost ~127,000 g at the first curve — more than the early economy produces. | **Fixed**: 8 × rank per rank (≈36,000 g from 30 to 100), still a serious sink. |
| 9 | Misc-skill grinding earns vastei without advancing the level trigger, so a grinder can bank a hoard. | **Accepted, and quantified**: a maximum sitting at level 10 costs ~27,600 vastei against ~2,000 earned in an ordinary level, and the +5-per-attribute sitting cap throttles what a hoard can buy. This is Morrowind's misc-grind charm, bounded. |
| 10 | Hoarding vastei rather than spending it at each sitting: does deferral pay? | **Confirmed closed**: the hoarder ends 54 attribute points *behind* and spends the whole run with lower health (mean 121 against 138). Deferral is strictly bad, exactly as the F1 design claimed. |
| 11 | A magic build's damage tier and a melee build's roll tier both changed when attributes were dealt by archetype rather than by a single table. | **Accepted as a modelling fix**: builds now spend the same total attribute investment along their own priority order. The melee order reproduces the reference character exactly. |

Loops explicitly hunted and found **bounded**: the Morrowind alchemy
fortify-Intelligence loop is flat at 124 magnitude across six iterations
because crafting reads base stats (the same loop with output-fed inputs climbs
124 → 211 and keeps going); smithing tempering tops out at ×1.24; the enchant
point budget at ×1.6; armour tops out at AR 214 = 58.8 % of a light hit and
44.5 % of a D5 blow, so nothing approaches immunity; unarmoured tops out at 60
rating.

## 9. What the god-build does to the world

At mid-D-band positions, the god-build clears D3 in 5.6 s without a potion and
D5 in 22.7 s using two — against a legend build's 6.7 s and 30.9 s. The gap
between "endgame" and "god" is deliberately *small in the combat maths*,
because the skill curve is soft-capped and gear tops out: the god-build's real
power lives in the systems the sim does not model (paralysis, invisibility,
summons, fortify stacking, constant-effect items, alchemy). That is the design
working as intended — the ceiling is **knowledge and system mastery**, not the
level counter (module 76 §102, §120.5).

## 10. Known simplifications

Fights are a resource-and-damage race with an avoidance parameter; poise,
stagger, backstabs, blocking, spacing and hit zones are not modelled; bow
ballistics are collapsed to one number; `gear.json` mirrors the game's
equipment tables at commit 84ca7e6 rather than reading them. All of these are
listed in `tooling/stats-sim/README.md`, and all of them are removed at Phase
10c when the harness is re-pointed at the implemented system.
