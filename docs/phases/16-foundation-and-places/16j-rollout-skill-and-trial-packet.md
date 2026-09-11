# 16j — The rollout skill, proved on one unattended packet

**Goal.** Prove that the process the exemplars produced can be run by a
fresh agent without the owner: one small region packet (three to five
non-city places of types the exemplars covered) goes through skill v2 and
the kit QA skill end to end, then the owner walks it. Where the agent had to
decide something by hand that the fifth exemplar also decided by hand, that
is a gap in the skill and it is closed before the chunk ends. Phase 15
starts from the result.

## Read

- README.md §3; `world/96` §3 (the automation-readiness checklist);
  `.claude/skills/settlement-build/SKILL.md` v2 and `.claude/skills/kit-qa/`;
  `world/95` § Phase 15; `docs/quests/90` §65b (the co-design loop, a
  completion gate per packet).

## Deliver

1. **Packet choice**: propose three candidate packets (region, places, types,
   why) from the 16g plot; pick the one whose types the exemplars covered.
2. **Run the skill unattended** (a `deliver` subagent per place, against the
   frozen world; freeze, fan out, reconcile, apply, build once — the 96
   lesson). Record every hand decision.
3. **The co-design loop** for the packet: quest briefs drafted, placements
   reconciled, density budget declared.
4. **Close the gaps** found in step 2 in the skills, not in the places.
5. **Automation-readiness** checklist (96 §3) ticked per type with evidence;
   the agent-as-reviewer experiment run on one non-city place.
6. **Hand-off**: PROGRESS Phase 15 row opens with the packet roadmap draft;
   Phase 16 closes.

## Acceptance

- The packet compiles, exports and walks with zero known-red rows owned by
  it; the checklist holds for every type in the packet; the owner's walk
  passes or the steers are rules.

## Owner check

- Walk the packet's places (URLs in the packet record): do they read as
  places of their kind, sited for a reason, reachable, with something to do?
- Did anything need you that the plan said would not?
