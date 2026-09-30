import type { GroundPaintDoc } from "./groundPaint";
import type { LocalPoolRecord } from "../water/localSurfaces";
import type * as THREE from "three";

export const SETTLEMENT_COLLISION_FRAME = "settlement-pivot-yup-v1";

export interface SettlementAnchor {
  mode: "streamed-origin" | "streamed-perimeter";
  groundFit: "direct" | "plinth" | "pad" | "stilt" | "dug-in";
  originOffsetM: [number, number, number];
  buryM: number;
  buryCapM: number;
  slopeBuryPerM: number;
}

export type SettlementAnchorClass = "ground" | "wall" | "hanging" | "deck" | "water" | "fx";

export interface SettlementPlacement {
  id: string;
  sourceId: string;
  /** `effect`: a runtime effect, no kit mesh (`fx:smoke-column`, smokeColumn.ts). */
  kind: "settlement" | "dressing" | "landmark" | "fence" | "dock" | "route-structure" | "effect";
  assetId: string;
  kit: string;
  positionM: [number, number, number];
  yawDeg: number;
  /** 16e span placements tilt along their length; absent means level. */
  pitchDeg?: number;
  scale: number;
  footprintM: [number, number][];
  anchor: SettlementAnchor;
  /** How this piece meets the world (16h item 2); absent means "ground". */
  anchorClass?: SettlementAnchorClass;
  /** Set on a wall/hanging/deck child: the placement it hangs off. */
  parentPlacementId?: string | null;
  /** The mined mount point, in the PARENT's local frame, same axes as positionM. */
  mountOffsetM?: [number, number, number];
  /** Water children only: the recorded level of the berth's body or reach. */
  waterLevelM?: number;
  waterEntityId?: string;
  /** A modular-run member (walls, fences, docks): the run it belongs to, its
   * place in the run, and the cumulative mined rise (m) the compile laid it
   * at. The runtime seats the whole run as one rigid chain on it. */
  run?: SettlementRun;
  /** Bundle schema 4 (16k walk 2 ruling yFinal): positionM[1] is the
   * workbench's measured pivot height, applied verbatim (anchorPlacement never
   * re-anchors it). Absent (every schema-3 row) means "seat on the terrain". */
  yFinal?: true;
  collision: {
    frame: string;
    kind: string;
    /** Measured source-pivot proxies win over render-geometry bounds. */
    parts?: SettlementCollisionPart[];
    proxySource?: "measured-manifest-box";
  };
  /** The compile's assembly layer (export `_layer_contract`); "light" pieces
   * are light fixtures (lighting.ts). Absent in bundles older than walk 2. */
  layer?: string;
  /** The compile rule that made the placement; `effect-socket/fire` marks a
   * fire socket (lighting.ts). Only the rule id is read here. */
  provenance?: { ruleId?: string };
}

export interface SettlementRun {
  id: string;
  index: number;
  riseM: number;
}

/**
 * A building's ground treatment row: what the groundcover keeps out of. The
 * runtime draws nothing from it (the wall-foot skirt and the rubble ring are
 * cut, 16h check-in 2 ruling 1).
 *  - `floor`: the piece meets the ground; its whole `footprintM` is cleared.
 *  - `deck`: a stilt/deck piece whose deck stands more than 0.8 m over the
 *    ground; only `contactsM` (where its legs and stairs meet the ground) is
 *    cleared, so groundcover grows under the raised deck (owner 2026-09-25).
 * `apronsM` are discs `[x, z, radiusM]` kept clear at every door threshold.
 * `footprintM` stays the building's outline for every kind (the ground-control
 * painter and navmesh cut read it).
 */
export interface GroundTreatment {
  id: string;
  kind: "floor" | "deck";
  footprintM: [number, number][];
  contactsM?: [number, number][][];
  apronsM?: [number, number, number][];
}

/** The sockets record's version (0103 decision 5; worldgen/sockets.py): 2
 * when every work socket carries `interact` (decision 0113, additive: a 1
 * record reads as carrying none). */
export const SETTLEMENT_SOCKETS_SCHEMA_VERSION = 2;
export const SETTLEMENT_SOCKETS_SCHEMA_VERSIONS = [1, SETTLEMENT_SOCKETS_SCHEMA_VERSION] as const;

