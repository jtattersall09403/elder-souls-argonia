# The round recipe: how a builder spends one round (owner 2026-09-27)

> A round is one batch of findings turned into one layout edit, one
> `wb round`, one reader pass. The builder is an orchestrator: it edits
> the layout itself and fans everything else out. Sequential rounds that
> find one defect each are forbidden (the walk-2 round of Claywater took
> five hour-long rounds this way). This file is the timetable; SKILL
> § How the builder works is the rule.

## Before the first edit (once per slice, ~10 min wall)

Run these **in parallel** (one `Workflow` or several `Agent` calls in
one message; the builder waits once):

| Lane | Agent | Does |
|---|---|---|
| scan | `run` | `wb.py scan` over the scan spec (every building's candidate poses, every landing bearing): ranked legal poses per building |
| kits | `run` per kit | any exterior kit rebuild the brief needs (a composite, a stand-in, a sink refresh): `kit-build` skill, one agent per kit; interior kits are already built by the batch's pre-pass |
| cells | `run` per cell | `export_interior_bundle` per tier A cell |
| mines | `run` | any designed-sink, mount or abuts sample re-mine the brief needs |
| promises | `find` | the promise ledger rows against the brief: which row lacks a `fills` target |

Only then write the layout edit, using the scan's top poses. A pose the
scan did not pass is never authored.

## The round (~15 min wall)

1. **Edit** the layout once for the whole batch (every reader NO, every
   `check` failure, every ruling), keeping every `uid`.
2. **`wb round <scene> <layout> --report-dir tooling/.reports/16k/<place>/round-N/`**
   (apply + check + compile + walktable + shots in one process;
   `--no-shots` for a proven type, or while a plan read that runs is not
   yet clean). Read `summary.json`, never the log. A re-check of a few
   ops is `check --only <uids>`: it re-measures the named ops' pairs
   only; the graph rules (`walkRule`, `pathReachRule`, `berthReachRule`)
   rerun in `wb round`, which is the round's last run.
3. **Readers as ONE Workflow, one wake:** one Sonnet reader per image
   (top, each front, isos, the special shots) inside a single `Workflow`
   script that returns one merged NO list, so the builder wakes once
   per round, not once per image. Readers get only the checklist rows
   tagged `reader` (a row tagged with a `check` or compile rule is
   measured, never read). The plan read is skipped when the compile
   gates are green; a render round is skipped entirely for a proven
   type unless the type sheet asks for a sampled one.
4. **Fix list → next round.** Group by cause; a cause that is a rule,
   tool or record gap under an existing decision is filed to the tooling
   sub-lane (a `deliver` sub-agent outside the round, recommend and do),
   and the round takes the rule at its next round, never writing it
   itself; a cause that needs an owner call goes to the packet.

## Never in a round

- A `--full` apply after a one-op change without a kit or ground change
  (whether the op cache beats `--full` on a warm run is unmeasured:
  method review r2 R1).
- A render before a plan read that runs is clean, or a second Blender
  launch for one shot (a closer shot joins the next round's launch).
- Running a kit build, a cell export, a mine or a test suite in the
  foreground while the layout could be edited.
- A report to the planner between rounds asking whether to do what the
  report recommends.
- One agent carrying more than one round of context: the round ends on
  disk and the next round starts a fresh agent from that folder alone.
  `tooling/.reports/16k/<place>/round-N/` holds `summary.json` and
  `rounds.jsonl` (`wb round` writes them into the place's current round
  folder by default), the scan output (never `/tmp`), the layout diff,
  the reader NOs, the fix list and `waiting-on.json` (`wb round
  --waiting-on TASK=RULE ...`: the tooling-lane task ids the round waits
  on, each with the rule it will add). Ops the owner called right on a
  walk carry `"ownerOk": "walk-N"`; changing one later needs a `cause`
  (the `ownerOkRule` check reads the layout at git HEAD).
- A validator test or rule written inside the slice: a record defect is
  filed to the tooling sub-lane with the failing record named, and
  design proceeds on the corrected record.

## Budget per round

Scan 1–2 min · edit 5 min · round 2–4 min (cached apply, parallel check,
one Blender launch) · readers 3 min in parallel · fix list 2 min. A
round over 25 min wall is a tooling defect to report with its timing.
