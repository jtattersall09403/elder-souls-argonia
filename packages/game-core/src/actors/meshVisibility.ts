import type * as THREE from "three";

/**
 * Who is hiding a mesh, and why.
 *
 * `Object3D.visible` is a single boolean with no owner, and on an actor's body
 * there are several independent systems with an opinion about it:
 *
 *   - **armour** hides the body meshes a worn piece covers;
 *   - **first person** hides the head, so the camera can sit on the eye;
 *   - future ones will exist (invisibility, dismemberment, LOD swaps).
 *
 * They overlap. The head is a body mesh in the race roster (`MaleHeadIMF` is
 * slots 30 and 43), so mounting armour writes `visible = true` over the top of
 * the first-person hide, and the player ends up looking at the inside of their
 * own skull. Which of the two wins is decided by React effect ordering, which
 * is to say by nothing.
 *
 * So a mesh is visible iff *nobody* is hiding it. Each system names itself and
 * only ever speaks for itself; nothing has to know what the others are doing,
 * and effects may run in any order and any number of times.
 */

/** Systems that may hide part of an actor. Extend as new ones appear. */
export type HideReason = "armour" | "firstPerson";

type Hideable = THREE.Object3D & { userData: { hiddenBy?: Set<HideReason> } };

/**
 * Hide or reveal `mesh` on behalf of one system.
 *
 * Idempotent, so a re-running effect that re-asserts the same thing costs
 * nothing and changes nothing.
 */
export function setMeshHidden(mesh: THREE.Object3D, reason: HideReason, hidden: boolean) {
  const target = mesh as Hideable;
  const reasons = target.userData.hiddenBy ?? (target.userData.hiddenBy = new Set());
  if (hidden) reasons.add(reason);
  else reasons.delete(reason);
  mesh.visible = reasons.size === 0;
}

/** Drop every claim one system holds over a set of meshes. */
export function releaseMeshHiding(
  meshes: Iterable<THREE.Object3D>,
  reason: HideReason,
) {
  for (const mesh of meshes) setMeshHidden(mesh, reason, false);
}

/** Whether anything is currently hiding this mesh, and what. */
export function meshHiddenBy(mesh: THREE.Object3D): ReadonlySet<HideReason> {
  return (mesh as Hideable).userData.hiddenBy ?? EMPTY;
}

const EMPTY: ReadonlySet<HideReason> = new Set();
