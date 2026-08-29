# 0033 — Workstream S: the detailed stat design, its numbers, and the balance harness

**Date:** 2026-08-29 · **Status:** accepted (owner round 2 answered
2026-08-29; amendments in §5 below) ·
**Scope:** `docs/world/76-stats-progression.md`, `docs/research/`,
`tooling/stats-sim/`, one lore dossier. Implementation is Phase 10c.

## 1. What happened

Round 1 (decision [0031](0031-workstream-s-round1-shape.md)) settled the shape.
Steps 5–7 of the run-book (module 76 §103.1) turned it into a spec, gave it
numbers and proved them in bulk:

- **§116–129 of module 76 is now the decided design** — seven attributes, 27
  skills, one skill curve with an attribute assist, *vastei* levelling, the
  combat and defence maths, movement/burden/breath, magic, crafting and the
  economy, speech, rest/death/respawn, races and one effects stack, the D0–D5
  ladder and the semantic NPC authoring model.
- **`tooling/stats-sim/`** — a standalone, data-only harness (no npm workspace
  entry, no game package imported: the single code exception 0019 allows). It
  sweeps builds × stages × gear × archetypes × danger bands plus progression,
  encumbrance, breath, climbing, economy, exploit hunts and whole-playthrough
  runs, and ends in **16 invariants, all holding**. Its `data/` directory is the canonical numbers; at 10c it is
  re-pointed at the game's tables and the invariants become standing tests.
- **[numbers packet](../research/stats-progression-numbers-packet.md)** — the
  worked characters, the ladder as played, pacing, economy, and the eleven
  anomalies the simulation found with what was done about each.

## 2. The non-obvious calls

1. **One curve, one assist.** Every skill effect is `k(s) = 1 − (1 − s/100)^1.6`
   mapped onto that skill's own band, over an *effective* skill of
   `skill + clamp((governingAttribute − 50)/5, ±10)`. This is what makes
   attributes matter everywhere without buying anything twice, and it is the
   soft cap (the last 25 skill points buy 12 % of a band).
2. **The armour curve changed shape**: `AR / (AR + 135.6 + 0.6 × incomingDamage)`. It
   reproduces today's 25 % at the reference loadout exactly *and* lets big hits
   punch through, which is what a fixed-danger world needs — Morrowind's
   `min(1 + AR/dmg, 4)` behaviour fitted to our numbers.
3. **Health is a formula over Endurance and level**, so it is retroactive by
   construction and Morrowind's max-Endurance-first pathology cannot exist.
4. **Vastei** is the in-game name for the levelling currency: canon Argonian
   for *change* (Nisswo doctrine), earned by acting, dropped where you die —
   deliberately not colliding with soul gems, whose canon meaning we keep.
   Grounding: new dossier `world/sources/lore/topics/magic-practice.md`, which
   also records why **Mysticism survives here as a folk school** (Lore:Mysticism
   states only that the College of Winterhold stopped recognising it by 4E 201).
5. **Requirements never block.** An over-heavy find is usable at level one at a
   stamina penalty — preserving the "niche route to a powerful weapon early"
   joy the owner called out.
6. **A variant may not invent a tier**: compiled enemy fields are clamped to
   ±25 % of their band edge, so "strong armoured" stays a hard D5.
7. **Spell-cost reduction is capped** across all sources (75 % after round 2)
   — the mage endgame fantasy kept, Skyrim's free-casting exploit closed by a
   cap rather than by deletion.
8. **Crafting reads base stats and nothing may fortify a crafting skill** —
   the single rule that kills every documented Elder Scrolls crafting loop; the
   harness demonstrates the bounded and unbounded series side by side.

## 3. What the simulation forced

Retunes, all recorded in the data files with reasons and listed in the numbers
packet §8: burden thresholds (0.20/0.35, so the reference kit is *mid*), enemy
armour bands down ~40 % and D5 health/damage trimmed (boss fights were beating
every build), magicka pool and regen up substantially with capped cost-reduction
gear (mages could not sustain a boss fight), spell tier damage down (they then
out-burst melee 3:1 in the low bands), arrow material as its own damage axis
plus arrow armour-penetration (bows could not finish armoured endgame enemies),
and training prices down by ~3.5× (one skill to 100 cost more than the early
economy produces).

Confirmed by simulation rather than assertion: the owner's own D5-versus-a-
beginner test; that hoarding vastei is strictly worse than spending it; that
every build style can finish the final boss; and that no achievable armour
approaches immunity.

## 4. Round-2 amendments (owner, 2026-08-29)

Full record and reasoning:
[owner round 2 §7](../research/stats-progression-owner-round2.md). The
load-bearing ones:

- **Getting hit matters.** "Blows that kill you" became the danger ladder's
  *design input* — 10/5/4/3.5/3/3 by band, on the character each band is meant
  for — and enemy damage is solved from it (it roughly doubled). To keep armour
  meaningful under that, **armour got its own material ladder** (Morrowind's
  8× spread, not the weapon ladder's 2.3×) plus light/medium/heavy scaling:
  light armour dies in 2–3 blows, heavy in 4–5, best-in-slot plate in 5–6, and
  nothing buys more. A single **difficulty multiplier** scales all of it and is
  the back end for a play-time difficulty setting; it touches incoming damage
  only, so 0004 is untouched.
- **Poise/posture cut** — the sandbox has no such system and this design will
  not introduce one from paper. **Weapon skill no longer touches recovery
  timing** either; stats stay off the feel constants.
- **Roll tiers vary i-frames** (Dark Souls 1's 13/11/9) — equip load is a
  visible choice, not the hidden stat DS2's Adaptability was.
- **Sneak-attack multipliers** added, Skyrim-shaped, as Sneak-skill bands
  (dagger ×3→×15 … bow ×2→×4), melee above ranged.
- **Acrobatics governs climbing** with real numbers: an hour-one character
  manages ~12 m of wall, a master 160 m; burden multiplies the drain.
- **The attribute assist is ours, not Morrowind's** — UESP was checked and the
  module now says so plainly (§117.1), keeps the canon trainer cap, and records
  the Morrowind-literal alternative as a live option.
- Birthsign is **chosen directly**; spell-cost reduction caps at **75 %**;
  constant-effect enchantments are **tiered by soul size**; barter is a visible
  price band (~3× swing end to end, no minigame); **no followers anywhere**;
  **18 preset classes** (11 canonical TES + 7 from canon province offices);
  *vastei* must be taught diegetically by a Nisswo in the opening hours.
- **A whole-playthrough simulation** was added (`src/campaign.mjs`): six builds
  over ~150 hours of Milestone-1-shaped content, reporting levelling pace,
  deaths per act, skill growth and economy. It produced eight further findings
  (numbers packet §8), three of which are reported rather than fixed: nobody
  dies after Act III, gold outgrows its sinks, and non-social builds finish
  with Speechcraft under 20.
- Standing instruction recorded in the module: **the simulation is evidence,
  not law** — where it and a playtest disagree, the playtest wins.

## 5. Left undone, deliberately

- ~~`docs/quests/60-*.md` §49 needs speechcraft adding~~ — **done**
  2026-08-29 (owner cleared the quest docs).
- **The keep-list downloads** (Animated Armoury, Animated Heavy Armory, Skyrim
  Spear Mechanic) are a Phase 10 sourcing job; the verified evidence and
  permissions now live in module 90 §74.3.
- The round-2 changes themselves have not been reviewed by the owner — they
  implement rulings the owner gave, so they are not a third round; a light
  sanity check is noted in PROGRESS as non-blocking.
