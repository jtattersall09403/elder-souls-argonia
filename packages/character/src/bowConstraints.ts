import * as THREE from "three";

/** Rotate a sourced limb onto a world target, retaining its authored bend plane. */
export function constrainDrawingHand(hand: THREE.Object3D, target: THREE.Vector3) {
  const forearm = hand.parent;
  const upper = forearm?.parent;
  if (!forearm || !upper?.parent) return;
  // Twist helpers may sit between joints: use the rig's anatomical chain.
  let elbow: THREE.Object3D | null = hand.parent;
  while (elbow && !/Forearm_Lar/.test(elbow.name)) elbow = elbow.parent;
  let shoulder: THREE.Object3D | null = elbow?.parent ?? null;
  while (shoulder && !/UpperArm_Uar/.test(shoulder.name)) shoulder = shoulder.parent;
  if (!elbow || !shoulder) return;
  shoulder.updateWorldMatrix(true, true);
  const a = shoulder.getWorldPosition(new THREE.Vector3());
  const b = elbow.getWorldPosition(new THREE.Vector3());
  const c = hand.getWorldPosition(new THREE.Vector3());
  const upperLength = a.distanceTo(b), lowerLength = b.distanceTo(c);
  const direction = target.clone().sub(a);
  const length = THREE.MathUtils.clamp(direction.length(), Math.abs(upperLength - lowerLength) + 1e-4, upperLength + lowerLength - 1e-4);
  direction.normalize();
  const pole = b.clone().sub(a).addScaledVector(direction, -b.clone().sub(a).dot(direction));
  if (pole.lengthSq() < 1e-8) return;
  pole.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + length ** 2) / (2 * length);
  const desiredElbow = a.clone().addScaledVector(direction, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
  rotateBoneToward(shoulder, b.sub(a), desiredElbow.clone().sub(a));
  shoulder.updateWorldMatrix(true, true);
  const newElbow = elbow.getWorldPosition(new THREE.Vector3());
  rotateBoneToward(elbow, hand.getWorldPosition(new THREE.Vector3()).sub(newElbow), target.clone().sub(newElbow));
  elbow.updateWorldMatrix(true, true);
}

export function rotateBoneToward(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  if (!bone.parent || from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
}
