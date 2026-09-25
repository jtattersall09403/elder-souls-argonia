# 16j — The rollout skill, proved on one packet without the owner

> **SUPERSEDED 2026-09-25** by the place loop (decision
> [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md),
> brief [16k](16k-place-loop.md)): the skill is proved per place type,
> two unattended passes in a row, instead of on one packet. The items
> below (co-design pass, gap closing, automation readiness, `--places`
> selectors, the Phase 15 roadmap and template) are 16k's carried
> backlog by number. Do not run `deliver 16j`.

**Goal.** Prove that the recipe the exemplars produced can be run by a
fresh agent with no owner in the loop: one small region packet (three to
six non-city places of types the exemplars covered, its dungeon-kind
places included, its route structures and ferry berths included) goes
through `settlement-build` v2 and `kit-qa` end to end, plans first, then
built once, then walked by the owner. Every decision the agent had to
make by hand that the sixth exemplar also made by hand is a gap in the
skill and is closed in the skill before the chunk ends. The packet is
**Phase 15's packet one** (decision 0062): authored here, completed in
Phase 15 with the systems that do not exist yet. Phase 16 closes with
this chunk; the next chunk in the queue is 9a, the thin swim slice.

**Delivered in two parts, one fresh agent each, an owner check-in after
each** (owner 2026-09-20): `deliver 16j part 1`, `deliver 16j part 2`.
A part may span more than one session; the check-in happens once, at the
end of the part. Revise this brief from the 16i ledger before part 1
starts: the parts and the check-ins stay; the numbers and the gap list
will move.

## How this chunk fits

16h built the tools, 16i built six places with them by hand and wrote
the recipe. This chunk runs the recipe unattended on a region and
measures where it still needed a hand. Phase 15 then runs the same
recipe, one packet at a time, once every later system (interiors,
fauna, navmesh, balance, budgets) exists to fill the slots each packet
leaves open.

## Starting state (written 2026-09-13; the closing 16i agent REPLACES this section from the 16i ledger's ending state before "deliver 16j part 1" runs)

- Everything this chunk consumes is produced by 16h and 16i. If their
  PROGRESS rows are not `done`, stop.
- `docs/phases/15-rollout/` holds only a README sketch (planner
  2026-09-20); this chunk writes `roadmap.md` and `packet-template.md`
  there.
- The checklist you tick is world 96 §3, six boxes per place type; box 1
  counts the 16i exemplar plus your packet instance (0061 §6, which 0062
  did not supersede).
- The type register is 16i item 13 (`type-recipes.json`): six exemplars
  with their types and the grammar each proved. If it was not written,
  the packet choice has no basis and that is 16i's gap.
- The chain ladder rows `[16h]` and `[16i]` are confirmed and
  `DELIVERED_THROUGH="16i"`; a `[16j]` row exists, empty. Confirm before
  you publish, or your packet ships onto older ground.
- Dungeon-kind records (327 of 580) carry typed promises (16g, world 70
  §48) and `place_obligations` projects them; entrance pieces and door
  records are 16h's renderable kinds; reuse them, never a second
  vocabulary. Route structures and berths outside the 16h exemplar set
  are `pending: packet` in the export (55 structures; the count still
  pending is in the 16h ledger).
- **Phase 15 is one pass** (0062); 0061's two-pass split is retired.
- The placement suite being green is not evidence the packet is right;
  the evidence is the record of hand decisions in part 2.
- Major cities and the opening-scene places carry `ownerGuided: true`
  (16g) and every skill refuses an unattended run on them.

## Read (fresh agent: this is your whole map)

- This brief in full; the [16i brief](16i-exemplars-end-to-end.md)
  § The story and § What 16i needs from 16h (the contract you inherit
  twice over); the 16i ledger (`docs/research/phase16/16i-ledger.md`,
  written when 16i closes) § Ending state and § Hand decisions.
- The plan [README](README.md) §3, §7 ruling 11 (the density budget is
  a Phase 15 completion gate, not yours), §8.
- Decisions [0062](../../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md),
  [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md),
  [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md),
  [0078](../../decisions/0078-places-adapt-to-the-frozen-world.md).
- `.claude/skills/settlement-build/SKILL.md` v2 and `.claude/skills/kit-qa/SKILL.md`
  in full: you run them, you do not redesign them until part 2.
