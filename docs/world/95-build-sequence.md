# Part XIII — Build sequence: the phase plan (§85–87)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
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

### 85.2 Retained reference watershed

One watershed or connected corridor receives full detail. It remains part of the shipped world. Selection criteria:

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
4. roll out as data, region packet by region packet (Phase 15), with owner
   gates at the exemplar and the contrast set, not per instance.

Whole-province-at-once remains right for global fields and systems (terrain,
hydrology, light, water, weather, streaming) — exactly as Phases 2–8 were
run. Exemplars live in retained content (the Blackrose reference watershed
where possible, 0008). Wherever the shipped games' data can teach the rules,
mine it first (§86.0b).

## 86. Phase plan

Progress through these phases is tracked in [docs/PROGRESS.md](../PROGRESS.md), never
in this document. Phases are milestones, not straitjackets: a phase may be split
into sub-milestones in PROGRESS.md when that gives the user earlier playtest
gates, and parts of a phase may be re-slotted into another when risk ordering
favours it (owner permission, 0034 — e.g. the flora half of ecology runs with
Phase 10's vegetation work; a thin swim slice may run any time). The §86.0
constraints are what must hold; the phase boundaries are packaging.

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
| 10b parity | 11/12 **packet freeze** | a region packet freezes only after combat-space and critical-animation probes pass on its geometry (00-core acceptance). Exemplar *authoring* may start before 10b — a **freeze-gate, not a start-gate** (0034) |
| **S** stats design | 10c, and 11/12 *authoring* | 10c implements what S decides; content is authored **semantically** against the S schema — ladder references ("strong D3, diseased") compiled to absolutes (0019 fourth amendment, module 76 §128) — so authoring needs the accepted schema, not the implemented system |
| 10c stats | 11/12 **packet freeze**, **13** | compiled numbers, regenerated capability profiles and the balance harness must exist before authored content is balance-validated/frozen, and before Phase 13 authors encounters and loot |
| 3/4 climate fields | 8a haze, 8c weather, 13 ecology | one source of climate truth, many consumers (§33.1) |
| 8a world clock | 12b soundscape | ambience beds crossfade on `dayPhase()` and season (§106) |
| 13 ecology | 12b soundscape | creature calls and settlement/ecology ambience are authored **from** the ecology data *by the sound phase* — you can't place frog sounds until you know where the frogs are (0034). 12b sits in the Phase P polish tier and must land before Phase 14 locks performance budgets |
| 10 vegetation renderer + scatter compiler (§109–112) | 11, 13 | places are dressed and judged at real vegetation density; Phase 13 authors against measured budgets |
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
[shipped-world-placement-rules.md](../research/shipped-world-placement-rules.md)
— 14 rules from 186k placed references across BM&V's Black Marsh and
Valenwood plus Bethesda's grass schema. The readers are
`worldgen/esp_index.py` (base objects, worldspace cells, references, LAND
painting, REGN object tables, GRAS), driven by `worldgen/mine_placement.py`
and `worldgen/mine_groundcover.py`. **Still to mine, with the same readers:**
settlement composition (Phase 11 — BM&V's Lilmoth-area cells) and interior /
dungeon assembly (Phase 12 — `Plugin.interior_cells`).

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
  `landcover.py`, see docs/research/black-marsh-ground-texture-sources.md);
- LOD and collision generation;
- source/credits reference check in CI.

### Phase 11 — the settlement and location system (exemplar-first)

**This phase builds the reusable settlement/POI system, not the province's
settlements** (§85.4). Content is authored *semantically* against the
accepted workstream-S schema; packets freeze only later, when the 10b
combat-space probes and 10c compiled numbers validate them (freeze-gates,
§86.0). Mass production of the remaining regions is Phase 15. Mine BM&V's
Lilmoth-area composition and vanilla settlement data for composition rules
before inventing them (§86.0b).

Deliverables:

- causal-model schema;
- agent blueprint workflow;
- district/route/parcel compiler;
- Hist-centred settlement grammar;
- Imperial-fringe settlement grammar;
- location-orphan validator;
- **one retained exemplar settlement authored *through* the blueprint→compiler
  path** (never hand placement — it becomes the compiler's first regression
  fixture), then **2–3 contrasting instances** (different region class,
  culture, danger band; the contrast set proposed to the owner at phase
  start) proving the system doesn't over-fit;
- **Morrowind-style travel services** (0034): ferrymen/boat owners/rootworm
  Waykeepers as talk-pay-arrive instant travel over a defined, geographically
  sensible service graph (Phase 4 lanes + this phase's docks; quests 20 FAST
  nodes). NPC passengers are set dressing; no vessel simulation — this is
  world content, not Phase 9 machinery;
- **quest location roster**: the per-quest World-generation provisions in
  docs/quests/ are the demand schedule — stable semantic IDs, approach
  alternatives, scene/NPC/evidence/container sockets, and the
  `QuestWorldProvision` packet per substantial location (quests 20 §13);
- **quest–world co-design loop per region packet — a completion gate, not a
  suggestion** (process: quests 90 §65b): after the settlement/POI draft, the
  region's local-quest *briefs* are drafted and their requested placements
  reconciled (a camp overlooking the route, a toll at the crossing, a flooded
  cellar) before the packet freezes. **A region packet without its
  quest-brief set and density budget is not done and must not be marked done
  in PROGRESS.** A single phase agent may wear both hats (world-drafting then
  brief-drafting, in that order) or spawn a subagent — what is mandatory is
  the artifacts and the gate, not the org chart. The published
  main-quest/faction provisions are confirmed in the same pass. **The
  exemplar and contrast-set packets run the full loop too** — they are the
  first live test of §65b (does brief-driven placement work?), not just of
  the compilers;
- **content-density budget** (numbers + evidence in
  [../research/morrowind-content-density.md](../research/morrowind-content-density.md)):
  match Morrowind — **18–22 named POIs per km²** of authored land in D0–D3
  regions (8–12 in D4–D5, landmark-heavy and quest-light), **something named
  within ≤300 m of travel along every road and boat lane**, quests per
  settlement by magnitude class (M5 ≈ 35–60, M4 10–20, M3 3–8, M2 1–3), **all
  settlement structures enterable and all settlement NPCs named**. Each region
  packet declares its counts against this budget at review — **including its
  reward coverage under module 20 §12.3b** (every notable hard-to-reach
  landform in the packet carries a reward; owner directive 2026-09-01);
- **D0 safe interiors** authored per settlement (quests 20 §12 mapping);
  Helstrom interior D0 with gates against the band-5 basin;
- **player-stronghold site reservation** — one reoccupied xanmeer or abandoned
  river station, reserved in this phase (quests 30 §24b.5; decision 0028);
  interiors are Phase 12 work;
- **root-transit network re-authoring**: the compiled four-station rootworm
  network is a Pass-1 placeholder — re-author it here with Hist-node placement;
  root-transit quests and rewards are finalized in the same packet's co-design
  loop.

### Phase 12 — the dungeon and interior system (exemplar-first)

**Same shape as Phase 11 and may interleave with it** (§85.4): build the
grammars and compilers, prove them on one retained exemplar per family
started, validate on contrasting instances, and leave mass production to
Phase 15. Authoring is semantic against the S schema; packets freeze after
10b/10c validation (§86.0); the quest–world co-design loop (quests 90 §65b)
applies to this phase's packets exactly as to Phase 11's. Interior navmesh
bakes land with 10b's pipeline — author the geometry now, bake when the
pipeline exists.

Deliverables:

- exterior portal and foundation data;
- Xanmeer graph grammar;
- cave/root/smuggler grammar;
- underwater entrances;
- interior navmesh bakes + per-cell acoustic/lighting profiles (§114, §106,
  55 §96);
- interior streaming contract;
- **one full retained exemplar production dungeon authored through the
  grammar→compiler path**, plus contrasting instances per §85.4 before the
  family is declared rollout-ready;
- **quest dungeon reservations** (sites + causal records now, geometry per
  regional packet): the submerged Eye observatory, Blackrose prison
  archive/tunnels, Lilmoth Tidal Palace heist complex, the two optional
  Eye-route chains, and the **Lost City reserved in the deep basin beyond
  Helstrom** (near-final D5 complex; quests 30).

### Phase 9 — swimming, climbing and boats

**This phase extends the existing character stack; it does not build a parallel
one.** New movement modes go behind `PlayerMovementController` (§51), new clips
into the same animation manifest with the same integrity gates, new physics
through Rapier. The sandbox's systems are **not frozen** — refactor and extend
them where the game needs it (§51.1); what's protected is the calibrated
*feel*, not the code.

**Animation sourcing comes first, and it is sourcing — we never author
animation** (CLAUDE.md; module 90 §71). The rig currently carries 51 clips
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

Phase 9 may split into sub-milestones (suggested order: swim → boats → climb,
easiest-sourced first) per the PROGRESS protocol, and a thin swim slice may be
pulled earlier whenever convenient. Climbing carries the animation-sourcing
risk — no ready-made wall-climb loops exist, but two sourceable pools do
(EVGAT's ladder-climb loops as the primary retarget candidate, and the
SkyParkour mod-authored clip set — module 90 §74.3); Phase 10b needs the
movement-mode *contracts* in place, not final climb polish, so a hard climb
problem must not block the chain. Boats may slip past 10b, and are droppable
at worst (owner tolerance, 0034).

**Scope rule (0034): Phase 9 covers the player's own craft only.** Ferry
services and boat fast travel are **Morrowind-style** — speak to the
ferryman, pay, arrive: instant travel over a defined, geographically sensible
service graph, with NPC passengers as set dressing. No vessel simulation, no
ride-along. Those services are *world content*, delivered with settlements
(Phase 11 deliverable). Player-boat cargo storage, passenger carrying,
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
accumulate in [polish-backlog.md](../polish-backlog.md) tagged `10b`.

Deliverables:

- scene-orchestration extraction (§53): actor spawning, environment queries,
  target registration, camera/lock-on services, encounter ownership, hitbox
  registration, AV event routing, reset/teleport, debug controls — sandbox and
  studio compose the same packages through different scene adapters;
- inventory and equipment systems and UI in the studio;
- enemies, targeting and lock-on; the bow;
- **navmesh bake pipeline + `NavService`** (module 72, §114): recast tiled
  bake from kit/terrain collision in the world compiler, two agent classes,
  version pin asserted in CI — enemies in the studio path on baked data;
- combat-space probes (§69) measured against production kits and collision,
  including "enemy navigation access" against the baked navmesh (§115);
- **the freeze-gate closed**: those probes run over the Phase 11/12 exemplar
  packets, which get frozen or fixed (§86.0).

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

Deliverables:

- the accepted stat model implemented, with **baseline-equivalence tests**:
  at neutral stats, combat numbers match today's calibrated values;
- **the semantic-authoring compiler** (0019 fourth amendment, module 76 §128):
  ladder references → fixed numbers, with the ±25 % band clamp and literal
  overrides for uniques — **extended to loot and traps**, which have no
  semantic schema yet (gap found 2026-08-29; actors-only as designed);
- capability profiles (§52) regenerated *from* the stat system, with the
  world's traversal and spawn probes still green;
- enemy archetypes restated on the new scale; character-sheet UI;
- the power ladder documented for Phase 13 authors (what D0–D5 means
  numerically), and the birthsign hook left ready (module 55 gives a birth
  date its constellation for free).

Sequenced after 10b and **before Phase 13 and any packet freeze**: content in
11/12 is *authored* semantically against the S schema and doesn't wait for
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

Deliverables:

- **diegetic discovery feed** (density research §5): every unmarked POI in the
  packet gets at least one in-world pointer — a rumour, a document, a body, a
  grave-stake, a sightline — so Morrowind-density content is findable without
  quest markers;
- habitat and territory system (territories/leashes on the baked nav data,
  §113–115);
- fixed creature/faction populations, with the Morrowind-leaning ambient
  minimum: idle/work marks, wander radii, patrol splines, daily mark bands on
  the world clock — all nav-validated (§113);
- seasonal vegetation response to `s(t)` wired through the ecology data
  (§112) — palette/density authoring itself lives with Phase 10/15;
- the ecology data model carries what 12b's sound tables will need (species,
  territories, schedules);
