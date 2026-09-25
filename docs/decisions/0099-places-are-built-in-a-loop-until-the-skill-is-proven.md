# 0099 — Places are built in a loop, one real place at a time, until the place skill is proven per type; the loop replaces 16h part 2, 16i and 16j

**Date:** 2026-09-25. **Status:** accepted (owner rulings 2026-09-25, on
the planner's place audit and time audit). Supersedes the flow of
[0081](0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md)
decision 1 from 16h part 2 on (16h part 1, the proving ground, the door
model and the three patch kinds stand). Keeps the 0062 queue after
Phase 16. Brief: [16k](../phases/16-foundation-and-places/16k-place-loop.md).

## What the owner asked

After 66.8 h of wall clock on 16h part 1 and a planner proposal to go
faster, the owner ruled: the remaining place work is a loop on real
places, not three more chunks; every owner defect becomes a rule, a gate
and a skill improvement; the owner walks each place until it looks
right before the next one starts; breadth bars are set now from the
research; the workbench designs places in 2D and 3D; minor types may
become templates in Phase 15; and the whole thing is fast without cutting
quality.

## Evidence

- Time audit (`tooling/.reports/audit/time-audit-2026-09-25.md`): 16h
  part 1 open 66.8 h, ~21 h of it planner-active, ~35 h owner-away gaps
  with nothing queued; 21 agent-hours of lane leads sleeping on builders
  (the builders were slow: preflight 5.0–9.5 min, `test:placement`
  3.5 min, `test:pipeline` 2.8 min, full kit-sheet renders 24–28 min then
  superseded); 106 headless reviewer sessions; 16 mounts-miner rule rounds
  before the sample-first stop held (M14 on).
- Place audit (`tooling/.reports/plan/place-audit.md`): every
  place-completeness row is covered somewhere, but the only scheduled
  place work is 16h items 10–38 and 16i; six rows are prose or research
  only (enclosure rule, crops, boats pulled up, wet/worn ground, cook fire
  and forge glow, the place read from a distance); occupants and ambience
  wait for 12b/13.
- Variety: [0098](0098-variety-is-measured-per-settlement-not-by-a-template-cap.md)
  sets per-settlement building bars and world 97 (:130–134) sets
  between-place spacing, but variety inside a place beyond buildings
  (yard, ground, lights, enclosure) has no number, the culture grammars
  (97 Part F) are prose, and
  `docs/research/placement-settlements/building-depth-and-variety.md` §5
  (:185–188) still states the retired 25 % template cap.
- Workbench: yard B (18 placements) was authored, checked and published
  in ~80 min of agent time; 8 compile refusals, 2 sills and a 19.8 m quay
  slide were caught before publish, where check-in 2's defects surfaced
  after it (`docs/phases/lanes/placement-workbench-lane.md` :63–78, round-4
  recommendation: author every hand-built place in the workbench).

## Decisions

1. **The remaining place work is a loop, not phases.** 16h part 1 closes
   with the check-in 3 fix round (its lanes resume from their
   transcripts through `lane_resume.py --packet`). 16h part 2, 16i and
   16j are superseded by the loop (chunk **16k**). Their still-needed
   items are carried into 16k's backlog under their original numbers:
   ground paint first (16h:319, :521), the base height-blend (seam)
   shader (16h item 25), man-made lighting / sconces (item 22), a terrain
   patch for dug-in pieces (16h open item 0c), the dressing-add patch
   (item 15), the interior camera (item 24), the Blackrose city pass,
   tier A interiors (16i items 4–5), and every other open item of 16h
   10–38, 16i 0–13 and 16j 1–9. Nothing is deleted; the three briefs stay
   as the item text.
2. **The unit is one real place (a slice).** Inside a slice: the agent
   runs the place skill unattended on the frozen world → the automatic
   gates → **the owner walks it** → every defect becomes a rule, a
   test/gate and a skill improvement in ONE fix round (causes grouped
   across all defects, one preflight, one republish) → **the owner walks
   again** → repeat until the owner says it looks right. Only then the
   next slice: a fresh place of a different type in a contrasting region.
   The owner is in the loop at the walk, at the type list and exit bar,
   and at world-level decisions; nowhere else.
3. **Exit bar.** The loop ends when, for each place type on the owner's
   signed list, a fresh place passes unattended with no defect from the
   walk, **two in a row per type**. Phase 15 then rolls out with the
   proven skill set. Phase 15 may use **templates** for minor place types
   (camps, small holds, waystations): one designed instance varied per
   placement rather than fully authored each time. The loop decides when
   a type is template-able (a type whose two passing places differed only
   along the template's variation axes).
4. **Breadth is set now, hit later.** Skyrim-like breadth bars are set
   now from the research (`building-asset-breadth.md`,
   `building-depth-and-variety.md`, 0098) as numbers the skill reads.
   Places built in the loop are varied inside themselves and between one
   another, grounded in lore and culture, within what the pools allow;
   the full bars are met only after Phase 15. The variety record to
   improve is 0098 plus world 97 Part F: it gains a number for variety
   inside a place beyond buildings (yard, ground, lights, enclosure) and
   the culture grammars become checkable rows; building-depth §5 is
   brought in line with 0098 in the same edit.
5. **The place skill designs in 2D and in 3D.** 2D: a blueprint plan
   (render_blueprint.py extended per 16h item 19), checked by a Sonnet
   image reader and the QA tooling. 3D: the placement workbench (Blender,
   [0097](0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md)),
   per the workbench round-4 recommendation. The designer reads the
   register of every other place (the 16g catalogue, the promises, the
   macro plot and the places already built in the loop) so no place is a
   duplicate or samey.
6. **"Good enough" is the place-completeness checklist** (16k § The
   checklist, the audit's table with its coverage column). Rows marked
   essential-before-rollout are gates in the loop. People and animals
   enter the loop early as **idle occupants** (a thin occupant pass: the
   right people and animals standing, sitting and working in the place);
   movement AI stays with 10b and 13.
7. **The yard is the regression fixture.** Proving grounds A and B are
   never walked again; every owner defect found there is an automatic
   gate on them.
8. **Speed rules** (from the time audit):
   - no whole-catalogue re-run, ever, before a fresh sample batch passes
     (0079, CLAUDE.md "Prove on a sample");
   - preflight scoped to the paths touched (`--paths`); the full run once
     before a merge;
   - code review ONCE per logical change on the whole diff, **docs
     included** (docs carry decisions, schedules and rulings, so a
     docs-only diff is reviewed too); a second pass on the fixed hunks
     only; never a third;
   - builders are made fast (scoped gates, sampled mines, cached kit
     builds, faster `test:placement` and `test:pipeline`) rather than
     polled: the 21 agent-hours of sleeping measured slow builders, and
     banning `sleep` treats the symptom; leads wait on the hand-back;
   - heavy jobs go through `job_guard.sh`, at most floor(nproc/2) heavy
     lanes at once;
   - every check-in packet is followed by the work the walk cannot change
     (the next slice's research, sourcing and 2D register reads, tooling
     speed-ups), never an idle wait.
9. **Parked lanes with automatic pickup.** Combat round 8 and weapons
   round 2 are named inputs of Phase 10b (sandbox parity); the stats-lab
   owner test runs at the start of Phase 10c; breadth research continues
   as a cheap read-only lane beside the loop. The pickup lines are in the
   10b and 10c sections of `docs/phases/README.md` and in each lane doc's
   status line.

## Consequences

- The Phase 16 ladder ends 16a–16g, 16h (part 1), 16k. The 0062 queue
  after Phase 16 is unchanged: 9 → 10b → 10c → 13 → 12 → 12b → 14 → 15.
- 16j's hand-off (the Phase 15 roadmap, packet template and the
  `--places` selectors) moves to the loop's exit.
- `docs/phases/15-rollout/README.md` still describes the 16j rhythm; the
  loop's exit rewrites it.

## Addendum 2026-09-25 (16k hand-off rulings 1–4, 6)

- **The five Phase 11 exemplars are dropped** (ruling 4). Deleted with
  their folder: `world/sources/blueprints/retired/` (README.md and
  `place.dunmer-north.mazzatun`, `place.hist-heartland.nine-trunks`,
  `place.hist-heartland.sap-tapping-licensed`,
  `place.mercantile-coast.lilmoth`, `place.naga-kur-deeps.wamasu-pond-adult`,
  each `.json` and `.md`). Their types keep the committed built-ground
  footprints through `author_type_siting.CARRIED_BUILT_GROUND_M` (the measured radii), so
  the frozen plot does not move. The site dossiers stay: they are ground
  evidence, not layouts. Lilmoth returns as the owner-guided whole-city
  slice (type 8).
- **Type list, exit bar and Gate column signed** (rulings 1–3): type 8 is a
  whole city; type 9 "early-game location (owner-guided)" added; the four
  system rows (occupants, navmesh, interiors, ambience) gate on the socket
  as data, so decision 6's idle-occupant pass is withdrawn: no occupant
  pass runs in the loop. Detail in the 16k brief.
- **First place Claywater Station** (ruling 6); slice 2 is chosen at slice
  1's close by the contrast rule (0100 Consequences).