- [world/96](../../world/96-placement-playbook.md) §3 (the
  automation-readiness checklist), [world/97](../../world/97-placement-principles.md)
  Part A (province → place: what a packet is judged on) and Part E.
- [docs/phases/README.md](../../phases/README.md) § Phase 15;
  [docs/phases/15-rollout/README.md](../15-rollout/README.md) (the
  packet rhythm you are the first instance of);
  [docs/quests/90-production-sequence.md](../../quests/90-production-sequence.md)
  §65b (the co-design loop, a completion gate per packet);
  [docs/quests/20-world-provisions.md](../../quests/20-world-provisions.md)
  for the packet's places; [docs/quests/25-quest-place-map.md](../../quests/25-quest-place-map.md).
- `world/sources/catalogue/type-recipes.json`, `world/sources/sites/design-groups.json`,
  the region dossiers in `world/sources/lore/` for the candidate regions,
  `world/sources/routes/route-structures.json` and `travel-services.json`
  (what the packet must stand up).

## Visual ingestion

The `kit-qa` protocol (16h brief § Visual ingestion), used by the skill
on every assembly, plan and interior sheet the packet produces. In an
unattended run the Sonnet reports are the reviewer. Fable reads a report
only where the skill's rules flag its sheet. Record every report in the
ledger.

## Record reads (decision 0066)

The unattended run is where the class would come back silently: a
`deliver` subagent that cannot find a value in the record will re-derive
one. Skill v2 and the packet template therefore name, per field, the record
that supplies it (graph id, `water-meta` id, route line,
`designedSinkM`, plugin link). The packet's acceptance runs every
chunk's provenance gate (16e, 16f, 16g, 16h) over the packet's places;
`test_record_reads` must be green with an empty allowlist before the
unattended run starts. A hand decision that turned out to be a missing
record field is closed in the record's schema, not in the skill's prose.

## Deliver

### Part 1 — the packet chosen and planned by the skill, unattended (to owner check-in 1)

Nothing in part 1 touches the ground, the vegetation or the published
bundles.

1. **Packet candidates.** Propose three candidate packets from the 16g
   plot (region, places, types, route structures and berths in it, why),
   each: no `ownerGuided` record; every place type has an exemplar in
   the type register; three to six places including at least one
   dungeon-kind record whose family has a recipe and a kit; its `pending:
   packet` route structures and berths listed. Pick one by the checklist
   coverage it gives (most types get their second exemplar) and record
   the reasoning; the owner may swap at check-in 1.

2. **The co-design loop, world draft first** (quests 90 §65b). The
   packet's settlement set, routes and POI skeleton are already the 16g
   record; the quest-brief pass drafts the region's local quests to
   brief level only (premise, cast, choice, size, provision list) and may
   request placements; reconcile: place what the briefs request or
   negotiate substitutes, register sockets and ids; declare the packet's
   density against ruling 11's budget. Prose through `text-review`.

3. **Run skill v2 unattended, plans first.** One `deliver` subagent per
   place, each running the skill's plan steps exactly as written against
   the frozen world (records, derive loop, dry-run compile, `kit-qa` on
   every assembly, the interior claim per door by the skill's rule, the
   plan sheet); the packet's route structures and berths through 16h's
   renderable kinds; **every hand decision recorded** in the ledger's
   § Hand decisions with the field it needed and the skill step that
   produced it. Fable makes no design call here. Where a lane stops on a
   decision the skill does not make, that stop is the finding; Fable
   makes the call only to keep the lane moving and logs it as a gap.

4. **The check-in 1 packet.** The three candidates and the pick; the
   plan sheet per place with its interior table; the packet's route
   structures on their sheets; the quest briefs in one paragraph each;
   the hand-decision list so far; the 2D map.

### Part 2 — built once, walked, the gaps closed, the roadmap (to owner check-in 2)

5. **Apply the owner's steers** as record edits; each generalising steer
   becomes a rule (taste ledger, 97, `blueprint_integration`), never a
   one-off. Build once: patches applied locally, compile, export, interior
   bundles for tier A and fit-rule doors, publish, ground control; the
   `[16j]` ladder row confirmed, `DELIVERED_THROUGH="16j"`; one chain run
   from the freeze gate; probes green per place; every `pending: packet`
   structure and berth in the packet placed (a packet that leaves one
   pending fails its gate).

