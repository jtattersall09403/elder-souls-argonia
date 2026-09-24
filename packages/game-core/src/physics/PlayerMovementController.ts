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

  /**
   * Set the desired planar forward for free locomotion: the controller turns
   * smoothly toward it and stays free to keep turning (unlike
   * {@link faceDirection}, which snaps and may hold the facing).
   */
  steer(direction: THREE.Vector3): void;

  /** Feed movement intent to the controller for this frame. */
  setMovement(input: { joystick: { x: number; y: number }; run: boolean; jump: boolean }): void;

  /** Hard teleport (reset / spawn). */
  teleport(position: { x: number; y: number; z: number }): void;

  /** Whether the controller currently rests on ground. */
  isGrounded(): boolean;
  /**
   * World Y of the surface the controller is standing on, from its OWN ground
   * query (so a boulder, a quay or a floor counts, not just the terrain), or
   * null while it reports no ground. The visual grounding solve stands the
   * model on this plane (`physics/visualSupport.ts`).
   */
  supportHeight(): number | null;
  /** Whether the controller is airborne and descending. */
  isFalling(): boolean;
  /** Controller-reported horizontal move speed (m/s). */
  moveSpeed(): number;

  /**
   * Write the pose to draw this frame to the controller's visual root
   * (interpolated between fixed physics steps by the caller). No-op if the
   * controller cannot resolve a visual root yet.
   */
  applyVisualPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void;

  /** raw controller pose after the last fixed step; the caller interpolates */
  readPose(outPos: THREE.Vector3, outQuat: THREE.Quaternion): void;

  /**
   * How the body is moved (decision 0093). Optional so a controller without
   * swimming still satisfies the boundary; absent reads as "grounded".
   */
  readonly movementMode?: MovementMode;
  /**
   * Switch between the grounded controller and swimming. In "swim" the
   * controller's own grounded machinery (gravity, float spring, stepping) is
   * off and {@link swim} drives the body each frame; "grounded" restores it.
   */
  setMovementMode?(mode: MovementMode): void;
  /** Drive the body for one frame while in "swim" mode; ignored otherwise. */
  swim?(drive: SwimDrive): void;
}

/** Grounded (walk, run, jump) or swimming (decision 0093). */
export type MovementMode = "grounded" | "swim";

/** One frame of swimming, as the runtime hands it to the controller. */
export type SwimDrive = {
  /** Planar velocity the stroke asks for, world m/s. */
  velocity: { x: number; z: number };
  /** World Y of the water surface over the body. */
  surfaceHeight: number;
  /** World Y of ground within reach of the feet, or null over deep water. */
  groundHeight: number | null;
  /** Planar world direction to turn toward, or null to hold the facing. */
  facing: { x: number; z: number } | null;
  /** Frame time, seconds. */
  dt: number;
};

/** Authored per-clip net root translation, in character space. */
export type RootMotionDelta = { x: number; y: number; z: number };
