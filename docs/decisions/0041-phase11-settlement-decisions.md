# 0041 — Phase 11: settlement/location system — hub + delivery plan

**Date:** 2026-09-01 · **Status:** delivery plan authored (planning agent, from
owner directives 2026-09-01); owner decisions land here as the phase runs.

> ## RUN-BOOK — start here if you are delivering Phase 11
>
> Read this doc, then [00-core](../world/00-core.md), then the Phase 11
> section of [95-build-sequence.md](../phases/README.md) (§86,
> "Phase 11" — the binding deliverable list), then
> [40-causal-authoring.md](../world/40-causal-authoring.md) **§28b–32**
> (§28b is the placement ladder — macro roster → type-siting grammars →
> micro layout, with the recorded-why and research rules; it is the
> definition of "causal" this phase implements — then the
> `SettlementBlueprint` schema, review loop and orphan validator) and
> [quests/20-world-provisions.md](../quests/20-world-provisions.md) in full
> (the two-way contract; §12b's named-settlement constraints are hard
> requirements). Route to other modules per [docs/README.md](../README.md).
>
> ### Gates (established 2026-09-01, per 0034)
>
> - **Start-gate: OPEN.** The S semantic-authoring schema (module 76 §128)
>   is accepted — author NPCs/enemies/merchants as ladder references
>   ("strong D3, diseased"), never absolute numbers. Loot/traps have no
>   semantic schema yet (10c deliverable): author fixed loot as semantic
>   descriptions too (tier + provenance), resolved later.
> - **Freeze-gate: CLOSED until 10b + 10c land.** No packet (exemplar
>   included) is "frozen"/done until 10b combat-space probes run on its
>   geometry, 10c numbers validate it, and its §65b quest-brief set +
>   density budget exist. **Plan to end this phase "authored, probed as far
>   as possible, awaiting freeze"** with an explicit freeze checklist.
>
> ### Owner involvement model (owner directive, 2026-09-01)
>
> The owner wants to be **hands-on at the start, then hand over**: steer the
> big decisions and the *look* of the first settlement through short
> iterative rounds; once they declare the flow good, deliver the rest
> autonomously with one batched review at the end. Run it like onboarding
> with a new manager: bring small, concrete, visual things to react to;
> transcribe every steer into a written rule; earn autonomy. The staged
> workflow below is the contract — do not skip to autonomous delivery, and
> equally do not drag the owner into decisions the docs or one clearly-best
> option already settle.
>
> **Three owner touchpoints, in order**: ① the catalogue summary (Part 2 —
> vibe and load-bearing calls), ② the plotted province map (Part 4 — the
> whole picture, before anything is built), ③ the steered exemplar rounds
> (Parts 5–7). The owner is involved in **all major cities**, always.
>
> ### What is already in hand (verified 2026-09-01 — build on, don't redo)
>
> - **Mined form tables** (Phase 10 prep): `world/sources/placement/`
>   `bmv-settlement-form.json`, `bmv-valenwood-settlement-form.json`,
>   `vanilla-tamriel-settlement-form.json`, `bmv-interior-assembly.json`
>   (snap module ≈ 1.82 m, statistical); digest in
>   [mined-interior-assembly-and-settlement-form.md](../research/placement-settlements/mined-interior-assembly-and-settlement-form.md);
>   miners `worldgen/mine_settlements.py` / `mine_interiors.py`.
> - **Lore**: [settlement-register.md](../../world/sources/lore/extrapolation/settlement-register.md)
>   (magnitude ladder M1–M5 *in structures*, the eight majors, secondaries,
>   Arena-name candidates), per-settlement Hist placement
>   (`topics/hist-placement.md`), the two never-blended building cultures
>   (`topics/material-culture.md`), guilds, the Owing.
> - **Anchors**: `world/sources/anchors/settlement-anchors.json` — owner
>   approved *broad* positions at Phase 2; exact siting is THIS phase's job
>   (nudge within `toleranceUV`, owner steers — Parts 3 and 6).
> - **Routes/danger/cultures**: Phase 4 outputs via `compile_society.py`
>   (roads, boat lanes, danger bands, territories) — Phase 11 re-authors on
>   top (docks, tolls, ferries, root transit; the 4-station rootworm net is
>   a placeholder to replace).
> - **Research**: [marsh-settlement-morphology.md](../research/placement-settlements/marsh-settlement-morphology.md)
>   (siting menu), [kit-level-design-and-layout-generation.md](../research/placement-settlements/kit-level-design-and-layout-generation.md)
>   (Bethesda kit craft), [xanmeer-mesoamerican-reference.md](../research/placement-settlements/xanmeer-mesoamerican-reference.md),
>   [morrowind-content-density.md](../research/placement-settlements/morrowind-content-density.md)
>   (binding density numbers + diegetic-discovery rule).
> - **New binding principle**: module 20 **§12.3b Reward for effort** —
>   hard-to-reach places pay the player, approximately proportionately;
>   packet budgets declare reward coverage; the orphan validator checks both
>   directions. Read it before placing anything.
> - **Blender, headless**: `tooling/asset-pipeline` runs Blender via Wine
>   (`build_kit.py` shows the invocation); `pipeline/blender/render_preview.py`
>   and siblings are the still-render precedent for review artefacts.
> ### Standards and kickoff hooks that bind this phase (added 2026-09-01, after 0042)
>
> Read [engineering-standards.md](../standards/engineering.md) (decision
> [0042](0042-buildout-steers-and-engineering-standards.md)) before writing
> the schema — most of the eleven bite here, several as mechanical `npm test`
> checks: quest gates/conditions/rewards only in the typed vocabulary
> ([quests/85](../quests/85-condition-vocabulary.md) — extend it, never
> invent prose); **stable IDs** `<domain>.<packet>.<name>` on everything
> placed, registered; optional `owner`/`ownerFaction` + value tier fields
> present in the placement schema from day one; player-visible strings via
> `packages/text-catalogue`; **seeded determinism** in all compilation;
> `schemaVersion` + a `data-registry.json` entry on every new runtime data
> format; letters/notes/rumours as typed content units (quests/85 §C).
>
> Also collect the **Phase 11 kickoff hooks** in
> [game-buildout-register.md](../phases/buildout/README.md) ("At Phase 11
> kickoff" block + the Phase-11 rows): the `STATION` socket type, per-body
> `WaterBody` records, timetable data + urban water-taxi edges on the
> travel-service graph, the prior→roster demographic rule (92 §84), the
> vastei tutorial-scene flag, talk→service-menu as a small contract (not a
> ferry hack), boat-nav clearance as an authoring rule, the ~10 hero Hist
> placed with stable ID + power slot, and demographics expressed as an
> authoring rule. Fold these into the schema/deliverables in Part 0/Part 4 —
> they are owner rulings, not suggestions.
>
> ### Forward-compatibility contracts (added 2026-09-02, from the build-out
> ### register review — these prevent the big refactors later)
>
> Phase 11 creates the data the whole future game will reference. Get these
> shapes right now; retrofitting any of them at build-out is the expensive
> version:
>
> - **The place catalogue is the province's PERMANENT registry.** Its stable
>   IDs are what the quest engine, journal, map/markers, save games, courier
>   letters, deed counters and rumour pools will reference forever. IDs are
>   never deleted or renamed once committed — a cut place flips `status`,
>   it does not vanish. Design the schema knowing Phases 12/13/15 and the
>   build-out extend it in place.
> - **Build-out keys on the catalogue record, from day one** (cheap now,
>   a migration later): a diegetic-discovery pointer slot (map/markers
>   row), a letter/rumour pool key (courier row), deed-counter keys where a
>   faction watches the place (deed-counters row), and the socket lists
>   (SCENE / EVIDENCE / STATION / marks) as typed fields even where empty.
> - **The compiled settlement bundle format carries a variant/overlay
>   mechanism from v1** — quests 20 §14 requires 2–3 `LocalStateVariant`s
>   per quest location (enable/disable refs, service overrides, ambience,
>   `washed-out` flag). If the v1 bundle can't express an overlay, every
>   bundle gets rebuilt at Phase 14. Exemplars ship at least one authored
>   variant to prove the mechanism.
> - **Door + interior-claim records on every enterable structure**: stable
>   door ID, facing, threshold transform, and an interior claim (size class,
>   culture, owner) for Phase 12 to fill. "Enterable" in the density budget
>   means the claim exists in 11 and is verified at freeze after 12 — plus
>   **reachability**: a validator must prove every door is approachable
>   (not facing a cliff/water it shouldn't, threshold steppable, on the
>   post-grade navmesh) every compile, not at freeze.
> - **Performance-enabling structure, TES-style, from the first compile**
>   (owner ruling 2026-09-02: agents cannot measure FPS — no GPU — so build
>   the *enablers* and report *static* budgets instead). What the source
>   games do, automated: one LOD authority per building baked from
>   post-grade transforms (already a gotcha below); kit meshes instanced /
>   merged per material like the vegetation tiers; settlement chunks stream
>   through the same manifest machinery as terrain; interiors are separate
>   bundles behind doors (the cell pattern — Phase 12 inherits it, so the
>   door records above are also the streaming boundary). The compiler emits
>   a **per-settlement static budget report** (instances, draw calls after
>   merge, unique materials, texture MB, collider count) checked against
>   declared packet budgets in `npm test`; the owner gives the real FPS
>   read at each exemplar's dressed walk (Round C), not at wrap.
> - **The kickoff hooks from the register are deliverables, restated**:
>   `owner`/`ownerFaction` + value tier optional on every placed
>   interactable (unowned = wilderness norm); `STATION` sockets; per-body
>   `WaterBody` records; timetable data + urban water-taxi edges on the
>   travel-service graph; the prior→roster demographic rule (92 §84); the
>   vastei tutorial-scene flag on the packet owning the opening; ~10 hero
>   Hist with stable ID + power slot; boat-nav clearance as an authoring
>   rule; talk→service-menu as a small contract.
>
> - **Subagent fan-out is owner-approved** (as in Phase 10): low effort for
>   all subagents; parallelise self-contained work (mining, validators,
>   quest-brief drafting, asset sourcing); keep the blueprint
>   schema/compiler in one pair of hands. Concurrent agents share this
>   worktree — pathspec-only commits.

## Delivery plan

The Parts 0–8 delivery plan (about 700 lines) moved to
[research/archive/phase11-rounds/0041-delivery-plan.md](../research/archive/phase11-rounds/0041-delivery-plan.md)
on 2026-09-11: Phase 11 is absorbed into [Phase 16](../phases/16-foundation-and-places/README.md).
The cross-cutting rules, the taste ledger and the 2026-09-09 rulings below remain live.

## Cross-cutting rules (they apply to every part above)

### How the quest co-design loop folds in — at three points, not one

1. **At derivation (Part 1)** the quest plan is a *derivation source*:
   every quest's world provisions (quests 20, esp. §12b) generates
   catalogue rows, flagged quest-required with tier ownership. Tier-0
   (main-quest) rows are untouchable by lower-tier needs.
2. **After the macro plot (Part 3/4)** — the cheap, high-value moment,
   and the one previously missing. A quest-side Opus subagent reads the
   plotted map and the catalogue, runs the novelty check against
   `docs/quests/55-quest-index.md`, and answers: what does this province
   make possible that the quest plan hasn't used; what does the quest plan
   need that isn't plotted; where would moving a dot 2 km make a quest
   much better? **Moving a dot costs nothing before anything is built.**
   Reconcile, record, and update both the catalogue and the quest index in
   the same change.
3. **Per packet at authoring (Parts 6–8)** the full §65b loop as specified
   (briefs drafted against the drafted network, placements reconciled,
   density budget declared) — a completion gate: a packet without its
   quest-brief set and declared budget is not done.

World feasibility and the packet's POI/perf budget win ties; unresolved
conflicts become named questions in that packet's owner review.

### Visual distinctiveness — a hierarchy, decided in the catalogue

Distinctiveness is *designed at Part 1/2 and enforced everywhere after*, not
discovered at build time. Five rungs, each varying against the one above:

1. **Province** — one coherent Argonia: the house style (BM&V), the
   shared material logic (no stone as a moral error post-Duskfall), the
   overall palette envelope.
2. **Region** — each region class and culture zone gets its own flavour:
   dominant materials, palette shift, building grammar, vegetation
   context, characteristic place types, light/mood. Two regions must be
   distinguishable from a single screenshot.
3. **Named place signature** — every major settlement gets an explicit,
   *written* signature that no other shares: Gideon must not read like
   Helstrom, Lilmoth must not read like Stormhold. Signature =
   architecture family + palette + silhouette motif + a unique landmark or
   spatial idea + a civic ritual/economy that shapes the layout. Record it
   as a catalogue field and check it pairwise against neighbours.
4. **Within a place** — districts differ (wealth, trade, faith, labour,
   outsiders), and the building set varies within its family.
5. **Instance** — seeded variation in rotation, wear, clutter, additions,
   so two stilt huts of the same family are not twins.

Small places get the same treatment at lower cost: a pirate camp, a hermit's
hut and a toll post each need a signature sentence and an asset plan, or
they will all converge to the same three assets. **Enforce with a
distinctiveness check**: neighbouring or same-family places whose
descriptors and asset plans are too similar get flagged for the author.

### The breadth rule — do not fixate on the examples (owner directive)

Every list of examples in these docs — including the ones above — is
**illustrative, never exhaustive**. The observed failure mode is an agent
reading "e.g. hiring halls, toll offices, smugglers, wreckers, pirate
anchorages, raft villages, abandoned sites" and then building exactly those
seven things. That is a bug in the agent, not a spec.

Required practice when deriving or varying anything:

- **Enumerate systematically, from multiple independent axes**, then cross
  them: by economy/trade; by faction and institution; by ecology and
  habitat; by era layer and what it left behind; by traversal mode; by
  danger tier; by social function (law, worship, burial, healing, learning,
  waste, defence, festivity, vice, refuge, quarantine, labour, childhood,
  the dead); by ruin/condition state; by season; by scale. A place type is
  a *cell* in that grid — most cells nobody has written down yet.
- **Set a target and check it**: how many distinct families and types does
  this region have, and does the mix beat the previous region's?
- **Run a completeness critic** (an Opus subagent whose only job is naming
  what is absent) and act on it — repeatedly, until it returns little.
- **Prefer the unfamiliar** when two options are equally good: the province
  should surprise the player who has seen the first five regions.

### Slopes and uneven ground — a first-class problem, not a polish item

We place on a real heightfield, and the source games mostly do not: Bethesda
settlements sit on ground that was *authored flat where it needed to be*,
with foundation pieces, plinths and stilts hiding what is left. Our compiler
must own this explicitly:

**Read [openworld-place-distribution-and-siting.md](../research/placement-settlements/openworld-place-distribution-and-siting.md)
§ on slopes before designing the ground-fitting stage** — it is prescriptive
and researched. The load-bearing rules it establishes:

- **The building snaps to the grid; the ground moves to meet it** (Bethesda
  does this by hand, we must automate it). Drive the choice off Δ, the
  terrain height delta across the building footprint: **Δ < 0.15 m** place
  direct · **0.15–0.6 m** plinth/foundation course · **0.6–2.0 m** grade a
  pad, with a 2–3× falloff ring and a softened rim · **Δ ≥ 2.0 m never
  grade** — switch to a **stilted or dug-in variant, or re-site**.
  Conveniently, the stilt answer is also the lore-correct marsh answer.
- Set pad height from the **maximum** terrain height under the footprint,
  never the mean, and **bury the base ≥ 0.25 m**: if a wall doesn't clip in
  at the bottom, it gaps at the top.
- **Flatten *then soften the rim*** or you get visible creases; keep the rim
  ≤ 30° or the settlement becomes a navmesh island. **Regenerate navmesh
  after grading**, never before.
- Heightfields cannot express verticals — plinths, stilts and retaining
  walls are polygon geometry ray-sampled onto the terrain, not terrain edits.
- **Water-edge structures** (docks, stilt huts, boardwalks) are placed
  against the **highest** seasonal/tide water level and piled to the **bed**,
  not to the surface.
- **Never leave** floating corners, buried doorways, gaps under walls, or
  thresholds the player cannot step onto — validator checks, every compile.
- **Publish each settlement's footprint polygons and door transforms as
  constraints to the road compiler**, or roads will run through walls.
- **The authored/procedural seam**: make every settlement effect a falloff
  field with a *different* radius per channel (roughly material 8 m,
  vegetation 15 m, terrain 25 m) — a channel that stops on a line reads as
  a line.
- **Building LOD is the classic failure** (DynDOLOD documents Bethesda's
  own): one authority per building deciding LOD-vs-full at one distance;
  never model a settlement as an overlapping sub-worldspace; bake building
  LOD from **post-grade** transforms and rebuild terrain LOD tiles in the
  same compile.
- **Compile order that avoids most of this**: suitability → siting → layout
  → grade → roads → navmesh → vegetation → materials → LOD.
- Flat pads are the worst case for **shadow acne** — leave pads ~0.5–1°
  residual tilt and check against the CSM splits.

### Subagents

> Model policy (owner 2026-09-05, supersedes 2026-09-03 and 2026-09-01): the
> orchestrating Fable 5.1 agent plans, architects and decides; Opus 5
> subagents at LOW effort deliver what it scoped. Fable subagents only for
> open design reasoning the owner asks for, sparingly (subscription limit).

Fan out **Opus** subagents freely and in parallel wherever it helps —
derivation by region or family, the critique/completeness passes, research
gap-filling, quest-side work, asset sourcing, validators. **Never Fable**
(owner ruling, 2026-09-01). Keep the blueprint schema/compiler in one pair
of hands. Concurrent agents share this worktree — pathspec-only commits.

### Agent-as-reviewer experiment (owner proposal, 2026-09-01)

The owner will steer the first exemplar (and **is involved in all major
cities**, always). Once that loop is working, test replacing the owner's
seat with a **reviewer Opus subagent** on one *non-city* exemplar: give it
the catalogue record, the research, the taste ledger and the same visual
artefacts, and have it run the same rounds adversarially. Then the owner
spot-checks that result against their own taste — a calibration, not a
handover. If it holds up, agent-review becomes the default for the Phase 15
long tail, with the owner keeping cities and any place the reviewer flags
as load-bearing. Record the outcome here either way.

## Taste ledger (grows during Part 7 — generalised owner steers)

| Date | Steer (as a general rule) | Evidence / where it bites |
|---|---|---|
| 2026-09-07 | **Climbing is free on piles and house sides in every settlement.** Module 00-core makes large logical surfaces climbable by default; no quest gate may assume a stair is the only way up a tier | Lilmoth question 4; quests 85 condition vocabulary must not carry a "reached by the stair" gate |
| 2026-09-07 | **A safe city still declares its combat spaces**, each tied to a quest or a hostility flip (97 D9) | Lilmoth's four; the owner asked and confirmed |
| 2026-09-07 | **Argonian places promise a shrine, not a temple**; Imperial- or Dunmer-founded places keep their chapel or temple under their own culture | promise ledger R3; Stormhold, Thorn, Helstrom, Archon changed |
| 2026-09-07 | **Solid masses stay masses.** A piece with no opening and no door anywhere in its source stands as a mass; a guard post that must be entered uses a piece with a baked leaf | Imperial guard tower, Ayleid stair block |
| 2026-09-07 | **The hostile-or-clearable share: 55 % is the target (warn), 50 % the hard floor** | `test_catalogue.HOSTILE_SHARE_HARD_FLOOR` |
| 2026-09-07 | **A gate is named for the road it faces**, never for a compass point the road does not use | Lilmoth: the north gate faces the Blackrose road from the west-north-west |
| 2026-09-07 | **A capital's drowned or ruined quarter is under the player's own walkway** (1–15 m); the expeditionary dive is a wreck place, not the city | Lilmoth question 2 |
| 2026-09-07 | **Interiors come from the mod's own door links, never a filename guess**; a shell the plugin links to an interior gets that interior and its door offset as the entrance | `exterior-interior-links.json`; supersedes the stilt-hall "hut dressing" holding position |
| 2026-09-07 | **Beast lairs on water are swimmable fights** (pond ≥ 2.5 m), hazards are heavy damage over time not instant death, and clearing one changes the map loudly (detour abandoned, travel times drop) | the Standing Charge; sets the pattern for the 38 lairs |
| 2026-09-07 | **A licensed camp is a landmark, not a hide** (the hero tree, the licence readable from the water); permanent dwelling (mud hut) over canvas | the Licensed Stage |
| 2026-09-07 | **Villages grown into trunks are accepted**; ring spacing 22.6 m is the tribal-village default; delegations camp in canvas outside the gate | Nine-Trunks |
| 2026-09-07 | **A stone place on a slope is shown as a building site of rising courses** where the finished static would swallow the shelf; pens behind the rise (a reveal); haul road as a switchback; the Hist stays where it grew with conduits climbing | Mazzatun |
| 2026-09-07 | **No lane is a ruled line and no huts stand in columns.** Two parallel ways of one width, or three or more buildings on one bearing at one spacing, read as a grid even in a stilt quarter; boardwalks run straight only from pile to pile between bends, footpaths are routed on the ground, and each dwelling takes its own offset (5.5–6.5 m off its lane) and its own spacing (12–19 m) | owner-eye review: Pusbottom's two parallel lanes and three hut columns at 15 m; the shore quarter's ruler row |
| 2026-09-07 | **A ring that grew is not a polygon.** Trunk rings, hut rings and pole rings carry a seeded jitter (up to about 6° and 2 m per member) about the culture's default spacing; the default (22.6 m) is an average, never an exact chord | Nine-Trunks' exact nonagon; applies to all 27 tribal villages |
| 2026-09-07 | **Props are not buildings.** Every parcel derives a `kind` — `building` (encloses a room or has an entrance), `structure` (deck, scaffold, gate, wall, tower), `prop` (rack, oven, cart, board). Props are exempt from the C5 8 m floor, the C6 density band and the C7 use histogram, and are counted as C12 dressing; structures count for C6 and not C7; a stacked piece adds nothing to any count | audit §7.1 (a works yard judged as a village); `worldgen.parcel_kinds`, 97 C5b |
| 2026-09-07 | **Kit purity is held over what a place is built of.** The `works-v1` props and a neutral dressing pool are admitted to every kit set; only structures and buildings are tied to one kit per district. A district drawn round a single prop is deleted | audit §7.2; Lilmoth's dues-board district removed, the board moved into the lighter quay; `blueprint.DRESSING_KITS`, 97 C1a |
| 2026-09-07 | **Where C2 and C4 want the same ground, the Hist wins.** Commerce sits on the spine at the first junction inside the threshold ON THE WAY to the sacred or authority node, not at a fixed distance from the gate | audit §7.3; Lilmoth, where the high ground is the ground nearest the gate; 97 C4 |
| 2026-09-07 | **Argonians build no fence or wall piece except where the lore cites one** (Lilmoth's estuary pole wall); a closed ring of dwellings, trunks and woven panels between them IS the place's edge and counts as one | audit §7.4; Nine-Trunks; 97 C10 |
| 2026-09-07 | **`abuts` covers kit snap pairs only.** A trade contact (a hoist against the rock it works, an oven beside its rack) is `worksWith` + `worksWithWhy`: exempt from the 8 m floor, and it must keep 0.5 m clear, because nobody authored those two pieces to touch | audit §7.5; validator + `parcel-gap` `WORKS_WITH_CLEAR_M`, 97 C5a |
| 2026-09-07 | **The Morrowind ratio is the rule for structure counts** (Balmora ≈ 40, so an M5 is 50–80 buildings and structures); the settlement register's 150–400 band counts total placed objects including props and dressing | audit §7.6; 97 D7, module 92 §83b |
| 2026-09-07 | **The gate piece sets the width through it.** A spine may narrow to the opening for the gate's length and widen again beyond it | audit §7.8; Mazzatun's 3 m roads through a 3 m gate; 97 C3 |
| 2026-09-07 | **The Mazzatun raiders' back way is a climb, not a cut.** One way onto the shelf by the road; the raiders come down a climbable rock face (climbing by default, 00-core), and no terrain is cut for it | audit; the design record, gap plan B8 line removed |
| 2026-09-07 | **A gate that can be walked round is not a gate.** No way of any class enters a place past a `spans` gate; a lore-grounded back way (a raiders' path, a smugglers' cut) is allowed only if it is walkable (≤30° in any 3 m), is not the line any `approaches[]` entry uses, and says on the way why it exists | Mazzatun's shoulder footpath skirted the shelf gate at 42–58°; removed, terrain request in gap plan B8 |
| 2026-09-07 | **What the eye wants gets a path.** Where a walker at a node can see a quarter below within 150 m, a footpath joins them unless the ground forbids it; a 500 m detour to reach what is in plain view reads as fake | Lilmoth: the fishers' path from the gate yard to the shore quarter (120 m for a 500 m loop) |
| 2026-09-07 | **Accepted answers are written into the record the same day.** A design record's open question is closed in place with the ruling and where it now lives; prose that still describes the rejected option (a tent for a hut) is a defect | the Licensed Stage still described the tent; the Standing Charge lacked its four rulings |
| 2026-09-07 | **The committed plot is the seed of the solve.** A record keeps its committed cell unless that cell is no longer valid (water depth at the dot, a moved danger/region raster, a blocked sightline); a province-wide re-plot is the owner's deliberate step behind `--resolve-all` | terrain edits moved 342 of 579 records in a from-scratch solve; `macro_plot`, playbook §1 "The seed rule" |

The round-by-round record (Part 0 … Owner Q&A, 2026-09-02 → 2026-09-07) lives in [docs/research/archive/phase11-rounds/0041-round-log.md](../research/archive/phase11-rounds/0041-round-log.md).

## Places have EXTENT (owner ruling 2026-09-09)

**The problem.** The macro plot treated every place as a POINT. `COLLISION_MIN_M`
= 30 m was the entire physical gate, applied to every pair unconditionally, so
a city and a cairn were the same dot. Measured on the shipped catalogue (580
records): nearest-neighbour min 30 · p5 35 · median 85 · p95 249 m, 115
records inside 50 m, and the 30 m floor binding exactly. `sacked-customs-suburb`
sat inside Lilmoth's own boundary polygon; every M5 city had a neighbour at
30–38 m, several of them unrelated (Helstrom 30 m from a wisp-lure lair,
Stormhold 33 m from a listening post). Under the footprint model below, 426
pairs overlap.

Separately, `type-recipes.json` `siting.neighbourRelation` was prose the
solver never read as a distance. 16 types carry explicit isolation language and
**19 of their 22 records contradicted it** — the Two Lamps hermitage
("deliberately far from everything") 96 m from a village, the rogue wild Hist
("deliberately far from any living settlement") 137 m from a naga village —
and every one passed the semantic audit clean, because `check_neighbour` only
judges a claim the record itself names. That is a live engineering-standard-12
failure: prose written against a record the typed fields cannot deliver.

**The model.**

1. **`footprintRadiusM` on every type.** Where a blueprint exists the radius is
   DERIVED from its boundary polygon, not authored: geometry, not labels
   (97 E2). Measured: Lilmoth (M5 rebuilt-stilt-city) 273 m, Mazzatun (M3)
   128, Nine Trunks (M3) 118, the licensed sap camp (M1 works) 32, the adult
   wamasu pond 280. Everything else is banded from the type's own record:
   magnitude where it exists (M5 230 · M4 140 · M3 115 · M2 65 · M1 45,
   calibrated on those measurements), else `complexityBudget` (trivial 25 /
   simple 38 / standard 60 / complex 95 — the authored "how much place is
   here") × a class factor (a ruin field and a lair spread, 1.3 and 1.15; a
   hermitage and a road stage do not, 0.7 and 0.8) × a `countBand` nudge.
   Floor 20 m, ceiling 230 m: no place claims more exclusive ground than the
   province's largest city, which is what stops a pond's *hazard* boundary
   being read as occupancy. The derivation lives in
   `worldgen.author_type_siting` and is drift-checked, so the numbers can be
   re-derived when a boundary moves rather than hand-maintained.

   The pairwise floor becomes `max(COLLISION_MIN_M, r_a + r_b)`, immutable
   across every relaxation stage exactly as the flat floor was. A related pair
   whose type declares `proximity.mayAbut` for the other's class, or which is
   `boundTo` the other, shares ground and clears only the SMALLER radius.
   *(The brief proposed the larger. Measured, that is infeasible: it puts a
   satellite at or beyond the city rim while `boundTo.maxM` and the types' own
   `maxFromM` both say 250 m against a 230–275 m city radius, and it made 24
   tier-0 satellites homeless. Smaller radius, same intent — an unrelated
   lighthouse 38 m off the quay still fails.)*
   Dead `RELATED_MIN_M` (declared, never referenced) deleted.

2. **`proximity` on 72 types**, authored from each type's OWN
   `neighbourRelation` and quoting it: `minFromClassM` (floor to every record
   of a place class, plus the pseudo-class `route`), `maxFromM` (ceiling to
   the nearest record of a class), `outOfSightOf` (reuses the survey's
   `line_of_sight`), `mayAbut`. Hard gates in `separation_ok`, evaluated in
   BOTH directions — a hermitage's floor is a property of the pair, so a
   village plotted later may not walk into it. **An absent block means no
   constraint, and that is the explicit default**: prose that states no
   distance deliberately gets no block.

3. **The audit catches it.** `audit_place_semantics.check_type_proximity` is a
   new registered check that fails a record contradicting its own type prose.

4. **A closing pass.** `separation_ok` only sees what is already plotted, so
   `macro_plot.typed_siting_violations` re-checks every gate over the FINISHED
   plot with no ordering at all. It is what the report and the tests assert on.

**Three defects fixed en route.** `related_pair` was asymmetric (it read
`bound_to` only off the record being placed, so which of a pair the solver
reached first changed the gate). The relaxation-stage matrix had no stage that
relaxed both the repetition spacing and the region wish, so a record whose only
free ground was off-region and near a same-type neighbour had nowhere to go
even when a valid cell existed. And `macro_plot.run` raised on a failed
`--resolve-all` BEFORE writing the report that says why — the report is written
first now. A new deterministic **eviction-repair** pass was added: a homeless
record may take a movable peer's site if that peer can be honestly re-sited,
rolled back unless both succeed, so it can only reduce the homeless batch.

**Calibration is measured, not asserted.** 6.8 % of province land is ≥800 m
from every settlement; 13.9 % is ≥600 m. The isolation floors are therefore
600 m, not the 800 m first proposed — still 6× the violations they replace.

**The re-plot is BLOCKED, and is not committed with this change.** A
`--resolve-all` under the model leaves 6 of 580 records with no honest site
(`horwalli-waterworks-deeps`, `dream-wallow-sap-pool`, `freehold-smithy`,
`the-permit-dig`, `wamasu-pond-nest`, `rim-snowline-hermitage`). Measured
route down: 44 → 30 → 19 → 13 → 7 → 6 (see gap-plan B14 for what each step
was). Two of the six carry no `proximity` block at all, so proximity tuning
cannot reach zero — the footprint model itself costs those records. **Owner
call:** shrink the radii, cut/defer ~6 records, or raise supply. The prize is
measured: median nearest-neighbour 85 → 131 m, p5 35 → 73, and zero typed-siting
violations against 426 overlapping pairs and 31 isolation-floor breaches today.
Until it lands, `test_type_siting.test_the_shipped_catalogue_does_not_get_worse`
ratchets the catalogue so it cannot regress.

**Also corrected 2026-09-09.** 97 §A5/A6 documented a `SEPARATION_M` constant
and an M5 800 m floor that had not existed in `tooling/` since the Thomas prior
landed (measured M5 nearest-neighbour was 30–38 m). All three doc references
fixed. 97 §G6 recorded the hostile-or-clearable ≥55 % rule as a HARD floor and
marked the gap CLOSED on it; the real gate is two-level —
`HOSTILE_SHARE_HARD_FLOOR = 0.50` asserts, `HOSTILE_SHARE_FLOOR = 0.55` only
warns — so the much-quoted "three records of headroom" was headroom against a
warning. G6 is PART-CLOSED, and whether to make 55 % hard is an open owner call.

## Part 3b addendum — the six homeless records, resolved one by one (2026-09-09)

The owner's instruction on the blocked re-plot was that a place which cannot
be sited under its own stated semantics is a finding about that record or
about the province, never a licence to shrink the radii or relax the footprint
floor. Held: **neither the derived radii nor `physical_need` changed.** Each
of the six was diagnosed to the single gate that bound it, and each turned out
to be a defect in a record's typed fields, in a derivation, or in the solver.
578 of 580 now plot; nearest-neighbour median 85 → 136 m, p5 35 → 75 m.

**The diagnostic was lying first.** `whyHomeless` tallied the FIRST gate that
rejected each candidate, which is nearly always the culture prior (it rejects
2,500–4,000 cells for every record, homeless or not). The gate actually
standing between a record and the map was hidden behind it. It now judges
every gate independently and reports `soleBlocker` — candidates failing
exactly one. Every finding below came from that.

| record | binding constraint | resolution |
|---|---|---|
| `the-permit-dig` | its `nearPoint` was 268 m from Stormhold (needs 275) and 1043 m from the ruin it sits on, vs the type's 500 m ruin ceiling | the point had been written at the Collections' alcove in the city, not at the dig; removed, and `maxFromM {ruin: 500}` + `dependsOn` site it |
| `wamasu-wallow-struck-ground` | `nearPoint` put a 230 m hazard pond ~200 m inside Hutan-Tzel's clearance | contradicts its own prose ("the village two hours east", "off any walked path"); removed |
| `freehold-smithy` | every cell inside its 250 m bind to Alten Corimont scored −9 on `sightlineTo` the careening hard | the hard had plotted 419 m outside the basin its own record says it is inside; gave it the `boundTo` Alten Corimont its prose asserts |
| `dream-wallow-sap-pool` | `outOfSightOf: [settlement]` judged against every settlement in the province — rejected on a sightline to a village 1.3 km away | the prose is "a short walk from a village, out of ITS sight", and both `outOfSightOf` rows carry the paired `maxFromM`; the rule now binds within that range |
| `horwalli-waterworks-deeps` | the hostile-cluster share rule, at its own authored drainage pinch: 13 of 16 places within 800 m are hostile | the rule is about rival TERRITORY; the Horwalli Cut is unstaffed, with no occupants and no owner faction, so it holds none. Both sides must now hold ground |
| `wamasu-pond-nest`, and the two snowline hermitages | the Thomas 300 m child-radius gate | a 230 m pond plus a 115 m village needs 345 m — more than the kernel's diameter; a type with a 600 m isolation floor is being told to sit in a settlement clump and 600 m from settlements at once. `thomas_exempt` scores those flat |

**Two solver defects found and fixed en route.**
`sitingPrefs.scourSiteIds` — a record naming the exact site it was authored
onto — was read by **nothing**, on 189 records. Named sites are now reserved
for their claimants, as a `nearPoint` domain already was. And the
eviction-repair pass only reclaimed a site somebody was standing ON; under
footprints the commoner case is a free cell one movable neighbour's clearance
reaches into, so a **neighbour repair** was added on the same terms. Both now
check that moving a record does not strand a third record's `maxFromM`
ceiling, and roll back if it does.

**One authored conflict resolved by evidence.** `rim-snowline-hermitage`'s two
`scourSiteIds` lie 250 m inside `veterans-holding`'s authored `nearPoint`
domain, while the hermitage type demands 600 m from any settlement — two
authored claims that cannot both stand. The settlement's is the older and
load-bearing one (an M3 holding of forty veterans); the hermitage's site
claims were dropped. Noted in passing: `veterans-holding`'s own `scourSiteId`
(`summit-015`) is 807 m from its own `nearPoint` (max 300 m) — a second
authored contradiction, harmless now that claims are reservations rather than
commands, but real.

**OPEN — owner call.** The two `snowline-hermitage` records cannot both be
sited at the type's 600 m floor: measured, the best isolation either can reach
after every other authored gate is 580 m and 309 m, because the border
mountains are where the province's rim settlements are. Options and evidence
in gap-plan B14. Also open at 578/580: one empty Thomas parent in
`imperial-penal-south`, and three `maxFromM` ceilings missing by 0.3 m, 37 m
and 201 m through the known ordering hole (a ceiling is unjudgeable until
something of its class is plotted).

**The re-solved catalogue is still NOT committed.** Per the owner's recorded
timing (gap-plan B5) the re-solve runs against the FINAL water rasters, and
`test_blueprint.py::test_live_dir_validates` was still red on the Sap-Tapping
berth when this landed. The source fixes and the solver corrections are
committed; the catalogue write is one command, recorded in the handover.

## Part 3c — isolation is effort, a footprint is built ground (2026-09-09)

Two measurements were wrong at the root. Both had been papered over.

### Isolation is measured as effort, not as plan distance

**The ruling.** The two `lone/snowline-hermitage` records could not both reach
the type's 600 m floor; measured, the best each could do was 580 m and 309 m.
The options were to cut one, to re-derive the floor, or to accept the miss.
We re-derived, because the metric was wrong for the whole vocabulary, not just
for one record. The type prose these floors were read from says
"deliberately far from everything; the **effort-to-reach IS the design**".
A hermitage 300 m from a village but 250 m above it up a rim face is isolated.
A hut 700 m across flat marsh on a track is not. That is why the border-rim
records failed while marsh records cleared their floors with room to spare.

**The measure.** Tobler's hiking function, `W = 6·exp(−3.5·|S + 0.05|)` km/h
(the standard slope-dependent travel cost in GIS least-cost work), sampled at
the survey's own 5.48 m grid pitch on the natural height raster the solver
already reads. Symmetrised (canonical endpoint order, mean of the two traverse
directions), because a siting gate is a property of a pair. Clamped at a 100 %
gradient, past which Tobler is extrapolation and explodes: one 67° rim face
charged 778,920 m for 125 plan metres before the clamp. Sources, the rejected
alternatives (Naismith, Irmischer–Clarke, a landcover difficulty factor) and
the reasoning are in
[research/phase11/travel-cost-isolation.md](../research/phase11/travel-cost-isolation.md).
Implementation: `worldgen/travel_cost.py`, consumed by `macro_plot.separation_ok`,
`macro_plot.typed_siting_violations` and `audit_place_semantics.check_type_proximity`.

**The unit, stated rather than silently reinterpreted.** Cost is reported
in **equivalent flat metres**, the distance a walker could have covered on
the flat in the time the traverse takes. On flat ground that is plan metres
exactly, so the authored floors keep both their number and the calibration
with which they were written: a 600 m floor across flat marsh is as isolating
today as it was yesterday. This is not a blanket loosening. It cannot become
one, because effort is never below plan distance (asserted, with the
gentle-downhill case where Tobler is faster than flat). Each recipe now carries
`proximity.minFromClassMeasure = "equivalent-flat-metres"` so the record states
its own unit (standard 12).

**Before and after, over the shipped catalogue.** 31 isolation-floor breaches
on plan distance; **21** of those are still breaches in walking. The ten that
are not were never really breaches. They are places up a face or across a
rim. Median distance to the binding neighbour, by type:

| type | floor | records | plan breaches | effort breaches | median plan m | median effort m |
|---|---|---|---|---|---|---|
| air-pocket-grotto | 300 | 3 | 2 | 2 | 268 | 276 |
| blackguard-hideout | 400 | 7 | 7 | 6 | 136 | 150 |
| claimable-steading | 150 | 2 | 1 | 0 | 195 | 481 |
| dream-wallow | 120 | 4 | 3 | 1 | 105 | 148 |
| fallen-flier | 500 | 1 | 1 | 1 | 466 | 470 |
| field-station | 350 | 1 | 1 | 0 | 250 | 561 |
| hermit-hut | 600 | 3 | 3 | 2 | 125 | 569 |
| orma-tactile-ruin | 500 | 1 | 1 | 1 | 68 | 199 |
| poacher-camp | 150 | 4 | 0 | 0 | 256 | 335 |
| prison-ruin | 600 | 1 | 1 | 1 | 256 | 451 |
| refuge-station | 450 | 2 | 1 | 1 | 322 | 504 |
| sap-tapping-camp | 400 | 1 | 0 | 0 | 552 | 674 |
| smugglers-ledge | 250 | 3 | 2 | 0 | 234 | 1720 |
| snowline-hermitage | 600 | 3 | 3 | 1 | 161 | 1612 |
| upland-terrace-village | 450 | 3 | 1 | 1 | 522 | 2160 |
| urn-vault | 150 | 3 | 1 | 1 | 283 | 708 |
| wild-hist | 600 | 3 | 3 | 3 | 351 | 463 |

**Both hermitages site.** A `--resolve-all` under the effort measure and the
corrected footprints plots **580 of 580** live records with **zero** homeless
and **zero** typed-siting violations, against 578/580 and one open violation
before. Nearest-neighbour p5 71 m, median 132 m, p95 257 m. The catalogue
write is still the planner's to sequence against the final water rasters; this
was a `--dry-run`.

### A footprint is the ground a place occupies, not the polygon round it

`footprintRadiusM` was derived from `blueprint.boundary`. That polygon
legitimately encloses the approach, the water a landing sits in and the yard.
When the Sap-Tapping camp's boat landing moved to the head of the tide its
boundary went 31.8 m → 254.2 m, which would have derived a two-hut works with
a 230 m footprint, the size of Lilmoth. The same over-read had already
happened on the wamasu pond, where it was capped with `FOOTPRINT_CEILING_M`
rather than fixed.

The derivation now reads the **built ground**: parcel hulls (measured off the
asset geometry), the boundary of every district that *holds* a parcel and the
landmarks standing inside those districts. A district with no parcel holds no
structure (the wamasu pond's `landing` is 400 m of pole-marked channel).
A landmark outside every district is approach furniture, a marker pole or a
roadstead mark. All three tests are geometric, never by label (module 97 E2).

| place | boundary measured | shipped before | built ground, shipped now |
|---|---|---|---|
| Lilmoth | 273.0 | 230 (capped) | **225** |
| Mazzatun | 127.5 | 130 | **105** |
| Nine Trunks | 118.0 | 120 | **105** |
| sap-tapping camp | 31.8 committed / 254.2 in flight | 30 | **30 / 25** |
| wamasu pond | 279.8 | 230 (capped) | **175** |

**The ceiling is gone.** Every authored place now lands under the M5 band on
its own measurement, so `FOOTPRINT_CEILING_M` had nothing left to do and was
deleted. The magnitude bands are deliberately unchanged. They are bands rather
than measurements and they still bracket the measured places (M5 230 vs 226; M3
115 vs 104/103). Shipped overlapping pairs 426 → 415.

**Robust to the water agent's landing, which is the acceptance test.** The sap
camp's built ground measures 29.5 m against the committed blueprint and 25.4 m
against the in-flight rewrite whose boundary is eight times larger, because
the works did not move. Both revisions are asserted in
`test_the_built_ground_is_what_stands_there_not_the_outer_boundary`.

### Two ordering holes closed on the way

* **Thomas parents.** `--resolve-all` failed on an "empty" parent in
  `imperial-penal-south`. Every culture's `parentFloorM` (400–700 m) is below
  twice the 300 m child radius, so kernels legitimately overlap; crediting
  occupancy only to the *nearest* parent let a kernel full of children read as
  empty because a neighbour 442 m away was marginally nearer to each of them.
  Occupancy is now credited to every parent whose kernel holds the record.
* **`maxFromM` ceilings.** `separation_ok` cannot judge a ceiling until
  something of the target class is on the map, so three were missed by 0.3 m,
  37 m and 201 m. A new `ceiling_repair_pass` lifts each offender off the
  finished plot and re-solves it against everything, keeping the round only if
  it leaves nobody homeless and strictly fewer violations. It runs in a
  re-plot only: a seeded solve's contract is that a committed cell does not
  move. Under the corrected footprints and effort floors one offender remained
  (`the-tide-fair`, 582 m against a 350 m ceiling) and the pass cleared it.

**Mutations** (each turned its test red, then green again): normalise by
Tobler's peak speed instead of flat speed; `MAX_GRADIENT` 1.0 → 10; one-way
Tobler cost; drop the canonical endpoint ordering; make `effort_or_plan`
always walk; derive the footprint from `bp["boundary"]`; hand-edit
`rebuilt-stilt-city` to 100 in `type-recipes.json`; credit Thomas occupancy to
the nearest parent only; drop the ceiling-repair acceptance guard.
