# Phases — the build sequence and every phase's plan

This folder is the **schedule**: every phase of the world build, in the order
it runs, with its deliverables (§86 below, one section per phase) and, where a
phase has been broken into agent-sized chunks, a folder holding the plan and
one brief per chunk. The owner runs a chunked phase by saying `deliver 16a`,
`deliver 16b`, and so on — one fresh agent per chunk, an owner check between.
Status lives only in [../PROGRESS.md](../PROGRESS.md); "why" lives in
[../decisions/](../decisions/README.md). The topic modules in
[../world/](../world/README.md) (hydrology, water, vegetation, assets, studio…)
are not phases — several phases each draw on one module.

| Phase | What it is | Plan | History |
|---|---|---|---|
| 0–8c | sources, monorepo, province ingest, hydrology, society, studio, terrain, character, light, water, weather | [§86.1](#861-done--phases-08c-summary-statuses-and-evidence-in-progressmd) (done) | decisions 0001–0032; round logs in [../research/archive/](../research/README.md) |
| 10 | asset deep catalogue, kits, vegetation machinery | [§ Phase 10](#phase-10--asset-deep-catalogue-and-kit-compilers) (done) | [0036](../decisions/0036-phase10-placement-decisions.md), [0048](../decisions/0048-vegetation-density-ladder.md), archive `phase10-rounds/` |
| 11 | settlement and location system, exemplar-first | [§ Phase 11](#phase-11--the-settlement-and-location-system-exemplar-first--absorbed-into-phase-16-2026-09-11-seams-re-cut-2026-09-12-decision-0061) — absorbed into 16; the table there says where each deliverable went | [0041](../decisions/0041-phase11-settlement-decisions.md), archive `phase11-rounds/` |
| **16** | **terrain once, water once, places on a frozen world** (current) | [16-foundation-and-places/](16-foundation-and-places/README.md) — chunks 16a–16j | [0057](../decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md); audits in [../research/phase16/](../research/phase16/README.md) |
| 9 | swimming, climbing, boats | [§ Phase 9](#phase-9--swimming-climbing-and-boats) | research [swim-climb-boat](../research/combat-and-systems/swim-climb-boat-implementation.md) |
| 10b | full sandbox parity in the studio | [§ Phase 10b](#phase-10b--full-portable-sandbox-parity-in-the-studio) | [0017](../decisions/0017-sandbox-parity-moved-to-phase-10b.md) |
| 10c | stats and progression implementation | [§ Phase 10c](#phase-10c--stats-progression-and-character-systems-module-76) | [../world/76](../world/76-stats-progression.md), [0019](../decisions/0019-stats-system-workstream-and-placement.md) |
| 13 | fauna ecology, encounters, fixed loot (systems only; rollout in 15) | [§ Phase 13](#phase-13--fauna-ecology-encounters-and-fixed-loot-exemplar-first) | — |
| **12** | **interiors**: every assembled interior, dungeon or building — research, the furnishing mine, the skill proved on exemplars then unattended; sites and promises are authored earlier with the places | [§ Phase 12](#phase-12--interiors-research-the-furnishing-mine-and-a-skill-proved-on-exemplars) | [0062](../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md) |
| P (+12b) | rolling polish pass; the soundscape | [§ Phase P](#phase-p--general-polish-pass-rolling-including-phase-12b--the-soundscape) + [P-polish/backlog.md](P-polish/backlog.md) | [0023](../decisions/0023-soundscape-polish-tier-and-credits.md) |
| 14 | streaming and deployment (budgets; the renderer extraction moved to 10b) | [§ Phase 14](#phase-14--streaming-and-deployment) | [0062](../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md) |
| 15 | rollout by region packet, one pass per packet once every system exists; the 16j trial packet is packet one | [§ Phase 15](#phase-15--rollout-by-region-packet) | [0034](../decisions/0034-build-sequence-rework.md), [0062](../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md) |
| after | the game build-out (everything the final game needs beyond the world) | [buildout/](buildout/README.md) | [0038](../decisions/0038-world-build-vs-game-buildout-seam.md) |

Parallel workstreams (L lore, N quest review, S stats design, T text, C combat)
are recorded in PROGRESS.md and their decisions, not here. Phase numbers are
stable ids, not positions ([Phase-ID history](#phase-id-history)).

**The queue (owner 2026-09-13, decision 0062).** One ordered line, one
chunk at a time, with an owner check after each: **16a–16j → 9 (thin swim first) →
10b → 10c → 13 → 12 interiors → 12b soundscape → 14 → 15 rollout**. Nothing
runs in parallel unless the owner opens a second line for a specific job.
Rollout waits until every system it rolls out exists. 16j proves the
settlement rollout skill once; that proof holds until Phase 15 uses it.
**The owner is hands-on for every major city and for the opening-scene
places** (the prisoner tutorial in the marsh near Stormhold and Alten
Corimont, quests 00 §overview) in every phase that touches them: no skill
runs unattended on those, ever (world 96 §3).

**Conventions.** A chunked phase is `NN-slug/README.md` (the plan: items,
sequence, coverage, owner decisions) plus `NNx-chunk-slug.md` per chunk (goal,
**a dated Starting state**: what exists, what is broken, what is red, what
to keep; then read list, deliverables, acceptance, owner check, gotchas). The
agent that closes a chunk rewrites the next chunk's Starting state from its
ledger in the same commit; nobody starts from a blank slate. A phase gets a
folder when it is broken into chunks, not before; until then its section
below is its plan.

---

# Part XIII — Build sequence: the phase plan (§85–87)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](../world/00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

## 85. Three scales from the first development cycle

### 85.1 Whole province

The full Argonia extent receives production data immediately:

- coordinate system;
- All Tamriel / Argonia macro heightmap source;
- coastline;
- canonical settlement anchors;
- source confidence;
- coarse terrain;
- coarse hydrology;
- region and watershed boundaries;
- cultural/danger gradients;
- primary transport graph;
- low-resolution world-studio preview.

### 85.2 Retained reference watershed — SUPERSEDED (owner, 2026-09-02)

**Stale.** The province is now built in detail everywhere for terrain,
textures and water (good-enough pending Phase P polish), and placement
exemplars (§85.4) are chosen per system for contrast — the Phase 10
vegetation exemplars include the Blackrose basin but are not confined to
it. Nothing is special about Blackrose any more; do not weight work toward
it on this section's authority. The original selection criteria are kept
below only as a checklist of what a *good exemplar area* offers:

- meaningful river system;
- transition between fringe and deeper marsh;
- one fixed or lore-compatible settlement;
- boat, swim and foot travel;
- floodplain and dry high ground;
- underwater POI;
- current Argonian settlement;
- ancient ruin;
- Imperial or foreign historical layer;
- combat and climbing opportunities;
- feasible asset coverage.

The watershed inherits province hydrology. Its results refine the province compilers.

### 85.3 Micro-laboratories

Small isolated scenes test:

- water optics;
- ripple interaction;
- Rapier buoyancy;
- swimming transitions;
- climb contact;
- boat control;
- arrow/material response;
- dense vegetation performance;
- dungeon-kit snapping.

### 85.4 Exemplar-first for placement systems (decisions 0029/0034)

The placement-type phases (10 vegetation/kits, 11 settlements, 12 dungeons,
13 ecology/encounters/loot) do **not** deliver the whole province in one pass.
Each builds a reusable, configurable *system*, proven small and then rolled
out as data:

1. prove risky mechanics in disposable micro-labs (§85.3);
2. build the system by authoring **one retained exemplar through the data
   format** (blueprint/config → compiler → world), never by hand placement —
   the exemplar doubles as the compiler's first regression fixture;
3. validate on **2–3 contrasting instances** (different region class, culture,
   danger band) — the contrast set is where configurability is proven. Each
   placement phase opens by *proposing its contrast set* for owner sign-off;
4. roll out as data, region packet by region packet (Phase 15, one pass per
   packet once every system it rolls out exists), with owner gates at the
   exemplar and the contrast set, not per instance; cities and the
   opening-scene places are always owner-guided. **Done
   early for vegetation**: the terrain chain's final `compile_scatter` stage
   bakes every chunk, so flora has been province-wide since 2026-09-07
   (decision 0036, 2026-09-08 record) — the gates were the six Phase 10
   exemplar rings, and per-region palette tuning continues as data.

Whole-province-at-once remains right for global fields and systems (terrain,
hydrology, light, water, weather, streaming) — exactly as Phases 2–8 were
run. Exemplars live in retained content, chosen per system for contrast
(the Blackrose-first preference of 0008 is superseded — §85.2). Wherever the shipped games' data can teach the rules,
mine it first (§86.0b).

## 86. Phase plan

Progress through these phases is tracked in [docs/PROGRESS.md](../PROGRESS.md), never
in this document. Phases are milestones, not straitjackets: a phase may be split
into sub-milestones in PROGRESS.md when that gives the user earlier playtest
gates, and parts of a phase may be re-slotted into another when risk ordering
favours it (owner permission, 0034 — e.g. the flora half of ecology runs with
Phase 10's vegetation work; a thin swim slice may run any time). The §86.0
constraints are what must hold; the phase boundaries are packaging.
**Side lanes** (decision 0074) run beside this queue on files no active chunk
touches: [lanes/README.md](lanes/README.md).

**Phase numbers are stable IDs, not positions.** The order of work has been
revised (0034) but IDs are never renumbered, so decision records, quest
provisions (P9, P11, …) and every cross-doc reference stay valid forever.
This document reads in **execution order**: done work first (§86.1, compressed
— detail lives in PROGRESS and git history), then the remaining phases in the
order they will actually run. The ID-history note at the end of §86 records
what moved and when.

### 86.0 What actually depends on what

The queue below §86.1 is the owner-approved order; these are the real
*constraints* behind it — anything not listed here is sequenced for risk or
convenience and can be re-ordered by the owner.

| This… | must come before… | because |
|---|---|---|
| 8a light/sky | 8b water | water shading consumes sun, sky, IBL and exposure; moon phase drives tides |
| 8a light/sky | 10 kits, 11 settlements, 12 dungeons | nothing visual is approved under placeholder light (0016) |
| 8a world clock | 8c weather, 13 ecology, 11+ quests | the season scalar `s(t)`, schedules and calendared events all read one clock |
| 9 swim/climb/boats | 10b parity | the §53 orchestration extraction should merge once, against a character package that already has every movement mode |
| 10 kits | 10b parity | combat-space probes measure against production geometry |
| 10b parity | **15 packet freeze** | a region packet freezes only after combat-space and critical-animation probes pass on its geometry (00-core acceptance). Exemplar *authoring* may start before 10b — a **freeze-gate, not a start-gate** (0034) |
| **S** stats design | 10c; all place and interior *authoring* | 10c implements what S decides; content is authored **semantically** against the S schema — ladder references ("strong D3, diseased") compiled to absolutes (0019 fourth amendment, module 76 §128) — so authoring needs the accepted schema, not the implemented system |
| 10c stats | **13**, 12 interiors, **15** | compiled numbers, regenerated capability profiles and the balance harness must exist before authored content is balance-validated/frozen, and before Phase 13 authors encounters and loot |
| 3/4 climate fields | 8a haze, 8c weather, 13 ecology | one source of climate truth, many consumers (§33.1) |
| 8a world clock | 12b soundscape | ambience beds crossfade on `dayPhase()` and season (§106) |
| 13 ecology | 12b soundscape | creature calls and settlement/ecology ambience are authored **from** the ecology data *by the sound phase* — you can't place frog sounds until you know where the frogs are (0034). 12b sits in the Phase P polish tier and must land before Phase 14 locks performance budgets |
| 10 vegetation renderer + scatter compiler (§109–112) | 11, 13 | places are dressed and judged at real vegetation density; Phase 13 authors against measured budgets |
| **16 frozen base + water** | 12, 15 | nothing after 16b re-carves terrain or moves water; a packet's or an interior's ground work is typed local patches that fail when they would (0057/0059); interior water is a plane inside a cell, never terrain hydrology |
| 16g promise vocabulary | 16j, 12, 15 | every dungeon-kind record carries typed promises (rooms, loops, traversal, combat spaces, anchor sockets, slots) in a vocabulary fixed before anyone authors more of them; a family with no realisation recipe backed by a kit that exists is re-typed, not promised |
| 16i interior load contract + tier A | 12, 15 | the door transition and cell loading exist and have been walked before any interior is assembled |
| 9 thin swim | 12 (underwater entrances), 15 | 52 records have underwater entrances; nobody can review one without swimming |
| 13 fauna/loot | 12 interiors | rooms are designed knowing what will live in them and what the loot compiler can fill |
| 12 interiors | 12b, 15 | acoustic profiles and the interiors rollout both read the interiors skill's output |
| 12, 12b, 14 | 15 | rollout runs once per packet with every system it rolls out in existence |
| 10 kit collision | 10b nav bake (§114) | navmesh is generated from kit collision geometry; 10b's combat-space probes measure "enemy navigation access" on the baked data |

The rows are hard constraints **except the two feeding 10b**, which are
sequencing *preferences* (merge the §53 extraction once; measure combat spaces
against real kits) and may bend if a phase stalls.

**Why this order (0034, risk-first):** the unretired dealbreaker risks are
vegetation-at-scale and whether the settlement/dungeon placement systems can
produce good places at all — those must be seen early. Traversal is
well-understood sourcing plus known techniques (boats may slip or, at worst,
be dropped without killing the game); parity and streaming are
well-understood refactoring against known targets. A thin swim slice may be
pulled earlier at any time (vanilla clips + the 8b water query make it cheap,
and it unlocks reviewing underwater POIs).

Deliberately **not** dependencies: the world build does not need the stats
system (capability profiles are the contract — module 75 §52), and it does not
need full sandbox parity (Phase 7a's movement plus the environment query is
enough).

Parallel workstreams run alongside the phase queue and block only what the
table says: **L** (lore extrapolation, module 45 — closed), **N** (quest-plan
review, decision 0018 — closed), **S** (stats design, module 76 §103.1).

### 86.0b Mine the shipped worlds for rules (0034)

Skyrim's and the source mods' data files are not just asset containers — they
are **records of how professional teams solved our placement problems**, and
the placement phases mine them for rules and principles before inventing
their own, at both the micro level (which species on which slope/wetness,
clutter around a hut, grass density per ground type) and the macro level
(how composition varies across regions, POI spacing, settlement make-up).
The pattern is already proven twice: the weather system adopted Bethesda's
`WTHR` record as a *checklist* and computed the values from our fields
(0016 §4), and the `bmv-v1` ground palette came from mining BM&V's painted
landscape (90 §74.1b). Generalise it:

- **adopt record schemas as checklists, compute values from our fields**
  (never hand-copy their numbers into ours);
- **extend the plugin readers** (`worldgen/esp.py` reads heightfields,
  `esp_landtex.py` reads texture painting) to the records the task needs —
  object placements (REFR/CELL), tree/flora statics, grass definitions
  (GRAS/LTEX bindings), region records (REGN) — and extract *statistics*:
  species-vs-slope/wetness, densities, cluster spacing, POI spacing along
  roads, settlement building counts;
- sources to mine: vanilla Skyrim, **BM&V's worldspaces** (an art-directed
  Black Marsh — the closest reference that exists), Tropical Skyrim;
- record findings as `docs/research/` docs and feed them into compiler
  defaults; the no-lift-and-shift rule (00-core rule 6) is untouched — we
  mine *rules*, never their authored places.

**Done for vegetation (Phase 10, 2026-08-30):**
[shipped-world-placement-rules.md](../research/placement-settlements/shipped-world-placement-rules.md)
— 14 rules from 186k placed references across BM&V's Black Marsh and
Valenwood plus Bethesda's grass schema. The readers are
`worldgen/esp_index.py` (base objects, worldspace cells, references, LAND
painting, REGN object tables, GRAS), driven by `worldgen/mine_placement.py`
and `worldgen/mine_groundcover.py`. **Done for settlement
composition and interior assembly (Phase 11, 2026-09-06):**
[mined-interior-assembly-and-settlement-form.md](../research/placement-settlements/mined-interior-assembly-and-settlement-form.md)
(`Plugin.interior_cells`, door teleports, co-placements). **Still to mine:**
dungeon assembly by family (Phase 12, same readers) and habitat/encounter
patterns (Phase 13).

### 86.1 Done — Phases 0–8c (summary; statuses and evidence in PROGRESS.md)

The original deliverable lists served their purpose; they live in this file's
git history (pre-0034 revision) and the phase decision records. One line each:

| Phase | What it delivered |
|---|---|
| 0 | Sources and vault contract (0001), era policy 4E 201 (0002), units/coordinates (0003), fixed difficulty as architecture (0004), credits foundation |
| 1 | Monorepo migration (sandbox → `apps/combat-sandbox`, pipeline → `tooling/asset-pipeline`), workspaces, CI + Pages deploy (1a); package boundaries, contracts, game/studio shells (1b) |
| 2 | Province heightfield ingest via our own plugin reader (0005), coastline/sea level, fixed settlement anchors + tolerance polygons, source-confidence visualisation |
| 3 | Province hydrology: basins/flow/rivers/wetlands, tides + salinity, flood frequency, soils, watershed boundaries, ecological region classes |
| 4 | Fixed danger profiles, culture territories, demographic priors, foot/road/boat/root macro graphs, settlement roles, deep-marsh access progression (0007) |
| 5 | World Studio: full map + layers, click-to-spawn, fly/orbit, reproducible URLs |
| 6 | Province terrain + deterministic refinement (scope extended basin → whole province, 0008 addendum), ground-material system (0011), chunks + LODs |
| 6b | ×1/×1 rescale + orogeny + character-scale naturalness (0015): erosion-carved relief, de-terracing, micro-undulation, triplanar, standing probes. Deferred item folded into Phase 10: dedicated scree/gravel ground material |
| 7a | Physical character core extracted to `game-core`/`character`/`character-assets` (0013) behind `PlayerMovementController`; environment-query contract; desktop/touch/pad parity. Scene orchestration, inventory/equipment UI, enemies/targeting and the bow stayed in the sandbox — they move with Phase 10b |
| 8a | World clock + canon calendar (`packages/world-time`), sun/moon/star ephemeris, physical light rig + CSM + aerial perspective, studio time tooling (0016/0020/0021). Deferred: beyond-border land apron (module 55 §98b) |
| 8b | Water renderer + CPU/Rapier water query, buoyancy, river/marsh/estuary/coast/underwater profiles, moon-driven tides (0025) |
| 8c | Weather state machine on the climate fields, computed `WTHR`-checklist parameter blocks, clouds/rain/storms, three mist regimes, weather↔wetness↔visibility↔AI coupling via the environment query (0032) |

Closed parallel workstreams: **L** lore extrapolation (module 45), **N**
quest-plan review (0018/0030). **S** stats design (module 76 §103.1) runs
until accepted; 10c implements it.

---

The remaining phases follow, **in execution order**.

### Phase 10 — asset deep catalogue and kit compilers

**The catalogue spans the whole permitted pool, not vanilla-plus-one-kit**
(0034 — no shortcuts here). The sources, in the module 90 §71 preference
order: **Black Marsh & Valenwood** (12.8k meshes: architecture, ~700
swamp/tropical trees, clutter, dungeon and creature packs — the house style,
already in the vault), **Tropical Skyrim** (trees/palms, jungle flora,
grasses, creature retextures, architecture — in the vault, "sweep this
archive FIRST"), the **Xanmeer kit** (85 pieces), and **vanilla Skyrim** plus
the §75–79 candidate tables where genuinely neutral or better. These pools
hold thousands of usable assets and the world should draw widely and
appropriately on them — **creatures explicitly included**, alongside the
obvious architecture/flora/clutter. Working rule: **catalogue wide,
kit-compile deep on demand** — the registry sweep covers everything worth
tagging; full kit/collision/LOD treatment follows what the exemplars and
region packets actually place, so breadth never stalls the phase.

Deliverables:

- semantic asset registry across all four pools (culture/biome tags, §72),
  creatures included;
- Xanmeer kit metadata and snapping; first current-settlement kit;
- vegetation and underwater kits from the BM&V/Tropical Skyrim flora pools;
- **data-file rule mining (§86.0b)**: extend the plugin readers to placement/
  grass/region records and mine vanilla + BM&V + Tropical Skyrim for
  vegetation-placement and composition statistics, recorded as research docs
  and fed into the scatter compiler's defaults;
- **the flora half of ecology, pulled forward from Phase 13** (0034 split):
  per-region species palettes and density authoring (region grammar §16) for
  the exemplar areas — deciding *what grows where and how it varies across
  regions* is inseparable from building the scatter system. Fauna/encounter
  ecology stays at Phase 13 (it needs enemies and compiled stats);
  province-wide flora fill lands with the Phase 15 packets;
- **the vegetation/scatter architecture (module 65, §109–112)**: deterministic
  scatter compiler pass (jittered-grid hash, constraint filters, clearance
  stamping), T1 batched hero statics + T2 bundle-instanced mid detail with LOD
  chains, T3 runtime groundcover ring from the land-cover raster, T4
  impostor/merged far LOD, weather-driven wind uniforms — proven first in the
  dense-vegetation micro-lab (§85.3), budget-probed (§69), landed on the
  reference watershed;
- physical materials (the scree/gravel ground material deferred from 6b
  landed 2026-08-31: material slot 37 + the talus-apron rule in
  `landcover.py`, see docs/research/rendering/black-marsh-ground-texture-sources.md);
- LOD and collision generation;
- source/credits reference check in CI.

### Phase 11 — the settlement and location system (exemplar-first) — ABSORBED INTO PHASE 16 (2026-09-11; seams re-cut 2026-09-12, decision 0061)

Phase 11 built the settlement/POI *system* (causal-model schema, the
blueprint→compiler path, the district/route/parcel compiler, the
location-orphan validator, the macro plot) and delivered five exemplars
that the owner's walk found wrong at the runtime boundary. The system
survives; everything Phase 11 still owed now has a named home. Nothing is
parked:

| Phase 11 deliverable | Where it is delivered now |
|---|---|
| runtime correctness of what the compiler placed | 16h |
| the five exemplars, exterior | 16i |
| the **Hist-centred** and **Imperial-fringe settlement grammars** — in practice the type recipes (`type-recipes.json`) plus the mined kit-assembly templates | proven on the exemplars in 16i (Lilmoth is the Imperial-fringe city; Nine-Trunks and Mazzatun the Hist-centred pair), proven unattended in 16j; further recipes per packet in 15 |
| "all settlement structures enterable": door, interior-claim record, door reachable every compile | 16h (door + reachability), 16i (tier A interiors and the reserved-door state), Phase 12 (assembled interiors) |
| **D0 safe interiors** per settlement; Helstrom D0 with gates against the band-5 basin | the exemplars' in 16i; every other settlement's in its Phase 15 packet (tier A verbatim where a linked cell exists, else assembled by the Phase 12 skill); Helstrom is a city, owner-guided, in its packet |
| **Morrowind-style travel services** (ferrymen, boat owners, rootworm Waykeepers: talk-pay-arrive over a geographically sensible service graph) and the **root-transit network re-authoring** with Hist-node placement | 16e (the typed service graph as one record with ferries, boat services and a talk-pay-arrive contract; ferry landings and berths recorded on the graph); 16h draws the hulls and landings; 16g re-authors the rootworm stations at the hero Hist nodes it places (0068) |
| **player-stronghold site reservation** (quests 30 §24b.5; 0028) | 16g reserves the record and its design group; its interior is a Phase 12 family (a reoccupied xanmeer or a river station) |
| **quest location roster** and the per-quest world provisions | re-validated in 16g against the frozen world; per packet in 15 |
| **quest–world co-design loop** (quests 90 §65b, a completion gate per packet) | 16j runs it on the trial packet; Phase 15 runs it per packet before freeze |
| **content-density budget** (18–22 named POIs/km² in D0–D3, 8–12 in D4–D5, something named within ≤300 m of every road and lane; reward coverage per 20 §12.3b) | 16g reports it per zone on the re-validated plot; Phase 15 declares it per packet as built content at freeze; a dungeon-kind record counts once its interior is delivered against its promises |

Decisions and history: [0041](../decisions/0041-phase11-settlement-decisions.md),
[research/archive/phase11-rounds/](../research/archive/phase11-rounds/phase11-gap-plan.md).
The mined composition rules (§86.0b) are in
[mined-interior-assembly-and-settlement-form.md](../research/placement-settlements/mined-interior-assembly-and-settlement-form.md).

### Phase 16 — the frozen foundation and the place ladder (owner 2026-09-11)

**Runs now, first in the queue.** Phase 11's
exemplar work, the water round-2 leftovers and the terrain/vegetation/route
rows of the polish backlog are absorbed into one sequenced phase (decision
[0057](../decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md)).
The plan, its chunks (16a–16j, one fresh agent each, owner check between),
the coverage matrix and the owner decisions are in
[../phases/16-foundation-and-places/README.md](../phases/16-foundation-and-places/README.md);
this section only fixes what the phase ships.

Deliverables:

- a typed, committed **hydrology graph** (rivers end to end, reaches of kind
  horizontal / sloped / vertical, junctions, bodies with kind, altitude band
  and stored season) with stable geographic ids, reviewed on the 2D map
  before any terrain moves;
- the **base terrain built once** to enable every feature the graph names
  (trenches, plunge bowls, knickpoints, tarn bowls, filled or accepted
  erosion pits, cliff realism, smoother deterracing), frozen with a
  content hash (the two-run proof 16b used is retired: one run per chunk,
  nothing above it re-executed, owner 2026-09-16);
- the **water compiled once** on that base, read-only to everything below,
  with the runtime defects (muted swell, static detail normals, horizon
  blend, hard discards, owner-mask gaps, LOD hover) fixed and the probes
  that would have caught them;
- the **beyond-border apron** stitched from the all-Tamriel heightmap, the
  boundary wall and its catalogue message;
- **routes, grading, spans and ferries** solved on the frozen world as a
  patch stack with channel-crossing invariants;
- **vegetation** that reads channel membership (no trees in rivers), rock
  dressing at falls and cliffs, and the owner's grass/dressing questions
  answered with measurements;
- the **macro plot re-validated** against the frozen world, with the
  place-count floor relaxed so records move, re-type or are cut rather than
  the world re-carved; `designGroup`s for places built together (Lost City +
  the Made Ground first);
- the **settlement runtime made correct** (walk-through colliders, grounding,
  doors, lamps mounted, stairs reachable, navigation consumed) and an
  off-world **kit QA loop** that produces rules and a skill, not per-piece
  approvals;
- the **five exemplars end to end** — 16i builds the door transition and
  the **interior load contract**, delivers every exemplar interior that a
  mod plugin already ships furnished behind that shell (**tier A**,
  verbatim); every other door gets a typed reserved state; **tier B**
  (assembled interiors) is Phase 12's;
- the **promise vocabulary** for dungeon-kind places fixed and every record
  migrated (16g), so sites, purposes, quest links and what-must-be-inside
  are authored with the places and the interiors are built later against
  them (decision 0062);
- the **rollout skill** proved on one unattended packet (16j), including
  dungeon sites with their entrances built and doors reserved; that packet
  is Phase 15's packet one and is completed there.

### Phase 12 — interiors: research, the furnishing mine and a skill proved on exemplars

**What this phase is (owner 2026-09-13, decision 0062).** Dungeons are
places. Their sites, identity, prose, purpose, quest links and **typed
promises of what must be inside** are authored with every other place
(16g fixes the vocabulary; 16j and Phase 15 author them per packet). This
phase, late in the queue, builds **the insides**: every interior that has
to be *assembled* rather than copied — dungeons of every family, hero
interiors and the settlement buildings whose shells have no furnished
cell in any mod plugin (tier B). It runs after Phase 13, so rooms are
designed knowing what will live in them; it runs before 12b and 14, so
acoustic profiles and budgets read finished rooms. Rollout of its skill is Phase 15.

**The three findings the phase starts from** (2026-09-13, both reviews):

- **Tier A is large for vanilla shells, thin for ours.** 571 link records
  over 330 shell models in the mined plugins tie a shell to a furnished
  interior cell; 481 are vanilla Skyrim buildings and about 90 come from
  our mod kits; none of our kit pieces has a `matched` interior of its
  own (about 279,000 placed objects, roughly
  100,000 clutter and 12,000 furniture); the plugin reader already decodes
  every reference's transform. 16i ships these verbatim. Tropical Skyrim
  retextured the cave and town-kit texture sets those cells use.
- **Nothing Argonian ships an interior.** Every xanmeer interior and every
  hut interior is tier B. The hut kits carry matching hollow interior
  shells, unfurnished.
- **Our cave kit is modular.** `dungeon-root-v1` is BM&V's cave kit: halls,
  corridors and rooms on 256- and 512-unit modules with doorway sockets.
  The "freely placed, 40 % tilted" finding in the mined data is vanilla
  Skyrim's own cave shells, which we do not use for structure. Root
  caverns, flooded caves and sinkhole ruins (175 of the 327 dungeon-kind
  records) therefore realise on a grid; a flooded cave is that grid with a
  water plane at one level inside the cell.

**Relaxed preferences that make the phase small** (owner invited these
2026-09-13; each is a recorded taste call the owner may reverse):

1. **An interior need not match its shell's culture piece for piece.** A
   furnished vanilla farmhouse or town cell, retextured, behind an Argonian
   hut door is acceptable where the hut's own interior shell has no
   furnishing; Morrowind and Skyrim both reuse generic interiors behind
   varied fronts. This moves most settlement interiors from tier B to tier A.
2. **Assembled interiors are kit-bashed at chamber level, not piece level.**
   The mined library of 1,825 furnished chambers (with their doorway
   sockets) is the unit of assembly; the skill composes chambers by socket
   and re-dresses at the mined clutter rate per family. Piece-level layout
   and furniture placement by an agent are the exception (hero rooms).
3. **The dungeon share of the density budget is a lever, not a target.** At
   16g a delve whose lore allows it may be re-typed to an exterior ruin,
   camp, shrine or landmark that needs no interior; the budget counts named
   places, not doors.

**Research agenda (one chunk, written first; sources: the plugins and the
Creation Kit data model, per §86.0b):** furniture records' NPC-use markers
(sit, sleep, lean, work) mapped onto sourced idle clips; room bounds and
portals for occlusion; lighting templates and interior light placement
(no sun, local lights, fog colour: the one genuinely new rendering job,
forced early by 16i's tier A); locks, ownership, counts and enable-parents
on references (a container record is read for what the container *is*: its
mesh, lock and owner; **never its levelled list** — loot is authored per
record and fixed, 00-core rule 9);
static collections and copied reference groups as the mod authors'
prefab idiom; **the furnishing mine**: room function inferred from the
furniture mix per chamber, wall-relative positions and co-occurrence per
function, ceiling clearance from mesh bounds (the follow-up the mined-interior
research names and did not do); xanmeer connect geometry derived from the
meshes, since no placed example exists.

**How an agent places things precisely** (the owner's question): it never
types coordinates. Every kit piece carries its footprint, origin offset and
doorway sockets in its manifest (metres, cell-local, Y-up); an agent authors
a **chamber graph** (rooms typed by function and combat-space scale, edges
typed corridor / stair / swim / climb / shortcut, promises pinned to nodes)
and the compiler snaps chambers socket to socket in a chain of local frames,
exactly as Creation Kit's snap-to-reference does. Furniture lands by the
mined wall-relative rules per room function. The 3D model the agent holds is
the graph plus the compiler's report of what it produced, never a list of
positions.

**Deliverables:**

- the research chunk above, recorded in `docs/research/interiors/`;
- the chamber library and furnishing rules mined from the plugins (statistics
  and reusable chambers, never a copied dungeon: 00-core rule 6);
- the chamber-graph compiler on the 16i load contract: grid families
  (`dungeon-root-v1`, `xanmeer-interior-v1`, imperial and hlaalu tilesets),
  the interior water plane, entrances hung on the 16i portal records so a
  dungeon door and a house door are one mechanism, exterior footprint as a
  typed patch or nothing;
- interior navmesh bakes through 10b's pipeline; per-cell lighting profiles
  (acoustic values are 12b's, on the field 16i created);
- **the exemplar loop, until the skill holds**: one exemplar per grid family
  authored by hand *through the tools* (a modular root cavern first), every
  hand decision promoted into the `interior-build` skill, the skill run
  unattended on two more of that family, the gaps closed in the skill, again
  until an unattended run passes the owner's walk; families gated by size
  band (small ones share the checklist; S3+ complexes get their own
  exemplar and, if a grammar is needed, a grammar chunk when the first is due);
- **quest and hero interiors, owner-guided**: the submerged Eye observatory,
  Blackrose prison archive and tunnels, the Lilmoth Tidal Palace heist
  complex, the two optional Eye-route chains, the Lost City in the deep
  basin beyond Helstrom, the stronghold site; the opening-scene places
  (quests 00) if any interior is theirs;
- a delivery manifest per interior against the record's promises. The
  promises project to record-only obligations today
  (`worldgen.place_obligations.record_obligations`, owner `phase-12`, 16g);
  the manifest verifier is written by the first chunk that emits a
  manifest (16i, tier A interiors) and hard-fails missing, empty,
  duplicate and stale rows; the automation-readiness checklist (96 §3)
  ticked per family.

**The place-obligation contract (binding for this phase, 13 and the quest
compilers).** `worldgen.place_obligations` projects every delivery-bearing
catalogue detail and every blueprint `playerPurpose` into stable typed
obligations, preserving the originating catalogue path; provenance and plot
mechanics are classified but never masquerade as content. Each owning phase
emits a schema-versioned manifest `{obligationId, objectRefs}`; final
assembly joins the expected set to all verified manifests before deployment.
`purpose-ledger.json` is a compatibility view, never evidence that content
exists. 16g generalises the projection to records without blueprints.

### Phase 9 — swimming, climbing and boats

**This phase extends the existing character stack; it does not build a parallel
one.** New movement modes go behind `PlayerMovementController` (§51), new clips
into the same animation manifest with the same integrity gates, new physics
through Rapier. The sandbox's systems are **not frozen** — refactor and extend
them where the game needs it (§51.1); what's protected is the calibrated
*feel*, not the code.

**Animation sourcing comes first, and it is sourcing — we never author
animation** (CLAUDE.md; module 90 §71). The rig currently carries 158 clips (measured 2026-09-18 in the generated animation manifest; the "51" of the first plan and the "103" of 2026-09-13 are history)
(locomotion, jump, one-handed and bow combat, guard, parry, rolls, criticals,
deaths) — **none for swimming, climbing, wading, rowing or boarding**. Work the
gap table in **module 90 §74.3**, which already names researched candidates:

- **swim**: vanilla Skyrim swim locomotion exists — use it unless a mod set is
  substantially better;
- **climb**: vanilla has none, so the clips come from the mod scene (EVG
  Animated Traversal is the base the climbing-mod ecosystem is built on).
  BotW-style climbing is then *our* procedural surface-contact logic **driving
  sourced clips**, not invented motion — prototype it in a micro-laboratory
  (§85.3) before it enters the province;
- **boat**: no player rowing clips in vanilla; source what exists, expect
  seated poses plus procedural oar/tiller drive, with the boat's own motion
  carrying much of the read;
- ingest through the asset pipeline into the shared manifest, record source and
  credits (§73), and keep the animation-asset integrity test green.

Micro-laboratories (§85.3) already reserve swimming transitions, climb contact
and boat control — prove each there before touching the province.

**Movement only** (owner 2026-09-13, decision 0062, reversing the
2026-09-04 note): the submerged scatter band and the wreck and
submerged-ruin statics are built by 16f, which owns the scatter compiler;
a wreck is a catalogue place with promises like any other. The thin swim
slice is where the owner *judges* them, because swimming through bare sand
proves nothing.

**Starting state (2026-09-13):** `PlayerMovementController` is a 60-line
interface with no mode enum or state machine (the seam is designed here,
not extended); capability profiles already carry `swimSpeed: 0` and
`climbSpeed: 0`; `packages/game-core/src/water/` already holds buoyancy, a
rigid-body water model, tide and flow contacts (part of the boat stack
exists); the manifest has 158 clips (measured 2026-09-18) and none for swim, climb,
wade, row or board; no boat or climb asset is in the repo (sourcing jobs, candidates in
90 §74.3); the water renderer and underwater blit are app-private in
`apps/world-studio/src/water/` until 10b extracts them, so 9a puts its
swim logic in `packages/` and touches the app-side blit as little as it can.

**Phase 9 runs as chunks, in this order: 9a thin swim** (vanilla clips,
the existing water query, Argonian breath, the thin stat hook; this is the
first chunk after 16j because 52 places have underwater entrances that
nobody can review without it), **9b boats, 9c climb**. The chunk briefs are
written by a "chunk Phase 9" job at 16j close, from module 90 §74.3 and
[swim-climb-boat-implementation.md](../research/combat-and-systems/swim-climb-boat-implementation.md). Climbing carries the animation-sourcing
risk — no ready-made wall-climb loops exist, but two sourceable pools do
(EVGAT's ladder-climb loops as the primary retarget candidate, and the
SkyParkour mod-authored clip set — module 90 §74.3); Phase 10b needs the
movement-mode *contracts* in place, not final climb polish, so a hard climb
problem must not block the chain. Boats may slip past 10b, and are droppable
at worst (owner tolerance, 0034). **The province boundary** (16d): four
fixed cuboid colliders stand just outside the built ground
(`packages/game-core/src/boundary/`, `PROVINCE_BOUNDARY` in contracts);
9c's climb-surface detection must exclude them; 9b's boats stop at them as the character does.

**Scope rule (0034): Phase 9 covers the player's own craft only.** Ferry
services and boat fast travel are **Morrowind-style** — speak to the
ferryman, pay, arrive: instant travel over a defined, geographically sensible
service graph, with NPC passengers as set dressing. No vessel simulation, no
ride-along. Those services are *world content*: 16e records the service graph and makes it
usable, 16h draws the boats, 16g re-authors the rootworm stations (0068). Player-boat cargo storage, passenger carrying,
repair/ownership and boat combat hooks are **deferred until a quest brief or
playtest demands them** — nothing in the current quest plan does (module 60
§45 tiers the list).

Deliverables:

- surface/submerged swimming;
- Argonian breath behaviour;
- stat/spell/equipment modifiers — **as a thin contract with defaults** (the
  equipment/inventory systems and UI arrive with Phase 10b, so Phase 9 defines
  the hook and supplies sane defaults rather than waiting on them);
- climb mode and climb-surface generation;
- small-boat control on the water query, with boarding and docking/mooring;
- swim/climb/boat validation.

### Phase 10b — full portable-sandbox parity in the studio

All remaining intended-portable functionality from the combat sandbox is
available to the user in the world studio: as a user in the studio you can use
everything, and perform every action, that was intended to be portable from the
sandbox. All portable systems available and working as intended.

**Parity is not only a port** (owner, 2026-08-29): the sandbox's combat is
good enough for now but **not yet perfect**, and known imperfections in the
shared internals (`packages/game-core`/`character` — used by sandbox, studio
and the real game) get fixed as part of this phase. The CLAUDE.md
no-casual-retuning rule protects the calibrated feel from *drive-by* changes,
not from deliberate, owner-reviewed improvement here (module 75 §51.1). The
owner enumerates specifics at phase kickoff; items surfacing earlier
accumulate in [polish-backlog.md](P-polish/backlog.md) tagged `10b`.

Deliverables:

- scene-orchestration extraction (§53): actor spawning, environment queries,
  target registration, camera/lock-on services, encounter ownership, hitbox
  registration, AV event routing, reset/teleport, debug controls — sandbox and
  studio compose the same packages through different scene adapters;
- inventory and equipment systems and UI in the studio;
- enemies, targeting and lock-on; the bow;
- **polearm sourcing *and* moveset wiring — moved to the weapons side lane**
  (owner 2026-09-18, decision [0074](../decisions/0074-side-lanes-beside-the-world-build-and-the-weapons-lane.md),
  brief [lanes/weapons-lane.md](lanes/weapons-lane.md); was 0042 §4's 10b
  item): the lane sources and wires every kept chassis class, unarmed, dual
  wield and the Black Marsh weapon skins in the sandbox, with the effects
  slot and the skill inputs 10c feeds. 10b keeps only the *port* of those
  movesets into the studio;
- **the renderer extraction — `packages/world-render`** (owner 2026-09-13,
  decision 0062, moved here from Phase 14 where 0042 §3 had put it): this
  phase already extracts scene orchestration from the same app and the same
  module-level singletons, so both extractions happen in one pass. The
  audit constraints stand: extract sky, water, weather and terrain as
  **one** package first (a five-way import cycle), re-validate anything
  tuned under the studio's paused clock against `GAME_TIME_SCALE = 30`;
  resolve the `__STUDIO_*` debug globals into a dev-only seam (standard 8).
  Phase 14 keeps budgets, the chunk format and the impostor audit;
- **arrows and physical materials** for the bow (moved here from Phase 13:
  they are bow parity, not ecology);
- **the minimal NPC detection service** (ratified 2026-09-13, owner
  question on the NPC system; was the buildout register's "single most
  load-bearing unowned system"): view cones plus seen/unseen as **one
  service** consulted by every NPC (enemies, later sneak, crime and watcher
  quests), formulas from the source-game cross-check §4; enemies in the
  studio use it from this phase;
- **navmesh bake pipeline + `NavService`** (module 72, §114): recast tiled
  bake from kit/terrain collision in the world compiler, two agent classes,
  version pin asserted in CI — enemies in the studio path on baked data;
- combat-space probes (§69) measured against production kits and collision,
  including "enemy navigation access" against the baked navmesh (§115);
- **the freeze-gate opened for use**: those probes run over the 16i and 16j
  places; freezing itself is Phase 15's per-packet act (§86.0).

**Chunking (0062):** a skeleton of chunk briefs is written when 9 closes;
the navmesh chunk is knowable the day 16h lands (kit collision fixed) and
may run first; the "shared-internals fixes" chunk waits for the owner's
kickoff list.

Sequenced here because:

- the orchestration extraction happens **once**, against a character package
  that already carries swimming, climbing and boat modes (Phase 9), instead
  of being merged twice;
- combat spaces are measured against Phase 10's real kits, materials and
  collision rather than placeholder ground;
- Phase 13 (fixed populations, encounter sockets, fixed loot, arrows) is
  impossible without enemies, targeting, bow and inventory.

Standing risk while it waits: the sandbox stays the only place combat runs, so
sandbox and studio can drift. Mitigation is the existing package rule —
new portable behaviour lands in `packages/`, never in `apps/combat-sandbox`
directly, and both apps' gates stay green.

### Phase 10c — stats, progression and character systems (module 76)

Implements the design settled by parallel workstream **S** (module 76 §103):
attributes/skills/derived stats, races, equipment scaling, encumbrance,
progression and the absolute power ladder — in `packages/game-core`, consumed
by both apps.

**Running ahead as a side lane (2026-09-24):** the model, data and balance
harness port into `packages/game-core/src/stats` and the owner's lab app —
[stats-lab lane](lanes/stats-lab-lane.md), [0088](../decisions/0088-the-stats-model-lives-in-game-core-and-reads-injected-data.md).
The rounds table there says what is already delivered.

**What the sandbox's skill sliders already are (combat-sandbox lane, 2026-09-24):**
the "Apply skill curves" box feeds the stats model's own curves
(`stats/modifiers`, at the reference attributes) into combat. Skill 10 is
today's calibrated baseline for nock and draw (×1.0); skill 100 lands a blow at
the weapon's listed damage, the top of its range (×0.99 at the reference
Agility 50, ×1.00 at Agility 100), and the HUD's "range position" is where in the 40–100 % damage range a blow lands
([0031](../decisions/0031-workstream-s-round1-shape.md)/[0035](../decisions/0035-workstream-s-round3-attributes-and-pace.md),
[76 §121.1](../world/76-stats-progression.md)). This phase's port still owes
per-class and per-weapon min/max bands and the real character's attributes in
place of the reference ones.

Deliverables:

- the accepted stat model implemented, with **baseline-equivalence tests**:
  at neutral stats, combat numbers match today's calibrated values;
- **Starting state (2026-09-24, stats-lab lane):** the model, all fifteen
  tables and the balance harness are ported to `packages/game-core/src/stats`
  (data in `data/` and `sim/data/`, the 19 invariants standing tests in
  `npm test`; [0088](../decisions/0088-the-stats-model-lives-in-game-core-and-reads-injected-data.md));
  `tooling/stats-sim` is retired; the two race tables are one record keyed by
  the roster ids ([0089](../decisions/0089-one-race-record-keyed-by-the-roster-with-morrowinds-packages.md));
  the owner's bench is `apps/stats-lab`. What 10c still wires: actors,
  combat and equipment reading the stats API (the combat lane consumes the
  modifiers first), the effect stack, saves, UI. `combat/poise.ts` exists
  (check what it implements before "building" poise); one enemy archetype
  exists in code against the worked set in `stats/sim/data/enemies.json`;
  the preset-loadout picker does not exist;
- **the decided-but-unlisted stats work, ratified here** (2026-09-13; a
  holding position since S round 4): weapon poisons and oils, the
  hand-to-hand fatigue-takedown finisher, the magic `StatEffect.field` enum
  with the cast-interruption-vs-poise rule (13's casters need it), the
  creature statblock class and `Fight/Flee/Alarm` on the actor schema
  (part of the NPC record contract below), plus a `condition` slot on the
  item schema;
- **the semantic-authoring compiler** (0019 fourth amendment, module 76 §128):
  ladder references → fixed numbers, with the ±25 % band clamp and literal
  overrides for uniques — **extended to loot and traps**, which have no
  semantic schema yet (gap found 2026-08-29; actors-only as designed);
- capability profiles (§52) regenerated *from* the stat system, with the
  world's traversal and spawn probes still green;
- enemy archetypes restated on the new scale; character-sheet UI;
- **the NPC record contract, defined once** (owner question 2026-09-13):
  one typed `NpcRecord` schema in `packages/contracts` that every later
  consumer extends rather than re-invents — identity and stable id, race
  and sex (the 20 built bodies and `pipeline/npc_records.py` are the
  generator for named NPCs from Skyrim data), statblock and archetype on
  the D-ladder (module 76 §129, with the Spot-side stats), faction ids,
  hostility and `Fight/Flee/Alarm`, home place and home socket, plus
  empty-but-typed slots for what later phases fill: marks,
  schedules and patrols (13), dialogue topics and services (build-out),
  crime and standing (build-out). Phase 13 populates records; 10b's
  enemies and AI read them; nothing downstream defines a second NPC shape.
  **Named-NPC records:** 346 places carry `notableNpcSlots` against a
  two-entry `npcs.json`; 16g's prior→roster rule (world 92 §84) generates
  the roster records into that registry, this phase gives them statblocks; 13 and 15 populate them;
- the power ladder documented for Phase 13 authors (what D0–D5 means
  numerically), and the birthsign hook left ready (module 55 gives a birth
  date its constellation for free);
- **the combat proving round** — the last thing this phase does, because it
  measures calibrated numbers rather than placeholders (owner, 2026-09-01,
  [0042 §5](../decisions/0042-buildout-steers-and-engineering-standards.md)).
  The machine does the sweep: the harness in `packages/game-core/src/stats/sim` runs **every enemy archetype
  against five preset builds** (heavy brawler, light dodger, archer, caster,
  sneak) and reports the outliers — unhittable enemies, trivial enemies, builds
  that hit a wall. The **owner playtests only the flagged cases**, plus one
  deliberate sample per feel category (fast swarmer, slow heavy, ranged), which
  needs a **preset-loadout picker in the sandbox** — that picker is part of the
  deliverable. Target ~a dozen fights, not hundreds. **Bosses are out of
  scope**: a boss is authored, not tuned; one prototype (Xal-Krona) is built
  and playtested in the build-out and sets the pattern.

Sequenced after 10b and **before Phase 13 and any packet freeze**: content in
all place and interior content is *authored* semantically against the S schema and doesn't wait for
this phase (0034), but the compiled numbers, regenerated profiles and the
balance harness must exist before that content is balance-validated/frozen
and before Phase 13 writes encounters and loot. Fixed danger (0004) is
untouched throughout — the numbers are as fixed as ever, merely *derived*.
Workstream S must conclude before this phase starts.

### Phase 13 — fauna ecology, encounters and fixed loot (exemplar-first)

The *flora* half of ecology (species palettes, densities, regional variation)
ran with Phase 10's vegetation system (0034 split); creature calls/ambience
author later, in 12b, from this phase's data. What remains here is the
**fauna and content half** — habitats, populations, encounters, loot — which
genuinely needs 10b (enemies, nav) and 10c (compiled stats). Same
exemplar-first shape (§85.4): build the habitat/encounter/loot systems, prove
them on the exemplar areas and a contrast set, roll out per region packet in
Phase 15. Authoring is semantic (ladder references, §86.0); mine the shipped
games' data for habitat/encounter patterns where useful (§86.0b).

This phase consumes the place-obligation contract stated under Phase 12:
its manifest answers the `contents`, `hostility`, `rewardProfile`,
`occupants` and `services` obligations of every record.

**Moved out (0062):** the diegetic discovery feed is authored in each
packet's quest-brief pass (quests 90 §65b; Phase 15 step 5) and this phase
only consumes it; arrows and physical materials are 10b's; seasonal foliage
response to `s(t)` is a polish-backlog row (owner 2026-09-16); froxel fog and the calendared
eclipse world states are **cut** (owner 2026-09-13: the shipped mist, haze
and fog are what we want; no eclipse events). What stays here is what needs
species, territories and compiled numbers.

**NPC dependency (owner question 2026-09-13):** encounters need enemies and
AI (10b), numbers (10c) and the NPC record contract (10c), all before this
phase in the queue. This phase adds the *population* layer to that record
(marks, schedules, patrols, territories); it never builds a second NPC
system. Dialogue, the factions runtime and crime are build-out work on the
same record.

**Chunking (0062):** the data-model chunk (habitat, territory, obligation
fields, the 12b-facing schedule fields) is written now; the population,
encounter and loot chunks at 10c close, when the power ladder is numeric.

Deliverables:

- **the contrast set proposed to the owner at phase start** (§85.4: the
  exemplar areas plus two or three contrasting regions and danger bands);
- habitat and territory system (territories/leashes on the baked nav data,
  §113–115);
- fixed creature/faction populations, with the Morrowind-leaning ambient
  minimum: idle/work marks, wander radii, patrol splines, daily mark bands on
  the world clock — all nav-validated (§113);
- the ecology data model carries what 12b's sound tables will need (species,
  territories, schedules);
- disease, toxin and insect systems;
- encounter sockets;
- fixed loot provenance;
- no-level-scaling tests;
- **bioluminescent night ecology** (module 55 tier 3, the part that needs
  species): the deep-marsh night palette driven by this phase's data.

### Phase P — general polish pass (rolling), including Phase 12b — the soundscape

A dedicated catch-all polish phase, run before Phase 14 hardens budgets (items
may be pulled earlier when convenient). Earlier phases close when their systems
are **de-risked and owner-accepted in shape**, not pixel-perfect; anything
cosmetic or non-blocking that survives a phase's closing playtest moves to the
**backlog at [docs/phases/P-polish/backlog.md](P-polish/backlog.md)** instead of
holding the phase open. The owner adds items freely; agents add items whenever
they defer visual/feel work. Each item records where it came from and what
"done" looks like.

#### Phase 12b — the province soundscape (module 57)

The world heard: region/time/weather ambience, water emitters, contact sound.
Music (the score) is explicitly out of world-build scope. **Sound is fully
polish-tier** (0023, hardened by 0034) — it runs here, *after* Phase 13,
because it depends on nearly everything (you can't place frog sounds until
you know where the frogs are) and nothing depends on it. Creature calls and
settlement/ecology ambience are authored **by this phase, from the Phase 13
ecology data** (species, territories, schedules). It needs only Phase 8a's
clock plus that data, may be pulled earlier if convenient, and must land
**before Phase 14 locks performance budgets** (audio memory and voice counts
are part of the budget).

Deliverables:

- extract the Skyrim Sounds BSA into the asset vault and convert the needed
  sets through the pipeline (loop-safe encoding solved once, §107);
- `AudioManager` (buses, unlock, crossfader, one-shot scheduler, ~24-voice
  cap) on three.js `Audio`/`PositionalAudio` with `equalpower` panning;
- region ambience beds + stochastic detail tables for the existing region
  classes, driven by the world clock and climate fields (night-loud tropical
  inversion, §106); sourcing gaps filled per §107 (mod packs with credits,
  Sonniss/CC0);
- creature calls and settlement/ecology ambience authored from the Phase 13
  ecology data;
- hydrology-derived positional emitters (rivers, rapids, shores);
- acoustic-state stack: exterior / under-canopy / interior / underwater
  (bus filters + synthesized reverb impulses);
- footstep/impact wiring through the physical-material system (§54) — the
  compiler bakes explicit surface materials; the no-op `combatAudio` stub is
  replaced;
- the 8c weather states gain their audio layer (rain beds, thunder, gusts);
- studio tooling: audio layer in the reproducible URL, hot-reloadable sound
  tables, voice-count/audio-memory probe;
- **owner gate**: walk a dawn→night route, ears on — region identity,
  day/night chorus flip, underwater transformation, soundscape density (a
  taste call: Morrowind-sparse vs jungle wall-of-sound).

### Phase 14 — streaming and deployment

**Phase 14 locks budgets and hardens streaming; it does not introduce them**
(0034). The province already streams (chunked terrain + LODs since Phase 6),
and every placement phase ships its content *through* the tiered
streaming/LOD architecture as it lands — vegetation via module 65's tiers and
budget probes, kits/interiors via the bundle contract (module 80 §63) — so
nothing ever renders "everything at once". **Standing rule: the province must
stay loadable and playable in the owner's browser at every phase gate.** If
rollout scale (Phase 15) starts to strain that, pull Phase 14 items forward
into the packets (draw-distance rings, impostor distances, instance caps,
texture compression) rather than waiting for this phase.

Deliverables:

- (the renderer extraction moved to Phase 10b, decision 0062; the shell
  app, menus and deploy slice stay in the build-out);
- production chunk format;
- dependency-aware streaming (nav tiles stream with chunks, §114);
- **main-thread work moved to workers** — terrain grid geometry, flora
  collider bodies (trimesh BVH), settlement far-merges and vegetation cell
  builds are built in web workers and handed over as transferables; the
  `FrameWorkQueue` (`packages/game-core/src/scheduling/`, 16g follow-up
  2026-09-20) stays as the main-thread hand-over budget. Queued 2026-09-20
  from the walking-stutter root cause: every crossing into new ground ran
  those builds synchronously in one frame;
- LOD and instance batching; vegetation quality tiers locked as one
  declarative table (T3 ring, T2 caps, impostor distances — §112);
- **billboard/impostor audit for the flora kit** — DONE in 16f round 2 (2026-09-18, decision 0071): the audit found no card mapped by a wrong filename (11 explicit borrows only) but 115 of 159 flora species, all 61 ground-cover species and all underwater species had NO card; the kit builder now bakes a card per asset from its own mesh (`bakeCards`), rocks ship one mesh level; the runtime crossfades every level by dither. What stays here for Phase 14: locking the distances as one declarative table and the per-device budgets. Original observation kept for the record (owner,
  2026-09-01 — a performance item, so it lands here rather than in Phase 10's
  look-pass): ① several tree types show the **wrong silhouette** at distance
  (palms resolving to a conifer/pine card — a card↔species mapping fault in
  the kit builder's `_lod_flat` selection, same failure family as the
  round-4 "wrong game's atlas" bug, so check per-species provenance not just
  presence); ② **some trees appear never to drop to a card at all**, staying
  at full mesh at any distance — verify per species that a billboard level
  exists, is eligible, and is actually selected at range (instrument counts
  per species/level, don't eyeball), because a species silently held at full
  mesh is a straight draw-call and triangle cost across the whole province.
  Fix in the kit builder + LOD selection, then re-measure the province
  budget;
- **compressed textures and geometry — DONE, pulled forward by the owner on
  2026-09-18 (decision 0073)**: the composed Pages site had reached 1,041 MB
  against the 1 GB limit, so every kit now ships KTX2/UASTC textures and
  meshopt geometry through `pipeline/kit_compress.py` (556 → 222 MB; the
  site with every kit in 999 → 561 MB), the runtime decodes via
  `game-core/assets/kitLoader.ts`; the duplicated character assets ship
  once. Numbers and the per-role choice:
  [research/rendering/gpu-texture-and-mesh-compression.md](../research/rendering/gpu-texture-and-mesh-compression.md).
  What stays here: per-device texture budgets and any ETC1S trade the owner
  chooses for opaque architecture (measured 4/5, ~30 % smaller);
- performance budgets by device class;
- GitHub Pages build containing approved runtime content only;
- **sparse local state variants, consumed and budgeted** (the overlay
  mechanism in the bundle format is 16i's, per the buildout register and
  0062; this phase budgets it) — 2–3 authored variants per
  quest location: occupants, barricades, banners, clutter, ambience — the
  quest consequence budget, quests 20 §14; never terrain/hydrology).

### Phase 15 — rollout by region packet

The province-wide fields (terrain, hydrology, light, water, weather) exist
and are **frozen** (Phase 16); what expands region-by-region is **content**,
as data. This phase runs **once per packet, after every world-build system it rolls
out exists** (the 16j skill, 12 interiors, 13 ecology, 10b nav and probes,
10c numbers, 14 budgets; build-out systems such as dialogue, crime and the
factions runtime are hooks and data only) (owner 2026-09-13, decision 0062, collapsing the 0061 two-pass
split): the settlement rollout skill proved in 16j, the interiors skill
proved in Phase 12, the fauna/encounter/loot systems of 13, the navmesh
and probes of 10b, the compiled numbers of 10c, the budgets of 14. The
16j trial packet is packet one and is completed here.

**The packet roadmap** (ordered packets, rough scope, the place types each
needs, cities and opening-scene places flagged owner-guided) is drafted by
16j for owner sign-off and kept in `docs/phases/15-rollout/roadmap.md`;
each packet is a chunk brief from the template 16j ships. **Every packet
runs in two parts with an owner check-in after each** (decision 0081: the
plans and door tables on paper before any ground or vegetation is
touched, then the walk); the rhythm is sketched in
[15-rollout/README.md](15-rollout/README.md) and the steps below are
distributed across those two parts by the template.

**The owner is hands-on for every major city and for the opening-scene
places.** No skill runs unattended on them; the packet brief names them
and the owner's rounds are planned, not discovered.

Each packet:

1. **typed local patches only** where a pad, a way or an interior footprint
   needs one (16b's invariants: a patch that would move a water level, a
   body extent or a channel fails; nothing re-carves; hydrology is never
   "refined" per packet);
2. regional identity as data (region grammar §16 config, species palettes on
   the 16f scatter);
3. minor routes, ways and the travel-service graph densified through the
   minor-route and service stages (16e's code, on 16g's ladder row; never a
   fresh major-route solve; minor routes are never graded);
4. the causal location network for the packet from the 16g plot: settlements
   and POIs through the settlement skill, every dungeon-kind record's
   promises checked against a realisation recipe that exists, tier A
   interiors verbatim, the rest through the interiors skill;
5. **quest-brief co-design pass** (quests 90 §65b, a completion gate, 0027):
   briefs drafted against the draft network, placements reconciled, every
   unmarked place given its in-world pointer, the density budget declared;
6. fauna, populations, encounters and fixed loot per the Phase 13 systems;
   the sparse local-state variants (14);
7. compile, export, browser probe, orphan validator, the automation-readiness
   checklist per type (96 §3), combat-space probes on the baked navmesh,
   balance against compiled numbers, delivery manifests against every
   obligation, **streaming/performance budgets** (the packet must stream
   within budget on the owner's browser);
8. owner walk at packet level, not per instance (§85.4), plus the planned
   rounds for any city or opening-scene place in the packet;
9. **freeze**; approve world bundles.

The province preview remains available throughout rollout.

### Phase-ID history

IDs are stable and never renumbered; only the *order* and occasionally a
phase's *name* change. The moves so far: **7b → 10b** (0017); **8d → 12b**
(0023), then 12b into the P window (0034); **15** renamed from "expansion by
watershed" to "rollout by region packet" (0034); the risk-first re-ordering,
the flora/fauna ecology split and the Phase 9 scope trim are 0034. **11
absorbed into 16** (0057); **12 narrowed to dungeons** and **15 split into
15A/15B** (0061, 2026-09-12), then **12 recast as the interiors phase and
15 collapsed back to one pass after 14** (0062, 2026-09-13). The pre-0034 layout of
this file is in git history.

## 87. Why this sequence controls risk

- **dealbreakers surface first**: if dense vegetation can't perform in the
  browser, or the settlement/dungeon systems can't produce good places, the
  project needs to know before investing in the well-understood work
  (traversal, parity, streaming) — hence assets/vegetation and the placement
  exemplars ahead of Phase 9/10b (owner, 0034);
- **exemplar-first placement** (§85.4) means systems are proven cheap and
  small before the province pays for them, and every exemplar ships;
- province hydrology cannot drift between independently built local areas;
- the physical character enters before settlement and dungeon compilers harden;
- semantic authoring (0019) decouples content from stat retunes, so authoring
  can precede the stats implementation without a re-authoring debt;
- asset gaps become visible within retained production content;
- source and credits metadata exist before large-scale ingestion;
- agentic placement operates on stable semantic layers;
- the integrated game remains runnable throughout development;
- detailed work always contributes to the final world.

---
