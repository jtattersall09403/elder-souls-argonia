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
| `src/sweeps.mjs` | the bulk parameter sweeps; each returns plain data and judges nothing |
| `src/invariants.mjs` | what must be true, with thresholds in one `THRESHOLDS` object |
| `run.mjs` | runs everything, prints the report, exits non-zero on a failure |

Rules of thumb: a **rule** goes in `model.mjs`, a **number** goes in `data/`, a
**judgement** goes in `invariants.mjs`. If you find yourself editing a constant
in a `.mjs` file, it belongs in `data/`.

## The invariants (13)

reference-equivalence · d5-overmatches-a-beginner · band-is-fair-for-its-build ·
overmatch-is-lethal · armour-never-trivialises · no-deferral-advantage ·
affordability-band · every-build-can-finish · breath-margins ·
crafting-loops-are-bounded · soft-requirements-never-block ·
healing-costs-but-pays · vastei-farming-is-throttled.

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
