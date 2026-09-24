import type { FlatPoolBounds } from "../physics/waterSampler";

/**
 * The combat sandbox's swimming pool (decision 0093), west of the arena: one
 * record read by the arena's geometry, the scene's water sampler and the
 * swim-cross scenario, so the three cannot drift apart.
 *
 * A sunken basin 10 m (x) by 8 m (z) whose east edge is the arena's west edge
 * (x = -15). Water stands 0.2 m below the arena floor over a floor 2.4 m below
 * it. At the west end the way out climbs from the floor to a deck level with
 * the arena floor.
 */
export const SANDBOX_POOL: FlatPoolBounds = {
  minX: -25,
  maxX: -15,
  minZ: -4,
  maxZ: 4,
  surfaceY: -0.2,
  floorY: -2.4,
};

/**
 * The way out, east to west: a ramp from the pool floor to a shelf 0.25 m
 * under the surface, the shelf, and a short ramp up to the deck. A swimmer
 * walks out on the lower ramp, where the water at its feet falls under 0.77 m
 * (immersion 0.45, `locomotion/swim`), and walks the rest as any grounded walk.
 */
export const SANDBOX_POOL_WAY_OUT: readonly { fromX: number; toX: number; fromY: number; toY: number }[] = [
  { fromX: -19.5, toX: -23, fromY: -2.4, toY: -0.45 },
  { fromX: -23, toX: -24, fromY: -0.45, toY: -0.45 },
  { fromX: -24, toX: -25, fromY: -0.45, toY: 0 },
];

/** The deck beyond the way out, level with the arena floor (y = 0). */
export const SANDBOX_POOL_DECK = { minX: -31, maxX: -25 } as const;
