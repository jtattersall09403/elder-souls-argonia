# Part IV — Causal world authoring (§28–32)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

> **Binding (owner 2026-08-23): every settlement, city and POI must be
> designed for the flood cycle.** The world has wet/dry seasons and tides
> (§36, flood-states data): no one builds a city that stops functioning — or
> looks ridiculous — in the wet season. Location blueprints must state their
> wet-season state (stilts, platforms, boardwalks, upper-floor life, ferry
> access, flooded quarters as a *feature*) and their causal record must show
> the builders knew their water. Blackrose is the template case: island core
> + boardwalk districts over the lake (see its dossier).

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
- a road with no connected economic or political function;
- a notable hard-to-reach landform with no reward at it, or a rich reward
  with neither effort nor cause behind it (module 20 §12.3b, reward for
  effort).

Generated density becomes meaningful density.

---

