# 16i — The exemplars, end to end: designed on paper, built, walked, and the skill written from it

> **SUPERSEDED 2026-09-25** by the place loop (decision
> [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md),
> brief [16k](16k-place-loop.md)): real places are built one at a time
> and walked until right, instead of six exemplars on paper first. The
> items below (lesson reconciliation, interior claims, the interior
> runtime, tier A cells, the approach checklist, skill v2, the type
> register) are 16k's carried backlog by number; this file is kept only
> for the item text. None of the six was built; the five Phase 11
> exemplars are dropped (16k hand-off ruling 4, their blueprints deleted
> 2026-09-25) and Lilmoth returns as the owner-guided whole-city slice.
> Do not run `deliver 16i`.

**Goal.** Take six example places all the way from a dot on the map to a
place you can walk into and enter, on 16h's building blocks, then write
the `settlement-build` skill v2 from what was actually needed. The five
existing exemplars (Lilmoth, Nine-Trunks, Mazzatun, the licensed tapping
camp, Wamasu Pond) are re-authored as assemblies on the frozen ground; a
sixth, a dungeon-kind place with an entrance piece, a reserved door and
its own set dressing, is chosen here so the rollout has a pattern for the
327 dungeon-kind records too. Every place is designed on paper first and
shown to the owner as a plan before any ground is levelled, any tree
cleared or any bundle published; then built once; then walked. **Tier A
interiors** (a furnished cell a mod plugin already links to the shell,
copied verbatim) ship with the door transition, the interior load
contract and interior lighting; every other door carries a typed
reserved state (decision 0062). The owner walks each place; every steer
becomes a rule; the skill is rewritten from the steps the sixth place
needed.

**Delivered in three parts, one fresh agent each, an owner check-in after
each** (owner 2026-09-20): `deliver 16i part 1`, `deliver 16i part 2`,
`deliver 16i part 3`. A part may span more than one session (end at a
commit; PROGRESS.md says where; the next session resumes the part); the
check-in happens once, at the end of the part.

Needs ruling 13 (interior scope, given 2026-09-11: interiors for the three
built places and the camp's stage building; Wamasu Pond has none) and
decision [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md)
(the reshaped flow; the door model).

## How this chunk fits

16h built the tools and designed nothing. This chunk is the carpentry:
the first places built with those tools, by hand, with the owner
steering on paper before the build and on foot after it. 16j then runs
the same steps unattended on a region packet through the skill this
chunk writes. Phase 12 later builds every interior that has to be
assembled rather than copied, behind the doors this chunk leaves
reserved.

## What this chunk realises and what it leaves to others

- **Realises:** six exemplar blueprints re-authored as assemblies from
  the mined templates and the type recipes, on the frozen ground; the
  full set of place records (ways, stairs, berths and hulls, entrance
  pieces, doors, pads, clearance by tier, additive dressing) for each;
  the door transition, the interior load contract and interior lighting
  in `packages/`; tier A interior bundles exported verbatim from plugin
  cells; the reserved-door state and its message; the approach checklist
  answered on the ground; the D0 safe interior marked per settlement; the
  type register; the `settlement-build` skill v2; the 0041 taste ledger
  and 97 rules extended by the owner's steers.
- **Leaves to 16j:** running the skill unattended on a packet; the
  packet roadmap and template; closing skill gaps found there.
- **Leaves to Phase 12:** every assembled interior (tier B): dungeon
  insides, the shells with no furnished plugin cell and no fitting
  substitute, hero interiors. The chamber-graph compiler builds on this
  chunk's load contract.
- **Leaves to 10b:** interior and exterior navmesh bakes; the record says
  so on every interior.
- **Leaves to 12b, 13, 10c, 14:** acoustic profiles, occupants and loot,
  balance, streaming budgets. The records carry typed empty slots for
  them (`acousticProfile`, `lightingProfile`, the contents slots 16g
  already typed), never values.

## Starting state (written 2026-09-13; the closing 16h agent REPLACES this section from the 16h ledger's ending state before "deliver 16i part 1" runs; the part 1 agent re-audits it with `routing-audit`)

The lines below are what was true at planning time; anything 16h
changed is wrong here until 16h replaces the section.

- **The five blueprints are stale inputs, not a base to patch**
  (`world/sources/blueprints/place.*.json`, 2026-09-09; Lilmoth's siting
  touched 2026-09-20 by 16g). 45 of 733 shipped placements are composites
  and all are Lilmoth's; Mazzatun (29 parcels), the tapping camp (7) and
  Wamasu Pond (3) carry none; dressing is one wicker chair from an
  interior kit, 237 placements. Keep each blueprint's place id, its
  design record (the "why" prose, the services, the promises) and 16g's
  siting; re-author the geometry: parcels, assemblies, ways, doors.
- **"571 shells" means 571 link records over 330 shell models** in
  `world/sources/placement/exterior-interior-links.json`; 481 are vanilla
  Skyrim buildings and about 90 come from the mod kits our exemplars use.
  Every `<kit>.interiors.json` reports **zero** `matched` interiors; the
  best is `tileset` (stilt 9 of 59, imperial-keep 10 of 88, mud 5 of 45,
  root 4 of 144). No Argonian interior ships anywhere. So most exemplar
  doors will land on relaxed preference 1 (a retextured furnished vanilla
  cell under the interior fit rule) or on `reserved`, not on verbatim
  tier A from their own mod. Budget for that and say so on the plan.
- **The plugin reader already does the re-read**:
  `esp_index.interior_cells(with_refs=True)` yields interior cells with
  their references and `decode_ref` decodes position, rotation and scale;
  `LIGH` is a placeable base type but per-reference light data (radius,
  colour, `XRDS`/`XLIG`) is not decoded yet; `interiors_index.py` (1,750
  lines) and `blueprint_interiors.py` exist. New here: the interior bundle
  exporter, the door transition, the load contract, interior lighting.
- **The interior load path exists nowhere**: no package mentions a portal
  or an interior cell beyond type fields in `packages/contracts`; world 80
  §63's `portals.json` is a paper spec with no producer or consumer (16h
  edits §63 to the 0081 door model). `packages/game-core/src/settlement/README.md:53`
  names "paired door arrival markers" as bundle data the renderer does
  not invent; 16h puts `arrivalMarker` on every door record.
