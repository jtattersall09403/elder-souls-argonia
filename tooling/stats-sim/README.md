# stats-sim — the balance harness for workstream S

What it is: a standalone, data-in/report-out simulation of the stat design in
[docs/world/76-stats-progression.md](../../docs/world/76-stats-progression.md)
§116–129. It exists because the design's numbers had to be proved **in bulk**
— build × level × gear × archetype × danger band — before the owner was asked
to confirm them (module 76 §103.1 step 7).

```bash
node tooling/stats-sim/run.mjs             # report + invariants (exit 1 if any fail)
node tooling/stats-sim/run.mjs --json      # machine-readable dump
node tooling/stats-sim/run.mjs --matrix    # add the full matchup matrix to the JSON
```

No dependencies, no build step, no npm workspace entry, and it imports nothing
from `packages/` — which is why it is the one piece of code workstream S is
allowed to write (module 76 §103.1).

## Layout

| Path | What it holds |
|---|---|
| `data/` | **the canonical numbers** — attributes, skills, curves, races, classes, gear, the D0–D5 ladder, worked enemies, magic, economy, build checkpoints |
| `src/model.mjs` | the design as arithmetic: curves, derived stats, gear resolution, the fight simulator, the progression simulator |
| `src/rules.mjs` | loads and resolves the rule and content sets (see below) |
| `src/campaign.mjs` | the whole-game simulation: rules × content, hour by hour |
| `src/sweeps.mjs` | the bulk parameter sweeps; each returns plain data and judges nothing |
| `src/invariants.mjs` | what must be true, with thresholds in one `THRESHOLDS` object |
| `run.mjs` | runs everything, prints the report, exits non-zero on a failure |
| [`FINDINGS.md`](FINDINGS.md) | the tuning history: every anomaly the sim found, its fix, and what is left open |

Rules of thumb: a **rule** goes in `model.mjs`, a **number** goes in `data/`, a
**judgement** goes in `invariants.mjs`. If you find yourself editing a constant
in a `.mjs` file, it belongs in `data/`.

## Rules × content, and the known-answer test

The campaign simulation takes **two** inputs, because they fail separately:

| | Ours | The reference |
|---|---|---|
| **rules** — how a use becomes a rank and a rank becomes a level | `data/rules-argonia.json` | `data/rules-morrowind.json` |
| **content** — how much of each verb an hour of play contains | `data/content-argonia.json` | `data/content-vvardenfell.json` |

This split exists because the model once reported a whole game finishing at
level 16–27 against Morrowind's 45–55, and dropping *Morrowind's own use values*
into it still produced level 4 at hour 19 — which is only diagnosable if you can
hold one input fixed and swap the other. The fault was the content model.

Anything in a rule set written `{"$from": "curves.levelUp.ranksPerLevel"}` is
**read out of `curves.json`**, which stays the canonical design-constants file.
A number lives in one place; the rule set says where it came from.

`morrowind-known-answer` runs **Morrowind's rules × Vvardenfell content** and
checks six published facts about TES III's pacing. **`rules-morrowind.json` is
known exactly and must never be tuned** — when that invariant goes red, the
error is in our engine or in `content-vvardenfell.json`, which is an estimate
and documents its reasoning rate by rate in its own `_` note. It is the standing
red light for anyone retuning our progression constants.

## The invariants

Deliberately **not listed here** — a hand-copied list goes stale (it has
before). `node tooling/stats-sim/run.mjs` prints every invariant by name with
its one-line evidence and exits non-zero if any fails; `src/invariants.mjs` is
the source of truth, with all thresholds in one `THRESHOLDS` object.

At **Phase 10c** these are ported as standing tests against the implemented
system and this harness is re-pointed at the game's own data files, so later
tuning and content authoring cannot silently break the balance envelope
(module 76 §104).

## Known simplifications (read before trusting a number)

- Fights are a resource-and-damage race with an `avoidance` parameter standing
  in for player skill (0.35 = ordinary play, 0.55 = a good player at a boss).
  Poise, stagger, backstabs, blocking, spacing and hit zones are **not**
  modelled — so the sim is pessimistic for stealth and shield builds.
- Bow damage is a stand-in for the real physical ballistics model
  (`combat/ballistics.ts`); arrow flight, penetration profiles and hit zones
  are collapsed into one number plus an armour-effectiveness factor.
- `data/gear.json` **mirrors** `packages/game-core/src/equipment` (materials,
  weapon classes, the one-handed moveset, armour slot ratings). It records the
  commit it was copied from; re-check it before trusting gear numbers, and
  delete it at 10c in favour of the real tables.
- The progression simulator advances the cheapest available skill each step,
  which is a reasonable average player but not any particular one.
