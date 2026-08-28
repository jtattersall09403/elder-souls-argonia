# 0031 — Workstream S round 1: the decided stat-system shape

**Date:** 2026-08-28 · **Status:** accepted (owner round 1, all questions
answered; follow-ups F1–F3 closed) · **Scope:** design only — implementation
is Phase 10c.

The full question-by-question record, including the F1 levelling mechanism in
self-contained detail, lives in
[docs/research/stats-progression-owner-round1.md](../research/stats-progression-owner-round1.md)
(single source of truth for the rulings). Headlines:

- **Seven attributes** (Morrowind's eight minus Luck — no dice for Luck to
  modify). Full Morrowind class structure (majors/minors/specialization/
  favoured attributes). One stamina bar (no second fatigue layer).
- **Levelling**: skills grow by *effective* use (Morrowind/Skyrim-style rules,
  "in anger" only); a Souls-like currency accrues **from skill use** and is
  spent at the Morrowind level screen (no multipliers) to buy attribute
  raises; the currency — placeholder "souls", in-game name to be
  lore-grounded (never colliding with soul gems) — **drops where you die**,
  one retrieval. Skills, items and gold are never lost on death.
- **Weapon skill** = damage *range* position (top ~40–100 % of a per-class
  range, soft-capped) + stamina cost + recovery speed + gear wear + bow
  handling. **No moveset unlocks, no wield requirements** — early powerful
  finds stay usable. Armour skill scales protection; burden ratio sets
  fast/mid/fat roll tiers. Stats never touch i-frames/parry windows.
- **No cast fizzle**; skill gates spell tiers and scales cost/cast-time/
  magnitude on the same multiplier stack as weapons.
- **Healing is Morrowind-style potions; the static flask (estus) is cut**
  (10c removes it). **Owner philosophy ruling, binding for §102 reasoning:**
  *fixed difficulty binds the world — its enemies, stats and parameters —
  never the player's earned capacity to cope.* Earning wealth/alchemy to
  brew your way through a hard area is the intended fun, not a breach.
- **Save-on-rest**: camping anywhere calm (never dungeons/combat); hidden
  suspend save for browser interruption; death = wake at last rest.
- **Categories**: keep spears/pikes/halberds/quarterstaves, medium armour,
  unarmed; cut whips, crossbows and throwing weapons. Marksman = bows.
- **Crafting**: alchemy + enchanting + spellmaking kept, bounded (crafting
  reads base stats; nothing enchants a crafting skill); Skyrim keepers:
  smithing (merged with Armorer) and learn-by-disenchanting; **no perk
  points**. Item condition kept (gentle).
- **Province findings accepted**: crime assessed as Owing debts; speech as a
  first-class threshold system (skill + evidence + standing, no dice);
  unarmed drains stamina toward knockout finishers; Mysticism survives as a
  folk school. **Beast-race gear ban vetoed** — beast races wear everything
  they can in Skyrim; Morrowind-weight racial *stat* packages stand.

Next (module 76 §103.1 steps 5–8): detail the design into module 76, the
numbers packet (the D0–D5 absolute ladder), the balance-simulation harness
(`tooling/stats-sim/` — the one code exception), owner round 2.