- **The derive-then-validate loop works and is load-bearing**
  (`rederive_terminals → street_router → blueprint_footprints --apply →
  --areas --doors`, to a fixed point); never hand-edit derived geometry.
- **One entrance per piece** (owner 2026-09-07; `blueprint_interiors.py`
  ranked derivation with the `radial` exception): do not invent a second.
- **The skill is honest about itself**: v1 carries a "pre-16h, do not
  use" banner (16h changes it to "runtime correct as of 16h; 16i rewrites
  to v2") and a "not automated yet" section (kit choice per parcel,
  waterOk reasons, owner-guided cities); those are the v2 gaps.
- **Type recipes** exist as research
  (`docs/research/placement-settlements/settlement-type-recipes.md`) and
  as data (`world/sources/catalogue/type-recipes.json`); the Imperial-fringe
  and Hist-centred grammars are named there and proven nowhere yet.
- Keep: `kit-assemblies-mined.json` (4 sets × 8 templates, 75 doorways,
  the `gaps` block) as the composite source of truth; the 16h
  `kit-mounts-mined.json` for what hangs where.

## What 16i needs from 16h (the contract; 16h's brief promises each)

Per-asset `designedSinkM` and anchor class on every kit asset; the
runtime drawing pieces where the compile put them, colliding as
themselves; composites expanded from the mined templates; renderable
kinds with a hard error when one places nothing; door records with
stable ids, `arrivalMarker`, `interiorClaim`, `interiorStatus`,
`streamingBoundary` and a reachability verdict; stair pieces per deck
link; the three patch kinds (`settlement-pad`, `vegetation-clearance` by
tier, `dressing-add`) applied locally with receipts; the bundle
`variants` slot; the plan renderer and the assembly renderer; the
`kit-qa` skill with the Sonnet protocol and the `ownerGuided` refusal;
the route-structure exemplar set standing. If any is missing when part 1
starts, stop and record it in PROGRESS.md as 16h's gap.

## Read (fresh agent: this is your whole map)

- This brief in full; the [16h brief](16h-settlement-runtime-and-kit-qa.md)
  § What this chunk realises and § The story (what you inherit);
  the 16h ledger (`docs/research/phase16/16h-ledger.md`, written when
  16h closes) § Ending state.
