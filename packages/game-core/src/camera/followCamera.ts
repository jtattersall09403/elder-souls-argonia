import * as THREE from "three";
import type { Vec2 } from "../core/types";
import { BASE_FIELD_OF_VIEW } from "../physics/characterPhysics";

/**
 * The third-person free-orbit follow camera, extracted from the combat
 * sandbox's free-roam branch so the world studio's explorer feels identical.
 *
 * Constants match `CombatScene.tsx`'s inline free-orbit path exactly (yaw/pitch
 * stick rates, 5.8 m orbit distance, pitch clamp, exponential smoothing).
 * CombatScene still carries its own inline copy entangled with lock-on, aim
 * and execution cameras — migrate it onto this module when that scene is next
 * reworked (master plan §53). Do not retune one side without the other.
 */
export const FOLLOW_CAMERA = {
  distance: 5.8,
  yawRate: 2.35,
  pitchRate: 1.7,
  /** Negative pitch = looking up. Below `minPosPitch` the camera BODY stops
   * descending (it would dive underground and fight terrain clamps — the
   * 2026-08-25 "haywire camera") and the LOOK target rises instead, tilting
   * the view skyward. Owner decision 2026-08-25: sky look-up is a shared
   * behaviour (studio, sandbox and the real game), not a studio override. */
  minPitch: -1.15,
  maxPitch: 0.78,
  minPosPitch: 0.06,
  initialPitch: 0.34,
  heightOffset: 1.15,
  lookHeightOffset: 0.55,
  positionSmoothing: 9,
  lookSmoothing: 12,
  fieldOfView: BASE_FIELD_OF_VIEW,
  /** Radius of the ball the arm is swept with: at least the near plane's
   * half-diagonal (0.27 m at fov 48, near 0.3, 16:9), so the near plane
   * never enters a wall the ball stopped at (16h check-in 2 item 3). */
  collisionRadius: 0.3,
  /** Shortest arm an obstruction may pull the camera to. */
  minArm: 0.25,
  /** Speed (m/s) the arm grows back once clear, and only while the player
   * gives input (Tears of the Kingdom: no snap back, a gradual return in
   * response to input; research camera.md §b). */
  returnRate: 2.5,
} as const;

/**
 * The world, as the camera sees it: sweep a ball of `radius` from `from`
 * towards `to` and return the distance (m, from `from`) at which it first
 * touches a camera-blocking collider, or null when the way is clear. The
 * app implements it over its physics world (the studio: a Rapier ball cast
 * against the camera-blocking group); game-core never imports a physics
 * engine (controller independence, package rule).
 */
export type CameraObstructionQuery = (
  from: THREE.Vector3, to: THREE.Vector3, radius: number,
) => number | null;

export class FollowCamera {
  yaw = 0;
  pitch: number;
  readonly position = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  /** The smoothed, UNobstructed orbit position; `position` is this pulled in
   * along the arm to `armLimit`. */
  private readonly orbit = new THREE.Vector3();
  private readonly pivot = new THREE.Vector3();
  private readonly lastPlayer = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly cfg: Record<keyof typeof FOLLOW_CAMERA, number>;
  private obstruction: CameraObstructionQuery | null = null;
  /** How long the arm may be: shortened at once by an obstruction, grown
   * back at `returnRate` only while the player gives input. */
  private armLimit = Number.POSITIVE_INFINITY;
  /** Distance from the pivot to the drawn camera this frame (m). */
  arm = 0;

  /** Per-app overrides (e.g. the world studio widens `minPitch` so the owner
   * can look up at the sky). The sandbox's combat feel keeps the defaults —
   * do not change FOLLOW_CAMERA itself for a studio need. */
  constructor(overrides?: Partial<Record<keyof typeof FOLLOW_CAMERA, number>>) {
    this.cfg = { ...FOLLOW_CAMERA, ...overrides };
    this.pitch = this.cfg.initialPitch;
  }

  /** Place the camera behind a player facing `playerYaw`, without smoothing. */
  reset(playerPosition: THREE.Vector3, playerYaw: number): void {
    this.yaw = playerYaw + Math.PI;
    this.pitch = this.cfg.initialPitch;
    this.computeDesired(playerPosition);
    this.orbit.copy(this.desiredPosition);
    this.position.copy(this.desiredPosition);
    this.look.copy(this.desiredLook);
    this.lastPlayer.copy(playerPosition);
    this.armLimit = Number.POSITIVE_INFINITY;
    this.applyObstruction(playerPosition, 0, false);
    this.arm = this.position.distanceTo(this.pivot);
  }

