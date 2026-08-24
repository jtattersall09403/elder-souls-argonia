import type * as THREE from "three";
import type { MutableRefObject } from "react";

/**
 * One capsule of an actor's fitted hurtbox, bound to a live rig bone.
 *
 * The type lives here (framework-free) so combat logic like `stuckArrows` can
 * consume posed hurtboxes without importing the R3F component that renders the
 * Rapier colliders (`@elder-souls/character`'s `SkeletalHurtbox`).
 */
export type HurtboxBone = {
  bone: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
  halfLength: number;
};

export type HurtboxRigRef = MutableRefObject<readonly HurtboxBone[] | null>;