- The plan [README](README.md) §3 (ladder rules), §7 ruling 13, §8.
- Decisions [0062](../../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md)
  in full, [0081](../../decisions/0081-building-blocks-then-exemplars-then-rollout-and-doors-are-transitions.md)
  in full, [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md),
  [0078](../../decisions/0078-places-adapt-to-the-frozen-world.md),
  [0041](../../decisions/0041-phase11-settlement-decisions.md) § Taste
  ledger only (the owner's earlier steers as rules).
- `.claude/skills/settlement-build/SKILL.md` in full (v1, the path you
  replace); `.claude/skills/kit-qa/SKILL.md` in full; `.claude/skills/text-review/`.
- [world/96](../../world/96-placement-playbook.md) in full,
  [world/97](../../world/97-placement-principles.md) in full (binding),
  [world/70](../../world/70-dungeons-interiors.md) §47–50 (families,
  promises, combat spaces, settlement form), [world/80](../../world/80-repo-architecture.md)
  §63 (portals, as 16h edited it), [world/90](../../world/90-asset-strategy.md)
  §71 (sourcing procedure).
- Research: [settlement-type-recipes.md](../../research/placement-settlements/settlement-type-recipes.md),
  [shipped-world-placement-rules.md](../../research/placement-settlements/shipped-world-placement-rules.md),
  [mined-interior-assembly-and-settlement-form.md](../../research/placement-settlements/mined-interior-assembly-and-settlement-form.md),
  [exterior-interior-linking-in-skyrim-mods.md](../../research/placement-settlements/exterior-interior-linking-in-skyrim-mods.md)
  (how a door teleports: `XTEL`, paired markers), [kit-assemblies-evidence.md](../../research/placement-settlements/kit-assemblies-evidence.md),
  [openworld-approach-and-wayfinding.md](../../research/placement-settlements/openworld-approach-and-wayfinding.md)
  §5 (the 16-item approach checklist), [research/rendering/building-placement-rendering-treatments.md](../../research/rendering/building-placement-rendering-treatments.md)
  §3, the [settlement kit sourcing log](../../research/placement-settlements/settlement-kit-sourcing-log.md)
  (OPEN rows are gaps you show, never fill by hand).
- Quests: [docs/quests/20-world-provisions.md](../../quests/20-world-provisions.md)
  (each exemplar's provisions; §12 the D0 safe interior),
  [docs/quests/25-quest-place-map.md](../../quests/25-quest-place-map.md)
  rows for the six places.
- The six places' catalogue records and design records
  (`world/sources/sites/`, `world/sources/blueprints/`), their lore
  dossiers in `world/sources/lore/`, `world/sources/catalogue/type-recipes.json`,
  `world/sources/sites/design-groups.json`.
- Code: `worldgen/blueprint_interiors.py`, `interiors_index.py`,
  `esp_index.py` (`interior_cells`, `decode_ref`), `export_blueprints.py`,
  `export_places.py`, `compile_settlement.py` (the renderable-kind and
  door paths 16h added), `packages/game-core/src/settlement/` (README,
  `types.ts`, the layer), `packages/contracts/src/index.ts`
  (`PlottedPlaceInterior`), `packages/text-catalogue/`.

## Visual ingestion

Use the `kit-qa` skill's Sonnet protocol liberally (owner 2026-09-20; the
rule is in the 16h brief § Visual ingestion and is not repeated here):
every assembly sheet, every plan sheet, every interior-cell sheet (this
chunk adds an interior renderer to the skill: plan view and one eye-level
view from the arrival marker, with the light sources marked) and the few
studio shots that build the check-in packets go to a Sonnet agent with a
prompt that names the checks. Fable reads the reports and ingests at
most six images itself per part. A steer the owner gives on a picture is
first answered by a measurement where one can be written.

## Record reads (decision 0066)

This chunk is the class done right on interiors: the cell behind a door
is read from the plugin's own links (`exterior-interior-links.json`),
never guessed; the cell's contents, lights and their transforms are read
from the plugin (`esp_index`), never re-authored. Hold the same line on
the ground: every exemplar's water facts come from the graph-keyed
record; every piece's sink from 16h's `designedSinkM`; every mount from
`kit-mounts-mined.json`. A steer that a piece "looks sunk wrong" is
answered by re-measuring that asset, never by a per-place offset. The
interior fit rule for unlinked shells is a heuristic by necessity; the
record says `evidence: fit-rule` on those claims so Phase 12 can tell
them from tier A.

## Deliver

Each item names what proves it. A test is shown failing first wherever
an existing defect can make it fail. A design item is proved by its
sheet, its Sonnet report and the owner's answer.

### Part 1 — six places on paper, and the interior runtime (to owner check-in 1)

Nothing in part 1 touches the ground, the vegetation or the published
settlement bundle. Its output is records and pictures.

0. **Reconcile the first round's lessons and the interior research
   before designing anything** (owner 2026-09-20). The first build of
   these places (Phase 11, 2026-09-01 to 09-10) left a large written
   record; later decisions overruled parts of it. A `research` lane
   reads all of it and writes
   `docs/research/phase16/16i-lessons-and-interiors-reconciled.md`: one
   row per lesson, rule or claim, with its source and one of three
   verdicts: **kept** (still binding; cite where it now lives),
   **superseded** (by which decision, in one line) or **open** (a
   contradiction that needs an owner ruling; listed at check-in 1 with a
   recommendation).
   Fable rules on every open row it can from the decisions; the rest go
   to the owner. Sources, all of them:
   - Lessons: [world 96 §2](../../world/96-placement-playbook.md) (the
     lessons list), [0041 § Taste ledger, § Places have EXTENT, § Part
     3b/3c](../../decisions/0041-phase11-settlement-decisions.md), the
     [Phase 11 rounds archive](../../research/archive/phase11-rounds/)
     (the round log's owner steers, the Round A audit and owner-eye
     review, the plot review, the 2026-09-09 walkthrough, the gap plan,
     the promise ledger), [research/phase11/](../../research/phase11/)
     (the vibe-sheet asset audit and the critique folder), the
     [settlements audit](../../research/phase16/audit-settlements-delivered.md)
     §9 (the doors round), the backlog's settlement rows and
     [world 10](../../world/10-vvardenfell-lessons.md) Part I for the
     authoring cascade.
   - Interiors: [exterior-interior-linking-in-skyrim-mods.md](../../research/placement-settlements/exterior-interior-linking-in-skyrim-mods.md),
     [mined-interior-assembly-and-settlement-form.md](../../research/placement-settlements/mined-interior-assembly-and-settlement-form.md),
     [world 70 §47–50](../../world/70-dungeons-interiors.md) including
     the owner ruling of 2026-09-05 at §48 ("everything intended to have
     an interior must have a door; derive from our kits which buildings
     have interiors"), `tooling/asset-pipeline/pipeline/interiors_index.py`
     and the 23 `<kit>.interiors.json` files it writes (`interior:
     matched | tileset | shell | none`, the five ranked doorway
     evidences, the `radial` entrance), `worldgen/blueprint_interiors.py`,
     `world/sources/placement/exterior-interior-links.json` (plugin door
     links to furnished cells), `bmv-interior-assembly.json` and the
     placement README rows, decision 0062 and 0081.
   Known contradictions to rule on in that memo (Fable's ruling, to be
   confirmed by the owner at check-in 1): the kits' `matched` interior
   (a mod ships a sibling interior *mesh* for the shell) is not the same
   as 0062's tier A (a *furnished cell* a plugin links to the shell):
   a shell with both is tier A; a shell with a matched mesh and no
   furnished cell has its room shell but no furniture, so its door is
   `reserved` and Phase 12 furnishes the mesh; `tileset` shells are
   Phase 12's; the fit rule borrows a furnished cell only where a shell
   has neither. The 2026-09-05 "derive which buildings have interiors
   from the kits" ruling stands and is what `interiors_index.py`
   implements; the 2026-09-07 "one entrance per piece" ruling stands.

1. **Confirm the exemplar set and choose the sixth.** Keep the five
   (ruling 13). Choose one dungeon-kind record (`interior.kind` in delve,
   dungeon, warren, complex) as the sixth exemplar by these criteria, all
   measured: not `ownerGuided`; its family maps to a realisation recipe
   backed by a kit that exists (0062 §2, world 70 §47's recipe table);
   an entrance piece exists in a kit for its `entrance` type; it lies in
   or beside the region 16j is likely to pick (a non-city region with
   village, camp and dungeon types near one another; say which); its
   promises (world 70 §48) are complete. Prefer a root cavern or flooded
   cave mouth where the owner's own example applies (rocks around a cave
   entrance as `dressing-add`). Record the choice and the two runners-up
   with the numbers in the ledger; the owner may swap at check-in 1.
   Write the sixth's entry in `type-recipes.json` so the packet can count
   it.

2. **Re-author six blueprints as assemblies on the frozen ground.** For
   each place, from its design record, its lore dossier, its quest
   provisions and its type recipe: districts as one kit set each (C1),
   every building a composite from `kit-assemblies-mined.json` or a
   single piece the source authors use alone (never a piece nobody
   designed to stand alone), fronts with a reason (C8), doors on ways
   (C9), spacing and density inside the mined bands (C5, C6), the
   building mix the record's services demand (C7), verticality where the
   culture climbs (C14), the Hist and the shade trees named in `kept`
   (C15). Derive, never hand-place: the loop `rederive_terminals →
   street_router → blueprint_footprints --apply → --areas --doors` to a
   fixed point. **The two settlement grammars are proven here, not
   re-invented:** Imperial-fringe on Lilmoth, Hist-centred on Nine-Trunks
   and Mazzatun; a recipe that needed a hand decision is a gap in the
   recipe and is closed in the recipe (`type-recipes.json`), so 16j's
   agent does not meet it again. The `assetPlan` is corrected where the
   catalogue named a kit that cannot serve; a missing piece is a sourcing
   row, shown as a gap. Run `kit-qa` on every assembly (Sonnet reads each
   sheet); fix shared causes as rules.
   Each plan lists, per settlement, its tier row from decision 0098 and
   the shells it draws on
   ([building-asset-breadth.md](../../research/placement-settlements/building-asset-breadth.md)
   §3 reachability), and per building its assembly layers and kits and
   the evidence for each layer
   ([building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md)
   §2, §6 item 8). **Settle first:** the kit table (research §6 item 8,
   from the retired blueprints) gives Nine-Trunks mud and root and
   Mazzatun stilt and works; § The story calls Nine-Trunks "the stilt
   village" and Mazzatun "the stepped stone town". Rule on each place's
   grammar before any plan is drawn.
   King of the Murkmire (KotM) families and layout lessons per exemplar:
   the § 3.2 table of [king-of-the-murkmire-adoption-plan.md](../../research/placement-settlements/king-of-the-murkmire-adoption-plan.md). Lilmoth's plan takes KotM's 8.5 m
   street spacing and dock density only; `lilmoth.md` § Lilmoth in
   4E 201 (owner decision Q4) rejects KotM's Imperial-industrial Lilmoth.

3. **Every place's walkable set, as records** (16h's renderable kinds):
   ways from the road to every door, stairs to every deck, a hull at
   every berth of its class, the tapping camp's creek landing as
   authored, entrance pieces (the sixth's cave mouth; Lilmoth's sunken
   quarter and any `underwaterAccessDetail` entrance on the bank), pads
   only where the design record asks and the designed sink and stilts
   cannot serve (expect very few), the clearance by tier with `kept`
   named, plus the additive dressing each place wants with `why` and `sources`
   (rocks at the sixth's mouth; reeds at Nine-Trunks' dock; a boulder
   against a Mazzatun terrace foot; nothing that a compiled neighbour
   would not plausibly have). Reachability green on every door in the
   compile's dry run (`--out` scratch).

4. **Interior claims, one per door, as records.** For every door record
   in the six places decide and write `interiorClaim` and `interiorStatus`:
   - **Tier A, `evidence: plugin-link`**: the shell has a linked furnished
     cell in `exterior-interior-links.json`; claim that cell (cell id, plugin,
     door model, `interiorSizeM`). A shell whose kit record says
     `interior: matched` but has no linked furnished cell is **not** tier
     A: its door is `reserved` with `interiorShell: <mesh>` recorded so
     Phase 12 furnishes that mesh (item 0's ruling).
     First Argonian tier A candidates: the 18 KotM hut cells behind KotM
     hut shells (Keeba Hollow 5, Root-Whisper 6, Seekhat-Yol 7; KotM
     plan § 3.2); copy furniture and clutter only, drop actors, quest
     items, notes and books.
   - **Fit rule, `evidence: fit-rule`** (0062 §4 relaxed preference 1):
     the shell has no link; pick a furnished vanilla or mod cell whose
     plan extent is within 0.6–1.5× the shell's footprint on both axes,
     whose storey count matches, whose load-door count equals the shell's
     entrance count and whose use class matches the record's services
     (the use class comes from the furniture mix: beds and a bar = inn,
     counter and stock = shop, altar = shrine, hearth and beds =
     dwelling); record the measurements;
     a claim outside the ratio, with the wrong storeys or the wrong door
     count fails a test. Retexturing to the culture is Phase 12's; the
     claim says so. The use-class classifier is proved on a 12-cell
     labelled sample (inn, shop, shrine, dwelling; labels written first),
     then a fresh 12, before any claim is written ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 4).
   - **Reserved, `interiorStatus: reserved`**: everything else, including
     the sixth's cave door (its inside is Phase 12's first exemplar, a
     modular root cavern, 0062 §5). Ruling 13 bounds where tier A and
     fit-rule claims are made: the three built places and the camp's
     stage building; Wamasu Pond has no door.
   Mark the **D0 safe interior** each settlement owes (quests 20 §12) on
   its record. Add the empty `acousticProfile` / `lightingProfile` slots.
   Present the claims as one table per place on the plan sheet's margin:
   door, claim, evidence, cell, size ratio.

