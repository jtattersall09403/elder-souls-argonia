# 16j — The rollout skill, proved on one unattended packet

**Goal.** Prove that the process the exemplars produced can be run by a
fresh agent without the owner: one small region packet (three to five
non-city places of types the exemplars covered) goes through skill v2 and
the kit QA skill end to end, then the owner walks it. Where the agent had to
decide something by hand that the fifth exemplar also decided by hand, that
is a gap in the skill and it is closed before the chunk ends. The packet
is **Phase 15's packet one** (decision 0062): **authored, not frozen**. It
ships to the studio like the exemplars and carries a typed list of what
Phase 15 still owes it — assembled interiors at its reserved doors (Phase
12), fauna, encounters and loot (13), navmesh and combat-space probes
(10b), balance against compiled numbers (10c), streaming budgets (14).
Phase 16 closes with this chunk; the next chunk in the queue is 9a, the
thin swim slice.

## Read

- README.md §3; `world/96` §3 (the automation-readiness checklist);
  `.claude/skills/settlement-build/SKILL.md` v2 and `.claude/skills/kit-qa/`;
  `docs/phases/README.md` § Phase 15; `docs/quests/90` §65b (the co-design loop, a
  completion gate per packet).

## Deliver

1. **Packet choice**: propose three candidate packets (region, places, types,
   why) from the 16g plot; pick the one whose types the exemplars covered
   (16i's type register). No major city and no opening-scene place (those
   are always owner-guided). **Dungeon-kind records are in the packet as
   places**: sited, promised (16g vocabulary), their entrance pieces built
   on the ground and their doors in the reserved state; no interior geometry.
   The packet's places are the **second exemplar of their type** for the
   automation checklist (96 §3) — one exemplar in 16i plus one here.
2. **Run the skill unattended** (a `deliver` subagent per place, against the
   frozen world; freeze, fan out, reconcile, apply, build once — the 96
   lesson). Record every hand decision.
3. **The co-design loop** for the packet: quest briefs drafted, placements
   reconciled, density budget declared.
4. **Close the gaps** found in step 2 in the skills, not in the places.
5. **Automation-readiness** checklist (96 §3) ticked per type with evidence;
   the agent-as-reviewer experiment run on one non-city place.
6. **Hand-off**: the **packet roadmap** (`docs/phases/15-rollout/roadmap.md`:
   ordered packets with rough scope and the types each needs, major cities
   and the opening-scene places flagged owner-guided) drafted for owner
   sign-off; the **packet brief template** (`docs/phases/15-rollout/packet-template.md`)
   written from what this packet actually needed; the trial packet's
   owed-to-15 list written; PROGRESS row 15 stays `todo` with the roadmap
   linked; the "chunk Phase 9" job is queued as the next owner instruction;
   Phase 16 closes.

## Acceptance

- The packet compiles, exports and walks with zero known-red rows owned by
  it; the checklist holds for every type in the packet; the owner's walk
  passes or the steers are rules.

## Owner check

- Walk the packet's places (URLs in the packet record): do they read as
  places of their kind, sited for a reason, reachable, with something to do?
- Did anything need you that the plan said would not?
- The packet roadmap: is the order right? Are the right places marked as
  yours to guide?
