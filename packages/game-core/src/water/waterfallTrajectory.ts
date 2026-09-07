import type { Vec3 } from '@elder-souls/contracts';

export interface WaterfallTrajectory {
  lip: Readonly<Vec3>;
  velocity: Readonly<Vec3>;
  /** Signed vertical acceleration, metres per second squared; must be negative. */
  gravityMPS2: number;
}
export interface WaterfallState { position: Vec3; velocity: Vec3 }
export interface WaterfallTraceOptions {
  terrainHeight(x: number, z: number): number | null;
  /** Actual receiving water only: exclude the upstream source at the lip. */
  receivingWaterHeight(x: number, z: number): number | null;
  maxTimeS: number;
  /** Maximum travelled arc length, including vertical travel. */
  maxDistanceM: number;
  maxStepTimeS?: number;
  maxStepDistanceM?: number;
  maxSteps?: number;
}
export type WaterfallLanding = WaterfallState & { timeS: number; distanceM: number; samples: number } & (
  { kind: 'terrain' | 'water'; surfaceHeightM: number }
  | { kind: 'none'; reason: 'time-limit' | 'distance-limit' | 'step-limit' | 'never-detached' | 'embedded-lip' }
);

function finiteVector(v: Readonly<Vec3>): boolean { return [v.x, v.y, v.z].every(Number.isFinite); }
function validate(path: WaterfallTrajectory): void {
  if (!finiteVector(path.lip) || !finiteVector(path.velocity)
    || !Number.isFinite(path.gravityMPS2) || path.gravityMPS2 >= 0)
    throw new RangeError('Waterfall requires finite lip/velocity and downward gravity');
}
function stateAt(path: WaterfallTrajectory, timeS: number): WaterfallState {
  const { lip, velocity: v, gravityMPS2: g } = path;
  return { position: { x: lip.x + v.x * timeS, y: lip.y + v.y * timeS + .5 * g * timeS ** 2,
    z: lip.z + v.z * timeS }, velocity: { x: v.x, y: v.y + g * timeS, z: v.z } };
}
/** Absolute-time evaluation; never aims at or snaps to a designated plunge. */
export function evaluateWaterfallTrajectory(path: WaterfallTrajectory, timeS: number): WaterfallState {
  validate(path);
  if (!Number.isFinite(timeS) || timeS < 0) throw new RangeError('Waterfall time must be finite and nonnegative');
  const state = stateAt(path, timeS);
  if (!finiteVector(state.position) || !finiteVector(state.velocity)) throw new RangeError('Waterfall trajectory overflow');
  return state;
}
function distanceAt(path: WaterfallTrajectory, timeS: number): number {
  const horizontal = Math.hypot(path.velocity.x, path.velocity.z);
  const integral = (v: number) => horizontal === 0 ? .5 * v * Math.abs(v)
    : .5 * (v * Math.hypot(horizontal, v) + horizontal ** 2 * Math.asinh(v / horizontal));
  return (integral(path.velocity.y + path.gravityMPS2 * timeS) - integral(path.velocity.y)) / path.gravityMPS2;
}

/** First detected contact along a bounded forward trace, refined in time.
 * Height callbacks must resolve the terrain/water footprint at the chosen
 * step spacing. Features narrower than a step can be missed; this is not a
 * continuous collision oracle for arbitrary discontinuous height functions.
 * Null means no receiver. An initial source contact is skipped until the
 * path clears both surfaces. An embedded lip or penetration before departure
 * is rejected; the trace never travels through solid receivers to emerge later.
 */
export function traceWaterfallLanding(path: WaterfallTrajectory, options: WaterfallTraceOptions): WaterfallLanding {
  validate(path);
  const stepTime = options.maxStepTimeS ?? 1 / 30, stepDistance = options.maxStepDistanceM ?? .25;
  const maxSteps = options.maxSteps ?? 4096;
  if (![options.maxTimeS, options.maxDistanceM, stepTime, stepDistance].every(v => Number.isFinite(v) && v > 0)
    || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 16384)
    throw new RangeError('Waterfall trace requires finite positive bounds and 1–16384 steps');
  // Catch arithmetic overflow before invoking externally supplied samplers.
  evaluateWaterfallTrajectory(path, options.maxTimeS);
  let limit = options.maxTimeS;
  let reason: 'time-limit' | 'distance-limit' = 'time-limit';
  const totalDistance = distanceAt(path, limit);
  if (!Number.isFinite(totalDistance)) throw new RangeError('Waterfall trace distance overflow');
  if (totalDistance > options.maxDistanceM) {
    let lo = 0, hi = limit;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) * .5;
      if (distanceAt(path, mid) > options.maxDistanceM) hi = mid; else lo = mid;
    }
    limit = lo; reason = 'distance-limit';
  }
  let samples = 0;
  const sample = (timeS: number) => {
    const state = stateAt(path, timeS), p = state.position;
    const terrain = options.terrainHeight(p.x, p.z), water = options.receivingWaterHeight(p.x, p.z);
    samples++;
    if ((terrain !== null && !Number.isFinite(terrain)) || (water !== null && !Number.isFinite(water)))
      throw new RangeError('Waterfall receiver heights must be finite or null');
    const kind = terrain !== null && (water === null || terrain >= water) ? 'terrain' as const : 'water' as const;
    const height = kind === 'terrain' ? terrain : water;
    return { ...state, kind, surfaceHeightM: height, hit: height !== null && p.y <= height };
  };
  let time = 0, previous = sample(0);
  const hit = (timeS: number, contact: ReturnType<typeof sample>): WaterfallLanding => ({
    position: contact.position, velocity: contact.velocity, kind: contact.kind,
    surfaceHeightM: contact.surfaceHeightM!, timeS, distanceM: distanceAt(path, timeS), samples,
  });
  const rejected = (reason: 'embedded-lip' | 'never-detached'): WaterfallLanding => ({
    position: previous.position, velocity: previous.velocity, kind: 'none', reason,
    timeS: time, distanceM: distanceAt(path, time), samples,
  });
  const penetrating = (contact: ReturnType<typeof sample>) => contact.surfaceHeightM !== null
    && contact.position.y < contact.surfaceHeightM - 1e-6;
  if (penetrating(previous)) return rejected('embedded-lip');
  let departed = !previous.hit;
  for (let step = 0; step < maxSteps && time < limit; step++) {
    const end = Math.min(limit, time + stepTime);
    const maxSpeed = Math.max(Math.hypot(...Object.values(previous.velocity)),
      Math.hypot(...Object.values(stateAt(path, end).velocity)));
    const nextTime = Math.min(end, time + stepDistance / Math.max(maxSpeed, 1e-12));
    if (nextTime <= time) throw new RangeError('Waterfall trace spacing is below time precision');
    const next = sample(nextTime);
    if (!departed && penetrating(next)) return rejected('never-detached');
    if (departed && next.hit) {
      let lo = time, hi = nextTime, contact = next;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) * .5, candidate = sample(mid);
        if (candidate.hit) { hi = mid; contact = candidate; } else lo = mid;
      }
      return hit(hi, contact);
    }
    departed ||= !next.hit;
    time = nextTime; previous = next;
  }
  return { position: previous.position, velocity: previous.velocity, kind: 'none',
    reason: !departed ? 'never-detached' : time < limit ? 'step-limit' : reason, timeS: time, distanceM: distanceAt(path, time), samples };
}
