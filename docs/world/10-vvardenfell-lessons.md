# Part I — What Vvardenfell teaches a procedural world system (§1–10)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

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