  /** Inject (or remove) the world query the arm collides with. */
  setObstruction(query: CameraObstructionQuery | null): void {
    this.obstruction = query;
    if (!query) this.armLimit = Number.POSITIVE_INFINITY;
  }

  update(cameraInput: Vec2, playerPosition: THREE.Vector3, delta: number): void {
    // Never ingest a non-finite player position (a physics blow-up must not
    // corrupt the camera — it recovers as soon as the body is teleported back).
    if (!Number.isFinite(playerPosition.x + playerPosition.y + playerPosition.z)) return;
    this.yaw -= cameraInput.x * delta * this.cfg.yawRate;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + cameraInput.y * delta * this.cfg.pitchRate,
      this.cfg.minPitch,
      this.cfg.maxPitch,
    );
    this.computeDesired(playerPosition);
    this.orbit.lerp(
      this.desiredPosition,
      1 - Math.exp(-delta * this.cfg.positionSmoothing),
    );
    this.look.lerp(this.desiredLook, 1 - Math.exp(-delta * this.cfg.lookSmoothing));
    // "Input": the camera stick, or the player moving (> 0.2 m/s).
    const moved = this.lastPlayer.distanceTo(playerPosition) > 0.2 * Math.max(delta, 1e-3);
    this.lastPlayer.copy(playerPosition);
    const input = moved || Math.abs(cameraInput.x) + Math.abs(cameraInput.y) > 0.05;
    this.applyObstruction(playerPosition, delta, input);
    this.arm = this.position.distanceTo(this.pivot);
  }

  /**
   * Pull the camera in along the arm (pivot -> smoothed orbit position) to
   * the first camera-blocking hit, at once; let it grow back gradually and
   * only while the player gives input. With no query injected the camera is
   * the smoothed orbit, exactly as before.
   */
  private applyObstruction(playerPosition: THREE.Vector3, delta: number, input: boolean): void {
    this.pivot.set(playerPosition.x, playerPosition.y + this.cfg.heightOffset, playerPosition.z);
    this.position.copy(this.orbit);
    if (!this.obstruction) return;
    const full = this.orbit.distanceTo(this.pivot);
    if (full < 1e-4) return;
    const hit = this.obstruction(this.pivot, this.orbit, this.cfg.collisionRadius);
    const allowed = Math.max(this.cfg.minArm, Math.min(full, hit ?? full));
    if (allowed < this.armLimit) this.armLimit = allowed;
    else if (input) this.armLimit = Math.min(allowed, this.armLimit + this.cfg.returnRate * delta);
    if (this.armLimit >= full) {
      this.armLimit = Number.POSITIVE_INFINITY;
      return;
    }
    this.scratch.subVectors(this.orbit, this.pivot).multiplyScalar(this.armLimit / full);
    this.position.addVectors(this.pivot, this.scratch);
  }

  applyTo(camera: THREE.Camera): void {
    camera.position.copy(this.position);
    camera.lookAt(this.look);
  }

  private computeDesired(playerPosition: THREE.Vector3): void {
    // The camera BODY never goes below minPosPitch (≈ shoulder height): below
    // that it would sink into the terrain and fight ground clamps. Looking
    // further up is done by raising the LOOK target instead.
    const posPitch = Math.max(this.pitch, this.cfg.minPosPitch);
    const horizontal = Math.cos(posPitch) * this.cfg.distance;
    this.desiredPosition.set(
      playerPosition.x + Math.sin(this.yaw) * horizontal,
      playerPosition.y + this.cfg.heightOffset + Math.sin(posPitch) * this.cfg.distance,
      playerPosition.z + Math.cos(this.yaw) * horizontal,
    );
    const skyPitch = Math.max(0, posPitch - this.pitch); // how far past the floor
    const lookRise = Math.tan(Math.min(skyPitch, 1.35)) * this.cfg.distance * 1.5;
    this.desiredLook.set(
      playerPosition.x,
      playerPosition.y + this.cfg.lookHeightOffset + lookRise,
      playerPosition.z,
    );
  }
}
