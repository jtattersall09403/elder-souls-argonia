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
 * It is evaluated on a coarse cadence (`createOcclusionCadence`), never per
 * frame, and `&occl=0` turns it off in the studio.
 */

export interface OcclusionPoint { x: number; y: number; z: number }

/** True only when EVERY corner is hidden behind terrain from `eye`. */
export function hiddenBehindTerrain(
  eye: OcclusionPoint,
  corners: readonly OcclusionPoint[],
  heightAt: (x: number, z: number) => number,
  opts?: { stepM?: number; eyeMarginM?: number; skipNearM?: number },
): boolean {
  const stepM = opts?.stepM ?? 15;
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
    for (let t = skipNearM; t <= stop; t += stepM) {
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
 * The cadence the test runs at: re-evaluate every 0.5 s, or sooner once the
 * camera has moved more than 10 m or turned more than 10°. One closure per
 * consumer, so there is no shared mutable state.
 */
export function createOcclusionCadence(
  opts?: { intervalMs?: number; moveM?: number; turnDeg?: number },
): (camera: THREE.Camera, nowMs: number) => boolean {
  const intervalMs = opts?.intervalMs ?? 500;
  const moveM = opts?.moveM ?? 10;
  const cosTurn = Math.cos(((opts?.turnDeg ?? 10) * Math.PI) / 180);
  let last: { t: number; x: number; y: number; z: number; fx: number; fy: number; fz: number } | null = null;
  return (camera, nowMs) => {
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    // Column 2 of the world matrix is the camera's backward axis.
    const fx = -e[8], fy = -e[9], fz = -e[10];
    if (last) {
      const moved = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      const dot = fx * last.fx + fy * last.fy + fz * last.fz;
      if (nowMs - last.t < intervalMs && moved < moveM && dot > cosTurn) return false;
    }
    last = { t: nowMs, x: p.x, y: p.y, z: p.z, fx, fy, fz };
    return true;
  };
}