/** Vocabulary `interactKinds`, in its order. */
export const SOCKET_INTERACT_KINDS = ["customer", "station"] as const;

/**
 * Where the player uses a work socket (decision 0113): `customer` across a
 * service surface (counter, stall, market table) from the worker, facing
 * back at them; `station` where the worker stands, in the worker's pose.
 * Same frame as the socket's `positionM` (world, or the cell's for an
 * interior socket); `facing` is compass degrees like `yawDeg`.
 */
export interface SocketInteractPoint {
  kind: (typeof SOCKET_INTERACT_KINDS)[number];
  position: [number, number, number];
  facing: number;
}

/** Socket kinds, as in world/sources/vocab/socket-vocabulary.json. */
/** Equal to `world/sources/vocab/socket-vocabulary.json` `socketKinds`, in its
 * order (sockets.test.ts); `station` and `sign` came with decision 0104. */
export const SETTLEMENT_SOCKET_KINDS = [
  "npc", "idle", "item", "container", "station", "sign", "encounter", "fauna", "ambience", "marker",
] as const;
export type SettlementSocketKind = (typeof SETTLEMENT_SOCKET_KINDS)[number];

interface SettlementSocketBase {
  id: string;
  positionM: [number, number, number];
  yawDeg: number;
  parcelId: string | null;
  /** null outside; a tier A cell id inside. */
  interiorCell: string | null;
  /** The placement the socket sits on or in. */
  host: string | null;
  why: string;
}

/** One `npc` schedule entry: at `dayPhase` the person is at idle socket `socketId`. */
export interface SettlementScheduleEntry {
  dayPhase: string;
  socketId: string;
  purpose: "work" | "home" | "evening" | "leisure";
}

export type SettlementSocket =
  | (SettlementSocketBase & {
      kind: "npc"; rosterSlotId: string; role?: string; schedule: SettlementScheduleEntry[];
    })
  /** `interact` on every `work-at` idle socket from schema 2 (0113). */
  | (SettlementSocketBase & { kind: "idle"; activity: string; interact?: SocketInteractPoint })
  /** A work station (0104): `stationClass` is a vocabulary `stationClasses` key; `interact` from schema 2 (0113). */
  | (SettlementSocketBase & { kind: "station"; stationClass: string; interact?: SocketInteractPoint })
  /** A signpost (0104): one `route.` or `place.` id per arm. */
  | (SettlementSocketBase & { kind: "sign"; pointsTo: string[] })
  | (SettlementSocketBase & {
      kind: "item"; itemClass: string; valueBand: string; contentPending?: boolean;
    })
  | (SettlementSocketBase & {
      kind: "container"; containerClass: string; fillRule: string | null;
      lootTable?: { itemClasses: string[]; valueBand?: string; storyNote: string };
    })
  | (SettlementSocketBase & {
      kind: "encounter" | "fauna" | "ambience" | "marker"; dangerBand?: string; zone?: string;
    });

export interface SettlementBundle {
  /** 3, 4 when placements may carry `yFinal` (additive: a 3 reads as none
   * final), 5 when a place may carry `pools` (additive; `pools.ts`). */
  schemaVersion: 3 | 4 | 5;
  collisionFrame: string;
  lod: {
    tiers: number;
    absoluteTriangleFloor: [number, number];
    distancePerFootprintDiagonal: [number, number];
    farMergeDistanceM: number;
    atlasMaxSize: number;
    colliderRadiusM: number;
    colliderPartBudget: number;
  };
  kits: Record<string, { id: string; glb: string; manifest: string }>;
  settlements: {
    id: string;
    placementIds: string[];
    boundaryM: [number, number][];
    budgetReport: Record<string, unknown> | null;
    floodBandReport: Record<string, unknown>;
    variants: Record<string, unknown>[];
    /** 0103 decision 5; parse with `parseSettlementSockets` (sockets.ts). */
    socketsSchemaVersion?: (typeof SETTLEMENT_SOCKETS_SCHEMA_VERSIONS)[number];
    sockets?: SettlementSocket[];
    /** The place's painted ways (16k walk 4); parse with `groundPaintOfBundle`. */
    groundPaint?: GroundPaintDoc;
    /** The place's still water (layout `pool` ops, schema 5): registered with
     * the injected `LocalWaterSurfaces` at load (`pools.ts`). */
    pools?: LocalPoolRecord[];
  }[];
  placements: SettlementPlacement[];
  groundTreatments: GroundTreatment[];
  /** One record per door (0081 decision 4); older bundles may omit it. */
  doors?: SettlementDoor[];
  stats: { settlements: number; settlementPlacements: number; routeStructurePlacements: number };
}

