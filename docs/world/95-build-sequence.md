# Part XIII — Revised build sequence: the phase plan (§85–87)

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

## 86. Phase plan

Progress through these phases is tracked in [docs/PROGRESS.md](../PROGRESS.md), never
in this document. Phases are milestones, not straitjackets: a phase may be split
into sub-milestones in PROGRESS.md when that gives the user earlier playtest gates.

### 86.0 What actually depends on what

The ordering below is not arbitrary and it is not a queue. These are the real
constraints — anything not listed here is sequenced for risk or convenience and
can be re-ordered by the owner.

| This… | must come before… | because |
|---|---|---|
| 8a light/sky | 8b water | water shading consumes sun, sky, IBL and exposure; moon phase drives tides |
| 8a light/sky | 10 kits, 11 settlements, 12 dungeons | nothing visual is approved under placeholder light (0016) |
| 8a world clock | 8c weather, 13 ecology, 11+ quests | the season scalar `s(t)`, schedules and calendared events all read one clock |
| 9 swim/climb/boats | 10b parity | the §53 orchestration extraction should merge once, against a character package that already has every movement mode |
| 10 kits | 10b parity | combat-space probes measure against production geometry |
| 10b parity | 11, 12 | settlement/dungeon authoring is gated on combat-space and critical-animation clearance (00-core acceptance) |
| **S** stats design | 10c | 10c implements what S decides |
| 10c stats | 11, 12, **13** | fixed danger (0004) means populations, encounters and loot are authored as absolute numbers against a scale that must already exist |
| 3/4 climate fields | 8a haze, 8c weather, 13 ecology | one source of climate truth, many consumers (§33.1) |
| 8a world clock | 12b soundscape | ambience beds crossfade on `dayPhase()` and season (§106) |
| 12b soundscape | 13 ecology | creature calls and settlement/ecology ambience author into the sound tables (§108); the *only* hard consumer — sound is polish-tier (owner, 0023) |
| 10 vegetation renderer + scatter compiler (§109–112) | 11, 13 | places are dressed and judged at real vegetation density; Phase 13 authors densities against measured budgets |
| 10 kit collision | 10b nav bake (§114) | navmesh is generated from kit collision geometry; 10b's combat-space probes measure "enemy navigation access" on the baked data |

The rows are hard constraints **except the two feeding 10b**, which are
sequencing *preferences* (merge the §53 extraction once; measure combat spaces
against real kits) and may bend if a phase stalls. **8c, 9 and 10 are mutually
independent** — they can run in parallel or in any order relative to each
other. **12b (soundscape) floats freely**: it needs only 8a and must land
before 13; its default slot is late because sound is polish-tier next to the
riskier unknowns (owner, 0023). Workstream S runs alongside everything.

Deliberately **not** dependencies: the world build does not need the stats
system (capability profiles are the contract — module 75 §52), and it does not
need full sandbox parity (Phase 7a's movement plus the environment query is
enough).

Parallel workstreams run alongside the phase queue and block only what the
table says: **L** (lore extrapolation, module 45 — closed), **N** (quest-plan
review, decision 0018 — closed), **S** (stats design, module 76 §103.1 — open,
runnable now).

### Phase 0 — source, era and credits foundation

Deliverables:

- confirm `jtattersall09403/elder-souls-argonia` as the canonical repository and record the VM workspace layout;
- inspect the actual sibling combat-sandbox and asset-pipeline checkouts, including remotes, branches, HEADs, dirty state and local-only commits, before importing anything;
- inventory of the existing local `elder-scrolls-asset-pipeline` repository, local source archives and generated outputs;
- plan for history-preserving import of pipeline code into `tooling/asset-pipeline`;
- external local-asset-vault convention and `ELDER_SOULS_ASSET_ROOT` contract;
- chosen or parameterised era policy;
- source-confidence schema;
- lore source registry;
- explicit source links for the All Tamriel Heightmap, the 30.9 MB Argonia Tamriel Worldspaces file and the supplied community settlement map;
- lightweight asset/source credits list;
- coordinate and scale decision;
- fixed-difficulty rule documented as an architectural constraint.

