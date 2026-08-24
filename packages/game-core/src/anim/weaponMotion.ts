import { SWORD_TWO_HAND_GRIP_SEPARATION } from "./weaponGrip";

export type MotionPoint = { x: number; y: number; z: number };

export const EXECUTION_ANCHOR_DISTANCE = 1.45;
export const EXECUTION_BLADE_LENGTH = 1.19;
export const EXECUTION_DAMAGE_PROGRESS = 0.34;
export const EXECUTION_WITHDRAWAL_PROGRESS = 0.78;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const segment = (progress: number, from: number, to: number) => smooth((progress - from) / (to - from));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function executionAnchor(
  enemy: { x: number; z: number },
  enemyForward: { x: number; z: number },
  type: "backstab" | "riposte",
  separation = EXECUTION_ANCHOR_DISTANCE,
) {
  const side = type === "backstab" ? -1 : 1;
  return {
    x: enemy.x + enemyForward.x * separation * side,
    z: enemy.z + enemyForward.z * separation * side,
  };
}

export function executionFacingYaw(
  enemyYaw: number,
  type: "backstab" | "riposte",
  relativeFacing = type === "backstab" ? 0 : Math.PI,
) {
  return enemyYaw + relativeFacing;
}

export function executionWeaponPath(progress: number): { grip: MotionPoint; tip: MotionPoint } {
  // Both criticals use the attacker's local +Z as the thrust direction. The
  // attacker anchor/yaw is mirrored for a frontal riposte.
  const p = clamp01(progress);
  const draw = segment(p, 0, 0.16);
  const thrust = segment(p, 0.16, 0.42);
  const withdraw = segment(p, 0.56, EXECUTION_WITHDRAWAL_PROGRESS);
  const penetration = lerp(-0.16, 0, draw)
    + 0.36 * thrust
    - 0.48 * withdraw;
  const grip = { x: 0, y: 1.26, z: -0.06 + penetration };
  return {
    grip,
    tip: { x: grip.x, y: grip.y, z: grip.z + EXECUTION_BLADE_LENGTH },
  };
}

export function parryWeaponPath(progress: number): { grip: MotionPoint; tip: MotionPoint } {
  const sweep = segment(clamp01(progress), 0.08, 0.54);
  // The weapon hand remains on the fighter's anatomical right. The blade
  // performs the cross-body deflection, preventing the upper arm from being
  // pulled through the rib cage by the IK target.
  const grip = {
    x: lerp(-0.1, -0.06, sweep),
    y: lerp(1.18, 1.22, sweep),
    z: lerp(0.16, 0.19, sweep),
  };
  const guide = {
    x: lerp(-0.55, 0.48, sweep),
    y: lerp(1.62, 1.58, sweep),
    z: lerp(0.52, 0.58, sweep),
  };
  const dx = guide.x - grip.x;
  const dy = guide.y - grip.y;
  const dz = guide.z - grip.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return {
    grip,
    tip: {
      x: grip.x + dx / length * EXECUTION_BLADE_LENGTH,
      y: grip.y + dy / length * EXECUTION_BLADE_LENGTH,
      z: grip.z + dz / length * EXECUTION_BLADE_LENGTH,
    },
  };
}

export function guardWeaponPath(): { grip: MotionPoint; tip: MotionPoint; offHand: MotionPoint } {
  const grip = { x: -0.02, y: 1.2, z: 0.18 };
  return {
    grip,
    tip: { x: grip.x, y: grip.y + EXECUTION_BLADE_LENGTH, z: grip.z },
    // Both palm centers lie on the same rigid hilt at the measured marker gap.
    offHand: { x: grip.x, y: grip.y - SWORD_TWO_HAND_GRIP_SEPARATION, z: grip.z },
  };
}

export function bladeCenter(path: { grip: MotionPoint; tip: MotionPoint }): MotionPoint {
  return {
    x: (path.grip.x + path.tip.x) / 2,
    y: (path.grip.y + path.tip.y) / 2,
    z: (path.grip.z + path.tip.z) / 2,
  };
}

export function executionBladeIntersectsVictim(
  progress: number,
  victimDistance = EXECUTION_ANCHOR_DISTANCE,
  combinedRadius = 0.405,
) {
  const { grip, tip } = executionWeaponPath(progress);
  const dx = tip.x - grip.x;
  const dz = tip.z - grip.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared > 0
    ? clamp01(((-grip.x) * dx + (victimDistance - grip.z) * dz) / lengthSquared)
    : 0;
  const closestX = grip.x + dx * projection;
  const closestZ = grip.z + dz * projection;
  return Math.hypot(closestX, closestZ - victimDistance) <= combinedRadius;
}
