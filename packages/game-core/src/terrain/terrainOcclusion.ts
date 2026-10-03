import type * as THREE from "three";

/**
 * Terrain occlusion for FAR draw units (decision 0084: the frame is a triangle
 * budget). Frustum culling cannot see that a chunk or apron sector lies behind
 * a nearer ridge, so from a low site most far pieces are drawn for nothing.
 *
 * The test marches the terrain height field from the eye towards the unit and
 * asks whether the ground rises above the line of sight. It is conservative by
 * construction and is only ever allowed to HIDE something:
 *  - the eye is raised by `eyeMarginM` (5 m),
 *  - every corner of the unit's top face must be hidden, not just one,
 *  - the march starts `skipNearM` (60 m) out and stops 30 m short of the
 *    corner, so near ground and the unit's own crest never block it,
 *  - a sample with no data (NaN / -Infinity) never blocks.
 * The march step grows with distance (`stepM`, or `stepFraction` of the
 * distance already marched, whichever is larger): a coarser march can only
 * miss a blocker, so it hides less, never something visible (perf10: the
 * fixed 15 m step cost more main-thread time than the hidden draws saved).
 * It is evaluated on a coarse cadence (`createOcclusionCadence`), never per
 * frame, and `&occl=0` turns it off in the studio.
 */

export interface OcclusionPoint { x: number; y: number; z: number }

/** True only when EVERY corner is hidden behind terrain from `eye`. */
export function hiddenBehindTerrain(
  eye: OcclusionPoint,
  corners: readonly OcclusionPoint[],
  heightAt: (x: number, z: number) => number,
  opts?: { stepM?: number; stepFraction?: number; eyeMarginM?: number; skipNearM?: number },
): boolean {
  const stepM = opts?.stepM ?? 15;
  const stepFraction = opts?.stepFraction ?? 0.04;
  const eyeMarginM = opts?.eyeMarginM ?? 5;
  const skipNearM = opts?.skipNearM ?? 60;
  if (corners.length === 0) return false;
  const eyeY = eye.y + eyeMarginM;
  for (const corner of corners) {
    const dx = corner.x - eye.x, dz = corner.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const stop = dist - 30;
    if (!(stop > skipNearM)) return false;   // too close to test: keep it drawn
    const dy = corner.y - eyeY;
    let blocked = false;
    for (let t = skipNearM; t <= stop; t += Math.max(stepM, t * stepFraction)) {
      const f = t / dist;
      const h = heightAt(eye.x + dx * f, eye.z + dz * f);
      if (!Number.isFinite(h)) continue;     // no data is never a blocker
      if (h > eyeY + dy * f) { blocked = true; break; }
    }
    if (!blocked) return false;
  }
  return true;
}

/** The four corners of a box's top face plus its top centre (five points). */
export function topCornersOfBox(box: THREE.Box3): OcclusionPoint[] {
  const { min, max } = box;
  return [
    { x: min.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: min.z },
    { x: min.x, y: max.y, z: max.z },
    { x: max.x, y: max.y, z: max.z },
    { x: (min.x + max.x) / 2, y: max.y, z: (min.z + max.z) / 2 },
  ];
}

/**
 * The cadence the test runs at. The answer depends on the eye POSITION only,
 * never on where the camera looks, so a turn never re-evaluates (perf10: the
 * old 10° turn trigger re-ran the whole march on every orbit flick). It
 * re-evaluates once the camera has moved more than 10 m, or every 2 s so
 * height rasters that streamed in meanwhile are used. One closure per
 * consumer, so there is no shared mutable state.
 *
 * Two sweeps on one frame (chunks and apron) never start together (diag10
 * C1): the second consumer passes `phaseMs` (its timer runs that far out of
 * step) and `delayFrames: 1` (a pass it becomes due for fires one call later,
 * so a move that triggers both starts them on consecutive frames).
 */
