import type { EcctrlHandle } from "ecctrl";
import * as THREE from "three";
import type { RefObject } from "react";
import type { RapierContext } from "@react-three/rapier";
import type {
  MovementMode,
  PlayerMovementController,
  SwimDrive,
} from "@elder-souls/game-core/physics/PlayerMovementController";
import { swimVerticalStep } from "@elder-souls/game-core/locomotion/swim";

/**
 * ecctrl's own free-roam turn law (`turnCharacter`, its default
 * autoBalanceSpringOnY / autoBalanceDampingOnY, which PlayerBody leaves
 * untouched): a torque impulse proportional to the yaw error, damped by the yaw
 * rate. A swimmer turns with the same law so it turns at the free-roam rate.
 */
const TURN_SPRING = 0.08;
const TURN_DAMPING = 0.006;

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
  private mode: MovementMode = "grounded";
  /** The float spring's own vertical velocity (`buoyancyStep`), carried frame to frame. */
  private floatVelocity = 0;
  private readonly modeListeners = new Set<(mode: MovementMode) => void>();
  private readonly swimQuat = new THREE.Quaternion();
  /**
   * Back in "grounded" but ecctrl not yet running again: PlayerBody turns it
   * on through a React render, and until that commits nothing else moves the
   * body, so {@link swim} keeps standing it (decision 0093).
   */
  private handover = false;
  /** The last stroke's planar velocity, kept through the handover. */
  private readonly lastSwimVelocity = { x: 0, z: 0 };

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

  get movementMode(): MovementMode {
    return this.mode;
  }

  /**
   * Swim switches ecctrl off (PlayerBody passes `enable={false}` on this
   * adapter's mode change: ecctrl rewrites the gravity scale and runs its float
   * spring every frame it is on) and hands the body to {@link swim}; grounded
   * hands it back. The gravity scale stays 0 until ecctrl's first frame back
   * sets its own, so the body does not drop in the frames before PlayerBody
   * re-renders.
   */
  setMovementMode(mode: MovementMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Without a body there is nothing to hand back (a reset before mount).
    this.handover = mode === "grounded" && this.body !== null;
    const body = this.body;
    if (body && mode === "swim") {
      body.setGravityScale(0, true);
      this.floatVelocity = body.linvel().y;
    }
    for (const listener of this.modeListeners) listener(mode);
  }

  /**
   * True while {@link swim} still owns the body: swimming, or back in
   * "grounded" before ecctrl has been switched on again.
   */
  get swimDriving(): boolean {
    return this.mode === "swim" || this.handover;
  }

  /**
   * PlayerBody's report that ecctrl's `enable` now matches the mode, from a
   * layout effect, so it lands before ecctrl's first frame back on. Ends the
   * handover.
   */
  controllerEnabled(enabled: boolean): void {
    if (enabled && this.mode === "grounded") this.handover = false;
  }

  /** PlayerBody's subscription: it re-renders ecctrl on or off. Returns the unsubscribe. */
  onMovementModeChange(listener: (mode: MovementMode) => void): () => void {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }

  /**
   * One swimming frame: the stroke's planar velocity, the vertical one from
   * `swimVerticalStep` (float spring, or standing where the feet reach
   * ground), ecctrl's turn law
   * toward `facing`, no gravity.
   *
   * While ecctrl is off it stops refreshing the read-outs its handle exposes
   * (`currPos`, `bodyZAxis`, the relative velocities behind `moveSpeed` and
   * `verticalSpeed`), which the combat runtime still reads. They are live
   * vectors owned by the handle, so the adapter keeps them current here; ecctrl
   * recomputes them itself from the first frame it is back on.
   *
   * After a switch to "grounded", until PlayerBody reports ecctrl running
   * again, the body keeps the last stroke's planar velocity and is stood on
   * the ground under it (`swimVerticalStep`), so it neither drops nor lags a
   * rising floor in the frames between.
   */
  swim(drive: SwimDrive): void {
    if (!this.swimDriving) return;
    const body = this.body;
    const handle = this.handle;
    if (!body || !handle) return;
    body.setGravityScale(0, false);
    const position = body.translation();
    const float = swimVerticalStep({
      bodyY: position.y,
      surfaceHeight: drive.surfaceHeight,
      groundHeight: drive.groundHeight,
      floatVelocity: this.floatVelocity,
      dt: drive.dt,
    });
    this.floatVelocity = float.nextVelocity;
    if (this.mode === "swim") {
      this.lastSwimVelocity.x = drive.velocity.x;
      this.lastSwimVelocity.z = drive.velocity.z;
    }
    const planar = this.lastSwimVelocity;
    body.setLinvel({ x: planar.x, y: float.velocity, z: planar.z }, true);

    const rotation = body.rotation();
    const forward = handle.bodyZAxis.set(0, 0, 1)
      .applyQuaternion(this.swimQuat.set(rotation.x, rotation.y, rotation.z, rotation.w));
    if (this.mode === "swim" && drive.facing && (drive.facing.x !== 0 || drive.facing.z !== 0)) {
      const length = Math.hypot(drive.facing.x, drive.facing.z);
      const fx = drive.facing.x / length;
      const fz = drive.facing.z / length;
      // Signed yaw from the body's forward to the wanted facing, about +Y.
      const angle = Math.atan2(forward.z * fx - forward.x * fz, forward.x * fx + forward.z * fz);
      const torque = angle * TURN_SPRING - body.angvel().y * TURN_DAMPING;
      body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
    }

    handle.currPos.set(position.x, position.y, position.z);
    handle.relativeVelOnPlane.set(planar.x, 0, planar.z);
    handle.relativeVelOnUp.set(0, float.velocity, 0);
  }
}