5. **The interior runtime, in a lane from day one** (code, no design;
   0062 §3, 0081). In `packages/game-core` (world-render if 10b has
   extracted it by then): the **interior load contract** (how an interior
   bundle is fetched by a door's `interiorClaim`, entered and left; the
   exterior stops being simulated at the `streamingBoundary`; water
   state, time, ownership and world-state keys survive the transition,
   80 §63); the **door transition** (use the door, fade, the interior
   scene with the character at the interior's arrival marker; use the
   exit door, fade, the exterior with the character at the door's
   `arrivalMarker`); the **interior bundle exporter** (every reference in
   the claimed cell with its transform through `esp_index`, furniture and
   clutter included; a base object with no kit asset is listed as a gap,
   never faked; acceptance is "reference count in the cell equals
   placements in the bundle minus the listed gaps"); **interior
   lighting** for a cell with no sun: extend `esp_index` to decode the
   cell's placed lights (radius, colour, the `XRDS`/`XLIG` fields) and
   the cell's lighting template (ambient, fog colour and range), so the
   lights are the makers' lights, not invented; the renderer applies them
   as local lights with the cell's ambient and fog, budgeted (measure the
   cost per cell, record it). The **reserved door** stays closed and shows
   the text-catalogue message (written here, `text-review`ed). The
   interior renderer added to `kit-qa` (plan view + eye-level from the
   arrival marker, lights marked). Tests: a door with a tier A claim opens
   into a bundle whose count matches the cell; a reserved door does not
   transition and the message key resolves; leaving returns the character
   within 0.5 m of the `arrivalMarker`; an interior bundle with an
   unlisted gap fails export. Interior navmesh bakes wait for 10b and the
   record says so. The light decode is checked on 6 claimed cells plus 6
   others against counts and colours read from the plugin first; no full
   plugin re-index as verification ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md) step 6).

