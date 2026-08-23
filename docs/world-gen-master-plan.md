# Elder Souls: lore-led, hydrology-first world generation for Argonia

**Research and architecture brief — 22 August 2026** (reviewed and revised 22 August 2026)

## How to use this document

This is the reference plan, not a progress tracker (status lives in
[docs/PROGRESS.md](PROGRESS.md)). **Every agent reads this document in full,
once, at session start** — owner decision, 2026-08-23: the global picture is
worth the tokens, because local decisions must serve the whole design. The
part index below is for re-finding sections afterwards, not for skipping:

| Part | Sections | Covers |
|---|---|---|
| I | 1–10 | What Vvardenfell teaches a procedural world system |
| II | 11–16 | Black Marsh macro structure, fixed difficulty, era, anchors, region taxonomy |
| III | 17–27 | Lore systems → world systems (infrastructure decay, rootworms, Hist, tribes, hazards) |
| IV | 28–32 | Causal world authoring, agent blueprints, validation |
| V | 33–37 | Province-scale hydrology |
| VI | 38–46 | Water rendering/physics, swimming, boats, climbing |
| VII | 47–50 | Dungeons, interiors, encounters |
| VIII | 51–57 | Compatibility with combat/physics/character/items |
| IX | 58–65 | Repository, package and deployment architecture |
| X | 66–70 | World Studio and measurement-led inspection |
| XI | 71–80 | Asset strategy and candidate sources |
| XII | 81–84 | Demographics and community priors |
| XIII | 85–87 | Revised build sequence (the phase plan) |
| XIV | 88–92 | Non-negotiable acceptance rules |

## Summary of the overall goal and request

The overall goal is to build the province-scale world for an **Elder Souls** game set in Argonia/Black Marsh. Its world structure should carry the geographic coherence, regional distinctiveness, cultural density and exploratory character of *The Elder Scrolls III: Morrowind*. Its playable systems should incorporate the evolving character, input, animation, physics, combat, equipment and inventory work being proved in `ecctrl-souls-combat`, alongside Dark Souls-style combat, extensive swimming and underwater exploration, player-sailable boats, fixed regional danger, and Breath of the Wild-style climbing.

This document answers the following combined request:

- describe the Vvardenfell world from macro scale to micro scale in terms useful for a coding agent designing a generated world;
- translate those principles into a lore-grounded Argonia design whose central identity is a vast, hostile, mysterious and biologically strange deep marsh surrounded by more accessible Imperial, Dunmer and mercantile fringes;
- mine broader Black Marsh lore for world systems, travel systems, Hist integration, historical layers, settlements, hazards, creatures, underwater places and distinctive content;
- combine province-wide procedural systems with deliberate agent-authored planning of regions, settlements, routes, landmarks and important dungeons;
- use official/game-derived lore maps for canonical anchors, the All Tamriel/Argonia heightmap for macro terrain, and the supplied community Inkarnate map only as a secondary prior for settlement placement/prominence and possible route connections, while giving every generated location a causal reason to exist;
- establish fixed enemy and loot difficulty, with progression arising through increased capability and knowledge;
- specify high-quality, high-performance Three.js water rendering and physical interaction;
- support Argonian underwater breathing, race/stat/spell-driven swimming, climbing, boats, arrows and other physical material interactions;
- identify useful vanilla Skyrim and Skyrim-mod assets that can be reused directly, including the Xanmeer kit, while keeping a simple source-and-credits list;
- decide how exteriors and interiors should be sequenced;
- establish a low-risk canonical monorepo architecture that keeps the world, combat sandbox, integrated game and existing offline asset-pipeline code compatible while each remains independently testable, while large Skyrim/mod source archives remain outside Git in a local asset vault;
- provide an inspection application with map-based spawning, fly mode, physical-character mode and measurement-led validation for coding agents;
- revise the build order so province-scale geography and hydrology begin at full extent while detailed systems mature within retained production areas.

## Executive conclusion

The recommended production model is:

> **canonical maps and lore anchors → province-scale terrain and hydrology → regional ecology, culture, danger and transport fields → causal semantic world graph → agent-authored important places → deterministic asset compilers → gameplay and performance validation → streamed runtime world bundles**

The recommended repository model is a single canonical **`elder-souls-argonia` monorepo** containing the integrated game, combat sandbox, world studio, water laboratory and asset laboratory as separate applications. Shared gameplay and world systems live in versioned packages. The existing `ecctrl-souls-combat` code becomes a maintained sandbox application inside that structure, with its portable modules extracted into packages consumed by both the sandbox and the real game. The **code, recipes, tests and documentation** from the existing local-Git `elder-scrolls-asset-pipeline` should also be imported into the monorepo, preserving its history where practical; Skyrim/mod archives, extracted source trees and bulky intermediates remain outside the repository in a configurable local asset vault.