### Phase 1 — canonical monorepo, sandbox and asset-pipeline migration

Migration source rule: migrate each sibling from its **local checkout's most
advanced verified state**, not from an assumed remote branch. (At Phase 0
discovery the combat sandbox stood on `enemy-health-bars`, 15 commits ahead of
`origin/main` with a clean tree, and the local-only asset-pipeline repo stood on
`races-and-inventory`, 5 commits ahead of its `main`.)

**Milestone 1a — imports, workspaces, CI and a deployed playable sandbox
(user playtest gate):**

- perform the migration **inside the cloned `elder-souls-dev/elder-souls-argonia` repository**;
- history-preserving import of the combat sandbox into `apps/combat-sandbox`, running with its tests, typecheck, build and visual tooling intact;
- history-preserving import of the current asset-pipeline code, tests, recipes and docs into `tooling/asset-pipeline`;
- npm-workspaces monorepo root with routine gates (`npm test`, `npm run typecheck`) runnable from the root;
- local asset vault kept outside Git and verified through the pipeline path contract (`ELDER_SOULS_ASSET_ROOT`);
- clean-clone/CI test proving no build or runtime import depends on sibling-repository paths;
- GitHub Actions building and deploying the sandbox to GitHub Pages from this repository;
- expand the canonical README to describe the project as a standalone total-conversion-style Skyrim fan project/mod implemented with the Three.js browser runtime.

**Milestone 1b — package boundaries:**

- `packages/` structure and package boundary rules from Section 59–60;
- extracted contracts (grown deliberately: a contract lands when a second
  consumer exists, not speculatively);
- integrated empty `apps/game`;
- world studio shell.

Extraction of the sandbox's inventory/items/combat internals into packages is
deliberately **deferred to Phase 7**, when the world first consumes them —
extracting before a second consumer exists would be refactoring against an
unknown target. The semantic asset registry belongs to Phase 10.

### Phase 2 — province source ingest

The project owner has a Nexus Mods **premium** account with an API key stored in
an environment variable on the VM. Premium accounts may generate download links
through the Nexus API (`api.nexusmods.com`, `apikey` header), so agents can fetch
the heightmap files directly into the local asset vault; record file hashes in
the source registry. If the key isn't visible in the agent shell, ask the owner
for the variable name — never echo its value.

Deliverables:

