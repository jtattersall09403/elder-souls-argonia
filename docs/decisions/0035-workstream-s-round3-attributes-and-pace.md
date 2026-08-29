# 0035 — Workstream S round 3: attributes rebuilt on Morrowind's formulas, levelling pace calibrated, D0 corrected

**Date:** 2026-08-29 · **Status:** accepted (owner round 3) ·
**Scope:** `docs/world/76-stats-progression.md`, `tooling/stats-sim/`,
`docs/research/` (archive). Implementation is still Phase 10c.
Supersedes parts of [0033](0033-workstream-s-design-and-numbers.md).

Three owner challenges, all of which turned out to be right, plus a tidy-up.

## 1. "Is that really how attributes work in Morrowind?" — no, and now it is

Round 2 gave every skill a generic **attribute assist**: `skill + clamp((governing
attribute − 50)/5, ±10)`. The owner challenged it as an invented mechanic in a
system where attributes should be intrinsic. A formula-level UESP sweep (every
formula naming every attribute; every dice roll and the attribute terms inside
it) confirmed the challenge: Morrowind's governing attribute does exactly three
things — sets the level-up multiplier, caps training, and is **frequently not
the attribute in that skill's own formula at all**.

The faithful port is not "delete the dice term". It is **keep the score, drop
the roll**. Morrowind computes `skill + primaryAttribute/5 (+ Luck/10)` and
rolls 0–99 against it; that `/5` weight is a near-universal convention across
combat, blocking, sneaking, lockpicking, casting, enchanting and persuasion. We
compute the same score and compare it deterministically:

| Morrowind rolls | We compare | Result |
|---|---|---|
| `WeaponSkill + Agi/5` vs Evasion | same score | sets **where in the weapon's damage range** the blow lands |
| `(Security + Agi/5) × ToolQuality − LockLevel` | same score | a lock opens iff the score clears the lock |
| Sneak elusiveness vs an observer's spot chance | same two scores | including canon's ×1.5 front / ×0.5 behind multiplier |
| `SpellSkill×2 + Wil/5 − SpellCost` | same score | a spell is **castable** iff `2×skill + Wil/5 ≥ cost` |
| `Enchant + Int/5 − 3 × points` | solved for points | the enchanting **budget** is `(Enchant + Int/5)/3` |
| `Agility × 0.5 ≤ damage` (immune at 100) | same threshold | which of the sandbox's **existing** hit reactions plays |

Alongside that, canon terms we had dropped or invented around are restored:
weapon damage regains `× (Strength+50)/100` (canon applies it to bows too;
hand-to-hand canonically gets no Strength at all), health becomes
`(Str+End)/2 + level × End/10` — which lands the reference character on exactly
100 with no fitting — alchemy, barter, trainer price (10 × skill), persuasion
rating, disposition, movement and encumbrance all take canon's coefficients.
The governing attribute keeps its two canon jobs: the **trainer cap** (reading
base values, which kills canon's drain-and-train exploit) and, in place of the
level-up multiplier, the **practice discount** (§120.4) — canon's ×1–×5
expressed as a price rather than a minigame, so nothing can ever be "wasted"
and there is nothing to spreadsheet.

Evidence: `docs/research/stats-progression-reference-games.md` and the round-3
research; design: module 76 §116, §117, §117.1–117.3.

## 2. "19 hours to reach level 2–4?" — the design was fine; the simulation was not

The owner's memory of Morrowind (level 2 in an hour or two, a much higher
finish) is correct and documented: Morrowind's ceiling is exactly 78, its own
main quest treats level 21 as "famous enough to skip content", and community
completions cluster at level 20–30 in ~40 hours.

The diagnosis was a **known-answer test**: run the same campaign model with
*Morrowind's* XP rules substituted. It still produced level 4 at hour 19 — so
worthiness, the damping and the ten-rank trigger were exonerated and the fault
was the **content model**. It believed a 146-hour playthrough contained 950
fights (2.9 % of wall-clock in combat) and 414 km of travel (a mean movement
speed of 0.79 m/s), and that four of a warrior's ten level-bearing skills were
never used at all.

Two real design faults did fall out of the same investigation:

- **A maxed skill was a dead end.** 38 % of every use-point a character
  generated was being discarded into skills already at 100. Fixed: a skill at
  100 keeps earning vastei, and its ranks keep feeding the level counter at
  1 : 3 — **per skill**, not gated on everything being maxed.
- **Use values were invented.** They are now Morrowind's own (Block 2.5 per
  block, 1.0 per weapon connect, 1.0 per damaging hit *taken*, 0.02/second of
  running, and so on), with our worthiness rule demoted to a *modifier* on the
  combat ones and the damping relaxed to 8 connects / 0.55. Morrowind levels
  fast early because four or five skills tick during ordinary play; ours now
  does the same, and the anti-grind rules target degenerate repetition rather
  than travel and fighting.

**Pace targets are now design, not emergent** (module 76 §120.5): level 2 by
hour ~2, 10–14 by hour 20, 20–25 by hour 40, 45–55 by hour 150, ceiling ~75.
The harness checks them, and — more importantly — carries a standing
`morrowind-known-answer` invariant: the same engine, run under Morrowind's
rules and Vvardenfell's content rates, must reproduce Morrowind's documented
pace. A future agent retuning the progression constants gets an immediate red
light rather than a plausible-looking number.

**On whether whole-game simulation is worth doing at all** (the owner asked
directly): it is trustworthy for *relative* comparisons and for
rate-independent structural findings — build vs build, "this build cannot
finish", "38 % of use-points are discarded", "Security cannot be maxed at one
point per lock" — and those survive every calibration error. Its *absolute*
pacing is only as good as its content rates, so those are now anchored to a
known answer instead of guessed, results are reported as bands rather than
integers, and the numbers carry their provenance. It is evidence, not law.

## 3. D0 was already defined, and the stat ladder had overwritten it

Quests 20 §12 and decision 0009 define **D0 = safe city/interior** — an
authored location property, not a band of the compiled danger field (which runs
1–5 and has no band 0). Module 76 §128 had redefined it as "wildlife, nuisance"
with 20–45 health, and cited quests 20 §12 as its source while contradicting
it. Corrected: the combat ladder is **five rungs, D1–D5**, vermin live at the
bottom of a widened D1 (20–90 health), and a dungeon entrance inside a city
carries its own authored band. Nothing had caught this because no invariant
ever tested D0.

## 4. Sneak openers reach further (owner ask)

Six bands at Sneak 0/20/40/60/80/100 instead of four. Dagger keeps Skyrim's
×15 ceiling; **bows go to ×8** (Skyrim's is ×3) because stealth-archery should
be a build worth committing to. Melee still leads ranged.

## 5. The workstream's papers are archived

Five closed working papers (both owner rounds, the mapping inventory, the code
baseline snapshot and the numbers packet) moved to
`docs/research/archive/workstream-s/` with a README saying they are provenance
only and contain superseded drafts. The tuning history moved to
`tooling/stats-sim/FINDINGS.md`, next to the tool that produced it. What
remains live: **module 76 §116–129, decisions 0019/0031/0033/0035, the harness,
and one evidence packet** (`stats-progression-reference-games.md`). A fresh
agent implementing Phase 10c reads the module and the decisions and is
complete.