6. **Plan sheets and the check-in 1 packet.** One plan sheet per place
   from 16h's renderer (footprints with fronts and door dots, ways, pads
   with their delta, clearance tiers, kept trees, stairs, berths and
   hulls, entrances, dressing, the interior-claim table in the margin),
   Sonnet-read against the C-rules, shared causes fixed; the six places
   on the 2D map (`?cat=1`, `?bp=1`); the six tier A or fit-rule interior
   cells rendered from the plugin data as interior sheets (plan +
   eye-level), Sonnet-read for "does this read as the room the record
   says". `docs:check`, preflight, commit by pathspec; the packet in
   PROGRESS.md § Waiting on user.

### Part 2 — built once and walked (to owner check-in 2)

7. **Apply the owner's check-in 1 steers as record edits** (a moved way,
   a smaller clearing, a swapped interior cell, a swapped sixth place);
   re-render only the changed sheets; each steer that generalises becomes
   a rule in the 0041 taste ledger and a 97 §C check before the build.

8. **Build once.** Apply the pad, clearance and dressing patches for the
   six places (local; receipts name only their tiles and chunks); compile
   (0 errors, 0 unexplained warnings); export the settlement bundle and
   the interior bundles; publish; `settlement_ground_control`; the chain
   ladder `[16i]` row confirmed with the stages actually delivered
   (expected: the six places through 16h's stages plus
   `export_interior_bundles`) and `DELIVERED_THROUGH="16i"`; one chain
   run from the freeze gate. Probes: non-zero geometry and zero grounding
   findings per place; a ray through every gate and open frame; every
   door reachable; every hull on its recorded level.

