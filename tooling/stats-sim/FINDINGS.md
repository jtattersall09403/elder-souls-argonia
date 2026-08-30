# stats-sim findings — the tuning history

What this file is: **the tuning history and the known findings of the balance
harness** — every anomaly the simulation found, what was done about it, and
what is still open. It sits next to the harness because it records *this
tool's* results, not design. **The design is
[module 76 §116–129](../../docs/world/76-stats-progression.md); the canonical
numbers are `data/`; how to run it is [README.md](README.md).**

Findings 1–11 come from round 1 (2026-08-29, before the owner's lethality
ruling); 12–19 from round 2, which re-solved the danger ladder from "blows that
kill you" and added the whole-playthrough runs; 20–34 from round 3, which
rebuilt the campaign model on rules × content and then applied the canon
attribute formulas; **35–39 from round 4 (2026-08-30), the owner's QA rulings
(decision 0037)**. Earlier fixes all still stand, but *values* quoted below are
pre-retune — where a number matters, trust the harness output over this file.

## Round 1 — eleven anomalies

Every one is either fixed in the data or explicitly accepted.

| # | Finding | Resolution |
|---|---|---|
| 1 | The reference kit sat in the *fast* roll tier under Souls-style thresholds (0.30/0.70), so "today's roll" would have been the light-roll. | **Fixed**: thresholds retuned to 0.20/0.35. The reference is mid, endgame plate is fat until Strength grows, a loot-hauler is overloaded. |
| 2 | Enemy armour ratings and D5 health outran the player's damage growth: an endgame boss took over two minutes and beat every build. | **Fixed**: AR bands cut roughly 40 %, D5 health 800–1600 → 650–1250, D5 damage 95–160 → 90–150. |
| 3 | A "strong armoured" D5 compiled to AR 341 — a tier of its own. | **Fixed**: variant clamp of ±25 % past the band edge, now a compiler rule (module 76 §128). |
| 4 | Morrowind-sized magicka (Int × 1.6, Willpower/33 regen) could not sustain a mage through one boss fight even with a full potion belt. | **Fixed**: `20 + 3×Int`, regen `0.5 + 0.05×Wil`, plus capped spell-cost-reduction gear. |
| 5 | With the bigger pool, low-tier spells then out-burst melee 3:1 in the low bands. | **Fixed**: tier damages cut to 9/18/40/80/140. Magic stays the burst archetype, bounded by magicka rather than by damage. |
| 6 | Bows could not finish a heavily-armoured endgame enemy. | **Fixed**, by modelling two things the design already implies: arrowheads pierce (armour ~60 % effective against arrows) and **arrow material is its own damage axis** (placed loot, so bow power is geography too). |
| 7 | Endgame mages needed cost-reduction gear to function, which is Skyrim's most famous exploit. | **Accepted with a bound**: cost reduction is kept because it is the mage endgame fantasy, and **capped across all sources** so no stack reaches free casting. (50 % here; the owner raised the cap to 75 % at round 2, framed as rare placed loot — module 76 §123.) |
| 8 | Training one skill to 100 cost ~127,000 g at the first curve — more than the early economy produces. | **Fixed**: 8 × rank per rank (≈36,000 g from 30 to 100), still a serious sink. |
| 9 | Misc-skill grinding earns vastei without advancing the level trigger, so a grinder can bank a hoard. | **Accepted, and quantified**: a maximum sitting at level 10 costs ~27,600 vastei against ~2,000 earned in an ordinary level, and the +5-per-attribute sitting cap throttles what a hoard can buy. This is Morrowind's misc-grind charm, bounded. |
| 10 | Hoarding vastei rather than spending it at each sitting: does deferral pay? | **Confirmed closed**: the hoarder ends 54 attribute points *behind* and spends the whole run with lower health (mean 121 against 138). Deferral is strictly bad, exactly as the F1 design claimed. |
| 11 | A magic build's damage tier and a melee build's roll tier both changed when attributes were dealt by archetype rather than by a single table. | **Accepted as a modelling fix**: builds now spend the same total attribute investment along their own priority order. The melee order reproduces the reference character exactly. |