6. **Close the gaps in the skills, not in the places.** Every hand
   decision in the ledger is either a skill step (written into v2, with
   the rule that makes it), a record field (added to the schema and
   back-filled for the six exemplars and this packet) or an owner call
   (listed for check-in 2 with the options). Re-run the changed steps on
   the packet to show the skill now makes the decision.

7. **Automation readiness.** World 96 §3 ticked per type in the packet
   with evidence (the two exemplars named, the rules named, the clean
   compile from the blueprint alone, the recipe's siting grammar, the
   sourcing register clean); the agent-as-reviewer experiment (0041) run
   on one non-city place of the packet: a fresh agent walks the Sonnet
   sheets and the probes and gives a verdict before the owner does; the
   two verdicts are compared in the ledger.

7b. **Place-scoped tooling before Phase 15.** `rederive_blueprints`,
   `export_settlement_bundle`, `apply_vegetation_patches` and
   `settlement_ground_control` each gain a `--places` / changed-set
   selector, so a packet re-derives, exports, patches and paints only its
   own place ids; the full run happens only at freeze. Today each walks
   every blueprint or patch, so packet N would redo packets 1 to N
   ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) note 2). Test: a run with `--places` on one place leaves
   every other place's output byte-identical.

8. **The hand-off to Phase 15.** `docs/phases/15-rollout/roadmap.md`:
   every remaining packet in order with rough scope, region, place count,
   the types each needs and which have two exemplars, the route
   structures and berths each owes, major cities and the opening-scene
   places flagged owner-guided, drafted for owner sign-off at check-in 2;
   `docs/phases/15-rollout/packet-template.md` written from what this
   packet actually needed (the two parts, the check-ins, the skill calls,
   the owed-to-later-phases list, and that every per-packet stage runs
   with the item 7b `--places` selector, full runs only at freeze; the
   four Argonian village forms from King of the Murkmire's spacing enter
   `type-recipes.json` as bands with `sources` naming the KotM set:
   mud compound, platform stilt, Hist-centred, dock hamlet,
   [KotM plan](../../research/placement-settlements/king-of-the-murkmire-adoption-plan.md) § 2, § 3.3); the trial packet's **owed list**
   (assembled interiors at its reserved doors: 12; fauna, encounters,
   loot: 13; navmesh and combat-space probes: 10b; balance: 10c;
   streaming budgets: 14) as a typed record on the packet; the
   `15-rollout/README.md` sketch reconciled with the template.

9. **Phase 16 closes.** The ledger `docs/research/phase16/16j-ledger.md`;
   one decision record (the packet, the gaps closed, the readiness
   verdict per type); the "chunk Phase 9" job queued as the next owner
   instruction in PROGRESS.md (0062 §10: the 9a/9b/9c briefs are written
   by that job, not here); PROGRESS row 16 `done` with evidence and row
   15 `todo` with the roadmap linked; the Phase 16 README §4 table
   completed; `docs:check`, preflight, commit by pathspec. Run the
   `routing-audit` skill over the whole Phase 16 routed set at the close
   (docs/README.md § Where to record).

## Moved out of this chunk (recorded, not parked)

- Completing the packet: Phase 15, when the owed systems exist.
- Every other packet: Phase 15 from the roadmap.
- The Phase 9 briefs: the "chunk Phase 9" job.

## Acceptance

- The packet compiles, exports and walks with zero known-red rows owned
  by it; every `pending: packet` structure and berth in it placed; every
  door claimed or reserved with evidence; the hand-decision list closed
  (skill step, schema field or owner call, none left "noted"); the
  checklist holds for every type in the packet or says which box is open
  and why; the roadmap and template exist; the owner's walk passes or
  the steers are rules; two owner check-ins passed or accepted as good
  enough.

## Owner check-ins

**Check-in 1 — the packet, on paper.**
- The pick and the two runners-up, one line each; say if you would
  rather another region.
- One plan sheet per place with its door table, as in 16i; the packet's
  bridges, stairs and ferries on their sheets. Say where you would move,
  keep or cut anything.
- The quest briefs, one paragraph each: does anything ask for a place
  the region should not have?
- The hand-decision list so far, one line per decision that the recipe
  could not make on its own. Say whether any should stay your call.

**Check-in 2 — the walk and the roadmap.**
- Walk the packet's places (URLs in the packet record): do they read as
  places of their kind, sited for a reason, reachable, with something to
  do; through the doors that open; the closed ones with their message.
