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
