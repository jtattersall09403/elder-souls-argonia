# 0086 — Kit work is four skills by job, written from the ledger rows by the agents who ran them, and cited back to their records

**Date:** 2026-09-24. **Status:** accepted (owner, on the planner's
recommendation, during 16h part 1's fix round). Extends 0079 (the planner
briefs, subagents execute) and the `settlement-build` skill; the
`routing-audit` skill gains one check.

## Why

The 16h part 1 fix round (ledger rows K6–K9, M13–M15) had three delivery
agents in a row re-learn the same kit invariants at an hour each, twice
with a wrong diagnosis: a kit rebuild keeps a stale interiors sidecar
until the three measurers run; a composite is composed at the scale the
plugin places it; a miner change means golden sample, fresh seed batch,
then one full run, then the manifest refresh. A skill turns each of those
into a procedure an agent follows in minutes. The owner asked whether the
cut should be per kit type (a wall-kit skill); it is not: walls, fences,
docks, boardwalks and bridges are all chains of abutting pieces and
follow one set of rules.

## What was decided

1. **Four skills by job**, under `.claude/skills/`, each under ~150
   lines, each a procedure that points at the record it realises rather
   than restating the rule:
   - `kit-build`: config to published kit. Build, the three measurers
     (footprints, interiors index, connectors), compress, manifest
     refresh, the collider gate; when a rebuild is needed and what goes
     stale if a step is skipped.
   - `kit-mining`: the sink, mount and abuts miners as one protocol.
     Golden fixture with expectations written first, a fresh seed batch,
     the one full run, the refresh, the memory limits, how to read the
     evidence fields, what counts as a wrong expectation.
   - `composite-author`: compose as the plugin places it. Templates,
     anchor and part scales, entrance derivation, the door agreement
     test, which kits to rebuild after.
   - `modular-runs`: chains of abutting pieces. Family pairs, end pieces,
     the `pieces` list on a parcel, open-end flags; walls, fences, docks,
     boardwalks and bridges alike.
2. **`settlement-build` is the umbrella.** It routes to the four and
   keeps the owner-walk packet itself (the coordinate table, every item
   listed every time, the publish steps). No skill is written finer than
   these four until 16i shows a job none of them covers.
3. **Written from the ledger by the agent that ran the job.** Each skill
   is authored at the close of the round that proved its procedure, from
   the ledger rows of that round, by a delivery agent that has those rows
   in front of it; never from memory of how it ought to work.
4. **Cited and audited.** Every skill's header names the ledger rows and
   decision records it was written against. The `routing-audit` skill
   checks those citations at every phase start and reports a skill whose
   cited record has moved as a stale claim, so a skill cannot drift
   silently from the record.

## Consequences

- 16h part 1 step (e) gains a step before preflight: write the four
  skills from rows K6–K9 and M13–M15, then route `settlement-build` to
  them and add the citation check to `routing-audit`.
- A brief may say "use the `kit-build` skill" instead of restating its
  steps (0079: the planner's brief stays small).
- A skill that restates a rule instead of citing it is a defect
  (standard 12: prose written against the record it describes).
