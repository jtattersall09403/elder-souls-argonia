/**
 * Which placed plants and rocks are SOLID, and what shape stands in for them.
 *
 * The rule follows the source games (owner ruling, Phase 10 round 5): in
 * Skyrim and Morrowind you walk around a trunk and a boulder, and straight
 * through reeds, ferns, grass and lily pads. Nothing here is a physics
 * decision so much as a world-feel one, which is why it is data-driven off
 * the kit manifest's `collision` field rather than a hand-kept species list —
 * a species added to a palette next month gets the right answer for free.
 *
 * Pure functions over the manifest: no three.js, no Rapier, no React, so the
 * rule can be tested directly and reused by the game as well as the studio.
 */

/** Collision proxy the runtime should build for one instance. */
export type FloraCollider =
  | {
      kind: "capsule";
      /** Metres, at instance scale 1. */
      radiusM: number;
      /** Total height of the capsule, metres, at instance scale 1. */
      heightM: number;
      /** Offset from the instance PIVOT, world axes (x, y, z), metres. */
      offsetM: [number, number, number];
    }
  | {
      kind: "box";
      halfExtentsM: [number, number, number];
      offsetM: [number, number, number];
    };

export interface FloraCollisionAsset {
  id: string;
  /** Kit source space is z-up: sizeM = [x, y, height]. */
  sizeM: [number, number, number];
  collision?: string;
  /**
   * Contract tag for the collision offsets. `pivot-yup-v2` means every
   * offset is PIVOT-relative in world (glTF Y-up) axes, directly addable to
   * the instance position before yaw. Round 5 shipped capsule offsets
   * bbox-centre-relative in Blender z-up while the runtime read them as
   * pivot-relative — metres of solid air beside passable trunks — so an
   * untagged kit now gets NO colliders rather than misplaced ones.
   */
  collisionFrame?: string;
  collisionCapsule?: {
    radiusM: number;
    heightM: number;
    /** Pivot -> capsule BOTTOM, world axes. */
    baseOffsetM: [number, number, number];
  };
  /**
   * A CHAIN of capsules following a trunk that leans or curves, bottom to top.
   * One upright capsule cannot describe the Anvil canopy tree, whose trunk
   * wanders ~14 m sideways over its 34 m: the owner walked through the parts
   * the cylinder missed (round 7). Emitted only where the trunk is its own
   * mesh and can be measured band by band — for an ordinary straight tree the
   * single capsule is right and stays. Preferred over `collisionCapsule` when
   * present; the capsule remains as the fallback.
   */
  collisionSegments?: {
    radiusM: number;
    heightM: number;
    /** Pivot -> segment CENTRE, world axes. */
    centreOffsetM: [number, number, number];
  }[];
  collisionBox?: {
    halfExtentsM: [number, number, number];
    /** Pivot -> box centre, world axes. */
    centreOffsetM: [number, number, number];
  };
}

/**
 * `collision` values the kit builder emits that mean "the player cannot pass
 * through this". Everything else — the ferns, reeds, grasses, mushrooms,
 * groundcover, lily pads and the hanging accents — is scenery you wade
 * through, and `none` explicitly includes the open-backed cliff dressing
 * shell, which has no honest solid volume to give.
 */
const SOLID_COLLISION_KINDS = new Set(["trunk-capsule", "convex"]);

export function isSolid(asset: FloraCollisionAsset | undefined): boolean {
  return !!asset && SOLID_COLLISION_KINDS.has(asset.collision ?? "none");
}

/**
 * Every collider for one species, in instance-local metres (multiply by the
 * instance scale at spawn, and rotate each `offsetM` by the instance rotation
 * — offsets are pivot-relative in the asset's UNROTATED local frame).
 *
 * Usually one shape; a leaning or curved trunk returns a chain of capsules
 * following its axis. Empty where the species is walk-through or the manifest
 * carries no usable shape, including any kit still on the pre-v2 frame.
 */
export function collidersFor(
  asset: FloraCollisionAsset | undefined,
): FloraCollider[] {
  if (!isSolid(asset) || !asset) return [];
  if (asset.collisionFrame !== "pivot-yup-v2") return [];
  const segments = asset.collisionSegments;
  if (segments?.length) {
    const chain = segments
      .filter((s) => s.radiusM > 0 && s.heightM > 0)
      .map((s): FloraCollider => ({
        kind: "capsule",
        radiusM: s.radiusM,
        heightM: s.heightM,
        // Already a centre, unlike the single capsule's base offset.
        offsetM: [s.centreOffsetM[0], s.centreOffsetM[1], s.centreOffsetM[2]],
      }));
    if (chain.length) return chain;
  }
  const single = colliderFor(asset);
  return single ? [single] : [];
}

