# 0041 — Phase 11: settlement/location system — hub + delivery plan

**Date:** 2026-09-01 · **Status:** delivery plan authored (planning agent, from
owner directives 2026-09-01); owner decisions land here as the phase runs.

> ## RUN-BOOK — start here if you are delivering Phase 11
>
> Read this doc, then [00-core](../world/00-core.md), then the Phase 11
> section of [95-build-sequence.md](../world/95-build-sequence.md) (§86,
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
>   [mined-interior-assembly-and-settlement-form.md](../research/mined-interior-assembly-and-settlement-form.md);
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

**Shape (owner directive, 2026-09-01): breadth first, then depth.** Do NOT
place one thing at a time and discover late that the province has dead-ended
— derive and plot *everything* at a shallow depth first, review the whole
picture, and only then author exemplars deeply. Parts 1–4 are province-wide
and cheap (they are text, data and dots on a 2D map, not geometry); Parts
6–8 are deep and per-place.

**Planning agent's steer on "derive the whole province at once": yes, do
it.** It is the right call and it is not expensive — the catalogue is data,
and the big-picture properties the owner cares about (coverage, coherence,
variety, density, distribution) are *only* visible in aggregate. The cap is
**depth, not breadth**: every place province-wide gets a catalogue record
(type, siting logic, importance, vibe, asset plan, why); nothing gets
interiors, quest text, loot tables or blueprints until its packet is
authored. If the catalogue turns out to be enormous, fan out Opus subagents
by region or by place-family rather than reducing coverage.

### Part 0 — foundations (before the owner sees anything)

Build the spine that every later part rides on. All of it is game machinery
or tooling; place it per the packages rule and the existing worldgen layout.

**Sequencing (2026-09-02): only items 1, 2 and 6a gate the catalogue.**
Items 3–5 (schema, compiler skeleton, renderers) gate nothing before Part 6
— run them concurrently with Parts 1–4, kept in the one schema/compiler pair
of hands while catalogue derivation fans out. Do not make the owner's first
touchpoint wait on compiler work it doesn't need.

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
   review packets. Every siting or layout proposal cites its dossier.
2. **Province terrain scour** (feeds Part 1). The same machinery run
   province-wide instead of per-site: sweep the heightfield, hydrology and
   region rasters for **naturally interesting ground** and record it as
   candidate-site data — summits and prominent peaks, saddles, ridge
   ends, cliff benches, ravines and box canyons, dead-end gorges, enclosed
   clearings, islands and islets, oxbows and confluences, river mouths,
   coves and inlets, natural harbours, sinkholes, karst, waterfalls,
   spring heads, isolated highs in flood plain, narrows/chokepoints,
   fords, land bridges, and every landform §12.3b calls hard-to-reach.
   Score each for prominence, accessibility (how much effort to reach),
   concealment, visibility/viewshed, and water relation. This is the
   province's supply of *interesting places*; Part 1's demand is matched
   against it in Part 3. Deterministic and seeded (standard 6).
3. **Blueprint schema, in code.** Turn module 40 §30's `SettlementBlueprint`
   (+ `GenerationProvenance`, and the quest `QuestWorldProvision` interface
   from quests 20 §13) into real typed schemas. Semantic authoring
   throughout: S-ladder refs for actors, tier+provenance for loot.
4. **Compiler, walking skeleton.** A deterministic
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
   rather than on a cut-out disc. **It also owns ground fitting — see the
   "Slopes and uneven ground" gotcha below; treat that as a first-class
   part of the skeleton, not a polish item.**
   **Clearing gotchas (owner question, 2026-09-02) — binding on the
   clearing integration:** (a) colliders are safe by construction ONLY
   because they derive at runtime from the same compiled instance list
   that renders — so clearing MUST work by recompiling affected chunks,
   never by hiding meshes; (b) the **runtime groundcover ring** generates
   grass from rasters at runtime and must read the clearance mask itself,
   or grass grows through floors; (c) **all vegetation tiers rebuild in
   the same compile** for affected chunks — near scatter recompiled while
   the distant billboard layer isn't gives ghost trees that vanish on
   approach (same rule as building LOD). The skeleton emits masks +
   affectedChunks; the scatter-compiler consumption of them is open work.
   **Phase 10 caution (2026-09-02): tree-collider work is still in flight**
   — a parallel agent is finalising trunk solidity (round 9+ did not pass).
   Design the clearing-mask interface against the scatter compiler's
   *data* contract (compiled scatter + collider budget inputs), don't
   couple to collider internals mid-change, and expect to recompile
   affected chunks once that lands. Pathspec-only commits; keep clear of
   the vegetation-collider files that agent owns.
5. **Review artefact renderers** — the owner's viewport, so build early
   and make regeneration one command each:
   - *The plotted province map* (Part 4's medium): the 2D province map with
     every catalogue place plotted, filterable by tier/type/region, each
     dot hoverable/clickable for its record and its **why**. Build it in
     World Studio's existing 2D map view (module 85 §67) — dots and a
     detail panel, NOT the heavyweight 3D city markers.
   - *Blueprint map*: top-down annotated diagram (districts, routes,
     docks, landmarks, water, contours) over a terrain hillshade crop.
     Seconds to regenerate; the layout-iteration medium.
   - *Massing stills*: headless Blender renders of the compiled settlement
     GLB — one ortho, 3–4 player-eye views (extend `render_preview.py`).
   - *Deployed walk*: the compiled settlement streamed in the studio at
     real vegetation/light/water (the final-feel medium; push to Pages).
6. **Assets — inventory first, kits later (split 2026-09-02** so kit builds
   stop gating touchpoint ①):
   - **6a. Browsable asset inventory** — what building families, materials,
     palettes, props and landmark pieces we actually have or can source:
     vault first (BM&V architecture is the house style; Tropical Skyrim;
     xanmeer tileset per module 90 §74.2), plus the module 90 §75/§80
     priority mods as *sourcing candidates*. Part 1 writes descriptions
     *against* this, so we design for the breadth we own rather than
     inventing what we lack. This is a survey, cheap, parallelisable.
     **DELIVERED 2026-09-02:** `world/sources/placement/settlement-asset-inventory.json`
     (schemaVersion 1, registered) + digest
     [settlement-asset-inventory.md](../research/settlement-asset-inventory.md).
     **Revised same day (round 2)** after owner feedback that round 1
     under-searched: a full-vault sweep plus Nexus research. Headline for
     Parts 1–2 — we can build stilt/boardwalk/dock/platform settlements and
     Imperial stone-timber towns well, **and now also a Shadowfen mud
     culture, the Argonian prop language and a Hist tree** (Mud Mother Grove
     landed in the vault). The xanmeer "exterior" set turned out to be a
     *terrace kit* — stacking terraces IS a stepped pyramid — so that gap is
     ornamental, not structural. **Still genuinely missing: rafts and canoes
     (every hull we own is keeled and foreign — now the top sourcing job),
     grave-stakes, mud-hut variety, and ornate monumental frontage.**
     Two new blockers for the owner: **Darkwater Den is permission-blocked
     for public work**, and several ideal sources carry a "no porting to
     other games" clause that our browser engine arguably trips — that needs
     an owner ruling, not an agent's judgement.
   - **6b. Kit sourcing and builds** — download the priority mods
     (Argonian mud hut, Marsh-Rest, xanmeer kit, clutter) with the Nexus
     key, registry → build a `settlement-v1` kit → vet, per the flora-kit
     pattern. Needed by Part 6, not Part 1 — run it in parallel (subagent)
     while the catalogue is derived. Respect the two-culture kit rule in
     `material-culture.md` — the kits must never blend. Credits in root
     README in the same change.

### Part 1 — DERIVE: what places must exist, province-wide

Breadth-first derivation of the full demand list. This is the macro rung of
the placement ladder (module 40 §28b) executed once, for the whole province,
before anything is sited.

**Derive from every source, systematically:**

- **named canon** — the settlement register, quests 20 §12b's named
  settlements and their required features, lore dossiers, UESP;
- **what canon implies** — institutions imply their buildings and their
  abuses; trades imply their infrastructure; beliefs imply their sites;
  history implies its ruins and its abandoned predecessors; every era layer
  (Ayleid/Barsaebic, Imperial, post-Flu, post-Umbriel, current) leaves
  physical residue;
- **the quest plan** — every quest's world provisions (see the quest fold-in
  below); quest-required places enter the catalogue as hard rows;
- **demographics and economy** (module 92) — populations need food, water,
  fuel, trade, defence, worship, burial, labour, law, waste, and travel;
- **ecology and danger** (module 20 §16, workstream L's ecology feed) —
  habitats imply lairs, hunting camps, culls, quarantines;
- **the land itself** — Part 0's terrain scour: interesting ground is
  *demand-generating*, not just supply. A spectacular hidden cove should
  make you ask "what would be here?"

**Build a hierarchical taxonomy** (class → family → type → variant), not a
flat list: e.g. *settlement* → *marsh village* → *stilt village*, *raft
village*, *hammock village*, *tree-platform village*; *ruin* → *xanmeer*,
*Imperial*, *Ayleid*, *drowned village*; *camp* → *bandit*, *pirate*,
*hunter*, *pilgrim*, *refugee*, *slaver/Owing*, *poacher*, *prospector*;
*works* → *toll*, *dock*, *ferry stage*, *kiln*, *saltern*, *fishery*,
*logging*, *mine*, *plantation*; *sacred* → *Hist site*, *shrine*,
*grave-stakes field*, *ancestor site*, *cult site*; *lone* → *hermit*,
*hunter's lodge*, *watchtower*, *lighthouse*, *wreck*, *cache*, *grave*,
*standing curiosity*. **These are examples, not the list — see the breadth
rule below.**

**Give each type a recipe, not just a name.** The research doc distils
Bethesda's unmarked POIs into a **five-slot schema** worth using literally:
① a long-range cue (smoke plume, banner, silhouette) that says "something
is there"; ② a small population with one elevated/ranged member; ③
domestic props that narrate who lives here; ④ a free reward plus a gated
one (locked, hidden, or guarded); ⑤ optionally a satellite node 200–400 m
away that resolves the implied story. Record per-type deltas from that
baseline in the catalogue.

**Derive counts, not just kinds — in three tiers, not one number.** A single
POI-density figure is a design error
([openworld-place-distribution-and-siting.md](../research/openworld-place-distribution-and-siting.md)):
every successful open world runs a **fine tempo layer** (something every
~60–100 s of travel; Skyrim ~14/km², Vvardenfell ~18/km², BotW's Koroks
~15/km²) over a **much coarser destination layer** (BotW shrines ~2/km²,
~3.5 min apart), plus **landmarks** visible from far off. Derive all three
separately, and check them separately. Work from the binding numbers in
module 95 Phase 11 (18–22 named POIs/km² D0–D3, 8–12 D4–D5, something named
within ≤300 m of every road and boat lane; quests per settlement by
magnitude) and
[morrowind-content-density.md](../research/morrowind-content-density.md).
The catalogue must be *large*: province-scale coverage at Morrowind density
is thousands of entries, and that is the point. Fan out Opus subagents by
region or family to get there.

**Derive variety deliberately** — within families and between them; see the
distinctiveness ladder and the breadth rule below.

### Part 2 — DATA: the place catalogue

Record the derivation as one machine-readable catalogue (per-region files,
stable IDs per standard 2, `schemaVersion` per standard 7, seeded and
deterministic per standard 6). It is the phase's central artefact: Parts 3–8
all read and update it, and Phases 12/13/15 inherit it.

**Each place record carries (design this properly, then freeze the shape):**

- **identity** — stable ID, name (or the naming rule + language register if
  unnamed yet), aliases;
- **classification** — taxonomy class/family/type/variant; magnitude class;
  status (active / ruined / abandoned / seasonal / drowned / contested);
- **provenance** — canon-named | lore-implied | quest-required |
  geography-derived | density-fill, with sources cited and a confidence;
- **the why** — founding cause, site advantages, current occupants and
  their motivations, pressures, and what would make it change or die
  (module 40 §28's model, in short form at this stage);
- **siting** — region(s) and region classes it belongs in, its siting
  grammar reference, hard constraints vs preferences (water relation,
  slope, elevation, concealment, route relation, neighbour spacing), and —
  once Part 3 runs — its plotted location, the candidate sites considered,
  and **why this site won**;
- **relations** — depends-on / supplies / rivals / patrols / tolls /
  visible-from / reached-via, and the travel-service edges it implies;
- **people and power** — culture, faction/ownership, occupant roster as
  S-ladder semantic refs, notable NPC slots;
- **danger and access** — danger tier, traversal modes to reach it
  (walk/boat/swim/climb/fast-transit) and the required fallback per quests
  20's traversal rule; effort-to-reach score;
- **reward profile** — §12.3b: what the player gets for coming, of which
  type, at roughly what value tier;
- **visual and vibe** — the look, in words: silhouette language, palette,
  materials, signature feature, condition/wear, mood, light, sound and
  smell cues, and what the *approach* reveals. Grounded in lore/research;
- **asset plan** — the actual kits/mods/pieces this place will be built
  from (written against Part 0's asset inventory), so the catalogue is
  feasible by construction and the province visibly uses the breadth we
  own;
- **discovery** — how the player learns it exists: sightline, road
  proximity, rumour, document, or nothing at all (diegetic only — no
  markers);
- **quest hooks** — provisions requested/owned, tier ownership (tier-0
  protection respected);
- **build-out keys** — the forward-compat slots from the run-book block:
  discovery pointer, letter/rumour pool key, deed-counter keys, socket
  lists (typed, may be empty). IDs in this catalogue are permanent — cut
  places change `status`, never disappear;
- **complexity budget** — a feasibility flag: nothing may require
  placement rules or scripting beyond Morrowind's level (owner rule); most
  places are compiled semi-procedurally, so each must be *both*
  interesting *and* simple to build;
- **importance tier** — drives Part 3's plotting order and later authoring
  effort;
- **workflow status** — derived → plotted → authored → frozen.

**Then have it critiqued, before any plotting** (Opus subagents, adversarial
briefs, in parallel): (a) coverage and density against the numbers; (b)
hierarchy and taxonomy quality; (c) variety within and between families —
does this read as one province with distinct regions, or as a list?; (d)
lore fidelity and era correctness; (e) **feasibility** — anything demanding
more than Morrowind-level placement/scripting complexity, or assets we do
not have; (f) *what is missing* (the completeness critic — its whole job is
to name absent families, unrepresented economies/eras/ecologies, and
monotony). Fix, then produce **a short owner-facing summary** (counts by
family and region, the variety story, the load-bearing choices, the vibe
spectrum with examples) and take the owner's steer on vibe and any
load-bearing calls. Text is fine here (owner ruling 2026-09-02) — but where
a visual is *fast and cheap* (asset-inventory stills already rendered by
the pipeline, a palette strip per region), attach it; never build new
machinery just to illustrate the summary.

**Size the catalogue on real numbers** (CORRECTED 2026-09-02 by the
coverage critique — the earlier 600–740 applied the fine-tempo rate to ALL
land and was wrong): authored land is 33.52 km², splitting **D0–D3
20.59 km² / D4–D5 11.93 km²**, so the binding budget is
**18–22 × 20.59 + 8–12 × 11.93 ≈ 466–596 poi records**, allocated by each
zone's land share and danger mix — never by agent effort. The critique
found 729 records with half of them on 18 % of the land; the repair
directive below rebalances via `status: deferred` (IDs permanent, records
parked for later packets), retypes and targeted top-ups.

### Critique round + repair directive (2026-09-02)

Five adversarial critics, five PASS-WITH-FIXES verdicts; full findings in
`docs/research/phase11-critique/` (coverage-density, variety-
distinctiveness, lore-fidelity, feasibility, completeness). Schema
hardening already landed (commit `d8669d7`): canon-named/canon-derived
provenance split, season/eraLayers/densityLayer/entrance/underwaterAccess
vocabularies (strict-mode until the back-fill completes), name-required,
citation lint, asset-alias hook, `deferred` status. **Repair is executed
per region-pair by four agents (same ownership split as derivation), then
one verify/wrap agent.** Each executor fixes, for its own files, ALL of:

1. **Rebalance to the corrected budget** (numbers per region in the
   coverage doc): defer lowest-value over-density records
   (`status: deferred`, one-line `deferredWhy`); retype surplus
   cheap-furniture types into the under-band vertical/underwater/seasonal
   types where the record honestly supports it; author top-ups ONLY in
   dunmer-north and imperial-fringe (which sit at ~0.5–0.7× budget).
2. **Back-fill the strict fields** on every record: season, eraLayers,
   densityLayer, entrance (module 70 §47 — vary it), underwaterAccess.
3. **Vibe visual layer**: replace region-constant palette/materials/senses
   (interior) and empty condition/approach/missing silhouette (south) with
   per-record content; break the 109 visual-twin pairs on ≥3 axes; fix
   the naming issues (14 duplicates, "The " monotony, regional registers).
4. **Discovery honesty**: sightline claims only where a canopy-breaking
   cue exists; else road/rumour/document.
5. **Sockets, ownerFaction, notableNpcSlots, rumourPoolKey, variant
   slots**: quest-capacity per the coverage doc (M4/M3 sockets), tier-0/1
   records never socket-less; ≥1 LocalStateVariant slot on quest
   locations; faction seats per the completeness doc.
6. **Lore fixes** (lore doc's ranked list): Tenmar/Ten-Maur-Wolk merge
   (west), Flu arithmetic (six records), canon-named→canon-derived
   reclassification (~14), blue-flower exclusivity, missing canon places
   (Root-Whisper Village + Deepmire → naga-kur-deeps; Hutan-Tzel →
   dunmer-north; **Xal-Krona's lair** → hist-heartland, tier 0);
   interior building-kit ruling (interior executor): extend
   material-culture.md with the grown-root interior kit and fix the
   108-record kit-blend.
7. **Feasibility fixes** (its doc): the buoyant-causeway class (4
   records), landform demand into the typed field, wildcard tokens
   replaced, azure→azura, grave-stake boilerplate, tide→seasonal-drawdown
   (8 records; the owner's environment-tweak permission covers
   canon-black water instead where appropriate).

The **verify/wrap agent** then: authors `asset-aliases.json` (slug→family
map) and fixes what it exposes; flips STRICT_REQUIRED into REQUIRED_AT;
re-runs all validators + a fast re-critique sample; records the round
result here. The scour-detector relaxation (flood-high etc.) is a
separate small tooling job before Part 3.

**Owner rulings on derivation richness (2026-09-02):** (a) the Blackrose
"reference watershed" special status is STALE — superseded in 00-core and
module 95 §85.2; no zone gets extra depth on that authority; (b) **all
province slices are derived equally richly** — record counts still follow
the causal density gradient, but per-record depth/quality (why, vibe
signature, relations, asset plan) must be uniform across regions; the
critique pass checks richness parity between zones explicitly.

**Owner ruling (2026-09-02): dungeon entrances are decoupled from geology**
— every entrance teleports to an interior cell, so "no rock for caves"
constrains surface entrances only (recorded in full in module 70 §47).
Catalogue/plot implication: dungeon-bearing records may sit anywhere the
*entrance* type suits (trapdoor, hollow trunk, underwater entry, sinkhole,
burrow, xanmeer stair-throat, well, grave-cut...); the root-hollow gallery
layer stays the interior's signature but is no longer the ONLY underground
answer. The critique pass should check entrance-type variety.

**Owner permission (2026-09-02): terrain/water/vegetation MAY be tweaked
during Phase 11** where canon genuinely requires it and the change is done
well — e.g. canon-black water in a swamp region ours renders blue/green, or
a canon-required vegetation type in an area that has a different one. Two
conditions: the change must be *necessary* (canon- or catalogue-grounded,
not taste), and done properly through the owning system (region water
params, palettes, scatter recompile — never a local hack). Known candidate
already: the naga-kur-deeps records are written on canon's black water.
Record each use of this permission here.

**Environment tweaks REQUESTED by the interior repair executor (2026-09-02),
not yet applied — they are systems-side jobs, not catalogue edits:**

1. **naga-kur-deeps water colour.** All 67 deeps records are now written on
   canon's black standing water (peat-stained, low visibility, blue
   bioluminescence as the only light). Needs the zone's water params/palette
   set accordingly in the owning system, not a local hack.
2. **Freshwater tide.** `tideResponse` is derived from salinity, so the deep
   interior cannot tide by construction (feasibility F7). The six deeps
   records that made tide load-bearing were rewritten onto **seasonal
   drawdown/refill**, which the season mechanism already delivers — no
   systems change needed, but the plot pass must confirm salinity < 0.05 at
   those sites, and `place.naga-kur-deeps.drowning-narrows-tidal-gate` keeps
   a now-misleading slug (IDs are permanent; the record's text is correct).
3. **No asset pool expresses `settlement-root-v1`.** The interior's records
   now specify a grown-root kit whose nearest available families are
   `bamboo-hut` + `hist-variants` + `azura-tree` + `argonian-props`;
   `mud-mother-grove` (the Shadowfen mud kit) is still carried by interior
   records because nothing better exists. A root-kit pool (or an alias set)
   is an asset-registry job — flagged for the verify/wrap agent.

**Interior building-kit ruling (2026-09-02, lore critique C1).**
`world/sources/lore/topics/material-culture.md` now carries three Argonian
kits — `settlement-mud-v1` (Shadowfen), `settlement-stilt-v1` (Murkmire) and
**`settlement-root-v1`** (the interior: root trained while living, withy and
flint-vine lashing, sap-resin sealing, bark/frond roofing, chimes at every
threshold, no stone and no reed) — plus a `/deeps` Naga-Kur variant (cane,
bog-oak, hide, worked bone, undressed dredged block). The never-blend rule is
unchanged in spirit: one building is one kit; a settlement is one kit unless
its `why.founding` says why not; foreign work layers, never blends.

**Scour findings that bind Parts 1/3** (2026-09-02, full digest in
`world/sources/sites/candidate-sites.md`; 1,172 scored candidate sites in
`candidate-sites.json`, dossiers for all nine anchors in `sites/dossiers/`):

- **Almost no long sightlines below the mountain rim** (median site sees
  18 % of its 1.2 km surroundings; nothing 12 m tall reads at 1.4 km).
  Landmark strategy must be tall-or-close: canopy-breaking silhouettes
  (xanmeers, great trees, smoke, lights) and short-range reveals, not
  Skyrim-style distant-vista pulls.
- **Enclosed clearings (6 found) and sinkholes (11) are genuinely rare** —
  the interior is too gentle and hydrology floods depressions away. Types
  that need them must be *authored* into terrain-adjacent form or spent
  sparingly; they cannot be found on the ground.
- **A quarter of the interesting ground is on the mountain rim** where the
  fewest people live — Part 3 must *make* interior interest from water,
  vegetation and built form, exactly as the non-uniform-density rule says.
- **Gideon's approved anchor sits on steep ground** (p50 slope 20°, 14 %
  buildable in a 400 m disc) — Part 6 must nudge within `toleranceUV`.
- Capped detector classes are flagged in the digest — raise the cap before
  concluding scarcity.

### Critique round OUTCOME (2026-09-02, verify/wrap agent)

**Verdict: the round closes.** All five critics' mechanical findings are at
zero or explained; every gate is green (`python -m worldgen.catalogue --check`,
191 pytest, `node tooling/repo-standards/check.mjs`, `npm test`).

**Headline numbers.** Before = commit `29c502b` (pre-repair); after = this
round. Re-runnable with `python3 -m worldgen.critique_sample [dir]`.

| check | before | after |
|---|---|---|
| live records (province) | 729 | **527** |
| region-constant vibe fields (≥25 % identical) | 8 | **0** |
| empty / missing vibe fields | 1026 | **0** |
| visual-twin pairs (same type, ≥2 identical vibe axes) | 121 | **0** |
| duplicate names | 14 | **0** |
| empty names | 0 | 0 |
| records missing any of the five strict fields | 729 | **0** |
| distinct entrance types used | 1 | **14** (of 14) |
| socket-less tier-0/1 records | 40 | **0** |
| `discovery: sightline` share | 27 % | **18 %** |
| sightline claims per km², worst zone | 21.7 (penal-south) | **3.4** (dunmer-north) |
| non-`all-year` season records | 189 | 103 |

The one number that moved the "wrong" way is *records with only `["current"]`
eraLayers*: 86 → 304. That is a back-fill artefact, not a regression — before
the round 729 records had no `eraLayers` field at all, so the 86 was measuring
the few that did. 43 % of records now carry a pre-current layer.

**Final totals.** 800 records: **527 live, 272 deferred, 1 cut**.

| region | live | deferred | cut | budget | |
|---|---|---|---|---|---|
| dunmer-north | 138 | 0 | 1 | 138–169 | at floor |
| hist-heartland | 111 | 0 | 0 | 94–130 | in band |
| imperial-fringe | 121 | 0 | 0 | 119–147 | in band |
| mercantile-coast | 56 | 84 | 0 | 45–56 | at ceiling |
| naga-kur-deeps | 39 | 28 | 0 | 22–32 | **+7, see below** |
| saxhleel-coast | 24 | 75 | 0 | 18–24 | at ceiling |
| imperial-penal-south | 21 | 49 | 0 | 17–21 | at ceiling |
| pirate-freeholds | 17 | 36 | 0 | 14–17 | at ceiling |
| **province** | **527** | **272** | **1** | **467–596** | in envelope |

**Work done this round, beyond the executors' passes.**

1. `asset-aliases.json` authored (42 slugs → inventory family ids); the
   validator's alias hook is live, so an `assetPlan` typo is now impossible.
   Fixed `azure-tree` → `azura-tree` in three recipes and one record.
2. **One JSON encoding.** The four executors had written the eight region files
   with two different `ensure_ascii` settings, so any edit re-encoded every
   em-dash and buried the real change. `worldgen.catalogue.dump_json` is now the
   single writer.
3. **Region rebalance.** Four zones were still over ceiling; 31 records deferred
   (lowest-value fine-tempo fill, tier 2+, non-canon only) under a guard that
   never takes a type below four live instances.
4. **countBands re-derived** for all 236 poi types from actual live counts. The
   old `test_poi_count_bands_sum_to_the_province_total` was retired as unsound
   (236 types × ±1 slack aggregates to a ±236 envelope) and replaced by two
   better checks: per-type "the band contains the live count", and **per-zone
   record budgets in `test_catalogue.py`** — the coverage critique's actual
   finding was a *distribution* problem the province total concealed.
5. **One new record**, to bring dunmer-north to its floor:
   `place.dunmer-north.let-upper-floor`, a `deniable-listening-post` — a
   previously unspent type and the only honest Fourth-Era Thalmor form, since
   canon records no Dominion presence inside Black Marsh while still crediting
   them with inciting the Accession War.
6. **Sweeps.** 1001 socket ids and 26 `localStateVariant` ids normalised to
   dotted `<kind>.<place-slug>.<name>`; standard 2 green for the first time.
   Three `supplies` relations re-pointed from the cut `tenmar-wall` to
   `wolk-market` (they were about the town, not the ruin). Verified: 0 broken
   relation targets, 0 `azure-tree`, 0 `darkwater`, ashroot-village's Hist
   flower is red.
7. **Strict flipped.** The five fields are in `REQUIRED_AT['derived']`; the
   `STRICT_REQUIRED` mechanism is deleted and there is no strict mode to forget.
8. Catalogue README gained the per-region **naming register + signature asset
   pool** table the variety critique asked for.

**No coastal retype collision.** The west and south executors did *not* both
over-fill the same under-band coastal types (`reef`, `fishing-bank`,
`bird-colony`, `keepers-lodge`) — saxhleel took 3/2/1/1, mercantile took only 1
bird-colony. The south executor's suggested extra coastal `keepers-lodge` was
therefore **not authored**: keepers-lodge sits at 4 inside its 4–5 band, and
mercantile-coast is already at its ceiling.

**Still open after this round.**

- **naga-kur-deeps at 39 vs a 22–32 ceiling** (1.2×, down from 1.8×). Taking it
  to 32 would have driven six types under-band, so the residue goes to Part 3's
  homeless-batch review. Recorded as an explicit exception in
  `test_catalogue.py`, not hidden.
- **Environment-side requests, still unapplied** (systems jobs, not catalogue
  edits): (1) **naga-kur-deeps black water** — all deeps records are written on
  canon's peat-stained black standing water with blue bioluminescence as the
  only light, and need the zone's water params/palette set in the owning system;
  (2) **Oliis Bay tidal amplitude** — the coastal records assume a working tide
  the water system does not yet express.
- **Scour-detector relaxation** (flood-high and friends were capped) — a small
  tooling job, needed before Part 3 concludes anything about scarcity.
- **`archon-thalmor-post` ID migration** stays a *wish*: place IDs are permanent,
  so the misleading slug is documented rather than renamed. Same for
  `place.naga-kur-deeps.drowning-narrows-tidal-gate`, whose record text is
  correct on seasonal drawdown while its slug still says tide.
- **BM&V extraction queue**: two records plan against `bmv-round-huts` and
  `bmv-stilthouse`, both `have-unextracted`.
- **Dressing tier**: 113 `district`/`dressing`-scope recipe types have no
  catalogue records by design — they are Part 3 / compiler work, and their
  countBands were deliberately left as per-settlement demand forecasts.
- Nine `poi` types remain unspent; Part 3 may spend them (their bands are 0–1).

### Part 3 — MACRO PLOT: approximate locations for everything

Match Part 1's demand against Part 0's supply of interesting ground, on the
2D map. Approximate positions only — no 3D markers, no geometry.

- **Plot in importance order**, tier by tier: canon majors first (the
  existing approved anchors), then quest-critical and named places, then
  regional keystones, then the long tail of density fill. Each tier
  reserves its ground before the next is placed, so the important things
  get the good sites — exactly how the major cities were plotted.
- **Record the why for every dot**, even at this resolution: which siting
  grammar, which candidate sites were considered, why this one won. A dot
  without a why is not plotted.
- **Density is non-uniform on purpose** (owner emphasis 2026-09-02; the
  research doc's finding): the per-km² numbers are *region averages*, never
  a spread. Real TES density follows causal gradients — thick in settlement
  hinterlands, along roads, rivers and coasts, around resources; thin in
  deep wilds, and the emptiness is itself meaningful (a D5 interior that
  suddenly has no camps is telling you something). Derive each region's
  density *shape* from its civilisation gradient, not just its total.
- **Respect distribution as you go**: the three density tiers by danger
  band, the ≤300 m-from-route rule, and spacing that reads hand-placed —
  **Poisson-disc for cluster centres, clumped sampling within a cluster**
  (even spacing alone reads procedural; our own mined data says real hand
  placement is clustered). Apply the pull/attention rules from the research
  doc: vary the landform between successive stops, never a straight line of
  identical beats, and let a landmark be visible from the approach to the
  next one.
- **Check with a visibility raster**, not by eye: compile a cheap
  "what can be seen from here" pass over the plotted map (Nintendo used
  playtest heat maps for this; we can approximate it statically) and look
  for dead zones with nothing to pull the player, and for over-dense
  huddles.
- **Anti-sameyness quotas, enforced mechanically**: no template used for
  more than ~25 % of instances in a region; any two instances of the same
  template within 2 km must differ on ≥3 axes; never two of the same
  template in sight of each other; every taxonomy family actually used.
  Emit a coverage report each compile.
- **Collect the homeless.** Anything that cannot find suitable ground —
  because its landform type is used up, or its constraints conflict — goes
  into a **deferred batch** rather than being force-fitted. At the end of
  the pass, reconsider that batch as a whole: swap allocations to place
  higher-value things better, relax constraints where honest, transform a
  place into a related type that fits the ground that IS available, or cut
  it — and record which, and why. This is the anti-greedy step; do not skip
  it, and report its numbers.
- Deterministic and seeded throughout; re-running must reproduce the plot.

### Part 4 — REVIEW: agent QA, then the owner sees the whole province

1. **Agent QA first.** Run the validators over the plot (orphan checks,
   density/spacing budgets, reward coverage, traversal fallbacks, region
   distinctiveness, homeless-batch resolution) and fix what they catch.
   Then a fresh Opus subagent reviews the plotted map cold, as a player
   would read it: is it coherent, varied, legible, tempting? Fix again.
2. **Then the owner review**, in the medium they asked for: the 2D province
   map with everything plotted, filterable, hover/click for each place's
   record and its why. Give them a short written orientation (what to look
   at, what you are unsure about, the 3–6 decisions that would most change
   the result). Iterate until they are content with the big picture.

Only after this does anything get built.

### Part 5 — exemplar selection (owner picks)

Propose, with reasons drawn from the catalogue: **one city** (owner is
involved in all major cities) plus **a few contrasting places** spanning
scale, culture, region class and danger — deliberately including at least
one small/simple type (camp, works or lone site), because most of the
province is that, not cities. The owner approves the set. (§85.4 requires
this proposal at phase start; it is now better informed because the
catalogue exists.)

### Part 6 — MESO, per exemplar: choosing the exact ground

For each chosen exemplar: run the site dossier over its plotted
neighbourhood, generate 2–3 exact candidate sitings, and choose — folding
in the deliberation the plot could not do at map resolution (micro-geography,
approach and reveal, buildable ground, water depth at the dock line, route
tie-ins, neighbour sightlines). Decide the **high-level design**: what must
be in this place, its districts and rough layout intent, its signature
feature, and its **specific asset selection** against the catalogue's asset
plan and vibe. Record every choice with its why; the owner steers here
(Round A of the hands-on loop).

### Part 7 — MICRO, per exemplar: blueprint, build, iterate with the owner

The steered visual loop, on one exemplar at a time. Each round = focused
work ending in a small visual packet plus 2–4 plain-English questions. Do
not batch rounds.

- **Round A — siting + layout.** Candidate sitings, then the causal model
  and blueprint map(s). Owner steers: where exactly, district shape, route
  logic, dock placement, landmark positions. Iterate maps until approved —
  regeneration is cheap, so offer variants.
- **Round B — massing.** Compile buildings; render ortho + player-eye
  stills. Owner steers: building mix, scale/silhouette, density, kit reads,
  Hist-tree prominence, how the place sits on its ground.
- **Round C — dressed walk.** Deploy; owner walks it at real vegetation,
  light and water. Steers: feel, approach reveals, wayfinding, edges —
  **and an FPS read on each quality setting** (the first exemplar is the
  first settlement-plus-vegetation performance data point; alongside it,
  present the compiler's static budget report so the owner's FPS number
  can be tied to counted causes).
- Repeat as needed. **After every steer, write the generalised rule into
  the Taste ledger below** — a steer that only fixes this exemplar is a
  steer wasted. Route fixes to the grammar/compiler, never hand-edits: the
  exemplar must stay reproducible from its blueprint (it becomes the
  compiler's first regression fixture).
- Exit: the owner explicitly declares the exemplar good and the flow
  trusted. Ask; do not infer.

### Part 8 — grammars, then autonomous rollout

- **Write the grammars down** as they converge: the type-siting grammars
  (meso), the **Hist-centred** and **Imperial-fringe** settlement grammars
  (module 95 deliverables), and the per-type layout recipes — all grounded
  in the mined form tables, the research docs, material-culture and the
  taste ledger.
- **The research rule, enforced on yourself**: before the first instance of
  any place type, check `docs/research/` for design research on how the
  source games and other open-world RPGs build that type; if thin, fill the
  gap (Opus subagent) and record the doc *before* placing. Baseline reading:
  [openworld-place-distribution-and-siting.md](../research/openworld-place-distribution-and-siting.md),
  [kit-level-design-and-layout-generation.md](../research/kit-level-design-and-layout-generation.md),
  [marsh-settlement-morphology.md](../research/marsh-settlement-morphology.md),
  [xanmeer-mesoamerican-reference.md](../research/xanmeer-mesoamerican-reference.md),
  [morrowind-content-density.md](../research/morrowind-content-density.md).
- **The location-orphan validator** (module 40 §32, including the §12.3b
  reward clauses) runs in the compiler pipeline, not as advice.
- **Then deliver autonomously**: the rest of the contrast set, the quest
  co-design loop per packet, density + reward budgets, travel services
  (ferry/boat-owner graph, re-authored root transit — Gideon wintertide
  only, the Owing at every tolled crossing, Reed writ enforcement points,
  talk→service-menu as a small contract), the quests 20 §12b named-feature
  roster with `QuestWorldProvision` records, D0 authoring and the
  player-stronghold reservation, and the module 85 §69 settlement probes.

### Part 9 — wrap

- **Freeze checklist**, explicit and deferred: per packet, the 10b probe
  list, the 10c validation list, and the §65b completeness check — so those
  agents can freeze packets without re-deriving this phase.
- Batched owner review of everything delivered autonomously: what to walk,
  what to check, how to feed back — including an FPS read (settlements plus
  vegetation is the new worst case).
- Round records in this doc (defect → cause → fix, 0036 style); PROGRESS
  row and *Waiting on user* current; docs README router updated; credits for
  every sourced mod.

---

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

**Read [openworld-place-distribution-and-siting.md](../research/openworld-place-distribution-and-siting.md)
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

> Model policy (owner 2026-09-03): choose the subagent model on judgment
> (Fable 5.1 / Opus 5 / Sonnet 5), always at low effort. Older lines below
> saying "Opus subagents" are superseded on the model, not on the shape.

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

*(empty — first entries land in Round A)*

## Part 0 delivery notes (2026-09-02)

- Items 1–3 + 6a/6b delivered (commits `e8a10c1`, `f3637cc`, `cc15ae4`,
  schema commits). Kits: `settlement-mud-v1` / `settlement-stilt-v1` /
  `settlement-imperial-v1` — three configs so the cultures cannot blend by
  construction. Sourcing log: `docs/research/settlement-kit-sourcing-log.md`.
- **Compiler rule (from kit vetting):** architecture pieces snap to the
  3.64 m grid around a **centred pivot** — the settlement compiler places
  kit pieces by grid transform, NEVER the flora bottom-anchor path
  (`vet_kit`'s "pivot above base" findings on architecture are expected).
- Still-open asset gaps after sourcing: xanmeer ornamental frontage,
  dugout/twin-hull canoes, grave-stakes, salterns/kilns.

## Part 2 reconciliation record (2026-09-02)

Aggregate pass over the eight region derivations (722 records in, **729 out**;
no ID deleted or renamed). All eight `places-*.json` are now registered ID
sources under standard 2, so `npm test` enforces shape and uniqueness.

| Region | Records |
|---|---|
| mercantile-coast | 140 |
| hist-heartland | 110 |
| imperial-fringe | 108 |
| saxhleel-coast | 99 |
| dunmer-north | 84 |
| imperial-penal-south | 70 |
| naga-kur-deeps | 65 |
| pirate-freeholds | 53 |
| **Province** | **729** |

**Types**: 236 POI types, **234 used**, 2 unused (`festival-ground`,
`dry-season-herd-ground` — flagged as a coverage gap, not cut).

**Bands widened**, each with a `countBandNote` in `type-recipes.json`:
`stone-calendar` 1→2, `quarantine-village` 1→3, `tunnel-rat-gallery` 1→2,
`heretic-stone-village` 1→2, `drifting-village` 1→2 (and
`settlement-register.md` §5 G3.3 revised to match — its "exactly one" was a
cost recommendation, not canon).

**Retype**: Alten Meerhleel `neutral-free-port` → `port-town` (Alten Corimont
is canon's named freehold and keeps the singular type). ID unchanged; `why`,
`vibe` and `assetPlan` rewritten to the port-town recipe.

**Filled**: Hissmir, the Loriasel lamia caverns, the Deepmire leviathan bone
field, Still-Waiting, the Orma tactile ruin, and two collapsing pinnacles.
**Consciously under-filled**: `port-town` at 1 of 2 (no honest homeless
candidate). Details in `docs/research/settlement-type-recipes.md`.

**Hero Hist**: register closed at exactly **ten** power slots (roster in
`world/sources/lore/topics/hist-placement.md` §3b). Five were added — the four
canon city/hatchery trees the dossier names (Stormhold, Hatching Pools,
Lilmoth, Gideon) plus Archon's harbour tree. Two grove records are marked
reserves with `powerSlot: null`. Helstrom deliberately holds none.

**Contestables**: wrecker-beach confirmed on mercantile-coast, murkwood-verge
confirmed in imperial-penal-south (no double-claim existed); both player-
stronghold candidates stay flagged for the owner (Q&A item 6).

### Findings handed to the critique pass — not fixed here

1. **Band discipline has broken down at the aggregate.** 68 POI types are over
   their band and 49 are under it, even though the total lands inside the
   600–740 envelope. The eight agents each stayed plausible locally and
   collectively rewrote the distribution. The band sum is now **637–739**
   against a 740 ceiling: **any further widening must be paid for by narrowing
   another band.** Worst over-claims: `hist-less-refuge` and
   `bone-repatriation-waystation` (2→6 each), `mass-grave-memorial` (4→8),
   `sealed-xanmeer` (4→7), `ferry-stage` (6→9). `hero-hist-grove` is 4→6 and
   was deliberately left over-band rather than retype a hero tree.
2. **`rewardProfile.valueTier` uses four incompatible vocabularies** —
   `tier-N` (dunmer-north, imperial-fringe), bare integers (mercantile-coast,
   imperial-penal-south), `TN` (pirate-freeholds, saxhleel-coast) and
   `low/medium/high/unique` (hist-heartland, naga-kur-deeps). Left unnormalised
   on purpose: a 3-band word scale does not map losslessly onto a 5-band
   numeric one, so the collapse is a design call for the reward pass, not a
   find-and-replace. It must be settled before anything reads this field.
3. **Richness parity is NOT uniform across the eight slices** (owner directive,
   2026-09-02). Medians/means per record:

   | Region | `why` chars | `sources` | non-empty `relations` | `vibe` keys |
   |---|---|---|---|---|
   | dunmer-north | 506 | 3.1 | 2.1 | 8 |
   | imperial-penal-south | 494 | 3.5 | 0.3 | 5 |
   | imperial-fringe | 480 | 2.6 | 1.8 | 8 |
   | mercantile-coast | 476 | 3.1 | 0.2 | 5 |
   | pirate-freeholds | 456 | 3.8 | 0.2 | 8 |
   | saxhleel-coast | 416 | 3.6 | 0.1 | 8 |
   | hist-heartland | 309 | 1.3 | 0.1 | 8 |
   | naga-kur-deeps | 301 | 1.3 | 0.0 | 8 |

   Two specific, fixable gaps: **hist-heartland and naga-kur-deeps run ~35 %
   thinner on `why` and cite roughly one source per record against the other
   six regions' three-plus** — they are the two interior slices, and the
   interior must not be the thin part of the province. And **`relations` is
   effectively empty everywhere except dunmer-north and imperial-fringe**,
   which is a province-wide gap, not a regional one: the catalogue currently
   describes 729 places and almost no connections between them. Both are
   authoring work, not reconciliation work, so they are recorded here rather
   than papered over. Note also that mercantile-coast and imperial-penal-south
   write a 5-key `vibe` where the other six write 8.

## Enrichment pass (2026-09-02) — findings 2 and 3 closed

A single agent fixed the three defects the reconciliation quantified. No IDs,
types or statuses changed; the zones' authored sparseness and voice are intact.

**1. Interior richness parity** (owner directive: all slices equally rich).
The two interior files were thickened record by record — longer causal chains
(who pays, who inherits the duty, the second-order consequence, which *named*
neighbour it lands on), not padding — and cited against dossiers, UESP pages
and `type-recipes.json`.

| Region | `why` chars (before → after) | `sources`/record (before → after) |
|---|---|---|
| hist-heartland | 309 → **729** | 1.3 → **4.3** |
| naga-kur-deeps | 301 → **729** | 1.3 → **4.2** |
| dunmer-north | 506 (unchanged) | 3.1 |
| imperial-penal-south | 494 | 3.5 |
| imperial-fringe | 480 | 2.6 |
| mercantile-coast | 475 | 3.1 |
| pirate-freeholds | 456 | 3.8 |
| saxhleel-coast | 416 | 3.6 |

The interior now sits *above* the old norm rather than at it. That is
deliberate: parity means no slice is the thin one, and the added material is
consequence, not adjectives. The other six were left alone — they were never
the defect.

**2. The relations layer** — was ~500 links concentrated in two regions, now
**2,368 directional place-ID links + 162 travelServiceEdges**, every record
carrying a `reachedVia` and every M2+ settlement ≥3 relations (was 32 of 172).

| Region | links | per record | cross-region |
|---|---|---|---|
| dunmer-north | 435 | 5.2 | 20 |
| imperial-fringe | 486 | 4.5 | 15 |
| mercantile-coast | 466 | 3.3 | 20 |
| hist-heartland | 338 | 3.1 | 15 |
| saxhleel-coast | 298 | 3.0 | 10 |
| imperial-penal-south | 229 | 3.3 | 12 |
| naga-kur-deeps | 201 | 3.1 | 8 |
| pirate-freeholds | 160 | 3.0 | 10 |
| **total** | **2,368** | 3.5 | **110** |

Cross-region chains woven by hand: **the Owing chain** (Vellum Estate → the
Turned-Out → the four regional hiring/eviction camps → the plantations,
paddies and diggings that buy the labour, with the freed-worker shelters as
its rivals); **the Soulrest gold chain** (tunnel-rat gallery → goldworks
concession → Collections bond → Soulrest → Archon's bonded row);
**bone repatriation** (six regional waystations → the Carriers' Rest →
Helstrom and the hero groves); **Hissmir** as the province-wide destination of
every Hist-less refuge; **the rootworm net** (Helstrom line-head → Gideon,
the east estuary, north Shadowfen); salt, timber and shipyard rivalries across
the two coasts; ferry, portage, lighter and pilot service edges at every
crossing. Conventions are in `world/sources/catalogue/README.md`.
`visibleFrom` stays empty except Archon's lighthouse/Portdun Mont pair — the
no-long-sightlines finding makes any other claim a Part 3 decision.

**3. `valueTier`** — settled on **`tier-1`…`tier-5`**, defined in the
catalogue README, after confirming neither quests/85 nor world/76 already
carries a value scale (76's D0–D5 is danger). 543 of 729 records converted.
The 3-band word scale maps rank-preservingly (`low/medium/high/unique` →
`tier-1/2/3/5`); it cannot express `tier-4`, so the interior has none and
promoting individual interior sites is a reward-pass call, not a rename.
Distribution: t1 161, t2 338, t3 191, t4 32, t5 7.

**Left for the critique pass:** the band-discipline finding (1) is untouched.
Several `sources` entries elsewhere in the catalogue cite files that do not
exist (`docs/world/20-region-grammar.md`, `docs/world/30-systems.md`,
`docs/world/55-time-and-sky.md`, `docs/world/55-time-light-weather.md`,
`world/sources/lore/topics/argonia-4e201-state.md`) — a citation-path lint
would catch these cheaply. `reachedVia` for POIs is currently a per-region
land/water/guided anchor chosen by taxonomy type; Part 3 should re-point it at
the actual nearest node once positions exist. And the two 5-key `vibe` files
(mercantile-coast, imperial-penal-south) still write 5 where the rest write 8.

## Touchpoint ① — owner rulings (2026-09-03)

The owner reviewed the catalogue summary
(`docs/research/phase11-catalogue-summary-touchpoint1.md`). Rulings, all
binding:

1. **Catalogue size accepted, with headroom noted.** 527 live vs Skyrim's
   ~415–426 map markers on similar land (our authored land 33.5 km² vs
   Skyrim ~37 km²) is deliberate — we run Morrowind-style density
   (Vvardenfell ~18/km²), which is denser than Skyrim (~11/km²). The owner
   is content but notes **we hold headroom to cut later** if the workload
   bites; nothing else changes now.
2. **Deferred pool purpose confirmed**: the 272 deferred records are the
   swap/revive pool for plotting and later packets.
3. **Budgets: ceilings are SOFT, floors are HARD** (naga-kur-deeps at 39
   accepted). Encoded in `test_catalogue.py`'s budget comments — a ceiling
   breach needs a recorded exception; a floor breach always fails.
4. **Dungeon-entrance ruling generalised province-wide** — every region's
   dungeons are teleport-to interiors behind region-appropriate
   entrances/exteriors, not just the marsh. Recorded in module 70 §47.
5. **Player stronghold: keep BOTH candidates plotted**; the owner decides
   at Part 6.
6. **Environment tweaks approved**: naga-kur-deeps black water and a
   committed Oliis Bay tidal amplitude are green-lit as systems-side jobs
   (queue them before/with Part 6 exemplar work in those zones).
7. **Load-bearing calls 1–5 provisionally accepted** — the owner reserves
   the right to challenge any after the plot (touchpoint ②) or builds.
8. **Communication rule (all future owner-facing summaries):** assume the
   owner knows NOTHING of the game's content. Spell out every in-world
   term at first mention (the Knahaten Flu, the Owing, cordons, region
   codenames). Saved to agent memory as well.
9. **Text-quality workstream commissioned** (decision 0043): Morrowind
   voice/grammar/per-culture register research → binding style guide in
   `docs/text/` + reviewer-agent process. Names and all player-visible
   text get reviewed against it.
10. **Reviews commissioned at this touchpoint — all three returned same day:**
    - **D4–D5 "landmark-heavy, quest-light": KEEP** (traceable to
      morrowind-content-density.md §5.2 → module 95's budget line, not a
      snuck-in decision; 91 % of dangerous-band records carry quest hooks —
      quests are *given* in safe hubs and *resolved* in dangerous land,
      which is the Morrowind/Dark Souls pattern and correct for fixed
      danger). One directive for Part 3: when thinning, **take
      proportionally more out of D4–D5 than D0–D3**, or the
      sparse-and-monumental contrast dilutes.
    - **Asset gap check** (`docs/research/phase11-asset-gap-check.md`):
      nothing needs buying. Dunmer/Velothi is covered by 288 BM&V pieces
      already in the vault, but **no `settlement-dunmer-v1` kit is built
      yet** (43 northern records point at unpackaged pieces) — a Part 6
      prerequisite, as is **building `settlement-root-v1`** (permanent
      kitbash: treehouse shell + root masses + passerelles + Argonian
      props; fixes the interior's forbidden mud-kit stand-in) and
      **facade-front tagging** on the ~25 meshes we place (no
      facade-facing signal exists in the mined data).
    - **Prison south: coherent.** Blackrose Prison in 4E 201 is a ruin
      squatted by prison-born descendants, not a working gaol (owner
      decision Q3 in `topics/prisons.md`); no record anywhere asserts a
      live prison. Two clarifiers applied (catalogue README naming row;
      prisons.md closes the untaken White Rose work-camp option).

## Part 3 delivery record (2026-09-03)

`worldgen.macro_plot` plots all **527 live records** (0 homeless unresolved;
report `world/sources/sites/macro-plot.md`). Shape of the solve, and the
calls made while tuning it:

- **Supply** = the 1,172 scour sites + a seeded lattice of plain ground
  (~140 m pitch, classified firm / shallow marsh / channel bank off the
  rasters) + a **roadside strand** every 110 m along every road and boat
  lane. The strand was added when the plain lattice left only 45 % of
  fine-tempo places within 300 m of a route; with it, **73 %** (Morrowind's
  "something every 200–300 m of road").
- **Demand** = each record's `sitingPrefs.landformClasses` / `regionClasses`;
  four region files (hist-heartland, naga-kur-deeps, imperial-penal-south,
  mercantile-coast — 227 records) never got landform wishes at derivation, so
  theirs come from the type recipe and the record's `whySiteWon` says so.
  Free-text hard constraints are read for eight hints (submerged, on-route,
  concealed, commanding, remote, inside-parent, navigable, above-flood) and a
  "within N km" radius; everything else in that prose is Part 6 material.
- **Order**: the nine owner-approved anchors are pinned exactly; then tiers
  0→4, best-scoring pair first within a tier; then the homeless batch is
  re-tried in four honest stages (lower score bar → neighbouring zone within
  350 m of its own → spacing ×0.75 → ×0.5). Final plot: 9 records placed at
  the lower bar, 5 in a neighbouring zone, none needed tighter spacing.
- **Spacing is sized to the zones as the culture raster draws them**
  (0.8–9 km² of land each; the prison south holds 21 places on 0.94 km²), so
  the first draft's 650–1,100 m settlement separations were unachievable and
  210 records fell through to the tightest stage. Now M5 800 / M4 450 /
  M3 300 / M2 220 / M1 150 m, layers 200/160/110 m, same-type ≥300 m
  (≥700 m for landmarks); and **a settlement's separation binds only against
  other settlements** — a city's hinterland is full of shrines and camps at
  their own small spacing, which is what real hinterlands look like.
- **Density follows the civilisation gradient** as the plan asked: tier 3–4
  fill in danger ≤3 is pulled toward anchors and routes; danger ≥4 records
  are rewarded for distance from routes; mountains take 6 places/km² against
  13–19 elsewhere. Only 11 records sit more than 1 km from a route.
- **Route-visibility sweep** (static two-visible check, 450 m radius,
  destination+landmark layers): 6 % of route samples see nothing, 48 % see
  four or more. The "crowded" figure is a property of the radius on flat
  marsh more than of the plot; Part 4's QA should judge it against real
  canopy occlusion (the sweep uses the smoothed heightfield only) before
  thinning anything.
- **Not done here, deliberately**: re-pointing `reachedVia` at the nearest
  plotted node (Part 4 QA, now that positions exist); `visibleFrom` claims;
  the World Studio plotted-map layer (Part 4's owner medium — the interim
  picture is a PIL render in `output/macro-plot/plot.png`, regenerate from
  the report); and per-record pinning (`macro-plot-overrides.json` is read
  but no override exists yet).

## Part 3b — minor routes (owner question, 2026-09-03)

The owner asked where minor roads and paths fit: the studio showed only the
handful of major roads. The plan had a gap — Phase 4 built the anchor-to-
anchor road/lane graph and Part 6 blueprints lay each settlement's own
streets, but nothing between them, and that middle layer (village track,
shrine footpath, reed boardwalk) is most of what a Morrowind player walks.
**Decision:** it is a derived layer of the macro plot, compiled by
`worldgen.compile_minor_routes` the moment positions exist and re-derived on
every re-plot: least-cost paths (same cost logic as the road compiler, on the
published rasters) from every plotted settlement and every road-discovered
place to the nearest road or landing, in three batches (M3+ settlements,
then M1–M2, then places) so small paths chain onto bigger ones; classed
track / footpath / boardwalk / causeway from the ground crossed. Hidden
places (lairs, camps, rumour/document/none discovery) get no path — that is
their design. Places whose cheapest land path exceeds 2.6 km are listed as
unconnected (boat-, guide- or root-served) rather than forced. First run:
186 paths, 65.6 km (46 tracks, 112 footpaths, 28 boardwalks), 46 places
already on a road, 2 unconnected. Data
`apps/world-studio/public/province/routes-minor.json` (same px frame as
`routes.json`), digest `world/sources/sites/minor-routes.md`. **Consumers to
wire later:** Part 6's settlement compiler (streets join the arriving
track), vegetation clearing (a track is a thinned corridor), the navmesh
bake (Module 72, preferred-road cost), the road-mesh/decal compiler
(Phase 14 streaming), and Part 4's route-visibility sweep (major routes
only today). **Part 3c is now done (2026-09-04, owner ask "display all
waterways on the map including the minor ones"):**
`worldgen.compile_minor_waterways` derives the minor WATER network the same
way, on the Phase 4 boat cost surface with land impassable, from every
water-bound place (boat/ferry/lighter/pilot station, landing, crossing,
water-village, any place with underwater access or a boat travel-service
edge) to the nearest major lane, navigable river corridor or already-solved
station; classed channel / river / crossing. First run: 139 channels,
49.4 km (80 channels, 44 rivers, 15 ferry crossings), 52 places already on
a lane, 14 unconnected. Data
`apps/world-studio/public/province/waterways-minor.json` (same shape and px
frame as `routes-minor.json`), digest in the same
`world/sources/sites/minor-routes.md`. `--registry` attaches a `geometryId`
to route-registry entries whose endpoints resolve to a channelled place and
flips them `solved: true` (6 on the first run); `route_registry --check`
accepts `geometryId` as "solved by minor geometry".

## Part 4 step 1 — agent QA of the plot (2026-09-03)

Cold review by a fresh agent: [`docs/research/phase11-plot-review.md`](../research/phase11-plot-review.md)
(eight findings, five owner decisions, eleven mechanical fixes). Mechanical
fixes applied to `macro_plot.py` the same day and the province re-plotted
(all 527 live records; determinism test green):

- **Named constraints are hard gates.** "Within sight of X" now resolves X
  (literal id, or a same-zone record name in the prose, or
  `relations.visibleFrom`) and requires a real line of sight within 1.5 km;
  "inside / part of / off the bank of X" requires ≤250 m; a record *named
  after* a settlement it depends on (mazzatun-hist, archon-harbour-hist,
  rootworm-station-helstrom, gideon-rootworm-terminus) sits within 450 m of
  it. Records that name another are plotted after it, whatever their tier;
  mutual pairs (Wolk Market ↔ Ten-Maur-Wolk, Glenbridge ↔ its sermon
  xanmeer) go first-by-id then gated. Result: every named sightline on the
  map is true (table in `macro-plot.md`); Wolk Market and Ten-Maur-Wolk are
  131 m apart, Castle Giovesse 429 m from Gideon with line of sight.
- **Density gradient is real now**: spacing is multiplied by up to ×1.8 with
  distance from the nearest city and +0.4 in danger ≥4; the hinterland pull
  applies to all tier ≥2 fill at weight 0.6. Median nearest-neighbour
  distance now rises 134 m (≤400 m from a city) → 157 → 204 → 264 m
  (1.2–2 km), i.e. ~4× sparser by area, from 1.33× before.
- **Region wish is a requirement** for settlement / works / transit classes
  (a preference for lairs, ruins, lone sites), and the last thing the
  homeless batch relaxes (stage order: score bar → neighbouring zone within
  350 m → spacing ×0.75 → ×0.5 → region). Two records needed the last stage.
- **D5 never within 200 m of a route** (unless its own constraint puts it on
  one); remote weight 0.35 → 0.6.
- **Submerged means depth**: ≥0.8 m of published water within ~15 m (0.4 m
  in the relaxed stages), not "near a shoreline".
- **Same type twice along one road**: ≥900 m when both sit within 300 m of a
  route.
- The report now names every record placed from the homeless batch, lists
  every named-constraint check, and lists the **dangling relations** (edges
  to deferred/cut/unknown ids) for the catalogue pass below.

**Left for the owner (touchpoint ②, ranked by the reviewer):** (1) should
the province be emptier still — cut/defer 60–100 places or cluster harder;
(2) should the Dunmer and Imperial minorities cluster into enclaves;
(3) are boat lanes a second view of the same places or a different journey;
(4) named sightlines are now hard — confirm that trade (ground quality vs
story); (5) the 272 deferred records: 134 live relations point at them.
**Left for the catalogue pass (Part 4 step 1b, not blocking ②):** re-point
`reachedVia` at the nearest plotted node; prune or promote the dangling
relation targets; the `sitingPrefs` wording edits the review lists (finding
9); re-measure the route stats against the minor-route network.

## Part 4 step 2 — owner feedback round (2026-09-03)

**Owner rulings on the five ranked decisions:**

1. *Emptier province?* — decide after the consistency fixes; cutting can happen
   at any later stage. **Plotting is not set in stone**: places may be cut or
   moved at meso/micro when they don't work on the ground.
2. *Minority enclaves* — lore says enclave, and the plot already is one
   ([research](../research/minority-enclaves-lore.md)): 22/24 Imperial records
   sit within 1.7 km of Gideon, 5/6 Dunmer at Thorn/Stormhold. Two Gideon
   estate records to pull back toward Gideon; four scattered outliers keep
   their stated personal reasons.
3. *Boat lanes* — a **real route network**, like the roads: named lanes and
   channels with stable ids (`world/sources/routes/registry.json`), places
   along them that make sense as a water-connected network, and a
   Morrowind-style pay-and-go **boat station network** (`travelStation` on
   records). No scripted moving boats; static moored boats where they make
   sense; a boat or floating settlement may relocate between set positions by
   date/season. The waterways should feel like a core part of the province's
   identity and of many places' identities.
4. *Named sightlines hard* — keep, with judgment: if a sightline pushes a
   place onto much worse ground, change the sightline record or swap the
   place instead.
5. *272 deferred targets* — **prune the links, keep them in reserve**:
   `relationsReserved` on the record (validator forbids live edges to non-live
   targets).

**Owner feedback items and what was done** (all this date unless noted):

| item | done |
|---|---|
| Text review of all place prose | region text-review agents (0043 process) after the semantic repair — see the wrap note below |
| Islands | [research](../research/offshore-islands-feasibility.md): use the 59 existing offshore landmasses (three canon-named) now; 2–4 authored lagoon islets feasible in the Part 6 window; no barrier chains or big offshore island (no shelf, 2.9 km to the world edge) |
| Tropical vanilla assets; farmhouse in three regions; Imperial fort mod for Gideon | [audit](../research/phase11-vibe-sheet-asset-audit.md): Tropical Skyrim is a texture replacer, applied as an overlay to farmhouse/docks/bridges kits; `vanilla-farmhouse` was in 163 records across all eight regions (not intentional) — region pass rebalances; **Morrowind Imperial Keep Set (SSE 133090)** + **Hlaalu Architecture (SSE 157997)** sourced as `imperial-keep` / `hlaalu-domestic` kits for Gideon; `bmv-fort` stays Blackrose's |
| Opening hours | [research](../research/opening-hours-and-start-area.md): ring principles A/B/C around Alten Corimont, enforced in the plot as a gate (`OPENING_*`); the start barge/camp records, a first trivial dungeon and a vantage are added by the pirate-freeholds region pass |
| Location semantics (Trunk Span, Chasecreek) | `worldgen.audit_place_semantics` → `world/sources/sites/semantic-audit.md` (832 findings over 399 places; both owner cases caught); region passes resolve each as move / rewrite / swap / cut |
| Collections near cities; distance to city | plot now has **city rings** (edge ≤350 m: wards/docks/works/shrines only; hinterland ≤1.2 km: no hostile or D4 lairs, farms/works/villages rewarded), a **hard danger gate** (lived-in classes ±1 band, others ±2), **hostile clustering** (≤3 unrelated in 800 m), **purpose repetition** along a road, and a **swap-improvement pass** after the greedy solve (the anti-greedy step); the report lists each city's hinterland purpose coverage and ring mix |
| Major cities may shift | `worldgen.anchor_nudge` scans every tolerance circle: **Soulrest** (pin was half in the sea) and **Lilmoth** nudged 234 / 153 m onto firm ground; Stormhold, Thorn and Gideon have no flatter ground in their circles (steep everywhere — a Part 6 terracing job, not an anchor job); Archon/Helstrom/AC gain nothing. Rebuild chain re-run (society → refine → chunks → web → water → landcover) |
| Minor roads painted + vegetation cleared | **DONE in Phase 11** (owner ask 2026-09-04). `worldgen/routes_raster.py` rasterises both networks: tracks paint TRACK (2.5 m), footpaths PATH (1.2 m), boardwalks nothing; the same module stamps the scatter's clearance corridors (trunk-clear 14/8/4/3 m for road/track/footpath/boardwalk, groundcover thinned to 25%). Consumed by `refine_province`, `rebake_landcover` and `compile_scatter`; removed from the polish backlog |
| Hostile places; conditional hostility | `hostility` block (baseline stance + typed flips in the quests-85 vocabulary, incl. new `placeCleared` / `placeStanceIs`); region passes raise hostile-baseline places toward the research target |
| What you find there | `contents` block (creature / NPC / loot slots, `registerRef: null` until Phase 13) |
| Point to the player | `playerPurpose` block (16 purposes, impact band, one-sentence hook) + typed `rewardProfile.kinds`; used by the plot (repetition, rings, reports) |
| Falling mage easter egg | added by the hist-heartland region pass as a lone curiosity far from any road (cast roster §58) |
| Dungeons | [research](../research/place-purpose-hostility-and-dungeon-balance.md): 197 of 527 strictly dungeon-like (37 %) vs Morrowind ~60–74 %; target **240–280** by converting low-value repetitive places and adding underwater entrances (≤25 % wet-majority interiors); `interior` block records kind/family/size/wet fraction/entrances |
| Underwater set dressing | homed: POI families in world 60, assets in 90 §76; the gap is submerged vegetation/groundcover — a submerged depth band added to module 65's tiers (Phase 15 deliverable) |

**Outcome (end of round, 2026-09-03):** 566 live / 247 deferred / 1 cut
(was 527 / 272 / 1; the penal south grew 21 → 44 and the start freehold
17 → 31 because both were thin for a major city; dunmer-north and the
fringe shed repetitive fill). Every live record's four v2 blocks reviewed
by its region agent, then all prose reviewed by a separate text-review
agent per region (0043 process). Enterable interiors 223 (39 %, was 37 %;
35 wet-majority, 33 underwater entrances); hostile-baseline 85 (was 68),
225 typed stance flips; 93 travel stations forming connected coast, lake,
river and interior graphs; 49 registry routes (10 roads, 6 lanes solved;
the rest named-but-unsolved tracks/channels for Part 3c/6). Semantic
audit 832 → 519 findings (high 54 → 21; the remainder are position-
dependent lows and the pinned capital). Plot: 566/566, swap pass moves
~140 sites, every city hinterland covers all five core purposes, no
rest-cadence gaps. Region budgets in `test_catalogue.py` re-based; count
bands re-derived (`worldgen.rederive_count_bands`). **Open:** a faction
registry does not exist yet — region agents introduced ~40 `faction.*`
ids in `hostility.owner`; the build-out's faction system must register
them (game-buildout-register). Vibe sheets re-rendered
(`tooling/asset-pipeline/pipeline/vibe_sheet.py`, now committed).

**Round 2 (touchpoint ③ feedback, 2026-09-04).** Owner rulings: match or
exceed Morrowind's share of hostile/clearable places and carry *fewer*
settlement/civic places than Morrowind (Black Marsh is wild, not a unified
state) — the research doc's earlier reading of "don't overdo it" as a cap was
wrong and is corrected; kits combine only pieces authored to combine (rule in
CLAUDE.md; the vibe-sheet composites were removed); decisions must be
asset-aware (CLAUDE.md rule; creature registry carries `assetAvailability`);
"but" is allowed and the AI-tell research is folded into the text rules;
speech registers are race + upbringing + region + faction, not one voice per
region. Delivered: minor routes painted and cleared (`routes_raster.py`);
Part 3c minor boat channels (145 paths); studio filters/popup/routes layer;
world registries (decision 0044); the quest co-design pass (point 2 of the
loop: 74/74 provisions placed, 18 proposed quests, 15 siting edits,
`docs/quests/25`); the hostility pass then the structural rebalance
(clearable-or-hostile 43 → 56 %, settlement+civic 29 → 22 %, 28 records
converted, 19 deferred, 557 live); two more text passes. Then the **deliverability round**
(owner: all place content must be buildable; engineering standard 12 added):
[audit](../research/place-asset-deliverability-audit.md) over 237 types and
818 records → 96 records repaired in place by seven region agents, one type
redefined (bubble spire → fused-root tower, retexture only), `causeway`
re-specified as pile-borne, `kothringi-lilmothiit-site` redefined as reused
architecture + dressing; kits `dungeon-root-v1` (124), `settlement-root-v1`
(140), `works-v1` (85) packaged from vault pieces (no downloads); alias
targets now validated; `vault_inventory.py` reports every unpackaged
authored set (733) and rigged creature (43). Open: the audit's
position-dependent findings (527, high 26) for the next repair round; the
"house on the stone quay" composition gap; the four faction id merge
candidates in factions.json; the still-unsourceable forms (kiln, saltern,
sluice, winding gear, hull-on-stocks, carved grave-stakes) stay written
out of the prose until a set is found.

**Schema**: places files are `schemaVersion: 2` (migration
`worldgen.migrate_catalogue_v2`; new blocks required at `derived`); route
registry `worldgen.route_registry` with ids stamped on `routes.json` /
`waterways.json` by `compile_society`.

### Quest ↔ place co-design pass (2026-09-04) — point 2 of the loop

The owner asked when the two-way quest/place approach starts; the answer was
"now", per the loop's own point 2 (*after the macro plot*), and it ran. A quest
agent read the 566 plotted records against every provision in quests
[20](../quests/20-world-provisions.md)/[30](../quests/30-main-quest.md)/[40](../quests/40-factions.md)/[50](../quests/50-side-quests.md)
and reconciled both directions. **Provisions → places:** the 51 provision ids
the quest tables declare, plus the 23 canon-supplied places and systems of
20 §12b, now all name the catalogue record(s) that satisfy them — 149
`quest.provision.*` ids written across 186 records, with `tierOwnership` on 244.
Two provisions had a place before the pass. Four gaps needed a new record
(`pirate-freeholds.upriver-hist-village` — the start region had no Hist at all,
and MQ01's whole stake is a tree going quiet; `dunmer-north.the-standing-bid`,
MQ07's floating auction; `dunmer-north.the-quiet-landing`, MQ08's cult
safehouse; `hist-heartland.the-cut-circle`, MQ18's sermon house) and eight were
closed by promoting deferred records — worst among them
`saxhleel-coast.archon-lighthouse`, a **tier-0** provision (MQ14) whose only
candidate was sitting in the reserve. Live records 566 → 578, every region
inside budget, no offsetting deferrals taken because fullness is still an open
owner question. **Places → quests:** eighteen PROPOSED rows added to
[55-quest-index.md](../quests/55-quest-index.md) §47e from what the province now
offers and the plan does not use — weighted at the two standing shape gaps
(eleven are `WONDER`, `HAUNTING`, `SUCCESSION` or `RITE`), each naming its
anchor places by id, none authored. **Move a dot:** fifteen `sitingPrefs` edits
made for quest value (a sightline between the true light and the false one; the
survey line laid on the omitted corridor; the boss put behind the Lost City
rather than beside it). The join, the rules and the reverse view live in the new
[docs/quests/25-quest-place-map.md](../quests/25-quest-place-map.md); the
`questHooks` shape gained `tags` and `opportunity` so the places→quests
direction is not thrown away. **Open:** the twelve new live records are
unplotted — `python3 -m worldgen.macro_plot` and the studio export must be
re-run by the lead, which is also what applies the fifteen siting edits.

## Owner Q&A (grows from Parts 2, 4 and 5)

**Queued for the next owner touchpoint (batched, not blocking):**

1. **Permissions policy conflict — RESOLVED without an owner call
   (2026-09-02):** Darkwater Den's licence forbids its meshes in any
   *public* work and we deploy publicly to Pages; unlike the porting
   clause (owner-approved), that isn't covered by the private-use
   rationale. Since every asset it offered is covered by other pools, the
   `darkwater` pool was **withdrawn unused** (registry mapping removed,
   README credit converted to a provenance note). The module 90 §73
   no-permission-bureaucracy policy stands for everything else.
2. **Raft eyeball** (still open) — but the owner supplied leads
   (2026-09-02): classic Skyrim mod **89948** "and others like it" for
   rafts; for mud huts consider SSE **63329** alongside Mud Mother Grove
   (146557, already sourced). Sourcing pass dispatched.
   **Round 2 leads (owner, 2026-09-02, with a steer that the research so
   far was not thorough enough):** many boat mods exist (e.g. SSE
   **110882**; classic videos/4100); **Argonian Exports** (Steam Workshop
   189297755) may cover various gaps; classic **86156** "northern Argonian
   settlement"; and the r/skyrimmods thread "Best mods for Argonians"
   (reddit.com/r/skyrimmods/comments/1fsawo1) is to be read and its links
   critically considered, not skimmed.
   **Round 3 leads (owner, 2026-09-02):** SSE **36149** (more rowboats);
   SSE **35933** *The Blackest Reaches* (Argonia monster-hunt quest mod —
   check for settlement/environment pieces now; ALSO recorded in module 90
   §74's creature candidate table as a Phase 13 creature/boss lead).
   **Round 4 leads (owner, 2026-09-02) — underwater:** SSE **70917**
   (underwater-quest material), SSE **17267** (underwater treasure — may
   or may not ship new assets), SSE **26913** (underwater generally).
   Underwater POIs throughout appropriate regions are an acceptance
   criterion (00-core) — evaluate for wreck/reef/sunken-structure/treasure
   assets for the catalogue's drowned/underwater families, and note any
   quest-design ideas for the quest plan even where no assets are taken.
   Plus SSE **174995** — mesh fixes for Depths of Skyrim: if Depths is
   sourced, take the fixed meshes (and credit both mods).
   **Round 5 (owner, 2026-09-02):** second reddit thread
   (reddit.com/r/skyrimmods/comments/17bhvze "Looking for Argonian based
   mods") — long list, go through and consider each, but **selectivity
   directive: don't go crazy with too many mods; take only what is
   genuinely useful**. Weapons/equipment finds there are NOT Phase 11 —
   record them in module 90's candidate tables for the later equipment
   passes (10b/13/15) instead of sourcing now.
   Also (owner): if Tropical Skyrim overhauls most vanilla assets, check
   the vault for **tropicalised vanilla static boats** — may be usable.
3. **Gideon anchor.** Its approved position sits on steep ground (14 %
   buildable in 400 m) — expect a nudge proposal within `toleranceUV` at
   Part 6.
4. **"No porting to other games" clauses — RULED, approved (owner,
   2026-09-02):** we may use these mods. Rationale: this is a standalone
   Skyrim overhaul/conversion mod, credited as such, for private personal
   use — not a new game. Unblocks the Ayleid exterior kit and the canoe
   mesh among others; credit every source as usual.
5. **Provenance check**: BM&V bundles a `swamp house.nif` (47 placements);
   a same-named Nexus mod was ripped from a commercial game. If they are
   the same asset it is unusable — flagged in both inventory artefacts.

6. **Player stronghold — A/B, for touchpoint ①.** Two catalogue records are
   flagged `strongholdCandidate: true` and both stay flagged until the owner
   picks. **A — The Meeruth Station** (`place.hist-heartland.xal-meeruth-station`,
   interior): an abandoned Imperial river station on the Helstrom approach —
   stone quay, walled yard, magazine; deep in Hist country, far from every
   service, and both the interior tribes and the Veiled Reed would rather it
   stayed nobody's. **B — Rockpoint** (`place.pirate-freeholds.rockpoint`,
   the northern freeholds): the canon-named landing that lost its trade war
   with Alten Corimont — standing warehouse shell, defensible bank, a river
   bar that will not take a laden hull, and a smugglers' town twenty minutes
   downriver. A is remote, sacred-adjacent and hard to supply; B is
   well-connected, commercially entangled and cheap to reach. Whichever loses
   stays in the catalogue as an ordinary place, so the choice is reversible
   until Part 7.

**Re-review corrections worth knowing (2026-09-02, commit `d959986`):**
the vault's Xanmeer Tileset terrace kit IS stepped-pyramid massing (stack
decreasing terraces; round-1 "no massing" was wrong — the true gap is
ornamental frontage); rafts/canoes remain fully open pending Q2's eyeball
(both new boat mods are keeled Nord hulls per the re-sweep); the vault has
NO Skyrim DLC (Hearthfire's modular homestead kit is the real loss);
Nexus has no true mud-hut kit or raft/canoe pack at all — the mud culture
will be kitbashed permanently, plan for it. Next sourcing priorities:
Ships and Boats of Tamriel (SSE 41653, flat-bottomed hulls) and Skyfall's
Sleeping Hist Tree Overhaul (SSE 116792, mesh variants for the ten hero
Hist + cairns-as-grave-markers).

### Part 4 step 2, round 2 — the hostile/settlement mix rebalance (2026-09-04)

The owner's corrected target (research doc § Target, § 8b) is that at least
55–65 % of places should be hostile and clearable, as in Skyrim and Morrowind,
and that the province should hold no *more* settlement and civic fabric than
Morrowind does. The catalogue was at 43 % dungeon-or-hostile and 29 %
settlement-plus-civic. It is now **55.7 %** and **21.7 %**, with hostile
baselines on **59 %** of non-settlement records, at **557 live records** (from
576). No id was created or destroyed. 145 records had their stance rebalanced by
rule against contents they already carried; 28 low-value settlement and civic
records were converted into overrun, drowned, burnt or raider-held versions of
themselves, keeping their names and getting fully rewritten prose in their
region's register; 14 more dangerous places got an interior and a stance; 8
honest interiors were added without changing a stance; 19 pure-density
settlement and civic records were deferred with their edges parked in
`relationsReserved`. Rest cadence improved (the one D3+ delve without a rest in
range is now zero), every city keeps its core purposes and edge ring, and every
region stays inside its hard floor. Housekeeping from the text reviewers landed
in the same pass: 33 "Canon:" and "canon says" openers rewritten as plain
in-world fact (the citations were already in `sources`), four factual conflicts
fixed, the pirate freehold smithy renamed "The Chimney" in the sailor's-shorthand
register, and the Xi-Tsei siting rationale moved out of `why.founding` into a new
`sitingNote` field. Two tool bugs were root-caused rather than patched around:
`macro_plot`'s hostile-clustering rule was a fixed count calibrated for the old
mix and is now a share rule, and `compile_minor_routes` now refuses to start a
footpath at a land cell further than `SNAP_M` from a water-sited record. Count
bands re-derived; `npm test`, `npm run typecheck` and the worldgen suite green.
