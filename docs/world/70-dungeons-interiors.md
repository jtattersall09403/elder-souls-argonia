# Part VII — Dungeons, interiors and encounters (§47–50)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

> **Before authoring any interior or kit assembler (Phases 11–12), read the
> measured evidence, not just this plan:**
> [research/mined-interior-assembly-and-settlement-form.md](../research/mined-interior-assembly-and-settlement-form.md)
> — per-kit snap module (128 units ≈ 1.82 m, but *statistical*: town kits lift
> 14–23×, cave shells 0.9× i.e. not snapped at all), yaw quantised to 90°,
> chamber sizes (p50 ≈ 20 × 14 m), clutter density (lived interiors carry
> 10–20× a dungeon's), and settlement form (buildings ~15 m apart everywhere;
> Black Marsh settlements sit 3.9 m from water and 79 m from a road, Skyrim's
> the other way round). Tables:
> [`world/sources/placement/`](../../world/sources/placement/README.md)
> (`bmv-interior-assembly.json`, `*-settlement-form.json`). It also records
> what could **not** be mined — no facade-facing signal, no ceiling clearance,
> and **no shipped Argonian interior anywhere**, so the Xanmeer kit's grammar
> has to be derived rather than copied.

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

