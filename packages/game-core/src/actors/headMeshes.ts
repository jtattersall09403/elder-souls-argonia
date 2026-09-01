import * as THREE from "three";

/**
 * Which of an actor's meshes are its head.
 *
 * Needed because a first-person camera sits where the head is, and the answer
 * has to hold for every race without naming a single mesh. Two obvious
 * approaches are both wrong here:
 *
 * - **By name.** "MaleHeadIMF" is one race's face; hair, eyes, mouth and ears
 *   are separate meshes with their own names per race, and a new race is meant
 *   to be one roster entry rather than a code change.
 * - **By biped slot.** The roster's slots come from the NIF's own dismember
 *   partitions and are demonstrably not clean for this purpose — several races
 *   record `EyesMale` and `MouthHuman` in slot 32, the *torso* slot, so a
 *   slot-driven rule would leave the eyes floating in mid-air when the head
 *   went and take them off when a cuirass went on.
 *
 * The reliable test is the skinning itself: a face, its eyes, its mouth and its
 * hair are weighted entirely to the head bone and the bones under it, and
 * nothing else on the body is. That is a property of how the art is built
 * rather than of how it is labelled, so it needs no per-race data and cannot
 * drift.
 */

/** Every bone at or under `root`, by index into a skeleton's bone list. */
function subtreeBones(root: THREE.Object3D): Set<THREE.Object3D> {
  const bones = new Set<THREE.Object3D>();
  root.traverse((object) => bones.add(object));
  return bones;
}

/**
 * Meshes skinned wholly to the head and below it.
 *
 * "Wholly" is deliberate: the neck is weighted to both head and spine, and a
 * mesh that merely *touches* the head bone is the body. Only meshes with no
 * weight outside the head subtree are the head.
 */
export function headMeshes(
  model: THREE.Object3D,
  headBone: THREE.Object3D | null,
): THREE.Mesh[] {
  if (!headBone) return [];
  const inHead = subtreeBones(headBone);
  const found: THREE.Mesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const skinIndex = object.geometry.getAttribute("skinIndex");
    const skinWeight = object.geometry.getAttribute("skinWeight");
    if (!skinIndex || !skinWeight) return;
    const bones = object.skeleton.bones;
    let anyWeight = false;
    for (let vertex = 0; vertex < skinIndex.count; vertex += 1) {
      for (let influence = 0; influence < 4; influence += 1) {
        const weight = skinWeight.getComponent(vertex, influence);
        if (weight <= 0) continue;
        anyWeight = true;
        const bone = bones[skinIndex.getComponent(vertex, influence)];
        // One vertex held by anything outside the head disqualifies the mesh.
        if (!bone || !inHead.has(bone)) return;
      }
    }
    if (anyWeight) found.push(object);
  });
  return found;
}
