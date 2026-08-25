# Part VIII — Compatibility with combat/physics/character/items (§51–57)

> Module of the world-generation master plan — see [README](README.md) for the router
> and [00-core.md](00-core.md) for the universal principles. Section numbers (§NN)
> preserved from the original plan; cross-doc references resolve via the README map.

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

> **Lands in Phase 10b** (was Phase 7b; decision 0017) — after swimming,
> climbing and boats, so the extraction merges once against a character package
> that already carries every movement mode.

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

