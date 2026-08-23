# Part III — Lore systems that should become world systems (§17–27)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

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

Narrative requirement (quests 30, MQ05; owner decision 2026-08-23): an
**escorted boat convoy** from the Stormhold/Alten Corimont opening region into
Helstrom must exist early — realised on the solved AC–Helstrom marsh channel —
introducing the safe heart city while its basin stays lethal. Rootworm transit
remains the deeper, access-restricted network (Waykeepers, tribes, late game).

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

