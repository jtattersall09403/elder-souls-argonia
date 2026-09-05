# 0037 — Workstream S round 4: the owner's QA rulings

**Date**: 2026-08-30 · **Status**: decided · **Owner round**: 4 (final)
**Supersedes parts of**: 0031 (poise cut), 0033/0035 (practice discount,
armour accrual, damping) · **Spec**: module 76 §116–129 (updated in the same
change) · **Harness findings**: `tooling/stats-sim/FINDINGS.md` round 4
(#35–39).

The owner QA-reviewed the closed workstream and ruled on the weaknesses it
surfaced. Six rulings:

1. **The practice discount is cut** (§120.4). Discounting attribute prices by
   recently-ranked governed skills recreated Morrowind's pre-level grind
   spreadsheet (a ×5 discount is a bonus optimisers will farm), and trainers
   would have let gold buy it. Vastei is spent freely at the sitting, list
   price. *No retune was needed*: the harness had never implemented the
   discount, so every validated figure was already list-price (finding 35).

2. **Armour skills accrue from kills and hits, class-weighted** (§120.2).
   "Learn armour by being hit" is starved and perverse in a game where 3–6
   unavoided hits kill you (Skyrim documents the same defect). New model: a
   kill award (keyed to the corpse — never to "the encounter ended", so
   aggro-and-flee farms nothing; worth scales with the victim's health against
   yours) plus the hit bonus, weighted light {win 1.0, hit 0.25} / medium
   {0.6, 0.6} / heavy {0.35, 1.0}; unarmored follows light. Blocked hits feed
   Block only. Constants in `rules-argonia.json → armourAccrual`;
   rules-morrowind.json keeps pure hit accrual for the known-answer test.

3. **Repeat-target damping is removed** (was: 8th connect on the same actor →
   ×0.55). No reference game diminishes repeat use; grinding respawning
   enemies after a rest is legitimate chosen play. Chip-damage worthiness
   stays. End-of-run levels moved 51–66 → 53–69.

4. **Lockpicks wear** (§118, Security). The deterministic threshold meant one
   good pick opened everything forever. Picks now lose condition per lock,
   scaled by `lockLevel / score` — hard locks eat picks; no dice (the §102
   no-dice rule stands; Morrowind-style lockpicking rolls were considered and
   declined in favour of this).

5. **Poise is reinstated** (§121.3), reversing the round-2 cut, on the DS1
   model: passive pool, instant refill ~5 s after last hit, attacker poise
   damage = weapon-class base × attack-type factor, break → the existing
   heavy reaction. Base poise = Agility/2 (re-housing Morrowind's knockdown
   threshold — this *replaces* the bare damage-threshold stagger rule, one
   system not two); armour pieces carry skill-banded poise ranges (heavy >
   medium > light); poise and block stability are effect-stack fields
   (potions, spells, enchanted rings/amulets). Player and enemies share the
   system; bosses may be `staggerable: false`. Research:
   `docs/research/combat-and-systems/dark-souls-poise-mechanics.md`. All constants provisional
   until sandbox calibration at 10c; the balance harness does not model
   stagger and is unaffected.

6. **The 150-hour pace target is restated 45–55 → 50–70** (§120.5), and the
   absence of a hard level ceiling is accepted as design. Morrowind's use
   values plus our ungated 1/3 misc/maxed credit must outpace Morrowind on
   identical content; the early checkpoints (hours 2/20/40) stay on
   Morrowind's own pace.

Also fixed in the same change: the §118 Marksman row contradicted §117's
deliberate no-Strength-on-bows divergence (stale, corrected); duplicate
§121.5 renumbered (blocking/condition → §121.6); FINDINGS' stale "open"
entries (health formula, gold sinks, Speechcraft) marked resolved.

Harness after all of it: **19/19 invariants hold**, including the Morrowind
known-answer test.

## Addendum (same day, closing the workstream)

Two further owner rulings on the round-4 follow-ups:

7. **Ripostes and backstabs** — already functional in the sandbox as paired
   criticals with a per-weapon `criticalMultiplier` (flat ×2 today). Adopted
   into the spec (§121.5): the multiplier becomes per-weapon-class data
   (dagger-topped, DS1's shape; values calibrated in the sandbox at 10c),
   skill enters only through the normal damage pipeline, and the sneak-opener
   table never stacks with it (undetected target → sneak table; aware target
   → class multiplier). Poise break does not open a riposte; parry and
   guard-break do.

8. **Weapon poisons and oils** (§124) — the Oblivion/Skyrim mechanic: harmful
   or elemental brews can be applied to an equipped weapon (or an arrow) and
   are delivered by the next successful hit through the standard effect
   stack, potency from the standard alchemy formula. Skyrim's one-hit rule
   kept for simplicity.

**With these, workstream S is closed for good.** Everything that remains is
owned elsewhere: Phase 10c implements the spec and calibrates the provisional
constants (poise, criticals) in the sandbox; Phase 11+ authors content
against the ladder; the deferred birthsign *contents* land when a phase needs
them (the slot ships at 10c); the three watch-items live in
`tooling/stats-sim/FINDINGS.md` § Open.