/**
 * The single fallback shape for one species — the trunk capsule or the box.
 * Prefer `collidersFor`, which also handles curved trunks; this is exported
 * for the cases that genuinely want one shape (and for its own tests).
 */
export function colliderFor(
  asset: FloraCollisionAsset | undefined,
): FloraCollider | null {
  if (!isSolid(asset) || !asset) return null;
  if (asset.collisionFrame !== "pivot-yup-v2") return null;
  if (asset.collisionCapsule) {
    const { radiusM, heightM, baseOffsetM } = asset.collisionCapsule;
    if (!(radiusM > 0) || !(heightM > 0)) return null;
    return {
      kind: "capsule",
      radiusM,
      heightM,
      // Half the height up, because the offset points at the capsule BOTTOM
      // and Rapier centres its shapes.
      offsetM: [baseOffsetM[0], baseOffsetM[1] + heightM / 2, baseOffsetM[2]],
    };
  }
  if (asset.collisionBox) {
    const { halfExtentsM, centreOffsetM } = asset.collisionBox;
    if (!halfExtentsM.every((h) => h > 0)) return null;
    return {
      kind: "box",
      halfExtentsM: [halfExtentsM[0], halfExtentsM[1], halfExtentsM[2]],
      offsetM: [centreOffsetM[0], centreOffsetM[1], centreOffsetM[2]],
    };
  }
  return null;
}

/** One instance the collider ring should make solid. */
export interface SolidInstance {
  species: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Slope-alignment tilts (rocks) — a box collider must lie as the mesh lies. */
  tiltX: number;
  tiltZ: number;
  scale: number;
}

/**
 * Choose the instances to give colliders this frame: the nearest solid ones
 * within `radiusM` of the focus, until `budget` is spent.
 *
 * Colliders exist for the handful of things the player might actually walk
 * into. Building them for whole chunks would be thousands of fixed bodies for
 * a forest the player crosses in a minute — the cost that makes solidity
 * unaffordable, and the reason this is a small moving ring rather than a
 * property of the bundle.
 *
 * `costOf` lets the budget be counted in COLLIDERS rather than instances,
 * which is what actually costs: a curved trunk is a chain of up to sixteen
 * capsules, a pebble is one.
 *
 * The returned `coveredRadiusM` is the guarantee the caller needs — every
 * solid nearer than it has a collider. Round 8: the ring was 45 m wide with a
 * flat budget of 96 instances, but jungle thickets hold up to 1,411 solids
 * inside 45 m, so the budget ran out ~12 m from the player while the rebuild
 * only triggered after they had walked 12 m. They spent much of their time
 * outside the collided set entirely, walking through trunks.
 */
export function selectNearestSolids(
  instances: readonly SolidInstance[],
  focus: { x: number; z: number },
  radiusM: number,
  budget: number,
  costOf: (instance: SolidInstance) => number = () => 1,
  maxCount = Number.POSITIVE_INFINITY,
): { chosen: SolidInstance[]; coveredRadiusM: number } {
  const withinRange: { instance: SolidInstance; distanceSq: number }[] = [];
  const maxSq = radiusM * radiusM;
  for (const instance of instances) {
    const dx = instance.x - focus.x;
    const dz = instance.z - focus.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq <= maxSq) withinRange.push({ instance, distanceSq });
  }
  withinRange.sort((a, b) => a.distanceSq - b.distanceSq);
  const chosen: SolidInstance[] = [];
  let spent = 0;
  let coveredRadiusM = radiusM;
  for (const entry of withinRange) {
    const cost = Math.max(1, costOf(entry.instance));
    if (spent + cost > budget || chosen.length >= maxCount) {
      // Everything past here is unaffordable, so cover is honestly only as
      // far as the last one taken.
      coveredRadiusM = Math.sqrt(entry.distanceSq);
      break;
    }
    spent += cost;
    chosen.push(entry.instance);
  }
  return { chosen, coveredRadiusM };
}
