import type { Vec3 } from "../combat/aimConvergence";

export const DEFAULT_BOW_VIEW = "shoulder" as const;
export const BOW_SHOULDER_OFFSET = { right: 0.55, up: 0.22, back: 1.7 } as const;

/** Stable shoulder camera shared by scene adapters. `eye` is in world metres. */
export function bowShoulderPosition(eye: Vec3, direction: Vec3): Vec3 {
  const { right, up, back } = BOW_SHOULDER_OFFSET;
  return {
    x: eye.x - direction.z * right - direction.x * back,
    y: eye.y + up - direction.y * back,
    z: eye.z + direction.x * right - direction.z * back,
  };
}