- disease, toxin and insect systems;
- encounter sockets;
- fixed loot provenance;
- no-level-scaling tests;
- arrows and physical materials;
- **light/atmosphere tier 3** (module 55): bioluminescent night ecology as the
  deep-marsh night palette, seasonal foliage response to `s(t)`, calendared
  Vampire-Day (eclipse) world states, volumetric (froxel) fog on the high
  quality tier.

### Phase P — general polish pass (rolling), including Phase 12b — the soundscape

A dedicated catch-all polish phase, run before Phase 14 hardens budgets (items
may be pulled earlier when convenient). Earlier phases close when their systems
are **de-risked and owner-accepted in shape**, not pixel-perfect; anything
cosmetic or non-blocking that survives a phase's closing playtest moves to the
**backlog at [docs/polish-backlog.md](../polish-backlog.md)** instead of
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

- production chunk format;
- dependency-aware streaming (nav tiles stream with chunks, §114);
- LOD and instance batching; vegetation quality tiers locked as one
  declarative table (T3 ring, T2 caps, impostor distances — §112);
- compressed textures and geometry;
- performance budgets by device class;
- GitHub Pages build containing approved runtime content only;
- **sparse local state variant support** in bundles (2–3 authored variants per
  quest location: occupants, barricades, banners, clutter, ambience — the
  quest consequence budget, quests 20 §14; never terrain/hydrology).

