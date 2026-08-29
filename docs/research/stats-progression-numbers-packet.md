# Workstream S: the numbers packet and the balance-simulation findings

> Steps 6–7 of the run-book (module [76](../world/76-stats-progression.md)
> §103.1), **revised 2026-08-29 after owner round 2**. The design is module 76
> §116–129; the canonical numbers are the data files in `tooling/stats-sim/data/`;
> this is the derivation, the worked characters, the whole-playthrough runs, and
> what the simulation found. Regenerate with:
>
> ```bash
> node tooling/stats-sim/run.mjs        # 16 invariants, all holding
> ```
>
> **The simulation is evidence, not law.** It is arithmetic over a design
> document — no animation, no spacing, no player hands. Where it and a playtest
> disagree, the playtest wins.

## 1. Calibration: a set of characters, not one

Calibration runs over **7 progression stages × 6 build styles × 6 danger bands
× 3 positions in each band**, plus edge cases (unarmoured mage, over-encumbered
hauler, best-in-slot tank, hour-one novice) and **six whole-playthrough runs**.

One character in that set is named because it is the **continuity anchor** —
the **Marsh Hand**, whose numbers are the ones the combat sandbox has actually
been played with:

| Quantity | Design | Sandbox today |
|---|---|---|
| Health | 98.3 | 100 |
| Stamina / regen | 100 / 24 per s | 100 / 24 |
| Carry capacity | 180 kg | 180 kg |
| Burden tier | mid (0.25 of capacity) | — |
| Mitigation, AR 50 vs a 24 blow | 25.00 % | 25.00 % |
| Listed light chain | 24 / 29.0 / 34.1 | 24 / 29.04 / 34.08 |
| Damage position at Long Blade 60 | 86.2 % of the weapon's range | — |
| Breath | 51.5 s | — |

The correspondence is deliberate but **not sacred**: the sandbox constants were
placeholders, and this design may re-base any of them. What is protected is the
feel, not the integers.

## 2. Three worked characters

| | **Hour one** (level 1) | **The Marsh Hand** (level 10) | **The god-build** (level 50 + mastery) |
|---|---|---|---|
| Attributes | 40/40/40/40/30/30/30 | 50/50/50/50/40/40/40 | 125/125/110/95/90/100/70 (fortified past 100) |
| Primary skill | 30 | 60 | 100 |
| Gear | iron sword, studded set | steel sword + shield, steel set | daedric, 3 temper grades, +40 % enchantments |
| Health / stamina | 44 / 92 | 98 / 100 | 601 / 160 |
| Armour rating | 29 | 50 | 406 |
| Light hit lands | 13 | 21 | 100+ |
| Carry | 150 kg | 180 kg | 405 kg |
| Breath | 42 s | 51 s | 85 s (∞ as an Argonian) |

## 3. The ladder, as the simulation plays it

**"Blows that kill you" is now the design input**, and enemy damage is solved
from it (owner ruling: getting hit must matter). Straight unavoided trades, no
dodging, no blocking:

| Band | Archetype | HP | Light hit | AR | Hour one | Marsh Hand | Veteran (L20) | Legend (L50) |
|---|---|---|---|---|---|---|---|---|
| D0 | Mudcrab | 29 | 5 | 2 | 4.0 s | 2.6 s | 1.3 s | 1.3 s |
| D1 | Ripper eel | 74 | 12 | 13 | 6.5 s (5 blows kill) | 4.0 s | 4.0 s | 2.6 s |
| D2 | **The Hollow Warden** | 135 | 32 | 32 | 15.7 s (**2 blows kill**) | 7.9 s (5) | 6.5 s | 4.0 s |
| D2 | Bog blight | 149 | 46 | 37 | **dies** | 9.2 s (3) | 6.5 s | 4.0 s |
| D3 | Naga raider | 253 | 66 | 57 | **dies** | 22.3 s (2) | 11.8 s (5) | 5.2 s |
| D3 | Wamasu | 391 | 94 | 71 | **dies** | **dies** | 21 s (4) | 9.2 s |
| D4 | Dreugh warlord | 550 | 165 | 147 | **dies** | **dies** | **dies** (2) | 15.8 s (9) |
| D4 | Deep-marsh leviathan | 670 | 261 | 125 | **dies** | **dies** | **dies** | 19.7 s (5) |
| D5 | Endgame warden | 830 | 226 | 121 | **dies** | **dies** | **dies** | 25 s (6) |
| D5 | **Xal-Krona** (final boss) | 1450 | 345 | 213 | **dies** | **dies** | **dies** | **dies** (4) |

Read the last row carefully: **the final boss cannot be out-tanked even by an
endgame character standing still**. It has to be fought — dodged, blocked,
spaced. That is the new lethality doing its job.

**Build parity at the final boss**, played well (78 % of blows avoided):

