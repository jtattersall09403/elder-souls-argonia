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
  pitch: number = FOLLOW_CAMERA.initialPitch;
  readonly position = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();

  /** Place the camera behind a player facing `playerYaw`, without smoothing. */
  reset(playerPosition: THREE.Vector3, playerYaw: number): void {
    this.yaw = playerYaw + Math.PI;
    this.pitch = FOLLOW_CAMERA.initialPitch;
    this.computeDesired(playerPosition);
    this.position.copy(this.desiredPosition);
    this.look.copy(this.desiredLook);
  }

  update(cameraInput: Vec2, playerPosition: THREE.Vector3, delta: number): void {
    this.yaw -= cameraInput.x * delta * FOLLOW_CAMERA.yawRate;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + cameraInput.y * delta * FOLLOW_CAMERA.pitchRate,
      FOLLOW_CAMERA.minPitch,
      FOLLOW_CAMERA.maxPitch,
    );
    this.computeDesired(playerPosition);
    this.position.lerp(
      this.desiredPosition,
      1 - Math.exp(-delta * FOLLOW_CAMERA.positionSmoothing),
    );
    this.look.lerp(this.desiredLook, 1 - Math.exp(-delta * FOLLOW_CAMERA.lookSmoothing));
  }

  applyTo(camera: THREE.Camera): void {
    camera.position.copy(this.position);
    camera.lookAt(this.look);
  }

  private computeDesired(playerPosition: THREE.Vector3): void {
    const horizontal = Math.cos(this.pitch) * FOLLOW_CAMERA.distance;
    this.desiredPosition.set(
      playerPosition.x + Math.sin(this.yaw) * horizontal,
      playerPosition.y + FOLLOW_CAMERA.heightOffset + Math.sin(this.pitch) * FOLLOW_CAMERA.distance,
      playerPosition.z + Math.cos(this.yaw) * horizontal,
    );
    this.desiredLook.set(
      playerPosition.x,
      playerPosition.y + FOLLOW_CAMERA.lookHeightOffset,
      playerPosition.z,
    );
  }
}
