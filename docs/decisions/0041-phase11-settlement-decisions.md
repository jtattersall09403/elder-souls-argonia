# 0041 — Phase 11: settlement/location system — hub + delivery plan

**Date:** 2026-09-01 · **Status:** delivery plan authored (planning agent, from
owner directives 2026-09-01); owner decisions land here as the phase runs.

> ## RUN-BOOK — start here if you are delivering Phase 11
>
> Read this doc, then [00-core](../world/00-core.md), then the Phase 11
> section of [95-build-sequence.md](../world/95-build-sequence.md) (§86,
> "Phase 11" — the binding deliverable list), then
> [40-causal-authoring.md](../world/40-causal-authoring.md) §30–32 (the
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
> ### What is already in hand (verified 2026-09-01 — build on, don't redo)
>
> - **Mined form tables** (Phase 10 prep): `world/sources/placement/`
>   `bmv-settlement-form.json`, `bmv-valenwood-settlement-form.json`,
>   `vanilla-tamriel-settlement-form.json`, `bmv-interior-assembly.json`
>   (snap module ≈ 1.82 m, statistical); digest in
>   [mined-interior-assembly-and-settlement-form.md](../research/mined-interior-assembly-and-settlement-form.md);
>   miners `worldgen/mine_settlements.py` / `mine_interiors.py`.
> - **Lore**: [settlement-register.md](../../world/sources/lore/extrapolation/settlement-register.md)
>   (magnitude ladder M1–M5 *in structures*, the eight majors, secondaries,
>   Arena-name candidates), per-settlement Hist placement
>   (`topics/hist-placement.md`), the two never-blended building cultures
>   (`topics/material-culture.md`), guilds, the Owing.
> - **Anchors**: `world/sources/anchors/settlement-anchors.json` — owner
>   approved *broad* positions at Phase 2; exact siting is THIS phase's job
>   (nudge within `toleranceUV`, owner steers — see Stage 1).
> - **Routes/danger/cultures**: Phase 4 outputs via `compile_society.py`
>   (roads, boat lanes, danger bands, territories) — Phase 11 re-authors on
>   top (docks, tolls, ferries, root transit; the 4-station rootworm net is
>   a placeholder to replace).
> - **Research**: [marsh-settlement-morphology.md](../research/marsh-settlement-morphology.md)
>   (siting menu), [kit-level-design-and-layout-generation.md](../research/kit-level-design-and-layout-generation.md)
>   (Bethesda kit craft), [xanmeer-mesoamerican-reference.md](../research/xanmeer-mesoamerican-reference.md),
>   [morrowind-content-density.md](../research/morrowind-content-density.md)
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
> Read [engineering-standards.md](../engineering-standards.md) (decision
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
> [game-buildout-register.md](../game-buildout-register.md) ("At Phase 11
> kickoff" block + the Phase-11 rows): the `STATION` socket type, per-body
> `WaterBody` records, timetable data + urban water-taxi edges on the
> travel-service graph, the prior→roster demographic rule (92 §84), the
> vastei tutorial-scene flag, talk→service-menu as a small contract (not a
> ferry hack), boat-nav clearance as an authoring rule, the ~10 hero Hist
> placed with stable ID + power slot, and demographics expressed as an
> authoring rule. Fold these into the schema/deliverables in Part 0/Part 4 —
> they are owner rulings, not suggestions.
>
> - **Subagent fan-out is owner-approved** (as in Phase 10): low effort for
>   all subagents; parallelise self-contained work (mining, validators,
>   quest-brief drafting, asset sourcing); keep the blueprint
>   schema/compiler in one pair of hands. Concurrent agents share this
>   worktree — pathspec-only commits.

## Delivery plan

### Part 0 — foundations (before the owner sees anything)

Build the spine that every round rides on. All of it is game machinery or
tooling; place it per the packages rule and the existing worldgen layout.

1. **Site survey tooling — know the land before proposing anything**
   (owner directive, 2026-09-01). A settlement proposal made without
   reading the terrain is a guess; build a one-command **site dossier**
   generator that, for any coordinate + radius, pulls everything the repo
   already knows into one structured artefact: elevation/slope/aspect
   stats and profiles (refined heightfield), hydrology (channels, water
   levels, wet-season/flood exposure, salinity), region class + climate
   fields, danger band, existing routes/boat lanes and distances to
   neighbours, current vegetation (density, species mix, canopy from the
   compiled scatter), viewsheds (what landmarks are visible from here,
   where this site is visible from), and the nearest mined-form analogue
   (which BM&V cluster shape fits this ground). The dossier feeds THREE
   consumers: the agent's own siting/layout reasoning, the causal model
   ("why here" answered from the land, per module 40 §28), and the owner's
   Round A packet (the human-readable rendering of it — maps + a short
   plain-English read of the ground). Every siting or layout proposal put
   to the owner cites its dossier.
2. **Blueprint schema, in code.** Turn module 40 §30's `SettlementBlueprint`
   (+ `GenerationProvenance`, and the quest `QuestWorldProvision` interface
   from quests 20 §13) into real typed schemas. Semantic authoring
   throughout: S-ladder refs for actors, tier+provenance for loot.
3. **Compiler, walking skeleton.** A deterministic
   blueprint → compiled-settlement pass in `tooling/world-generation/`:
   siting on real terrain, district/parcel/route grading, building
   placement as kit assemblies (statistics from the mined form tables —
   counts, spacing, water/road orientation), docks/boardwalks on real
   water, exports the same bundle/manifest shapes the studio already
   streams. Don't gold-plate: it needs to compile ONE settlement well
   before it needs options. The compiler owns **vegetation clearing**
   (owner directive, 2026-09-01): settlements may clear trees and plants
   from their footprint to make layouts work — that is what real builders
   do. The blueprint declares its cleared areas (building parcels, routes,
   commons, sightlines) and its *kept/managed* vegetation (the Hist tree
   above all, shade trees, reed beds worked as a resource); the compiler
   emits clearance masks that the scatter compiler and the runtime
   groundcover ring respect, and the affected chunks' vegetation is
   recompiled. Clearing is graded, not binary — a hard-clear core, a
   worked/thinned fringe, wild beyond — so settlements sit *in* the marsh
   rather than on a cut-out disc.
4. **Review artefact renderers** — the owner's viewport, so build early
   and make regeneration one command each:
   - *Blueprint map*: top-down annotated diagram (districts, routes,
     docks, landmarks, water, contours) drawn over a terrain hillshade
     crop. Seconds to regenerate; this is the layout-iteration medium.
   - *Massing stills*: headless Blender renders of the compiled settlement
     GLB — one ortho, 3–4 player-eye views (extend `render_preview.py`).
   - *Deployed walk*: the compiled settlement streamed in the studio at
     real vegetation/light/water (the final-feel medium; push to Pages).
5. **Asset kits, early** — kits gate the compiler's output being judgeable.
   Vault first (BM&V architecture is the house style; Tropical Skyrim;
   xanmeer tileset per module 90 §74.2), then source the module 90 §75/§80
   priority mods (Argonian mud hut, Marsh-Rest, xanmeer kit, clutter)
   with the Nexus key. Run the flora-kit pipeline pattern: registry →
   build a `settlement-v1` kit → vet. Respect the two-culture kit rule in
   `material-culture.md` — the kits must never blend.

### Part 1 — owner kickoff (first involvement point)

One batched decision round, presented with real material, not abstractions:

- **Exemplar settlement**: propose 2–3 candidates from the register with
  pros/cons. Selection logic: an M3-ish secondary with rich lore and full
  system coverage (Hist tree, docks/water relation, one xanmeer or ruin,
  quest provisions from §12b, both a wet and a dry edge) — big enough to
  exercise districts and grammar, small enough to iterate fast. Justify
  against the register; the owner picks.
- **Contrast set** (§85.4 obligation): propose 2–3 contrasting instances —
  different region class, culture (the Imperial-fringe grammar needs one),
  magnitude and danger band.
- **Review-medium confirmation**: show one *sample* of each artefact type
  (a blueprint map, a Blender still, a studio link) for a rough mock
  settlement, so the owner picks the media mix knowing what they look like.
- Any genuinely multi-viable grammar question (per the steer rule in
  CLAUDE.md). Everything else: decide, record, move.

Record all answers in this doc as Q&A sections (0036 pattern).

### Part 2 — the steered exemplar loop (owner hands-on)

Short rounds on the ONE exemplar. Each round = focused agent work ending in
a small visual packet plus 2–4 plain-English questions. Do not batch rounds.

- **Round A — siting + layout.** 2–3 candidate exact sitings within the
  anchor tolerance (terrain crops with the anchor marked), then the causal
  model and blueprint map(s). Owner steers: where exactly, district shape,
  route logic, dock placement, landmark positions. Iterate maps until the
  layout is approved — regeneration is cheap, so offer variants.
- **Round B — massing.** Compile buildings, render ortho + player-eye
  stills. Owner steers: building mix, scale/silhouette, density, kit reads,
  Hist-tree prominence, how "the village could move" reads.
- **Round C — dressed walk.** Deploy; owner walks it with real vegetation,
  light, water. Steers: feel, approach reveals, wayfinding, edges.
- Repeat any round as needed. **After every steer, write the generalised
  rule into the "Taste ledger" section of this doc** — the ledger is what
  autonomous delivery later inherits, so a steer that only fixes the
  exemplar is a steer wasted. Route fixes to the grammar/compiler, not to
  hand-edits (the exemplar must remain reproducible from its blueprint —
  it becomes the compiler's first regression fixture).
- Exit: the owner explicitly declares the exemplar good and the flow
  trusted. Ask them directly; do not infer it.

### Part 3 — grammars, written down

Concurrent with Part 2, converging as steers land: the **Hist-centred** and
**Imperial-fringe** settlement grammars as data + rules (module 95's
deliverables), grounded in the mined form tables, the morphology research,
material-culture, and the taste ledger. Plus the **location-orphan
validator** (module 40 §32 list, including the §12.3b reward clauses) run
in the compiler pipeline, not as advice.

### Part 4 — autonomous delivery (after graduation)

Everything below runs without owner rounds; one mid-check only if a
contrast instance forces a genuinely new grammar question (blueprint maps
by preference — cheapest medium that answers it).

1. **Contrast set**: author + compile the 2–3 agreed instances through the
   same blueprint path.
2. **Quest co-design loop** (§65b, quests 90) for the exemplar + contrast
   packets — the first live test of the loop. Spawn quest-side subagents
   for the novelty check and brief drafting; reconcile; land index rows in
   the same change; respect tier-0 protection and the tie-break rules.
3. **Density + reward budgets** per packet: the module 95 POI numbers plus
   §12.3b reward coverage (terrain query for notable hard-to-reach
   landforms; every one carries a reward; validator enforces).
4. **Travel services, world content**: ferry/boat-owner service graph,
   re-authored root-transit network (replace the 4-station placeholder;
   Gideon = wintertide-only), the Owing at every tolled crossing, Reed
   writ enforcement points. Talk-pay-arrive semantics recorded as data.
5. **The §12b roster**: work through quests 20 §12b's named-settlement
   requirements for every settlement this phase touches;
   `QuestWorldProvision` records for each substantial location.
6. **D0 authoring** (settlement interiors + local halos; Helstrom D0 in
   its band-5 field) and the **player-stronghold site reservation**.
7. **Validators + studio support**: the module 85 §69 settlement probes
   that pay for themselves now (orphan parcels, dock/water access,
   inaccessible doors, overlapping foundations); settlement/POI search in
   the studio if cheap (§67).

### Part 5 — wrap

- **Freeze checklist**, explicit and deferred: per packet, the 10b probe
  list, the 10c validation list, and the §65b completeness check — so the
  10b/10c agents can freeze packets without re-deriving this phase.
- Batched owner review: what to walk, what to check, how to feed back —
  including an FPS read (settlements + vegetation together is the new
  worst case).
- Round records in this doc (defect → cause → fix, 0036 style); PROGRESS
  row and *Waiting on user* current; docs README router updated for new
  files; credits for every sourced mod.

## Taste ledger (grows during Part 2 — generalised owner steers)

*(empty — first entries land in Round A)*

## Owner Q&A (grows from Part 1)

*(pending kickoff)*