| Build | Result | Burst dps | Potions | Health left | Unavoided blows that would kill |
|---|---|---|---|---|---|
| Greatsword | win, 39 s | 42 | 3 | 34 % | 4 |
| Sword & board | win, 53 s | 32 | 5 | 40 % | 4 |
| Spear | win, 57 s | 33 | 9 | 49 % | 3 |
| Marksman | win, 57 s | 34 | 9 | 42 % | 2 |
| Magic | win, 32 s | 75 | 10 | 32 % | 2 |
| Stealth (short blade) | win, 64 s | 29 | 10 | 28 % | 2 |

Every build finishes; the spread is ×2. Light-armour builds live on two blows,
heavy on four, and best-in-slot plate on five to six — the ratio the owner
asked for.

## 4. A whole game, act by act

Six plausible characters played through a Milestone-1-shaped campaign (~150
hours, ~190 quests, encounter mix by act, deaths and retrieval runs included).
This is the coarsest thing in the harness and the most useful: it is the only
place the *shape of the curve over a hundred hours* is visible.

| | Act I (19 h) | Act II (~61 h) | Act III (~95 h) | Endgame (~124 h) | Post-game (~148 h) |
|---|---|---|---|---|---|
| **Nord sword & board** | L4, 7 deaths, 86 hp | L16, 11 deaths | L22, 0 deaths, weapon 100 | L24 | L27, AR 380 |
| **Argonian kaal (spear)** | L4, 7 deaths | L13, 18 deaths | L18, 0 deaths | L21 | L25 |
| **Bosmer scout (bow)** | L2, **10 deaths** | L9, **36 deaths** | L14, 3 deaths | L18 | L22 |
| **Breton mage** | L3, 8 deaths | L7, 20 deaths | L9, 2 deaths | L13 | L16 |
| **Khajiit thief** | L4, 8 deaths | L15, 13 deaths | L20, 0 deaths | L22 | L25 |
| **Orc greatsword** | L3, 7 deaths | L11, 14 deaths | L16, 0 deaths | L20 | L23 |

What it says:

- **Levelling pace**: level 2–4 by hour 19, 7–16 by hour 60, 14–22 by hour 95,
  16–27 by the end. Morrowind-shaped — fast early, a long slow tail.
- **Dying is front-loaded and heavy**: everyone dies 7–10 times in the first
  nineteen hours and 11–36 times across Act II. After Act III, almost nobody
  dies. That is the fixed-danger curve working: you are learning a world that
  never softens, and then you have learned it.
