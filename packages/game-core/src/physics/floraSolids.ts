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
      /** Half-length of the CORE segment (caps excluded), Rapier convention. */
      halfHeightM: number;
      /** Capsule centre, offset from the instance PIVOT, local axes, metres. */
      offsetM: [number, number, number];
      /** Local rotation taking +Y onto the capsule axis, as [x, y, z, w]. */
      rotation: [number, number, number, number];
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
   * Contract tag for the collision shapes. `pivot-yup-v3` means offsets are
   * PIVOT-relative in local glTF Y-up axes, and `collisionSegments` are
   * ORIENTED capsules (`{radiusM, aM, bM}`, core-segment endpoints) fitted to
   * the real wood geometry by `pipeline/trunk_solids.py`. The v2 tracked
   * chain could not describe a multi-stemmed willow or a strongly leaning
   * palm (owner walked through both, Phase 10 round 10), so an old-frame kit
   * gets NO colliders rather than wrong ones — same policy as v1 → v2.
   */
  collisionFrame?: string;
  collisionCapsule?: {
    radiusM: number;
    heightM: number;
    /** Pivot -> capsule BOTTOM, local axes. */
    baseOffsetM: [number, number, number];
  };
  /**
   * Capsules moulded to the trunk and every major limb: `aM`/`bM` are the
   * core-segment endpoints (pivot-relative, Y-up), so a capsule may lean at
   * any angle. Preferred over `collisionCapsule` when present; the single
   * capsule remains as the fallback for species without separable wood parts.
   */
  collisionSegments?: {
    radiusM: number;
    aM: [number, number, number];
    bM: [number, number, number];
  }[];
  collisionBox?: {
    halfExtentsM: [number, number, number];
    /** Pivot -> box centre, local axes. */
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

const COLLISION_FRAME = "pivot-yup-v3";

export function isSolid(asset: FloraCollisionAsset | undefined): boolean {
  return !!asset && SOLID_COLLISION_KINDS.has(asset.collision ?? "none");
}

/** Quaternion [x, y, z, w] rotating +Y onto the (normalised) direction. */
function yTo(direction: [number, number, number]): [number, number, number, number] {
  const [dx, dy, dz] = direction;
  // cross(Y, d) with half-angle construction: q = (cross, 1 + dot), normalised.
  const x = dz;
  const z = -dx;
  const w = 1 + dy;
  if (w < 1e-8) return [1, 0, 0, 0]; // straight down: half-turn about X
  const n = Math.hypot(x, z, w);
  // `|| 0` normalises the -0 a negative component divides down to.
  return [x / n || 0, 0, z / n || 0, w / n];
}

/**
 * Every collider for one species, in instance-local metres (multiply lengths
 * and offsets by the instance scale at spawn; the whole set then rotates with
 * the instance's own rotation — offsets are pivot-relative in the asset's
 * UNROTATED local frame).
 *
 * A tree returns the capsule set moulded to its wood; a rock its box. Empty
 * where the species is walk-through or the manifest carries no usable shape,
 * including any kit still on a pre-v3 frame.
 */
export function collidersFor(
  asset: FloraCollisionAsset | undefined,
): FloraCollider[] {
  if (!isSolid(asset) || !asset) return [];
  if (asset.collisionFrame !== COLLISION_FRAME) return [];
  const segments = asset.collisionSegments;
  if (segments?.length) {
    const shapes: FloraCollider[] = [];
    for (const s of segments) {
      if (!(s.radiusM > 0)) continue;
      const d: [number, number, number] = [
        s.bM[0] - s.aM[0], s.bM[1] - s.aM[1], s.bM[2] - s.aM[2],
      ];
      const length = Math.hypot(d[0], d[1], d[2]);
      shapes.push({
        kind: "capsule",
        radiusM: s.radiusM,
        // Endpoints are the core segment; Rapier's half-height excludes caps.
        halfHeightM: Math.max(0.02, length / 2),
        offsetM: [
          (s.aM[0] + s.bM[0]) / 2,
          (s.aM[1] + s.bM[1]) / 2,
          (s.aM[2] + s.bM[2]) / 2,
        ],
        rotation:
          length < 1e-6
            ? [0, 0, 0, 1]
            : yTo([d[0] / length, d[1] / length, d[2] / length]),
      });
    }
    if (shapes.length) return shapes;
  }
  const single = colliderFor(asset);
  return single ? [single] : [];
}

/**
 * The single fallback shape for one species — the trunk capsule or the box.
 * Prefer `collidersFor`, which also handles the moulded capsule sets; this is
 * exported for the cases that genuinely want one shape (and for its tests).
 */
export function colliderFor(
  asset: FloraCollisionAsset | undefined,
): FloraCollider | null {
  if (!isSolid(asset) || !asset) return null;
  if (asset.collisionFrame !== COLLISION_FRAME) return null;
  if (asset.collisionCapsule) {
    const { radiusM, heightM, baseOffsetM } = asset.collisionCapsule;
    if (!(radiusM > 0) || !(heightM > 0)) return null;
    return {
      kind: "capsule",
      radiusM,
      // Subtract the caps: a full-height core would stand taller than the
      // trunk and the player bumps into thin air above it.
      halfHeightM: Math.max(0.05, heightM / 2 - radiusM),
      // Half the height up, because the offset points at the capsule BOTTOM
      // and Rapier centres its shapes.
      offsetM: [baseOffsetM[0], baseOffsetM[1] + heightM / 2, baseOffsetM[2]],
      rotation: [0, 0, 0, 1],
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
 * which is what actually costs: a moulded willow is dozens of capsules, a
 * pebble is one.
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
