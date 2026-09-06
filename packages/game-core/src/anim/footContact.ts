import { Object3D, Quaternion, Vector3 } from "three";

export type FootContactChain = { hip: Object3D; knee: Object3D; foot: Object3D };

/** Resolve the anatomical chain through optional twist-helper bones. */
export function footContactChain(foot: Object3D): FootContactChain | null {
  let knee = foot.parent;
  while (knee && !/Calf_Clf/.test(knee.name)) knee = knee.parent;
  let hip = knee?.parent ?? null;
  while (hip && !/Thigh_Thg/.test(hip.name)) hip = hip.parent;
  return hip && knee ? { hip, knee, foot } : null;
}

/** Correct a penetrating foot without translating the pelvis or changing its
 * authored orientation. The knee retains the sourced bend plane. Callers
 * restore the saved local rotations before evaluating the next source pose.
 */
export function liftFootContact(
  { hip, knee, foot }: FootContactChain,
  liftMeters: number,
  saved: Map<Object3D, Quaternion>,
) {
  if (!(liftMeters > 0) || !hip.parent) return;
  hip.updateWorldMatrix(true, true);
  const a = hip.getWorldPosition(new Vector3());
  const b = knee.getWorldPosition(new Vector3());
  const c = foot.getWorldPosition(new Vector3());
  const orientation = foot.getWorldQuaternion(new Quaternion());
  const target = c.clone().add(new Vector3(0, liftMeters, 0));
  const upperLength = a.distanceTo(b), lowerLength = b.distanceTo(c);
  const direction = target.clone().sub(a);
  const length = Math.min(upperLength + lowerLength - 1e-6,
    Math.max(Math.abs(upperLength - lowerLength) + 1e-6, direction.length()));
  if (!(upperLength > 0 && lowerLength > 0 && length > 0)) return;
  direction.normalize();
  const pole = b.clone().sub(a);
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-12) return;
  pole.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + length ** 2) / (2 * length);
  const elbow = a.clone().addScaledVector(direction, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
  for (const bone of [hip, knee, foot]) {
    if (!saved.has(bone)) saved.set(bone, bone.quaternion.clone());
  }
  rotateWorld(hip, b.sub(a), elbow.clone().sub(a));
  hip.updateWorldMatrix(true, true);
  const newKnee = knee.getWorldPosition(new Vector3());
  rotateWorld(knee, foot.getWorldPosition(new Vector3()).sub(newKnee), target.sub(newKnee));
  knee.updateWorldMatrix(true, true);
  foot.quaternion.copy(foot.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(orientation));
  foot.updateWorldMatrix(true, true);
}

function rotateWorld(bone: Object3D, from: Vector3, to: Vector3) {
  const parent = bone.parent!.getWorldQuaternion(new Quaternion());
  const rotation = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  bone.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
}