The concrete canonical repository is **[`jtattersall09403/elder-souls-argonia`](https://github.com/jtattersall09403/elder-souls-argonia)** on branch `main`.[^R0] It should be cloned into the existing `elder-souls-dev` working directory and Claude should be launched with `elder-souls-argonia/` as its current working directory. The existing combat sandbox checkout and local-Git asset-pipeline checkout are sibling **migration sources**, not permanent runtime dependencies. Production code, CI and deployment must never depend on `../` sibling paths, symlinks into sibling repos, or unversioned local code.

The recommended scale model has three simultaneous layers:

1. **Whole-province production data from the beginning:** coordinate system, source maps, heightmap, fixed settlement anchors, coarse hydrology, region graph, danger gradient, transport graph and source provenance.
2. **One retained reference watershed at full detail:** a real part of the final world used to prove water, terrain, settlements, dungeons, traversal, combat and streaming against the province model.
3. **Small disposable laboratories:** isolated water, boat, climbing, collision, animation and rendering experiments.

The core creative rule is that **every location carries an explicit causal record**. Geography, hydrology, ecology, history, culture, politics, economics and individual motivation explain why a place exists. Those causes determine its layout, architecture, inhabitants, encounters, loot, routes and state of repair.

The core gameplay rule is that **the world never receives the player level as a generation input**. Creature strength, faction strength, hazards and chest contents are fixed by place and world state. The deep interior remains dangerous. Player capability opens it through skill, equipment, spells, boats, swimming, climbing, knowledge and access to local transport.

---

# Part I — What Vvardenfell teaches a procedural world system

## 1. Vvardenfell is a hierarchy of authored causes

Vvardenfell works as a world because many scales agree with each other. Red Mountain influences regional geology. Regional geology influences routes and settlement density. Routes influence trade and faction control. Faction control influences architecture and services. Local history influences caves, tombs, mines, ruins and occupants. Micro-level clutter reinforces all of those decisions.

A useful generation hierarchy is:

| Scale | Vvardenfell world property | Generation implication |
|---|---|---|
| Province | Island organised around Red Mountain | Begin with a few dominant physical facts |
| Region | Strongly differentiated ecological and geological territories | Give each region its own terrain, ecology, traversal, settlement and encounter grammar |
| Corridor | Foyadas, valleys, passes, coasts and island chains channel movement | Generate routes as responses to geography |
| Settlement network | Cities, towns, villages, camps, forts, estates and plantations occupy functional positions | Place settlements from transport, economy, culture, politics and terrain |
| Settlement | Urban form reflects culture, site and hierarchy | Generate district plans before individual buildings |
| POI network | Tombs, mines, caves, shrines, strongholds and ruins overlap historically | Build several causal location layers |
| Dungeon family | Each architectural culture has a recognisable spatial language | Use family-specific graph grammars and kits |
| Interior | Room programme follows function, occupants and history | Generate semantic room graphs before kit placement |
| Micro landscape | Rocks, vegetation, paths, shrines, signs, camps, doors, loot and corpses communicate local history | Dress from semantic context and physical processes |

The resulting world feels designed because decisions at one scale constrain decisions below it.

## 2. The dominant-landform principle

Red Mountain gives the island a memorable macro structure. The player can understand the island through its hostile central volcano, surrounding ashlands and peripheral inhabited regions. Its influence remains legible at great distance and at ground level.

A province generator needs an equivalent organising system. Random local terrain can produce attractive scenes without producing a memorable province. Vvardenfell demonstrates the value of a small number of province-defining structures:

- a dominant centre;
- major gradients radiating or flowing from it;
- visible regional boundaries;
- limited passages through difficult terrain;
- peripheral access zones;
- a small set of landmark silhouettes that support mental navigation.

For Black Marsh, the equivalent macro system is the **river basin, wetland and Hist-root complex**. The player should gradually learn where major rivers flow, which channels reach the coast, where dry natural levees lie, where groundwater rises, which flood basins expand seasonally, where the deep rootlands begin, and which routes enter the interior.

## 3. Regions change play topology

Vvardenfell's regions carry gameplay consequences. The Ashlands are sparse, exposed and storm-prone. The Grazelands support cross-country movement and limited road infrastructure. Molag Amur channels movement through steep, volcanic ground. Azura's Coast uses islands and boat-linked settlements. The Bitter Coast combines marshland, fishing villages, smugglers and poor visibility.[^M1]

The procedural rule is:

> **A region changes movement, visibility, population, architecture, economy, encounter ecology and route structure alongside its materials and vegetation.**

A biome record therefore needs more than colour and foliage fields. It needs data such as:

```ts
interface RegionGrammar {
  terrainProcesses: TerrainProcessId[];
  hydrologyClasses: WaterBodyClass[];
  visibilityProfile: VisibilityProfile;
  traversalProfile: TraversalProfile;
  settlementArchetypes: WeightedId[];
  routePreferences: RoutePreference[];
  dungeonFamilies: WeightedId[];
  ecologyProfile: EcologyProfileId;
  factionPressures: FactionPressure[];
  materialPalette: AssetTag[];
  landmarkGrammar: LandmarkRule[];
  dangerProfile: DangerProfileId;
}
```

## 4. Vvardenfell is a multimodal transportation graph

Vvardenfell does not rely on roads to connect every meaningful place. Walking, trackless cross-country travel, boats, silt striders, Mages Guild guides and Propylon chambers form an overlapping graph. Each mode has its own hubs, geography and social identity.

The world graph should describe **travel edges**, not just roads:

```ts
type TravelMode =
  | "footpath"
  | "road"
  | "bridge"
  | "ferry"
  | "boatRoute"
  | "swimRoute"
  | "climbRoute"
  | "fastTravelService"
  | "ritualTransit";

interface TravelEdge {
  from: WorldNodeId;
  to: WorldNodeId;
  mode: TravelMode;
  costProfile: TravelCostProfile;
  seasonalState?: SeasonalStateId;
  ownership?: FactionId;
  hazards: HazardId[];
  discoverability: DiscoverabilityProfile;
}
```

This structure supports a world in which the shortest straight-line path, safest route and fastest route differ.

## 5. Settlements are results of site, economy and power

Balmora illustrates site-responsive urbanism. The Odai River, bridges, valley floor and hills organise commercial, residential and high-status areas. High Town occupies elevated ground. Labor Town and other districts express social and economic structure through geography.[^M2]

Other settlement families show distinct causal combinations:

| Settlement | Causal structure useful to a generator |
|---|---|
| Balmora | River valley, bridges, road junction, political centre, status expressed through elevation |
| Vivec | Monumental repeated modules with nested vertical neighbourhoods and specialised cantons |
| Ald'ruhn | Hostile landscape, giant cultural landmark, defensive compactness |
| Sadrith Mora and Telvanni settlements | Island geography, boat access, organic towers, eccentric political authority |
| Seyda Neen, Pelagiad and Caldera | Imperial architectural overlay and administrative/economic purpose |
| Gnaar Mok, Hla Oad and Khuul | Small coastal service settlements connected to fishing, boats and smuggling |
| Ashlander camps | Mobile or semi-permanent cultural settlement grammar |
| Plantations and estates | Parcel structure generated by production, labour and transport |

The settlement compiler should receive a district and relationship plan. It should never begin by scattering houses.

## 6. Repetition can be cultural language

Vivec demonstrates that modular repetition can strengthen identity. Cantons use repeated architecture while containing different functions and social spaces. Their internal hierarchy—plaza, waistworks, canalworks and underworks—creates nested topology.[^M3]

For generation, repeated modules need semantic variation:

- district role;
- internal circulation;
- faction and wealth;
- exterior access;
- water relationship;
- services;
- ritual and political meaning;
- degree of decay or adaptation.

A modular Argonian or Xanmeer kit can therefore support many memorable places when the semantic plans differ.

## 7. Wilderness content comes from overlapping historical layers

Vvardenfell's wilderness contains natural caves, ancestral tombs, egg mines, Dwemer ruins, Daedric shrines, strongholds, forts, shipwrecks, camps and faction sites. These belong to different periods and institutions. Their proximity creates archaeology and conflict.

A procedural world should generate POIs through layered passes:

1. geological and hydrological features;
2. ancient settlement and ritual layers;
3. later states and migrations;
4. Imperial or colonial infrastructure;
5. current settlements and economies;
6. current factions, criminals and creatures;
7. quest-specific changes.

The current occupant can differ from the original builder. The contrast itself becomes content.

## 8. Dungeon families need distinct graph grammars

A dungeon family should specify:

- room and corridor vocabulary;
- expected graph structure;
- verticality;
- water ratio;
- loop frequency;
- entrance types;
- room scale distribution;
- cultural functions;
- common historical modifications;
- encounter ecology;
- loot provenance;
- navigation and combat-clearance rules.

A compact representation is:

```ts
interface DungeonFamily {
  id: DungeonFamilyId;
  graphGrammar: GraphProductionRule[];
  roomPrograms: WeightedId[];
  verticality: Range;
  waterRatio: Range;
  loopCount: Range;
  sideBranchCount: Range;
  collapseProfile: CollapseProfile;
  assetKit: AssetKitId;
  encounterSockets: EncounterSocketRule[];
  rewardLogic: RewardLogicId;
  traversalRequirements: CapabilityRequirement[];
}
```

Major dungeons can use agent-authored graphs. Minor dungeons can use the same family grammar with a seed.

## 9. Coarse terrain gains identity through placed assets

Morrowind exterior cells are 8,192 game units wide. MWSE documents 22.1 units per foot, giving a cell width of roughly 113 metres.[^M4] The base terrain is coarse by modern standards. Rocks, plants, buildings and hand-placed statics create much of the perceived local structure.

This supports the proposed Argonia pipeline:

> **macro heightfield → hydrological conditioning → channels and erosion → local terrain modifiers → kit geometry → materials → vegetation and clutter**

The macro terrain prior should come from Transbot9's [All Tamriel Heightmap](https://www.nexusmods.com/skyrimspecialedition/mods/573) and, where useful, SqueeblySplat's [Tamriel Worldspaces](https://www.nexusmods.com/skyrimspecialedition/mods/118678?tab=files), whose dedicated **Argonia** worldspace file is 30.9 MB.[^G1][^G2] These provide province silhouette, broad basins, large uplands and a drainage prior. They do not need to encode each mud bank, stream, root mound or village platform.

## 10. Vvardenfell properties to protect explicitly

The Argonia generator should encode these as acceptance criteria:

- regional identity affects play;
- geography explains settlement and route placement;
- population and discovery density vary strongly;
- several cultures occupy the same landscape in distinguishable layers;
- ruins and current use tell different historical stories;
- small POIs can be memorable without becoming full dungeons;
- travel modes form a learnable network;
- landmarks support player navigation;
- terrain and vegetation control reveals;
- dungeon families remain recognisable;
- important locations can break generic rules through deliberate blueprints.

---

# Part II — Black Marsh as a province-scale world

## 11. The central macro identity: an unconquered hydrological heart

Black Marsh lore repeatedly supports a province whose foreign-controlled or foreign-accessible zones cluster along borders, coasts and dependable waterways while the interior remains difficult to enter, govern and map. The Third Edition *Pocket Guide* presents the heartland as effectively inviolate, and *The Argonian Account* repeatedly shows Imperial roads, bridges and drainage schemes failing against water, mud and living swamp.[^L1][^L2][^L4]

This produces a strong world structure:

| Macro zone | Physical character | Cultural/political character | Fixed danger |
|---|---|---|---|
| Border and coastal fringe | Firm ground, ports, engineered drainage, navigable estuaries, surviving roads | Imperial, merchant, Dunmer and mixed influences; Argonian adaptation of imported structures | Accessible starting and mid-game spaces with local high-danger pockets |
| Transition wetlands | Flood-prone roads, broken bridges, braided channels, plantations, estates, reclaimed forts | Mixed communities, contested authority, failed colonial projects, active trade and raiding | Moderate to high, dependent on route knowledge and season |
| Rootlands and deep marsh | Flooded forest, deep channels, unstable ground, dense canopy, giant roots, limited external infrastructure | Hist-centred tribes, local transport systems, limited outsider presence | High and fixed |
| Inner heart and Helstrom approaches | Sparse mapped routes, extreme ecology, ancient ruins, strong Hist influence, difficult retreat | Deep cultural and spiritual centres with minimal external control | Highest fixed regional danger |

These zones form hydrological and cultural gradients. Rivers, watersheds and historical corridors define their shapes.

Foreign infrastructure should show a visible life cycle:

1. surveyed and imposed;
2. adapted to local conditions;
3. damaged by flooding and biological growth;
4. partially abandoned;
5. reused by local communities, criminals or creatures;
6. submerged, buried or absorbed into the landscape.

This gives the Imperial fringe the same thematic role that Imperial towns and forts perform on Vvardenfell: a legible external system occupying only part of a much older place.

## 12. Fixed difficulty and natural access progression

The game should have no player-level input in world generation, enemy selection or container contents.

### 12.1 Required technical prohibition

These systems must not receive `playerLevel`:

- encounter population;
- creature variant selection;
- faction equipment selection;
- dungeon enemy replacement;
- loot-table selection;
- chest quality;
- regional hazard strength;
- boss statistics;
- route hazard selection.

CI can enforce this through dependency rules and tests.

### 12.2 Place-based danger

Each region and location carries a fixed `DangerProfile`:

```ts
interface DangerProfile {
  ecologyThreat: number;
  factionThreat: number;
  diseaseThreat: number;
  toxinThreat: number;
  navigationComplexity: number;
  waterCurrentThreat: number;
  drowningThreat: number;
  visibilityThreat: number;
  remoteness: number;
  recoveryScarcity: number;
  nightMultiplier: number;
  seasonalModifiers: SeasonalDangerModifier[];
}
```

Values describe the place. Quest outcomes, weather, migration and faction conflict may change them through explicit world events.

### 12.3 Fixed loot

A location's rewards derive from:

- original purpose;
- historical occupants;
- current occupants;
- trade links;
- local resources;
- degree of isolation;
- difficulty of access;
- quest and faction state.

A submerged Barsaebic archive can contain rare fixed artefacts from the start. A low-level player can reach it through exceptional planning, temporary water-breathing magic, stealth and risk. The reward remains the same.

### 12.4 Natural unlocking

The deep world becomes increasingly survivable through:

- greater health, stamina and resistances;
- better armour and lower effective equipment burden;
- swimming skill and speed;
- breath duration or Argonian physiology;
- water-breathing and fast-swim spells;
- climbing stamina and route knowledge;
- boats and boat upgrades;
- alchemy against disease, poison and insects;
- faction allies and local guides;
- discovery of rootworm, ferry and ritual transit;
- map knowledge and safe resting places;
- better combat capability.

This gives progression a geographic expression. A player can see or hear about places long before surviving them.

## 13. Era must be frozen before detailed world authoring

Black Marsh changes greatly across eras. The state of Imperial control, Dunmer relations, the Knahaten Flu's aftermath, the Shadowscales, the An-Xileel, the Argonian invasion of Morrowind, Lilmoth and Umbriel all depend on date.[^L5]

The source schema needs:

```ts
interface CanonDatum<T> {
  value: T;
  era: EraRange;
  confidence: SourceConfidence;
  sources: SourceId[];
  spatialTolerance?: number;
  authorNotes?: string;
}
```

Recommended confidence values:

```ts
type SourceConfidence =
  | "CANON_FIXED"
  | "OFFICIAL_MAP_DERIVED"
  | "GAME_DERIVED"
  | "LORE_INFERRED"
  | "COMMUNITY_CONSENSUS"
  | "PROJECT_REFERENCE"
  | "AGENT_AUTHORED"
  | "GENERATED";
```

The build can retain multiple era layers during research. Production settlement states should use one frozen era configuration.

## 14. Canonical settlement anchors and community-map priors

Major settlement coordinates should be registered first from official maps, game-derived maps and lore. Where those sources disagree, use tolerance polygons rather than pretending to false precision. The heightmap supplies topography around those anchors; hydrology, political history and settlement function then determine the detailed site.

| Anchor | Broad mapped position | World-generation role | Required caution |
|---|---|---|---|
| **Gideon** | Western/southwestern border near Cyrodiil | Major frontier city, road/river interface, estates, Imperial and Argonian layers | City state differs by era; local terrain must reconcile map position with Blackwood/Gideon depictions |
| **Soulrest** | Southwestern coast/Topal Sea side | Port, trade, fishing, piracy, naval and estuarine access | Source detail is sparse; preserve map anchor and mark invented detail clearly |
| **Blackrose** | Southern or south-central interior/coastal lowland | Ancient city, prison and penal/fortified history, dangerous surrounding marsh | Prison and city layers require era separation |
| **Lilmoth** | Southeastern coast at Oliis Bay | Major port and external gateway, half-sunken Imperial districts, cosmopolitan and mercantile layers | Umbriel and An-Xileel consequences are era-specific |
| **Archon** | Eastern/southeastern coast | Eastern port or regional city, coastal and deep-marsh interface | Sparse source detail needs high confidence discipline |
| **Helstrom** | Central interior | Deep-heart city and principal hero location | Canon gives importance and position with limited layout detail; use intensive agent authoring |
| **Stormhold** | North/northwest | Northern city and Shadowfen/river-network anchor | ESO and later-map states need era tagging |
| **Thorn** | Northeastern frontier | Morrowind-facing city, trade/war/slavery frontier, delta or river access | Political and demographic state depends strongly on era |
| **Alten Corimont** | Northern/eastern route system in ESO-era material | Port/trade or secondary regional anchor | Treat importance as era-specific |

The province compiler should never shift these cities simply to improve procedural spacing. It should solve surrounding hydrology, roads, districts and satellite settlements around them. Official, game-derived and community maps must remain separate source layers.[^L12]

### 14.1 Community Inkarnate map as a settlement and route prior

The supplied community map — [**Black Marsh / Argonian State 4E 231**](https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Fa-map-of-black-marsh-i-made-in-inkarnate-i-find-the-v0-7jo2gib84ox71.jpg%3Fauto%3Dwebp%26s%3D89a43ee168eaae73e9a350667e1fe2a46f273749) — is a useful **secondary planning prior** for relative settlement placement, settlement prominence and candidate overland graph connections.[^C2]

Its role is deliberately narrow:

- use its major-city positions as another check on the fixed anchors above;
- use the icon hierarchy as an **ordinal size/prominence prior**, not an exact population model;
- use named secondary settlements and forts as candidate locations where they fit lore, geography and the final hydrology;
- use its faint road network as **suggested graph edges between places**, not as fixed road geometry;
- do **not** inherit its rivers, coast detail, marsh boundaries, forests or local landscape wholesale;
- do **not** require every named minor settlement to survive into the final world;
- allow province-scale hydrology and ecology to move, replace, split or remove the map's minor roads and waterways.

The map's strongest reusable location layer is approximately:

**Major/prominent anchors:** Gideon, Stormhold, Helstrom, Thorn, Archon, Blackrose, Soulrest and Lilmoth.

**Useful secondary-settlement candidates:** Blankenmarsh, Glenbridge, Alten Corimont, Bright Throat, Rockguard, Chasecreek, Riverwalk, Branchmont, Rockpoint, Greenglade, Riverbridge, Seafalls, Greenspring, Alten Markmont, Creekford, Crossroads, Greenwillow, Rockgrove, Blacktower, Alten Meirhall and Moonmarch, plus named forts such as Fort Blankenmarsh, Fort Dusklight, Fort Saltsaber and Fort Moonmarch.

The road lines suggest high-level graph ideas such as:

- a **Gideon → Murkmire/Alten Corimont → Stormhold** western/northern connection;
- **Stormhold → Rockpoint → Helstrom** as one possible northern-to-heartland chain;
- **Helstrom → Greenglade/Riverbridge → eastern coast/Archon** as a candidate eastward chain;
- **Helstrom → Alten Markmont/Greenspring/Crossroads → Blackrose** as a candidate southward chain;
- **Crossroads/Greenwillow/Rockgrove → Soulrest** as a southwestern branch;
- **Blackrose → Alten Meirhall → Lilmoth** as a southeastern branch.

These should be stored as `suggestedConnection` edges with low-to-medium confidence. The route compiler can then decide whether each final connection is a dry road, levee track, boardwalk, ferry, river route, mixed-mode journey or no longer sensible after hydrology is solved.

This community map is **not complete** and is not the landscape blueprint. The final province should contain many additional waterways, settlements, camps, hidden sites, routes and ecological structures generated from lore and causal world logic.

## 15. Minor settlements also need reasons to exist

Minor locations can be generated after the following questions have answers:

1. What resource, route, ritual, refuge or political need caused the location to form?
2. Why is this exact site preferable to nearby alternatives?
3. Who founded it?
4. Who controls it now?
5. How has water changed it?
6. What does it exchange with the wider region?
7. What danger does it manage or exploit?
8. What visible evidence communicates its history?
9. What would cause abandonment, growth or conflict?
10. Which assets express those facts?

This applies to a three-hut camp and a major city.

## 16. A region taxonomy for generated Argonia

The generator can use internal ecological classes independent of political names:

| Region class | Physical grammar | Traversal grammar | Settlement grammar |
|---|---|---|---|
| Tidal delta | Braided channels, mudflats, sandbars, brackish pools, mangroves | Boats, tides, shallow crossings, unstable banks | Docks, stilts, fisheries, elevated stores, ferries |
| Coastal lagoon | Sheltered water, barrier islands, reed beds, salt influence | Canoes, skiffs, short coastal sails, wading | Port villages, salt/fish production, watch posts |
| Deep river corridor | Large navigable channel, natural levees, oxbows | Fast boat travel, narrow dependable foot corridors | Trade towns, ferry hubs, estates, forts |
| Flooded forest | Shallow water beneath canopy, roots, fallen trunks | Wading, swimming, root bridges, climbing | Raised villages, tree/root structures, small docks |
| Interior swamp | Pools, hummocks, winding channels, poor sight lines | Local knowledge, canoe channels, difficult retreat | Small dispersed Hist-centred communities |
| Seasonal floodplain | Large wetness variation, temporary lakes and channels | Route availability changes by season or weather | Seasonal platforms, movable structures, causeways |
| Raised hammock | Stable local high ground inside wetlands | Foot hub, defensible camp, landmark | Valuable settlement, shrine, tomb, fort or refuge site |
| Rootland | Giant Hist/root influence, organic topography, unusual chemistry | Root paths, climbing, submerged passages, ritual transit | Hist settlements, sacred sites, restricted outsider access |
| Northern transition | Firmer ground and Morrowind-facing wetlands | Denser foot and road network, mixed water travel | Border towns, Dunmer interaction, defensive sites |
| Western frontier | Red clay, drainage works, roads, estates and Imperial remnants | Engineered routes with variable survival | Mixed settlements, plantations, forts, administrative ruins |
| Deep sink basin | Permanently flooded depressions, dark water, low oxygen | Diving, boats, limited dry refuge | Submerged ruins, creature territories, specialist camps |
| Karst/root cavern belt | Sinkholes, caves, subterranean rivers | Swimming, climbing, underground navigation | Cave communities, hidden transit, dungeons |

Each class modifies terrain, hydrology, asset weights, danger, sound, visibility and movement.

---

# Part III — Lore systems that should become world systems

## 17. Failed roads, bridges and drainage

*The Argonian Account* describes repeated attempts to build roads, bridges and drainage systems, with water and adhesive mud reclaiming them.[^L1]

This supports generated infrastructure states:

```ts
type InfrastructureState =
  | "maintained"
  | "adapted"
  | "floodDamaged"
  | "subsiding"
  | "partiallySubmerged"
  | "abandoned"
  | "reused"
  | "ecologicallyAbsorbed";
```

Roads and bridges should have construction histories and failure mechanisms. A bridge can become a current landmark, an underwater obstacle, a smuggler ambush point and a source of salvage.

## 18. Drifting and half-submerged settlements

Hixinoag in *The Argonian Account* is described as half-submerged, with indications that settlements can move or drift; inhabitants use personal rafts.[^L2]

This supports several settlement types:

- tethered raft clusters;
- platforms attached to living roots;
- seasonally relocated villages;
- floating markets;
- houses built on reused boat hulls;
- abandoned structures visible beneath current water;
- platform networks whose configuration changes after floods.

Movement can be implemented through world-state variants or constrained floating modules. A town does not need to drift continuously during play to preserve the lore concept.

## 19. Rootworm transit

The rootworm-based “Underground Express” in *The Argonian Account* is one of the province's strongest transport concepts.[^L2][^L3]

It can function as:

- a discoverable fast-travel network;
- a deep-marsh equivalent of silt striders;
- a culturally restricted service requiring trust or ritual access;
- a route network defined by Hist/root connectivity;
- an interior transition through organic tunnels;
- a quest and smuggling system;
- an explanation for rapid local movement with few roads.

Each station should have a biological and social reason to exist. Rootworm routes can connect Hist settlements, egg pools, deep shrines and isolated cities while bypassing surface hazards.

## 20. The Hist as a spatial, cultural and systemic layer

The Hist should affect the world at every scale. Argonian creation mythology, Hist research texts and Murkmire material connect the Saxhleel to roots, sap, memory, identity, dreams and transformation.[^L6][^L7]

### 20.1 Province scale

- Hist territories influence cultural-region boundaries.
- Root connectivity supports rootworm and ritual travel.
- Major Hist concentrations influence groundwater, vegetation and settlement density.
- Some deep areas can be intentionally difficult to map through dense root topography, dreams or changing access.

### 20.2 Settlement scale

A Hist-centred settlement plan should derive from:

- root protection radius;
- egg-pool and clean-water requirements;
- ritual approach paths;
- sight lines toward the tree;
- flood-safe community spaces;
- restricted sacred zones;
- sap-speaker residence and gathering area;
- defensive use of roots and water;
- visitor separation;
- burial or return-to-nature practices appropriate to the selected lore interpretation.

### 20.3 Quest and narrative scale

- Hist dreams can reveal past states of a place.
- Conflicting interpretations of Hist guidance can create political conflict.
- Damaged, separated, rogue or manipulated Hist can alter a region.
- Sap access can affect faction standing, rituals or physiological change.
- Memory can connect individual quests across generations.

### 20.4 Rendering and audio scale

- local particles, pollen, insects and sap luminescence;
- root movement at carefully selected hero sites;
- spatialised low-frequency sound and distant vocal or percussive motifs;
- water colour, plant density and fog responses around root zones;
- a restrained visual language that avoids making every Hist tree identical.

### 20.5 Data model

```ts
interface HistNodeBlueprint {
  id: HistNodeId;
  ageClass: "sapling" | "mature" | "elder" | "damaged" | "severed";
  tribeIds: TribeId[];
  rootInfluence: Polygon;
  groundwaterInfluence: FieldRef;
  dreamInfluence: FieldRef;
  memoryThreads: MemoryThreadId[];
  eggPools: WaterFeatureId[];
  ritualSpaces: PlaceId[];
  rootTransitLinks: HistNodeId[];
  accessRules: AccessRule[];
  sourceIds: SourceId[];
}
```

## 21. Duskfall and the contrast between monumentality and change

Murkmire's pre-Duskfall history supports a layer of monumental Xanmeer construction followed by cultures that place greater emphasis on change, adaptation and the living world. This gives the world two complementary Argonian architectural grammars:

- ancient, geometric, monumental and durable Xanmeer complexes;
- current settlements that flex, move, decay, regrow and adapt with water and roots.

The authorised Xanmeer kit can become the foundation of an ancient-dungeon and ruin compiler. Current settlements should have their own asset grammar and causal plans.

## 22. Distinct tribes and cultures

Murkmire material includes strongly differentiated groups such as the Bright-Throats, Dead-Water/Naga-Kur and Veeskhleel/Ghost People.[^L8] The world generator therefore needs tribe-specific data:

```ts
interface CultureProfile {
  id: CultureId;
  settlementGrammar: SettlementGrammarId;
  architectureTags: AssetTag[];
  waterPractices: WaterPractice[];
  HistPractices: HistPractice[];
  economy: EconomyProfile;
  combatDoctrine: CombatDoctrineId;
  burialPractices: PracticeId[];
  materialCulture: AssetTag[];
  socialSpaces: RoomProgramId[];
  routePreferences: RoutePreference[];
  tabooRules: TabooRule[];
  demographicRules: DemographicRule[];
}
```

“Argonian settlement” should never identify one universal kit.

## 23. Vanished peoples and archaeological depth

Black Marsh has histories involving Kothringi, Lilmothiit, Barsaebic Ayleids, Nedic groups and other peoples described in lore sources. The Knahaten Flu is a major demographic and historical rupture.[^L9]

This supports:

- Lilmothiit foundations beneath later Lilmoth;
- Kothringi camps, metalwork, graves and plague sites;
- Barsaebic Ayleid ruins in western and northern zones;
- Nedic fortifications and altered settlements;
- Imperial reuse of older sites;
- Argonian reclamation or ritual restriction;
- plague-era abandoned routes and quarantines;
- material culture surviving in current trade, myths or conflict.

Historical layers must be era-aware and sourced. Extinct groups should appear through archaeology and memory in eras after their disappearance.

## 24. Pirates, smugglers and hidden river war

The Red Bramman tradition describes pirate use of Black Marsh's uncharted rivers and mangrove coast.[^L10] The river network supports:

- hidden anchorages;
- movable caches;
- channels navigable only at certain tides;
- lookout trees and smoke signals;
- false waterways and dead ends;
- boat ambushes;
- submerged chains, stakes and wrecks;
- pirate settlements connected to coastal markets;
- naval pursuit spaces.

This can make boat travel an encounter system and exploration mode.

## 25. Fire in a wetland

Blackwater War material supports military history around Gideon and the southern/western marsh.[^L11] Peat, dry-season vegetation, oil, alchemy and war can create fire-scarred wetland landscapes. Exact “Great Burn” claims should be added only after the corresponding source text is stored in the lore database.

Useful generated states include:

- burned peat depressions;
- dead-root zones;
- smoke and underground heat;
- military earthworks;
- abandoned camps and supply routes;
- regrowth stages;
- fire-adapted or displaced creatures.

## 26. Disease, poison and insects as regional systems

Black Marsh lore repeatedly associates the province with diseases, insects, venom and outsider vulnerability. These should be local ecological systems with readable causes:

- standing-water and insect fields;
- seasonal hatching;
- disease reservoirs;
- potable-water quality;
- plant toxin distributions;
- protective smoke, salves, clothing and alchemy;
- Argonian resistance profiles;
- settlement siting around clean water and prevailing wind;
- abandoned outsider sites where disease control failed.

The game should provide preparation and counterplay. Hazard intensity remains fixed by place and season. An ESO travel text specifically advises protective clothing, fleshfly repellent, treatments for blood rot, the droops and swamp fever, avoidance of insect and giant-snake breeding seasons, caution near deep water and burrows, and travel with a local guide.[^L13] Those details support seasonal hazard calendars, guide services, settlement supply differences and visibly prepared local travellers.

## 27. Deep-marsh biological strangeness

Lore-compatible creature and environmental families include wamasu, voriplasm/Wuju-Ka, hackwings, giant reptiles, aquatic predators, insects and unusual plant life. The deep marsh can use ecological rules that produce fear through behaviour:

- large predators whose territories alter safe routes;
- organisms that imitate ground or water surfaces;
- ambushes triggered by vibration or splashing;
- electrical hazards around wamasu territories;
- leech and parasite zones;
- toxic blooms;
- moving root or vegetation barriers;
- creatures that travel between water, trees and land;
- night-specific calls and hunting behaviour;
- carcasses and environmental evidence before direct contact.

Creature placement follows habitat, prey, nesting, migration and disturbance.

Swamp jellies offer an unusually useful lore-grounded ecological and economic system. ESO material describes varied breeds that float using gas bladders, eat very large numbers of insects, can be herded or kept as companions, need humid conditions, regenerate damaged tissue, and include rare poisonous deepmire varieties.[^L14] They can therefore appear as village livestock, biological insect control, travel companions, food, alchemical material, trade goods and danger signals. A settlement with jellies should have grazing circuits and low local insect density; a diseased or abandoned settlement may show collapsed jelly husbandry.

---

# Part IV — Causal world authoring

## 28. Every location requires a backstory that changes geometry

A location record should contain more than flavour text.

```ts
interface LocationCausalModel {
  id: LocationId;
  originalPurpose: PurposeId;
  foundingCause: CauseStatement[];
  siteAdvantages: SiteAdvantage[];
  history: HistoricalEventId[];
  currentOccupants: OccupantGroup[];
  occupantMotivations: Motivation[];
  currentPressures: Pressure[];
  ecology: EcologyRelation[];
  hydrology: HydrologyRelation[];
  politics: PoliticalRelation[];
  economy: EconomicRelation[];
  culturalMeaning: CulturalMeaning[];
  regionalRole: RegionalRoleId;
  spatialConsequences: SpatialRule[];
  encounterConsequences: EncounterRule[];
  lootConsequences: LootRule[];
  sourceIds: SourceId[];
  confidence: SourceConfidence;
}
```

The compiler reads `spatialConsequences`, `encounterConsequences` and `lootConsequences`. The prose remains available to agents and narrative systems.

## 29. Example causal derivations

### 29.1 Bandit camp on an isolated trade route

**Cause:** A natural levee carries the only dependable dry route between a river landing and a frontier estate. Dense reeds hide a narrow bend.

**Derived layout:** concealed lookout, road choke point, boat escape, raised sleeping area, stolen-goods cache above flood level.

**Derived NPCs:** scouts, archers, boat handler, fence or corrupt guide.

**Derived loot:** trade goods from current route traffic, maps, toll records, repair tools, limited local food.

**Derived encounters:** ambush from both banks, retreat to boats, patrols scouting traffic.

### 29.2 Drowned Imperial customs post

**Cause:** An Imperial road and canal once controlled port traffic. Subsidence and a changed channel made the post unusable.

**Derived layout:** upper floor remains dry, lower offices flooded, collapsed quay, submerged records room, boat-accessible roof.

**Derived occupants:** scavengers, smugglers or aquatic creatures.

**Derived loot:** customs seals, old manifests, contraband cache, fixed administrative artefact.

### 29.3 Hist village

**Cause:** A mature Hist grows on a stable root mound beside clean spring-fed water and a navigable tributary.

**Derived layout:** sacred root zone, egg pools upstream of waste, market and docks downstream, raised homes along roots, visitor landing separated from ritual approach.

**Derived NPCs:** tribe members by role, sap-speaker, fishers, healers, guards, visiting traders according to access rules.

### 29.4 Underwater smuggler hideout

**Cause:** A riverbank cave has an air-filled chamber behind a submerged siphon, close to a port and outside patrol sight lines.

**Derived layout:** underwater entrance, concealed surface ventilation, mooring shelf, dry storage, emergency root exit.

**Derived content:** waterproofed goods, diving equipment, stolen port records, swimmers and boat crews.

### 29.5 Xanmeer ruin

**Cause:** A pre-Duskfall ritual and water-management complex occupied a stable ridge before the river migrated.

**Derived layout:** monumental upper structure, flooded lower hydraulics, later tribal ritual use, collapsed Imperial excavation camp, underwater secondary entrance.

**Derived encounters:** current occupants and ancient defences occupy different layers.

## 30. Agent-authored semantic planning

Important locations should use a build-time agent workflow. Interactive procedural street research and Mapgen4 provide useful precedents for separating authored control fields from deterministic terrain, drainage and network generation.[^G3][^G4]

The agent receives:

- contour and slope maps;
- flood frequency and current depth;
- river and channel geometry;
- soil stability;
- route graph;
- boat graph;
- climbability field;
- viewsheds and landmark visibility;
- cultural and faction territories;
- nearby locations;
- fixed lore constraints;
- asset-kit catalogue;
- required quests and encounter spaces;
- performance budget.

The agent produces a declarative plan:

```ts
interface SettlementBlueprint {
  id: SettlementId;
  causalModel: LocationCausalModel;
  boundary: Polygon;
  districts: DistrictBlueprint[];
  routes: RouteSpline[];
  canals: WaterSpline[];
  boardwalks: RouteSpline[];
  parcels: ParcelBlueprint[];
  landmarks: LandmarkBlueprint[];
  docks: DockBlueprint[];
  combatSpaces: CombatSpaceBlueprint[];
  questSockets: QuestSocket[];
  interiorPrograms: InteriorProgram[];
  revealSequences: RevealSequence[];
  assetConstraints: AssetConstraint[];
}
```

The deterministic compiler handles terrain grading, foundations, kit assembly, collision, portals, clutter, vegetation, navigation data, LODs and runtime manifests.

## 31. The agent review loop

1. Load source layers and constraints.
2. Produce or update the semantic blueprint.
3. Compile the affected world area.
4. Run measurement probes.
5. Generate orthographic maps, diagnostic renders and player-eye captures.
6. Let the agent read JSON/HTML metrics and tagged failures.
7. Let the user visually inspect selected captures or explore the build.
8. Patch the blueprint or compiler.
9. Recompile deterministically.

Every generated object retains:

```ts
interface GenerationProvenance {
  sourceBlueprintId: string;
  generatorId: string;
  generatorVersion: string;
  seed: string;
  ruleId: string;
  assetId: string;
  sourceDataHashes: string[];
}
```

## 32. Location-orphan validation

The world validator should reject or flag locations with:

- no causal model;
- no site advantage;
- current occupants without motivation;
- loot unrelated to occupants or history;
- a settlement without water, food, route or ritual support;
- an entrance disconnected from interior purpose;
- architecture incompatible with culture or era;
- a dangerous encounter without habitat, faction or narrative cause;
- a road with no connected economic or political function.

Generated density becomes meaningful density.

---

# Part V — Province-scale hydrology

## 33. Hydrology is the primary world generator

For Argonia, terrain and water must be solved together. The macro prior should be imported from the [All Tamriel Heightmap](https://www.nexusmods.com/skyrimspecialedition/mods/573) and/or the dedicated 30.9 MB [Argonia worldspace in Tamriel Worldspaces](https://www.nexusmods.com/skyrimspecialedition/mods/118678?tab=files).[^G1][^G2] The compiler then conditions lowlands, preserves intentional basins, resolves flow and creates the channels that drive ecology and settlement.

Province-wide fields should include:

| Field | Consumers |
|---|---|
| Elevation | terrain, visibility, water, settlement foundations |
| Slope and curvature | routes, climbing, erosion, buildings |
| Flow direction | rivers, water VFX, boats, debris |
| Flow accumulation | river hierarchy, wetlands, bridges |
| Groundwater/wetness | mud, vegetation, building stability |
| Flood frequency | settlement layout, road survival, dynamic water |
| Tidal influence | estuaries, salinity, mudflats, boat access |
| Salinity | vegetation, creatures, water appearance |
| Soil/peat stability | foundations, roads, ruins, fire |
| Sediment/turbidity | water shading and ecology |
| Water depth | swimming, boats, wading, underwater access |
| Current velocity | movement, particles, boats, AI |
| Canopy density | visibility, ecology, performance |
| Navigability | boat graph and transport services |

## 34. Province hydrology pipeline

1. Georeference the All Tamriel / Argonia heightmap source and coast.
2. Register canonical settlement and water anchors with tolerances.
3. Remove sampling artefacts while retaining meaningful basins.
4. Define sea level, tidal zones and large lakes.
5. Resolve drainage and flow accumulation.
6. Insert lore-required or map-required river constraints.
7. Generate river hierarchy, distributaries and abandoned channels.
8. Generate floodplains, peat basins, wetlands and groundwater fields.
9. Model estuarine salinity and tidal reach.
10. Derive soil stability and sediment transport.
11. Derive ecological regions.
12. Refine channels at watershed and local scales.
13. Generate runtime water meshes, depth fields and flow maps.
14. Validate every channel connection from headwater to receiving basin.

The full province receives a coarse hydrological solution immediately. Detailed meshes and local refinements expand by watershed.

### 33.1 Climate, atmosphere and light

Climate is a first-class macro layer alongside hydrology, because Black Marsh's
identity is as much air as water: heat, humidity, mist, rot and gloom.

- **Macro fields (Phase 3/4 data):** each ecological region class carries a
  climate profile — humidity, mist propensity, rain regime, characteristic
  visibility. These drive fog density, ambient palettes, insect/disease
  intensity and encounter sight-lines long before detailed rendering exists.
- **Weather system (with Phase 8 rendering):** province-scale weather states
  (monsoonal downpour, sea squall, dry-season haze, ground mist, storm) with
  region-weighted frequencies; weather modifies wetness, flood state, grip,
  visibility and AI perception — world state, never player-scaled.
- **Time of day and light:** full day/night cycle; canopy classes darken and
  diffuse daylight (jungle/rootland interiors read as permanent dusk);
  bioluminescence (torchbugs, fungi, sap) is the deep-marsh night palette,
  per the Murkmire travel accounts.
- **"Steaminess":** low ground mist, heat shimmer over water, drifting spore
  and pollen particles are biome-driven atmospheric VFX tied to the climate
  profile, concentrated in jungle, rootland and stagnant-water classes.
- Renderer implementation (volumetric fog tiers, sky model, wet-surface
  response) lands with the Phase 8 water/atmosphere stack; the semantic
  climate data must exist from the province passes so all later systems
  consume one source.

## 35. Causal landscape example

A major river creates sediment deposition. Deposition creates natural levees. Levees supply relatively stable ground. A path follows the levee. A village grows where a tributary, levee and fishery meet. Its dock occupies a navigable bank. Reeds occupy slower backwater. An older ruin in the former floodplain becomes partially submerged. Smugglers use an abandoned channel to bypass the landing.

One hydrological relationship explains terrain, routes, settlement, ecology, ruins and encounters.

## 36. Flood states as world mechanics

A flood basin can expose a runtime contract:

```ts
interface FloodBasin {
  id: FloodBasinId;
  meanLevel: number;
  currentLevel: number;
  seasonalAmplitude: number;
  tidalAmplitude: number;
  surgeProfile: SurgeProfileId;
  inundationMask: FieldRef;
  connectedWaterBodies: WaterBodyId[];
}
```

Changing levels can alter:

- shallow crossings;
- mudflats and sandbars;
- submerged ruin entrances;
- boardwalk access;
- boat channels;
- predator territories;
- vegetation state;
- caches and salvage;
- interior water depth;
- route risk.

Dynamic changes should be bounded, readable and reproducible from world state.

## 37. Routes follow hydrology

The route solver evaluates:

- slope;
- dry-ground probability;
- flood frequency;
- soil stability;
- bridge span;
- boardwalk cost;
- current and depth;
- boat capability;
- cultural route preferences;
- existing infrastructure;
- faction control;
- danger;
- desired journey experience.

An Imperial route may choose causeways, drainage and bridges. A local route may use tributaries, roots, seasonal shallows and canoes. Their geometric differences communicate culture.

---

# Part VI — Water, swimming, boats and underwater exploration

## 38. One authoritative water model

The project should expose one gameplay-facing water query:

```ts
interface WaterSample {
  waterBodyId: WaterBodyId | null;
  surfaceHeight: number;
  surfaceNormal: Vec3;
  flowVelocity: Vec3;
  depth: number;
  immersion: number;
  turbidity: number;
  salinity: number;
  temperature: number;
  hazardIds: HazardId[];
}

interface WorldWaterQuery {
  sample(position: Vec3, time: number): WaterSample;
  emitInteraction(event: WaterInteractionEvent): void;
}
```

Rapier and gameplay systems use this CPU-accessible query. The renderer consumes the same hydrology, wave and interaction data.

The advanced water repositories already contain valuable buoyancy, wake, interaction and underwater techniques. Those algorithms can be adapted while Rapier remains the authoritative rigid-body system. This prevents duplicate object simulation and GPU-readback coupling.

## 39. Rendering stack

### 39.1 WaterThreeJS base techniques

WaterThreeJS is MIT-licensed, WebGL2-based Three.js code with analytic Gerstner waves, screen-space reflections, depth-based refraction and absorption, shoreline/contact foam, underwater fog, god rays, caustics and CPU-mirrored wave sampling for buoyancy.[^W1]

Useful components:

- analytic surface function and normal;
- SSR with sky fallback;
- Beer–Lambert colour and underwater absorption;
- Fresnel/GGX surface shading;
- detail-normal cascades;
- contact foam and wakes;
- immersion detection;
- CPU wave sampling and buoyancy concepts;
- underwater post-processing.

### 39.2 SeedOcean reference architecture

SeedOcean is MIT-licensed and provides river, lake, pool, coast and open-ocean modes, a `FlowMap` contract, persistent foam, wake textures, buoyancy currents, underwater effects, quality modes and a WebGL2 fallback.[^W2]

Useful components:

- directional river flow and spline/ribbon approach;
- shared flow-map data for surface movement and shore foam;
- bounded-water abstractions;
- wake and buoyancy interfaces;
- headless design API ideas;
- quality-tier structure.

Its WebGPU-first path does not define the game baseline. The WebGL2 path and data contracts remain directly relevant.

### 39.3 Local interactive simulation

`jeantimex/threejs-water` ports Evan Wallace's bounded water simulation to Three.js. It uses a GPU wave equation, caustics, reflections/refractions, buoyancy and object displacement.[^W3]

Use pooled local patches for:

- hero temple pools;
- flooded dungeon chambers;
- close-range splash interaction;
- falling bodies or objects;
- ritual pools;
- highly visible small water surfaces.

### 39.4 Open-water high tier

ABYSSAL provides a WebGL2 spectral FFT ocean with JONSWAP/TMA spectra, multiple cascades, persistent foam, caustics, underwater rendering and buoyancy.[^W4]

Use it as a high-quality reference for Topal Bay and exposed coasts. Mobile and mid-tier settings should use fewer cascades or analytic waves.

## 40. Water-body semantics

```ts
interface WaterBody {
  id: WaterBodyId;
  kind: "river" | "creek" | "marsh" | "lake" | "estuary" | "coast";
  surfaceBase: number;
  depthField: FieldRef;
  flowField: FieldRef;
  discharge: number;
  turbidity: number;
  sedimentColour: ColourId;
  salinity: number;
  waveExposure: number;
  floodBasinId?: FloodBasinId;
  navigability: NavigabilityProfile;
  ecologyId: EcologyProfileId;
  rendererProfile: WaterRendererProfileId;
}
```

Visual profiles:

| Water class | Surface and underwater character |
|---|---|
| Fast river | Directional advection, coherent downstream ripples, bank/rock foam, suspended sediment |
| Deep swamp pool | Low bulk velocity, small ripples, dark absorption, debris, algae and insects |
| Shallow marsh | Visible mud or vegetation bed, tiny wind waves, wakes from wading and creatures |
| Estuary | Current plus tide, broader wind waves, brackish colour, boat wakes and mudflats |
| Coast/Topal Bay | Long swell, local chop, foam, horizon handling, full underwater optics |
| Hist pool | Site-specific clarity, particles, sap or ritual visual effects driven by lore state |

## 41. Shared render-pass architecture

Large numbers of separate reflector/refractor objects would be expensive. The runtime should capture scene colour and depth through shared passes, then render all visible water using shared buffers and per-water-body data.

Recommended frame structure:

1. opaque scene colour/depth;
2. optional reduced-resolution reflection data or SSR source;
3. all visible water surfaces with shared shader variants;
4. underwater composite when immersed;
5. particles, foam decals, splashes and post-processing.

Rivers use ribbon meshes. Marshes and lakes use connected polygon surfaces. Coasts use camera-centred meshes or clipmaps. Local ripple patches allocate from a small pool near the player.

## 42. Water quality tiers

| Feature | High | Medium | Mobile/performance |
|---|---|---|---|
| Reflections | half-resolution SSR with more steps | reduced-step SSR | short SSR plus environment fallback |
| Refraction | depth-aware scene refraction | simplified depth refraction | absorption and shallow-bed approximation |
| Waves | spectral or dense analytic field | analytic multi-band waves | compact Gerstner field |
| River detail | multi-scale flow normals and foam | flow normals and bank foam | one flow layer and sparse foam |
| Local ripples | several pooled patches | one or two patches | nearest hero surface |
| Caustics | dynamic projected pattern | reduced resolution | selected hero sites |
| Underwater | volumetrics, particles, Snell window | reduced steps | fog, absorption and light shafts |
| Foam | persistent/contact/shore | simplified contact/shore | bank and wake masks |

The semantic water model remains identical across tiers.

## 43. Swimming modes and player capability

The current `PlayerMovementController` handles grounded movement, position, velocity, facing and jumping. Argonia needs a broader locomotion contract while preserving ecctrl as the current grounded adapter.[^R4]

```ts
type LocomotionMode =
  | "grounded"
  | "airborne"
  | "surfaceSwim"
  | "submergedSwim"
  | "climb"
  | "boat"
  | "rootwormTransit";

interface AvatarLocomotion {
  mode(): LocomotionMode;
  position(out: Vec3): Vec3;
  velocity(out: Vec3): Vec3;
  setIntent(intent: LocomotionIntent): void;
  setFacing(direction: Vec3, locked: boolean): void;
  teleport(target: SpawnTarget): void;
  capabilities(): TraversalCapabilityProfile;
}
```

Capability fields include:

- surface and submerged swim speed;
- acceleration and turning;
- breath capacity;
- water-current resistance;
- dive depth tolerance;
- stamina cost;
- equipment drag and buoyancy;
- climb stamina;
- climb speed;
- grip and material modifiers;
- jump and gap capability;
- racial and spell effects.

Argonian racial physiology can set underwater breathing independently of other swimming statistics. Spells can modify breathing, speed, current resistance and visibility.

## 44. Underwater is a complete exploration layer

Underwater content should have its own graph:

- surface access nodes;
- air pockets;
- submerged entrances;
- currents;
- vertical shafts;
- hazards;
- creatures;
- loot and containers;
- interior portals;
- return routes;
- visibility and light fields.

POI families include:

- submerged Xanmeer waterworks;
- flooded cave systems;
- riverbed smuggler hatches;
- sunken Imperial villas and customs posts;
- shipwrecks and wreck fields;
- wells and cisterns connected to larger interiors;
- root tunnels;
- drowned Lilmothiit or Kothringi remains;
- ritual pools;
- predator nests;
- air-filled caves behind siphons;
- collapsed prison drains;
- undercut banks and hidden caches.

Access metadata can distinguish:

- immediately Argonian-accessible;
- accessible to other races with breath skill or preparation;
- spell- or equipment-gated;
- high-current or deep-water expert routes;
- quest-state or Hist-state routes.

## 45. Boats as primary world vehicles

Black Marsh supports boats as the main player vehicle family. Horses can appear in selected firm-ground fringe zones where culture, routes and assets support them.

Boat classes:

| Class | Use |
|---|---|
| Dugout/canoe | narrow channels, low draft, easy portage, local travel |
| Skiff/rowboat | fishing, ferrying, cargo and exploration |
| Raft/platform | village links, cargo, improvised transport |
| River trader | storage, passengers, longer routes |
| Sailboat | estuary and coast travel |
| Ritual/Hist craft | culturally specific transport and quests |

Gameplay components:

- multi-point Rapier buoyancy;
- water-current sampling;
- rotational and linear drag;
- shallow grounding;
- hull collision and damage;
- boarding and disembarking;
- docking and mooring;
- cargo/inventory integration;
- passenger sockets;
- wake and foam events;
- rain and flooding interaction;
- repair and ownership;
- AI boats and ferries;
- boat combat hooks.

Boat navigation uses depth, channel width, bend radius, current, tide, bridge clearance, submerged obstacles, docking space and vessel capability.

The Phase 4 macro graphs (roads, boat lanes, rootways) connect only the anchor
cities and are deliberately sparse. As settlements populate (Phases 11/15) the
transport network **densifies**: minor roads, jungle paths, boardwalks, levee
tracks, ferry hops, canoe channels and additional fast-travel services grow
around every placed settlement, always as least-cost responses to the same
terrain fields (owner direction, 2026-08-23). Where a macro boat lane crosses
land (portage hops, drawn amber in the studio), watershed refinement must
resolve the hop explicitly: carve a navigable channel, or make it a real
portage/boardwalk feature.

## 46. Climbing and world generation

Large logical surfaces should be climbable by default. The asset registry and generated terrain need climb semantics:

```ts
interface ClimbSurfaceProfile {
  material: PhysicalMaterialId;
  climbable: boolean;
  grip: number;
  wetGripMultiplier: number;
  requiredAbility?: AbilityId;
  exclusionReason?: string;
}
```

The world compiler should generate and validate:

- continuous climb corridors;
- ledges and rest points;
- transitions between water, ground and climb;
- tree branch routes;
- building roof access;
- cliff top-out clearance;
- camera clearance;
- stamina-appropriate route lengths;
- intentional blockers with explicit metadata;
- alternate routes for low-capability characters.

Rain, wetness, equipment load, skill and spells can modify grip and stamina.

---

# Part VII — Dungeons, interiors and encounters

## 47. Argonia dungeon families

| Family | Spatial grammar | Common water/traversal features |
|---|---|---|
| Xanmeer complex | monumental axes, geometric plazas, ritual rooms, hydraulic lower levels, collapse layers | flooded lower strata, drains, vertical chambers, hidden water entrance |
| Root cavern | organic branching, shafts, tight roots opening into large chambers | submerged roots, climb routes, air pockets, rootworm links |
| Flooded natural cave | hydrology-shaped passages, sumps, sediment chambers | swim loops, siphons, changing water levels |
| Smuggler or pirate den | dock, storage, lookout, escape route, defended choke | concealed channel, boat escape, underwater cache |
| Kothringi/Lilmothiit site | historical settlement or ritual layer altered by plague and swamp | submerged streets, old wells, scavenged structures |
| Barsaebic Ayleid/Nedic ruin | foreign geometric architecture adapted by later occupants | water intrusion, collapsed drains, reused chambers |
| Imperial fort/prison/estate | rectilinear planned construction with subsidence | flooded cells, broken drainage, canal access |
| Abandoned plantation | surface parcels, labour spaces, stores, manor and cellars | irrigation channels, flooded cellar, escape tunnel |
| Hist sanctum | root-centred sacred geometry and restricted approach | ritual pools, root climbs, dream spaces |
| Sinkhole ruin | surface collapse exposing buried structure | underwater shaft, vertical return loop |

Each family has major and minor variants. Major sites use agent-authored graphs and reveal sequences.

## 48. Interiors should be planned with exteriors

Each exterior location receives an `InteriorProgram` at placement time:

```ts
interface InteriorProgram {
  id: InteriorId;
  exteriorLocationId: LocationId;
  purpose: PurposeId;
  historicalStates: HistoricalState[];
  currentOccupants: OccupantGroup[];
  roomFunctions: RoomFunction[];
  circulationGraph: GraphRef;
  entrances: EntranceBlueprint[];
  underwaterConnections: WaterConnection[];
  verticalRelationship: VerticalRelationship;
  ownership: OwnershipProfile;
  lootLogic: LootRule[];
  encounterLogic: EncounterRule[];
  kitConstraints: AssetConstraint[];
}
```

Exterior generation creates foundations, doors, cave mouths, wells, drains and underwater portals consistent with the programme. Interior geometry can be compiled in a later pass after the relevant kits and gameplay have matured.

The runtime supports:

- streamed interior cells for large buildings and dungeons;
- seamless small huts and open structures;
- seamless cave mouths with deeper streamed cells;
- portals that preserve water state, time, ownership and AI state.

## 49. Combat spaces as semantic geometry

Dense roots, trees and water can create poor combat conditions accidentally. The blueprint format should make combat spaces explicit:

```ts
interface CombatSpaceBlueprint {
  boundary: Polygon;
  intendedScale: "duel" | "smallGroup" | "largeGroup" | "boss";
  footing: FootingProfile;
  waterDepthRange: Range;
  rollClearance: number;
  weaponSweepClearance: number;
  cameraClearance: number;
  lockOnVisibility: VisibilityRequirement;
  criticalAnimationClearance: number;
  retreatRoutes: RouteId[];
  ambushRoutes: RouteId[];
  climbConnections: ClimbRouteId[];
}
```

Tight spaces remain available when deliberately specified.

## 50. Encounter placement follows ecology and motive

An encounter socket needs:

- habitat or faction cause;
- schedule or trigger;
- approach routes;
- retreat and pursuit boundaries;
- relationship to water and climbing;
- nearby civilian or trade activity;
- evidence and foreshadowing;
- fixed enemy group definition;
- world-state variants.

Creatures occupy territories. Bandits exploit routes. Soldiers defend assets. Ritual groups use culturally meaningful spaces.

---

# Part VIII — Compatibility with combat, physics, character and items

## 51. Preserve the current portability boundary

The sandbox already separates a framework-free `src/game/` core from its React Three Fiber view layer and identifies combat, animation, physics, character and input as portable systems.[^R1][^R2][^R3]

The current movement boundary places ecctrl behind `PlayerMovementController` and `EcctrlAdapter`.[^R4] The rendered character and combat hurtbox already follow a separate actor contract.[^R5] This remains the correct principle. Ecctrl stays in use while it satisfies requirements. Swimming, climbing and boats can add adapters or mode controllers behind broader contracts.

## 52. Current sandbox values are calibration data

The current capsule dimensions, gravity, jump tuning and movement speeds are active tuning values. Character statistics, equipment burden and effects will alter movement. World validation should use named capability profiles:

```ts
type CapabilityProfileId =
  | "minimumPlayable"
  | "baselineHuman"
  | "baselineArgonian"
  | "trainedSwimmer"
  | "advancedClimber"
  | "highBurden"
  | "boatSmall"
  | "boatCargo";
```

Profiles are generated from gameplay data at build time. The world compiler does not hard-code today's walk or sprint speed.[^R6]

## 53. Extract scene orchestration

`CombatScene.tsx` currently carries substantial scene orchestration and some direct ecctrl access. Migration should extract:

- actor spawning;
- environment queries;
- target registration;
- camera and lock-on services;
- encounter ownership;
- hitbox registration;
- audiovisual event routing;
- reset and teleport;
- debug controls.

The sandbox and integrated game then compose the same packages through different scene adapters.

## 54. Physical material semantics

Every collider needs a `PhysicalMaterialId`:

```ts
interface PhysicalMaterialProfile {
  id: PhysicalMaterialId;
  friction: number;
  restitution: number;
  climbGrip: number;
  wetGripMultiplier: number;
  footstepSet: AudioSetId;
  impactSet: AudioSetId;
  projectileResponse: ProjectileResponse;
  mudResponse?: MudResponse;
  fireResponse?: FireResponse;
  wetnessResponse?: WetnessResponse;
}
```

Required materials include soil, peat, mud, wood, bark, bone, stone, metal, ceramic, foliage, water, flesh, glass/crystal and fungus.

## 55. Arrows and recoverable projectiles

```ts
interface ProjectileResponse {
  canPenetrate: boolean;
  penetrationDepth: Range;
  stickProbability: number;
  ricochetProbability: number;
  breakProbability: number;
  waterDrag: number;
  decalId?: DecalId;
  recoverable: boolean;
}
```

Expected examples:

| Surface | Response |
|---|---|
| Wood/bark | penetration and visible sticking; usually recoverable |
| Soil/peat | shallow sticking; contamination/wetness possible |
| Mud | deeper low-energy embedding; recoverable if found |
| Stone | ricochet, shaft damage or breakage |
| Metal | sharper ricochet and high break risk |
| Foliage | pass-through or small deflection according to collider type |
| Water | splash, velocity loss, underwater trajectory, floating/sinking according to item data |

A stopped arrow becomes a world item entity with item ID, condition, ownership, transform and recovery state. Embedded arrows attach to the hit object's transform until detached.

The same material system supports footsteps, splashes, climbing, weapon impacts, AI sound, mud, wetness, fire and debris.

## 56. Inventory and generated-world sockets

Generated locations should place semantic sockets:

```ts
type WorldItemSocket =
  | ContainerSocket
  | HarvestSocket
  | CorpseLootSocket
  | MerchantSocket
  | LooseItemSocket
  | QuestItemSocket
  | BoatStorageSocket;
```

Sockets reference item and loot IDs from the shared inventory packages. The world generator never creates a parallel item system.

## 57. NPC and creature swimming

NPC and creature capability data should include:

- surface swim;
- submerged swim;
- breath model;
- preferred depth;
- current resistance;
- water-to-land transitions;
- boat use;
- climbing or tree use;
- aquatic combat actions;
- nav-volume classes.

Navigation generation needs ground meshes, swim volumes, climb links, boat channels and transition links.

---

# Part IX — Repository, package and deployment architecture

## 58. Make the new world repository the canonical real game

The lowest-risk structure is a new canonical `elder-souls-argonia` monorepo that is the real game from its first commit. The world is its first major subsystem. The combat sandbox remains available as a dedicated application inside the same repository.

This gives one dependency graph, one contract test suite, one package lock, one source of gameplay types and one deployment pipeline. The world studio, combat sandbox and integrated game can evolve independently at application level while sharing packages directly.

The existing `ecctrl-souls-combat` repository can remain as an archived reference or temporary mirror after migration. New portable development should occur in the canonical packages.

### Concrete repository and VM working layout

The canonical repository already exists as **`jtattersall09403/elder-souls-argonia`** and currently contains only a brief README.[^R0] The expected development arrangement is:

```text
elder-souls-dev/
├─ elder-souls-argonia/          # canonical real-game repo; launch Claude here
├─ <combat-sandbox-checkout>/    # existing ecctrl-souls-combat working checkout
└─ <asset-pipeline-checkout>/    # existing local-Git asset-pipeline checkout
```

The exact sibling directory names must be **discovered from the VM**, not assumed from documentation. The combat checkout may have a local folder name that differs from its GitHub repository name (`jtattersall09403/ecctrl-souls-combat`), so identify it by its Git remote rather than by folder spelling. Before any migration, the first agent should inspect `..`, run `git status`, `git remote -v`, `git branch --show-current` and `git rev-parse HEAD` in each source checkout, and identify any local-only or uncommitted work. The local checkout is authoritative for migration if it is ahead of the remote. No source checkout should be rewritten, cleaned or reset as part of discovery.

The sibling repositories are migration inputs and temporary comparison/test targets. After migration:

- `elder-souls-argonia` is the source of truth for production code and world data;
- `apps/combat-sandbox` remains an independently runnable proving ground **inside** the canonical repo;
- `tooling/asset-pipeline` contains the imported pipeline code/history;
- proprietary Skyrim/mod source data remains external in the local asset vault;
- CI, GitHub Pages and clean clones operate without sibling repositories;
- no package in the canonical repo may import from a `../<sibling-repo>` path.

The existing GitHub README calls the project a "fan-made standalone Skyrim mod".[^R0] That framing is broadly correct for the project's identity: **a standalone total-conversion-style Skyrim fan project/mod set in Argonia**, implemented with Three.js/React Three Fiber/Rapier and using Skyrim- and mod-derived assets. The README may be expanded to explain the browser/runtime architecture, but it should not reframe the project as a conversion into an unrelated new game.

## 59. Proposed repository layout

The monorepo uses plain **npm workspaces** — no additional monorepo tooling
(pnpm, turborepo, nx) until a measured need appears. Directories are created
when their phase needs them, not speculatively.

```text
elder-souls-argonia/
├─ apps/
│  ├─ game/                    # integrated deployed game
│  ├─ combat-sandbox/          # current combat/character proving ground
│  ├─ world-studio/            # map, spawning, exploration and diagnostics
│  ├─ water-lab/               # isolated water rendering/physics experiments
│  ├─ asset-lab/               # asset previews, sockets, collision and provenance
│  └─ benchmark/               # device and streaming benchmarks
│
├─ packages/
│  ├─ contracts/               # cross-system public interfaces and schema versions
│  ├─ core/                    # clocks, IDs, events, deterministic utilities
│  ├─ physics/                 # Rapier integration and material semantics
│  ├─ locomotion/              # ground/swim/climb/boat mode contracts and adapters
│  ├─ combat/                  # fighters, attacks, hit resolution, AI interfaces
│  ├─ character/               # actor, race, stats, equipment visual assembly
│  ├─ animation/               # semantic animation contracts and manifests
│  ├─ input/                   # desktop, touch and gamepad actions
│  ├─ inventory/               # containers, ownership, capacity and UI state
│  ├─ items/                   # item definitions, projectiles, equipment and loot
│  ├─ world-schema/            # authored source and runtime world schemas
│  ├─ world-source/            # source loaders, provenance and era resolution
│  ├─ world-compiler/          # pass graph and build orchestration
│  ├─ world-runtime/           # streaming, chunks, portals and environment queries
│  ├─ hydrology/               # basin/channel/flood/flow generation
│  ├─ water-runtime/           # rendering, buoyancy query and interaction VFX
│  ├─ navigation/              # foot, swim, climb and boat graphs
│  ├─ settlements/             # district, route, parcel and asset-kit compilers
│  ├─ dungeons/                # graph grammars, room programmes and interior compiler
│  ├─ ecology/                 # habitat, vegetation and creature-territory systems
│  ├─ assets/                  # runtime asset registry, kits, sockets and materials
│  ├─ quests/                  # quest/world-state interfaces
│  └─ validation/              # world probes, metrics and reports
│
├─ world/
│  ├─ sources/
│  │  ├─ canon/                # sourced lore facts and era data
│  │  ├─ maps/                 # georeferenced maps and anchor extractions
│  │  ├─ heightmaps/           # licensed macro terrain inputs
│  │  ├─ community/            # fan maps/demographics with confidence metadata
│  │  └─ source-registry/      # citations, source links, credits and hashes
│  ├─ blueprints/
│  │  ├─ province/
│  │  ├─ regions/
│  │  ├─ settlements/
│  │  ├─ locations/
│  │  ├─ interiors/
│  │  └─ dungeons/
│  ├─ rules/
│  │  ├─ cultures/
│  │  ├─ regions/
│  │  ├─ ecology/
│  │  ├─ routes/
│  │  └─ generation/
│  ├─ manifests/               # approved generated-bundle manifests
│  └─ generated/               # build cache; excluded from normal source commits
│
├─ tooling/
│  ├─ asset-pipeline/          # imported history/code from elder-scrolls-asset-pipeline
│  ├─ world-generation/       # offline compiler entry points and orchestration
│  ├─ world-cli/
│  ├─ capture/
│  ├─ probes/
│  ├─ build/
│  └─ migrations/
│
├─ assets/
│  ├─ registry/                # semantic asset catalogue + placement metadata
│  ├─ manifests/               # recipes, source hashes and credit references
│  └─ runtime/                 # game-ready outputs where versioning is useful
│
├─ docs/
│  ├─ architecture/
│  ├─ world-design/
│  ├─ lore/
│  ├─ assets/
│  ├─ validation/
│  └─ decisions/
│
└─ deploy/
   ├─ bundle-manifests/
   └─ pages/
```

## 60. Package rules

- Applications may import packages.
- Applications may not import other applications.
- Repository code may not import from sibling checkouts under `elder-souls-dev`; sibling repositories are migration/reference inputs only.
- World source packages may not import rendering packages.
- Runtime packages may not read raw source archives.
- Combat, inventory and character packages consume public environment contracts.
- World packages expose semantic environment and interaction APIs.
- Ecctrl-specific types remain inside the ecctrl adapter.
- Asset source filenames never appear in gameplay code.
- Generated bundles include schema and package compatibility versions.

These rules can be enforced through TypeScript project references, package export maps and lint dependency constraints.

## 61. Cross-system contracts

The `contracts` package should own small stable interfaces:

```ts
interface WorldRuntimeContract {
  streamAround(position: Vec3, radius: number): Promise<void>;
  queryEnvironment(position: Vec3): EnvironmentContact;
  queryWater(position: Vec3, time: number): WaterSample;
  querySurface(colliderId: ColliderId): PhysicalMaterialProfile;
  findSpawn(target: SpawnRequest): Promise<SpawnResult>;
  enterPortal(portalId: PortalId): Promise<WorldTransition>;
}

interface EnvironmentContact {
  groundMaterial?: PhysicalMaterialId;
  supportNormal?: Vec3;
  water?: WaterSample;
  mudDepth: number;
  climbSurface?: ClimbSurfaceProfile;
  biomeId: BiomeId;
  regionId: RegionId;
  hazardIds: HazardId[];
}
```

Other key contracts:

- `AvatarLocomotion`;
- `CombatActor`;
- `AnimationSemanticCommand`;
- `InventoryItem` and `Container`;
- `WorldInteraction`;
- `EncounterRegistration`;
- `WorldAudioEvent`;
- `QuestWorldState`.

## 62. Asset pipeline, local asset vault and history

The existing local-Git `elder-scrolls-asset-pipeline` should be **integrated into the canonical `elder-souls-argonia` monorepo as tooling**, because its outputs and metadata are part of the contracts used by characters, animation, physics, world generation and deployment. Source archives should remain outside the repo mainly for size, cleanliness and reproducibility.

Recommended split:

```text
elder-souls-argonia/
  tooling/asset-pipeline/      # Python/Blender/conversion code, tests, docs
  assets/registry/             # semantic IDs, dimensions, sockets, materials
  assets/manifests/            # recipes, source hashes and credit references
  assets/runtime/              # selected game-ready GLB/KTX2/audio outputs

LOCAL ASSET VAULT (outside Git)
  Skyrim archives/extractions
  mod archives/extractions
  Blender/intermediate caches
  transient conversion outputs
```

A local environment variable such as:

```bash
ELDER_SOULS_ASSET_ROOT=/path/to/elder-souls-assets
```

should point the pipeline at the vault. CI and clean checkouts must be able to build and test the game without assuming the large source archives are present; runtime assets needed for deployed builds should therefore be versioned where practical or supplied through a content-addressed build/artifact mechanism.

The import should preserve the existing asset-pipeline Git history where practical. A subtree/history-rewrite import is preferable to copying files into a fresh directory, because future agents may need to understand why conversion, skeleton, NIF/HKX/DDS, animation, socket or grounding decisions were made. After verification that the monorepo pipeline reproduces equivalent outputs, the old local repository can be archived as a historical source.

For this personal standalone total-conversion-style project, **all mod sources discussed in this document are treated as available for use**. Do not build a heavyweight permission/evidence system. Keep a simple credits/source list so the final project can credit the relevant mod authors and source projects.

A representative asset record can stay focused on reproducibility and gameplay semantics:

```yaml
id: architecture.argonian.river_hut.small.01
source:
  kind: mod
  package: example-mod
  source_page: https://...
  source_hash: ...
credits:
  - author-or-project-name
processing:
  collision: generated-or-authored
  lods: [0, 1, 2]
  materials: semantic
outputs:
  visual: architecture/argonian/river_hut_small_01.glb
  collision: architecture/argonian/river_hut_small_01.collision.glb
```

The semantic registry should eventually support, where applicable:

- physical dimensions and placement footprint;
- foundation and waterline tolerance;
- snap points and modular-kit connectors;
- door, window, container, NPC and interaction sockets;
- climbability surfaces/anchors;
- Rapier collision proxy and navigation blockers;
- material-region semantics such as wood, soil, stone, metal, flesh or vegetation;
- projectile responses (`embed`, `ricochet`, `penetrate`, `break`) used by arrows and later projectiles;
- weapon/character sockets and animation metadata;
- swimming/buoyancy or floating-object metadata where relevant;
- LOD/instancing/batching information;
- interior portal and exterior-door relationships;
- source archive hash/version and one or more credit/source references.

This matters directly for cross-system behaviour. A hut wall identified as `wood` can let a Rapier arrow collision resolve to `embed`, leave a collectible arrow world item attached at the contact transform, and later return that item to the shared inventory system. A stone Xanmeer surface can resolve to bounce/ricochet. The world generator only places the semantic asset; the physics/projectile/item systems consume its material metadata.

The same principle applies to character evolution. If climbing, swimming or equipment later requires new grip sockets, buoyancy samples, foot-contact data, weapon attachment points or animation metadata, the asset-pipeline code and `packages/character`/`packages/animation` contracts can change in the **same pull request** and be exercised by `apps/combat-sandbox`, `apps/world-studio` and `apps/game`.

The pipeline flow becomes:

```text
Skyrim sources + mod sources
              ↓ local vault
tooling/asset-pipeline
              ↓ recipes + validation + conversion
semantic asset registry + runtime outputs
              ↓
world compiler / character compiler / animation compiler
              ↓
apps/game + apps/world-studio + apps/combat-sandbox
```

This is the preferred long-term boundary: **one canonical code repository, external source-asset vault, reproducible generated runtime content**.

## 63. Compiled world bundles

Each world bundle should contain:

```text
bundle.json
terrain.glb or terrain tiles
collision.bin
water-meshes.glb
water-fields.ktx2/bin
static-batches.glb
vegetation-instances.bin
interactive-objects.json
portals.json
encounters.json
nav-ground.bin
nav-swim.bin
nav-climb.bin
nav-boat.bin
lighting/probe data
LOD variants
semantic metadata
source/generator hashes
```

A bundle manifest includes:

```ts
interface WorldBundleManifest {
  bundleId: string;
  worldSchemaVersion: string;
  contractsVersion: string;
  generatorVersions: Record<string, string>;
  sourceHashes: string[];
  assetManifestHash: string;
  bounds: Bounds3;
  dependencies: string[];
  qualityVariants: QualityVariant[];
  byteSizes: Record<string, number>;
}
```

## 64. Deployment

GitHub Actions should:

1. install and type-check packages;
2. run unit and contract tests;
3. validate asset manifests, source references and credits entries;
4. compile changed world areas or consume approved compiled bundles;
5. run hydrology, navigation, collision, combat-space and performance probes;
6. build `apps/game` and `apps/world-studio` deployment variants;
7. publish only runtime assets and approved bundles;
8. emit a build report with bundle hashes and teleport links.

The production browser never receives raw heightmaps, source archives, lore research files or compiler-only data unless a debug deployment intentionally includes them.

## 65. Compatibility discipline

Every package change that touches public contracts runs against:

- combat sandbox tests;
- world studio physical-character tests;
- integrated game tests;
- a fixed generated reference scene;
- migration tests for existing world bundles.

A compatibility matrix can record:

```yaml
worldBundleSchema: 3
contractsPackage: 2.4
combatPackage: 1.8
locomotionPackage: 1.2
inventoryPackage: 0.7
minimumGameBuild: 0.12
```

Schema migrations are explicit tools, never silent runtime guesses.

---

# Part X — World Studio and measurement-led inspection

## 66. The World Studio application

`apps/world-studio` should be a permanent developer application. It uses the same world-runtime, water, physics, character and asset packages as the game.

Required modes:

| Mode | Purpose |
|---|---|
| Overworld map | Inspect province layers and choose a spawn point |
| First-person fly | Fast visual inspection without collision |
| Orbit/survey | Inspect settlements, terrain and hydrology from above |
| Physical character | Test actual movement, combat, swimming and climbing |
| Boat | Test channels, currents, docks and clearance |
| Underwater free camera | Inspect submerged routes and entrances |
| Diagnostic render | Show collision, IDs, normals, depth, flow and LOD |

## 67. Spawn workflow

The full map should allow:

- click-to-spawn;
- search by settlement, POI, bundle, coordinate or blueprint ID;
- choosing mode and capability profile;
- choosing water/flood state;
- choosing time and weather;
- choosing generation seed or approved world version;
- copying a reproducible URL.

Example:

```text
/world-studio?x=42110&z=-18300&mode=character&profile=baselineArgonian
  &flood=wet-season&bundle=helstrom-approach-v12&layers=water,collision
```

## 68. Diagnostic map layers

- canonical settlement anchors;
- source-map alignment;
- elevation and contours;
- slope and curvature;
- flow direction and accumulation;
- water depth and current;
- flood frequency;
- tides and salinity;
- wetness and soil stability;
- canopy and biome;
- culture and faction influence;
- demographics;
- fixed danger;
- foot routes;
- boat routes;
- swim graph;
- climbing surfaces;
- combat spaces;
- interior portals;
- chunk/LOD boundaries;
- draw-call and triangle density;
- source confidence and provenance.

## 69. Agent-readable probes

Coding agents should receive JSON, CSV and compact HTML reports. Useful probes include:

### Hydrology

- disconnected river segments;
- uphill flow;
- unhandled sinks;
- channel/terrain intersections;
- discontinuous water surfaces;
- implausible flood islands;
- salt/freshwater inconsistencies;
- settlement clean-water access.

### Traversal

- ground connectivity by capability profile;
- swim-volume continuity;
- water/shore transition failures;
- climb-route gaps;
- ledge top-out clearance;
- route duration distributions;
- escape-route availability;
- boat depth and bridge-clearance failures.

### Combat

- capsule and hurtbox clearance;
- roll corridor width;
- weapon sweep collision;
- paired-critical animation space;
- lock-on sight line;
- camera collision;
- enemy navigation access;
- water depth during encounter.

### Settlement

- flood exposure by district;
- access to docks, water and routes;
- orphan parcels;
- inaccessible doors;
- overlapping foundations;
- social-space capacity;
- viewshed and landmark reveal;
- causal-model completeness.

### Rendering and performance

- triangle and draw-call counts;
- visible instance counts;
- texture memory;
- water pass cost;
- shader variant count;
- chunk load latency;
- LOD popping distances;
- overdraw;
- mobile GPU budget estimates.

### Underwater

- entrance connectivity;
- breath-distance profiles;
- air-pocket spacing;
- current difficulty;
- visibility and lighting;
- return-route availability;
- loot and encounter accessibility by race/spell profile.

## 70. Visual evidence workflow

Automated tooling should create:

- orthographic maps;
- fixed camera sets;
- route fly-throughs;
- before/after captures;
- short videos for water and movement;
- contact sheets;
- depth, normal, object-ID and collision renders.

The user remains the visual authority. Agent reports should link each finding to an exact teleport URL and capture.

---

# Part XI — Asset strategy

## 71. Asset strategy under the no-new-art constraint

The project can build a large world through:

- vanilla Skyrim meshes, textures, animations and sounds processed through the existing asset pipeline;
- mod assets from the permitted source pool;
- modular composition and instancing;
- material variants derived from existing source material;
- generated terrain and water meshes;
- shader effects, particles and procedural placement;
- kit-based interior and settlement assembly.

No workflow should depend on future bespoke modelling or texture painting.

For this personal total-conversion-style project, the asset-management rule should be simple: **retain a source link and the credits that need to appear in the final credits list**. Avoid creating a legal/permissions bureaucracy inside the codebase.

## 72. Asset registry

```ts
interface AssetRecord {
  assetId: AssetId;
  sourceProject: string;
  sourcePage: string;
  sourceVersion?: string;
  sourceArchiveHash?: string;
  sourceFilePaths?: string[];
  creditRefs: string[];
  category: AssetCategory;
  cultureTags: CultureId[];
  biomeTags: BiomeId[];
  dimensions: Vec3;
  collisionProfile: CollisionProfileId;
  physicalMaterials: MaterialAssignment[];
  climbProfile?: ClimbSurfaceProfileId;
  lodSet?: LodSetId;
  snapPoints: SnapPoint[];
  sockets: AssetSocket[];
  generatorTags: AssetTag[];
}
```

The registry exists to make generation, physics, performance and credits reliable. It is not intended to become a heavyweight compliance ledger.

## 73. Source and credits process

Keep this deliberately lightweight:

1. record the mod/source project name and URL;
2. record the author/project names that should be credited;
3. optionally record archive version/hash where it helps reproducibility;
4. record which semantic asset IDs came from that source;
5. maintain one generated `CREDITS`/third-party-reference list from those records.

All mods listed in this document are assumed available for this personal project. There should be no per-asset permission gate, permission-evidence workflow or agent-time spent repeatedly re-checking usage terms unless a genuinely new source is introduced later.

## 74. Available foundations

### 74.1 Vanilla Skyrim and DLC/Creation content

High-value source families:

| Source family | Direct world uses |
|---|---|
| Hjaalmarch/Morthal | marsh ground, reeds, dead trees, fog, wetland clutter, poor-road composition |
| Riften and Ratway | docks, pilings, timber waterfronts, canals, sewers, rough urban interiors |
| Fishing content | nets, fish, traps, rods, boats, dock clutter and catches |
| Caves and mines | natural caverns, mine supports, smuggler dens, roots and underground routes |
| Imperial and Nordic forts | frontier forts, prisons, checkpoints and ruined colonial infrastructure |
| Farms and estates | plantations, storehouses, fences, mills and fringe agriculture |
| Ships and shipwrecks | coastal wrecks, river obstructions, salvage and pirate sites |
| Solstheim/Dragonborn | fungi, giant roots, Telvanni organic forms, ash/Dunmer border culture |
| Blackreach | glowing fungi, subterranean water, deep-cavern lighting and scale |
| Dawnguard/Falmer cave material | selected underground infrastructure and organic clutter |
| Ruins and tombs | later cultural reuse, crypts and generic structural components |

### 74.2 Argonian Xanmeer Tileset

[Argonian Xanmeer Tileset — Modder's Resource](https://www.nexusmods.com/skyrimspecialedition/mods/181193) contains 85 modular meshes covering structural and damaged Xanmeer components.[^A1] The kit is available for this project.

Direct uses:

- Xanmeer exterior shells;
- corridors and chambers;
- roofs, floors, stairs and monumental transitions;
- broken and collapsed variants;
- hydraulic and flooded complexes;
- ruin fragments for exterior dressing;
- modular dungeon families.

Record the source page and required author credits in the normal credits list; no separate permission-evidence subsystem is needed.

## 75. High-priority architecture and settlement candidates

All candidates in Sections 75–79 are available for use in this personal project. Preserve their source URLs and author/project credits in the credits list; asset selection can focus on visual usefulness, technical compatibility and reproducible builds.

| Candidate | Useful material |
| --- | --- |
| [Mud Mother Grove — Argonian Mud Hut](https://www.nexusmods.com/skyrimspecialedition/mods/146557) | Argonian mud-hut shell, interior composition, local props and settlement visual language |
| [Marsh-Rest — Argonian Themed Player Home](https://www.nexusmods.com/skyrim/mods/50111) | Argonian dwelling/interior composition, mixed props and waterside home ideas |
| [Xalfek — An Argonian Home](https://www.nexusmods.com/skyrim/mods/55595) | Compact Argonian home and interior arrangement |
| [Darkwater Den](https://www.nexusmods.com/skyrim/mods/52630) | Jungle-swamp cave home, clutter, textures and organic interior composition |
| Roots of the Sleeping Tree and similar organic homes | Root rooms, living-tree circulation, organic architecture and furniture ideas |
| Glimmergrove and bioluminescent cave homes | Glowing plants, cave homes, pools and underground settlement composition |
| Wares of Tamriel and Argonian cultural-prop projects | baskets, ceramics, tools, fishing goods, ritual props and trade clutter |
| Argonian bone/wood weapon resources | spears, fishing weapons, shields, bone tools and hunting equipment |

## 76. Flora, terrain and underwater candidates

| Candidate | Useful material |
| --- | --- |
| [Depths of Skyrim — An Underwater Overhaul](https://www.nexusmods.com/skyrim/mods/98331) and SSE versions | underwater grass, seaweed, kelp, coral, fish, treasure, wreck and submerged-POI dressing |
| [Project Rainforest SE](https://www.nexusmods.com/skyrimspecialedition/mods/20636) | tropical vegetation, lily-pad replacements, red earth/rock material ideas, rain and jungle ambience |
| [Hoddminir Plants and Trees](https://www.nexusmods.com/skyrim/mods/38651) | broad plant/tree resource pool, including waterside and temperate species according to selected files |
| [WOODLAND Flora Overhaul](https://www.nexusmods.com/skyrimspecialedition/mods/48926) | trees, shrubs and broad vegetation variation |
| Enhanced Landscapes marsh pines/oaks resources | distinctive wetland tree silhouettes |
| Cathedral, Renthal and EEK flora families | mushrooms, ferns, reeds, shrubs, flowers and tree variants |
| [Cave Roots 4K](https://www.nexusmods.com/skyrimspecialedition/mods/32565) | improved cave and mine root textures |
| [Exist's Caves — PBR Retexture](https://www.nexusmods.com/skyrimspecialedition/mods/131152) | cave PBR textures with a stated CC BY-SA 4.0 licence |
| Vanilla Solstheim and Blackreach flora | roots, fungi and bioluminescent cave dressing |

## 77. Boats, ferries and water-transport candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Sailboats — Script Free Sailing Expanded SSE](https://www.nexusmods.com/skyrimspecialedition/mods/40057) | six small boat classes, rowboats, sailboats, raised/furled sail states, storage and passenger concepts |
| [L.V.X. Magick's — Boats](https://www.nexusmods.com/skyrimspecialedition/mods/36149) | nine boat types, row/sail/Nordic variants, cargo themes, raised/lowered sails, fishing and construction concepts |
| [Skyrim Ferries](https://www.nexusmods.com/skyrimspecialedition/mods/109843) | rowboats, rafts, city ferries, logistics-aware route placement, simple point-to-point ferry interaction |
| [Rowboats of Skyrim](https://www.nexusmods.com/skyrimspecialedition/mods/35341) | rowboat models and rowing/interaction references |
| Nord Boats and Ships / ThatShipGuy resources | longboats, rowboats and larger ships for ports and coast |
| Vanilla Skyrim ships, rowboats, wrecks and fishing assets | base hulls, oars, docks, nets, cargo and wreck dressing |

The boat gameplay code should be original project code built around Rapier and `WorldWaterQuery`. Existing Skyrim scripts provide interaction and design references; permitted meshes and animation states can enter the asset catalogue.

## 78. Creature and fauna candidates

| Candidate | Direct reusable value |
| --- | --- |
| [Wamasu — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/158860) | wamasu model, textures, animations, effects and encounter reference |
| [Guars — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/44491) | guar variants, pack/mount/cargo forms and animations; includes Black Marsh-associated variants |
| [Scuttlers and Bantam Guars](https://www.nexusmods.com/skyrimspecialedition/mods/143604) | small domestic and wild fauna, animations and settlement life |
| [Sea of Spirits](https://www.nexusmods.com/skyrimspecialedition/mods/4781) | sharks, dreugh, whales, narwhals and other aquatic creature assets/behaviours |
| Bloedzuigers / giant-leech projects | large leech body and animation base for deep-marsh hazards |
| Mihail frogs, giant snakes, crocodilian creatures and centipedes | amphibian, reptile and invertebrate variety |
| Insect and dragonfly resources | ambient swarms, disease vectors and food-web detail |
| Vanilla slaughterfish, insects, fish, mudcrabs and chaurus families | baseline aquatic and invertebrate animation/material sources |

Creature assets provide models and animations. Habitat, behaviour, statistics, fixed danger and population rules remain game-owned data.

## 79. Ruin, cave, fort and dungeon candidates

| Candidate | Useful material |
| --- | --- |
| [Creation Club Ayleid Ruin Resources](https://www.nexusmods.com/skyrimspecialedition/mods/83999) | extra pieces for the Update 1.6 Ayleid kit, original and modified structural assets |
| [Balamath — Ayleid Ruin Dungeon](https://www.nexusmods.com/skyrimspecialedition/mods/84000) | example of multi-zone dungeon assembly and non-linear variant using Bethesda's Ayleid kit |
| [Fort Castellum SE](https://www.nexusmods.com/skyrimspecialedition/mods/23438) | ancient Imperial tileset demonstration, fort and dungeon block combinations |
| [The Psychedelic Caves](https://www.nexusmods.com/skyrimspecialedition/mods/150288) | bioluminescent plants, mushrooms, crystals and unusual cave composition |
| Vanilla cave, mine, fort, prison and sewer kits | natural caves, smugglers, colonial infrastructure and flooded interiors |
| Vanilla Ayleid Update 1.6 content where owned | Barsaebic Ayleid structures and dungeon pieces |
| Beyond Skyrim Bruma Ayleid material | high-quality Ayleid architecture and textures |

## 80. Asset acquisition priorities

1. Ingest the Xanmeer kit and record its source/credits entry.
2. Build the vanilla Skyrim semantic catalogue.
3. Ingest one Argonian current-settlement kit.
4. Acquire waterside flora, tree and underwater vegetation sets.
5. Acquire small-boat and ferry assets.
6. Acquire a compact creature foundation: wamasu, guar, small reptiles/amphibians, insects and aquatic fauna.
7. Acquire Ayleid/Nedic/Imperial historical-layer kits.
8. Expand clutter, tools, fishing, ritual and market assets.
9. Add specialised cave and bioluminescent assets.
10. Fill gaps only after the reference watershed exposes them.

---

# Part XII — Demographics and community expectations

## 81. Demographic fields

Demographics should be generated from:

- era;
- region and tribe territory;
- proximity to ports, borders and dependable roads;
- settlement purpose;
- faction control;
- migration and slavery history;
- disease history;
- current conflict;
- Hist access;
- local economy;
- route centrality.

```ts
interface DemographicPrior {
  id: DemographicPriorId;
  era: EraRange;
  region?: RegionId;
  settlementType?: SettlementTypeId;
  populationShares: Record<PopulationGroupId, Range>;
  confidence: SourceConfidence;
  sourceUrl: string;
  sourceImageHash?: string;
  author?: string;
  methodology?: string;
  notes?: string;
}
```

A deep Hist settlement and a port city should have different populations even at similar size.

## 82. Reddit demographic charts: supplied community priors

The referenced r/ElderScrolls demographic maps have now been supplied directly for eight population groups. They should be ingested into the source registry as **community-authored demographic priors**, not treated as canonical census data. Their strongest value is spatial: they encode a coherent fan interpretation of where outsider populations are concentrated and therefore provide useful priors for settlement populations, cultural mixing, architecture, trade, faction presence and encounter generation.

The attached charts give the following province-wide headline shares:

| Population group | Chart headline share |
|---|---:|
| Argonian | 72% |
| Dunmer | 10% |
| Imperial | 8% |
| Khajiit | 5% |
| Nord | 2% |
| Bosmer | 2% |
| Altmer | 1% |
| Redguard | 1% |

These rounded headline values total 101%, so they must be treated as approximate community estimates. No missing race should be inferred to have exactly zero population merely because a chart was not supplied.

The charts divide Black Marsh into seven broad spatial zones identifiable by their nearest labelled settlement anchors. The supplied percentages are:

| Chart zone / nearest anchors | Argonian | Dunmer | Imperial | Khajiit | Nord | Bosmer | Altmer | Redguard |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Stormhold / northern-western border | 75% | 22% | 2% | 2% | 7% | 2% | 2% | 2% |
| Thorn / northeastern-east zone | 75% | 20% | 2% | 1% | 3% | 1% | 1% | 1% |
| Helstrom / deep central interior | 97% | 1% | 1% | 1% | 1% | 1% | 1% | 1% |
| Gideon / western frontier | 70% | 3% | 22% | 6% | 1% | 1% | 1% | 3% |
| Soulrest / southwestern coast | 60% | 1% | 13% | 19% | 1% | 5% | 1% | 1% |
| Archon / southeastern-east coast | 79% | 15% | 5% | <1% | <1% | <1% | <1% | <1% |
| Blackrose–Lilmoth / southern zone | 80% | 3% | 7% | 6% | <1% | 10% | 3% | 1% |

Because the source graphics use rounded values independently by race, the rows are not expected to sum cleanly to 100%. The zone boundaries should be stored as traced community-map polygons or raster masks with source confidence metadata rather than being silently promoted into canonical political borders.

The pattern is useful and broadly reinforces the world architecture proposed here:

- **Helstrom/deep interior:** overwhelmingly Argonian. This strongly supports the deep-marsh core as culturally local, difficult for outsiders to penetrate and structurally unlike the peripheral cities.
- **Stormhold and Thorn:** large Dunmer minorities, with the northern edge also showing the strongest Nord presence. This supports a visibly Morrowind-facing northern frontier shaped by trade, migration, conflict and older slavery relationships.
- **Gideon:** the strongest Imperial concentration in the supplied set. This supports making the western fringe one of the clearest places to show imported Imperial infrastructure, estates, engineered roads/causeways and the remains or continuation of colonial institutions.
- **Soulrest:** the most mixed supplied zone and by far the strongest Khajiit concentration, alongside substantial Imperial and Bosmer minorities. Its settlement/economic grammar should therefore support maritime and overland trade, migration and mixed neighbourhoods.
- **Blackrose–Lilmoth:** still strongly Argonian but with notable Bosmer, Imperial, Khajiit and Altmer presence. This provides a basis for a cosmopolitan southern-waterway/coastal layer while retaining a Saxhleel majority.
- **Archon:** Argonian-majority with a substantial Dunmer minority and smaller Imperial presence, supporting an eastern coastal contact zone with a distinct social history from the western Imperial fringe.

These distributions should influence probability priors for ordinary NPC populations and culturally derived content, while **location-specific causal history remains authoritative**. A Dunmer trading enclave, Imperial expedition, Bosmer hunting party or Khajiit merchant flotilla can exist outside its statistically common zone when its reason for being there is explicit. Likewise a Hist-bound settlement inside a mixed region may remain almost entirely Argonian.

For source provenance, record the eight supplied image hashes:

| Population group | Supplied image SHA-256 |
|---|---|
| Argonian | `0b7b57ffa2034c05aa9733c75ee5a171645adaa017bf91b4b34aff3fc1b2cccb` |
| Dunmer | `73fd7908ba0f403624c7441f4d91c2ddee6a105246931bff104c200cb60c697d` |
| Imperial | `fabd0a31bbfcf295932f190f582331202efce6018b055ad66996715e528f427c` |
| Khajiit | `6f5cb1cfea7b8d5f131b28f4432980204382ffba93df75a3fcc4aef5a2c1c696` |
| Nord | `abc8974ede41c118a582ab2d8dbf8aae8b6bec1c4c3a2309c490587b4d2e1f95` |
| Bosmer | `4a35b259553f8f10ec62471f698437cd547f96bc7475368c2d0b45bbbc942679` |
| Altmer | `8812bf7375fbbecbf7f9af3a4db2656346735dfcb74b0000600d40603368470b` |
| Redguard | `c239a8ad42e812b99c11bfe211a36bd6ae016969d417ab5aaf60f045a4b340e8` |

If the original Reddit post is later located, add its author, URL, publication date, claimed era and methodology without changing the image-derived data unless the source itself corrects it.

## 83. Qualitative community themes

Available Reddit-linked discussions, fan projects and Black Marsh design discussions show recurring interest in:

- a province that feels alien and biologically distinct;
- deep Hist involvement;
- tribal and cultural variety among Argonians;
- dangerous interior marshes;
- underwater exploration;
- unusual transport and navigation;
- visible failed Imperial colonisation;
- ancient Xanmeers and lost peoples;
- varied landscapes beyond one continuous green swamp;
- the opportunity to play an Argonian in a homeland designed around amphibious capability.

This is a qualitative synthesis. It is not a representative survey. The design aligns well with those themes while retaining source confidence and fixed gameplay requirements.

## 84. Demographic design implications

- Deep rootlands should be overwhelmingly Saxhleel and culturally local in eras where lore supports that state.
- Ports and border cities can have mixed populations shaped by trade, occupation, slavery, migration and political history.
- Current tribes require distinct demographic and social rules.
- Historical peoples appear through archaeology after their disappearance.
- Small outsider expeditions need visible logistical support and motives.
- Demographic fields should affect architecture, language, services, factions, clothing, boats, food, religion and quest structure.

---

# Part XIII — Revised build sequence

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
- retained reference settlement.

### Phase 12 — dungeons and interior programmes

Deliverables:

- exterior portal and foundation data;
- Xanmeer graph grammar;
- cave/root/smuggler grammar;
- underwater entrances;
- interior streaming contract;
- one full retained production dungeon.

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
- GitHub Pages build containing approved runtime content only.

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

# Part XIV — Non-negotiable acceptance rules

## 88. World identity

- The deep interior is physically, culturally and mechanically distinct.
- Imperial and foreign influence is concentrated where geography and history support it.
- The province contains visible ecological and cultural variation.
- Major settlement positions follow appropriate-era source maps.
- Hist influence is spatial and systemic.
- Waterways form the primary province structure.
- **All major cities are connected by the road network** (owner requirement,
  2026-08-22): the intended overland graph links all eight major cities, with
  individual legs expressing the normal infrastructure life cycle (flood
  damage, causeways, bridges, ferries bridging broken segments) rather than
  being absent.
- **The province has canon exit roads but closed edges** (owner requirement,
  2026-08-23): the Blackwood Road leaves Gideon westward to Leyawiin and the
  Tear road leaves Thorn northward into Morrowind (both CANON_FIXED); border
  gates, mountains and open sea prevent actually leaving the playable
  province — exits are scenery, lore hooks and arrival framing, never
  walkable world edges.

## 89. World causality

- Every POI has a causal model.
- Layout and content derive from that model.
- Current occupants have motives and logistical support.
- Loot has provenance.
- Roads and waterways connect actual needs.
- Historical layers remain distinguishable.

## 90. Gameplay

- Enemies and loot have no player-level scaling.
- Deep areas remain fixed high danger.
- Swimming, water breathing, climbing and boats create access progression.
- Argonian physiology materially changes underwater play.
- Underwater POIs and dungeon entrances exist throughout appropriate regions.
- Climbable world geometry is the default for logically large surfaces.
- Combat spaces and critical-animation clearance are validated.

## 91. Technology

- Ecctrl remains behind a controller adapter.
- Rapier remains authoritative for gameplay physics.
- Water rendering and gameplay sample the same water data.
- World bundles are deterministic and versioned.
- Apps consume packages and never each other.
- The world studio uses the same runtime packages as the game.
- Agents read measurement reports; user visual review remains the final visual gate.

## 92. Assets and credits

- No future bespoke art creation is assumed.
- Vanilla Skyrim and the permitted mod pool provide the visual asset base.
- Keep a simple source-and-credits record for each imported asset family or mod.
- Exact source hashes/versions are useful where they support reproducible pipeline builds, but file-level legal ledgers are unnecessary.
- Existing assets are composed through semantic kits and deterministic compilers.
- The final project should be able to generate a consolidated credits/reference list from the asset registry.

# Source register

## Morrowind and Vvardenfell

[^M1]: [UESP — Guide to Vvardenfell and regional descriptions](https://en.uesp.net/wiki/Morrowind:Guide_to_Vvardenfell); [UESP — Vvardenfell](https://en.uesp.net/wiki/Lore:Vvardenfell).
[^M2]: [UESP — Balmora](https://en.uesp.net/wiki/Morrowind:Balmora).
[^M3]: [UESP — Vivec City](https://en.uesp.net/wiki/Morrowind:Vivec_(city)).
[^M4]: [MWSE — game units reference](https://mwse.github.io/MWSE/references/general/game-units/).

## Black Marsh lore, maps and setting

[^L1]: [The Imperial Library — The Argonian Account, Book 1](https://www.imperial-library.info/content/argonian-account-book-1).
[^L2]: [The Imperial Library — The Argonian Account, Book 3](https://www.imperial-library.info/content/argonian-account-book-3).
[^L3]: [The Imperial Library — The Argonian Account, Book 4](https://www.imperial-library.info/content/argonian-account-book-4).
[^L4]: [UESP — Pocket Guide to the Empire, Third Edition: Argonia](https://en.uesp.net/wiki/Lore:Pocket_Guide_to_the_Empire,_3rd_Edition/Argonia); [UESP — Black Marsh](https://en.uesp.net/wiki/Lore:Black_Marsh).
[^L5]: [UESP — Lilmoth](https://en.uesp.net/wiki/Lore:Lilmoth); [UESP — An-Xileel](https://en.uesp.net/wiki/Lore:An-Xileel); [The Imperial Library — Lord of Souls lore notes](https://www.imperial-library.info/content/lord-souls-lore-notes).
[^L6]: [The Imperial Library — Andrew Young's posts, including “Children of the Root”, “Letter to Septimius” and “In Accord With Those Sun-Blessed”](https://www.imperial-library.info/content/real-author/andrew-young).
[^L7]: [UESP — Hist](https://en.uesp.net/wiki/Lore:Hist); [UESP — Argonian](https://en.uesp.net/wiki/Lore:Argonian).
[^L8]: [The Elder Scrolls Online — Murkmire](https://www.elderscrollsonline.com/en-us/updates/dlc/murkmire); [UESP — Murkmire](https://en.uesp.net/wiki/Online:Murkmire).
[^L9]: [UESP — Knahaten Flu](https://en.uesp.net/wiki/Lore:Knahaten_Flu); [UESP — Kothringi](https://en.uesp.net/wiki/Lore:Kothringi); [UESP — Lilmothiit](https://en.uesp.net/wiki/Lore:Lilmothiit).
[^L10]: [UESP — Red Bramman](https://en.uesp.net/wiki/Lore:Red_Bramman); [UESP — Black Marsh](https://en.uesp.net/wiki/Lore:Black_Marsh).
[^L11]: [The Imperial Library — The Blackwater War, Volume 1](https://www.imperial-library.info/content/the-blackwater-war-volume-1).
[^L12]: [The Imperial Library — Cartography index, separating official and fan maps](https://www.imperial-library.info/galleries/cartography); [UESP mobile Black Marsh map](https://en.m.uesp.net/wiki/Lore:Black_Marsh).
[^L13]: [The Imperial Library — Excerpt from Tips for Black Marsh Travel](https://www.imperial-library.info/content/excerpt-tips-black-marsh-travel); [Interactive Map Texts: Shadowfen](https://www.imperial-library.info/content/eso-map-shadowfen).
[^L14]: [The Imperial Library — Care and Feeding of Swamp Jellies](https://www.imperial-library.info/content/care-and-feeding-swamp-jellies).

## Geography and procedural design

[^G1]: [Nexus Mods — All Tamriel Heightmap](https://www.nexusmods.com/skyrimspecialedition/mods/573). Transbot9's Beta06 all-Tamriel heightmap is the macro terrain reference; the page permits non-commercial reuse with credit under CC BY-NC 4.0. Keep Transbot9 in the project credits.
[^G2]: [Nexus Mods — Tamriel Worldspaces, files tab](https://www.nexusmods.com/skyrimspecialedition/mods/118678?tab=files). The **Argonia** file is 30.9 MB and is described as a Black Marsh heightmap/worldspace derived from Transbot9's All Tamriel Heightmap. Credit the worldspace author and Transbot9.
[^G3]: [Red Blob Games — Mapgen4](https://www.redblobgames.com/maps/mapgen4/).
[^G4]: [Chen et al. — Interactive Procedural Street Modeling](https://www2.cs.uh.edu/~chengu/Publications/streetModeling/street_modeling.html).

## Water and rendering

[^W1]: [GitHub — WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS), MIT licence, README inspected 22 August 2026.
[^W2]: [GitHub — SeedOcean](https://github.com/reed-soul/SeedOcean), MIT licence, v0.6.0-alpha README inspected 22 August 2026.
[^W3]: [GitHub — jeantimex/threejs-water](https://github.com/jeantimex/threejs-water), README states MIT and documents GPU wave simulation, caustics, object displacement and buoyancy.
[^W4]: [GitHub — ABYSSAL ocean](https://github.com/squall01337/abyssal-ocean), MIT licence, WebGL2 spectral FFT reference.

## Current project repository

[^R0]: [`elder-souls-argonia` canonical repository and current README](https://github.com/jtattersall09403/elder-souls-argonia/blob/main/README.md), inspected 22 August 2026.
[^R1]: [`ecctrl-souls-combat` README](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/README.md).
[^R2]: [`ecctrl-souls-combat` CLAUDE.md](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/CLAUDE.md).
[^R3]: [`ecctrl-souls-combat` docs index](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/docs/README.md).
[^R4]: [Movement boundary](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/docs/architecture/movement-boundary.md); [PlayerMovementController](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/src/game/physics/PlayerMovementController.ts).
[^R5]: [Character actor architecture](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/docs/architecture/character-actor.md).
[^R6]: [Current input and movement tuning](https://github.com/jtattersall09403/ecctrl-souls-combat/blob/main/src/game/io/input.ts).

## Asset candidates

[^A1]: [Argonian Xanmeer Tileset — Modder's Resource](https://www.nexusmods.com/skyrimspecialedition/mods/181193).
[^A2]: [Mud Mother Grove — Argonian Mud Hut](https://www.nexusmods.com/skyrimspecialedition/mods/146557).
[^A3]: [Marsh-Rest — Argonian Themed Player Home](https://www.nexusmods.com/skyrim/mods/50111).
[^A4]: [Xalfek — An Argonian Home](https://www.nexusmods.com/skyrim/mods/55595).
[^A5]: [Darkwater Den — Argonian Themed Home](https://www.nexusmods.com/skyrim/mods/52630).
[^A6]: [Depths of Skyrim — An Underwater Overhaul](https://www.nexusmods.com/skyrim/mods/98331); [2026 mesh fixes](https://www.nexusmods.com/skyrimspecialedition/mods/174995).
[^A7]: [Project Rainforest SE](https://www.nexusmods.com/skyrimspecialedition/mods/20636).
[^A8]: [Hoddminir Plants and Trees](https://www.nexusmods.com/skyrim/mods/38651).
[^A9]: [Cave Roots 4K](https://www.nexusmods.com/skyrimspecialedition/mods/32565).
[^A10]: [Exist's Caves — PBR Retexture](https://www.nexusmods.com/skyrimspecialedition/mods/131152).
[^A11]: [Sailboats — Script Free Sailing Expanded SSE](https://www.nexusmods.com/skyrimspecialedition/mods/40057).
[^A12]: [L.V.X. Magick's — Boats](https://www.nexusmods.com/skyrimspecialedition/mods/36149).
[^A13]: [Skyrim Ferries](https://www.nexusmods.com/skyrimspecialedition/mods/109843).
[^A14]: [Wamasu — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/158860).
[^A15]: [Guars — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/44491).
[^A16]: [Scuttlers and Bantam Guars — Mihail Monsters and Animals](https://www.nexusmods.com/skyrimspecialedition/mods/143604).
[^A17]: [Sea of Spirits](https://www.nexusmods.com/skyrimspecialedition/mods/4781).
[^A18]: [Creation Club Ayleid Ruin Resources](https://www.nexusmods.com/skyrimspecialedition/mods/83999).
[^A19]: [Balamath — Ayleid Ruin Dungeon](https://www.nexusmods.com/skyrimspecialedition/mods/84000).
[^A20]: [Fort Castellum SE](https://www.nexusmods.com/skyrimspecialedition/mods/23438).
[^A21]: [The Psychedelic Caves](https://www.nexusmods.com/skyrimspecialedition/mods/150288).
[^A22]: [Beyond Skyrim: Argonia](https://beyondskyrim.org/project/argonia).

## Community material

[^C2]: [Reddit media — community Inkarnate map, “Black Marsh / Argonian State 4E 231”](https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Fa-map-of-black-marsh-i-made-in-inkarnate-i-find-the-v0-7jo2gib84ox71.jpg%3Fauto%3Dwebp%26s%3D89a43ee168eaae73e9a350667e1fe2a46f273749). Use only as a secondary prior for relative major/secondary settlement placement, ordinal settlement prominence and suggested connection edges; do not inherit its landscape or waterways wholesale.


The eight supplied r/ElderScrolls demographic maps are now incorporated as community priors in Part XII, with their image hashes recorded for provenance. Their percentages and zone boundaries remain explicitly community interpretation and must stay separate from canonical settlement facts, official map data and era-specific lore. If the original post is later located, its author, URL, date and methodology should be added to the source registry.