export function createOcclusionCadence(
  opts?: { intervalMs?: number; moveM?: number; phaseMs?: number; delayFrames?: number },
): (camera: THREE.Camera, nowMs: number) => boolean {
  const intervalMs = opts?.intervalMs ?? 2000;
  const moveM = opts?.moveM ?? 10;
  const phaseMs = opts?.phaseMs ?? 0;
  const delayFrames = opts?.delayFrames ?? 0;
  const last = { t: 0, x: 0, y: 0, z: 0, seeded: false, wait: -1 };
  return (camera, nowMs) => {
    const p = camera.position;
    if (last.wait < 0) {
      if (last.seeded) {
        const moved = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
        if (nowMs - last.t < intervalMs && moved < moveM) return false;
      }
      last.wait = delayFrames;
    }
    if (last.wait > 0) { last.wait--; return false; }
    last.wait = -1;
    // The first pass sets the phase: the timer then runs `phaseMs` out of step.
    last.t = last.seeded ? nowMs : nowMs + phaseMs;
    last.x = p.x; last.y = p.y; last.z = p.z; last.seeded = true;
    return true;
  };
}

export interface OcclusionUnit {
  mesh: { visible: boolean };
  corners: readonly OcclusionPoint[];
}

/** Where a renderer hands its far draw units to the owner's one sweep. */
export interface OcclusionRegistry {
  register: (key: string, mesh: { visible: boolean }, box: THREE.Box3) => void;
  unregister: (key: string) => void;
}

/**
 * One cadence pass spread over frames under a per-frame time budget (perf10
 * O5; diag9 W1: a whole pass on the cadence frame was a 34 ms walk hitch).
 * `start` snapshots the eye and the units; each `step` tests one unit, then
 * further batches of `batch`, reading the clock after every batch (the first
 * included) and stopping once `budgetMs` is spent. The single-unit first batch
 * bounds a frame's overrun when the height cache is cold, and still makes
 * progress every frame, so a pass always finishes. Verdicts are held until
 * the march completes, so the old result stays on screen until the new one is
 * whole (no half-pass pop); then only the units whose verdict CHANGED are
 * written, at most `maxFlips` a frame, the rest on the next frames (diag10
 * C1: setting every unit's visibility on one frame was a slow frame).
 * `step` returns the pass's hidden count on the frame the last flip lands,
 * else null. A `start` mid-pass restarts the pass from the new eye. One
 * closure per consumer; the queue and the verdict buffer are reused.
 */
export function createOcclusionSweep(opts?: {
  budgetMs?: number; batch?: number; maxFlips?: number; now?: () => number;
}): {
  start: (eye: OcclusionPoint, units: Iterable<OcclusionUnit>) => void;
  step: (heightAt: (x: number, z: number) => number) => number | null;
} {
  const budgetMs = opts?.budgetMs ?? 1.0;
  const batch = Math.max(1, opts?.batch ?? 4);
  const maxFlips = Math.max(1, opts?.maxFlips ?? 16);
  const now = opts?.now ?? (() => performance.now());
  const queue: OcclusionUnit[] = [];
  let verdicts = new Uint8Array(64);
  const eye = { x: 0, y: 0, z: 0 };
  // 0 idle, 1 marching, 2 applying
  let phase = 0; let next = 0; let hidden = 0;
  return {
    start(at, units) {
      eye.x = at.x; eye.y = at.y; eye.z = at.z;
      queue.length = 0;
      for (const unit of units) queue.push(unit);
      if (verdicts.length < queue.length) verdicts = new Uint8Array(queue.length * 2);
      next = 0; hidden = 0; phase = 1;
    },
    step(heightAt) {
      if (phase === 0) return null;
      if (phase === 1) {
        const t0 = now();
        let size = 1;
        while (next < queue.length) {
          const end = Math.min(queue.length, next + size);
          for (; next < end; next++) {
            const out = hiddenBehindTerrain(eye, queue[next].corners, heightAt);
            verdicts[next] = out ? 1 : 0;
            if (out) hidden++;
          }
          if (now() - t0 >= budgetMs) break;
          size = batch;
        }
        if (next < queue.length) return null;
        phase = 2; next = 0;
      }
      let flips = 0;
      for (; next < queue.length; next++) {
        const mesh = queue[next].mesh;
        const visible = verdicts[next] === 0;
        if (mesh.visible === visible) continue;
        if (flips === maxFlips) return null;
        mesh.visible = visible;
        flips++;
      }
      queue.length = 0; next = 0; phase = 0;
      return hidden;
    },
  };
}
