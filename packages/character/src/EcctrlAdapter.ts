import type { EcctrlHandle } from "ecctrl";
import * as THREE from "three";
import type { RefObject } from "react";
import type { RapierContext } from "@react-three/rapier";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";

/**
 * ecctrl implementation of {@link PlayerMovementController}. This is the ONLY
 * place allowed to touch ecctrl-specific APIs (spring/float/damping rigid-body
 * details, `EcctrlHandle`, forward-dir locking). Swapping controllers later
 * means adding a sibling adapter, not editing gameplay code.
 */
export class EcctrlAdapter implements PlayerMovementController {
  private readonly ref: RefObject<EcctrlHandle | null>;
  /**
   * @react-three/rapier's handle -> synced-Object3D-state map, needed only by
   * {@link applyVisualPose}. Undefined for adapters made outside a `<Physics>`
   * tree (e.g. the travel-socket teleport adapter), which never call it.
   */
  private readonly rigidBodyStates?: RapierContext["rigidBodyStates"];
  private readonly poseMatrix = new THREE.Matrix4();
  private readonly poseScale = new THREE.Vector3();

  constructor(ref: RefObject<EcctrlHandle | null>, rigidBodyStates?: RapierContext["rigidBodyStates"]) {
    this.ref = ref;
    this.rigidBodyStates = rigidBodyStates;
  }

  /**
   * True only once the controller can be READ: ecctrl attaches its handle in
   * React's layout phase, but @react-three/rapier creates the rigid body the
   * handle's `body` getter returns in a passive effect, so for the first
   * frame(s) after mount the handle exists and `handle.body` is null. Every
   * caller treats `ready` as "safe to read velocity/position", so readiness
   * is the BODY, not the handle (16f round 4: the character view's
   * `TypeError: Cannot read properties of null (reading 'linvel')`).
   */
  get ready(): boolean {
    return this.body !== null;
  }

  private get handle(): EcctrlHandle | null {
    return this.ref.current;
  }

  /** The rigid body, or null before rapier has created it / after disposal. */
  private get body(): EcctrlHandle["body"] | null {
    return this.ref.current?.body ?? null;
  }

  position(out: THREE.Vector3): THREE.Vector3 {
    const handle = this.handle;
    if (handle) out.copy(handle.currPos);
    return out;
  }

  /**
   * The raw simulated pose of the rigid body, straight from rapier (NOT
   * ecctrl's cached `currPos`, which is a frame old once the caller steps the
   * world itself). Callers that interpolate the drawn pose between fixed steps
   * read this immediately after each step.
   */
  readPose(outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    const body = this.body;
    if (!body) return;
    const t = body.translation();
    const r = body.rotation();
    outPos.set(t.x, t.y, t.z);
    outQuat.set(r.x, r.y, r.z, r.w);
  }

  /**
   * Write the pose to draw this frame (interpolated between fixed physics
   * steps by the caller) to the controller's visual root — the Object3D
   * @react-three/rapier syncs from this body, found via its `rigidBodyStates`
   * map. Written AFTER r3r's own (stale, un-interpolated) sync and after
   * ecctrl's; r3r overwrites it again next frame, where this overrides again.
   * No-op before the body/map exist, off a non-finite pose, or for adapters
   * built without a `rigidBodyStates` map.
   */
  applyVisualPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    const body = this.body;
    if (!body || !this.rigidBodyStates) return;
    const state = this.rigidBodyStates.get(body.handle);
    if (!state || state.meshType !== "mesh") return;
    if (!Number.isFinite(position.x + position.y + position.z)) return;
    if (!Number.isFinite(quaternion.x + quaternion.y + quaternion.z + quaternion.w)) return;
    // Same transform r3r applies: world pose into the object's parent space.
    this.poseMatrix
      .compose(position, quaternion, state.scale)
      .premultiply(state.invertedWorldMatrix)
      .decompose(state.object.position, state.object.quaternion, this.poseScale);
  }

  linearVelocity(out: THREE.Vector3): THREE.Vector3 {
    const body = this.body;
    if (body) {
      const v = body.linvel();
      out.set(v.x, v.y, v.z);
    } else {
      out.set(0, 0, 0);
    }
    return out;
  }

  verticalVelocity(): number {
    return this.body?.linvel().y ?? 0;
  }

  setLinearVelocity(velocity: { x: number; y: number; z: number }): void {
    this.body?.setLinvel(velocity, true);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const handle = this.handle;
    if (handle) out.copy(handle.bodyZAxis);
    return out;
  }

  faceDirection(direction: THREE.Vector3, lock: boolean): void {
    const handle = this.handle;
    const body = this.body;
    if (!handle || !body) return;
    handle.setForwardDir(direction);
    handle.setLockForward(lock);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const yaw = Math.atan2(direction.x, direction.z);
    body.setRotation(
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      true,
    );
  }

  releaseFacing(): void {
    this.handle?.setLockForward(false);
  }

  steer(direction: THREE.Vector3): void {
    const handle = this.handle;
    if (!handle) return;
    handle.setLockForward(false);
    handle.setForwardDir(direction);
  }

  setMovement(input: { joystick: { x: number; y: number }; run: boolean; jump: boolean }): void {
    this.handle?.setMovement(input);
  }

  teleport(position: { x: number; y: number; z: number }): void {
    const body = this.body;
    if (!body) return;
    body.setTranslation(position, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  isGrounded(): boolean {
    return this.handle?.isOnGround ?? false;
  }

  supportHeight(): number | null {
    // `standPoint` is the world-space hit of ecctrl's ground shape-cast and is
    // only refreshed while `isOnGround`; off the ground it is stale.
    const handle = this.handle;
    return handle?.isOnGround ? handle.standPoint.y : null;
  }

  isFalling(): boolean {
    return this.handle?.isFalling ?? false;
  }

  moveSpeed(): number {
    return this.handle?.moveSpeed ?? 0;
  }
}
