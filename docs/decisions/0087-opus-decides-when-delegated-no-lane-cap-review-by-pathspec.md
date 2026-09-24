# 0087 — Opus decides what Fable or the owner delegates; no lane cap; the review gate reviews the commit's own files; workflow reports go to disk

**Date:** 2026-09-24. **Status:** accepted (owner rulings, given to the
planner during 16h part 1's fix round). Amends 0079 rule 15 and 0074 §1;
extends 0079 §8 (the review gate).

## What was decided

1. **Opus decides when the decision is delegated.** 0079 rule 15 ("Opus
   still never diagnoses, designs or decides") is relaxed: an Opus 5.5
   agent may design and decide within a brief that delegates those calls
   to it, in the owner's or the planner's words. Undelegated calls still
   stop and come back as a `Recommendations` section (rule 16). A lane
   may therefore be led by an Opus agent that runs its rounds, spawns its
   own `find`/`run`/`deliver` helpers, and reports summaries; Fable still
   writes the lane brief, judges the results and resolves clashes.
2. **No hard cap on lanes.** 0074 §1's "at most two lanes" is withdrawn.
   How many lanes run beside the main chunk is judged each time on
   safety (disjoint folders, no shared catalogue writers), memory (the
   12 GiB session cgroup; one heavy job at a time), and clash risk
   between lanes, never on a number.
3. **The review gate reviews the files of the commit being prepared.**
   `review_gate.py` and `preflight.mjs` take a pathspec; the review and
   the diff-size limit apply to those files only, and the stamp records
   the pathspec so one lane's review cannot mask another's. Every commit
   is still reviewed once; a lane no longer waits for another lane's
   commit. With no pathspec the gate behaves as before (whole tree).
4. **Workflow reports go to disk.** A workflow's completion notice is
   cut at a few KB. Every lane agent writes its full report to a per-run
   file and returns a summary of at most 25 lines; the script returns
   the file paths. (Owner 2026-09-24, after four truncated fan-outs.)
5. **Estimates are agent-time.** Lane sizing is stated in agent-hours,
   never days (restating the 2026-09-07 rule).

## Consequences

- `docs/phases/lanes/README.md` drops the cap and names the safety
  criteria; 0074 and 0079 gain a pointer to this record.
- The combat-sandbox lane and the stats-lab lane run beside 16h from
  2026-09-24 under Opus leads (briefs in `docs/phases/lanes/`).
- Everything a lane builds obeys the golden rules as written: anything
  the game needs lives in `packages/` from the start, designed to scale
  and to sit beside the systems the build-out will add, never boxed into
  the sandbox.
