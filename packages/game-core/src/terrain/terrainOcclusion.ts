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
 */
export function createOcclusionCadence(
  opts?: { intervalMs?: number; moveM?: number },
): (camera: THREE.Camera, nowMs: number) => boolean {
  const intervalMs = opts?.intervalMs ?? 2000;
  const moveM = opts?.moveM ?? 10;
  const last = { t: 0, x: 0, y: 0, z: 0, seeded: false };
  return (camera, nowMs) => {
    const p = camera.position;
    if (last.seeded) {
      const moved = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      if (nowMs - last.t < intervalMs && moved < moveM) return false;
    }
    last.t = nowMs; last.x = p.x; last.y = p.y; last.z = p.z; last.seeded = true;
    return true;
  };
}

export interface OcclusionUnit {
  mesh: { visible: boolean };
  corners: readonly OcclusionPoint[];
}

/**
 * One cadence pass spread over frames (perf10 O5: every chunk on the cadence
 * frame was a 4.5-7 ms hitch). `start` snapshots the eye and the units; each
 * `step` tests at most `perFrame` of them from that eye and returns the pass's
 * hidden count when the pass completes, else null. A unit keeps its last
 * verdict until its turn, so the visible result is the whole-pass one a few
 * frames later. One closure per consumer; the unit list is reused.
 */
export function createOcclusionSweep(perFrame = 4): {
  start: (eye: OcclusionPoint, units: Iterable<OcclusionUnit>) => void;
  step: (heightAt: (x: number, z: number) => number) => number | null;
} {
  const queue: OcclusionUnit[] = [];
  const eye = { x: 0, y: 0, z: 0 };
  let next = 0; let hidden = 0;
  return {
    start(at, units) {
      eye.x = at.x; eye.y = at.y; eye.z = at.z;
      queue.length = 0;
      for (const unit of units) queue.push(unit);
      next = 0; hidden = 0;
    },
    step(heightAt) {
      if (next >= queue.length) return null;
      const end = Math.min(queue.length, next + perFrame);
      for (; next < end; next++) {
        const unit = queue[next];
        const out = hiddenBehindTerrain(eye, unit.corners, heightAt);
        if (out) hidden++;
        unit.mesh.visible = !out;
      }
      if (next < queue.length) return null;
      queue.length = 0; next = 0;
      return hidden;
    },
  };
}
