import type { Vec3, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";

/**
 * What the player's movement needs from the world's water (decision 0093): the
 * `sample` half of the one water contract. The world studio passes its
 * `WaterWorld` unchanged; the combat sandbox passes {@link flatPoolSampler}.
 */
export type WaterSampler = Pick<WorldWaterQuery, "sample">;

/**
 * Height of the body column an immersion value is measured over, metres.
 * `WaterSample.immersion` is the fraction of a 1.7 m column under water whose
 * TOP is the query position: `WaterWorld.sample` computes
 * (surface − y) / 1.7 + 1, clamped to 0..1. So a caller asks at the top of the
 * body (feet + 1.7 m, `locomotion/swim`'s SWIM_SAMPLE_ABOVE_BODY_CENTRE), and
 * 0.62 means water 1.05 m deep at the feet. A second sampler answers the same
 * question or the sandbox and the world disagree about when a body swims.
 */
export const IMMERSION_COLUMN_METRES = 1.7;

/** Immersion at a query position under a still surface, as `WaterWorld` computes it. */
export function immersionAt(surfaceHeight: number, positionY: number): number {
  return Math.max(0, Math.min(1, (surfaceHeight - positionY) / IMMERSION_COLUMN_METRES + 1));
}

export type FlatPoolBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** World Y of the still water surface. */
  surfaceY: number;
  /** World Y of the pool floor. */
  floorY: number;
};

const UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });
const STILL: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const NO_HAZARDS: string[] = [];

/** The id a flat pool reports as its water body. */
export const FLAT_POOL_BODY_ID = "flat-pool";

/**
 * A rectangle of still water over a flat floor: a test fixture and the combat
 * sandbox's pool. Inside the rectangle it answers as `WaterWorld` does for still
 * water; outside it returns `WaterWorld`'s dry sample (no body, zero depth and
 * immersion, the surface height still reported).
 */
export function flatPoolSampler(bounds: FlatPoolBounds): WaterSampler {
  const depth = bounds.surfaceY - bounds.floorY;
  return {
    sample(position: Vec3): WaterSample {
      const inside = position.x >= bounds.minX && position.x <= bounds.maxX
        && position.z >= bounds.minZ && position.z <= bounds.maxZ;
      return {
        waterBodyId: inside ? FLAT_POOL_BODY_ID : null,
        surfaceHeight: bounds.surfaceY,
        surfaceNormal: UP,
        flowVelocity: STILL,
        depth: inside ? depth : 0,
        immersion: inside ? immersionAt(bounds.surfaceY, position.y) : 0,
        turbidity: 0,
        salinity: 0,
        temperature: 24,
        hazardIds: NO_HAZARDS,
      };
    },
  };
}

/**
 * Whether a point is under water: inside a water body and below its surface.
 * What a carried light asks (decision 0091) and what a breath clock will ask.
 */
export function submergedAt(sampler: WaterSampler, position: Vec3): boolean {
  const sample = sampler.sample(position, 0);
  return sample.waterBodyId !== null && position.y < sample.surfaceHeight;
}