9. **Approach, reveal, wayfinding on the ground.** The 16-item checklist
   (openworld-approach-and-wayfinding §5) answered per approach per
   place: first-seen landmark, gate across the road, door visible from
   the way; each "no" is a record edit (a moved sign, a cleared
   sightline as a clearance patch, a lantern) or a rule, made before the
   walk.

10. **The check-in 2 packet.** Sonnet studio shots of each place's
    approach and one interior (few, legible, listed in the ledger); the
    walk list with URLs; frame-rate readings at Lilmoth on the three
    presets. Docs and PROGRESS.md.

### Part 3 — steers into rules, the city's second round, the skill (to owner check-in 3)

11. **Steers into rules.** Every check-in 2 steer becomes a rule in the
    0041 taste ledger and a check in 97 (§C or §G) or `blueprint_integration`,
    never a one-off edit; the places are re-derived from the rule, the
    changed patches re-emitted locally, the bundle republished. Lilmoth
    is the city: expect this second round to be mostly Lilmoth's (0062
    §9: cities are owner-guided in every phase).

12. **Skill v2.** Rewrite `.claude/skills/settlement-build/` from the
    steps the sixth place actually needed, in order, with the tools it
    ran: plans first (records, sheets, the Sonnet pass, the owner
    check-in) then build (patches, compile, export, publish, probes) then
    walk; the interior-claim decision as a step; the `kit-qa` calls; the
    `ownerGuided` refusal; per field, the record that supplies it (graph
    id, `water-meta` id, route line, `designedSinkM`, plugin link). Delete
    every v1 sentence that is no longer true. The "not automated yet"
    section lists honestly what still needed a hand (kit choice per
    parcel, waterOk reasons, the interior fit choice) so 16j can measure
    the gap.

13. **The type register and the close.** `type-recipes.json` records
    which type each of the six is and which grammar it proved; world 96
    §3's box 1 is ticked for each with the exemplar named; the 16j brief's
    Starting state replaced from this ledger's ending state; the ledger
    `docs/research/phase16/16i-ledger.md`; one decision record for the
    non-obvious choices (the sixth exemplar, the interior claims, the
    lighting derivation); PROGRESS.md; `docs:check`, preflight, commit by
    pathspec.

## Moved out of this chunk (recorded, not parked)

- Assembled interiors of every kind: Phase 12, on this chunk's load
  contract; the sixth exemplar's cave inside is Phase 12's first.
- Navmesh, exterior and interior: 10b.
- Occupants, loot, encounters, sound, balance, budgets: 13, 12b, 10c,
  14, through the typed slots the records carry.
- Every place beyond the six: 16j (one packet) and Phase 15.

## Acceptance

- Six places compile at 0 errors and 0 unexplained warnings; the bundle
  exports with no known-red rows owned by this chunk; the browser probe
  reports non-zero geometry and zero grounding findings; every door has a
  claim or a reserved state with evidence; every tier A and fit-rule door
  transitions into its cell and back; every reserved door shows its
  message; the three patch receipts name only the six places' tiles and
  chunks; skill v2 exists and v1's banner is gone; the type register
  names all six; three owner check-ins passed or accepted as good enough.
- Per settlement, the variety table of decision 0098 holds for the
  settlement's tier: signature share, distinct shells, top-shell share,
  ≥ 3 differences between two houses on one shell, pieces within 12 m
  per dwelling, and the minimum set per dwelling (door, light, roof
  detail, ≥ 5 personal clutter); no assembly repeats within 2 km or
  more than 3 times province-wide; every dwelling has windows unless
  [building-depth-and-variety.md](../../research/placement-settlements/building-depth-and-variety.md)
  §4 rules "none by design".

## Owner check-ins

Why three: check-in 1 is the cheap moment (a line on a plan moves in
minutes; after it, clearings are cut and pads levelled); check-in 2 is
the walk that finds what paper cannot; check-in 3 is the second round the
city needs and the skill on which the rollout depends. Each is a batch.