/**
 * A door record as the compile publishes it (0081 decision 4, 0103). Only a
 * claim with `tier: "A"` and a `cellId` opens (interior/doorAccess.ts);
 * every other door is closed and shows the reserved line.
 */
export interface SettlementDoor {
  id: string;
  settlementId: string;
  parcelId: string;
  /** The threshold in world metres [x, z]. */
  thresholdM: [number, number];
  /** Outward bearing of the doorway, compass degrees (0 = -z, 90 = +x). */
  facingDeg?: number;
  interiorClaim?: {
    tier?: string;
    cellId?: string;
    /** The cell's load door this exterior door pairs with (owner ruling B, 0103 decision 2). */
    interiorLoadDoorRef?: string;
    /** Where entering by this door arrives, in the bundle's cell frame. */
    arrivalMarker?: { positionM: [number, number, number]; yawDeg: number };
    [field: string]: unknown;
  } | null;
  interiorStatus?: string;
}

export type TerrainHeight = (x: number, z: number) => number | null;

export interface SettlementCollisionPart {
  halfExtentsM: [number, number, number];
  offsetM: [number, number, number];
}

/**
 * One collider of a placed piece, in the placement's local frame (the body
 * carries its position and yaw). A `mesh`/`convex` piece collides as its own
 * LOD0 triangles — an arch you can walk through, not a solid block (0071 §5);
 * only the shapes with a measured box proxy stay boxes.
 */
export type SettlementCollisionShape =
  | ({ kind: "box" } & SettlementCollisionPart)
  | { kind: "trimesh"; vertices: Float32Array; indices: Uint32Array };

export interface SettlementSolid {
  id: string;
  frame: typeof SETTLEMENT_COLLISION_FRAME;
  position: [number, number, number];
  /** World rotation as a quaternion [x, y, z, w]: a mounted or pitched piece
   * has no single yaw, so the solid carries the drawn rotation itself. */
  rotation: [number, number, number, number];
  scale: number;
  parts: SettlementCollisionShape[];
}

export interface SettlementRenderStats {
  placements: number;
  draws: number;
  triangles: number;
  colliderParts: number;
  farMergedMeshes: number;
  farMergedInstances: number;
  colliderCoveredRadiusM: number;
  grounding: SettlementGroundAudit[];
  finalTransformEvidence: SettlementFinalTransformEvidence;
  collision: SettlementCollisionAudit;
}

/** Collider residency and any explicit moving-ring budget shortfall. */
export interface SettlementCollisionAudit {
  status: "loading" | "ring" | "resident" | "failed";
  activeSettlementIds: readonly string[];
  residentPlacementIds: readonly string[];
  omittedPlacementIds: readonly string[];
  parts: number;
  requiredResidentParts: number;
  partBudget: number;
  coveredRadiusM: number;
}

/** Machine-readable proof for the final anchored transform and depth pair. */
export interface SettlementFinalTransformEvidence {
  finalAnchoredPlacements: number;
  nearInstances: number;
  farMergedInstances: number;
  groundBoundInstances: number;
  shadowPairedDraws: number;
  shadowPairFailures: readonly string[];
  /** Run joints whose drawn step is more than RUN_JOINT_TOLERANCE_M off the
   * mined rise (16h check-in 3 §2). Must stay empty. */
  runJointFailures: readonly string[];
}

export type SettlementGroundStatus =
  | "grounded"
  | "floating"
  | "over-buried"
  | "floating-and-over-buried"
  | "terrain-unavailable";

/** Measured from the streamed terrain used for this exact runtime placement. */
export interface SettlementPlacementGroundAudit {
  placementId: string;
  settlementId: string;
  status: SettlementGroundStatus;
  terrainMinM: number | null;
  terrainMaxM: number | null;
  groundLineM: number | null;
  pivotToBaseM: number;
  configuredBuryM: number;
  requestedBuryM: number | null;
  appliedBuryM: number | null;
  buryCapM: number;
  gapM: number | null;
  overBuryM: number | null;
}

