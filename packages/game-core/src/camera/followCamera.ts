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
  minPitch: 0.08,
  maxPitch: 0.78,
  initialPitch: 0.34,
  heightOffset: 1.15,
  lookHeightOffset: 0.55,
  positionSmoothing: 9,
  lookSmoothing: 12,
  fieldOfView: BASE_FIELD_OF_VIEW,
} as const;

export class FollowCamera {
  yaw = 0;
  pitch: number;
  readonly position = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly cfg: Record<keyof typeof FOLLOW_CAMERA, number>;

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
    this.position.copy(this.desiredPosition);
    this.look.copy(this.desiredLook);
  }

  update(cameraInput: Vec2, playerPosition: THREE.Vector3, delta: number): void {
    this.yaw -= cameraInput.x * delta * this.cfg.yawRate;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + cameraInput.y * delta * this.cfg.pitchRate,
      this.cfg.minPitch,
      this.cfg.maxPitch,
    );
    this.computeDesired(playerPosition);
    this.position.lerp(
      this.desiredPosition,
      1 - Math.exp(-delta * this.cfg.positionSmoothing),
    );
    this.look.lerp(this.desiredLook, 1 - Math.exp(-delta * this.cfg.lookSmoothing));
  }

  applyTo(camera: THREE.Camera): void {
    camera.position.copy(this.position);
    camera.lookAt(this.look);
  }

  private computeDesired(playerPosition: THREE.Vector3): void {
    const horizontal = Math.cos(this.pitch) * this.cfg.distance;
    this.desiredPosition.set(
      playerPosition.x + Math.sin(this.yaw) * horizontal,
      playerPosition.y + this.cfg.heightOffset + Math.sin(this.pitch) * this.cfg.distance,
      playerPosition.z + Math.cos(this.yaw) * horizontal,
    );
    // Looking up (negative pitch): raise the look point toward the sky so the
    // camera actually tilts above the horizon instead of orbiting underground.
    const lookUp = Math.max(0, -this.pitch) * this.cfg.distance * 1.4;
    this.desiredLook.set(
      playerPosition.x,
      playerPosition.y + this.cfg.lookHeightOffset + lookUp,
      playerPosition.z,
    );
  }
}