**Check-in 1 — the six plans, before any ground is touched.**
- The reconciliation memo's open rows: each a one-line contradiction
  between something written in the first round and something decided
  since, with a recommendation; say yes or no to each.
- One plan sheet per place: buildings and which way they face, doors on
  paths, stairs to decks, boats at landings, the cave mouth and any
  underwater entrance, the pads with their height change, the clearing by
  tier and the trees kept, the added dressing. Say where you would move,
  keep or cut anything.
- The interior table in each sheet's margin, in words: which buildings
  you will be able to enter, what kind of room is behind each door and
  where it comes from (a furnished room the mod already made; a
  borrowed furnished room that fits; or "closed for now"). Say if a
  building you care about is closed that should not be.
- The sixth place: the choice and the two runners-up, one line each; say
  if you would rather another.
- The six interior rooms as pictures (plan and standing view): does each
  read as the room the record says.
- The 2D map with the six (`?cat=1`).

**Check-in 2 — walk all six, inside and out.**
- Lilmoth `?view=character&x=3.61&z=6.38&t=12:00`: approach from the
  road, through the gate, along the spine to the market; enter two
  buildings and come back out onto the same doorstep.
- Nine-Trunks `x=4.97&z=3.76`: the ring, the decks by their stairs, the
  dock with a canoe on the water; enter the hearth-house.
- Mazzatun `x=1.99&z=1.34`: the terraces, the stair, one interior; the
  lanterns hang from something.
- Licensed camp `x=3.44&z=4.48`: the stage, the creek landing, the board;
  the stage building's inside.
- Wamasu Pond `x=2.47&z=4.40`: the hazard reads from the approach.
- The sixth (URL in the ledger): the cave mouth with its rocks, the
  closed door and its message.
- The clearing around one village: cleared and kept, not stamped.
- Frame rate low / medium / high at Lilmoth (the HUD shows the preset).

**Check-in 3 — the second round and the skill.**
- Re-walk what changed after your steers (list in the packet, mostly
  Lilmoth).
- The skill v2 file: readable in ten minutes; does the order of steps
  match how you want to be involved (plans → build → walk)?

## Gotchas

- Design is an act of judgement: Fable makes every layout, kit, interior
  and dressing decision; a `deliver` lane executes a fully specified
  place, never chooses.
- Cities and opening-scene places stay owner-guided (0062 §9); Lilmoth
  is the city here: expect two rounds, not one.
- Never hand-edit derived geometry; change the input and re-derive.
- One entrance per piece; a second is never invented.
- The cell behind a door comes from the plugin's link or the fit rule
  with measurements, never from a label.
- Lights come from the cell's own placed lights; if the decode is
  missing a field, extend the reader, do not guess a value.
- Every prose edit (the reserved-door message, place prose touched)
  through `text-review` in a separate agent before commit.
- Catalogue and remedy writers dump whole files: run them one at a time;
  placement tests serially before preflight.
- Patches are cheap and local: re-emit them when a parcel moves; never
  re-run `compile_scatter` or anything above `rederive_blueprints`.

## Delivery plan (written 2026-09-20; revise from the 16h ledger before part 1 starts and record departures in the ledger)

**Roles** as in the 16h brief (0079). Design is Fable's; lanes are
`deliver` on disjoint files with a time budget each and a named gate.

**Catalogue runs** follow the CLAUDE.md golden rule "Prove on a sample,
validate on a fresh batch, scale once" ([16h catalogue audit](../../research/phase16/16h-catalogue-wide-steps-audit.md)). The place lanes
share one `kit-qa` output directory with stamps, so no template renders
twice, and the Sonnet protocol is tuned on 3 sheets with verdicts written
first before each sweep, two loops at most.

**Part 1 (`deliver 16i part 1`).**
- Step 0: `routing-audit` on this brief against the 16h ending state;
  confirm the 16h contract (§ What 16i needs from 16h) with `find`
  look-ups; stop on a gap. At the same time, one `research` lane writes
  the reconciliation memo (item 0); Fable rules on its open rows before
  step 1 and carries the rest to check-in 1.
- Step 1 (Fable): choose the sixth (item 1) with `research` measuring the
  candidates; decide each place's districts, kit sets, grammar and the
  interior claim policy per door (item 4's rules applied by Fable),
  reading the kept lessons as constraints.
- Step 2, lanes at once:
  - A `deliver` (code, independent of design): the interior runtime
    (item 5): load contract, door transition, interior bundle exporter,
    `esp_index` light decode, interior lighting, the reserved door,
    the `kit-qa` interior renderer. Files: `packages/game-core/src/interior/`
    (new), `esp_index.py`, `export_interior_bundles.py` (new),
    `packages/text-catalogue`, the skill.
  - B–G `deliver`, one lane per place, each with Fable's full place
    specification (districts, assemblies by template id, fronts with
    reasons, ways, stairs, berths, entrances, pads, clearance tiers and
    `kept`, dressing with `why` and `sources`, the interior claim per
    door): author the blueprint and records, run the derive loop to a
    fixed point, dry-run the compile to scratch, run `kit-qa` on every
    assembly and hand back the Sonnet reports. Files: that place's
    blueprint and patch records only.
  Gate: every lane's dry-run compile green with every door reachable.
- Step 3 (Fable): read the Sonnet reports, fix shared causes as rules
  (`deliver`), re-run the affected lanes' derive loops; render the plan
  sheets and interior sheets (`run`); Sonnet pass; `docs:check`; preflight;
  commit by pathspec; the check-in 1 packet.

**Part 2 (`deliver 16i part 2`).**
- Step 0: the owner's steers as record edits (Fable decides, `deliver`
  edits per place lane); rules to the taste ledger and 97.