export interface SettlementGroundAudit {
  settlementId: string;
  placementsExpected: number;
  placementsAudited: number;
  terrainUnavailable: number;
  floating: number;
  overBuried: number;
  maxGapM: number;
  maxOverBuryM: number;
  placements: SettlementPlacementGroundAudit[];
}

export type ReadonlySettlementGroundAudit = Readonly<
  Omit<SettlementGroundAudit, "placements"> & {
    placements: readonly Readonly<SettlementPlacementGroundAudit>[];
  }
>;

export type SettlementProofState = Readonly<{
  status: "loading" | "loaded" | "failed";
  settlements: number;
  placements: number;
  renderedPlacements: number;
  draws: number;
  triangles: number;
  grounding: readonly ReadonlySettlementGroundAudit[];
  finalTransformEvidence: Readonly<SettlementFinalTransformEvidence>;
  collision: Readonly<SettlementCollisionAudit>;
  /** Live per-frame counters (not frozen; the layer updates them each frame). */
  frames: Readonly<SettlementFrameEvidence>;
  error?: string;
}>;

/**
 * Per-frame evidence for the flash probe (16h check-in 2 item 2). A
 * `blankFrame` is a frame whose live group is empty while the last finished
 * build drew something: a settlement that vanished. Must stay 0.
 */
export interface SettlementFrameEvidence {
  frames: number;
  blankFrames: number;
  /** Finished builds swapped in. */
  swaps: number;
  /** Finished builds that resolved exactly what was live and were dropped. */
  skippedSwaps: number;
  liveChildren: number;
}

export interface SettlementLayerProps {
  baseUrl: string;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  groundAt: TerrainHeight;
  quality?: { architectureDrawScale?: number };
  /** Injected world state; no app singleton leaks into the reusable layer. */
  /** `epochMinutes` is the Module 55 world clock; the layer reads the sun's
   * altitude from it (the night windows ramp on twilight, not a clock hour). */
  /** `windDirXZ`/`windSpeedMS` (the weather sample's wind) drive the chimney
   * smoke's drift; absent, the smoke drifts on `SMOKE_CALM_WIND`. */
  environment?: () => {
    rainIntensity: number; epochMinutes: number;
    windDirXZ?: readonly [number, number]; windSpeedMS?: number;
  } | null;
  onSolids?: (solids: SettlementSolid[]) => void;
  onStats?: (stats: SettlementRenderStats) => void;
  materialPatch?: (material: THREE.Material) => void;
  /** Injected probe handle (dev tooling only): the layer puts a "rebuild
   * now" function here, so the flash probe can force a rebuild without a
   * global. No control reaches the layer any other way. */
  rebuildRef?: React.MutableRefObject<(() => void) | null>;
  /** Receives the bundle's door records once it loads (0103 decision 4). */
  onDoors?: (doors: SettlementDoor[]) => void;
  /** The scene's shared kit cache (`kitCache.ts`); absent, the layer keeps its own. */
  kitCache?: import("./kitCache").KitCache;
  /** The scene's light fixtures (`lighting.ts`); absent, the layer makes its own. */
  lightFixtures?: import("./lighting").SettlementLightFixtures;
  /** Injected error channel (decision 0052 addendum 2026-09-28): the host shows
   * the layer's failure as a readable line; called with null once it clears. */
  onError?: (error: SettlementLayerError | null) => void;
  /** The scene's local still-water registry (`water/localSurfaces.ts`),
   * injected: each loaded place's `pools` are registered on load and cleared
   * when the place leaves the loaded set or the layer unmounts (`pools.ts`). */
  localSurfaces?: import("../water/localSurfaces").LocalWaterSurfaces;
}

/**
 * What the layer reports to its host. `fatal`: a bundle, kit manifest, schema,
 * collision-frame or geometry refusal, and the layer draws nothing. Not fatal:
 * an effect sprite (flame, smoke) failed to load, and the places draw without it.
 */
export interface SettlementLayerError {
  fatal: boolean;
  message: string;
}

