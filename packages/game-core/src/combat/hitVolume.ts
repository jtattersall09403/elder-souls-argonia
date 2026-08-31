import { Box3, Matrix4 } from "three";
import type * as THREE from "three";

/**
 * The physical volume a held object occupies, and the sensor capsule combat
 * uses for it.
 *
 * One rule, two consumers. A swing's hitbox and a parry's catch window are both
 * "where is this object, actually" questions, and both used to be answered with
 * a hand-typed constant: a single 0.98 m capsule for every weapon from a dagger
 * to a warhammer, and a fixed 1.24 m box parked in front of the chest for every
 * parry regardless of what was in hand. That is why a greatsword hit at sword
 * range and a parry caught things the blade was nowhere near.
 *
 * Everything here is pure geometry on a measured bounding box, so it can be
 * fed either the pipeline's `sizeMeters` (design time, testable) or a box taken
 * from the loaded mesh (runtime, authoritative). No THREE, no physics engine.
 */

/** An axis-aligned box measured in the held object's own frame, metres. */
export type MeasuredBox = {
  /** Extent across the object: blade width, haft thickness, shield face. */
  readonly width: number;
  readonly height: number;
  /** Extent along the object's +Z, which is grip-to-tip for a weapon. */
  readonly length: number;
  /**
   * Where the near end of the object sits along +Z relative to its own origin.
   * Zero when the origin is the grip, which is how the pipeline lays weapons
   * out — but measured rather than assumed, because a shield's origin is its
   * boss and a mesh can be built either way round.
   */
  readonly minZ: number;
};

/** A capsule along the object's +Z axis, in the object's own frame. */
export type HitCapsule = {
  /** Distance from the object's origin to the capsule's centre, along +Z. */
  readonly centerOffset: number;
  /** Half the cylindrical section, excluding the end caps. */
  readonly halfLength: number;
  readonly radius: number;
};

/**
 * The thinnest a combat volume is allowed to be, in metres.
 *
 * A blade is a few millimetres thick and a sensor that thin is a sensor that
 * misses: contact is sampled at a fixed physics rate, and between two steps a
 * swinging edge sweeps far more than its own thickness. This is the smallest
 * radius that reliably reports through a body at the speeds the movesets run
 * at — it is a sampling allowance, not a claim about the steel.
 */
export const MIN_HIT_RADIUS_METERS = 0.055;

/**
 * The sensor capsule for a held object, from its measured box.
 *
 * The capsule wraps the *whole* object rather than a guessed blade portion. A
 * warhammer's damage is all in the head and a spear's is all at the point, but
 * which part of a swing connects is a question the moveset's reach and arc
 * already answer; the volume's job is only to be the size and place of the
 * thing being swung.
 */
export function hitCapsuleFor(box: MeasuredBox, margin = 0): HitCapsule {
  const radius = Math.max(MIN_HIT_RADIUS_METERS, Math.max(box.width, box.height) / 2) + margin;
  const length = Math.max(0, box.length) + margin * 2;
  const halfLength = Math.max(0, length / 2 - radius);
  return {
    centerOffset: box.minZ + box.length / 2,
    halfLength,
    radius,
  };
}

/**
 * How much wider than the object itself a parry catches, in metres.
 *
 * The owner's call, and it is a fairness allowance rather than a fudge: a parry
 * is a timing test, and asking for blade-to-blade contact within a 60 Hz step
 * turns it into a positioning test as well. Generous enough that a correctly
 * timed parry lands, tight enough that the volume is still recognisably the
 * thing on screen — which was the whole complaint about the old chest-box.
 */
export const PARRY_VOLUME_MARGIN_METERS = 0.16;

/** The catch volume for whatever is doing the parrying. */
export function parryCapsuleFor(box: MeasuredBox): HitCapsule {
  return hitCapsuleFor(box, PARRY_VOLUME_MARGIN_METERS);
}

/**
 * Measure a mounted object's box in its *own* frame.
 *
 * Not `Box3.setFromObject`, which reports a world-axis-aligned box: the whole
 * point is the box along the object's own grip-to-tip axis, whatever way the
 * hand is currently turned. Each geometry's bounds are brought back through the
 * object's inverse world matrix instead, which gives the same numbers in every
 * pose.
 */
export function measureHeldObject(object: THREE.Object3D): MeasuredBox {
  object.updateWorldMatrix(true, true);
  const toLocal = new Matrix4().copy(object.matrixWorld).invert();
  const box = new Box3();
  const scratch = new Box3();
  const transform = new Matrix4();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry;
    if (!geometry || !mesh.isMesh) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    scratch.copy(geometry.boundingBox);
    scratch.applyMatrix4(transform.multiplyMatrices(toLocal, mesh.matrixWorld));
    box.union(scratch);
  });
  if (box.isEmpty()) return { width: 0, height: 0, length: 0, minZ: 0 };
  return {
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    length: box.max.z - box.min.z,
    minZ: box.min.z,
  };
}

/**
 * Read a pipeline `sizeMeters` triple as a measured box.
 *
 * The pipeline reports extents, not bounds, so the near end is taken as the
 * origin: weapons are built with the grip there. Runtime callers that can see
 * the real mesh should measure it instead — this exists so the arsenal's
 * volumes can be reasoned about and tested without loading GLBs.
 */
export function boxFromSizeMeters(size: readonly [number, number, number]): MeasuredBox {
  return { width: size[0], height: size[1], length: size[2], minZ: 0 };
}
