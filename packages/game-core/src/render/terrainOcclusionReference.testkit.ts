/**
 * Test-only reference for the occlusion march (never imported by shipped
 * code): the plain-sampler march that the shipped `FrameGroundSampler`
 * marcher (apps/world-studio/src/vegetation/terrainHeight.ts) must agree with.
 */
import {
  OCCLUSION_SKIP_M,
  type OcclusionPoint,
  type TerrainMarcher,
} from "./terrainOcclusion";

export type GroundSampler = (x: number, z: number) => number | null;

/** A `TerrainMarcher` over a plain sampler function (every step calls the closure). */
export class FunctionTerrainMarcher implements TerrainMarcher {
  private readonly eye: OcclusionPoint = { x: 0, y: 0, z: 0 };
  private readonly target: OcclusionPoint = { x: 0, y: 0, z: 0 };
  constructor(private readonly groundAt: GroundSampler) {}
  heightAt(x: number, z: number): number {
    const h = this.groundAt(x, z);
    return h === null ? NaN : h;
  }
  occluded(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number,
    stepM: number, marginM: number): boolean {
    const e = this.eye, t = this.target;
    e.x = ex; e.y = ey; e.z = ez; t.x = tx; t.y = ty; t.z = tz;
    return occludedByTerrain(e, t, this.groundAt, stepM, marginM);
  }
}

/**
 * True when the terrain between `eye` and `target` rises above the sight line.
 *
 * `marginM` is the slack that stops a target standing ON the ground from
 * occluding itself through sampling noise.
 */
export function occludedByTerrain(
  eye: OcclusionPoint,
  target: OcclusionPoint,
  groundAt: GroundSampler,
  stepM = 12,
  marginM = 1.0,
): boolean {
  const ex = eye.x, ey = eye.y, ez = eye.z;
  const dx = target.x - ex;
  const dy = target.y - ey;
  const dz = target.z - ez;
  const distance = Math.hypot(dx, dz);
  if (!(distance > OCCLUSION_SKIP_M) || !(stepM > 0)) return false;
  for (let s = OCCLUSION_SKIP_M; s < distance; s += stepM) {
    const t = s / distance;
    const ground = groundAt(ex + dx * t, ez + dz * t);
    if (ground === null) continue; // unknown ground never occludes
    if (ground + marginM > ey + dy * t) return true;
  }
  return false;
}