- Did anything need you that the plan said would not?
- The roadmap: is the order right; are the right places marked as yours
  to guide; is the packet size right for how often you want to walk?
- The packet template: is the rhythm (plans, your check, build, your
  walk) the one you want for every region?

## Gotchas

- Fable makes no design call in part 1 except to unblock a lane. Each
  such call is logged as a gap; finding those gaps is the point.
- A packet is a region's places *and* its route structures and berths;
  leaving one `pending` is a failed gate, not a note.
- `ownerGuided` records never enter the packet, even as a "small" city.
- The density budget is Phase 15's completion gate; declare the
  packet's number, do not chase it.
- Run catalogue and remedy writers one at a time; placement tests
  serially before preflight.
- Nothing above `rederive_blueprints` re-runs; patches are local.

## Delivery plan (written 2026-09-20; revise from the 16i ledger before part 1 starts)

**Roles** as in the 16h brief (0079). In part 1 Fable's job is to run
the skill through lanes and watch where it stops, not to design.

**Catalogue runs** follow the CLAUDE.md golden rule "Prove on a sample,
validate on a fresh batch, scale once" ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)). The place lanes
share one `kit-qa` output directory with stamps, so no template renders
twice, and the Sonnet protocol is tuned on 3 sheets with verdicts written
first before each sweep, two loops at most.

**Part 1 (`deliver 16j part 1`).**
- Step 0: `routing-audit`; confirm `DELIVERED_THROUGH`, the type
  register, the empty allowlist, the skills' presence.
- Step 1: `research` proposes the three candidates with the numbers;
  Fable picks (item 1).
- Step 2 (Fable with one `deliver` for prose): the co-design loop (item
  2); `text-review` in a separate agent.
- Step 3, lanes at once: one `deliver` per place running skill v2's plan
  steps verbatim; one `deliver` for the packet's route structures and
  berths through the renderable kinds. Each lane hands back its sheets,
  Sonnet reports and hand-decision list.
- Step 4: plan sheets and the 2D map; `docs:check`; preflight; commit by
  pathspec; the check-in 1 packet.

**Part 2 (`deliver 16j part 2`).**
- Step 0: the steers as record edits (`deliver` per lane); rules.
- Step 1: one `run` job: build once (item 5); probes.
- Step 2 (Fable): the gap triage (item 6); lanes at once: `deliver` skill
  edits; `deliver` schema fields and back-fill; `deliver` the `--places`
  selectors (item 7b); `deliver` the re-run of changed steps on the
  packet, through those selectors.
- Step 3, lanes at once: `deliver` the readiness checklist and the
  agent-as-reviewer run (item 7); `deliver` the roadmap, template and
  owed list from Fable's outline (item 8).
- Step 4: the walk packet (Sonnet studio shots, few and legible); the
  close (item 9); `docs:check`; preflight; commit by pathspec.

## The story, in plain English (for the owner)

**Where we are.** Six example places are built and you have walked them.
The recipe for building a place, plans first, then build, then walk, is
written down.

**What this chunk does.** It tests the recipe on a small region with
nobody steering. The agent picks a region with three to six places
whose kinds already have a finished example, a cave-type place among
them, plus the bridges, stairs and ferry landings on that region's roads. It drafts the
region's small local quests in outline, so that the places and the
stories agree. Then it runs the recipe on every place and notes every
time it had to decide something the recipe did not cover. **Your first
check** is on paper: the region it picked (and two alternatives), the
plan of each place with its door table, the quest outlines and the list
of decisions the recipe could not make on its own.

Then it builds the region once and you walk it. Every decision the
recipe could not make becomes either a new step in the recipe, a new
field in the records, or a question for you. Finally it writes the
roadmap for the whole province: every region in order, how big each is,
which ones are cities or the opening scenes that you will guide yourself.
**Your second check** is the walk and the roadmap.

**What we have at the end.** One region built by the recipe alone and
walked by you; the recipe patched where it fell short; a province
roadmap you have signed; and a template every later region follows.
This closes the foundation phase. The world then waits while swimming,
climbing, boats, the creatures, the interiors and the rest are built.
Once those exist, the rollout picks the roadmap up region by region,
with the same rhythm each time: plans, your check, build, your walk.
