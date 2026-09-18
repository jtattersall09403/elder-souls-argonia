import type { EcctrlHandle } from "ecctrl";
import * as THREE from "three";
import type { RefObject } from "react";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";

/**
 * ecctrl implementation of {@link PlayerMovementController}. This is the ONLY
 * place allowed to touch ecctrl-specific APIs (spring/float/damping rigid-body
 * details, `EcctrlHandle`, forward-dir locking). Swapping controllers later
 * means adding a sibling adapter, not editing gameplay code.
 */
export class EcctrlAdapter implements PlayerMovementController {
  private readonly ref: RefObject<EcctrlHandle | null>;

  constructor(ref: RefObject<EcctrlHandle | null>) {
    this.ref = ref;
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
