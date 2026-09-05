import * as THREE from "three";

import type { HurtboxBone } from "./hurtbox";

/**
 * Arrows left standing in whatever they hit.
 *
 * An arrow that reaches a body stops being a physics object and becomes part of
 * that body: parented to the bone it struck, it follows the limb through every
 * animation for free, with no per-frame cost and no chance of shoving the
 * target around. That last part is not cosmetic — a solid projectile left in the
 * world keeps pushing whatever it is touching, which is what made shot enemies
 * slide sideways.
 *
 * Deliberately imperative and free of React: these are decorations on a
 * skeleton, and giving each one component state would cost a render per hit.
 */

/** How many shafts one actor carries before the oldest is pulled out. */
export const MAX_STUCK_ARROWS_PER_ACTOR = 10;

/** Arrows currently standing in each bone's owner, oldest first. */
const stuckByActor = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

/** The root an actor's bones hang from, used to group its arrows. */
function actorRootOf(bone: THREE.Object3D) {
  let node: THREE.Object3D = bone;
  while (node.parent) node = node.parent;
  return node;
}

/**
 * The hurtbox segment nearest a world-space point.
 *
 * Which body part a hit *counts* as — head, thigh, torso — for damage and the
 * reaction it provokes. Nearest capsule centre, radius allowed for, so a thin
 * forearm passing near the point does not beat the torso behind it.
 *
 * Deliberately not the same question as *where the shaft ends up*: that is
 * `resolveArrowPlant`, which walks the flight line onto the body's surface.
 * Keeping the two apart is what lets the shaft be planted properly without
 * quietly re-deciding what an arrow through a shoulder does to a fighter.
 */
export function nearestHurtboxBone(
  segments: readonly HurtboxBone[] | null,
  point: THREE.Vector3,
): HurtboxBone | null {
  if (!segments || segments.length === 0) return null;
  const centre = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let best: HurtboxBone | null = null;
  let bestDistance = Infinity;
  for (const segment of segments) {
    segment.bone.updateWorldMatrix(true, false);
    from.copy(segment.from).applyMatrix4(segment.bone.matrixWorld);
    to.copy(segment.to).applyMatrix4(segment.bone.matrixWorld);
    centre.addVectors(from, to).multiplyScalar(0.5);
    const distance = centre.distanceTo(point) - segment.radius;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = segment;
    }
  }
  return best;
}

/**
 * Leave `object` standing in `bone`, at the world pose it arrived with.
 *
 * `worldPoint` is a point on the target's *surface* — `resolveArrowPlant`
 * works it out from the flight line, because the sensor overlap that reports
 * the hit arrives a step late and the arrow's own position by then can be a
 * good way clear of the body. The shaft is then pushed a little further along
 * its own axis so the head disappears into the target rather than floating
 * against the skin.
 */
export function stickArrow(
  bone: THREE.Object3D,
  object: THREE.Object3D,
  worldPoint: THREE.Vector3,
  worldQuaternion: THREE.Quaternion,
  embedMeters = 0.12,
) {
  bone.updateWorldMatrix(true, false);
  const inverse = new THREE.Matrix4().copy(bone.matrixWorld).invert();

  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion);
  const embedded = worldPoint.clone().addScaledVector(forward, embedMeters);

  const pose = new THREE.Matrix4().compose(embedded, worldQuaternion, ONE);
  pose.premultiply(inverse);
  pose.decompose(object.position, object.quaternion, object.scale);

  object.matrixAutoUpdate = true;
  bone.add(object);

  const actor = actorRootOf(bone);
  const standing = stuckByActor.get(actor) ?? [];
  standing.push(object);
  while (standing.length > MAX_STUCK_ARROWS_PER_ACTOR) {
    standing.shift()?.removeFromParent();
  }
  stuckByActor.set(actor, standing);
}

/** Pull every arrow out of an actor, for a reset or a respawn. */
export function clearStuckArrows(bone: THREE.Object3D) {
  const actor = actorRootOf(bone);
  for (const arrow of stuckByActor.get(actor) ?? []) arrow.removeFromParent();
  stuckByActor.delete(actor);
}

const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Is this rigid body an actor's *navigation* capsule?
 *
 * Arrows must ignore them. The navigation capsule is a suspension and
 * collision shape for walking, not a combat volume — the animation playbook is
 * explicit that the two are separate — and the skeleton-fitted hurtbox beside
 * it is what an arrow is actually supposed to find. Letting a shaft be stopped
 * or deflected by the capsule both steals hits from the hurtbox and leaves the
 * arrow resting against a moving body.
 *
 * Named rather than group-filtered because the capsules are created by the
 * controller, which does not expose their collision groups. The convention is
 * one line, here, rather than a magic string in every scene: an actor capsule
 * is named for the actor, and every combat *sensor* carries a suffix.
 */
/**
 * A skeletal (or capsule) hurtbox — the only sensors an arrow may strike.
 * Weapon hitboxes and parry volumes are sensors too, and an arrow that
 * "hit" the archer's own bow volume the frame it spawned was the reported
 * shaft frozen in mid-air in front of the archer.
 */
export function isActorHurtboxName(name: string | null | undefined): boolean {
  return Boolean(name?.endsWith("-hurtbox"));
}

export function isActorCapsuleName(name: string | undefined): boolean {
  if (!name) return false;
  if (name.endsWith("-hurtbox") || name.endsWith("-weapon") || name.includes("parry-shield")) {
    return false;
  }
  return name === "player" || /^enemy-\d+$/.test(name);
}