- Step 1: one `run` job: apply patches, compile, export settlement and
  interior bundles, publish, ground control, the ladder row and
  `DELIVERED_THROUGH`, one chain run from the freeze gate; probes.
- Step 2, lanes at once: one `deliver` per place answering the approach
  checklist on the ground (item 9) and making the record edits Fable
  approves; `run` (Sonnet) studio shots for the packet.
- Step 3: `docs:check`, preflight, commit by pathspec, the check-in 2
  packet.

**Part 3 (`deliver 16i part 3`).**
- Step 0: the steers into rules (Fable), applied by `deliver` lanes per
  place; local re-emit and republish as one `run` job.
- Step 1, two lanes at once: H `deliver` skill v2 from Fable's step list;
  I `deliver` the type register, 96 §3 boxes, the 16j Starting state,
  the ledger, the decision record.
- Step 2: `docs:check`, preflight, commit by pathspec, the check-in 3
  packet, PROGRESS.md.

**Order of the owner's answers.** A steer at check-in 1 is a record edit
and a sheet. A steer at check-in 2 is a rule, a local re-emit and a
republish; never the chain above `rederive_blueprints`. A steer at
check-in 3 on the skill is a skill edit; on a place is one more local
round.

## The story, in plain English (for the owner)

**Where we are.** The previous chunk sharpened every tool: building
pieces sit and face right; doorways are open; paths, stairs, boats and
entrances can be placed. Small local edits can level a pad, clear the
trees under a village or add rocks at a cave mouth without rebuilding
anything else. Those tools have not yet been used to design anything.

**What this chunk does.** It builds the first six places properly, by
hand. It writes down exactly how, so that the next chunk can do the same
without a person in the loop. The six are the five you already know
(Lilmoth the city, Nine-Trunks the stilt village, Mazzatun the stepped
stone town, the sap-tapping camp and the Wamasu pond hazard) plus one
dungeon-type place, a cave or root cavern with an entrance, chosen here
so the rollout has an example of that kind too.

*Part 1: on paper.* First, everything we learned the first time we
built these places (a long list of your steers and the agents' own
lessons, plus a large body of research on which room goes behind which
building) is read again and sorted into "still true", "overruled since"
and "you need to decide", so that none of it is lost and none of it is
followed by mistake. Then each place is laid out as a drawing: where every
building goes and which way it faces, the paths to every door, the stairs
up to decks, the boats at the landings, the cave mouth with its rocks, the
small pads, the clearing in the trees with the trees we keep. Beside each
drawing is a short table saying which buildings you will be able to enter
and what is behind each door. Going through a door works as it does in
Skyrim and Morrowind: you use the door, arrive inside a separate room
and come back out onto the same doorstep. The rooms come from three
places: a furnished room the mod maker already built for that building
(copied exactly), a furnished room borrowed from the base game that fits
the building's size and purpose, or "closed for now" with a short message
when you try the door (those rooms are built much later, in the interiors
phase). The cave's inside is closed for now too. Meanwhile the code that
does the door trick is built in parallel, since it does not depend on the
drawings. **Your first check** is the short list of things you need to decide
from the first round, the six drawings, the door tables and pictures of
the rooms. This is the cheap moment to move a path or shrink
a clearing; after it the trees are cut.

*Part 2: built once and walked.* We apply your steers, cut the clearings,
level the pads, place the buildings, boats and rocks, then connect the
doors. Then we check every approach on foot as a player would (can
you see the gate from the road, does the door face the path) and fix what
paper missed. **Your second check** is a walk through all six, inside and
out.

*Part 3: your steers become rules and the recipe is written.* Anything
you said on the walk is turned into a rule that the tools enforce
afterwards, never a one-off fix. The places are rebuilt from the rules. Lilmoth,
being a city, gets this second round in full. Then the recipe for building
a place, plans first, then build, then walk, is written down as a skill
from the steps the sixth place actually needed. **Your third check** is a
short re-walk of what changed and a read of that recipe.

**What we have at the end.** Six finished example places you have walked
and approved, doors that work, a handful of furnished rooms, every other
door politely closed until the interiors phase, plus a written recipe
that a fresh agent can follow. The next chunk tests that recipe on a whole
region without you, then you walk the result.