### Phase 15 — rollout by region packet

The province-wide fields (terrain, hydrology, light, water, weather) already
exist; what expands region-by-region is **content**. This phase is step 4 of
§85.4 — the proven placement systems (11 settlements/POIs, 12
dungeons/interiors, 13 fauna/encounters/loot, plus flora fill from 10's
palettes) are rolled out across the province as data, packet by packet.

**The phase opens by drafting the packet roadmap** (the ordered list of
region packets with rough scope — none exists yet) for owner sign-off.

Each region packet:

1. local hydrology/terrain refinement where the packet needs it;
2. author regional identity (region grammar §16 config, species palettes);
3. compile routes and densify the transport network (module 60 §45), including
   the Morrowind-style travel-service graph;
4. establish the causal location network (settlement/POI system, per-packet
   config);
5. **quest-brief co-design pass** (quests 90 §65b — a completion gate, 0027:
   briefs drafted against the draft network, placements reconciled, density
   budget declared before freeze);
6. agent-author hero locations and dungeons through the compilers;
7. compile assets; fauna/encounters/loot per the Phase 13 systems;
8. integrate gameplay;
9. validate (probes, combat-space, density budget, orphan validator,
   **streaming/performance budgets** — the packet must stream within budget
   on the owner's browser, not just render in isolation);
10. owner review — gates at packet level, not per instance (§85.4);
11. approve world bundles.

The province preview remains available throughout rollout.

### Phase-ID history

IDs are stable and never renumbered; only the *order* and occasionally a
phase's *name* change. The moves so far: **7b → 10b** (0017); **8d → 12b**
(0023), then 12b into the P window (0034); **15** renamed from "expansion by
watershed" to "rollout by region packet" (0034); the risk-first re-ordering,
the flora/fauna ecology split and the Phase 9 scope trim are 0034. The
pre-0034 layout of this file is in git history.

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
