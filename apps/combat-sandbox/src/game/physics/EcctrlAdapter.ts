import type { EcctrlHandle } from "ecctrl";
import * as THREE from "three";
import type { RefObject } from "react";
import type { PlayerMovementController } from "./PlayerMovementController";

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

  get ready(): boolean {
    return this.ref.current !== null;
  }

  private get handle(): EcctrlHandle | null {
    return this.ref.current;
  }

  position(out: THREE.Vector3): THREE.Vector3 {
    const handle = this.handle;
    if (handle) out.copy(handle.currPos);
    return out;
  }

  linearVelocity(out: THREE.Vector3): THREE.Vector3 {
    const handle = this.handle;
    if (handle) {
      const v = handle.body.linvel();
      out.set(v.x, v.y, v.z);
    } else {
      out.set(0, 0, 0);
    }
    return out;
  }

  verticalVelocity(): number {
    return this.handle?.body.linvel().y ?? 0;
  }

  setLinearVelocity(velocity: { x: number; y: number; z: number }): void {
    this.handle?.body.setLinvel(velocity, true);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const handle = this.handle;
    if (handle) out.copy(handle.bodyZAxis);
    return out;
  }

  faceDirection(direction: THREE.Vector3, lock: boolean): void {
    const handle = this.handle;
    if (!handle) return;
    handle.setForwardDir(direction);
    handle.setLockForward(lock);
    handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const yaw = Math.atan2(direction.x, direction.z);
    handle.body.setRotation(
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      true,
    );
  }

  releaseFacing(): void {
    this.handle?.setLockForward(false);
  }

  setMovement(input: { joystick: { x: number; y: number }; run: boolean; jump: boolean }): void {
    this.handle?.setMovement(input);
  }

  teleport(position: { x: number; y: number; z: number }): void {
    const handle = this.handle;
    if (!handle) return;
    handle.body.setTranslation(position, true);
    handle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  isGrounded(): boolean {
    return this.handle?.isOnGround ?? false;
  }

  isFalling(): boolean {
    return this.handle?.isFalling ?? false;
  }

  moveSpeed(): number {
    return this.handle?.moveSpeed ?? 0;
  }
}
