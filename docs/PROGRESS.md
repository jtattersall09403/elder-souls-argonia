# Build progress

Single source of truth for where we are in the build sequence
([docs/phases/README.md](phases/README.md) §86). Read this file first, then
open only the plan sections the active phase needs.

## Protocol (all agents)

1. **Trust the repo over this file.** Before building on a phase marked done,
   spot-check its evidence (run the gates, check `git log`). Run `git status`
   first: a dirty tree means a previous agent stopped mid-work or another
   agent is working now (commit by pathspec; never revert their files).
2. **Starting work:** in one commit *before* the work itself, set the row to
   `in progress` with a one-line current task and rewrite *Waiting on user*
   to match. The first `todo` row in the queue is what is next; there is no
   separate "next up" section.
3. **Work in small commits.** `npm run preflight` once before each commit.
4. **Finishing a milestone:** flip the row to `done` with one line of
   evidence, in the same commit as the finishing work, and refresh
   *Waiting on user*.
5. **Crash recovery:** if a row says `in progress` and no agent is running,
   use `git status`, `git log -5` and the gates to decide whether to finish,
   redo or revert the partial work; then correct this file.
6. **Keep this file under ~80 lines.** One line per row. Handoffs, evidence
   and round narratives live in `docs/decisions/`, the phase folders and
   `docs/research/`; link them, never paste them.

## Status (execution order; decision 0062 fixed the queue on 2026-09-13)

| Milestone | Status | Evidence / current task |
|---|---|---|
| 0–8c — sources, monorepo, province, hydrology, society, studio, terrain, character, light, water, weather | done | decisions 0001–0032; phases README §86.1; water and weather closed "good enough" (0025, 0032) |
| L, N, T, S, C — lore, quest review, text, stats design, combat workstreams | done | 0018/0026/0030 (N), 0043 (T), 0031–0037 (S), 0040/0054–0056 (C: 20 built bodies, female review sheets and the armour collar sheet still open for the owner's look) |
| 10 — asset deep catalogue, kits, vegetation machinery | done | owner CLOSED 2026-09-04; [0036](decisions/0036-phase10-placement-decisions.md); density ladder [0048](decisions/0048-vegetation-density-ladder.md) |
| 11 — settlement/location system | absorbed into 16 (0057, 0061) | where each deliverable went: phases README § Phase 11; history [0041](decisions/0041-phase11-settlement-decisions.md) |
| **16 — frozen foundation and place ladder** | **in progress: 16a accepted 2026-09-11; 16b round 2 delivered 2026-09-12 (0060); 16c round 2 delivered 2026-09-14 ([0064](decisions/0064-waterfalls-are-the-vanilla-kit.md) falls, [0065](decisions/0065-the-compile-realises-the-graphs-classification.md) the graph is the classification; [round-2 ledger](research/phase16/16c-round-2-ledger.md)), owner walk pending; **16d in progress since 2026-09-15** (brief rewritten on a measured 1:1 registration of the Tamriel map; ladder fix, reader+purge, apron data, runtime, water-beyond-border)** | [plan](phases/16-foundation-and-places/README.md); 16a [0058](decisions/0058-the-hydrology-graph-is-the-water-record.md); 16b [0059](decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md), [0060](decisions/0060-rivers-reach-the-coast-profiles-are-graded.md), [ledger](research/phase16/16b-terrain-once-ledger.md); then 16c water · 16d apron · 16e routes/ferries · 16f vegetation (+ submerged band) · 16g plot (+ promise vocabulary) · 16h runtime + kit QA · 16i exemplars (tier A interiors) · 16j rollout skill + trial packet |
| 9 — swimming, climbing, boats (movement only) | todo | chunks 9a thin swim (first after 16j), 9b boats, 9c climb; briefs written by the "chunk Phase 9" job at 16j close (0062) |
| 10b — sandbox parity in the studio + the renderer extraction | todo | scene orchestration and `packages/world-render` extracted in one pass (0062); navmesh chunk may run as soon as 16h lands; shared-internals fixes per the owner's kickoff list (0017) |
| 10c — stats and progression implementation | todo | implements workstream S in `packages/game-core` incl. the semantic compiler (0019); chunk briefs written at 10b close |
| 13 — fauna ecology, encounters, fixed loot | todo | data-model chunk written now; the rest at 10c close (0062) |
| 12 — interiors: research, the furnishing mine, the skill proved on exemplars | todo | every assembled interior (dungeons and tier B buildings) against the promises 16g/16j/15 author with the places (0062); research chunk written first |
| 12b — province soundscape | todo | after 12 and 13, before 14 locks budgets (0023, 0034); supporting chunks may fill the P window |
| P — general polish pass (rolling) | in progress | [backlog](phases/P-polish/backlog.md); the terrain/water/vegetation/route/settlement rows were absorbed into 16 (0057) |
| 14 — streaming and deployment (budgets, chunk format, impostor audit) | todo | the renderer extraction moved to 10b (0062) |
| 15 — rollout by region packet, one pass per packet | todo | opens from the roadmap 16j drafts (`docs/phases/15-rollout/`); the 16j trial packet is packet one; major cities and the opening-scene places are owner-guided (0062) |

## Waiting on user

- **16d** is being delivered; nothing to check until its owner check is posted.
- **16c round 2** ([0065](decisions/0065-the-compile-realises-the-graphs-classification.md),
  [round-2 ledger](research/phase16/16c-round-2-ledger.md)): walk the round-2
  owner check (the list in the [brief](phases/16-foundation-and-places/16c-water-once.md)),
  and say whether the 96 levee patches (76 river banks, 20 body rims) and the
  5 bed-cuts are accepted; then
  `deliver 16d`.
- **16b round 2** ([0060](decisions/0060-rivers-reach-the-coast-profiles-are-graded.md),
  [ledger §9](research/phase16/16b-terrain-once-ledger.md)): the listed water
  departures still want a principle or rows sent back.
- **Female characters and armour** ([0054](decisions/0054-sex-is-an-axis-not-a-second-set-of-races.md),
  [0056](decisions/0056-armour-is-blended-to-the-wearer-not-deformed-to-fit.md)):
  the two female sheets in `docs/evidence/races/`, the picker's two open calls
  (keep race on sex flip? faces or names in the grid?), the eighteen collar
  cards in `armour-neck-check.png`.
- **Earlier rounds still open for a look, none blocking:** weapon reach and
  the FaceGen races (0040); the water round-2 evidence ledger
  ([archive](research/archive/water-round-2-2026-09/water-round2-evidence.md));
  the 6b terrain-feel re-check bundled into the 8b close; the 8c leftovers the
  owner records in the backlog. The 2026-09-09 walkthrough of the deployed
  province is archived at
  [research/archive/phase11-rounds/walkthrough-2026-09-09.md](research/archive/phase11-rounds/walkthrough-2026-09-09.md);
  its settlement findings are the 16h work.
