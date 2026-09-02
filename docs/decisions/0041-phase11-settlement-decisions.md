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

**Size the catalogue on real numbers** (MEASURED 2026-09-02, terrain scour):
authored land is **33.52 km²** (54.40 km² bounding square minus open sea
16.46, lakes 3.31, deep channels 1.10; shallow marsh counts as authored).
At 18–22/km² fine-tempo that is **~600–740 records**, pulled lower by the
8–12/km² D4–D5 rate — set fan-out and owner expectations on that, not
"thousands".

**Owner rulings on derivation richness (2026-09-02):** (a) the Blackrose
"reference watershed" special status is STALE — superseded in 00-core and
module 95 §85.2; no zone gets extra depth on that authority; (b) **all
province slices are derived equally richly** — record counts still follow
the causal density gradient, but per-record depth/quality (why, vibe
signature, relations, asset plan) must be uniform across regions; the
critique pass checks richness parity between zones explicitly.

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
