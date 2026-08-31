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
  collisionCapsule?: {
    radiusM: number;
    heightM: number;
    centreOffsetM: [number, number];
  };
  collisionBox?: {
    halfExtentsM: [number, number, number];
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
 * The collider for one species, in instance-local metres (multiply by the
 * instance scale at spawn). Returns null where the species is walk-through or
 * the manifest carries no usable shape.
 *
 * Axis note, and it is the easy mistake: the kit manifest is **z-up** (Blender
 * source space) while the runtime is **y-up**. A capsule's `centreOffsetM` is
 * the [x, y] pair in source space, which is [x, z] in world space, and the
 * capsule stands along world Y.
 */
export function colliderFor(
  asset: FloraCollisionAsset | undefined,
): FloraCollider | null {
  if (!isSolid(asset) || !asset) return null;
  if (asset.collisionCapsule) {
    const { radiusM, heightM, centreOffsetM } = asset.collisionCapsule;
    if (!(radiusM > 0) || !(heightM > 0)) return null;
    return {
      kind: "capsule",
      radiusM,
      heightM,
      // Half the height up, because the capsule is measured from the base and
      // Rapier centres its shapes.
      offsetM: [centreOffsetM[0], heightM / 2, centreOffsetM[1]],
    };
  }
  if (asset.collisionBox) {
    const { halfExtentsM, centreOffsetM } = asset.collisionBox;
    if (!halfExtentsM.every((h) => h > 0)) return null;
    return {
      kind: "box",
      // z-up half extents -> y-up.
      halfExtentsM: [halfExtentsM[0], halfExtentsM[2], halfExtentsM[1]],
      offsetM: [centreOffsetM[0], centreOffsetM[2], centreOffsetM[1]],
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
  scale: number;
}

/**
 * Choose the instances to give colliders this frame: the nearest `limit`
 * solid ones within `radiusM` of the focus.
 *
 * Colliders exist for the handful of things the player might actually walk
 * into. Building them for whole chunks would be thousands of fixed bodies for
 * a forest the player crosses in a minute — the cost that makes solidity
 * unaffordable, and the reason this is a small moving ring rather than a
 * property of the bundle.
 */
export function selectNearestSolids(
  instances: readonly SolidInstance[],
  focus: { x: number; z: number },
  radiusM: number,
  limit: number,
): SolidInstance[] {
  const withinRange: { instance: SolidInstance; distanceSq: number }[] = [];
  const maxSq = radiusM * radiusM;
  for (const instance of instances) {
    const dx = instance.x - focus.x;
    const dz = instance.z - focus.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq <= maxSq) withinRange.push({ instance, distanceSq });
  }
  withinRange.sort((a, b) => a.distanceSq - b.distanceSq);
  return withinRange.slice(0, limit).map((entry) => entry.instance);
}
