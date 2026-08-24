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

Progress through these phases is tracked in [docs/PROGRESS.md](PROGRESS.md), never
in this document. Phases are milestones, not straitjackets: a phase may be split
into sub-milestones in PROGRESS.md when that gives the user earlier playtest gates.

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

### Phase 6b — province rescale and mountain relief (decision 0015; runs after Phase 7)

Reopens province terrain to apply decision 0015 (×1 horizontal, ×1 vertical,
drama in the data). **All feel judgements and gates happen on foot in
"Walk the province" (Phase 7's character mode); the flyover is secondary.**
Lowlands outside the mountain masks + blend margin must stay byte-identical
through 6b.2–6b.3 (diff-checked) — the owner-approved marsh is not renegotiated.

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
  (candidate POI shelves); lowland byte-identity diff;
- **owner walk gate(s)** in the ranges.

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

### Phase 7 — physical character integration

Deliverables:

- combat sandbox inventory/items and character systems extracted into shared
  packages (deferred here from Milestone 1b) and consumed by both sandbox and
  world studio;
- sandbox character and camera in world studio;
- current ecctrl/Rapier grounded movement;
- environment query contract;
- combat actor and target registration;
- input parity across desktop, touch and controller;
- capability-profile validation.

### Phase 8 — water renderer and physical interaction

Deliverables:

- WebGL2 water baseline;
- river, marsh, estuary and coast profiles;
- shared scene-depth/reflection pipeline;
- underwater rendering;
- CPU/Rapier water query;
- object buoyancy and interaction events;
- quality tiers and benchmark scenes.

### Phase 9 — swimming, climbing and boats

Deliverables:

- surface/submerged swimming;
- Argonian breath behaviour;
- stat/spell/equipment modifiers;
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
- physical materials;
- LOD and collision generation;
- source/credits reference check in CI.

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
- **D0 safe interiors** authored per settlement (quests 20 §12 mapping);
  Helstrom interior D0 with gates against the band-5 basin.

### Phase 12 — dungeons and interior programmes

Deliverables:

- exterior portal and foundation data;
- Xanmeer graph grammar;
- cave/root/smuggler grammar;
- underwater entrances;
- interior streaming contract;
- one full retained production dungeon;
- **quest dungeon reservations** (sites + causal records now, geometry per
  regional packet): the submerged Eye observatory, Blackrose prison
  archive/tunnels, Lilmoth Tidal Palace heist complex, the two optional
  Eye-route chains, and the **Lost City reserved in the deep basin beyond
  Helstrom** (near-final D5 complex; quests 30).

### Phase 13 — ecology, encounters and fixed loot

Deliverables:

- habitat and territory system;
- fixed creature/faction populations;
- disease, toxin and insect systems;
- encounter sockets;
- fixed loot provenance;
- no-level-scaling tests;
- arrows and physical materials.

### Phase 14 — streaming and deployment

Deliverables:

- production chunk format;
- dependency-aware streaming;
- LOD and instance batching;
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
5. agent-author hero locations;
6. compile assets;
7. integrate gameplay;
8. validate;
9. user visual review;
10. approve world bundles.

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

