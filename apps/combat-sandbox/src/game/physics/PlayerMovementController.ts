import type * as THREE from "three";

/**
 * Controller-independent boundary for the player's physical movement.
 *
 * Combat, input, lock-on, animation and i-frame logic depend on this interface
 * — never on `EcctrlHandle` or any ecctrl-specific API. ecctrl remains the
 * current implementation (see {@link EcctrlAdapter}); a future
 * `RapierKCCAdapter implements PlayerMovementController` can replace it without
 * touching gameplay code.
 *
 * Ordinary world locomotion stays owned by the controller. Authored animation
 * movement (root motion) is represented separately as a {@link RootMotionDelta}
 * plus a manifest policy, so the animation layer never calls the controller.
 */
export interface PlayerMovementController {
  /** True once the underlying controller instance is mounted and usable. */
  readonly ready: boolean;

  /** World-space position of the character body. Writes into `out`. */
  position(out: THREE.Vector3): THREE.Vector3;

  /** Planar (world) linear velocity. Writes into `out`. */
  linearVelocity(out: THREE.Vector3): THREE.Vector3;
  /** Vertical component of linear velocity. */
  verticalVelocity(): number;
  /** Set linear velocity (world space). */
  setLinearVelocity(velocity: { x: number; y: number; z: number }): void;

  /** Character's forward axis (world, unit, planar not guaranteed). Writes `out`. */
  forward(out: THREE.Vector3): THREE.Vector3;

  /** Face a world-space planar direction and hold it (attacks, lock-on). */
  faceDirection(direction: THREE.Vector3, lock: boolean): void;
  /** Release a held facing so the controller may turn freely again. */
  releaseFacing(): void;

  /** Feed movement intent to the controller for this frame. */
  setMovement(input: { joystick: { x: number; y: number }; run: boolean; jump: boolean }): void;

  /** Hard teleport (reset / spawn). */
  teleport(position: { x: number; y: number; z: number }): void;

  /** Whether the controller currently rests on ground. */
  isGrounded(): boolean;
  /** Whether the controller is airborne and descending. */
  isFalling(): boolean;
  /** Controller-reported horizontal move speed (m/s). */
  moveSpeed(): number;
}

/** Authored per-clip net root translation, in character space. */
export type RootMotionDelta = { x: number; y: number; z: number };
