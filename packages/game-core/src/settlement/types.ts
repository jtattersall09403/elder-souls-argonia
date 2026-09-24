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
  kind: "settlement" | "dressing" | "landmark" | "fence" | "dock" | "route-structure";
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
  collision: {
    frame: string;
    kind: string;
    /** Measured source-pivot proxies win over render-geometry bounds. */
    parts?: SettlementCollisionPart[];
    proxySource?: "measured-manifest-box";
  };
}

/** A building footprint row. The runtime draws nothing from it (the
 * wall-foot skirt and the rubble ring are cut, 16h check-in 2 ruling 1);
 * the groundcover reads `footprintM` as the grass exclusion. */
export interface GroundTreatment {
  id: string;
  footprintM: [number, number][];
}

export interface SettlementBundle {
  schemaVersion: 2;
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
  }[];
  placements: SettlementPlacement[];
  groundTreatments: GroundTreatment[];
  stats: { settlements: number; settlementPlacements: number; routeStructurePlacements: number };
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
  environment?: () => { rainIntensity: number; epochMinutes: number } | null;
  onSolids?: (solids: SettlementSolid[]) => void;
  onStats?: (stats: SettlementRenderStats) => void;
  materialPatch?: (material: THREE.Material) => void;
  /** Injected probe handle (dev tooling only): the layer puts a "rebuild
   * now" function here, so the flash probe can force a rebuild without a
   * global. No control reaches the layer any other way. */
  rebuildRef?: React.MutableRefObject<(() => void) | null>;
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
}

/** kit id -> asset id -> manifest metadata. */
export type SettlementKitManifests = ReadonlyMap<string, ReadonlyMap<string, SettlementKitAssetMeta>>;