**Loops explicitly hunted and found bounded** (round-1 values; the harness
prints today's): the Morrowind alchemy fortify-Intelligence loop is flat at 124
magnitude across six iterations because crafting reads base stats — the same
loop with output-fed inputs climbs 124 → 211 and keeps going; smithing
tempering tops out at ×1.24; the enchant point budget at ×1.6; unarmoured tops
out at 60 rating; and armour never approaches immunity (round 1: AR 214 =
58.8 % of a light hit; after the round-2 retune the ceiling is AR 406 = 73 % of
a light hit and 56 % of a D5 blow).

## Round 2 — eight more, after the lethality ruling

| # | Finding | Resolution |
|---|---|---|
| 12 | Making blows lethal (3 unavoided hits) collapsed the *difference* between armour classes: everything died in about the same number of hits. | **Fixed**: armour got its own material ladder (Morrowind's 8× rather than the weapon ladder's 2.3×) plus light/medium/heavy scaling. Typical endgame armour now takes 3, heavy 4, best-in-slot 5–6. |
| 13 | With enemy damage doubled, the endgame boss beat every build at ordinary play. | **Accepted and made explicit**: D5 assumes skilled play by design. Everything below D5 must be winnable at ordinary play (60 % of blows avoided); D5 expects ~78 %. |
| 14 | The starting armour set for the medium-armour build was a full steel harness — an artefact of a hand-written lookup table. | **Fixed**: gear is now derived (this build's armour class in this tier's material), so it cannot drift again. |
| 15 | Skills reached 100 by hour 60 in the first campaign runs. | **Fixed**: a use is now worth a full point at ~15 % of the target's health (was 8 %), and the sixth-connect damping actually applied. Weapon skills now max during Act III (~hour 95). |
| 16 | The archer died 51 times in Act II because the model made every build stand and trade. | **Fixed** in the model, not the design: ranged and stealth builds get a modest avoidance bonus for fighting at their own range, and a chance at a sneak opener. Their death count is still the highest, which is a genuine finding about light armour. |
| 17 | After Act III, nobody dies at all. | **Reported, not fixed** — see *Open* below. |
| 18 | Gold outruns its sinks by the endgame (~60 k banked). | **Reported, not fixed** — see *Open* below. |
| 19 | Non-social builds finish with Speechcraft under 20. | **Reported, not fixed** — see *Open* below. |

## Round 3 — the campaign model was the thing that was wrong

Round 2's whole-game runs reported six builds at **level 2–4 after 19 hours and
16–27 after 150** against Morrowind's 1–2 h and 45–55. The decisive experiment:
substituting **Morrowind's own flat use values** into the engine still produced
level 4 at hour 19 — so the fault was not in the rules. It was in the content.

| # | Finding | Resolution |
|---|---|---|
| 20 | Rules and content were fused into one file, so "is our exchange rate wrong or is our world empty?" was not a question the harness could ask. | **Fixed**: `rules-{argonia,morrowind}.json` × `content-{argonia,vvardenfell}.json`, resolved by `src/rules.mjs`. `$from` reads shared constants out of `curves.json` rather than copying them. |
| 21 | The **misc/maxed 3:1 tail was gated** on every major *and* minor reaching 100 — which never happens in a real game — so a rank in a miscellaneous skill was worth **nothing**, and a skill at 100 earned nothing at all. About two use-points in five bought no progress. | **Fixed as a design bug**: the tail is per-skill and ungated, and a maxed skill keeps earning. Measured use-point discard is now **0 %**; 21–32 % of level *credit* is still forgone, which is the 1/3 tail doing its intended job rather than the gate throwing points away. |
| 22 | **6.5 fights/hour, combat 2.9 % of wall-clock, 414 km of travel at a mean 0.79 m/s** — a hundred and fifty hours in which the player neither fights nor moves. | **Fixed**: 10.6–10.8 fights/hour, combat 15–24 %, 925–973 km, moving 39–41 %. |
| 23 | `swimMinutesPerQuest` was authored and **never read by any code**, in a game whose stated pillars include swimming. | **Fixed**: wired to Athletics at Morrowind's swimming rate and raised in the deep-marsh acts; 10–12 % of wall-clock. |
| 24 | Each archetype exercised **one weapon skill and one armour skill**. Four of the warrior's ten level-bearing skills and five of the mage's received *zero* use across 146 hours — the single largest cause of the stall. | **Fixed**: explicit per-archetype verb profiles in the content file, bent toward each character's own majors and minors. Guarded by `no-level-bearing-skill-is-dead-content`. |
| 25 | Armour and Block keyed off the **player's own blow count**, estimated as `enemyHealth / perHit` — which measured **1.36–1.52× too high** and was the wrong event anyway. | **Fixed**: `simulateFight` returns real `swings`, `enemySwings`, `damageDealt` and `blocks`; defence keys to incoming swings that land. Pure accounting — no fight resolves differently. |
| 26 | ~199 locks and ~290 conversations per campaign put Security and Speechcraft **over a thousand hours** from maximum. | **Fixed**: a Security-major thief now caps it at hour 96, inside the 90–120 h target. |
| 27 | Nothing in the harness could tell a plausible pacing curve from an implausible one. | **Fixed**: `morrowind-known-answer` reproduces six published facts about TES III from Morrowind's own rules, and `content-model-is-a-playthrough` guards the content shape. |
| 28 | Damping made a long fight against a big actor teach **less** than a short one against a rat. | **Fixed**: relaxed from 6 connects at 0.35 to 8 at 0.55. |

Finding 19 (non-social builds finish with Speechcraft under 20) is **partly
resolved**: warriors now finish at 37–39 rather than 8–20, because the verb
profile gives them the talking they actually do. It remains a content
constraint, not a number — see *Open*.

## Round 3, second half — what the canon attribute model changed

Findings 20–28 (above) came from the rules/content split. These came from
applying module 76's round-3 design — Morrowind's own attribute formulas — to
the harness.

| # | Finding | Resolution |
|---|---|---|
| 29 | D0 was in the combat ladder as "wildlife, nuisance" — but quests 20 §12 and decision 0009 already define D0 as **safe city/interior**, and the module even cited that page as its source. No invariant had ever tested D0. | **Fixed**: five combat rungs D1–D5; vermin live at the bottom of a widened D1 (health 20–90, damage 4–13). A dungeon inside a city carries its own authored band. |
| 30 | Switching health to canon's `(Str+End)/2 + level × End/10` immediately broke `getting-hit-matters` (a legend melee survived 6 unavoided D5 blows against a target of 3). | **Expected and handled**: the ladder is *solved*, not authored, so the fix is one re-solve. New bands: D1 4–13, D2 22–40, D3 57–103, D4 133–241, D5 210–380. Any future change to health, armour or the damage formula requires the same re-solve — the note in `ladder.json` says so. |
| 31 | Canon multiplies **bow** damage by `(Str+50)/100` too. Applying it pushed a Bosmer archer's first level from 1.9 h to 3.2 h. | **Deliberate divergence**: our arrow damage is physical (draw force × arrow mass) and the soft requirement already charges a weak archer, so canon's term would count the archer's strength a third time. Melee keeps it; bows do not. |
| 32 | Canon's castability boundary (`2×skill + Wil/5 ≥ cost`) is where the cast chance reaches *zero* — using it directly gave a starting mage a 34-damage spell and, because a cast is worth one use-point however big it is, made the mage level *slower*. | **Fixed**: the reliable line sits 50 points inside canon's boundary and the working spell is 60 % of that. A starting mage lands on ~19 damage and a master on ~100, which is where Morrowind's own spellbooks sit. |
| 33 | **Gold ran away: 860,000 banked over a playthrough.** The campaign credited the ladder's `lootValue` for every kill *and* the content model's `lootGoldPerHour` — the same placed treasure, counted twice. | **Fixed**: a corpse yields its **template drop** only (4/12/35/95/240 by band), because placed treasure never respawns (§126). Lifetime gold is now ~180 k, against ~45 k to take one skill from 30 to 100 — so training is a real choice again. Round-2's "gold outgrows its sinks" finding is closed by this, not by new sinks. |
| 34 | Fewer potions (a consequence of #33) raised early deaths from ~6 to ~19 per run. | **Accepted**: it is the honest consequence of an economy that no longer prints money, and it moves the death curve toward the front, which is where the design wants it. |

**Resolved since round 3** (formerly listed open here):

- **Health per level** — resolved by finding 30 itself: `curves.json` carries
  canon's `End/10` and the ladder was re-solved against it. The spec and the
  data now agree.
- **Pacing runs hot at the top** — resolved at round 4 by restating the design
  target (module 76 §120.5): 150-hour target is now 50–70, because Morrowind's
  use values *plus* the ungated 1/3 misc/maxed credit must level faster than
  Morrowind on identical content, and that is the "no hour is worth nothing"
  rule working as intended. The early checkpoints stay on Morrowind's pace.
- **No hard level ceiling** — accepted as design at round 4 (§120.5): level is
  bounded by hours played, not by a wall.
- **Gold outgrows its sinks** — closed by finding 33 (the double-count fix):
  lifetime gold ~180 k against ~45 k to train one skill 30→100.

## Open — reported, not fixed (forward work)

The harness's live output to later phases. Not defects to patch in `data/`.

- **After Act III, nobody dies.** Partly correct (fixed danger + mastery = you
  outgrow the world; it is the promised payoff) and partly a modelling artefact
  (the sim never mispositions, never gets ambushed, never runs out of potions).
  **Watch it in playtest.** If it is real, the lever is **more late D5 content,
  not softer numbers** — softening the numbers would undo the round-2 lethality
  ruling.
- **Non-social builds finish with Speechcraft in the 30s** (finding 19, partly
  resolved by the round-3 verb profiles). Speech is an ending-grade system, so
  **the endings must stay winnable by the duel route** for those characters —
  which the quest plan already requires. A content constraint, not a number to
  change.
- **~19 early-game deaths per run** (finding 34). The front-loaded shape is
  what a Souls game wants; the magnitude needs a real playtest before anyone
  trusts or tunes it.

## Round 4 — the owner's QA rulings (2026-08-30, decision 0037)

| # | Finding / ruling | Resolution |
|---|---|---|
| 35 | **The practice discount was never implemented.** `attributeCost` in `model.mjs` has no practice term — every validated pace, affordability and deferral figure was already computed at list price. The spec described a mechanic the evidence never covered. | **Resolved by the owner cutting the discount** (it recreated Morrowind's pre-level grind spreadsheet, and trainers would have let gold buy it). Spec now matches the harness; no retune needed. |
| 36 | Armour skills accrued only from hits taken — starved and perverse in a 3–6-hits-kill game, and the model quietly keyed them to landed enemy swings that a good player never allows. | **Reworked** (owner design): kill award + hit bonus, both class-weighted (light learns by winning, heavy by tanking, medium between; unarmored follows light). Kill award keys to the corpse, never "encounter ended", so aggro-and-flee farms nothing. 19/19 invariants still hold; every build still exercises all ten level-bearing skills. |
| 37 | Per-actor connect damping (8 connects then ×0.55) had no precedent in any reference game and punished chosen grinding, which the owner rules is legitimate play. | **Removed** (code + curves.json). End-of-run levels moved 51–66 → 53–69, inside the restated 50–70 target. |
| 38 | Deterministic lockpicking meant one good pick opened everything forever. | **Design change, no sim impact**: picks wear condition per lock scaled by `lockLevel / score` (module 76 §118). The threshold stays dice-free. |
| 39 | Poise reinstated (owner reversal of round 2) on the DS1 model, with base poise = Agility/2 replacing the bare damage-threshold stagger rule. | **Design only for now** — the harness's fight model is a damage race that never models stagger, so poise adds no simulated numbers yet. Constants are provisional until sandbox calibration at 10c (research: `docs/research/dark-souls-poise-mechanics.md`). |

## The ceiling, as the sim sees it

At the hardest position in each band with only ordinary play (35 % avoidance),
the god-build clears D3 in 6.5 s untouched, D4 in 13 s and wins the hardest D5
fight in 37 s — where an ordinary endgame character loses it, and a merely
competent one loses at D3. The gap between "endgame" and "god" is **small in
raw combat maths** (the skill curve soft-caps, gear tops out) and **large in
everything the sim does not model**: paralysis, invisibility, summons, fortify
stacking, constant-effect items, alchemy. That is the design working — the
ceiling is knowledge and system mastery, not the level counter (module 76 §102).

## Known simplifications

In [README.md](README.md) § Known simplifications — read those before trusting
any single figure above. All of them go at Phase 10c, when the harness is
re-pointed at the implemented system.