- import and coordinate transform for the [All Tamriel Heightmap](https://www.nexusmods.com/skyrimspecialedition/mods/573) and/or the dedicated 30.9 MB [Argonia Tamriel Worldspaces file](https://www.nexusmods.com/skyrimspecialedition/mods/118678?tab=files);
- coastline and sea level;
- official/game-derived map overlays;
- supplied [community Inkarnate map](https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Fa-map-of-black-marsh-i-made-in-inkarnate-i-find-the-v0-7jo2gib84ox71.jpg%3Fauto%3Dwebp%26s%3D89a43ee168eaae73e9a350667e1fe2a46f273749) as a secondary settlement-size/location and suggested-road prior only;
- fixed settlement anchors and tolerance polygons;
- source/confidence visualisation;
- low-resolution terrain preview.

### Phase 3 — province hydrology and region graph

Deliverables:

- basins, flow, river hierarchy and wetlands;
- tidal and salinity zones;
- flood frequency;
- soil stability and wetness;
- watershed boundaries;
- ecological region classes;
- hydrology validation report.

### Phase 4 — fixed danger, cultures and transport at province scale

Deliverables:

- regional danger profiles;
- tribe/culture territories and uncertainty;
- demographic-prior framework;
- foot/road/boat/root transit macro graph;
- major settlement functional roles;
- deep-marsh access progression model.

### Phase 5 — World Studio inspection foundation

Deliverables:

- full map with layers;
- click-to-spawn;
- fly/orbit modes;
- reproducible URLs;
- chunk and source overlays;
- initial JSON/HTML probe framework.

### Phase 6 — retained reference watershed terrain

Deliverables:

- high-resolution terrain and channels;
- flood states;
- local biome fields;
- collision and LOD;
- province-to-local deterministic refinement.

### Phase 6b — province rescale, mountain relief and character-scale naturalness (decision 0015; runs after Phase 7a)

Reopens province terrain to apply decision 0015 (×1 horizontal, ×1 vertical,
drama in the data). **All feel judgements and gates happen on foot in
"Walk the province" (Phase 7a's character mode); the flyover is secondary.**
Orogeny uplift stays inside the mountain masks + blend margin. The
naturalness pass (below) touches the whole province but is amplitude-bounded
and feature-protected — the owner-approved marsh *character* is not
renegotiated, verified by region/flood/soil fraction stats and the
channel-preservation probe, not by eye.

**6b.1 — rescale (×1/×1):**

- flip the horizontal-scale constants (`RAW_M`-style, in
  `tooling/world-generation/worldgen/`) to ×1; studio exaggeration default and
  canonical geometry scale to ×1; ground resolution returns to 1.83 m/sample;
- re-tune classifier thresholds implicitly tuned at ×3 (wetland slope < 0.03,
  rocky-soil slope > 0.08, distance-to-sea bands, route slope costs, mist)
  so region character is preserved — validated by comparing region/soil/flood
  fraction stats before/after, not by eye;
- recompile the full chain (condition → hydrology → regions → society →
  refine_province → compile_chunks → export_web_chunks) and re-run the
  capability-spawn pytest against ×1 geometry;
- sweep docs/tooling for stale ×3/×5/"22 km" references;
- **owner walk gate**: relief and scale feel on foot at ×1/×1.

**6b.2 — orogeny (mountain drama in the height data):**

- research first, recorded in docs/research/: (a) geology — tropical
  swamp-adjacent high relief analogues (Kinabalu/Borneo, New Guinea ranges,
  tepuis, karst towers for sheer faces); (b) technique — heightmap uplift
  masks + ridge-aligned synthesis + fluvial (stream-power) erosion, the
  proven pipeline for carving dendritic valleys/gorges with plausible
  drainage by construction;
- uplift masks over the existing border-mountain belts only, preserving the
  source prior's ridge topology; summit target set at the gate (0015: proper
  tall-mountain feel; drama primarily from local relief contrast — deep
  valleys, ravines, cliff bands — not summit altitude alone);
- erosion carving; structural benching for near-vertical cliff bands
  separated by walkable ledges (heightfields carry ~85° faces at 1.83
  m/sample; true overhangs come later from placed rock assets, §9);
- hydrology re-solves on the new terrain so mountain streams feed the
  existing lowland rivers and valley floors read as river valleys;
- carved road passes as max-grade corridors (Gideon's western pass is
  anchor-bound); **standing probes**, run on every recompile: all eight
  cities road-connected; per-peak reachability (walkable/climbable path to
  an agreed fraction of its height); bench-area count per mountain block
  (candidate POI shelves); lowland uplift-mask containment diff;
- **character-scale naturalness pass (owner requirement 2026-08-24),
  province-wide, in the same base-terrain stage:**
  - *intelligent de-terracing*: the source LAND heights are quantised, which
    reads as artificial steps on foot at ×1/×1 — remove with edge-preserving,
    region- and slope-aware smoothing (strong in marsh/floodplain and rolling
    lowland, weak-to-none in mountains, benches and authored features), so
    deliberate shelving and sharp gradient changes survive where they are
    geologically right and vanish where they are artefacts;
  - *local micro-undulation*: real ground is rarely flat for long — add
    region-weighted undulation (rolling countryside gets gentle 20–80 m
    swells; marsh stays near-flat with subtle hummock relief; mountains get
    crag/talus texture from the erosion pass instead), extending the existing
    per-region detail-noise amplitudes;
  - *feature protection is by construction and by probe*: the pass runs on
    the base terrain BEFORE hydrology re-solves and BEFORE refine carves
    channels/the authored Blackrose lake/feeders/portage and canoe channels —
    so authored and simulated water features are carved after it and cannot
    be erased; a channel-preservation probe additionally asserts carved depth
    along every solved river course, canoe channel and portage, and a
    course-stability check compares the re-solved river network against the
    approved waterways;
- **owner walk gate(s)** in the ranges and the lowlands.

**6b.3 — mountain materials and rendering:**

- audit the 32-material ground library (0011) for the new relief: cliff-face
  strata, scree/talus, exposed crag, montane/cloud-forest floor (climate
  exception in §33.1 — montane cooling allowed, never frost); source
  additions per Module 90; extend the altitude belts in `landcover.py`
  (currently 18/45/70 m) to the new height range;
- fix steep-slope texel stretching: near-vertical faces need triplanar (or
  slope-aware) projection in the studio splat shader — standard heightmap
  practice; research/implement with the land-cover slope bands;
- ground-material sets stay versioned (A/B selector) for the gate.

Deferred from 6b (pick up with the ranges' asset pass, Phase 10+): a
dedicated scree/gravel ground material (Module 90 sourcing — v1 reuses
mountain_rock/bc_rock under triplanar); owner re-reviews overall terrain
feel after the water phases (8b) land.

### Phase 7a — physical character integration

Deliverables:

- portable core from the combat sandbox extracted into shared
  packages (deferred here from Milestone 1b) and consumed by both sandbox and
  world studio. *As shipped (decision 0013): the portable **core** —
  `game-core` / `character` / `character-assets`. Scene orchestration (§53),
  inventory/equipment UI, enemies/targeting and the bow stayed in the sandbox
  and move with Phase 10b;*
- sandbox character and camera in world studio;
- current ecctrl/Rapier grounded movement;
- environment query contract;
- combat actor and target registration;
- input parity across desktop, touch and controller;
- capability-profile validation.
- User able to walk, run, sprint, jump a physical character around the map

### Phase 7b — moved to Phase 10b (decision 0017)

Full portable-sandbox parity in the studio was originally sequenced here.
Nothing in Phases 8a–10 needs it, and the riskier world systems (light, water,
swimming, climbing, boats, kits) are worth testing first, so it now runs as
**[Phase 10b](#phase-10b--full-portable-sandbox-parity-in-the-studio-was-phase-7b-decision-0017)**
— after the asset catalogue, before settlement authoring. References to
"Phase 7b" elsewhere mean Phase 10b.

### Phase 8a — world time, natural light and sky (decision 0016; module 55)

Runs **before** the water renderer: water consumes sun, sky and IBL
(reflections, specular, refraction, underwater scattering) and would otherwise
be tuned twice. It also lands before the asset catalogue (10) and settlement
authoring (11) so no material or kit is ever approved under placeholder light.

Deliverables:

- `packages/world-time` — deterministic world clock and canon calendar (365
  days, 12 months w/ Jel names, 7-day week, 28-night lunar cycle), season
  scalar `s(t)`, pausable/scrubbable, no rendering dependency;
- sun/moon ephemeris (one latitude constant), altitude-defined twilight bands,
  Masser/Secunda with correct relative size and phase;
- authored star field: the thirteen canonical constellations rotating with the
  calendar, the drifting Serpent, the Southron pole star;
- physically-valued light rig (sun/moon lux curves, sky IBL via throttled
  PMREM, regional ground bounce), tone mapping + eye-adaptation exposure;
- cascaded shadow maps across the province terrain;
- aerial perspective: Rayleigh distance term + boundary-layer Mie haze driven
  by the climate humidity/mist fields (mountain crispness vs lowland glow);
- first ground-mist pass; canopy sky-visibility darkening;
- studio tooling: time-of-day scrubber, date/season field, region light
  presets, debug sliders, all in the reproducible URL, plus fixed-instant
  screenshot probes for lit material A/B;
- **owner gate**: dawn → noon → dusk → night walked in at least a lowland
  basin and a mountain belt. Expect the Phase 6/6b-approved terrain look to
  shift under physical light — that is re-approval under the correct light,
  not a regression; the tint slider and versioned material sets are the
  levers, and chasing the old flat-lit appearance is the wrong fix.

### Phase 8b — water renderer and physical interaction

Deliverables:

- WebGL2 water baseline;
- river, marsh, estuary and coast profiles;
- shared scene-depth/reflection pipeline;
- underwater rendering;
- CPU/Rapier water query;
- object buoyancy and interaction events;
- quality tiers and benchmark scenes;
- sun/sky-consuming water shading (reflection, specular, refraction,
  underwater scattering) and moon-driven tidal amplitude wired to
  `FloodBasin` (module 55 §95).

### Phase 8c — weather and atmosphere (module 55 §97–98)

Deliverables:

- weather state machine with region-weighted frequencies and volatility from
  the climate fields, seeded/reproducible transitions;
- computed (not hand-authored) weather parameter blocks on the Bethesda `WTHR`
  checklist, with an override layer for authored moments;
- cloud layers, rain/squall/thunderstorm, wet-surface response;
- the three mist regimes as distinct systems (radiation basin mist, advection
  sea fog, cloud-forest whiteout); god rays through canopy;
- weather ↔ wetness ↔ flood ↔ tide ↔ grip ↔ visibility ↔ AI-perception
  coupling, published through the environment query;
- quality tiers as one declarative table (volumetrics high-tier only).

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
easiest-sourced first) per the PROGRESS protocol. Climbing carries the
animation-sourcing risk — no ready-made wall-climb loops exist, but two
sourceable pools do (EVGAT's ladder-climb loops as the primary retarget
candidate, and the SkyParkour mod-authored clip set — module 90 §74.3); Phase
10b needs the movement-mode *contracts* in place, not final climb polish, so a
hard climb problem must not block the chain.

Deliverables:

- surface/submerged swimming;
- Argonian breath behaviour;
- stat/spell/equipment modifiers — **as a thin contract with defaults** (the
  equipment/inventory systems and UI arrive with Phase 10b, so Phase 9 defines
  the hook and supplies sane defaults rather than waiting on them);
- climb mode and climb-surface generation;
- small-boat control and boat graph;
- docking, storage and passengers;
- swim/climb/boat validation.

### Phase 10 — asset catalogue and kit compilers

Deliverables:

- vanilla asset registry;
- Xanmeer kit metadata and snapping;
- first current-settlement kit;
- vegetation and underwater kits;
- **the vegetation/scatter architecture (module 65, §109–112)**: deterministic
  scatter compiler pass (jittered-grid hash, constraint filters, clearance
  stamping), T1 batched hero statics + T2 bundle-instanced mid detail with LOD
  chains, T3 runtime groundcover ring from the land-cover raster, T4
  impostor/merged far LOD, weather-driven wind uniforms — proven first in the
  dense-vegetation micro-lab (§85.3), budget-probed (§69), landed on the
  reference watershed;
- physical materials;
- LOD and collision generation;
- source/credits reference check in CI.

### Phase 10b — full portable-sandbox parity in the studio (was Phase 7b; decision 0017)

All remaining intended-portable functionality from the combat sandbox is
available to the user in the world studio: as a user in the studio you can use
everything, and perform every action, that was intended to be portable from the
sandbox. All portable systems available and working as intended.

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
  including "enemy navigation access" against the baked navmesh (§115).

Sequenced here because:

- nothing in 8a–10 depends on it (they need Phase 7a's movement and the
  environment query, which exist), while light, water, swimming, climbing,
  boats and kits carry the real technical risk and are worth proving first;
- the orchestration extraction then happens **once**, against a character
  package that already carries swimming, climbing and boat modes (Phase 9),
  instead of being merged twice;
- combat spaces are measured against Phase 10's real kits, materials and
  collision rather than placeholder ground;
- it must precede Phases 11–13: settlement and dungeon authoring is gated on
  "combat spaces and critical-animation clearance validated" (00-core
  acceptance), and Phase 13 (fixed populations, encounter sockets, fixed loot,
  arrows) is impossible without enemies, targeting, bow and inventory.

Standing risk while it waits: the sandbox stays the only place combat runs, so
sandbox and studio can drift. Mitigation is the existing package rule —
new portable behaviour lands in `packages/`, never in `apps/combat-sandbox`
directly, and both apps' gates stay green.

### Phase 10c — stats, progression and character systems (module 76; decision 0019)

Implements the design settled by parallel workstream **S** (module 76 §103):
attributes/skills/derived stats, races, equipment scaling, encumbrance,
progression and the absolute power ladder — in `packages/game-core`, consumed
by both apps.

Deliverables:

- the accepted stat model implemented, with **baseline-equivalence tests**:
  at neutral stats, combat numbers match today's calibrated values;
- capability profiles (§52) regenerated *from* the stat system, with the
  world's traversal and spawn probes still green;
- enemy archetypes restated on the new scale; character-sheet UI;
- the power ladder documented for Phase 13 authors (what D0–D5 means
  numerically), and the birthsign hook left ready (module 55 gives a birth
  date its constellation for free).

Sequenced after 10b and **before Phase 11**: fixed difficulty (0004) means every
enemy, trap and loot item in Phases 11–13 is authored as an absolute number, so
the scale has to exist before that content is written. Workstream S can conclude
any time before this phase starts.

### Phase 11 — causal locations and settlement authoring

Deliverables:

- causal-model schema;
- agent blueprint workflow;
- district/route/parcel compiler;
- Hist-centred settlement grammar;
- Imperial-fringe settlement grammar;
- location-orphan validator;
- retained reference settlement;
- **quest location roster**: the per-quest World-generation provisions in
  docs/quests/ are the demand schedule — stable semantic IDs, approach
  alternatives, scene/NPC/evidence/container sockets, and the
  `QuestWorldProvision` packet per substantial location (quests 20 §13);
- **quest–world co-design loop per region packet — a completion gate, not a
  suggestion** (owner directive 2026-08-26; process: quests 90 §65b): after
  the settlement/POI draft, the region's local-quest *briefs* are drafted and
  their requested placements reconciled (a camp overlooking the route, a toll
  at the crossing, a flooded cellar) before the packet freezes. **A region
  packet without its quest-brief set and density budget is not done and must
  not be marked done in PROGRESS.** A single phase agent may wear both hats
  (world-drafting then brief-drafting, in that order) or spawn a subagent —
  what is mandatory is the artifacts and the gate, not the org chart. The
  published main-quest/faction provisions are confirmed in the same pass;
- **content-density budget** (owner directive 2026-08-26; numbers + evidence
  in [../research/morrowind-content-density.md](../research/morrowind-content-density.md)):
  match Morrowind — **18–22 named POIs per km²** of authored land in D0–D3
  regions (8–12 in D4–D5, landmark-heavy and quest-light), **something named
  within ≤300 m of travel along every road and boat lane**, quests per
  settlement by magnitude class (M5 ≈ 35–60, M4 10–20, M3 3–8, M2 1–3), **all
  settlement structures enterable and all settlement NPCs named**. Each region
  packet declares its counts against this budget at review;
- **D0 safe interiors** authored per settlement (quests 20 §12 mapping);
  Helstrom interior D0 with gates against the band-5 basin;
- **player-stronghold site reservation** — one reoccupied xanmeer or abandoned
  river station, reserved in this phase (quests 30 §24b.5; decision 0028);
  interiors are Phase 12 work;
- **root-transit network re-authoring**: the compiled four-station rootworm
  network is a Pass-1 placeholder — re-author it here with Hist-node placement;
  root-transit quests and rewards are finalized in the same packet's co-design
  loop.

### Phase 12 — dungeons and interior programmes

Deliverables:

- exterior portal and foundation data;
- Xanmeer graph grammar;
- cave/root/smuggler grammar;
- underwater entrances;
- interior navmesh bakes + per-cell acoustic/lighting profiles (§114, §106,
  55 §96);
- interior streaming contract;
- one full retained production dungeon;
- **quest dungeon reservations** (sites + causal records now, geometry per
  regional packet): the submerged Eye observatory, Blackrose prison
  archive/tunnels, Lilmoth Tidal Palace heist complex, the two optional
  Eye-route chains, and the **Lost City reserved in the deep basin beyond
  Helstrom** (near-final D5 complex; quests 30).

### Phase 12b — the province soundscape (module 57; decision 0022, re-sequenced by 0023)

The world heard: region/time/weather ambience, water emitters, contact sound.
Music (the score) is explicitly out of world-build scope. **Owner steer
(0023): sound is polish-tier** — nothing riskier waits on it, and it sits
here, after the genuinely uncertain systems (water, traversal, vegetation,
kits), as the last step before Phase 13 authors creature calls and settlement
ambience into its tables. It needs only Phase 8a's clock and may be pulled
earlier if the queue allows.

Deliverables:

- extract the Skyrim Sounds BSA into the asset vault and convert the needed
  sets through the pipeline (loop-safe encoding solved once, §107);
- `AudioManager` (buses, unlock, crossfader, one-shot scheduler, ~24-voice
  cap) on three.js `Audio`/`PositionalAudio` with `equalpower` panning;
- region ambience beds + stochastic detail tables for the existing region
  classes, driven by the world clock and climate fields (night-loud tropical
  inversion, §106); sourcing gaps filled per §107 (mod packs with credits,
  Sonniss/CC0);
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

### Phase 13 — ecology, encounters and fixed loot

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
- province-wide vegetation densities: per-region ecology-driven species
  palettes and T3 groundcover authoring, seasonal response to `s(t)` (§112);
- creature calls and settlement/ecology ambience authored into the sound
  tables (module 57 tier 2);
- disease, toxin and insect systems;
- encounter sockets;
- fixed loot provenance;
- no-level-scaling tests;
- arrows and physical materials;
- **light/atmosphere tier 3** (module 55): bioluminescent night ecology as the
  deep-marsh night palette, seasonal foliage response to `s(t)`, calendared
  Vampire-Day (eclipse) world states, volumetric (froxel) fog on the high
  quality tier.

### Phase P — general polish pass (rolling backlog; owner-directed, 2026-08-28)

A dedicated catch-all polish phase, run before Phase 14 hardens budgets (items
may be pulled earlier when convenient). Earlier phases close when their systems
are **de-risked and owner-accepted in shape**, not pixel-perfect; anything
cosmetic or non-blocking that survives a phase's closing playtest moves to the
**backlog at [docs/polish-backlog.md](../polish-backlog.md)** instead of
holding the phase open. The owner adds items freely; agents add items whenever
they defer visual/feel work. Each item records where it came from and what
"done" looks like.

### Phase 14 — streaming and deployment

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

### Phase 15 — expansion by watershed and region

Each expansion cycle:

1. refine hydrology;
2. author regional identity;
3. compile routes;
4. establish causal location network;
5. **quest-brief co-design pass** (quests 90 §65b — local-quest briefs drafted
   against the draft location network; requested placements reconciled before
   freeze);
6. agent-author hero locations;
7. compile assets;
8. integrate gameplay;
9. validate;
10. user visual review;
11. approve world bundles.

The province preview remains available throughout expansion.

## 87. Why this sequence controls risk

- province hydrology cannot drift between independently built local areas;
- the physical character enters before settlement and dungeon compilers harden;
- water, swimming and boats are foundational world systems;
- asset gaps become visible within retained production content;
- source and credits metadata exist before large-scale ingestion;
- agentic placement operates on stable semantic layers;
- the integrated game remains runnable throughout development;
- detailed work always contributes to the final world.

---

