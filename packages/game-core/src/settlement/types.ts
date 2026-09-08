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

export interface SettlementPlacement {
  id: string;
  sourceId: string;
  kind: "settlement" | "dressing" | "route-structure";
  assetId: string;
  kit: string;
  positionM: [number, number, number];
  yawDeg: number;
  scale: number;
  footprintM: [number, number][];
  anchor: SettlementAnchor;
  collision: { frame: string; kind: string };
}

export interface GroundTreatment {
  id: string;
  footprintM: [number, number][];
  contactAoWidthM: number;
  baseSkirtWidthM: number;
  foundationScatterBandM: [number, number];
  farTier: false;
}

export interface SettlementBundle {
  schemaVersion: 1;
  collisionFrame: string;
  lod: {
    tiers: number;
    absoluteTriangleFloor: [number, number];
    distancePerFootprintDiagonal: [number, number];
    farMergeDistanceM: number;
    atlasMaxSize: number;
  };
  kits: Record<string, { id: string; glb: string; manifest: string }>;
  placements: SettlementPlacement[];
  groundTreatments: GroundTreatment[];
  stats: { settlements: number; settlementPlacements: number; routeStructurePlacements: number };
}

export type TerrainHeight = (x: number, z: number) => number | null;

export interface SettlementCollisionPart {
  halfExtentsM: [number, number, number];
  offsetM: [number, number, number];
}

export interface SettlementSolid {
  id: string;
  frame: typeof SETTLEMENT_COLLISION_FRAME;
  position: [number, number, number];
  yaw: number;
  scale: number;
  parts: SettlementCollisionPart[];
}

export interface SettlementRenderStats {
  placements: number;
  draws: number;
  triangles: number;
  colliderParts: number;
  farMergedInstances: number;
}

export interface SettlementLayerProps {
  baseUrl: string;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  groundAt: TerrainHeight;
  quality?: { architectureDrawScale?: number };
  /** Injected world state; no app singleton leaks into the reusable layer. */
  environment?: () => { rainIntensity: number; minuteOfDay: number } | null;
  onSolids?: (solids: SettlementSolid[]) => void;
  onStats?: (stats: SettlementRenderStats) => void;
  materialPatch?: (material: THREE.Material) => void;
}