- **The light-armour builds have a much rougher middle game** (the archer's 36
  deaths against the Nord's 11) and a much better late one. That is a real
  design property, not a bug — but it is worth knowing before playtest that the
  bow build's first fifty hours are the hardest experience in the game.
- **Skills**: the primary weapon skill hits ~55 by hour 19, ~85 by hour 60 and
  100 during Act III. Armour skills track slightly behind. Athletics reaches
  50–75 by mid-game on travel alone; Acrobatics only climbs for characters who
  actually climb (the thief ends on 69, the mage on 38).
- **The mage lags on level and health** (level 16 and 143 health at the end,
  against the Nord's 27 and 253) because so much of a mage's power is in the
  spell tier and the pool, not the level counter. Worth watching; it is also
  exactly how Morrowind felt.
- **Gold accumulates faster than the sinks drain it** (~55–65 k banked by the
  end even after training). Either training should cost more, or the late game
  needs bigger sinks — a Phase 10c/13 tuning note rather than a design flaw.
- **Speechcraft stays low for non-social builds** (8–20 for the warriors). Since
  speech is an ending-grade system, the endings must stay reachable by the duel
  route for those characters — which the quest plan already requires.

## 5. Climbing (the new Acrobatics verb)

| Climber | Speed | Stamina drain | Reach with rests | 25 m wall |
|---|---|---|---|---|
| Hour one (Acrobatics 15, mid load) | 1.02 m/s | 8.6 /s | ~12 m | cannot |
| Competent (45, mid load) | 1.21 m/s | 7.1 /s | ~24 m | just about |
| Scout (70, light load) | 1.31 m/s | 5.2 /s | ~63 m | with rests |
| Master (100, light load) | 1.38 m/s | 4.8 /s | 160 m+ | in one go, 18 s |

Authoring contract: **under 10 m is open to everyone, 25 m wants a real
climber, beyond 40 m is specialist ground** — and every climb-only route needs
a fallback (quests 20 §11).

## 6. Sneak openers

Skyrim's shape (dagger ×6/×15, one-handed ×3/×6, bow ×2/×3) rebuilt as Sneak
bands, so no perk economy is needed:

| Sneak | Dagger | Short blade | One-handed | Two-handed | Bow | Spell |
|---|---|---|---|---|---|---|
| 0–24 | ×3 | ×2.5 | ×2 | ×2 | ×2 | ×1.5 |
| 25–49 | ×6 | ×4 | ×3 | ×2.5 | ×2.5 | ×2 |
| 50–74 | ×10 | ×6 | ×4 | ×3 | ×3 | ×2.5 |
| 75+ | ×15 | ×8 | ×6 | ×4 | ×4 | ×3 |

In the campaign runs this is what keeps the stealth build viable through the
lethal middle game: a ×10 opener on a D3 raider is most of its health before it
knows you are there.

## 7. Progression, encumbrance, breath, economy

**Levelling** (abstract run, all preset classes, to level 40): ten skill ranks
per level; 5–6 attribute points bought per sitting early, 3–4 by level 20 and
2–3 by level 30; health roughly triples between level 5 and level 30. Hoarding
vastei instead of spending it leaves you **54 attribute points behind** with a
lower health curve throughout — deferral is strictly bad, as designed.

**Encumbrance**: the reference kit is *mid* at Strength 50, *fat* at 30, *fast*
at 85. A full daedric kit with a warhammer and shield (71 kg) is fat until
Strength 65 and fast at 125. A hoarder with 120 kg of loot is overloaded below
Strength 50.

**Breath**: `25 + 0.35×Athletics + 0.25×Endurance` seconds; 34 s at the bottom,
85 s at the top, unlimited for Argonians. 30 s segments are open to all, 45 s
wants a competent swimmer, 60 s a specialist, beyond 75 s is Argonian, spell or
equipment ground.

**Economy**: clean play at your own band pays (a D3 fight costs ~100 gold of
potions against 170 income); sloppy play does not (a botched D4 costs 425
against 480). Training runs 8 × rank per rank — 6,320 g for 30→50, ~36,000 g
from 30 to 100. Brewed healing beats bought healing for a skilled alchemist
(198 against 140) on ~12 g of ingredients.

## 8. Everything the simulation found

Round 1's eleven findings (armour outrunning damage growth, mages unable to
sustain a boss, bows unable to hurt armour, training priced absurdly, the
deferral check, the alchemy loop, and so on) are all still fixed. Round 2 added
these:

| # | Finding | Resolution |
|---|---|---|
| 12 | Making blows lethal (3 unavoided hits) collapsed the *difference* between armour classes: everything died in about the same number of hits. | **Fixed**: armour got its own material ladder (Morrowind's 8× rather than the weapon ladder's 2.3×) plus light/medium/heavy scaling. Typical endgame armour now takes 3, heavy 4, best-in-slot 5–6. |
| 13 | With enemy damage doubled, the endgame boss beat every build at ordinary play. | **Accepted and made explicit**: D5 assumes skilled play by design. Everything below D5 must be winnable at ordinary play (60 % of blows avoided); D5 expects ~78 %. |
| 14 | The starting armour set for the medium-armour build was a full steel harness — an artefact of a hand-written lookup table. | **Fixed**: gear is now derived (this build's armour class in this tier's material), so it cannot drift again. |
| 15 | Skills reached 100 by hour 60 in the first campaign runs. | **Fixed**: a use is now worth a full point at ~15 % of the target's health (was 8 %), and the sixth-connect damping actually applied. Weapon skills now max during Act III (~hour 95). |
| 16 | The archer died 51 times in Act II because the model made every build stand and trade. | **Fixed** in the model, not the design: ranged and stealth builds get a modest avoidance bonus for fighting at their own range, and a chance at a sneak opener. Their death count is still the highest, which is a genuine finding about light armour. |
| 17 | After Act III, nobody dies at all. | **Reported, not fixed.** Partly correct (fixed danger + mastery = you outgrow the world; it is the promised payoff) and partly a modelling artefact (the sim never mispositions, never gets ambushed, never runs out of potions). Worth watching in playtest; the lever if it is real is more D5 content late, not softer numbers. |
| 18 | Gold outruns its sinks by the endgame (~60 k banked). | **Reported**: a Phase 13 economy-tuning note. Bigger sinks (services, enchanting, property, bribes) are the answer, not less loot. |
| 19 | Non-social builds finish with Speechcraft under 20. | **Reported**: the endings must stay winnable by the duel route (they are, by quest-plan rule). |

## 9. What the god-build does to the world

At the hardest position in each band, with only ordinary play (35 % avoidance):
the god-build clears D3 in 6.5 s untouched, D4 in 13 s, and **wins the hardest
D5 fight in 37 s** — where the ordinary endgame character loses it. The
competent character loses at D3.

The gap between "endgame" and "god" is small in raw combat maths (the skill
curve soft-caps, gear tops out) and large in everything the sim does not model:
paralysis, invisibility, summons, fortify stacking, constant-effect items,
alchemy. That is the design working as intended — the ceiling is knowledge and
system mastery, not the level counter.

## 10. Known simplifications

Fights are a resource-and-damage race with an avoidance parameter standing in
for player skill; poise, blocking, spacing, hit zones and backstab positioning
are not modelled; bow ballistics are collapsed into one number plus an
armour-penetration factor; the campaign model assumes a player who fights
mostly at their own band and never runs out of supplies; `gear.json` mirrors
the game's equipment tables rather than reading them. All listed in
`tooling/stats-sim/README.md`, all removed at Phase 10c when the harness is
re-pointed at the implemented system.