/** What the runtime reads off a published kit manifest, per asset (16h item 1). */
export interface SettlementKitAssetMeta {
  designedSinkM?: {
    p25: number; p50: number; p75: number; n: number;
    slopeTermMPerDeg?: number;
    evidence: "plugin" | "mesh-sill" | "policy-fallback" | string;
  };
  designedWaterlineM?: number;
  anchorClass?: SettlementAnchorClass;
  /** The fit the manifest records (`placement.evidence.policyId`): the same
   * field the compile's `fit_slope_failure` reads. `dug-in` anchors on the
   * lowest ground under the footprint (97 §C); every other fit on the mean. */
  fit?: string;
  /** The asset id (`vanilla:effects/fxfirewithembers01`): the fire preset reads it (fireTypes `firePresetFor`). */
  id?: string;
  /** The kit category (build_kit); window lights are architecture only. */
  category?: string;
  /** The mined Skyrim LIGH record placed with the piece (build_kit
   * apply_light_records), `offsetM` glTF Y-up metres from the pivot. */
  light?: SettlementKitLight;
  /** Effect-shader materials (flame and glow cards) the kit build exported
   * additive: the piece's own flame submesh. */
  additiveMaterials?: string[];
  /** Outward bearings of the piece's window-glow faces, north 0 clockwise
   * (x east, z south; build_kit glow_facings_from_faces). */
  glowFacingsDeg?: number[];
  /** The NIF's fire layer (build_kit mine_fire_layer, 16k walk 4): one sprite
   * per flame particle system or AddOnNode flame. */
  flames?: SettlementKitFlame[];
  /** Billboard glow discs, drawn as camera-facing additive sprites. */
  glows?: SettlementKitGlow[];
  /** Additive materials that are real flame cards (fxfirewithembers01): the
   * piece needs no fallback flame sprite. */
  flameCardMaterials?: string[];
}

/** A kit manifest flame: a flipbook sprite at the emitter (glTF Y-up metres
 * from the pivot). `texture` is a works-v1 `effectTextures` id; `atlas` its
 * [cols, rows] grid, null for a single image; `frames` the cells played when
 * fewer than cols x rows; `fps` 0 for a still. */
export interface SettlementKitFlame {
  offsetM: [number, number, number];
  texture: string;
  atlas: [number, number] | null;
  frames?: number;
  fps: number;
  sizeM: number;
  source?: string;
}

/** A kit manifest glow disc: centre and edge measured on the dropped NIF shape. */
export interface SettlementKitGlow {
  offsetM: [number, number, number];
  texture: string;
  sizeM: number;
  /** The disc's offset toward the viewer along its billboard axis (campfire 0.84 m). */
  towardCameraM?: number;
  /** The NIF shader's emissive colour (linear 0..1) when it is not white: the
   * evil welkynd cluster's red. Absent: the fire colour `FIXTURE_LIGHT_RGB`. */
  tintRgb?: [number, number, number];
}

/** A kit manifest `light` block: the carriedLight `LightRecord` shape plus the emitter offset. */
export interface SettlementKitLight {
  formId: string;
  burnSeconds: number;
  radiusUnits: number;
  colourRgb: [number, number, number];
  flicker?: { frequency: number; intensityAmplitude: number; movementAmplitude: number };
  flags: string[];
  offsetM?: [number, number, number];
  /** What the fixture is (kit config, mined with the record): brazier, cook-fire,
   * forge and campfire burn by day too (lighting.ts `ALWAYS_LIT_KINDS`). */
  fixtureKind?: string;
}

/**
 * What a kit's glTF material record may carry in its `extras` (on
 * `material.userData` once loaded). `decal`: the NIF shader flags DECAL or
 * DYNAMIC_DECAL were set, so the material is a coplanar overlay drawn with a
 * depth bias (materials.ts applySettlementDecal). Absent means not a decal.
 */
export interface SettlementKitMaterialExtras {
  decal?: true;
  /** Still water held in a piece (NIF water shader), build_kit extras. */
  water?: boolean;
  /** An effect-shader card (flame, glow overlay) of an `"effect": "additive"`
   * piece: drawn unlit and additive, no shadow (materials.ts). */
  additive?: boolean;
  /** An additive card's gain: its NIF shape's emissive multiple (build_kit
   * apply_additive_gains; materials.ts additiveGain). */
  gain?: number;
}

/** kit id -> asset id -> manifest metadata. */
export type SettlementKitManifests = ReadonlyMap<string, ReadonlyMap<string, SettlementKitAssetMeta>>;
