import type { Vec3 } from '@elder-souls/contracts';

/** Exact constant-field exponential relaxation plus independent gravity.
 * Used for detached spray/mist and current-carried foam, not coherent sheets. */
export function waterParticleMotion(position: Vec3, velocity: Vec3, target: Vec3, drag: number,
  gravity: number, dt: number, outPosition: Vec3, outVelocity: Vec3): void {
  const blend = -Math.expm1(-drag * dt);
  const integral = drag > 0 ? blend / drag : dt;
  outPosition.x = position.x + target.x * dt + (velocity.x - target.x) * integral;
  outPosition.z = position.z + target.z * dt + (velocity.z - target.z) * integral;
  outPosition.y = position.y + velocity.y * dt - 0.5 * gravity * dt * dt;
  outVelocity.x = velocity.x + (target.x - velocity.x) * blend;
  outVelocity.z = velocity.z + (target.z - velocity.z) * blend;
  outVelocity.y = velocity.y - gravity * dt;
}
