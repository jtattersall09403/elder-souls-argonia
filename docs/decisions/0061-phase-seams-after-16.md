# 0061 — The seams after Phase 16: 12 is dungeons only, 15 runs as two passes, Phase 11's leftovers have homes

**Date:** 2026-09-12. **Owner:** accepted the recommendations in full
("happy to go with your recommendations and decisions on everything").

## Problem

Phase 16 pulled Phase 11's exemplars and "Phase 12's exemplar slice" into
16i and 16j, but the Phase 12 and Phase 15 plans were never re-cut:

- Phase 12 still listed portal/foundation data, the interior streaming
  contract and "one retained exemplar" — the things 16i now builds — while
  16i's brief said it would compile through "the Phase 12 grammar path",
  which does not exist.
- 16j "handed to Phase 15", but Phase 15 as written needed dungeons (12),
  navmesh (10b), compiled numbers (10c), fauna and loot (13) and locked
  budgets (14) in every packet, so it could not start for six phases.
- Phase 15 step 1 was "local hydrology/terrain refinement per packet",
  which the frozen world (0057/0059) forbids.
- Phase 11 was marked "absorbed into 16" but its grammars, D0 safe
  interiors, stronghold reservation and root-transit re-authoring were in
  no Phase 16 brief.
- The automation checklist (96 §3) required two exemplars per type; 16i
  supplies one per type, so the gate could never pass at 16j.

## Decision

1. **Phase 12 is the dungeon system only** (Xanmeer, cave/root/smuggler,
   underwater entrances, quest reservations, the stronghold interior).
   **16i builds the building-interior path** — portal + foundation records,
   the interior cell behind each shell from plugin data, the door
   transition, the interior load contract in `packages/` — and Phase 12
   plugs its dungeon portals into that one mechanism. Nothing is built
   twice.
2. **Phase 15 is two passes over one packet list.** **15A** (authoring:
   settlements and POIs, unfrozen) starts the moment 16j closes and runs
   alongside 12/9/10b/10c. **15B** (completion: dungeons, fauna, loot,
   probes, freeze) runs after 14 over the same packets in the same order.
   This is 0034's freeze-gate-not-start-gate rule applied to rollout.
3. **No packet touches terrain or water except through typed local patches
   that fail when they would move a level, a body or a channel** (0057 rule
   4). Phase 15's "local refinement" step is deleted.
4. **Phase 11's leftovers are homed**: travel services and the root-transit
   re-authoring in 16e; the stronghold reservation in 16g; the two
   settlement grammars and D0 safe interiors proven in 16i, per packet in
   15A; the co-design loop and the density budget in 16j and per 15A
   packet. The Phase 11 section of the phases README is now that table.
5. **The density budget is declared twice**: as sited records in 15A
   (dungeon, encounter and loot sites are reserved sites with typed
   obligations) and as built content at 15B freeze.
6. **The 16j trial-packet instance is the second exemplar of its type**
   for the automation checklist; a type with one exemplar stays
   owner-rounded until a 15A packet supplies its second.

## Consequences

- 16j drafts the 15A packet roadmap and writes the trial packet's
  owed-to-15B list; PROGRESS carries rows 15A and 15B.
- 10b's freeze-gate row now reads "probes run over the 16i exemplars, the
  12 exemplars and every 15A packet; freezing is 15B's act".
- 0034's per-packet step list is superseded by the 15A/15B lists in the
  phases README; 0057 §6 ("rollout is running that skill per packet") now
  means 15A.
- Files: docs/phases/README.md (Phase 11, 12, 15, §86.0, §86.0b, ID
  history), the 16e/16g/16i/16j briefs and the Phase 16 plan, world/96 §3,
  PROGRESS.md.
