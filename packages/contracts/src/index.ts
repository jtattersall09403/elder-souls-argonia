/**
 * @elder-souls/contracts — small stable cross-system interfaces.
 *
 * Types only; no runtime code beyond constants. Systems depend on these, never
 * on each other's internals (master plan §61). Grow this deliberately: add a
 * contract when a second consumer exists, not speculatively.
 */

// ---------------------------------------------------------------------------
// Core spatial conventions (docs/decisions/0003)
// ---------------------------------------------------------------------------

/** Metres, Y-up, right-handed; X east, Z south; sea level y = 0. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const SEA_LEVEL_Y = 0;

// ---------------------------------------------------------------------------
// Source provenance (master plan §13; docs/decisions/0002)
// ---------------------------------------------------------------------------

export type SourceConfidence =
  | "CANON_FIXED"
  | "OFFICIAL_MAP_DERIVED"
  | "GAME_DERIVED"
  | "LORE_INFERRED"
  | "COMMUNITY_CONSENSUS"
  | "PROJECT_REFERENCE"
  | "AGENT_AUTHORED"
  | "GENERATED";

export interface EraRange {
  /** e.g. "4E201"; open ranges may omit one bound. */
  from?: string;
  to?: string;
}

export interface CanonDatum<T> {
  value: T;
  era: EraRange;
  confidence: SourceConfidence;
  sources: string[];
  /** Metres of positional slack for spatial data. */
  spatialTolerance?: number;
  authorNotes?: string;
}

// ---------------------------------------------------------------------------
// Settlement anchors (master plan §14)
// ---------------------------------------------------------------------------

export interface SettlementAnchor {
  id: string;
  name: string;
  rank: "major" | "secondary";
  /**
   * Position as a fraction of the province heightfield extent:
   * u west→east in [0,1], v north→south in [0,1]. Converted to metres once the
   * province origin/scale is pinned (decisions 0003/0005).
   */
  u: number;
  v: number;
  /** Placement slack as a fraction of the province extent. */
  toleranceUV: number;
  confidence: SourceConfidence;
  sources: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Environment and water queries (master plan §38, §61)
// ---------------------------------------------------------------------------

export interface WaterSample {
  waterBodyId: string | null;
  surfaceHeight: number;
  surfaceNormal: Vec3;
  flowVelocity: Vec3;
  depth: number;
  /** 0 dry → 1 fully submerged, measured at the query position. */
  immersion: number;
  turbidity: number;
  salinity: number;
  temperature: number;
  hazardIds: string[];
}

export interface EnvironmentContact {
  groundMaterial?: string;
  supportNormal?: Vec3;
  water?: WaterSample;
  mudDepth: number;
  biomeId: string;
  regionId: string;
  hazardIds: string[];
}

// ---------------------------------------------------------------------------
// Locomotion (master plan §43)
// ---------------------------------------------------------------------------

export type LocomotionMode =
  | "grounded"
  | "airborne"
  | "surfaceSwim"
  | "submergedSwim"
  | "climb"
  | "boat"
  | "rootwormTransit";

export type CapabilityProfileId =
  | "minimumPlayable"
  | "baselineHuman"
  | "baselineArgonian"
  | "trainedSwimmer"
  | "advancedClimber"
  | "highBurden"
  | "boatSmall"
  | "boatCargo";
