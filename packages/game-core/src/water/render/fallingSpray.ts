import type { Vec3 } from '@elder-souls/contracts';

const GRAVITY = 9.81;

/** Coherent compiled-sheet spray follows its authored lip→wet-plunge trajectory.
 * Detached impact droplets/mist use their separate wind/drag model. */
export interface FallingSprayTrajectory {
  lip: Vec3;
  plunge: Vec3;
  durationS: number;
  elapsedS: number;
}

export function fallingSprayTrajectory(lip: Vec3, plunge: Vec3, phase = 0): FallingSprayTrajectory {
  const durationS = Math.sqrt(2 * Math.max(0, lip.y - plunge.y) / GRAVITY);
  if (!(durationS > 0) || !Number.isFinite(durationS + lip.x + lip.z + plunge.x + plunge.z)) {
    throw new Error('Falling spray requires a finite descending trajectory');
  }
  return { lip: { ...lip }, plunge: { ...plunge }, durationS,
    elapsedS: Math.max(0, Math.min(1, phase)) * durationS };
}

/** Exact absolute-time evaluation; no timestep-dependent integration or wind
 * displacement of a coherent sheet. Landing is clamped to the validated target. */
export function advanceFallingSpray(path: FallingSprayTrajectory, dt: number, position: Vec3, velocity: Vec3): boolean {
  path.elapsedS = Math.min(path.durationS, path.elapsedS + Math.max(0, dt));
  const t = path.elapsedS, u = t / path.durationS;
  velocity.x = (path.plunge.x - path.lip.x) / path.durationS;
  velocity.y = -GRAVITY * t;
  velocity.z = (path.plunge.z - path.lip.z) / path.durationS;
  position.x = path.lip.x + (path.plunge.x - path.lip.x) * u;
  position.y = t === path.durationS ? path.plunge.y : path.lip.y - 0.5 * GRAVITY * t * t;
  position.z = path.lip.z + (path.plunge.z - path.lip.z) * u;
  return t === path.durationS;
}
