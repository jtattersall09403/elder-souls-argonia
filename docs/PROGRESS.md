# Build progress

Single source of truth for where we are in the build sequence
([world-gen-master-plan.md](world-gen-master-plan.md) §86). Read this file first,
then open only the master-plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Before anything
   else, run `git status` — a dirty tree means a previous agent stopped mid-work.
2. **Starting work:** set the phase row to `in progress` with a one-line current
   task, and commit that change before the work itself.
3. **Work in small commits.** Every commit should leave `npm test` and
   `npm run typecheck` green from the repo root.
4. **Finishing a milestone:** flip the row to `done` with one line of evidence,
   in the same commit as the finishing work.
5. **Crash recovery:** if a row says `in progress` but no agent is running, use
   `git status`, `git log -5` and the gates to decide whether to finish, redo or
   revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** Detail belongs in `docs/decisions/` or
   phase docs, not here. Prune rows for long-finished phases into one line each.

## Status

| Milestone (plan §86) | Status | Evidence / current task |
|---|---|---|
| 0 — source, era, credits foundation | done | decisions 0001–0004; CREDITS.md; plan revised & renamed |
| 1a — monorepo migration, CI, deployed sandbox | done | owner playtest PASS 2026-08-22; gates green from root; Pages live |
| 1b — package boundaries and contracts | done | packages/contracts + apps/game shell + apps/world-studio; inventory/items extraction deferred to Phase 7 (plan §86) |
| 2 — province source ingest | in progress | heightfield extracted (0005); owner review done: mild conditioning + sea level 0 chosen, anchors corrected & terrain-verified, southern corridor registered; remaining: owner re-check of moved anchors, map overlay registration |
| 3 — province hydrology and region graph | todo | |
| 4 — danger, cultures, transport | todo | |
| 5 — World Studio foundation | todo | |
| 6 — reference watershed terrain | todo | |
| 7 — physical character integration | todo | |
| 8 — water renderer and interaction | todo | |
| 9 — swimming, climbing, boats | todo | |
| 10 — asset catalogue and kits | todo | |
| 11 — causal locations and settlements | todo | |
| 12 — dungeons and interiors | todo | |
| 13 — ecology, encounters, fixed loot | todo | |
| 14 — streaming and deployment | todo | |
| 15 — expansion by watershed | todo | |

## Waiting on user

- Re-check of corrected anchor positions + southern corridor at
  https://jtattersall09403.github.io/elder-souls-argonia/studio/ (Phase 2 gate,
  round 2).

## Next up

Owner re-check → finish Phase 2 (map overlay registration) → Phase 3 hydrology.
Phase 3 opens with the one remaining owner decision in 0005: the horizontal
rescale factor (conditioning + sea level now decided).
